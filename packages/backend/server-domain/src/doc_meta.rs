//! Pure `y_octo 0.4` extractors and transactional persistence helpers for
//! workspace root metadata (`name`, `avatar_key`) and page metadata
//! (`title`, `summary`), aligned with `affine_doc_loader`.

use std::collections::HashSet;

use sqlx::{Postgres, Transaction};
use y_octo::{Any, Doc, ReadDoc, ReadError, ReadLimits, ReadMap, ReadValue};

use crate::acl::{ReservedDocClass, classify_reserved_doc};
use crate::doc_sharing::is_empty_doc_bin;

pub const DEFAULT_MAX_SUMMARY_LENGTH: usize = 150;

const DOC_META_READ_LIMITS: ReadLimits = ReadLimits {
  max_input_bytes: 256 * 1024 * 1024,
  max_structs: 16_000_000,
  max_clients: 200_000,
  max_collection_entries: 32_000_000,
  max_any_depth: Any::DEFAULT_MAX_DEPTH,
  max_content_bytes: 256 * 1024 * 1024,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceDocMeta {
  pub name: String,
  pub avatar_key: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PageDocMeta {
  pub title: String,
  pub summary: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ParsedDocMeta {
  None,
  Workspace(WorkspaceDocMeta),
  Page(PageDocMeta),
}

fn decode_read_doc(bin: &[u8]) -> Option<ReadDoc> {
  if is_empty_doc_bin(bin) {
    return None;
  }
  match ReadDoc::from_full_update_v1_with_limits(bin.to_vec(), DOC_META_READ_LIMITS) {
    Ok(doc) => Some(doc),
    Err(ReadError::IncompleteSnapshot(_)) => {
      let normalized = Doc::try_from_binary_v1(bin).ok()?.encode_update_v1().ok()?;
      ReadDoc::from_full_update_v1_with_limits(normalized, DOC_META_READ_LIMITS).ok()
    }
    Err(_) => None,
  }
}

pub fn parse_workspace_doc_content(bin: &[u8]) -> Option<WorkspaceDocMeta> {
  let doc = decode_read_doc(bin)?;
  let meta = doc.map("meta")?;
  if meta.is_empty() && doc.array("meta").is_some_and(|arr| !arr.is_empty()) {
    return None;
  }
  let name = read_string_value(meta, "name").unwrap_or_default();
  let avatar_key = read_string_value(meta, "avatar").unwrap_or_default();
  Some(WorkspaceDocMeta { name, avatar_key })
}

pub fn parse_page_doc_content(bin: &[u8], max_summary_length: usize) -> Option<PageDocMeta> {
  let doc = decode_read_doc(bin)?;
  let blocks = doc.map("blocks")?;
  let mut root_id = None;
  for (key, value) in blocks.iter() {
    let Some(block) = value.as_map() else {
      continue;
    };
    if read_string_value(block, "sys:flavour").as_deref() == Some("affine:page") {
      root_id = Some(read_string_value(block, "sys:id").unwrap_or_else(|| key.to_owned()));
      break;
    }
  }
  let root_id = root_id?;
  let root_block = blocks.get(&root_id).and_then(|v| v.as_map())?;
  let title = read_string_value(root_block, "prop:title").unwrap_or_default();

  let mut summary = String::new();
  let mut remaining = max_summary_length as isize;
  let mut stack = vec![root_id.clone()];
  let mut visited = HashSet::from([root_id]);

  while let Some(block_id) = stack.pop() {
    if remaining <= 0 {
      break;
    }
    let Some(block) = blocks.get(&block_id).and_then(|v| v.as_map()) else {
      continue;
    };
    let flavour = read_string_value(block, "sys:flavour");
    match flavour.as_deref() {
      Some("affine:page" | "affine:note") => {
        push_read_children(block, &mut stack, &mut visited);
      }
      Some("affine:paragraph" | "affine:list" | "affine:code") => {
        if remaining > 0 {
          append_read_text(block, &mut summary, &mut remaining);
        }
        push_read_children(block, &mut stack, &mut visited);
      }
      _ => {}
    }
  }

  Some(PageDocMeta { title, summary })
}

pub fn parse_doc_metadata(workspace_id: &str, doc_id: &str, bin: &[u8]) -> ParsedDocMeta {
  match classify_reserved_doc(workspace_id, doc_id) {
    ReservedDocClass::WorkspaceRoot => parse_workspace_doc_content(bin)
      .map(ParsedDocMeta::Workspace)
      .unwrap_or(ParsedDocMeta::None),
    ReservedDocClass::Ordinary => parse_page_doc_content(bin, DEFAULT_MAX_SUMMARY_LENGTH)
      .map(ParsedDocMeta::Page)
      .unwrap_or(ParsedDocMeta::None),
    ReservedDocClass::WorkspaceSystem | ReservedDocClass::UserPrivate { .. } | ReservedDocClass::Invalid => {
      ParsedDocMeta::None
    }
  }
}

pub async fn upsert_workspace_metadata_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  meta: &WorkspaceDocMeta,
) -> Result<(), sqlx::Error> {
  sqlx::query("UPDATE workspaces SET name = $2, avatar_key = $3 WHERE id = $1")
    .bind(workspace_id)
    .bind(&meta.name)
    .bind(&meta.avatar_key)
    .execute(&mut **tx)
    .await?;
  Ok(())
}

pub async fn upsert_page_metadata_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  page_id: &str,
  meta: &PageDocMeta,
) -> Result<(), sqlx::Error> {
  sqlx::query(
    r#"INSERT INTO workspace_pages (workspace_id, page_id, title, summary)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM workspace_pages
           WHERE workspace_id = $1 AND page_id = $2 AND lifecycle_state::text = 'deleted'
         )
       ON CONFLICT (workspace_id, page_id) DO UPDATE
         SET title = EXCLUDED.title,
             summary = EXCLUDED.summary
       WHERE workspace_pages.lifecycle_state IS DISTINCT FROM 'deleted'"#,
  )
  .bind(workspace_id)
  .bind(page_id)
  .bind(&meta.title)
  .bind(&meta.summary)
  .execute(&mut **tx)
  .await?;
  Ok(())
}

pub async fn apply_parsed_doc_metadata_in(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  parsed: &ParsedDocMeta,
) -> Result<(), sqlx::Error> {
  match parsed {
    ParsedDocMeta::Workspace(meta) => upsert_workspace_metadata_in(tx, workspace_id, meta).await,
    ParsedDocMeta::Page(meta) => upsert_page_metadata_in(tx, workspace_id, doc_id, meta).await,
    ParsedDocMeta::None => Ok(()),
  }
}

fn push_read_children(block: ReadMap<'_>, stack: &mut Vec<String>, visited: &mut HashSet<String>) {
  if let Some(children) = block.get("sys:children").and_then(|v| v.as_array()) {
    let mut pending = Vec::new();
    for child in children.iter() {
      if let Some(child_id) = child.as_any().and_then(|a| a.as_str())
        && visited.insert(child_id.to_owned())
      {
        pending.push(child_id.to_owned());
      }
    }
    for child_id in pending.into_iter().rev() {
      stack.push(child_id);
    }
  }
}

fn append_read_text(block: ReadMap<'_>, summary: &mut String, remaining: &mut isize) {
  match block.get("prop:text") {
    Some(ReadValue::Text(text)) => {
      let content = text.to_string();
      let len = content.encode_utf16().count();
      summary.push_str(&content);
      *remaining -= len as isize;
    }
    Some(ReadValue::Any(value)) => {
      if let Some(content) = value.as_str() {
        let len = content.chars().count();
        summary.push_str(content);
        *remaining -= len as isize;
      }
    }
    _ => {}
  }
}

fn read_string_value(map: ReadMap<'_>, key: &str) -> Option<String> {
  match map.get(key)? {
    ReadValue::Any(value) => value.as_str().map(str::to_owned),
    ReadValue::Text(value) => Some(value.to_string()),
    _ => None,
  }
}
