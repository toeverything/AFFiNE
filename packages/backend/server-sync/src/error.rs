//! Canonical errors for `server-sync`.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum SyncError {
  #[error("authentication required: {0}")]
  AuthenticationRequired(String),

  #[error("bad request: {0}")]
  BadRequest(String),

  #[error("space access denied: {space_id}")]
  SpaceAccessDenied { space_id: String },

  #[error("not in space: {space_id}")]
  NotInSpace { space_id: String },

  #[error("document action {action} denied for {doc_id} in {space_id}")]
  DocActionDenied {
    action: String,
    doc_id: String,
    space_id: String,
  },

  #[error("access denied: {0}")]
  AccessDenied(String),

  #[error("quota exceeded: {0}")]
  QuotaExceeded(String),

  #[error("document not found: {doc_id} in {space_id}")]
  DocNotFound { space_id: String, doc_id: String },

  #[error("document update blocked: {doc_id} in {space_id}")]
  DocUpdateBlocked { space_id: String, doc_id: String },

  #[error("document update invalid: {0}")]
  DocUpdateInvalid(String),

  #[error("document update too large")]
  DocUpdateTooLarge,

  #[error("sync permission generation changed for {space_id}")]
  SyncPermissionGenerationChanged { space_id: String },

  #[error("workspace lifecycle not active")]
  WorkspaceLifecycleNotActive,

  #[error("database error: {0}")]
  Database(String),

  #[error("internal error: {0}")]
  Internal(String),
}

impl From<server_db::DbError> for SyncError {
  fn from(err: server_db::DbError) -> Self {
    Self::Database(err.to_string())
  }
}

impl From<sqlx::Error> for SyncError {
  fn from(err: sqlx::Error) -> Self {
    Self::Database(err.to_string())
  }
}
