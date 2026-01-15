use std::{collections::HashMap, io::Cursor};

use serde_json::Value;

/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/document_loaders
 */
use super::*;
#[derive(Debug, Clone)]
pub struct HtmlLoader<R> {
  html: R,
  url: Url,
}

impl HtmlLoader<Cursor<Vec<u8>>> {
  pub fn from_string<S: Into<String>>(input: S, url: Url) -> Self {
    let input = input.into();
    let reader = Cursor::new(input.into_bytes());
    Self::new(reader, url)
  }
}

impl<R: Read> HtmlLoader<R> {
  pub fn new(html: R, url: Url) -> Self {
    Self { html, url }
  }
}

impl<R: Read + Send + Sync + 'static> Loader for HtmlLoader<R> {
  fn load(mut self) -> LoaderResult<Vec<Document>> {
    let cleaned_html = readability::extractor::extract(&mut self.html, &self.url)?;
    let doc = Document::new(format!("{}\n{}", cleaned_html.title, cleaned_html.text))
      .with_metadata(HashMap::from([("source".to_string(), Value::from(self.url.as_str()))]));

    Ok(vec![doc])
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_html_loader() {
    let input = "<p>Hello world!</p>";

    let html_loader = HtmlLoader::new(input.as_bytes(), Url::parse("https://example.com/").unwrap());

    let documents = html_loader.load().unwrap();

    let expected = "\nHello world!";

    assert_eq!(documents.len(), 1);
    assert_eq!(
      documents[0].metadata.get("source").unwrap(),
      &Value::from("https://example.com/")
    );
    assert_eq!(documents[0].page_content, expected);
  }

  #[test]
  fn test_html_load_from_path() {
    let buffer = include_bytes!("../../../fixtures/sample.html");
    let html_loader = HtmlLoader::new(Cursor::new(buffer), Url::parse("https://example.com/").unwrap());

    let documents = html_loader.load().unwrap();

    let expected = [
      "Example Domain",
      "",
      "        This domain is for use in illustrative examples in documents. You may",
      "        use this domain in literature without prior coordination or asking for",
      "        permission.",
      "      More information...",
    ]
    .join("\n");

    assert_eq!(documents.len(), 1);
    assert_eq!(
      documents[0].metadata.get("source").unwrap(),
      &Value::from("https://example.com/")
    );
    assert_eq!(documents[0].page_content, expected);
  }
}
