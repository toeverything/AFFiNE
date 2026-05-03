-- AlterTable
ALTER TABLE "ai_sessions_messages" ADD COLUMN     "compat_submission_id" VARCHAR;

-- CreateIndex
CREATE INDEX "ai_sessions_messages_session_id_compat_submission_id_idx" ON "ai_sessions_messages"("session_id", "compat_submission_id");
