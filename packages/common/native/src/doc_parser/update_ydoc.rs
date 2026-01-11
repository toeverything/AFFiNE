//! Update YDoc module
//!
//! Provides functionality to update existing AFFiNE documents.
//!
//! Currently, updates replace the entire document content rather than computing
//! deltas due to y-octo/Yjs binary encoding incompatibility. The structural
//! diff code is preserved for future use when this is resolved.

// These imports and types are used by the delta diff code which is currently
// disabled but preserved for future use. Suppress unused warnings.
#[allow(unused_imports)]
use std::collections::HashMap;

#[allow(unused_imports)]
use y_octo::{Any, Doc, DocOptions, Map};

use super::affine::ParseError;
#[allow(unused_imports)]
use super::blocksuite::{collect_child_ids, get_string};
#[allow(unused_imports)]
use super::markdown_utils::{BlockFlavour, ParsedBlock, extract_title, parse_markdown_blocks};

#[allow(dead_code)]
const PAGE_FLAVOUR: &str = "affine:page";
#[allow(dead_code)]
const NOTE_FLAVOUR: &str = "affine:note";

/// Represents a content block for diffing purposes
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq)]
pub struct ContentBlock {
  pub flavour: String,
  pub block_type: Option<String>, // h1, h2, text, bulleted, numbered, todo, etc.
  pub content: String,
  pub checked: Option<bool>,    // For todo items
  pub language: Option<String>, // For code blocks
}

#[allow(dead_code)]
impl ContentBlock {
  /// Check if two blocks are similar enough to be considered "the same" for diffing
  fn is_similar(&self, other: &ContentBlock) -> bool {
    self.flavour == other.flavour && self.block_type == other.block_type
  }
}

/// Converts a ParsedBlock from the shared parser into a ContentBlock
#[allow(dead_code)]
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
#[allow(dead_code)]
struct ExistingDoc {
  doc: Doc,
  page_id: String,
  note_id: String,
  content_block_ids: Vec<String>,
  content_blocks: Vec<(String, ContentBlock)>, // (id, block)
}

/// Represents a diff operation
#[allow(dead_code)]
#[derive(Debug)]
enum DiffOp {
  Keep(usize),          // old_idx - block unchanged
  Delete(usize),        // old_idx - block removed
  Insert(usize),        // new_idx - block added
  Update(usize, usize), // (old_idx, new_idx) - block content changed
}

/// Updates an existing document with new markdown content.
///
/// Currently, this function replaces the entire document content rather than
/// computing a delta. This is because y-octo's delta encoding is not fully
/// compatible with Yjs when applied to existing documents.
///
/// Future improvement: Implement proper delta computation once y-octo/Yjs
/// binary compatibility is resolved.
///
/// # Arguments
/// * `_existing_binary` - The current document binary (currently unused)
/// * `new_markdown` - The new markdown content
/// * `doc_id` - The document ID
///
/// # Returns
/// A binary vector containing the full document (replaces existing content)
pub fn update_ydoc(_existing_binary: &[u8], new_markdown: &str, doc_id: &str) -> Result<Vec<u8>, ParseError> {
  // Due to y-octo/Yjs delta encoding incompatibility, we create a fresh document
  // with the new content. This replaces the document entirely rather than merging.
  //
  // TODO: Implement proper delta computation when y-octo produces Yjs-compatible
  // deltas. The structural diff code below can be re-enabled at that time.
  super::markdown_to_ydoc::markdown_to_ydoc(new_markdown, doc_id)
}

/// Loads an existing document and extracts its structure
#[allow(dead_code)]
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
    .find(|id| block_pool.get(id).and_then(|b| get_string(b, "sys:flavour")).as_deref() == Some(NOTE_FLAVOUR))
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
#[allow(dead_code)]
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

/// Parses markdown into content blocks for diffing.
///
/// Uses the shared `parse_markdown_blocks` function and converts to `ContentBlock`.
#[allow(dead_code)]
fn parse_markdown_to_content_blocks(markdown: &str) -> Result<Vec<ContentBlock>, ParseError> {
  let parsed_blocks = parse_markdown_blocks(markdown, true);
  Ok(parsed_blocks.into_iter().map(ContentBlock::from).collect())
}

/// Updates the document title if it has changed
#[allow(dead_code)]
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
#[allow(dead_code)]
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
#[allow(dead_code)]
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
    update_note_children(&mut blocks_map, &existing.note_id, &existing.doc, new_children)?;
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

/// Creates an empty Text, inserts it into the parent map, then returns it for population.
#[allow(dead_code)]
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

/// Creates an empty Array, inserts it into the parent map, then returns it for population.
#[allow(dead_code)]
fn insert_and_get_array(doc: &Doc, parent_map: &mut Map, key: &str) -> Result<y_octo::Array, ParseError> {
  let array = doc.create_array().map_err(|e| ParseError::ParserError(e.to_string()))?;
  parent_map
    .insert(key.to_string(), array)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  parent_map
    .get(key)
    .and_then(|v| v.to_array())
    .ok_or_else(|| ParseError::ParserError("Failed to retrieve inserted array".into()))
}

/// Creates a new block in the blocks map
///
/// IMPORTANT: Uses two-phase approach for YJS compatibility:
/// 1. Insert empty map into blocks_map first (gets clock value)
/// 2. Then populate the map with properties (gets later clock values)
/// This ensures parent items have earlier clocks than children.
#[allow(dead_code)]
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

  // Step 3: Insert primitive values (these don't have nested structure issues)
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

  // Step 4: Create and insert children array using two-phase helper
  insert_and_get_array(doc, &mut block_map, "sys:children")?;

  // Step 5: Create and insert text using two-phase helper, then populate
  if !block.content.is_empty() {
    let mut text = insert_and_get_text(doc, &mut block_map, "prop:text")?;
    text
      .insert(0, &block.content)
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  Ok(block_id)
}

/// Updates an existing block's content using text-level diff
#[allow(dead_code)]
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
    // Block didn't have text before, but now it does (e.g., divider becoming paragraph)
    // Use two-phase helper to avoid forward parent references
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
        block
          .insert("prop:checked".to_string(), Any::Undefined)
          .map_err(|e| ParseError::ParserError(e.to_string()))?;
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
        block
          .insert("prop:language".to_string(), Any::Undefined)
          .map_err(|e| ParseError::ParserError(e.to_string()))?;
      }
    }
  }

  Ok(())
}

/// Applies a text-level diff to a YText field
#[allow(dead_code)]
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
        // Debug assertion: negative position indicates a bug in diff computation
        debug_assert!(
          raw_pos >= 0,
          "Unexpected negative position in Delete: start_utf16={}, offset={}, raw_pos={}",
          start_utf16,
          offset,
          raw_pos
        );
        let adjusted_start = raw_pos.max(0) as u64;
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
        // Debug assertion: negative position indicates a bug in diff computation
        debug_assert!(
          raw_pos >= 0,
          "Unexpected negative position in Insert: pos_utf16={}, offset={}, raw_pos={}",
          pos_utf16,
          offset,
          raw_pos
        );
        let adjusted_pos = raw_pos.max(0) as u64;
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

#[allow(dead_code)]
#[derive(Debug)]
enum TextDiffOp {
  /// Delete operation with UTF-16 code unit positions
  Delete { start_utf16: usize, len_utf16: usize },
  /// Insert operation with UTF-16 code unit position and text to insert
  Insert { pos_utf16: usize, text: String },
}

/// Computes character-level diff between two strings using greedy matching.
/// Returns operations with UTF-16 code unit positions (required by y_octo).
#[allow(dead_code)]
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
  for i in 0..prefix_len {
    edits.push(Edit::Keep(old[i]));
  }

  // Delete middle of old
  for i in 0..old_mid_len {
    edits.push(Edit::Delete(old[prefix_len + i]));
  }

  // Insert middle of new
  for i in 0..new_mid_len {
    edits.push(Edit::Insert(new[new_mid_start + i]));
  }

  // Keep suffix (store the actual chars for UTF-16 length calculation)
  for i in 0..suffix_len {
    edits.push(Edit::Keep(old[prefix_len + old_mid_len + i]));
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
#[allow(dead_code)]
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
    // Check if children actually changed
    let existing_children: Vec<String> = children
      .iter()
      .filter_map(|v| {
        v.to_any().and_then(|a| match a {
          Any::String(s) => Some(s.clone()),
          _ => None,
        })
      })
      .collect();

    // Only update if different
    if existing_children != new_children {
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
    }
  } else {
    // Create new children array using two-phase helper
    let mut children = insert_and_get_array(doc, &mut note_block, "sys:children")?;
    for (idx, child_id) in new_children.into_iter().enumerate() {
      children
        .insert(idx as u64, Any::String(child_id))
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
  }

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
  fn test_update_ydoc_creates_valid_document() {
    // Since update_ydoc now creates a fresh document (not delta),
    // we just verify the output is a valid document
    let markdown = "# Test Document\n\nFirst paragraph.\n\nSecond paragraph.";
    let doc_id = "update-test";

    // Existing binary doesn't matter - we create fresh
    let result = update_ydoc(&[], markdown, doc_id).expect("Should create doc");
    assert!(!result.is_empty(), "Result should not be empty");

    // Verify it's a valid document
    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&result).expect("Should apply result");

    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    assert!(!blocks_map.is_empty(), "Blocks should not be empty");
  }

  #[test]
  fn test_update_ydoc_with_different_content() {
    // Test that update_ydoc correctly creates a document with new content
    let markdown = "# New Title\n\nCompletely new content.";
    let doc_id = "update-new-content-test";

    // Even with existing binary, we create fresh with new content
    let existing = vec![0, 0]; // Empty doc binary
    let result = update_ydoc(&existing, markdown, doc_id).expect("Should create doc");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&result).expect("Should apply result");

    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    // Should have: page + note + 1 content block = 3 blocks
    assert!(blocks_map.len() >= 3, "Should have at least 3 blocks");
  }

  #[test]
  fn test_update_ydoc_with_complex_content() {
    // Test that update_ydoc handles complex markdown
    let markdown = r#"# Complex Document

## Section 1

Paragraph text here.

- List item 1
- List item 2

```rust
fn main() {}
```

---

Final paragraph.
"#;
    let doc_id = "update-complex-test";

    let result = update_ydoc(&[], markdown, doc_id).expect("Should create doc");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&result).expect("Should apply result");

    let blocks_map = doc.get_map("blocks").expect("Should have blocks");
    // Should have multiple blocks for complex content
    assert!(blocks_map.len() >= 5, "Should have many blocks for complex content");
  }
}
