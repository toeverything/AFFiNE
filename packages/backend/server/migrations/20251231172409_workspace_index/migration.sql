-- CreateIndex
CREATE INDEX IF NOT EXISTS "blobs_workspace_id_status_deleted_at_idx" ON "blobs"("workspace_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workspace_pages_workspace_id_public_idx" ON "workspace_pages"("workspace_id", "public");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workspace_user_permissions_workspace_id_type_status_idx" ON "workspace_user_permissions"("workspace_id", "type", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workspaces_created_at_idx" ON "workspaces"("created_at");