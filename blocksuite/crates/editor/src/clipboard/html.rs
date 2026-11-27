use std::collections::BTreeMap;

use serde_json::json;
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use super::{
    BlockSpec, ListType, ParagraphType, Slice, SliceBlock,
    sanitize::{decode_html_entities, sanitize_url, split_html_tag, strip_dangerous_html},
    text_value,
};

fn inline_delta_html(block: &SliceBlock) -> String {
    let mut inner = String::new();
    for op in block.delta() {
        let TextDeltaOp::Insert {
            insert: TextInsert::Text(s),
            format,
        } = op
        else {
            continue;
        };
        let mut s = escape(&s);
        if let Some(attrs) = format {
            for (mark, tag) in [
                ("bold", "strong"),
                ("italic", "em"),
                ("underline", "u"),
                ("strike", "s"),
                ("code", "code"),
            ] {
                if attrs.get(mark) == Some(&Any::True) {
                    s = format!("<{tag}>{s}</{tag}>");
                }
            }
            if let Some(Any::String(link)) = attrs.get("link")
                && let Some(clean) = sanitize_url(link)
            {
                s = format!("<a href=\"{}\">{s}</a>", escape(&clean));
            }
        }
        inner += &s;
    }
    inner
}

fn list_container_tag(block: &SliceBlock) -> Option<&'static str> {
    match block.spec() {
        BlockSpec::List { list_type, .. } => Some(if list_type == ListType::Numbered {
            "ol"
        } else {
            "ul"
        }),
        _ => None,
    }
}

/// Serialize a tree of `SliceBlock`s into HTML, grouping consecutive sibling list items
/// of the same type into one `<ul>`/`<ol>` and nesting child lists inside their parent `<li>`.
pub(super) fn blocks_html(blocks: &[SliceBlock]) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < blocks.len() {
        if let Some(tag) = list_container_tag(&blocks[i]) {
            out.push('<');
            out.push_str(tag);
            out.push('>');
            while i < blocks.len() && list_container_tag(&blocks[i]) == Some(tag) {
                let inner = inline_delta_html(&blocks[i]);
                let children = blocks_html(&blocks[i].children);
                out.push_str("<li>");
                out.push_str(&inner);
                out.push_str(&children);
                out.push_str("</li>");
                i += 1;
            }
            out.push_str("</");
            out.push_str(tag);
            out.push('>');
            continue;
        }
        let block = &blocks[i];
        let inner = inline_delta_html(block);
        let rendered = match block.spec() {
            BlockSpec::Code { .. } => format!("<pre><code>{inner}</code></pre>"),
            BlockSpec::Divider => "<hr>".into(),
            BlockSpec::Paragraph { paragraph_type, .. } => {
                let tag = match paragraph_type {
                    ParagraphType::Text => "p",
                    ParagraphType::Quote => "blockquote",
                    h => h.as_str(),
                };
                format!("<{tag}>{inner}</{tag}>")
            }
            _ => inner,
        };
        out.push_str(&rendered);
        if !block.children.is_empty() {
            out.push_str(&blocks_html(&block.children));
        }
        i += 1;
    }
    out
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
}

const URI_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

struct Width {
    bits: usize,
    left: usize,
}

impl Width {
    fn consume(&mut self) {
        self.left -= 1;
        if self.left == 0 {
            self.left = 1 << self.bits;
            self.bits += 1;
        }
    }
}

/// LZ-String's URI component format uses UTF-16 symbols and writes code bits
/// least-significant first into six-bit, most-significant-first characters.
pub(super) fn encode_html_snapshot(s: &str) -> String {
    let mut out = String::new();
    let mut pending = 0u8;
    let mut used = 0;
    let mut write = |count: usize, mut code: usize| {
        for _ in 0..count {
            pending = (pending << 1) | (code as u8 & 1);
            code >>= 1;
            used += 1;
            if used == 6 {
                out.push(URI_ALPHABET[pending as usize] as char);
                used = 0;
                pending = 0;
            }
        }
    };
    let mut width = Width { bits: 2, left: 2 };
    let mut literals = BTreeMap::new();
    let mut codes = BTreeMap::new();
    let mut fresh = BTreeMap::new();
    let mut next = 3usize;
    let mut last = None;
    let mut emit = |code, width: &mut Width, fresh: &mut BTreeMap<usize, u16>| {
        if let Some(unit) = fresh.remove(&code) {
            let wide = unit > 255;
            write(width.bits, usize::from(wide));
            write(if wide { 16 } else { 8 }, unit as usize);
            width.consume();
        } else {
            write(width.bits, code);
        }
        width.consume();
    };
    for u in s.encode_utf16() {
        let literal = *literals.entry(u).or_insert_with(|| {
            let code = next;
            next += 1;
            fresh.insert(code, u);
            code
        });
        let Some(previous) = last else {
            last = Some(literal);
            continue;
        };
        if let Some(&code) = codes.get(&(previous, u)) {
            last = Some(code);
            continue;
        }
        emit(previous, &mut width, &mut fresh);
        codes.insert((previous, u), next);
        next += 1;
        last = Some(literal);
    }
    if let Some(code) = last {
        emit(code, &mut width, &mut fresh);
    }
    write(width.bits, 2);
    write(6, 0);
    out
}

pub(super) fn decode_html_snapshot(s: &str) -> Option<String> {
    let mut bits = s
        .bytes()
        .map(|b| URI_ALPHABET.iter().position(|v| *v == b))
        .flat_map(|v| (0..6).rev().map(move |n| v.map(|v| v >> n & 1)));
    let mut read = |count| -> Option<usize> {
        let mut value = 0;
        for bit in 0..count {
            value |= bits.next()?? << bit;
        }
        Some(value)
    };
    let first = match read(2)? {
        0 => read(8)?,
        1 => read(16)?,
        2 => return Some(String::new()),
        _ => return None,
    };
    let mut out = vec![first as u16];
    let mut dict = vec![(0, 0); 3];
    dict.push((0, 1));
    let mut previous = (0, 1);
    let mut width = Width { bits: 3, left: 4 };
    loop {
        let start = out.len();
        let code = read(width.bits)?;
        if code == 2 {
            return String::from_utf16(&out).ok();
        }
        let entry = if code < 2 {
            out.push(read(if code == 0 { 8 } else { 16 })? as u16);
            dict.push((start, 1));
            width.consume();
            (start, 1)
        } else {
            let special = code == dict.len();
            let (pos, len) = if special { previous } else { *dict.get(code)? };
            if len == 0 || start.checked_add(len + 1)? > 16 * 1024 * 1024 {
                return None;
            }
            out.extend_from_within(pos..pos + len);
            if special {
                out.push(out[pos]);
            }
            (start, out.len() - start)
        };
        dict.push((previous.0, previous.1 + 1));
        width.consume();
        previous = entry;
    }
}

fn attr<'a>(mut attrs: &'a str, key: &str) -> Option<&'a str> {
    while !attrs.trim().is_empty() {
        attrs = attrs.trim_start();
        let end = attrs
            .find(|c: char| c.is_whitespace() || c == '=')
            .unwrap_or(attrs.len());
        let name = &attrs[..end];
        attrs = attrs[end..].trim_start();
        let Some(after) = attrs.strip_prefix('=') else {
            continue;
        };
        attrs = after.trim_start();
        let quote = attrs.chars().next()?;
        let (value, rest) = if matches!(quote, '\'' | '"') {
            attrs[1..].split_once(quote)?
        } else {
            let end = attrs.find(char::is_whitespace).unwrap_or(attrs.len());
            attrs.split_at(end)
        };
        if name.eq_ignore_ascii_case(key) {
            return Some(value);
        }
        attrs = rest;
    }
    None
}

fn delta_is_whitespace_only(delta: &[TextDeltaOp]) -> bool {
    delta.iter().all(|op| match op {
        TextDeltaOp::Insert {
            insert: TextInsert::Text(t),
            ..
        } => t.chars().all(char::is_whitespace),
        _ => false,
    })
}

pub(super) fn parse_html_blocks(raw_html: &str) -> Option<Slice> {
    let cleaned = strip_dangerous_html(raw_html);
    let mut html = cleaned.as_str();
    let mut blocks = Vec::new();
    let mut li_stack: Vec<SliceBlock> = Vec::new();
    let mut current: Option<SliceBlock> = None;
    let mut li_has_p = false;
    let mut in_li_p = false;
    let mut delta = Vec::new();
    let mut marks: Vec<(String, Any)> = Vec::new();
    let mut lists = Vec::new();
    let mut pre = false;
    let mut in_table = false;
    let mut table_rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_cell: Option<String> = None;
    let finalize_current = |current: &mut Option<SliceBlock>, delta: &mut Vec<TextDeltaOp>| {
        let block = current.take().map(|mut b| {
            if !matches!(
                b.flavour.as_str(),
                "affine:divider" | "affine:latex" | "affine:table"
            ) {
                b.props.insert("text".into(), text_value(delta));
            }
            b
        });
        delta.clear();
        block
    };
    let push_finished =
        |b: SliceBlock, li_stack: &mut Vec<SliceBlock>, blocks: &mut Vec<SliceBlock>| {
            if let Some(parent_li) = li_stack.last_mut() {
                parent_li.children.push(b);
            } else {
                blocks.push(b);
            }
        };
    let flush = |current: &mut Option<SliceBlock>,
                 delta: &mut Vec<TextDeltaOp>,
                 li_stack: &mut Vec<SliceBlock>,
                 blocks: &mut Vec<SliceBlock>| {
        if let Some(b) = finalize_current(current, delta) {
            push_finished(b, li_stack, blocks);
        }
    };
    while !html.is_empty() {
        if !html.starts_with('<') {
            let len = html.find('<').unwrap_or(html.len());
            let raw = &html[..len];
            html = &html[len..];
            if let Some(cell) = current_cell.as_mut() {
                cell.push_str(&decode_html_entities(raw));
                continue;
            }
            if raw.trim().is_empty()
                && (current.is_none()
                    || (li_has_p
                        && !in_li_p
                        && current.as_ref().is_some_and(|b| b.flavour == "affine:list")))
            {
                continue;
            }
            current.get_or_insert_with(|| SliceBlock::plain_block("", blocks.len()));
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(unescape(raw)),
                format: (!marks.is_empty())
                    .then(|| marks.iter().cloned().collect::<TextAttributes>()),
            });
            continue;
        }
        let Some((head, rest)) = split_html_tag(&html[1..]) else {
            html = &html[1..];
            if let Some(cell) = current_cell.as_mut() {
                cell.push('<');
            } else {
                current.get_or_insert_with(|| SliceBlock::plain_block("", blocks.len()));
                delta.push(TextDeltaOp::Insert {
                    insert: TextInsert::Text("<".into()),
                    format: (!marks.is_empty())
                        .then(|| marks.iter().cloned().collect::<TextAttributes>()),
                });
            }
            continue;
        };
        html = rest;
        let close = head.starts_with('/');
        let head = head.trim_start_matches('/').trim().trim_end_matches('/');
        let (tag, attrs) = head.split_once(char::is_whitespace).unwrap_or((head, ""));
        let tag = tag.to_ascii_lowercase();
        match tag.as_str() {
            "table" => {
                flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
                if close {
                    in_table = false;
                    if !table_rows.is_empty() {
                        let rows = table_rows
                            .drain(..)
                            .map(|row| {
                                row.into_iter()
                                    .map(|cell| {
                                        vec![TextDeltaOp::Insert {
                                            insert: TextInsert::Text(cell.trim().to_string()),
                                            format: None,
                                        }]
                                    })
                                    .collect()
                            })
                            .collect();
                        push_finished(
                            super::table_slice_block(rows, blocks.len()),
                            &mut li_stack,
                            &mut blocks,
                        );
                    }
                } else {
                    in_table = true;
                    table_rows.clear();
                }
            }
            "tr" if in_table => {
                if close {
                    if !current_row.is_empty() {
                        table_rows.push(std::mem::take(&mut current_row));
                    }
                } else {
                    current_row.clear();
                }
            }
            "td" | "th" if in_table => {
                if close {
                    if let Some(cell) = current_cell.take() {
                        current_row.push(cell);
                    }
                } else {
                    current_cell = Some(String::new());
                }
            }
            "p" | "div" | "br" if in_table && current_cell.is_some() => {
                if (tag == "br" || close)
                    && let Some(cell) = current_cell.as_mut()
                    && !cell.is_empty()
                    && !cell.ends_with(' ')
                {
                    cell.push(' ');
                }
            }
            "input" if !close => {
                if let Some(cur) = current.as_mut()
                    && cur.flavour == "affine:list"
                    && attr(attrs, "type").is_some_and(|t| t.eq_ignore_ascii_case("checkbox"))
                {
                    cur.props.insert("type".into(), json!("todo"));
                    let checked = attrs.to_ascii_lowercase().contains("checked");
                    cur.props.insert("checked".into(), json!(checked));
                }
            }
            "li" => {
                li_has_p = false;
                in_li_p = false;
                if close {
                    if current.is_some() {
                        flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
                    } else if let Some(done_li) = li_stack.pop() {
                        push_finished(done_li, &mut li_stack, &mut blocks);
                    }
                    continue;
                }
                if current.is_some() {
                    if lists.len() > li_stack.len() + 1 {
                        if let Some(parent_li) = finalize_current(&mut current, &mut delta) {
                            li_stack.push(parent_li);
                        }
                    } else {
                        flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
                    }
                }
                let mut b = SliceBlock::plain_block("", blocks.len());
                b.flavour = "affine:list".into();
                b.props.insert(
                    "type".into(),
                    json!(if lists.last() == Some(&true) {
                        "numbered"
                    } else {
                        "bulleted"
                    }),
                );
                current = Some(b);
            }
            "p" | "div" | "aside" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "pre"
            | "blockquote" | "hr" => {
                if tag == "p" {
                    if close && in_li_p {
                        in_li_p = false;
                        continue;
                    }
                    if !close && current.as_ref().is_some_and(|b| b.flavour == "affine:list") {
                        if !li_has_p && delta_is_whitespace_only(&delta) {
                            delta.clear();
                            li_has_p = true;
                            in_li_p = true;
                            continue;
                        }
                        if let Some(parent_li) = finalize_current(&mut current, &mut delta) {
                            li_stack.push(parent_li);
                        }
                    }
                }
                if tag == "div"
                    && !close
                    && let Some(latex) = attr(attrs, "data-latex")
                {
                    flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
                    let mut b = SliceBlock {
                        kind: "block".into(),
                        id: blocks.len().to_string(),
                        flavour: "affine:latex".into(),
                        version: Some(1),
                        props: BTreeMap::new(),
                        children: Vec::new(),
                    };
                    b.props
                        .insert("latex".into(), json!(decode_html_entities(latex)));
                    push_finished(b, &mut li_stack, &mut blocks);
                    continue;
                }
                if tag == "div" && current.is_none() {
                    continue;
                }
                flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
                if close {
                    if tag == "pre" {
                        pre = false;
                    }
                    continue;
                }
                let mut b = SliceBlock::plain_block("", blocks.len());
                match tag.as_str() {
                    "pre" => {
                        b.flavour = "affine:code".into();
                        pre = true;
                    }
                    "hr" => b.flavour = "affine:divider".into(),
                    "aside" => {
                        b = super::callout_slice_block(
                            "\u{1F4A1}",
                            "grey",
                            &[],
                            Vec::new(),
                            blocks.len(),
                        );
                    }
                    "blockquote" => {
                        b.props.insert("type".into(), json!("quote"));
                    }
                    h if h.starts_with('h') => {
                        b.props.insert("type".into(), json!(h));
                    }
                    _ => {}
                }
                current = Some(b);
            }
            "ol" | "ul" => {
                if close {
                    flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
                    lists.pop();
                    while li_stack.len() > lists.len() {
                        if let Some(done_li) = li_stack.pop() {
                            push_finished(done_li, &mut li_stack, &mut blocks);
                        }
                    }
                } else {
                    if current.as_ref().is_some_and(|b| b.flavour == "affine:list") {
                        if let Some(parent_li) = finalize_current(&mut current, &mut delta) {
                            li_stack.push(parent_li);
                        }
                    } else {
                        flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
                    }
                    lists.push(tag == "ol");
                }
            }
            "br" => {
                current.get_or_insert_with(|| SliceBlock::plain_block("", blocks.len()));
                delta.push(TextDeltaOp::Insert {
                    insert: TextInsert::Text("\n".into()),
                    format: None,
                });
            }
            "code" if pre && !close => {
                if let Some(cur) = current.as_mut()
                    && let Some(class) = attr(attrs, "class")
                    && let Some(lang) = class
                        .split_whitespace()
                        .find_map(|c| c.strip_prefix("language-"))
                {
                    cur.props.insert("language".into(), json!(lang));
                }
            }
            _ => {
                let key = match tag.as_str() {
                    "b" | "strong" => "bold",
                    "em" | "i" => "italic",
                    "u" => "underline",
                    "s" | "del" => "strike",
                    "code" if !pre => "code",
                    "a" => "link",
                    _ => continue,
                };
                if close {
                    if let Some(i) = marks.iter().rposition(|(k, _)| k == key) {
                        marks.remove(i);
                    }
                } else if key == "link" {
                    if let Some(href) = attr(attrs, "href")
                        && let Some(clean) = sanitize_url(&decode_html_entities(href))
                    {
                        marks.push((key.into(), Any::String(clean)));
                    }
                } else {
                    marks.push((key.into(), Any::True));
                }
            }
        }
    }
    flush(&mut current, &mut delta, &mut li_stack, &mut blocks);
    while let Some(done_li) = li_stack.pop() {
        push_finished(done_li, &mut li_stack, &mut blocks);
    }
    (!blocks.is_empty()).then(|| Slice::new("", "", blocks))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_snapshot_matches_lz_string_javascript() {
        let input = "LinkedPage 中文 🪶";
        let golden = "DISwdg1gpgJgCgQwOZQASFo5Q4aasHwbg2vaA";
        assert_eq!(encode_html_snapshot(input), golden);
        assert_eq!(decode_html_snapshot(golden).as_deref(), Some(input));
    }

    #[test]
    fn html_nested_lists_group_siblings_and_roundtrip_hierarchy() {
        let html = concat!(
            "<ol><li>First</li><li>Second",
            "<ul><li>Nested A</li><li>Nested B</li></ul>",
            "</li><li>Third</li></ol>"
        );
        let parsed = parse_html_blocks(html).expect("nested list slice");
        assert_eq!(parsed.content.len(), 3);
        let p_wrapped = "<ol><li><p>First</p><ul><li><p>Nested</p></li></ul></li></ol>";
        let parsed_p = parse_html_blocks(p_wrapped).expect("p-wrapped nested list");
        assert_eq!(parsed_p.content.len(), 1);
        assert_eq!(parsed_p.content[0].flavour, "affine:list");
        assert_eq!(parsed_p.content[0].plain(), "First");
        assert_eq!(parsed_p.content[0].children.len(), 1);
        assert_eq!(parsed_p.content[0].children[0].flavour, "affine:list");
        assert_eq!(parsed_p.content[0].children[0].plain(), "Nested");

        let compact = "<ol><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ol>";
        let formatted = "<ol>\n  <li>\n    <p>Parent</p>\n    <ul>\n      <li>\n        <p>Child</p>\n      </li>\n    </ul>\n  </li>\n</ol>";
        let parsed_compact = parse_html_blocks(compact).expect("compact nested list");
        let parsed_fmt = parse_html_blocks(formatted).expect("formatted nested list");
        assert_eq!(parsed_fmt.content.len(), parsed_compact.content.len());
        assert_eq!(parsed_fmt.content[0].flavour, "affine:list");
        assert_eq!(parsed_fmt.content[0].plain(), "Parent");
        assert_eq!(parsed_fmt.content[0].children.len(), 1);
        assert_eq!(parsed_fmt.content[0].children[0].flavour, "affine:list");
        assert_eq!(parsed_fmt.content[0].children[0].plain(), "Child");
        assert_eq!(parsed.content[0].plain(), "First");
        assert_eq!(parsed.content[1].plain(), "Second");
        assert_eq!(parsed.content[1].children.len(), 2);
        assert_eq!(parsed.content[1].children[0].plain(), "Nested A");
        assert_eq!(parsed.content[1].children[1].plain(), "Nested B");
        assert_eq!(parsed.content[2].plain(), "Third");

        let exported = blocks_html(&parsed.content);
        assert_eq!(
            exported,
            "<ol><li>First</li><li>Second<ul><li>Nested A</li><li>Nested B</li></ul></li><li>Third</li></ol>"
        );
    }
}
