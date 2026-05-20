# Phase 1 — BigQuery proxy for dp_orders / dp_daily_sales_by_warehouse

**Status:** in deployment
**Goal:** move the two heaviest tables out of Supabase into BigQuery so the operational DB shrinks from 1.1 GB → ~150 MB.

## Why

`dp_orders` is 946 MB / 86% of the Supabase DB. The source data already lives in BigQuery (`eb-testing-01.shopify_hydrogen.orders`). Mirroring it into Supabase via Metabase CSV exports is pointless — better to query BigQuery directly via a thin Cloud Run service.

This is the first GCP-resident piece of Helm. Same pattern applies to other analytical tables (scoreboard_daily, qbo_*) in later phases.

## Architecture

```
Helm frontend (Vercel)
     │  HTTPS + bearer token
     ▼
helm-bq-proxy (Cloud Run, us-central1)  ◄── SA: helm-bq-reader
     │
     ▼
BigQuery `helm_prod` (views)
     │
     ▼
eb-testing-01.shopify_hydrogen.*
```

## Files

- `bigquery/01_create_dataset.sh` — one-time
- `bigquery/02_dp_orders_v1.sql` — view DDL
- `bigquery/03_dp_daily_sales_by_warehouse_v1.sql` — view DDL
- `cloud-run/` — Node.js Express service
- `deploy.sh` — single-script deploy
- `verify.sh` — smoke test

## Deploy

```bash
cd gcp-migration/phase1-bigquery-proxy
./bigquery/01_create_dataset.sh
bq --project_id=helm-490123 query --use_legacy_sql=false < bigquery/02_dp_orders_v1.sql
bq --project_id=helm-490123 query --use_legacy_sql=false < bigquery/03_dp_daily_sales_by_warehouse_v1.sql
./deploy.sh
./verify.sh
```

## Auth

Single shared bearer token in Secret Manager (`helm-bq-proxy-token`) + Vercel (`NEXT_PUBLIC_BQ_PROXY_TOKEN`). Read-only, two endpoints. Phase 3 replaces with proper OIDC.

## Rollback

Tables remain in Supabase until verified. Rollback = revert DemandPlanning.js patch. Post-drop rollback = re-sync from Metabase cards 587/588.
