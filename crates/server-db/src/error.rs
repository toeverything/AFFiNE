//! Error types for `server-db`.

#[derive(Debug, thiserror::Error)]
pub enum DbError {
  #[error("database error: {0}")]
  Sqlx(#[from] sqlx::Error),
  #[error("invalid database configuration: {0}")]
  InvalidConfig(String),
  #[error("database admission semaphore closed")]
  PoolClosed,
  #[error("{message}")]
  SteppingStoneRequired {
    missing_migrations: Vec<String>,
    message: String,
  },
  #[error("schema readiness check failed: {0}")]
  SchemaCheck(String),
}
