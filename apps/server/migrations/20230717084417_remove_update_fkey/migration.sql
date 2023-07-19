-- DropForeignKey
ALTER TABLE "snapshots" DROP CONSTRAINT "snapshots_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "updates" DROP CONSTRAINT "updates_workspace_id_fkey";
