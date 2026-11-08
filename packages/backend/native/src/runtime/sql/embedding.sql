CREATE TABLE embedding_workspace_states (
  workspace_id TEXT PRIMARY KEY,
  active_index_id UUID,
  index_epoch BIGINT NOT NULL DEFAULT 0,
  runtime_state TEXT NOT NULL CHECK (runtime_state IN ('active', 'disabled', 'unavailable')),
  reason_code TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE embedding_indexes (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  route_source TEXT NOT NULL CHECK (route_source IN ('byok', 'managed')),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  endpoint_fingerprint TEXT NOT NULL,
  dimensions INTEGER NOT NULL DEFAULT 1024 CHECK (dimensions = 1024),
  distance_metric TEXT NOT NULL DEFAULT 'cosine' CHECK (distance_metric = 'cosine'),
  contract_version INTEGER NOT NULL,
  health_status TEXT NOT NULL CHECK (health_status IN ('pending', 'ready', 'retry_wait', 'incompatible')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  next_probe_at TIMESTAMPTZ,
  probe_lease_owner TEXT,
  probe_lease_until TIMESTAMPTZ,
  last_error_code TEXT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  inactive_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, fingerprint)
);

ALTER TABLE embedding_workspace_states
  ADD CONSTRAINT embedding_workspace_states_active_index_fkey
  FOREIGN KEY (active_index_id) REFERENCES embedding_indexes(id) ON DELETE SET NULL;

CREATE TABLE embedding_sources (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('document', 'artifact')),
  source_key TEXT NOT NULL,
  content_revision TEXT NOT NULL,
  descriptor_revision TEXT NOT NULL,
  recipe_revision TEXT NOT NULL,
  storage_scope TEXT CHECK (storage_scope IN ('blob', 'copilot')),
  storage_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  document_projection JSONB,
  size_bytes BIGINT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_kind, source_key),
  CHECK (
    (source_kind = 'document' AND storage_scope IS NULL AND storage_key IS NULL AND document_projection IS NOT NULL)
    OR
    (source_kind = 'artifact' AND storage_scope IS NOT NULL AND storage_key IS NOT NULL AND document_projection IS NULL)
  )
);

CREATE TABLE embedding_projections (
  source_id UUID NOT NULL REFERENCES embedding_sources(id) ON DELETE CASCADE,
  index_id UUID NOT NULL REFERENCES embedding_indexes(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'retry_wait', 'ready', 'failed')),
  applied_content_revision TEXT,
  applied_descriptor_revision TEXT,
  applied_recipe_revision TEXT,
  active_generation_token UUID,
  priority INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_token BIGINT NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, index_id)
);

CREATE TABLE embedding_chunks (
  generation_token UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  index_id UUID NOT NULL REFERENCES embedding_indexes(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES embedding_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('document', 'artifact')),
  doc_id TEXT,
  artifact_id UUID,
  unit_id TEXT,
  visibility TEXT,
  block_id TEXT,
  element_id TEXT,
  frame_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_token, chunk_index),
  CHECK (
    (source_kind = 'document' AND doc_id IS NOT NULL AND artifact_id IS NULL)
    OR
    (source_kind = 'artifact' AND artifact_id IS NOT NULL AND doc_id IS NULL)
  )
);

CREATE INDEX embedding_projection_claim_idx
  ON embedding_projections (priority DESC, next_attempt_at, updated_at)
  WHERE status IN ('pending', 'retry_wait', 'running');
CREATE INDEX embedding_sources_workspace_idx
  ON embedding_sources (workspace_id, source_kind) WHERE deleted_at IS NULL;
CREATE INDEX embedding_indexes_inactive_idx
  ON embedding_indexes (inactive_at) WHERE inactive_at IS NOT NULL;
CREATE INDEX embedding_chunks_hnsw
  ON embedding_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 200);
CREATE INDEX embedding_chunks_scope_idx
  ON embedding_chunks (workspace_id, index_id, source_id);
CREATE INDEX embedding_chunks_artifact_idx
  ON embedding_chunks (workspace_id, artifact_id) WHERE artifact_id IS NOT NULL;
