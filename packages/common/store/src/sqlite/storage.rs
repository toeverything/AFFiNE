use std::collections::BTreeSet;

use sqlx::{
    Pool, Row,
    migrate::MigrateDatabase,
    sqlite::{
        Sqlite, SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous,
    },
};

use super::migrations::{get_migrator, try_repair_migration_3_checksum};
use crate::error::StoreResult;

/// Macro-free SQLite workspace storage engine compatible with 0.27.4 / 0.27.5 in-place databases.
pub struct SqliteDocStorage {
    pub(super) pool: Pool<Sqlite>,
    path: String,
}

impl SqliteDocStorage {
    /// Prepare a lazy SQLite connection pool configured with WAL, `synchronous = FULL`,
    /// and `foreign_keys = ON`.
    pub fn new(path: impl Into<String>) -> Self {
        let path = path.into();
        let base_options = SqliteConnectOptions::new()
            .filename(&path)
            .foreign_keys(true)
            .synchronous(SqliteSynchronous::Full)
            .busy_timeout(std::time::Duration::from_millis(5_000));

        if path == ":memory:" {
            let pool = SqlitePoolOptions::new()
                .min_connections(1)
                .max_connections(1)
                .idle_timeout(None)
                .max_lifetime(None)
                .connect_lazy_with(base_options);
            Self { pool, path }
        } else {
            let pool = SqlitePoolOptions::new()
                .max_connections(4)
                .connect_lazy_with(base_options.journal_mode(SqliteJournalMode::Wal));
            Self { pool, path }
        }
    }

    /// Return the underlying database path string.
    pub fn path(&self) -> &str {
        &self.path
    }

    /// Create the database if missing and apply the frozen 5-step migrations,
    /// repairing the historical migration #3 trailing-space checksum if needed.
    pub async fn connect(&self) -> StoreResult<()> {
        if self.path != ":memory:" && !Sqlite::database_exists(&self.path).await? {
            Sqlite::create_database(&self.path).await?;
        }
        self.migrate().await?;
        Ok(())
    }

    async fn migrate(&self) -> StoreResult<()> {
        let migrator = get_migrator();
        if let Err(err) = migrator.run(&self.pool).await {
            if matches!(err, sqlx::migrate::MigrateError::VersionMismatch(3))
                && try_repair_migration_3_checksum(&self.pool, &migrator).await?
            {
                migrator.run(&self.pool).await?;
            } else {
                return Err(err.into());
            }
        }
        Ok(())
    }

    /// Close the connection pool cleanly.
    pub async fn close(&self) {
        self.pool.close().await;
    }

    /// Return whether the connection pool has been closed.
    pub fn is_closed(&self) -> bool {
        self.pool.is_closed()
    }

    /// Flush the WAL journal into the main database file (`FULL` mode).
    pub async fn checkpoint(&self) -> StoreResult<()> {
        sqlx::query("PRAGMA wal_checkpoint(FULL);")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Perform a non-blocking `PASSIVE` WAL checkpoint.
    pub async fn checkpoint_passive(&self) -> StoreResult<()> {
        sqlx::query("PRAGMA wal_checkpoint(PASSIVE);")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Export a compacted copy of the database to `target_path`.
    pub async fn vacuum_into(&self, target_path: &str) -> StoreResult<()> {
        sqlx::query("VACUUM INTO ?;")
            .bind(target_path)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Verify that all required v2/v5 tables exist on the connected database.
    pub async fn validate_required_tables(&self) -> StoreResult<bool> {
        let rows = sqlx::query("SELECT name FROM sqlite_schema WHERE type = 'table'")
            .fetch_all(&self.pool)
            .await?;
        let mut names = BTreeSet::new();
        for row in rows {
            let name: String = row.try_get("name")?;
            names.insert(name);
        }
        let required = [
            "meta",
            "snapshots",
            "updates",
            "clocks",
            "blobs",
            "peer_clocks",
            "peer_blob_sync",
            "idx_snapshots",
            "indexer_sync",
        ];
        Ok(required.iter().all(|table| names.contains(*table)))
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use sqlx::migrate::{Migration, Migrator};

    use super::*;
    use crate::{
        directory::{CreateDocId, CreateDocRequest, DocMode, WorkspaceDirectory},
        sqlite::{SetBlob, millis_to_naive_utc},
        workspace_db::{PageIdSource, WorkspaceDb, WorkspaceDbTableName},
    };

    #[tokio::test]
    async fn upgrades_0274_db_with_legacy_migration_3_checksum_and_preserves_data() {
        let temp_path = std::env::temp_dir().join(format!(
            "affine-store-upgrade-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&temp_path);
        let _ = std::fs::remove_file(format!("{}-wal", temp_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", temp_path.display()));

        let path_str = temp_path.to_string_lossy().to_string();
        let storage = SqliteDocStorage::new(&path_str);
        Sqlite::create_database(&path_str).await.unwrap();

        // Simulate 0.27.4: only 4 migrations applied, and migration #3 had a trailing space.
        let full_migrator = get_migrator();
        let mut legacy_migrations = full_migrator.migrations.to_vec();
        let mig3 = legacy_migrations[2].clone();
        legacy_migrations[2] = Migration::new(
            mig3.version,
            mig3.description.clone(),
            mig3.migration_type,
            Cow::Owned(format!("{} ", mig3.sql)),
            mig3.no_tx,
        );
        legacy_migrations.truncate(4);
        let legacy_migrator = Migrator {
            migrations: Cow::Owned(legacy_migrations),
            ..Migrator::DEFAULT
        };
        legacy_migrator.run(&storage.pool).await.unwrap();

        storage.set_space_id("ws-0274").await.unwrap();
        let doc_ts = storage
            .push_update("doc-legacy", [0u8, 0u8], 1_700_000_000_000)
            .await
            .unwrap();
        storage
            .set_blob(SetBlob {
                key: "blob-1".to_string(),
                data: vec![1, 2, 3, 4],
                mime: "application/octet-stream".to_string(),
            })
            .await
            .unwrap();
        storage
            .set_peer_remote_clock(
                "cloud",
                "doc-legacy",
                millis_to_naive_utc(1_700_000_000_500),
            )
            .await
            .unwrap();
        storage.close().await;

        let upgraded = SqliteDocStorage::new(&path_str);
        upgraded.connect().await.unwrap();
        assert!(upgraded.validate_required_tables().await.unwrap());

        let journal: String = sqlx::query("PRAGMA journal_mode;")
            .fetch_one(&upgraded.pool)
            .await
            .unwrap()
            .try_get(0)
            .unwrap();
        assert_eq!(journal.to_ascii_lowercase(), "wal");
        let fk: i64 = sqlx::query("PRAGMA foreign_keys;")
            .fetch_one(&upgraded.pool)
            .await
            .unwrap()
            .try_get(0)
            .unwrap();
        assert_eq!(fk, 1);
        let sync_mode: i64 = sqlx::query("PRAGMA synchronous;")
            .fetch_one(&upgraded.pool)
            .await
            .unwrap()
            .try_get(0)
            .unwrap();
        assert_eq!(sync_mode, 2);

        let max_version: i64 = sqlx::query("SELECT MAX(version) FROM _sqlx_migrations")
            .fetch_one(&upgraded.pool)
            .await
            .unwrap()
            .try_get(0)
            .unwrap();
        assert_eq!(max_version, 5);

        let rec = upgraded.get_doc("doc-legacy").await.unwrap().unwrap();
        assert_eq!(rec.timestamp, doc_ts);
        let blob = upgraded.get_blob("blob-1").await.unwrap().unwrap();
        assert_eq!(blob.data, vec![1, 2, 3, 4]);
        let clock = upgraded
            .get_peer_remote_clock("cloud", "doc-legacy")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(clock.timestamp, millis_to_naive_utc(1_700_000_000_500));

        upgraded.checkpoint().await.unwrap();
        upgraded.close().await;

        let reopened = SqliteDocStorage::new(&path_str);
        reopened.connect().await.unwrap();
        assert!(reopened.get_doc("doc-legacy").await.unwrap().is_some());
        reopened.close().await;

        let _ = std::fs::remove_file(&temp_path);
        let _ = std::fs::remove_file(format!("{}-wal", temp_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", temp_path.display()));
    }

    #[tokio::test]
    async fn deterministic_op_id_and_atomic_batch_persist_edgeless_across_restart() {
        let storage = SqliteDocStorage::new(":memory:");
        storage.connect().await.unwrap();
        storage.set_space_id("ws-idem").await.unwrap();

        let mut db = WorkspaceDb::new("ws-idem", "u1", 1);
        db.initialize_meta().unwrap();
        let mut dir = WorkspaceDirectory::new(db);
        let created = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-1").unwrap(),
                title: "Spec".into(),
                mode: DocMode::Edgeless,
                now_ms: 1_000,
            })
            .unwrap();
        assert!(created.created_new);
        let original_page_id = created.doc_id.clone();

        // Atomically commit ws-idem initialize_meta, ws-idem create_page, and db$docProperties in one SQLite tx.
        let batch = dir.drain_pending_updates();
        let committed = storage
            .push_updates_batch(&batch, Some("cloud"), 1_000)
            .await
            .unwrap();
        assert_eq!(committed.len(), 3);

        // Reload fresh WorkspaceDb + db$docProperties from SQLite: Edgeless mode & idempotency hold.
        let loaded_rec = storage.get_doc("ws-idem").await.unwrap().unwrap();
        let loaded_props = storage.get_doc("db$docProperties").await.unwrap().unwrap();
        let mut reloaded_db =
            WorkspaceDb::from_root_update_v1("ws-idem", "u1", 2, &loaded_rec.bin).unwrap();
        reloaded_db
            .load_db_table(WorkspaceDbTableName::DocProperties, &loaded_props.bin)
            .unwrap();
        let sv_before = reloaded_db.root().encode_state_vector_v1().unwrap();
        let mut reloaded_dir = WorkspaceDirectory::new(reloaded_db);
        assert_eq!(
            reloaded_dir
                .get_doc(&original_page_id)
                .unwrap()
                .unwrap()
                .mode,
            DocMode::Edgeless
        );

        let retry = reloaded_dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-1").unwrap(),
                title: "Spec".into(),
                mode: DocMode::Edgeless,
                now_ms: 2_000,
            })
            .unwrap();
        assert!(!retry.created_new);
        assert_eq!(retry.doc_id, original_page_id);
        assert!(reloaded_dir.drain_pending_updates().is_empty());
        assert_eq!(reloaded_dir.db().root().list_pages().unwrap().len(), 1);
        assert_eq!(
            reloaded_dir.db().root().encode_state_vector_v1().unwrap(),
            sv_before
        );

        // Even after trashing the page and reloading, retrying op-1 must still be idempotent.
        reloaded_dir.trash_doc(&original_page_id, 2_500).unwrap();
        let trashed_bytes = reloaded_dir.db().root().encode_update_v1().unwrap();
        let mut after_trash =
            WorkspaceDb::from_root_update_v1("ws-idem", "u1", 3, &trashed_bytes).unwrap();
        let retry_trashed = after_trash
            .create_page(PageIdSource::DerivedFromOp("op-1"), "Spec", 3_000)
            .unwrap();
        assert!(!retry_trashed.created_new);
        assert_eq!(retry_trashed.page_id, original_page_id.as_str());
        assert!(retry_trashed.update.is_none());
        assert!(after_trash.drain_pending_updates().is_empty());
        assert_eq!(after_trash.root().list_pages().unwrap().len(), 1);

        // Ensure raw encoded Yjs bytes never contain "createOpId" and idx_snapshots stayed untouched.
        assert!(
            !loaded_rec
                .bin
                .windows("createOpId".len())
                .any(|w| w == b"createOpId"),
            "shared Yjs root bytes must not contain createOpId"
        );
        let idx_count: i64 = sqlx::query("SELECT COUNT(*) FROM idx_snapshots")
            .fetch_one(&storage.pool)
            .await
            .unwrap()
            .try_get(0)
            .unwrap();
        assert_eq!(idx_count, 0);
    }

    #[tokio::test]
    async fn interleaved_connections_and_uncheckpointed_wal_recovery() {
        let temp_path = std::env::temp_dir().join(format!(
            "affine-store-wal-recovery-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&temp_path);
        let _ = std::fs::remove_file(format!("{}-wal", temp_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", temp_path.display()));

        let path_str = temp_path.to_string_lossy().to_string();
        let writer_a = SqliteDocStorage::new(&path_str);
        writer_a.connect().await.unwrap();
        let writer_b = SqliteDocStorage::new(&path_str);
        writer_b.connect().await.unwrap();

        writer_a
            .push_update("shared-doc", [0u8, 0u8], 1_000)
            .await
            .unwrap();
        writer_b
            .set_blob(SetBlob {
                key: "shared-blob".into(),
                data: vec![7, 8, 9],
                mime: "application/octet-stream".into(),
            })
            .await
            .unwrap();
        assert!(writer_a.get_blob("shared-blob").await.unwrap().is_some());
        assert!(writer_b.get_doc("shared-doc").await.unwrap().is_some());

        drop(writer_a);
        drop(writer_b);

        let recovered = SqliteDocStorage::new(&path_str);
        recovered.connect().await.unwrap();
        assert!(recovered.get_doc("shared-doc").await.unwrap().is_some());
        assert_eq!(
            recovered
                .get_blob("shared-blob")
                .await
                .unwrap()
                .unwrap()
                .data,
            vec![7, 8, 9]
        );
        recovered.close().await;

        let _ = std::fs::remove_file(&temp_path);
        let _ = std::fs::remove_file(format!("{}-wal", temp_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", temp_path.display()));
    }

    #[tokio::test]
    async fn push_updates_batch_begin_immediate_avoids_wal_busy_snapshot_under_concurrency() {
        let temp_path =
            std::env::temp_dir().join(format!("affine-store-batch-wal-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&temp_path);
        let _ = std::fs::remove_file(format!("{}-wal", temp_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", temp_path.display()));

        let path_str = temp_path.to_string_lossy().to_string();
        let storage = SqliteDocStorage::new(&path_str);
        storage.connect().await.unwrap();
        storage.set_space_id("ws-conc").await.unwrap();

        let make_non_empty_update = |client_id: u64, key: &str, val: &str| -> Vec<u8> {
            let doc = y_octo::DocOptions::from_identity(client_id, "ws-conc".to_string()).build();
            let mut map = doc.get_or_create_map("m").unwrap();
            map.insert(
                key.to_string(),
                y_octo::Value::Any(y_octo::Any::String(val.to_string())),
            )
            .unwrap();
            doc.encode_update_v1().unwrap()
        };

        for round in 0..8u64 {
            let b1 = vec![
                crate::workspace_db::PendingDocUpdate {
                    doc_id: "ws-conc".into(),
                    update: make_non_empty_update(10 + round * 3, "k1", "v1"),
                },
                crate::workspace_db::PendingDocUpdate {
                    doc_id: "db$docProperties".into(),
                    update: make_non_empty_update(11 + round * 3, "k2", "v2"),
                },
            ];
            let b2 = vec![crate::workspace_db::PendingDocUpdate {
                doc_id: "ws-conc".into(),
                update: make_non_empty_update(12 + round * 3, "k3", "v3"),
            }];
            let single = make_non_empty_update(100 + round, "ks", "vs");
            let base_ms = 10_000 + (round as i64) * 10;

            let (r1, r2, r3) = tokio::join!(
                storage.push_updates_batch(&b1, Some("cloud"), base_ms),
                storage.push_updates_batch(&b2, None, base_ms),
                storage.push_update("ws-conc", single, base_ms),
            );
            assert_eq!(r1.unwrap().len(), 2);
            assert_eq!(r2.unwrap().len(), 1);
            r3.unwrap();
        }

        assert!(storage.get_doc("ws-conc").await.unwrap().is_some());
        assert!(storage.get_doc("db$docProperties").await.unwrap().is_some());
        storage.close().await;

        let _ = std::fs::remove_file(&temp_path);
        let _ = std::fs::remove_file(format!("{}-wal", temp_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", temp_path.display()));
    }
}
