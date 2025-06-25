-- AlterTable
ALTER TABLE "ai_sessions_metadata" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropIndex
DROP INDEX IF EXISTS "ai_session_unique_doc_session_idx";