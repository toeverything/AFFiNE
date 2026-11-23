-- Add published_at to workspace_pages to track when a doc was shared
ALTER TABLE "workspace_pages"
ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ(3);

-- Backfill existing public docs using the snapshot updated_at
UPDATE "workspace_pages" wp
SET "published_at" = s."updated_at"
FROM "snapshots" s
WHERE wp."workspace_id" = s."workspace_id"
  AND wp."page_id" = s."guid"
  AND wp."public" = TRUE
  AND wp."published_at" IS NULL;
