use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_CLIENT_VERSION: &str = "0.27.5";
pub const SPACE_JOIN_BATCH_LIMIT: usize = 100;

// Client -> Server events (frozen v0.27.5 contract)
pub const SPACE_JOIN_BATCH: &str = "space:join-batch";
pub const SPACE_LEAVE_BATCH: &str = "space:leave-batch";
pub const SPACE_LOAD_DOC: &str = "space:load-doc";
pub const SPACE_PUSH_DOC_UPDATE: &str = "space:push-doc-update";
pub const SPACE_LOAD_DOC_TIMESTAMPS: &str = "space:load-doc-timestamps";
pub const SPACE_LOAD_WORKSPACE_STATE: &str = "space:load-workspace-state";
pub const SPACE_DELETE_DOC: &str = "space:delete-doc";
pub const SPACE_DOC_LIFECYCLE: &str = "space:doc-lifecycle";

// Server -> Client events (frozen v0.27.5 contract)
pub const SPACE_BROADCAST_DOC_UPDATES: &str = "space:broadcast-doc-updates";
pub const SPACE_BROADCAST_DOC_INVALIDATION: &str = "space:broadcast-doc-invalidation";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpaceType {
    Workspace,
    Userspace,
}

impl SpaceType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Workspace => "workspace",
            Self::Userspace => "userspace",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinSpaceBatchEntry {
    pub space_type: SpaceType,
    pub space_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinSpaceBatchMessage {
    pub spaces: Vec<JoinSpaceBatchEntry>,
    pub client_version: String,
    pub protocol_version: u8,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinSpaceBatchResponse {
    pub client_id: String,
    pub success: bool,
    pub protocol_version: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_version: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaveSpaceBatchMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    pub doc_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PushDocIntent {
    Create,
    Update,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushDocUpdateMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    pub doc_id: String,
    pub update: String,
    pub intent: PushDocIntent,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushDocUpdateResponse {
    pub accepted: bool,
    pub timestamp: i64,
    #[serde(default)]
    pub created: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    pub doc_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_vector: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocResponse {
    pub missing: String,
    pub state: String,
    pub timestamp: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocTimestampsMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
}

pub type LoadDocTimestampsResponse = BTreeMap<String, i64>;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDocMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    pub doc_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DocLifecycleAction {
    Trash,
    Restore,
    Delete,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocLifecycleMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    pub doc_id: String,
    pub lifecycle: DocLifecycleAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub physical_doc_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocLifecycleResponse {
    pub timestamp: i64,
    #[serde(default)]
    pub deleted_doc_ids: Option<Vec<String>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastDocUpdatesMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    pub doc_id: String,
    pub updates: Vec<String>,
    pub timestamp: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compressed: Option<bool>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastDocInvalidationMessage {
    pub space_type: SpaceType,
    pub space_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inventory_changed: Option<bool>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsocketErrorBody {
    #[serde(default)]
    pub status: Option<u16>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default, rename = "type")]
    pub error_type: Option<String>,
    pub name: String,
    pub message: String,
    #[serde(default)]
    pub data: Option<Value>,
}

impl WebsocketErrorBody {
    pub fn canonical_code(&self) -> &str {
        self.code.as_deref().unwrap_or(&self.name)
    }

    pub fn is_auth_required(&self) -> bool {
        self.canonical_code() == "AUTHENTICATION_REQUIRED"
    }

    pub fn is_permission_revoked(&self) -> bool {
        matches!(
            self.canonical_code(),
            "SPACE_ACCESS_DENIED"
                | "DOC_ACTION_DENIED"
                | "ACCESS_DENIED"
                | "FORBIDDEN"
                | "AUTHENTICATION_REQUIRED"
                | "UNSUPPORTED_CLIENT_VERSION"
        )
    }

    pub fn is_doc_not_found(&self) -> bool {
        self.canonical_code() == "DOC_NOT_FOUND" || self.name == "DOC_NOT_FOUND"
    }

    pub fn is_not_in_space(&self) -> bool {
        self.canonical_code() == "NOT_IN_SPACE" || self.name == "NOT_IN_SPACE"
    }

    pub fn is_terminal_lifecycle_error(&self) -> bool {
        matches!(
            self.canonical_code(),
            "DOC_ACTION_DENIED" | "SPACE_ACCESS_DENIED" | "ACCESS_DENIED" | "BAD_REQUEST"
        )
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WebsocketResponse<T> {
    Ok { data: T },
    Err { error: WebsocketErrorBody },
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn event_names_match_frozen_oracle_contracts() {
        let oracle_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/oracle-contracts/v0.27.5/socketio-events.json");
        let raw = std::fs::read_to_string(&oracle_path)
            .expect("tests/oracle-contracts/v0.27.5/socketio-events.json must exist");
        let json: Value = serde_json::from_str(&raw).unwrap();

        let incoming: BTreeSet<String> = json["incoming"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|e| e["event"].as_str().map(str::to_string))
            .collect();
        let outgoing: BTreeSet<String> = json["outgoing"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|e| e["event"].as_str().map(str::to_string))
            .collect();

        for client_event in [
            SPACE_JOIN_BATCH,
            SPACE_LEAVE_BATCH,
            SPACE_LOAD_DOC,
            SPACE_PUSH_DOC_UPDATE,
            SPACE_LOAD_DOC_TIMESTAMPS,
            SPACE_LOAD_WORKSPACE_STATE,
            SPACE_DELETE_DOC,
            SPACE_DOC_LIFECYCLE,
        ] {
            assert!(
                incoming.contains(client_event),
                "missing client event `{client_event}` in frozen oracle contract"
            );
        }

        for server_event in [
            SPACE_BROADCAST_DOC_UPDATES,
            SPACE_BROADCAST_DOC_INVALIDATION,
        ] {
            assert!(
                outgoing.contains(server_event),
                "missing server event `{server_event}` in frozen oracle contract"
            );
        }
    }
}
