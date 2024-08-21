/*
  Warnings:

  - The primary key for the `updates` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "snapshots" ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "updates" DROP CONSTRAINT "updates_pkey",
ALTER COLUMN "created_at" DROP DEFAULT,
ALTER COLUMN "seq" DROP NOT NULL,
ADD CONSTRAINT "updates_pkey" PRIMARY KEY ("workspace_id", "guid", "created_at");
