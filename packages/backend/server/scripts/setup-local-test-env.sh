#!/usr/bin/env bash
set -euo pipefail

SERVER_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd -- "$SERVER_ROOT/../../.." && pwd)
NODE_VERSION=$(tr -d '\n' < "$REPO_ROOT/.nvmrc")
YARN=(npx -y "node@$NODE_VERSION" "$REPO_ROOT/.yarn/releases/yarn-4.13.0.cjs")

export PATH="/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/bin:$PATH"

BOOTSTRAP_PGUSER=${BOOTSTRAP_PGUSER:-$USER}
AFFINE_TEST_DB_NAME=${AFFINE_TEST_DB_NAME:-affine}
AFFINE_TEST_DB_USER=${AFFINE_TEST_DB_USER:-affine}
AFFINE_TEST_DB_PASSWORD=${AFFINE_TEST_DB_PASSWORD:-affine}
export DATABASE_URL=${DATABASE_URL:-"postgresql://${AFFINE_TEST_DB_USER}:${AFFINE_TEST_DB_PASSWORD}@localhost:5432/${AFFINE_TEST_DB_NAME}"}
export REDIS_SERVER_HOST=${REDIS_SERVER_HOST:-localhost}
export NODE_ENV=${NODE_ENV:-test}

for formula in postgresql@16 redis pgvector; do
  if ! HOMEBREW_NO_AUTO_UPDATE=1 brew list --formula "$formula" >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install "$formula"
  fi
done

VECTOR_CONTROL="/opt/homebrew/opt/postgresql@16/share/postgresql@16/extension/vector.control"
if [ ! -f "$VECTOR_CONTROL" ]; then
  TMP_DIR=$(mktemp -d)
  PGVECTOR_VERSION=$(brew info --json=v2 pgvector | python3 -c 'import json,sys; print(json.load(sys.stdin)["formulae"][0]["versions"]["stable"])')
  curl -L "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" -o "$TMP_DIR/pgvector.tar.gz"
  tar -xzf "$TMP_DIR/pgvector.tar.gz" -C "$TMP_DIR"
  make -C "$TMP_DIR/pgvector-$PGVECTOR_VERSION" PG_CONFIG="/opt/homebrew/opt/postgresql@16/bin/pg_config"
  make -C "$TMP_DIR/pgvector-$PGVECTOR_VERSION" PG_CONFIG="/opt/homebrew/opt/postgresql@16/bin/pg_config" install
  rm -rf "$TMP_DIR"
fi

HOMEBREW_NO_AUTO_UPDATE=1 brew services start postgresql@16
HOMEBREW_NO_AUTO_UPDATE=1 brew services start redis

if ! psql -U "$BOOTSTRAP_PGUSER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${AFFINE_TEST_DB_USER}'" | /usr/bin/grep -q 1; then
  psql -U "$BOOTSTRAP_PGUSER" -d postgres -c "CREATE USER \"${AFFINE_TEST_DB_USER}\" WITH PASSWORD '${AFFINE_TEST_DB_PASSWORD}'"
fi

if ! psql -U "$BOOTSTRAP_PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${AFFINE_TEST_DB_NAME}'" | /usr/bin/grep -q 1; then
  psql -U "$BOOTSTRAP_PGUSER" -d postgres -c "CREATE DATABASE \"${AFFINE_TEST_DB_NAME}\" OWNER \"${AFFINE_TEST_DB_USER}\""
fi

psql -U "$BOOTSTRAP_PGUSER" -d postgres -c "ALTER USER \"${AFFINE_TEST_DB_USER}\" WITH SUPERUSER"

if [ ! -f "$SERVER_ROOT/config.json" ]; then
  printf '%s\n' '{}' > "$SERVER_ROOT/config.json"
fi

(
  cd "$REPO_ROOT"
  "${YARN[@]}" affine @affine/server prisma generate
  "${YARN[@]}" affine @affine/server prisma migrate deploy
  "${YARN[@]}" affine @affine/server prisma db execute --stdin --schema schema.prisma < "$SERVER_ROOT/scripts/repair-pgvector-embedding-tables.sql"
  "${YARN[@]}" affine @affine/server data-migration run
)

TABLE_COUNT=$(psql -U "$BOOTSTRAP_PGUSER" -d "$AFFINE_TEST_DB_NAME" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('ai_context_embeddings', 'ai_workspace_embeddings', 'ai_workspace_file_embeddings', 'ai_workspace_blob_embeddings')")
if [ "$TABLE_COUNT" -ne 4 ]; then
  echo "Copilot embedding tables are incomplete. Ensure the pgvector extension is available for PostgreSQL." >&2
  exit 1
fi

/opt/homebrew/opt/postgresql@16/bin/pg_isready -h localhost -p 5432
/opt/homebrew/bin/redis-cli -h localhost -p 6379 ping

echo "AFFINE server test env is ready."
