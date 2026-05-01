# External Collaborators

Allows inviting people to specific Projects without giving them full org access.

## How it works

External collaborators are users with:
- A `profiles` row with `is_external = true`
- **No** `org_memberships` row
- One or more `project_members` rows for each project they're invited to

They authenticate normally (Supabase Auth). RLS gives them access ONLY to:
- Projects they're members of
- Tasks, task_assignees, task_activity in those projects
- Documents linked to those projects (via `documents.project_id`)
- Comments and attachments on tasks/documents/projects they have access to
- Profiles of fellow project members (so names render)

## Per-project role

`project_members.role` values:
- `owner` — full control
- `editor` — can edit tasks, comment, upload
- `commenter` — can view + comment, no edits
- `viewer` — read-only

## Per-project access scope

`project_members.access_scope` is jsonb with these toggles, set by the inviter:
- `tasks` (default true)
- `documents`
- `messages`
- `module_data`

RLS enforces broad rules. The client UI honors `access_scope` for what panels
to show inside a project.

## RLS helper

`is_project_collaborator(project_uuid)` — SECURITY DEFINER, returns true iff
`auth.uid()` has a `project_members` row for that project. Used in additive
policies on every project-scoped table.
