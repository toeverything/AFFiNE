use napi::{bindgen_prelude::*, Env};
use napi_derive::napi;
use pdfium_render::prelude::PdfPages;

use crate::pdf::{Document, Page};

#[napi]
pub struct Pages {
  inner: SharedReference<Document, &'static PdfPages<'static>>,
}

#[napi]
impl Pages {
  pub(crate) fn new_with(reference: Reference<Document>, env: Env) -> Result<Self> {
    Ok(Self {
      inner: reference.share_with(env, |doc| Ok(doc.get_ref().pages()))?,
    })
  }

  pub fn get_ref(&self) -> &PdfPages<'_> {
    &*self.inner
  }

  #[napi]
  pub fn len(&self) -> u16 {
    self.inner.len()
  }

  #[napi]
  pub fn get(&self, reference: Reference<Pages>, env: Env, index: u16) -> Option<Page> {
    reference
      .share_with(env, |pages| {
        pages
          .inner
          .get(index)
          .map_err(|e| Error::from_reason(e.to_string()))
      })
      .map(Page::new_with)
      .ok()
  }
}
