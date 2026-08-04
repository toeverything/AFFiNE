DELETE FROM "app_configs"
WHERE "id" IN (
  'copilot.providers.openai',
  'copilot.providers.cloudflareWorkersAi',
  'copilot.providers.fal',
  'copilot.providers.gemini',
  'copilot.providers.geminiVertex',
  'copilot.providers.anthropic',
  'copilot.providers.anthropicVertex',
  'copilot.providers.defaults'
);

DELETE FROM "ai_workspace_byok_configs";

DO $$
BEGIN
  IF to_regclass('public.runtime_states') IS NOT NULL THEN
    DELETE FROM "runtime_states"
    WHERE "purpose" IN (
      'copilot_byok_local_lease',
      'copilot_byok_local_lease:active'
    );
  END IF;
END $$;

ALTER TABLE "ai_workspace_byok_configs"
  DROP COLUMN "endpoint",
  DROP COLUMN "disabled_reason",
  DROP COLUMN "last_validated_at",
  DROP COLUMN "last_validation_error",
  ADD COLUMN "definition" JSONB NOT NULL,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "credential_generation" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "validation" JSONB;

ALTER TABLE "ai_sessions_metadata"
  DROP CONSTRAINT "ai_sessions_metadata_prompt_name_fkey",
  DROP COLUMN "tokenCost";

UPDATE "ai_action_runs"
SET "action_id" = 'transcript.audio'
WHERE "action_id" = 'transcript.audio.gemini';

UPDATE "ai_transcript_tasks"
SET
  "recipe_id" = 'transcript.audio',
  "input_snapshot" = "input_snapshot"::jsonb - 'providerMeta' - 'strategy',
  "public_meta" = "public_meta"::jsonb - 'providerMeta' - 'strategy',
  "protected_result" = "protected_result"::jsonb - 'providerMeta' - 'strategy'
WHERE "recipe_id" = 'transcript.audio.gemini';

ALTER TABLE "ai_transcript_tasks"
  DROP COLUMN "strategy";

DROP TABLE "ai_prompts_messages";
DROP TABLE "ai_prompts_metadata";

ALTER TYPE "AiPromptRole" RENAME TO "AiSessionMessageRole";
