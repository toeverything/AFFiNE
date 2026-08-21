CREATE TABLE search_runtime_streams (
  table_key TEXT PRIMARY KEY CHECK (table_key IN ('doc', 'block')),
  head BIGINT NOT NULL DEFAULT 0 CHECK (head >= 0),
  retained_from BIGINT NOT NULL DEFAULT 0 CHECK (retained_from >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (retained_from <= head)
);

INSERT INTO search_runtime_streams(table_key)
VALUES ('doc'), ('block')
ON CONFLICT DO NOTHING;

CREATE TABLE search_runtime_projections (
  table_key TEXT NOT NULL CHECK (table_key IN ('doc', 'block')),
  external_id TEXT NOT NULL,
  workspace_id VARCHAR NOT NULL,
  doc_id VARCHAR NOT NULL,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  payload JSONB NOT NULL,
  acl_public_readable BOOLEAN NOT NULL DEFAULT false,
  acl_member_default_readable BOOLEAN NOT NULL DEFAULT false,
  acl_read_user_ids TEXT[] NOT NULL DEFAULT '{}',
  acl_revision BIGINT NOT NULL DEFAULT 0 CHECK (acl_revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_key, external_id)
);

CREATE INDEX search_runtime_projections_workspace_doc
  ON search_runtime_projections(workspace_id, doc_id, table_key);

CREATE TABLE search_runtime_changes (
  table_key TEXT NOT NULL CHECK (table_key IN ('doc', 'block')),
  stream_sequence BIGINT NOT NULL CHECK (stream_sequence > 0),
  external_id TEXT NOT NULL,
  workspace_id VARCHAR NOT NULL,
  doc_id VARCHAR,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete', 'invalidate')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_key, stream_sequence)
);

CREATE INDEX search_runtime_changes_workspace
  ON search_runtime_changes(workspace_id, table_key, stream_sequence);

CREATE TABLE search_runtime_generations (
  generation_id UUID PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('embedded', 'elasticsearch', 'manticoresearch')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'active', 'draining', 'failed')),
  config_fingerprint TEXT NOT NULL,
  schema_fingerprint TEXT NOT NULL,
  manifest JSONB NOT NULL DEFAULT '{}',
  applied_permission_revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);

CREATE INDEX search_runtime_generations_fingerprint
  ON search_runtime_generations(provider, config_fingerprint, schema_fingerprint);

CREATE UNIQUE INDEX search_runtime_single_active_generation
  ON search_runtime_generations ((state)) WHERE state = 'active';
CREATE UNIQUE INDEX search_runtime_single_pending_generation
  ON search_runtime_generations ((state)) WHERE state = 'pending';

CREATE TABLE search_runtime_provider_cursors (
  generation_id UUID NOT NULL REFERENCES search_runtime_generations(generation_id) ON DELETE CASCADE,
  table_key TEXT NOT NULL CHECK (table_key IN ('doc', 'block')),
  source_cursor BIGINT NOT NULL DEFAULT 0 CHECK (source_cursor >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_id, table_key)
);

CREATE TABLE search_runtime_permission_cursors (
  generation_id UUID NOT NULL REFERENCES search_runtime_generations(generation_id) ON DELETE CASCADE,
  workspace_id VARCHAR NOT NULL,
  permission_revision BIGINT NOT NULL DEFAULT 0 CHECK (permission_revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_id, workspace_id)
);

CREATE TABLE search_runtime_checkpoints (
  table_key TEXT PRIMARY KEY CHECK (table_key IN ('doc', 'block')),
  schema_fingerprint TEXT NOT NULL,
  source_cursor BIGINT NOT NULL CHECK (source_cursor >= 0),
  checkpoint_sequence BIGINT NOT NULL CHECK (checkpoint_sequence >= 0),
  checkpoint_blob BYTEA NOT NULL,
  checksum TEXT NOT NULL,
  blob_size BIGINT NOT NULL CHECK (blob_size >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE search_runtime_checkpoints ALTER COLUMN checkpoint_blob SET STORAGE EXTERNAL;

CREATE TABLE workspace_permission_revisions (
  workspace_id VARCHAR PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_permission_changes (
  workspace_id VARCHAR NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  revision BIGINT NOT NULL,
  doc_id VARCHAR,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, revision)
);

CREATE INDEX workspace_permission_changes_created_at
  ON workspace_permission_changes(created_at);

INSERT INTO workspace_permission_revisions(workspace_id, revision)
SELECT id, 0 FROM workspaces;

CREATE FUNCTION record_workspace_permission_change(
  target_workspace_id VARCHAR,
  target_doc_id VARCHAR,
  target_scope TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  next_revision BIGINT;
BEGIN
  IF target_workspace_id IS NULL OR
     NOT EXISTS (SELECT 1 FROM workspaces WHERE id = target_workspace_id) THEN
    RETURN;
  END IF;

  INSERT INTO workspace_permission_revisions(workspace_id, revision)
  VALUES (target_workspace_id, 1)
  ON CONFLICT (workspace_id) DO UPDATE
    SET revision = workspace_permission_revisions.revision + 1,
        updated_at = now()
  RETURNING revision INTO next_revision;

  INSERT INTO workspace_permission_changes(workspace_id, revision, doc_id, scope)
  VALUES (target_workspace_id, next_revision, target_doc_id, target_scope);
END;
$$;

CREATE FUNCTION initialize_workspace_permission_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO workspace_permission_revisions(workspace_id, revision) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;

CREATE FUNCTION bump_workspace_permission_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_workspace_id VARCHAR;
  new_workspace_id VARCHAR;
  old_doc_id VARCHAR;
  new_doc_id VARCHAR;
  target_scope TEXT;
BEGIN
  IF TG_TABLE_NAME = 'entitlements' THEN
    old_workspace_id := CASE WHEN TG_OP <> 'INSERT' AND OLD.target_type = 'workspace' THEN OLD.target_id END;
    new_workspace_id := CASE WHEN TG_OP <> 'DELETE' AND NEW.target_type = 'workspace' THEN NEW.target_id END;
    target_scope := 'capability';
  ELSIF TG_TABLE_NAME = 'workspace_members' THEN
    old_workspace_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    target_scope := 'membership';
  ELSIF TG_TABLE_NAME = 'workspace_access_policies' THEN
    old_workspace_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    target_scope := 'workspace_policy';
  ELSIF TG_TABLE_NAME = 'doc_access_policies' THEN
    old_workspace_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    old_doc_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.doc_id END;
    new_doc_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.doc_id END;
    target_scope := 'doc_policy';
  ELSIF TG_TABLE_NAME = 'doc_grants' THEN
    old_workspace_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.workspace_id END;
    new_workspace_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.workspace_id END;
    old_doc_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.doc_id END;
    new_doc_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.doc_id END;
    target_scope := 'doc_grant';
  END IF;

  IF old_workspace_id IS NOT NULL AND old_workspace_id IS DISTINCT FROM new_workspace_id THEN
    PERFORM record_workspace_permission_change(old_workspace_id, old_doc_id, target_scope);
  END IF;
  IF new_workspace_id IS NOT NULL THEN
    PERFORM record_workspace_permission_change(new_workspace_id, new_doc_id, target_scope);
  ELSIF old_workspace_id IS NOT NULL THEN
    PERFORM record_workspace_permission_change(old_workspace_id, old_doc_id, target_scope);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER workspaces_initialize_permission_revision
AFTER INSERT ON workspaces
FOR EACH ROW EXECUTE FUNCTION initialize_workspace_permission_revision();

CREATE TRIGGER workspace_members_permission_revision_mutation
AFTER INSERT OR DELETE ON workspace_members
FOR EACH ROW EXECUTE FUNCTION bump_workspace_permission_revision();
CREATE TRIGGER workspace_members_permission_revision_update
AFTER UPDATE OF workspace_id, user_id, role, state, source ON workspace_members
FOR EACH ROW WHEN (ROW(OLD.workspace_id, OLD.user_id, OLD.role, OLD.state, OLD.source)
  IS DISTINCT FROM ROW(NEW.workspace_id, NEW.user_id, NEW.role, NEW.state, NEW.source))
EXECUTE FUNCTION bump_workspace_permission_revision();

CREATE TRIGGER workspace_access_policies_permission_revision_mutation
AFTER INSERT OR DELETE ON workspace_access_policies
FOR EACH ROW EXECUTE FUNCTION bump_workspace_permission_revision();
CREATE TRIGGER workspace_access_policies_permission_revision_update
AFTER UPDATE OF workspace_id, visibility, sharing_enabled, member_default_doc_role ON workspace_access_policies
FOR EACH ROW WHEN (ROW(OLD.workspace_id, OLD.visibility, OLD.sharing_enabled, OLD.member_default_doc_role)
  IS DISTINCT FROM ROW(NEW.workspace_id, NEW.visibility, NEW.sharing_enabled, NEW.member_default_doc_role))
EXECUTE FUNCTION bump_workspace_permission_revision();

CREATE TRIGGER doc_access_policies_permission_revision_mutation
AFTER INSERT OR DELETE ON doc_access_policies
FOR EACH ROW EXECUTE FUNCTION bump_workspace_permission_revision();
CREATE TRIGGER doc_access_policies_permission_revision_update
AFTER UPDATE OF workspace_id, doc_id, visibility, public_role, member_default_role ON doc_access_policies
FOR EACH ROW WHEN (ROW(OLD.workspace_id, OLD.doc_id, OLD.visibility, OLD.public_role, OLD.member_default_role)
  IS DISTINCT FROM ROW(NEW.workspace_id, NEW.doc_id, NEW.visibility, NEW.public_role, NEW.member_default_role))
EXECUTE FUNCTION bump_workspace_permission_revision();

CREATE TRIGGER doc_grants_permission_revision_mutation
AFTER INSERT OR DELETE ON doc_grants
FOR EACH ROW EXECUTE FUNCTION bump_workspace_permission_revision();
CREATE TRIGGER doc_grants_permission_revision_update
AFTER UPDATE OF workspace_id, doc_id, principal_type, principal_id, role ON doc_grants
FOR EACH ROW WHEN (ROW(OLD.workspace_id, OLD.doc_id, OLD.principal_type, OLD.principal_id, OLD.role)
  IS DISTINCT FROM ROW(NEW.workspace_id, NEW.doc_id, NEW.principal_type, NEW.principal_id, NEW.role))
EXECUTE FUNCTION bump_workspace_permission_revision();

CREATE TRIGGER entitlements_permission_revision_mutation
AFTER INSERT OR DELETE ON entitlements
FOR EACH ROW EXECUTE FUNCTION bump_workspace_permission_revision();
CREATE TRIGGER entitlements_permission_revision_update
AFTER UPDATE OF target_type, target_id, source, plan, status, signed_payload, validated_at, expires_at, grace_until ON entitlements
FOR EACH ROW WHEN (ROW(OLD.target_type, OLD.target_id, OLD.source, OLD.plan, OLD.status, OLD.signed_payload, OLD.validated_at, OLD.expires_at, OLD.grace_until)
  IS DISTINCT FROM ROW(NEW.target_type, NEW.target_id, NEW.source, NEW.plan, NEW.status, NEW.signed_payload, NEW.validated_at, NEW.expires_at, NEW.grace_until))
EXECUTE FUNCTION bump_workspace_permission_revision();
