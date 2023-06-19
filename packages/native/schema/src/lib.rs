// TODO
// dynamic create it from JavaScript side
// and remove this crate then.
pub const SCHEMA: &str = r#"CREATE TABLE IF NOT EXISTS "updates" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data BLOB NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  doc_id TEXT
);
CREATE TABLE IF NOT EXISTS "blobs" (
  key TEXT PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);"#;
