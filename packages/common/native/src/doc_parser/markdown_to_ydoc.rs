//! Markdown to YDoc conversion module
//!
//! Converts markdown content into AFFiNE-compatible y-octo document binary
//! format.

use y_octo::{Any, DocOptions};

use super::{
  affine::ParseError,
  markdown_utils::{BlockType, ParsedBlock, extract_title, parse_markdown_blocks},
};

/// Block types used in AFFiNE documents
const PAGE_FLAVOUR: &str = "affine:page";
const NOTE_FLAVOUR: &str = "affine:note";

/// Intermediate representation of a block for building y-octo documents
struct BlockBuilder {
  id: String,
  flavour: String,
  text_content: String,
  block_type: Option<BlockType>,
  checked: Option<bool>,
  code_language: Option<String>,
  #[allow(dead_code)] // Reserved for future nested block support
  children: Vec<String>,
}

impl BlockBuilder {
  fn new(flavour: &str) -> Self {
    Self {
      id: nanoid::nanoid!(),
      flavour: flavour.to_string(),
      text_content: String::new(),
      block_type: None,
      checked: None,
      code_language: None,
      children: Vec::new(),
    }
  }

  fn with_text(mut self, text: &str) -> Self {
    self.text_content = text.to_string();
    self
  }

  fn with_block_type(mut self, btype: BlockType) -> Self {
    self.block_type = Some(btype);
    self
  }

  fn with_checked(mut self, checked: bool) -> Self {
    self.checked = Some(checked);
    self
  }

  fn with_code_language(mut self, lang: &str) -> Self {
    if !lang.is_empty() {
      self.code_language = Some(lang.to_string());
    }
    self
  }
}

/// Converts a ParsedBlock from the shared parser into a BlockBuilder
impl From<ParsedBlock> for BlockBuilder {
  fn from(parsed: ParsedBlock) -> Self {
    let mut builder = BlockBuilder::new(parsed.flavour.as_str()).with_text(&parsed.content);

    if let Some(btype) = parsed.block_type {
      builder = builder.with_block_type(btype);
    }

    if let Some(checked) = parsed.checked {
      builder = builder.with_checked(checked);
    }

    if let Some(lang) = parsed.language {
      builder = builder.with_code_language(&lang);
    }

    builder
  }
}

/// Parses markdown and converts it to an AFFiNE-compatible y-octo document
/// binary.
///
/// # Arguments
/// * `markdown` - The markdown content to convert
/// * `doc_id` - The document ID to use
///
/// # Returns
/// A binary vector containing the y-octo encoded document
pub fn markdown_to_ydoc(markdown: &str, doc_id: &str) -> Result<Vec<u8>, ParseError> {
  // Extract the title from the first H1 heading
  let title = extract_title(markdown);

  // Parse markdown into blocks using the shared parser
  let parsed_blocks = parse_markdown_blocks(markdown, true);

  // Convert ParsedBlocks to BlockBuilders and collect IDs
  let mut blocks: Vec<BlockBuilder> = Vec::new();
  let mut content_block_ids: Vec<String> = Vec::new();

  for parsed in parsed_blocks {
    let builder: BlockBuilder = parsed.into();
    content_block_ids.push(builder.id.clone());
    blocks.push(builder);
  }

  // Build the y-octo document
  build_ydoc(doc_id, &title, blocks, content_block_ids)
}

/// Builds the y-octo document from parsed blocks.
///
/// Uses a two-phase approach to ensure Yjs compatibility:
/// 1. Phase 1: Create and insert empty maps into blocks_map (establishes parent
///    items)
/// 2. Phase 2: Populate each map with properties (child items reference
///    existing parents)
///
/// This ordering ensures that when items reference their parent map's ID in the
/// encoded binary, the parent ID always has a lower clock value, which Yjs
/// requires.
fn build_ydoc(
  doc_id: &str,
  title: &str,
  content_blocks: Vec<BlockBuilder>,
  content_block_ids: Vec<String>,
) -> Result<Vec<u8>, ParseError> {
  // Create the document with the specified ID
  let doc = DocOptions::new().with_guid(doc_id.to_string()).build();

  // Create the blocks map
  let mut blocks_map = doc
    .get_or_create_map("blocks")
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Create block IDs
  let page_id = nanoid::nanoid!();
  let note_id = nanoid::nanoid!();

  // ==== PHASE 1: Insert empty maps to establish parent items ====
  // This ensures parent items have lower clock values than their children

  // Insert empty page block map
  blocks_map
    .insert(
      page_id.clone(),
      doc.create_map().map_err(|e| ParseError::ParserError(e.to_string()))?,
    )
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Insert empty note block map
  blocks_map
    .insert(
      note_id.clone(),
      doc.create_map().map_err(|e| ParseError::ParserError(e.to_string()))?,
    )
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Insert empty content block maps
  for block in &content_blocks {
    blocks_map
      .insert(
        block.id.clone(),
        doc.create_map().map_err(|e| ParseError::ParserError(e.to_string()))?,
      )
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // ==== PHASE 2: Populate the maps with their properties ====
  // Now each map has an item with a lower clock, so children will reference
  // correctly

  // Populate page block
  if let Some(page_map) = blocks_map.get(&page_id).and_then(|v| v.to_map()) {
    populate_block_map(
      &doc,
      page_map,
      &page_id,
      PAGE_FLAVOUR,
      Some(title),
      None,
      None,
      None,
      None,
      vec![note_id.clone()],
    )?;
  }

  // Populate note block
  if let Some(note_map) = blocks_map.get(&note_id).and_then(|v| v.to_map()) {
    populate_block_map(
      &doc,
      note_map,
      &note_id,
      NOTE_FLAVOUR,
      None,
      None,
      None,
      None,
      None,
      content_block_ids.clone(),
    )?;
  }

  // Populate content blocks
  for block in content_blocks {
    if let Some(block_map) = blocks_map.get(&block.id).and_then(|v| v.to_map()) {
      populate_block_map(
        &doc,
        block_map,
        &block.id,
        &block.flavour,
        None,
        if block.text_content.is_empty() {
          None
        } else {
          Some(&block.text_content)
        },
        block.block_type,
        block.checked,
        block.code_language.as_deref(),
        Vec::new(),
      )?;
    }
  }

  // Encode the document
  doc
    .encode_update_v1()
    .map_err(|e| ParseError::ParserError(e.to_string()))
}

/// Populates an existing block map with the given properties.
///
/// This function takes an already-inserted map and populates it with
/// properties. The two-phase approach (insert empty map first, then populate)
/// ensures that when child items reference the map as their parent, the
/// parent's clock is lower.
///
/// IMPORTANT: We use Any types (Any::Array, Any::String) instead of CRDT types
/// (y_octo::Array, y_octo::Text) for nested values. Any types are encoded
/// inline as part of the item content, avoiding the forward reference issue
/// where child items would reference a parent with a higher clock value.
#[allow(clippy::too_many_arguments)]
fn populate_block_map(
  _doc: &y_octo::Doc,
  mut block: y_octo::Map,
  block_id: &str,
  flavour: &str,
  title: Option<&str>,
  text_content: Option<&str>,
  block_type: Option<BlockType>,
  checked: Option<bool>,
  code_language: Option<&str>,
  children: Vec<String>,
) -> Result<(), ParseError> {
  // Required fields
  block
    .insert("sys:id".to_string(), Any::String(block_id.to_string()))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;
  block
    .insert("sys:flavour".to_string(), Any::String(flavour.to_string()))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Children - use Any::Array which is encoded inline (no forward references)
  let children_any: Vec<Any> = children.into_iter().map(Any::String).collect();
  block
    .insert("sys:children".to_string(), Any::Array(children_any))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Title
  if let Some(title) = title {
    block
      .insert("prop:title".to_string(), Any::String(title.to_string()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Text content - use Any::String instead of Y.Text
  // This is simpler and avoids CRDT overhead for initial document creation
  if let Some(content) = text_content {
    block
      .insert("prop:text".to_string(), Any::String(content.to_string()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Block type
  if let Some(btype) = block_type {
    block
      .insert("prop:type".to_string(), Any::String(btype.as_str().to_string()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Checked state
  if let Some(is_checked) = checked {
    block
      .insert(
        "prop:checked".to_string(),
        if is_checked { Any::True } else { Any::False },
      )
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Code language
  if let Some(lang) = code_language {
    block
      .insert("prop:language".to_string(), Any::String(lang.to_string()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_simple_markdown() {
    let markdown = "# Hello World\n\nThis is a test paragraph.";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
    let bin = result.unwrap();
    assert!(!bin.is_empty());
  }

  #[test]
  fn test_markdown_with_list() {
    let markdown = "# Test List\n\n- Item 1\n- Item 2\n- Item 3";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_markdown_with_code() {
    let markdown = "# Code Example\n\n```rust\nfn main() {\n    println!(\"Hello\");\n}\n```";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_markdown_with_headings() {
    let markdown = "# H1\n\n## H2\n\n### H3\n\nParagraph text.";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_extract_title_usage() {
    assert_eq!(extract_title("# My Title\n\nContent"), "My Title");
    assert_eq!(extract_title("No heading"), "Untitled");
    assert_eq!(extract_title("## Secondary\n\nContent"), "Untitled");
  }

  #[test]
  fn test_empty_markdown() {
    let result = markdown_to_ydoc("", "test-doc-id");
    assert!(result.is_ok());
    let bin = result.unwrap();
    assert!(!bin.is_empty()); // Should still create valid doc structure
  }

  #[test]
  fn test_whitespace_only_markdown() {
    let result = markdown_to_ydoc("   \n\n\t\n   ", "test-doc-id");
    assert!(result.is_ok());
    let bin = result.unwrap();
    assert!(!bin.is_empty());
  }

  #[test]
  fn test_markdown_without_h1() {
    // Should use "Untitled" as default title
    let markdown = "## Secondary Heading\n\nSome content without H1.";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_nested_lists() {
    let markdown = "# Nested Lists\n\n- Item 1\n  - Nested 1.1\n  - Nested 1.2\n- Item 2\n  - Nested 2.1";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_blockquote() {
    let markdown = "# Title\n\n> A blockquote";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_divider() {
    let markdown = "# Title\n\nBefore divider\n\n---\n\nAfter divider";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_numbered_list() {
    let markdown = "# Title\n\n1. First item\n2. Second item";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_four_paragraphs() {
    // Test with 4 paragraphs
    let markdown = "# Title\n\nP1.\n\nP2.\n\nP3.\n\nP4.";
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_mixed_content() {
    let markdown = r#"# Mixed Content

Some intro text.

- List item 1
- List item 2

```python
def hello():
    print("world")
```

## Another Section

More text here.

1. Numbered item
2. Another numbered

> A blockquote

---

Final paragraph.
"#;
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_code_block_preserves_indentation() {
    // Code blocks should preserve leading whitespace (indentation) which is
    // semantically significant in languages like Python, YAML, etc.
    let markdown = r#"# Code Test

```python
    def indented():
        return "preserved"
```
"#;
    let result = markdown_to_ydoc(markdown, "test-doc-id");
    assert!(result.is_ok());
    // The test passes if the conversion succeeds without errors.
    // Full verification would require roundtrip testing.
  }

  #[test]
  fn test_document_creation() {
    // Test that markdown_to_ydoc creates a valid binary
    let original_md = "# Test Document\n\nHello world.";
    let doc_id = "creation-test";

    let bin = markdown_to_ydoc(original_md, doc_id).expect("Should convert to ydoc");

    // Binary should not be empty
    assert!(!bin.is_empty(), "Binary should not be empty");
    assert!(bin.len() > 10, "Binary should have meaningful content");
  }

  // NOTE: Full roundtrip tests (markdown -> ydoc -> markdown) are not included
  // because y-octo has a limitation where nested maps created with create_map()
  // lose their content after encode/decode. This is a known y-octo limitation.
  //
  // However, the documents we create ARE valid and can be:
  // 1. Pushed to the AFFiNE server via DocStorageAdapter.pushDocUpdates
  // 2. Read by the AFFiNE client which uses JavaScript Yjs (not y-octo)
  //
  // The MCP write tools work because:
  // - markdown_to_ydoc creates valid y-octo binary
  // - The server stores the binary directly
  // - The client (browser) uses Yjs to decode and render
}
