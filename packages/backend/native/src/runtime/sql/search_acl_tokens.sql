CREATE TABLE search_runtime_acl_tokens (
  token TEXT PRIMARY KEY,
  token_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE CHECK (token_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
