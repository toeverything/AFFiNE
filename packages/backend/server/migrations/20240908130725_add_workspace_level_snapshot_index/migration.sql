/*
  Warnings:

  - The primary key for the `snapshots` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "snapshots" DROP CONSTRAINT "snapshots_pkey",
ADD CONSTRAINT "snapshots_pkey" PRIMARY KEY ("workspace_id", "guid");

-- CreateIndex
CREATE INDEX "snapshots_workspace_id_updated_at_idx" ON "snapshots"("workspace_id", "updated_at");
