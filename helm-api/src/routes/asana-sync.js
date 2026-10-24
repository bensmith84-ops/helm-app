// POST /asana-sync - port of supabase/functions/asana-sync
// Server-side Asana -> Helm import & ongoing mirror (Helm wins).
// Actions: register | sync_one | sync_due | status | unregister
// Requires ASANA_PAT. Attachments are re-hosted in Cloud Storage under the
// Supabase-style bucket "asana-attachments" (object "asana-attachments/<path>").
//
// DB access is the owner-role pool (the Deno code used the service-role client).
// The `q` helper mimics supabase-js: it returns { data, error } and never throws,
// so writes whose errors the Deno code ignored are still ignored here.

const { gcsClient } = require('../lib/gcs');

const DEFAULT_ORG = 'a0000000-0000-0000-0000-000000000001';
const FALLBACK_USER = '32cad5dd-9e94-4095-a16d-b4521391b050';
const BUCKET = 'asana-attachments';
const MAX_SUBTASK_DEPTH = 6;

const PUBLIC_BUCKETS = new Set((process.env.STORAGE_PUBLIC_BUCKETS || 'avatars,org-logos,rfp-assets,attachments,bill-attachments,asana-attachments,esign-documents').split(',').map(s => s.trim()).filter(Boolean));
const gcsTarget = (bucket) => ((process.env.GCS_PUBLIC_BUCKET && PUBLIC_BUCKETS.has(bucket)) ? process.env.GCS_PUBLIC_BUCKET : (process.env.GCS_PRIVATE_BUCKET || 'helm-496923-files-private'));
const publicBase = () => process.env.HELM_API_PUBLIC_URL || 'https://helm-api-qp7o2dcl5a-uc.a.run.app';

const JSONB_COLS = new Set(['metadata', 'access_scope', 'last_sync_stats', 'sync_cursor']);
const val = (k, v) => (JSONB_COLS.has(k) && v !== null && v !== undefined ? JSON.stringify(v) : (v === undefined ? null : v));

function makeDb(pool) {
  const q = async (sql, params = []) => {
    try { const r = await pool.query(sql, params); return { data: r.rows, error: null }; }
    catch (e) { return { data: null, error: e }; }
  };
  const one = async (sql, params) => { const r = await q(sql, params); return { data: r.data ? (r.data[0] || null) : null, error: r.error }; };
  // INSERT row (column names come from this file only, never from input)
  const insert = (table, row, returning) => {
    const keys = Object.keys(row);
    const sql = `INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})${returning ? ` RETURNING ${returning}` : ''}`;
    return one(sql, keys.map(k => val(k, row[k])));
  };
  // UPDATE table SET patch WHERE where (all equality)
  const update = (table, patch, where) => {
    const keys = Object.keys(patch); const wkeys = Object.keys(where);
    if (!keys.length) return Promise.resolve({ data: null, error: null });
    const sql = `UPDATE ${table} SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')} WHERE ${wkeys.map((k, i) => `"${k}" = $${keys.length + i + 1}`).join(' AND ')}`;
    return q(sql, [...keys.map(k => val(k, patch[k])), ...wkeys.map(k => where[k])]);
  };
  // UPSERT on (org_id, asana_gid) for asana_sync_state, updating only the given columns
  const upsertState = (row) => {
    const keys = Object.keys(row);
    const upd = keys.filter(k => k !== 'org_id' && k !== 'asana_gid');
    const sql = `INSERT INTO asana_sync_state (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (org_id, asana_gid) DO UPDATE SET ${upd.map(k => `"${k}" = EXCLUDED."${k}"`).join(', ')}`;
    return q(sql, keys.map(k => val(k, row[k])));
  };
  return { q, one, insert, update, upsertState };
}

async function aGet(path) {
  const r = await fetch(`https://app.asana.com/api/1.0${path}`, { headers: { Authorization: `Bearer ${process.env.ASANA_PAT}` } });
  if (!r.ok) throw new Error(`Asana ${r.status} on ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function aGetAll(path, maxPages = 20) {
  let out = [], offset = null;
  for (let p = 0; p < maxPages; p++) {
    const sep = path.includes('?') ? '&' : '?';
    const url = offset ? `${path}${sep}offset=${offset}` : path;
    const res = await aGet(url);
    out = out.concat(res.data || []);
    if (res.next_page?.offset) offset = res.next_page.offset; else break;
  }
  return out;
}

const norm = (v) => (v === undefined || v === '' ? null : v);
const eqv = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
function merge(helmVal, shadowVal, asanaVal) {
  if (eqv(helmVal, shadowVal)) return { value: norm(asanaVal), took: true };
  return { value: norm(helmVal), took: false };
}

// Asana project-membership access_level -> Helm project_members.role
function mapAccess(level) {
  switch ((level || '').toLowerCase()) {
    case 'admin': return 'admin';
    case 'editor': return 'member';
    case 'commenter': return 'commenter';
    case 'viewer': return 'viewer';
    default: return 'member';
  }
}

async function loadProfiles(db, orgId) {
  const { data } = await db.q('SELECT id, email, display_name FROM profiles WHERE org_id = $1', [orgId]);
  const email = {}, name = {};
  for (const p of (data || [])) {
    if (p.email) email[p.email.toLowerCase().trim()] = p.id;
    if (p.display_name) name[p.display_name.toLowerCase().trim()] = p.id;
  }
  return { email, name };
}
function resolvePerson(maps, nm, em) {
  if (em && maps.email[em.toLowerCase().trim()]) return maps.email[em.toLowerCase().trim()];
  if (nm && maps.name[nm.toLowerCase().trim()]) return maps.name[nm.toLowerCase().trim()];
  return null;
}

async function rehost(db, orgId, entityType, entityId, att, uploaderId, stats) {
  const hash = `asana:${att.gid}`;
  const { data: existing } = await db.one(
    'SELECT id FROM attachments WHERE entity_type = $1 AND entity_id = $2 AND content_hash = $3 LIMIT 1',
    [entityType, entityId, hash]
  );
  if (existing) return;
  let filePath = att.permanent_url || att.url || '';
  let mime = 'link/external';
  let size = att.size || 0;
  const dl = att.download_url || att.url;
  if (dl && /^https?:\/\//.test(dl)) {
    try {
      const r = await fetch(dl);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        mime = r.headers.get('content-type') || att.content_type || 'application/octet-stream';
        size = buf.byteLength;
        const safe = (att.name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
        const path = `${orgId}/${entityType}/${entityId}/${att.gid}-${safe}`;
        const up = await gcsClient().upload(gcsTarget(BUCKET), `${BUCKET}/${path}`, buf, mime);
        if (up.ok) { filePath = `${publicBase()}/storage/v1/object/public/${BUCKET}/${path}`; stats.attachments_rehosted = (stats.attachments_rehosted || 0) + 1; }
      }
    } catch (_) { /* fall back to link */ }
  }
  await db.insert('attachments', {
    org_id: orgId, entity_type: entityType, entity_id: entityId,
    filename: att.name || 'file', file_path: filePath, file_size: size,
    mime_type: mime, content_hash: hash, uploaded_by: uploaderId,
  });
  stats.attachments_total = (stats.attachments_total || 0) + 1;
}

const TASK_FIELDS =
  'name,notes,html_notes,resource_subtype,modified_at,completed,completed_at,' +
  'assignee.name,assignee.email,due_on,start_on,tags.name,num_subtasks,' +
  'dependencies.gid,followers.name,followers.email,' +
  'custom_fields.name,custom_fields.display_value,memberships.section.name';

async function syncTask(db, ctx, taskGid, sectionId, parentTaskId, sortOrder, depth) {
  const stats = ctx.stats;
  const existing = ctx.existingByGid.get(taskGid);
  let full;
  try { full = (await aGet(`/tasks/${taskGid}?opt_fields=${TASK_FIELDS}`)).data; }
  catch (e) { (stats.errors ||= []).push(`task ${taskGid}: ${e.message}`); return existing?.id || null; }
  if (!full?.name) return existing?.id || null;

  const isMilestone = full.resource_subtype === 'milestone';
  const tags = (full.tags || []).map(t => t.name).filter(Boolean);
  const assigneeId = resolvePerson(ctx.profiles, full.assignee?.name, full.assignee?.email);
  const asana = {
    title: full.name, description: full.notes || '',
    status: full.completed ? 'done' : 'todo',
    start_date: full.start_on || null, due_date: full.due_on || null,
    assignee_id: assigneeId, _modified_at: full.modified_at || null,
  };

  let helmTaskId;
  if (!existing) {
    const ins = {
      org_id: ctx.orgId, project_id: ctx.helmProjectId,
      section_id: parentTaskId ? null : sectionId, parent_task_id: parentTaskId,
      title: asana.title, description: asana.description,
      html_description: full.html_notes || null,
      status: asana.status,
      completed_at: full.completed ? (full.completed_at || new Date().toISOString()) : null,
      start_date: asana.start_date, due_date: asana.due_date,
      sort_order: sortOrder, created_by: ctx.fallbackUser, assignee_id: assigneeId,
      tags: tags.length ? tags : null,
      metadata: {
        asana_gid: taskGid, asana_assignee: full.assignee?.name || null,
        asana_assignee_email: full.assignee?.email || null,
        asana_assignee_unmatched: !!full.assignee?.name && !assigneeId,
        asana_followers: (full.followers || []).map(f => ({ name: f.name, email: f.email || null })),
        asana_resource_subtype: full.resource_subtype || 'default_task',
        is_milestone: isMilestone, asana_html_notes: !!full.html_notes,
        asana_comment_gids: [], asana_shadow: { ...asana },
      },
    };
    const { data: created, error } = await db.insert('tasks', ins, 'id, metadata');
    if (error || !created) { (stats.errors ||= []).push(`insert ${full.name}: ${error?.message}`); return null; }
    helmTaskId = created.id;
    ctx.existingByGid.set(taskGid, { id: helmTaskId, metadata: ins.metadata, assignee_id: assigneeId,
      title: asana.title, description: asana.description, status: asana.status,
      start_date: asana.start_date, due_date: asana.due_date, milestone_id: null });
    stats.tasks_created = (stats.tasks_created || 0) + 1;
  } else {
    helmTaskId = existing.id;
    const shadow = existing.metadata?.asana_shadow || {};
    const patch = {}; const newShadow = { ...shadow }; let conflict = false;
    for (const f of ['title', 'description', 'status', 'start_date', 'due_date', 'assignee_id']) {
      const m = merge(existing[f], shadow[f], asana[f]);
      newShadow[f] = norm(asana[f]);
      if (m.took && !eqv(existing[f], m.value)) patch[f] = m.value;
      if (!m.took && !eqv(norm(asana[f]), norm(shadow[f]))) conflict = true;
    }
    newShadow._modified_at = asana._modified_at;
    if ('status' in patch) patch.completed_at = patch.status === 'done' ? (full.completed_at || new Date().toISOString()) : null;
    patch.metadata = { ...(existing.metadata || {}), asana_shadow: newShadow, is_milestone: isMilestone, asana_resource_subtype: full.resource_subtype || 'default_task' };
    await db.update('tasks', patch, { id: helmTaskId });
    existing.metadata = patch.metadata;
    if (Object.keys(patch).length > 1) stats.tasks_updated = (stats.tasks_updated || 0) + 1;
    else stats.tasks_unchanged = (stats.tasks_unchanged || 0) + 1;
    if (conflict) stats.tasks_local_kept = (stats.tasks_local_kept || 0) + 1;
  }

  if (isMilestone) {
    const cur = ctx.existingByGid.get(taskGid);
    if (!cur?.milestone_id) {
      const target = asana.due_date || asana.start_date || new Date().toISOString().slice(0, 10);
      const { data: ms } = await db.insert('milestones', {
        org_id: ctx.orgId, project_id: ctx.helmProjectId, name: asana.title,
        description: asana.description || null, target_date: target,
        status: full.completed ? 'completed' : 'upcoming', created_by: ctx.fallbackUser,
        metadata: { asana_gid: taskGid },
      }, 'id');
      if (ms) { await db.update('tasks', { milestone_id: ms.id }, { id: helmTaskId }); if (cur) cur.milestone_id = ms.id; stats.milestones = (stats.milestones || 0) + 1; }
    }
  }

  // Comments - dedup by stored gid AND by content (legacy imports had no gid)
  try {
    const cur = ctx.existingByGid.get(taskGid);
    const done = new Set(cur?.metadata?.asana_comment_gids || []);
    const { data: existingComments } = await db.q(
      "SELECT content FROM comments WHERE entity_type = 'task' AND entity_id = $1", [helmTaskId]
    );
    const existingContent = new Set((existingComments || []).map(c => c.content));
    const stories = await aGetAll(`/tasks/${taskGid}/stories?opt_fields=gid,text,created_by.name,created_by.email,created_at,type,resource_subtype`, 3);
    let changed = false;
    for (const s of stories) {
      if (!(s.type === 'comment' || s.resource_subtype === 'comment_added')) continue;
      if (done.has(s.gid)) continue;
      const content = `**${s.created_by?.name || 'Unknown'}** (from Asana): ${s.text || ''}`;
      if (existingContent.has(content)) { done.add(s.gid); changed = true; continue; } // already imported (legacy) - just record gid
      const authorId = resolvePerson(ctx.profiles, s.created_by?.name, s.created_by?.email) || ctx.fallbackUser;
      await db.insert('comments', { org_id: ctx.orgId, entity_type: 'task', entity_id: helmTaskId, author_id: authorId, content, created_at: s.created_at || new Date().toISOString() });
      existingContent.add(content); done.add(s.gid); changed = true;
      stats.comments_added = (stats.comments_added || 0) + 1;
    }
    if (changed && cur) { cur.metadata = { ...(cur.metadata || {}), asana_comment_gids: [...done] }; await db.update('tasks', { metadata: cur.metadata }, { id: helmTaskId }); }
  } catch (e) { (stats.errors ||= []).push(`comments ${taskGid}: ${e.message}`); }

  // Attachments / images (re-hosted, dedup by content_hash)
  try {
    const atts = await aGetAll(`/tasks/${taskGid}/attachments?opt_fields=name,download_url,permanent_url,size,gid,resource_subtype,content_type`, 3);
    for (const a of atts) await rehost(db, ctx.orgId, 'task', helmTaskId, a, ctx.fallbackUser, stats);
  } catch (e) { (stats.errors ||= []).push(`attach ${taskGid}: ${e.message}`); }

  if (full.dependencies?.length) ctx.deps.push({ gid: taskGid, on: full.dependencies.map(d => d.gid) });

  if (depth < MAX_SUBTASK_DEPTH && (full.num_subtasks || 0) > 0) {
    const subs = await aGetAll(`/tasks/${taskGid}/subtasks?opt_fields=gid&limit=100`, 5);
    for (let i = 0; i < subs.length; i++) await syncTask(db, ctx, subs[i].gid, sectionId, helmTaskId, i, depth + 1);
  }
  return helmTaskId;
}

const PROJ_COLS = 'id, name, description, html_description, metadata, owner_id, created_by';

async function syncProject(db, orgId, asanaGid, deadline, state) {
  const stats = (state?.last_sync_status === 'partial' && state?.last_sync_stats) ? { ...state.last_sync_stats } : {};
  const profiles = await loadProfiles(db, orgId);
  const proj = (await aGet(`/projects/${asanaGid}?opt_fields=name,notes,html_notes,modified_at,owner.name,owner.email,members.name,members.email,current_status.text,custom_fields.name,custom_fields.display_value`)).data;

  let helmProjectId = state?.helm_project_id || null;
  if (!helmProjectId) {
    const { data: ex } = await db.one(`SELECT id FROM projects WHERE org_id = $1 AND metadata->>'asana_gid' = $2 LIMIT 1`, [orgId, asanaGid]);
    helmProjectId = ex?.id || null;
  }
  let projRow;
  if (helmProjectId) { const { data } = await db.one(`SELECT ${PROJ_COLS} FROM projects WHERE id = $1`, [helmProjectId]); projRow = data; }
  if (!projRow) {
    const { data: created, error } = await db.insert('projects', {
      org_id: orgId, name: proj.name, description: proj.notes || '', html_description: proj.html_notes || null,
      status: 'active', color: '#3b82f6',
      owner_id: FALLBACK_USER, created_by: FALLBACK_USER,
      metadata: { asana_gid: asanaGid, imported_from: 'asana', imported_at: new Date().toISOString(), asana_shadow: { name: proj.name, description: proj.notes || '' } },
    }, PROJ_COLS);
    if (error) throw new Error(`project create: ${error.message}`);
    projRow = created; helmProjectId = created.id;
    await db.insert('project_members', { project_id: helmProjectId, user_id: FALLBACK_USER, org_id: orgId, role: 'owner' });
    stats.project_created = true;
  }
  const fallbackUser = projRow.created_by || projRow.owner_id || FALLBACK_USER;
  const cursor = (state?.last_sync_status === 'partial' && state?.sync_cursor) ? state.sync_cursor : { phase: 'meta', si: 0, ti: 0 };

  if (cursor.phase === 'meta') {
    const shadow = projRow.metadata?.asana_shadow || {};
    const patch = {}; const ns = { ...shadow };
    const mn = merge(projRow.name, shadow.name, proj.name); ns.name = norm(proj.name);
    if (mn.took && !eqv(projRow.name, mn.value)) patch.name = mn.value;
    const md = merge(projRow.description, shadow.description, proj.notes || ''); ns.description = norm(proj.notes || '');
    if (md.took && !eqv(projRow.description, md.value)) patch.description = md.value;
    if (proj.html_notes && !projRow.html_description) patch.html_description = proj.html_notes;

    // Members + permissions. Prefer /project_memberships (carries access_level);
    // fall back to the flat members list when the endpoint is unavailable.
    const { data: pm } = await db.q('SELECT user_id, role FROM project_members WHERE project_id = $1', [helmProjectId]);
    const have = new Map((pm || []).map(r => [r.user_id, r.role]));
    const asanaMembers = [];
    let memberships = [];
    try { memberships = await aGetAll(`/projects/${asanaGid}/project_memberships?opt_fields=user.name,user.email,member.name,member.email,access_level&limit=100`, 5); } catch (_) { memberships = []; }
    const memSource = memberships.length
      ? memberships.map(mm => ({ name: mm.user?.name || mm.member?.name || null, email: mm.user?.email || mm.member?.email || null, access_level: mm.access_level || null }))
      : (proj.members || []).map(m => ({ name: m.name, email: m.email || null, access_level: null }));
    for (const m of memSource) {
      const uid = resolvePerson(profiles, m.name, m.email);
      const role = mapAccess(m.access_level);
      asanaMembers.push({ name: m.name, email: m.email || null, access_level: m.access_level || null, matched: !!uid });
      if (uid && !have.has(uid)) {
        await db.insert('project_members', { project_id: helmProjectId, user_id: uid, org_id: orgId, role, access_scope: m.access_level ? { asana_access_level: m.access_level } : null });
        have.set(uid, role); stats.members_added = (stats.members_added || 0) + 1;
      } else if (uid && m.access_level) {
        // Existing member: additively record Asana's access level onto the membership row
        // for reference WITHOUT changing their Helm role (Helm wins).
        const { data: cur } = await db.one('SELECT access_scope FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1', [helmProjectId, uid]);
        const sc = (cur?.access_scope && typeof cur.access_scope === 'object') ? cur.access_scope : {};
        if (sc.asana_access_level !== m.access_level) {
          await db.update('project_members', { access_scope: { ...sc, asana_access_level: m.access_level } }, { project_id: helmProjectId, user_id: uid });
          stats.members_access_recorded = (stats.members_access_recorded || 0) + 1;
        }
      }
    }
    const ownerId = resolvePerson(profiles, proj.owner?.name, proj.owner?.email);
    if (ownerId && !have.has(ownerId)) { await db.insert('project_members', { project_id: helmProjectId, user_id: ownerId, org_id: orgId, role: 'owner' }); have.set(ownerId, 'owner'); }

    try { const patts = await aGetAll(`/attachments?parent=${asanaGid}&opt_fields=name,download_url,permanent_url,size,gid,resource_subtype,content_type`, 3); for (const a of patts) await rehost(db, orgId, 'project', helmProjectId, a, fallbackUser, stats); } catch (_) {}

    let rulesNote = 'unavailable_via_api';
    try { const rr = await aGet(`/projects/${asanaGid}/rules`); if (rr?.data) rulesNote = JSON.stringify(rr.data).slice(0, 4000); } catch (_) { rulesNote = 'unavailable_via_api'; }
    stats.rules = rulesNote === 'unavailable_via_api' ? 'not_available_via_api' : 'captured';

    patch.metadata = { ...(projRow.metadata || {}), asana_shadow: ns, asana_owner: proj.owner?.name || null,
      asana_members: asanaMembers, asana_custom_fields: (proj.custom_fields || []).map(f => ({ name: f.name, value: f.display_value })),
      asana_html_notes: !!proj.html_notes, asana_rules: rulesNote, asana_modified_at: proj.modified_at || null, last_sync: new Date().toISOString() };
    await db.update('projects', patch, { id: helmProjectId });
    projRow.metadata = patch.metadata;
    cursor.phase = 'tasks'; cursor.si = 0; cursor.ti = 0;
  }

  const existingByGid = new Map();
  {
    // Dates cast to text so they compare equal to the 'YYYY-MM-DD' strings in the shadow
    // (node-pg would otherwise return Date objects, unlike PostgREST).
    const { data: et } = await db.q(
      `SELECT id, metadata, assignee_id, title, description, status, start_date::text AS start_date, due_date::text AS due_date, milestone_id
         FROM tasks WHERE project_id = $1`, [helmProjectId]
    );
    for (const t of (et || [])) { const g = t.metadata?.asana_gid; if (g) existingByGid.set(g, t); }
  }

  const sections = await aGetAll(`/projects/${asanaGid}/sections?opt_fields=name&limit=100`, 5);
  const { data: existingSections } = await db.q('SELECT id, name FROM sections WHERE project_id = $1', [helmProjectId]);
  const secByName = new Map((existingSections || []).map(s => [s.name, s.id]));

  const ctx = { orgId, helmProjectId, profiles, existingByGid, stats, deps: [], fallbackUser };
  let partial = false;
  for (let si = cursor.si; si < sections.length; si++) {
    const sec = sections[si];
    let sectionId = secByName.get(sec.name);
    if (!sectionId) {
      const { data: nsec } = await db.insert('sections', { org_id: orgId, project_id: helmProjectId, name: sec.name, sort_order: si }, 'id');
      sectionId = nsec?.id; if (sectionId) secByName.set(sec.name, sectionId);
    }
    const tasks = await aGetAll(`/sections/${sec.gid}/tasks?opt_fields=gid&limit=100`, 10);
    const startTi = (si === cursor.si) ? cursor.ti : 0;
    for (let ti = startTi; ti < tasks.length; ti++) {
      if (Date.now() > deadline) { cursor.si = si; cursor.ti = ti; partial = true; break; }
      await syncTask(db, ctx, tasks[ti].gid, sectionId, null, ti, 0);
    }
    if (partial) break;
  }

  if (!partial) {
    for (const d of ctx.deps) {
      const succ = existingByGid.get(d.gid)?.id; if (!succ) continue;
      for (const pg of d.on) {
        const pred = existingByGid.get(pg)?.id;
        if (pred) {
          const { data: dup } = await db.one('SELECT id FROM task_dependencies WHERE predecessor_id = $1 AND successor_id = $2 LIMIT 1', [pred, succ]);
          if (!dup) await db.insert('task_dependencies', { org_id: orgId, predecessor_id: pred, successor_id: succ, dependency_type: 'finish_to_start' });
        }
      }
    }
  }
  return { helmProjectId, partial, stats, cursor, asanaModifiedAt: proj.modified_at || null };
}

async function getState(db, orgId, gid) {
  const { data } = await db.one('SELECT * FROM asana_sync_state WHERE org_id = $1 AND asana_gid = $2 LIMIT 1', [orgId, gid]);
  return data;
}

async function runProject(db, orgId, gid, maxSeconds) {
  let state = await getState(db, orgId, gid);
  await db.upsertState({ org_id: orgId, asana_gid: gid, helm_project_id: state?.helm_project_id || null, last_sync_status: 'running', sync_lock_at: new Date().toISOString() });
  state = await getState(db, orgId, gid);
  const deadline = Date.now() + maxSeconds * 1000;
  try {
    const r = await syncProject(db, orgId, gid, deadline, state);
    await db.update('asana_sync_state', {
      helm_project_id: r.helmProjectId, last_sync_status: r.partial ? 'partial' : 'ok', last_sync_error: null,
      last_sync_stats: r.stats, last_synced_at: r.partial ? (state?.last_synced_at || null) : new Date().toISOString(),
      asana_modified_at: r.asanaModifiedAt, sync_cursor: r.partial ? r.cursor : null, sync_lock_at: null,
    }, { org_id: orgId, asana_gid: gid });
    return { ok: true, partial: r.partial, helm_project_id: r.helmProjectId, stats: r.stats };
  } catch (e) {
    await db.update('asana_sync_state', { last_sync_status: 'error', last_sync_error: e.message?.slice(0, 1000), sync_lock_at: null }, { org_id: orgId, asana_gid: gid });
    return { ok: false, error: e.message };
  }
}

module.exports = function(app, { pool }) {
  app.post('/asana-sync', async (req, res) => {
    if (!process.env.ASANA_PAT) return res.status(500).json({ error: 'ASANA_PAT not configured' });
    const db = makeDb(pool);
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const action = body.action;
      const orgId = body.org_id || DEFAULT_ORG;

      if (action === 'register') {
        const gid = String(body.project_gid);
        await db.upsertState({ org_id: orgId, asana_gid: gid, helm_project_id: body.helm_project_id || null, sync_enabled: body.sync_enabled !== false, min_interval_minutes: body.min_interval_minutes || 120 });
        return res.json({ ok: true, registered: gid });
      }
      if (action === 'unregister') {
        await db.update('asana_sync_state', { sync_enabled: false }, { org_id: orgId, asana_gid: String(body.project_gid) });
        return res.json({ ok: true });
      }
      if (action === 'status') {
        return res.json({ ok: true, state: await getState(db, orgId, String(body.project_gid)) });
      }
      if (action === 'sync_one') {
        const r = await runProject(db, orgId, String(body.project_gid), Math.min(body.max_seconds || 50, 55));
        return res.status(r.ok ? 200 : 500).json(r);
      }
      if (action === 'sync_due') {
        const budget = Math.min(body.max_seconds || 50, 55);
        const maxProjects = body.max_projects || 10;
        const overall = Date.now() + budget * 1000;
        const { data: due } = await db.q('SELECT * FROM asana_sync_state WHERE sync_enabled = true ORDER BY last_synced_at ASC NULLS FIRST LIMIT 50');
        const now = Date.now(); const results = []; let count = 0;
        for (const s of (due || [])) {
          if (count >= maxProjects) break;
          if (Date.now() > overall - 8000) break;
          const interval = (s.min_interval_minutes || 120) * 60 * 1000;
          const lastMs = s.last_synced_at ? new Date(s.last_synced_at).getTime() : 0;
          const isPartial = s.last_sync_status === 'partial';
          const lockedRecently = s.sync_lock_at && (now - new Date(s.sync_lock_at).getTime() < 5 * 60 * 1000);
          if (lockedRecently) continue;
          if (!isPartial && lastMs && (now - lastMs) < interval) continue;
          const remain = Math.max(10, Math.floor((overall - Date.now()) / 1000));
          // Same as the Deno code: runs with the request's org_id, not s.org_id.
          const r = await runProject(db, orgId, s.asana_gid, Math.min(remain, 50));
          results.push({ gid: s.asana_gid, ...r }); count++;
        }
        return res.json({ ok: true, processed: count, results });
      }
      return res.status(400).json({ error: 'unknown action' });
    } catch (e) {
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
