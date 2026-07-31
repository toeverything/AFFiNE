use super::{build_full_doc, parse_doc_to_markdown, update_doc};

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
    let expected = "```rust\nfn main() {}\n\n```\n\n";
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
fn test_roundtrip_inline_math() {
    // `$…$` → inline equation (a space insert carrying a `latex` attribute) → `$…$`.
    let markdown = "The identity $e^{i\\pi}+1=0$ is famous.";
    let expected = "The identity $e^{i\\pi}+1=0$ is famous.\n\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_inline_math_in_list() {
    let markdown = "- step $x^2$ done";
    let expected = "* step $x^2$ done\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_block_math() {
    // `$$…$$` standing alone in a paragraph → an `affine:latex` block → fenced `$$\n…\n$$`.
    let markdown = "$$\\int_0^1 x^2 dx = \\frac{1}{3}$$";
    let expected = "$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_block_math_fenced_multiline() {
    let markdown = "$$\ne^{i\\pi}+1=0\n$$";
    let expected = "$$\ne^{i\\pi}+1=0\n$$\n\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_inline_and_block_math() {
    let markdown = "Euler: $e^{i\\pi}+1=0$.\n\n$$\\int_0^1 x^2 dx = \\frac{1}{3}$$";
    let expected = "Euler: $e^{i\\pi}+1=0$.\n\n$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_dollar_amounts_are_not_math() {
    // Currency must stay literal — `$5 … $10` does not form a math span.
    let markdown = "Pay $5 and then $10 more.";
    let expected = "Pay $5 and then $10 more.\n\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_block_math_keeps_trailing_text_in_same_paragraph() {
    // Regression: `$$…$$` opening a paragraph must not swallow the prose that follows it.
    let markdown = "$$E=mc^2$$ explains mass-energy equivalence.";
    let doc_id = "roundtrip-math-trailing";
    let title = "Roundtrip Title";
    let bin = build_full_doc(title, markdown, doc_id).expect("create doc");
    let result = parse_doc_to_markdown(bin, doc_id.to_string(), false, None).expect("parse doc");
    assert!(
        result.markdown.contains("$$\nE=mc^2\n$$"),
        "latex block lost: {}",
        result.markdown
    );
    assert!(
        result.markdown.contains("explains mass-energy equivalence."),
        "trailing text lost: {}",
        result.markdown
    );
}

#[test]
fn test_roundtrip_literal_dollar_text_stays_literal() {
    // Regression: literal `$…$` prose must not re-parse as an equation. The reader escapes the
    // `$` that could open math (`\$S`); a `$` before whitespace can never pair and stays bare.
    let markdown = "The set \\$S\\$ is closed.";
    let expected = "The set \\$S$ is closed.\n\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_table_update_preserves_row_and_column_ids() {
    use y_octo::DocOptions;

    use super::blocksuite::get_string;

    // Regression: a one-cell table edit must reuse the stored row/column ids (an O(cells)
    // clear-and-remint would drop concurrent app edits and invalidate id-keyed app state).
    let doc_id = "table-id-stability";
    let initial = build_full_doc("T", "| A | B |\n| --- | --- |\n| 1 | 2 |", doc_id).expect("create doc");
    let delta = update_doc(&initial, "| A | B |\n| --- | --- |\n| 1 | changed |", doc_id).expect("update doc");

    let table_meta_keys = |doc: &y_octo::Doc| -> Vec<String> {
        let blocks = doc.get_map("blocks").expect("blocks map");
        for (_, value) in blocks.iter() {
            if let Some(block) = value.to_map()
                && get_string(&block, "sys:flavour").as_deref() == Some("affine:table")
            {
                let mut keys: Vec<String> = block
                    .keys()
                    .filter(|k| k.starts_with("prop:rows.") || k.starts_with("prop:columns."))
                    .map(|s| s.to_string())
                    .collect();
                keys.sort();
                return keys;
            }
        }
        panic!("no table block found");
    };

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&initial).expect("apply initial");
    let ids_before = table_meta_keys(&doc);
    assert!(!ids_before.is_empty());

    doc.apply_update_from_binary_v1(&delta).expect("apply delta");
    let ids_after = table_meta_keys(&doc);
    assert_eq!(ids_before, ids_after, "row/column ids must survive a cell edit");

    let merged = doc.encode_update_v1().expect("encode merged");
    let result = parse_doc_to_markdown(merged, doc_id.to_string(), false, None).expect("parse doc");
    assert!(
        result.markdown.contains("changed"),
        "cell edit lost: {}",
        result.markdown
    );
}

#[test]
fn test_empty_display_math_produces_no_block() {
    // Regression: `$$$$` must vanish without leaving a stray empty paragraph block behind.
    let markdown = "$$$$";
    let doc_id = "roundtrip-empty-math";
    let title = "Roundtrip Title";
    let bin = build_full_doc(title, markdown, doc_id).expect("create doc");
    let result = parse_doc_to_markdown(bin, doc_id.to_string(), false, None).expect("parse doc");
    assert_eq!(result.markdown, "", "expected no blocks, got: {}", result.markdown);
}
