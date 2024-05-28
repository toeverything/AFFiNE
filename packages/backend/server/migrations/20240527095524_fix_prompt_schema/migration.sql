/*
  Warnings:

  - Made the column `model` on table `ai_prompts_metadata` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ai_prompts_metadata" ALTER COLUMN "model" SET NOT NULL;
