SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS workspaces_initialize_permission_revision ON workspaces;
DROP TRIGGER IF EXISTS workspace_members_permission_revision_mutation ON workspace_members;
DROP TRIGGER IF EXISTS workspace_members_permission_revision_update ON workspace_members;
DROP TRIGGER IF EXISTS workspace_access_policies_permission_revision_mutation ON workspace_access_policies;
DROP TRIGGER IF EXISTS workspace_access_policies_permission_revision_update ON workspace_access_policies;
DROP TRIGGER IF EXISTS doc_access_policies_permission_revision_mutation ON doc_access_policies;
DROP TRIGGER IF EXISTS doc_access_policies_permission_revision_update ON doc_access_policies;
DROP TRIGGER IF EXISTS doc_grants_permission_revision_mutation ON doc_grants;
DROP TRIGGER IF EXISTS doc_grants_permission_revision_update ON doc_grants;
DROP TRIGGER IF EXISTS entitlements_permission_revision_mutation ON entitlements;
DROP TRIGGER IF EXISTS entitlements_permission_revision_update ON entitlements;
DROP TRIGGER IF EXISTS search_projection_workspace_delete_capture ON workspaces;

DROP FUNCTION IF EXISTS initialize_workspace_permission_revision();
DROP FUNCTION IF EXISTS bump_workspace_permission_revision();
DROP FUNCTION IF EXISTS record_workspace_permission_change(VARCHAR, VARCHAR, TEXT);

DROP TABLE IF EXISTS search_runtime_permission_cursors;
DROP TABLE IF EXISTS search_runtime_provider_cursors;
DROP TABLE IF EXISTS search_runtime_checkpoints;
DROP TABLE IF EXISTS search_runtime_changes;
DROP TABLE IF EXISTS search_runtime_projections;
DROP TABLE IF EXISTS search_runtime_streams;
DROP TABLE IF EXISTS search_runtime_generations;
DROP TABLE IF EXISTS search_runtime_acl_tokens;
DROP TABLE IF EXISTS workspace_permission_changes;
DROP TABLE IF EXISTS workspace_permission_revisions;

DROP SCHEMA IF EXISTS search_projection CASCADE;
CREATE SCHEMA search_projection;

CREATE SEQUENCE IF NOT EXISTS search_projection.source_mutation_version;
CREATE SEQUENCE IF NOT EXISTS search_projection.permission_version;
CREATE SEQUENCE IF NOT EXISTS search_projection.claim_fence;

CREATE TABLE search_projection.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('embedded', 'elasticsearch', 'manticoresearch')),
  state TEXT NOT NULL CHECK (state IN ('building', 'active', 'draining', 'failed')),
  config_hash BYTEA NOT NULL CHECK (octet_length(config_hash) = 32),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  manifest JSONB NOT NULL DEFAULT '{}',
  scan_high_water_sid INTEGER,
  scan_cursor_sid INTEGER,
  gc_table TEXT NOT NULL DEFAULT 'doc' CHECK (gc_table IN ('doc', 'block')),
  gc_cursor TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  drained_at TIMESTAMPTZ,
  CHECK (scan_cursor_sid IS NULL OR scan_high_water_sid IS NULL OR scan_cursor_sid <= scan_high_water_sid)
);

CREATE UNIQUE INDEX generations_one_active
  ON search_projection.generations ((state)) WHERE state = 'active';
CREATE UNIQUE INDEX generations_one_candidate
  ON search_projection.generations ((1)) WHERE state = 'building';

CREATE TABLE search_projection.workspace_states (
  generation_id UUID NOT NULL REFERENCES search_projection.generations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  covered BOOLEAN NOT NULL DEFAULT false,
  target_root_revision BIGINT NOT NULL DEFAULT 0,
  applied_root_revision BIGINT NOT NULL DEFAULT 0,
  required_permission_version BIGINT NOT NULL DEFAULT 0,
  applied_permission_version BIGINT NOT NULL DEFAULT 0,
  pending_scope TEXT NOT NULL DEFAULT 'workspace' CHECK (pending_scope IN ('none', 'permission', 'workspace')),
  progress JSONB,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claim_fence BIGINT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_id, workspace_id),
  CHECK (applied_root_revision <= target_root_revision),
  CHECK (applied_permission_version <= required_permission_version),
  CHECK (claim_fence IS NULL OR claim_fence > 0)
);

-- Keep pending work and time-based anti-entropy in one bounded schedule index;
-- PostgreSQL partial predicates cannot depend on now().
CREATE INDEX workspace_states_schedule
  ON search_projection.workspace_states (generation_id, available_at, workspace_id);

CREATE TABLE search_projection.document_states (
  generation_id UUID NOT NULL REFERENCES search_projection.generations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  target_source_version BIGINT NOT NULL,
  target_source_exists BOOLEAN NOT NULL,
  target_permission_version BIGINT NOT NULL DEFAULT 0,
  published_source_version BIGINT NOT NULL DEFAULT 0,
  published_source_exists BOOLEAN NOT NULL DEFAULT false,
  published_permission_version BIGINT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claim_fence BIGINT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_id, workspace_id, doc_id),
  FOREIGN KEY (generation_id, workspace_id)
    REFERENCES search_projection.workspace_states(generation_id, workspace_id) ON DELETE CASCADE,
  CHECK (target_source_version >= 0),
  CHECK (published_source_version >= 0 AND published_source_version <= target_source_version),
  CHECK (published_permission_version >= 0 AND published_permission_version <= target_permission_version),
  CHECK (NOT target_source_exists OR target_source_version > 0),
  CHECK (NOT published_source_exists OR published_source_version > 0),
  CHECK (claim_fence IS NULL OR claim_fence > 0)
);

CREATE INDEX document_states_pending_schedule
  ON search_projection.document_states (generation_id, available_at, workspace_id, doc_id)
  WHERE target_source_version <> published_source_version
     OR target_source_exists <> published_source_exists
     OR target_permission_version <> published_permission_version;

CREATE OR REPLACE FUNCTION search_projection.ensure_workspace_state(target_generation UUID, target_workspace TEXT)
RETURNS void LANGUAGE SQL AS $$
  INSERT INTO search_projection.workspace_states(generation_id, workspace_id)
  VALUES (target_generation, target_workspace)
  ON CONFLICT (generation_id, workspace_id) DO NOTHING
$$;

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
      SET progress = NULL, claim_fence = nextval('search_projection.claim_fence'),
          lease_owner = NULL, lease_expires_at = NULL,
          last_error = NULL, available_at = now(), updated_at = now()
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
          target_source_exists = EXCLUDED.target_source_exists,
          target_permission_version = GREATEST(search_projection.document_states.target_permission_version, EXCLUDED.target_permission_version),
          published_source_exists = CASE WHEN EXCLUDED.target_source_exists THEN search_projection.document_states.published_source_exists ELSE false END,
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
          last_error = NULL, available_at = now(), updated_at = now()
      WHERE generation_id = candidate.id AND workspace_id = target.workspace_id;

      IF target_scope IN ('doc_policy', 'doc_grant') THEN
        UPDATE search_projection.document_states
        SET target_permission_version = GREATEST(target_permission_version, version),
            claim_fence = NULL, lease_owner = NULL, lease_expires_at = NULL,
          last_error = NULL, available_at = now(), updated_at = now()
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

CREATE OR REPLACE FUNCTION search_projection.capture_workspace_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION search_projection.guard_generation_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'active' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM NEW.state) THEN
    IF TG_OP = 'INSERT' OR OLD.state <> 'building'
      OR NOT search_projection.generation_build_complete(NEW.id) THEN
      RAISE EXCEPTION 'search generation is not ready for activation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER search_projection_generation_state_guard
BEFORE INSERT OR UPDATE ON search_projection.generations
FOR EACH ROW EXECUTE FUNCTION search_projection.guard_generation_state_transition();

CREATE TRIGGER search_projection_snapshot_capture
AFTER INSERT OR UPDATE OR DELETE ON snapshots
FOR EACH ROW EXECUTE FUNCTION search_projection.capture_snapshot_mutation();

CREATE TRIGGER search_projection_workspace_delete_capture
AFTER DELETE ON workspaces
FOR EACH ROW EXECUTE FUNCTION search_projection.capture_workspace_delete();

CREATE TRIGGER search_projection_membership_capture
AFTER INSERT OR UPDATE OR DELETE ON workspace_members
FOR EACH ROW EXECUTE FUNCTION search_projection.capture_permission_mutation();
CREATE TRIGGER search_projection_workspace_policy_capture
AFTER INSERT OR UPDATE OR DELETE ON workspace_access_policies
FOR EACH ROW EXECUTE FUNCTION search_projection.capture_permission_mutation();
CREATE TRIGGER search_projection_doc_policy_capture
AFTER INSERT OR UPDATE OR DELETE ON doc_access_policies
FOR EACH ROW EXECUTE FUNCTION search_projection.capture_permission_mutation();
CREATE TRIGGER search_projection_doc_grant_capture
AFTER INSERT OR UPDATE OR DELETE ON doc_grants
FOR EACH ROW EXECUTE FUNCTION search_projection.capture_permission_mutation();
CREATE TRIGGER search_projection_entitlement_capture
AFTER INSERT OR UPDATE OR DELETE ON entitlements
FOR EACH ROW EXECUTE FUNCTION search_projection.capture_permission_mutation();
