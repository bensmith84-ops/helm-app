
// POST /cx-fulfillment-crawler — port of supabase/functions/cx-fulfillment-crawler
// Scans for unfulfilled Shopify orders past SLA thresholds and creates/resolves alerts.
const SLA_WARNING_DAYS = 3;
const SLA_CRITICAL_DAYS = 7;

module.exports = function(app, { pool }) {
  app.post('/cx-fulfillment-crawler', async (req, res) => {
    try {
      const targetOrg = req.body?.org_id || null;

      let orgs = [];
      if (targetOrg) {
        orgs = [targetOrg];
      } else {
        const { rows } = await pool.query(
          `SELECT DISTINCT org_id FROM shopify_orders WHERE org_id IS NOT NULL LIMIT 10000`
        );
        orgs = rows.map(r => r.org_id);
      }

      const result = {};

      for (const orgId of orgs) {
        const perOrg = { detected: 0, upserted: 0, auto_resolved: 0 };

        const cutoffWarning = new Date(Date.now() - SLA_WARNING_DAYS * 86400000).toISOString();
        const cutoffOldest = new Date(Date.now() - 60 * 86400000).toISOString();

        const { rows: stuck } = await pool.query(
          `SELECT shopify_order_id, email, total_price, created_at
           FROM shopify_orders
           WHERE org_id = $1
             AND cancelled_at IS NULL
             AND fulfillment_status IS NULL
             AND created_at < $2
             AND created_at > $3
           ORDER BY created_at ASC`,
          [orgId, cutoffWarning, cutoffOldest]
        );

        perOrg.detected = stuck.length;
        const now = Date.now();

        if (stuck.length > 0) {
          // Upsert alerts in batches
          const values = [];
          const params = [];
          let pi = 1;
          for (const o of stuck) {
            const orderedAt = o.created_at instanceof Date ? o.created_at.toISOString() : o.created_at;
            const days = Math.floor((now - new Date(orderedAt).getTime()) / 86400000);
            values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, 'no_label', $${pi++}, $${pi++}, false, NOW())`);
            params.push(
              orgId, String(o.shopify_order_id), o.email || null,
              o.total_price ? Math.round(Number(o.total_price) * 100) : null,
              orderedAt, days,
              days >= SLA_CRITICAL_DAYS ? 'critical' : 'warning'
            );
          }
          const { rowCount } = await pool.query(
            `INSERT INTO cx_fulfillment_alerts
              (org_id, shopify_order_id, customer_email, order_total_cents, ordered_at,
               alert_type, days_since_order, severity, resolved, detected_at)
             VALUES ${values.join(', ')}
             ON CONFLICT (org_id, shopify_order_id, alert_type) DO UPDATE
             SET days_since_order = EXCLUDED.days_since_order,
                 severity = EXCLUDED.severity,
                 detected_at = EXCLUDED.detected_at`,
            params
          );
          perOrg.upserted = rowCount;
        }

        // Auto-resolve alerts for orders now fulfilled/cancelled
        const { rows: openAlerts } = await pool.query(
          `SELECT id, shopify_order_id FROM cx_fulfillment_alerts
           WHERE org_id = $1 AND alert_type = 'no_label' AND resolved = false
           LIMIT 1000`,
          [orgId]
        );

        if (openAlerts.length > 0) {
          const orderIds = openAlerts.map(a => a.shopify_order_id).filter(Boolean);
          if (orderIds.length > 0) {
            const { rows: completed } = await pool.query(
              `SELECT shopify_order_id, fulfillment_status, cancelled_at
               FROM shopify_orders
               WHERE org_id = $1 AND shopify_order_id = ANY($2::text[])
                 AND (fulfillment_status IS NOT NULL OR cancelled_at IS NOT NULL)`,
              [orgId, orderIds]
            );
            const completedSet = new Set(completed.map(o => String(o.shopify_order_id)));
            const resolvedIds = openAlerts
              .filter(a => completedSet.has(String(a.shopify_order_id)))
              .map(a => a.id);

            if (resolvedIds.length > 0) {
              await pool.query(
                `UPDATE cx_fulfillment_alerts
                 SET resolved = true, resolved_at = NOW()
                 WHERE id = ANY($1::uuid[])`,
                [resolvedIds]
              );
              perOrg.auto_resolved = resolvedIds.length;
            }
          }
        }

        result[orgId] = perOrg;
      }

      res.json({
        success: true,
        orgs_scanned: orgs.length,
        thresholds: { warning_days: SLA_WARNING_DAYS, critical_days: SLA_CRITICAL_DAYS },
        results: result,
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
