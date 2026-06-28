#!/usr/bin/env bash
set -euo pipefail

SERVER_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd -- "$SERVER_ROOT/../../.." && pwd)
NODE_VERSION=$(tr -d '\n' < "$REPO_ROOT/.nvmrc")
YARN=(npx -y "node@$NODE_VERSION" "$REPO_ROOT/.yarn/releases/yarn-4.13.0.cjs")

BREW_BIN=${BREW_BIN:-$(command -v brew || true)}
if [ -z "$BREW_BIN" ]; then
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$candidate" ]; then
      BREW_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$BREW_BIN" ]; then
  echo "Homebrew is required to set up the local copilot test environment." >&2
  exit 1
fi

BOOTSTRAP_PGUSER=${BOOTSTRAP_PGUSER:-$USER}
AFFINE_TEST_DB_NAME=${AFFINE_TEST_DB_NAME:-affine}
AFFINE_TEST_DB_USER=${AFFINE_TEST_DB_USER:-affine}
AFFINE_TEST_DB_PASSWORD=${AFFINE_TEST_DB_PASSWORD:-affine}
export DATABASE_URL=${DATABASE_URL:-"postgresql://${AFFINE_TEST_DB_USER}:${AFFINE_TEST_DB_PASSWORD}@localhost:5432/${AFFINE_TEST_DB_NAME}"}
export REDIS_SERVER_HOST=${REDIS_SERVER_HOST:-localhost}
export NODE_ENV=${NODE_ENV:-test}

for formula in postgresql@16 redis pgvector; do
  if ! HOMEBREW_NO_AUTO_UPDATE=1 "$BREW_BIN" list --formula "$formula" >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 "$BREW_BIN" install "$formula"
  fi
done

BREW_PREFIX=$("$BREW_BIN" --prefix)
PG_PREFIX=$("$BREW_BIN" --prefix postgresql@16)
REDIS_PREFIX=$("$BREW_BIN" --prefix redis)
export PATH="$PG_PREFIX/bin:$BREW_PREFIX/bin:$PATH"

VECTOR_CONTROL="$PG_PREFIX/share/postgresql@16/extension/vector.control"
if [ ! -f "$VECTOR_CONTROL" ]; then
  TMP_DIR=$(mktemp -d)
  PGVECTOR_VERSION=$("$BREW_BIN" info --json=v2 pgvector | python3 -c 'import json,sys; print(json.load(sys.stdin)["formulae"][0]["versions"]["stable"])')
  curl -L "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" -o "$TMP_DIR/pgvector.tar.gz"
  tar -xzf "$TMP_DIR/pgvector.tar.gz" -C "$TMP_DIR"
  make -C "$TMP_DIR/pgvector-$PGVECTOR_VERSION" PG_CONFIG="$PG_PREFIX/bin/pg_config"
  make -C "$TMP_DIR/pgvector-$PGVECTOR_VERSION" PG_CONFIG="$PG_PREFIX/bin/pg_config" install
  rm -rf "$TMP_DIR"
fi

HOMEBREW_NO_AUTO_UPDATE=1 "$BREW_BIN" services start postgresql@16
HOMEBREW_NO_AUTO_UPDATE=1 "$BREW_BIN" services start redis

psql -v ON_ERROR_STOP=1 -U "$BOOTSTRAP_PGUSER" -d postgres \
  -v affine_test_db_user="$AFFINE_TEST_DB_USER" \
  -v affine_test_db_password="$AFFINE_TEST_DB_PASSWORD" <<'SQL'
SELECT format(
  'CREATE USER %I WITH PASSWORD %L',
  :'affine_test_db_user',
  :'affine_test_db_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'affine_test_db_user'
)\gexec

SELECT format('ALTER USER %I WITH SUPERUSER', :'affine_test_db_user')\gexec
SQL

psql -v ON_ERROR_STOP=1 -U "$BOOTSTRAP_PGUSER" -d postgres \
  -v affine_test_db_name="$AFFINE_TEST_DB_NAME" \
  -v affine_test_db_user="$AFFINE_TEST_DB_USER" <<'SQL'
SELECT format(
  'CREATE DATABASE %I OWNER %I',
  :'affine_test_db_name',
  :'affine_test_db_user'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'affine_test_db_name'
)\gexec
SQL

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

"$PG_PREFIX/bin/pg_isready" -h localhost -p 5432
"$REDIS_PREFIX/bin/redis-cli" -h "$REDIS_SERVER_HOST" -p 6379 ping

echo "AFFINE server test env is ready."
