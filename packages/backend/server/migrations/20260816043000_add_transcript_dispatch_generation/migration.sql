-- Nullable so the previous release can keep inserting transcript tasks while
-- both releases share the database.
ALTER TABLE "ai_transcript_tasks"
  ADD COLUMN "dispatch_generation" VARCHAR;
