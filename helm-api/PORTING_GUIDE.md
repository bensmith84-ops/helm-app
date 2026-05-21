
# helm-api Porting Guide

## Architecture

helm-api is a single Cloud Run service that hosts what used to be 69 Supabase edge functions, now ported to Node.js + Express. Each edge function becomes an Express route handler in `src/routes/<slug>.js`.

## Why one service vs 69?

OFS Tracker uses this same single-service pattern (`ofs-tracker-api`). Cheaper, simpler ops, shared middleware (JWT verify, DB pool), one Cloud Run URL for the frontend to call.

## Auth model

- The Next.js frontend uses Firebase Auth (`firebase/auth`) for sign-in
- Every request to helm-api includes `Authorization: Bearer <firebase-id-token>`
- helm-api middleware (`requireAuth`) verifies the token via Firebase Admin SDK
- Then opens a Postgres client, runs `SET LOCAL request.jwt.claims = '<the decoded JWT>'`
- RLS policies in Cloud SQL read `auth.uid()` which is shimmed to look up the Helm user UUID from `profiles.firebase_uid`

## Porting an edge function

1. Get the source from the old Supabase project: `Supabase:get_edge_function` for the slug
2. Create `src/routes/<slug>.js` exporting `function(app, helpers)`
3. Translate Deno-isms:
   - `Deno.serve(async (req) => {...})` → `app.post('/<slug>', requireAuth, async (req, res) => {...})`
   - `Deno.env.get('FOO')` → `process.env.FOO`
   - `await req.json()` → `req.body` (express.json middleware already parsed it)
   - `new Response(JSON.stringify(d), {...})` → `res.status(...).json(d)`
   - CORS headers — handled by global `cors()` middleware, drop the per-function CORS code
   - `import "jsr:@supabase/functions-js/edge-runtime.d.ts"` → delete
4. Translate Supabase admin client usage:
   - `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` → use the `pool` from helpers, or `withAuthedClient(req.jwtClaims, async client => { ... })` for RLS-enforced reads
   - Many edge functions called `supabase.from('table').select()` — that becomes `client.query('SELECT ... FROM table WHERE ...')`
5. Add `require('./routes/<slug>')(app, helpers)` to `src/index.js`
6. Secrets the function uses → add to `cloudbuild.yaml` under `--set-secrets`

## Secrets needed (consolidated list)

From the original 69 edge functions:
- ANTHROPIC_API_KEY (scoreboard-chat, plm-ai, ai-chat, ai-deploy, doc-ai, cx-ai-draft, invoice-ai, sourcing-agent, fin-analyze, call-ai)
- RESEND_API_KEY (send-invite, invite-user, cx-email, ap-alerts, ar-reminders, esign)
- SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET (slack-notify, slack-interactivity, slack-update)
- QBO_CLIENT_ID, QBO_CLIENT_SECRET (qbo-callback, qbo-sync, qbo-auth-url, qbo-push, qbo-auto-sync, qbo-attachments)
- SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET (shopify-callback, shopify-sync, shopify-store-token, shopify-auto-sync)
- RAMP_CLIENT_ID, RAMP_CLIENT_SECRET (ramp-sync)
- ASANA_TOKEN (asana-proxy)
- METABASE_USERNAME, METABASE_PASSWORD (metabase-sync, metabase-daily-sync, metabase-debug)
- NOTION_TOKEN (notion-import)
- LIVEKIT_API_KEY, LIVEKIT_API_SECRET (livekit-webhook, call-manager)
- GMAIL_OAUTH (gmail-scan)
- META_APP_SECRET (meta-social)
- TIKTOK_APP_SECRET (tiktok-social)
- CRON_SHARED_SECRET (all auto-sync functions)
- GITHUB_TOKEN (ai-deploy)

All go into Google Secret Manager and are mounted via `--set-secrets` in cloudbuild.yaml.

## Current state

Skeleton committed. Routes ported:
- ✅ /health (built-in)
- ✅ /whoami (built-in, exercises auth + DB)
- ✅ /scoreboard-chat (real)
- ⏳ /slack-notify (stub)
- ⏳ /ai-chat, /ai-deploy, /plm-ai (stubs)

Remaining 63 functions: not yet wired in. Port them by following the procedure above and `require()`ing in `src/index.js`.
