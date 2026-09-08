DROP TRIGGER IF EXISTS "workspace_admin_stats_dirty_members" ON "workspace_members";
CREATE TRIGGER "workspace_admin_stats_dirty_members"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_members"
FOR EACH ROW EXECUTE FUNCTION workspace_admin_stats_mark_dirty();

DROP TRIGGER IF EXISTS "workspace_admin_stats_dirty_doc_access_policies" ON "doc_access_policies";
CREATE TRIGGER "workspace_admin_stats_dirty_doc_access_policies"
AFTER INSERT OR UPDATE OR DELETE ON "doc_access_policies"
FOR EACH ROW EXECUTE FUNCTION workspace_admin_stats_mark_dirty();

ALTER TABLE "calendar_subscriptions"
  ADD COLUMN "sync_claimed_until" TIMESTAMPTZ(3);

CREATE INDEX "calendar_subscriptions_sync_claim_idx"
  ON "calendar_subscriptions"("enabled", "next_sync_at", "sync_claimed_until");

CREATE INDEX "ai_sessions_metadata_missing_title_idx"
  ON "ai_sessions_metadata"("updated_at")
  WHERE "title" IS NULL
    AND "deleted_at" IS NULL
    AND COALESCE("prompt_action", '') = '';

CREATE FUNCTION guard_workspace_storage_lifecycle_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended('storage-workspace:' || NEW.id, 0)
  ) THEN
    RAISE EXCEPTION 'workspace storage lifecycle is busy'
      USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_workspace_storage_lifecycle_insert
BEFORE INSERT ON "workspaces"
FOR EACH ROW
EXECUTE FUNCTION guard_workspace_storage_lifecycle_insert();
