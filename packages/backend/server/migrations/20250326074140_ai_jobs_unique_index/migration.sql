/*
  Warnings:

  - A unique constraint covering the columns `[created_by,workspace_id,blob_id]` on the table `ai_jobs` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ai_jobs_created_by_workspace_id_blob_id_idx";

-- DropIndex
DROP INDEX "ai_jobs_workspace_id_blob_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "ai_jobs_created_by_workspace_id_blob_id_key" ON "ai_jobs"("created_by", "workspace_id", "blob_id");
