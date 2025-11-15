use napi::{
  bindgen_prelude::Uint8Array,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use y_octo::{CrdtRead, Doc as YDoc, History, RawDecoder, StateVector};

use super::*;

#[napi]
pub struct Doc {
  doc: YDoc,
}

#[napi]
impl Doc {
  #[napi(constructor)]
  pub fn new(client_id: Option<i64>) -> Self {
    Self {
      doc: if let Some(client_id) = client_id {
        YDoc::with_client(client_id as u64)
      } else {
        YDoc::default()
      },
    }
  }

  #[napi(getter)]
  pub fn client_id(&self) -> i64 {
    self.doc.client() as i64
  }

  #[napi(getter)]
  pub fn guid(&self) -> &str {
    self.doc.guid()
  }

  #[napi(getter)]
  pub fn keys(&self) -> Vec<String> {
    self.doc.keys()
  }

  #[napi]
  pub fn get_or_create_array(&self, key: String) -> Result<YArray> {
    self
      .doc
      .get_or_create_array(key)
      .map(YArray::inner_new)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn get_or_create_text(&self, key: String) -> Result<YText> {
    self
      .doc
      .get_or_create_text(key)
      .map(YText::inner_new)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn get_or_create_map(&self, key: String) -> Result<YMap> {
    self
      .doc
      .get_or_create_map(key)
      .map(YMap::inner_new)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn create_array(&self) -> Result<YArray> {
    self
      .doc
      .create_array()
      .map(YArray::inner_new)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn create_text(&self) -> Result<YText> {
    self
      .doc
      .create_text()
      .map(YText::inner_new)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn create_map(&self) -> Result<YMap> {
    self
      .doc
      .create_map()
      .map(YMap::inner_new)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn apply_update(&mut self, update: &[u8]) -> Result<()> {
    self.doc.apply_update_from_binary_v1(update)?;

    Ok(())
  }

  #[napi]
  pub fn encode_state_as_update_v1(&self, state: Option<&[u8]>) -> Result<Uint8Array> {
    let result = match state {
      Some(state) => {
        let mut decoder = RawDecoder::new(state);
        let state = StateVector::read(&mut decoder)?;
        self.doc.encode_state_as_update_v1(&state)
      }
      None => self.doc.encode_update_v1(),
    };

    result.map(|v| v.into()).map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn gc(&self) -> Result<()> {
    self.doc.gc().map_err(anyhow::Error::from)
  }

  #[napi(ts_args_type = "callback: (result: Uint8Array) => void")]
  pub fn on_update(&mut self, callback: ThreadsafeFunction<Uint8Array>) -> Result<()> {
    let callback = move |update: &[u8], _h: &[History]| {
      callback.call(
        Ok(update.to_vec().into()),
        ThreadsafeFunctionCallMode::Blocking,
      );
    };
    self.doc.subscribe(Box::new(callback));
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_doc_client() {
    let client_id = 1;
    let doc = Doc::new(Some(client_id));
    assert_eq!(doc.client_id(), 1);
  }

  #[test]
  fn test_doc_guid() {
    let doc = Doc::new(None);
    assert_eq!(doc.guid().len(), 21);
  }

  #[test]
  fn test_create_array() {
    let doc = Doc::new(None);
    let array = doc.get_or_create_array("array".into()).unwrap();
    assert_eq!(array.length(), 0);
  }

  #[test]
  fn test_create_text() {
    let doc = Doc::new(None);
    let text = doc.get_or_create_text("text".into()).unwrap();
    assert_eq!(text.len(), 0);
  }

  #[test]
  fn test_keys() {
    let doc = Doc::new(None);
    doc.get_or_create_array("array".into()).unwrap();
    doc.get_or_create_text("text".into()).unwrap();
    doc.get_or_create_map("map".into()).unwrap();
    let mut keys = doc.keys();
    keys.sort();
    assert_eq!(keys, vec!["array", "map", "text"]);
  }
}
