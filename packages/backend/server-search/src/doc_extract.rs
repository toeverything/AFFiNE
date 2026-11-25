use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};

use serde::Serialize;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use y_octo::{Any, Doc, ReadDoc, ReadMap, ReadValue, Value};

use crate::error::{SearchError, SearchResult};

const MAX_SOURCE_BINARY_BYTES: usize = 32 * 1024 * 1024;
const MAX_SOURCE_BLOCKS: usize = 100_000;
const MAX_CHILDREN_PER_BLOCK: u64 = 10_000;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UnitVisibility {
  Visible,
  Hidden,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SearchUnit {
  pub unit_id: String,
  pub unit_type: String,
  pub block_id: Option<String>,
  pub element_id: Option<String>,
  pub frame_id: Option<String>,
  pub parent_block_id: Option<String>,
  pub parent_flavour: Option<String>,
  pub text: String,
  pub blob_id: Option<String>,
  pub ref_doc_ids: Vec<String>,
  pub refs: Vec<String>,
  pub additional: Option<String>,
  pub visibility: UnitVisibility,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DocumentProjection {
  pub version: i32,
  pub doc_id: String,
  pub source_hash: String,
  pub title: String,
  pub units: Vec<SearchUnit>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LegacyRootDocument {
  pub id: String,
  pub trash: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LegacyWorkspace {
  pub documents: Vec<LegacyRootDocument>,
  pub aliases: BTreeMap<String, String>,
  pub revision: String,
}

impl LegacyWorkspace {
  pub fn active_doc_ids(&self) -> BTreeSet<String> {
    self
      .documents
      .iter()
      .filter(|doc| !doc.trash)
      .map(|doc| self.aliases.get(&doc.id).unwrap_or(&doc.id).clone())
      .collect()
  }
}

/// Clean-room Yjs document projection extractor built directly on `y-octo 0.4`.
pub fn project_document_search(blob: Vec<u8>, doc_id: String) -> SearchResult<DocumentProjection> {
  if blob.len() > MAX_SOURCE_BINARY_BYTES {
    return Err(SearchError::SourceInvalid(
      "document binary exceeds size limit".to_owned(),
    ));
  }
  let source_hash = hex_sha256(&blob);
  let doc = ReadDoc::from_full_update_v1(blob)
    .map_err(|error| SearchError::SourceInvalid(format!("document decode failed: {error}")))?;

  let mut title = String::new();
  let mut units = Vec::new();

  let Some(blocks) = doc.map("blocks") else {
    return Ok(DocumentProjection {
      version: 1,
      doc_id,
      source_hash,
      title,
      units,
    });
  };
  if blocks.len() > MAX_SOURCE_BLOCKS {
    return Err(SearchError::SourceInvalid(
      "document block count exceeds limit".to_owned(),
    ));
  }

  let mut root_ids = Vec::new();
  for value in blocks.values() {
    let Some(block) = value.as_map() else {
      continue;
    };
    if read_string(block, "sys:flavour").as_deref() == Some("affine:page")
      && let Some(id) = read_string(block, "sys:id")
    {
      root_ids.push(id);
    }
  }
  root_ids.sort();

  let mut queue: VecDeque<(String, Option<String>, Option<String>)> = VecDeque::new();
  let mut visited: HashSet<String> = HashSet::new();
  for root_id in root_ids {
    if visited.insert(root_id.clone()) {
      queue.push_back((root_id, None, None));
    }
  }

  while let Some((block_id, parent_block_id, parent_flavour)) = queue.pop_front() {
    let Some(block) = blocks.get(&block_id).and_then(|value| value.as_map()) else {
      continue;
    };
    let flavour = read_string(block, "sys:flavour").unwrap_or_default();
    let unit_type = flavour.strip_prefix("affine:").unwrap_or(&flavour).to_owned();

    if flavour == "affine:page" {
      let page_title = read_text_field(block, "prop:title").unwrap_or_default();
      if title.is_empty() && !page_title.is_empty() {
        title = page_title.clone();
      }
      if !page_title.is_empty() {
        units.push(SearchUnit {
          unit_id: format!("block:{block_id}"),
          unit_type: "page".to_owned(),
          block_id: Some(block_id.clone()),
          element_id: None,
          frame_id: None,
          parent_block_id: parent_block_id.clone(),
          parent_flavour: parent_flavour.clone(),
          text: page_title,
          blob_id: None,
          ref_doc_ids: Vec::new(),
          refs: Vec::new(),
          additional: None,
          visibility: UnitVisibility::Visible,
        });
      }
    } else if flavour == "affine:surface" {
      extract_surface_elements(block, &block_id, &mut units);
    } else {
      let (text, ref_doc_ids, refs) = extract_block_text_and_refs(block, &flavour);
      let blob_id = if matches!(flavour.as_str(), "affine:image" | "affine:attachment") {
        read_string(block, "prop:sourceId").filter(|s| !s.is_empty())
      } else {
        None
      };
      let additional = extract_block_additional(block, &flavour);
      let frame_id = if flavour == "affine:frame" {
        Some(block_id.clone())
      } else {
        None
      };
      if !text.is_empty() || blob_id.is_some() || !ref_doc_ids.is_empty() {
        units.push(SearchUnit {
          unit_id: format!("block:{block_id}"),
          unit_type: if unit_type.is_empty() {
            "unknown".to_owned()
          } else {
            unit_type
          },
          block_id: Some(block_id.clone()),
          element_id: None,
          frame_id,
          parent_block_id: parent_block_id.clone(),
          parent_flavour: parent_flavour.clone(),
          text,
          blob_id,
          ref_doc_ids,
          refs,
          additional,
          visibility: UnitVisibility::Visible,
        });
      }
    }

    if let Some(children) = block.get("sys:children").and_then(|v| v.as_array()) {
      if children.len() > MAX_CHILDREN_PER_BLOCK {
        return Err(SearchError::SourceInvalid(
          "block child fanout exceeds limit".to_owned(),
        ));
      }
      for child in children.iter() {
        if let Some(child_id) = child.as_any().and_then(|v| v.as_str())
          && visited.insert(child_id.to_owned())
        {
          queue.push_back((child_id.to_owned(), Some(block_id.clone()), Some(flavour.clone())));
        }
      }
    }
  }

  Ok(DocumentProjection {
    version: 1,
    doc_id,
    source_hash,
    title,
    units,
  })
}

fn extract_surface_elements(block: ReadMap<'_>, block_id: &str, units: &mut Vec<SearchUnit>) {
  let Some(elements) = block.get("prop:elements").and_then(|v| v.as_map()) else {
    return;
  };
  let mut keys: Vec<String> = elements.keys().map(str::to_owned).collect();
  keys.sort();
  for key in keys {
    let Some(elem) = elements.get(&key).and_then(|v| v.as_map()) else {
      continue;
    };
    let elem_id = read_string(elem, "id").unwrap_or_else(|| key.clone());
    let elem_type = read_string(elem, "type").unwrap_or_else(|| "surface-element".to_owned());
    let mut parts = Vec::new();
    for field in ["title", "text", "label"] {
      if let Some(t) = read_text_field(elem, field)
        && !t.trim().is_empty()
      {
        parts.push(t);
      }
    }
    if !parts.is_empty() {
      units.push(SearchUnit {
        unit_id: format!("element:{elem_id}"),
        unit_type: elem_type,
        block_id: Some(block_id.to_owned()),
        element_id: Some(elem_id),
        frame_id: None,
        parent_block_id: Some(block_id.to_owned()),
        parent_flavour: Some("affine:surface".to_owned()),
        text: parts.join(" "),
        blob_id: None,
        ref_doc_ids: Vec::new(),
        refs: Vec::new(),
        additional: None,
        visibility: UnitVisibility::Visible,
      });
    }
  }
}

fn extract_block_text_and_refs(block: ReadMap<'_>, flavour: &str) -> (String, Vec<String>, Vec<String>) {
  let mut text_parts = Vec::new();
  let mut ref_doc_ids = BTreeSet::new();
  let mut refs = Vec::new();

  for field in [
    "prop:title",
    "prop:text",
    "prop:caption",
    "prop:name",
    "prop:description",
    "prop:url",
  ] {
    if let Some(val) = block.get(field) {
      match val {
        ReadValue::Text(text) => {
          let s = text.to_string();
          if !s.is_empty() {
            text_parts.push(s);
          }
        }
        ReadValue::Any(any) => {
          if let Some(s) = any.as_str()
            && !s.is_empty()
          {
            text_parts.push(s.to_owned());
          }
        }
        _ => {}
      }
    }
  }

  if let Some(page_id) = read_string(block, "prop:pageId").filter(|s| !s.is_empty()) {
    ref_doc_ids.insert(page_id.clone());
    refs.push(json!({"docId": page_id}).to_string());
  }

  if flavour == "affine:code"
    && let Some(lang) = read_string(block, "prop:language")
    && !lang.is_empty()
    && text_parts.is_empty()
  {
    text_parts.push(lang);
  }

  (text_parts.join("\n"), ref_doc_ids.into_iter().collect(), refs)
}

fn extract_block_additional(block: ReadMap<'_>, flavour: &str) -> Option<String> {
  let mut obj = serde_json::Map::new();
  if let Some(url) = read_string(block, "prop:url") {
    obj.insert("url".to_owned(), JsonValue::String(url));
  }
  if flavour == "affine:code"
    && let Some(lang) = read_string(block, "prop:language")
  {
    obj.insert("language".to_owned(), JsonValue::String(lang));
  }
  if obj.is_empty() {
    None
  } else {
    serde_json::to_string(&obj).ok()
  }
}

fn read_text_field(map: ReadMap<'_>, key: &str) -> Option<String> {
  match map.get(key)? {
    ReadValue::Text(t) => Some(t.to_string()),
    ReadValue::Any(a) => a.as_str().map(str::to_owned),
    _ => None,
  }
}

fn read_string(map: ReadMap<'_>, key: &str) -> Option<String> {
  match map.get(key)? {
    ReadValue::Any(a) => a.as_str().map(str::to_owned),
    ReadValue::Text(t) => Some(t.to_string()),
    _ => None,
  }
}

fn hex_sha256(bytes: &[u8]) -> String {
  let digest = Sha256::digest(bytes);
  digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Extracts legacy workspace root document inventory and subdoc guid aliases
/// from a workspace root Yjs snapshot/update using `y-octo`.
pub fn extract_legacy_workspace(
  workspace_id: &str,
  blob: Option<Vec<u8>>,
  revision: String,
) -> SearchResult<LegacyWorkspace> {
  let Some(blob) = blob else {
    return Ok(LegacyWorkspace {
      documents: Vec::new(),
      aliases: BTreeMap::new(),
      revision,
    });
  };
  let mut doc = Doc::new();
  doc
    .apply_update_from_binary_v1(&blob)
    .map_err(|error| SearchError::SourceInvalid(format!("legacy workspace root decode failed: {error}")))?;

  let mut documents = Vec::new();
  if doc.keys().iter().any(|k| k == "meta")
    && let Ok(meta) = doc.get_map("meta")
    && let Some(Value::Array(pages)) = meta.get("pages")
  {
    for idx in 0..pages.len() {
      if let Some(Value::Map(page)) = pages.get(idx) {
        let id = match page.get("id") {
          Some(Value::Any(Any::String(s))) => s,
          _ => continue,
        };
        let trash = matches!(page.get("trash"), Some(Value::Any(Any::True)));
        documents.push(LegacyRootDocument { id, trash });
      }
    }
  }

  let mut aliases = BTreeMap::new();
  if doc.keys().iter().any(|k| k == "spaces")
    && let Ok(spaces) = doc.get_map("spaces")
  {
    for document in &documents {
      if let Some(Value::Doc(subdoc)) = spaces.get(&document.id) {
        let guid = subdoc.guid();
        if crate::is_ordinary_workspace_doc(workspace_id, guid) {
          aliases.insert(document.id.clone(), guid.to_owned());
        }
      }
    }
  }

  Ok(LegacyWorkspace {
    documents,
    aliases,
    revision,
  })
}

/// Builds a minimal BlockSuite Yjs page binary with title and paragraph body (for tests).
pub fn build_test_doc(title: &str, body: &str, page_id: &str) -> Vec<u8> {
  let doc = Doc::new();
  let mut blocks = doc.get_or_create_map("blocks").expect("blocks map");

  let mut page = doc.create_map().expect("page map");
  page
    .insert("sys:id".to_owned(), Any::String(page_id.to_owned()))
    .unwrap();
  page
    .insert("sys:flavour".to_owned(), Any::String("affine:page".to_owned()))
    .unwrap();
  let mut title_text = doc.create_text().expect("title text");
  title_text.insert(0, title).unwrap();
  page.insert("prop:title".to_owned(), title_text).unwrap();

  let note_id = format!("note-{page_id}");
  let para_id = format!("para-{page_id}");

  let mut page_children = doc.create_array().expect("page children");
  page_children.insert(0, Any::String(note_id.clone())).unwrap();
  page.insert("sys:children".to_owned(), page_children).unwrap();
  blocks.insert(page_id.to_owned(), page).unwrap();

  let mut note = doc.create_map().expect("note map");
  note.insert("sys:id".to_owned(), Any::String(note_id.clone())).unwrap();
  note
    .insert("sys:flavour".to_owned(), Any::String("affine:note".to_owned()))
    .unwrap();
  let mut note_children = doc.create_array().expect("note children");
  note_children.insert(0, Any::String(para_id.clone())).unwrap();
  note.insert("sys:children".to_owned(), note_children).unwrap();
  blocks.insert(note_id, note).unwrap();

  let mut para = doc.create_map().expect("para map");
  para.insert("sys:id".to_owned(), Any::String(para_id.clone())).unwrap();
  para
    .insert("sys:flavour".to_owned(), Any::String("affine:paragraph".to_owned()))
    .unwrap();
  let mut para_text = doc.create_text().expect("para text");
  para_text.insert(0, body).unwrap();
  para.insert("prop:text".to_owned(), para_text).unwrap();
  blocks.insert(para_id, para).unwrap();

  doc.encode_update_v1().expect("encode yjs update")
}

#[cfg(test)]
mod tests {
  use super::*;

  fn push_varuint(buf: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
      buf.push(((v as u8) & 0x7f) | 0x80);
      v >>= 7;
    }
    buf.push(v as u8);
  }

  fn push_varstring(buf: &mut Vec<u8>, s: &str) {
    push_varuint(buf, s.len() as u64);
    buf.extend_from_slice(s.as_bytes());
  }

  fn synthetic_deleted_zero_len_string_update(client: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 4);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    buf.push(0x07);
    buf.push(0x01);
    push_varstring(&mut buf, "legacy_zero_str");
    push_varuint(&mut buf, 2);
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "a");
    buf.push(0x84);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varstring(&mut buf, "");
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "b");
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 2);
    buf
  }

  fn synthetic_zero_len_deleted_update(client: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 3);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    buf.push(0x07);
    buf.push(0x01);
    push_varstring(&mut buf, "legacy_zero_del");
    push_varuint(&mut buf, 2);
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "x");
    buf.push(0x81);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 0);
    push_varuint(&mut buf, 0);
    buf
  }

  #[test]
  fn project_document_search_recovers_after_zero_len_deleted_frames_and_incremental_edit() {
    let base_snap = build_test_doc("Zero-Len Recovery", "Initial body", "page-z");
    let doc = Doc::try_from_binary_v1(&base_snap).unwrap();
    let sv = doc.get_state_vector();
    if let Some(Value::Map(para)) = doc.get_map("blocks").unwrap().get("para-page-z")
      && let Some(Value::Text(mut text)) = para.get("prop:text")
    {
      text.insert(text.len(), " + incremental edit").unwrap();
    }
    let inc_update = doc.encode_state_as_update_v1(&sv).unwrap();

    let merged = y_octo::merge_updates_v1([
      synthetic_deleted_zero_len_string_update(900_031),
      synthetic_zero_len_deleted_update(900_032),
      base_snap,
      inc_update,
    ])
    .and_then(|u| u.encode_v1())
    .expect("merge_updates_v1 must succeed");

    let proj = project_document_search(merged, "page-z".to_owned()).expect("projection must succeed");
    assert_eq!(proj.title, "Zero-Len Recovery");
    assert!(
      proj
        .units
        .iter()
        .any(|u| u.text.contains("Initial body + incremental edit")),
      "expected recovered incremental paragraph text, got {:?}",
      proj.units
    );
  }
}
