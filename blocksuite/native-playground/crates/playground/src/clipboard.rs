//! BlockSuite's slice snapshot and its two textual clipboard representations.
use std::collections::BTreeMap;

use blocksuite_playground_doc::{
    read::BlockNode,
    schema::{BlockSpec, ListType, ParagraphType},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ui::ClipboardItem;
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

pub const SNAPSHOT_MIME: &str = "application/x-blocksuite-snapshot";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Slice {
    #[serde(rename = "type")]
    pub kind: String,
    pub workspace_id: String,
    pub page_id: String,
    pub content: Vec<SliceBlock>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SliceBlock {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    pub flavour: String,
    #[serde(default)]
    pub version: Option<i64>,
    pub props: BTreeMap<String, Value>,
    pub children: Vec<SliceBlock>,
}

fn text_value(delta: &[TextDeltaOp]) -> Value {
    let ops: Vec<_> = delta
        .iter()
        .filter_map(|op| {
            let TextDeltaOp::Insert { insert, format } = op else {
                return None;
            };
            let insert = match insert {
                TextInsert::Text(s) => json!(s),
                TextInsert::Embed(v) if v.len() == 1 => json!(&v[0]),
                TextInsert::Embed(v) => json!(v),
            };
            let mut out = json!({"insert":insert});
            if let Some(attrs) = format
                && !attrs.is_empty()
            {
                out["attributes"] = json!(attrs);
            }
            Some(out)
        })
        .collect();
    json!({"$blocksuite:internal:text$":true,"delta":ops})
}

fn decode_text_value(value: &Value) -> blocksuite_playground_doc::DocResult<Vec<TextDeltaOp>> {
    use blocksuite_playground_doc::DocError;
    let ops = value["delta"]
        .as_array()
        .ok_or_else(|| DocError::InvalidState("missing clipboard text delta".into()))?;
    ops.iter()
        .map(|op| {
            let raw = op
                .get("insert")
                .ok_or_else(|| DocError::InvalidState("missing clipboard insert".into()))?;
            let insert = match raw {
                Value::String(text) => TextInsert::Text(text.clone()),
                embed => TextInsert::Embed(vec![
                    serde_json::from_value(embed.clone())
                        .map_err(|e| DocError::InvalidState(e.to_string()))?,
                ]),
            };
            let format = op
                .get("attributes")
                .map(|attrs| serde_json::from_value(attrs.clone()))
                .transpose()
                .map_err(|e| DocError::InvalidState(e.to_string()))?;
            Ok(TextDeltaOp::Insert { insert, format })
        })
        .collect()
}

impl SliceBlock {
    pub(crate) fn keep_selected(
        node: &BlockNode,
        selected: &mut BTreeMap<String, SliceBlock>,
        out: &mut Vec<SliceBlock>,
    ) {
        if let Some(mut item) = selected.remove(&node.id) {
            for child in &node.children {
                Self::keep_selected(child, selected, &mut item.children);
            }
            out.push(item);
        } else {
            for child in &node.children {
                Self::keep_selected(child, selected, out);
            }
        }
    }

    pub(crate) fn walk(&self) -> impl Iterator<Item = &Self> {
        let mut stack = vec![self];
        std::iter::from_fn(move || {
            let b = stack.pop()?;
            stack.extend(b.children.iter().rev());
            Some(b)
        })
    }

    pub fn from_node(
        node: &BlockNode,
        exported: serde_json::Map<String, Value>,
        delta: &[TextDeltaOp],
    ) -> Self {
        let mut props: BTreeMap<_, _> = exported
            .into_iter()
            .filter_map(|(k, v)| Some((k.strip_prefix("prop:")?.to_owned(), v)))
            .collect();
        let key = if node.flavour == "affine:page" {
            "title"
        } else {
            "text"
        };
        if matches!(
            node.flavour.as_str(),
            "affine:page" | "affine:paragraph" | "affine:list" | "affine:code"
        ) && props.contains_key(key)
        {
            props.insert(key.into(), text_value(delta));
        }
        Self {
            kind: "block".into(),
            id: node.id.clone(),
            flavour: node.flavour.clone(),
            version: node.version,
            props,
            children: Vec::new(),
        }
    }
    pub(crate) fn plain_block(text: &str, index: usize) -> Self {
        let mut b = Self {
            kind: "block".into(),
            id: index.to_string(),
            flavour: "affine:paragraph".into(),
            version: Some(1),
            props: BTreeMap::new(),
            children: Vec::new(),
        };
        b.props.insert(
            "text".into(),
            text_value(&[TextDeltaOp::Insert {
                insert: TextInsert::Text(text.into()),
                format: None,
            }]),
        );
        b
    }
    pub fn delta(&self) -> Vec<TextDeltaOp> {
        let key = if self.flavour == "affine:page" {
            "title"
        } else {
            "text"
        };
        self.props
            .get(key)
            .and_then(|v| decode_text_value(v).ok())
            .unwrap_or_default()
    }
    pub fn plain(&self) -> String {
        self.delta()
            .into_iter()
            .filter_map(|op| match op {
                TextDeltaOp::Insert {
                    insert: TextInsert::Text(s),
                    ..
                } => Some(s),
                TextDeltaOp::Insert { .. } => Some("\u{fffc}".into()),
                _ => None,
            })
            .collect()
    }
    pub(crate) fn editable(&self) -> bool {
        matches!(
            self.flavour.as_str(),
            "affine:page" | "affine:paragraph" | "affine:list" | "affine:code"
        )
    }

    pub(crate) fn properties(
        &self,
    ) -> blocksuite_playground_doc::DocResult<Vec<(String, y_octo::SessionValue)>> {
        use y_octo::SessionValue;
        fn value(v: &Value) -> blocksuite_playground_doc::DocResult<SessionValue> {
            Ok(match v {
                Value::Object(map)
                    if map.get("$blocksuite:internal:text$") == Some(&Value::Bool(true)) =>
                {
                    SessionValue::Text(decode_text_value(v)?)
                }
                Value::Object(map) => SessionValue::Map(
                    map.iter()
                        .map(|(k, v)| Ok((k.clone(), value(v)?)))
                        .collect::<blocksuite_playground_doc::DocResult<_>>()?,
                ),
                Value::Array(items) => SessionValue::Array(
                    items
                        .iter()
                        .map(value)
                        .collect::<blocksuite_playground_doc::DocResult<_>>()?,
                ),
                _ => SessionValue::Any(serde_json::from_value(v.clone()).map_err(|e| {
                    blocksuite_playground_doc::DocError::InvalidState(e.to_string())
                })?),
            })
        }
        let mut props: BTreeMap<_, _> = if self.editable() {
            self.spec()
                .into_yblock_entries("")
                .into_iter()
                .filter(|(k, _)| k.starts_with("prop:"))
                .collect()
        } else {
            BTreeMap::new()
        };
        for (key, v) in &self.props {
            if self.editable()
                && (key == "text" || (self.flavour == "affine:page" && key == "title"))
            {
                props.insert("prop:text".into(), SessionValue::Text(self.delta()));
            } else {
                props.insert(format!("prop:{key}"), value(v)?);
            }
        }
        Ok(props.into_iter().collect())
    }

    pub fn spec(&self) -> BlockSpec {
        let kind = self
            .props
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("text");
        match self.flavour.as_str() {
            "affine:list" => BlockSpec::List {
                list_type: serde_json::from_value(json!(kind)).unwrap_or(ListType::Bulleted),
                text: String::new(),
                checked: self.props.get("checked") == Some(&Value::Bool(true)),
                order: self
                    .props
                    .get("order")
                    .and_then(Value::as_i64)
                    .and_then(|i| i.try_into().ok()),
            },
            "affine:code" => BlockSpec::Code {
                text: String::new(),
                language: self
                    .props
                    .get("language")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                caption: String::new(),
            },
            "affine:divider" => BlockSpec::Divider,
            _ => BlockSpec::Paragraph {
                paragraph_type: serde_json::from_value(json!(kind)).unwrap_or(ParagraphType::Text),
                text: String::new(),
            },
        }
    }
    fn html(&self) -> String {
        let mut inner = String::new();
        for op in self.delta() {
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
        match self.spec() {
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

impl Slice {
    pub fn new(workspace: &str, page: &str, content: Vec<SliceBlock>) -> Self {
        Self {
            kind: "slice".into(),
            workspace_id: workspace.into(),
            page_id: page.into(),
            content,
        }
    }
    pub fn from_plain(s: &str) -> Self {
        let s = s.replace("\r\n", "\n").replace('\r', "\n");
        Self::new(
            "",
            "",
            s.split('\n')
                .enumerate()
                .map(|(i, line)| SliceBlock::plain_block(line, i))
                .collect(),
        )
    }
    pub fn plain(&self) -> String {
        self.content
            .iter()
            .flat_map(SliceBlock::walk)
            .map(SliceBlock::plain)
            .collect::<Vec<_>>()
            .join("\n")
    }
    pub fn html(&self) -> String {
        let snapshot = json!({"snapshot":self,"blobs":{}}).to_string();
        let attr = encode_html_snapshot(&json!({"BLOCKSUITE/SNAPSHOT":snapshot}).to_string());
        format!(
            "<div data-blocksuite-snapshot=\"{attr}\">{}</div>",
            self.content
                .iter()
                .flat_map(SliceBlock::walk)
                .map(SliceBlock::html)
                .collect::<String>()
        )
    }
    pub fn item(&self) -> ClipboardItem {
        ClipboardItem::new_string_with_json_metadata(
            self.plain(),
            json!({(SNAPSHOT_MIME):self,"text/html":self.html()}),
        )
    }
    pub fn from_item(item: &ClipboardItem) -> Option<Self> {
        if let Some(meta) = item
            .metadata()
            .and_then(|s| serde_json::from_str::<Value>(s).ok())
        {
            if let Some(slice) = meta
                .get(SNAPSHOT_MIME)
                .and_then(|v| Self::parse_json(v.clone()))
            {
                return Some(slice);
            }
            if let Some(slice) = meta
                .get("text/html")
                .and_then(Value::as_str)
                .and_then(Self::from_html)
            {
                return Some(slice);
            }
        }
        item.text().map(|s| Self::from_plain(&s))
    }
    fn parse_json(v: Value) -> Option<Self> {
        let slice: Self = serde_json::from_value(v).ok()?;
        (slice.kind == "slice"
            && !slice.content.is_empty()
            && slice.content.iter().all(|b| b.kind == "block"))
        .then_some(slice)
    }
    pub fn from_html(html: &str) -> Option<Self> {
        if let Some((_, after)) = html.split_once("data-blocksuite-snapshot=\"")
            && let Some((encoded, _)) = after.split_once('"')
            && let Some(decoded) = decode_html_snapshot(encoded)
            && let Ok(map) = serde_json::from_str::<Value>(&decoded)
            && let Some(raw) = map["BLOCKSUITE/SNAPSHOT"].as_str()
            && let Ok(wrapped) = serde_json::from_str::<Value>(raw)
            && let Some(slice) = Self::parse_json(wrapped["snapshot"].clone())
        {
            return Some(slice);
        }
        parse_html_blocks(html)
    }
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
fn encode_html_snapshot(s: &str) -> String {
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

fn decode_html_snapshot(s: &str) -> Option<String> {
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

fn parse_html_blocks(mut html: &str) -> Option<Slice> {
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
    #[test]
    fn html_only_clipboard_restores_inline_page_reference_and_label() {
        let mut slice = Slice::from_plain("");
        slice.content[0].props.insert("text".into(),json!({"$blocksuite:internal:text$":true,"delta":[
            {"insert":"Go to "},{"insert":" ","attributes":{"reference":{"type":"LinkedPage","pageId":"doc:target"}}}
        ]}));
        let public_html = ClipboardItem::new_string_with_json_metadata(
            String::new(),
            json!({"text/html":slice.html()}),
        );
        assert_eq!(Slice::from_item(&public_html), Some(slice));
    }
    #[test]
    fn html_slice_preserves_headings_links_inline_marks_and_non_bmp_text() {
        let slice=Slice::from_html("<h2>中<strong>🪶</strong></h2><ol><li><a href='https://example.org'>a&amp;b</a></li></ol><pre><code>x\ny</code></pre>").unwrap();
        assert_eq!(slice.content.len(), 3);
        assert_eq!(slice.plain(), "中🪶\na&b\nx\ny");
        assert_eq!(slice.content[0].props["type"], "h2");
        assert_eq!(
            slice.content[1].props["text"]["delta"][0]["attributes"]["link"],
            "https://example.org"
        );
        assert_eq!(Slice::from_html(&slice.html()), Some(slice.clone()));
        assert_eq!(Slice::from_item(&slice.item()), Some(slice));
    }
}

/// The browser's data transfer object can only be read synchronously in its paste event.
/// Capture its rich entries for the focused textarea's input-handler callback in that turn.
#[cfg(target_family = "wasm")]
pub(crate) mod browser {
    use wasm_bindgen::prelude::*;
    #[wasm_bindgen(inline_js = r#"
let pasteFormats;
const mime = "application/x-blocksuite-snapshot";
export function installSliceClipboard() {
  window.addEventListener("paste", event => {
    if (!(event.target instanceof HTMLTextAreaElement) || !event.clipboardData) return;
    const data = event.clipboardData;
    pasteFormats = [data.getData(mime), data.getData("text/html")];
    queueMicrotask(() => { pasteFormats = undefined; });
  }, true);
}
export function pastedSnapshot() { return pasteFormats?.[0] || ""; }
export function pastedHtml() { return pasteFormats?.[1] || ""; }
export function writeSliceClipboard(plain, html, json) {
  const clipboard = navigator.clipboard;
  if (!clipboard) return;
  if (!clipboard.write || typeof ClipboardItem === "undefined") {
    clipboard.writeText(plain).catch(() => {}); return;
  }
  const formats = {
    "text/plain": new Blob([plain], {type:"text/plain"}),
    "text/html": new Blob([html], {type:"text/html"}),
  };
  const custom = "web " + mime;
  if (ClipboardItem.supports?.(custom)) formats[custom] = new Blob([json], {type:mime});
  clipboard.write([new ClipboardItem(formats)]).catch(() => clipboard.writeText(plain)).catch(() => {});
}
"#)]
    extern "C" {
        #[wasm_bindgen(js_name=installSliceClipboard)]
        pub fn install();
        #[wasm_bindgen(js_name=pastedSnapshot)]
        fn pasted_snapshot() -> String;
        #[wasm_bindgen(js_name=pastedHtml)]
        fn pasted_html() -> String;
        #[wasm_bindgen(js_name=writeSliceClipboard)]
        fn write_slice(plain: &str, html: &str, json: &str);
    }
    pub(super) fn pasted() -> Option<super::Slice> {
        serde_json::from_str(&pasted_snapshot())
            .ok()
            .and_then(super::Slice::parse_json)
            .or_else(|| super::Slice::from_html(&pasted_html()))
    }
    pub(super) fn write(slice: &super::Slice) {
        if let Ok(json) = serde_json::to_string(slice) {
            write_slice(&slice.plain(), &slice.html(), &json);
        }
    }
}

pub(crate) fn write_slice(slice: &Slice, _cx: &mut ui::App) {
    #[cfg(target_family = "wasm")]
    browser::write(slice);
    #[cfg(not(target_family = "wasm"))]
    _cx.write_to_clipboard(slice.item());
}
pub(crate) fn read_slice(item: &ClipboardItem) -> Option<(Slice, bool)> {
    #[cfg(target_family = "wasm")]
    if let Some(slice) = browser::pasted() {
        return Some((slice, true));
    }
    Slice::from_item(item).map(|slice| (slice, item.metadata().is_some()))
}
