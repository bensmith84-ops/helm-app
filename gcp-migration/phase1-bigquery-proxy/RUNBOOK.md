# Phase 1 Runbook — Exact commands to run

Everything in this folder is committed to the Helm repo. The frontend already has a `useProxy` flag that flips on when `NEXT_PUBLIC_BQ_PROXY_URL` is set in Vercel. So Helm keeps working off Supabase until you complete the steps below.

## Prerequisites

You have `gcloud` and `bq` CLIs installed, authenticated as a user with Owner or Editor on project `helm-490123`.

```bash
gcloud auth login
gcloud config set project helm-490123
```

## Step 1 — Create BigQuery dataset and views

```bash
cd gcp-migration/phase1-bigquery-proxy
chmod +x bigquery/01_create_dataset.sh deploy.sh verify.sh
./bigquery/01_create_dataset.sh
bq --project_id=helm-490123 query --use_legacy_sql=false < bigquery/02_dp_orders_v1.sql
bq --project_id=helm-490123 query --use_legacy_sql=false < bigquery/03_dp_daily_sales_by_warehouse_v1.sql
```

Verify the views work:
```bash
bq --project_id=helm-490123 query --use_legacy_sql=false \
  'SELECT COUNT(*) FROM `helm-490123.helm_prod.dp_orders_v1` WHERE order_date >= "2026-05-18"'
```

If you get an "access denied" error on `eb-testing-01`, the Cloud Run service account (created next) will also need read access on that project. The deploy script will tell you, but pre-emptively:

```bash
gcloud projects add-iam-policy-binding eb-testing-01 \
  --member=serviceAccount:helm-bq-reader@helm-490123.iam.gserviceaccount.com \
  --role=roles/bigquery.dataViewer
```

## Step 2 — Deploy Cloud Run

```bash
./deploy.sh
```

This creates the service account, secret, enables APIs, builds the container, deploys. Takes 3-5 min.

Prints the URL at the end. Copy it.

## Step 3 — Smoke test

```bash
./verify.sh
```

You should see:
- `/health` returns ok
- `/dp/orders` without auth returns 401
- `/dp/orders` with auth returns 5 sample rows
- `/dp/warehouse-sales` with auth returns 5 sample rows

If any of those fail, do **NOT** proceed to step 4. Paste the error and I'll fix.

## Step 4 — Flip Helm to BigQuery via Vercel env vars

In Vercel project settings → Environment Variables, add to **both Production and Preview**:

```
NEXT_PUBLIC_BQ_PROXY_URL = <URL from step 2>
NEXT_PUBLIC_BQ_PROXY_TOKEN = txyWHNyRNiUbcUrsxsxFjpKkk4BBpFCsyLGf+YD9DNo=
```

Then redeploy (any commit, or "Redeploy" from the Vercel dashboard).

## Step 5 — Verify in Helm

Open Helm → Demand Planning. Browser console should show data loading. The line `[DP] Loaded N warehouse-sales rows, N order rows` should appear with non-zero N. If you see `bq-proxy ... failed`, something's wrong with auth or CORS.

## Step 6 — Drop the Supabase tables

ONLY do this after step 5 confirms Helm is reading from BigQuery successfully. Run in Supabase SQL editor (NOT here through me — you do this manually):

```sql
-- Confirm nothing is reading from these anymore
DROP TABLE public.dp_orders;
DROP TABLE public.dp_daily_sales_by_warehouse;
```

Supabase DB will shrink from 1.1 GB to ~150 MB. The Supabase capacity alert should resolve within a day.

## Step 7 — Remove the dead sync paths

The pg_cron `dp-daily-sync` and the metabase-sync code still try to populate the dropped tables. Remove cards 587 and 588 from the sync plan:

```sql
-- In Supabase:
-- Edit dp_daily_sync_fire_all() to remove the card 587 and 588 blocks
-- Edit dp_daily_sync_verify_and_log() to remove dp_orders and dp_daily_sales_by_warehouse checks
```

Or ping me and I'll do it.

## Rollback (if anything goes wrong)

Before step 6: just unset the Vercel env vars and redeploy. Helm falls back to Supabase automatically.

After step 6: re-create the tables and re-sync from Metabase cards 587/588. I have the schemas.

## Cost expectations

- Cloud Run: ~$5/mo at expected usage (mostly idle)
- BigQuery: a few cents/mo at expected query volume (views over existing data, no extra storage)
- Secret Manager: free tier
- Cloud Build: free tier for build minutes
- Total: <$10/mo
