
// POST /ar-reminders — port of supabase/functions/ar-reminders
// 4 actions: generate_reminders, send_reminder, list, update.
// generate_reminders uses Anthropic to draft tone-appropriate emails per customer.
const Anthropic = require('@anthropic-ai/sdk');
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const BEN_USER_ID = '32cad5dd-9e94-4095-a16d-b4521391b050';

module.exports = function(app, { pool }) {
  app.post('/ar-reminders', async (req, res) => {
    try {
      const { action } = req.body || {};
      const orgId = req.body?.org_id || DEFAULT_ORG_ID;
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();

      if (action === 'generate_reminders') {
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);

        const { rows: overdue } = await pool.query(
          `SELECT * FROM qbo_invoices WHERE balance > 0 AND due_date < $1 ORDER BY due_date LIMIT 30`,
          [todayStr]
        );
        if (overdue.length === 0) return res.json({ reminders: [], message: 'No overdue invoices found' });

        const customerNames = [...new Set(overdue.map(i => i.customer_name).filter(Boolean))];
        const { rows: customers } = await pool.query(
          `SELECT display_name, email FROM qbo_customers WHERE display_name = ANY($1)`,
          [customerNames]
        );
        const emailMap = {};
        for (const c of customers) if (c.email) emailMap[c.display_name] = c.email;

        const grouped = {};
        for (const inv of overdue) {
          const name = inv.customer_name || 'Unknown';
          if (!grouped[name]) grouped[name] = [];
          grouped[name].push(inv);
        }

        const reminders = [];
        const client = apiKey ? new Anthropic({ apiKey }) : null;

        for (const [customerName, invoices] of Object.entries(grouped)) {
          const totalOwed = invoices.reduce((s, i) => s + Number(i.balance), 0);
          const oldestDue = invoices.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0].due_date;
          const daysOverdue = Math.floor((today.getTime() - new Date(oldestDue + 'T12:00:00').getTime()) / 86400000);
          const email = emailMap[customerName];

          let tone = 'friendly';
          if (daysOverdue > 60) tone = 'firm';
          else if (daysOverdue > 30) tone = 'professional';
          else if (daysOverdue > 14) tone = 'gentle';

          let subject = `Payment reminder \u2014 $${totalOwed.toFixed(2)} outstanding`;
          let emailBody = `Hi ${customerName.split(' ')[0]},\n\nThis is a friendly reminder that you have $${totalOwed.toFixed(2)} in outstanding invoices with Earth Breeze. Please arrange payment at your earliest convenience.\n\nThank you,\nEarth Breeze Team`;

          if (client) {
            try {
              const aiResp = await client.messages.create({
                model: 'claude-sonnet-4-20250514', max_tokens: 500,
                system: `You are drafting a payment reminder email from Earth Breeze to a customer. Be ${tone} in tone. Earth Breeze is an eco-friendly laundry sheet brand. Keep it brief and professional. Return ONLY JSON: { "subject": "...", "body": "..." }. The body should be the email text only (no subject line in body). Use their first name if possible. Don't use markdown formatting in the body.`,
                messages: [{ role: 'user', content: `Customer: ${customerName}\nTotal outstanding: $${totalOwed.toFixed(2)}\nNumber of invoices: ${invoices.length}\nOldest invoice due: ${oldestDue} (${daysOverdue} days ago)\nInvoice details: ${invoices.map(i => `$${Number(i.balance).toFixed(2)} due ${i.due_date}`).join(', ')}\n\nGenerate a ${tone} payment reminder.` }],
              });
              const text = (aiResp.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
              try {
                const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
                subject = parsed.subject;
                emailBody = parsed.body;
              } catch (_) { subject = `Payment reminder \u2014 $${totalOwed.toFixed(2)} outstanding`; emailBody = text; }
            } catch (_) { /* keep defaults */ }
          }

          const { rows: saved } = await pool.query(
            `INSERT INTO ar_payment_reminders
             (org_id, customer_name, customer_email, amount, due_date, days_overdue,
              reminder_type, subject, body, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft') RETURNING *`,
            [orgId, customerName, email || null, totalOwed, oldestDue, daysOverdue,
             daysOverdue > 30 ? 'follow_up' : 'overdue', subject, emailBody]
          );
          if (saved[0]) reminders.push({ ...saved[0], invoices: invoices.length, total: totalOwed, has_email: !!email });
        }

        return res.json({ reminders, count: reminders.length });
      }

      if (action === 'send_reminder') {
        const { reminder_id, user_id } = req.body || {};
        if (!reminder_id) return res.status(400).json({ error: 'reminder_id required' });

        await pool.query(
          `UPDATE ar_payment_reminders SET status = 'sent', sent_at = NOW(), sent_by = $1 WHERE id = $2`,
          [user_id, reminder_id]
        );

        const { rows: rRows } = await pool.query(
          `SELECT customer_name FROM ar_payment_reminders WHERE id = $1`,
          [reminder_id]
        );
        const reminder = rRows[0];
        if (reminder) {
          await pool.query(
            `UPDATE qbo_invoices SET last_reminder_at = NOW(), reminder_count = COALESCE(reminder_count, 0) + 1
             WHERE customer_name = $1 AND balance > 0`,
            [reminder.customer_name]
          );
        }

        await pool.query(
          `INSERT INTO notifications (org_id, user_id, type, title, body, entity_type, entity_id, category, link)
           VALUES ($1, $2, 'ar_reminder_sent', $3, 'Reminder sent for overdue invoices', 'ar_reminder', $4, 'finance', '/finance/ap-ar')`,
          [orgId, BEN_USER_ID, `Payment reminder sent to ${reminder?.customer_name}`, reminder_id]
        );

        return res.json({ success: true, reminder_id, status: 'sent' });
      }

      if (action === 'list') {
        const { status: filterStatus } = req.body || {};
        let sql = `SELECT * FROM ar_payment_reminders WHERE org_id = $1`;
        const params = [orgId];
        if (filterStatus) { sql += ` AND status = $2`; params.push(filterStatus); }
        sql += ` ORDER BY created_at DESC LIMIT 50`;
        const { rows } = await pool.query(sql, params);
        return res.json({ reminders: rows });
      }

      if (action === 'update') {
        const { reminder_id, subject, body: emailBody } = req.body || {};
        if (!reminder_id) return res.status(400).json({ error: 'reminder_id required' });
        const sets = [];
        const params = [];
        if (subject) { params.push(subject); sets.push(`subject = $${params.length}`); }
        if (emailBody) { params.push(emailBody); sets.push(`body = $${params.length}`); }
        if (sets.length === 0) return res.json({ success: true, message: 'nothing to update' });
        params.push(reminder_id);
        await pool.query(`UPDATE ar_payment_reminders SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action. Use: generate_reminders, send_reminder, list, update' });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
