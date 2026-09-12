export const IDENTITY_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS mosaic_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  features TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credentials (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE,
  csrf_token TEXT NOT NULL,
  refresh_token_hash TEXT UNIQUE,
  refresh_expires_at TIMESTAMPTZ,
  access_token_hash TEXT UNIQUE,
  access_expires_at TIMESTAMPTZ,
  exchange_code_hash TEXT UNIQUE,
  exchange_expires_at TIMESTAMPTZ,
  installation_id TEXT,
  platform TEXT,
  device_name TEXT,
  app_version TEXT,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  initialized BOOLEAN NOT NULL DEFAULT TRUE,
  team BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'collaborator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_one_owner
  ON workspace_members (workspace_id)
  WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS instance_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
`;

export const DOCS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  space_type TEXT NOT NULL,
  space_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  snapshot BYTEA,
  timestamp BIGINT NOT NULL DEFAULT 0,
  lifecycle TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle IN ('active', 'trash', 'deleted')),
  update_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (space_type, space_id, doc_id)
);

CREATE INDEX IF NOT EXISTS documents_space_idx
  ON documents (space_type, space_id);

CREATE TABLE IF NOT EXISTS doc_updates (
  id BIGSERIAL PRIMARY KEY,
  space_type TEXT NOT NULL,
  space_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  clock BIGINT NOT NULL,
  payload BYTEA NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (space_type, space_id, doc_id, payload_hash),
  FOREIGN KEY (space_type, space_id, doc_id)
    REFERENCES documents (space_type, space_id, doc_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS doc_updates_doc_clock_idx
  ON doc_updates (space_type, space_id, doc_id, clock);
`;

export const BLOBS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS blobs (
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS blobs_workspace_live_idx
  ON blobs (workspace_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS blob_uploads (
  id UUID PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  method TEXT NOT NULL,
  part_size INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blob_uploads_workspace_key_idx
  ON blob_uploads (workspace_id, key);

CREATE TABLE IF NOT EXISTS blob_upload_parts (
  upload_id UUID NOT NULL REFERENCES blob_uploads (id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT,
  token TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (upload_id, part_number)
);

CREATE TABLE IF NOT EXISTS doc_histories (
  space_type TEXT NOT NULL,
  space_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  snapshot BYTEA NOT NULL,
  editor_id UUID,
  PRIMARY KEY (space_type, space_id, doc_id, timestamp)
);

CREATE INDEX IF NOT EXISTS doc_histories_list_idx
  ON doc_histories (space_type, space_id, doc_id, timestamp DESC);
`;

export const MEMBERS_MIGRATION_SQL = `
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Untitled';
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS enable_sharing BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS enable_url_preview BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS enable_ai BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS invite_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invitee_id UUID REFERENCES users (id) ON DELETE SET NULL,
  inviter_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Accepted', 'UnderReview')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_email_idx
  ON workspace_invitations (workspace_id, email);

CREATE TABLE IF NOT EXISTS workspace_invite_links (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expire_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_docs (
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('Page', 'Edgeless')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID,
  PRIMARY KEY (workspace_id, doc_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id),
  content JSONB NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_doc_idx
  ON comments (workspace_id, doc_id, created_at, id);

CREATE TABLE IF NOT EXISTS comment_replies (
  id UUID PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comment_replies_comment_idx
  ON comment_replies (comment_id, created_at, id);

CREATE TABLE IF NOT EXISTS comment_changes (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('update', 'delete')),
  item JSONB NOT NULL,
  comment_id UUID,
  entity_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comment_changes_doc_idx
  ON comment_changes (workspace_id, doc_id, created_at, id);
`;

export const PLATFORM_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  actor_id UUID,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_workspace_idx
  ON audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx
  ON audit_events (action, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_security_policies (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  allowed_guest_domains TEXT[] NOT NULL DEFAULT '{}',
  block_public_links BOOLEAN NOT NULL DEFAULT FALSE,
  require_sso BOOLEAN NOT NULL DEFAULT FALSE,
  require_sso_domains TEXT[] NOT NULL DEFAULT '{}',
  session_max_duration_sec INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instance_security_policy (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  allowed_guest_domains TEXT[] NOT NULL DEFAULT '{}',
  block_public_links BOOLEAN NOT NULL DEFAULT FALSE,
  require_sso BOOLEAN NOT NULL DEFAULT FALSE,
  require_sso_domains TEXT[] NOT NULL DEFAULT '{}',
  session_max_duration_sec INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_webhooks (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_webhooks_workspace_idx
  ON workspace_webhooks (workspace_id);

CREATE TABLE IF NOT EXISTS copilot_sessions (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  doc_id TEXT,
  prompt_name TEXT NOT NULL,
  title TEXT,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copilot_sessions_user_ws_idx
  ON copilot_sessions (user_id, workspace_id);

CREATE TABLE IF NOT EXISTS copilot_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES copilot_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copilot_messages_session_idx
  ON copilot_messages (session_id, created_at);
`;
