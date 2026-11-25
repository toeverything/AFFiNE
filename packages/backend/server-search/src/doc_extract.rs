mod reference;

use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};

use reference::{References, collect_cell_references, collect_text_references};
use serde::Serialize;
use serde_json::{Map as JsonMap, Value as JsonValue};
use sha2::{Digest, Sha256};
use y_octo::{Any, Doc, ReadDoc, ReadMap, ReadValue, Value};

use crate::error::{SearchError, SearchResult};

const MAX_SOURCE_BINARY_BYTES: usize = 32 * 1024 * 1024;
const MAX_SOURCE_BLOCKS: usize = 100_000;
const MAX_CHILDREN_PER_BLOCK: u64 = 10_000;
/// The most text bytes that one container takes from its children.
const MAX_DESCENDANT_TEXT_BYTES: usize = 1024 * 1024;
/// Flavours that the `v0.27.5` server indexes with no text.
const BOOKMARK_FLAVOURS: [&str; 6] = [
  "affine:bookmark",
  "affine:embed-youtube",
  "affine:embed-iframe",
  "affine:embed-figma",
  "affine:embed-github",
  "affine:embed-loom",
];

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
    if read_text_field(block, "sys:flavour").as_deref() == Some("affine:page")
      && let Some(id) = read_text_field(block, "sys:id")
    {
      root_ids.push(id);
    }
  }
  root_ids.sort();

  let mut queue: VecDeque<(String, Option<String>, Option<String>)> = VecDeque::new();
  let mut visited: HashSet<String> = HashSet::new();
  let mut claimed_children: HashSet<String> = HashSet::new();
  for root_id in root_ids {
    if visited.insert(root_id.clone()) {
      queue.push_back((root_id, None, None));
    }
  }

  while let Some((block_id, parent_block_id, parent_flavour)) = queue.pop_front() {
    let Some(block) = blocks.get(&block_id).and_then(|value| value.as_map()) else {
      continue;
    };
    let flavour = read_text_field(block, "sys:flavour").unwrap_or_default();
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
      let parent = parent_block_id
        .as_deref()
        .and_then(|id| blocks.get(id))
        .and_then(ReadValue::as_map);
      let BlockContent {
        text,
        references,
        database_name,
      } = extract_block_content(
        blocks,
        &mut claimed_children,
        block,
        &flavour,
        parent,
        parent_flavour.as_deref(),
      );
      let blob_id = if matches!(flavour.as_str(), "affine:image" | "affine:attachment") {
        read_text_field(block, "prop:sourceId").filter(|s| !s.is_empty())
      } else {
        None
      };
      let additional = extract_block_additional(block, &flavour, database_name);
      let frame_id = if flavour == "affine:frame" {
        Some(block_id.clone())
      } else {
        None
      };
      if !text.trim().is_empty()
        || blob_id.is_some()
        || !references.doc_ids.is_empty()
        || BOOKMARK_FLAVOURS.contains(&flavour.as_str())
      {
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
          ref_doc_ids: references.doc_ids,
          refs: references.refs,
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
    let elem_id = read_text_field(elem, "id").unwrap_or_else(|| key.clone());
    let elem_type = read_text_field(elem, "type").unwrap_or_else(|| "surface-element".to_owned());
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

struct BlockContent {
  text: String,
  references: References,
  database_name: Option<String>,
}

/// Extracts the indexed text and doc references of one block with the same
/// per-flavour rules as the `v0.27.5` reader.
fn extract_block_content(
  blocks: ReadMap<'_>,
  claimed_children: &mut HashSet<String>,
  block: ReadMap<'_>,
  flavour: &str,
  parent: Option<ReadMap<'_>>,
  parent_flavour: Option<&str>,
) -> BlockContent {
  let mut text_parts = Vec::new();
  let mut references = References::default();
  let mut database_name = None;

  match flavour {
    "affine:database" => {
      let title = block.get("prop:title");
      text_parts.extend(title.and_then(ReadValue::as_text).map(|title| title.to_string()));
      database_name = title.and_then(value_string);
      collect_database_column_texts(block, &mut text_parts);
      if let Some(rows) = block.get("prop:cells").and_then(ReadValue::as_map) {
        let cells = sorted_values(rows)
          .into_iter()
          .filter_map(ReadValue::as_map)
          .flat_map(sorted_values)
          .filter_map(ReadValue::as_map)
          .filter_map(|cell| cell.get("value"));
        collect_cell_references(cells, &mut references);
      }
    }
    "affine:latex" => text_parts.extend(read_text_field(block, "prop:latex")),
    "affine:table" => {
      let mut cells: Vec<(&str, ReadValue<'_>)> = block
        .iter()
        .filter(|(key, _)| key.starts_with("prop:cells.") && key.ends_with(".text"))
        .collect();
      cells.sort_by_key(|(key, _)| *key);
      text_parts.extend(cells.into_iter().filter_map(|(_, value)| value_string(value)));
    }
    "affine:paragraph" | "affine:list" | "affine:code" => {
      let text = block.get("prop:text").and_then(ReadValue::as_text);
      text_parts.extend(text.map(|text| text.to_string()));
    }
    "affine:attachment" => text_parts.extend(read_text_field(block, "prop:name")),
    "affine:image" => text_parts.extend(read_text_field(block, "prop:caption")),
    "affine:note" | "affine:frame" | "affine:edgeless-text" => {
      let text = block_text(block)
        .or_else(|| read_text_field(block, "prop:title"))
        .or_else(|| descendant_text(blocks, claimed_children, block));
      text_parts.extend(text);
    }
    "affine:embed-linked-doc" | "affine:embed-synced-doc" => {}
    flavour if BOOKMARK_FLAVOURS.contains(&flavour) => {}
    _ => text_parts.extend(block_text(block)),
  }

  match flavour {
    "affine:paragraph" | "affine:list" | "affine:code" => {
      if let Some(text) = block.get("prop:text").and_then(ReadValue::as_text) {
        collect_text_references(text, &mut references);
      }
      if flavour == "affine:paragraph" && parent_flavour == Some("affine:database") {
        database_name = parent.and_then(|parent| read_text_field(parent, "prop:title"));
      }
    }
    "affine:embed-linked-doc" | "affine:embed-synced-doc" => {
      // The reader keeps any string `pageId`, the empty one included.
      if let Some(page_id) = block
        .get("prop:pageId")
        .and_then(ReadValue::as_any)
        .and_then(|any| any.as_str())
      {
        references.push(page_id, block.get("prop:params"));
      }
    }
    _ => {}
  }

  text_parts.retain(|part| !part.is_empty());
  BlockContent {
    text: text_parts.join("\n"),
    references,
    database_name,
  }
}

/// Reads column names and select option values from `Y.Map` columns, as the
/// reader does. It skips plain-object columns.
fn collect_database_column_texts(block: ReadMap<'_>, texts: &mut Vec<String>) {
  let Some(columns) = block.get("prop:columns").and_then(ReadValue::as_array) else {
    return;
  };
  for column in columns.iter().filter_map(ReadValue::as_map) {
    texts.extend(read_plain_string(column, "name"));
    let options = column
      .get("data")
      .and_then(ReadValue::as_map)
      .and_then(|data| data.get("options"))
      .and_then(ReadValue::as_array);
    for option in options
      .iter()
      .flat_map(|options| options.iter())
      .filter_map(ReadValue::as_map)
    {
      texts.extend(read_plain_string(option, "value"));
    }
  }
}

/// Map values in key order. The decoded key order depends on the update
/// encoding, so sort to keep the extracted order stable.
fn sorted_values(map: ReadMap<'_>) -> Vec<ReadValue<'_>> {
  let mut entries: Vec<_> = map.iter().collect();
  entries.sort_by_key(|(key, _)| *key);
  entries.into_iter().map(|(_, value)| value).collect()
}

fn extract_block_additional(block: ReadMap<'_>, flavour: &str, database_name: Option<String>) -> Option<String> {
  let mut obj = JsonMap::new();
  if let Some(url) = read_text_field(block, "prop:url") {
    obj.insert("url".to_owned(), JsonValue::String(url));
  }
  if flavour == "affine:code"
    && let Some(lang) = read_text_field(block, "prop:language")
  {
    obj.insert("language".to_owned(), JsonValue::String(lang));
  }
  if let Some(database_name) = database_name {
    obj.insert("databaseName".to_owned(), JsonValue::String(database_name));
  }
  if obj.is_empty() {
    None
  } else {
    serde_json::to_string(&obj).ok()
  }
}

fn value_string(value: ReadValue<'_>) -> Option<String> {
  match value {
    ReadValue::Text(text) => Some(text.to_string()),
    ReadValue::Any(any) => any.as_str().map(str::to_owned),
    _ => None,
  }
}

/// The first non-blank of the common text properties.
fn block_text(block: ReadMap<'_>) -> Option<String> {
  ["prop:text", "prop:caption", "prop:latex", "prop:name"]
    .into_iter()
    .find_map(|key| read_text_field(block, key))
    .filter(|text| !text.trim().is_empty())
}

/// Joins the `block_text` of the direct children, as the `v0.27.5` server
/// does for a container with no text of its own.
///
/// Each child gives its text to the first container that takes at least one
/// character of it, so a child listed many times or under many containers
/// is read once for the whole doc. The joined text stops at
/// `MAX_DESCENDANT_TEXT_BYTES`.
fn descendant_text(blocks: ReadMap<'_>, claimed: &mut HashSet<String>, block: ReadMap<'_>) -> Option<String> {
  let children = block.get("sys:children").and_then(ReadValue::as_array)?;
  let mut joined = String::new();
  for child in children.iter().take(MAX_CHILDREN_PER_BLOCK as usize) {
    if joined.len() >= MAX_DESCENDANT_TEXT_BYTES {
      break;
    }
    let Some(child_id) = child.as_any().and_then(|child| child.as_str()) else {
      continue;
    };
    if claimed.contains(child_id) {
      continue;
    }
    let Some(text) = blocks.get(child_id).and_then(ReadValue::as_map).and_then(block_text) else {
      // A child with no text never gives text, so no container reads it again.
      claimed.insert(child_id.to_owned());
      continue;
    };
    let separator = usize::from(!joined.is_empty());
    if joined.len() + separator >= MAX_DESCENDANT_TEXT_BYTES {
      break;
    }
    let room = MAX_DESCENDANT_TEXT_BYTES - joined.len() - separator;
    let end = (0..=room.min(text.len()))
      .rev()
      .find(|end| text.is_char_boundary(*end))
      .unwrap_or(0);
    // A child that gives no character stays free for the next container.
    if end == 0 {
      break;
    }
    claimed.insert(child_id.to_owned());
    if separator == 1 {
      joined.push('\n');
    }
    joined.push_str(&text[..end]);
    if end < text.len() {
      break;
    }
  }
  (!joined.is_empty()).then_some(joined)
}

fn read_plain_string(map: ReadMap<'_>, key: &str) -> Option<String> {
  map.get(key)?.as_any()?.as_str().map(str::to_owned)
}

fn read_text_field(map: ReadMap<'_>, key: &str) -> Option<String> {
  map.get(key).and_then(value_string)
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

#[cfg(test)]
#[path = "../tests/support/test_doc.rs"]
mod test_doc;

#[cfg(test)]
mod tests {
  use std::time::{Duration, Instant};

  use y_octo::{TextAttributes, TextDeltaOp, TextInsert};

  use super::test_doc::{TestDoc, TestValue, build_test_doc, object};
  use super::*;

  const MARKER: &str = "$blocksuite:internal:text$";

  fn project(doc: TestDoc) -> DocumentProjection {
    project_document_search(doc.encode(), "doc-src".to_owned()).expect("project test doc")
  }

  fn unit<'a>(projection: &'a DocumentProjection, block_id: &str) -> Option<&'a SearchUnit> {
    projection
      .units
      .iter()
      .find(|unit| unit.block_id.as_deref() == Some(block_id))
  }

  fn strings(values: &[&str]) -> Any {
    Any::Array(values.iter().map(|value| Any::String((*value).to_owned())).collect())
  }

  fn target(id: &str) -> Option<Any> {
    Some(TestValue::reference(id, vec![]))
  }

  fn boxed(marker: Any, references: &[&str]) -> Any {
    let ops = references
      .iter()
      .map(|id| {
        object(vec![
          ("insert", Any::String("x".to_owned())),
          (
            "attributes",
            object(vec![("reference", TestValue::reference(id, vec![]))]),
          ),
        ])
      })
      .collect();
    object(vec![(MARKER, marker), ("delta", Any::Array(ops))])
  }

  fn cell(value: TestValue) -> TestValue {
    TestValue::map(vec![("value", value)])
  }

  struct Case {
    block_id: &'static str,
    unit_type: &'static str,
    text: &'static str,
    ref_doc_ids: &'static [&'static str],
    refs: &'static [&'static str],
    additional: Option<&'static str>,
  }

  #[test]
  fn projection_extracts_reader_text_and_references_per_flavour() {
    let mut doc = TestDoc::new("doc-src", "Source");
    doc
      .block(
        "p-inline",
        "affine:paragraph",
        None,
        vec![(
          "prop:text",
          TestValue::rich(&[
            ("See ", None),
            ("Target", target("target-a")),
            (" and ", None),
            (
              "Anchor",
              Some(TestValue::reference(
                "target-b",
                vec![
                  ("mode", Any::String("page".to_owned())),
                  ("blockIds", strings(&["blk-1"])),
                ],
              )),
            ),
            (" again", target("target-a")),
          ]),
        )],
      )
      .block(
        "p-params",
        "affine:paragraph",
        None,
        vec![(
          "prop:text",
          TestValue::rich(&[
            ("one", target("target-a")),
            (
              "two",
              Some(TestValue::reference(
                "target-a",
                vec![("mode", Any::String("edgeless".to_owned()))],
              )),
            ),
          ]),
        )],
      )
      .block(
        "l-item",
        "affine:list",
        None,
        vec![(
          "prop:text",
          TestValue::rich(&[("item ", None), ("C", target("target-c"))]),
        )],
      )
      .block(
        "c-code",
        "affine:code",
        None,
        vec![
          ("prop:text", TestValue::rich(&[("let x", target("target-c"))])),
          ("prop:language", TestValue::string("rust")),
        ],
      )
      .block(
        "c-empty",
        "affine:code",
        None,
        vec![
          ("prop:text", TestValue::text("")),
          ("prop:language", TestValue::string("rust")),
        ],
      )
      .block(
        "p-numbers",
        "affine:paragraph",
        None,
        vec![(
          "prop:text",
          TestValue::rich(&[
            (
              "a",
              Some(TestValue::reference("target-a", vec![("x", Any::Float64(1e20.into()))])),
            ),
            (
              "b",
              Some(TestValue::reference("target-a", vec![("x", Any::Float64(2e20.into()))])),
            ),
          ]),
        )],
      )
      .block(
        "callout-text",
        "affine:callout",
        None,
        vec![("prop:text", TestValue::rich(&[("tip", target("target-x"))]))],
      )
      .block(
        "e-linked",
        "affine:embed-linked-doc",
        None,
        vec![
          ("prop:pageId", TestValue::string("target-d")),
          (
            "prop:params",
            TestValue::map(vec![
              ("mode", TestValue::string("page")),
              ("blockIds", TestValue::Array(vec![TestValue::string("b1")])),
              ("elementIds", TestValue::Array(vec![])),
            ]),
          ),
          ("prop:text", TestValue::rich(&[("extra", target("target-x"))])),
        ],
      )
      .block(
        "e-synced",
        "affine:embed-synced-doc",
        None,
        vec![
          ("prop:pageId", TestValue::string("target-e")),
          (
            "prop:params",
            TestValue::Any(object(vec![("mode", Any::String("edgeless".to_owned()))])),
          ),
        ],
      )
      .block(
        "e-empty",
        "affine:embed-linked-doc",
        None,
        vec![("prop:pageId", TestValue::string(""))],
      )
      .block(
        "db",
        "affine:database",
        None,
        vec![
          ("prop:title", TestValue::text("Tasks")),
          (
            "prop:columns",
            TestValue::Array(vec![
              TestValue::map(vec![
                ("name", TestValue::string("Status")),
                (
                  "data",
                  TestValue::map(vec![(
                    "options",
                    TestValue::Array(vec![
                      TestValue::map(vec![("value", TestValue::string("Done"))]),
                      TestValue::map(vec![("value", TestValue::string("Todo"))]),
                    ]),
                  )]),
                ),
              ]),
              TestValue::Any(object(vec![("name", Any::String("Plain".to_owned()))])),
            ]),
          ),
          (
            "prop:cells",
            TestValue::map(vec![
              (
                "row-b",
                TestValue::map(vec![(
                  "col-1",
                  cell(TestValue::rich(&[
                    ("F", target("target-f")),
                    ("G", target("target-g")),
                    ("F", target("target-f")),
                  ])),
                )]),
              ),
              (
                "row-a",
                TestValue::map(vec![
                  (
                    "col-1",
                    cell(TestValue::Any(boxed(Any::True, &["target-h", "target-h"]))),
                  ),
                  ("col-2", cell(TestValue::rich(&[("F", target("target-f"))]))),
                  (
                    "col-3",
                    cell(TestValue::map(vec![
                      (MARKER, TestValue::Any(Any::False)),
                      (
                        "delta",
                        TestValue::Any(Any::Array(vec![object(vec![(
                          "attributes",
                          object(vec![("reference", TestValue::reference("target-skip", vec![]))]),
                        )])])),
                      ),
                    ])),
                  ),
                  (
                    "col-4",
                    cell(TestValue::map(vec![
                      (MARKER, TestValue::Any(Any::Integer(1))),
                      (
                        "delta",
                        TestValue::Array(vec![TestValue::map(vec![(
                          "attributes",
                          TestValue::Any(object(vec![("reference", TestValue::reference("target-i", vec![]))])),
                        )])]),
                      ),
                    ])),
                  ),
                ]),
              ),
            ]),
          ),
        ],
      )
      .block(
        "db-row",
        "affine:paragraph",
        Some("db"),
        vec![("prop:text", TestValue::text("Row one"))],
      )
      .block(
        "table",
        "affine:table",
        None,
        vec![
          ("prop:cells.c2.text", TestValue::text("Cell B")),
          ("prop:cells.c1.text", TestValue::text("Cell A")),
          ("prop:cells.c3.text", TestValue::text("")),
          ("prop:columns.c1.width", TestValue::Any(Any::Integer(100))),
        ],
      )
      .block(
        "latex",
        "affine:latex",
        None,
        vec![("prop:latex", TestValue::string("E=mc^2"))],
      )
      .block(
        "blank",
        "affine:paragraph",
        None,
        vec![("prop:text", TestValue::text("  \n "))],
      )
      .block("bookmark", "affine:bookmark", None, vec![]);
    let projection = project(doc);

    let cases = [
      Case {
        block_id: "p-inline",
        unit_type: "paragraph",
        text: "See Target and Anchor again",
        ref_doc_ids: &["target-a", "target-b"],
        refs: &[
          r#"{"docId":"target-a"}"#,
          r#"{"docId":"target-b","blockIds":["blk-1"],"mode":"page"}"#,
        ],
        additional: None,
      },
      Case {
        block_id: "p-params",
        unit_type: "paragraph",
        text: "onetwo",
        ref_doc_ids: &["target-a", "target-a"],
        refs: &[r#"{"docId":"target-a"}"#, r#"{"docId":"target-a","mode":"edgeless"}"#],
        additional: None,
      },
      Case {
        block_id: "l-item",
        unit_type: "list",
        text: "item C",
        ref_doc_ids: &["target-c"],
        refs: &[r#"{"docId":"target-c"}"#],
        additional: None,
      },
      Case {
        block_id: "c-code",
        unit_type: "code",
        text: "let x",
        ref_doc_ids: &["target-c"],
        refs: &[r#"{"docId":"target-c"}"#],
        additional: Some(r#"{"language":"rust"}"#),
      },
      Case {
        block_id: "callout-text",
        unit_type: "callout",
        text: "tip",
        ref_doc_ids: &[],
        refs: &[],
        additional: None,
      },
      Case {
        block_id: "e-linked",
        unit_type: "embed-linked-doc",
        text: "",
        ref_doc_ids: &["target-d"],
        refs: &[r#"{"docId":"target-d","blockIds":["b1"],"elementIds":[],"mode":"page"}"#],
        additional: None,
      },
      Case {
        block_id: "p-numbers",
        unit_type: "paragraph",
        text: "ab",
        ref_doc_ids: &["target-a", "target-a"],
        refs: &[
          r#"{"docId":"target-a","x":100000000000000000000}"#,
          r#"{"docId":"target-a","x":200000000000000000000}"#,
        ],
        additional: None,
      },
      Case {
        block_id: "e-synced",
        unit_type: "embed-synced-doc",
        text: "",
        ref_doc_ids: &["target-e"],
        refs: &[r#"{"docId":"target-e","mode":"edgeless"}"#],
        additional: None,
      },
      Case {
        block_id: "e-empty",
        unit_type: "embed-linked-doc",
        text: "",
        ref_doc_ids: &[""],
        refs: &[r#"{"docId":""}"#],
        additional: None,
      },
      Case {
        block_id: "db",
        unit_type: "database",
        text: "Tasks\nStatus\nDone\nTodo",
        ref_doc_ids: &["target-h", "target-f", "target-i", "target-f", "target-g"],
        refs: &[
          r#"{"docId":"target-h"}"#,
          r#"{"docId":"target-f"}"#,
          r#"{"docId":"target-i"}"#,
          r#"{"docId":"target-f"}"#,
          r#"{"docId":"target-g"}"#,
        ],
        additional: Some(r#"{"databaseName":"Tasks"}"#),
      },
      Case {
        block_id: "db-row",
        unit_type: "paragraph",
        text: "Row one",
        ref_doc_ids: &[],
        refs: &[],
        additional: Some(r#"{"databaseName":"Tasks"}"#),
      },
      Case {
        block_id: "table",
        unit_type: "table",
        text: "Cell A\nCell B",
        ref_doc_ids: &[],
        refs: &[],
        additional: None,
      },
      Case {
        block_id: "latex",
        unit_type: "latex",
        text: "E=mc^2",
        ref_doc_ids: &[],
        refs: &[],
        additional: None,
      },
      Case {
        block_id: "bookmark",
        unit_type: "bookmark",
        text: "",
        ref_doc_ids: &[],
        refs: &[],
        additional: None,
      },
    ];
    for case in cases {
      let block_id = case.block_id;
      let unit = unit(&projection, block_id).unwrap_or_else(|| panic!("{block_id} unit is missing"));
      assert_eq!(unit.unit_type, case.unit_type, "{block_id} flavour");
      assert_eq!(unit.text, case.text, "{block_id} text");
      assert_eq!(unit.ref_doc_ids, case.ref_doc_ids, "{block_id} ref doc ids");
      assert_eq!(unit.refs, case.refs, "{block_id} refs");
      assert_eq!(unit.additional.as_deref(), case.additional, "{block_id} additional");
    }
    assert!(
      unit(&projection, "blank").is_none(),
      "whitespace-only block is not indexed"
    );
    assert!(
      unit(&projection, "c-empty").is_none(),
      "empty code block is not indexed"
    );
    assert_eq!(
      unit(&projection, "db-row").and_then(|unit| unit.parent_flavour.as_deref()),
      Some("affine:database")
    );
  }

  #[test]
  fn reference_params_spread_like_json_stringify() {
    let nested = (0..20).fold(TestValue::string("leaf"), |value, _| TestValue::map(vec![("a", value)]));
    let cases: Vec<(&str, TestValue, String)> = vec![
      ("none", TestValue::Any(Any::Null), r#"{"docId":"t"}"#.to_owned()),
      (
        "number",
        TestValue::Any(Any::Integer(42)),
        r#"{"docId":"t"}"#.to_owned(),
      ),
      ("bool", TestValue::Any(Any::True), r#"{"docId":"t"}"#.to_owned()),
      (
        "string",
        TestValue::string("ab😀"),
        r#"{"0":"a","1":"b","2":"\ud83d","3":"\ude00","docId":"t"}"#.to_owned(),
      ),
      (
        "array",
        TestValue::Any(strings(&["p", "q"])),
        r#"{"0":"p","1":"q","docId":"t"}"#.to_owned(),
      ),
      (
        "object",
        TestValue::Any(object(vec![
          ("mode", Any::String("page".to_owned())),
          ("10", Any::String("x".to_owned())),
          ("2", Any::String("y".to_owned())),
          ("docId", Any::String("other".to_owned())),
          ("gone", Any::Undefined),
          ("ratio", Any::Float64(1.5.into())),
          ("whole", Any::Float64(3.0.into())),
          ("list", Any::Array(vec![Any::Undefined, Any::Null])),
          ("negZero", Any::Float64((-0.0).into())),
          ("big", Any::Float64(1e21.into())),
          ("small", Any::Float64(1e-6.into())),
          ("tiny", Any::Float64((-1.5e-7).into())),
        ])),
        concat!(
          r#"{"2":"y","10":"x","docId":"other","big":1e+21,"list":[null,null],"mode":"page","#,
          r#""negZero":0,"ratio":1.5,"small":0.000001,"tiny":-1.5e-7,"whole":3}"#
        )
        .to_owned(),
      ),
      (
        "y-map",
        TestValue::map(vec![
          ("mode", TestValue::string("page")),
          ("databaseId", TestValue::string("db")),
          ("title", TestValue::text("T")),
        ]),
        r#"{"docId":"t","databaseId":"db","mode":"page","title":"T"}"#.to_owned(),
      ),
      (
        "oversized",
        TestValue::string(&"x".repeat(20 * 1024)),
        r#"{"docId":"t"}"#.to_owned(),
      ),
      ("too-deep", nested, r#"{"docId":"t"}"#.to_owned()),
    ];
    let mut doc = TestDoc::new("doc-src", "Source");
    let mut expected = Vec::new();
    for (id, params, serialized) in cases {
      doc.block(
        id,
        "affine:embed-linked-doc",
        None,
        vec![("prop:pageId", TestValue::string("t")), ("prop:params", params)],
      );
      expected.push((id, serialized));
    }
    let projection = project(doc);
    for (id, serialized) in expected {
      let unit = unit(&projection, id).unwrap_or_else(|| panic!("{id} unit is missing"));
      assert_eq!(unit.ref_doc_ids, ["t"], "{id} ref doc ids");
      assert_eq!(unit.refs, [serialized], "{id} refs");
    }
  }

  #[test]
  fn projection_skips_malformed_properties_without_losing_other_blocks() {
    let mut doc = TestDoc::new("doc-src", "Source");
    doc
      .block(
        "bad-reference",
        "affine:paragraph",
        None,
        vec![(
          "prop:text",
          TestValue::rich(&[
            ("string ", Some(Any::String("oops".to_owned()))),
            ("no page ", Some(object(vec![("params", Any::Integer(1))]))),
            ("number page ", Some(object(vec![("pageId", Any::Integer(7))]))),
            ("empty", Some(TestValue::reference("", vec![]))),
          ]),
        )],
      )
      .block(
        "bad-database",
        "affine:database",
        None,
        vec![
          ("prop:title", TestValue::text("Broken")),
          ("prop:columns", TestValue::string("junk")),
          (
            "prop:cells",
            TestValue::map(vec![
              ("row-1", TestValue::Any(Any::Integer(1))),
              (
                "row-2",
                TestValue::map(vec![
                  ("col-1", TestValue::string("junk")),
                  ("col-2", cell(TestValue::Any(Any::Integer(2)))),
                  ("col-3", cell(TestValue::Any(object(vec![(MARKER, Any::True)])))),
                ]),
              ),
            ]),
          ),
        ],
      )
      .block(
        "good",
        "affine:paragraph",
        None,
        vec![("prop:text", TestValue::rich(&[("ok", target("target-z"))]))],
      );
    let projection = project(doc);

    let bad_reference = unit(&projection, "bad-reference").expect("bad-reference unit");
    assert_eq!(bad_reference.text, "string no page number page empty");
    assert!(bad_reference.ref_doc_ids.is_empty() && bad_reference.refs.is_empty());

    let bad_database = unit(&projection, "bad-database").expect("bad-database unit");
    assert_eq!(bad_database.text, "Broken");
    assert!(bad_database.refs.is_empty());

    let good = unit(&projection, "good").expect("good unit");
    assert_eq!(good.ref_doc_ids, ["target-z"]);
  }

  /// Times `project_document_search` and returns its paragraph unit.
  fn timed_projection(doc: TestDoc) -> (Duration, SearchUnit) {
    let blob = doc.encode();
    let started = Instant::now();
    let projection = project_document_search(blob, "doc-src".to_owned()).expect("project test doc");
    let elapsed = started.elapsed();
    (elapsed, unit(&projection, "para").expect("para unit").clone())
  }

  /// The bound for one projection in these tests. It includes decoding the
  /// doc in a debug build next to the other tests. The quadratic versions
  /// took minutes for the same input.
  const PROJECTION_BUDGET: Duration = Duration::from_secs(2);

  #[test]
  fn inline_reference_projection_stays_linear_in_runs_and_references() {
    // One 10 KiB reference over 8,000 characters, then bold on every other
    // character, so the reference spans 8,000 runs.
    let block_ids = strings(&["block-id-0123456789"; 500]);
    let large = TestValue::reference("target-large", vec![("blockIds", block_ids)]);
    let insert = vec![TextDeltaOp::Insert {
      insert: TextInsert::Text("r".repeat(8_000)),
      format: Some(TextAttributes::from([("reference".to_owned(), large)])),
    }];
    let bold = (0..8_000)
      .map(|index| TextDeltaOp::Retain {
        retain: 1,
        format: (index % 2 == 1).then(|| TextAttributes::from([("bold".to_owned(), Any::True)])),
      })
      .collect();
    let mut doc = TestDoc::new("doc-src", "Source");
    doc.block(
      "para",
      "affine:paragraph",
      None,
      vec![("prop:text", TestValue::Deltas(vec![insert, bold]))],
    );
    let (elapsed, unit) = timed_projection(doc);
    assert_eq!(unit.ref_doc_ids, ["target-large"]);
    assert_eq!(unit.refs.len(), 1);
    assert!(elapsed < PROJECTION_BUDGET, "8,000 runs took {elapsed:?}");

    // 25,000 different references in one paragraph.
    let segments = (0..25_000)
      .map(|index| {
        let reference = TestValue::reference(&format!("target-{index}"), vec![]);
        (
          "r".to_owned(),
          TextAttributes::from([("reference".to_owned(), reference)]),
        )
      })
      .collect();
    let mut doc = TestDoc::new("doc-src", "Source");
    doc.block(
      "para",
      "affine:paragraph",
      None,
      vec![("prop:text", TestValue::RichText(segments))],
    );
    let (elapsed, unit) = timed_projection(doc);
    assert_eq!(unit.refs.len(), 25_000);
    assert_eq!(unit.ref_doc_ids.len(), 25_000);
    assert_eq!(unit.ref_doc_ids[24_999], "target-24999");
    assert!(elapsed < PROJECTION_BUDGET, "25,000 references took {elapsed:?}");
  }

  #[test]
  fn oversized_reference_params_fall_back_to_doc_id() {
    let cases: Vec<(&str, Any)> = vec![
      ("long-string", Any::String("x".repeat(2 * 1024 * 1024))),
      ("long-array", Any::Array(vec![Any::Integer(1); 200_000])),
      (
        "wide-object",
        (0..200_000)
          .map(|index| (format!("k{index}"), Any::Integer(1)))
          .collect(),
      ),
    ];
    let mut doc = TestDoc::new("doc-src", "Source");
    for (id, params) in &cases {
      doc.block(
        id,
        "affine:embed-linked-doc",
        None,
        vec![
          ("prop:pageId", TestValue::string("t")),
          ("prop:params", TestValue::Any(params.clone())),
        ],
      );
    }
    let projection = project(doc);
    for (id, _) in &cases {
      let unit = unit(&projection, id).unwrap_or_else(|| panic!("{id} unit is missing"));
      assert_eq!(unit.ref_doc_ids, ["t"], "{id}");
      assert_eq!(unit.refs, [r#"{"docId":"t"}"#], "{id}");
    }
  }

  #[test]
  fn large_params_keep_distinct_references_to_one_doc() {
    let with_note = |note: String| Some(TestValue::reference("D", vec![("note", Any::String(note))]));
    let mut doc = TestDoc::new("doc-src", "Source");
    doc.block(
      "para",
      "affine:paragraph",
      None,
      vec![(
        "prop:text",
        TestValue::rich(&[
          ("a", with_note("a".repeat(17 * 1024))),
          ("b", with_note("b".repeat(17 * 1024))),
          ("x", with_note("x".repeat(300 * 1024))),
          ("y", with_note("y".repeat(300 * 1024))),
        ]),
      )],
    );
    let projection = project(doc);
    let unit = unit(&projection, "para").expect("para unit");
    let full = |fill: &str| format!(r#"{{"docId":"D","note":"{}"}}"#, fill.repeat(17 * 1024));
    assert_eq!(unit.ref_doc_ids, ["D", "D", "D", "D"]);
    assert_eq!(
      unit.refs,
      [
        full("a"),
        full("b"),
        r#"{"docId":"D"}"#.to_owned(),
        r#"{"docId":"D"}"#.to_owned()
      ]
    );
  }

  #[test]
  fn text_comes_from_y_text_and_containers_join_direct_children() {
    let mut doc = TestDoc::new("doc-src", "Source");
    doc
      .block(
        "p-quasar",
        "affine:paragraph",
        None,
        vec![("prop:text", TestValue::text("quasar"))],
      )
      .block("frame", "affine:frame", None, vec![])
      .block(
        "frame-child",
        "affine:paragraph",
        Some("frame"),
        vec![("prop:text", TestValue::text("inside frame"))],
      )
      .block("edgeless", "affine:edgeless-text", None, vec![])
      .block(
        "edgeless-child",
        "affine:paragraph",
        Some("edgeless"),
        vec![("prop:text", TestValue::text("inside edgeless"))],
      )
      .block(
        "p-plain",
        "affine:paragraph",
        None,
        vec![("prop:text", TestValue::string("plain"))],
      )
      .block(
        "l-plain",
        "affine:list",
        None,
        vec![("prop:text", TestValue::string("plain list"))],
      )
      .block(
        "c-real",
        "affine:code",
        None,
        vec![("prop:text", TestValue::text("real"))],
      );
    let projection = project(doc);
    let text = |block_id: &str| unit(&projection, block_id).map(|unit| unit.text.as_str());
    let cases = [
      ("note-doc-src", Some("quasar\nplain\nplain list\nreal")),
      ("frame", Some("inside frame")),
      ("edgeless", Some("inside edgeless")),
      ("p-quasar", Some("quasar")),
      ("frame-child", Some("inside frame")),
      ("p-plain", None),
      ("l-plain", None),
      ("c-real", Some("real")),
    ];
    for (block_id, expected) in cases {
      assert_eq!(text(block_id), expected, "{block_id}");
    }
  }

  fn children(ids: impl Iterator<Item = String>) -> TestValue {
    TestValue::Array(ids.map(|id| TestValue::string(&id)).collect())
  }

  #[test]
  fn containers_claim_each_child_text_once() {
    let big = "p".repeat(120 * 1024);
    let mut doc = TestDoc::new("doc-src", "Source");
    doc
      .block(
        "big-note",
        "affine:note",
        None,
        vec![(
          "sys:children",
          children(std::iter::repeat_n("para-big".to_owned(), 10_000)),
        )],
      )
      .detached(
        "para-big",
        "affine:paragraph",
        vec![("prop:text", TestValue::text(&big))],
      )
      .detached(
        "shared",
        "affine:paragraph",
        vec![("prop:text", TestValue::text("shared text"))],
      );
    for index in 0..1_000 {
      doc.block(
        &format!("frame-{index:04}"),
        "affine:frame",
        None,
        vec![("sys:children", children(std::iter::once("shared".to_owned())))],
      );
    }
    let projection = project(doc);

    assert_eq!(
      unit(&projection, "big-note").map(|unit| unit.text.len()),
      Some(120 * 1024)
    );
    assert_eq!(
      unit(&projection, "para-big").map(|unit| unit.text.len()),
      Some(120 * 1024)
    );
    let frames: Vec<(&str, &str)> = projection
      .units
      .iter()
      .filter(|unit| unit.unit_type == "frame")
      .map(|unit| (unit.block_id.as_deref().unwrap_or_default(), unit.text.as_str()))
      .collect();
    assert_eq!(frames, [("frame-0000", "shared text")]);
    assert_eq!(
      unit(&projection, "shared").map(|unit| unit.text.as_str()),
      Some("shared text")
    );
  }

  #[test]
  fn oversized_references_keep_their_identity_and_the_block_budget() {
    let with_note =
      |fill: &str, len: usize| Some(TestValue::reference("D", vec![("note", Any::String(fill.repeat(len)))]));
    let large = 300 * 1024;
    let mut doc = TestDoc::new("doc-src", "Source");
    doc.block(
      "p-repeat",
      "affine:paragraph",
      None,
      vec![(
        "prop:text",
        TestValue::rich(&[
          ("a", with_note("a", large)),
          ("b", with_note("b", large)),
          ("a", with_note("a", large)),
        ]),
      )],
    );
    let cell = |fill: &str| {
      TestValue::map(vec![(
        "value",
        TestValue::rich(&[("x", with_note(fill, large)), ("y", with_note(fill, large))]),
      )])
    };
    doc.block(
      "db",
      "affine:database",
      None,
      vec![
        ("prop:title", TestValue::text("Tasks")),
        (
          "prop:cells",
          TestValue::map(vec![(
            "row",
            TestValue::map(vec![("col-1", cell("a")), ("col-2", cell("a"))]),
          )]),
        ),
      ],
    );
    // 70 different references of 250 KiB each pass the block budget.
    let budget: Vec<(String, Option<Any>)> = (0..70)
      .map(|index| (format!("{index:02}"), with_note(&format!("{index:02}"), 125 * 1024)))
      .collect();
    let segments: Vec<(&str, Option<Any>)> = budget
      .iter()
      .map(|(text, reference)| (text.as_str(), reference.clone()))
      .collect();
    doc.block(
      "p-budget",
      "affine:paragraph",
      None,
      vec![("prop:text", TestValue::rich(&segments))],
    );
    let projection = project(doc);

    let fallback = r#"{"docId":"D"}"#;
    let repeat = unit(&projection, "p-repeat").expect("p-repeat unit");
    assert_eq!(repeat.ref_doc_ids, ["D", "D"]);
    assert_eq!(repeat.refs, [fallback, fallback]);
    let database = unit(&projection, "db").expect("db unit");
    assert_eq!(database.refs, [fallback, fallback], "each cell checks duplicates alone");

    let budget = unit(&projection, "p-budget").expect("p-budget unit");
    let total: usize = budget.refs.iter().map(String::len).sum();
    let full = budget
      .refs
      .iter()
      .filter(|serialized| serialized.len() > fallback.len())
      .count();
    assert!(total <= reference::MAX_BLOCK_REFS_BYTES, "refs take {total} bytes");
    assert_eq!(budget.refs.len(), 70);
    assert_eq!(budget.ref_doc_ids.len(), 70);
    assert!(full > 0 && full < 70, "{full} references kept their params");
    assert!(budget.refs[full..].iter().all(|serialized| serialized == fallback));
  }

  #[test]
  fn wide_oversized_params_keep_their_identity() {
    // 4,097 keys pass `MAX_SPREAD_ENTRIES`, and only the last value differs.
    let params = |last: Any| {
      let mut entries: Vec<(String, Any)> = (0..4_096).map(|index| (format!("k{index}"), Any::Integer(1))).collect();
      entries.push(("k4096".to_owned(), last));
      let params: Any = entries.into_iter().collect();
      Some(object(vec![
        ("pageId", Any::String("D".to_owned())),
        ("params", params),
      ]))
    };
    let mut doc = TestDoc::new("doc-src", "Source");
    doc.block(
      "para",
      "affine:paragraph",
      None,
      vec![(
        "prop:text",
        TestValue::rich(&[
          ("a", params(Any::String("a".to_owned()))),
          ("b", params(Any::String("b".to_owned()))),
          ("a", params(Any::String("a".to_owned()))),
        ]),
      )],
    );
    // Nested arrays of the same items in another shape: `[[1], 2]` and `[[1, 2]]`.
    let split = || Any::Array(vec![Any::Array(vec![Any::Integer(1)]), Any::Integer(2)]);
    let joined = || Any::Array(vec![Any::Array(vec![Any::Integer(1), Any::Integer(2)])]);
    doc.block(
      "nested",
      "affine:paragraph",
      None,
      vec![(
        "prop:text",
        TestValue::rich(&[("a", params(split())), ("b", params(joined())), ("a", params(split()))]),
      )],
    );
    let projection = project(doc);
    for block_id in ["para", "nested"] {
      let unit = unit(&projection, block_id).unwrap_or_else(|| panic!("{block_id} unit is missing"));
      assert_eq!(unit.ref_doc_ids, ["D", "D"], "{block_id}");
      assert_eq!(unit.refs, [r#"{"docId":"D"}"#, r#"{"docId":"D"}"#], "{block_id}");
    }
  }

  #[test]
  fn full_containers_leave_unwritten_children_to_later_containers() {
    let shared = |id: &str| children([format!("{id}-big"), format!("{id}-word")].into_iter());
    let mut doc = TestDoc::new("doc-src", "Source");
    doc
      .block("frame-a", "affine:frame", None, vec![("sys:children", shared("a"))])
      .block(
        "frame-b",
        "affine:frame",
        None,
        vec![("sys:children", children(std::iter::once("a-word".to_owned())))],
      )
      .block("frame-c", "affine:frame", None, vec![("sys:children", shared("c"))])
      .block(
        "frame-d",
        "affine:frame",
        None,
        vec![("sys:children", children(std::iter::once("c-word".to_owned())))],
      )
      .detached(
        "a-big",
        "affine:paragraph",
        vec![("prop:text", TestValue::text(&"x".repeat(1024 * 1024)))],
      )
      .detached(
        "a-word",
        "affine:paragraph",
        vec![("prop:text", TestValue::text("needle"))],
      )
      .detached(
        "c-big",
        "affine:paragraph",
        vec![("prop:text", TestValue::text(&"x".repeat(1024 * 1024 - 2)))],
      )
      .detached(
        "c-word",
        "affine:paragraph",
        vec![("prop:text", TestValue::text("中文词"))],
      );
    let projection = project(doc);
    let text = |block_id: &str| unit(&projection, block_id).map(|unit| unit.text.clone());
    assert_eq!(text("frame-a").map(|text| text.len()), Some(1024 * 1024));
    assert_eq!(text("frame-b").as_deref(), Some("needle"));
    assert_eq!(text("frame-c").map(|text| text.len()), Some(1024 * 1024 - 2));
    assert_eq!(text("frame-d").as_deref(), Some("中文词"));
  }

  #[test]
  fn deep_params_keep_their_identity() {
    // 18 nested arrays pass the JSON writer depth limit of 16.
    let params = |leaf: i32| {
      let nested = (0..18).fold(Any::Integer(leaf), |value, _| Any::Array(vec![value]));
      Some(object(vec![
        ("pageId", Any::String("D".to_owned())),
        ("params", object(vec![("v", nested)])),
      ]))
    };
    let mut doc = TestDoc::new("doc-src", "Source");
    doc.block(
      "para",
      "affine:paragraph",
      None,
      vec![(
        "prop:text",
        TestValue::rich(&[("a", params(1)), ("b", params(2)), ("a", params(1))]),
      )],
    );
    let projection = project(doc);
    let unit = unit(&projection, "para").expect("para unit");
    assert_eq!(unit.ref_doc_ids, ["D", "D"]);
    assert_eq!(unit.refs, [r#"{"docId":"D"}"#, r#"{"docId":"D"}"#]);
  }

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
