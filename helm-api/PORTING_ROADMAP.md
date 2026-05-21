
# helm-api Porting Roadmap

Current state: **11 routes ported, ~57 remaining.** Foundation verified end-to-end (Firebase Auth → Cloud Run → Cloud SQL).

## Tier 1: STRAIGHTFORWARD (≈5-10 min each)
Pure AI proxies or simple DB queries. Pattern is identical to scoreboard-chat or plm-advisor. No external OAuth, no file handling.

- [ ] **call-ai** — single Anthropic call for sales-call summarization
- [ ] **calendar-manager** — Google Calendar API proxy (uses user OAuth token from DB)
- [ ] **call-manager** — LiveKit room/recording management
- [ ] **livekit-webhook** — receives LiveKit webhooks (no auth required, validates signature)
- [ ] **sheets-preview** — Google Sheets preview reader
- [ ] **sheets-explore** — Google Sheets metadata browser
- [ ] **ical-proxy** — iCal feed fetcher and parser
- [ ] **ar-reminders** — sends AR reminder emails via Resend (cron)
- [ ] **ap-alerts** — sends AP alert emails via Resend (cron)
- [ ] **cx-tone-check** — ✅ DONE
- [ ] **cx-export-runner** — CSV exporter for CX tickets
- [ ] **cx-kb-gap-report** — analyzes ticket text vs KB articles for gaps
- [ ] **cx-fulfillment-crawler** — Shopify order fulfillment status lookup
- [ ] **cx-appreciation-drafter** — drafts thank-you replies for positive CX feedback
- [ ] **plm-advisor** — ✅ DONE
- [ ] **remove-user** — deletes user; needs Firebase Auth equivalent (see Tier 4)
- [ ] **slack-update** — updates Slack message blocks for in-place approval edits
- [ ] **metabase-debug** — exposes Metabase connection state (admin diagnostic)

## Tier 2: MEDIUM (≈10-20 min each)
Multiple DB tables, AI + DB mix, or non-trivial state transitions.

- [ ] **cx-ai-draft** — drafts CX replies; multi-step Anthropic call with KB + customer context
- [ ] **cx-email** — sends CX emails via Resend with tracking
- [ ] **cx-moderate** — content moderation for CX replies before send
- [ ] **cx-agent-assist** — real-time AI suggestions for agents
- [ ] **cx-shopify-actions** — performs Shopify mutations from CX (refunds, order edits)
- [ ] **sourcing-agent** — AI-powered supplier discovery; AI + DB writes to plm_sourcing
- [ ] **invoice-ai** — invoice OCR + PO matching + approval chain creation (7 actions)
- [ ] **invoice-inbound** — receives email invoices, stores to invoice_inbox
- [ ] **gmail-scan** — scans Gmail inbox for invoices/receipts (Gmail OAuth)
- [ ] **esign** — e-signature flow (create envelope, send for signing)
- [ ] **esign-pdf** — generates signed PDF from esign-signers data
- [ ] **automation-engine** — ✅ DONE
- [ ] **notion-import** — imports Notion pages into Helm documents
- [ ] **google-docs-sync** — syncs Google Docs into Helm documents
- [ ] **sheets-sync** — full Google Sheets sync to scoreboard_daily
- [ ] **sheets-daily-sync** — cron-fired daily sync of named sheets
- [ ] **asana-proxy** — wraps Asana REST API for our task sync

## Tier 3: HIGH COMPLEXITY (≈20-40 min each)
External OAuth state, multi-step integrations, complex error handling.

- [ ] **qbo-callback** — QuickBooks OAuth callback; stores tokens in qbo_oauth_states
- [ ] **qbo-auth-url** — generates OAuth init URL
- [ ] **qbo-sync** — full QBO sync (vendors, accounts, transactions, P&L)
- [ ] **qbo-auto-sync** — cron-fired version
- [ ] **qbo-push** — push Helm bills/invoices into QBO
- [ ] **qbo-attachments** — uploads attachments to QBO bills
- [ ] **shopify-callback** — Shopify OAuth callback
- [ ] **shopify-store-token** — saves Shopify access token
- [ ] **shopify-sync** — pulls Shopify orders into dp_orders
- [ ] **shopify-auto-sync** — cron-fired
- [ ] **shopify-debug** — Shopify diagnostic endpoint
- [ ] **ramp-sync** — Ramp transactions sync
- [ ] **metabase-sync** — Metabase data warehouse sync (currently broken at source — EDM dead)
- [ ] **metabase-daily-sync** — cron-fired
- [ ] **meta-social** — Facebook/Instagram ads spend sync
- [ ] **tiktok-social** — TikTok ads spend sync
- [ ] **slack-interactivity** — handles Slack interactive button callbacks (signature verify)
- [ ] **import-expenses** — multi-format expense file importer (CSV/Excel parsing)

## Tier 4: DESIGN-DECISION REQUIRED (need conversation first)
These touch Supabase Auth and need to be redesigned for Firebase Auth before porting.

- [ ] **invite-user** — uses supabase.auth.admin.inviteUserByEmail
- [ ] **invite-external-collaborator** — same
- [ ] **send-invite** — same
- [ ] **accept-invite** — Supabase auth confirmation flow
- [ ] **manage-user** — uses Supabase Auth admin APIs
- [ ] **remove-user** — uses supabase.auth.admin.deleteUser

**Decision needed**: Firebase Auth equivalents:
- inviteByEmail → Firebase Admin SDK `auth().createUser()` + email invite via Resend
- deleteUser → Firebase Admin SDK `auth().deleteUser(uid)`
- Confirmation tokens → custom signed JWTs vs Firebase email link sign-in

These should be the LAST batch ported, after the 16 other team members have been onboarded to Firebase Auth.

## Tier 5: SPECIAL (one-offs)
- [ ] **ai-deploy** — port of the function we're using RIGHT NOW to commit code. Bootstrap problem: helm-api can't deploy itself. Keep using Supabase edge function version until everything else is ported, then port last.

## Recommended porting order (next session)

1. Easy wins first to build momentum: call-ai, calendar-manager, livekit-webhook, ar-reminders, ap-alerts, ical-proxy, slack-update (4 hours total)
2. Then CX batch as a cohesive unit: cx-ai-draft, cx-email, cx-moderate, cx-agent-assist, cx-shopify-actions, cx-export-runner, cx-kb-gap-report, cx-fulfillment-crawler, cx-appreciation-drafter (4-5 hours)
3. Then QBO batch: 6 functions, ~3 hours but careful work needed for OAuth flow
4. Shopify batch: 5 functions, ~2-3 hours
5. Auth migration design discussion + Tier 4 (1 session, design + port)
6. ai-deploy port last

## Operational TODOs

- [ ] Set up Cloud Build trigger for helm-api/ auto-deploy on push to main
- [ ] Real values for SLACK_BOT_TOKEN, RESEND_API_KEY, GITHUB_TOKEN, QBO_*, SHOPIFY_*, RAMP_*, ASANA_TOKEN, NOTION_TOKEN, LIVEKIT_*, METABASE_*, GMAIL_OAUTH, META_APP_SECRET, TIKTOK_APP_SECRET, CRON_SHARED_SECRET in Secret Manager (currently only ANTHROPIC_API_KEY + PGPASSWORD are real)
- [ ] VPC connector for Cloud Run → private Cloud SQL access (currently public IP)
- [ ] Firebase Auth UI page for other team members to onboard
- [ ] Frontend wiring: Firebase Web SDK + helmApi.fetch() helper
- [ ] Cloud Scheduler jobs to replace 14 pg_cron jobs (analyze automation-engine + sync routes for cron triggers)
- [ ] Delta sync: dp_orders has ~3K rows accumulated since dump, dp_daily_sales has ~212; resync from Supabase before cutover
