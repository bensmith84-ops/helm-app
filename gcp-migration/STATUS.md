# Helm GCP Migration — Status Tracker

Single source of truth for the migration. Update each stage as it completes.

## Target architecture

```
GitHub (bensmith84-ops/helm-app)
       │
       ▼  push to main
Cloud Build (helm-490123)
       │
       ▼  build container
Artifact Registry: helm-app:latest
       │
       ▼  auto-deploy
Cloud Run: helm-app (us-central1)
       │
       ├──► BigQuery (helm_prod dataset)         ← analytical data
       ├──► Cloud SQL Postgres (helm-prod-db)    ← operational data
       ├──► Identity Platform                    ← auth
       └──► Cloud Run microservices              ← edge functions
```

## Stages

### Stage 1 — BigQuery offload for dp_orders + dp_daily_sales_by_warehouse

**Why first:** dp_orders alone is 86% of Supabase DB (946 MB / 1.1 GB). Moving it to BigQuery solves the capacity alert immediately and gives us our first GCP-resident piece without risking production.

**What's committed:**
- BigQuery view DDL: `gcp-migration/phase1-bigquery-proxy/bigquery/`
- Cloud Run proxy service: `gcp-migration/phase1-bigquery-proxy/cloud-run/`
- Deploy/verify scripts
- Helm frontend has `useProxy` feature flag — falls back to Supabase if env vars unset

**What's pending (requires gcloud):**
- Run `phase1-bigquery-proxy/RUNBOOK.md` once from Cloud Shell
- Set 2 env vars in Vercel
- Drop Supabase tables once verified

**Status:** ⏳ Code committed, awaiting first gcloud bootstrap

---

### Stage 2 — Cloud Run hosting (replaces Vercel)

**Why next:** Once GitHub → Cloud Build → Cloud Run works, every code change deploys to GCP automatically. Same workflow as Vercel today. Vercel stays running in parallel until verified.

**What's committed:**
- `Dockerfile` at repo root (multi-stage Next.js standalone build)
- `.dockerignore`
- `next.config.js` updated with `output: 'standalone'`
- `cloudbuild.yaml` defining the build pipeline
- Runbook: `gcp-migration/phase2-cloud-run/RUNBOOK.md`

**What's pending (requires gcloud, one-time):**
1. Create Artifact Registry repo
2. Create runtime service account `helm-app-runtime`
3. Create Cloud Build trigger pointing at GitHub
4. Push a test commit; verify build succeeds; verify Cloud Run service is up
5. Compare Cloud Run vs Vercel side-by-side
6. Point DNS at Cloud Run; delete Vercel

**Status:** ✅ DONE (2026-05-20)
- Cloud Run service URL: `https://helm-app-qp7o2dcl5a-uc.a.run.app`
- Cloud Build trigger: `helm-app-main` (auto-deploys on push to main)
- Runtime SA: `helm-app-runtime@helm-496923.iam.gserviceaccount.com`
- Project: `helm-496923` (IT-provisioned, billing attached)
- Supabase redirect URL allowlist now includes Cloud Run
- Google OAuth flow tested end-to-end on Cloud Run
- Vercel `helm-app-six.vercel.app` still running in parallel (intentional, fallback)

---

### Stage 3 — Migrate remaining analytical tables to BigQuery

Tables in scope (in order of size):
- `scoreboard_daily` (13 MB)
- `qbo_customers` (11 MB)
- `qbo_purchases` (4 MB)
- `qbo_journal_entries` (2.3 MB)
- `qbo_bills` (2.2 MB)
- `qbo_vendors` (2 MB)

Same pattern as Stage 1: BigQuery view + add endpoint to helm-bq-proxy + switch Helm code + drop Supabase table.

**Status:** 📋 Planned

---

### Stage 4 — Cloud SQL Postgres (replaces Supabase Postgres)

The hard one. Includes:
- pg_dump → pg_restore the remaining ~140 tables
- Rewrite RLS policies to not depend on `auth.uid()` from Supabase Auth
- Replace pg_cron with Cloud Scheduler
- Replace pg_net with direct HTTPS or Pub/Sub
- Migrate ~70 edge functions to Cloud Run services
- Identity Platform migration for users + JWT

**Status:** 📋 Planned — multi-week project, plan separately

---

### Stage 5 — Cleanup

- Delete Supabase project
- Delete Vercel project
- Rotate all secrets (PAT, anon keys, etc.)
- Update all OAuth/webhook callback URLs (QBO, Shopify, Slack, etc.)

**Status:** 📋 Final stage

## How code changes flow during migration

| Stage | Push to GitHub → | Resulting behavior |
|---|---|---|
| Today | Vercel auto-deploy | Single live URL on Vercel |
| After Stage 2 | Vercel + Cloud Build both auto-deploy | Two live URLs (Vercel + Cloud Run), compare them |
| After Stage 5 | Cloud Build only | Single live URL on Cloud Run |

The `ai-deploy` flow (how Claude commits) is unchanged across all stages.
