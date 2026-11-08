use std::path::PathBuf;

use affine_preview::{MermaidRenderOptions, TypstRenderOptions};

use crate::{Result, UniffiError};

#[uniffi::export]
pub fn render_mermaid_preview_svg(
  code: String,
  theme: Option<String>,
  font_family: Option<String>,
  font_size: Option<f64>,
) -> Result<String> {
  affine_preview::render_mermaid_svg(
    &code,
    MermaidRenderOptions {
      theme,
      font_family,
      font_size,
    },
  )
  .map_err(|error| UniffiError::Err(error.to_string()))
}

fn resolve_typst_font_dirs(font_dirs: Option<Vec<String>>) -> Vec<PathBuf> {
  font_dirs
    .map(|dirs| dirs.into_iter().map(PathBuf::from).collect())
    .unwrap_or_default()
}

#[uniffi::export]
pub fn render_typst_preview_svg(
  code: String,
  font_dirs: Option<Vec<String>>,
  cache_dir: Option<String>,
) -> Result<String> {
  affine_preview::render_typst_svg(
    &code,
    TypstRenderOptions {
      font_dirs: resolve_typst_font_dirs(font_dirs),
      cache_dir: cache_dir.map(PathBuf::from),
    },
  )
  .map_err(|error| UniffiError::Err(error.to_string()))
}
