-- Add persisted size column for snapshots (nullable for backwards compatibility)
ALTER TABLE "snapshots" ADD COLUMN IF NOT EXISTS "size" BIGINT;

-- Ensure size is populated on insert/update even for older app versions
CREATE OR REPLACE FUNCTION snapshots_set_size() RETURNS TRIGGER AS $$
BEGIN
  NEW."size" := COALESCE(NEW."size", octet_length(NEW."blob"));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshots_set_size_before_write ON "snapshots";
CREATE TRIGGER snapshots_set_size_before_write
BEFORE INSERT OR UPDATE OF "blob" ON "snapshots"
FOR EACH ROW
EXECUTE FUNCTION snapshots_set_size();

-- Backfill existing rows
UPDATE "snapshots"
SET "size" = octet_length("blob")
WHERE "size" IS NULL;

-- Support faster admin aggregates
CREATE INDEX IF NOT EXISTS "idx_wur_owner" ON "workspace_user_permissions" ("workspace_id")
WHERE "type" = 99 AND "status" = 'Accepted'::"WorkspaceMemberStatus";

CREATE INDEX IF NOT EXISTS "idx_wur_workspace" ON "workspace_user_permissions" ("workspace_id");

CREATE INDEX IF NOT EXISTS "idx_blobs_active" ON "blobs" ("workspace_id")
WHERE "deleted_at" IS NULL AND "status" = 'completed';

CREATE INDEX IF NOT EXISTS "idx_workspace_pages_public" ON "workspace_pages" ("workspace_id")
WHERE "public" = TRUE;

CREATE INDEX IF NOT EXISTS "idx_workspace_features_activated" ON "workspace_features" ("workspace_id")
WHERE "activated" = TRUE;
