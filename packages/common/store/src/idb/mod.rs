//! Cross-platform IndexedDB v3 storage model, V1 read-only fallback, and `BroadcastChannel` DTOs.
//!
//! Mirrors `packages/common/nbstore/src/impls/idb/` (`schema.ts`, `db.ts`, `doc.ts`, `v1/`).
//! In browser runtimes, real 12-store IndexedDB persistence and structured-clone `BroadcastChannel`
//! delivery are hosted by `packages/frontend/hosts/web/src/idb-storage.js`.

pub mod origin;
pub mod v1;

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, Mutex},
};

use y_octo::{merge_updates_v1, validate_update_v1};

use crate::{
    error::{StoreError, StoreResult},
    sync::SpaceType,
    workspace_db::PendingDocUpdate,
};

pub use origin::{
    IdbBlobSyncRecord, IdbChannelDocUpdate, IdbChannelMessage, IdbIndexerSyncRecord,
    IdbSharedOrigin,
};
pub use v1::{
    IDB_V1_BLOB_STORE_NAME, IDB_V1_CONST_TIMESTAMP_MS, IDB_V1_DOC_DB_NAME, IDB_V1_DOC_STORE_NAME,
    IdbHostPlatform, IdbV1BlobRecord, IdbV1BlobStorage, IdbV1DocRecord, IdbV1DocStorage,
    IdbV1ListedBlob, IdbV1RawUpdate, idb_v1_blob_db_name, is_idb_v1_fallback_enabled,
};

/// Frozen IndexedDB schema version (`migrations.length === 3` in `schema.ts`).
pub const IDB_SCHEMA_VERSION: u32 = 3;

/// Exact key path specification for an IndexedDB object store or index.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IdbKeyPath {
    None,
    Single(&'static str),
    Compound(&'static [&'static str]),
}

/// Exact index definition on an IndexedDB object store.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct IdbIndexSpec {
    pub name: &'static str,
    pub key_path: IdbKeyPath,
    pub unique: bool,
}

/// Exact object store definition matching `packages/common/nbstore/src/impls/idb/schema.ts`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct IdbStoreSpec {
    pub name: &'static str,
    pub key_path: IdbKeyPath,
    pub auto_increment: bool,
    pub indexes: &'static [IdbIndexSpec],
    pub added_in_version: u32,
}

/// Ordered migration steps for IndexedDB schema upgrades (`0 -> 1 -> 2 -> 3`).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IdbMigrationStep {
    Init = 1,
    InitBlobSync = 2,
    InitIndexer = 3,
}

const SNAPSHOTS_INDEXES: &[IdbIndexSpec] = &[IdbIndexSpec {
    name: "updatedAt",
    key_path: IdbKeyPath::Single("updatedAt"),
    unique: false,
}];

const UPDATES_INDEXES: &[IdbIndexSpec] = &[IdbIndexSpec {
    name: "docId",
    key_path: IdbKeyPath::Single("docId"),
    unique: false,
}];

const CLOCKS_INDEXES: &[IdbIndexSpec] = &[IdbIndexSpec {
    name: "timestamp",
    key_path: IdbKeyPath::Single("timestamp"),
    unique: false,
}];

const PEER_CLOCKS_INDEXES: &[IdbIndexSpec] = &[IdbIndexSpec {
    name: "peer",
    key_path: IdbKeyPath::Single("peer"),
    unique: false,
}];

const BLOB_SYNC_INDEXES: &[IdbIndexSpec] = &[IdbIndexSpec {
    name: "peer",
    key_path: IdbKeyPath::Single("peer"),
    unique: false,
}];

const INDEXER_RECORDS_INDEXES: &[IdbIndexSpec] = &[
    IdbIndexSpec {
        name: "table",
        key_path: IdbKeyPath::Single("table"),
        unique: false,
    },
    IdbIndexSpec {
        name: "id",
        key_path: IdbKeyPath::Compound(&["table", "id"]),
        unique: true,
    },
];

const INVERTED_INDEX_INDEXES: &[IdbIndexSpec] = &[
    IdbIndexSpec {
        name: "key",
        key_path: IdbKeyPath::Compound(&["table", "key"]),
        unique: false,
    },
    IdbIndexSpec {
        name: "nid",
        key_path: IdbKeyPath::Single("nid"),
        unique: false,
    },
];

/// All 12 IndexedDB v3 object stores in migration order.
pub const IDB_OBJECT_STORES: &[IdbStoreSpec] = &[
    IdbStoreSpec {
        name: "snapshots",
        key_path: IdbKeyPath::Single("docId"),
        auto_increment: false,
        indexes: SNAPSHOTS_INDEXES,
        added_in_version: 1,
    },
    IdbStoreSpec {
        name: "updates",
        key_path: IdbKeyPath::Compound(&["docId", "createdAt"]),
        auto_increment: false,
        indexes: UPDATES_INDEXES,
        added_in_version: 1,
    },
    IdbStoreSpec {
        name: "clocks",
        key_path: IdbKeyPath::Single("docId"),
        auto_increment: false,
        indexes: CLOCKS_INDEXES,
        added_in_version: 1,
    },
    IdbStoreSpec {
        name: "peerClocks",
        key_path: IdbKeyPath::Compound(&["peer", "docId"]),
        auto_increment: false,
        indexes: PEER_CLOCKS_INDEXES,
        added_in_version: 1,
    },
    IdbStoreSpec {
        name: "blobs",
        key_path: IdbKeyPath::Single("key"),
        auto_increment: false,
        indexes: &[],
        added_in_version: 1,
    },
    IdbStoreSpec {
        name: "blobData",
        key_path: IdbKeyPath::Single("key"),
        auto_increment: false,
        indexes: &[],
        added_in_version: 1,
    },
    IdbStoreSpec {
        name: "locks",
        key_path: IdbKeyPath::Single("key"),
        auto_increment: false,
        indexes: &[],
        added_in_version: 1,
    },
    IdbStoreSpec {
        name: "blobSync",
        key_path: IdbKeyPath::Compound(&["peer", "key"]),
        auto_increment: false,
        indexes: BLOB_SYNC_INDEXES,
        added_in_version: 2,
    },
    IdbStoreSpec {
        name: "indexerMetadata",
        key_path: IdbKeyPath::Single("key"),
        auto_increment: false,
        indexes: &[],
        added_in_version: 3,
    },
    IdbStoreSpec {
        name: "indexerRecords",
        key_path: IdbKeyPath::None,
        auto_increment: true,
        indexes: INDEXER_RECORDS_INDEXES,
        added_in_version: 3,
    },
    IdbStoreSpec {
        name: "invertedIndex",
        key_path: IdbKeyPath::None,
        auto_increment: true,
        indexes: INVERTED_INDEX_INDEXES,
        added_in_version: 3,
    },
    IdbStoreSpec {
        name: "indexerSync",
        key_path: IdbKeyPath::Single("docId"),
        auto_increment: false,
        indexes: &[],
        added_in_version: 3,
    },
];

/// Return the migration steps required to upgrade an IndexedDB database from `old_version` to v3.
pub fn migration_steps_for_upgrade(old_version: u32) -> &'static [IdbMigrationStep] {
    const ALL: &[IdbMigrationStep] = &[
        IdbMigrationStep::Init,
        IdbMigrationStep::InitBlobSync,
        IdbMigrationStep::InitIndexer,
    ];
    let start = (old_version as usize).min(ALL.len());
    &ALL[start..]
}

/// Format the IndexedDB database name matching `IDBConnection.dbName` (`${flavour}:${type}:${id}`).
pub fn idb_db_name(flavour: &str, space_type: SpaceType, id: &str) -> String {
    format!("{flavour}:{}:{id}", space_type.as_str())
}

/// Format the shared connection identifier (`idb(3):${dbName}`).
pub fn idb_share_id(db_name: &str) -> String {
    format!("idb({IDB_SCHEMA_VERSION}):{db_name}")
}

/// Format the cross-tab `BroadcastChannel` name (`idb:${dbName}`).
pub fn idb_broadcast_channel_name(db_name: &str) -> String {
    format!("idb:{db_name}")
}

/// Snapshot row in the `snapshots` object store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbSnapshotRecord {
    pub doc_id: String,
    pub bin: Vec<u8>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

/// Peer clock row in the `peerClocks` object store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbPeerClockRecord {
    pub peer: String,
    pub doc_id: String,
    pub clock_ms: i64,
    pub pulled_clock_ms: i64,
    pub pushed_clock_ms: i64,
    pub pending_create: bool,
    pub cache_token: u64,
}

impl IdbPeerClockRecord {
    pub fn new(peer: impl Into<String>, doc_id: impl Into<String>) -> Self {
        Self {
            peer: peer.into(),
            doc_id: doc_id.into(),
            clock_ms: 0,
            pulled_clock_ms: 0,
            pushed_clock_ms: 0,
            pending_create: false,
            cache_token: 0,
        }
    }
}

/// Blob metadata row in the `blobs` object store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbBlobMeta {
    pub key: String,
    pub mime: String,
    pub size: usize,
    pub created_at_ms: i64,
    pub deleted_at_ms: Option<i64>,
}

/// Merged document record returned by [`IdbWorkspaceStore::get_doc`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbDocRecord {
    pub doc_id: String,
    pub bin: Vec<u8>,
    pub timestamp_ms: i64,
}

/// Pure-Rust IndexedDB v3 workspace store backed by an [`IdbSharedOrigin`].
#[derive(Debug)]
pub struct IdbWorkspaceStore {
    flavour: String,
    space_type: SpaceType,
    space_id: String,
    db: Arc<Mutex<origin::IdbDatabaseState>>,
    subscriber_id: u64,
    outbound_channel: Vec<IdbChannelMessage>,
}

impl Drop for IdbWorkspaceStore {
    fn drop(&mut self) {
        let mut guard = self.db.lock().unwrap_or_else(|err| err.into_inner());
        guard.unregister_subscriber(self.subscriber_id);
    }
}

impl IdbWorkspaceStore {
    /// Open an isolated store backed by a fresh single-database origin.
    pub fn new(
        flavour: impl Into<String>,
        space_type: SpaceType,
        space_id: impl Into<String>,
    ) -> Self {
        Self::open_in_origin(&IdbSharedOrigin::new(), flavour, space_type, space_id)
    }

    /// Open (or reopen) a named database in `origin`, sharing persistence and cross-tab
    /// `BroadcastChannel` events with any other handle opened against the same `origin`.
    pub fn open_in_origin(
        origin: &IdbSharedOrigin,
        flavour: impl Into<String>,
        space_type: SpaceType,
        space_id: impl Into<String>,
    ) -> Self {
        let flavour = flavour.into();
        let space_id = space_id.into();
        let db_name = idb_db_name(&flavour, space_type, &space_id);
        let db = origin.open_db(&db_name);
        let subscriber_id = db
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .register_subscriber();
        Self {
            flavour,
            space_type,
            space_id,
            db,
            subscriber_id,
            outbound_channel: Vec::new(),
        }
    }

    pub fn db_name(&self) -> String {
        idb_db_name(&self.flavour, self.space_type, &self.space_id)
    }

    pub fn channel_name(&self) -> String {
        idb_broadcast_channel_name(&self.db_name())
    }

    /// Drain messages published by this handle since the last drain.
    pub fn drain_channel_messages(&mut self) -> Vec<IdbChannelMessage> {
        std::mem::take(&mut self.outbound_channel)
    }

    /// Poll cross-tab `BroadcastChannel` messages received from sibling handles on the same origin.
    pub fn poll_channel_messages(&mut self) -> Vec<IdbChannelMessage> {
        self.db
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .drain_inbox(self.subscriber_id)
    }

    fn apply_doc_update_locked(
        db: &mut origin::IdbDatabaseState,
        space_id: &str,
        doc_id: &str,
        bin: Vec<u8>,
        create_for_peer: Option<&str>,
        origin_tag: Option<&str>,
        now_ms: i64,
    ) -> (i64, IdbChannelMessage) {
        let prev = db.clocks.get(doc_id).copied().unwrap_or(0);
        let timestamp_ms = now_ms.max(prev.saturating_add(1));
        db.updates
            .insert((doc_id.to_string(), timestamp_ms), bin.clone());
        db.clocks.insert(doc_id.to_string(), timestamp_ms);

        if let Some(peer) = create_for_peer {
            let entry = db
                .peer_clocks
                .entry((peer.to_string(), doc_id.to_string()))
                .or_insert_with(|| IdbPeerClockRecord::new(peer, doc_id));
            entry.pending_create = true;
            let root = db
                .peer_clocks
                .entry((peer.to_string(), space_id.to_string()))
                .or_insert_with(|| IdbPeerClockRecord::new(peer, space_id));
            root.cache_token = root.cache_token.saturating_add(1);
        }

        let msg = IdbChannelMessage::Update {
            update: IdbChannelDocUpdate {
                doc_id: doc_id.to_string(),
                bin,
                timestamp: timestamp_ms,
                editor: None,
                create_for_peer: create_for_peer.map(str::to_string),
            },
            origin: origin_tag.map(str::to_string),
        };
        (timestamp_ms, msg)
    }

    /// Push a single document update with monotonic per-doc timestamps and optional `create_for_peer`.
    pub fn push_doc_update(
        &mut self,
        doc_id: &str,
        bin: Vec<u8>,
        create_for_peer: Option<&str>,
        origin_tag: Option<&str>,
        now_ms: i64,
    ) -> StoreResult<i64> {
        if !bin.is_empty() && bin != [0, 0] {
            validate_update_v1(&bin).map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
        }
        let mut db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        let (timestamp_ms, msg) = Self::apply_doc_update_locked(
            &mut db,
            &self.space_id,
            doc_id,
            bin,
            create_for_peer,
            origin_tag,
            now_ms,
        );
        db.broadcast(self.subscriber_id, msg.clone());
        self.outbound_channel.push(msg);
        Ok(timestamp_ms)
    }

    /// Atomically apply a batch of [`PendingDocUpdate`] entries inside a single lock critical
    /// section, committing all updates before broadcasting any cross-tab notifications.
    pub fn push_updates_batch(
        &mut self,
        updates: &[PendingDocUpdate],
        create_for_peer: Option<&str>,
        now_ms: i64,
    ) -> StoreResult<Vec<(String, i64)>> {
        for item in updates {
            if !item.update.is_empty() && item.update != [0, 0] {
                validate_update_v1(&item.update)
                    .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
            }
        }
        let mut db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        let mut results = Vec::with_capacity(updates.len());
        let mut messages = Vec::with_capacity(updates.len());
        for item in updates {
            if item.update.is_empty() || item.update == [0, 0] {
                continue;
            }
            let (ts, msg) = Self::apply_doc_update_locked(
                &mut db,
                &self.space_id,
                &item.doc_id,
                item.update.clone(),
                create_for_peer,
                None,
                now_ms,
            );
            results.push((item.doc_id.clone(), ts));
            messages.push(msg);
        }
        for msg in messages {
            db.broadcast(self.subscriber_id, msg.clone());
            self.outbound_channel.push(msg);
        }
        Ok(results)
    }

    /// Read and merge the snapshot + incremental updates for `doc_id`.
    pub fn get_doc(&self, doc_id: &str) -> StoreResult<Option<IdbDocRecord>> {
        let db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        let snapshot = db.snapshots.get(doc_id);
        let doc_updates: Vec<(i64, Vec<u8>)> = db
            .updates
            .range((doc_id.to_string(), i64::MIN)..=(doc_id.to_string(), i64::MAX))
            .map(|((_, ts), bin)| (*ts, bin.clone()))
            .collect();

        if doc_updates.is_empty() {
            return Ok(snapshot.map(|s| IdbDocRecord {
                doc_id: doc_id.to_string(),
                bin: s.bin.clone(),
                timestamp_ms: s.updated_at_ms,
            }));
        }

        let mut sources: Vec<&[u8]> = Vec::with_capacity(doc_updates.len() + 1);
        let mut max_ts = i64::MIN;
        if let Some(snap) = snapshot {
            if !snap.bin.is_empty() && snap.bin != [0, 0] {
                sources.push(&snap.bin);
            }
            max_ts = max_ts.max(snap.updated_at_ms);
        }
        for (ts, bin) in &doc_updates {
            if !bin.is_empty() && bin.as_slice() != [0, 0] {
                sources.push(bin.as_slice());
            }
            max_ts = max_ts.max(*ts);
        }

        let merged = match sources.as_slice() {
            [] => vec![0, 0],
            [single] => (*single).to_vec(),
            many => merge_updates_v1(many.iter().copied())
                .and_then(|u| u.encode_v1())
                .map_err(|err| StoreError::InvalidBinary(err.to_string()))?,
        };
        Ok(Some(IdbDocRecord {
            doc_id: doc_id.to_string(),
            bin: merged,
            timestamp_ms: max_ts,
        }))
    }

    /// Delete a document from `snapshots`, `updates`, and `clocks`, clear matching `pending_create`
    /// flags in `peerClocks` (incrementing the peer root `cache_token`), and broadcast deletion.
    pub fn delete_doc(&mut self, doc_id: &str) {
        let mut db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        db.snapshots.remove(doc_id);
        db.clocks.remove(doc_id);
        let keys: Vec<(String, i64)> = db
            .updates
            .range((doc_id.to_string(), i64::MIN)..=(doc_id.to_string(), i64::MAX))
            .map(|(k, _)| k.clone())
            .collect();
        for key in keys {
            db.updates.remove(&key);
        }

        let affected_peers: Vec<String> = db
            .peer_clocks
            .iter_mut()
            .filter_map(|((peer, rec_doc_id), record)| {
                if rec_doc_id == doc_id && record.pending_create {
                    record.pending_create = false;
                    Some(peer.clone())
                } else {
                    None
                }
            })
            .collect();
        for peer in affected_peers {
            let root = db
                .peer_clocks
                .entry((peer.clone(), self.space_id.clone()))
                .or_insert_with(|| IdbPeerClockRecord::new(peer, &self.space_id));
            root.cache_token = root.cache_token.saturating_add(1);
        }

        let msg = IdbChannelMessage::Delete {
            doc_id: doc_id.to_string(),
        };
        db.broadcast(self.subscriber_id, msg.clone());
        self.outbound_channel.push(msg);
    }

    pub fn get_doc_timestamps(&self, after_ms: Option<i64>) -> BTreeMap<String, i64> {
        let db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        db.clocks
            .iter()
            .filter(|(_, ts)| after_ms.is_none_or(|cutoff| **ts > cutoff))
            .map(|(id, ts)| (id.clone(), *ts))
            .collect()
    }

    pub fn peer_clock(&self, peer: &str, doc_id: &str) -> Option<IdbPeerClockRecord> {
        let db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        db.peer_clocks
            .get(&(peer.to_string(), doc_id.to_string()))
            .cloned()
    }

    pub fn put_blob(&mut self, key: &str, mime: &str, data: Vec<u8>, now_ms: i64) {
        let mut db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        let size = data.len();
        db.blobs.insert(
            key.to_string(),
            IdbBlobMeta {
                key: key.to_string(),
                mime: mime.to_string(),
                size,
                created_at_ms: now_ms,
                deleted_at_ms: None,
            },
        );
        db.blob_data.insert(key.to_string(), data);
    }

    pub fn get_blob(&self, key: &str) -> Option<(IdbBlobMeta, Vec<u8>)> {
        let db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        let meta = db.blobs.get(key)?;
        if meta.deleted_at_ms.is_some() {
            return None;
        }
        let data = db.blob_data.get(key)?;
        Some((meta.clone(), data.clone()))
    }

    pub fn set_blob_sync(&mut self, peer: &str, key: &str, uploaded_at_ms: Option<i64>) {
        let mut db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        db.blob_sync.insert(
            (peer.to_string(), key.to_string()),
            IdbBlobSyncRecord {
                peer: peer.to_string(),
                key: key.to_string(),
                uploaded_at_ms,
            },
        );
    }

    pub fn get_blob_sync(&self, peer: &str, key: &str) -> Option<IdbBlobSyncRecord> {
        let db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        db.blob_sync
            .get(&(peer.to_string(), key.to_string()))
            .cloned()
    }

    pub fn set_indexer_sync(&mut self, doc_id: &str, indexed_clock_ms: i64, version: Option<u32>) {
        let mut db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        db.indexer_sync.insert(
            doc_id.to_string(),
            IdbIndexerSyncRecord {
                doc_id: doc_id.to_string(),
                indexed_clock_ms,
                indexer_version: version,
            },
        );
    }

    pub fn get_indexer_sync(&self, doc_id: &str) -> Option<IdbIndexerSyncRecord> {
        let db = self.db.lock().unwrap_or_else(|err| err.into_inner());
        db.indexer_sync.get(doc_id).cloned()
    }

    pub fn all_store_names(&self) -> BTreeSet<&'static str> {
        IDB_OBJECT_STORES.iter().map(|s| s.name).collect()
    }
}

/// Userspace-scoped IndexedDB v3 store (`${flavour}:userspace:${userId}`).
#[derive(Debug)]
pub struct IdbUserspaceStore {
    inner: IdbWorkspaceStore,
}

impl IdbUserspaceStore {
    pub fn open_in_origin(
        origin: &IdbSharedOrigin,
        flavour: impl Into<String>,
        user_id: impl Into<String>,
    ) -> Self {
        Self {
            inner: IdbWorkspaceStore::open_in_origin(
                origin,
                flavour,
                SpaceType::Userspace,
                user_id,
            ),
        }
    }

    pub fn db_name(&self) -> String {
        self.inner.db_name()
    }

    pub fn channel_name(&self) -> String {
        self.inner.channel_name()
    }

    pub fn push_doc_update(
        &mut self,
        doc_id: &str,
        bin: Vec<u8>,
        origin_tag: Option<&str>,
        now_ms: i64,
    ) -> StoreResult<i64> {
        self.inner
            .push_doc_update(doc_id, bin, None, origin_tag, now_ms)
    }

    pub fn get_doc(&self, doc_id: &str) -> StoreResult<Option<IdbDocRecord>> {
        self.inner.get_doc(doc_id)
    }

    pub fn delete_doc(&mut self, doc_id: &str) {
        self.inner.delete_doc(doc_id);
    }

    pub fn poll_channel_messages(&mut self) -> Vec<IdbChannelMessage> {
        self.inner.poll_channel_messages()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace_db::WorkspaceDb;

    #[test]
    fn idb_v3_schema_matches_all_12_object_stores_and_naming_contract() {
        assert_eq!(IDB_SCHEMA_VERSION, 3);
        assert_eq!(IDB_OBJECT_STORES.len(), 12);

        let names: Vec<&str> = IDB_OBJECT_STORES.iter().map(|s| s.name).collect();
        assert_eq!(
            names,
            vec![
                "snapshots",
                "updates",
                "clocks",
                "peerClocks",
                "blobs",
                "blobData",
                "locks",
                "blobSync",
                "indexerMetadata",
                "indexerRecords",
                "invertedIndex",
                "indexerSync",
            ]
        );

        assert_eq!(migration_steps_for_upgrade(0).len(), 3);
        assert_eq!(migration_steps_for_upgrade(1).len(), 2);
        assert_eq!(migration_steps_for_upgrade(2).len(), 1);
        assert_eq!(migration_steps_for_upgrade(3).len(), 0);

        let db_name = idb_db_name("local", SpaceType::Workspace, "ws-42");
        assert_eq!(db_name, "local:workspace:ws-42");
        assert_eq!(idb_share_id(&db_name), "idb(3):local:workspace:ws-42");
        assert_eq!(
            idb_broadcast_channel_name(&db_name),
            "idb:local:workspace:ws-42"
        );
    }

    #[test]
    fn idb_shared_origin_persists_across_reopen_broadcasts_between_tabs_and_supports_userspace() {
        let origin = IdbSharedOrigin::new();
        let mut ws = WorkspaceDb::new("ws-1", "u1", 1);
        let init_update = ws.initialize_meta().unwrap().unwrap();

        let mut tab_a =
            IdbWorkspaceStore::open_in_origin(&origin, "local", SpaceType::Workspace, "ws-1");
        let mut tab_b =
            IdbWorkspaceStore::open_in_origin(&origin, "local", SpaceType::Workspace, "ws-1");

        let ts = tab_a
            .push_doc_update(
                "ws-1",
                init_update.clone(),
                Some("cloud"),
                Some("local"),
                1_000,
            )
            .unwrap();
        assert_eq!(ts, 1_000);
        tab_a.put_blob("b1", "image/png", vec![1, 2, 3], 1_001);
        tab_a.set_blob_sync("cloud", "b1", Some(1_002));
        tab_a.set_indexer_sync("ws-1", 1_000, Some(2));

        // Tab B immediately receives the 0.27.5 BroadcastChannel update message.
        let b_inbox = tab_b.poll_channel_messages();
        assert_eq!(b_inbox.len(), 1);
        assert_eq!(
            b_inbox[0],
            IdbChannelMessage::Update {
                update: IdbChannelDocUpdate {
                    doc_id: "ws-1".into(),
                    bin: init_update.clone(),
                    timestamp: 1_000,
                    editor: None,
                    create_for_peer: Some("cloud".into()),
                },
                origin: Some("local".into()),
            }
        );

        // Close Tab A and reopen on the same origin: all stores survive intact.
        drop(tab_a);
        let mut reopened =
            IdbWorkspaceStore::open_in_origin(&origin, "local", SpaceType::Workspace, "ws-1");
        assert_eq!(reopened.get_doc("ws-1").unwrap().unwrap().bin, init_update);
        assert!(reopened.peer_clock("cloud", "ws-1").unwrap().pending_create);
        assert_eq!(reopened.peer_clock("cloud", "ws-1").unwrap().cache_token, 1);
        assert_eq!(reopened.get_blob("b1").unwrap().1, vec![1, 2, 3]);
        assert_eq!(
            reopened
                .get_blob_sync("cloud", "b1")
                .unwrap()
                .uploaded_at_ms,
            Some(1_002)
        );
        assert_eq!(
            reopened.get_indexer_sync("ws-1").unwrap().indexer_version,
            Some(2)
        );

        // Delete clears pending_create, increments cache_token, and broadcasts delete to Tab B.
        reopened.delete_doc("ws-1");
        assert!(reopened.get_doc("ws-1").unwrap().is_none());
        assert!(!reopened.peer_clock("cloud", "ws-1").unwrap().pending_create);
        assert_eq!(reopened.peer_clock("cloud", "ws-1").unwrap().cache_token, 2);
        assert_eq!(
            tab_b.poll_channel_messages(),
            vec![IdbChannelMessage::Delete {
                doc_id: "ws-1".into()
            }]
        );

        // Userspace store uses `${flavour}:userspace:${userId}` and persists across reopen.
        let mut user_a = IdbUserspaceStore::open_in_origin(&origin, "cloud", "user-7");
        assert_eq!(user_a.db_name(), "cloud:userspace:user-7");
        user_a
            .push_doc_update("settings", vec![0, 0], Some("local"), 2_000)
            .unwrap();
        drop(user_a);
        let user_b = IdbUserspaceStore::open_in_origin(&origin, "cloud", "user-7");
        assert_eq!(
            user_b.get_doc("settings").unwrap().unwrap().timestamp_ms,
            2_000
        );

        // Atomic batch commit: Handle B sees BOTH root and child docs upon receiving the first message.
        let batch_origin = IdbSharedOrigin::new();
        let mut handle_a =
            IdbWorkspaceStore::open_in_origin(&batch_origin, "local", SpaceType::Workspace, "ws-b");
        let mut handle_b =
            IdbWorkspaceStore::open_in_origin(&batch_origin, "local", SpaceType::Workspace, "ws-b");
        let mut ws_b = WorkspaceDb::new("ws-b", "u1", 1);
        let root_bin = ws_b.initialize_meta().unwrap().unwrap();
        let child_bin = root_bin.clone();
        handle_a
            .push_updates_batch(
                &[
                    PendingDocUpdate {
                        doc_id: "ws-b".into(),
                        update: root_bin,
                    },
                    PendingDocUpdate {
                        doc_id: "child-1".into(),
                        update: child_bin,
                    },
                ],
                None,
                3_000,
            )
            .unwrap();
        let first_msgs = handle_b.poll_channel_messages();
        assert_eq!(first_msgs.len(), 2);
        assert!(handle_b.get_doc("ws-b").unwrap().is_some());
        assert!(handle_b.get_doc("child-1").unwrap().is_some());
    }
}
