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
