# GCP Migration

Migrating Helm from Supabase + Vercel to GCP. Phased.

## Phases

| Phase | What | Status |
|---|---|---|
| 1 | Move dp_orders + dp_daily_sales_by_warehouse to BigQuery (Cloud Run proxy) | **In progress** — see `phase1-bigquery-proxy/RUNBOOK.md` |
| 2 | Move other analytical tables (scoreboard_daily, qbo_*) to BigQuery | Planned |
| 3 | Migrate operational Postgres to Cloud SQL, auth to Identity Platform | Planned |
| 4 | Migrate ~70 edge functions to Cloud Run | Planned |

## Drivers

- Supabase capacity alert (DB at 1.1 GB, 86% one table that should be in BigQuery anyway)
- Security: Earth Breeze runs on GCP; Helm being on Supabase/Vercel is the outlier
- Standardization: align with the rest of company infrastructure

## Project IDs

- GCP project: `helm-490123`
- Supabase project: `upbjdmnykheubxkuknuj`
- Vercel project: `prj_LBlVj8f1iBMP1yrBPNC25Yv4y5W7`

## Naming conventions

- BigQuery dataset: `helm_prod` (production analytical data)
- Cloud Run region: `us-central1`
- Service account naming: `helm-<purpose>-<role>@helm-490123.iam.gserviceaccount.com`
- Secrets: `helm-<service>-<what>` in Secret Manager
