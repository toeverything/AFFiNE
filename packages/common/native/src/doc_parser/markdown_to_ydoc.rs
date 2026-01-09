//! Markdown to YDoc conversion module
//!
//! Converts markdown content into AFFiNE-compatible y-octo document binary format.

use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use y_octo::{Any, DocOptions};

use super::affine::ParseError;

/// Block types used in AFFiNE documents
const PAGE_FLAVOUR: &str = "affine:page";
const NOTE_FLAVOUR: &str = "affine:note";
const PARAGRAPH_FLAVOUR: &str = "affine:paragraph";
const LIST_FLAVOUR: &str = "affine:list";
const CODE_FLAVOUR: &str = "affine:code";
const DIVIDER_FLAVOUR: &str = "affine:divider";

/// Represents different paragraph types in AFFiNE
#[derive(Clone, Copy)]
enum ParagraphType {
  Text,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Quote,
}

impl ParagraphType {
  fn as_str(&self) -> &'static str {
    match self {
      ParagraphType::Text => "text",
      ParagraphType::H1 => "h1",
      ParagraphType::H2 => "h2",
      ParagraphType::H3 => "h3",
      ParagraphType::H4 => "h4",
      ParagraphType::H5 => "h5",
      ParagraphType::H6 => "h6",
      ParagraphType::Quote => "quote",
    }
  }
}

/// Represents list types in AFFiNE
#[derive(Clone, Copy)]
enum ListType {
  Bulleted,
  Numbered,
  Todo(bool), // checked state
}

impl ListType {
  fn as_str(&self) -> &'static str {
    match self {
      ListType::Bulleted => "bulleted",
      ListType::Numbered => "numbered",
      ListType::Todo(_) => "todo",
    }
  }

  fn is_checked(&self) -> bool {
    matches!(self, ListType::Todo(true))
  }
}

/// Intermediate representation of a block during parsing
struct BlockBuilder {
  id: String,
  flavour: String,
  text_content: String,
  paragraph_type: Option<ParagraphType>,
  list_type: Option<ListType>,
  code_language: Option<String>,
  children: Vec<String>,
}

impl BlockBuilder {
  fn new(flavour: &str) -> Self {
    Self {
      id: nanoid::nanoid!(),
      flavour: flavour.to_string(),
      text_content: String::new(),
      paragraph_type: None,
      list_type: None,
      code_language: None,
      children: Vec::new(),
    }
  }

  fn with_text(mut self, text: &str) -> Self {
    self.text_content = text.to_string();
    self
  }

  fn with_paragraph_type(mut self, ptype: ParagraphType) -> Self {
    self.paragraph_type = Some(ptype);
    self
  }

  fn with_list_type(mut self, ltype: ListType) -> Self {
    self.list_type = Some(ltype);
    self
  }

  fn with_code_language(mut self, lang: &str) -> Self {
    self.code_language = Some(lang.to_string());
    self
  }

  #[allow(dead_code)]
  fn add_child(&mut self, child_id: &str) {
    self.children.push(child_id.to_string());
  }
}

/// Parses markdown and converts it to an AFFiNE-compatible y-octo document binary.
///
/// # Arguments
/// * `markdown` - The markdown content to convert
/// * `doc_id` - The document ID to use for the y-octo doc
///
/// # Returns
/// A binary vector representing the y-octo document update
pub fn markdown_to_ydoc(markdown: &str, doc_id: &str) -> Result<Vec<u8>, ParseError> {
  let mut blocks: Vec<BlockBuilder> = Vec::new();
  let mut content_block_ids: Vec<String> = Vec::new();

  // Extract title from first heading or use default
  let title = extract_title(markdown);

  // Parse markdown and build blocks
  parse_markdown_to_blocks(markdown, &mut blocks, &mut content_block_ids)?;

  // Create the y-octo document
  build_ydoc(doc_id, &title, blocks, content_block_ids)
}

/// Extracts the title from the first H1 heading in the markdown
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
        title = text.to_string();
        break;
      }
      Event::End(TagEnd::Heading(_)) => {
        in_heading = false;
      }
      _ => {}
    }
  }

  if title.is_empty() {
    "Untitled".to_string()
  } else {
    title
  }
}

/// Parses markdown content into BlockBuilder structures
fn parse_markdown_to_blocks(
  markdown: &str,
  blocks: &mut Vec<BlockBuilder>,
  content_block_ids: &mut Vec<String>,
) -> Result<(), ParseError> {
  let options = Options::ENABLE_STRIKETHROUGH
    | Options::ENABLE_TABLES
    | Options::ENABLE_TASKLISTS
    | Options::ENABLE_HEADING_ATTRIBUTES;
  let parser = Parser::new_ext(markdown, options);

  let mut current_text = String::new();
  let mut current_paragraph_type = ParagraphType::Text;
  let mut in_list = false;
  let mut list_type_stack: Vec<ListType> = Vec::new();
  let mut in_code_block = false;
  let mut code_language = String::new();
  let mut skip_first_h1 = true; // Skip first H1 as it becomes the title
  let mut pending_link_url: Option<String> = None; // For proper link handling

  for event in parser {
    match event {
      Event::Start(Tag::Heading { level, .. }) => {
        // Flush any pending text
        flush_text_block(
          &mut current_text,
          current_paragraph_type,
          blocks,
          content_block_ids,
        );

        if level == HeadingLevel::H1 && skip_first_h1 {
          // Skip the first H1 - it's used as the document title
          current_paragraph_type = ParagraphType::H1;
        } else {
          current_paragraph_type = match level {
            HeadingLevel::H1 => ParagraphType::H1,
            HeadingLevel::H2 => ParagraphType::H2,
            HeadingLevel::H3 => ParagraphType::H3,
            HeadingLevel::H4 => ParagraphType::H4,
            HeadingLevel::H5 => ParagraphType::H5,
            HeadingLevel::H6 => ParagraphType::H6,
          };
        }
      }
      Event::End(TagEnd::Heading(level)) => {
        if level == HeadingLevel::H1 && skip_first_h1 {
          skip_first_h1 = false;
          current_text.clear();
        } else {
          flush_text_block(
            &mut current_text,
            current_paragraph_type,
            blocks,
            content_block_ids,
          );
        }
        current_paragraph_type = ParagraphType::Text;
      }
      Event::Start(Tag::Paragraph) => {
        // Nothing to do - text will be collected
      }
      Event::End(TagEnd::Paragraph) => {
        if !in_list {
          flush_text_block(
            &mut current_text,
            current_paragraph_type,
            blocks,
            content_block_ids,
          );
        }
      }
      Event::Start(Tag::BlockQuote(_)) => {
        current_paragraph_type = ParagraphType::Quote;
      }
      Event::End(TagEnd::BlockQuote(_)) => {
        flush_text_block(
          &mut current_text,
          current_paragraph_type,
          blocks,
          content_block_ids,
        );
        current_paragraph_type = ParagraphType::Text;
      }
      Event::Start(Tag::List(start_num)) => {
        in_list = true;
        let list_type = if start_num.is_some() {
          ListType::Numbered
        } else {
          ListType::Bulleted
        };
        list_type_stack.push(list_type);
      }
      Event::End(TagEnd::List(_)) => {
        list_type_stack.pop();
        if list_type_stack.is_empty() {
          in_list = false;
        }
      }
      Event::Start(Tag::Item) => {
        // List item start - text will be collected
      }
      Event::End(TagEnd::Item) => {
        if let Some(&list_type) = list_type_stack.last() {
          flush_list_block(&mut current_text, list_type, blocks, content_block_ids);
        }
      }
      Event::TaskListMarker(checked) => {
        // Update the current list type to be a todo item
        if let Some(last) = list_type_stack.last_mut() {
          *last = ListType::Todo(checked);
        }
      }
      Event::Start(Tag::CodeBlock(kind)) => {
        in_code_block = true;
        code_language = match kind {
          CodeBlockKind::Fenced(lang) => lang.to_string(),
          CodeBlockKind::Indented => String::new(),
        };
      }
      Event::End(TagEnd::CodeBlock) => {
        flush_code_block(&mut current_text, &code_language, blocks, content_block_ids);
        in_code_block = false;
        code_language.clear();
      }
      Event::Text(text) => {
        current_text.push_str(&text);
      }
      Event::Code(code) => {
        // Inline code - wrap in backticks for now
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
        // Horizontal rule -> divider block
        flush_text_block(
          &mut current_text,
          current_paragraph_type,
          blocks,
          content_block_ids,
        );
        let block = BlockBuilder::new(DIVIDER_FLAVOUR);
        content_block_ids.push(block.id.clone());
        blocks.push(block);
      }
      Event::Start(Tag::Strong) => {
        current_text.push_str("**");
      }
      Event::End(TagEnd::Strong) => {
        current_text.push_str("**");
      }
      Event::Start(Tag::Emphasis) => {
        current_text.push('_');
      }
      Event::End(TagEnd::Emphasis) => {
        current_text.push('_');
      }
      Event::Start(Tag::Strikethrough) => {
        current_text.push_str("~~");
      }
      Event::End(TagEnd::Strikethrough) => {
        current_text.push_str("~~");
      }
      Event::Start(Tag::Link { dest_url, .. }) => {
        current_text.push('[');
        // Store the URL for later - will be added on Event::End
        pending_link_url = Some(dest_url.to_string());
      }
      Event::End(TagEnd::Link) => {
        // Now add the closing bracket and URL
        if let Some(url) = pending_link_url.take() {
          current_text.push_str(&format!("]({})", url));
        }
      }
      _ => {}
    }
  }

  // Flush any remaining text
  flush_text_block(
    &mut current_text,
    current_paragraph_type,
    blocks,
    content_block_ids,
  );

  Ok(())
}

fn flush_text_block(
  text: &mut String,
  ptype: ParagraphType,
  blocks: &mut Vec<BlockBuilder>,
  content_block_ids: &mut Vec<String>,
) {
  let trimmed = text.trim();
  if !trimmed.is_empty() {
    let block = BlockBuilder::new(PARAGRAPH_FLAVOUR)
      .with_text(trimmed)
      .with_paragraph_type(ptype);
    content_block_ids.push(block.id.clone());
    blocks.push(block);
  }
  text.clear();
}

fn flush_list_block(
  text: &mut String,
  list_type: ListType,
  blocks: &mut Vec<BlockBuilder>,
  content_block_ids: &mut Vec<String>,
) {
  let trimmed = text.trim();
  if !trimmed.is_empty() {
    let block = BlockBuilder::new(LIST_FLAVOUR)
      .with_text(trimmed)
      .with_list_type(list_type);
    content_block_ids.push(block.id.clone());
    blocks.push(block);
  }
  text.clear();
}

fn flush_code_block(
  text: &mut String,
  language: &str,
  blocks: &mut Vec<BlockBuilder>,
  content_block_ids: &mut Vec<String>,
) {
  let trimmed = text.trim();
  if !trimmed.is_empty() {
    let block = BlockBuilder::new(CODE_FLAVOUR)
      .with_text(trimmed)
      .with_code_language(language);
    content_block_ids.push(block.id.clone());
    blocks.push(block);
  }
  text.clear();
}

/// Builds the y-octo document from parsed blocks
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

  // Create the root page block
  let page_id = nanoid::nanoid!();
  let note_id = nanoid::nanoid!();

  // Build page block
  let page_block = build_block_map(
    &doc,
    &page_id,
    PAGE_FLAVOUR,
    Some(title),
    None,
    None,
    None,
    vec![note_id.clone()],
  )?;
  blocks_map
    .insert(page_id.clone(), page_block)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Build note block (container for content)
  let note_block = build_block_map(
    &doc,
    &note_id,
    NOTE_FLAVOUR,
    None,
    None,
    None,
    None,
    content_block_ids.clone(),
  )?;
  blocks_map
    .insert(note_id, note_block)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Build content blocks
  for block in content_blocks {
    let block_map = build_block_map(
      &doc,
      &block.id,
      &block.flavour,
      None,
      Some(&block.text_content),
      block.paragraph_type,
      block.list_type,
      block.children,
    )?;

    // Add code language if present
    if let Some(lang) = &block.code_language {
      let mut map = block_map;
      map
        .insert("prop:language".to_string(), Any::String(lang.clone()))
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
      blocks_map
        .insert(block.id, map)
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    } else {
      blocks_map
        .insert(block.id, block_map)
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
  }

  // Encode the document as binary
  doc
    .encode_update_v1()
    .map_err(|e| ParseError::ParserError(e.to_string()))
}

/// Builds a block map with the given properties
fn build_block_map(
  doc: &y_octo::Doc,
  block_id: &str,
  flavour: &str,
  title: Option<&str>,
  text_content: Option<&str>,
  paragraph_type: Option<ParagraphType>,
  list_type: Option<ListType>,
  children: Vec<String>,
) -> Result<y_octo::Map, ParseError> {
  let mut block = doc
    .create_map()
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Required fields
  block
    .insert("sys:id".to_string(), Any::String(block_id.to_string()))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;
  block
    .insert("sys:flavour".to_string(), Any::String(flavour.to_string()))
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Children array
  let mut children_array = doc
    .create_array()
    .map_err(|e| ParseError::ParserError(e.to_string()))?;
  for (idx, child_id) in children.into_iter().enumerate() {
    children_array
      .insert(idx as u64, Any::String(child_id))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }
  block
    .insert("sys:children".to_string(), children_array)
    .map_err(|e| ParseError::ParserError(e.to_string()))?;

  // Title (for page blocks)
  if let Some(title) = title {
    block
      .insert("prop:title".to_string(), Any::String(title.to_string()))
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Text content
  if let Some(content) = text_content {
    let mut text = doc
      .create_text()
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
    text
      .insert(0, content)
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
    block
      .insert("prop:text".to_string(), text)
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // Paragraph type
  if let Some(ptype) = paragraph_type {
    block
      .insert(
        "prop:type".to_string(),
        Any::String(ptype.as_str().to_string()),
      )
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
  }

  // List type and checked state
  if let Some(ltype) = list_type {
    block
      .insert(
        "prop:type".to_string(),
        Any::String(ltype.as_str().to_string()),
      )
      .map_err(|e| ParseError::ParserError(e.to_string()))?;
    if matches!(ltype, ListType::Todo(_)) {
      block
        .insert(
          "prop:checked".to_string(),
          if ltype.is_checked() {
            Any::True
          } else {
            Any::False
          },
        )
        .map_err(|e| ParseError::ParserError(e.to_string()))?;
    }
  }

  Ok(block)
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
  fn test_extract_title() {
    assert_eq!(extract_title("# My Title\n\nContent"), "My Title");
    assert_eq!(extract_title("No heading"), "Untitled");
    assert_eq!(extract_title("## Secondary\n\nContent"), "Untitled");
  }

  // TODO: Fix roundtrip test - there's an issue with y-octo parsing back nested types
  // #[test]
  // fn test_roundtrip() {
  //   use super::super::affine::parse_doc_to_markdown;
  //
  //   let original_md = "# Test Document\n\nHello world.\n\n## Section\n\nMore content.";
  //   let doc_id = "roundtrip-test";
  //
  //   let bin = markdown_to_ydoc(original_md, doc_id).expect("Should convert to ydoc");
  //
  //   let result = parse_doc_to_markdown(bin, doc_id.to_string(), false, None);
  //   assert!(result.is_ok());
  //   let parsed = result.unwrap();
  //
  //   // Title should match
  //   assert_eq!(parsed.title, "Test Document");
  //
  //   // Content should contain key text
  //   assert!(parsed.markdown.contains("Hello world"));
  //   assert!(parsed.markdown.contains("Section"));
  //   assert!(parsed.markdown.contains("More content"));
  // }
}
