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
