-- AlterTable
ALTER TABLE "ai_prompts_metadata" ADD COLUMN     "optional_models" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[];
