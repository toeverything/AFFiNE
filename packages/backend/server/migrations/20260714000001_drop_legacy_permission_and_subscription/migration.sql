SET affine.permission_projection.enabled = 'off';

DROP TRIGGER IF EXISTS "affine_permission_project_workspace_user_permission" ON "workspace_user_permissions";
DROP TRIGGER IF EXISTS "affine_permission_project_workspace_page" ON "workspace_pages";
DROP TRIGGER IF EXISTS "affine_permission_project_workspace_page_user_permission" ON "workspace_page_user_permissions";
DROP TRIGGER IF EXISTS "affine_permission_project_workspace_policy" ON "workspaces";
DROP TRIGGER IF EXISTS "affine_permission_project_new_workspace_member" ON "workspace_members";
DROP TRIGGER IF EXISTS "affine_permission_project_new_workspace_invitation" ON "workspace_invitations";
DROP TRIGGER IF EXISTS "affine_permission_project_new_workspace_access_policy" ON "workspace_access_policies";
DROP TRIGGER IF EXISTS "affine_permission_project_new_doc_access_policy" ON "doc_access_policies";
DROP TRIGGER IF EXISTS "affine_permission_project_new_doc_grant" ON "doc_grants";
DROP TRIGGER IF EXISTS "project_legacy_workspace_readonly_feature_trigger" ON "effective_workspace_quota_states";

DROP FUNCTION IF EXISTS affine_permission_project_workspace_user_permission() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_workspace_page() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_workspace_page_user_permission() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_workspace_policy() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_new_workspace_member() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_new_workspace_invitation() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_new_workspace_access_policy() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_new_doc_access_policy() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_project_new_doc_grant() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_projection_error_category(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_lock_workspace(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_lock_doc(VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_should_project_from_legacy() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_should_project_from_new() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_projection_enabled() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_sync_origin() CASCADE;
DROP FUNCTION IF EXISTS affine_permission_new_workspace_role(TEXT) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_new_workspace_source(TEXT) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_new_invitation_status(TEXT) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_new_doc_role(TEXT) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_legacy_workspace_role(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_legacy_doc_role(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_legacy_default_doc_role(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS affine_permission_workspace_invitation_state("WorkspaceMemberStatus") CASCADE;
DROP FUNCTION IF EXISTS project_legacy_workspace_readonly_feature() CASCADE;

DELETE FROM "user_features"
WHERE "name" IN ('free_plan_v1', 'pro_plan_v1', 'lifetime_pro_plan_v1', 'unlimited_copilot');

DELETE FROM "workspace_features"
WHERE "name" IN ('team_plan_v1', 'quota_exceeded_readonly_workspace_v1', 'unlimited_workspace');

DROP TABLE "workspace_user_permissions";
DROP TABLE "workspace_page_user_permissions";
DROP TABLE "workspace_runtime_states";
DROP TABLE "subscriptions";

DROP INDEX IF EXISTS "workspace_pages_workspace_id_public_idx";
DROP INDEX IF EXISTS "workspace_pages_public_published_at_idx";
DROP INDEX IF EXISTS "workspace_members_legacy_permission_id_key";
DROP INDEX IF EXISTS "workspace_invitations_legacy_permission_id_key";
DROP INDEX IF EXISTS "doc_grants_legacy_key";

ALTER TABLE "workspaces"
  DROP COLUMN "public",
  DROP COLUMN "enable_sharing",
  DROP COLUMN "enable_url_preview";

ALTER TABLE "workspace_pages"
  DROP COLUMN "public",
  DROP COLUMN "defaultRole";

ALTER TABLE "workspace_members" DROP COLUMN "legacy_permission_id";
ALTER TABLE "workspace_invitations" DROP COLUMN "legacy_permission_id";
ALTER TABLE "doc_grants"
  DROP COLUMN "legacy_workspace_id",
  DROP COLUMN "legacy_doc_id",
  DROP COLUMN "legacy_user_id";

ALTER TABLE "workspace_admin_stats" DROP COLUMN "features";
