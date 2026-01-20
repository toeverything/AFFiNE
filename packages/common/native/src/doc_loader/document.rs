use std::{
  io::Cursor,
  panic::{AssertUnwindSafe, catch_unwind},
  path::PathBuf,
};

use path_ext::PathExt;

use super::*;

#[derive(Clone, Default)]
pub struct Chunk {
  pub index: usize,
  pub content: String,
  pub start: Option<usize>,
  pub end: Option<usize>,
}

pub struct DocOptions {
  code_threshold: u64,
}

impl Default for DocOptions {
  fn default() -> Self {
    Self { code_threshold: 1000 }
  }
}

pub struct Doc {
  pub name: String,
  pub chunks: Vec<Chunk>,
}

impl Doc {
  pub fn new(file_path: &str, doc: &[u8]) -> LoaderResult<Self> {
    Self::with_options(file_path, doc, DocOptions::default())
  }

  pub fn with_options(file_path: &str, doc: &[u8], options: DocOptions) -> LoaderResult<Self> {
    if let Some(kind) = infer::get(&doc[..4096.min(doc.len())]).or(infer::get_from_path(file_path).ok().flatten()) {
      if kind.extension() == "pdf" {
        return Self::load_pdf(file_path, doc);
      } else if kind.extension() == "docx" {
        return Self::load_docx(file_path, doc);
      } else if kind.extension() == "html" {
        return Self::load_html(file_path, doc);
      }
    } else if let Ok(string) = String::from_utf8(doc.to_vec()).or_else(|_| {
      String::from_utf16(
        &doc
          .chunks_exact(2)
          .map(|b| u16::from_le_bytes([b[0], b[1]]))
          .collect::<Vec<_>>(),
      )
    }) {
      let path = PathBuf::from(file_path);
      match path.ext_str() {
        "md" => {
          let loader = TextLoader::new(string);
          let splitter = MarkdownSplitter::default();
          return Self::from_loader(file_path, loader, splitter);
        }
        "rs" | "c" | "cpp" | "h" | "hpp" | "js" | "ts" | "tsx" | "go" | "py" => {
          let name = path.full_str().to_string();
          let loader = SourceCodeLoader::from_string(string).with_parser_option(LanguageParserOptions {
            language: get_language_by_filename(&name)?,
            parser_threshold: options.code_threshold,
          });
          let splitter = TokenSplitter::default();
          return Self::from_loader(file_path, loader, splitter);
        }
        _ => {}
      }
      let loader = TextLoader::new(string);
      let splitter = TokenSplitter::default();
      return Self::from_loader(file_path, loader, splitter);
    }
    Err(LoaderError::Other("Failed to infer document type".into()))
  }

  fn from_loader(
    file_path: &str,
    loader: impl Loader + 'static,
    splitter: impl TextSplitter + 'static,
  ) -> Result<Doc, LoaderError> {
    let name = file_path.to_string();
    let chunks = catch_unwind(AssertUnwindSafe(|| Self::get_chunks_from_loader(loader, splitter))).map_err(|e| {
      LoaderError::Other(match e.downcast::<String>() {
        Ok(v) => *v,
        Err(e) => match e.downcast::<&str>() {
          Ok(v) => v.to_string(),
          _ => "Unknown Source of Error".to_owned(),
        },
      })
    })??;

    Ok(Self { name, chunks })
  }

  fn get_chunks_from_loader(
    loader: impl Loader + 'static,
    splitter: impl TextSplitter + 'static,
  ) -> Result<Vec<Chunk>, LoaderError> {
    let docs = loader.load_and_split(splitter)?;
    Ok(
      docs
        .into_iter()
        .enumerate()
        .map(|(index, d)| Chunk {
          index,
          content: d.page_content,
          ..Chunk::default()
        })
        .collect(),
    )
  }

  fn load_docx(file_path: &str, doc: &[u8]) -> LoaderResult<Self> {
    let loader = DocxLoader::new(Cursor::new(doc)).ok_or(LoaderError::Other("Failed to parse docx document".into()))?;
    let splitter = TokenSplitter::default();
    Self::from_loader(file_path, loader, splitter)
  }

  fn load_html(file_path: &str, doc: &[u8]) -> LoaderResult<Self> {
    let loader = HtmlLoader::from_string(
      String::from_utf8(doc.to_vec())?,
      Url::parse(file_path).or(Url::parse("https://example.com/"))?,
    );
    let splitter = TokenSplitter::default();
    Self::from_loader(file_path, loader, splitter)
  }

  fn load_pdf(file_path: &str, doc: &[u8]) -> LoaderResult<Self> {
    let loader = PdfExtractLoader::new(Cursor::new(doc))?;
    let splitter = TokenSplitter::default();
    Self::from_loader(file_path, loader, splitter)
  }
}

#[cfg(test)]
mod tests {
  use std::{
    fs::{read, read_to_string},
    path::PathBuf,
  };

  use super::*;

  const FIXTURES: [&str; 6] = [
    "demo.docx",
    "sample.pdf",
    "sample.html",
    "sample.rs",
    "sample.c",
    "sample.ts",
  ];

  fn get_fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures")
  }

  #[test]
  fn test_fixtures() {
    let fixtures = get_fixtures();
    for fixture in FIXTURES.iter() {
      let buffer = read(fixtures.join(fixture)).unwrap();
      let doc = Doc::with_options(fixture, &buffer, DocOptions { code_threshold: 0 }).unwrap();
      for chunk in doc.chunks.iter() {
        let output = read_to_string(fixtures.join(format!("{}.{}.md", fixture, chunk.index))).unwrap();
        assert_eq!(chunk.content, output);
      }
    }
  }
}
