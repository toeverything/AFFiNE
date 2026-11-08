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

  PERFORM pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0));
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
