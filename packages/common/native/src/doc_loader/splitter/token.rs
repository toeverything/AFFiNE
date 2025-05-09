use text_splitter::ChunkConfig;

/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/text_splitter
 */
use super::*;

#[derive(Debug, Clone)]
pub struct TokenSplitter {
  splitter_options: SplitterOptions,
}

impl Default for TokenSplitter {
  fn default() -> Self {
    TokenSplitter::new(SplitterOptions::default())
  }
}

impl TokenSplitter {
  pub fn new(options: SplitterOptions) -> TokenSplitter {
    TokenSplitter {
      splitter_options: options,
    }
  }
}

impl TextSplitter for TokenSplitter {
  fn split_text(&self, text: &str) -> Result<Vec<String>, TextSplitterError> {
    let chunk_config = ChunkConfig::try_from(&self.splitter_options)?;
    Ok(
      text_splitter::TextSplitter::new(chunk_config)
        .chunks(text)
        .map(|x| x.to_string())
        .collect(),
    )
  }
}
