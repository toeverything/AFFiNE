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
