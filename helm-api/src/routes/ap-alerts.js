
// POST /ap-alerts — port of supabase/functions/ap-alerts
// 3 actions: check_overdue, upcoming_due, cash_forecast. Uses Anthropic for summaries.
const Anthropic = require('@anthropic-ai/sdk');
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const BEN_USER_ID = '32cad5dd-9e94-4095-a16d-b4521391b050';

module.exports = function(app, { pool }) {
  app.post('/ap-alerts', async (req, res) => {
    try {
      const { action } = req.body || {};
      const orgId = req.body?.org_id || DEFAULT_ORG_ID;
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      const client = apiKey ? new Anthropic({ apiKey }) : null;

      if (action === 'check_overdue') {
        const today = new Date().toISOString().slice(0, 10);
        const { rows: overdueBills } = await pool.query(
          `SELECT id, vendor_name, total_amount, balance, due_date FROM qbo_bills
           WHERE payment_status = 'open' AND due_date < $1 ORDER BY due_date LIMIT 50`, [today]
        );
        const { rows: overdueInvoices } = await pool.query(
          `SELECT id, customer_name, total_amount, balance, due_date FROM qbo_invoices
           WHERE balance > 0 AND due_date < $1 ORDER BY due_date LIMIT 50`, [today]
        );
        const apCount = overdueBills.length, arCount = overdueInvoices.length;
        const apTotal = overdueBills.reduce((s, b) => s + Number(b.balance), 0);
        const arTotal = overdueInvoices.reduce((s, b) => s + Number(b.balance), 0);

        let summary = '';
        if (apCount + arCount > 0) {
          const apList = overdueBills.slice(0, 10).map(b => `${b.vendor_name}: $${Number(b.balance).toLocaleString()} due ${b.due_date}`).join('\n');
          const arList = overdueInvoices.slice(0, 10).map(b => `${b.customer_name}: $${Number(b.balance).toLocaleString()} due ${b.due_date}`).join('\n');
          if (client) {
            try {
              const r = await client.messages.create({
                model: 'claude-sonnet-4-20250514', max_tokens: 500,
                messages: [{ role: 'user', content: `Generate a brief (3-4 sentences) executive summary of these overdue items for the CFO:\n\nOVERDUE AP (${apCount} bills, $${apTotal.toLocaleString()}):\n${apList || 'None'}\n\nOVERDUE AR (${arCount} invoices, $${arTotal.toLocaleString()}):\n${arList || 'None'}\n\nHighlight the biggest risks and recommended actions. Be concise.` }],
              });
              summary = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
            } catch (_) {}
          }
          await pool.query(
            `INSERT INTO notifications (org_id, user_id, type, title, body, entity_type, category, link)
             VALUES ($1, $2, 'overdue_alert', $3, $4, 'finance', 'finance', '/finance/ap-ar')`,
            [orgId, BEN_USER_ID,
             `Overdue: ${apCount} AP bills ($${Math.round(apTotal).toLocaleString()}) + ${arCount} AR invoices ($${Math.round(arTotal).toLocaleString()})`,
             summary || `${apCount} overdue AP bills totaling $${Math.round(apTotal).toLocaleString()}, ${arCount} overdue AR invoices totaling $${Math.round(arTotal).toLocaleString()}`]
          );
        }
        return res.json({
          success: true,
          overdue_ap: { count: apCount, total: apTotal, bills: overdueBills },
          overdue_ar: { count: arCount, total: arTotal, invoices: overdueInvoices },
          summary,
        });
      }

      if (action === 'upcoming_due') {
        const days = req.body?.days || 7;
        const today = new Date(), cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() + days);
        const { rows: upcoming } = await pool.query(
          `SELECT id, vendor_name, total_amount, balance, due_date, approval_status FROM qbo_bills
           WHERE payment_status = 'open' AND due_date >= $1 AND due_date <= $2
           ORDER BY due_date LIMIT 50`,
          [today.toISOString().slice(0, 10), cutoff.toISOString().slice(0, 10)]
        );
        const total = upcoming.reduce((s, b) => s + Number(b.balance), 0);
        const unapproved = upcoming.filter(b => b.approval_status !== 'approved' && b.approval_status !== 'paid');
        return res.json({
          success: true, days, count: upcoming.length, total,
          unapproved_count: unapproved.length, bills: upcoming,
        });
      }

      if (action === 'cash_forecast') {
        const { rows: apBills } = await pool.query(
          `SELECT vendor_name, balance, due_date FROM qbo_bills WHERE payment_status = 'open' ORDER BY due_date LIMIT 200`
        );
        const { rows: arInvoices } = await pool.query(
          `SELECT customer_name, balance, due_date FROM qbo_invoices WHERE balance > 0 ORDER BY due_date LIMIT 200`
        );
        const apByWeek = {}, arByWeek = {};
        const today = new Date();
        for (const b of apBills) {
          const d = new Date(b.due_date + 'T12:00:00');
          const w = Math.max(0, Math.ceil((d.getTime() - today.getTime()) / (7 * 86400000)));
          apByWeek[`Week ${w}`] = (apByWeek[`Week ${w}`] || 0) + Number(b.balance);
        }
        for (const b of arInvoices) {
          const d = new Date(b.due_date + 'T12:00:00');
          const w = Math.max(0, Math.ceil((d.getTime() - today.getTime()) / (7 * 86400000)));
          arByWeek[`Week ${w}`] = (arByWeek[`Week ${w}`] || 0) + Number(b.balance);
        }
        const totalAp = apBills.reduce((s, b) => s + Number(b.balance), 0);
        const totalAr = arInvoices.reduce((s, b) => s + Number(b.balance), 0);
        let forecast = '';
        if (client) {
          try {
            const r = await client.messages.create({
              model: 'claude-sonnet-4-20250514', max_tokens: 600,
              messages: [{ role: 'user', content: `Analyze this AP/AR cash flow data and provide a 4-week forecast with recommendations:\n\nAP (bills to pay) by week: ${JSON.stringify(apByWeek)}\nAR (payments expected) by week: ${JSON.stringify(arByWeek)}\n\nTotal AP: $${totalAp.toLocaleString()}\nTotal AR: $${totalAr.toLocaleString()}\n\nProvide: 1) Net cash position each week, 2) Any weeks with negative flow, 3) One specific recommendation. Keep it under 5 sentences.` }],
            });
            forecast = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          } catch (_) {}
        }
        return res.json({
          success: true, ap_by_week: apByWeek, ar_by_week: arByWeek,
          forecast, total_ap: totalAp, total_ar: totalAr,
        });
      }
      return res.status(400).json({ error: 'Unknown action. Use: check_overdue, upcoming_due, cash_forecast' });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
