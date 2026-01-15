//! Update YDoc module
//!
//! Provides functionality to update existing AFFiNE documents by applying
//! surgical y-octo operations based on content differences.

use std::collections::HashMap;

use y_octo::{Any, Doc, DocOptions, Map};

use super::{
  affine::ParseError,
  blocksuite::{collect_child_ids, get_string},
  markdown_utils::{BlockFlavour, ParsedBlock, extract_title, parse_markdown_blocks},
};

const PAGE_FLAVOUR: &str = "affine:page";
const NOTE_FLAVOUR: &str = "affine:note";

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
  /// Check if two blocks are similar enough to be considered "the same" for
  /// diffing
  fn is_similar(&self, other: &ContentBlock) -> bool {
    self.flavour == other.flavour && self.block_type == other.block_type
  }
}

/// Converts a ParsedBlock from the shared parser into a ContentBlock
impl From<ParsedBlock> for ContentBlock {
  fn from(parsed: ParsedBlock) -> Self {
    // Default paragraph type to "text" to match existing documents
    let block_type = if parsed.flavour == BlockFlavour::Paragraph && parsed.block_type.is_none() {
      Some("text".to_string())
    } else {
      parsed.block_type.map(|bt| bt.as_str().to_string())
    };

    ContentBlock {
      flavour: parsed.flavour.as_str().to_string(),
      block_type,
      content: parsed.content,
      checked: parsed.checked,
      language: parsed.language,
    }
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
  Keep(usize),          // old_idx - block unchanged
  Delete(usize),        // old_idx - block removed
  Insert(usize),        // new_idx - block added
  Update(usize, usize), // (old_idx, new_idx) - block content changed
}

/// Updates an existing document with new markdown content.
///
/// This function performs structural diffing between the existing document
/// and the new markdown content, then applies minimal y-octo operations
/// to update only what changed. This enables proper CRDT merging with
/// concurrent edits from other clients.
///
/// If the existing document is empty or invalid, falls back to creating
/// a new document from the markdown using `markdown_to_ydoc`.
///
/// # Arguments
/// * `existing_binary` - The current document binary
/// * `new_markdown` - The new markdown content
/// * `doc_id` - The document ID
///
/// # Returns
/// A binary vector representing only the delta (changes) to apply
pub fn update_ydoc(existing_binary: &[u8], new_markdown: &str, doc_id: &str) -> Result<Vec<u8>, ParseError> {
  // Load and parse the existing document
  // If the document is empty or invalid, fall back to creating a new one
  let mut existing = match load_existing_doc(existing_binary, doc_id) {
    Ok(doc) => doc,
    Err(ParseError::InvalidBinary) | Err(ParseError::ParserError(_)) => {
      // Empty or invalid document - create from scratch
      return super::markdown_to_ydoc::markdown_to_ydoc(new_markdown, doc_id);
    }
    Err(e) => return Err(e),
  };

  // Parse new markdown into content blocks
  let new_blocks = parse_markdown_to_content_blocks(new_markdown)?;

  // Compute diff between old and new blocks
  let diff_ops = compute_diff(&existing.content_blocks, &new_blocks);

  // Capture state before modifications to encode only the delta
  let state_before = existing.doc.get_state_vector();

  // Update the title if changed
  let new_title = extract_title(new_markdown);
  update_title(&mut existing, &new_title)?;

  // Apply diff operations to update the document structure
  apply_diff(&mut existing, &new_blocks, &diff_ops)?;

  // Encode only the changes (delta) since state_before
  existing
    .doc
    .encode_state_as_update_v1(&state_before)
    .map_err(|e| ParseError::ParserError(e.to_string()))
}

/// Loads an existing document and extracts its structure
fn load_existing_doc(binary: &[u8], doc_id: &str) -> Result<ExistingDoc, ParseError> {
  // Check for empty or minimal empty Y-Doc binary
  // [0, 0] represents an empty Y-Doc update (0 structs, 0 deletes) - a convention
  // used throughout the AFFiNE codebase for uninitialized/empty documents
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
    if let Some(block_map) = value.to_map()
      && let Some(block_id) = get_string(&block_map, "sys:id")
    {
      block_pool.insert(block_id, block_map);
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
    .find(|id| block_pool.get(id).and_then(|b| get_string(b, "sys:flavour")).as_deref() == Some(NOTE_FLAVOUR))
    .ok_or_else(|| ParseError::ParserError("note block not found".into()))?;

  // Get content block IDs (children of note)
  let note_block = block_pool
    .get(&note_id)
    .ok_or_else(|| ParseError::ParserError("note block not found".into()))?;
  let raw_content_block_ids = collect_child_ids(note_block);

  // Extract content blocks with their data, filtering to only existing blocks
  // This ensures content_block_ids and content_blocks stay in sync
  let mut content_blocks = Vec::new();
  let mut content_block_ids = Vec::new();
  for block_id in raw_content_block_ids {
    if let Some(block) = block_pool.get(&block_id) {
      let content_block = extract_content_block(block);
      content_blocks.push((block_id.clone(), content_block));
      content_block_ids.push(block_id);
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
  // Use get_string which handles both Y.Text and Any::String via value_to_string
  let content = get_string(block, "prop:text").unwrap_or_default();
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

/// Parses markdown into content blocks for diffing.
///
/// Uses the shared `parse_markdown_blocks` function and converts to
/// `ContentBlock`.
fn parse_markdown_to_content_blocks(markdown: &str) -> Result<Vec<ContentBlock>, ParseError> {
  let parsed_blocks = parse_markdown_blocks(markdown, true);
  Ok(parsed_blocks.into_iter().map(ContentBlock::from).collect())
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

/// Computes the diff between old and new blocks using weighted LCS algorithm.
/// Uses a two-tier matching: exact matches (same type + content) get priority,
/// then similar matches (same type, different content) for update operations.
fn compute_diff(old_blocks: &[(String, ContentBlock)], new_blocks: &[ContentBlock]) -> Vec<DiffOp> {
  let old_len = old_blocks.len();
  let new_len = new_blocks.len();

  if old_len == 0 {
    // All inserts
    return (0..new_len).map(DiffOp::Insert).collect();
  }
  if new_len == 0 {
    // All deletes
    return (0..old_len).map(DiffOp::Delete).collect();
  }

  // Build weighted LCS table using exact content match
  // This ensures identical blocks are matched together
  let mut lcs = vec![vec![0usize; new_len + 1]; old_len + 1];

  for i in 1..=old_len {
    for j in 1..=new_len {
      let old_block = &old_blocks[i - 1].1;
      let new_block = &new_blocks[j - 1];

      // Only count as match if blocks are identical (same type AND content)
      if old_block.flavour == new_block.flavour
        && old_block.block_type == new_block.block_type
        && old_block.content == new_block.content
        && old_block.checked == new_block.checked
        && old_block.language == new_block.language
      {
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
    if i > 0 && j > 0 {
      let old_block = &old_blocks[i - 1].1;
      let new_block = &new_blocks[j - 1];

      let is_exact_match = old_block.flavour == new_block.flavour
        && old_block.block_type == new_block.block_type
        && old_block.content == new_block.content
        && old_block.checked == new_block.checked
        && old_block.language == new_block.language;

      if is_exact_match {
        // Exact match - Keep
        ops.push(DiffOp::Keep(i - 1));
        i -= 1;
        j -= 1;
      } else if old_block.is_similar(new_block)
        && lcs[i - 1][j - 1] >= lcs[i - 1][j]
        && lcs[i - 1][j - 1] >= lcs[i][j - 1]
      {
        // Similar block (same type, different content) - Update if it doesn't hurt LCS
        ops.push(DiffOp::Update(i - 1, j - 1));
        i -= 1;
        j -= 1;
      } else if lcs[i][j - 1] >= lcs[i - 1][j] {
        ops.push(DiffOp::Insert(j - 1));
        j -= 1;
      } else {
        ops.push(DiffOp::Delete(i - 1));
        i -= 1;
      }
    } else if j > 0 {
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
fn apply_diff(existing: &mut ExistingDoc, new_blocks: &[ContentBlock], diff_ops: &[DiffOp]) -> Result<(), ParseError> {
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
      DiffOp::Keep(old_idx) => {
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
        update_block_content(&mut existing.doc, &mut blocks_map, block_id, new_block)?;
        new_children.push(block_id.clone());
      }
    }
  }

  // Delete removed blocks from blocks map
  for block_id in blocks_to_delete {
    blocks_map.remove(&block_id);
  }

  // Update note block's children only if they changed
  // First check if they're different
  let note_block = blocks_map
    .get(&existing.note_id)
    .and_then(|v| v.to_map())
    .ok_or_else(|| ParseError::ParserError("Note block not found".into()))?;

  let current_children: Vec<String> = note_block
    .get("sys:children")
    .and_then(|v| v.to_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|v| {
          v.to_any().and_then(|a| match a {
            Any::String(s) => Some(s.clone()),
            _ => None,
          })
        })
        .collect()
    })
    .unwrap_or_default();

  if current_children != new_children {
    update_note_children(&mut blocks_map, &existing.note_id, new_children)?;
  }

  Ok(())
}

// ============================================================================
// Two-Phase Insertion Helpers
// ============================================================================
//
// IMPORTANT: These helpers implement the two-phase insertion pattern required
// for YJS compatibility. When creating nested CRDT types (Text, Array, Map),
// we must:
//   1. Insert the empty container into the parent FIRST (gets clock value)
//   2. Then retrieve and populate it (content gets later clock values)
//
// This ensures parent items always have earlier clocks than children,
// avoiding "forward parent references" that YJS cannot handle.

/// Creates an empty Text, inserts it into the parent map, then returns it for
/// population.
fn insert_and_get_text(doc: &Doc, parent_map: &mut Map, key: &str) -> Result<y_octo::Text, ParseError> {
  let text = doc.create_text().map_err(|e| ParseError::ParserError(e.to_string()))?;
  parent_map
    .insert(key.to_string(), text)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  parent_map
    .get(key)
    .and_then(|v| v.to_text())
    .ok_or_else(|| ParseError::ParserError("Failed to retrieve inserted text".into()))
}

/// Creates a new block in the blocks map
///
/// IMPORTANT: Uses two-phase approach for YJS compatibility:
/// 1. Insert empty map into blocks_map first (gets clock value)
/// 2. Then populate the map with properties (gets later clock values)
///
/// This ensures parent items have earlier clocks than children.
///
/// Uses Any types (Any::Array, Any::String) for children and text to avoid
/// the "get back" pattern which can hang in release builds.
fn create_new_block(blocks_map: &mut Map, doc: &Doc, block: &ContentBlock) -> Result<String, ParseError> {
  let block_id = nanoid::nanoid!();

  // Step 1: Create and insert empty map into blocks_map
  let empty_map = doc.create_map().map_err(|e| ParseError::ParserError(e.to_string()))?;
  blocks_map
    .insert(block_id.clone(), empty_map)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Step 2: Retrieve the inserted map
  let mut block_map = blocks_map
    .get(&block_id)
    .and_then(|v| v.to_map())
    .ok_or_else(|| ParseError::ParserError("Failed to get inserted block map".into()))?;

  // Step 3: Insert primitive values
  block_map
    .insert("sys:id".to_string(), Any::String(block_id.clone()))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;
  block_map
    .insert("sys:flavour".to_string(), Any::String(block.flavour.clone()))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  if let Some(ref block_type) = block.block_type {
    block_map
      .insert("prop:type".to_string(), Any::String(block_type.clone()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  if let Some(checked) = block.checked {
    block_map
      .insert("prop:checked".to_string(), if checked { Any::True } else { Any::False })
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  if let Some(ref language) = block.language {
    block_map
      .insert("prop:language".to_string(), Any::String(language.clone()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Step 4: Use Any::Array for children (avoids "get back" pattern)
  block_map
    .insert("sys:children".to_string(), Any::Array(vec![]))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Step 5: Use Any::String for text content (avoids "get back" pattern)
  if !block.content.is_empty() {
    block_map
      .insert("prop:text".to_string(), Any::String(block.content.clone()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  Ok(block_id)
}

/// Updates an existing block's content using text-level diff
fn update_block_content(
  doc: &mut Doc,
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
    // Block didn't have text before, but now it does (e.g., divider becoming
    // paragraph) Use two-phase helper to avoid forward parent references
    let mut text = insert_and_get_text(doc, &mut block, "prop:text")?;
    text
      .insert(0, &new_block.content)
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Update checked state - set if present, clear if stale
  match new_block.checked {
    Some(checked) => {
      block
        .insert("prop:checked".to_string(), if checked { Any::True } else { Any::False })
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
    None => {
      // Clear stale checked state if block had it but shouldn't anymore
      if block.get("prop:checked").is_some() {
        block.remove("prop:checked");
      }
    }
  }

  // Update language - set if present, clear if stale
  match &new_block.language {
    Some(language) => {
      block
        .insert("prop:language".to_string(), Any::String(language.clone()))
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
    None => {
      // Clear stale language if block had it but shouldn't anymore
      if block.get("prop:language").is_some() {
        block.remove("prop:language");
      }
    }
  }

  Ok(())
}

/// Applies a text-level diff to a YText field
fn apply_text_diff(text: &mut y_octo::Text, old_content: &str, new_content: &str) -> Result<(), ParseError> {
  // Use greedy diff algorithm for character-level changes
  let old_chars: Vec<char> = old_content.chars().collect();
  let new_chars: Vec<char> = new_content.chars().collect();

  let ops = compute_text_diff(&old_chars, &new_chars);

  // Apply operations in order, adjusting positions based on accumulated offset
  // IMPORTANT: y_octo uses UTF-16 code units for positions, not char indices
  let mut offset = 0i64;
  for op in ops {
    match op {
      TextDiffOp::Delete { start_utf16, len_utf16 } => {
        let raw_pos = start_utf16 as i64 + offset;
        // Fail fast if position goes negative - indicates a bug in diff computation
        if raw_pos < 0 {
          return Err(ParseError::ParserError(format!(
            "Invalid delete position: start_utf16={}, offset={}, raw_pos={}",
            start_utf16, offset, raw_pos
          )));
        }
        let adjusted_start = raw_pos as u64;
        text
          .remove(adjusted_start, len_utf16 as u64)
          .map_err(|e| ParseError::ParserError(e.to_string()))?;
        offset -= len_utf16 as i64;
      }
      TextDiffOp::Insert {
        pos_utf16,
        text: insert_text,
      } => {
        let raw_pos = pos_utf16 as i64 + offset;
        // Fail fast if position goes negative - indicates a bug in diff computation
        if raw_pos < 0 {
          return Err(ParseError::ParserError(format!(
            "Invalid insert position: pos_utf16={}, offset={}, raw_pos={}",
            pos_utf16, offset, raw_pos
          )));
        }
        let adjusted_pos = raw_pos as u64;
        let utf16_len: usize = insert_text.chars().map(|c| c.len_utf16()).sum();
        text
          .insert(adjusted_pos, &insert_text)
          .map_err(|e| ParseError::ParserError(e.to_string()))?;
        offset += utf16_len as i64;
      }
    }
  }

  Ok(())
}

#[derive(Debug)]
enum TextDiffOp {
  /// Delete operation with UTF-16 code unit positions
  Delete { start_utf16: usize, len_utf16: usize },
  /// Insert operation with UTF-16 code unit position and text to insert
  Insert { pos_utf16: usize, text: String },
}

/// Computes character-level diff between two strings using greedy matching.
/// Returns operations with UTF-16 code unit positions (required by y_octo).
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
    && old_remaining[old_remaining.len() - 1 - suffix_len] == new_remaining[new_remaining.len() - 1 - suffix_len]
  {
    suffix_len += 1;
  }

  // The middle parts that differ
  let old_mid_len = old_remaining.len() - suffix_len;
  let new_mid_start = prefix_len;
  let new_mid_len = new_remaining.len() - suffix_len;

  #[derive(Debug, Clone)]
  enum Edit {
    Keep(char),   // Keep this char from old
    Delete(char), // Delete this char from old
    Insert(char), // Insert this char (from new)
  }

  let mut edits = Vec::new();

  // Keep prefix (store the actual chars for UTF-16 length calculation)
  for &c in old.iter().take(prefix_len) {
    edits.push(Edit::Keep(c));
  }

  // Delete middle of old
  for &c in old.iter().skip(prefix_len).take(old_mid_len) {
    edits.push(Edit::Delete(c));
  }

  // Insert middle of new
  for &c in new.iter().skip(new_mid_start).take(new_mid_len) {
    edits.push(Edit::Insert(c));
  }

  // Keep suffix (store the actual chars for UTF-16 length calculation)
  for &c in old.iter().skip(prefix_len + old_mid_len).take(suffix_len) {
    edits.push(Edit::Keep(c));
  }

  // Convert edits to operations, tracking position in UTF-16 code units
  let mut ops = Vec::new();
  let mut old_pos_utf16 = 0usize;

  // Pending delete
  let mut del_start_utf16: Option<usize> = None;
  let mut del_len_utf16 = 0usize;

  // Pending insert
  let mut ins_pos_utf16: Option<usize> = None;
  let mut ins_text = String::new();

  for edit in edits {
    match edit {
      Edit::Keep(c) => {
        // Flush pending operations
        if let Some(start) = del_start_utf16.take() {
          ops.push(TextDiffOp::Delete {
            start_utf16: start,
            len_utf16: del_len_utf16,
          });
          del_len_utf16 = 0;
        }
        if let Some(pos) = ins_pos_utf16.take() {
          ops.push(TextDiffOp::Insert {
            pos_utf16: pos,
            text: std::mem::take(&mut ins_text),
          });
        }
        old_pos_utf16 += c.len_utf16();
      }
      Edit::Delete(c) => {
        // Flush pending inserts first
        if let Some(pos) = ins_pos_utf16.take() {
          ops.push(TextDiffOp::Insert {
            pos_utf16: pos,
            text: std::mem::take(&mut ins_text),
          });
        }
        if del_start_utf16.is_none() {
          del_start_utf16 = Some(old_pos_utf16);
        }
        del_len_utf16 += c.len_utf16();
        old_pos_utf16 += c.len_utf16();
      }
      Edit::Insert(c) => {
        // Flush pending deletes first
        if let Some(start) = del_start_utf16.take() {
          ops.push(TextDiffOp::Delete {
            start_utf16: start,
            len_utf16: del_len_utf16,
          });
          del_len_utf16 = 0;
        }
        if ins_pos_utf16.is_none() {
          ins_pos_utf16 = Some(old_pos_utf16);
        }
        ins_text.push(c);
      }
    }
  }

  // Flush remaining operations
  if let Some(start) = del_start_utf16 {
    ops.push(TextDiffOp::Delete {
      start_utf16: start,
      len_utf16: del_len_utf16,
    });
  }
  if let Some(pos) = ins_pos_utf16 {
    ops.push(TextDiffOp::Insert {
      pos_utf16: pos,
      text: ins_text,
    });
  }

  ops
}

/// Updates the note block's children array, only if the children have changed
fn update_note_children(blocks_map: &mut Map, note_id: &str, new_children: Vec<String>) -> Result<(), ParseError> {
  let mut note_block = blocks_map
    .get(note_id)
    .and_then(|v| v.to_map())
    .ok_or_else(|| ParseError::ParserError("Note block not found".into()))?;

  // Replace children atomically with Any::Array (single CRDT operation)
  // This is cleaner than clearing element-by-element and re-inserting
  let children_any: Vec<Any> = new_children.into_iter().map(Any::String).collect();
  note_block
    .insert("sys:children".to_string(), Any::Array(children_any))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_parse_markdown_to_content_blocks() {
    let markdown = "# Title\n\nParagraph one.\n\nParagraph two.";
    let blocks = parse_markdown_to_content_blocks(markdown).unwrap();

    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].flavour, BlockFlavour::Paragraph.as_str());
    assert_eq!(blocks[0].content, "Paragraph one.");
    assert_eq!(blocks[1].content, "Paragraph two.");
  }

  #[test]
  fn test_compute_text_diff_simple() {
    let old: Vec<char> = "hello".chars().collect();
    let new: Vec<char> = "hello world".chars().collect();
    let ops = compute_text_diff(&old, &new);

    // Should have one insert operation at UTF-16 position 5
    assert!(!ops.is_empty());
    match &ops[0] {
      TextDiffOp::Insert { pos_utf16, text } => {
        assert_eq!(*pos_utf16, 5); // "hello" is 5 UTF-16 code units
        assert_eq!(text, " world");
      }
      _ => panic!("Expected Insert operation"),
    }
  }

  #[test]
  fn test_compute_text_diff_emoji() {
    // Test with emoji (outside BMP, uses 2 UTF-16 code units per char)
    let old: Vec<char> = "a😀b".chars().collect();
    let new: Vec<char> = "a😀c".chars().collect();
    let ops = compute_text_diff(&old, &new);

    // Should delete 'b' at UTF-16 position 3 (1 for 'a', 2 for emoji)
    // Insert position is 4 (after 'b'), but offset adjustment in apply_text_diff
    // accounts for the delete (-1), resulting in actual insert at position 3
    assert_eq!(ops.len(), 2);
    match &ops[0] {
      TextDiffOp::Delete { start_utf16, len_utf16 } => {
        assert_eq!(*start_utf16, 3); // 'a'=1, '😀'=2, total=3
        assert_eq!(*len_utf16, 1); // 'b' is 1 UTF-16 code unit
      }
      _ => panic!("Expected Delete operation"),
    }
    match &ops[1] {
      TextDiffOp::Insert { pos_utf16, text } => {
        // Position recorded as 4 (after processing delete in old string)
        // Offset adjustment will bring this to 3 when applied
        assert_eq!(*pos_utf16, 4);
        assert_eq!(text, "c");
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
    let paragraph_flavour = BlockFlavour::Paragraph.as_str();
    let b1 = ContentBlock {
      flavour: paragraph_flavour.to_string(),
      block_type: Some("h1".to_string()),
      content: "Hello".to_string(),
      checked: None,
      language: None,
    };
    let b2 = ContentBlock {
      flavour: paragraph_flavour.to_string(),
      block_type: Some("h1".to_string()),
      content: "World".to_string(),
      checked: None,
      language: None,
    };
    let b3 = ContentBlock {
      flavour: paragraph_flavour.to_string(),
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
    let updated_md = "# Test Document\n\nFirst paragraph.\n\nModified second paragraph.\n\nNew third paragraph.";

    let delta = update_ydoc(&initial_bin, updated_md, doc_id).expect("Should compute delta");

    // Delta should not be empty (changes were made)
    assert!(!delta.is_empty(), "Delta should contain changes");

    // Apply delta to original and verify structure
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc.apply_update_from_binary_v1(&delta).expect("Should apply delta");

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
    doc.apply_update_from_binary_v1(&delta).expect("Should apply delta");

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

  #[test]
  fn test_update_ydoc_add_block() {
    use crate::doc_parser::markdown_to_ydoc;

    // Create initial document with one paragraph
    let initial_md = "# Add Block Test\n\nOriginal paragraph.";
    let doc_id = "add-block-test";

    let initial_bin = markdown_to_ydoc(initial_md, doc_id).expect("Should create initial doc");
    let initial_size = initial_bin.len();

    // Add a new paragraph
    let updated_md = "# Add Block Test\n\nOriginal paragraph.\n\nNew paragraph added.";
    let delta = update_ydoc(&initial_bin, updated_md, doc_id).expect("Should compute delta");

    // Delta should be smaller than a full document (indicates true delta encoding)
    // Note: For small changes, delta might not always be smaller due to overhead
    assert!(!delta.is_empty(), "Delta should contain changes");

    // Apply delta and verify
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta with new block");

    // Verify block count increased
    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    let block_count = blocks_map.len();
    // Should have: page + note + 2 content blocks = 4 blocks
    assert!(block_count >= 4, "Should have at least 4 blocks, got {}", block_count);

    println!(
      "Add block test: initial={} bytes, delta={} bytes, blocks={}",
      initial_size,
      delta.len(),
      block_count
    );
  }

  #[test]
  fn test_update_ydoc_delete_block() {
    use crate::doc_parser::markdown_to_ydoc;

    // Create initial document with two paragraphs
    let initial_md = "# Delete Block Test\n\nFirst paragraph.\n\nSecond paragraph to delete.";
    let doc_id = "delete-block-test";

    let initial_bin = markdown_to_ydoc(initial_md, doc_id).expect("Should create initial doc");

    // Remove the second paragraph
    let updated_md = "# Delete Block Test\n\nFirst paragraph.";
    let delta = update_ydoc(&initial_bin, updated_md, doc_id).expect("Should compute delta");

    assert!(!delta.is_empty(), "Delta should contain changes");

    // Apply delta and verify
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta with block deletion");

    // Verify document still valid
    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    assert!(!blocks_map.is_empty(), "Blocks should not be empty after deletion");
  }

  #[test]
  fn test_update_ydoc_concurrent_merge_simulation() {
    use crate::doc_parser::markdown_to_ydoc;

    // This test simulates concurrent editing by creating two different updates
    // from the same base document and merging them.
    let base_md = "# Concurrent Test\n\nBase paragraph.";
    let doc_id = "concurrent-test";

    let base_bin = markdown_to_ydoc(base_md, doc_id).expect("Should create base doc");

    // Client A modifies the paragraph
    let client_a_md = "# Concurrent Test\n\nModified by client A.";
    let delta_a = update_ydoc(&base_bin, client_a_md, doc_id).expect("Delta A");

    // Client B adds a new paragraph (from same base)
    let client_b_md = "# Concurrent Test\n\nBase paragraph.\n\nAdded by client B.";
    let delta_b = update_ydoc(&base_bin, client_b_md, doc_id).expect("Delta B");

    // Apply both deltas to base document
    let mut final_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    final_doc.apply_update_from_binary_v1(&base_bin).expect("Apply base");
    final_doc.apply_update_from_binary_v1(&delta_a).expect("Apply delta A");
    final_doc.apply_update_from_binary_v1(&delta_b).expect("Apply delta B");

    // Document should be valid with merged changes
    let blocks_map = final_doc.get_map("blocks").expect("Should have blocks");
    assert!(!blocks_map.is_empty(), "Merged document should have blocks");

    // Should have more blocks than just page + note + 1 paragraph
    // The merge should result in at least 4 blocks (page, note, modified para, new
    // para)
    let block_count = blocks_map.len();
    println!("Concurrent merge test: final block count = {}", block_count);
    assert!(block_count >= 4, "Should have merged blocks, got {}", block_count);
  }

  #[test]
  fn test_update_ydoc_empty_binary_fallback() {
    // Test that update_ydoc falls back to markdown_to_ydoc for empty binaries
    let markdown = "# New Document\n\nCreated from empty binary.";
    let doc_id = "empty-fallback-test";

    // Empty binary should trigger fallback
    let result = update_ydoc(&[], markdown, doc_id).expect("Should create from empty");
    assert!(!result.is_empty(), "Result should not be empty");

    // [0, 0] minimal empty binary should also trigger fallback
    let result = update_ydoc(&[0, 0], markdown, doc_id).expect("Should create from minimal empty");
    assert!(!result.is_empty(), "Result should not be empty");

    // Verify the result is a valid document
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&result)
      .expect("Should apply created doc");

    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    assert!(!blocks_map.is_empty(), "Document created from empty should have blocks");
  }
}
