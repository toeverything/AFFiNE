/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/document_loaders
 */
mod parser;

pub use parser::{LanguageParser, LanguageParserOptions, get_language_by_filename};

use super::*;

#[derive(Debug, Clone)]
pub struct SourceCodeLoader {
  content: String,
  parser_option: LanguageParserOptions,
}

impl SourceCodeLoader {
  pub fn from_string<S: Into<String>>(input: S) -> Self {
    Self {
      content: input.into(),
      parser_option: LanguageParserOptions::default(),
    }
  }
}

impl SourceCodeLoader {
  pub fn with_parser_option(mut self, parser_option: LanguageParserOptions) -> Self {
    self.parser_option = parser_option;
    self
  }
}

impl Loader for SourceCodeLoader {
  fn load(self) -> LoaderResult<Vec<Document>> {
    let options = self.parser_option.clone();

    let docs = LanguageParser::from_language(options.language)
      .with_parser_threshold(options.parser_threshold)
      .parse_code(&self.content)?;

    Ok(docs)
  }
}

#[cfg(test)]
mod tests {
  use parser::Language;

  use super::*;

  #[test]
  fn test_source_code_loader() {
    let content = include_str!("../../../../fixtures/sample.rs");
    let loader = SourceCodeLoader::from_string(content).with_parser_option(LanguageParserOptions {
      language: Language::Rust,
      ..Default::default()
    });

    let documents_with_content = loader.load().unwrap();
    assert_eq!(documents_with_content.len(), 1);
  }
}
