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
