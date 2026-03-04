use docx_parser::MarkdownDocument;

use super::*;

#[derive(Debug)]
pub struct DocxLoader {
  document: MarkdownDocument,
}

impl DocxLoader {
  pub fn new<R: Read + Seek>(reader: R) -> Option<Self> {
    Some(Self {
      document: MarkdownDocument::from_reader(reader)?,
    })
  }

  fn extract_text(&self) -> String {
    self.document.to_markdown(false)
  }

  fn extract_text_to_doc(&self) -> Document {
    Document::new(self.extract_text())
  }
}

impl Loader for DocxLoader {
  fn load(self) -> LoaderResult<Vec<Document>> {
    let doc = self.extract_text_to_doc();
    Ok(vec![doc])
  }
}

#[cfg(test)]
mod tests {
  use std::{fs::read, io::Cursor, path::PathBuf};

  use super::*;

  fn get_fixtures_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures")
  }

  #[test]
  fn test_parse_docx() {
    let docx_buffer = include_bytes!("../../../fixtures/demo.docx");
    let parsed_buffer = include_str!("../../../fixtures/demo.docx.md");

    {
      let loader = DocxLoader::new(Cursor::new(docx_buffer)).unwrap();

      let documents = loader.load().unwrap();

      assert_eq!(documents.len(), 1);
      assert_eq!(documents[0].page_content, parsed_buffer);
    }

    {
      let loader = DocxLoader::new(Cursor::new(docx_buffer)).unwrap();
      let documents = loader.load_and_split(TokenSplitter::default()).unwrap();

      for (idx, doc) in documents.into_iter().enumerate() {
        assert_eq!(
          doc.page_content,
          String::from_utf8_lossy(&read(get_fixtures_path().join(format!("demo.docx.{}.md", idx))).unwrap())
        );
      }
    }
  }
}
