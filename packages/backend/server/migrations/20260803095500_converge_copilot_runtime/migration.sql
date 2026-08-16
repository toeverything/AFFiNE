ALTER TABLE "ai_workspace_byok_configs"
  ADD COLUMN "definition" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "credential_generation" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "validation" JSONB;

ALTER TABLE "ai_sessions_metadata"
  DROP CONSTRAINT "ai_sessions_metadata_prompt_name_fkey";

ALTER TABLE "ai_transcript_tasks"
  ALTER COLUMN "strategy" SET DEFAULT '';

ALTER TABLE "ai_sessions_messages" ADD COLUMN "scope_snapshot" JSONB;
ALTER TABLE "ai_sessions_metadata" ADD COLUMN "focus" JSONB;

CREATE TABLE "workspace_artifacts" (
  "id" UUID NOT NULL,
  "workspace_id" VARCHAR NOT NULL,
  "content_hash" VARCHAR NOT NULL,
  "display_name" VARCHAR,
  "file_name" VARCHAR,
  "canonical_media_type" VARCHAR NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "storage_scope" VARCHAR NOT NULL,
  "storage_key" TEXT NOT NULL,
  "status" VARCHAR NOT NULL,
  "library_owned" BOOLEAN NOT NULL DEFAULT false,
  "reservation_expires_at" TIMESTAMPTZ(3),
  "ready_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_artifacts_library_display_name_check"
    CHECK (NOT "library_owned" OR NULLIF(BTRIM("display_name"), '') IS NOT NULL),
  CONSTRAINT "workspace_artifacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "workspace_artifacts_workspace_id_content_hash_key" ON "workspace_artifacts"("workspace_id", "content_hash");
CREATE UNIQUE INDEX "workspace_artifacts_workspace_id_id_key" ON "workspace_artifacts"("workspace_id", "id");
CREATE INDEX "workspace_artifacts_workspace_id_status_idx" ON "workspace_artifacts"("workspace_id", "status");
CREATE INDEX "workspace_artifacts_status_reservation_expires_at_idx" ON "workspace_artifacts"("status", "reservation_expires_at");

CREATE TABLE "ai_message_artifacts" (
  "message_id" VARCHAR NOT NULL,
  "workspace_id" VARCHAR NOT NULL,
  "artifact_id" UUID NOT NULL,
  "role" VARCHAR NOT NULL,
  "display_name" VARCHAR,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_message_artifacts_pkey" PRIMARY KEY ("message_id", "artifact_id", "role"),
  CONSTRAINT "ai_message_artifacts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_sessions_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_message_artifacts_workspace_id_artifact_id_fkey" FOREIGN KEY ("workspace_id", "artifact_id") REFERENCES "workspace_artifacts"("workspace_id", "id") ON DELETE CASCADE
);

CREATE INDEX "ai_message_artifacts_workspace_id_artifact_id_idx" ON "ai_message_artifacts"("workspace_id", "artifact_id");

-- After stable and beta no longer run binaries built with the 115-migration
-- schema, remove the old provider defaults, obsolete local-lease rows, ai_contexts,
-- ai_context_embeddings, and ai_workspace_embeddings in one cleanup migration.
