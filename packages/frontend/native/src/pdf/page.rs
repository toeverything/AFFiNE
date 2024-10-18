use napi::bindgen_prelude::*;
use napi_derive::napi;
use pdfium_render::prelude::{PdfPage, PdfRenderConfig};

use crate::pdf::{ImageData, Orientation, PagerSize, Pages, Rect, Rotation};

#[napi]
pub struct Page {
  inner: SharedReference<Pages, PdfPage<'static>>,
}

#[napi]
impl Page {
  pub(crate) fn new_with(inner: SharedReference<Pages, PdfPage<'_>>) -> Self {
    Self { inner }
  }

  #[napi]
  pub fn text(&self) -> Result<String> {
    self
      .inner
      .text()
      .map(|t| t.all())
      .map_err(|e| Error::from_reason(e.to_string()))
  }

  #[napi]
  pub fn rect(&self) -> Rect {
    self.inner.page_size().into()
  }

  #[napi]
  pub fn paper_size(&self) -> PagerSize {
    self.inner.paper_size().into()
  }

  #[napi]
  pub fn layout(&self) -> Orientation {
    self.inner.orientation().into()
  }

  /// Returns `true` if this [`Page`] has orientation [`Orientation::Portrait`].
  #[napi]
  #[inline]
  pub fn is_portrait(&self) -> bool {
    self.layout() == Orientation::Portrait
  }

  /// Returns `true` if this [`Page`] has orientation [`Orientation::Landscape`].
  #[napi]
  #[inline]
  pub fn is_landscape(&self) -> bool {
    self.layout() == Orientation::Landscape
  }

  #[napi]
  pub fn render_as_bytes(
    &self,
    width: i32,
    height: i32,
    rotation: Option<Rotation>,
  ) -> Option<Buffer> {
    self
      .inner
      .render(width, height, rotation.map(Into::into))
      .map(|bitmap| bitmap.as_raw_bytes().into())
      .ok()
  }

  #[napi]
  pub fn render(
    &self,
    width: i32,
    height: i32,
    rotation: Option<Rotation>,
  ) -> Option<Uint8ClampedArray> {
    self
      .inner
      .render(width, height, rotation.map(Into::into))
      .map(|bitmap| Uint8ClampedArray::from(bitmap.as_rgba_bytes()))
      .ok()
  }

  #[napi]
  pub fn render_with_scale(&self, scale: i32) -> Option<ImageData> {
    let config = PdfRenderConfig::new().scale_page_by_factor(scale as f32);

    self
      .inner
      .render_with_config(&config)
      .map(|bitmap| ImageData {
        data: Uint8ClampedArray::from(bitmap.as_rgba_bytes()),
        width: bitmap.width(),
        height: bitmap.height(),
      })
      .ok()
  }
}
