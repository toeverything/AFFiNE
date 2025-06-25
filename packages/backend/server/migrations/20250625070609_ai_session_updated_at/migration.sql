-- AlterTable
ALTER TABLE "ai_sessions_metadata" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
