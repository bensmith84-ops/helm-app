// Builds qbo_attachment_index from one paged scan of QuickBooks Attachable
// (1,000 per call), instead of one query per transaction. Bills that were marked
// as having no attachment but now have one are reset so the bill backfill fetches them.
const { qboFetch } = require('./qbo');

async function indexAttachables(pool, base, rid, token, { maxPages = 100 } = {}) {
  const rows = [];
  let pages = 0;
  for (let start = 1; pages < maxPages; start += 1000, pages++) {
    const q = `SELECT * FROM Attachable STARTPOSITION ${start} MAXRESULTS 1000`;
    const d = await qboFetch(`${base}/v3/company/${rid}/query?query=${encodeURIComponent(q)}&minorversion=65`, token);
    const list = d?.QueryResponse?.Attachable || [];
    for (const a of list) {
      if (!a.FileName && !a.TempDownloadUri) continue; // notes without a file
      for (const ref of a.AttachableRef || []) {
        const type = ref?.EntityRef?.type || ref?.EntityRef?.Type;
        const id = ref?.EntityRef?.value;
        if (type && id) rows.push([type, String(id), String(a.Id), a.FileName || null, a.ContentType || null]);
      }
    }
    if (list.length < 1000) break;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM qbo_attachment_index');
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const vals = chunk.map((_, j) => `($${j * 5 + 1},$${j * 5 + 2},$${j * 5 + 3},$${j * 5 + 4},$${j * 5 + 5})`).join(',');
      await client.query(
        `INSERT INTO qbo_attachment_index (entity_type, qbo_id, attachable_id, file_name, content_type) VALUES ${vals}
         ON CONFLICT DO NOTHING`, chunk.flat());
    }
    const { rowCount: billsReset } = await client.query(
      `UPDATE qbo_bills b SET attachment_url = NULL
        WHERE b.attachment_url = 'none' AND b.realm_id = $1
          AND EXISTS (SELECT 1 FROM qbo_attachment_index i WHERE i.entity_type = 'Bill' AND i.qbo_id = b.qbo_id)`, [rid]);
    await client.query('COMMIT');
    return { attachments: rows.length, pages: pages + 1, bills_reset: billsReset };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { indexAttachables };
