-- AlterTable
ALTER TABLE "ai_sessions_metadata" ALTER COLUMN "doc_id" DROP NOT NULL;

-- DropIndex
DROP INDEX "ai_sessions_metadata_user_id_workspace_id_idx";

-- CreateIndex
CREATE INDEX "ai_sessions_metadata_user_id_workspace_id_doc_id_idx" ON "ai_sessions_metadata"("user_id", "workspace_id", "doc_id");
