use affine_nbstore::error::Error as NbStoreError;

#[derive(uniffi::Error, thiserror::Error, Debug)]
pub enum UniffiError {
  #[error("Error: {0}")]
  Err(String),
  #[error("Base64 decoding error: {0}")]
  Base64DecodingError(String),
  #[error("Timestamp decoding error")]
  TimestampDecodingError,
}

impl From<NbStoreError> for UniffiError {
  fn from(err: NbStoreError) -> Self {
    Self::Err(err.to_string())
  }
}

pub(crate) type Result<T> = std::result::Result<T, UniffiError>;
