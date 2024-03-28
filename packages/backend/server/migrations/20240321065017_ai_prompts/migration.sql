-- CreateEnum
CREATE TYPE "AiPromptRole" AS ENUM ('system', 'assistant', 'user');

-- CreateTable
CREATE TABLE "ai_prompts" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "idx" INTEGER NOT NULL,
    "role" "AiPromptRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompts_name_idx_key" ON "ai_prompts"("name", "idx");