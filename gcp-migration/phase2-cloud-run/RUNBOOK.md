# Stage 2 — Cloud Run Bootstrap Runbook

Once-per-project setup that wires GitHub → Cloud Build → Cloud Run. After this, every push to main auto-deploys to Cloud Run (in parallel with Vercel, which keeps running).

## Prerequisites

- Stage 1 (BigQuery proxy) is deployed and verified
- You're in Cloud Shell or have gcloud installed locally, authenticated against project `helm-490123`
- You can grant IAM roles in the project (Owner or appropriate admin)

## Step 1 — Enable required APIs

```bash
gcloud config set project helm-490123

gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com
```

## Step 2 — Create Artifact Registry repo

```bash
gcloud artifacts repositories create helm \
  --repository-format=docker \
  --location=us-central1 \
  --description="Container images for Helm app"
```

## Step 3 — Create the runtime service account

This is what the Cloud Run service runs as. It needs read access to BigQuery (for the proxy endpoints — even though that's a separate service today, the main app will need this in later stages).

```bash
gcloud iam service-accounts create helm-app-runtime \
  --display-name="Helm app runtime SA" \
  --description="Used by helm-app Cloud Run service"

# Allow it to access Secret Manager (for any runtime-only secrets)
gcloud projects add-iam-policy-binding helm-490123 \
  --member="serviceAccount:helm-app-runtime@helm-490123.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None
```

## Step 4 — Grant Cloud Build permission to deploy to Cloud Run

Cloud Build runs as `<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com`. It needs roles/run.admin and the ability to act as the runtime SA.

```bash
PROJECT_NUMBER=$(gcloud projects describe helm-490123 --format='value(projectNumber)')
CB_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding helm-490123 \
  --member="serviceAccount:$CB_SA" \
  --role="roles/run.admin" \
  --condition=None

gcloud iam service-accounts add-iam-policy-binding \
  helm-app-runtime@helm-490123.iam.gserviceaccount.com \
  --member="serviceAccount:$CB_SA" \
  --role="roles/iam.serviceAccountUser"
```

## Step 5 — Connect GitHub to Cloud Build

Easier in the console than CLI:

1. https://console.cloud.google.com/cloud-build/triggers?project=helm-490123
2. Click **Connect Repository**
3. Select **GitHub (Cloud Build GitHub App)**
4. Authorize, install the Cloud Build app on the bensmith84-ops account
5. Pick the **helm-app** repo, click **Connect**

## Step 6 — Create the build trigger

```bash
# Get the same values we use in Vercel today
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4"

# These two should already be set in Vercel from Stage 1 — copy them here
BQ_PROXY_URL="<paste the URL from Stage 1 deploy.sh output>"
BQ_PROXY_TOKEN="txyWHNyRNiUbcUrsxsxFjpKkk4BBpFCsyLGf+YD9DNo="

gcloud builds triggers create github \
  --name=helm-app-main \
  --repo-owner=bensmith84-ops \
  --repo-name=helm-app \
  --branch-pattern=^main$ \
  --build-config=cloudbuild.yaml \
  --substitutions="_NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY,_NEXT_PUBLIC_BQ_PROXY_URL=$BQ_PROXY_URL,_NEXT_PUBLIC_BQ_PROXY_TOKEN=$BQ_PROXY_TOKEN"
```

## Step 7 — Trigger the first build manually

Don't wait for a push — kick the build immediately to confirm it works:

```bash
gcloud builds triggers run helm-app-main --branch=main
```

Watch the build in the console: https://console.cloud.google.com/cloud-build/builds?project=helm-490123

Takes 5-15 minutes the first time (npm install + Next.js build). Subsequent builds are faster thanks to layer caching.

## Step 8 — Get the Cloud Run URL and test

```bash
gcloud run services describe helm-app \
  --region=us-central1 \
  --format='value(status.url)'
```

Open that URL in a browser. You should see Helm load, identical to the Vercel version. Sign in, navigate around, verify Demand Planning data loads from BigQuery proxy.

## Step 9 — Side-by-side validation

For the next few days, BOTH should be running:
- Vercel: `https://helm-app-six.vercel.app` (current prod)
- Cloud Run: `https://helm-app-<hash>-uc.a.run.app` (new)

Use Cloud Run for testing. When confident, point DNS at it and delete Vercel.

## Step 10 — DNS cutover (when ready)

If using a custom domain, update DNS to point at Cloud Run. If using the default Vercel URL, share the Cloud Run URL with users and start decommissioning Vercel.

## Rollback

If anything goes wrong: Vercel is still running this whole time. Just keep using it.

After cutover: Cloud Run keeps the last 10 revisions automatically. `gcloud run services update-traffic helm-app --to-revisions=PREVIOUS=100` reverts.

## Costs

Estimate for this stack:
- Cloud Run: $5-25/mo at expected usage
- Cloud Build: free tier (120 build-minutes/day)
- Artifact Registry: ~$1/mo (a few GB of images)
- Total: <$30/mo

Vercel today is free tier — slight increase. But you also drop Supabase costs once Stage 4 is done.
