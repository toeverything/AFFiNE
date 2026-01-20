//! Markdown to YDoc conversion module
//!
//! Converts markdown content into AFFiNE-compatible y-octo document binary
//! format.

use y_octo::DocOptions;

use super::{
  super::{
    markdown::parse_markdown_blocks,
    schema::{PROP_BACKGROUND, PROP_DISPLAY_MODE, PROP_ELEMENTS, PROP_HIDDEN, PROP_INDEX, PROP_XYWH, SURFACE_FLAVOUR},
  },
  builder::{
    BOXED_NATIVE_TYPE, NOTE_BG_DARK, NOTE_BG_LIGHT, boxed_empty_map, insert_block_map, insert_block_tree,
    insert_children, insert_sys_fields, insert_text, note_background_map, text_ops_from_plain,
  },
  *,
};

/// Converts markdown into an AFFiNE-compatible y-octo document binary.
///
/// # Arguments
/// * `title` - The document title
/// * `markdown` - The markdown content to convert
/// * `doc_id` - The document ID to use
///
/// # Returns
/// A binary vector containing the y-octo encoded document update
pub fn build_full_doc(title: &str, markdown: &str, doc_id: &str) -> Result<Vec<u8>, ParseError> {
  let nodes = parse_markdown_blocks(markdown)?;
  build_doc_update(doc_id, title, &nodes)
}

fn build_doc_update(doc_id: &str, title: &str, blocks: &[BlockNode]) -> Result<Vec<u8>, ParseError> {
  let doc = DocOptions::new().with_guid(doc_id.to_string()).build();
  let mut blocks_map = doc.get_or_create_map("blocks")?;

  let page_id = nanoid::nanoid!();
  let surface_id = nanoid::nanoid!();
  let note_id = nanoid::nanoid!();

  // Insert root blocks first to establish stable IDs.
  let mut page_map = insert_block_map(&doc, &mut blocks_map, &page_id)?;
  let mut surface_map = insert_block_map(&doc, &mut blocks_map, &surface_id)?;
  let mut note_map = insert_block_map(&doc, &mut blocks_map, &note_id)?;

  // Create content blocks under note.
  let content_ids = insert_block_trees(&doc, &mut blocks_map, blocks)?;

  // Page block
  insert_sys_fields(&mut page_map, &page_id, PAGE_FLAVOUR)?;
  insert_children(&doc, &mut page_map, &[surface_id.clone(), note_id.clone()])?;
  insert_text(&doc, &mut page_map, PROP_TITLE, &text_ops_from_plain(title))?;

  // Surface block
  insert_sys_fields(&mut surface_map, &surface_id, SURFACE_FLAVOUR)?;
  insert_children(&doc, &mut surface_map, &[])?;
  let mut boxed = boxed_empty_map(&doc)?;
  surface_map.insert(PROP_ELEMENTS.to_string(), Value::Map(boxed.clone()))?;
  boxed.insert("type".to_string(), Any::String(BOXED_NATIVE_TYPE.to_string()))?;
  let value = doc.create_map()?;
  boxed.insert("value".to_string(), Value::Map(value))?;

  // Note block
  insert_sys_fields(&mut note_map, &note_id, NOTE_FLAVOUR)?;
  insert_children(&doc, &mut note_map, &content_ids)?;
  let mut background = note_background_map(&doc)?;
  note_map.insert(PROP_BACKGROUND.to_string(), Value::Map(background.clone()))?;
  background.insert("light".to_string(), Any::String(NOTE_BG_LIGHT.to_string()))?;
  background.insert("dark".to_string(), Any::String(NOTE_BG_DARK.to_string()))?;
  note_map.insert(PROP_XYWH.to_string(), Any::String("[0,0,800,95]".to_string()))?;
  note_map.insert(PROP_INDEX.to_string(), Any::String("a0".to_string()))?;
  note_map.insert(PROP_HIDDEN.to_string(), Any::False)?;
  note_map.insert(PROP_DISPLAY_MODE.to_string(), Any::String("both".to_string()))?;

  Ok(doc.encode_update_v1()?)
}

fn insert_block_trees(doc: &Doc, blocks_map: &mut Map, blocks: &[BlockNode]) -> Result<Vec<String>, ParseError> {
  let mut ids = Vec::with_capacity(blocks.len());
  for block in blocks {
    let id = insert_block_tree(doc, blocks_map, block)?;
    ids.push(id);
  }
  Ok(ids)
}

#[cfg(test)]
mod tests {
  use y_octo::{Any, DocOptions};

  use super::{
    super::super::{
      blocksuite::get_string,
      markdown::{MAX_BLOCKS, MAX_MARKDOWN_CHARS},
      schema::PAGE_FLAVOUR,
    },
    *,
  };

  #[test]
  fn test_simple_markdown() {
    let markdown = "# Hello World\n\nThis is a test paragraph.";
    let result = build_full_doc("Hello World", markdown, "test-doc-id");
    assert!(result.is_ok());
    let bin = result.unwrap();
    assert!(!bin.is_empty());
  }

  #[test]
  fn test_title_from_param() {
    let markdown = "# Markdown Title\n\nContent.";
    let doc_id = "title-param-test";
    let bin = build_full_doc("External Title", markdown, doc_id).expect("create doc");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&bin).expect("apply update");

    let blocks_map = doc.get_map("blocks").expect("blocks map");
    let mut title = None;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some(PAGE_FLAVOUR)
      {
        title = get_string(&block_map, "prop:title");
        break;
      }
    }

    assert_eq!(title.as_deref(), Some("External Title"));
  }

  #[test]
  fn test_markdown_with_list() {
    let markdown = "# Test List\n\n- Item 1\n- Item 2\n- Item 3";
    let result = build_full_doc("Test List", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_markdown_with_code() {
    let markdown = "# Code Example\n\n```rust\nfn main() {\n    println!(\"Hello\");\n}\n```";
    let result = build_full_doc("Code Example", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_markdown_with_headings() {
    let markdown = "# H1\n\n## H2\n\n### H3\n\nParagraph text.";
    let result = build_full_doc("H1", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_empty_markdown() {
    let result = build_full_doc("Untitled", "", "test-doc-id");
    assert!(result.is_ok());
    let bin = result.unwrap();
    assert!(!bin.is_empty());
  }

  #[test]
  fn test_whitespace_only_markdown() {
    let result = build_full_doc("Untitled", "   \n\n\t\n   ", "test-doc-id");
    assert!(result.is_ok());
    let bin = result.unwrap();
    assert!(!bin.is_empty());
  }

  #[test]
  fn test_markdown_without_h1() {
    let markdown = "## Secondary Heading\n\nSome content without H1.";
    let result = build_full_doc("Title", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_nested_lists() {
    let markdown = "# Nested Lists\n\n- Item 1\n  - Nested 1.1\n  - Nested 1.2\n- Item 2\n  - Nested 2.1";
    let result = build_full_doc("Nested Lists", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_blockquote() {
    let markdown = "# Title\n\n> A blockquote";
    let result = build_full_doc("Title", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_divider() {
    let markdown = "# Title\n\nBefore divider\n\n---\n\nAfter divider";
    let result = build_full_doc("Title", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_numbered_list() {
    let markdown = "# Title\n\n1. First item\n2. Second item";
    let result = build_full_doc("Title", markdown, "test-doc-id");
    assert!(result.is_ok());
  }

  #[test]
  fn test_markdown_too_large() {
    let markdown = "a".repeat(MAX_MARKDOWN_CHARS + 1);
    let result = build_full_doc("Title", &markdown, "test-doc-id");
    assert!(result.is_err());
  }

  #[test]
  fn test_markdown_block_limit() {
    let mut markdown = String::from("# Title\n\n");
    for i in 0..=MAX_BLOCKS {
      markdown.push_str(&format!("Paragraph {i}\n\n"));
    }
    let result = build_full_doc("Title", &markdown, "test-doc-id");
    assert!(result.is_err());
  }

  #[test]
  fn test_markdown_with_image() {
    let markdown = "![Alt](blob://image-id)";
    let doc_id = "image-doc";
    let bin = build_full_doc("Title", markdown, doc_id).expect("create doc");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&bin).expect("apply update");

    let blocks_map = doc.get_map("blocks").expect("blocks map");
    let mut found = false;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some("affine:image")
      {
        let source_id = get_string(&block_map, "prop:sourceId");
        assert_eq!(source_id.as_deref(), Some("image-id"));
        found = true;
        break;
      }
    }

    assert!(found);
  }

  #[test]
  fn test_markdown_with_table() {
    let markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    let doc_id = "table-doc";
    let bin = build_full_doc("Title", markdown, doc_id).expect("create doc");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&bin).expect("apply update");

    let blocks_map = doc.get_map("blocks").expect("blocks map");
    let mut found_cell = false;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some("affine:table")
      {
        for key in block_map.keys() {
          if key.starts_with("prop:cells.") && key.ends_with(".text") {
            let value = block_map.get(key).and_then(|v| v.to_any()).and_then(|a| match a {
              Any::String(value) => Some(value),
              _ => None,
            });
            if let Some(value) = value
              && (value == "A" || value == "1")
            {
              found_cell = true;
              break;
            }
          }
        }
      }
    }

    assert!(found_cell);
  }
}
