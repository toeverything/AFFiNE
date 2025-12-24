use affine_common::doc_parser::ParseError;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error("Sqlite Error: {0}")]
  SqlxError(#[from] sqlx::Error),
  #[error("Migrate Error: {0}")]
  MigrateError(#[from] sqlx::migrate::MigrateError),
  #[error("Invalid operation")]
  InvalidOperation,
  #[error("Serialization Error: {0}")]
  Serialization(String),
  #[error(transparent)]
  Parse(#[from] ParseError),
}
