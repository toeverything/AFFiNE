-- AlterTable
ALTER TABLE "ai_sessions_metadata" ALTER COLUMN "doc_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_sessions_metadata" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ai_sessions_metadata" ADD COLUMN     "prompt_action" VARCHAR(32) DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "ai_session_unique_pinned_idx" ON "ai_sessions_metadata" (user_id, workspace_id) WHERE pinned = true AND deleted_at IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ai_session_unique_doc_session_idx" ON "ai_sessions_metadata" (user_id, workspace_id, doc_id) WHERE prompt_action IS NULL AND parent_session_id IS NULL AND doc_id IS NOT NULL AND deleted_at IS NULL;

-- CreateIndex
CREATE INDEX "ai_sessions_metadata_prompt_name_idx" ON "ai_sessions_metadata"("prompt_name");

-- DropIndex
DROP INDEX "ai_sessions_metadata_user_id_workspace_id_idx";

-- CreateIndex
CREATE INDEX "ai_sessions_metadata_user_id_workspace_id_doc_id_idx" ON "ai_sessions_metadata"("user_id", "workspace_id", "doc_id");
