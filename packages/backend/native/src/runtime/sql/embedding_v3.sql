-- Contract v3: configurable embedding dimensions.
--
-- The dimensions resolve Rust-side from the embedding AppConfig section; this
-- migration only creates the singleton row that records which
-- (dimensions, storage type) the tables were built for. The storage DDL
-- itself is rendered at apply time (vector at <= 2000 dims, halfvec above)
-- because static SQL cannot branch on configuration. A mismatch between the
-- recorded row and the current configuration is a hard error instead of
-- an implicit reformat that would mis-store vectors.
CREATE TABLE embedding_schema_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  configured_dims INTEGER NOT NULL CHECK (configured_dims >= 1),
  vector_type TEXT NOT NULL CHECK (vector_type IN ('vector', 'halfvec')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
