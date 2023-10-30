/*
  Warnings:

  - The primary key for the `updates` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `object_id` on the `updates` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "updates_workspace_id_guid_seq_key";

-- AlterTable
ALTER TABLE "updates" DROP CONSTRAINT "updates_pkey",
DROP COLUMN "object_id",
ADD CONSTRAINT "updates_pkey" PRIMARY KEY ("workspace_id", "guid", "seq");
