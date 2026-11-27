//! Frozen `v0.27.5` Socket.IO `space:*` protocol wire types and validation.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::SyncError;

pub const MAX_SPACE_JOIN_BATCH_SIZE: usize = 100;

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JoinSpaceBatchMessage {
  pub spaces: Vec<JoinSpaceBatchEntry>,
  pub client_version: String,
  pub protocol_version: u8,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaveSpaceMessage {
  pub space_type: SpaceType,
  pub space_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
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
  #[serde(default)]
  pub intent: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocMessage {
  pub space_type: SpaceType,
  pub space_id: String,
  pub doc_id: String,
  #[serde(default)]
  pub state_vector: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocTimestampsMessage {
  pub space_type: SpaceType,
  pub space_id: String,
  #[serde(default)]
  pub timestamp: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadWorkspaceStateMessage {
  pub space_type: SpaceType,
  pub space_id: String,
}

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
  pub lifecycle: String,
  #[serde(default)]
  pub physical_doc_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadSpaceAwarenessesMessage {
  pub space_type: SpaceType,
  pub space_id: String,
  pub doc_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAwarenessMessage {
  pub space_type: SpaceType,
  pub space_id: String,
  pub doc_id: String,
  pub awareness_update: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastDocUpdatesMessage {
  pub space_type: SpaceType,
  pub space_id: String,
  pub doc_id: String,
  pub updates: Vec<String>,
  pub timestamp: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub editor: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub compressed: Option<bool>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastDocInvalidationMessage {
  pub space_type: SpaceType,
  pub space_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub timestamp: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub inventory_changed: Option<bool>,
}

/// Canonicalizes a document id against its workspace hint, matching
/// `canonicalizeDocumentIdentity` in `v0.27.5`.
pub fn canonical_doc_id(raw_id: &str, space_id: &str) -> Result<String, SyncError> {
  let trimmed = raw_id.trim();
  if trimmed.is_empty() || trimmed.contains('/') || trimmed.contains('\0') {
    return Err(SyncError::BadRequest("Invalid document identifier.".into()));
  }
  // Handle `workspace:<spaceId>:<docId>` or `userspace:<spaceId>:<docId>` legacy prefixes.
  if let Some(rest) = trimmed
    .strip_prefix("workspace:")
    .or_else(|| trimmed.strip_prefix("userspace:"))
  {
    let Some((prefix_space, doc_id)) = rest.split_once(':') else {
      return Err(SyncError::BadRequest("Invalid document identifier.".into()));
    };
    if prefix_space != space_id || doc_id.trim().is_empty() {
      return Err(SyncError::BadRequest("Invalid document identifier.".into()));
    }
    return Ok(doc_id.to_owned());
  }
  Ok(trimmed.to_owned())
}

/// Returns `true` when `doc_id` is a normal user document (not the root doc
/// `workspace_id`, nor a `db$<ws>$...` or `userdata$<user>$<ws>$...` system doc).
pub fn is_ordinary_workspace_doc(workspace_id: &str, doc_id: &str) -> bool {
  if doc_id == workspace_id {
    return false;
  }
  if doc_id.starts_with("db$") || doc_id.starts_with("userdata$") {
    return false;
  }
  true
}

/// Validates reserved system doc IDs (`db$<ws>$<name>`, `userdata$<user>$<ws>$<name>`).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReservedDocKind {
  Ordinary,
  Root,
  WorkspaceDb,
  UserDataOwner,
  InvalidOrForeign,
}

pub fn classify_reserved_doc(workspace_id: &str, doc_id: &str, actor_user_id: &str) -> ReservedDocKind {
  match server_domain::acl::classify_reserved_doc(workspace_id, doc_id) {
    server_domain::acl::ReservedDocClass::Ordinary => ReservedDocKind::Ordinary,
    server_domain::acl::ReservedDocClass::WorkspaceRoot => ReservedDocKind::Root,
    server_domain::acl::ReservedDocClass::WorkspaceSystem => ReservedDocKind::WorkspaceDb,
    server_domain::acl::ReservedDocClass::UserPrivate { owner_id } if owner_id == actor_user_id => {
      ReservedDocKind::UserDataOwner
    }
    server_domain::acl::ReservedDocClass::UserPrivate { .. } | server_domain::acl::ReservedDocClass::Invalid => {
      ReservedDocKind::InvalidOrForeign
    }
  }
}

/// Checks whether `client_version` matches the `YYYY.M.D-canary.N` date format.
/// When `allow_canary` is false (stable/beta/production channels), any canary
/// date build returns `Some(false)`. When `allow_canary` is true, returns
/// `Some(true)` if the UTC midnight date is within `[-2 days, +62 days]` of
/// `now_ms`, `Some(false)` if invalid or expired, and `None` for non-canary
/// semver strings.
pub fn check_canary_date_version_at(client_version: &str, allow_canary: bool, now_ms: i64) -> Option<bool> {
  const DAY_MS: i64 = 86_400_000;
  let trimmed = client_version.trim();
  let stripped = trimmed
    .strip_prefix('v')
    .or_else(|| trimmed.strip_prefix('V'))
    .unwrap_or(trimmed);
  let no_build = stripped.split('+').next().unwrap_or(stripped);
  let (date_part, pre_part) = no_build.split_once('-')?;
  let lower_pre = pre_part.to_ascii_lowercase();
  let build_num = lower_pre.strip_prefix("canary.")?;
  if build_num.is_empty() || !build_num.chars().all(|c| c.is_ascii_digit()) {
    return None;
  }
  let mut parts = date_part.split('.');
  let (Some(y_s), Some(m_s), Some(d_s), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
    return None;
  };
  if y_s.len() != 4 || m_s.is_empty() || m_s.len() > 2 || d_s.is_empty() || d_s.len() > 2 {
    return None;
  }
  if !y_s.chars().all(|c| c.is_ascii_digit())
    || !m_s.chars().all(|c| c.is_ascii_digit())
    || !d_s.chars().all(|c| c.is_ascii_digit())
  {
    return None;
  }
  if !allow_canary {
    return Some(false);
  }
  let (Ok(year), Ok(month), Ok(day)) = (y_s.parse::<i32>(), m_s.parse::<u32>(), d_s.parse::<u32>()) else {
    return Some(false);
  };
  let Some(date) = chrono::NaiveDate::from_ymd_opt(year, month, day) else {
    return Some(false);
  };
  let Some(dt) = date.and_hms_opt(0, 0, 0) else {
    return Some(false);
  };
  let date_ms = dt.and_utc().timestamp_millis();
  let age_ms = now_ms - date_ms;
  Some((-2 * DAY_MS..=62 * DAY_MS).contains(&age_ms))
}

pub fn check_canary_date_version(client_version: &str, allow_canary: bool) -> Option<bool> {
  check_canary_date_version_at(client_version, allow_canary, chrono::Utc::now().timestamp_millis())
}

/// Checks `clientVersion >= 0.27.5-0` or valid non-expired canary date version
/// when `allow_canary` is enabled.
pub fn is_batch_ws_client_version_with_canary(client_version: &str, allow_canary: bool) -> bool {
  if let Some(canary_ok) = check_canary_date_version(client_version, allow_canary) {
    return canary_ok;
  }
  let core = client_version.trim().trim_start_matches(['v', 'V']);
  let core = core.split(['-', '+']).next().unwrap_or("");
  let mut parts = core.split('.');
  let (Some(maj), Some(min), Some(pat), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
    return false;
  };
  let (Ok(maj), Ok(min), Ok(pat)) = (maj.parse::<u64>(), min.parse::<u64>(), pat.parse::<u64>()) else {
    return false;
  };
  maj < 2000 && (maj, min, pat) >= (0, 27, 5)
}

/// Checks `clientVersion >= 0.27.5-0` on stable channels (`allow_canary = false`).
pub fn is_batch_ws_client_version(client_version: &str) -> bool {
  is_batch_ws_client_version_with_canary(client_version, false)
}

pub fn parse_join_space_batch_message(value: &Value) -> Result<JoinSpaceBatchMessage, SyncError> {
  let obj = value
    .as_object()
    .ok_or_else(|| SyncError::BadRequest("Invalid space join batch payload.".into()))?;

  let protocol_version = obj
    .get("protocolVersion")
    .and_then(Value::as_u64)
    .filter(|&v| v == 1 || v == 2)
    .map(|v| v as u8)
    .ok_or_else(|| SyncError::BadRequest("Sync protocol upgrade required.".into()))?;

  let spaces_arr = obj
    .get("spaces")
    .and_then(Value::as_array)
    .filter(|arr| !arr.is_empty())
    .ok_or_else(|| SyncError::BadRequest("Space join batch must not be empty.".into()))?;

  if spaces_arr.len() > MAX_SPACE_JOIN_BATCH_SIZE {
    return Err(SyncError::BadRequest(format!(
      "Space join batch exceeds limit ({MAX_SPACE_JOIN_BATCH_SIZE})."
    )));
  }

  let client_version = obj
    .get("clientVersion")
    .and_then(Value::as_str)
    .filter(|s| !s.is_empty())
    .ok_or_else(|| SyncError::BadRequest("Space join batch requires a client version.".into()))?
    .to_owned();

  let mut entries = Vec::with_capacity(spaces_arr.len());
  for (index, item) in spaces_arr.iter().enumerate() {
    let entry_obj = item
      .as_object()
      .ok_or_else(|| SyncError::BadRequest(format!("Invalid space join batch entry at index {index}.")))?;
    let space_type = match entry_obj.get("spaceType").and_then(Value::as_str) {
      Some("workspace") => SpaceType::Workspace,
      Some("userspace") => SpaceType::Userspace,
      _ => {
        return Err(SyncError::BadRequest(format!(
          "Invalid space join batch entry at index {index}."
        )));
      }
    };
    let space_id = entry_obj
      .get("spaceId")
      .and_then(Value::as_str)
      .filter(|s| !s.trim().is_empty())
      .ok_or_else(|| SyncError::BadRequest(format!("Invalid space join batch entry at index {index}.")))?
      .to_owned();

    let doc_id = match entry_obj.get("docId") {
      None | Some(Value::Null) => None,
      Some(Value::String(s)) if !s.trim().is_empty() => Some(canonical_doc_id(s, &space_id)?),
      _ => {
        return Err(SyncError::BadRequest(format!(
          "Invalid space join batch entry at index {index}."
        )));
      }
    };

    entries.push(JoinSpaceBatchEntry {
      space_type,
      space_id,
      doc_id,
    });
  }

  let first_type = entries[0].space_type;
  let first_space_id = &entries[0].space_id;
  let mut seen = HashSet::with_capacity(entries.len());
  for entry in &entries {
    if entry.space_type != first_type || &entry.space_id != first_space_id {
      return Err(SyncError::BadRequest(
        "Space join batch entries must belong to one space.".into(),
      ));
    }
    let key = (entry.space_type, entry.space_id.clone(), entry.doc_id.clone());
    if !seen.insert(key) {
      return Err(SyncError::BadRequest(
        "Space join batch contains duplicate entries.".into(),
      ));
    }
  }

  Ok(JoinSpaceBatchMessage {
    spaces: entries,
    client_version,
    protocol_version,
  })
}

pub fn parse_leave_space_batch_message(value: &Value) -> Result<LeaveSpaceBatchMessage, SyncError> {
  let obj = value
    .as_object()
    .ok_or_else(|| SyncError::BadRequest("Invalid space leave batch payload.".into()))?;
  let space_type = match obj.get("spaceType").and_then(Value::as_str) {
    Some("workspace") => SpaceType::Workspace,
    Some("userspace") => SpaceType::Userspace,
    _ => return Err(SyncError::BadRequest("Invalid space leave batch payload.".into())),
  };
  let space_id = obj
    .get("spaceId")
    .and_then(Value::as_str)
    .filter(|s| !s.trim().is_empty())
    .ok_or_else(|| SyncError::BadRequest("Invalid space leave batch payload.".into()))?
    .to_owned();
  let doc_ids_arr = obj
    .get("docIds")
    .and_then(Value::as_array)
    .ok_or_else(|| SyncError::BadRequest("Invalid space leave batch payload.".into()))?;
  let mut doc_ids = Vec::with_capacity(doc_ids_arr.len());
  for item in doc_ids_arr {
    let raw = item
      .as_str()
      .filter(|s| !s.trim().is_empty())
      .ok_or_else(|| SyncError::BadRequest("Invalid space leave batch payload.".into()))?;
    doc_ids.push(canonical_doc_id(raw, &space_id)?);
  }
  Ok(LeaveSpaceBatchMessage {
    space_type,
    space_id,
    doc_ids,
  })
}

pub fn space_room(space_type: SpaceType, space_id: &str, room_type: &str) -> String {
  format!("{}:{space_id}:{room_type}", space_type.as_str())
}

pub fn active_doc_key(space_type: SpaceType, space_id: &str, doc_id: &str) -> String {
  format!("{}:{space_id}:{doc_id}", space_type.as_str())
}

#[cfg(test)]
mod canary_version_tests {
  use super::{check_canary_date_version_at, is_batch_ws_client_version_with_canary};

  #[test]
  fn canary_date_version_requires_canary_channel_and_millisecond_window() {
    const DAY_MS: i64 = 86_400_000;
    let base_ms = chrono::NaiveDate::from_ymd_opt(2026, 6, 1)
      .unwrap()
      .and_hms_opt(0, 0, 0)
      .unwrap()
      .and_utc()
      .timestamp_millis();

    // Stable channel always rejects canary date builds.
    assert_eq!(
      check_canary_date_version_at("2026.6.1-canary.1", false, base_ms),
      Some(false)
    );
    assert!(!is_batch_ws_client_version_with_canary("2026.6.1-canary.1", false));

    // Canary channel enforces [-2 days, +62 days] in milliseconds.
    assert_eq!(
      check_canary_date_version_at("2026.6.1-canary.1", true, base_ms),
      Some(true)
    );
    assert_eq!(
      check_canary_date_version_at("2026.6.1-canary.1", true, base_ms + 62 * DAY_MS),
      Some(true)
    );
    assert_eq!(
      check_canary_date_version_at("2026.6.1-canary.1", true, base_ms + 62 * DAY_MS + 1),
      Some(false)
    );
    assert_eq!(
      check_canary_date_version_at("2026.6.1-canary.1", true, base_ms - 2 * DAY_MS),
      Some(true)
    );
    assert_eq!(
      check_canary_date_version_at("2026.6.1-canary.1", true, base_ms - 2 * DAY_MS - 1),
      Some(false)
    );

    // Non-canary semver returns None and falls back to semver check.
    assert_eq!(check_canary_date_version_at("0.27.5", false, base_ms), None);
    assert!(is_batch_ws_client_version_with_canary("0.27.5", false));
  }
}
