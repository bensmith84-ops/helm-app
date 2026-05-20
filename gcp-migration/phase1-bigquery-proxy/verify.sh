#!/bin/bash
# End-to-end smoke test of the deployed helm-bq-proxy.
set -euo pipefail

PROJECT=helm-490123
REGION=us-central1
SERVICE=helm-bq-proxy
TOKEN="txyWHNyRNiUbcUrsxsxFjpKkk4BBpFCsyLGf+YD9DNo="

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format="value(status.url)")
echo "Service URL: $URL"

echo ""
echo ">> /health (no auth)"
curl -fsS "$URL/health" | jq .

echo ""
echo ">> /dp/orders without auth (should 401)"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "$URL/dp/orders?start_date=2026-05-18&end_date=2026-05-19"

echo ""
echo ">> /dp/orders with auth (limit 5)"
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "$URL/dp/orders?start_date=2026-05-18&end_date=2026-05-19&limit=5" | jq '{count, first: .rows[0]}'

echo ""
echo ">> /dp/warehouse-sales with auth (limit 5)"
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "$URL/dp/warehouse-sales?start_date=2026-05-18&end_date=2026-05-19&limit=5" | jq '{count, first: .rows[0]}'

echo ""
echo "All checks passed if you saw row data above."
