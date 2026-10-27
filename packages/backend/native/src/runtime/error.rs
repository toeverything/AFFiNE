use napi::{Error, Status};

use super::object_storage::error::ObjectStorageError;

pub(crate) type RuntimeResult<T> = std::result::Result<T, RuntimeError>;

#[derive(Debug, thiserror::Error)]
pub(crate) enum RuntimeError {
  #[error("{0}")]
  Config(String),

  #[error("{0}")]
  InvalidInput(String),

  #[error("{0}")]
  InvalidState(String),

  #[error("workspace access denied")]
  SearchWorkspaceDenied,

  #[error("search permission state unavailable")]
  SearchPermissionUnavailable,

  #[error("search index is not ready")]
  SearchIndexNotReady,

  #[error("search permission projection is syncing")]
  SearchPermissionSyncing,

  #[error("search index failed: {0}")]
  SearchIndexFailed(String),

  #[error("search source is invalid: {0}")]
  SearchSourceInvalid(String),

  #[error("search generation is invalid: {0}")]
  SearchGenerationInvalid(String),

  #[error("search provider unavailable")]
  SearchProviderUnavailable,

  #[error("search query is not supported by the active provider")]
  SearchUnsupportedQuery,

  #[error("{context}: {source}")]
  Database {
    context: String,
    #[source]
    source: sqlx::Error,
  },

  #[error("{context}: {source}")]
  Io {
    context: String,
    #[source]
    source: std::io::Error,
  },

  #[error("{context}: {source}")]
  Json {
    context: String,
    #[source]
    source: serde_json::Error,
  },

  #[error("{context}: {source}")]
  Time {
    context: String,
    #[source]
    source: std::time::SystemTimeError,
  },

  #[error(transparent)]
  ObjectStorage(#[from] ObjectStorageError),

  #[error("{0}")]
  NapiBoundary(String),
}

impl RuntimeError {
  pub(crate) fn config(message: impl Into<String>) -> Self {
    Self::Config(message.into())
  }

  pub(crate) fn invalid_input(message: impl Into<String>) -> Self {
    Self::InvalidInput(message.into())
  }

  pub(crate) fn invalid_state(message: impl Into<String>) -> Self {
    Self::InvalidState(message.into())
  }

  pub(crate) fn database(context: impl Into<String>, source: sqlx::Error) -> Self {
    Self::Database {
      context: context.into(),
      source,
    }
  }

  pub(crate) fn io(context: impl Into<String>, source: std::io::Error) -> Self {
    Self::Io {
      context: context.into(),
      source,
    }
  }

  pub(crate) fn json(context: impl Into<String>, source: serde_json::Error) -> Self {
    Self::Json {
      context: context.into(),
      source,
    }
  }

  pub(crate) fn is_serialization_failure(&self) -> bool {
    matches!(
      self,
      Self::Database {
        source: sqlx::Error::Database(source),
        ..
      } if source.code().as_deref() == Some("40001")
    )
  }

  pub(crate) fn is_permanent_search_source(&self) -> bool {
    matches!(self, Self::SearchSourceInvalid(_))
  }

  pub(crate) fn is_permanent_search_generation(&self) -> bool {
    matches!(self, Self::SearchGenerationInvalid(_))
  }

  fn boundary_code(&self) -> String {
    match self {
      Self::Config(_) => "config_error".to_string(),
      Self::InvalidInput(message) => message_code(message).unwrap_or("invalid_input").to_string(),
      Self::InvalidState(message) => message_code(message).unwrap_or("invalid_state").to_string(),
      Self::SearchWorkspaceDenied => "workspace_denied".to_string(),
      Self::SearchPermissionUnavailable => "permission_unavailable".to_string(),
      Self::SearchIndexNotReady => "search_index_not_ready".to_string(),
      Self::SearchPermissionSyncing => "permission_syncing".to_string(),
      Self::SearchIndexFailed(_) => "search_index_failed".to_string(),
      Self::SearchSourceInvalid(_) => "search_source_invalid".to_string(),
      Self::SearchGenerationInvalid(_) => "search_generation_invalid".to_string(),
      Self::SearchProviderUnavailable => "search_provider_unavailable".to_string(),
      Self::SearchUnsupportedQuery => "search_unsupported_query".to_string(),
      Self::Database { .. } => "database_error".to_string(),
      Self::Io { .. } => "io_error".to_string(),
      Self::Json { .. } => "json_error".to_string(),
      Self::Time { .. } => "time_error".to_string(),
      Self::ObjectStorage(_) => "object_storage_error".to_string(),
      Self::NapiBoundary(_) => "runtime_error".to_string(),
    }
  }
}

pub(crate) fn to_napi_error(error: RuntimeError) -> Error {
  let code = error.boundary_code();
  Error::new(Status::GenericFailure, format!("[affine-runtime:{code}] {error}"))
}

impl From<RuntimeError> for Error {
  fn from(error: RuntimeError) -> Self {
    to_napi_error(error)
  }
}

impl From<ObjectStorageError> for Error {
  fn from(error: ObjectStorageError) -> Self {
    to_napi_error(RuntimeError::from(error))
  }
}

impl From<Error> for RuntimeError {
  fn from(error: Error) -> Self {
    Self::NapiBoundary(error.to_string())
  }
}

pub(crate) fn napi_error(message: impl Into<String>) -> Error {
  let message = message.into();
  let code = message_code(&message).unwrap_or("runtime_error");
  Error::new(Status::GenericFailure, format!("[affine-runtime:{code}] {message}"))
}

fn message_code(message: &str) -> Option<&str> {
  let code = message.split_once(':').map_or(message, |(code, _)| code);
  (!code.is_empty()
    && code
      .bytes()
      .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_'))
  .then_some(code)
}
