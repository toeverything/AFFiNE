-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('pending', 'running', 'finished', 'claimed', 'failed');

-- CreateEnum
CREATE TYPE "AiJobType" AS ENUM ('transcription');

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "blob_id" VARCHAR NOT NULL,
    "created_by" VARCHAR,
    "type" "AiJobType" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'pending',
    "payload" JSON NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_jobs_created_by_workspace_id_blob_id_idx" ON "ai_jobs"("created_by", "workspace_id", "blob_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_jobs_workspace_id_blob_id_key" ON "ai_jobs"("workspace_id", "blob_id");

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
