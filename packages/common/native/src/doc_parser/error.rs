use serde::{Deserialize, Serialize};
use thiserror::Error;
use y_octo::JwstCodecError;

#[derive(Error, Debug, Serialize, Deserialize)]
pub enum ParseError {
  #[error("doc_not_found")]
  DocNotFound,
  #[error("invalid_binary")]
  InvalidBinary,
  #[error("sqlite_error: {0}")]
  SqliteError(String),
  #[error("parser_error: {0}")]
  ParserError(String),
  #[error("unknown: {0}")]
  Unknown(String),
}

impl From<JwstCodecError> for ParseError {
  fn from(value: JwstCodecError) -> Self {
    if matches!(
      value,
      JwstCodecError::DamagedDocumentJson
        | JwstCodecError::IncompleteDocument(_)
        | JwstCodecError::InvalidWriteBuffer(_)
        | JwstCodecError::UpdateInvalid(_)
        | JwstCodecError::StructClockInvalid { expect: _, actually: _ }
        | JwstCodecError::StructSequenceInvalid { client_id: _, clock: _ }
        | JwstCodecError::StructSequenceNotExists(_)
        | JwstCodecError::RootStructNotFound(_)
        | JwstCodecError::ParentNotFound
        | JwstCodecError::IndexOutOfBound(_)
    ) {
      return ParseError::InvalidBinary;
    }
    Self::ParserError(value.to_string())
  }
}
