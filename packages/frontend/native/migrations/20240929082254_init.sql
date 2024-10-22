CREATE TABLE "v2_snapshots" (
  doc_id TEXT PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
CREATE INDEX snapshots_doc_id ON v2_snapshots(doc_id);

CREATE TABLE "v2_updates" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX updates_doc_id ON v2_updates (doc_id);

CREATE TABLE "v2_clocks" (
  doc_id TEXT PRIMARY KEY NOT NULL,
  timestamp TIMESTAMP NOT NULL
)