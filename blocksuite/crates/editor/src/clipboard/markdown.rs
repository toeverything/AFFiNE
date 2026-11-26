//! Pure-Rust Markdown clipboard importer and exporter replacing `remark` / `rehype`.

use std::collections::BTreeMap;

use blocksuite_playground_doc::schema::{BlockSpec, ListType, ParagraphType};
use serde_json::{Value, json};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use super::{Slice, SliceBlock, sanitize::sanitize_url, text_value};

/// Export a [`Slice`] to standard GitHub-Flavored Markdown.
pub fn slice_to_markdown(slice: &Slice) -> String {
    let mut lines = Vec::new();
    for block in &slice.content {
        export_block(block, 0, &mut lines);
    }
    lines.join("\n")
}

fn export_block(block: &SliceBlock, depth: usize, out: &mut Vec<String>) {
    let indent = "  ".repeat(depth);
    let inline = delta_to_markdown(&block.delta());
    match block.flavour.as_str() {
        "affine:code" => {
            let lang = block
                .props
                .get("language")
                .and_then(Value::as_str)
                .unwrap_or("");
            out.push(format!("{indent}```{lang}"));
            out.push(block.plain());
            out.push(format!("{indent}```"));
        }
        "affine:divider" => out.push(format!("{indent}---")),
        "affine:latex" => {
            let tex = block
                .props
                .get("latex")
                .and_then(Value::as_str)
                .unwrap_or("");
            out.push(format!("{indent}$$\n{tex}\n$$"));
        }
        "affine:callout" => {
            out.push(format!("{indent}> [!NOTE]"));
            if !inline.is_empty() {
                out.push(format!("{indent}> {inline}"));
            }
            for child in &block.children {
                out.push(format!("{indent}> {}", delta_to_markdown(&child.delta())));
            }
            return;
        }
        "affine:table" => {
            if let Some(md) = export_table_markdown(block) {
                out.push(md);
            }
        }
        "affine:list" => {
            let kind = block
                .props
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("bulleted");
            match kind {
                "numbered" => {
                    let order = block
                        .props
                        .get("order")
                        .and_then(Value::as_i64)
                        .unwrap_or(1);
                    out.push(format!("{indent}{order}. {inline}"));
                }
                "todo" => {
                    let checked = block.props.get("checked") == Some(&Value::Bool(true));
                    let mark = if checked { "x" } else { " " };
                    out.push(format!("{indent}- [{mark}] {inline}"));
                }
                _ => out.push(format!("{indent}- {inline}")),
            }
        }
        _ => match block.spec() {
            BlockSpec::Paragraph { paragraph_type, .. } => match paragraph_type {
                ParagraphType::H1 => out.push(format!("{indent}# {inline}")),
                ParagraphType::H2 => out.push(format!("{indent}## {inline}")),
                ParagraphType::H3 => out.push(format!("{indent}### {inline}")),
                ParagraphType::H4 => out.push(format!("{indent}#### {inline}")),
                ParagraphType::H5 => out.push(format!("{indent}##### {inline}")),
                ParagraphType::H6 => out.push(format!("{indent}###### {inline}")),
                ParagraphType::Quote => out.push(format!("{indent}> {inline}")),
                ParagraphType::Text => out.push(format!("{indent}{inline}")),
            },
            _ => out.push(format!("{indent}{inline}")),
        },
    }
    for child in &block.children {
        export_block(child, depth + 1, out);
    }
}

fn export_table_markdown(block: &SliceBlock) -> Option<String> {
    let mut row_ids: Vec<(String, String)> = Vec::new();
    let mut col_ids: Vec<(String, String)> = Vec::new();
    for (k, v) in &block.props {
        if let Some(rest) = k.strip_prefix("rows.")
            && let Some(id) = rest.strip_suffix(".order")
        {
            row_ids.push((v.as_str().unwrap_or("").to_string(), id.to_string()));
        } else if let Some(rest) = k.strip_prefix("columns.")
            && let Some(id) = rest.strip_suffix(".order")
        {
            col_ids.push((v.as_str().unwrap_or("").to_string(), id.to_string()));
        }
    }
    if row_ids.is_empty()
        && let Some(rows) = block.props.get("rows").and_then(Value::as_object)
    {
        for (k, v) in rows {
            let order = v.get("order").and_then(Value::as_str).unwrap_or("");
            row_ids.push((order.to_string(), k.clone()));
        }
    }
    if col_ids.is_empty()
        && let Some(cols) = block.props.get("columns").and_then(Value::as_object)
    {
        for (k, v) in cols {
            let order = v.get("order").and_then(Value::as_str).unwrap_or("");
            col_ids.push((order.to_string(), k.clone()));
        }
    }
    let cells = block.props.get("cells").and_then(Value::as_object);
    row_ids.sort();
    col_ids.sort();
    if row_ids.is_empty() || col_ids.is_empty() {
        return None;
    }
    let extract_text = |t: &Value| -> Option<String> {
        t.as_str().map(str::to_string).or_else(|| {
            t.get("delta").and_then(Value::as_array).map(|ops| {
                ops.iter()
                    .filter_map(|op| op.get("insert").and_then(Value::as_str))
                    .collect::<String>()
            })
        })
    };
    let mut lines = Vec::new();
    for (r_idx, (_, row_id)) in row_ids.iter().enumerate() {
        let mut row_cells = Vec::with_capacity(col_ids.len());
        for (_, col_id) in &col_ids {
            let key = format!("{row_id}:{col_id}");
            let flat_key = format!("cells.{key}.text");
            let text = block
                .props
                .get(&flat_key)
                .and_then(extract_text)
                .or_else(|| {
                    cells
                        .and_then(|c| c.get(&key))
                        .and_then(|cell| cell.get("text"))
                        .and_then(extract_text)
                })
                .unwrap_or_default();
            row_cells.push(text.replace('|', "\\|"));
        }
        lines.push(format!("| {} |", row_cells.join(" | ")));
        if r_idx == 0 {
            let sep = vec!["---"; col_ids.len()].join(" | ");
            lines.push(format!("| {sep} |"));
        }
    }
    Some(lines.join("\n"))
}

fn delta_to_markdown(delta: &[TextDeltaOp]) -> String {
    let mut out = String::new();
    for op in delta {
        let TextDeltaOp::Insert {
            insert: TextInsert::Text(s),
            format,
        } = op
        else {
            continue;
        };
        let mut chunk = s.clone();
        if let Some(attrs) = format {
            if let Some(Any::String(tex)) = attrs.get("latex") {
                out.push_str(&format!("${tex}$"));
                continue;
            }
            if attrs.get("code") == Some(&Any::True) {
                chunk = format!("`{chunk}`");
            }
            if attrs.get("strike") == Some(&Any::True) {
                chunk = format!("~~{chunk}~~");
            }
            if attrs.get("italic") == Some(&Any::True) {
                chunk = format!("*{chunk}*");
            }
            if attrs.get("bold") == Some(&Any::True) {
                chunk = format!("**{chunk}**");
            }
            if let Some(Any::String(url)) = attrs.get("link")
                && let Some(safe) = sanitize_url(url)
            {
                chunk = format!("[{chunk}]({safe})");
            }
        }
        out.push_str(&chunk);
    }
    out
}

/// Parse GitHub-Flavored Markdown into a sanitized [`Slice`].
pub fn parse_markdown_blocks(input: &str) -> Option<Slice> {
    let normalized = input.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mut blocks = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() {
            i += 1;
            continue;
        }
        // Fenced code block
        if let Some(rest) = trimmed.strip_prefix("```") {
            let lang = rest.trim().to_string();
            i += 1;
            let mut code_lines = Vec::new();
            while i < lines.len() && !lines[i].trim().starts_with("```") {
                code_lines.push(lines[i]);
                i += 1;
            }
            if i < lines.len() {
                i += 1;
            }
            let mut b = SliceBlock::plain_block(&code_lines.join("\n"), blocks.len());
            b.flavour = "affine:code".into();
            if !lang.is_empty() {
                b.props.insert("language".into(), json!(lang));
            }
            blocks.push(b);
            continue;
        }
        // Block LaTeX math ($$ ... $$)
        if trimmed == "$$" {
            i += 1;
            let mut math_lines = Vec::new();
            while i < lines.len() && lines[i].trim() != "$$" {
                math_lines.push(lines[i]);
                i += 1;
            }
            if i < lines.len() {
                i += 1;
            }
            let mut b = SliceBlock {
                kind: "block".into(),
                id: blocks.len().to_string(),
                flavour: "affine:latex".into(),
                version: Some(1),
                props: BTreeMap::new(),
                children: Vec::new(),
            };
            b.props
                .insert("latex".into(), json!(math_lines.join("\n").trim()));
            blocks.push(b);
            continue;
        }
        // Horizontal rule
        if is_divider_line(trimmed) {
            blocks.push(SliceBlock {
                kind: "block".into(),
                id: blocks.len().to_string(),
                flavour: "affine:divider".into(),
                version: Some(1),
                props: BTreeMap::new(),
                children: Vec::new(),
            });
            i += 1;
            continue;
        }
        // GFM Table
        if trimmed.starts_with('|')
            && i + 1 < lines.len()
            && is_table_separator(lines[i + 1].trim())
        {
            let mut table_rows = vec![split_table_row(trimmed)];
            i += 2;
            while i < lines.len() && lines[i].trim().starts_with('|') {
                table_rows.push(split_table_row(lines[i].trim()));
                i += 1;
            }
            let delta_rows = table_rows
                .into_iter()
                .map(|row| row.iter().map(|cell| parse_inline_markdown(cell)).collect())
                .collect();
            blocks.push(super::table_slice_block(delta_rows, blocks.len()));
            continue;
        }
        // Callout (> [!NOTE] / [!TIP] / [!WARNING] / [!IMPORTANT] / [!CAUTION])
        if let Some(after) = trimmed.strip_prefix("> [!")
            && let Some((kind_raw, _)) = after.split_once(']')
        {
            let (icon, bg) = match kind_raw.to_ascii_uppercase().as_str() {
                "WARNING" | "CAUTION" => ("\u{26A0}\u{FE0F}", "yellow"),
                "TIP" => ("\u{1F4A1}", "green"),
                "IMPORTANT" => ("\u{2757}", "purple"),
                _ => ("\u{1F4A1}", "blue"),
            };
            i += 1;
            let mut children = Vec::new();
            while i < lines.len() {
                let t = lines[i].trim();
                if let Some(body) = t.strip_prefix("> ").or_else(|| t.strip_prefix('>')) {
                    children.push(rich_paragraph_block("text", body.trim(), children.len()));
                    i += 1;
                } else {
                    break;
                }
            }
            blocks.push(super::callout_slice_block(
                icon,
                bg,
                &[],
                children,
                blocks.len(),
            ));
            continue;
        }
        // Headings (# .. ######)
        if let Some((level, body)) = parse_heading(trimmed) {
            let kind = match level {
                1 => "h1",
                2 => "h2",
                3 => "h3",
                4 => "h4",
                5 => "h5",
                _ => "h6",
            };
            blocks.push(rich_paragraph_block(kind, body, blocks.len()));
            i += 1;
            continue;
        }
        // Blockquote
        if let Some(body) = trimmed
            .strip_prefix("> ")
            .or_else(|| trimmed.strip_prefix('>'))
        {
            blocks.push(rich_paragraph_block("quote", body.trim(), blocks.len()));
            i += 1;
            continue;
        }
        // Task list (- [x] / - [ ])
        if let Some((checked, body)) = parse_todo_item(trimmed) {
            blocks.push(rich_list_block(
                ListType::Todo,
                checked,
                None,
                body,
                blocks.len(),
            ));
            i += 1;
            continue;
        }
        // Bulleted list
        if let Some(body) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("* "))
            .or_else(|| trimmed.strip_prefix("+ "))
        {
            blocks.push(rich_list_block(
                ListType::Bulleted,
                false,
                None,
                body,
                blocks.len(),
            ));
            i += 1;
            continue;
        }
        // Numbered list
        if let Some((order, body)) = parse_numbered_item(trimmed) {
            blocks.push(rich_list_block(
                ListType::Numbered,
                false,
                Some(order),
                body,
                blocks.len(),
            ));
            i += 1;
            continue;
        }
        // Plain or inline-formatted paragraph
        blocks.push(rich_paragraph_block("text", line, blocks.len()));
        i += 1;
    }

    (!blocks.is_empty()).then(|| Slice::new("", "", blocks))
}

fn rich_paragraph_block(kind: &str, text: &str, index: usize) -> SliceBlock {
    let mut b = SliceBlock {
        kind: "block".into(),
        id: index.to_string(),
        flavour: "affine:paragraph".into(),
        version: Some(1),
        props: BTreeMap::new(),
        children: Vec::new(),
    };
    b.props.insert("type".into(), json!(kind));
    b.props
        .insert("text".into(), text_value(&parse_inline_markdown(text)));
    b
}

fn rich_list_block(
    kind: ListType,
    checked: bool,
    order: Option<i32>,
    text: &str,
    index: usize,
) -> SliceBlock {
    let mut b = SliceBlock {
        kind: "block".into(),
        id: index.to_string(),
        flavour: "affine:list".into(),
        version: Some(1),
        props: BTreeMap::new(),
        children: Vec::new(),
    };
    b.props.insert("type".into(), json!(kind.as_str()));
    b.props.insert("checked".into(), json!(checked));
    if let Some(order) = order {
        b.props.insert("order".into(), json!(order));
    }
    b.props
        .insert("text".into(), text_value(&parse_inline_markdown(text)));
    b
}

/// Split a Markdown link/image destination at its matching `)`, supporting balanced
/// nested parentheses such as `https://example.com/a_(b)`.
fn split_balanced_paren(s: &str) -> Option<(&str, &str)> {
    let mut depth = 0usize;
    for (idx, ch) in s.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => {
                if depth == 0 {
                    return Some((&s[..idx], &s[idx + 1..]));
                }
                depth -= 1;
            }
            '\n' => return None,
            _ => {}
        }
    }
    None
}

/// Parse inline Markdown (`**bold**`, `*italic*`, `~~strike~~`, `` `code` ``,
/// `[text](url)`, `$latex$`) into BlockSuite Y.Text delta operations with strict URL sanitization.
pub fn parse_inline_markdown(input: &str) -> Vec<TextDeltaOp> {
    let mut ops = Vec::new();
    let mut rest = input;
    let mut plain = String::new();
    let flush = |plain: &mut String, ops: &mut Vec<TextDeltaOp>| {
        if !plain.is_empty() {
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(std::mem::take(plain)),
                format: None,
            });
        }
    };

    while !rest.is_empty() {
        // Inline code
        if let Some(after) = rest.strip_prefix('`')
            && let Some((code, tail)) = after.split_once('`')
            && !code.is_empty()
        {
            flush(&mut plain, &mut ops);
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(code.to_string()),
                format: Some(TextAttributes::from([("code".into(), Any::True)])),
            });
            rest = tail;
            continue;
        }
        // Inline math $...$ (Pandoc/KaTeX currency guard: opening `$` not followed by space,
        // closing `$` not preceded by space and not followed by an ASCII digit).
        if let Some(after) = rest.strip_prefix('$')
            && !after.starts_with('$')
            && !after.starts_with(char::is_whitespace)
            && let Some((tex, tail)) = after.split_once('$')
            && !tex.is_empty()
            && !tex.ends_with(char::is_whitespace)
            && !tail.starts_with(|c: char| c.is_ascii_digit())
        {
            flush(&mut plain, &mut ops);
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(" ".to_string()),
                format: Some(TextAttributes::from([(
                    "latex".into(),
                    Any::String(tex.trim().to_string()),
                )])),
            });
            rest = tail;
            continue;
        }
        // Bold **...**
        if let Some(after) = rest.strip_prefix("**")
            && let Some((body, tail)) = after.split_once("**")
            && !body.is_empty()
        {
            flush(&mut plain, &mut ops);
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(body.to_string()),
                format: Some(TextAttributes::from([("bold".into(), Any::True)])),
            });
            rest = tail;
            continue;
        }
        // Strikethrough ~~...~~
        if let Some(after) = rest.strip_prefix("~~")
            && let Some((body, tail)) = after.split_once("~~")
            && !body.is_empty()
        {
            flush(&mut plain, &mut ops);
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(body.to_string()),
                format: Some(TextAttributes::from([("strike".into(), Any::True)])),
            });
            rest = tail;
            continue;
        }
        // Italic *...*
        if let Some(after) = rest.strip_prefix('*')
            && !after.starts_with('*')
            && let Some((body, tail)) = after.split_once('*')
            && !body.is_empty()
        {
            flush(&mut plain, &mut ops);
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(body.to_string()),
                format: Some(TextAttributes::from([("italic".into(), Any::True)])),
            });
            rest = tail;
            continue;
        }
        // Image ![alt](url)
        if let Some(after) = rest.strip_prefix("![")
            && let Some((alt, after_alt)) = after.split_once("](")
            && let Some((url, tail)) = split_balanced_paren(after_alt)
        {
            flush(&mut plain, &mut ops);
            let label = if alt.is_empty() { "image" } else { alt };
            let format = sanitize_url(url)
                .map(|clean| TextAttributes::from([("link".into(), Any::String(clean))]));
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(label.to_string()),
                format,
            });
            rest = tail;
            continue;
        }
        // Link [label](url) with balanced parentheses support
        if let Some(after) = rest.strip_prefix('[')
            && let Some((label, after_label)) = after.split_once("](")
            && let Some((url, tail)) = split_balanced_paren(after_label)
        {
            flush(&mut plain, &mut ops);
            let format = sanitize_url(url)
                .map(|clean| TextAttributes::from([("link".into(), Any::String(clean))]));
            ops.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(label.to_string()),
                format,
            });
            rest = tail;
            continue;
        }
        let ch = rest.chars().next().unwrap();
        plain.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    flush(&mut plain, &mut ops);
    ops
}

fn parse_heading(trimmed: &str) -> Option<(usize, &str)> {
    let hashes = trimmed.bytes().take_while(|&b| b == b'#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    trimmed[hashes..]
        .strip_prefix(' ')
        .map(|body| (hashes, body))
}

fn parse_todo_item(trimmed: &str) -> Option<(bool, &str)> {
    let rest = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))?;
    if let Some(body) = rest
        .strip_prefix("[x] ")
        .or_else(|| rest.strip_prefix("[X] "))
    {
        Some((true, body))
    } else {
        rest.strip_prefix("[ ] ").map(|body| (false, body))
    }
}

fn parse_numbered_item(trimmed: &str) -> Option<(i32, &str)> {
    let digits = trimmed.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    let after = trimmed[digits..].strip_prefix(". ")?;
    let order = trimmed[..digits].parse::<i32>().ok()?;
    Some((order, after))
}

fn is_divider_line(trimmed: &str) -> bool {
    let stripped: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    stripped.len() >= 3
        && (stripped.bytes().all(|b| b == b'-')
            || stripped.bytes().all(|b| b == b'*')
            || stripped.bytes().all(|b| b == b'_'))
}

fn is_table_separator(trimmed: &str) -> bool {
    trimmed.starts_with('|')
        && trimmed
            .bytes()
            .all(|b| matches!(b, b'|' | b'-' | b':' | b' ' | b'\t'))
        && trimmed.contains('-')
}

fn split_table_row(trimmed: &str) -> Vec<String> {
    let inner = trimmed.trim_matches('|');
    inner
        .split('|')
        .map(|cell| cell.trim().replace("\\|", "|"))
        .collect()
}
