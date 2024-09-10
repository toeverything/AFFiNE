-- CreateIndex
CREATE INDEX "ai_sessions_messages_session_id_idx" ON "ai_sessions_messages"("session_id");

-- CreateIndex
CREATE INDEX "ai_sessions_metadata_user_id_idx" ON "ai_sessions_metadata"("user_id");

-- CreateIndex
CREATE INDEX "ai_sessions_metadata_user_id_workspace_id_idx" ON "ai_sessions_metadata"("user_id", "workspace_id");
