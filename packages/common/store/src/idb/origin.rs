//! Shared in-memory origin backend and `0.27.5` `BroadcastChannel` DTOs for IndexedDB v3 stores.
//!
//! In browser runtimes, real 12-store IndexedDB persistence and structured-clone `BroadcastChannel`
//! delivery are hosted by `packages/frontend/hosts/web/src/idb-storage.js`. This module provides a
//! deterministic, zero-`web-sys` shared origin (`IdbSharedOrigin`) so closing and reopening a named
//! database preserves all stores and concurrent tabs on the same origin receive `update`/`delete`
//! broadcasts.

use std::{
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};

use super::{IdbBlobMeta, IdbPeerClockRecord, IdbSnapshotRecord};

/// `0.27.5` `DocRecord` payload carried by `BroadcastChannel("idb:<dbName>")` update messages.
///
/// Mirrors `packages/common/nbstore/src/impls/idb/doc.ts:14-20, 84-94` (`docId`, `bin`,
/// `timestamp`, `editor`, `createForPeer`).
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdbChannelDocUpdate {
    pub doc_id: String,
    pub bin: Vec<u8>,
    /// Epoch milliseconds corresponding to the JS `Date` `timestamp` field.
    pub timestamp: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create_for_peer: Option<String>,
}

/// Cross-tab `BroadcastChannel("idb:<dbName>")` message matching `IndexedDBDocStorage` `ChannelMessage`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum IdbChannelMessage {
    Delete {
        #[serde(rename = "docId")]
        doc_id: String,
    },
    Update {
        update: IdbChannelDocUpdate,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        origin: Option<String>,
    },
}

/// Blob sync record in the `blobSync` object store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbBlobSyncRecord {
    pub peer: String,
    pub key: String,
    pub uploaded_at_ms: Option<i64>,
}

/// Indexer sync record in the `indexerSync` object store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbIndexerSyncRecord {
    pub doc_id: String,
    pub indexed_clock_ms: i64,
    pub indexer_version: Option<u32>,
}

#[derive(Default, Debug)]
pub(super) struct IdbDatabaseState {
    pub snapshots: BTreeMap<String, IdbSnapshotRecord>,
    pub updates: BTreeMap<(String, i64), Vec<u8>>,
    pub clocks: BTreeMap<String, i64>,
    pub peer_clocks: BTreeMap<(String, String), IdbPeerClockRecord>,
    pub blobs: BTreeMap<String, IdbBlobMeta>,
    pub blob_data: BTreeMap<String, Vec<u8>>,
    pub blob_sync: BTreeMap<(String, String), IdbBlobSyncRecord>,
    pub indexer_sync: BTreeMap<String, IdbIndexerSyncRecord>,
    pub next_subscriber_id: u64,
    pub subscribers: BTreeMap<u64, VecDeque<IdbChannelMessage>>,
}

impl IdbDatabaseState {
    pub fn register_subscriber(&mut self) -> u64 {
        self.next_subscriber_id = self.next_subscriber_id.saturating_add(1);
        let id = self.next_subscriber_id;
        self.subscribers.insert(id, VecDeque::new());
        id
    }

    pub fn unregister_subscriber(&mut self, id: u64) {
        self.subscribers.remove(&id);
    }

    pub fn broadcast(&mut self, sender_id: u64, message: IdbChannelMessage) {
        for (&sub_id, queue) in &mut self.subscribers {
            if sub_id != sender_id {
                queue.push_back(message.clone());
            }
        }
    }

    pub fn drain_inbox(&mut self, subscriber_id: u64) -> Vec<IdbChannelMessage> {
        self.subscribers
            .get_mut(&subscriber_id)
            .map(|q| q.drain(..).collect())
            .unwrap_or_default()
    }
}

/// Shared same-origin persistence and `BroadcastChannel` hub for IndexedDB v3 databases.
#[derive(Clone, Debug, Default)]
pub struct IdbSharedOrigin {
    databases: Arc<Mutex<BTreeMap<String, Arc<Mutex<IdbDatabaseState>>>>>,
}

impl IdbSharedOrigin {
    pub fn new() -> Self {
        Self::default()
    }

    pub(super) fn open_db(&self, db_name: &str) -> Arc<Mutex<IdbDatabaseState>> {
        let mut guard = self.databases.lock().unwrap_or_else(|err| err.into_inner());
        guard
            .entry(db_name.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(IdbDatabaseState::default())))
            .clone()
    }

    /// List all database names currently persisted in this origin.
    pub fn database_names(&self) -> Vec<String> {
        self.databases
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .keys()
            .cloned()
            .collect()
    }
}
