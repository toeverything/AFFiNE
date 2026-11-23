//! Maps canonical [`SyncError`] values to the frozen `v0.27.5` Socket.IO
//! `GatewayErrorWrapper` / `toWebsocketError` ACK envelope:
//! `{ "error": { "status", "code", "type", "name", "message", "data", "requestId" } }`.

use http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::SyncError;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsocketErrorBody {
  pub status: u16,
  pub code: String,
  #[serde(rename = "type")]
  pub error_type: String,
  pub name: String,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub request_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct WebsocketErrorEnvelope {
  pub error: WebsocketErrorBody,
}

pub fn sync_error_to_ws_envelope(err: &SyncError, request_id: Option<String>) -> WebsocketErrorEnvelope {
  let body = match err {
    SyncError::AuthenticationRequired(msg) => WebsocketErrorBody {
      status: StatusCode::UNAUTHORIZED.as_u16(),
      code: "AUTHENTICATION_REQUIRED".into(),
      error_type: "AUTHENTICATION_REQUIRED".into(),
      name: "AUTHENTICATION_REQUIRED".into(),
      message: msg.clone(),
      data: None,
      request_id,
    },
    SyncError::BadRequest(msg) => WebsocketErrorBody {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "BAD_REQUEST".into(),
      error_type: "BAD_REQUEST".into(),
      name: "BAD_REQUEST".into(),
      message: msg.clone(),
      data: None,
      request_id,
    },
    SyncError::UnsupportedClientVersion {
      client_version,
      required_version,
    } => WebsocketErrorBody {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "UNSUPPORTED_CLIENT_VERSION".into(),
      error_type: "ACTION_FORBIDDEN".into(),
      name: "UNSUPPORTED_CLIENT_VERSION".into(),
      message: format!("Unsupported client with version [{client_version}], required version is [{required_version}]."),
      data: Some(json!({
        "clientVersion": client_version,
        "requiredVersion": required_version,
      })),
      request_id,
    },
    SyncError::SpaceAccessDenied { space_id } => WebsocketErrorBody {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "SPACE_ACCESS_DENIED".into(),
      error_type: "SPACE_ACCESS_DENIED".into(),
      name: "SPACE_ACCESS_DENIED".into(),
      message: format!("Space {space_id} access denied"),
      data: Some(json!({ "spaceId": space_id })),
      request_id,
    },
    SyncError::NotInSpace { space_id } => WebsocketErrorBody {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "NOT_IN_SPACE".into(),
      error_type: "NOT_IN_SPACE".into(),
      name: "NOT_IN_SPACE".into(),
      message: format!("Not in space {space_id}"),
      data: Some(json!({ "spaceId": space_id })),
      request_id,
    },
    SyncError::DocActionDenied {
      action,
      doc_id,
      space_id,
    } => WebsocketErrorBody {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "DOC_ACTION_DENIED".into(),
      error_type: "DOC_ACTION_DENIED".into(),
      name: "DOC_ACTION_DENIED".into(),
      message: format!("Action {action} denied on doc {doc_id} in space {space_id}"),
      data: Some(json!({
        "action": action,
        "docId": doc_id,
        "spaceId": space_id,
      })),
      request_id,
    },
    SyncError::AccessDenied(msg) => WebsocketErrorBody {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "ACCESS_DENIED".into(),
      error_type: "ACCESS_DENIED".into(),
      name: "ACCESS_DENIED".into(),
      message: msg.clone(),
      data: None,
      request_id,
    },
    SyncError::QuotaExceeded(msg) => WebsocketErrorBody {
      status: StatusCode::PAYMENT_REQUIRED.as_u16(),
      code: "QUOTA_EXCEEDED".into(),
      error_type: "QUOTA_EXCEEDED".into(),
      name: "QUOTA_EXCEEDED".into(),
      message: msg.clone(),
      data: None,
      request_id,
    },
    SyncError::DocNotFound { space_id, doc_id } => WebsocketErrorBody {
      status: StatusCode::NOT_FOUND.as_u16(),
      code: "DOC_NOT_FOUND".into(),
      error_type: "DOC_NOT_FOUND".into(),
      name: "DOC_NOT_FOUND".into(),
      message: format!("Doc {doc_id} not found in space {space_id}"),
      data: Some(json!({
        "spaceId": space_id,
        "docId": doc_id,
      })),
      request_id,
    },
    SyncError::DocUpdateBlocked { space_id, doc_id } => WebsocketErrorBody {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "DOC_UPDATE_BLOCKED".into(),
      error_type: "DOC_UPDATE_BLOCKED".into(),
      name: "DOC_UPDATE_BLOCKED".into(),
      message: format!("Doc {doc_id} in space {space_id} is blocked for updates"),
      data: Some(json!({
        "spaceId": space_id,
        "docId": doc_id,
      })),
      request_id,
    },
    SyncError::DocUpdateInvalid(msg) => WebsocketErrorBody {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "DOC_UPDATE_INVALID".into(),
      error_type: "DOC_UPDATE_INVALID".into(),
      name: "DOC_UPDATE_INVALID".into(),
      message: msg.clone(),
      data: None,
      request_id,
    },
    SyncError::DocUpdateTooLarge => WebsocketErrorBody {
      status: StatusCode::PAYLOAD_TOO_LARGE.as_u16(),
      code: "DOC_UPDATE_TOO_LARGE".into(),
      error_type: "DOC_UPDATE_TOO_LARGE".into(),
      name: "DOC_UPDATE_TOO_LARGE".into(),
      message: "Document update exceeds maximum allowed size".into(),
      data: None,
      request_id,
    },
    SyncError::SyncPermissionGenerationChanged { space_id } => WebsocketErrorBody {
      status: StatusCode::CONFLICT.as_u16(),
      code: "SYNC_PERMISSION_GENERATION_CHANGED".into(),
      error_type: "SYNC_PERMISSION_GENERATION_CHANGED".into(),
      name: "SYNC_PERMISSION_GENERATION_CHANGED".into(),
      message: format!("Sync permission generation changed for space {space_id}"),
      data: Some(json!({ "spaceId": space_id })),
      request_id,
    },
    SyncError::WorkspaceLifecycleNotActive => WebsocketErrorBody {
      status: StatusCode::PRECONDITION_FAILED.as_u16(),
      code: "BAD_REQUEST".into(),
      error_type: "BAD_REQUEST".into(),
      name: "BAD_REQUEST".into(),
      message: "workspace_lifecycle_not_active".into(),
      data: None,
      request_id,
    },
    SyncError::TooManyConcurrentWritings => WebsocketErrorBody {
      status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
      code: "INTERNAL_SERVER_ERROR".into(),
      error_type: "INTERNAL_ERROR".into(),
      name: "INTERNAL_SERVER_ERROR".into(),
      message: "Internal Server Error".into(),
      data: None,
      request_id,
    },
    SyncError::Database(_) | SyncError::Internal(_) => WebsocketErrorBody {
      status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
      code: "INTERNAL_SERVER_ERROR".into(),
      error_type: "INTERNAL_SERVER_ERROR".into(),
      name: "INTERNAL_SERVER_ERROR".into(),
      message: "Internal server error".into(),
      data: None,
      request_id,
    },
  };
  WebsocketErrorEnvelope { error: body }
}
