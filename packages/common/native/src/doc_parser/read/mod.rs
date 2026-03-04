mod database;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use y_octo::{Any, Map};

use self::database::{
  build_database_table, collect_database_cell_references, database_summary_text, database_table_markdown,
  gather_database_texts,
};
use super::{
  ParseError,
  block_spec::{BlockFlavour, BlockSpec, ImageSpec},
  blocksuite::{DocContext, get_block_id, get_flavour, get_list_depth, get_string, nearest_by_flavour},
  doc_loader::load_doc,
  markdown::{DeltaToMdOptions, MarkdownRenderer, MarkdownWriter, extract_inline_references},
  schema::{NOTE_FLAVOUR, PAGE_FLAVOUR},
  value::{any_as_string, any_truthy, build_reference_payload, params_value_to_json, value_to_string},
};

const SUMMARY_LIMIT: usize = 1000;
const DEFAULT_PAGE_TITLE: &str = "Untitled";

const BOOKMARK_FLAVOURS: [&str; 6] = [
  "affine:bookmark",
  "affine:embed-youtube",
  "affine:embed-iframe",
  "affine:embed-figma",
  "affine:embed-github",
  "affine:embed-loom",
];

struct SummaryBuilder {
  summary: String,
  remaining: Option<isize>,
}

impl SummaryBuilder {
  fn new(limit: isize) -> Self {
    let remaining = if limit < 0 { None } else { Some(limit) };
    Self {
      summary: String::new(),
      remaining,
    }
  }

  fn is_unlimited(&self) -> bool {
    self.remaining.is_none()
  }

  fn push_text(&mut self, text: &str, len: usize) {
    match self.remaining {
      None => self.summary.push_str(text),
      Some(remaining) if remaining > 0 => {
        self.summary.push_str(text);
        self.remaining = Some(remaining - len as isize);
      }
      _ => {}
    }
  }

  fn push_raw(&mut self, text: &str) {
    self.summary.push_str(text);
  }

  fn into_string(self) -> String {
    self.summary
  }
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageDocContent {
  pub title: String,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceDocContent {
  pub name: String,
  #[serde(rename = "avatarKey")]
  pub avatar_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkdownResult {
  pub title: String,
  pub markdown: String,
}

pub fn parse_workspace_doc(doc_bin: Vec<u8>) -> Result<Option<WorkspaceDocContent>, ParseError> {
  let doc = load_doc(&doc_bin, None)?;

  let meta = match doc.get_map("meta") {
    Ok(meta) => meta,
    Err(_) => return Ok(None),
  };

  let name = get_string(&meta, "name").unwrap_or_default();
  let avatar_key = get_string(&meta, "avatar").unwrap_or_default();

  Ok(Some(WorkspaceDocContent { name, avatar_key }))
}

pub fn parse_page_doc(
  doc_bin: Vec<u8>,
  max_summary_length: Option<isize>,
) -> Result<Option<PageDocContent>, ParseError> {
  let doc = load_doc(&doc_bin, None)?;

  let blocks_map = match doc.get_map("blocks") {
    Ok(map) => map,
    Err(_) => return Ok(None),
  };

  if blocks_map.is_empty() {
    return Ok(None);
  }

  let Some(context) = DocContext::from_blocks_map(&blocks_map, PAGE_FLAVOUR) else {
    return Ok(None);
  };

  let mut walker = context.walker();
  let mut content = PageDocContent {
    title: context
      .block_pool
      .get(&context.root_block_id)
      .and_then(|block| get_string(block, "prop:title"))
      .unwrap_or_default(),
    summary: String::new(),
  };
  let mut summary = SummaryBuilder::new(max_summary_length.unwrap_or(150));

  while let Some((_parent_block_id, block_id)) = walker.next() {
    let Some(block) = context.block_pool.get(&block_id) else {
      continue;
    };

    let Some(flavour) = get_flavour(block) else {
      continue;
    };

    match flavour.as_str() {
      "affine:page" | "affine:note" => {
        walker.enqueue_children(&block_id, block);
      }
      "affine:attachment" | "affine:transcription" | "affine:callout" => {
        if summary.is_unlimited() {
          walker.enqueue_children(&block_id, block);
        }
      }
      "affine:database" => {
        if summary.is_unlimited()
          && let Some(text) = database_summary_text(block, &context)
        {
          summary.push_raw(&text);
        }
      }
      "affine:table" => {
        if summary.is_unlimited() {
          let contents = table_cell_texts(block);
          if !contents.is_empty() {
            summary.push_raw(&contents.join("|"));
          }
        }
      }
      "affine:paragraph" | "affine:list" | "affine:code" => {
        walker.enqueue_children(&block_id, block);
        if let Some((text, len)) = text_content_for_summary(block, "prop:text") {
          summary.push_text(&text, len);
        }
      }
      _ => {}
    }
  }

  content.summary = summary.into_string();
  Ok(Some(content))
}

pub fn parse_doc_to_markdown(
  doc_bin: Vec<u8>,
  doc_id: String,
  ai_editable: bool,
  doc_url_prefix: Option<String>,
) -> Result<MarkdownResult, ParseError> {
  let doc = load_doc(&doc_bin, Some(doc_id.as_str()))?;

  let blocks_map = doc.get_map("blocks")?;
  if blocks_map.is_empty() {
    return Ok(MarkdownResult {
      title: "".into(),
      markdown: "".into(),
    });
  }

  let context = DocContext::from_blocks_map(&blocks_map, PAGE_FLAVOUR)
    .ok_or_else(|| ParseError::ParserError("root block not found".into()))?;
  let root_block_id = context.root_block_id.clone();
  let mut walker = context.walker();
  let mut doc_title = String::from(DEFAULT_PAGE_TITLE);
  let mut markdown = String::new();
  let md_options = DeltaToMdOptions::new(doc_url_prefix);
  let renderer = MarkdownRenderer::new(&md_options);

  while let Some((_parent_block_id, block_id)) = walker.next() {
    let block = match context.block_pool.get(&block_id) {
      Some(block) => block,
      None => continue,
    };

    let flavour = match get_flavour(block) {
      Some(flavour) => flavour,
      None => continue,
    };

    let parent_id = context.parent_lookup.get(&block_id);
    let parent_flavour = parent_id
      .and_then(|id| context.block_pool.get(id))
      .and_then(get_flavour);

    if parent_flavour.as_deref() == Some("affine:database") {
      continue;
    }

    // enqueue children first to keep traversal order similar to JS implementation
    walker.enqueue_children(&block_id, block);

    if flavour == PAGE_FLAVOUR {
      let title = get_string(block, "prop:title").unwrap_or_default();
      doc_title = title.clone();
      continue;
    }

    let block_level = if ai_editable {
      block_level(&block_id, &root_block_id, &context.parent_lookup)
    } else {
      0
    };
    let ai_block = ai_editable && block_level == 2;

    let mut block_markdown = String::new();

    match flavour.as_str() {
      "affine:database" => {
        let title = get_string(block, "prop:title").unwrap_or_default();
        block_markdown.push_str(&format!("\n### {title}\n"));

        if let Some(table) = build_database_table(block, &context, &md_options)
          && let Some(table_md) = database_table_markdown(table)
        {
          let mut writer = MarkdownWriter::new(&mut block_markdown);
          writer.push_table(&table_md);
        }
      }
      "affine:note" | "affine:surface" | "affine:frame" => {}
      _ => {
        if let Some(block_flavour) = BlockFlavour::from_str(flavour.as_str()) {
          let spec = BlockSpec::from_block_map_with_flavour(block, block_flavour);
          let list_depth = if block_flavour == BlockFlavour::List {
            get_list_depth(&block_id, &context.parent_lookup, &context.block_pool)
          } else {
            0
          };
          renderer.write_block(&mut block_markdown, &spec, list_depth);
        } else {
          return Err(ParseError::ParserError(format!("unsupported_block_flavour:{flavour}")));
        }
      }
    }

    if ai_block {
      markdown.push_str(&format!("<!-- block_id={block_id} flavour={flavour} -->\n"));
    }
    markdown.push_str(&block_markdown);
  }

  Ok(MarkdownResult {
    title: doc_title,
    markdown,
  })
}

pub fn parse_doc_from_binary(doc_bin: Vec<u8>, doc_id: String) -> Result<CrawlResult, ParseError> {
  let doc = load_doc(&doc_bin, Some(doc_id.as_str()))?;

  let blocks_map = doc.get_map("blocks")?;
  if blocks_map.is_empty() {
    return Err(ParseError::ParserError("blocks map is empty".into()));
  }

  let context = DocContext::from_blocks_map(&blocks_map, PAGE_FLAVOUR)
    .ok_or_else(|| ParseError::ParserError("root block not found".into()))?;
  let mut walker = context.walker();
  let mut blocks: Vec<BlockInfo> = Vec::with_capacity(context.block_pool.len());
  let mut doc_title = String::new();
  let mut summary = SummaryBuilder::new(SUMMARY_LIMIT as isize);

  while let Some((parent_block_id, block_id)) = walker.next() {
    let block = match context.block_pool.get(&block_id) {
      Some(block) => block,
      None => continue,
    };

    let flavour = match get_flavour(block) {
      Some(flavour) => flavour,
      None => continue,
    };

    let parent_block = parent_block_id.as_ref().and_then(|id| context.block_pool.get(id));
    let parent_flavour = parent_block.and_then(get_flavour);

    let note_block = nearest_by_flavour(&block_id, NOTE_FLAVOUR, &context.parent_lookup, &context.block_pool);
    let note_block_id = note_block.as_ref().and_then(get_block_id);
    let display_mode = determine_display_mode(note_block.as_ref());

    // enqueue children first to keep traversal order similar to JS implementation
    walker.enqueue_children(&block_id, block);

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

    if matches!(flavour.as_str(), "affine:paragraph" | "affine:list" | "affine:code") {
      if let Some(text) = block.get("prop:text").and_then(|value| value.to_text()) {
        let database_name = if flavour == "affine:paragraph" && parent_flavour.as_deref() == Some("affine:database") {
          parent_block.and_then(|map| get_string(map, "prop:title"))
        } else {
          None
        };

        let content = text.to_string();
        let text_len = text.len() as usize;
        let refs = extract_inline_references(&text.to_delta());

        let mut info = build_block(database_name.as_ref());
        info.content = Some(vec![content.clone()]);
        if !refs.is_empty() {
          info.ref_doc_id = Some(refs.iter().map(|r| r.doc_id.clone()).collect());
          info.ref_info = Some(refs.into_iter().map(|r| r.payload).collect());
        }
        blocks.push(info);
        summary.push_text(&content, text_len);
      }
      continue;
    }

    if matches!(flavour.as_str(), "affine:embed-linked-doc" | "affine:embed-synced-doc") {
      if let Some(page_id) = get_string(block, "prop:pageId") {
        let mut info = build_block(None);
        let payload = embed_ref_payload(block, &page_id);
        apply_doc_ref(&mut info, page_id, payload);
        blocks.push(info);
      }
      continue;
    }

    if flavour == "affine:attachment" {
      if let Some(blob_id) = get_string(block, "prop:sourceId") {
        let mut info = build_block(None);
        let name = get_string(block, "prop:name").unwrap_or_default();
        apply_blob_info(&mut info, blob_id, name);
        blocks.push(info);
      }
      continue;
    }

    if flavour == "affine:image" {
      let image = ImageSpec::from_block_map(block);
      if !image.source_id.is_empty() {
        let mut info = build_block(None);
        let caption = image.caption.unwrap_or_default();
        apply_blob_info(&mut info, image.source_id, caption);
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
        compose_additional(&display_mode, note_block_id.as_ref(), database_name.as_ref()),
      );
      info.content = Some(texts);
      let refs = collect_database_cell_references(block);
      if !refs.is_empty() {
        info.ref_doc_id = Some(refs.iter().map(|r| r.doc_id.clone()).collect());
        info.ref_info = Some(refs.into_iter().map(|r| r.payload).collect());
      }
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
      let contents = table_cell_texts(block);
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
    doc_title = DEFAULT_PAGE_TITLE.into();
  }

  Ok(CrawlResult {
    blocks,
    title: doc_title,
    summary: summary.into_string(),
  })
}

pub fn get_doc_ids_from_binary(doc_bin: Vec<u8>, include_trash: bool) -> Result<Vec<String>, ParseError> {
  let doc = load_doc(&doc_bin, None)?;

  let mut doc_ids = Vec::new();
  let meta = doc.get_map("meta")?;
  let pages_value = meta.get("pages");
  if let Some(pages) = pages_value.as_ref().and_then(|value| value.to_array()) {
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
    return Ok(doc_ids);
  }

  if let Some(Any::Array(entries)) = pages_value.and_then(|value| value.to_any()) {
    for entry in entries {
      let Any::Object(map) = entry else {
        continue;
      };
      let id = map.get("id").and_then(any_as_string).map(str::to_string);
      if let Some(id) = id {
        let trash = map.get("trash").map(any_truthy).unwrap_or(false);
        if include_trash || !trash {
          doc_ids.push(id);
        }
      }
    }
  }

  Ok(doc_ids)
}

fn block_level(block_id: &str, root_id: &str, parent_lookup: &HashMap<String, String>) -> usize {
  let mut level = 0;
  let mut cursor = block_id;
  while let Some(parent) = parent_lookup.get(cursor) {
    level += 1;
    if parent == root_id {
      break;
    }
    cursor = parent;
  }
  level
}

pub(super) fn text_content(block: &Map, key: &str) -> Option<(String, usize)> {
  block.get(key).and_then(|value| {
    value.to_text().map(|text| {
      let content = text.to_string();
      let len = text.len() as usize;
      (content, len)
    })
  })
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
  payload.insert("displayMode".into(), JsonValue::String(display_mode.to_string()));
  if let Some(note_id) = note_block_id {
    payload.insert("noteBlockId".into(), JsonValue::String(note_id.clone()));
  }
  if let Some(name) = database_name {
    payload.insert("databaseName".into(), JsonValue::String(name.clone()));
  }
  Some(JsonValue::Object(payload).to_string())
}

fn apply_blob_info(info: &mut BlockInfo, blob_id: String, content: String) {
  info.blob = Some(vec![blob_id]);
  info.content = Some(vec![content]);
}

fn apply_doc_ref(info: &mut BlockInfo, page_id: String, payload: Option<String>) {
  info.ref_doc_id = Some(vec![page_id]);
  if let Some(payload) = payload {
    info.ref_info = Some(vec![payload]);
  }
}

fn embed_ref_payload(block: &Map, page_id: &str) -> Option<String> {
  let params = block.get("prop:params").as_ref().and_then(params_value_to_json);
  Some(build_reference_payload(page_id, params))
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
      if let Some(element) = value.to_map()
        && let Some(text) = element.get("text").and_then(|value| value.to_text())
      {
        texts.push(text.to_string());
      }
    }
  }

  texts.sort();
  texts
}

fn table_cell_texts(block: &Map) -> Vec<String> {
  let mut contents = Vec::new();
  for key in block.keys() {
    if key.starts_with("prop:cells.")
      && key.ends_with(".text")
      && let Some(value) = block.get(key).and_then(|value| value_to_string(&value))
      && !value.is_empty()
    {
      contents.push(value);
    }
  }
  contents
}

pub(super) fn text_content_for_summary(block: &Map, key: &str) -> Option<(String, usize)> {
  if let Some((text, len)) = text_content(block, key) {
    return Some((text, len));
  }

  block.get(key).and_then(|value| {
    value_to_string(&value).map(|text| {
      let len = text.chars().count();
      (text, len)
    })
  })
}

#[cfg(test)]
mod tests {
  use serde_json::json;
  use y_octo::{AHashMap, Any, DocOptions, TextAttributes, TextDeltaOp, TextInsert, Value};

  use super::*;
  use crate::doc_parser::build_full_doc;

  #[test]
  fn test_parse_doc_from_binary() {
    let json = include_bytes!("../../../fixtures/demo.ydoc.json");
    let doc_bin = include_bytes!("../../../fixtures/demo.ydoc").to_vec();
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

  #[test]
  fn test_database_cell_references() {
    let doc_id = "doc-with-db".to_string();
    let doc = DocOptions::new().with_guid(doc_id.clone()).build();
    let mut blocks = doc.get_or_create_map("blocks").unwrap();

    let mut page = doc.create_map().unwrap();
    page.insert("sys:id".into(), "page").unwrap();
    page.insert("sys:flavour".into(), "affine:page").unwrap();
    let mut page_children = doc.create_array().unwrap();
    page_children.push("note").unwrap();
    page.insert("sys:children".into(), Value::Array(page_children)).unwrap();
    let mut page_title = doc.create_text().unwrap();
    page_title.insert(0, "Page").unwrap();
    page.insert("prop:title".into(), Value::Text(page_title)).unwrap();
    blocks.insert("page".into(), Value::Map(page)).unwrap();

    let mut note = doc.create_map().unwrap();
    note.insert("sys:id".into(), "note").unwrap();
    note.insert("sys:flavour".into(), "affine:note").unwrap();
    let mut note_children = doc.create_array().unwrap();
    note_children.push("db").unwrap();
    note.insert("sys:children".into(), Value::Array(note_children)).unwrap();
    note.insert("prop:displayMode".into(), "page").unwrap();
    blocks.insert("note".into(), Value::Map(note)).unwrap();

    let mut db = doc.create_map().unwrap();
    db.insert("sys:id".into(), "db").unwrap();
    db.insert("sys:flavour".into(), "affine:database").unwrap();
    db.insert("sys:children".into(), Value::Array(doc.create_array().unwrap()))
      .unwrap();
    let mut db_title = doc.create_text().unwrap();
    db_title.insert(0, "Database").unwrap();
    db.insert("prop:title".into(), Value::Text(db_title)).unwrap();

    let mut columns = doc.create_array().unwrap();
    let mut column = doc.create_map().unwrap();
    column.insert("id".into(), "col1").unwrap();
    column.insert("name".into(), "Text").unwrap();
    column.insert("type".into(), "rich-text").unwrap();
    column
      .insert("data".into(), Value::Map(doc.create_map().unwrap()))
      .unwrap();
    columns.push(Value::Map(column)).unwrap();
    db.insert("prop:columns".into(), Value::Array(columns)).unwrap();

    let mut cell_text = doc.create_text().unwrap();
    let mut reference = AHashMap::default();
    reference.insert("pageId".into(), Any::String("target-doc".into()));
    let mut params = AHashMap::default();
    params.insert("mode".into(), Any::String("page".into()));
    reference.insert("params".into(), Any::Object(params));
    let mut attrs = TextAttributes::new();
    attrs.insert("reference".into(), Any::Object(reference));
    cell_text
      .apply_delta(&[
        TextDeltaOp::Insert {
          insert: TextInsert::Text("See ".into()),
          format: None,
        },
        TextDeltaOp::Insert {
          insert: TextInsert::Text("Target".into()),
          format: Some(attrs),
        },
      ])
      .unwrap();

    let mut cell = doc.create_map().unwrap();
    cell.insert("columnId".into(), "col1").unwrap();
    cell.insert("value".into(), Value::Text(cell_text)).unwrap();
    let mut row = doc.create_map().unwrap();
    row.insert("col1".into(), Value::Map(cell)).unwrap();
    let mut cells = doc.create_map().unwrap();
    cells.insert("row1".into(), Value::Map(row)).unwrap();
    db.insert("prop:cells".into(), Value::Map(cells)).unwrap();

    blocks.insert("db".into(), Value::Map(db)).unwrap();

    let doc_bin = doc.encode_update_v1().unwrap();
    let result = parse_doc_from_binary(doc_bin, doc_id).unwrap();
    let db_block = result.blocks.iter().find(|block| block.block_id == "db").unwrap();
    assert_eq!(db_block.ref_doc_id, Some(vec!["target-doc".to_string()]));
    assert_eq!(
      db_block.ref_info,
      Some(vec![build_reference_payload(
        "target-doc",
        Some(json!({"mode": "page"}))
      )])
    );
  }

  #[test]
  fn test_parse_doc_to_markdown_ai_editable_image_table() {
    let doc_id = "ai-editable-doc";
    let markdown = "![Alt](blob://image-id)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    let doc_bin = build_full_doc("Title", markdown, doc_id).expect("create doc");

    let result = parse_doc_to_markdown(doc_bin, doc_id.to_string(), true, None).expect("parse doc");
    let md = result.markdown;

    assert!(md.contains("flavour=affine:image"));
    assert!(md.contains("blob://image-id"));
    assert!(md.contains("|A|B|"));
    assert!(md.contains("|---|---|"));
  }
}
