#!/bin/bash
# Backup Agent Platform data from PostgreSQL
# Usage: ./scripts/backup-agent-data.sh [backup_dir]

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"
BACKUP_DIR="${1:-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="${BACKUP_DIR}/agent-platform_${TIMESTAMP}.sql"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Agent Platform tables
TABLES=(
  agent_runs
  agent_proposals
  agent_approvals
  agent_audit_events
  agent_step_results
  agent_workspace_repos
  agent_workspace_rules
  agent_chat_sessions
  agent_chat_messages
)

# Build pg_dump table flags
TABLE_FLAGS=""
for t in "${TABLES[@]}"; do
  TABLE_FLAGS="${TABLE_FLAGS} -t ${t}"
done

echo "Dumping Agent Platform tables to $DUMP_FILE..."
# shellcheck disable=SC2086
pg_dump "$DATABASE_URL" ${TABLE_FLAGS} --data-only --inserts > "$DUMP_FILE"

# Show summary
echo ""
echo "=== Backup Summary ==="
echo "SQL: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
echo ""
echo "Data counts:"
for t in "${TABLES[@]}"; do
  COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM ${t};" 2>/dev/null | tr -d ' ' || echo "?")
  printf "  %-25s %s\n" "${t}:" "${COUNT}"
done
echo ""
echo "To restore:"
echo "  psql \$DATABASE_URL < $DUMP_FILE"
