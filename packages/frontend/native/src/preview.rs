use std::path::PathBuf;

use affine_preview::{
  MermaidRenderOptions as PreviewMermaidRenderOptions, TypstRenderOptions as PreviewTypstRenderOptions,
};
use napi::{Error, Result};
use napi_derive::napi;

#[napi(object)]
pub struct MermaidRenderOptions {
  pub theme: Option<String>,
  pub font_family: Option<String>,
  pub font_size: Option<f64>,
}

#[napi(object)]
pub struct MermaidRenderRequest {
  pub code: String,
  pub options: Option<MermaidRenderOptions>,
}

#[napi(object)]
pub struct MermaidRenderResult {
  pub svg: String,
}

#[napi]
pub fn render_mermaid_svg(request: MermaidRenderRequest) -> Result<MermaidRenderResult> {
  let options = request.options.unwrap_or(MermaidRenderOptions {
    theme: None,
    font_family: None,
    font_size: None,
  });
  let svg = affine_preview::render_mermaid_svg(
    &request.code,
    PreviewMermaidRenderOptions {
      theme: options.theme,
      font_family: options.font_family,
      font_size: options.font_size,
    },
  )
  .map_err(|error| Error::from_reason(error.to_string()))?;

  Ok(MermaidRenderResult { svg })
}

#[napi(object)]
pub struct TypstRenderOptions {
  pub font_urls: Option<Vec<String>>,
  pub font_dirs: Option<Vec<String>>,
}

#[napi(object)]
pub struct TypstRenderRequest {
  pub code: String,
  pub options: Option<TypstRenderOptions>,
}

#[napi(object)]
pub struct TypstRenderResult {
  pub svg: String,
}

fn resolve_local_font_dir(value: &str) -> Option<PathBuf> {
  let path = if let Some(stripped) = value.strip_prefix("file://") {
    PathBuf::from(stripped)
  } else {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
      return None;
    }
    path
  };

  if path.is_dir() {
    return Some(path);
  }

  path.parent().map(|parent| parent.to_path_buf())
}

fn resolve_typst_font_dirs(options: &Option<TypstRenderOptions>) -> Vec<PathBuf> {
  let Some(options) = options.as_ref() else {
    return Vec::new();
  };

  let mut font_dirs = options
    .font_dirs
    .as_ref()
    .map(|dirs| dirs.iter().map(PathBuf::from).collect::<Vec<_>>())
    .unwrap_or_default();

  if let Some(font_urls) = options.font_urls.as_ref() {
    font_dirs.extend(font_urls.iter().filter_map(|url| resolve_local_font_dir(url)));
  }

  font_dirs
}

#[napi]
pub fn render_typst_svg(request: TypstRenderRequest) -> Result<TypstRenderResult> {
  let font_dirs = resolve_typst_font_dirs(&request.options);
  let svg = affine_preview::render_typst_svg(
    &request.code,
    PreviewTypstRenderOptions {
      font_dirs,
      cache_dir: None,
    },
  )
  .map_err(|error| Error::from_reason(error.to_string()))?;
  Ok(TypstRenderResult { svg })
}
