#!/bin/bash
# Backup Agent Platform SQLite data
# Usage: ./scripts/backup-agent-data.sh [backup_dir]

set -euo pipefail

DB_PATH="${AGENT_DB_PATH:-packages/backend/server}/agent-platform.db"
BACKUP_DIR="${1:-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/agent-platform_${TIMESTAMP}.db"
DUMP_FILE="${BACKUP_DIR}/agent-platform_${TIMESTAMP}.sql"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# 1. Binary copy (checkpoint WAL first for consistency)
echo "Checkpointing WAL..."
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

echo "Copying database to $BACKUP_FILE..."
cp "$DB_PATH" "$BACKUP_FILE"

# 2. SQL dump (portable, can restore on any SQLite version)
echo "Dumping SQL to $DUMP_FILE..."
sqlite3 "$DB_PATH" ".dump" > "$DUMP_FILE"

# 3. Show summary
echo ""
echo "=== Backup Summary ==="
echo "Binary: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
echo "SQL:    $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
echo ""
echo "Data counts:"
sqlite3 "$DB_PATH" "
  SELECT 'workspace_rules: ' || COUNT(*) FROM workspace_rules;
  SELECT 'workspace_repos: ' || COUNT(*) FROM workspace_repos;
  SELECT 'chat_sessions:   ' || COUNT(*) FROM chat_sessions;
  SELECT 'chat_messages:   ' || COUNT(*) FROM chat_messages;
  SELECT 'runs:            ' || COUNT(*) FROM runs;
"
echo ""
echo "To restore on server:"
echo "  # Option A: copy binary"
echo "  cp $BACKUP_FILE /path/to/server/agent-platform.db"
echo ""
echo "  # Option B: restore from SQL dump"
echo "  sqlite3 /path/to/server/agent-platform.db < $DUMP_FILE"
