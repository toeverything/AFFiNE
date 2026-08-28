use std::collections::HashMap;

use affine_common::napi_utils::map_napi_err;
use affine_doc_loader::{
  self as doc_loader, Bounds, CanvasBlock, CanvasElement, CanvasProjectionV1, DocumentSearchProjectionV1,
  DocumentSearchUnit, MarkdownResult, PageDocContent, ProjectionWarning, SearchUnitSource, Visibility,
  WorkspaceDocContent,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct NativeMarkdownResult {
  pub title: String,
  pub markdown: String,
  pub known_unsupported_blocks: Vec<String>,
  pub unknown_blocks: Vec<String>,
}

impl From<MarkdownResult> for NativeMarkdownResult {
  fn from(result: MarkdownResult) -> Self {
    Self {
      title: result.title,
      markdown: result.markdown,
      known_unsupported_blocks: result.known_unsupported_blocks,
      unknown_blocks: result.unknown_blocks,
    }
  }
}

#[napi(object)]
pub struct NativePageDocContent {
  pub title: String,
  pub summary: String,
}

impl From<PageDocContent> for NativePageDocContent {
  fn from(result: PageDocContent) -> Self {
    Self {
      title: result.title,
      summary: result.summary,
    }
  }
}

#[napi(object)]
pub struct NativeWorkspaceDocContent {
  pub name: String,
  pub avatar_key: String,
}

impl From<WorkspaceDocContent> for NativeWorkspaceDocContent {
  fn from(result: WorkspaceDocContent) -> Self {
    Self {
      name: result.name,
      avatar_key: result.avatar_key,
    }
  }
}

#[napi(object)]
pub struct PublicDocMetaInput {
  pub id: String,
  pub title: Option<String>,
}

#[napi(object)]
pub struct NativeDocBounds {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

impl From<Bounds> for NativeDocBounds {
  fn from(value: Bounds) -> Self {
    Self {
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
    }
  }
}

#[napi(object)]
pub struct NativeProjectionWarning {
  pub code: String,
  pub locator: String,
}

impl From<ProjectionWarning> for NativeProjectionWarning {
  fn from(value: ProjectionWarning) -> Self {
    Self {
      code: value.code,
      locator: value.locator,
    }
  }
}

fn visibility(value: Visibility) -> String {
  match value {
    Visibility::Page => "page",
    Visibility::Edgeless => "edgeless",
    Visibility::Both => "both",
  }
  .into()
}

#[napi(object)]
pub struct NativeCanvasProjectionBlock {
  pub id: String,
  #[napi(js_name = "type")]
  pub block_type: String,
  pub visibility: String,
  pub bounds: Option<NativeDocBounds>,
  pub text: Option<String>,
  pub title: Option<String>,
  pub child_ids: Vec<String>,
}

impl From<CanvasBlock> for NativeCanvasProjectionBlock {
  fn from(value: CanvasBlock) -> Self {
    Self {
      id: value.id,
      block_type: value.block_type,
      visibility: visibility(value.visibility),
      bounds: value.bounds.map(Into::into),
      text: value.text,
      title: value.title,
      child_ids: value.child_ids,
    }
  }
}

#[napi(object)]
pub struct NativeCanvasProjectionElement {
  pub id: String,
  #[napi(js_name = "type")]
  pub element_type: String,
  pub bounds: Option<NativeDocBounds>,
  pub text: Option<String>,
  pub title: Option<String>,
  pub frame_id: Option<String>,
  pub child_ids: Vec<String>,
  pub source_id: Option<String>,
  pub target_id: Option<String>,
  pub parent_id: Option<String>,
  pub index: Option<String>,
  pub point_count: Option<u32>,
  pub color: Option<String>,
  pub line_width: Option<f64>,
}

impl From<CanvasElement> for NativeCanvasProjectionElement {
  fn from(value: CanvasElement) -> Self {
    Self {
      id: value.id,
      element_type: value.element_type,
      bounds: value.bounds.map(Into::into),
      text: value.text,
      title: value.title,
      frame_id: value.frame_id,
      child_ids: value.child_ids,
      source_id: value.source_id,
      target_id: value.target_id,
      parent_id: value.parent_id,
      index: value.index,
      point_count: value.point_count,
      color: value.color,
      line_width: value.line_width,
    }
  }
}

#[napi(object)]
pub struct NativeCanvasProjection {
  pub version: u8,
  pub doc_id: String,
  pub revision: String,
  pub title: String,
  pub surface_block_id: Option<String>,
  pub bounds: Option<NativeDocBounds>,
  pub counts: HashMap<String, u32>,
  pub blocks: Vec<NativeCanvasProjectionBlock>,
  pub elements: Vec<NativeCanvasProjectionElement>,
  pub warnings: Vec<NativeProjectionWarning>,
}

impl From<CanvasProjectionV1> for NativeCanvasProjection {
  fn from(value: CanvasProjectionV1) -> Self {
    Self {
      version: value.version,
      doc_id: value.doc_id,
      revision: value.revision,
      title: value.title,
      surface_block_id: value.surface_block_id,
      bounds: value.bounds.map(Into::into),
      counts: value.counts.into_iter().collect(),
      blocks: value.blocks.into_iter().map(Into::into).collect(),
      elements: value.elements.into_iter().map(Into::into).collect(),
      warnings: value.warnings.into_iter().map(Into::into).collect(),
    }
  }
}

#[napi(object)]
pub struct NativeDocumentSearchUnit {
  pub unit_id: String,
  pub source: String,
  pub visibility: String,
  pub block_id: Option<String>,
  pub element_id: Option<String>,
  pub frame_id: Option<String>,
  pub blob_id: Option<String>,
  pub ref_doc_ids: Vec<String>,
  pub refs: Vec<String>,
  pub parent_flavour: Option<String>,
  pub parent_block_id: Option<String>,
  pub additional: Option<String>,
  #[napi(js_name = "type")]
  pub unit_type: String,
  pub text: String,
}

impl From<DocumentSearchUnit> for NativeDocumentSearchUnit {
  fn from(value: DocumentSearchUnit) -> Self {
    let source = match value.source {
      SearchUnitSource::PageBlock => "page-block",
      SearchUnitSource::CanvasBlock => "canvas-block",
      SearchUnitSource::SurfaceElement => "surface-element",
    };
    Self {
      unit_id: value.unit_id,
      source: source.into(),
      visibility: visibility(value.visibility),
      block_id: value.block_id,
      element_id: value.element_id,
      frame_id: value.frame_id,
      blob_id: value.blob_id,
      ref_doc_ids: value.ref_doc_ids,
      refs: value.refs,
      parent_flavour: value.parent_flavour,
      parent_block_id: value.parent_block_id,
      additional: value.additional,
      unit_type: value.unit_type,
      text: value.text,
    }
  }
}

#[napi(object)]
pub struct NativeDocumentSearchProjection {
  pub version: u8,
  pub doc_id: String,
  pub revision: String,
  pub source_hash: String,
  pub title: String,
  pub units: Vec<NativeDocumentSearchUnit>,
  pub warnings: Vec<NativeProjectionWarning>,
}

impl From<DocumentSearchProjectionV1> for NativeDocumentSearchProjection {
  fn from(value: DocumentSearchProjectionV1) -> Self {
    Self {
      version: value.version,
      doc_id: value.doc_id,
      revision: value.revision,
      source_hash: value.source_hash,
      title: value.title,
      units: value.units.into_iter().map(Into::into).collect(),
      warnings: value.warnings.into_iter().map(Into::into).collect(),
    }
  }
}

#[napi]
pub fn project_doc_canvas_from_binary(
  doc_bin: Buffer,
  doc_id: String,
  revision: String,
) -> Result<NativeCanvasProjection> {
  let projection = map_napi_err(
    doc_loader::project_canvas(doc_bin.into(), doc_id, revision),
    Status::GenericFailure,
  )?;
  Ok(projection.into())
}

#[napi]
pub fn project_doc_search_from_binary(
  doc_bin: Buffer,
  doc_id: String,
  revision: String,
) -> Result<NativeDocumentSearchProjection> {
  let projection = map_napi_err(
    doc_loader::project_document_search(doc_bin.into(), doc_id, revision),
    Status::GenericFailure,
  )?;
  Ok(projection.into())
}

#[napi]
pub fn parse_page_doc(doc_bin: Buffer, max_summary_length: Option<i32>) -> Result<Option<NativePageDocContent>> {
  let result = map_napi_err(
    doc_loader::parse_page_doc(doc_bin.into(), max_summary_length.map(|v| v as isize)),
    Status::GenericFailure,
  )?;
  Ok(result.map(Into::into))
}

#[napi]
pub fn parse_workspace_doc(doc_bin: Buffer) -> Result<Option<NativeWorkspaceDocContent>> {
  let result = map_napi_err(doc_loader::parse_workspace_doc(doc_bin.into()), Status::GenericFailure)?;
  Ok(result.map(Into::into))
}

#[napi]
pub fn parse_doc_to_markdown(
  doc_bin: Buffer,
  doc_id: String,
  ai_editable: Option<bool>,
  doc_url_prefix: Option<String>,
) -> Result<NativeMarkdownResult> {
  let result = map_napi_err(
    doc_loader::parse_doc_to_markdown(doc_bin.into(), doc_id, ai_editable.unwrap_or(false), doc_url_prefix),
    Status::GenericFailure,
  )?;
  Ok(result.into())
}

#[napi]
pub fn read_all_doc_ids_from_root_doc(doc_bin: Buffer, include_trash: Option<bool>) -> Result<Vec<String>> {
  let result = map_napi_err(
    doc_loader::get_doc_ids_from_binary(doc_bin.into(), include_trash.unwrap_or(false)),
    Status::GenericFailure,
  )?;
  Ok(result)
}

/// Converts markdown content to AFFiNE-compatible y-octo document binary.
///
/// # Arguments
/// * `title` - The document title
/// * `markdown` - The markdown content to convert
/// * `doc_id` - The document ID to use for the y-octo doc
///
/// # Returns
/// A Buffer containing the y-octo document update binary
#[napi]
pub fn create_doc_with_markdown(title: String, markdown: String, doc_id: String) -> Result<Buffer> {
  let result = map_napi_err(
    doc_loader::build_full_doc(&title, &markdown, &doc_id),
    Status::GenericFailure,
  )?;
  Ok(Buffer::from(result))
}

/// Updates an existing document with new markdown content.
/// Uses structural diffing to apply block-level replacements for changes.
///
/// # Arguments
/// * `existing_binary` - The current document binary
/// * `new_markdown` - The new markdown content to apply
/// * `doc_id` - The document ID
///
/// # Returns
/// A Buffer containing only the delta (changes) as a y-octo update binary
#[napi]
pub fn update_doc_with_markdown(existing_binary: Buffer, new_markdown: String, doc_id: String) -> Result<Buffer> {
  let result = map_napi_err(
    doc_loader::update_doc(&existing_binary, &new_markdown, &doc_id),
    Status::GenericFailure,
  )?;
  Ok(Buffer::from(result))
}

/// Updates a document's title without touching content blocks.
///
/// # Arguments
/// * `existing_binary` - The current document binary
/// * `title` - The new title
/// * `doc_id` - The document ID
///
/// # Returns
/// A Buffer containing only the delta (changes) as a y-octo update binary
#[napi]
pub fn update_doc_title(existing_binary: Buffer, title: String, doc_id: String) -> Result<Buffer> {
  let result = map_napi_err(
    doc_loader::update_doc_title(&existing_binary, &doc_id, &title),
    Status::GenericFailure,
  )?;
  Ok(Buffer::from(result))
}

/// Updates or creates the docProperties record for a document.
///
/// # Arguments
/// * `existing_binary` - The current docProperties document binary
/// * `properties_doc_id` - The docProperties document ID
///   (db$${workspaceId}$docProperties)
/// * `target_doc_id` - The document ID to update in docProperties
/// * `created_by` - Optional creator user ID
/// * `updated_by` - Optional updater user ID
///
/// # Returns
/// A Buffer containing only the delta (changes) as a y-octo update binary
#[napi]
pub fn update_doc_properties(
  existing_binary: Buffer,
  properties_doc_id: String,
  target_doc_id: String,
  created_by: Option<String>,
  updated_by: Option<String>,
) -> Result<Buffer> {
  let result = map_napi_err(
    doc_loader::update_doc_properties(
      &existing_binary,
      &properties_doc_id,
      &target_doc_id,
      created_by.as_deref(),
      updated_by.as_deref(),
    ),
    Status::GenericFailure,
  )?;
  Ok(Buffer::from(result))
}

/// Adds a document ID to the workspace root doc's meta.pages array.
/// This registers the document in the workspace so it appears in the UI.
///
/// # Arguments
/// * `root_doc_bin` - The current root doc binary (workspaceId doc)
/// * `doc_id` - The document ID to add
/// * `title` - Optional title for the document
///
/// # Returns
/// A Buffer containing the y-octo update binary to apply to the root doc
#[napi]
pub fn add_doc_to_root_doc(root_doc_bin: Buffer, doc_id: String, title: Option<String>) -> Result<Buffer> {
  let result = map_napi_err(
    doc_loader::add_doc_to_root_doc(root_doc_bin.into(), &doc_id, title.as_deref()),
    Status::GenericFailure,
  )?;
  Ok(Buffer::from(result))
}

#[napi]
pub fn build_public_root_doc(root_doc_bin: Buffer, doc_metas: Vec<PublicDocMetaInput>) -> Result<Buffer> {
  let metas = doc_metas
    .iter()
    .map(|meta| (meta.id.as_str(), meta.title.as_deref()))
    .collect::<Vec<_>>();
  let result = map_napi_err(
    doc_loader::build_public_root_doc(&root_doc_bin, &metas),
    Status::GenericFailure,
  )?;
  Ok(Buffer::from(result))
}

/// Updates a document title in the workspace root doc's meta.pages array.
///
/// # Arguments
/// * `root_doc_bin` - The current root doc binary (workspaceId doc)
/// * `doc_id` - The document ID to update
/// * `title` - The new title for the document
///
/// # Returns
/// A Buffer containing the y-octo update binary to apply to the root doc
#[napi]
pub fn update_root_doc_meta_title(root_doc_bin: Buffer, doc_id: String, title: String) -> Result<Buffer> {
  let result = map_napi_err(
    doc_loader::update_root_doc_meta_title(&root_doc_bin, &doc_id, &title),
    Status::GenericFailure,
  )?;
  Ok(Buffer::from(result))
}
