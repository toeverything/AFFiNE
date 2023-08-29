/*
  Warnings:

  - A unique constraint covering the columns `[workspace_id,sub_page_id,entity_id]` on the table `user_workspace_permissions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user_workspace_permissions" ADD COLUMN     "sub_page_id" VARCHAR,
ALTER COLUMN "entity_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_workspace_permissions_workspace_id_sub_page_id_entity__key" ON "user_workspace_permissions"("workspace_id", "sub_page_id", "entity_id");
