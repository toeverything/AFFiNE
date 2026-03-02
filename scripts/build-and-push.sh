#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AION — Build Docker image and push to DigitalOcean Container Registry
#
# Usage:
#   ./scripts/build-and-push.sh          # builds and pushes :latest
#   ./scripts/build-and-push.sh v1.2.3   # builds and pushes :v1.2.3 + :latest
#
# Prerequisites:
#   doctl registry login
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGISTRY="registry.digitalocean.com/everestsk"
IMAGE="${REGISTRY}/aion"
TAG="${1:-latest}"

echo "==> Building image: ${IMAGE}:${TAG}"
docker build -t "${IMAGE}:${TAG}" .

if [ "${TAG}" != "latest" ]; then
  docker tag "${IMAGE}:${TAG}" "${IMAGE}:latest"
fi

echo "==> Pushing to DigitalOcean Container Registry..."
docker push "${IMAGE}:${TAG}"
if [ "${TAG}" != "latest" ]; then
  docker push "${IMAGE}:latest"
fi

echo ""
echo "Done! Image pushed: ${IMAGE}:${TAG}"
echo ""
echo "To deploy on the server:"
echo "  ssh root@<DROPLET_IP> 'cd /opt/aion && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d'"
