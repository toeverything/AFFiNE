-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "last_check_embeddings" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00';

-- CreateIndex
CREATE INDEX "workspaces_last_check_embeddings_idx" ON "workspaces"("last_check_embeddings");
