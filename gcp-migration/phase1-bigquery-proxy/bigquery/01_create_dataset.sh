#!/bin/bash
# One-time: create the helm_prod dataset.
set -euo pipefail

PROJECT=helm-490123
DATASET=helm_prod
LOCATION=US

echo "Creating BigQuery dataset $PROJECT:$DATASET (location=$LOCATION)..."

bq --project_id="$PROJECT" \
  mk --dataset \
  --location="$LOCATION" \
  --description="Helm production analytical data. Views over eb-testing-01.shopify_hydrogen and other source datasets." \
  "$PROJECT:$DATASET" || echo "(dataset already exists, continuing)"

echo "Done. Now run the view DDL files."
