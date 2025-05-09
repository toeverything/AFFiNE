/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/text_splitter
 */
mod error;
mod markdown;
mod options;
mod token;

use std::collections::HashMap;

pub use error::TextSplitterError;
pub use markdown::MarkdownSplitter;
use options::SplitterOptions;
use serde_json::Value;
pub use token::TokenSplitter;

use super::*;

pub trait TextSplitter: Send + Sync {
  fn split_text(&self, text: &str) -> Result<Vec<String>, TextSplitterError>;

  fn split_documents(&self, documents: &[Document]) -> Result<Vec<Document>, TextSplitterError> {
    let mut texts: Vec<String> = Vec::new();
    let mut metadata: Vec<HashMap<String, Value>> = Vec::new();
    documents.iter().for_each(|d| {
      texts.push(d.page_content.clone());
      metadata.push(d.metadata.clone());
    });

    self.create_documents(&texts, &metadata)
  }

  fn create_documents(
    &self,
    text: &[String],
    metadata: &[HashMap<String, Value>],
  ) -> Result<Vec<Document>, TextSplitterError> {
    let mut metadata = metadata.to_vec();
    if metadata.is_empty() {
      metadata = vec![HashMap::new(); text.len()];
    }

    if text.len() != metadata.len() {
      return Err(TextSplitterError::MetadataTextMismatch);
    }

    let mut documents: Vec<Document> = Vec::new();
    for i in 0..text.len() {
      let chunks = self.split_text(&text[i])?;
      for chunk in chunks {
        let document = Document::new(chunk).with_metadata(metadata[i].clone());
        documents.push(document);
      }
    }

    Ok(documents)
  }
}
