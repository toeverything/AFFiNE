-- DropForeignKey
ALTER TABLE "blobs" DROP CONSTRAINT "blobs_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "docs" DROP CONSTRAINT "docs_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "optimized_blobs" DROP CONSTRAINT "optimized_blobs_workspace_id_fkey";
