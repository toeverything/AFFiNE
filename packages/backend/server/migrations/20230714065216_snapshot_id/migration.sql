/*
  Warnings:

  - The primary key for the `snapshots` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropIndex
DROP INDEX "snapshots_workspace_id_idx";

-- AlterTable
ALTER TABLE "snapshots" DROP CONSTRAINT "snapshots_pkey",
ADD CONSTRAINT "snapshots_pkey" PRIMARY KEY ("guid", "workspace_id");
