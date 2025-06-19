-- AlterTable
ALTER TABLE "ai_sessions_metadata" ADD COLUMN     "prompt_action" VARCHAR(32);

-- AlterTable
DROP INDEX IF EXISTS "idx_ai_session_unique_doc_root";

-- AlterTable
CREATE UNIQUE INDEX ai_session_unique_doc_session_idx 
ON ai_sessions_metadata (user_id, workspace_id, doc_id) 
WHERE prompt_action IS NULL AND parent_session_id IS NULL AND doc_id IS NOT NULL AND deleted_at IS NULL;