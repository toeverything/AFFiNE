use super::{build_full_doc, parse_doc_to_markdown};

fn assert_markdown_roundtrip(markdown: &str, expected: &str) {
  let doc_id = "roundtrip-doc";
  let title = "Roundtrip Title";
  let bin = build_full_doc(title, markdown, doc_id).expect("create doc");
  let result = parse_doc_to_markdown(bin, doc_id.to_string(), false, None).expect("parse doc");
  assert_eq!(result.title, title);
  assert_eq!(result.markdown, expected);
}

#[test]
fn test_roundtrip_inline_styles() {
  let markdown = "Inline **bold** _italic_ ~~strike~~ `code` [Link](https://example.com).";
  let expected = "Inline **bold** _italic_ ~~strike~~ `code` [Link](https://example.com).\n\n";
  assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_list_items() {
  let markdown = "- Item 1\n- Item 2\n- [ ] Task\n- [x] Done";
  let expected = "* Item 1\n* Item 2\n- [ ] Task\n- [x] Done\n";
  assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_code_block() {
  let markdown = "```rust\nfn main() {}\n```";
  let expected = "```rust\nfn main() {}\n```\n\n";
  assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_code_block_indentation() {
  let markdown = "```python\n    def indented():\n        return \"ok\"\n```";
  let doc_id = "roundtrip-indent";
  let title = "Roundtrip Title";
  let bin = build_full_doc(title, markdown, doc_id).expect("create doc");
  let result = parse_doc_to_markdown(bin, doc_id.to_string(), false, None).expect("parse doc");
  assert!(result.markdown.contains("\n    def indented():"));
  assert!(result.markdown.contains("\n        return \"ok\""));
}

#[test]
fn test_roundtrip_table() {
  let markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  let expected = "|A|B|\n|---|---|\n|1|2|\n\n";
  assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_image_with_caption() {
  let markdown = "![Alt](blob://image-id)";
  let expected = "<img\n  src=\"blob://image-id\"\n  alt=\"Alt\"\n  width=\"auto\"\n  height=\"auto\"\n/>\n\n";
  assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_quote_preserves_paragraph_and_soft_breaks() {
  let markdown = "> first line\n> second line";
  let expected = "> first line\n> second line\n\n";
  assert_markdown_roundtrip(markdown, expected);

  let paragraphs = "> first paragraph\n>\n> second paragraph";
  let bin = build_full_doc("Quote", paragraphs, "quote-paragraphs").expect("create quote doc");
  let rendered = parse_doc_to_markdown(bin, "quote-paragraphs".to_string(), false, None)
    .expect("render quote doc")
    .markdown;
  assert!(rendered.contains("> first paragraph\n> \n> second paragraph"));
  let reparsed = build_full_doc("Quote", &rendered, "quote-paragraphs-reparsed").expect("reparse quote markdown");
  let rerendered = parse_doc_to_markdown(reparsed, "quote-paragraphs-reparsed".to_string(), false, None)
    .expect("rerender quote doc")
    .markdown;
  assert_eq!(rerendered, rendered);
}

#[test]
fn test_roundtrip_preserves_text_after_inline_image() {
  let markdown = "Intro ![Alt](blob://image-id) trailing text";
  let bin = build_full_doc("Image", markdown, "inline-image-text").expect("create doc");
  let rendered = parse_doc_to_markdown(bin, "inline-image-text".to_string(), false, None)
    .expect("render doc")
    .markdown;

  assert!(rendered.contains("Intro"));
  assert!(rendered.contains("trailing text"));
}

#[test]
fn test_roundtrip_code_block_uses_a_safe_fence() {
  let markdown = "````markdown\n```\ninside\n```\n````";
  let bin = build_full_doc("Fence", markdown, "safe-fence").expect("create doc");
  let rendered = parse_doc_to_markdown(bin.clone(), "safe-fence".to_string(), false, None)
    .expect("render doc")
    .markdown;
  assert!(rendered.starts_with("````markdown\n```\n"));

  let reparsed = build_full_doc("Fence", &rendered, "safe-fence-reparsed").expect("reparse rendered markdown");
  let rerendered = parse_doc_to_markdown(reparsed, "safe-fence-reparsed".to_string(), false, None)
    .expect("rerender doc")
    .markdown;
  assert_eq!(rerendered, rendered);
}
