CREATE TYPE "DocLifecycleState" AS ENUM ('trashed', 'deleted');
ALTER TABLE "workspace_pages"
  ADD COLUMN "lifecycle_state" "DocLifecycleState",
  ADD COLUMN "lifecycle_changed_at" TIMESTAMPTZ(3);
