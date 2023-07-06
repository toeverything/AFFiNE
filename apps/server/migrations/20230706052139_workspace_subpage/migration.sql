/*
  Warnings:

  - A unique constraint covering the columns `[subpageId]` on the table `user_workspace_permissions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspace_id,subpageId,entity_id]` on the table `user_workspace_permissions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user_workspace_permissions" ADD COLUMN     "subpageId" VARCHAR;

-- CreateIndex
CREATE UNIQUE INDEX "user_workspace_permissions_subpageId_key" ON "user_workspace_permissions"("subpageId");

-- CreateIndex
CREATE UNIQUE INDEX "user_workspace_permissions_workspace_id_subpageId_entity_id_key" ON "user_workspace_permissions"("workspace_id", "subpageId", "entity_id");
