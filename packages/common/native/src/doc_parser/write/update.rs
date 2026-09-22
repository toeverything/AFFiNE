//! Update YDoc module
//!
//! Provides functionality to update existing AFFiNE documents by applying
//! surgical y-octo operations based on content differences.

use std::collections::HashMap;

use super::{
  super::{
    block_spec::{TreeNode, count_tree_nodes, text_delta_eq},
    blocksuite::{collect_child_ids, find_child_id_by_flavour, get_string},
    markdown::{MAX_BLOCKS, parse_markdown_blocks},
    schema::{PROP_BACKGROUND, PROP_DISPLAY_MODE, PROP_ELEMENTS, PROP_HIDDEN, PROP_INDEX, PROP_XYWH, SURFACE_FLAVOUR},
  },
  builder::{
    ApplyBlockOptions, BOXED_NATIVE_TYPE, NOTE_BG_DARK, NOTE_BG_LIGHT, apply_block_spec, boxed_empty_map,
    insert_block_map, insert_block_tree, insert_children, insert_sys_fields, insert_text, note_background_map,
    text_ops_from_plain,
  },
  *,
};

const MAX_LCS_CELLS: usize = 2_000_000;

#[derive(Debug, Clone)]
enum NodeSpec {
  Supported(BlockSpec),
  /// A block flavour we don't support for markdown diffing/updating (e.g.
  /// `affine:database`).
  ///
  /// These nodes are treated as opaque: we preserve them and never modify their
  /// properties/children.
  Opaque {
    flavour: String,
  },
}

#[derive(Debug, Clone)]
struct StoredNode {
  id: String,
  spec: NodeSpec,
  children: Vec<StoredNode>,
}

impl TreeNode for StoredNode {
  fn children(&self) -> &[StoredNode] {
    &self.children
  }
}

#[derive(Debug, Clone)]
struct TargetNode {
  /// Optional block id marker from exported markdown (AI-editable markers).
  id_hint: Option<String>,
  spec: NodeSpec,
  children: Vec<TargetNode>,
}

impl TreeNode for TargetNode {
  fn children(&self) -> &[TargetNode] {
    &self.children
  }
}

struct DocState {
  doc: Doc,
  note_id: String,
  blocks: Vec<StoredNode>,
}

#[derive(Debug)]
enum PatchOp {
  Keep(usize, usize),
  Delete(usize),
  Insert(usize),
  Update(usize, usize),
}

/// Updates an existing document with new markdown content.
///
/// This function performs structural diffing between the existing document
/// and the new markdown content, then applies block-level replacements
/// for changed blocks. This enables proper CRDT merging with concurrent
/// edits from other clients.
///
/// # Arguments
/// * `existing_binary` - The current document binary
/// * `new_markdown` - The new markdown content (document title is not updated)
/// * `doc_id` - The document ID
///
/// # Returns
/// A binary vector representing only the delta (changes) to apply
pub fn update_doc(existing_binary: &[u8], new_markdown: &str, doc_id: &str) -> Result<Vec<u8>, ParseError> {
  let state = match load_doc_state(existing_binary, doc_id) {
    Ok(state) => state,
    Err(ParseError::ParserError(msg))
      if matches!(
        msg.as_str(),
        "blocks map is empty" | "page block not found" | "note block not found"
      ) =>
    {
      // The existing doc may be a stub/partial document (e.g. created by references)
      // and doesn't contain the canonical page/note structure yet. In that
      // case, initialize the doc from the markdown instead of failing hard.
      let new_nodes = parse_markdown_blocks(new_markdown)?;
      return init_doc_from_markdown(existing_binary, new_markdown, doc_id, &new_nodes);
    }
    Err(err) => return Err(err),
  };

  let mut new_nodes = parse_markdown_targets(new_markdown)?;

  check_limits(&state.blocks, &new_nodes)?;

  let state_before = state.doc.get_state_vector();

  let mut blocks_map = state.doc.get_map("blocks")?;

  let new_children = sync_nodes(&state.doc, &mut blocks_map, &state.blocks, &mut new_nodes)?;
  sync_children(&state.doc, &mut blocks_map, &state.note_id, &new_children)?;

  Ok(state.doc.encode_state_as_update_v1(&state_before)?)
}

#[derive(Debug, Clone)]
struct BlockMarker {
  id: String,
  flavour: String,
  end: bool,
}

fn parse_block_marker_line(line: &str) -> Option<BlockMarker> {
  let trimmed = line.trim();
  if !trimmed.starts_with("<!--") || !trimmed.ends_with("-->") {
    return None;
  }
  let body = trimmed.trim_start_matches("<!--").trim_end_matches("-->").trim();
  if !body.contains("block_id=") || !body.contains("flavour=") {
    return None;
  }

  let mut id: Option<String> = None;
  let mut flavour: Option<String> = None;
  let mut end = false;

  for token in body.split_whitespace() {
    if token == "end" || token == "type=end" || token == "end=true" {
      end = true;
      continue;
    }
    if let Some(value) = token.strip_prefix("block_id=") {
      if !value.is_empty() {
        id = Some(value.to_string());
      }
      continue;
    }
    if let Some(value) = token.strip_prefix("flavour=") {
      if !value.is_empty() {
        flavour = Some(value.to_string());
      }
      continue;
    }
  }

  Some(BlockMarker {
    id: id?,
    flavour: flavour?,
    end,
  })
}

fn should_preserve_marker_flavour(flavour: &str) -> bool {
  matches!(flavour, "affine:database" | "affine:callout")
}

fn parse_markdown_targets(markdown: &str) -> Result<Vec<TargetNode>, ParseError> {
  // Fast path: no markers, behave like the original implementation.
  if !markdown.contains("block_id=") || !markdown.contains("flavour=") {
    let blocks = parse_markdown_blocks(markdown)?;
    return Ok(blocks.into_iter().map(|b| target_from_block_node(b, None)).collect());
  }

  // Split the markdown by marker comments. For most blocks, a marker indicates
  // the start of a block. For preserved blocks (e.g. database), an optional end
  // marker can be emitted so users can append new content after the preserved
  // section without needing to add markers manually.
  let mut segments: Vec<(Option<BlockMarker>, String)> = Vec::new();
  let mut current_marker: Option<BlockMarker> = None;
  let mut current_body = String::new();
  let mut saw_marker = false;

  for line in markdown.lines() {
    if let Some(marker) = parse_block_marker_line(line) {
      saw_marker = true;
      if marker.end {
        if current_marker.is_some() || !current_body.is_empty() {
          segments.push((current_marker.take(), std::mem::take(&mut current_body)));
        }
        // Close the marker scope; subsequent lines belong to an unmarked segment.
        current_marker = None;
        continue;
      }

      if current_marker.is_some() || !current_body.is_empty() {
        segments.push((current_marker.take(), std::mem::take(&mut current_body)));
      }
      current_marker = Some(marker);
      continue;
    }

    current_body.push_str(line);
    current_body.push('\n');
  }

  if current_marker.is_some() || !current_body.is_empty() {
    segments.push((current_marker.take(), current_body));
  }

  if !saw_marker {
    let blocks = parse_markdown_blocks(markdown)?;
    return Ok(blocks.into_iter().map(|b| target_from_block_node(b, None)).collect());
  }

  let mut out: Vec<TargetNode> = Vec::new();
  for (marker, body) in segments {
    if let Some(marker) = marker {
      let preserve =
        should_preserve_marker_flavour(&marker.flavour) || BlockFlavour::from_str(&marker.flavour).is_none();
      if preserve {
        out.push(TargetNode {
          id_hint: Some(marker.id),
          spec: NodeSpec::Opaque {
            flavour: marker.flavour,
          },
          children: Vec::new(),
        });
        continue;
      }

      let blocks = parse_markdown_blocks(&body)?;
      for (idx, block) in blocks.into_iter().enumerate() {
        let id_hint = if idx == 0 { Some(marker.id.clone()) } else { None };
        out.push(target_from_block_node(block, id_hint));
      }
      continue;
    }

    let trimmed = body.trim();
    if trimmed.is_empty() {
      continue;
    }

    let blocks = parse_markdown_blocks(&body)?;
    for block in blocks {
      out.push(target_from_block_node(block, None));
    }
  }

  Ok(out)
}

fn target_from_block_node(node: BlockNode, id_hint: Option<String>) -> TargetNode {
  TargetNode {
    id_hint,
    spec: NodeSpec::Supported(node.spec),
    children: node
      .children
      .into_iter()
      .map(|child| target_from_block_node(child, None))
      .collect(),
  }
}

fn target_node_to_block_node(node: &TargetNode) -> Result<BlockNode, ParseError> {
  let NodeSpec::Supported(spec) = &node.spec else {
    return Err(ParseError::ParserError("cannot_insert_opaque_block".into()));
  };
  Ok(BlockNode {
    spec: spec.clone(),
    children: node
      .children
      .iter()
      .map(target_node_to_block_node)
      .collect::<Result<Vec<_>, _>>()?,
  })
}

fn init_doc_from_markdown(
  existing_binary: &[u8],
  new_markdown: &str,
  doc_id: &str,
  blocks: &[BlockNode],
) -> Result<Vec<u8>, ParseError> {
  let doc = load_doc(existing_binary, Some(doc_id))?;
  let state_before = doc.get_state_vector();
  let mut blocks_map = doc.get_or_create_map("blocks")?;

  let title = derive_title_from_markdown(new_markdown).unwrap_or_else(|| "Untitled".to_string());
  // Prefer reusing an existing page block if the doc already has one (but is
  // missing surface/note). This avoids creating multiple page roots when
  // recovering from partial documents.
  if !blocks_map.is_empty() {
    let index = build_block_index(&blocks_map);
    if let Some(page_id) = find_block_id_by_flavour(&index.block_pool, PAGE_FLAVOUR) {
      insert_page_children(&doc, &mut blocks_map, &page_id, &title, blocks)?;
      return Ok(doc.encode_state_as_update_v1(&state_before)?);
    }
  }

  insert_page_doc(&doc, &mut blocks_map, &title, blocks)?;

  Ok(doc.encode_state_as_update_v1(&state_before)?)
}

fn derive_title_from_markdown(markdown: &str) -> Option<String> {
  for line in markdown.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    if let Some(rest) = trimmed.strip_prefix("# ") {
      let title = rest.trim();
      if !title.is_empty() {
        return Some(title.to_string());
      }
    }
  }
  None
}

fn insert_page_doc(doc: &Doc, blocks_map: &mut Map, title: &str, blocks: &[BlockNode]) -> Result<(), ParseError> {
  let page_id = nanoid::nanoid!();
  let surface_id = nanoid::nanoid!();
  let note_id = nanoid::nanoid!();

  // Insert root blocks first to establish stable IDs.
  let mut page_map = insert_block_map(doc, blocks_map, &page_id)?;
  let mut surface_map = insert_block_map(doc, blocks_map, &surface_id)?;
  let mut note_map = insert_block_map(doc, blocks_map, &note_id)?;

  // Create content blocks under note.
  let content_ids = insert_block_trees(doc, blocks_map, blocks)?;

  // Page block.
  insert_sys_fields(&mut page_map, &page_id, PAGE_FLAVOUR)?;
  insert_children(doc, &mut page_map, &[surface_id.clone(), note_id.clone()])?;
  insert_text(doc, &mut page_map, PROP_TITLE, &text_ops_from_plain(title))?;

  // Surface block.
  insert_sys_fields(&mut surface_map, &surface_id, SURFACE_FLAVOUR)?;
  insert_children(doc, &mut surface_map, &[])?;
  let mut boxed = boxed_empty_map(doc)?;
  surface_map.insert(PROP_ELEMENTS.to_string(), Value::Map(boxed.clone()))?;
  boxed.insert("type".to_string(), Any::String(BOXED_NATIVE_TYPE.to_string()))?;
  let value = doc.create_map()?;
  boxed.insert("value".to_string(), Value::Map(value))?;

  // Note block.
  insert_sys_fields(&mut note_map, &note_id, NOTE_FLAVOUR)?;
  insert_children(doc, &mut note_map, &content_ids)?;
  let mut background = note_background_map(doc)?;
  note_map.insert(PROP_BACKGROUND.to_string(), Value::Map(background.clone()))?;
  background.insert("light".to_string(), Any::String(NOTE_BG_LIGHT.to_string()))?;
  background.insert("dark".to_string(), Any::String(NOTE_BG_DARK.to_string()))?;
  note_map.insert(PROP_XYWH.to_string(), Any::String("[0,0,800,95]".to_string()))?;
  note_map.insert(PROP_INDEX.to_string(), Any::String("a0".to_string()))?;
  note_map.insert(PROP_HIDDEN.to_string(), Any::False)?;
  note_map.insert(PROP_DISPLAY_MODE.to_string(), Any::String("both".to_string()))?;

  Ok(())
}

fn insert_page_children(
  doc: &Doc,
  blocks_map: &mut Map,
  page_id: &str,
  title: &str,
  blocks: &[BlockNode],
) -> Result<(), ParseError> {
  let surface_id = nanoid::nanoid!();
  let note_id = nanoid::nanoid!();

  // Insert root blocks first to establish stable IDs.
  let mut surface_map = insert_block_map(doc, blocks_map, &surface_id)?;
  let mut note_map = insert_block_map(doc, blocks_map, &note_id)?;

  // Create content blocks under note.
  let content_ids = insert_block_trees(doc, blocks_map, blocks)?;

  let Some(mut page_map) = blocks_map.get(page_id).and_then(|v| v.to_map()) else {
    return Err(ParseError::ParserError("page block not found".into()));
  };

  // Page block.
  insert_sys_fields(&mut page_map, page_id, PAGE_FLAVOUR)?;
  insert_children(doc, &mut page_map, &[surface_id.clone(), note_id.clone()])?;
  if page_map.get(PROP_TITLE).is_none() {
    insert_text(doc, &mut page_map, PROP_TITLE, &text_ops_from_plain(title))?;
  }

  // Surface block.
  insert_sys_fields(&mut surface_map, &surface_id, SURFACE_FLAVOUR)?;
  insert_children(doc, &mut surface_map, &[])?;
  let mut boxed = boxed_empty_map(doc)?;
  surface_map.insert(PROP_ELEMENTS.to_string(), Value::Map(boxed.clone()))?;
  boxed.insert("type".to_string(), Any::String(BOXED_NATIVE_TYPE.to_string()))?;
  let value = doc.create_map()?;
  boxed.insert("value".to_string(), Value::Map(value))?;

  // Note block.
  insert_sys_fields(&mut note_map, &note_id, NOTE_FLAVOUR)?;
  insert_children(doc, &mut note_map, &content_ids)?;
  let mut background = note_background_map(doc)?;
  note_map.insert(PROP_BACKGROUND.to_string(), Value::Map(background.clone()))?;
  background.insert("light".to_string(), Any::String(NOTE_BG_LIGHT.to_string()))?;
  background.insert("dark".to_string(), Any::String(NOTE_BG_DARK.to_string()))?;
  note_map.insert(PROP_XYWH.to_string(), Any::String("[0,0,800,95]".to_string()))?;
  note_map.insert(PROP_INDEX.to_string(), Any::String("a0".to_string()))?;
  note_map.insert(PROP_HIDDEN.to_string(), Any::False)?;
  note_map.insert(PROP_DISPLAY_MODE.to_string(), Any::String("both".to_string()))?;

  Ok(())
}

fn insert_block_trees(doc: &Doc, blocks_map: &mut Map, blocks: &[BlockNode]) -> Result<Vec<String>, ParseError> {
  let mut ids = Vec::with_capacity(blocks.len());
  for block in blocks {
    let id = insert_block_tree(doc, blocks_map, block)?;
    ids.push(id);
  }
  Ok(ids)
}

fn load_doc_state(binary: &[u8], doc_id: &str) -> Result<DocState, ParseError> {
  let doc = load_doc(binary, Some(doc_id))?;

  let blocks_map = doc.get_map("blocks")?;
  if blocks_map.is_empty() {
    return Err(ParseError::ParserError("blocks map is empty".into()));
  }

  let block_index = build_block_index(&blocks_map);
  let page_id = find_block_id_by_flavour(&block_index.block_pool, PAGE_FLAVOUR)
    .ok_or_else(|| ParseError::ParserError("page block not found".into()))?;
  let page_block = block_index
    .block_pool
    .get(&page_id)
    .ok_or_else(|| ParseError::ParserError("page block not found".into()))?;
  let note_id = find_child_id_by_flavour(page_block, &block_index.block_pool, NOTE_FLAVOUR)
    .ok_or_else(|| ParseError::ParserError("note block not found".into()))?;
  let note_block = block_index
    .block_pool
    .get(&note_id)
    .ok_or_else(|| ParseError::ParserError("note block not found".into()))?;
  let content_ids = collect_child_ids(note_block);

  let mut blocks = Vec::new();
  for block_id in content_ids {
    let block = block_index
      .block_pool
      .get(&block_id)
      .ok_or_else(|| ParseError::ParserError("content block not found".into()))?;
    blocks.push(build_stored_tree(&block_id, block, &block_index.block_pool)?);
  }

  Ok(DocState { doc, note_id, blocks })
}

fn build_stored_tree(block_id: &str, block: &Map, pool: &HashMap<String, Map>) -> Result<StoredNode, ParseError> {
  let child_ids = collect_child_ids(block);
  let flavour = get_string(block, "sys:flavour").unwrap_or_default();

  let spec = match BlockSpec::from_block_map(block) {
    Ok(spec) => spec,
    Err(ParseError::ParserError(msg)) if msg.starts_with("unsupported block flavour:") => {
      return Ok(StoredNode {
        id: block_id.to_string(),
        spec: NodeSpec::Opaque { flavour },
        children: Vec::new(),
      });
    }
    Err(err) => return Err(err),
  };

  // Only list/callout are supported as containers for markdown diffing.
  // For any other block with children, treat as opaque so we never corrupt it.
  if !child_ids.is_empty() && !matches!(spec.flavour, BlockFlavour::List | BlockFlavour::Callout) {
    return Ok(StoredNode {
      id: block_id.to_string(),
      spec: NodeSpec::Opaque { flavour },
      children: Vec::new(),
    });
  }

  let mut children = Vec::new();
  for child_id in child_ids {
    let child_block = pool
      .get(&child_id)
      .ok_or_else(|| ParseError::ParserError("child block not found".into()))?;
    children.push(build_stored_tree(&child_id, child_block, pool)?);
  }

  Ok(StoredNode {
    id: block_id.to_string(),
    spec: NodeSpec::Supported(spec),
    children,
  })
}

fn sync_nodes(
  doc: &Doc,
  blocks_map: &mut Map,
  current: &[StoredNode],
  target: &mut [TargetNode],
) -> Result<Vec<String>, ParseError> {
  let ops = diff_blocks(current, target);
  let mut new_children = Vec::new();
  let mut to_remove = Vec::new();

  for op in ops {
    match op {
      PatchOp::Keep(old_idx, new_idx) => {
        let old_node = &current[old_idx];
        let new_node = &target[new_idx];
        if let (NodeSpec::Supported(old_spec), NodeSpec::Supported(new_spec)) = (&old_node.spec, &new_node.spec) {
          update_block_props(doc, blocks_map, &old_node.id, old_spec, new_spec, true)?;
          let child_ids = sync_nodes(doc, blocks_map, &old_node.children, &mut new_node.children.clone())?;
          sync_children(doc, blocks_map, &old_node.id, &child_ids)?;
        } else {
          // Preserve opaque blocks (and any mismatched marker blocks) as-is.
          // Don't touch their properties or children ordering.
        }
        new_children.push(old_node.id.clone());
      }
      PatchOp::Update(old_idx, new_idx) => {
        let old_node = &current[old_idx];
        let new_node = &target[new_idx];
        if let (NodeSpec::Supported(old_spec), NodeSpec::Supported(new_spec)) = (&old_node.spec, &new_node.spec) {
          update_block_props(doc, blocks_map, &old_node.id, old_spec, new_spec, false)?;
          let child_ids = sync_nodes(doc, blocks_map, &old_node.children, &mut new_node.children.clone())?;
          sync_children(doc, blocks_map, &old_node.id, &child_ids)?;
        } else {
          // Opaque blocks are never updated from markdown.
        }
        new_children.push(old_node.id.clone());
      }
      PatchOp::Insert(new_idx) => {
        if let Ok(node) = target_node_to_block_node(&target[new_idx]) {
          let new_id = insert_block_tree(doc, blocks_map, &node)?;
          new_children.push(new_id);
        }
      }
      PatchOp::Delete(old_idx) => {
        let node = &current[old_idx];
        match &node.spec {
          NodeSpec::Opaque { .. } => {
            // Never delete opaque blocks when syncing from markdown. They might contain
            // rich data that can't be represented in markdown, so keeping them
            // avoids data loss.
            new_children.push(node.id.clone());
          }
          NodeSpec::Supported(spec) if spec.flavour == BlockFlavour::Callout => {
            new_children.push(node.id.clone());
          }
          NodeSpec::Supported(_) => collect_tree_ids(node, &mut to_remove),
        }
      }
    }
  }

  for id in to_remove {
    blocks_map.remove(&id);
  }

  Ok(new_children)
}

fn diff_blocks(current: &[StoredNode], target: &[TargetNode]) -> Vec<PatchOp> {
  let old_len = current.len();
  let new_len = target.len();

  if old_len == 0 {
    return (0..new_len).map(PatchOp::Insert).collect();
  }
  if new_len == 0 {
    return (0..old_len).map(PatchOp::Delete).collect();
  }

  let mut lcs = vec![vec![0usize; new_len + 1]; old_len + 1];

  for i in 1..=old_len {
    for j in 1..=new_len {
      let old_node = &current[i - 1];
      let new_node = &target[j - 1];

      if nodes_align(old_node, new_node) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = std::cmp::max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  let mut ops = Vec::new();
  let mut i = old_len;
  let mut j = new_len;

  while i > 0 || j > 0 {
    if i > 0 && j > 0 {
      let old_node = &current[i - 1];
      let new_node = &target[j - 1];

      if nodes_align(old_node, new_node) {
        if nodes_should_update(old_node, new_node) {
          ops.push(PatchOp::Update(i - 1, j - 1));
        } else {
          ops.push(PatchOp::Keep(i - 1, j - 1));
        }
        i -= 1;
        j -= 1;
      } else if nodes_similar(old_node, new_node)
        && lcs[i - 1][j - 1] >= lcs[i - 1][j]
        && lcs[i - 1][j - 1] >= lcs[i][j - 1]
      {
        ops.push(PatchOp::Update(i - 1, j - 1));
        i -= 1;
        j -= 1;
      } else if lcs[i][j - 1] >= lcs[i - 1][j] {
        ops.push(PatchOp::Insert(j - 1));
        j -= 1;
      } else {
        ops.push(PatchOp::Delete(i - 1));
        i -= 1;
      }
    } else if j > 0 {
      ops.push(PatchOp::Insert(j - 1));
      j -= 1;
    } else {
      ops.push(PatchOp::Delete(i - 1));
      i -= 1;
    }
  }

  ops.reverse();
  ops
}

fn nodes_align(old_node: &StoredNode, new_node: &TargetNode) -> bool {
  if marker_matches(old_node, new_node) {
    return true;
  }
  match (&old_node.spec, &new_node.spec) {
    (NodeSpec::Supported(old_spec), NodeSpec::Supported(new_spec)) => old_spec.is_exact(new_spec),
    _ => false,
  }
}

fn nodes_should_update(old_node: &StoredNode, new_node: &TargetNode) -> bool {
  if marker_matches(old_node, new_node) {
    return match (&old_node.spec, &new_node.spec) {
      (NodeSpec::Supported(old_spec), NodeSpec::Supported(new_spec)) => !old_spec.is_exact(new_spec),
      _ => false,
    };
  }
  false
}

fn nodes_similar(old_node: &StoredNode, new_node: &TargetNode) -> bool {
  match (&old_node.spec, &new_node.spec) {
    (NodeSpec::Supported(old_spec), NodeSpec::Supported(new_spec)) => old_spec.is_similar(new_spec),
    _ => false,
  }
}

fn marker_matches(old_node: &StoredNode, new_node: &TargetNode) -> bool {
  let Some(id) = new_node.id_hint.as_deref() else {
    return false;
  };
  if id != old_node.id.as_str() {
    return false;
  }
  node_flavour_str(&old_node.spec) == node_flavour_str(&new_node.spec)
}

fn node_flavour_str(spec: &NodeSpec) -> &str {
  match spec {
    NodeSpec::Supported(spec) => spec.flavour.as_str(),
    NodeSpec::Opaque { flavour } => flavour.as_str(),
  }
}

fn update_block_props(
  doc: &Doc,
  blocks_map: &mut Map,
  node_id: &str,
  current: &BlockSpec,
  target: &BlockSpec,
  preserve_text: bool,
) -> Result<(), ParseError> {
  let Some(mut block) = blocks_map.get(node_id).and_then(|v| v.to_map()) else {
    return Err(ParseError::ParserError(format!("Block {} not found", node_id)));
  };

  let preserve = match target.flavour {
    BlockFlavour::Image
    | BlockFlavour::Table
    | BlockFlavour::Bookmark
    | BlockFlavour::EmbedYoutube
    | BlockFlavour::EmbedIframe => preserve_text,
    _ => preserve_text || text_delta_eq(&current.text, &target.text),
  };

  apply_block_spec(
    doc,
    &mut block,
    target,
    ApplyBlockOptions {
      preserve_text: preserve,
      clear_missing: true,
    },
  )?;

  Ok(())
}

fn sync_children(doc: &Doc, blocks_map: &mut Map, block_id: &str, children: &[String]) -> Result<(), ParseError> {
  let Some(mut block) = blocks_map.get(block_id).and_then(|v| v.to_map()) else {
    return Err(ParseError::ParserError("Block not found".into()));
  };

  let current_children = collect_child_ids(&block);
  if current_children != children {
    insert_children(doc, &mut block, children)?;
  }

  Ok(())
}

fn collect_tree_ids(node: &StoredNode, output: &mut Vec<String>) {
  output.push(node.id.clone());
  for child in &node.children {
    collect_tree_ids(child, output);
  }
}

fn check_limits(current: &[StoredNode], target: &[TargetNode]) -> Result<(), ParseError> {
  let current_count = count_tree_nodes(current);
  let target_count = count_tree_nodes(target);

  if current_count > MAX_BLOCKS || target_count > MAX_BLOCKS {
    return Err(ParseError::ParserError("block_count_too_large".into()));
  }

  if current_count.saturating_mul(target_count) > MAX_LCS_CELLS {
    return Err(ParseError::ParserError("diff_matrix_too_large".into()));
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use y_octo::{Any, DocOptions, StateVector, TextDeltaOp, TextInsert};

  use super::{super::builder::text_ops_from_plain, *};
  use crate::doc_parser::{
    block_spec::BlockType, blocksuite::get_string, build_full_doc, markdown::MAX_MARKDOWN_CHARS, parse_doc_to_markdown,
  };

  #[test]
  fn test_compute_text_diff_simple() {
    let ops = text_ops_from_plain("hello world");
    assert_eq!(ops.len(), 1);
    match &ops[0] {
      TextDeltaOp::Insert {
        insert: TextInsert::Text(text),
        format: None,
      } => {
        assert_eq!(text, "hello world");
      }
      _ => panic!("unexpected delta op"),
    }
  }

  #[test]
  fn test_content_block_similarity() {
    let b1 = BlockSpec {
      flavour: BlockFlavour::Paragraph,
      block_type: Some(BlockType::H1),
      text: text_ops_from_plain("Hello"),
      checked: None,
      language: None,
      order: None,
      image: None,
      table: None,
      bookmark: None,
      embed_youtube: None,
      embed_iframe: None,
    };
    let b2 = BlockSpec {
      flavour: BlockFlavour::Paragraph,
      block_type: Some(BlockType::H1),
      text: text_ops_from_plain("World"),
      checked: None,
      language: None,
      order: None,
      image: None,
      table: None,
      bookmark: None,
      embed_youtube: None,
      embed_iframe: None,
    };
    let b3 = BlockSpec {
      flavour: BlockFlavour::Paragraph,
      block_type: Some(BlockType::H2),
      text: text_ops_from_plain("Hello"),
      checked: None,
      language: None,
      order: None,
      image: None,
      table: None,
      bookmark: None,
      embed_youtube: None,
      embed_iframe: None,
    };

    assert!(b1.is_similar(&b2));
    assert!(!b1.is_similar(&b3));
  }

  #[test]
  fn test_update_ydoc_roundtrip() {
    let initial_md = "# Test Document\n\nFirst paragraph.\n\nSecond paragraph.";
    let doc_id = "update-test";

    let initial_bin = build_full_doc("Test Document", initial_md, doc_id).expect("Should create initial doc");

    let updated_md = "# Test Document\n\nFirst paragraph.\n\nModified second paragraph.\n\nNew third paragraph.";

    let delta = update_doc(&initial_bin, updated_md, doc_id).expect("Should compute delta");
    assert!(!delta.is_empty(), "Delta should contain changes");
  }

  #[test]
  fn test_update_ydoc_does_not_update_page_title() {
    let initial_md = "# Original Title\n\nContent here.";
    let doc_id = "title-test";

    let initial_bin = build_full_doc("Original Title", initial_md, doc_id).expect("Should create initial doc");

    let updated_md = "# New Title\n\nContent here.";
    let delta = update_doc(&initial_bin, updated_md, doc_id).expect("Should compute delta");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc.apply_update_from_binary_v1(&delta).expect("Should apply delta");

    let blocks_map = doc.get_map("blocks").expect("blocks map exists");
    let mut title = None;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some(PAGE_FLAVOUR)
      {
        title = get_string(&block_map, "prop:title");
        break;
      }
    }

    assert_eq!(title.as_deref(), Some("Original Title"));
  }

  #[test]
  fn test_update_ydoc_no_changes() {
    let markdown = "# Same Title\n\nSame content.";
    let doc_id = "no-change-test";

    let initial_bin = build_full_doc("Same Title", markdown, doc_id).expect("Should create initial doc");
    let delta = update_doc(&initial_bin, markdown, doc_id).expect("Should compute delta");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta even with no changes");
  }

  #[test]
  fn test_update_ydoc_ignores_ai_editable_comments() {
    let markdown = "Plain paragraph.";
    let doc_id = "ai-comment-test";

    let initial_bin = build_full_doc("Title", markdown, doc_id).expect("Should create initial doc");

    let ai_markdown = parse_doc_to_markdown(initial_bin.clone(), doc_id.to_string(), true, None)
      .expect("parse doc")
      .markdown;
    assert!(ai_markdown.contains("block_id="));

    let delta = update_doc(&initial_bin, &ai_markdown, doc_id).expect("Should compute delta");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    doc.apply_update_from_binary_v1(&delta).expect("Should apply delta");

    let before = parse_doc_to_markdown(initial_bin, doc_id.to_string(), false, None)
      .expect("parse before")
      .markdown;
    let after = parse_doc_to_markdown(doc.encode_update_v1().unwrap(), doc_id.to_string(), false, None)
      .expect("parse after")
      .markdown;

    assert_eq!(after, before);
  }

  #[test]
  fn test_update_ydoc_add_block() {
    let initial_md = "# Add Block Test\n\nOriginal paragraph.";
    let doc_id = "add-block-test";

    let initial_bin = build_full_doc("Add Block Test", initial_md, doc_id).expect("Should create initial doc");

    let mut initial_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    initial_doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    let initial_count = initial_doc.get_map("blocks").expect("blocks map exists").len();

    let updated_md = "# Add Block Test\n\nOriginal paragraph.\n\nNew paragraph added.";
    let delta = update_doc(&initial_bin, updated_md, doc_id).expect("Should compute delta");
    assert!(!delta.is_empty(), "Delta should contain changes");

    let mut updated_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    updated_doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    updated_doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta with new block");

    let updated_count = updated_doc.get_map("blocks").expect("blocks map exists").len();
    assert!(
      updated_count > initial_count,
      "Expected more blocks after insert, got {updated_count} vs {initial_count}"
    );
  }

  #[test]
  fn test_update_ydoc_delete_block() {
    let initial_md = "# Delete Block Test\n\nFirst paragraph.\n\nSecond paragraph to delete.";
    let doc_id = "delete-block-test";

    let initial_bin = build_full_doc("Delete Block Test", initial_md, doc_id).expect("Should create initial doc");

    let mut initial_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    initial_doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    let initial_count = initial_doc.get_map("blocks").expect("blocks map exists").len();

    let updated_md = "# Delete Block Test\n\nFirst paragraph.";
    let delta = update_doc(&initial_bin, updated_md, doc_id).expect("Should compute delta");
    assert!(!delta.is_empty(), "Delta should contain changes");

    let mut updated_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    updated_doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("Should apply initial");
    updated_doc
      .apply_update_from_binary_v1(&delta)
      .expect("Should apply delta with block deletion");

    let updated_count = updated_doc.get_map("blocks").expect("blocks map exists").len();
    assert!(
      updated_count < initial_count,
      "Expected fewer blocks after deletion, got {updated_count} vs {initial_count}"
    );
  }

  #[test]
  fn test_update_ydoc_update_image_caption() {
    let initial_md = "![Alt](blob://image-id)";
    let doc_id = "image-update-test";
    let initial_bin = build_full_doc("Image", initial_md, doc_id).expect("create doc");

    let updated_md = "![New Caption](blob://image-id)";
    let delta = update_doc(&initial_bin, updated_md, doc_id).expect("delta");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&initial_bin).expect("apply initial");
    doc.apply_update_from_binary_v1(&delta).expect("apply delta");

    let blocks_map = doc.get_map("blocks").expect("blocks map");
    let mut caption = None;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some("affine:image")
      {
        caption = get_string(&block_map, "prop:caption");
        break;
      }
    }

    assert_eq!(caption.as_deref(), Some("New Caption"));
  }

  #[test]
  fn test_update_ydoc_update_table_cell() {
    let initial_md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    let doc_id = "table-update-test";
    let initial_bin = build_full_doc("Table", initial_md, doc_id).expect("create doc");

    let updated_md = "| A | B |\n| --- | --- |\n| 1 | 9 |";
    let delta = update_doc(&initial_bin, updated_md, doc_id).expect("delta");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&initial_bin).expect("apply initial");
    doc.apply_update_from_binary_v1(&delta).expect("apply delta");

    let blocks_map = doc.get_map("blocks").expect("blocks map");
    let mut found = false;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some("affine:table")
      {
        for key in block_map.keys() {
          if key.starts_with("prop:cells.")
            && key.ends_with(".text")
            && let Some(value) = block_map.get(key).and_then(|v| v.to_any()).and_then(|a| match a {
              Any::String(value) => Some(value),
              _ => None,
            })
            && value == "9"
          {
            found = true;
            break;
          }
        }
      }
    }

    assert!(found);
  }

  #[test]
  fn test_update_ydoc_concurrent_merge_simulation() {
    let base_md = "# Concurrent Test\n\nBase paragraph.";
    let doc_id = "concurrent-test";

    let base_bin = build_full_doc("Concurrent Test", base_md, doc_id).expect("Should create base doc");

    let mut base_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    base_doc.apply_update_from_binary_v1(&base_bin).expect("Apply base");
    let base_count = base_doc.get_map("blocks").expect("blocks map exists").len();

    let client_a_md = "# Concurrent Test\n\nModified by client A.";
    let delta_a = update_doc(&base_bin, client_a_md, doc_id).expect("Delta A");

    let client_b_md = "# Concurrent Test\n\nBase paragraph.\n\nAdded by client B.";
    let delta_b = update_doc(&base_bin, client_b_md, doc_id).expect("Delta B");

    let mut final_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    final_doc.apply_update_from_binary_v1(&base_bin).expect("Apply base");
    final_doc.apply_update_from_binary_v1(&delta_a).expect("Apply delta A");
    final_doc.apply_update_from_binary_v1(&delta_b).expect("Apply delta B");

    let final_count = final_doc.get_map("blocks").expect("blocks map exists").len();
    assert!(
      final_count > base_count,
      "Expected merged blocks after concurrent updates, got {final_count} vs {base_count}"
    );
  }

  #[test]
  fn test_update_ydoc_empty_binary_errors() {
    let markdown = "# New Document\n\nCreated from empty binary.";
    let doc_id = "empty-fallback-test";

    let result = update_doc(&[], markdown, doc_id);
    assert!(result.is_err());

    let result = update_doc(&[0, 0], markdown, doc_id);
    assert!(result.is_err());
  }

  #[test]
  fn test_update_ydoc_fallback_when_blocks_empty() {
    let doc_id = "stub-empty-blocks";
    let markdown = "# From Markdown\n\nHello from markdown.";

    // Build a valid ydoc update that results in an empty `blocks` map.
    // NOTE: yjs/y-octo may encode a completely empty doc as `[0,0]`, which we treat
    // as empty/invalid. We intentionally insert + remove a temp key so the
    // update is non-empty while the final map is empty.
    let doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    let mut blocks = doc.get_or_create_map("blocks").expect("create blocks map");
    blocks
      .insert("tmp".to_string(), Any::String("1".to_string()))
      .expect("insert temp");
    blocks.remove("tmp");
    let stub_bin = doc
      .encode_state_as_update_v1(&StateVector::default())
      .expect("encode stub update");
    assert!(
      !stub_bin.is_empty() && stub_bin.as_slice() != [0, 0],
      "stub update should not be empty update"
    );

    let delta = update_doc(&stub_bin, markdown, doc_id).expect("fallback delta");
    assert!(!delta.is_empty(), "delta should contain changes");

    let mut updated = DocOptions::new().with_guid(doc_id.to_string()).build();
    updated
      .apply_update_from_binary_v1(&stub_bin)
      .expect("apply stub update");
    updated
      .apply_update_from_binary_v1(&delta)
      .expect("apply fallback delta");

    let blocks_map = updated.get_map("blocks").expect("blocks map exists");

    let mut page: Option<Map> = None;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some(PAGE_FLAVOUR)
      {
        page = Some(block_map);
        break;
      }
    }

    let page = page.expect("page block created");
    assert_eq!(
      get_string(&page, "prop:title").as_deref(),
      Some("From Markdown"),
      "page title should be derived from markdown H1"
    );

    let index = build_block_index(&blocks_map);
    let note_id = find_child_id_by_flavour(&page, &index.block_pool, NOTE_FLAVOUR).expect("note child exists");

    let note = index.block_pool.get(&note_id).expect("note block exists").clone();
    assert!(
      !collect_child_ids(&note).is_empty(),
      "note should contain imported content blocks"
    );

    let full_bin = updated
      .encode_state_as_update_v1(&StateVector::default())
      .expect("encode full doc");
    let md = parse_doc_to_markdown(full_bin, doc_id.to_string(), false, None).expect("render markdown");
    assert!(md.markdown.contains("Hello from markdown."));
  }

  #[test]
  fn test_update_ydoc_fallback_when_page_missing() {
    let doc_id = "stub-page-missing";
    let markdown = "# Title\n\nUpdated content.";

    // Build a stub doc that has some blocks, but no `affine:page` root.
    let doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    let mut blocks_map = doc.get_or_create_map("blocks").expect("create blocks map");
    let para_id = "para-1";
    let mut para = insert_block_map(&doc, &mut blocks_map, para_id).expect("insert para");
    insert_sys_fields(&mut para, para_id, "affine:paragraph").expect("sys fields");
    insert_children(&doc, &mut para, &[]).expect("children");

    let stub_bin = doc
      .encode_state_as_update_v1(&StateVector::default())
      .expect("encode stub update");
    assert!(!stub_bin.is_empty(), "stub update should not be empty");

    let delta = update_doc(&stub_bin, markdown, doc_id).expect("fallback delta");
    assert!(!delta.is_empty(), "delta should contain changes");

    let mut updated = DocOptions::new().with_guid(doc_id.to_string()).build();
    updated
      .apply_update_from_binary_v1(&stub_bin)
      .expect("apply stub update");
    updated
      .apply_update_from_binary_v1(&delta)
      .expect("apply fallback delta");

    let blocks_map = updated.get_map("blocks").expect("blocks map exists");
    let index = build_block_index(&blocks_map);
    let page_id = find_block_id_by_flavour(&index.block_pool, PAGE_FLAVOUR).expect("page block exists");
    let page = index.block_pool.get(&page_id).expect("page map exists").clone();

    let note_id = find_child_id_by_flavour(&page, &index.block_pool, NOTE_FLAVOUR).expect("note child exists");
    let note = index.block_pool.get(&note_id).expect("note block exists").clone();
    assert!(
      !collect_child_ids(&note).is_empty(),
      "note should contain imported content blocks"
    );
  }

  #[test]
  fn test_update_ydoc_fallback_when_note_missing() {
    let doc_id = "stub-note-missing";
    let markdown = "# Title\n\nUpdated content.";

    // Build a stub doc that has an `affine:page` block but doesn't contain a note
    // child.
    let doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    let mut blocks_map = doc.get_or_create_map("blocks").expect("create blocks map");
    let page_id = "page-1";
    let mut page = insert_block_map(&doc, &mut blocks_map, page_id).expect("insert page");
    insert_sys_fields(&mut page, page_id, PAGE_FLAVOUR).expect("sys fields");
    insert_children(&doc, &mut page, &[]).expect("children");

    let stub_bin = doc
      .encode_state_as_update_v1(&StateVector::default())
      .expect("encode stub update");
    assert!(!stub_bin.is_empty(), "stub update should not be empty");

    let delta = update_doc(&stub_bin, markdown, doc_id).expect("fallback delta");
    assert!(!delta.is_empty(), "delta should contain changes");

    let mut updated = DocOptions::new().with_guid(doc_id.to_string()).build();
    updated
      .apply_update_from_binary_v1(&stub_bin)
      .expect("apply stub update");
    updated
      .apply_update_from_binary_v1(&delta)
      .expect("apply fallback delta");

    let blocks_map = updated.get_map("blocks").expect("blocks map exists");
    let index = build_block_index(&blocks_map);
    let page_id = find_block_id_by_flavour(&index.block_pool, PAGE_FLAVOUR).expect("page block exists");
    let page = index.block_pool.get(&page_id).expect("page map exists").clone();

    let note_id = find_child_id_by_flavour(&page, &index.block_pool, NOTE_FLAVOUR).expect("note child exists");
    let note = index.block_pool.get(&note_id).expect("note block exists").clone();
    assert!(
      !collect_child_ids(&note).is_empty(),
      "note should contain imported content blocks"
    );
  }

  #[test]
  fn test_update_ydoc_preserves_opaque_blocks_when_unsupported_block_flavour() {
    let doc_id = "unsupported-flavour-replace";

    // Build a doc with canonical page/note structure, but add an unsupported block
    // flavour under note. This simulates real-world docs that contain blocks we
    // don't support for structural diffing.
    let doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    let mut blocks_map = doc.get_or_create_map("blocks").expect("create blocks map");

    let page_id = "page-1";
    let surface_id = "surface-1";
    let note_id = "note-1";
    let db_id = "db-1";

    let mut page = insert_block_map(&doc, &mut blocks_map, page_id).expect("insert page");
    let mut surface = insert_block_map(&doc, &mut blocks_map, surface_id).expect("insert surface");
    let mut note = insert_block_map(&doc, &mut blocks_map, note_id).expect("insert note");
    let mut db = insert_block_map(&doc, &mut blocks_map, db_id).expect("insert db");

    insert_sys_fields(&mut page, page_id, PAGE_FLAVOUR).expect("page sys fields");
    insert_children(&doc, &mut page, &[surface_id.to_string(), note_id.to_string()]).expect("page children");
    insert_text(&doc, &mut page, PROP_TITLE, &text_ops_from_plain("Title")).expect("page title");

    insert_sys_fields(&mut surface, surface_id, SURFACE_FLAVOUR).expect("surface sys fields");
    insert_children(&doc, &mut surface, &[]).expect("surface children");
    let mut boxed = boxed_empty_map(&doc).expect("boxed map");
    surface
      .insert(PROP_ELEMENTS.to_string(), Value::Map(boxed.clone()))
      .expect("surface elements");
    boxed
      .insert("type".to_string(), Any::String(BOXED_NATIVE_TYPE.to_string()))
      .expect("boxed type");
    let value = doc.create_map().expect("boxed value map");
    boxed
      .insert("value".to_string(), Value::Map(value))
      .expect("boxed value");

    insert_sys_fields(&mut note, note_id, NOTE_FLAVOUR).expect("note sys fields");
    insert_children(&doc, &mut note, &[db_id.to_string()]).expect("note children");

    // Unsupported flavour.
    insert_sys_fields(&mut db, db_id, "affine:database").expect("db sys fields");
    insert_children(&doc, &mut db, &[]).expect("db children");

    let initial_bin = doc
      .encode_state_as_update_v1(&StateVector::default())
      .expect("encode initial");

    // Updating should succeed and preserve the opaque block rather than deleting
    // it.
    let updated_md = "# New Title\n\nHello.";
    let delta = update_doc(&initial_bin, updated_md, doc_id).expect("delta");
    assert!(!delta.is_empty(), "delta should contain changes");

    let mut updated_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    updated_doc
      .apply_update_from_binary_v1(&initial_bin)
      .expect("apply initial");
    updated_doc.apply_update_from_binary_v1(&delta).expect("apply delta");

    let blocks_map = updated_doc.get_map("blocks").expect("blocks map");
    assert!(
      blocks_map.get(db_id).is_some(),
      "opaque block should be preserved when syncing from markdown"
    );

    let md = parse_doc_to_markdown(updated_doc.encode_update_v1().unwrap(), doc_id.to_string(), false, None)
      .expect("render markdown")
      .markdown;
    assert!(md.contains("Hello."));
  }

  #[test]
  fn test_update_ydoc_markdown_too_large() {
    let initial_md = "# Title\n\nContent.";
    let doc_id = "size-limit-test";
    let initial_bin = build_full_doc("Title", initial_md, doc_id).expect("Should create initial doc");

    let markdown = "a".repeat(MAX_MARKDOWN_CHARS + 1);
    let result = update_doc(&initial_bin, &markdown, doc_id);
    assert!(result.is_err());
  }

  #[test]
  fn test_update_ydoc_rejects_unsupported_markdown() {
    let initial_md = "# Title\n\nContent.";
    let doc_id = "unsupported-test";
    let initial_bin = build_full_doc("Title", initial_md, doc_id).expect("Should create initial doc");

    let markdown = "# Title\n\n<div>HTML</div>";
    let result = update_doc(&initial_bin, markdown, doc_id);
    assert!(result.is_err());
  }
}
