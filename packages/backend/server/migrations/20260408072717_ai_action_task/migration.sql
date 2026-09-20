-- CreateTable
CREATE TABLE "ai_action_runs" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR,
    "session_id" VARCHAR,
    "user_message_id" VARCHAR,
    "compat_submission_id" VARCHAR,
    "assistant_message_id" VARCHAR,
    "action_id" VARCHAR NOT NULL,
    "action_version" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "retry_of" VARCHAR,
    "input_snapshot" JSON,
    "result" JSON,
    "artifacts" JSON,
    "result_summary" TEXT,
    "error_code" VARCHAR,
    "trace" JSON,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_action_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_transcript_tasks" (
    "id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "blob_id" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL,
    "strategy" VARCHAR NOT NULL,
    "recipe_id" VARCHAR NOT NULL,
    "recipe_version" VARCHAR NOT NULL,
    "action_run_id" VARCHAR,
    "input_snapshot" JSON,
    "public_meta" JSON,
    "protected_result" JSON,
    "error_code" VARCHAR,
    "settled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_transcript_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_action_runs_user_id_workspace_id_idx" ON "ai_action_runs"("user_id", "workspace_id");

-- CreateIndex
CREATE INDEX "ai_action_runs_session_id_idx" ON "ai_action_runs"("session_id");

-- CreateIndex
CREATE INDEX "ai_action_runs_action_id_action_version_idx" ON "ai_action_runs"("action_id", "action_version");

-- CreateIndex
CREATE INDEX "ai_action_runs_status_idx" ON "ai_action_runs"("status");

-- CreateIndex
CREATE INDEX "ai_action_runs_retry_of_idx" ON "ai_action_runs"("retry_of");

-- CreateIndex
CREATE INDEX "ai_transcript_tasks_user_id_workspace_id_idx" ON "ai_transcript_tasks"("user_id", "workspace_id");

-- CreateIndex
CREATE INDEX "ai_transcript_tasks_workspace_id_blob_id_idx" ON "ai_transcript_tasks"("workspace_id", "blob_id");

-- CreateIndex
CREATE INDEX "ai_transcript_tasks_status_idx" ON "ai_transcript_tasks"("status");

-- CreateIndex
CREATE INDEX "ai_transcript_tasks_action_run_id_idx" ON "ai_transcript_tasks"("action_run_id");

-- AddForeignKey
ALTER TABLE "ai_action_runs" ADD CONSTRAINT "ai_action_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_sessions_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;
