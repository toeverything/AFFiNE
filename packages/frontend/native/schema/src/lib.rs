use std::borrow::Cow;

use sqlx::migrate::{Migration, MigrationType, Migrator};

pub mod v1;

type SimpleMigration = (
  /* name */ &'static str,
  /* up */ &'static str,
  /* down */ Option<&'static str>,
);

// ORDER MATTERS
const MIGRATIONS: &[SimpleMigration] = &[
  // v2 db init
  (
    "init_v2",
    r#"
CREATE TABLE "meta" (
  space_id VARCHAR PRIMARY KEY NOT NULL
);

CREATE TABLE "snapshots" (
  doc_id VARCHAR PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE "updates" (
  doc_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (doc_id, created_at)
);

CREATE TABLE "clocks" (
  doc_id VARCHAR PRIMARY KEY NOT NULL,
  timestamp TIMESTAMP NOT NULL
);

CREATE TABLE "blobs" (
  key VARCHAR PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  mime VARCHAR NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP
);

CREATE TABLE "peer_clocks" (
  peer VARCHAR NOT NULL,
  doc_id VARCHAR NOT NULL,
  remote_clock TIMESTAMP NOT NULL DEFAULT 0,
  pulled_remote_clock TIMESTAMP NOT NULL DEFAULT 0,
  pushed_clock TIMESTAMP NOT NULL DEFAULT 0,
  PRIMARY KEY (peer, doc_id)
);
CREATE INDEX peer_clocks_doc_id ON peer_clocks (doc_id);
 "#,
    None,
  ),
  // add blob_sync table
  (
    "add_blob_sync",
    r#"
CREATE TABLE "peer_blob_sync" (
  peer VARCHAR NOT NULL,
  blob_id VARCHAR NOT NULL,
  uploaded_at TIMESTAMP,
  PRIMARY KEY (peer, blob_id)
);
CREATE INDEX peer_blob_sync_peer ON peer_blob_sync (peer);
 "#,
    None,
  ),
  // add idx snapshots
  (
    "add_idx_snapshots",
    r#"
CREATE TABLE idx_snapshots (
  index_name TEXT PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
"#,
    None,
  ),
  // add indexer sync table
  (
    "add_indexer_sync",
    r#"
CREATE TABLE "indexer_sync" (
  doc_id VARCHAR PRIMARY KEY NOT NULL,
  indexed_clock TIMESTAMP NOT NULL DEFAULT 0,
  indexer_version INTEGER NOT NULL DEFAULT 0
);
 "#,
    None,
  ),
];

pub fn get_migrator() -> Migrator {
  let mut migrations = vec![];

  MIGRATIONS.iter().for_each(|&(name, up, down)| {
    migrations.push(Migration::new(
      migrations.len() as i64 + 1,
      Cow::from(name),
      if down.is_some() {
        MigrationType::ReversibleUp
      } else {
        MigrationType::Simple
      },
      Cow::from(up),
      false,
    ));

    if let Some(down) = down {
      migrations.push(Migration::new(
        migrations.len() as i64 + 1,
        Cow::from(name),
        MigrationType::ReversibleDown,
        Cow::from(down),
        false,
      ));
    }
  });

  Migrator {
    migrations: Cow::Owned(migrations),
    ..Migrator::DEFAULT
  }
}
