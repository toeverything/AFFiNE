-- AlterTable
ALTER TABLE ai_sessions_metadata ADD COLUMN updated_at TIMESTAMPTZ(3);

UPDATE ai_sessions_metadata SET updated_at = created_at;

ALTER TABLE ai_sessions_metadata ALTER COLUMN updated_at SET NOT NULL, ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- DropIndex
DROP INDEX IF EXISTS "ai_session_unique_doc_session_idx";