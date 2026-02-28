use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use thiserror::Error;
use y_octo::{Any, DocOptions, JwstCodecError, Map, Value};

const SUMMARY_LIMIT: usize = 1000;
const PAGE_FLAVOUR: &str = "affine:page";
const NOTE_FLAVOUR: &str = "affine:note";

const BOOKMARK_FLAVOURS: [&str; 5] = [
  "affine:bookmark",
  "affine:embed-youtube",
  "affine:embed-figma",
  "affine:embed-github",
  "affine:embed-loom",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockInfo {
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

impl BlockInfo {
  fn base(
    block_id: &str,
    flavour: &str,
    parent_flavour: Option<&String>,
    parent_block_id: Option<&String>,
    additional: Option<String>,
  ) -> Self {
    Self {
      block_id: block_id.to_string(),
      flavour: flavour.to_string(),
      content: None,
      blob: None,
      ref_doc_id: None,
      ref_info: None,
      parent_flavour: parent_flavour.cloned(),
      parent_block_id: parent_block_id.cloned(),
      additional,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrawlResult {
  pub blocks: Vec<BlockInfo>,
  pub title: String,
  pub summary: String,
}

#[derive(Error, Debug, Serialize, Deserialize)]
pub enum ParseError {
  #[error("doc_not_found")]
  DocNotFound,
  #[error("invalid_binary")]
  InvalidBinary,
  #[error("sqlite_error: {0}")]
  SqliteError(String),
  #[error("parser_error: {0}")]
  ParserError(String),
  #[error("unknown: {0}")]
  Unknown(String),
}

impl From<JwstCodecError> for ParseError {
  fn from(value: JwstCodecError) -> Self {
    Self::ParserError(value.to_string())
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkdownResult {
  pub title: String,
  pub markdown: String,
}

pub fn parse_doc_to_markdown(
  doc_bin: Vec<u8>,
  doc_id: String,
  ai_editable: bool,
) -> Result<MarkdownResult, ParseError> {
  if doc_bin.is_empty() || doc_bin == [0, 0] {
    return Err(ParseError::InvalidBinary);
  }

  let mut doc = DocOptions::new().with_guid(doc_id.clone()).build();
  doc
    .apply_update_from_binary_v1(&doc_bin)
    .map_err(|_| ParseError::InvalidBinary)?;

  let blocks_map = doc.get_map("blocks")?;
  if blocks_map.is_empty() {
    return Ok(MarkdownResult {
      title: "".into(),
      markdown: "".into(),
    });
  }

  let mut block_pool: HashMap<String, Map> = HashMap::new();
  let mut parent_lookup: HashMap<String, String> = HashMap::new();

  for (_, value) in blocks_map.iter() {
    if let Some(block_map) = value.to_map() {
      if let Some(block_id) = get_block_id(&block_map) {
        for child_id in collect_child_ids(&block_map) {
          parent_lookup.insert(child_id, block_id.clone());
        }
        block_pool.insert(block_id, block_map);
      }
    }
  }

  let root_block_id = block_pool
    .iter()
    .find_map(|(id, block)| {
      get_flavour(block)
        .filter(|flavour| flavour == PAGE_FLAVOUR)
        .map(|_| id.clone())
    })
    .ok_or_else(|| ParseError::ParserError("root block not found".into()))?;

  let mut queue: Vec<(Option<String>, String)> = vec![(None, root_block_id.clone())];
  let mut visited: HashSet<String> = HashSet::from([root_block_id.clone()]);
  let mut doc_title = String::from("Untitled");
  let mut markdown = String::new();

  while let Some((parent_block_id, block_id)) = queue.pop() {
    let block = match block_pool.get(&block_id) {
      Some(block) => block,
      None => continue,
    };

    let flavour = match get_flavour(block) {
      Some(flavour) => flavour,
      None => continue,
    };

    let parent_id = parent_lookup.get(&block_id);
    let parent_flavour = parent_id
      .and_then(|id| block_pool.get(id))
      .and_then(get_flavour);

    if parent_flavour.as_deref() == Some("affine:database") {
      continue;
    }

    // enqueue children first to keep traversal order similar to JS implementation
    let mut child_ids = collect_child_ids(block);
    for child_id in child_ids.drain(..).rev() {
      if visited.insert(child_id.clone()) {
        queue.push((Some(block_id.clone()), child_id));
      }
    }

    if flavour == PAGE_FLAVOUR {
      let title = get_string(block, "prop:title").unwrap_or_default();
      doc_title = title.clone();
      continue;
    }

    if flavour == "affine:database" {
      let title = get_string(block, "prop:title").unwrap_or_default();
      markdown.push_str(&format!("\n### {}\n", title));

      let columns_array = block.get("prop:columns").and_then(|v| v.to_array());
      let cells_map = block.get("prop:cells").and_then(|v| v.to_map());

      if let (Some(columns_array), Some(cells_map)) = (columns_array, cells_map) {
        let mut columns = Vec::new();
        for col_val in columns_array.iter() {
          if let Some(col_map) = col_val.to_map() {
            let id = get_string(&col_map, "id").unwrap_or_default();
            let name = get_string(&col_map, "name").unwrap_or_default();
            let type_ = get_string(&col_map, "type").unwrap_or_default();
            let data = col_map.get("data").and_then(|v| v.to_map());
            columns.push((id, name, type_, data));
          }
        }

        let escape_table = |s: &str| s.replace('|', "\\|").replace('\n', "<br>");

        markdown.push('|');
        for (_, name, _, _) in &columns {
          markdown.push_str(&escape_table(name));
          markdown.push('|');
        }
        markdown.push('\n');

        markdown.push('|');
        for _ in &columns {
          markdown.push_str("---|");
        }
        markdown.push('\n');

        let child_ids = collect_child_ids(block);
        for child_id in child_ids {
          markdown.push('|');
          let row_cells = cells_map.get(&child_id).and_then(|v| v.to_map());

          for (col_id, _, col_type, col_data) in &columns {
            let mut cell_text = String::new();
            if col_type == "title" {
              if let Some(child_block) = block_pool.get(&child_id) {
                if let Some((text, _)) = text_content(child_block, "prop:text") {
                  cell_text = text;
                }
              }
            } else if let Some(row_cells) = &row_cells {
              if let Some(cell_val) = row_cells.get(col_id).and_then(|v| v.to_map()) {
                if let Some(value) = cell_val.get("value").and_then(|v| v.to_any()) {
                  cell_text = format_cell_value(&value, col_type, col_data.as_ref());
                }
              }
            }
            markdown.push_str(&escape_table(&cell_text));
            markdown.push('|');
          }
          markdown.push('\n');
        }
      }
      continue;
    }

    if flavour == "affine:table" {
      let contents = gather_table_contents(block);
      markdown.push_str(&contents.join("|"));
      markdown.push('\n');
      continue;
    }

    if ai_editable && parent_block_id.as_ref() == Some(&root_block_id) {
      markdown.push_str(&format!(
        "<!-- block_id={} flavour={} -->\n",
        block_id, flavour
      ));
    }

    if flavour == "affine:paragraph" {
      if let Some((text, _)) = text_content(block, "prop:text") {
        let type_ = get_string(block, "prop:type").unwrap_or_default();
        let prefix = match type_.as_str() {
          "h1" => "# ",
          "h2" => "## ",
          "h3" => "### ",
          "h4" => "#### ",
          "h5" => "##### ",
          "h6" => "###### ",
          "quote" => "> ",
          _ => "",
        };
        markdown.push_str(prefix);
        markdown.push_str(&text);
        markdown.push('\n');
      }
      continue;
    }

    if flavour == "affine:list" {
      if let Some((text, _)) = text_content(block, "prop:text") {
        let depth = get_list_depth(&block_id, &parent_lookup, &block_pool);
        let indent = "    ".repeat(depth);
        markdown.push_str(&indent);
        markdown.push_str("- ");
        markdown.push_str(&text);
        markdown.push('\n');
      }
      continue;
    }

    if flavour == "affine:code" {
      if let Some((text, _)) = text_content(block, "prop:text") {
        let lang = get_string(block, "prop:language").unwrap_or_default();
        markdown.push_str("```");
        markdown.push_str(&lang);
        markdown.push('\n');
        markdown.push_str(&text);
        markdown.push_str("\n```\n");
      }
      continue;
    }
  }

  Ok(MarkdownResult {
    title: doc_title,
    markdown,
  })
}

fn get_list_depth(
  block_id: &str,
  parent_lookup: &HashMap<String, String>,
  blocks: &HashMap<String, Map>,
) -> usize {
  let mut depth = 0;
  let mut current_id = block_id.to_string();

  while let Some(parent_id) = parent_lookup.get(&current_id) {
    if let Some(parent_block) = blocks.get(parent_id) {
      if get_flavour(parent_block).as_deref() == Some("affine:list") {
        depth += 1;
        current_id = parent_id.clone();
        continue;
      }
    }
    break;
  }
  depth
}

pub fn parse_doc_from_binary(doc_bin: Vec<u8>, doc_id: String) -> Result<CrawlResult, ParseError> {
  if doc_bin.is_empty() || doc_bin == [0, 0] {
    return Err(ParseError::InvalidBinary);
  }

  let mut doc = DocOptions::new().with_guid(doc_id.clone()).build();
  doc
    .apply_update_from_binary_v1(&doc_bin)
    .map_err(|_| ParseError::InvalidBinary)?;

  let blocks_map = doc.get_map("blocks")?;
  if blocks_map.is_empty() {
    return Err(ParseError::ParserError("blocks map is empty".into()));
  }

  let mut block_pool: HashMap<String, Map> = HashMap::new();
  let mut parent_lookup: HashMap<String, String> = HashMap::new();

  for (_, value) in blocks_map.iter() {
    if let Some(block_map) = value.to_map() {
      if let Some(block_id) = get_block_id(&block_map) {
        for child_id in collect_child_ids(&block_map) {
          parent_lookup.insert(child_id, block_id.clone());
        }
        block_pool.insert(block_id, block_map);
      }
    }
  }

  let root_block_id = block_pool
    .iter()
    .find_map(|(id, block)| {
      get_flavour(block)
        .filter(|flavour| flavour == PAGE_FLAVOUR)
        .map(|_| id.clone())
    })
    .ok_or_else(|| ParseError::ParserError("root block not found".into()))?;

  let mut queue: Vec<(Option<String>, String)> = vec![(None, root_block_id.clone())];
  let mut visited: HashSet<String> = HashSet::from([root_block_id.clone()]);
  let mut blocks: Vec<BlockInfo> = Vec::with_capacity(block_pool.len());
  let mut doc_title = String::new();
  let mut summary = String::new();
  let mut summary_remaining = SUMMARY_LIMIT as isize;

  while let Some((parent_block_id, block_id)) = queue.pop() {
    let block = match block_pool.get(&block_id) {
      Some(block) => block,
      None => continue,
    };

    let flavour = match get_flavour(block) {
      Some(flavour) => flavour,
      None => continue,
    };

    let parent_block = parent_block_id.as_ref().and_then(|id| block_pool.get(id));
    let parent_flavour = parent_block.and_then(get_flavour);

    let note_block = nearest_by_flavour(&block_id, NOTE_FLAVOUR, &parent_lookup, &block_pool);
    let note_block_id = note_block.as_ref().and_then(get_block_id);
    let display_mode = determine_display_mode(note_block.as_ref());

    // enqueue children first to keep traversal order similar to JS implementation
    let mut child_ids = collect_child_ids(block);
    for child_id in child_ids.drain(..).rev() {
      if visited.insert(child_id.clone()) {
        queue.push((Some(block_id.clone()), child_id));
      }
    }

    let build_block = |database_name: Option<&String>| {
      BlockInfo::base(
        &block_id,
        &flavour,
        parent_flavour.as_ref(),
        parent_block_id.as_ref(),
        compose_additional(&display_mode, note_block_id.as_ref(), database_name),
      )
    };

    if flavour == PAGE_FLAVOUR {
      let title = get_string(block, "prop:title").unwrap_or_default();
      doc_title = title.clone();
      let mut info = build_block(None);
      info.content = Some(vec![title]);
      blocks.push(info);
      continue;
    }

    if matches!(
      flavour.as_str(),
      "affine:paragraph" | "affine:list" | "affine:code"
    ) {
      if let Some((text, text_len)) = text_content(block, "prop:text") {
        let database_name = if flavour == "affine:paragraph"
          && parent_flavour.as_deref() == Some("affine:database")
        {
          parent_block.and_then(|map| get_string(map, "prop:title"))
        } else {
          None
        };

        let mut info = build_block(database_name.as_ref());
        info.content = Some(vec![text.clone()]);
        blocks.push(info);
        append_summary(&mut summary, &mut summary_remaining, text_len, &text);
      }
      continue;
    }

    if matches!(
      flavour.as_str(),
      "affine:embed-linked-doc" | "affine:embed-synced-doc"
    ) {
      if let Some(page_id) = get_string(block, "prop:pageId") {
        let mut info = build_block(None);
        info.ref_doc_id = Some(vec![page_id.clone()]);
        if let Some(payload) = embed_ref_payload(block, &page_id) {
          info.ref_info = Some(vec![payload]);
        }
        blocks.push(info);
      }
      continue;
    }

    if flavour == "affine:attachment" {
      if let Some(blob_id) = get_string(block, "prop:sourceId") {
        let mut info = build_block(None);
        info.blob = Some(vec![blob_id]);
        info.content = Some(vec![get_string(block, "prop:name").unwrap_or_default()]);
        blocks.push(info);
      }
      continue;
    }

    if flavour == "affine:image" {
      if let Some(blob_id) = get_string(block, "prop:sourceId") {
        let mut info = build_block(None);
        info.blob = Some(vec![blob_id]);
        info.content = Some(vec![get_string(block, "prop:caption").unwrap_or_default()]);
        blocks.push(info);
      }
      continue;
    }

    if flavour == "affine:surface" {
      let texts = gather_surface_texts(block);
      let mut info = build_block(None);
      info.content = Some(texts);
      blocks.push(info);
      continue;
    }

    if flavour == "affine:database" {
      let (texts, database_name) = gather_database_texts(block);
      let mut info = BlockInfo::base(
        &block_id,
        &flavour,
        parent_flavour.as_ref(),
        parent_block_id.as_ref(),
        compose_additional(
          &display_mode,
          note_block_id.as_ref(),
          database_name.as_ref(),
        ),
      );
      info.content = Some(texts);
      blocks.push(info);
      continue;
    }

    if flavour == "affine:latex" {
      if let Some(content) = get_string(block, "prop:latex") {
        let mut info = build_block(None);
        info.content = Some(vec![content]);
        blocks.push(info);
      }
      continue;
    }

    if flavour == "affine:table" {
      let contents = gather_table_contents(block);
      let mut info = build_block(None);
      info.content = Some(contents);
      blocks.push(info);
      continue;
    }

    if BOOKMARK_FLAVOURS.contains(&flavour.as_str()) {
      blocks.push(build_block(None));
    }
  }

  if doc_title.is_empty() {
    doc_title = "Untitled".into();
  }

  Ok(CrawlResult {
    blocks,
    title: doc_title,
    summary,
  })
}

pub fn get_doc_ids_from_binary(
  doc_bin: Vec<u8>,
  include_trash: bool,
) -> Result<Vec<String>, ParseError> {
  if doc_bin.is_empty() || doc_bin == [0, 0] {
    return Err(ParseError::InvalidBinary);
  }

  let mut doc = DocOptions::new().build();
  doc
    .apply_update_from_binary_v1(&doc_bin)
    .map_err(|_| ParseError::InvalidBinary)?;

  let meta = doc.get_map("meta")?;
  let pages = match meta.get("pages").and_then(|v| v.to_array()) {
    Some(arr) => arr,
    None => return Ok(vec![]),
  };

  let mut doc_ids = Vec::new();
  for page_val in pages.iter() {
    if let Some(page) = page_val.to_map() {
      let id = get_string(&page, "id");
      if let Some(id) = id {
        let trash = page
          .get("trash")
          .and_then(|v| match v.to_any() {
            Some(Any::True) => Some(true),
            Some(Any::False) => Some(false),
            _ => None,
          })
          .unwrap_or(false);

        if include_trash || !trash {
          doc_ids.push(id);
        }
      }
    }
  }

  Ok(doc_ids)
}

fn collect_child_ids(block: &Map) -> Vec<String> {
  block
    .get("sys:children")
    .and_then(|value| value.to_array())
    .map(|array| {
      array
        .iter()
        .filter_map(|value| value_to_string(&value))
        .collect::<Vec<_>>()
    })
    .unwrap_or_default()
}

fn get_block_id(block: &Map) -> Option<String> {
  get_string(block, "sys:id")
}

fn get_flavour(block: &Map) -> Option<String> {
  get_string(block, "sys:flavour")
}

fn get_string(block: &Map, key: &str) -> Option<String> {
  block.get(key).and_then(|value| value_to_string(&value))
}

fn text_content(block: &Map, key: &str) -> Option<(String, usize)> {
  block.get(key).and_then(|value| {
    value.to_text().map(|text| {
      let content = text.to_string();
      let len = text.len() as usize;
      (content, len)
    })
  })
}

fn nearest_by_flavour(
  start: &str,
  flavour: &str,
  parent_lookup: &HashMap<String, String>,
  blocks: &HashMap<String, Map>,
) -> Option<Map> {
  let mut cursor = Some(start.to_string());
  while let Some(node) = cursor {
    if let Some(block) = blocks.get(&node) {
      if get_flavour(block).as_deref() == Some(flavour) {
        return Some(block.clone());
      }
    }
    cursor = parent_lookup.get(&node).cloned();
  }
  None
}

fn determine_display_mode(note_block: Option<&Map>) -> String {
  match note_block.and_then(|block| get_string(block, "prop:displayMode")) {
    Some(mode) if mode == "both" => "page".into(),
    Some(mode) => mode,
    None => "edgeless".into(),
  }
}

fn compose_additional(
  display_mode: &str,
  note_block_id: Option<&String>,
  database_name: Option<&String>,
) -> Option<String> {
  let mut payload = JsonMap::new();
  payload.insert(
    "displayMode".into(),
    JsonValue::String(display_mode.to_string()),
  );
  if let Some(note_id) = note_block_id {
    payload.insert("noteBlockId".into(), JsonValue::String(note_id.clone()));
  }
  if let Some(name) = database_name {
    payload.insert("databaseName".into(), JsonValue::String(name.clone()));
  }
  Some(JsonValue::Object(payload).to_string())
}

fn embed_ref_payload(block: &Map, page_id: &str) -> Option<String> {
  let mut payload = JsonMap::new();
  payload.insert("docId".into(), JsonValue::String(page_id.to_string()));

  if let Some(params_value) = block.get("prop:params") {
    if let Ok(JsonValue::Object(params)) = serde_json::to_value(&params_value) {
      for (key, value) in params.into_iter() {
        payload.insert(key, value);
      }
    }
  }

  Some(JsonValue::Object(payload).to_string())
}

fn gather_surface_texts(block: &Map) -> Vec<String> {
  let mut texts = Vec::new();
  let elements = match block.get("prop:elements").and_then(|value| value.to_map()) {
    Some(map) => map,
    None => return texts,
  };

  if elements
    .get("type")
    .and_then(|value| value_to_string(&value))
    .as_deref()
    != Some("$blocksuite:internal:native$")
  {
    return texts;
  }

  if let Some(value_map) = elements.get("value").and_then(|value| value.to_map()) {
    for value in value_map.values() {
      if let Some(element) = value.to_map() {
        if let Some(text) = element.get("text").and_then(|value| value.to_text()) {
          texts.push(text.to_string());
        }
      }
    }
  }

  texts.sort();
  texts
}

fn gather_database_texts(block: &Map) -> (Vec<String>, Option<String>) {
  let mut texts = Vec::new();
  let database_title = get_string(block, "prop:title");
  if let Some(title) = &database_title {
    texts.push(title.clone());
  }

  if let Some(columns) = block.get("prop:columns").and_then(|value| value.to_array()) {
    for column_value in columns.iter() {
      if let Some(column) = column_value.to_map() {
        if let Some(name) = get_string(&column, "name") {
          texts.push(name);
        }
        if let Some(data) = column.get("data").and_then(|value| value.to_map()) {
          if let Some(options) = data.get("options").and_then(|value| value.to_array()) {
            for option_value in options.iter() {
              if let Some(option) = option_value.to_map() {
                if let Some(value) = get_string(&option, "value") {
                  texts.push(value);
                }
              }
            }
          }
        }
      }
    }
  }

  (texts, database_title)
}

fn gather_table_contents(block: &Map) -> Vec<String> {
  let mut contents = Vec::new();
  for key in block.keys() {
    if key.starts_with("prop:cells.") && key.ends_with(".text") {
      if let Some(value) = block.get(key).and_then(|value| value_to_string(&value)) {
        if !value.is_empty() {
          contents.push(value);
        }
      }
    }
  }
  contents
}

fn format_cell_value(value: &Any, col_type: &str, col_data: Option<&Map>) -> String {
  match col_type {
    "select" => {
      if let Any::String(id) = value {
        if let Some(options) = col_data
          .and_then(|d| d.get("options"))
          .and_then(|v| v.to_array())
        {
          for opt in options.iter() {
            if let Some(opt_map) = opt.to_map() {
              if let Some(opt_id) = get_string(&opt_map, "id") {
                if opt_id == *id {
                  return get_string(&opt_map, "value").unwrap_or_default();
                }
              }
            }
          }
        }
      }
      String::new()
    }
    "multi-select" => {
      if let Any::Array(ids) = value {
        let mut selected = Vec::new();
        if let Some(options) = col_data
          .and_then(|d| d.get("options"))
          .and_then(|v| v.to_array())
        {
          for id_val in ids.iter() {
            if let Any::String(id) = id_val {
              for opt in options.iter() {
                if let Some(opt_map) = opt.to_map() {
                  if let Some(opt_id) = get_string(&opt_map, "id") {
                    if opt_id == *id {
                      selected.push(get_string(&opt_map, "value").unwrap_or_default());
                    }
                  }
                }
              }
            }
          }
        }
        return selected.join(", ");
      }
      String::new()
    }
    _ => any_to_string(value).unwrap_or_default(),
  }
}

fn value_to_string(value: &Value) -> Option<String> {
  if let Some(text) = value.to_text() {
    return Some(text.to_string());
  }

  if let Some(any) = value.to_any() {
    return any_to_string(&any);
  }

  None
}

fn any_to_string(any: &Any) -> Option<String> {
  match any {
    Any::String(value) => Some(value.to_string()),
    Any::Integer(value) => Some(value.to_string()),
    Any::Float32(value) => Some(value.0.to_string()),
    Any::Float64(value) => Some(value.0.to_string()),
    Any::BigInt64(value) => Some(value.to_string()),
    Any::True => Some("true".into()),
    Any::False => Some("false".into()),
    Any::Null | Any::Undefined => None,
    Any::Array(_) | Any::Object(_) | Any::Binary(_) => serde_json::to_string(any).ok(),
  }
}

fn append_summary(summary: &mut String, remaining: &mut isize, text_len: usize, text: &str) {
  if *remaining > 0 {
    summary.push_str(text);
    *remaining -= text_len as isize;
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_parse_doc_from_binary() {
    let json = include_bytes!("../fixtures/demo.ydoc.json");
    let doc_bin = include_bytes!("../fixtures/demo.ydoc").to_vec();
    let doc_id = "dYpV7PPhk8amRkY5IAcVO".to_string();

    let result = parse_doc_from_binary(doc_bin, doc_id).unwrap();
    let config = assert_json_diff::Config::new(assert_json_diff::CompareMode::Strict)
      .numeric_mode(assert_json_diff::NumericMode::AssumeFloat);
    assert_json_diff::assert_json_matches!(
      serde_json::from_slice::<serde_json::Value>(json).unwrap(),
      serde_json::json!(result),
      config
    );
  }
}
