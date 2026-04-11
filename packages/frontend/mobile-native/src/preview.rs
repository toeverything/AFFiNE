use std::{borrow::Cow, path::PathBuf};

use mermaid_rs_renderer::RenderOptions;
use typst::{
  diag::FileResult,
  foundations::Bytes,
  layout::{Abs, PagedDocument},
  syntax::{FileId, Source},
};
use typst_as_lib::{
  TypstEngine,
  cached_file_resolver::{CachedFileResolver, IntoCachedFileResolver},
  file_resolver::FileResolver,
  package_resolver::{FileSystemCache, PackageResolver},
  typst_kit_options::TypstKitFontOptions,
};

use crate::{Result, UniffiError};

const TYPST_PACKAGE_CACHE_DIR: &str = "typst-package-cache";

enum MobileTypstPackageResolver {
  FileSystem(CachedFileResolver<PackageResolver<FileSystemCache>>),
  InMemory(CachedFileResolver<PackageResolver<typst_as_lib::package_resolver::InMemoryCache>>),
}

impl FileResolver for MobileTypstPackageResolver {
  fn resolve_binary(&self, id: FileId) -> FileResult<Cow<'_, Bytes>> {
    match self {
      Self::FileSystem(resolver) => resolver.resolve_binary(id),
      Self::InMemory(resolver) => resolver.resolve_binary(id),
    }
  }

  fn resolve_source(&self, id: FileId) -> FileResult<Cow<'_, Source>> {
    match self {
      Self::FileSystem(resolver) => resolver.resolve_source(id),
      Self::InMemory(resolver) => resolver.resolve_source(id),
    }
  }
}

fn resolve_mermaid_render_options(
  theme: Option<String>,
  font_family: Option<String>,
  font_size: Option<f64>,
) -> RenderOptions {
  let mut render_options = match theme.as_deref() {
    Some("default") => RenderOptions::mermaid_default(),
    _ => RenderOptions::modern(),
  };

  if let Some(font_family) = font_family {
    render_options.theme.font_family = font_family;
  }

  if let Some(font_size) = font_size {
    render_options.theme.font_size = font_size as f32;
  }

  render_options
}

#[uniffi::export]
pub fn render_mermaid_preview_svg(
  code: String,
  theme: Option<String>,
  font_family: Option<String>,
  font_size: Option<f64>,
) -> Result<String> {
  let render_options = resolve_mermaid_render_options(theme, font_family, font_size);

  mermaid_rs_renderer::render_with_options(&code, render_options).map_err(|error| UniffiError::Err(error.to_string()))
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

fn resolve_typst_font_dirs(font_dirs: Option<Vec<String>>) -> Vec<PathBuf> {
  font_dirs
    .map(|dirs| dirs.into_iter().map(PathBuf::from).collect())
    .unwrap_or_default()
}

fn resolve_typst_package_resolver(cache_dir: Option<String>) -> Result<MobileTypstPackageResolver> {
  let resolver = match cache_dir {
    Some(cache_dir) => {
      let cache_dir = PathBuf::from(cache_dir).join(TYPST_PACKAGE_CACHE_DIR);
      std::fs::create_dir_all(&cache_dir).map_err(|error| UniffiError::Err(error.to_string()))?;
      MobileTypstPackageResolver::FileSystem(
        PackageResolver::builder()
          .cache(FileSystemCache(cache_dir))
          .build()
          .into_cached(),
      )
    }
    None => {
      MobileTypstPackageResolver::InMemory(PackageResolver::builder().with_in_memory_cache().build().into_cached())
    }
  };

  Ok(resolver)
}

#[uniffi::export]
pub fn render_typst_preview_svg(
  code: String,
  font_dirs: Option<Vec<String>>,
  cache_dir: Option<String>,
) -> Result<String> {
  let search_options = TypstKitFontOptions::new()
    .include_system_fonts(false)
    .include_embedded_fonts(true)
    .include_dirs(resolve_typst_font_dirs(font_dirs));
  let package_resolver = resolve_typst_package_resolver(cache_dir)?;

  let engine = TypstEngine::builder()
    .main_file(code)
    .search_fonts_with(search_options)
    .add_file_resolver(package_resolver)
    .build();

  let document = engine
    .compile::<PagedDocument>()
    .output
    .map_err(|error| UniffiError::Err(error.to_string()))?;

  Ok(normalize_typst_svg(typst_svg::svg_merged(&document, Abs::pt(0.0))))
}
