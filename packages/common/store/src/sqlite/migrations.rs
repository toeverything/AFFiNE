use std::borrow::Cow;

use sqlx::{
    Pool, Row,
    migrate::{Migration, MigrationType, Migrator},
    sqlite::Sqlite,
};

use crate::error::StoreResult;

/// Frozen SQLite workspace schema version for 0.27.5 in-place compatibility.
pub const FROZEN_SCHEMA_VERSION: i64 = 5;

pub type SimpleMigration = (&'static str, &'static str, Option<&'static str>);

// ORDER MATTERS: byte-for-byte identical to `packages/frontend/native/schema/src/lib.rs`.
pub const MIGRATIONS: &[SimpleMigration] = &[
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
    (
        "workspace_inventory",
        r#"
ALTER TABLE peer_clocks ADD COLUMN inventory_kind TEXT;
ALTER TABLE peer_clocks ADD COLUMN lifecycle TEXT;
ALTER TABLE peer_clocks ADD COLUMN lifecycle_changed_at INTEGER;
ALTER TABLE peer_clocks ADD COLUMN pending_create BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE peer_clocks ADD COLUMN inventory_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE peer_clocks ADD COLUMN cache_token INTEGER NOT NULL DEFAULT 0;
"#,
        None,
    ),
];

/// Build the frozen 5-step `sqlx::migrate::Migrator`.
pub fn get_migrator() -> Migrator {
    let mut migrations = Vec::with_capacity(MIGRATIONS.len());

    for &(name, up, down) in MIGRATIONS {
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

        if let Some(down_sql) = down {
            migrations.push(Migration::new(
                migrations.len() as i64 + 1,
                Cow::from(name),
                MigrationType::ReversibleDown,
                Cow::from(down_sql),
                false,
            ));
        }
    }

    Migrator {
        migrations: Cow::Owned(migrations),
        ..Migrator::DEFAULT
    }
}

/// Repair the historical migration #3 (`add_idx_snapshots`) trailing-space SHA-384 checksum
/// mismatch from 0.27.4 databases.
pub async fn try_repair_migration_3_checksum(
    pool: &Pool<Sqlite>,
    migrator: &Migrator,
) -> StoreResult<bool> {
    let Some(migration) = migrator.iter().find(|m| m.version == 3) else {
        return Ok(false);
    };

    if migration.description.as_ref() != "add_idx_snapshots" {
        return Ok(false);
    }

    let row = sqlx::query("SELECT description, checksum FROM _sqlx_migrations WHERE version = 3")
        .fetch_optional(pool)
        .await?;

    let Some(row) = row else {
        return Ok(false);
    };

    let applied_description: String = row.try_get("description")?;
    if applied_description != migration.description.as_ref() {
        return Ok(false);
    }

    let applied_checksum: Vec<u8> = row.try_get("checksum")?;
    let expected_checksum = migration.checksum.as_ref();

    let legacy_sql = format!("{} ", migration.sql);
    let legacy_migration = Migration::new(
        migration.version,
        migration.description.clone(),
        migration.migration_type,
        Cow::Owned(legacy_sql),
        migration.no_tx,
    );

    if applied_checksum.as_slice() != legacy_migration.checksum.as_ref() {
        return Ok(false);
    }

    sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = 3")
        .bind(expected_checksum)
        .execute(pool)
        .await?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use sha2::{Digest, Sha256};

    use super::*;

    fn extract_schema_migrations(source: &str) -> Vec<(String, String)> {
        let mut out = Vec::new();
        let mut cursor = source;
        let marker = "const MIGRATIONS: &[SimpleMigration] = &[";
        let start = cursor
            .find(marker)
            .expect("MIGRATIONS array must exist in affine_schema");
        cursor = &cursor[start + marker.len()..];

        while let Some(raw_start) = cursor.find("r#\"") {
            let prefix = &cursor[..raw_start];
            let name = prefix
                .rsplit('"')
                .nth(1)
                .expect("migration name string before raw SQL")
                .to_string();
            let after_open = &cursor[raw_start + 3..];
            let raw_end = after_open
                .find("\"#")
                .expect("closing raw string delimiter");
            let sql = after_open[..raw_end].to_string();
            out.push((name, sql));
            cursor = &after_open[raw_end + 2..];
        }

        out
    }

    #[test]
    fn five_migrations_match_native_schema_sha256_byte_for_byte() {
        let schema_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../frontend/native/schema/src/lib.rs");
        let schema_source = std::fs::read_to_string(&schema_path)
            .expect("packages/frontend/native/schema/src/lib.rs must be readable");

        let upstream = extract_schema_migrations(&schema_source);
        assert_eq!(upstream.len(), FROZEN_SCHEMA_VERSION as usize);
        assert_eq!(MIGRATIONS.len(), upstream.len());

        for (index, ((up_name, up_sql), &(local_name, local_sql, _))) in
            upstream.iter().zip(MIGRATIONS.iter()).enumerate()
        {
            assert_eq!(
                local_name,
                up_name,
                "migration #{} name mismatch",
                index + 1
            );
            let up_hash = Sha256::digest(up_sql.as_bytes());
            let local_hash = Sha256::digest(local_sql.as_bytes());
            assert_eq!(
                local_hash,
                up_hash,
                "migration #{} ({local_name}) SQL SHA-256 mismatch",
                index + 1
            );
        }
    }
}
