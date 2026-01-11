use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use thiserror::Error;
use y_octo::{Any, DocOptions, JwstCodecError, Map, Value};

use super::{
  blocksuite::{
    DocContext, collect_child_ids, get_block_id, get_flavour, get_list_depth, get_string, nearest_by_flavour,
  },
  delta_markdown::{
    DeltaToMdOptions, delta_value_to_inline_markdown, extract_inline_references, text_to_inline_markdown,
    text_to_markdown,
  },
  value::{any_as_string, any_truthy, build_reference_payload, params_value_to_json, value_to_string},
};

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

pub fn parse_workspace_doc(doc_bin: Vec<u8>) -> Result<Option<WorkspaceDocContent>, ParseError> {
  if doc_bin.is_empty() || doc_bin == [0, 0] {
    return Err(ParseError::InvalidBinary);
  }

  let mut doc = DocOptions::new().build();
  doc
    .apply_update_from_binary_v1(&doc_bin)
    .map_err(|_| ParseError::InvalidBinary)?;

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
  if doc_bin.is_empty() || doc_bin == [0, 0] {
    return Err(ParseError::InvalidBinary);
  }

  let mut doc = DocOptions::new().build();
  doc
    .apply_update_from_binary_v1(&doc_bin)
    .map_err(|_| ParseError::InvalidBinary)?;

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

  let mut stack = vec![context.root_block_id.clone()];
  let mut content = PageDocContent {
    title: context
      .block_pool
      .get(&context.root_block_id)
      .and_then(|block| get_string(block, "prop:title"))
      .unwrap_or_default(),
    summary: String::new(),
  };

  let mut summary_remaining = max_summary_length.unwrap_or(150);

  while let Some(block_id) = stack.pop() {
    let Some(block) = context.block_pool.get(&block_id) else {
      break;
    };

    let Some(flavour) = get_flavour(block) else {
      continue;
    };

    match flavour.as_str() {
      "affine:page" | "affine:note" => {
        push_children(&mut stack, block);
      }
      "affine:attachment" | "affine:transcription" | "affine:callout" => {
        if summary_remaining == -1 {
          push_children(&mut stack, block);
        }
      }
      "affine:database" => {
        if summary_remaining == -1 {
          append_database_summary(&mut content.summary, block, &context);
        }
      }
      "affine:table" => {
        if summary_remaining == -1 {
          let contents = gather_table_contents(block);
          if !contents.is_empty() {
            content.summary.push_str(&contents.join("|"));
          }
        }
      }
      "affine:paragraph" | "affine:list" | "affine:code" => {
        push_children(&mut stack, block);
        if let Some((text, len)) = text_content_for_summary(block, "prop:text") {
          if summary_remaining == -1 {
            content.summary.push_str(&text);
          } else if summary_remaining > 0 {
            content.summary.push_str(&text);
            summary_remaining -= len as isize;
          }
        }
      }
      _ => {}
    }
  }

  Ok(Some(content))
}

pub fn parse_doc_to_markdown(
  doc_bin: Vec<u8>,
  doc_id: String,
  ai_editable: bool,
  doc_url_prefix: Option<String>,
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

  let context = DocContext::from_blocks_map(&blocks_map, PAGE_FLAVOUR)
    .ok_or_else(|| ParseError::ParserError("root block not found".into()))?;
  let root_block_id = context.root_block_id.clone();
  let mut walker = context.walker();
  let mut doc_title = String::from("Untitled");
  let mut markdown = String::new();
  let md_options = DeltaToMdOptions::new(doc_url_prefix);

  while let Some((parent_block_id, block_id)) = walker.next() {
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

    if flavour == "affine:database" {
      let title = get_string(block, "prop:title").unwrap_or_default();
      markdown.push_str(&format!("\n### {title}\n"));

      if let Some(table) = build_database_table(block, &context, &md_options) {
        let escape_table = |s: &str| s.replace('|', "\\|").replace('\n', "<br>");
        let mut table_md = String::new();

        table_md.push('|');
        for column in &table.columns {
          table_md.push_str(&escape_table(column.name.as_deref().unwrap_or_default()));
          table_md.push('|');
        }
        table_md.push('\n');

        table_md.push('|');
        for _ in &table.columns {
          table_md.push_str("---|");
        }
        table_md.push('\n');

        for row in table.rows.into_iter() {
          table_md.push('|');
          for cell_text in row.into_iter() {
            table_md.push_str(&escape_table(&cell_text));
            table_md.push('|');
          }
          table_md.push('\n');
        }
        append_table_block(&mut markdown, &table_md);
      }
      continue;
    }

    if flavour == "affine:table" {
      let contents = gather_table_contents(block);
      let table = contents.join("|");
      append_table_block(&mut markdown, &table);
      continue;
    }

    if ai_editable && parent_block_id.as_ref() == Some(&root_block_id) {
      markdown.push_str(&format!("<!-- block_id={block_id} flavour={flavour} -->\n"));
    }

    if flavour == "affine:paragraph" {
      let type_ = get_string(block, "prop:type").unwrap_or_default();
      let prefix = paragraph_prefix(type_.as_str());
      if let Some(text_md) = text_to_markdown(block, "prop:text", &md_options) {
        append_paragraph(&mut markdown, prefix, &text_md);
      } else if let Some((text, _)) = text_content(block, "prop:text") {
        append_paragraph(&mut markdown, prefix, &text);
      }
      continue;
    }

    if flavour == "affine:list" {
      let type_ = get_string(block, "prop:type").unwrap_or_default();
      let checked = block
        .get("prop:checked")
        .and_then(|value| value.to_any())
        .as_ref()
        .map(any_truthy)
        .unwrap_or(false);
      let prefix = list_prefix(type_.as_str(), checked);
      let depth = get_list_depth(&block_id, &context.parent_lookup, &context.block_pool);
      let indent = list_indent(depth);
      if let Some(text_md) = text_to_markdown(block, "prop:text", &md_options) {
        append_list_item(&mut markdown, &indent, prefix, &text_md);
      } else if let Some((text, _)) = text_content(block, "prop:text") {
        append_list_item(&mut markdown, &indent, prefix, &text);
      }
      continue;
    }

    if flavour == "affine:code" {
      if let Some((text, _)) = text_content(block, "prop:text") {
        let lang = get_string(block, "prop:language").unwrap_or_default();
        append_code_block(&mut markdown, &lang, &text);
      }
      continue;
    }
  }

  Ok(MarkdownResult {
    title: doc_title,
    markdown,
  })
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

  let context = DocContext::from_blocks_map(&blocks_map, PAGE_FLAVOUR)
    .ok_or_else(|| ParseError::ParserError("root block not found".into()))?;
  let mut walker = context.walker();
  let mut blocks: Vec<BlockInfo> = Vec::with_capacity(context.block_pool.len());
  let mut doc_title = String::new();
  let mut summary = String::new();
  let mut summary_remaining = SUMMARY_LIMIT as isize;

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
        append_summary(&mut summary, &mut summary_remaining, text_len, &content);
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
      if let Some(blob_id) = get_string(block, "prop:sourceId") {
        let mut info = build_block(None);
        let caption = get_string(block, "prop:caption").unwrap_or_default();
        apply_blob_info(&mut info, blob_id, caption);
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

pub fn get_doc_ids_from_binary(doc_bin: Vec<u8>, include_trash: bool) -> Result<Vec<String>, ParseError> {
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

fn paragraph_prefix(type_: &str) -> &'static str {
  match type_ {
    "h1" => "# ",
    "h2" => "## ",
    "h3" => "### ",
    "h4" => "#### ",
    "h5" => "##### ",
    "h6" => "###### ",
    "quote" => "> ",
    _ => "",
  }
}

fn list_prefix(type_: &str, checked: bool) -> &'static str {
  match type_ {
    "bulleted" => "* ",
    "todo" => {
      if checked {
        "- [x] "
      } else {
        "- [ ] "
      }
    }
    _ => "1. ",
  }
}

fn list_indent(depth: usize) -> String {
  "    ".repeat(depth)
}

fn append_paragraph(markdown: &mut String, prefix: &str, text: &str) {
  markdown.push_str(prefix);
  markdown.push_str(text);
  if !text.ends_with('\n') {
    markdown.push('\n');
  }
  markdown.push('\n');
}

fn append_list_item(markdown: &mut String, indent: &str, prefix: &str, text: &str) {
  markdown.push_str(indent);
  markdown.push_str(prefix);
  markdown.push_str(text);
  if !text.ends_with('\n') {
    markdown.push('\n');
  }
}

fn append_code_block(markdown: &mut String, lang: &str, text: &str) {
  markdown.push_str("```");
  markdown.push_str(lang);
  markdown.push('\n');
  markdown.push_str(text);
  markdown.push_str("\n```\n\n");
}

fn append_table_block(markdown: &mut String, table: &str) {
  if table.is_empty() {
    markdown.push('\n');
    return;
  }
  markdown.push_str(table);
  if !table.ends_with('\n') {
    markdown.push('\n');
  }
  markdown.push('\n');
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

fn gather_database_texts(block: &Map) -> (Vec<String>, Option<String>) {
  let mut texts = Vec::new();
  let database_title = get_string(block, "prop:title");
  if let Some(title) = &database_title {
    texts.push(title.clone());
  }

  if let Some(columns) = parse_database_columns(block) {
    for column in columns.iter() {
      if let Some(name) = column.name.as_ref() {
        texts.push(name.clone());
      }
      for option in column.options.iter() {
        if let Some(value) = option.value.as_ref() {
          texts.push(value.clone());
        }
      }
    }
  }

  (texts, database_title)
}

fn gather_table_contents(block: &Map) -> Vec<String> {
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

struct DatabaseTable {
  columns: Vec<DatabaseColumn>,
  rows: Vec<Vec<String>>,
}

fn build_database_table(block: &Map, context: &DocContext, md_options: &DeltaToMdOptions) -> Option<DatabaseTable> {
  let columns = parse_database_columns(block)?;
  let cells_map = block.get("prop:cells").and_then(|v| v.to_map())?;
  let child_ids = collect_child_ids(block);

  let mut rows = Vec::new();
  for child_id in child_ids {
    let row_cells = cells_map.get(&child_id).and_then(|v| v.to_map());
    let mut row = Vec::new();

    for column in columns.iter() {
      let mut cell_text = String::new();
      if column.col_type == "title" {
        if let Some(child_block) = context.block_pool.get(&child_id) {
          if let Some(text_md) = text_to_inline_markdown(child_block, "prop:text", md_options) {
            cell_text = text_md;
          } else if let Some((text, _)) = text_content(child_block, "prop:text") {
            cell_text = text;
          } else if let Some((text, _)) = text_content_for_summary(child_block, "prop:text") {
            cell_text = text;
          }
        }
      } else if let Some(row_cells) = &row_cells
        && let Some(cell_val) = row_cells.get(&column.id).and_then(|v| v.to_map())
        && let Some(value) = cell_val.get("value")
      {
        if let Some(text_md) = delta_value_to_inline_markdown(&value, md_options) {
          cell_text = text_md;
        } else {
          cell_text = format_cell_value(&value, column);
        }
      }

      row.push(cell_text);
    }
    rows.push(row);
  }

  Some(DatabaseTable { columns, rows })
}

fn append_database_summary(summary: &mut String, block: &Map, context: &DocContext) {
  let md_options = DeltaToMdOptions::new(None);
  let Some(table) = build_database_table(block, context, &md_options) else {
    return;
  };

  if let Some(title) = get_string(block, "prop:title")
    && !title.is_empty()
  {
    summary.push_str(&title);
    summary.push('|');
  }

  for column in table.columns.iter() {
    if let Some(name) = column.name.as_ref()
      && !name.is_empty()
    {
      summary.push_str(name);
      summary.push('|');
    }
    for option in column.options.iter() {
      if let Some(value) = option.value.as_ref()
        && !value.is_empty()
      {
        summary.push_str(value);
        summary.push('|');
      }
    }
  }

  for row in table.rows.iter() {
    for cell_text in row.iter() {
      if !cell_text.is_empty() {
        summary.push_str(cell_text);
        summary.push('|');
      }
    }
  }
}

fn push_children(queue: &mut Vec<String>, block: &Map) {
  let mut child_ids = collect_child_ids(block);
  for child_id in child_ids.drain(..).rev() {
    queue.push(child_id);
  }
}

fn text_content_for_summary(block: &Map, key: &str) -> Option<(String, usize)> {
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

struct DatabaseOption {
  id: Option<String>,
  value: Option<String>,
  color: Option<String>,
}

struct DatabaseColumn {
  id: String,
  name: Option<String>,
  col_type: String,
  options: Vec<DatabaseOption>,
}

fn parse_database_columns(block: &Map) -> Option<Vec<DatabaseColumn>> {
  let columns = block.get("prop:columns").and_then(|value| value.to_array())?;
  let mut parsed = Vec::new();
  for column_value in columns.iter() {
    if let Some(column) = column_value.to_map() {
      let id = get_string(&column, "id").unwrap_or_default();
      let name = get_string(&column, "name");
      let col_type = get_string(&column, "type").unwrap_or_default();
      let options = parse_database_options(&column);
      parsed.push(DatabaseColumn {
        id,
        name,
        col_type,
        options,
      });
    }
  }
  Some(parsed)
}

fn parse_database_options(column: &Map) -> Vec<DatabaseOption> {
  let Some(data) = column.get("data").and_then(|value| value.to_map()) else {
    return Vec::new();
  };
  let Some(options) = data.get("options").and_then(|value| value.to_array()) else {
    return Vec::new();
  };

  let mut parsed = Vec::new();
  for option_value in options.iter() {
    if let Some(option) = option_value.to_map() {
      parsed.push(DatabaseOption {
        id: get_string(&option, "id"),
        value: get_string(&option, "value"),
        color: get_string(&option, "color"),
      });
    }
  }
  parsed
}

fn format_option_tag(option: &DatabaseOption) -> String {
  let id = option.id.as_deref().unwrap_or_default();
  let value = option.value.as_deref().unwrap_or_default();
  let color = option.color.as_deref().unwrap_or_default();

  format!("<span data-affine-option data-value=\"{id}\" data-option-color=\"{color}\">{value}</span>")
}

fn format_cell_value(value: &Value, column: &DatabaseColumn) -> String {
  match column.col_type.as_str() {
    "select" => {
      let id = match value {
        Value::Any(any) => any_as_string(any).map(str::to_string),
        Value::Text(text) => Some(text.to_string()),
        _ => None,
      };
      if let Some(id) = id {
        for option in column.options.iter() {
          if option.id.as_deref() == Some(id.as_str()) {
            return format_option_tag(option);
          }
        }
      }
      String::new()
    }
    "multi-select" => {
      let ids: Vec<String> = match value {
        Value::Any(Any::Array(ids)) => ids.iter().filter_map(any_as_string).map(str::to_string).collect(),
        Value::Array(array) => array.iter().filter_map(|id_val| value_to_string(&id_val)).collect(),
        _ => Vec::new(),
      };

      if ids.is_empty() {
        return String::new();
      }

      let mut selected = Vec::new();
      for id in ids.iter() {
        for option in column.options.iter() {
          if option.id.as_deref() == Some(id.as_str()) {
            selected.push(format_option_tag(option));
          }
        }
      }
      selected.join("")
    }
    _ => value_to_string(value).unwrap_or_default(),
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
    let json = include_bytes!("../../fixtures/demo.ydoc.json");
    let doc_bin = include_bytes!("../../fixtures/demo.ydoc").to_vec();
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
  fn test_paragraph_newlines() {
    let mut markdown = String::new();
    append_paragraph(&mut markdown, "# ", "Title\n");
    assert_eq!(markdown, "# Title\n\n");

    markdown.clear();
    append_paragraph(&mut markdown, "", "Plain");
    assert_eq!(markdown, "Plain\n\n");
  }

  #[test]
  fn test_list_newlines() {
    let mut markdown = String::new();
    append_list_item(&mut markdown, "    ", "* ", "Item\n");
    assert_eq!(markdown, "    * Item\n");

    markdown.clear();
    append_list_item(&mut markdown, "", "- [ ] ", "Task");
    assert_eq!(markdown, "- [ ] Task\n");
  }

  #[test]
  fn test_code_block_newlines() {
    let mut markdown = String::new();
    append_code_block(&mut markdown, "rs", "fn main() {}");
    assert_eq!(markdown, "```rs\nfn main() {}\n```\n\n");
  }

  #[test]
  fn test_table_newlines() {
    let mut markdown = String::new();
    append_table_block(&mut markdown, "|a|b|\n|---|---|\n|1|2|\n");
    assert_eq!(markdown, "|a|b|\n|---|---|\n|1|2|\n\n");

    markdown.clear();
    append_table_block(&mut markdown, "|a|b|");
    assert_eq!(markdown, "|a|b|\n\n");
  }
}
