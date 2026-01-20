use affine_common::doc_parser::{self, BlockInfo, CrawlResult, MarkdownResult, PageDocContent, WorkspaceDocContent};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct NativeMarkdownResult {
  pub title: String,
  pub markdown: String,
}

impl From<MarkdownResult> for NativeMarkdownResult {
  fn from(result: MarkdownResult) -> Self {
    Self {
      title: result.title,
      markdown: result.markdown,
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
pub struct NativeBlockInfo {
  pub block_id: String,
  pub flavour: String,
  pub content: Option<Vec<String>>,
  pub blob: Option<Vec<String>>,
  pub ref_doc_id: Option<Vec<String>>,
  pub ref_info: Option<Vec<String>>,
  pub parent_flavour: Option<String>,
  pub parent_block_id: Option<String>,
  pub additional: Option<String>,
}

impl From<BlockInfo> for NativeBlockInfo {
  fn from(info: BlockInfo) -> Self {
    Self {
      block_id: info.block_id,
      flavour: info.flavour,
      content: info.content,
      blob: info.blob,
      ref_doc_id: info.ref_doc_id,
      ref_info: info.ref_info,
      parent_flavour: info.parent_flavour,
      parent_block_id: info.parent_block_id,
      additional: info.additional,
    }
  }
}

#[napi(object)]
pub struct NativeCrawlResult {
  pub blocks: Vec<NativeBlockInfo>,
  pub title: String,
  pub summary: String,
}

impl From<CrawlResult> for NativeCrawlResult {
  fn from(result: CrawlResult) -> Self {
    Self {
      blocks: result.blocks.into_iter().map(Into::into).collect(),
      title: result.title,
      summary: result.summary,
    }
  }
}

#[napi]
pub fn parse_doc_from_binary(doc_bin: Buffer, doc_id: String) -> Result<NativeCrawlResult> {
  let result = doc_parser::parse_doc_from_binary(doc_bin.into(), doc_id)
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(result.into())
}

#[napi]
pub fn parse_page_doc(doc_bin: Buffer, max_summary_length: Option<i32>) -> Result<Option<NativePageDocContent>> {
  let result = doc_parser::parse_page_doc(doc_bin.into(), max_summary_length.map(|v| v as isize))
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(result.map(Into::into))
}

#[napi]
pub fn parse_workspace_doc(doc_bin: Buffer) -> Result<Option<NativeWorkspaceDocContent>> {
  let result =
    doc_parser::parse_workspace_doc(doc_bin.into()).map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(result.map(Into::into))
}

#[napi]
pub fn parse_doc_to_markdown(
  doc_bin: Buffer,
  doc_id: String,
  ai_editable: Option<bool>,
  doc_url_prefix: Option<String>,
) -> Result<NativeMarkdownResult> {
  let result = doc_parser::parse_doc_to_markdown(doc_bin.into(), doc_id, ai_editable.unwrap_or(false), doc_url_prefix)
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(result.into())
}

#[napi]
pub fn read_all_doc_ids_from_root_doc(doc_bin: Buffer, include_trash: Option<bool>) -> Result<Vec<String>> {
  let result = doc_parser::get_doc_ids_from_binary(doc_bin.into(), include_trash.unwrap_or(false))
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
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
  let result = doc_parser::build_full_doc(&title, &markdown, &doc_id)
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
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
  let result = doc_parser::update_doc(&existing_binary, &new_markdown, &doc_id)
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
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
  let result = doc_parser::update_doc_title(&existing_binary, &doc_id, &title)
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
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
  let result = doc_parser::update_doc_properties(
    &existing_binary,
    &properties_doc_id,
    &target_doc_id,
    created_by.as_deref(),
    updated_by.as_deref(),
  )
  .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
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
  let result = doc_parser::add_doc_to_root_doc(root_doc_bin.into(), &doc_id, title.as_deref())
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
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
  let result = doc_parser::update_root_doc_meta_title(&root_doc_bin, &doc_id, &title)
    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
  Ok(Buffer::from(result))
}
