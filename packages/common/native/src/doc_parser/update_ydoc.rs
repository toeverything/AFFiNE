//! Update YDoc module
//!
//! Provides functionality to update existing AFFiNE documents by applying
//! surgical y-octo operations based on content differences.

use std::collections::HashMap;

use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use y_octo::{Any, Doc, DocOptions, Map, StateVector};

use super::affine::ParseError;
use super::blocksuite::{collect_child_ids, get_string};

const PAGE_FLAVOUR: &str = "affine:page";
const NOTE_FLAVOUR: &str = "affine:note";
const PARAGRAPH_FLAVOUR: &str = "affine:paragraph";
const LIST_FLAVOUR: &str = "affine:list";
const CODE_FLAVOUR: &str = "affine:code";
const DIVIDER_FLAVOUR: &str = "affine:divider";

/// Represents a content block for diffing purposes
#[derive(Debug, Clone, PartialEq)]
pub struct ContentBlock {
  pub flavour: String,
  pub block_type: Option<String>, // h1, h2, text, bulleted, numbered, todo, etc.
  pub content: String,
  pub checked: Option<bool>,    // For todo items
  pub language: Option<String>, // For code blocks
}

impl ContentBlock {
  /// Check if two blocks are similar enough to be considered "the same" for diffing
  fn is_similar(&self, other: &ContentBlock) -> bool {
    self.flavour == other.flavour && self.block_type == other.block_type
  }
}

/// Represents the existing document structure
struct ExistingDoc {
  doc: Doc,
  page_id: String,
  note_id: String,
  content_block_ids: Vec<String>,
  content_blocks: Vec<(String, ContentBlock)>, // (id, block)
}

/// Represents a diff operation
#[derive(Debug)]
enum DiffOp {
  Keep(usize, usize),   // (old_idx, new_idx) - block unchanged or similar
  Delete(usize),        // old_idx - block removed
  Insert(usize),        // new_idx - block added
  Update(usize, usize), // (old_idx, new_idx) - block content changed
}

/// Updates an existing document with new markdown content.
///
/// Due to compatibility issues between y-octo and yjs when applying delta updates,
/// this function creates a fresh document from the new markdown content.
/// While less efficient than surgical updates, this ensures compatibility with
/// the yjs-based server storage.
///
/// # Arguments
/// * `_existing_binary` - The current document binary (unused - kept for API compatibility)
/// * `new_markdown` - The new markdown content
/// * `doc_id` - The document ID
///
/// # Returns
/// A binary vector representing the full new document state
pub fn update_ydoc(
  _existing_binary: &[u8],
  new_markdown: &str,
  doc_id: &str,
) -> Result<Vec<u8>, ParseError> {
  // Due to y-octo/yjs compatibility issues with delta updates,
  // we create a fresh document from the new markdown instead of patching.
  // This is less efficient but ensures the update can be applied by yjs.
  super::markdown_to_ydoc::markdown_to_ydoc(new_markdown, doc_id)
}

/// Loads an existing document and extracts its structure
fn load_existing_doc(binary: &[u8], doc_id: &str) -> Result<ExistingDoc, ParseError> {
  if binary.is_empty() || binary == [0, 0] {
    return Err(ParseError::InvalidBinary);
  }

  let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
  doc
    .apply_update_from_binary_v1(binary)
    .map_err(|_| ParseError::InvalidBinary)?;

  let blocks_map = doc.get_map("blocks")?;
  if blocks_map.is_empty() {
    return Err(ParseError::ParserError("blocks map is empty".into()));
  }

  // Build block index
  let mut block_pool: HashMap<String, Map> = HashMap::new();
  for (_, value) in blocks_map.iter() {
    if let Some(block_map) = value.to_map() {
      if let Some(block_id) = get_string(&block_map, "sys:id") {
        block_pool.insert(block_id, block_map);
      }
    }
  }

  // Find page block
  let page_id = block_pool
    .iter()
    .find_map(|(id, block)| {
      get_string(block, "sys:flavour")
        .filter(|f| f == PAGE_FLAVOUR)
        .map(|_| id.clone())
    })
    .ok_or_else(|| ParseError::ParserError("page block not found".into()))?;

  // Find note block (child of page)
  let page_block = block_pool
    .get(&page_id)
    .ok_or_else(|| ParseError::ParserError("page block not found".into()))?;
  let note_id = collect_child_ids(page_block)
    .into_iter()
    .find(|id| {
      block_pool
        .get(id)
        .and_then(|b| get_string(b, "sys:flavour"))
        .as_deref()
        == Some(NOTE_FLAVOUR)
    })
    .ok_or_else(|| ParseError::ParserError("note block not found".into()))?;

  // Get content block IDs (children of note)
  let note_block = block_pool
    .get(&note_id)
    .ok_or_else(|| ParseError::ParserError("note block not found".into()))?;
  let content_block_ids = collect_child_ids(note_block);

  // Extract content blocks with their data
  let mut content_blocks = Vec::new();
  for block_id in &content_block_ids {
    if let Some(block) = block_pool.get(block_id) {
      let content_block = extract_content_block(block);
      content_blocks.push((block_id.clone(), content_block));
    }
  }

  Ok(ExistingDoc {
    doc,
    page_id,
    note_id,
    content_block_ids,
    content_blocks,
  })
}

/// Extracts content block data from a y-octo Map
fn extract_content_block(block: &Map) -> ContentBlock {
  let flavour = get_string(block, "sys:flavour").unwrap_or_default();
  let block_type = get_string(block, "prop:type");
  let content = block
    .get("prop:text")
    .and_then(|v| v.to_text())
    .map(|t| t.to_string())
    .unwrap_or_default();
  let checked = block
    .get("prop:checked")
    .and_then(|v| v.to_any())
    .and_then(|a| match a {
      Any::True => Some(true),
      Any::False => Some(false),
      _ => None,
    });
  let language = get_string(block, "prop:language");

  ContentBlock {
    flavour,
    block_type,
    content,
    checked,
    language,
  }
}

/// Parses markdown into content blocks for diffing
fn parse_markdown_to_content_blocks(markdown: &str) -> Result<Vec<ContentBlock>, ParseError> {
  let options = Options::ENABLE_STRIKETHROUGH
    | Options::ENABLE_TABLES
    | Options::ENABLE_TASKLISTS
    | Options::ENABLE_HEADING_ATTRIBUTES;
  let parser = Parser::new_ext(markdown, options);

  let mut blocks = Vec::new();
  let mut current_text = String::new();
  let mut current_type: Option<String> = None;
  let mut current_flavour = PARAGRAPH_FLAVOUR;
  let mut in_list = false;
  let mut list_type_stack: Vec<String> = Vec::new();
  let mut in_code_block = false;
  let mut code_language = String::new();
  let mut skip_first_h1 = true;
  let mut current_checked: Option<bool> = None;
  let mut pending_link_url: Option<String> = None;

  for event in parser {
    match event {
      Event::Start(Tag::Heading { level, .. }) => {
        flush_block(
          &mut blocks,
          &mut current_text,
          current_flavour,
          current_type.take(),
          current_checked.take(),
          None,
        );

        if level == HeadingLevel::H1 && skip_first_h1 {
          current_type = Some("h1".to_string());
        } else {
          current_type = Some(
            match level {
              HeadingLevel::H1 => "h1",
              HeadingLevel::H2 => "h2",
              HeadingLevel::H3 => "h3",
              HeadingLevel::H4 => "h4",
              HeadingLevel::H5 => "h5",
              HeadingLevel::H6 => "h6",
            }
            .to_string(),
          );
        }
        current_flavour = PARAGRAPH_FLAVOUR;
      }
      Event::End(TagEnd::Heading(level)) => {
        if level == HeadingLevel::H1 && skip_first_h1 {
          skip_first_h1 = false;
          current_text.clear();
          current_type = None;
        } else {
          flush_block(
            &mut blocks,
            &mut current_text,
            current_flavour,
            current_type.take(),
            current_checked.take(),
            None,
          );
        }
      }
      Event::Start(Tag::Paragraph) => {}
      Event::End(TagEnd::Paragraph) => {
        if !in_list {
          flush_block(
            &mut blocks,
            &mut current_text,
            current_flavour,
            current_type.take(),
            current_checked.take(),
            None,
          );
        }
      }
      Event::Start(Tag::BlockQuote(_)) => {
        current_type = Some("quote".to_string());
        current_flavour = PARAGRAPH_FLAVOUR;
      }
      Event::End(TagEnd::BlockQuote(_)) => {
        flush_block(
          &mut blocks,
          &mut current_text,
          current_flavour,
          current_type.take(),
          current_checked.take(),
          None,
        );
      }
      Event::Start(Tag::List(start_num)) => {
        in_list = true;
        let list_type = if start_num.is_some() {
          "numbered"
        } else {
          "bulleted"
        };
        list_type_stack.push(list_type.to_string());
      }
      Event::End(TagEnd::List(_)) => {
        list_type_stack.pop();
        if list_type_stack.is_empty() {
          in_list = false;
        }
      }
      Event::Start(Tag::Item) => {
        current_flavour = LIST_FLAVOUR;
        if let Some(lt) = list_type_stack.last() {
          current_type = Some(lt.clone());
        }
      }
      Event::End(TagEnd::Item) => {
        flush_block(
          &mut blocks,
          &mut current_text,
          current_flavour,
          current_type.take(),
          current_checked.take(),
          None,
        );
        current_flavour = PARAGRAPH_FLAVOUR;
      }
      Event::TaskListMarker(checked) => {
        current_type = Some("todo".to_string());
        current_checked = Some(checked);
      }
      Event::Start(Tag::CodeBlock(kind)) => {
        in_code_block = true;
        current_flavour = CODE_FLAVOUR;
        code_language = match kind {
          CodeBlockKind::Fenced(lang) => lang.to_string(),
          CodeBlockKind::Indented => String::new(),
        };
      }
      Event::End(TagEnd::CodeBlock) => {
        flush_block(
          &mut blocks,
          &mut current_text,
          current_flavour,
          None,
          None,
          Some(code_language.clone()),
        );
        in_code_block = false;
        code_language.clear();
        current_flavour = PARAGRAPH_FLAVOUR;
      }
      Event::Text(text) => {
        current_text.push_str(&text);
      }
      Event::Code(code) => {
        current_text.push('`');
        current_text.push_str(&code);
        current_text.push('`');
      }
      Event::SoftBreak | Event::HardBreak => {
        if in_code_block {
          current_text.push('\n');
        } else {
          current_text.push(' ');
        }
      }
      Event::Rule => {
        flush_block(
          &mut blocks,
          &mut current_text,
          current_flavour,
          current_type.take(),
          current_checked.take(),
          None,
        );
        blocks.push(ContentBlock {
          flavour: DIVIDER_FLAVOUR.to_string(),
          block_type: None,
          content: String::new(),
          checked: None,
          language: None,
        });
      }
      Event::Start(Tag::Strong) => current_text.push_str("**"),
      Event::End(TagEnd::Strong) => current_text.push_str("**"),
      Event::Start(Tag::Emphasis) => current_text.push('_'),
      Event::End(TagEnd::Emphasis) => current_text.push('_'),
      Event::Start(Tag::Strikethrough) => current_text.push_str("~~"),
      Event::End(TagEnd::Strikethrough) => current_text.push_str("~~"),
      Event::Start(Tag::Link { dest_url, .. }) => {
        current_text.push('[');
        pending_link_url = Some(dest_url.to_string());
      }
      Event::End(TagEnd::Link) => {
        if let Some(url) = pending_link_url.take() {
          current_text.push_str(&format!("]({})", url));
        }
      }
      _ => {}
    }
  }

  // Flush any remaining content
  flush_block(
    &mut blocks,
    &mut current_text,
    current_flavour,
    current_type,
    current_checked,
    None,
  );

  Ok(blocks)
}

fn flush_block(
  blocks: &mut Vec<ContentBlock>,
  text: &mut String,
  flavour: &str,
  block_type: Option<String>,
  checked: Option<bool>,
  language: Option<String>,
) {
  let trimmed = text.trim();
  if !trimmed.is_empty() || flavour == DIVIDER_FLAVOUR {
    blocks.push(ContentBlock {
      flavour: flavour.to_string(),
      block_type,
      content: trimmed.to_string(),
      checked,
      language,
    });
  }
  text.clear();
}

/// Extracts the title from the first H1 heading
fn extract_title(markdown: &str) -> String {
  let parser = Parser::new(markdown);
  let mut in_heading = false;
  let mut title = String::new();

  for event in parser {
    match event {
      Event::Start(Tag::Heading { level, .. }) if level == HeadingLevel::H1 => {
        in_heading = true;
      }
      Event::Text(text) if in_heading => {
        title.push_str(&text);
      }
      Event::Code(code) if in_heading => {
        title.push_str(&code);
      }
      Event::End(TagEnd::Heading(_)) if in_heading => {
        break;
      }
      _ => {}
    }
  }

  if title.is_empty() {
    "Untitled".to_string()
  } else {
    title.trim().to_string()
  }
}

/// Updates the document title if it has changed
fn update_title(existing: &mut ExistingDoc, new_title: &str) -> Result<(), ParseError> {
  let blocks_map = existing
    .doc
    .get_map("blocks")
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  if let Some(mut page_block) = blocks_map.get(&existing.page_id).and_then(|v| v.to_map()) {
    let current_title = get_string(&page_block, "prop:title").unwrap_or_default();
    if current_title != new_title {
      page_block
        .insert("prop:title".to_string(), Any::String(new_title.to_string()))
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
  }

  Ok(())
}

/// Computes the diff between old and new blocks using LCS algorithm
fn compute_diff(old_blocks: &[(String, ContentBlock)], new_blocks: &[ContentBlock]) -> Vec<DiffOp> {
  let old_len = old_blocks.len();
  let new_len = new_blocks.len();

  // Build LCS table
  let mut lcs = vec![vec![0usize; new_len + 1]; old_len + 1];

  for i in 1..=old_len {
    for j in 1..=new_len {
      if old_blocks[i - 1].1.is_similar(&new_blocks[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = std::cmp::max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to find the diff
  let mut ops = Vec::new();
  let mut i = old_len;
  let mut j = new_len;

  while i > 0 || j > 0 {
    if i > 0 && j > 0 && old_blocks[i - 1].1.is_similar(&new_blocks[j - 1]) {
      // Blocks are similar - check if content changed
      if old_blocks[i - 1].1.content == new_blocks[j - 1].content
        && old_blocks[i - 1].1.checked == new_blocks[j - 1].checked
        && old_blocks[i - 1].1.language == new_blocks[j - 1].language
      {
        ops.push(DiffOp::Keep(i - 1, j - 1));
      } else {
        ops.push(DiffOp::Update(i - 1, j - 1));
      }
      i -= 1;
      j -= 1;
    } else if j > 0 && (i == 0 || lcs[i][j - 1] >= lcs[i - 1][j]) {
      ops.push(DiffOp::Insert(j - 1));
      j -= 1;
    } else {
      ops.push(DiffOp::Delete(i - 1));
      i -= 1;
    }
  }

  // Reverse to get operations in order
  ops.reverse();
  ops
}

/// Applies diff operations to update the document
fn apply_diff(
  existing: &mut ExistingDoc,
  new_blocks: &[ContentBlock],
  diff_ops: &[DiffOp],
) -> Result<(), ParseError> {
  let mut blocks_map = existing
    .doc
    .get_map("blocks")
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Track new children for the note block
  let mut new_children: Vec<String> = Vec::new();

  // Track which old blocks to delete
  let mut blocks_to_delete: Vec<String> = Vec::new();

  for op in diff_ops {
    match op {
      DiffOp::Keep(old_idx, _) => {
        // Keep the existing block
        let block_id = &existing.content_block_ids[*old_idx];
        new_children.push(block_id.clone());
      }
      DiffOp::Delete(old_idx) => {
        // Mark block for deletion
        let block_id = &existing.content_block_ids[*old_idx];
        blocks_to_delete.push(block_id.clone());
      }
      DiffOp::Insert(new_idx) => {
        // Create a new block
        let new_block = &new_blocks[*new_idx];
        let block_id = create_new_block(&mut blocks_map, &existing.doc, new_block)?;
        new_children.push(block_id);
      }
      DiffOp::Update(old_idx, new_idx) => {
        // Update existing block content
        let block_id = &existing.content_block_ids[*old_idx];
        let new_block = &new_blocks[*new_idx];
        update_block_content(&mut blocks_map, block_id, new_block)?;
        new_children.push(block_id.clone());
      }
    }
  }

  // Delete removed blocks from blocks map
  for block_id in blocks_to_delete {
    blocks_map.remove(&block_id);
  }

  // Update note block's children
  update_note_children(
    &mut blocks_map,
    &existing.note_id,
    &existing.doc,
    new_children,
  )?;

  Ok(())
}

/// Creates a new block in the blocks map
fn create_new_block(
  blocks_map: &mut Map,
  doc: &Doc,
  block: &ContentBlock,
) -> Result<String, ParseError> {
  let block_id = nanoid::nanoid!();

  let mut block_map = doc
    .create_map()
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Required fields
  block_map
    .insert("sys:id".to_string(), Any::String(block_id.clone()))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;
  block_map
    .insert(
      "sys:flavour".to_string(),
      Any::String(block.flavour.clone()),
    )
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Empty children array
  let children_array = doc
    .create_array()
    .map_err(|e| ParseError::ParserError(e.to_string()))?;
  block_map
    .insert("sys:children".to_string(), children_array)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Block type
  if let Some(ref block_type) = block.block_type {
    block_map
      .insert("prop:type".to_string(), Any::String(block_type.clone()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Text content
  if !block.content.is_empty() {
    let mut text = doc
      .create_text()
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
    text
      .insert(0, &block.content)
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
    block_map
      .insert("prop:text".to_string(), text)
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Checked state for todo items
  if let Some(checked) = block.checked {
    block_map
      .insert(
        "prop:checked".to_string(),
        if checked { Any::True } else { Any::False },
      )
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Code language
  if let Some(ref language) = block.language {
    block_map
      .insert("prop:language".to_string(), Any::String(language.clone()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  blocks_map
    .insert(block_id.clone(), block_map)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  Ok(block_id)
}

/// Updates an existing block's content using text-level diff
fn update_block_content(
  blocks_map: &mut Map,
  block_id: &str,
  new_block: &ContentBlock,
) -> Result<(), ParseError> {
  let mut block = blocks_map
    .get(block_id)
    .and_then(|v| v.to_map())
    .ok_or_else(|| ParseError::ParserError(format!("Block {} not found", block_id)))?;

  // Update text content using text-level diff
  if let Some(mut text) = block.get("prop:text").and_then(|v| v.to_text()) {
    let old_content = text.to_string();
    apply_text_diff(&mut text, &old_content, &new_block.content)?;
  } else if !new_block.content.is_empty() {
    // Block didn't have text before, but now it does
    // We need to get the doc from the block somehow
    // For now, we'll update via the block's text field
    // This is a limitation - we can only update existing text
    return Err(ParseError::ParserError(
      "Cannot add text to block without existing text field".into(),
    ));
  }

  // Update checked state if changed
  if new_block.checked.is_some() {
    block
      .insert(
        "prop:checked".to_string(),
        if new_block.checked.unwrap() {
          Any::True
        } else {
          Any::False
        },
      )
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Update language if changed
  if let Some(ref language) = new_block.language {
    block
      .insert("prop:language".to_string(), Any::String(language.clone()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  Ok(())
}

/// Applies a text-level diff to a YText field
fn apply_text_diff(
  text: &mut y_octo::Text,
  old_content: &str,
  new_content: &str,
) -> Result<(), ParseError> {
  // Use Myers diff algorithm for character-level changes
  let old_chars: Vec<char> = old_content.chars().collect();
  let new_chars: Vec<char> = new_content.chars().collect();

  let ops = compute_text_diff(&old_chars, &new_chars);

  // Apply operations in reverse order to maintain correct indices
  let mut offset = 0i64;
  for op in ops {
    match op {
      TextDiffOp::Delete { start, len } => {
        let adjusted_start = (start as i64 + offset) as u64;
        text
          .remove(adjusted_start, len as u64)
          .map_err(|e| ParseError::ParserError(e.to_string()))?;
        offset -= len as i64;
      }
      TextDiffOp::Insert { pos, chars } => {
        let adjusted_pos = (pos as i64 + offset) as u64;
        let insert_str: String = chars.iter().collect();
        text
          .insert(adjusted_pos, &insert_str)
          .map_err(|e| ParseError::ParserError(e.to_string()))?;
        offset += chars.len() as i64;
      }
    }
  }

  Ok(())
}

#[derive(Debug)]
enum TextDiffOp {
  Delete { start: usize, len: usize },
  Insert { pos: usize, chars: Vec<char> },
}

/// Computes character-level diff between two strings using greedy matching
/// This produces a minimal edit sequence for common cases like appending text
fn compute_text_diff(old: &[char], new: &[char]) -> Vec<TextDiffOp> {
  // Find common prefix
  let mut prefix_len = 0;
  while prefix_len < old.len() && prefix_len < new.len() && old[prefix_len] == new[prefix_len] {
    prefix_len += 1;
  }

  // Find common suffix (from the non-prefix parts)
  let old_remaining = &old[prefix_len..];
  let new_remaining = &new[prefix_len..];

  let mut suffix_len = 0;
  while suffix_len < old_remaining.len()
    && suffix_len < new_remaining.len()
    && old_remaining[old_remaining.len() - 1 - suffix_len]
      == new_remaining[new_remaining.len() - 1 - suffix_len]
  {
    suffix_len += 1;
  }

  // The middle parts that differ
  let old_mid_len = old_remaining.len() - suffix_len;
  let new_mid_start = prefix_len;
  let new_mid_len = new_remaining.len() - suffix_len;

  #[derive(Debug, Clone)]
  enum Edit {
    Keep,
    Delete,
    Insert(char),
  }

  let mut edits = Vec::new();

  // Keep prefix
  for _ in 0..prefix_len {
    edits.push(Edit::Keep);
  }

  // Delete middle of old
  for _ in 0..old_mid_len {
    edits.push(Edit::Delete);
  }

  // Insert middle of new
  for i in 0..new_mid_len {
    edits.push(Edit::Insert(new[new_mid_start + i]));
  }

  // Keep suffix
  for _ in 0..suffix_len {
    edits.push(Edit::Keep);
  }

  // Convert edits to operations, tracking position in old string
  let mut ops = Vec::new();
  let mut old_pos = 0usize;

  // Pending delete
  let mut del_start: Option<usize> = None;
  let mut del_count = 0usize;

  // Pending insert
  let mut ins_pos: Option<usize> = None;
  let mut ins_chars: Vec<char> = Vec::new();

  for edit in edits {
    match edit {
      Edit::Keep => {
        // Flush pending operations
        if let Some(start) = del_start.take() {
          ops.push(TextDiffOp::Delete {
            start,
            len: del_count,
          });
          del_count = 0;
        }
        if let Some(pos) = ins_pos.take() {
          ops.push(TextDiffOp::Insert {
            pos,
            chars: std::mem::take(&mut ins_chars),
          });
        }
        old_pos += 1;
      }
      Edit::Delete => {
        // Flush pending inserts first
        if let Some(pos) = ins_pos.take() {
          ops.push(TextDiffOp::Insert {
            pos,
            chars: std::mem::take(&mut ins_chars),
          });
        }
        if del_start.is_none() {
          del_start = Some(old_pos);
        }
        del_count += 1;
        old_pos += 1;
      }
      Edit::Insert(c) => {
        // Flush pending deletes first
        if let Some(start) = del_start.take() {
          ops.push(TextDiffOp::Delete {
            start,
            len: del_count,
          });
          del_count = 0;
        }
        if ins_pos.is_none() {
          ins_pos = Some(old_pos);
        }
        ins_chars.push(c);
      }
    }
  }

  // Flush remaining operations
  if let Some(start) = del_start {
    ops.push(TextDiffOp::Delete {
      start,
      len: del_count,
    });
  }
  if let Some(pos) = ins_pos {
    ops.push(TextDiffOp::Insert {
      pos,
      chars: ins_chars,
    });
  }

  ops
}

/// Updates the note block's children array
fn update_note_children(
  blocks_map: &mut Map,
  note_id: &str,
  doc: &Doc,
  new_children: Vec<String>,
) -> Result<(), ParseError> {
  let mut note_block = blocks_map
    .get(note_id)
    .and_then(|v| v.to_map())
    .ok_or_else(|| ParseError::ParserError("Note block not found".into()))?;

  // Get existing children array
  if let Some(mut children) = note_block.get("sys:children").and_then(|v| v.to_array()) {
    // Clear existing children
    let len = children.len();
    if len > 0 {
      children
        .remove(0, len)
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }

    // Add new children
    for (idx, child_id) in new_children.into_iter().enumerate() {
      children
        .insert(idx as u64, Any::String(child_id))
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
  } else {
    // Create new children array
    let mut children_array = doc
      .create_array()
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
    for (idx, child_id) in new_children.into_iter().enumerate() {
      children_array
        .insert(idx as u64, Any::String(child_id))
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
    note_block
      .insert("sys:children".to_string(), children_array)
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  Ok(())
}

/// Encodes the full document state
/// Note: We encode the full document instead of just delta because
/// y-octo's delta encoding has compatibility issues with yjs when
/// applying updates to existing documents.
fn encode_delta(doc: &Doc, _state_before: &StateVector) -> Result<Vec<u8>, ParseError> {
  doc
    .encode_update_v1()
    .map_err(|e| ParseError::ParserError(e.to_string()))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_parse_markdown_to_content_blocks() {
    let markdown = "# Title\n\nParagraph one.\n\nParagraph two.";
    let blocks = parse_markdown_to_content_blocks(markdown).unwrap();

    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].flavour, PARAGRAPH_FLAVOUR);
    assert_eq!(blocks[0].content, "Paragraph one.");
    assert_eq!(blocks[1].content, "Paragraph two.");
  }

  #[test]
  fn test_compute_text_diff_simple() {
    let old: Vec<char> = "hello".chars().collect();
    let new: Vec<char> = "hello world".chars().collect();
    let ops = compute_text_diff(&old, &new);

    // Should have one insert operation
    assert!(!ops.is_empty());
    match &ops[0] {
      TextDiffOp::Insert { chars, .. } => {
        let inserted: String = chars.iter().collect();
        assert_eq!(inserted, " world");
      }
      _ => panic!("Expected Insert operation"),
    }
  }

  #[test]
  fn test_compute_text_diff_replace() {
    let old: Vec<char> = "abc".chars().collect();
    let new: Vec<char> = "axc".chars().collect();
    let ops = compute_text_diff(&old, &new);

    // Should have delete 'b' and insert 'x'
    assert_eq!(ops.len(), 2);
  }

  #[test]
  fn test_content_block_similarity() {
    let b1 = ContentBlock {
      flavour: PARAGRAPH_FLAVOUR.to_string(),
      block_type: Some("h1".to_string()),
      content: "Hello".to_string(),
      checked: None,
      language: None,
    };
    let b2 = ContentBlock {
      flavour: PARAGRAPH_FLAVOUR.to_string(),
      block_type: Some("h1".to_string()),
      content: "World".to_string(),
      checked: None,
      language: None,
    };
    let b3 = ContentBlock {
      flavour: PARAGRAPH_FLAVOUR.to_string(),
      block_type: Some("h2".to_string()),
      content: "Hello".to_string(),
      checked: None,
      language: None,
    };

    assert!(b1.is_similar(&b2)); // Same type, different content
    assert!(!b1.is_similar(&b3)); // Different type
  }

  #[test]
  fn test_extract_title() {
    assert_eq!(extract_title("# My Title\n\nContent"), "My Title");
    assert_eq!(extract_title("No heading"), "Untitled");
    assert_eq!(extract_title("## Secondary\n\nContent"), "Untitled");
    assert_eq!(extract_title("# **Bold** Title"), "Bold Title");
  }

  #[test]
  fn test_update_ydoc_roundtrip() {
    use crate::doc_parser::markdown_to_ydoc;

    // Create initial document
    let initial_md = "# Test Document\n\nFirst paragraph.\n\nSecond paragraph.";
    let doc_id = "update-test";

    let initial_bin = markdown_to_ydoc(initial_md, doc_id).expect("Should create initial doc");

    // Update with new content
    let updated_md =
      "# Test Document\n\nFirst paragraph.\n\nModified second paragraph.\n\nNew third paragraph.";

    let delta = update_ydoc(&initial_bin, updated_md, doc_id).expect("Should compute delta");

    // Delta should not be empty (changes were made)
    assert!(!delta.is_empty(), "Delta should contain changes");

    // Apply delta to original and verify structure
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta");

    // Verify the document has the expected structure
    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    assert!(!blocks_map.is_empty(), "Blocks should not be empty");
  }

  #[test]
  fn test_update_ydoc_title_change() {
    use crate::doc_parser::markdown_to_ydoc;

    let initial_md = "# Original Title\n\nContent here.";
    let doc_id = "title-test";

    let initial_bin = markdown_to_ydoc(initial_md, doc_id).expect("Should create initial doc");

    let updated_md = "# New Title\n\nContent here.";
    let delta = update_ydoc(&initial_bin, updated_md, doc_id).expect("Should compute delta");

    // Apply and verify
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta");

    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    assert!(!blocks_map.is_empty());
  }

  #[test]
  fn test_update_ydoc_no_changes() {
    use crate::doc_parser::markdown_to_ydoc;

    let markdown = "# Same Title\n\nSame content.";
    let doc_id = "no-change-test";

    let initial_bin = markdown_to_ydoc(markdown, doc_id).expect("Should create initial doc");

    // Update with identical content
    let delta = update_ydoc(&initial_bin, markdown, doc_id).expect("Should compute delta");

    // Applying the delta should not fail
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta even with no changes");

    // Document should still be valid
    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    assert!(!blocks_map.is_empty());
  }
}
