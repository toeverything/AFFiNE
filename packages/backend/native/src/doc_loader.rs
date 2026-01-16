use affine_common::doc_loader::Doc;
use napi::{
  Env, Result, Task,
  anyhow::anyhow,
  bindgen_prelude::{AsyncTask, Buffer},
};

#[napi(object)]
pub struct Chunk {
  pub index: i64,
  pub content: String,
}

#[napi(object)]
pub struct ParsedDoc {
  pub name: String,
  pub chunks: Vec<Chunk>,
}

pub struct Document {
  inner: Doc,
}

impl Document {
  fn name(&self) -> String {
    self.inner.name.clone()
  }

  fn chunks(&self) -> Vec<Chunk> {
    self
      .inner
      .chunks
      .iter()
      .enumerate()
      .map(|(i, chunk)| {
        let content = crate::utils::clean_content(&chunk.content);
        Chunk {
          index: i as i64,
          content,
        }
      })
      .collect::<Vec<Chunk>>()
  }
}

pub struct AsyncParseDocResponse {
  file_path: String,
  doc: Vec<u8>,
}

#[napi]
impl Task for AsyncParseDocResponse {
  type Output = Document;
  type JsValue = ParsedDoc;

  fn compute(&mut self) -> Result<Self::Output> {
    let doc = Doc::new(&self.file_path, &self.doc).map_err(|e| anyhow!(e))?;
    Ok(Document { inner: doc })
  }

  fn resolve(&mut self, _: Env, doc: Document) -> Result<Self::JsValue> {
    Ok(ParsedDoc {
      name: doc.name(),
      chunks: doc.chunks(),
    })
  }
}

#[napi]
pub fn parse_doc(file_path: String, doc: Buffer) -> AsyncTask<AsyncParseDocResponse> {
  AsyncTask::new(AsyncParseDocResponse {
    file_path,
    doc: doc.to_vec(),
  })
}
