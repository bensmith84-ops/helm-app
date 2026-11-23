
// POST /qbo-attachments - port of supabase/functions/qbo-attachments
// 2 actions: get_attachment { qbo_id, entity_type?, bill_id?, refresh? } (any transaction
// type, default Bill), sync_attachments (bills). Uses supabase-storage wrapper.
const { uploadToStorage } = require('../lib/supabase-storage');
const { qboFetch, getQboBase, getActiveConnection, ensureToken } = require('../lib/qbo');

async function downloadAndStore(downloadUrl, storagePath, contentType) {
  try {
    const r = await fetch(downloadUrl);
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    const result = await uploadToStorage('bill-attachments', storagePath, buffer, contentType);
    return result.public_url;
  } catch (e) {
    console.error('[qbo-attachments] download/store error:', e?.message);
    return null;
  }
}

module.exports = function(app, { pool }) {
  app.post('/qbo-attachments', async (req, res) => {
    try {
      const body = req.body || {};
      const { action, bill_id, qbo_id } = body;

      if (action === 'cached_list') {
        // Attachments already found on non-bill transactions, for Transaction Search.
        const { rows } = await pool.query(`SELECT entity_type, qbo_id, files FROM qbo_attachment_cache WHERE jsonb_array_length(files) > 0`);
        return res.json({ items: rows });
      }

      const conn = await getActiveConnection(pool);
      if (!conn) return res.status(400).json({ error: 'QBO not connected' });

      const rid = conn.realm_id;
      const token = await ensureToken(pool, conn);
      const base = getQboBase();

      if (action === 'get_attachment') {
        // Any transaction type; bills also cache the first file on qbo_bills (the AP view
        // reads it there), other types in qbo_attachment_cache.
        const TYPES = ['Bill', 'Purchase', 'JournalEntry', 'Deposit', 'Payment', 'BillPayment', 'Invoice', 'SalesReceipt', 'VendorCredit'];
        const entityType = TYPES.includes(body.entity_type) ? body.entity_type : 'Bill';
        const id = String(qbo_id || '');
        if (!/^\d{1,20}$/.test(id)) return res.status(400).json({ error: 'qbo_id required' });
        if (entityType !== 'Bill' && !body.refresh) {
          const { rows: [hit] } = await pool.query(`SELECT files FROM qbo_attachment_cache WHERE entity_type = $1 AND qbo_id = $2`, [entityType, id]);
          if (hit) return res.json({ attachments: hit.files, count: hit.files.length, cached: true });
        }
        const query = `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = '${entityType}' AND AttachableRef.EntityRef.value = '${id}'`;
        const data = await qboFetch(
          `${base}/v3/company/${rid}/query?query=${encodeURIComponent(query)}&minorversion=65`, token
        ).catch(() => null);
        if (!data) return res.json({ error: 'QBO query failed' });
        const attachables = (data?.QueryResponse?.Attachable || []).filter((a) => a.TempDownloadUri).slice(0, 10);
        const files = [];
        for (const att of attachables) {
          const fileName = att.FileName || `${entityType.toLowerCase()}_${id}.pdf`;
          const contentType = att.ContentType || 'application/pdf';
          const storagePath = entityType === 'Bill' ? `${rid}/${id}/${fileName}` : `${rid}/${entityType}/${id}/${fileName}`;
          const permanentUrl = await downloadAndStore(att.TempDownloadUri, storagePath, contentType);
          files.push({ file_name: fileName, url: permanentUrl || att.TempDownloadUri, content_type: contentType, stored: !!permanentUrl });
        }
        if (entityType === 'Bill') {
          const billId = bill_id || (await pool.query(`SELECT id FROM qbo_bills WHERE qbo_id = $1 AND realm_id = $2 LIMIT 1`, [id, rid])).rows[0]?.id;
          if (billId) {
            if (files.length) {
              await pool.query(`UPDATE qbo_bills SET attachment_url = $1, attachment_name = $2, attachment_content_type = $3 WHERE id = $4`,
                [files[0].url, files[0].file_name, files[0].content_type, billId]);
            } else {
              await pool.query(`UPDATE qbo_bills SET attachment_url = 'none' WHERE id = $1`, [billId]);
            }
          }
        } else if (files.every((f) => f.stored)) {
          // Temporary QBO links expire, so only cache when every file was stored.
          await pool.query(
            `INSERT INTO qbo_attachment_cache (entity_type, qbo_id, files, fetched_at) VALUES ($1, $2, $3, now())
             ON CONFLICT (entity_type, qbo_id) DO UPDATE SET files = EXCLUDED.files, fetched_at = now()`,
            [entityType, id, JSON.stringify(files.map(({ stored, ...f }) => f))]);
        }
        return res.json({ attachments: files.map(({ stored, ...f }) => f), count: files.length, message: files.length ? undefined : 'No attachments' });
      }

      if (action === 'sync_attachments') {
        const { rows: bills } = await pool.query(
          `SELECT id, qbo_id FROM qbo_bills WHERE attachment_url IS NULL LIMIT 200`
        );
        if (bills.length === 0) return res.json({ message: 'No bills need attachment sync', synced: 0 });

        let synced = 0, stored = 0, noAttach = 0;

        for (const bill of bills) {
          try {
            const query = `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Bill' AND AttachableRef.EntityRef.value = '${bill.qbo_id}'`;
            const data = await qboFetch(
              `${base}/v3/company/${rid}/query?query=${encodeURIComponent(query)}&minorversion=65`, token
            ).catch(() => null);
            if (!data) continue;
            const atts = data?.QueryResponse?.Attachable || [];

            if (atts.length > 0) {
              const att = atts[0];
              const fileName = att.FileName || `bill_${bill.qbo_id}.pdf`;
              const contentType = att.ContentType || 'application/pdf';
              const storagePath = `${rid}/${bill.qbo_id}/${fileName}`;
              const permanentUrl = await downloadAndStore(att.TempDownloadUri, storagePath, contentType);

              if (permanentUrl) {
                await pool.query(
                  `UPDATE qbo_bills SET attachment_url = $1, attachment_name = $2, attachment_content_type = $3 WHERE id = $4`,
                  [permanentUrl, fileName, contentType, bill.id]
                );
                stored++;
                synced++;
              } else {
                await pool.query(
                  `UPDATE qbo_bills SET attachment_url = $1, attachment_name = $2, attachment_content_type = $3 WHERE id = $4`,
                  [att.TempDownloadUri, fileName, contentType, bill.id]
                );
                synced++;
              }
            } else {
              await pool.query(`UPDATE qbo_bills SET attachment_url = 'none' WHERE id = $1`, [bill.id]);
              noAttach++;
            }
          } catch {}
        }

        return res.json({ synced, stored, no_attachment: noAttach, total: bills.length });
      }

      return res.status(400).json({ error: 'Unknown action. Use: get_attachment, sync_attachments' });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
