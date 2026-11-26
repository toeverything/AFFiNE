//! In-place Android SQLite WAL co-storage backed by `affine-store`.
//!
//! Enforces:
//! - Exact `0.27.5` path layout: `<filesDir>/workspaces/<spaceType>/<sanitizedPeer>/<spaceId>.db`
//! - Exact `0.27.5` peer character sanitization via `affine_store::sqlite::sanitize_peer_name`
//! - Iron Rule F1: never scan disk `*.db` files to discover local workspaces;
//!   open only workspace IDs present in the ordered `affine-local-workspace` allowlist.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use affine_store::sqlite::{
    DocDiff, SqliteDocStorage, resolve_workspace_db_path, sanitize_peer_name,
};
pub use affine_store::sync::SpaceType;
use affine_store::workspace_db::PendingDocUpdate;
use tokio::runtime::{Builder, Runtime};

/// Explicit SQLite busy timeout (milliseconds) applied to maintenance connections.
pub const SQLITE_BUSY_TIMEOUT_MS: u64 = 5_000;

/// Result of a non-blocking `PRAGMA wal_checkpoint(PASSIVE);` call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PassiveCheckpointResult {
    pub busy: i64,
    pub log: i64,
    pub checkpointed: i64,
}

/// Legacy `localStorage` key storing the ordered list of local workspace IDs.
pub const LOCAL_WORKSPACE_LOCAL_STORAGE_KEY: &str = "affine-local-workspace";

/// Filters a raw WebView `evaluateJavascript` snapshot JSON payload using
/// `affine-legacy-import`'s single allowlist, retaining all top-level metadata
/// (`origin`, `length`, sorted `keys`, `removedKeys`, `verified`, `idbBlocked`,
/// `idbTouchCount`) while stripping non-allowlisted keys from `entries`.
/// Returns `None` if `payload_json` is `"null"`, invalid JSON, or not a JSON object.
pub fn filter_legacy_local_storage_probe_json(payload_json: &str) -> Option<String> {
    let trimmed = payload_json.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return None;
    }
    let unwrapped_owned: String;
    let effective_json = if trimmed.starts_with('"') {
        unwrapped_owned = serde_json::from_str::<String>(trimmed).ok()?;
        unwrapped_owned.as_str()
    } else {
        trimmed
    };
    let mut obj =
        serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(effective_json).ok()?;
    if let Some(serde_json::Value::Array(keys)) = obj.get_mut("keys") {
        let mut sorted: Vec<String> = keys
            .iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect();
        if sorted.len() == keys.len() {
            sorted.sort();
            *keys = sorted.into_iter().map(serde_json::Value::String).collect();
        }
    }
    let mut filtered_entries = serde_json::Map::new();
    if let Some(serde_json::Value::Object(raw_entries)) = obj.get("entries") {
        for (k, v) in raw_entries {
            if affine_legacy_import::is_permitted_sentinel_entry_key(k) {
                filtered_entries.insert(k.clone(), v.clone());
            }
        }
    }
    obj.insert(
        "entries".to_string(),
        serde_json::Value::Object(filtered_entries),
    );
    serde_json::to_string(&serde_json::Value::Object(obj)).ok()
}

/// Errors returned by the Android SQLite storage bridge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AndroidStorageError {
    WorkspaceNotAllowlisted(String),
    InvalidSpaceType(String),
    NotConnected(String),
    InvalidPath(String),
    Store(String),
    Io(String),
}

impl std::fmt::Display for AndroidStorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WorkspaceNotAllowlisted(id) => {
                write!(
                    f,
                    "workspace {id:?} is not in the affine-local-workspace allowlist"
                )
            }
            Self::InvalidSpaceType(st) => write!(f, "invalid space type: {st:?}"),
            Self::NotConnected(key) => write!(f, "sqlite storage not connected: {key:?}"),
            Self::InvalidPath(msg) => write!(f, "invalid storage path: {msg}"),
            Self::Store(msg) => write!(f, "sqlite store error: {msg}"),
            Self::Io(msg) => write!(f, "storage I/O error: {msg}"),
        }
    }
}

impl std::error::Error for AndroidStorageError {}

/// Parses `affine-local-workspace` JSON into an ordered, deduplicated list of workspace IDs
/// via `affine-legacy-import`.
pub use affine_legacy_import::parse_local_workspace_ids;

/// Resolves `<filesDir>/workspaces/<spaceType>/<sanitizedPeer>/<spaceId>.db`.
pub fn resolve_android_db_path(
    files_dir: &Path,
    space_type: SpaceType,
    peer: &str,
    space_id: &str,
) -> Result<PathBuf, AndroidStorageError> {
    resolve_workspace_db_path(files_dir, space_type.as_str(), peer, space_id)
        .map_err(|e| AndroidStorageError::InvalidPath(e.to_string()))
}

/// Resolves `<filesDir>/workspaces/userspace/<sanitizedPeer>/<userId>.db`.
pub fn resolve_userspace_db_path(
    files_dir: &Path,
    peer: &str,
    user_id: &str,
) -> Result<PathBuf, AndroidStorageError> {
    resolve_android_db_path(files_dir, SpaceType::Userspace, peer, user_id)
}

/// Allowlist-only local workspace catalog (Iron Rule F1: zero disk `*.db` scanning).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AndroidWorkspaceCatalog {
    ordered_ids: Vec<String>,
    id_set: BTreeSet<String>,
}

impl AndroidWorkspaceCatalog {
    /// Builds a catalog from an ordered list of allowlisted workspace IDs.
    pub fn from_ids(ids: impl IntoIterator<Item = String>) -> Self {
        let mut ordered_ids = Vec::new();
        let mut id_set = BTreeSet::new();
        for id in ids {
            if id_set.insert(id.clone()) {
                ordered_ids.push(id);
            }
        }
        Self {
            ordered_ids,
            id_set,
        }
    }

    /// Builds a catalog directly from the `affine-local-workspace` JSON value.
    #[cfg(test)]
    pub fn from_local_storage_json(raw_json: &str) -> Self {
        Self::from_ids(parse_local_workspace_ids(raw_json))
    }

    /// Returns the ordered allowlisted workspace IDs.
    pub fn ids(&self) -> &[String] {
        &self.ordered_ids
    }

    /// Returns `true` if `space_id` is in the explicit allowlist.
    pub fn contains(&self, space_id: &str) -> bool {
        self.id_set.contains(space_id)
    }

    /// Resolves paths only for allowlisted workspace IDs without scanning disk.
    pub fn resolve_all_paths(
        &self,
        files_dir: &Path,
        peer: &str,
    ) -> Result<Vec<(String, PathBuf)>, AndroidStorageError> {
        let mut out = Vec::with_capacity(self.ordered_ids.len());
        for id in &self.ordered_ids {
            let path = resolve_android_db_path(files_dir, SpaceType::Workspace, peer, id)?;
            out.push((id.clone(), path));
        }
        Ok(out)
    }
}

/// Synchronous bridge over `affine_store::sqlite::SqliteDocStorage` for JNI callers.
pub struct AndroidSqliteBridge {
    storages: BTreeMap<String, SqliteDocStorage>,
    runtime: Option<Runtime>,
}

impl Drop for AndroidSqliteBridge {
    fn drop(&mut self) {
        self.close_all();
    }
}

impl std::fmt::Debug for AndroidSqliteBridge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AndroidSqliteBridge")
            .field("connected_keys", &self.storages.keys().collect::<Vec<_>>())
            .finish()
    }
}

impl Default for AndroidSqliteBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl AndroidSqliteBridge {
    /// Creates an idle storage bridge without spawning threads until first connect.
    pub fn new() -> Self {
        Self {
            runtime: None,
            storages: BTreeMap::new(),
        }
    }

    fn runtime_ref(slot: &mut Option<Runtime>) -> Result<&Runtime, AndroidStorageError> {
        if slot.is_none() {
            let rt = Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| AndroidStorageError::Io(e.to_string()))?;
            *slot = Some(rt);
        }
        Ok(slot.as_ref().expect("runtime initialized"))
    }

    /// Builds a deterministic connection key for `(space_type, peer, space_id)`.
    pub fn connection_key(space_type: SpaceType, peer: &str, space_id: &str) -> String {
        format!(
            "{}:{}:{space_id}",
            space_type.as_str(),
            sanitize_peer_name(peer)
        )
    }

    /// Opens a workspace SQLite DB in place (WAL + 5-step migrations).
    ///
    /// - For `peer == "local"`, enforces fail-closed Iron Rule F1: requires
    ///   `local_import_ready` and `catalog.contains(space_id)` so deleted local
    ///   workspace `.db` files on disk are never resurrected.
    /// - For cloud peers (`peer != "local"`), opens the canonical co-storage path
    ///   directly without requiring membership in `affine-local-workspace`.
    pub fn connect_workspace(
        &mut self,
        files_dir: &Path,
        peer: &str,
        space_id: &str,
        catalog: &AndroidWorkspaceCatalog,
        local_import_ready: bool,
    ) -> Result<String, AndroidStorageError> {
        if peer == "local" && (!local_import_ready || !catalog.contains(space_id)) {
            return Err(AndroidStorageError::WorkspaceNotAllowlisted(
                space_id.to_string(),
            ));
        }
        self.connect_internal(files_dir, SpaceType::Workspace, peer, space_id)
    }

    /// Opens an allowlisted local workspace SQLite DB in place.
    pub fn connect_allowlisted_workspace(
        &mut self,
        files_dir: &Path,
        peer: &str,
        space_id: &str,
        catalog: &AndroidWorkspaceCatalog,
    ) -> Result<String, AndroidStorageError> {
        self.connect_workspace(files_dir, peer, space_id, catalog, true)
    }

    /// Returns `true` when the local workspace `space_id` is currently connected.
    pub fn is_local_workspace_connected(&self, space_id: &str) -> bool {
        let key = Self::connection_key(SpaceType::Workspace, "local", space_id);
        self.storages.contains_key(&key)
    }

    /// Closes and evicts any open `workspace:local:<id>` connections whose ID is
    /// no longer in `catalog` (called when the local allowlist shrinks or updates).
    pub fn evict_unlisted_local_workspaces(&mut self, catalog: &AndroidWorkspaceCatalog) -> usize {
        const LOCAL_PREFIX: &str = "workspace:local:";
        let stale: Vec<String> = self
            .storages
            .keys()
            .filter_map(|k| {
                k.strip_prefix(LOCAL_PREFIX)
                    .filter(|id| !catalog.contains(id))
                    .map(|_| k.clone())
            })
            .collect();
        let mut evicted = 0usize;
        for key in stale {
            if self.close(&key) {
                evicted += 1;
            }
        }
        evicted
    }

    /// Opens a `userspace` SQLite DB in place (`<filesDir>/workspaces/userspace/<peer>/<userId>.db`).
    pub fn open_userspace(
        &mut self,
        files_dir: &Path,
        peer: &str,
        user_id: &str,
    ) -> Result<String, AndroidStorageError> {
        self.connect_internal(files_dir, SpaceType::Userspace, peer, user_id)
    }

    fn connect_internal(
        &mut self,
        files_dir: &Path,
        space_type: SpaceType,
        peer: &str,
        space_id: &str,
    ) -> Result<String, AndroidStorageError> {
        let key = Self::connection_key(space_type, peer, space_id);
        if self.storages.contains_key(&key) {
            return Ok(key);
        }
        let db_path = resolve_android_db_path(files_dir, space_type, peer, space_id)?;
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| AndroidStorageError::Io(e.to_string()))?;
        }
        let path_str = db_path.to_string_lossy().to_string();
        let rt = Self::runtime_ref(&mut self.runtime)?;
        let storage = rt
            .block_on(async {
                let storage = SqliteDocStorage::new(path_str);
                storage.connect().await?;
                storage.set_space_id(space_id).await?;
                Ok::<SqliteDocStorage, affine_store::StoreError>(storage)
            })
            .map_err(|e| AndroidStorageError::Store(e.to_string()))?;

        self.storages.insert(key.clone(), storage);
        Ok(key)
    }

    /// Pushes a single CRDT update with an explicit deterministic timestamp (`now_ms`).
    pub fn push_update(
        &mut self,
        connection_key: &str,
        doc_id: &str,
        update: &[u8],
        now_ms: i64,
    ) -> Result<i64, AndroidStorageError> {
        let rt = Self::runtime_ref(&mut self.runtime)?;
        let storage = self
            .storages
            .get(connection_key)
            .ok_or_else(|| AndroidStorageError::NotConnected(connection_key.to_string()))?;
        let ts = rt
            .block_on(storage.push_update(doc_id, update, now_ms))
            .map_err(|e| AndroidStorageError::Store(e.to_string()))?;
        Ok(affine_store::sqlite::naive_utc_to_millis(ts))
    }

    /// Atomically pushes a batch of updates inside a single `BEGIN IMMEDIATE` transaction.
    pub fn push_updates_batch(
        &mut self,
        connection_key: &str,
        updates: &[PendingDocUpdate],
        create_for_peer: Option<&str>,
        now_ms: i64,
    ) -> Result<usize, AndroidStorageError> {
        let rt = Self::runtime_ref(&mut self.runtime)?;
        let storage = self
            .storages
            .get(connection_key)
            .ok_or_else(|| AndroidStorageError::NotConnected(connection_key.to_string()))?;
        let committed = rt
            .block_on(storage.push_updates_batch(updates, create_for_peer, now_ms))
            .map_err(|e| AndroidStorageError::Store(e.to_string()))?;
        Ok(committed.len())
    }

    /// Reads and compacts a document's merged binary state from SQLite.
    pub fn get_doc(
        &mut self,
        connection_key: &str,
        doc_id: &str,
    ) -> Result<Option<Vec<u8>>, AndroidStorageError> {
        let rt = Self::runtime_ref(&mut self.runtime)?;
        let storage = self
            .storages
            .get(connection_key)
            .ok_or_else(|| AndroidStorageError::NotConnected(connection_key.to_string()))?;
        let rec = rt
            .block_on(storage.get_doc(doc_id))
            .map_err(|e| AndroidStorageError::Store(e.to_string()))?;
        Ok(rec.map(|r| r.bin))
    }

    /// Computes the merged diff and state vector for sync round-trips.
    pub fn get_doc_diff(
        &mut self,
        connection_key: &str,
        doc_id: &str,
        remote_state_vector: Option<&[u8]>,
    ) -> Result<Option<DocDiff>, AndroidStorageError> {
        let rt = Self::runtime_ref(&mut self.runtime)?;
        let storage = self
            .storages
            .get(connection_key)
            .ok_or_else(|| AndroidStorageError::NotConnected(connection_key.to_string()))?;
        rt.block_on(storage.get_doc_diff(doc_id, remote_state_vector))
            .map_err(|e| AndroidStorageError::Store(e.to_string()))
    }

    /// Flushes the WAL journal using non-blocking `PRAGMA wal_checkpoint(PASSIVE);`,
    /// safe for Android `onStop()`.
    pub fn checkpoint_passive(
        &mut self,
        connection_key: &str,
    ) -> Result<PassiveCheckpointResult, AndroidStorageError> {
        let rt = Self::runtime_ref(&mut self.runtime)?;
        let storage = self
            .storages
            .get(connection_key)
            .ok_or_else(|| AndroidStorageError::NotConnected(connection_key.to_string()))?;
        let (busy, log, checkpointed) = rt
            .block_on(storage.checkpoint_passive())
            .map_err(|e| AndroidStorageError::Store(e.to_string()))?;
        Ok(PassiveCheckpointResult {
            busy,
            log,
            checkpointed,
        })
    }

    /// Runs non-blocking `PRAGMA wal_checkpoint(PASSIVE);` on every open SQLite DB
    /// (called from `MainActivity.onStop()`), returning the count of checkpointed DBs.
    pub fn checkpoint_all_passive(&mut self) -> usize {
        let keys: Vec<String> = self.storages.keys().cloned().collect();
        let mut count = 0usize;
        for key in keys {
            if self.checkpoint_passive(&key).is_ok() {
                count += 1;
            }
        }
        count
    }

    /// Flushes the WAL journal into the main `.db` file (delegates to non-blocking `PASSIVE`).
    pub fn checkpoint(&mut self, connection_key: &str) -> Result<(), AndroidStorageError> {
        let _ = self.checkpoint_passive(connection_key)?;
        Ok(())
    }

    /// Closes a single connected database cleanly.
    pub fn close(&mut self, connection_key: &str) -> bool {
        let Some(storage) = self.storages.remove(connection_key) else {
            return false;
        };
        if let Some(rt) = &self.runtime {
            rt.block_on(storage.close());
        }
        true
    }

    /// Closes all open databases cleanly.
    pub fn close_all(&mut self) {
        let storages = std::mem::take(&mut self.storages);
        if let Some(rt) = &self.runtime {
            for (_, storage) in storages {
                rt.block_on(storage.close());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;
    use std::time::Duration;

    use affine_store::sqlite::get_migrator;
    use sqlx::Connection;
    use sqlx::migrate::{MigrateDatabase, Migration, Migrator};
    use sqlx::sqlite::{Sqlite, SqliteConnectOptions};
    use y_octo::DocOptions;

    use super::*;

    fn unique_temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "affine-android-host-{label}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn allowlist_never_resurrects_deleted_workspace_db_on_disk() {
        let files_dir = unique_temp_dir("f1-no-resurrection");
        let active_path =
            resolve_android_db_path(&files_dir, SpaceType::Workspace, "local", "ws-active")
                .unwrap();
        let deleted_path =
            resolve_android_db_path(&files_dir, SpaceType::Workspace, "local", "ws-deleted")
                .unwrap();
        std::fs::create_dir_all(active_path.parent().unwrap()).unwrap();
        std::fs::write(&deleted_path, b"residual-0275-db").unwrap();

        let catalog = AndroidWorkspaceCatalog::from_local_storage_json(
            r#"["ws-active", 42, "ws-active", null]"#,
        );
        assert_eq!(catalog.ids(), &["ws-active".to_string()]);
        assert!(!catalog.contains("ws-deleted"));

        let mut bridge = AndroidSqliteBridge::new();
        assert_eq!(
            bridge.connect_allowlisted_workspace(&files_dir, "local", "ws-deleted", &catalog),
            Err(AndroidStorageError::WorkspaceNotAllowlisted(
                "ws-deleted".to_string()
            ))
        );
        let key = bridge
            .connect_workspace(&files_dir, "local", "ws-active", &catalog, true)
            .unwrap();
        assert!(active_path.exists());

        // Cloud workspaces (peer != "local") open directly even when not in affine-local-workspace.
        let cloud_key = bridge
            .connect_workspace(
                &files_dir,
                "https://app.affine.pro",
                "ws-cloud-1",
                &catalog,
                false,
            )
            .unwrap();
        assert!(
            resolve_android_db_path(
                &files_dir,
                SpaceType::Workspace,
                "https://app.affine.pro",
                "ws-cloud-1"
            )
            .unwrap()
            .exists()
        );

        // Shrinking local allowlist to empty evicts old local handles without closing cloud handles.
        let empty_catalog = AndroidWorkspaceCatalog::default();
        assert_eq!(bridge.evict_unlisted_local_workspaces(&empty_catalog), 1);
        assert!(bridge.get_doc(&key, "doc-1").is_err());
        assert!(bridge.get_doc(&cloud_key, "doc-1").is_ok());

        bridge.close_all();
        let _ = std::fs::remove_dir_all(&files_dir);
    }

    #[test]
    fn in_place_0274_db_upgrade_offline_edit_and_sync_roundtrip() {
        let files_dir = unique_temp_dir("0274-inplace-roundtrip");
        let db_path = resolve_android_db_path(
            &files_dir,
            SpaceType::Workspace,
            "https://app.affine.pro/",
            "ws-legacy",
        )
        .unwrap();
        assert!(
            db_path
                .to_string_lossy()
                .ends_with("/workspaces/workspace/https_app.affine.pro/ws-legacy.db")
        );
        std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();

        // Seed a 0.27.4-style DB: 4 migrations with trailing-space migration #3 checksum + initial doc "hello".
        let rt = Builder::new_current_thread().enable_all().build().unwrap();
        let path_str = db_path.to_string_lossy().to_string();
        let initial_doc = DocOptions::from_identity(1, "doc-1".into()).build();
        initial_doc
            .get_or_create_text("content")
            .unwrap()
            .insert(0, "hello")
            .unwrap();
        let initial_bin = initial_doc.encode_update_v1().unwrap();
        let initial_sv_bytes = y_octo::encode_state_vector_from_update_v1(&initial_bin).unwrap();

        rt.block_on(async {
            Sqlite::create_database(&path_str).await.unwrap();
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&path_str)
                .await
                .unwrap();
            let full = get_migrator();
            let mut migs = full.migrations.to_vec();
            let m3 = migs[2].clone();
            migs[2] = Migration::new(
                m3.version,
                m3.description.clone(),
                m3.migration_type,
                Cow::Owned(format!("{} ", m3.sql)),
                m3.no_tx,
            );
            migs.truncate(4);
            let legacy_migrator = Migrator {
                migrations: Cow::Owned(migs),
                ..Migrator::DEFAULT
            };
            legacy_migrator.run(&pool).await.unwrap();
            pool.close().await;

            let legacy_store = SqliteDocStorage::new(&path_str);
            legacy_store.set_space_id("ws-legacy").await.unwrap();
            legacy_store
                .push_update("doc-1", &initial_bin, 1_700_000_000_000)
                .await
                .unwrap();
            legacy_store.close().await;
        });

        // Open in place via AndroidSqliteBridge (repairs migration #3 + applies #5 + WAL).
        let catalog = AndroidWorkspaceCatalog::from_ids(vec!["ws-legacy".to_string()]);
        let mut bridge = AndroidSqliteBridge::new();
        let key = bridge
            .connect_allowlisted_workspace(
                &files_dir,
                "https://app.affine.pro/",
                "ws-legacy",
                &catalog,
            )
            .unwrap();

        let loaded_bin = bridge.get_doc(&key, "doc-1").unwrap().unwrap();
        let mut offline_doc = DocOptions::from_identity(2, "doc-1".into()).build();
        offline_doc
            .apply_update_from_binary_v1(&loaded_bin)
            .unwrap();
        assert_eq!(
            offline_doc
                .get_or_create_text("content")
                .unwrap()
                .to_string(),
            "hello"
        );

        // Offline 1-character edit ("hello" -> "hello!") persisted via BEGIN IMMEDIATE batch.
        let before_edit_sv = offline_doc.get_state_vector();
        offline_doc
            .get_or_create_text("content")
            .unwrap()
            .insert(5, "!")
            .unwrap();
        let edit_delta = offline_doc
            .encode_state_as_update_v1(&before_edit_sv)
            .unwrap();
        let committed = bridge
            .push_updates_batch(
                &key,
                &[PendingDocUpdate {
                    doc_id: "doc-1".into(),
                    update: edit_delta,
                }],
                Some("https://app.affine.pro"),
                1_700_000_010_000,
            )
            .unwrap();
        assert_eq!(committed, 1);

        // Sync diff against remote's initial state vector carries the offline edit.
        let diff = bridge
            .get_doc_diff(&key, "doc-1", Some(&initial_sv_bytes))
            .unwrap()
            .unwrap();
        let mut remote_0275 = DocOptions::from_identity(99, "doc-1".into()).build();
        remote_0275
            .apply_update_from_binary_v1(&initial_bin)
            .unwrap();
        remote_0275
            .apply_update_from_binary_v1(&diff.missing)
            .unwrap();
        assert_eq!(
            remote_0275
                .get_or_create_text("content")
                .unwrap()
                .to_string(),
            "hello!"
        );

        // Checkpoint, close, and reopen with raw affine-store (simulating 0.27.5 rollback read-back).
        bridge.checkpoint(&key).unwrap();
        bridge.close_all();

        let reopened_bin = rt.block_on(async {
            let rollback_store = SqliteDocStorage::new(&path_str);
            rollback_store.connect().await.unwrap();
            let rec = rollback_store.get_doc("doc-1").await.unwrap().unwrap();
            rollback_store.close().await;
            rec.bin
        });
        let mut verify = DocOptions::from_identity(100, "doc-1".into()).build();
        verify.apply_update_from_binary_v1(&reopened_bin).unwrap();
        assert_eq!(
            verify.get_or_create_text("content").unwrap().to_string(),
            "hello!"
        );

        // Userspace DB path & connect check.
        let user_key = bridge
            .open_userspace(&files_dir, "https://app.affine.pro/", "user-42")
            .unwrap();
        let user_db =
            resolve_userspace_db_path(&files_dir, "https://app.affine.pro/", "user-42").unwrap();
        assert!(user_db.exists());

        // Passive WAL checkpoint must not block even while a concurrent reader holds a read tx.
        let mut reader = rt.block_on(async {
            let mut conn = sqlx::sqlite::SqliteConnection::connect_with(
                &SqliteConnectOptions::new()
                    .filename(user_db.to_string_lossy().as_ref())
                    .busy_timeout(Duration::from_millis(SQLITE_BUSY_TIMEOUT_MS)),
            )
            .await
            .unwrap();
            sqlx::query("BEGIN TRANSACTION;")
                .execute(&mut conn)
                .await
                .unwrap();
            let _ = sqlx::query("SELECT COUNT(*) FROM meta;")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            conn
        });
        bridge
            .push_update(&user_key, "u-doc", &[0u8, 0u8], 1_700_000_020_000)
            .unwrap();
        let passive = bridge.checkpoint_passive(&user_key).unwrap();
        assert!(passive.log >= 0);
        assert_eq!(bridge.checkpoint_all_passive(), 1);
        rt.block_on(async {
            sqlx::query("COMMIT;").execute(&mut reader).await.unwrap();
            reader.close().await.unwrap();
        });

        bridge.close(&user_key);

        let _ = std::fs::remove_dir_all(&files_dir);
    }
}
