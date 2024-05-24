-- AlterTable
ALTER TABLE "ai_sessions_metadata" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "messageCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokenCost" INTEGER NOT NULL DEFAULT 0;
