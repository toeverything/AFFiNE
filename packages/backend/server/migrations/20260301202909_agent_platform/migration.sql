-- CreateTable
CREATE TABLE "agent_runs" (
    "run_id" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'created',
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "fingerprint" VARCHAR NOT NULL,
    "repo_id" VARCHAR,
    "repo_local_path" VARCHAR,
    "repo_remote_url" VARCHAR,
    "repo_default_branch" VARCHAR DEFAULT 'main',
    "claude_session_id" VARCHAR,
    "branch_name" VARCHAR,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "agent_proposals" (
    "proposal_id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "ambiguities" JSON NOT NULL DEFAULT '[]',
    "plan" JSON,
    "brief_edits" JSON NOT NULL DEFAULT '[]',
    "repo_patches" JSON NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_proposals_pkey" PRIMARY KEY ("proposal_id")
);

-- CreateTable
CREATE TABLE "agent_approvals" (
    "approval_id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "proposal_id" VARCHAR NOT NULL,
    "actor" VARCHAR NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_approvals_pkey" PRIMARY KEY ("approval_id")
);

-- CreateTable
CREATE TABLE "agent_audit_events" (
    "id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "type" VARCHAR NOT NULL,
    "payload" JSON NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_step_results" (
    "id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "step" VARCHAR NOT NULL,
    "result" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_step_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_workspace_repos" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "github_repo_id" INTEGER NOT NULL,
    "full_name" VARCHAR NOT NULL,
    "default_branch" VARCHAR NOT NULL DEFAULT 'main',
    "local_path" VARCHAR NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "connected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connected_by" VARCHAR NOT NULL,

    CONSTRAINT "agent_workspace_repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_workspace_rules" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "doc_title" VARCHAR,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_workspace_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_chat_sessions" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "claude_session_id" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_chat_messages" (
    "id" VARCHAR NOT NULL,
    "session_id" VARCHAR NOT NULL,
    "role" VARCHAR NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_workspace_id_doc_id_idx" ON "agent_runs"("workspace_id", "doc_id");

-- CreateIndex
CREATE INDEX "agent_proposals_run_id_idx" ON "agent_proposals"("run_id");

-- CreateIndex
CREATE INDEX "agent_approvals_run_id_idx" ON "agent_approvals"("run_id");

-- CreateIndex
CREATE INDEX "agent_audit_events_run_id_idx" ON "agent_audit_events"("run_id");

-- CreateIndex
CREATE INDEX "agent_step_results_run_id_idx" ON "agent_step_results"("run_id");

-- CreateIndex
CREATE INDEX "agent_workspace_repos_workspace_id_idx" ON "agent_workspace_repos"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_workspace_repos_workspace_id_github_repo_id_key" ON "agent_workspace_repos"("workspace_id", "github_repo_id");

-- CreateIndex
CREATE INDEX "agent_workspace_rules_workspace_id_idx" ON "agent_workspace_rules"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_workspace_rules_workspace_id_doc_id_key" ON "agent_workspace_rules"("workspace_id", "doc_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_chat_sessions_workspace_id_doc_id_key" ON "agent_chat_sessions"("workspace_id", "doc_id");

-- CreateIndex
CREATE INDEX "agent_chat_messages_session_id_idx" ON "agent_chat_messages"("session_id");

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "agent_proposals"("proposal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_step_results" ADD CONSTRAINT "agent_step_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
