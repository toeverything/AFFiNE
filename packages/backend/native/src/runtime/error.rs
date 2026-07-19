use napi::{Error, Status};

use super::storage_runtime::object_storage::error::ObjectStorageError;

pub(crate) type RuntimeResult<T> = std::result::Result<T, RuntimeError>;

#[derive(Debug, thiserror::Error)]
pub(crate) enum RuntimeError {
  #[error("{0}")]
  Config(String),

  #[error("{0}")]
  InvalidInput(String),

  #[error("{0}")]
  InvalidState(String),

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

  pub(crate) fn is_object_missing(&self) -> bool {
    match self {
      Self::ObjectStorage(error) => error.is_not_found(),
      Self::Io { source, .. } => source.kind() == std::io::ErrorKind::NotFound,
      Self::InvalidState(message)
      | Self::InvalidInput(message)
      | Self::Config(message)
      | Self::NapiBoundary(message) => {
        message.contains("NoSuchKey") || message.contains("NotFound") || message.contains("not found")
      }
      _ => false,
    }
  }
}

pub(crate) fn to_napi_error(error: RuntimeError) -> Error {
  Error::new(Status::GenericFailure, error.to_string())
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
  Error::new(Status::GenericFailure, message.into())
}
