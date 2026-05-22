
// POST /cx-export-runner — port of supabase/functions/cx-export-runner
// Processes queued CX export jobs. CSV via RFC 4180, upload via supabase-storage wrapper.
const { uploadToStorage } = require('../lib/supabase-storage');

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(headers, rows) {
  return headers.map(csvCell).join(',') + '\n' + rows.map(r => r.map(csvCell).join(',')).join('\n');
}

module.exports = function(app, { pool }) {
  app.post('/cx-export-runner', async (req, res) => {
    try {
      const body = req.body || {};
      const { job_id } = body;

      let job;
      if (job_id) {
        const { rows } = await pool.query(`SELECT * FROM cx_export_jobs WHERE id = $1 LIMIT 1`, [job_id]);
        job = rows[0];
      } else {
        const { rows } = await pool.query(
          `SELECT * FROM cx_export_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
        );
        job = rows[0];
      }

      if (!job) return res.json({ success: true, processed: 0, reason: 'No queued job' });

      await pool.query(
        `UPDATE cx_export_jobs SET status = 'running', started_at = NOW() WHERE id = $1`,
        [job.id]
      );

      const filters = job.filters || {};
      const orgId = job.org_id;
      let headers = [];
      let rows = [];

      try {
        switch (job.scope) {
          case 'tickets': {
            let q = `SELECT * FROM cx_tickets WHERE org_id = $1`;
            const params = [orgId];
            let pi = 2;
            if (filters.status)       { q += ` AND status = $${pi++}`; params.push(filters.status); }
            if (filters.channel)      { q += ` AND channel = $${pi++}`; params.push(filters.channel); }
            if (filters.assigned_to)  { q += ` AND assigned_to = $${pi++}`; params.push(filters.assigned_to); }
            if (filters.start_date)   { q += ` AND created_at >= $${pi++}`; params.push(filters.start_date); }
            if (filters.end_date)     { q += ` AND created_at <= $${pi++}`; params.push(filters.end_date); }
            if (filters.brand_id)     { q += ` AND brand_id = $${pi++}`; params.push(filters.brand_id); }
            q += ` ORDER BY created_at DESC LIMIT 10000`;

            const { rows: data } = await pool.query(q, params);
            headers = ['ticket_number','subject','status','priority','channel','customer_email','customer_name','customer_ltv','assigned_to','created_at','first_response_at','resolved_at','csat_score','ai_sentiment','ai_intent','tags','revenue_attributed_cents'];
            rows = data.map(t => [
              t.ticket_number, t.subject, t.status, t.priority, t.channel,
              t.customer_email, t.customer_name, t.customer_ltv,
              t.assigned_to, t.created_at, t.first_response_at, t.resolved_at,
              t.csat_score, t.ai_sentiment, t.ai_intent,
              (t.tags || []).join('|'), t.revenue_attributed_cents,
            ]);
            break;
          }
          case 'mentions': {
            let q = `SELECT * FROM cx_social_mentions WHERE org_id = $1`;
            const params = [orgId];
            let pi = 2;
            if (filters.platform)   { q += ` AND platform = $${pi++}`; params.push(filters.platform); }
            if (filters.sentiment)  { q += ` AND sentiment = $${pi++}`; params.push(filters.sentiment); }
            if (filters.status)     { q += ` AND status = $${pi++}`; params.push(filters.status); }
            if (filters.start_date) { q += ` AND created_at >= $${pi++}`; params.push(filters.start_date); }
            if (filters.end_date)   { q += ` AND created_at <= $${pi++}`; params.push(filters.end_date); }
            if (filters.keyword)    { q += ` AND content ILIKE $${pi++}`; params.push(`%${filters.keyword}%`); }
            q += ` ORDER BY posted_at DESC LIMIT 10000`;

            const { rows: data } = await pool.query(q, params);
            headers = ['posted_at','platform','mention_type','author_handle','author_name','content','sentiment','intent','moderation_risk','is_question','is_complaint','likes','comments','shares','post_url','status','responded_by','responded_at'];
            rows = data.map(m => [
              m.posted_at, m.platform, m.mention_type, m.author_handle, m.author_name,
              m.content, m.sentiment, m.intent, m.moderation_risk,
              m.is_question, m.is_complaint, m.likes, m.comments, m.shares,
              m.post_url, m.status, m.responded_by, m.responded_at,
            ]);
            break;
          }
          case 'conversation': {
            let ticketIds = filters.ticket_ids || [];
            if (ticketIds.length === 0) {
              const { rows: tRows } = await pool.query(
                `SELECT id FROM cx_tickets WHERE org_id = $1 ORDER BY created_at DESC LIMIT 100`,
                [orgId]
              );
              ticketIds = tRows.map(t => t.id);
            }
            if (ticketIds.length === 0) {
              headers = ['ticket_number','subject','customer_email','customer_name','event_type','channel','timestamp','direction','sender_name','sender_email','body'];
              rows = [];
              break;
            }

            const { rows: tickets } = await pool.query(
              `SELECT id, ticket_number, subject, customer_email, customer_name, channel
               FROM cx_tickets WHERE id = ANY($1::uuid[])`,
              [ticketIds]
            );
            const { rows: msgs } = await pool.query(
              `SELECT * FROM cx_messages WHERE ticket_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
              [ticketIds]
            );
            const { rows: mentions } = await pool.query(
              `SELECT * FROM cx_social_mentions WHERE ticket_id = ANY($1::uuid[]) ORDER BY posted_at ASC`,
              [ticketIds]
            );

            const ticketIdx = {};
            for (const t of tickets) ticketIdx[t.id] = t;

            headers = ['ticket_number','subject','customer_email','customer_name','event_type','channel','timestamp','direction','sender_name','sender_email','body'];

            const allRows = [];
            for (const m of msgs) {
              const t = ticketIdx[m.ticket_id] || {};
              allRows.push({
                ticket_number: t.ticket_number, subject: t.subject,
                customer_email: t.customer_email, customer_name: t.customer_name,
                event_type: 'message', channel: m.channel || t.channel,
                timestamp: m.created_at, direction: m.direction,
                sender_name: m.sender_name, sender_email: m.sender_email,
                body: m.body_text || '',
              });
            }
            for (const m of mentions) {
              const t = ticketIdx[m.ticket_id] || {};
              allRows.push({
                ticket_number: t.ticket_number, subject: t.subject,
                customer_email: t.customer_email, customer_name: t.customer_name,
                event_type: m.is_dm ? 'dm' : 'comment', channel: m.platform,
                timestamp: m.posted_at, direction: 'inbound',
                sender_name: m.author_name, sender_email: m.author_handle,
                body: m.content || '',
              });
            }
            allRows.sort((a, b) =>
              String(a.ticket_number).localeCompare(String(b.ticket_number)) ||
              String(a.timestamp).localeCompare(String(b.timestamp))
            );
            rows = allRows.map(r => headers.map(h => r[h]));
            break;
          }
          default:
            throw new Error(`Unknown scope: ${job.scope}`);
        }

        const csv = toCsv(headers, rows);
        const fileName = `cx_${job.scope}_${new Date().toISOString().slice(0, 10)}_${job.id.slice(0, 8)}.csv`;
        const path = `${orgId}/${fileName}`;

        const result = await uploadToStorage('bill-attachments', path, Buffer.from(csv, 'utf8'), 'text/csv');

        await pool.query(
          `UPDATE cx_export_jobs SET status = 'done', row_count = $1, file_url = $2, completed_at = NOW() WHERE id = $3`,
          [rows.length, result.public_url, job.id]
        );

        return res.json({
          success: true, job_id: job.id,
          row_count: rows.length, file_url: result.public_url,
        });
      } catch (innerErr) {
        await pool.query(
          `UPDATE cx_export_jobs SET status = 'error', error_message = $1, completed_at = NOW() WHERE id = $2`,
          [innerErr?.message || String(innerErr), job.id]
        );
        return res.status(500).json({ error: innerErr?.message || String(innerErr), job_id: job.id });
      }
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
