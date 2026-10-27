-- Additive terminal schema. Keep every old-writer column readable during the n-1/n
-- deployment window; destructive compatibility cleanup belongs after stable.

ALTER TABLE "entitlements"
  ADD CONSTRAINT "entitlements_signed_payload_source_check" CHECK (
    "signed_payload" IS NULL OR "source" = 'selfhost_license'
  );

ALTER TABLE "licenses" ADD COLUMN "workspace_id" VARCHAR;

ALTER TABLE "blobs"
  ADD COLUMN "reservation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "reservation_expires_at" TIMESTAMPTZ(3);

ALTER TABLE "comment_attachments"
  ADD COLUMN "status" "BlobStatus" NOT NULL DEFAULT 'completed',
  ADD COLUMN "reservation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "reservation_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

CREATE FUNCTION preserve_blob_source_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."blob" IS DISTINCT FROM OLD."blob"
    AND NEW."updated_at" <= OLD."updated_at" THEN
    NEW."updated_at" := OLD."updated_at" + INTERVAL '1 millisecond';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preserve_snapshot_blob_source_timestamp
BEFORE UPDATE OF "blob" ON "snapshots"
FOR EACH ROW
EXECUTE FUNCTION preserve_blob_source_timestamps();

CREATE FUNCTION reject_immutable_blob_source_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% source content is immutable', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER reject_update_source_change
BEFORE UPDATE OF "workspace_id", "guid", "blob", "created_at" ON "updates"
FOR EACH ROW
EXECUTE FUNCTION reject_immutable_blob_source_change();

CREATE TRIGGER reject_snapshot_history_source_change
BEFORE UPDATE OF "workspace_id", "guid", "timestamp", "blob" ON "snapshot_histories"
FOR EACH ROW
EXECUTE FUNCTION reject_immutable_blob_source_change();

CREATE INDEX "blobs_workspace_id_status_deleted_at_reservation_expires_at_idx"
  ON "blobs"("workspace_id", "status", "deleted_at", "reservation_expires_at");

CREATE INDEX "comment_attachments_workspace_id_status_deleted_at_reservation_expires_at_idx"
  ON "comment_attachments"("workspace_id", "status", "deleted_at", "reservation_expires_at");

CREATE TABLE "pending_license_deactivations" (
  "key" VARCHAR NOT NULL,
  "workspace_id" VARCHAR NOT NULL,
  "operation_id" VARCHAR NOT NULL,
  "claim_id" VARCHAR,
  "claimed_until" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pending_license_deactivations_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "pending_license_deactivations_workspace_id_idx"
  ON "pending_license_deactivations"("workspace_id");

CREATE FUNCTION lock_personal_copilot_workspace_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('copilot-personal:' || NEW.id, 0)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER lock_personal_copilot_workspace_insert
BEFORE INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION lock_personal_copilot_workspace_insert();

CREATE TABLE "workspace_sync_permission_generations" (
  "workspace_id" VARCHAR NOT NULL,
  "generation" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "workspace_sync_permission_generations_pkey" PRIMARY KEY ("workspace_id"),
  CONSTRAINT "workspace_sync_permission_generations_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE
);

CREATE FUNCTION bump_workspace_sync_permission_generation() RETURNS trigger AS $$
DECLARE
  affected_workspace_id VARCHAR;
BEGIN
  affected_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = affected_workspace_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  INSERT INTO workspace_sync_permission_generations(workspace_id, generation)
  VALUES (affected_workspace_id, 1)
  ON CONFLICT (workspace_id) DO UPDATE
    SET generation = workspace_sync_permission_generations.generation + 1;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_members_sync_permission_generation
AFTER INSERT OR UPDATE OR DELETE ON workspace_members
FOR EACH ROW EXECUTE FUNCTION bump_workspace_sync_permission_generation();

CREATE TRIGGER workspace_access_policies_sync_permission_generation
AFTER INSERT OR UPDATE OR DELETE ON workspace_access_policies
FOR EACH ROW EXECUTE FUNCTION bump_workspace_sync_permission_generation();

CREATE TRIGGER doc_access_policies_sync_permission_generation
AFTER INSERT OR UPDATE OR DELETE ON doc_access_policies
FOR EACH ROW EXECUTE FUNCTION bump_workspace_sync_permission_generation();

CREATE TRIGGER doc_grants_sync_permission_generation
AFTER INSERT OR UPDATE OR DELETE ON doc_grants
FOR EACH ROW EXECUTE FUNCTION bump_workspace_sync_permission_generation();
