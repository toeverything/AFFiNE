use std::collections::BTreeMap;

use serde_json::json;
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use super::{BlockSpec, ListType, ParagraphType, Slice, SliceBlock, text_value};

pub(super) fn block_html(block: &SliceBlock) -> String {
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
            if let Some(Any::String(link)) = attrs.get("link") {
                s = format!("<a href=\"{}\">{s}</a>", escape(link));
            }
        }
        inner += &s;
    }
    match block.spec() {
        BlockSpec::Code { .. } => format!("<pre><code>{inner}</code></pre>"),
        BlockSpec::Divider => "<hr>".into(),
        BlockSpec::List { list_type, .. } => {
            let tag = if list_type == ListType::Numbered {
                "ol"
            } else {
                "ul"
            };
            format!("<{tag}><li>{inner}</li></{tag}>")
        }
        BlockSpec::Paragraph { paragraph_type, .. } => {
            let tag = match paragraph_type {
                ParagraphType::Text => "p",
                ParagraphType::Quote => "blockquote",
                h => h.as_str(),
            };
            format!("<{tag}>{inner}</{tag}>")
        }
        _ => inner,
    }
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

pub(super) fn parse_html_blocks(mut html: &str) -> Option<Slice> {
    let mut blocks = Vec::new();
    let mut current = None;
    let mut delta = Vec::new();
    let mut marks: Vec<(String, Any)> = Vec::new();
    let mut lists = Vec::new();
    let mut pre = false;
    let flush = |current: &mut Option<SliceBlock>,
                 delta: &mut Vec<TextDeltaOp>,
                 blocks: &mut Vec<SliceBlock>| {
        if let Some(mut b) = current.take() {
            b.props.insert("text".into(), text_value(delta));
            blocks.push(b);
        }
        delta.clear();
    };
    while !html.is_empty() {
        if !html.starts_with('<') {
            let len = html.find('<').unwrap_or(html.len());
            let raw = &html[..len];
            html = &html[len..];
            if current.is_none() && raw.trim().is_empty() {
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
        let (head, rest) = html[1..].split_once('>')?;
        html = rest;
        let close = head.starts_with('/');
        let head = head.trim_start_matches('/').trim().trim_end_matches('/');
        let (tag, attrs) = head.split_once(char::is_whitespace).unwrap_or((head, ""));
        let tag = tag.to_ascii_lowercase();
        match tag.as_str() {
            "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "pre" | "blockquote" | "li"
            | "hr" => {
                if tag == "div" && current.is_none() {
                    continue;
                }
                flush(&mut current, &mut delta, &mut blocks);
                if close {
                    if tag == "pre" {
                        pre = false;
                    }
                    continue;
                }
                let mut b = SliceBlock::plain_block("", blocks.len());
                match tag.as_str() {
                    "li" => {
                        b.flavour = "affine:list".into();
                        b.props.insert(
                            "type".into(),
                            json!(if lists.last() == Some(&true) {
                                "numbered"
                            } else {
                                "bulleted"
                            }),
                        );
                    }
                    "pre" => {
                        b.flavour = "affine:code".into();
                        pre = true;
                    }
                    "hr" => b.flavour = "affine:divider".into(),
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
                    lists.pop();
                } else {
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
                    if let Some(href) = attr(attrs, "href") {
                        marks.push((key.into(), Any::String(unescape(href))));
                    }
                } else {
                    marks.push((key.into(), Any::True));
                }
            }
        }
    }
    flush(&mut current, &mut delta, &mut blocks);
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
}
