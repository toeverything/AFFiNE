use napi::{Result, Status, bindgen_prelude::Buffer};
use napi_derive::napi;

use super::{PublicDocMetaInput, doc_loader, map_napi_err};

#[napi(object)]
pub struct DocWriteContext {
  pub actor_user_id: String,
  pub timestamp_ms: i64,
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
pub fn create_doc_with_markdown(
  title: String,
  markdown: String,
  doc_id: String,
  context: Option<DocWriteContext>,
) -> Result<Buffer> {
  let result = match context.as_ref() {
    Some(context) => doc_loader::build_full_doc_with_context(
      &title,
      &markdown,
      &doc_id,
      &doc_loader::BlockWriteContext {
        actor_user_id: &context.actor_user_id,
        timestamp_ms: context.timestamp_ms,
      },
    ),
    None => doc_loader::build_full_doc(&title, &markdown, &doc_id),
  };
  let result = map_napi_err(result, Status::GenericFailure)?;
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
pub fn update_doc_with_markdown(
  existing_binary: Buffer,
  new_markdown: String,
  doc_id: String,
  context: Option<DocWriteContext>,
) -> Result<Buffer> {
  let result = match context.as_ref() {
    Some(context) => doc_loader::update_doc_with_context(
      &existing_binary,
      &new_markdown,
      &doc_id,
      &doc_loader::BlockWriteContext {
        actor_user_id: &context.actor_user_id,
        timestamp_ms: context.timestamp_ms,
      },
    ),
    None => doc_loader::update_doc(&existing_binary, &new_markdown, &doc_id),
  };
  let result = map_napi_err(result, Status::GenericFailure)?;
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
