use text_splitter::ChunkConfig;

/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/text_splitter
 */
use super::*;

pub struct MarkdownSplitter {
  splitter_options: SplitterOptions,
}

impl Default for MarkdownSplitter {
  fn default() -> Self {
    MarkdownSplitter::new(SplitterOptions::default())
  }
}

impl MarkdownSplitter {
  pub fn new(options: SplitterOptions) -> MarkdownSplitter {
    MarkdownSplitter {
      splitter_options: options,
    }
  }
}

impl TextSplitter for MarkdownSplitter {
  fn split_text(&self, text: &str) -> Result<Vec<String>, TextSplitterError> {
    let chunk_config = ChunkConfig::try_from(&self.splitter_options)?;
    Ok(
      text_splitter::MarkdownSplitter::new(chunk_config)
        .chunks(text)
        .map(|x| x.to_string())
        .collect(),
    )
  }
}
