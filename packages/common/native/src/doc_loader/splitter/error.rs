/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/text_splitter
 */
use text_splitter::ChunkConfigError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum TextSplitterError {
  #[error("Empty input text")]
  EmptyInputText,

  #[error("Mismatch metadata and text")]
  MetadataTextMismatch,

  #[error("Tokenizer not found")]
  TokenizerNotFound,

  #[error("Tokenizer creation failed due to invalid tokenizer")]
  InvalidTokenizer,

  #[error("Tokenizer creation failed due to invalid model")]
  InvalidModel,

  #[error("Invalid chunk overlap and size")]
  InvalidSplitterOptions,

  #[error("Error: {0}")]
  OtherError(String),
}

impl From<ChunkConfigError> for TextSplitterError {
  fn from(_: ChunkConfigError) -> Self {
    Self::InvalidSplitterOptions
  }
}
