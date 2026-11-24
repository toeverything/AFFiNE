pub mod blob;
pub mod doc;
pub mod migrations;
pub mod paths;
pub mod storage;
pub mod sync;

use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime};
use serde::{Deserialize, Serialize};

pub use doc::merge_updates;
pub use migrations::{FROZEN_SCHEMA_VERSION, MIGRATIONS, get_migrator};
pub use paths::{
    resolve_allowlisted_workspace_paths, resolve_workspace_db_path, sanitize_peer_name,
};
pub use storage::SqliteDocStorage;

/// Convert Unix epoch milliseconds to a UTC `NaiveDateTime`.
pub fn millis_to_naive_utc(ms: i64) -> NaiveDateTime {
    DateTime::from_timestamp_millis(ms)
        .unwrap_or(DateTime::UNIX_EPOCH)
        .naive_utc()
}

/// Convert a UTC `NaiveDateTime` to Unix epoch milliseconds.
pub fn naive_utc_to_millis(ts: NaiveDateTime) -> i64 {
    ts.and_utc().timestamp_millis()
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocUpdate {
    pub doc_id: String,
    pub timestamp: NaiveDateTime,
    pub bin: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocRecord {
    pub doc_id: String,
    pub bin: Vec<u8>,
    pub timestamp: NaiveDateTime,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocDiff {
    pub doc_id: String,
    pub missing: Vec<u8>,
    pub state: Vec<u8>,
    pub timestamp: NaiveDateTime,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocClock {
    pub doc_id: String,
    pub timestamp: NaiveDateTime,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetBlob {
    pub key: String,
    pub data: Vec<u8>,
    pub mime: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlobRecord {
    pub key: String,
    pub data: Vec<u8>,
    pub mime: String,
    pub size: i64,
    pub created_at: NaiveDateTime,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListedBlob {
    pub key: String,
    pub size: i64,
    pub mime: String,
    pub created_at: NaiveDateTime,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocInventory {
    pub doc_id: String,
    pub timestamp: i64,
    pub lifecycle: Option<String>,
    pub lifecycle_changed_at: Option<i64>,
    #[serde(default)]
    pub pending_create: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerWorkspaceState {
    pub cache_token: i64,
    pub ready: bool,
    pub docs: Vec<WorkspaceDocInventory>,
    pub clocks: HashMap<String, i64>,
}
