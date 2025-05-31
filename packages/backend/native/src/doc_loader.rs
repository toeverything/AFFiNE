use affine_common::doc_loader::Doc;
use napi::{
  anyhow::anyhow,
  bindgen_prelude::{Array, AsyncTask, Buffer, Object},
  Env, Result, Task,
};

pub struct Document {
  inner: Doc,
}

impl Document {
  fn name(&self) -> String {
    self.inner.name.clone()
  }

  fn chunks(&self, env: &Env) -> Result<Array> {
    let vec = self
      .inner
      .chunks
      .iter()
      .enumerate()
      .map(|(i, chunk)| {
        let content = crate::utils::clean_content(&chunk.content);
        let mut obj = Object::new(env)?;
        obj.set("index", i as i64)?;
        obj.set("content", content)?;
        Ok(obj)
      })
      .collect::<Result<Vec<Object>>>()?;
    Array::from_vec(env, vec)
  }
}

pub struct AsyncParseDocResponse {
  file_path: String,
  doc: Vec<u8>,
}

#[napi]
impl Task for AsyncParseDocResponse {
  type Output = Document;
  type JsValue = Object<'static>;

  fn compute(&mut self) -> Result<Self::Output> {
    let doc = Doc::new(&self.file_path, &self.doc).map_err(|e| anyhow!(e))?;
    Ok(Document { inner: doc })
  }

  fn resolve(&mut self, env: Env, doc: Document) -> Result<Self::JsValue> {
    let mut obj = Object::new(&env)?;
    obj.set("name", doc.name())?;
    obj.set("chunks", doc.chunks(&env)?)?;
    Ok(obj)
  }
}

#[napi(
  ts_return_type = "Promise<{ name: string, chunks: Array<{index: number, content: string}> }>"
)]
pub fn parse_doc(file_path: String, doc: Buffer) -> AsyncTask<AsyncParseDocResponse> {
  AsyncTask::new(AsyncParseDocResponse {
    file_path,
    doc: doc.to_vec(),
  })
}
