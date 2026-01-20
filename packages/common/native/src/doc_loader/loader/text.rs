/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/document_loaders
 */
use super::*;

#[derive(Debug, Clone)]
pub struct TextLoader {
  content: String,
}

impl TextLoader {
  pub fn new<T: Into<String>>(input: T) -> Self {
    Self { content: input.into() }
  }
}

impl Loader for TextLoader {
  fn load(self) -> LoaderResult<Vec<Document>> {
    let doc = Document::new(self.content);
    Ok(vec![doc])
  }
}
