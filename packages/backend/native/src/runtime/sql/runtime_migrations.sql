CREATE TABLE IF NOT EXISTS runtime_states (
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  lookup_key TEXT,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ(3),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (purpose, token_hash)
);

CREATE INDEX IF NOT EXISTS runtime_states_lookup_idx
  ON runtime_states (purpose, lookup_key)
  WHERE lookup_key IS NOT NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS runtime_states_expires_at_idx
  ON runtime_states (expires_at);

CREATE TABLE IF NOT EXISTS runtime_gates (
  key TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS runtime_gates_expires_at_idx
  ON runtime_gates (expires_at);

CREATE TABLE IF NOT EXISTS runtime_leases (
  key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  fencing_token BIGINT NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS runtime_leases_expires_at_idx
  ON runtime_leases (expires_at);

CREATE TABLE IF NOT EXISTS blob_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  workspace_id TEXT,
  started_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ(3),
  cursor JSONB NOT NULL DEFAULT '{}',
  scanned INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS blob_reconciliation_runs_workspace_idx
  ON blob_reconciliation_runs (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS blob_reconciliation_checkpoints (
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  cursor JSONB NOT NULL DEFAULT '{}',
  last_key TEXT,
  last_sid INTEGER,
  completed_at TIMESTAMPTZ(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (kind, scope)
);

CREATE INDEX IF NOT EXISTS blob_reconciliation_checkpoints_status_idx
  ON blob_reconciliation_checkpoints (kind, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS doc_blob_refs (
  workspace_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  block_id TEXT NOT NULL,
  flavour TEXT NOT NULL,
  snapshot_updated_at TIMESTAMPTZ(3) NOT NULL,
  indexed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  parser_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'fresh',
  error TEXT,
  PRIMARY KEY (workspace_id, doc_id, blob_key, block_id)
);

CREATE INDEX IF NOT EXISTS doc_blob_refs_workspace_blob_idx
  ON doc_blob_refs (workspace_id, blob_key);

CREATE INDEX IF NOT EXISTS doc_blob_refs_workspace_status_idx
  ON doc_blob_refs (workspace_id, status);

CREATE TABLE IF NOT EXISTS blob_cleanup_candidates (
  workspace_id TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  object_size BIGINT NOT NULL,
  object_last_modified TIMESTAMPTZ(3),
  planned_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMPTZ(3),
  run_id UUID NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  PRIMARY KEY (workspace_id, blob_key)
);

CREATE INDEX IF NOT EXISTS blob_cleanup_candidates_run_idx
  ON blob_cleanup_candidates (run_id, status);

CREATE TABLE IF NOT EXISTS runtime_rolling_quota_counters (
  scope_key TEXT NOT NULL,
  window_seconds INTEGER NOT NULL,
  bucket_start TIMESTAMPTZ(3) NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope_key, window_seconds, bucket_start)
);

CREATE INDEX IF NOT EXISTS runtime_rolling_quota_counters_expires_at_idx
  ON runtime_rolling_quota_counters (expires_at);

CREATE TABLE IF NOT EXISTS runtime_rolling_quota_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  window_seconds INTEGER NOT NULL,
  bucket_start TIMESTAMPTZ(3) NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'committed', 'released', 'expired')),
  purpose TEXT NOT NULL,
  request_id TEXT,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  committed_at TIMESTAMPTZ(3),
  released_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, scope_key, window_seconds, bucket_start)
);

CREATE INDEX IF NOT EXISTS runtime_rolling_quota_reservations_status_expires_at_idx
  ON runtime_rolling_quota_reservations (status, expires_at);

CREATE INDEX IF NOT EXISTS runtime_rolling_quota_reservations_scope_idx
  ON runtime_rolling_quota_reservations (scope_key, window_seconds, bucket_start)
  WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS runtime_invite_abuse_subjects (
  subject_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT,
  actor_email_hash TEXT,
  email_domain TEXT,
  first_seen_at TIMESTAMPTZ(3) NOT NULL,
  last_seen_at TIMESTAMPTZ(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  action TEXT,
  action_reason TEXT,
  action_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runtime_invite_abuse_evidence (
  id BIGSERIAL PRIMARY KEY,
  subject_key TEXT NOT NULL REFERENCES runtime_invite_abuse_subjects(subject_key),
  request_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  actor_email_hash TEXT,
  source_prefix_hash TEXT,
  source_asn BIGINT,
  target_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runtime_invite_abuse_actions (
  id BIGSERIAL PRIMARY KEY,
  subject_key TEXT NOT NULL REFERENCES runtime_invite_abuse_subjects(subject_key),
  evidence_id BIGINT NOT NULL REFERENCES runtime_invite_abuse_evidence(id),
  action TEXT NOT NULL CHECK (action IN ('ban_actor', 'quarantine_actor', 'quarantine_workspace', 'quarantine_source_cohort')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'retry_wait', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ(3),
  locked_by TEXT,
  locked_until TIMESTAMPTZ(3),
  last_error TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS runtime_invite_abuse_actions_status_next_attempt_idx
  ON runtime_invite_abuse_actions (status, next_attempt_at);
