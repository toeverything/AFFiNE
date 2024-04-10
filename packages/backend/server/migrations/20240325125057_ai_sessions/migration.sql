-- CreateTable
CREATE TABLE "ai_sessions" (
    "id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "prompt_name" VARCHAR NOT NULL,
    "action" BOOLEAN NOT NULL,
    "flavor" VARCHAR NOT NULL,
    "model" VARCHAR NOT NULL,
    "messages" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_doc_id_workspace_id_fkey" FOREIGN KEY ("doc_id", "workspace_id") REFERENCES "snapshots"("guid", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
