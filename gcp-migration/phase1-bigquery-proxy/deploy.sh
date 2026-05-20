#!/bin/bash
# Deploy helm-bq-proxy to Cloud Run. Idempotent.
set -euo pipefail

PROJECT=helm-496923
REGION=us-central1
SERVICE=helm-bq-proxy
DATASET=helm_prod
SA_NAME=helm-bq-reader
SA_EMAIL="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
SECRET_NAME=helm-bq-proxy-token
BQ_PROXY_TOKEN="txyWHNyRNiUbcUrsxsxFjpKkk4BBpFCsyLGf+YD9DNo="

echo ">> Active project: $PROJECT"
gcloud config set project "$PROJECT"

echo ">> Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com

echo ">> Ensuring service account: $SA_EMAIL"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Helm BigQuery proxy" \
    --description="Used by helm-bq-proxy Cloud Run to query helm_prod"
fi

echo ">> Granting BigQuery roles to SA"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/bigquery.jobUser" \
  --condition=None

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/bigquery.dataViewer" \
  --condition=None

echo "WARNING: If the views fail with access-denied on eb-testing-01, run:"
echo "  gcloud projects add-iam-policy-binding eb-testing-01 \\"
echo "    --member=serviceAccount:$SA_EMAIL \\"
echo "    --role=roles/bigquery.dataViewer"

echo ">> Ensuring secret $SECRET_NAME"
if ! gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
  printf '%s' "$BQ_PROXY_TOKEN" | gcloud secrets create "$SECRET_NAME" \
    --replication-policy=automatic \
    --data-file=-
else
  current=$(gcloud secrets versions access latest --secret="$SECRET_NAME" 2>/dev/null || echo "")
  if [ "$current" != "$BQ_PROXY_TOKEN" ]; then
    printf '%s' "$BQ_PROXY_TOKEN" | gcloud secrets versions add "$SECRET_NAME" --data-file=-
  fi
fi

gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None

echo ">> Building and deploying $SERVICE to Cloud Run ($REGION)"
cd "$(dirname "$0")/cloud-run"

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT=$PROJECT,BQ_DATASET=$DATASET" \
  --set-secrets "BQ_PROXY_TOKEN=$SECRET_NAME:latest" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --concurrency 80 \
  --timeout 60s

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.url)")
echo ""
echo "Deployed."
echo "  URL:    $URL"
echo "  Health: $URL/health"
echo ""
echo "Set in Vercel project env (Production AND Preview):"
echo "  NEXT_PUBLIC_BQ_PROXY_URL=$URL"
echo "  NEXT_PUBLIC_BQ_PROXY_TOKEN=$BQ_PROXY_TOKEN"
