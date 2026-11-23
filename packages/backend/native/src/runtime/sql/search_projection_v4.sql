CREATE OR REPLACE FUNCTION search_projection.capture_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_workspace TEXT := COALESCE(NEW.workspace_id, OLD.workspace_id);
  target_doc TEXT := COALESCE(NEW.guid, OLD.guid);
  target_version BIGINT;
  candidate RECORD;
BEGIN
  IF target_doc = target_workspace THEN RETURN COALESCE(NEW, OLD); END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
  target_version := nextval('search_projection.source_mutation_version');

  FOR candidate IN
    SELECT id, state FROM search_projection.generations
    WHERE state IN ('building', 'active')
  LOOP
    PERFORM search_projection.ensure_workspace_state(candidate.id, target_workspace);
      UPDATE search_projection.workspace_states
      SET progress = CASE WHEN last_error = 'search_workspace_reconcile_failed' THEN progress ELSE NULL END,
          claim_fence = CASE WHEN last_error = 'search_workspace_reconcile_failed'
            THEN claim_fence ELSE nextval('search_projection.claim_fence') END,
          lease_owner = CASE WHEN last_error = 'search_workspace_reconcile_failed' THEN lease_owner ELSE NULL END,
          lease_expires_at = CASE WHEN last_error = 'search_workspace_reconcile_failed'
            THEN lease_expires_at ELSE NULL END,
          available_at = CASE WHEN last_error = 'search_workspace_reconcile_failed' THEN available_at ELSE now() END,
          updated_at = now()
      WHERE generation_id = candidate.id AND workspace_id = target_workspace;
      INSERT INTO search_projection.document_states(
        generation_id, workspace_id, doc_id, target_source_version,
        target_source_exists, target_permission_version
      )
      SELECT candidate.id, target_workspace, target_doc, target_version, TG_OP <> 'DELETE',
             state.required_permission_version
      FROM search_projection.workspace_states state
      WHERE state.generation_id = candidate.id AND state.workspace_id = target_workspace
      ON CONFLICT (generation_id, workspace_id, doc_id) DO UPDATE
      SET target_source_version = EXCLUDED.target_source_version,
          target_source_exists = CASE
            WHEN TG_OP = 'DELETE' THEN false
            ELSE search_projection.document_states.target_source_exists END,
          target_permission_version = GREATEST(search_projection.document_states.target_permission_version, EXCLUDED.target_permission_version),
          published_source_exists = CASE
            WHEN TG_OP = 'DELETE' THEN false
            ELSE search_projection.document_states.published_source_exists END,
          claim_fence = NULL, lease_owner = NULL, lease_expires_at = NULL,
          last_error = NULL, available_at = now(), updated_at = now();
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

UPDATE search_projection.workspace_states
SET target_root_revision = nextval('search_projection.source_mutation_version'),
    pending_scope = 'workspace', progress = NULL,
    claim_fence = nextval('search_projection.claim_fence'),
    lease_owner = NULL, lease_expires_at = NULL, last_error = NULL,
    available_at = now(), updated_at = now();
