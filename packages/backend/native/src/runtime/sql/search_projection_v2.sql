SET LOCAL lock_timeout = '5s';

DROP INDEX search_projection.document_states_pending_schedule;
CREATE INDEX document_states_pending_schedule
  ON search_projection.document_states (generation_id, available_at, workspace_id, doc_id)
  WHERE last_error IS DISTINCT FROM 'search_document_projection_failed'
    AND (target_source_version <> published_source_version
      OR target_source_exists <> published_source_exists
      OR target_permission_version <> published_permission_version);

CREATE OR REPLACE FUNCTION search_projection.capture_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_workspace TEXT := COALESCE(NEW.workspace_id, OLD.workspace_id);
  target_doc TEXT := COALESCE(NEW.guid, OLD.guid);
  target_version BIGINT;
  candidate RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
  target_version := nextval('search_projection.source_mutation_version');

  FOR candidate IN
    SELECT id, state FROM search_projection.generations
    WHERE state IN ('building', 'active')
  LOOP
    PERFORM search_projection.ensure_workspace_state(candidate.id, target_workspace);
    IF target_doc = target_workspace THEN
      UPDATE search_projection.workspace_states
      SET target_root_revision = GREATEST(target_root_revision, target_version),
          pending_scope = 'workspace', progress = NULL,
          claim_fence = nextval('search_projection.claim_fence'),
          lease_owner = NULL, lease_expires_at = NULL,
          last_error = NULL, available_at = now(), updated_at = now()
      WHERE generation_id = candidate.id AND workspace_id = target_workspace;
    ELSE
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
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION search_projection.capture_permission_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_workspace TEXT;
  new_workspace TEXT;
  old_doc TEXT;
  new_doc TEXT;
  target_scope TEXT;
  version BIGINT;
  candidate RECORD;
  target RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
  version := nextval('search_projection.permission_version');

  IF TG_TABLE_NAME = 'entitlements' THEN
    old_workspace := CASE WHEN TG_OP <> 'INSERT' AND OLD.target_type = 'workspace' THEN OLD.target_id END;
    new_workspace := CASE WHEN TG_OP <> 'DELETE' AND NEW.target_type = 'workspace' THEN NEW.target_id END;
    target_scope := 'capability';
  ELSIF TG_TABLE_NAME = 'workspace_members' THEN
    old_workspace := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    target_scope := 'membership';
  ELSIF TG_TABLE_NAME = 'workspace_access_policies' THEN
    old_workspace := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    target_scope := 'workspace_policy';
  ELSIF TG_TABLE_NAME = 'doc_access_policies' THEN
    old_workspace := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    old_doc := CASE WHEN TG_OP <> 'INSERT' THEN OLD.doc_id END;
    new_doc := CASE WHEN TG_OP <> 'DELETE' THEN NEW.doc_id END;
    target_scope := 'doc_policy';
  ELSIF TG_TABLE_NAME = 'doc_grants' THEN
    old_workspace := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    old_doc := CASE WHEN TG_OP <> 'INSERT' THEN OLD.doc_id END;
    new_doc := CASE WHEN TG_OP <> 'DELETE' THEN NEW.doc_id END;
    target_scope := 'doc_grant';
  END IF;

  FOR candidate IN
    SELECT id, state FROM search_projection.generations
    WHERE state IN ('building', 'active')
  LOOP
    FOR target IN
      SELECT DISTINCT mutation.workspace_id, mutation.doc_id
      FROM (VALUES (old_workspace, old_doc), (new_workspace, new_doc)) mutation(workspace_id, doc_id)
      WHERE mutation.workspace_id IS NOT NULL
    LOOP
      PERFORM search_projection.ensure_workspace_state(candidate.id, target.workspace_id);
      UPDATE search_projection.workspace_states
      SET required_permission_version = GREATEST(required_permission_version, version),
          pending_scope = CASE
            WHEN target_scope IN ('membership', 'capability') THEN 'permission'
            WHEN target_scope = 'workspace_policy' THEN 'workspace'
            ELSE pending_scope
          END,
          available_at = CASE WHEN last_error = 'search_workspace_reconcile_failed' THEN available_at ELSE now() END,
          updated_at = now()
      WHERE generation_id = candidate.id AND workspace_id = target.workspace_id;

      IF target_scope IN ('doc_policy', 'doc_grant') THEN
        UPDATE search_projection.document_states
        SET target_permission_version = GREATEST(target_permission_version, version),
            claim_fence = NULL, lease_owner = NULL, lease_expires_at = NULL,
            last_error = NULL, available_at = now(),
            updated_at = now()
        WHERE generation_id = candidate.id
          AND workspace_id = target.workspace_id
          AND doc_id = target.doc_id;
      END IF;
    END LOOP;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION search_projection.generation_build_complete(target_generation UUID)
RETURNS boolean LANGUAGE SQL STABLE AS $$
  SELECT COALESCE((
    SELECT scan_high_water_sid IS NOT NULL
       AND scan_cursor_sid IS NOT NULL
       AND scan_cursor_sid >= scan_high_water_sid
    FROM search_projection.generations
    WHERE id = target_generation
  ), false)
  AND NOT EXISTS (
    SELECT 1 FROM search_projection.workspace_states
    WHERE generation_id = target_generation
      AND last_error IS DISTINCT FROM 'search_workspace_reconcile_failed'
      AND (NOT covered OR pending_scope <> 'none'
        OR required_permission_version > applied_permission_version
        OR last_error IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM search_projection.document_states document
    WHERE document.generation_id = target_generation
      AND document.last_error IS DISTINCT FROM 'search_document_projection_failed'
      AND NOT EXISTS (
        SELECT 1 FROM search_projection.workspace_states workspace
        WHERE workspace.generation_id = document.generation_id
          AND workspace.workspace_id = document.workspace_id
          AND workspace.last_error = 'search_workspace_reconcile_failed'
      )
      AND (document.target_source_version <> document.published_source_version
        OR document.target_source_exists <> document.published_source_exists
        OR document.target_permission_version <> document.published_permission_version)
  )
$$;
