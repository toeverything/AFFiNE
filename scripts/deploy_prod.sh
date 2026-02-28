#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/deploy_prod.sh /path/to/project/root
# This script builds the server image and starts services using docker-compose.prod.yml

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env.production ]; then
  echo ".env.production not found. Copy .env.production.example and edit it before deploying."
  exit 1
fi

echo "Building and deploying affine server (production)..."
docker compose -f docker-compose.prod.yml up -d --build

echo "Waiting for migration job to finish..."
# Run migration job once (container will run `yarn predeploy` as configured)
docker compose -f docker-compose.prod.yml run --rm affine_migration || true

echo "Deployment finished."
