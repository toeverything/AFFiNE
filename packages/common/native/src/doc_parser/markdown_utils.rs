//! Shared markdown utilities for the doc_parser module

use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};

/// Extracts the title from the first H1 heading in markdown content.
///
/// Returns "Untitled" if no H1 heading is found.
pub(crate) fn extract_title(markdown: &str) -> String {
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
}
