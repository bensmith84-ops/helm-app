
// POST /asana-proxy — port of supabase/functions/asana-proxy
// 3 actions: list_projects, get_project_detail, get_task_full.
// Requires ASANA_PAT (Personal Access Token).

async function asanaGet(path) {
  const ASANA_PAT = process.env.ASANA_PAT;
  const r = await fetch(`https://app.asana.com/api/1.0${path}`, {
    headers: { Authorization: `Bearer ${ASANA_PAT}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Asana ${r.status}: ${txt}`);
  }
  return r.json();
}

async function asanaGetAll(basePath, maxPages = 5) {
  let allData = [];
  let offset = null;
  for (let page = 0; page < maxPages; page++) {
    const sep = basePath.includes('?') ? '&' : '?';
    const url = offset ? `${basePath}${sep}offset=${offset}` : basePath;
    const result = await asanaGet(url);
    allData = allData.concat(result.data || []);
    if (result.next_page?.offset) { offset = result.next_page.offset; } else { break; }
  }
  return allData;
}

module.exports = function(app) {
  app.post('/asana-proxy', async (req, res) => {
    try {
      if (!process.env.ASANA_PAT) {
        return res.status(500).json({ error: 'ASANA_PAT not configured.' });
      }

      const { action, project_id, task_gid } = req.body || {};

      if (action === 'list_projects') {
        const meResult = await asanaGet('/users/me');
        const wsId = meResult.data?.workspaces?.[0]?.gid;
        if (!wsId) throw new Error('No workspace found');
        const projects = await asanaGetAll(`/projects?workspace=${wsId}&limit=100&opt_fields=name,num_tasks,num_incomplete_tasks,archived,owner.name`);
        return res.json(projects.filter(p => !p.archived));
      }

      if (action === 'get_project_detail' && project_id) {
        const projResult = await asanaGet(`/projects/${project_id}?opt_fields=name,notes,owner.name,owner.email,members.name,members.email,due_on,start_on,custom_fields,custom_fields.name,custom_fields.display_value`);
        const project = projResult.data;
        const sections = await asanaGetAll(`/projects/${project_id}/sections?limit=100&opt_fields=name`);

        const result = {
          name: project.name,
          notes: project.notes || '',
          owner_name: project.owner?.name || null,
          owner_email: project.owner?.email || null,
          members: (project.members || []).map(m => m.name),
          member_emails: (project.members || []).map(m => ({ name: m.name, email: m.email || null })),
          custom_fields: (project.custom_fields || []).map(f => ({ name: f.name, value: f.display_value })),
          sections: [],
        };

        for (const sec of sections) {
          const tasks = await asanaGetAll(
            `/sections/${sec.gid}/tasks?limit=100&opt_fields=name,assignee.name,assignee.email,due_on,start_on,completed,num_subtasks,tags.name,custom_fields.name,custom_fields.display_value`,
            3
          );
          result.sections.push({
            name: sec.name,
            tasks: tasks.map(t => ({
              gid: t.gid, name: t.name,
              assignee_name: t.assignee?.name || null,
              assignee_email: t.assignee?.email || null,
              due_on: t.due_on || null, start_on: t.start_on || null,
              completed: t.completed || false,
              num_subtasks: t.num_subtasks || 0,
              tags: (t.tags || []).map(tag => tag.name),
              custom_fields: (t.custom_fields || []).filter(f => f.display_value).map(f => ({ name: f.name, value: f.display_value })),
            })),
          });
        }

        return res.json(result);
      }

      if (action === 'get_task_full' && task_gid) {
        const taskResult = await asanaGet(`/tasks/${task_gid}?opt_fields=name,notes,html_notes,assignee.name,assignee.email,due_on,start_on,completed,completed_at,tags.name,dependencies.gid,dependents.gid,followers.name,custom_fields.name,custom_fields.display_value,memberships.section.name`);
        const t = taskResult.data;

        const subtasks = await asanaGetAll(
          `/tasks/${task_gid}/subtasks?opt_fields=name,notes,assignee.name,assignee.email,due_on,start_on,completed,completed_at,tags.name,num_subtasks,custom_fields.name,custom_fields.display_value`,
          3
        );

        let comments = [];
        try {
          const stories = await asanaGetAll(`/tasks/${task_gid}/stories?opt_fields=text,created_by.name,created_at,type,resource_subtype`, 2);
          comments = stories
            .filter(s => s.type === 'comment' || s.resource_subtype === 'comment_added')
            .map(s => ({ text: s.text || '', author_name: s.created_by?.name || 'Unknown', created_at: s.created_at || null }));
        } catch {}

        let attachments = [];
        try {
          const atts = await asanaGetAll(`/tasks/${task_gid}/attachments?opt_fields=name,download_url,permanent_url,size`, 2);
          attachments = atts.map(a => ({ name: a.name || 'file', url: a.download_url || a.permanent_url || '', size: a.size || 0 }));
        } catch {}

        return res.json({
          gid: t.gid, name: t.name,
          notes: t.notes || '', html_notes: t.html_notes || '',
          assignee_name: t.assignee?.name || null,
          assignee_email: t.assignee?.email || null,
          due_on: t.due_on || null, start_on: t.start_on || null,
          completed: t.completed || false,
          completed_at: t.completed_at || null,
          tags: (t.tags || []).map(tag => tag.name),
          dependencies: (t.dependencies || []).map(d => d.gid),
          followers: (t.followers || []).map(f => f.name),
          custom_fields: (t.custom_fields || []).filter(f => f.display_value).map(f => ({ name: f.name, value: f.display_value })),
          section_name: t.memberships?.[0]?.section?.name || null,
          comments, attachments,
          subtasks: subtasks.map(st => ({
            gid: st.gid, name: st.name, notes: st.notes || '',
            assignee_name: st.assignee?.name || null,
            assignee_email: st.assignee?.email || null,
            due_on: st.due_on || null, start_on: st.start_on || null,
            completed: st.completed || false,
            completed_at: st.completed_at || null,
            tags: (st.tags || []).map(tag => tag.name),
            num_subtasks: st.num_subtasks || 0,
            custom_fields: (st.custom_fields || []).filter(f => f.display_value).map(f => ({ name: f.name, value: f.display_value })),
          })),
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });
};
