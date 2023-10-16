/*
  Warnings:

  - A unique constraint covering the columns `[workspace_id,guid,seq]` on the table `updates` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `seq` to the `updates` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "updates_guid_workspace_id_idx";

-- AlterTable
ALTER TABLE "snapshots" ADD COLUMN     "seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "state" BYTEA;

-- AlterTable
ALTER TABLE "updates" ADD COLUMN     "seq" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "updates_workspace_id_guid_seq_key" ON "updates"("workspace_id", "guid", "seq");
