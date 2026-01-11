use pdf_extract::{PlainTextOutput, output_doc, output_doc_encrypted};

/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/document_loaders
 */
use super::*;

#[derive(Debug, Clone)]
pub struct PdfExtractLoader {
  document: pdf_extract::Document,
}

impl PdfExtractLoader {
  pub fn new<R: Read>(reader: R) -> Result<Self, LoaderError> {
    let document = pdf_extract::Document::load_from(reader)?;
    Ok(Self { document })
  }
}

impl PdfExtractLoader {
  fn extract_text(&self) -> Result<String, LoaderError> {
    let mut doc = self.document.clone();
    let mut buffer: Vec<u8> = Vec::new();
    let mut output = PlainTextOutput::new(&mut buffer as &mut dyn std::io::Write);
    if doc.is_encrypted() {
      output_doc_encrypted(&mut doc, &mut output, "")?;
    } else {
      output_doc(&doc, &mut output)?;
    }
    Ok(String::from_utf8(buffer)?)
  }

  fn extract_text_to_doc(&self) -> Result<Document, LoaderError> {
    let text = self.extract_text()?;
    Ok(Document::new(text))
  }
}

impl Loader for PdfExtractLoader {
  fn load(self) -> LoaderResult<Vec<Document>> {
    let doc = self.extract_text_to_doc()?;
    Ok(vec![doc])
  }
}

#[cfg(test)]
mod tests {
  use std::{
    fs::read,
    io::Cursor,
    path::{Path, PathBuf},
  };

  use path_ext::PathExt;

  use super::*;

  fn parse_pdf_content(path: &Path) -> Vec<Document> {
    let buffer = read(path).unwrap();

    let reader = Cursor::new(buffer);
    let loader = PdfExtractLoader::new(reader).expect("Failed to create PdfExtractLoader");

    loader.load().unwrap()
  }

  #[test]
  fn test_parse_pdf() {
    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures");
    let docs = parse_pdf_content(&fixtures.join("sample.pdf"));

    assert_eq!(docs.len(), 1);
    assert_eq!(
      &docs[0].page_content[..100],
      "\n\nSample PDF\nThis is a simple PDF ﬁle. Fun fun fun.\n\nLorem ipsum dolor  sit amet,  consectetuer  a"
    );
  }

  #[test]
  #[ignore = "for debugging only"]
  fn test_parse_pdf_custom() {
    let mut args = std::env::args().collect::<Vec<_>>();

    let fixtures = 'path: {
      while let Some(path) = args.pop() {
        let path = PathBuf::from(path);
        if path.is_dir() {
          break 'path path;
        }
      }
      panic!("No directory provided");
    };

    for path in fixtures.walk_iter(|p| p.is_file() && p.ext_str() == "pdf") {
      println!("Parsing: {}", path.display());
      let docs = parse_pdf_content(&path);

      let chunks = docs.len();
      let words = docs.iter().map(|d| d.page_content.len()).sum::<usize>();
      println!("{}: {} chunks, {} words", path.display(), chunks, words,);
    }
  }
}
