use std::path::PathBuf;

use mermaid_rs_renderer::RenderOptions;
use napi::{Error, Result};
use napi_derive::napi;
use typst::layout::{Abs, PagedDocument};
use typst_as_lib::{TypstEngine, typst_kit_options::TypstKitFontOptions};

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

fn resolve_mermaid_render_options(options: Option<MermaidRenderOptions>) -> RenderOptions {
  let mut render_options = match options.as_ref().and_then(|options| options.theme.as_deref()) {
    Some("default") => RenderOptions::mermaid_default(),
    _ => RenderOptions::modern(),
  };

  if let Some(options) = options {
    if let Some(font_family) = options.font_family {
      render_options.theme.font_family = font_family;
    }

    if let Some(font_size) = options.font_size {
      render_options.theme.font_size = font_size as f32;
    }
  }

  render_options
}

#[napi]
pub fn render_mermaid_svg(request: MermaidRenderRequest) -> Result<MermaidRenderResult> {
  let render_options = resolve_mermaid_render_options(request.options);
  let svg = mermaid_rs_renderer::render_with_options(&request.code, render_options)
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

fn normalize_typst_svg(svg: String) -> String {
  let mut svg = svg;
  let page_background_marker = r##"<path class="typst-shape""##;
  let mut cursor = 0;

  while let Some(relative_idx) = svg[cursor..].find(page_background_marker) {
    let idx = cursor + relative_idx;
    let rest = &svg[idx..];
    let Some(relative_end) = rest.find("/>") else {
      break;
    };

    let end = idx + relative_end + 2;
    let path_fragment = &svg[idx..end];
    let is_page_background_path =
      path_fragment.contains(r#"d="M 0 0v "#) && path_fragment.contains(r#" h "#) && path_fragment.contains(r#" v -"#);

    if is_page_background_path {
      svg.replace_range(idx..end, "");
      cursor = idx;
      continue;
    }

    cursor = end;
  }

  svg
}

#[napi]
pub fn render_typst_svg(request: TypstRenderRequest) -> Result<TypstRenderResult> {
  let font_dirs = resolve_typst_font_dirs(&request.options);
  let search_options = TypstKitFontOptions::new()
    .include_system_fonts(false)
    .include_embedded_fonts(true)
    .include_dirs(font_dirs);

  let engine = TypstEngine::builder()
    .main_file(request.code)
    .search_fonts_with(search_options)
    .with_package_file_resolver()
    .build();

  let document = engine
    .compile::<PagedDocument>()
    .output
    .map_err(|error| Error::from_reason(error.to_string()))?;

  let svg = normalize_typst_svg(typst_svg::svg_merged(&document, Abs::pt(0.0)));
  Ok(TypstRenderResult { svg })
}

#[cfg(test)]
mod tests {
  use super::normalize_typst_svg;

  #[test]
  fn normalize_typst_svg_removes_all_backgrounds() {
    let input = r##"<svg>
    <path class="typst-shape" fill="#ffffff" fill-rule="nonzero" d="M 0 0v 10 h 10 v -10 Z "/>
    <g></g>
    <path class="typst-shape" fill="#ffffff" fill-rule="nonzero" d="M 0 0v 10 h 10 v -10 Z "/>
    <g transform="matrix(1 0 0 1 0 10)"></g>
    </svg>"##
      .to_string();

    let normalized = normalize_typst_svg(input);
    let retained = normalized
      .matches(r##"<path class="typst-shape" fill="#ffffff" fill-rule="nonzero""##)
      .count();
    assert_eq!(retained, 0);
  }

  #[test]
  fn normalize_typst_svg_keeps_non_background_paths() {
    let input = r##"<svg>
    <path class="typst-shape" fill="#000000" fill-rule="nonzero" d="M 1 2 L 3 4 Z "/>
    </svg>"##
      .to_string();

    let normalized = normalize_typst_svg(input);
    assert!(normalized.contains(r##"d="M 1 2 L 3 4 Z ""##));
  }
}
