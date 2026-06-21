#!/usr/bin/env bash
set -euo pipefail

SERVER_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd -- "$SERVER_ROOT/../../.." && pwd)
NODE_VERSION=$(tr -d '\n' < "$REPO_ROOT/.nvmrc")
YARN=(npx -y "node@$NODE_VERSION" "$REPO_ROOT/.yarn/releases/yarn-4.13.0.cjs")

bash "$SERVER_ROOT/scripts/setup-local-test-env.sh"

export DATABASE_URL=${DATABASE_URL:-"postgresql://affine:affine@localhost:5432/affine"}
export REDIS_SERVER_HOST=${REDIS_SERVER_HOST:-localhost}
export NODE_ENV=${NODE_ENV:-test}

for spec in "$SERVER_ROOT"/src/__tests__/copilot/*.spec.ts; do
  /opt/homebrew/bin/redis-cli -h "$REDIS_SERVER_HOST" -p 6379 FLUSHALL >/dev/null
  rel_spec=${spec#"$SERVER_ROOT"/}
  echo "[copilot-tests] $rel_spec"
  (
    cd "$REPO_ROOT"
    "${YARN[@]}" workspace @affine/server ava "$rel_spec" --serial
  )
done

echo "All copilot specs completed."
