use thiserror::Error;

/// Unified error type for storage, workspace metadata, and sync protocol operations.
#[derive(Debug, Error)]
pub enum StoreError {
    #[error("invalid binary CRDT update: {0}")]
    InvalidBinary(String),

    #[error("invalid protocol payload: {0}")]
    InvalidProtocol(String),

    #[error("invalid path argument: {0}")]
    InvalidPath(String),

    #[error("document not found: {0}")]
    DocNotFound(String),

    #[error("workspace root meta.pages is not initialized")]
    RootMetaNotInitialized,

    #[error("concurrent modification prevented write")]
    ConcurrentModification,

    #[error("operation cancelled")]
    Cancelled,

    #[error("permission revoked ({code}): {message}")]
    PermissionRevoked { code: String, message: String },

    #[error("y-octo error: {0}")]
    YOcto(String),

    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    #[cfg(not(target_family = "wasm"))]
    #[error("sqlx error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[cfg(not(target_family = "wasm"))]
    #[error("migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
}

pub type StoreResult<T> = Result<T, StoreError>;
