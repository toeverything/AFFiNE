/*
  Warnings:

  - The primary key for the `workspace_page_user_permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `accepted` on the `workspace_page_user_permissions` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `workspace_page_user_permissions` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "workspace_page_user_permissions_workspace_id_page_id_user_i_key";

-- AlterTable
ALTER TABLE "workspace_page_user_permissions" DROP CONSTRAINT "workspace_page_user_permissions_pkey",
DROP COLUMN "accepted",
DROP COLUMN "id",
ADD CONSTRAINT "workspace_page_user_permissions_pkey" PRIMARY KEY ("workspace_id", "page_id", "user_id");
