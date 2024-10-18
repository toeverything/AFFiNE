use napi_derive::napi;
use pdfium_render::prelude::PdfRect;

#[napi]
pub struct Rect {
  inner: PdfRect,
}

#[napi]
impl Rect {
  pub fn new() -> Self {
    Self {
      inner: PdfRect::ZERO,
    }
  }

  #[napi]
  pub fn top(&self) -> f32 {
    self.inner.top.value
  }

  #[napi]
  pub fn right(&self) -> f32 {
    self.inner.right.value
  }

  #[napi]
  pub fn bottom(&self) -> f32 {
    self.inner.bottom.value
  }

  #[napi]
  pub fn left(&self) -> f32 {
    self.inner.left.value
  }

  #[napi]
  pub fn width(&self) -> f32 {
    self.inner.width().value
  }

  #[napi]
  pub fn height(&self) -> f32 {
    self.inner.height().value
  }
}

impl AsRef<PdfRect> for Rect {
  fn as_ref(&self) -> &PdfRect {
    &self.inner
  }
}

impl From<PdfRect> for Rect {
  fn from(value: PdfRect) -> Self {
    Self { inner: value }
  }
}
