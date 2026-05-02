# Invites & Permissions — How It All Works

There are **two distinct user types** in Helm:

| Type | Has `org_memberships` row? | `profiles.is_external` | Sees by default |
|---|---|---|---|
| **Internal** (employee) | Yes | `false` | Modules they've been granted |
| **External** (collaborator) | No | `true` | Only specific projects they're added to |

---

## Internal users

### How they're created

Three paths:

1. **People → Add Member (preferred)** — admin opens the invite modal, enters email + name + role, and **must explicitly check the modules** the new user gets access to. Sends a Supabase magic-link invite email. Default = no modules; user can only see Dashboard + Settings until granted more.

2. **invite-user edge function (programmatic)** — same logic as above, callable directly. Accepts `module_permissions` in the request body. If omitted, defaults to `{ _default_deny: true }`.

3. **Auto-create on first login (fallback)** — only happens if someone signs up directly without an invite. Profile + membership created with `_default_deny`. Admin must grant modules manually after the fact.

### What gets created

- **`profiles`** row with `org_id = Earth Breeze`, `is_external = false`
- **`org_memberships`** row with `role = 'member'` (or whatever was selected) and `module_permissions = { _default_deny: true, …explicit grants }`
- A Supabase auth user

### What they see

- **Dashboard** — always visible (app-level guard)
- **Settings** — always visible (app-level guard)
- **Modules with `perms[key] === true`** — visible in sidebar + accessible
- **Everything else** — hidden in sidebar, blocked by `renderView` if URL-navigated

### How to grant/revoke modules later

Go to **People → click member → Permissions tab → toggle module switches**. The toggle:
- In default-deny mode: adds/removes the explicit `true` grant
- In legacy block mode (older users with explicit `false` flags): toggles the `false` flag

### Special cases

- **Admin / Owner** roles bypass module permissions entirely (full access)
- **Email matches `ben.smith@earthbreeze`** is a hard-coded admin fallback in `page.js`
- **`role` change** doesn't reset permissions — they persist across role changes

---

## External collaborators

### How they're created

**Project members modal → "✉️ Invite by email (external collaborator)"**

The inviter sets:
- Email + display name
- Per-project role: Editor / Commenter / Viewer
- Per-project access scope: Tasks (always on) / Documents / Messages / Module data

Calls `invite-external-collaborator` edge function which:
1. Creates a Supabase auth user (magic-link email) if email is new
2. Creates `profiles` row with `org_id = NULL` and `is_external = true`
3. Creates `project_members` row with the chosen role + `access_scope`

### What they see

- Sidebar shows **only "Projects"** (Sidebar.js short-circuits when `isExternal=true`)
- Projects list shows **only projects they're a member of** (RLS via `is_project_collaborator`)
- Inside a project: tasks, comments, attachments are visible. Documents only if `access_scope.documents === true` (UI-level enforcement coming in a follow-up commit; RLS already prevents docs from non-collaborators).
- A small **EXTERNAL** badge appears next to their name in the bottom-left

### What they CAN'T see

- No Finance, OKRs, Scoreboard, or any other org module
- No projects they aren't explicitly added to
- No org-wide data via RLS — `active_org()` returns NULL for them

### How to remove them from a project

People modal → click the × next to their name. They lose RLS access to that project immediately. Their auth account remains so they can still log in (and see other projects they're members of, if any).

To fully delete: separate flow needed (currently has to be done via SQL or by deleting the auth user via Supabase dashboard).

---

## Re-inviting

- **Existing user, internal** — re-running invite-user with `resend=true` will either resend the magic link (if unconfirmed) or send a password reset (if confirmed). Module permissions are NOT overwritten if already set.
- **Existing user, external** — re-running invite-external-collaborator with the same email + project just updates their role + access_scope on the existing `project_members` row. Idempotent.
- **Cross-type promotion** — an external user can be added to `org_memberships` to become internal. Set `profiles.is_external = false` at the same time (no UI for this yet — SQL only).

---

## Internal logic summary

`page.js` evaluates the active user once at session start and sets `allowedModules` to one of three shapes:

```js
null                         // full access (admin/owner)
{ mode: "block", perms, blocked }   // legacy: hide explicit `false` modules, allow others
{ mode: "allow", perms, allowed }   // default-deny: hide everything except explicitly allowed
```

`Sidebar.js` and `renderView` both honor all three modes.

Hard rules baked in:
- `dashboard` and `settings` are always allowed regardless of mode
- `adminOnly` flagged sidebar items only show to admins
- External users force `mode = "block"` with everything blocked, and the sidebar additionally short-circuits to show only Projects

