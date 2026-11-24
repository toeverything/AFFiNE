CREATE OR REPLACE FUNCTION search_projection.lockless_v2_active()
RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM storage_reconciliation_checkpoints
    WHERE kind = 'search_projection_lockless_v2'
      AND scope = 'global'
      AND status = 'active'
      AND (metadata->>'lease_expires_at')::timestamptz > clock_timestamp()
  )
$$;

CREATE OR REPLACE FUNCTION search_projection.acquire_workspace_write_lock(target_workspace TEXT)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  rem INTERVAL;
  rem2 INTERVAL;
BEGIN
  SELECT (metadata->>'lease_expires_at')::timestamptz - clock_timestamp()
  INTO rem
  FROM storage_reconciliation_checkpoints
  WHERE kind = 'search_projection_lockless_v2'
    AND scope = 'global'
    AND status = 'active';

  IF rem IS NOT NULL AND rem > interval '30 seconds' THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || target_workspace, 0));
    SELECT (metadata->>'lease_expires_at')::timestamptz - clock_timestamp()
    INTO rem2
    FROM storage_reconciliation_checkpoints
    WHERE kind = 'search_projection_lockless_v2'
      AND scope = 'global'
      AND status = 'active';
    IF rem2 IS NULL OR rem2 <= interval '30 seconds' THEN
      PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
    END IF;
  ELSIF rem IS NOT NULL AND rem > interval '0 seconds' THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || target_workspace, 0));
  ELSE
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
    SELECT (metadata->>'lease_expires_at')::timestamptz - clock_timestamp()
    INTO rem2
    FROM storage_reconciliation_checkpoints
    WHERE kind = 'search_projection_lockless_v2'
      AND scope = 'global'
      AND status = 'active';
    IF rem2 IS NOT NULL AND rem2 > interval '0 seconds' THEN
      PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || target_workspace, 0));
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION search_projection.acquire_dual_workspace_write_locks(ws_a TEXT, ws_b TEXT)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  rem INTERVAL;
  rem2 INTERVAL;
  first_ws TEXT;
  second_ws TEXT;
BEGIN
  IF ws_a IS NULL AND ws_b IS NULL THEN
    RETURN;
  END IF;
  IF ws_a IS NULL OR ws_b IS NULL OR ws_a = ws_b THEN
    PERFORM search_projection.acquire_workspace_write_lock(COALESCE(ws_b, ws_a));
    RETURN;
  END IF;

  first_ws := LEAST(ws_a, ws_b);
  second_ws := GREATEST(ws_a, ws_b);

  SELECT (metadata->>'lease_expires_at')::timestamptz - clock_timestamp()
  INTO rem
  FROM storage_reconciliation_checkpoints
  WHERE kind = 'search_projection_lockless_v2'
    AND scope = 'global'
    AND status = 'active';

  IF rem IS NOT NULL AND rem > interval '30 seconds' THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || first_ws, 0));
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || second_ws, 0));
    SELECT (metadata->>'lease_expires_at')::timestamptz - clock_timestamp()
    INTO rem2
    FROM storage_reconciliation_checkpoints
    WHERE kind = 'search_projection_lockless_v2'
      AND scope = 'global'
      AND status = 'active';
    IF rem2 IS NULL OR rem2 <= interval '30 seconds' THEN
      PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
    END IF;
  ELSIF rem IS NOT NULL AND rem > interval '0 seconds' THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || first_ws, 0));
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || second_ws, 0));
  ELSE
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
    SELECT (metadata->>'lease_expires_at')::timestamptz - clock_timestamp()
    INTO rem2
    FROM storage_reconciliation_checkpoints
    WHERE kind = 'search_projection_lockless_v2'
      AND scope = 'global'
      AND status = 'active';
    IF rem2 IS NOT NULL AND rem2 > interval '0 seconds' THEN
      PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || first_ws, 0));
      PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-ws:' || second_ws, 0));
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION search_projection.capture_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_workspace TEXT := COALESCE(NEW.workspace_id, OLD.workspace_id);
  target_doc TEXT := COALESCE(NEW.guid, OLD.guid);
  target_version BIGINT;
  candidate RECORD;
BEGIN
  IF target_doc = target_workspace THEN
    IF EXISTS (
      SELECT 1 FROM storage_reconciliation_checkpoints
      WHERE kind = 'workspace_doc_lifecycle_activation'
        AND scope = 'global'
        AND status = 'active'
    ) THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    PERFORM search_projection.acquire_workspace_write_lock(target_workspace);
    target_version := nextval('search_projection.source_mutation_version');
    FOR candidate IN
      SELECT id FROM search_projection.generations WHERE state IN ('building', 'active')
    LOOP
      PERFORM search_projection.ensure_workspace_state(candidate.id, target_workspace);
      UPDATE search_projection.workspace_states
      SET target_root_revision = target_version,
          pending_scope = 'workspace',
          progress = NULL,
          claim_fence = nextval('search_projection.claim_fence'),
          lease_owner = NULL,
          lease_expires_at = NULL,
          last_error = NULL,
          available_at = now(),
          updated_at = now()
      WHERE generation_id = candidate.id AND workspace_id = target_workspace;
    END LOOP;
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM search_projection.acquire_workspace_write_lock(target_workspace);
  target_version := nextval('search_projection.source_mutation_version');

  FOR candidate IN
    SELECT id, state FROM search_projection.generations
    WHERE state IN ('building', 'active')
  LOOP
    PERFORM search_projection.ensure_workspace_state(candidate.id, target_workspace);
    UPDATE search_projection.workspace_states
    SET progress = NULL,
        claim_fence = nextval('search_projection.claim_fence'),
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        available_at = now(),
        updated_at = now()
    WHERE generation_id = candidate.id
      AND workspace_id = target_workspace
      AND last_error IS DISTINCT FROM 'search_workspace_reconcile_failed'
      AND (
        NOT covered
        OR progress IS NOT NULL
        OR lease_owner IS NOT NULL
        OR last_error IS NOT NULL
      );
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
        target_permission_version = GREATEST(
          search_projection.document_states.target_permission_version,
          EXCLUDED.target_permission_version
        ),
        published_source_exists = CASE
          WHEN TG_OP = 'DELETE' THEN false
          ELSE search_projection.document_states.published_source_exists END,
        claim_fence = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        available_at = now(),
        updated_at = now();
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

  IF old_workspace IS NULL AND new_workspace IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM search_projection.acquire_dual_workspace_write_locks(old_workspace, new_workspace);

  version := nextval('search_projection.permission_version');

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
            claim_fence = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error = NULL,
            available_at = now(),
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

CREATE OR REPLACE FUNCTION search_projection.capture_workspace_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM search_projection.acquire_workspace_write_lock(OLD.id);

  UPDATE search_projection.workspace_states
  SET covered = false,
      pending_scope = 'workspace',
      progress = jsonb_build_object(
        'version', 1,
        'captured_root_revision', target_root_revision,
        'captured_permission_version', required_permission_version,
        'kind', 'deleted',
        'table', 'doc',
        'quiet', false
      ),
      claim_fence = nextval('search_projection.claim_fence'),
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      available_at = now(),
      updated_at = now()
  WHERE workspace_id = OLD.id;
  RETURN OLD;
END;
$$;
