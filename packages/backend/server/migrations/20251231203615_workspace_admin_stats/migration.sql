-- Pre-aggregated admin workspace stats tables
CREATE TABLE IF NOT EXISTS "workspace_admin_stats" (
  "workspace_id" VARCHAR NOT NULL,
  "snapshot_count" BIGINT NOT NULL DEFAULT 0,
  "snapshot_size" BIGINT NOT NULL DEFAULT 0,
  "blob_count" BIGINT NOT NULL DEFAULT 0,
  "blob_size" BIGINT NOT NULL DEFAULT 0,
  "member_count" BIGINT NOT NULL DEFAULT 0,
  "public_page_count" BIGINT NOT NULL DEFAULT 0,
  "features" TEXT[] NOT NULL DEFAULT '{}'::text[],
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_admin_stats_pkey" PRIMARY KEY ("workspace_id"),
  CONSTRAINT "workspace_admin_stats_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "workspace_admin_stats_dirty" (
  "workspace_id" VARCHAR NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_admin_stats_dirty_pkey" PRIMARY KEY ("workspace_id"),
  CONSTRAINT "workspace_admin_stats_dirty_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Sorting indexes for admin queries
CREATE INDEX IF NOT EXISTS "workspace_admin_stats_snapshot_size_idx" ON "workspace_admin_stats" ("snapshot_size" DESC);
CREATE INDEX IF NOT EXISTS "workspace_admin_stats_blob_count_idx" ON "workspace_admin_stats" ("blob_count" DESC);
CREATE INDEX IF NOT EXISTS "workspace_admin_stats_blob_size_idx" ON "workspace_admin_stats" ("blob_size" DESC);
CREATE INDEX IF NOT EXISTS "workspace_admin_stats_snapshot_count_idx" ON "workspace_admin_stats" ("snapshot_count" DESC);
CREATE INDEX IF NOT EXISTS "workspace_admin_stats_member_count_idx" ON "workspace_admin_stats" ("member_count" DESC);
CREATE INDEX IF NOT EXISTS "workspace_admin_stats_public_page_count_idx" ON "workspace_admin_stats" ("public_page_count" DESC);
CREATE INDEX IF NOT EXISTS "workspace_admin_stats_dirty_updated_at_idx" ON "workspace_admin_stats_dirty" ("updated_at");

-- Feature filtering index
CREATE INDEX IF NOT EXISTS "workspace_features_workspace_id_name_activated_idx" ON "workspace_features" ("workspace_id", "name", "activated");

-- Dirty marker trigger
CREATE OR REPLACE FUNCTION workspace_admin_stats_mark_dirty() RETURNS TRIGGER AS $$
DECLARE
  wid VARCHAR;
BEGIN
  wid := COALESCE(NEW."workspace_id", OLD."workspace_id");
  IF wid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Skip if workspace does not exist to avoid FK errors on orphaned records
  IF NOT EXISTS (SELECT 1 FROM "workspaces" WHERE "id" = wid) THEN
    RETURN NULL;
  END IF;

  INSERT INTO "workspace_admin_stats_dirty" ("workspace_id", "updated_at")
  VALUES (wid, NOW())
  ON CONFLICT ("workspace_id")
  DO UPDATE SET "updated_at" = EXCLUDED."updated_at";

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "workspace_admin_stats_dirty_snapshots" ON "snapshots";
CREATE TRIGGER "workspace_admin_stats_dirty_snapshots"
AFTER INSERT OR UPDATE OR DELETE ON "snapshots"
FOR EACH ROW EXECUTE FUNCTION workspace_admin_stats_mark_dirty();

DROP TRIGGER IF EXISTS "workspace_admin_stats_dirty_blobs" ON "blobs";
CREATE TRIGGER "workspace_admin_stats_dirty_blobs"
AFTER INSERT OR UPDATE OR DELETE ON "blobs"
FOR EACH ROW EXECUTE FUNCTION workspace_admin_stats_mark_dirty();

DROP TRIGGER IF EXISTS "workspace_admin_stats_dirty_wup" ON "workspace_user_permissions";
CREATE TRIGGER "workspace_admin_stats_dirty_wup"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_user_permissions"
FOR EACH ROW EXECUTE FUNCTION workspace_admin_stats_mark_dirty();

DROP TRIGGER IF EXISTS "workspace_admin_stats_dirty_pages" ON "workspace_pages";
CREATE TRIGGER "workspace_admin_stats_dirty_pages"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_pages"
FOR EACH ROW EXECUTE FUNCTION workspace_admin_stats_mark_dirty();

DROP TRIGGER IF EXISTS "workspace_admin_stats_dirty_features" ON "workspace_features";
CREATE TRIGGER "workspace_admin_stats_dirty_features"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_features"
FOR EACH ROW EXECUTE FUNCTION workspace_admin_stats_mark_dirty();

-- Mark existing workspaces dirty for initial backfill
INSERT INTO "workspace_admin_stats_dirty" ("workspace_id", "updated_at")
SELECT id, NOW() FROM "workspaces"
ON CONFLICT ("workspace_id") DO NOTHING;

-- DropIndex
DROP INDEX "idx_wur_workspace";