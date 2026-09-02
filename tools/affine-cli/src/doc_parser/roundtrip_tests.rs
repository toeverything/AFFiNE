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
    // Currency must stay literal: `$5 … $10` does not form a math span on ingest, and the
    // reader escapes each `$` before a digit so the export cannot form one either.
    let markdown = "Pay $5 and then $10 more.";
    let expected = "Pay \\$5 and then \\$10 more.\n\n";
    assert_markdown_roundtrip(markdown, expected);
}

#[test]
fn test_roundtrip_currency_range_stays_plain_text() {
    // Regression: `$10-$20` is exactly the shape pulldown-cmark reads as the equation `10-`.
    // A literal-dollar doc must export escaped and re-ingest as plain text, twice over, with
    // no `latex` op ever appearing.
    let doc_id = "roundtrip-currency-range";
    let title = "Roundtrip Title";
    let plain = "a $10-$20 range";

    let bin = build_full_doc(title, "a \\$10-\\$20 range", doc_id).expect("create doc");
    assert_no_inline_latex(&bin, doc_id);
    assert_eq!(paragraph_plain_text(&bin, doc_id), plain);
    let exported = parse_doc_to_markdown(bin, doc_id.to_string(), false, None).expect("parse doc");
    assert_eq!(exported.markdown, "a \\$10-\\$20 range\n\n");

    let reingested = build_full_doc(title, &exported.markdown, doc_id).expect("re-ingest doc");
    assert_no_inline_latex(&reingested, doc_id);
    assert_eq!(
        paragraph_plain_text(&reingested, doc_id),
        plain,
        "currency range must survive as literal text"
    );
    let exported_again = parse_doc_to_markdown(reingested, doc_id.to_string(), false, None).expect("parse doc");
    assert_eq!(exported_again.markdown, exported.markdown, "export must be stable");
}

fn for_each_block(bin: &[u8], doc_id: &str, mut visit: impl FnMut(y_octo::Map)) {
    // The doc must outlive the block handles it hands out, so walk inside one function.
    let mut doc = y_octo::DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(bin).expect("apply update");
    let blocks = doc.get_map("blocks").expect("blocks map");
    for (_, value) in blocks.iter() {
        if let Some(block) = value.to_map() {
            visit(block);
        }
    }
}

fn assert_no_inline_latex(bin: &[u8], doc_id: &str) {
    use y_octo::TextDeltaOp;

    for_each_block(bin, doc_id, |block| {
        assert_ne!(
            super::blocksuite::get_string(&block, "sys:flavour").as_deref(),
            Some("affine:latex"),
            "unexpected affine:latex block"
        );
        let Some(text) = block.get("prop:text").and_then(|v| v.to_text()) else {
            return;
        };
        for op in text.to_delta() {
            if let TextDeltaOp::Insert {
                format: Some(attrs), ..
            } = op
            {
                assert!(!attrs.contains_key("latex"), "unexpected latex op: {attrs:?}");
            }
        }
    });
}

fn paragraph_plain_text(bin: &[u8], doc_id: &str) -> String {
    let mut found = None;
    for_each_block(bin, doc_id, |block| {
        if super::blocksuite::get_string(&block, "sys:flavour").as_deref() == Some("affine:paragraph") {
            found = block
                .get("prop:text")
                .and_then(|v| v.to_text())
                .map(|text| text.to_string());
        }
    });
    found.expect("paragraph text")
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
                // Cell keys embed `<rowId>:<columnId>`, so they are part of the id contract too.
                let mut keys: Vec<String> = block
                    .keys()
                    .filter(|k| {
                        k.starts_with("prop:rows.") || k.starts_with("prop:columns.") || k.starts_with("prop:cells.")
                    })
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
fn test_table_update_preserves_app_authored_row_and_column_props() {
    use y_octo::{Any, DocOptions};

    use super::blocksuite::get_string;

    // Regression: the stale-key sweep used to whitelist only the keys the CLI writes itself
    // (`.rowId`/`.columnId`/`.order`/`.text`), so app-authored props on retained rows/columns
    // (`prop:columns.<id>.width`, `prop:rows.<id>.backgroundColor`) were deleted by a cell edit.
    let doc_id = "table-app-props";
    let initial = build_full_doc("T", "| A | B |\n| --- | --- |\n| 1 | 2 |", doc_id).expect("create doc");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&initial).expect("apply initial");

    let table_block_id = {
        let blocks = doc.get_map("blocks").expect("blocks map");
        blocks
            .iter()
            .find_map(|(id, value)| {
                let block = value.to_map()?;
                (get_string(&block, "sys:flavour").as_deref() == Some("affine:table")).then(|| id.to_string())
            })
            .expect("no table block found")
    };
    let table_block = |doc: &y_octo::Doc| -> y_octo::Map {
        doc.get_map("blocks")
            .expect("blocks map")
            .get(&table_block_id)
            .and_then(|value| value.to_map())
            .expect("table block")
    };
    let id_at = |block: &y_octo::Map, prefix: &str| -> String {
        let mut keys: Vec<String> = block
            .keys()
            .filter(|k| k.starts_with(prefix) && k.ends_with(".order"))
            .map(|s| s.to_string())
            .collect();
        keys.sort();
        keys[0]
            .strip_prefix(prefix)
            .and_then(|rest| rest.strip_suffix(".order"))
            .expect("order key shape")
            .to_string()
    };

    // Simulate the app setting a column width and a row background on the stored table.
    let (row_id, column_id, width_key, background_key) = {
        let mut block = table_block(&doc);
        let row_id = id_at(&block, "prop:rows.");
        let column_id = id_at(&block, "prop:columns.");
        let width_key = format!("prop:columns.{column_id}.width");
        let background_key = format!("prop:rows.{row_id}.backgroundColor");
        block
            .insert(width_key.clone(), Any::Float64(180.0.into()))
            .expect("insert width");
        block
            .insert(background_key.clone(), Any::String("--affine-v2-table-red".to_string()))
            .expect("insert background");
        (row_id, column_id, width_key, background_key)
    };
    let stored = doc.encode_update_v1().expect("encode stored");

    let delta = update_doc(&stored, "| A | B |\n| --- | --- |\n| 1 | changed |", doc_id).expect("update doc");
    doc.apply_update_from_binary_v1(&delta).expect("apply delta");

    let block = table_block(&doc);
    assert_eq!(id_at(&block, "prop:rows."), row_id, "row id must be reused");
    assert_eq!(id_at(&block, "prop:columns."), column_id, "column id must be reused");
    assert!(
        matches!(block.get(&width_key), Some(y_octo::Value::Any(Any::Float64(width))) if width.into_inner() == 180.0),
        "app-authored column width must survive: {:?}",
        block.get(&width_key)
    );
    assert_eq!(
        get_string(&block, &background_key).as_deref(),
        Some("--affine-v2-table-red"),
        "app-authored row background must survive"
    );

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
