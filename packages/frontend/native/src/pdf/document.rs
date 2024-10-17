use std::collections::HashMap;

use napi::{bindgen_prelude::*, Env};
use napi_derive::napi;
use pdfium_render::prelude::PdfDocument;

use crate::pdf::{Pages, Viewer};

#[napi]
pub struct Document {
  inner: SharedReference<Viewer, PdfDocument<'static>>,
}

#[napi]
impl Document {
  pub(crate) fn new_with(inner: SharedReference<Viewer, PdfDocument<'_>>) -> Self {
    Self { inner }
  }

  pub fn get_ref(&self) -> &PdfDocument<'static> {
    &*self.inner
  }

  #[napi]
  pub fn version(&self) -> String {
    let version = self.inner.version();
    format!("{version:?}").to_lowercase()
  }

  #[napi]
  pub fn metadata(&self) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for tag in self.inner.metadata().iter() {
      let key = tag.tag_type();
      let value = tag.value();
      map.insert(format!("{key:?}").to_lowercase(), value.to_string());
    }
    map
  }

  #[napi]
  pub fn permissions(&self) {
    unimplemented!()
  }

  #[napi]
  pub fn signatures(&self) {
    unimplemented!()
  }

  #[napi]
  pub fn pages(&self, reference: Reference<Document>, env: Env) -> Result<Pages> {
    Pages::new_with(reference, env)
  }

  pub fn clone(&self, env: Env) -> Result<Self> {
    self.inner.clone(env).map(Self::new_with)
  }
}
