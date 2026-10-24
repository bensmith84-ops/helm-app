// POST /public-form - port of supabase/functions/public-form
// Public (no Helm login) project intake forms, addressed by project_forms.public_token.
//   { action: 'get',    token }                          -> public field definitions
//   { action: 'submit', token, values, files:[{fieldId,name,type,dataB64}] } -> creates a task
// Validation is the token lookup (active form only) plus per-field required checks.
// Attachments are written to the same GCS layout the /storage/v1 shim serves.

const { gcsClient } = require('../lib/gcs');
const storage = require('./storage');

const VALID_PRIORITY = new Set(['none', 'low', 'medium', 'high', 'urgent']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NON_PUBLIC = new Set(['assignee', 'section']);
const MAX_FILES = 6;
const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = 'attachments';

module.exports = function(app, { pool }) {
  const gcs = gcsClient();
  const gcsBucket = storage._internal.target(BUCKET);

  app.post('/public-form', async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const action = body.action;
      const token = body.token;
      const values = body.values || {};
      const files = Array.isArray(body.files) ? body.files : [];
      if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Missing token' });

      const { rows: fr } = await pool.query(
        'SELECT * FROM project_forms WHERE public_token = $1 AND is_active = true LIMIT 1',
        [token]
      );
      const form = fr[0] || null;
      if (!form) return res.status(404).json({ error: 'This form is not available.' });

      if (action === 'get') {
        const publicFields = (form.fields || []).filter((f) => !NON_PUBLIC.has(f.maps_to));
        return res.json({ ok: true, form: { name: form.name, description: form.description, fields: publicFields } });
      }

      if (action === 'submit') {
        for (const fld of (form.fields || [])) {
          if (NON_PUBLIC.has(fld.maps_to) || !fld.required) continue;
          if (fld.maps_to === 'attachments') {
            if (!files.some((x) => x && x.fieldId === fld.id)) return res.status(400).json({ error: `"${fld.label}" is required` });
          } else if (fld.maps_to === 'multi_select') {
            const v = values[fld.id];
            if (!(Array.isArray(v) && v.length)) return res.status(400).json({ error: `"${fld.label}" is required` });
          } else if (!String(values[fld.id] ?? '').trim()) {
            return res.status(400).json({ error: `"${fld.label}" is required` });
          }
        }

        let title = '';
        let description = '';
        const assignee = form.default_assignee_id || null;
        let priority = form.default_priority || 'none';
        let due = null;
        const extra = [];
        for (const fld of (form.fields || [])) {
          if (NON_PUBLIC.has(fld.maps_to) || fld.maps_to === 'attachments') continue;
          const v = values[fld.id];
          if (v == null || v === '') continue;
          if (fld.maps_to === 'title') title = String(v);
          else if (fld.maps_to === 'description') description = String(v);
          else if (fld.maps_to === 'priority') priority = String(v);
          else if (fld.maps_to === 'due_date') due = String(v);
          else if (fld.maps_to === 'multi_select') { if (Array.isArray(v) && v.length) extra.push(`${fld.label}: ${v.join(', ')}`); }
          else extra.push(`${fld.label}: ${v}`);
        }

        let sid = form.target_section_id || null;
        if (sid) {
          const { rows } = await pool.query('SELECT id FROM sections WHERE id = $1 AND project_id = $2 LIMIT 1', [sid, form.project_id]);
          if (!rows[0]) sid = null;
        }
        if (!sid) {
          const { rows } = await pool.query('SELECT id FROM sections WHERE project_id = $1 ORDER BY sort_order ASC LIMIT 1', [form.project_id]);
          sid = rows[0] ? rows[0].id : null;
        }

        if (!VALID_PRIORITY.has(priority)) priority = 'none';
        if (due && !DATE_RE.test(due)) due = null;

        const { rows: maxRows } = await pool.query(
          'SELECT sort_order FROM tasks WHERE section_id = $1 AND parent_task_id IS NULL ORDER BY sort_order DESC LIMIT 1',
          [sid]
        );
        const sortOrder = ((maxRows[0] ? maxRows[0].sort_order : 0) || 0) + 1;

        const fullDesc = [description, extra.join('\n')].filter(Boolean).join('\n\n');
        const finalTitle = (title || form.name || 'Form submission').slice(0, 500);

        let task;
        try {
          const { rows } = await pool.query(
            `INSERT INTO tasks (org_id, project_id, section_id, title, description, status, priority,
                                assignee_id, due_date, sort_order, created_by)
             VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8, $9, NULL)
             RETURNING id`,
            [form.org_id, form.project_id, sid, finalTitle, fullDesc, priority, assignee, due, sortOrder]
          );
          task = rows[0];
        } catch (e) {
          return res.status(400).json({ error: e.message });
        }

        // Upload any attachments and link them to the new task.
        for (const fobj of files.slice(0, MAX_FILES)) {
          try {
            if (!fobj || !fobj.dataB64) continue;
            const bytes = Buffer.from(String(fobj.dataB64), 'base64');
            if (bytes.length > MAX_BYTES) continue;
            const safe = String(fobj.name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
            const path = `${form.org_id}/${task.id}/${Date.now()}_${safe}`;
            const up = await gcs.upload(gcsBucket, `${BUCKET}/${path}`, bytes, fobj.type || 'application/octet-stream', { ifNotExists: true });
            if (!up.ok) continue;
            await pool.query(
              `INSERT INTO attachments (org_id, entity_type, entity_id, filename, file_path, file_size, mime_type, uploaded_by)
               VALUES ($1, 'task', $2, $3, $4, $5, $6, NULL)`,
              [form.org_id, task.id, fobj.name || safe, path, bytes.length, fobj.type || null]
            );
          } catch (_e) { /* skip bad file */ }
        }

        await pool.query('UPDATE project_forms SET submit_count = $1 WHERE id = $2', [(form.submit_count || 0) + 1, form.id]);
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });
};
