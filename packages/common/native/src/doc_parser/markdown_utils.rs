//! Shared markdown utilities for the doc_parser module

use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};

/// Block flavours used in AFFiNE documents
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockFlavour {
  Paragraph,
  List,
  Code,
  Divider,
}

impl BlockFlavour {
  pub fn as_str(&self) -> &'static str {
    match self {
      BlockFlavour::Paragraph => "affine:paragraph",
      BlockFlavour::List => "affine:list",
      BlockFlavour::Code => "affine:code",
      BlockFlavour::Divider => "affine:divider",
    }
  }
}

/// Block types for paragraphs and lists
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockType {
  // Paragraph types
  #[allow(dead_code)] // Used via as_str() for default paragraph type
  Text,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Quote,
  // List types
  Bulleted,
  Numbered,
  Todo,
}

impl BlockType {
  pub fn as_str(&self) -> &'static str {
    match self {
      BlockType::Text => "text",
      BlockType::H1 => "h1",
      BlockType::H2 => "h2",
      BlockType::H3 => "h3",
      BlockType::H4 => "h4",
      BlockType::H5 => "h5",
      BlockType::H6 => "h6",
      BlockType::Quote => "quote",
      BlockType::Bulleted => "bulleted",
      BlockType::Numbered => "numbered",
      BlockType::Todo => "todo",
    }
  }

  pub fn from_heading_level(level: HeadingLevel) -> Self {
    match level {
      HeadingLevel::H1 => BlockType::H1,
      HeadingLevel::H2 => BlockType::H2,
      HeadingLevel::H3 => BlockType::H3,
      HeadingLevel::H4 => BlockType::H4,
      HeadingLevel::H5 => BlockType::H5,
      HeadingLevel::H6 => BlockType::H6,
    }
  }
}

/// A parsed block from markdown content
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedBlock {
  pub flavour: BlockFlavour,
  pub block_type: Option<BlockType>,
  pub content: String,
  pub checked: Option<bool>,
  pub language: Option<String>,
}

/// Parses markdown content into a list of parsed blocks.
///
/// This is the shared parsing logic used by both `markdown_to_ydoc` and
/// `update_ydoc`.
///
/// # Arguments
/// * `markdown` - The markdown content to parse
/// * `skip_first_h1` - If true, the first H1 heading is skipped (used as
///   document title)
///
/// # Returns
/// A vector of parsed blocks
pub fn parse_markdown_blocks(markdown: &str, skip_first_h1: bool) -> Vec<ParsedBlock> {
  // Note: ENABLE_TABLES is included for future support, but table events
  // currently fall through to the catch-all match arm. Table content appears as
  // plain text.
  let options = Options::ENABLE_STRIKETHROUGH
    | Options::ENABLE_TABLES
    | Options::ENABLE_TASKLISTS
    | Options::ENABLE_HEADING_ATTRIBUTES;
  let parser = Parser::new_ext(markdown, options);

  let mut blocks = Vec::new();
  let mut current_text = String::new();
  let mut current_type: Option<BlockType> = None;
  let mut current_flavour = BlockFlavour::Paragraph;
  let mut in_list = false;
  let mut list_type_stack: Vec<BlockType> = Vec::new();
  // Per-item type override for task list markers (resets at each Item start)
  let mut current_item_type: Option<BlockType> = None;
  let mut in_code_block = false;
  let mut code_language = String::new();
  let mut first_h1_seen = !skip_first_h1; // If not skipping, mark as already seen
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

        if level == HeadingLevel::H1 && !first_h1_seen {
          // Skip the first H1 - it's used as the document title
          current_type = Some(BlockType::H1);
        } else {
          current_type = Some(BlockType::from_heading_level(level));
        }
        current_flavour = BlockFlavour::Paragraph;
      }
      Event::End(TagEnd::Heading(level)) => {
        if level == HeadingLevel::H1 && !first_h1_seen {
          first_h1_seen = true;
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
        current_type = Some(BlockType::Quote);
        current_flavour = BlockFlavour::Paragraph;
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
          BlockType::Numbered
        } else {
          BlockType::Bulleted
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
        current_flavour = BlockFlavour::List;
        // Reset per-item type override
        current_item_type = None;
        if let Some(lt) = list_type_stack.last() {
          current_type = Some(*lt);
        }
      }
      Event::End(TagEnd::Item) => {
        // Use per-item override if set (for task items), otherwise use current_type
        if let Some(item_type) = current_item_type.take() {
          current_type = Some(item_type);
        }
        flush_block(
          &mut blocks,
          &mut current_text,
          current_flavour,
          current_type.take(),
          current_checked.take(),
          None,
        );
        current_flavour = BlockFlavour::Paragraph;
      }
      Event::TaskListMarker(checked) => {
        // Set per-item type override for this specific item only
        current_item_type = Some(BlockType::Todo);
        current_checked = Some(checked);
      }
      Event::Start(Tag::CodeBlock(kind)) => {
        in_code_block = true;
        current_flavour = BlockFlavour::Code;
        code_language = match kind {
          CodeBlockKind::Fenced(lang) => lang.to_string(),
          CodeBlockKind::Indented => String::new(),
        };
      }
      Event::End(TagEnd::CodeBlock) => {
        flush_code_block(&mut blocks, &mut current_text, &code_language);
        in_code_block = false;
        code_language.clear();
        current_flavour = BlockFlavour::Paragraph;
      }
      Event::Text(text) => {
        current_text.push_str(&text);
      }
      Event::Code(code) => {
        // Inline code - wrap in backticks
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
        blocks.push(ParsedBlock {
          flavour: BlockFlavour::Divider,
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

  blocks
}

fn flush_block(
  blocks: &mut Vec<ParsedBlock>,
  text: &mut String,
  flavour: BlockFlavour,
  block_type: Option<BlockType>,
  checked: Option<bool>,
  language: Option<String>,
) {
  let trimmed = text.trim();
  if !trimmed.is_empty() || flavour == BlockFlavour::Divider {
    blocks.push(ParsedBlock {
      flavour,
      block_type,
      content: trimmed.to_string(),
      checked,
      language,
    });
  }
  text.clear();
}

fn flush_code_block(blocks: &mut Vec<ParsedBlock>, text: &mut String, language: &str) {
  // Preserve leading whitespace (indentation) in code blocks as it may be
  // semantically significant (e.g., Python, YAML). Only strip leading/trailing
  // newlines which are typically artifacts from code fence parsing.
  let content = text.trim_matches('\n');
  if !content.is_empty() {
    blocks.push(ParsedBlock {
      flavour: BlockFlavour::Code,
      block_type: None,
      content: content.to_string(),
      checked: None,
      language: if language.is_empty() {
        None
      } else {
        Some(language.to_string())
      },
    });
  }
  text.clear();
}

/// Extracts the title from the first H1 heading in markdown content.
///
/// Returns "Untitled" if no H1 heading is found.
pub(crate) fn extract_title(markdown: &str) -> String {
  let parser = Parser::new(markdown);
  let mut in_heading = false;
  let mut title = String::new();

  for event in parser {
    match event {
      Event::Start(Tag::Heading {
        level: HeadingLevel::H1,
        ..
      }) => {
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_extract_title_simple() {
    assert_eq!(extract_title("# Hello World\n\nContent"), "Hello World");
  }

  #[test]
  fn test_extract_title_with_code() {
    assert_eq!(extract_title("# Hello `code` World"), "Hello code World");
  }

  #[test]
  fn test_extract_title_empty() {
    assert_eq!(extract_title("No heading here"), "Untitled");
  }

  #[test]
  fn test_extract_title_h2_not_used() {
    assert_eq!(extract_title("## H2 heading\n\nContent"), "Untitled");
  }

  #[test]
  fn test_parse_markdown_blocks_simple() {
    let blocks = parse_markdown_blocks("# Title\n\nParagraph text.", true);
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0].flavour, BlockFlavour::Paragraph);
    assert_eq!(blocks[0].content, "Paragraph text.");
  }

  #[test]
  fn test_parse_markdown_blocks_with_headings() {
    let blocks = parse_markdown_blocks("# Title\n\n## Section\n\nText.", true);
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].block_type, Some(BlockType::H2));
    assert_eq!(blocks[0].content, "Section");
    assert_eq!(blocks[1].content, "Text.");
  }

  #[test]
  fn test_parse_markdown_blocks_lists() {
    let blocks = parse_markdown_blocks("# Title\n\n- Item 1\n- Item 2", true);
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].flavour, BlockFlavour::List);
    assert_eq!(blocks[0].block_type, Some(BlockType::Bulleted));
    assert_eq!(blocks[0].content, "Item 1");
  }

  #[test]
  fn test_parse_markdown_blocks_task_list() {
    let blocks = parse_markdown_blocks("# Title\n\n- [ ] Unchecked\n- [x] Checked", true);
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].block_type, Some(BlockType::Todo));
    assert_eq!(blocks[0].checked, Some(false));
    assert_eq!(blocks[1].block_type, Some(BlockType::Todo));
    assert_eq!(blocks[1].checked, Some(true));
  }

  #[test]
  fn test_parse_markdown_blocks_code() {
    let blocks = parse_markdown_blocks("# Title\n\n```rust\nfn main() {}\n```", true);
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0].flavour, BlockFlavour::Code);
    assert_eq!(blocks[0].language, Some("rust".to_string()));
  }

  #[test]
  fn test_parse_markdown_blocks_divider() {
    let blocks = parse_markdown_blocks("# Title\n\nBefore\n\n---\n\nAfter", true);
    assert_eq!(blocks.len(), 3);
    assert_eq!(blocks[1].flavour, BlockFlavour::Divider);
  }

  #[test]
  fn test_parse_markdown_blocks_code_preserves_indentation() {
    let blocks = parse_markdown_blocks("# Title\n\n```python\n    def indented():\n        pass\n```", true);
    assert_eq!(blocks.len(), 1);
    assert!(blocks[0].content.starts_with("    def"));
  }
}
