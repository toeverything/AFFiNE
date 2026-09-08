-- This migration is intentionally fail-closed. The data migration with the
-- same release must have admitted every live legacy context blob through the
-- artifact runtime before these product-owned tables are removed.
DO $$
BEGIN
  IF to_regclass('public.ai_contexts') IS NOT NULL AND EXISTS (
    WITH referenced_blobs AS (
      SELECT DISTINCT
        session.workspace_id,
        value #>> '{}' AS blob_key
      FROM ai_contexts context
      JOIN ai_sessions_metadata session ON session.id = context.session_id
      CROSS JOIN LATERAL jsonb_path_query(
        context.config::jsonb,
        '$.** ? (@.type() == "string")'
      ) AS referenced_value(value)
    )
    SELECT 1
    FROM referenced_blobs referenced
    JOIN blobs blob
      ON blob.workspace_id = referenced.workspace_id
     AND blob.key = referenced.blob_key
     AND blob.deleted_at IS NULL
     AND blob.status = 'completed'
    WHERE NOT EXISTS (
      SELECT 1
      FROM workspace_artifacts artifact
      WHERE artifact.workspace_id = referenced.workspace_id
        AND artifact.status = 'ready'
        AND artifact.storage_scope = 'blob'
        AND artifact.storage_key = concat(referenced.workspace_id, '/', blob.key)
    )
  ) THEN
    RAISE EXCEPTION
      'legacy context blob artifact admission is incomplete; run the data migration before cleanup';
  END IF;
END $$;

DELETE FROM app_configs WHERE id = 'copilot.providers.defaults';

ALTER TABLE ai_workspace_byok_configs
  ALTER COLUMN definition DROP DEFAULT,
  DROP COLUMN IF EXISTS endpoint,
  DROP COLUMN IF EXISTS disabled_reason,
  DROP COLUMN IF EXISTS last_validated_at,
  DROP COLUMN IF EXISTS last_validation_error;

DELETE FROM ai_workspace_byok_configs WHERE definition = '{}'::jsonb;

DROP TABLE IF EXISTS ai_context_embeddings;
DROP TABLE IF EXISTS ai_workspace_embeddings;
DROP TABLE IF EXISTS ai_contexts;
