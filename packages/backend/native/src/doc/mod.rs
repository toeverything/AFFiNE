mod write;

use std::{
  collections::HashMap,
  sync::{Arc, OnceLock},
};

use affine_common::napi_utils::map_napi_err;
use affine_doc_loader::{
  self as doc_loader, Bounds, CanvasBlock, CanvasElement, CanvasProjectionV1, DocumentSearchProjectionV1,
  DocumentSearchUnit, MarkdownResult, PageDocContent, ProjectionWarning, SearchUnitSource, Visibility,
  WorkspaceDocContent,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, TryAcquireError};
pub use write::{
  DocWriteContext, add_doc_to_root_doc, build_public_root_doc, create_doc_with_markdown, migrate_root_doc_pages,
  update_doc_properties, update_doc_title, update_doc_with_markdown, update_existing_root_doc_meta_title,
  update_root_doc_meta_title,
};

pub(crate) fn try_validation_slot() -> std::result::Result<OwnedSemaphorePermit, TryAcquireError> {
  static SLOTS: OnceLock<Arc<Semaphore>> = OnceLock::new();
  SLOTS
    .get_or_init(|| {
      Arc::new(Semaphore::new(
        std::thread::available_parallelism().map_or(1, usize::from),
      ))
    })
    .clone()
    .try_acquire_owned()
}

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

#[napi(object)]
pub struct NativeWorkspaceRootProjection {
  pub complete: bool,
  pub doc_ids: Vec<String>,
}

#[napi]
pub fn project_workspace_root_from_binary(doc_bin: Buffer) -> Result<NativeWorkspaceRootProjection> {
  let projection = map_napi_err(
    doc_loader::project_workspace_root(doc_bin.into(), true),
    Status::GenericFailure,
  )?;
  Ok(NativeWorkspaceRootProjection {
    complete: projection.complete,
    doc_ids: projection.doc_ids,
  })
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

#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeLifecycleRootPage {
  pub doc_id: String,
  pub trashed: bool,
}

#[napi(object)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeDocRecoveryFacts {
  pub title: String,
  pub existing_created_by: Option<String>,
  pub existing_updated_by: Option<String>,
}

fn is_empty_doc_bin(bin: &[u8]) -> bool {
  bin.is_empty() || bin == [0, 0]
}

fn non_empty_string(value: &str) -> Option<String> {
  if value.trim().is_empty() {
    None
  } else {
    Some(value.to_string())
  }
}

fn extract_existing_properties(properties_bin: &[u8], target_doc_id: &str) -> Result<(Option<String>, Option<String>)> {
  if is_empty_doc_bin(properties_bin) {
    return Ok((None, None));
  }
  match y_octo::ReadDoc::from_full_update_v1(properties_bin.to_vec()) {
    Ok(doc) => {
      let Some(entry) = doc.map(target_doc_id) else {
        return Ok((None, None));
      };
      let created_by = entry
        .get("createdBy")
        .and_then(|v| v.as_any())
        .and_then(|a| a.as_str())
        .and_then(non_empty_string);
      let updated_by = entry
        .get("updatedBy")
        .and_then(|v| v.as_any())
        .and_then(|a| a.as_str())
        .and_then(non_empty_string);
      Ok((created_by, updated_by))
    }
    Err(y_octo::ReadError::IncompleteSnapshot(_)) => {
      let doc = map_napi_err(y_octo::Doc::try_from_binary_v1(properties_bin), Status::GenericFailure)?;
      let Ok(entry) = doc.get_map(target_doc_id) else {
        return Ok((None, None));
      };
      let created_by = match entry.get("createdBy") {
        Some(y_octo::Value::Any(y_octo::Any::String(s))) => non_empty_string(&s),
        _ => None,
      };
      let updated_by = match entry.get("updatedBy") {
        Some(y_octo::Value::Any(y_octo::Any::String(s))) => non_empty_string(&s),
        _ => None,
      };
      Ok((created_by, updated_by))
    }
    Err(err @ y_octo::ReadError::ResourceLimit(_)) => Err(napi::Error::new(
      Status::GenericFailure,
      format!("[affine-doc:resource_limit] {err}"),
    )),
    Err(err) => Err(napi::Error::new(Status::GenericFailure, err.to_string())),
  }
}

#[napi]
pub fn extract_doc_recovery_facts(
  doc_bin: Buffer,
  properties_bin: Option<Buffer>,
  target_doc_id: String,
) -> Result<NativeDocRecoveryFacts> {
  let doc_bytes = doc_bin.to_vec();
  let title = if is_empty_doc_bin(&doc_bytes) {
    String::new()
  } else {
    map_napi_err(doc_loader::parse_page_doc(doc_bytes, Some(0)), Status::GenericFailure)?
      .map(|page| page.title)
      .unwrap_or_default()
  };

  let (existing_created_by, existing_updated_by) = match properties_bin {
    Some(buf) => extract_existing_properties(&buf, &target_doc_id)?,
    None => (None, None),
  };

  Ok(NativeDocRecoveryFacts {
    title,
    existing_created_by,
    existing_updated_by,
  })
}

fn extract_aliases_from_read_doc(doc: &y_octo::ReadDoc) -> HashMap<String, String> {
  let mut aliases = HashMap::new();
  let Some(meta) = doc.map("meta") else {
    return aliases;
  };
  let Some(y_octo::ReadValue::Array(pages)) = meta.get("pages") else {
    return aliases;
  };
  let Some(spaces) = doc.map("spaces") else {
    return aliases;
  };
  for entry in pages.iter() {
    let y_octo::ReadValue::Map(page) = entry else {
      continue;
    };
    let Some(id) = page.get("id").and_then(|v| v.as_any()).and_then(|a| a.as_str()) else {
      continue;
    };
    if let Some(y_octo::ReadValue::Doc { guid, .. }) = spaces.get(id) {
      aliases.insert(id.to_string(), guid.to_string());
    }
  }
  aliases
}

fn extract_aliases_from_doc(doc: &y_octo::Doc) -> HashMap<String, String> {
  let mut aliases = HashMap::new();
  let Ok(meta) = doc.get_map("meta") else {
    return aliases;
  };
  let Some(y_octo::Value::Array(pages)) = meta.get("pages") else {
    return aliases;
  };
  let Ok(spaces) = doc.get_map("spaces") else {
    return aliases;
  };
  for entry in pages.iter() {
    let y_octo::Value::Map(page) = entry else {
      continue;
    };
    let Some(y_octo::Value::Any(y_octo::Any::String(id))) = page.get("id") else {
      continue;
    };
    if let Some(y_octo::Value::Doc(subdoc)) = spaces.get(&id) {
      aliases.insert(id, subdoc.guid().to_string());
    }
  }
  aliases
}

pub(crate) const WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS: y_octo::ReadLimits = y_octo::ReadLimits {
  max_input_bytes: 256 * 1024 * 1024,
  max_structs: 16_000_000,
  max_clients: 200_000,
  max_collection_entries: 32_000_000,
  max_any_depth: y_octo::Any::DEFAULT_MAX_DEPTH,
  max_content_bytes: 256 * 1024 * 1024,
};

fn extract_root_doc_id_aliases_with_limits(
  bytes: Vec<u8>,
  limits: y_octo::ReadLimits,
) -> Result<HashMap<String, String>> {
  if is_empty_doc_bin(&bytes) {
    return Ok(HashMap::new());
  }

  match y_octo::ReadDoc::from_full_update_v1_with_limits(bytes.clone(), limits) {
    Ok(doc) => Ok(extract_aliases_from_read_doc(&doc)),
    Err(y_octo::ReadError::IncompleteSnapshot(_)) => {
      let doc = map_napi_err(y_octo::Doc::try_from_binary_v1(&bytes), Status::GenericFailure)?;
      Ok(extract_aliases_from_doc(&doc))
    }
    Err(err @ y_octo::ReadError::ResourceLimit(_)) => Err(napi::Error::new(
      Status::GenericFailure,
      format!("[affine-doc:resource_limit] {err}"),
    )),
    Err(err) => Err(napi::Error::new(Status::GenericFailure, err.to_string())),
  }
}

#[napi]
pub fn extract_root_doc_id_aliases(root_doc_bin: Buffer) -> Result<HashMap<String, String>> {
  extract_root_doc_id_aliases_with_limits(root_doc_bin.to_vec(), y_octo::ReadLimits::default())
}

fn push_lifecycle_page(pages_out: &mut Vec<NativeLifecycleRootPage>, doc_id: &str, trashed: bool) {
  if !doc_id.trim().is_empty() {
    pages_out.push(NativeLifecycleRootPage {
      doc_id: doc_id.to_string(),
      trashed,
    });
  }
}

fn push_lifecycle_page_from_read_any(pages_out: &mut Vec<NativeLifecycleRootPage>, any: &y_octo::ReadAny<'_>) {
  if let Some(doc_id) = any.get("id").and_then(|a| a.as_str()) {
    let trashed = any.get("trash").and_then(|a| a.as_bool()) == Some(true);
    push_lifecycle_page(pages_out, doc_id, trashed);
  }
}

fn push_lifecycle_page_from_object(
  pages_out: &mut Vec<NativeLifecycleRootPage>,
  object: &y_octo::AHashMap<String, y_octo::Any>,
) {
  if let Some(y_octo::Any::String(doc_id)) = object.get("id") {
    let trashed = matches!(object.get("trash"), Some(y_octo::Any::True));
    push_lifecycle_page(pages_out, doc_id, trashed);
  }
}

fn extract_lifecycle_pages_from_read_doc(doc: &y_octo::ReadDoc) -> Vec<NativeLifecycleRootPage> {
  let mut pages_out = Vec::new();
  let Some(meta) = doc.map("meta") else {
    return pages_out;
  };
  match meta.get("pages") {
    Some(y_octo::ReadValue::Array(pages)) => {
      for entry in pages.iter() {
        match entry {
          y_octo::ReadValue::Map(page) => {
            if let Some(doc_id) = page.get("id").and_then(|v| v.as_any()).and_then(|a| a.as_str()) {
              let trashed = page.get("trash").and_then(|v| v.as_any()).and_then(|a| a.as_bool()) == Some(true);
              push_lifecycle_page(&mut pages_out, doc_id, trashed);
            }
          }
          y_octo::ReadValue::Any(any) => push_lifecycle_page_from_read_any(&mut pages_out, &any),
          _ => {}
        }
      }
    }
    Some(y_octo::ReadValue::Any(any)) => {
      if let Some(entries) = any.array() {
        for entry in entries {
          push_lifecycle_page_from_read_any(&mut pages_out, &entry);
        }
      }
    }
    _ => {}
  }
  pages_out
}

fn extract_lifecycle_pages_from_doc(doc: &y_octo::Doc) -> Vec<NativeLifecycleRootPage> {
  let mut pages_out = Vec::new();
  let Ok(meta) = doc.get_map("meta") else {
    return pages_out;
  };
  match meta.get("pages") {
    Some(y_octo::Value::Array(pages)) => {
      for entry in pages.iter() {
        match entry {
          y_octo::Value::Map(page) => {
            if let Some(y_octo::Value::Any(y_octo::Any::String(doc_id))) = page.get("id") {
              let trashed = matches!(page.get("trash"), Some(y_octo::Value::Any(y_octo::Any::True)));
              push_lifecycle_page(&mut pages_out, &doc_id, trashed);
            }
          }
          y_octo::Value::Any(y_octo::Any::Object(object)) => push_lifecycle_page_from_object(&mut pages_out, &object),
          _ => {}
        }
      }
    }
    Some(y_octo::Value::Any(y_octo::Any::Array(entries))) => {
      for entry in entries {
        if let y_octo::Any::Object(object) = entry {
          push_lifecycle_page_from_object(&mut pages_out, &object);
        }
      }
    }
    _ => {}
  }
  pages_out
}

fn extract_workspace_lifecycle_root_pages_with_limits(
  bytes: Vec<u8>,
  limits: y_octo::ReadLimits,
) -> Result<Vec<NativeLifecycleRootPage>> {
  if is_empty_doc_bin(&bytes) {
    return Ok(Vec::new());
  }

  match y_octo::ReadDoc::from_full_update_v1_with_limits(bytes.clone(), limits) {
    Ok(doc) => Ok(extract_lifecycle_pages_from_read_doc(&doc)),
    Err(y_octo::ReadError::IncompleteSnapshot(_)) => {
      let doc = map_napi_err(y_octo::Doc::try_from_binary_v1(&bytes), Status::GenericFailure)?;
      Ok(extract_lifecycle_pages_from_doc(&doc))
    }
    Err(err @ y_octo::ReadError::ResourceLimit(_)) => Err(napi::Error::new(
      Status::GenericFailure,
      format!("[affine-doc:resource_limit] {err}"),
    )),
    Err(err) => Err(napi::Error::new(Status::GenericFailure, err.to_string())),
  }
}

#[napi]
pub fn extract_workspace_lifecycle_root_pages(
  root_doc_bin: Buffer,
  max_structs: Option<u32>,
) -> Result<Vec<NativeLifecycleRootPage>> {
  let limits = match max_structs {
    Some(limit) => y_octo::ReadLimits {
      max_structs: limit as usize,
      ..WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS
    },
    None => WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS,
  };
  extract_workspace_lifecycle_root_pages_with_limits(root_doc_bin.to_vec(), limits)
}

#[cfg(test)]
mod tests {
  use y_octo::{AHashMap, Any, Doc, DocOptions, HashMapExt, Value};

  use super::*;

  #[test]
  fn extract_root_doc_id_aliases_handles_empty_and_subdoc_guids() {
    assert!(extract_root_doc_id_aliases(Buffer::from(vec![])).unwrap().is_empty());
    assert!(
      extract_root_doc_id_aliases(Buffer::from(vec![0, 0]))
        .unwrap()
        .is_empty()
    );

    let doc = Doc::default();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    let mut pages = doc.create_array().unwrap();
    let mut page1 = doc.create_map().unwrap();
    page1.insert("id".into(), Any::String("logical-1".into())).unwrap();
    pages.push(Value::Map(page1)).unwrap();
    let mut page2 = doc.create_map().unwrap();
    page2.insert("id".into(), Any::String("logical-2".into())).unwrap();
    pages.push(Value::Map(page2)).unwrap();
    meta.insert("pages".into(), Value::Array(pages)).unwrap();

    let mut spaces = doc.get_or_create_map("spaces").unwrap();
    let subdoc = DocOptions::new().with_guid("storage-guid-1".into()).build();
    spaces.insert("logical-1".into(), Value::Doc(subdoc)).unwrap();
    spaces
      .insert("logical-2".into(), Value::Any(Any::String("not-a-subdoc".into())))
      .unwrap();

    let bin = doc.encode_update_v1().unwrap();
    let aliases = extract_root_doc_id_aliases(Buffer::from(bin)).unwrap();
    assert_eq!(aliases.len(), 1);
    assert_eq!(aliases.get("logical-1").map(String::as_str), Some("storage-guid-1"));
  }

  #[test]
  fn extract_workspace_lifecycle_root_pages_preserves_strict_trash_and_legacy_shapes() {
    assert!(
      extract_workspace_lifecycle_root_pages(Buffer::from(vec![]), None)
        .unwrap()
        .is_empty()
    );
    assert!(extract_workspace_lifecycle_root_pages(Buffer::from(vec![255]), None).is_err());

    // Mixed Y.Array with Map + Any::Object, strict boolean trash check, and
    // whitespace id skip
    let doc = Doc::default();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    let mut pages = doc.create_array().unwrap();

    let mut p1 = doc.create_map().unwrap();
    p1.insert("id".into(), Any::String("doc-trashed".into())).unwrap();
    p1.insert("trash".into(), Any::True).unwrap();
    pages.push(Value::Map(p1)).unwrap();

    let mut p2 = doc.create_map().unwrap();
    p2.insert("id".into(), Any::String("doc-string-trash".into())).unwrap();
    p2.insert("trash".into(), Any::String("true".into())).unwrap();
    pages.push(Value::Map(p2)).unwrap();

    let mut p3 = doc.create_map().unwrap();
    p3.insert("id".into(), Any::String("   ".into())).unwrap();
    pages.push(Value::Map(p3)).unwrap();

    let mut legacy_obj = AHashMap::new();
    legacy_obj.insert("id".into(), Any::String("doc-legacy-obj".into()));
    legacy_obj.insert("trash".into(), Any::True);
    pages.push(Value::Any(Any::Object(Box::new(legacy_obj)))).unwrap();

    meta.insert("pages".into(), Value::Array(pages)).unwrap();
    let bin = doc.encode_update_v1().unwrap();

    let result = extract_workspace_lifecycle_root_pages(Buffer::from(bin), None).unwrap();
    assert_eq!(
      result,
      vec![
        NativeLifecycleRootPage {
          doc_id: "doc-trashed".into(),
          trashed: true
        },
        NativeLifecycleRootPage {
          doc_id: "doc-string-trash".into(),
          trashed: false
        },
        NativeLifecycleRootPage {
          doc_id: "doc-legacy-obj".into(),
          trashed: true
        },
      ]
    );

    // Outer Any::Array shape (matching Yjs `meta.set('pages', [obj1, obj2])`)
    let doc2 = Doc::default();
    let mut meta2 = doc2.get_or_create_map("meta").unwrap();
    let mut obj1 = AHashMap::new();
    obj1.insert("id".into(), Any::String("doc-arr-1".into()));
    obj1.insert("trash".into(), Any::Integer(1));
    let mut obj2 = AHashMap::new();
    obj2.insert("id".into(), Any::String("doc-arr-2".into()));
    obj2.insert("trash".into(), Any::True);
    meta2
      .insert(
        "pages".into(),
        Any::Array(vec![Any::Object(Box::new(obj1)), Any::Object(Box::new(obj2))]),
      )
      .unwrap();
    let bin2 = doc2.encode_update_v1().unwrap();
    let result2 = extract_workspace_lifecycle_root_pages(Buffer::from(bin2), None).unwrap();
    assert_eq!(
      result2,
      vec![
        NativeLifecycleRootPage {
          doc_id: "doc-arr-1".into(),
          trashed: false,
        },
        NativeLifecycleRootPage {
          doc_id: "doc-arr-2".into(),
          trashed: true,
        },
      ]
    );
  }

  #[test]
  fn root_extractors_enforce_resource_limits_and_fallback_on_incomplete_snapshot() {
    let doc = Doc::default();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    let mut pages = doc.create_array().unwrap();
    let mut page1 = doc.create_map().unwrap();
    page1.insert("id".into(), Any::String("logical-limit".into())).unwrap();
    page1.insert("trash".into(), Any::True).unwrap();
    pages.push(Value::Map(page1)).unwrap();
    meta.insert("pages".into(), Value::Array(pages)).unwrap();
    let mut spaces = doc.get_or_create_map("spaces").unwrap();
    let subdoc = DocOptions::new().with_guid("storage-limit".into()).build();
    spaces.insert("logical-limit".into(), Value::Doc(subdoc)).unwrap();
    let bin = doc.encode_update_v1().unwrap();

    let tiny_limits = y_octo::ReadLimits {
      max_structs: 1,
      ..y_octo::ReadLimits::default()
    };
    assert!(matches!(
      y_octo::ReadDoc::from_full_update_v1_with_limits(bin.clone(), tiny_limits.clone()),
      Err(y_octo::ReadError::ResourceLimit(_))
    ));

    // Online alias extraction must enforce resource limits with explicit prefix
    // without falling back to unbounded Doc.
    let alias_err = extract_root_doc_id_aliases_with_limits(bin.clone(), tiny_limits.clone()).unwrap_err();
    assert!(alias_err.reason.contains("[affine-doc:resource_limit]"));

    // Lifecycle extraction must also enforce its explicit limit boundary...
    let lifecycle_err = extract_workspace_lifecycle_root_pages(Buffer::from(bin.clone()), Some(1)).unwrap_err();
    assert!(lifecycle_err.reason.contains("[affine-doc:resource_limit]"));
    // ...while succeeding within WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS.
    let lifecycle_pages = extract_workspace_lifecycle_root_pages(Buffer::from(bin), None).unwrap();
    assert_eq!(
      lifecycle_pages,
      vec![NativeLifecycleRootPage {
        doc_id: "logical-limit".into(),
        trashed: true,
      }]
    );

    // IncompleteSnapshot (multi-client update where one client has a Skip)
    // still falls back to Doc and reads the complete client's entries.
    let doc_c1 = DocOptions::new().with_client_id(1).build();
    let mut delta_meta = doc_c1.get_or_create_map("meta").unwrap();
    let mut delta_pages = doc_c1.create_array().unwrap();
    let mut delta_page = doc_c1.create_map().unwrap();
    delta_page
      .insert("id".into(), Any::String("delta-doc-1".into()))
      .unwrap();
    delta_page.insert("trash".into(), Any::True).unwrap();
    delta_pages.push(Value::Map(delta_page)).unwrap();
    delta_meta.insert("pages".into(), Value::Array(delta_pages)).unwrap();
    let mut delta_spaces = doc_c1.get_or_create_map("spaces").unwrap();
    let delta_subdoc = DocOptions::new().with_guid("delta-guid-1".into()).build();
    delta_spaces
      .insert("delta-doc-1".into(), Value::Doc(delta_subdoc))
      .unwrap();

    let mut doc_c2 = DocOptions::new().with_client_id(2).build();
    let mut c2_other = doc_c2.get_or_create_map("other").unwrap();
    c2_other.insert("a".into(), Any::String("first".into())).unwrap();
    let sv_c2 = doc_c2.get_state_vector();
    c2_other.insert("b".into(), Any::String("second".into())).unwrap();
    doc_c2
      .apply_update_from_binary_v1(doc_c1.encode_update_v1().unwrap())
      .unwrap();

    let delta_bin = doc_c2.encode_state_as_update_v1(&sv_c2).unwrap();
    assert!(matches!(
      y_octo::ReadDoc::from_full_update_v1_with_limits(delta_bin.clone(), y_octo::ReadLimits::default()),
      Err(y_octo::ReadError::IncompleteSnapshot(_))
    ));

    let delta_aliases = extract_root_doc_id_aliases(Buffer::from(delta_bin.clone())).unwrap();
    assert_eq!(
      delta_aliases.get("delta-doc-1").map(String::as_str),
      Some("delta-guid-1")
    );
    let delta_lifecycle = extract_workspace_lifecycle_root_pages(Buffer::from(delta_bin), None).unwrap();
    assert_eq!(
      delta_lifecycle,
      vec![NativeLifecycleRootPage {
        doc_id: "delta-doc-1".into(),
        trashed: true,
      }]
    );
  }

  #[test]
  fn extract_doc_recovery_facts_reads_title_earliest_creator_and_properties() {
    let doc_bin = create_doc_with_markdown(
      "Persisted Title".into(),
      "Hello body".into(),
      "doc-facts-1".into(),
      Some(DocWriteContext {
        actor_user_id: "author-1".into(),
        timestamp_ms: 1000,
      }),
    )
    .unwrap();

    let props_bin = update_doc_properties(
      Buffer::from(vec![]),
      "db$ws$docProperties".into(),
      "doc-facts-1".into(),
      Some("author-1".into()),
      Some("editor-2".into()),
    )
    .unwrap();

    let facts =
      extract_doc_recovery_facts(Buffer::from(doc_bin.to_vec()), Some(props_bin), "doc-facts-1".into()).unwrap();
    assert_eq!(facts.title, "Persisted Title");
    assert_eq!(facts.existing_created_by.as_deref(), Some("author-1"));
    assert_eq!(facts.existing_updated_by.as_deref(), Some("editor-2"));

    let without_props = extract_doc_recovery_facts(doc_bin, None, "doc-facts-1".into()).unwrap();
    assert_eq!(without_props.title, "Persisted Title");
    assert_eq!(without_props.existing_created_by, None);
    assert_eq!(without_props.existing_updated_by, None);
  }
}
