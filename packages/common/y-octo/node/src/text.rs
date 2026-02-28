use y_octo::Text;

use super::*;

#[napi]
pub struct YText {
  pub(crate) text: Text,
}

#[napi]
impl YText {
  #[allow(clippy::new_without_default)]
  #[napi(constructor)]
  pub fn new() -> Self {
    unimplemented!()
  }

  pub(crate) fn inner_new(text: Text) -> Self {
    Self { text }
  }

  #[napi(getter)]
  pub fn len(&self) -> i64 {
    self.text.len() as i64
  }

  #[napi(getter)]
  pub fn is_empty(&self) -> bool {
    self.text.is_empty()
  }

  #[napi]
  pub fn insert(&mut self, index: i64, str: String) -> Result<()> {
    self
      .text
      .insert(index as u64, str)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn remove(&mut self, index: i64, len: i64) -> Result<()> {
    self
      .text
      .remove(index as u64, len as u64)
      .map_err(anyhow::Error::from)
  }

  #[napi(getter)]
  pub fn length(&self) -> i64 {
    self.text.len() as i64
  }

  #[allow(clippy::inherent_to_string)]
  #[napi]
  pub fn to_string(&self) -> String {
    self.text.to_string()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_text_init() {
    let doc = Doc::new(None);
    let text = doc.get_or_create_text("text".into()).unwrap();
    assert_eq!(text.len(), 0);
  }

  #[test]
  fn test_text_edit() {
    let doc = Doc::new(None);
    let mut text = doc.get_or_create_text("text".into()).unwrap();
    text.insert(0, "hello".into()).unwrap();
    assert_eq!(text.to_string(), "hello");
    text.insert(5, " world".into()).unwrap();
    assert_eq!(text.to_string(), "hello world");
    text.remove(5, 6).unwrap();
    assert_eq!(text.to_string(), "hello");
  }
}
