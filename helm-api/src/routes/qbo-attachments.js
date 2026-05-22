
// POST /qbo-attachments — port of supabase/functions/qbo-attachments
// 2 actions: get_attachment, sync_attachments. Uses supabase-storage wrapper.
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

      const conn = await getActiveConnection(pool);
      if (!conn) return res.status(400).json({ error: 'QBO not connected' });

      const rid = conn.realm_id;
      const token = await ensureToken(pool, conn);
      const base = getQboBase();

      if (action === 'get_attachment') {
        if (!qbo_id) return res.status(400).json({ error: 'qbo_id required' });
        const query = `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Bill' AND AttachableRef.EntityRef.value = '${qbo_id}'`;
        const data = await qboFetch(
          `${base}/v3/company/${rid}/query?query=${encodeURIComponent(query)}&minorversion=65`, token
        ).catch(() => null);
        if (!data) return res.json({ error: 'QBO query failed' });
        const attachables = data?.QueryResponse?.Attachable || [];
        if (attachables.length === 0) {
          if (bill_id) await pool.query(`UPDATE qbo_bills SET attachment_url = 'none' WHERE id = $1`, [bill_id]);
          return res.json({ attachments: [], message: 'No attachments' });
        }

        const att = attachables[0];
        const fileName = att.FileName || `bill_${qbo_id}.pdf`;
        const contentType = att.ContentType || 'application/pdf';
        const storagePath = `${rid}/${qbo_id}/${fileName}`;
        const permanentUrl = await downloadAndStore(att.TempDownloadUri, storagePath, contentType);

        if (permanentUrl) {
          if (bill_id) {
            await pool.query(
              `UPDATE qbo_bills SET attachment_url = $1, attachment_name = $2, attachment_content_type = $3 WHERE id = $4`,
              [permanentUrl, fileName, contentType, bill_id]
            );
          }
          return res.json({ attachments: [{ file_name: fileName, url: permanentUrl, content_type: contentType }], count: 1, stored: true });
        }

        // Fallback to temp URL
        if (bill_id) {
          await pool.query(
            `UPDATE qbo_bills SET attachment_url = $1, attachment_name = $2, attachment_content_type = $3 WHERE id = $4`,
            [att.TempDownloadUri, fileName, contentType, bill_id]
          );
        }
        return res.json({ attachments: [{ file_name: fileName, url: att.TempDownloadUri, content_type: contentType }], count: 1, stored: false });
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
