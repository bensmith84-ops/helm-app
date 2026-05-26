# Security notes

## Credential rotation (action required)

A Supabase **anon** key and project URL were previously hardcoded in `app/lib/supabase.js` and may exist in git history.

| Item | Action |
|------|--------|
| Supabase anon key | Rotate in [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API → regenerate **anon** `public` key. Update deployment env and local `.env.local`. |
| Supabase URL | No rotation needed unless the project is compromised; URL is not secret. |

After rotation, confirm Row Level Security (RLS) policies are enabled on all tables the app reads/writes.

## Scan summary (this repo)

| Category | Status |
|----------|--------|
| Supabase URL / anon key | Removed from source; use env vars |
| GitHub PATs, OpenAI/Anthropic, Slack, DB URLs, Shopify/QBO/Ramp/Meta/TikTok | Not found in codebase |
| Service role / server-only Supabase keys | Not used in this app |

## Environment variables

**Client (required for build and runtime)**

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon (public) key

These are embedded at **build** time for Next.js. Cloud Run must supply them during `npm run build`, not only at container start.

**Server-only (future)**

If you add API routes or server actions that need privileged access, use separate secrets (never `NEXT_PUBLIC_*`):

- `SUPABASE_SERVICE_ROLE_KEY` — server only; store in GCP Secret Manager

## GCP / Cloud Run deployment

1. Store values in [Secret Manager](https://cloud.google.com/secret-manager).
2. Map secrets to env vars on the Cloud Run service (and Cloud Build if you build in CI).
3. Example secret → env mapping:
   - `supabase-url` → `NEXT_PUBLIC_SUPABASE_URL`
   - `supabase-anon-key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Restrict Secret Manager IAM to deploy/service accounts only.

Local development: copy `.env.example` to `.env.local` and fill in values from your Supabase project.

## Placeholders

`.env.example` uses placeholder values only. Do not commit real keys to the repository.
