/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/text_splitter
 */
use text_splitter::ChunkConfig;
use tiktoken_rs::{CoreBPE, get_bpe_from_model, get_bpe_from_tokenizer, tokenizer::Tokenizer};

use super::TextSplitterError;

// Options is a struct that contains options for a text splitter.
#[derive(Debug, Clone)]
pub struct SplitterOptions {
  pub chunk_size: usize,
  pub chunk_overlap: usize,
  pub model_name: String,
  pub encoding_name: String,
  pub trim_chunks: bool,
}

impl Default for SplitterOptions {
  fn default() -> Self {
    Self::new()
  }
}

impl SplitterOptions {
  pub fn new() -> Self {
    SplitterOptions {
      chunk_size: 7168,
      chunk_overlap: 128,
      model_name: String::from("gpt-3.5-turbo"),
      encoding_name: String::from("cl100k_base"),
      trim_chunks: true,
    }
  }
}

// Builder pattern for Options struct
impl SplitterOptions {
  pub fn with_chunk_size(mut self, chunk_size: usize) -> Self {
    self.chunk_size = chunk_size;
    self
  }

  pub fn with_chunk_overlap(mut self, chunk_overlap: usize) -> Self {
    self.chunk_overlap = chunk_overlap;
    self
  }

  pub fn with_model_name(mut self, model_name: &str) -> Self {
    self.model_name = String::from(model_name);
    self
  }

  pub fn with_encoding_name(mut self, encoding_name: &str) -> Self {
    self.encoding_name = String::from(encoding_name);
    self
  }

  pub fn with_trim_chunks(mut self, trim_chunks: bool) -> Self {
    self.trim_chunks = trim_chunks;
    self
  }

  pub fn get_tokenizer_from_str(s: &str) -> Option<Tokenizer> {
    match s.to_lowercase().as_str() {
      "o200k_base" => Some(Tokenizer::O200kBase),
      "cl100k_base" => Some(Tokenizer::Cl100kBase),
      "p50k_base" => Some(Tokenizer::P50kBase),
      "r50k_base" => Some(Tokenizer::R50kBase),
      "p50k_edit" => Some(Tokenizer::P50kEdit),
      "gpt2" => Some(Tokenizer::Gpt2),
      _ => None,
    }
  }
}

impl TryFrom<&SplitterOptions> for ChunkConfig<CoreBPE> {
  type Error = TextSplitterError;

  fn try_from(options: &SplitterOptions) -> Result<Self, Self::Error> {
    let tk = if !options.encoding_name.is_empty() {
      let tokenizer =
        SplitterOptions::get_tokenizer_from_str(&options.encoding_name).ok_or(TextSplitterError::TokenizerNotFound)?;

      get_bpe_from_tokenizer(tokenizer).map_err(|_| TextSplitterError::InvalidTokenizer)?
    } else {
      get_bpe_from_model(&options.model_name).map_err(|_| TextSplitterError::InvalidModel)?
    };

    Ok(
      ChunkConfig::new(options.chunk_size)
        .with_sizer(tk)
        .with_trim(options.trim_chunks)
        .with_overlap(options.chunk_overlap)?,
    )
  }
}
