-- Phase 6 product platform (audit, security policy, webhooks, copilot sessions).
-- Applied by Mosaic migrate.ts as 005_platform.

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
