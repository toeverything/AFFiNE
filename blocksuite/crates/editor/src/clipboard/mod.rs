//! BlockSuite's slice snapshot and its textual clipboard representations (HTML & Markdown).
mod html;
pub mod markdown;
pub mod sanitize;

use std::collections::BTreeMap;

use blocksuite_playground_doc::{
    read::BlockNode,
    schema::{BlockSpec, ListType, ParagraphType},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ui::ClipboardItem;
use y_octo::{TextDeltaOp, TextInsert};

use html::{block_html, decode_html_snapshot, encode_html_snapshot, parse_html_blocks};

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

pub(super) fn table_slice_block(rows: Vec<Vec<Vec<TextDeltaOp>>>, index: usize) -> SliceBlock {
    let col_count = rows.iter().map(Vec::len).max().unwrap_or(0);
    let mut row_map = serde_json::Map::new();
    let mut col_map = serde_json::Map::new();
    let mut cell_map = serde_json::Map::new();
    let mut prev_col: Option<String> = None;
    for col_idx in 0..col_count {
        let col_id = format!("col-{col_idx}");
        let order = blocksuite_playground_doc::fractional_index::generate_key_between(
            prev_col.as_deref(),
            None,
        )
        .unwrap_or_else(|_| format!("a{col_idx}"));
        prev_col = Some(order.clone());
        col_map.insert(col_id.clone(), json!({"columnId": col_id, "order": order}));
    }
    let mut prev_row: Option<String> = None;
    for (row_idx, row) in rows.iter().enumerate() {
        let row_id = format!("row-{row_idx}");
        let order = blocksuite_playground_doc::fractional_index::generate_key_between(
            prev_row.as_deref(),
            None,
        )
        .unwrap_or_else(|_| format!("a{row_idx}"));
        prev_row = Some(order.clone());
        row_map.insert(row_id.clone(), json!({"rowId": row_id, "order": order}));
        for col_idx in 0..col_count {
            let delta = row.get(col_idx).map(Vec::as_slice).unwrap_or(&[]);
            cell_map.insert(
                format!("{row_id}:col-{col_idx}"),
                json!({"text": text_value(delta)}),
            );
        }
    }
    let mut props = BTreeMap::new();
    props.insert("rows".into(), Value::Object(row_map));
    props.insert("columns".into(), Value::Object(col_map));
    props.insert("cells".into(), Value::Object(cell_map));
    SliceBlock {
        kind: "block".into(),
        id: index.to_string(),
        flavour: "affine:table".into(),
        version: Some(1),
        props,
        children: Vec::new(),
    }
}

pub(super) fn callout_slice_block(
    icon: &str,
    bg: &str,
    text: &[TextDeltaOp],
    children: Vec<SliceBlock>,
    index: usize,
) -> SliceBlock {
    let mut props = BTreeMap::new();
    props.insert("icon".into(), json!({"type": "emoji", "unicode": icon}));
    props.insert("text".into(), text_value(text));
    props.insert("backgroundColorName".into(), json!(bg));
    SliceBlock {
        kind: "block".into(),
        id: index.to_string(),
        flavour: "affine:callout".into(),
        version: Some(1),
        props,
        children,
    }
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
    pub fn keep_selected(
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

    pub fn walk(&self) -> impl Iterator<Item = &Self> {
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
        if node.flavour == "affine:table" {
            let mut rows = serde_json::Map::new();
            let mut columns = serde_json::Map::new();
            let mut cells = serde_json::Map::new();
            let flat_keys: Vec<String> = props
                .keys()
                .filter(|k| {
                    k.starts_with("rows.") || k.starts_with("columns.") || k.starts_with("cells.")
                })
                .cloned()
                .collect();
            for key in flat_keys {
                if let Some(val) = props.remove(&key) {
                    let mut parts = key.splitn(3, '.');
                    if let (Some(group), Some(entry_id), Some(field)) =
                        (parts.next(), parts.next(), parts.next())
                    {
                        let target = match group {
                            "rows" => &mut rows,
                            "columns" => &mut columns,
                            "cells" => &mut cells,
                            _ => continue,
                        };
                        let entry = target
                            .entry(entry_id.to_string())
                            .or_insert_with(|| Value::Object(serde_json::Map::new()));
                        if let Value::Object(map) = entry {
                            map.insert(field.to_string(), val);
                        }
                    }
                }
            }
            if !rows.is_empty() {
                props.insert("rows".into(), Value::Object(rows));
            }
            if !columns.is_empty() {
                props.insert("columns".into(), Value::Object(columns));
            }
            if !cells.is_empty() {
                props.insert("cells".into(), Value::Object(cells));
            }
        }
        let key = if node.flavour == "affine:page" {
            "title"
        } else {
            "text"
        };
        if matches!(
            node.flavour.as_str(),
            "affine:page" | "affine:paragraph" | "affine:list" | "affine:code" | "affine:callout"
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

    pub fn plain_block(text: &str, index: usize) -> Self {
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

    pub fn editable(&self) -> bool {
        matches!(
            self.flavour.as_str(),
            "affine:page" | "affine:paragraph" | "affine:list" | "affine:code"
        )
    }

    pub fn properties(
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
            } else if self.flavour == "affine:table"
                && matches!(key.as_str(), "rows" | "columns" | "cells")
                && let Value::Object(outer) = v
            {
                for (entry_id, entry_val) in outer {
                    if let Value::Object(fields) = entry_val {
                        for (field_name, field_val) in fields {
                            props.insert(
                                format!("prop:{key}.{entry_id}.{field_name}"),
                                value(field_val)?,
                            );
                        }
                    }
                }
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
                .map(block_html)
                .collect::<String>()
        )
    }

    pub fn item(&self) -> ClipboardItem {
        ClipboardItem::new_string_with_json_metadata(
            self.plain(),
            json!({
                (SNAPSHOT_MIME): self,
                "text/html": self.html(),
                "text/markdown": self.to_markdown(),
            }),
        )
    }

    pub fn from_item(item: &ClipboardItem) -> Option<Self> {
        if let Some(meta) = item
            .metadata()
            .and_then(|s| serde_json::from_str::<Value>(s).ok())
        {
            if let Some(slice) = meta.get(SNAPSHOT_MIME).and_then(|v| {
                v.as_str()
                    .and_then(|s| serde_json::from_str::<Value>(s).ok())
                    .or_else(|| Some(v.clone()))
                    .and_then(Self::parse_json)
            }) {
                return Some(slice);
            }
            if let Some(slice) = meta
                .get("text/html")
                .and_then(Value::as_str)
                .and_then(Self::from_html)
            {
                return Some(slice);
            }
            if let Some(slice) = meta
                .get("text/markdown")
                .or_else(|| meta.get("text/x-markdown"))
                .and_then(Value::as_str)
                .and_then(Self::from_markdown)
            {
                return Some(slice);
            }
        }
        item.text().map(|s| Self::from_plain(&s))
    }

    pub fn parse_json(v: Value) -> Option<Self> {
        let mut slice: Self = serde_json::from_value(v).ok()?;
        if slice.kind == "slice"
            && !slice.content.is_empty()
            && slice.content.iter().all(|b| b.kind == "block")
        {
            sanitize::sanitize_slice(&mut slice);
            Some(slice)
        } else {
            None
        }
    }

    /// Unwrap outer `affine:note` and `affine:page` containers before pasting into a note
    /// (`0.27.5` `paste.ts` `flatNote`), while preserving childless `affine:page` title stubs.
    pub fn unwrap_for_note_paste(&mut self) {
        self.content = unwrap_paste_blocks(std::mem::take(&mut self.content));
    }

    pub fn to_markdown(&self) -> String {
        markdown::slice_to_markdown(self)
    }

    pub fn from_markdown(md: &str) -> Option<Self> {
        let mut slice = markdown::parse_markdown_blocks(md)?;
        sanitize::sanitize_slice(&mut slice);
        Some(slice)
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
        let mut slice = parse_html_blocks(html)?;
        sanitize::sanitize_slice(&mut slice);
        Some(slice)
    }
}

fn unwrap_paste_blocks(blocks: Vec<SliceBlock>) -> Vec<SliceBlock> {
    let mut out = Vec::new();
    for mut block in blocks {
        match block.flavour.as_str() {
            "affine:surface" => {}
            "affine:note" => out.extend(unwrap_paste_blocks(block.children)),
            "affine:page" if !block.children.is_empty() => {
                let children = std::mem::take(&mut block.children);
                if !block.plain().is_empty() {
                    out.push(block);
                }
                out.extend(unwrap_paste_blocks(children));
            }
            _ => out.push(block),
        }
    }
    out
}

/// Write multi-format clipboard slices (`text/plain`, `text/html`, `text/markdown`,
/// and `application/x-blocksuite-snapshot`) via the browser Clipboard API.
/// Inbound pastes flow through `ui`'s single `register_paste` platform handler.
#[cfg(target_family = "wasm")]
pub mod browser {
    use wasm_bindgen::prelude::*;
    #[wasm_bindgen(inline_js = r#"
const mime = "application/x-blocksuite-snapshot";
export function writeSliceClipboard(plain, html, md, json) {
  const clipboard = navigator.clipboard;
  if (!clipboard) return;
  if (!clipboard.write || typeof ClipboardItem === "undefined") {
    clipboard.writeText(plain).catch(() => {}); return;
  }
  const formats = {
    "text/plain": new Blob([plain], {type:"text/plain"}),
    "text/html": new Blob([html], {type:"text/html"}),
  };
  const webMd = "web text/markdown";
  if (ClipboardItem.supports?.(webMd)) formats[webMd] = new Blob([md], {type:"text/markdown"});
  const custom = "web " + mime;
  if (ClipboardItem.supports?.(custom)) formats[custom] = new Blob([json], {type:mime});
  clipboard.write([new ClipboardItem(formats)]).catch(() => clipboard.writeText(plain)).catch(() => {});
}
"#)]
    extern "C" {
        #[wasm_bindgen(js_name=writeSliceClipboard)]
        fn write_slice(plain: &str, html: &str, md: &str, json: &str);
    }
    pub(super) fn write(slice: &super::Slice) {
        if let Ok(json) = serde_json::to_string(slice) {
            write_slice(&slice.plain(), &slice.html(), &slice.to_markdown(), &json);
        }
    }
}

pub fn write_slice(slice: &Slice, _cx: &mut ui::App) {
    #[cfg(target_family = "wasm")]
    browser::write(slice);
    #[cfg(not(target_family = "wasm"))]
    _cx.write_to_clipboard(slice.item());
}

pub fn read_slice(item: &ClipboardItem) -> Option<(Slice, bool)> {
    Slice::from_item(item).map(|slice| (slice, item.metadata().is_some()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_only_clipboard_restores_inline_page_reference_and_label() {
        let mut slice = Slice::from_plain("");
        slice.content[0].props.insert(
            "text".into(),
            json!({"$blocksuite:internal:text$":true,"delta":[
                {"insert":"Go to "},{"insert":" ","attributes":{"reference":{"type":"LinkedPage","pageId":"doc:target"}}}
            ]}),
        );
        let public_html = ClipboardItem::new_string_with_json_metadata(
            String::new(),
            json!({"text/html":slice.html()}),
        );
        assert_eq!(Slice::from_item(&public_html), Some(slice));
    }

    #[test]
    fn html_slice_preserves_headings_links_inline_marks_and_non_bmp_text() {
        let slice = Slice::from_html(
            "<h2>中<strong>🪶</strong></h2><ol><li><a href='https://example.org'>a&amp;b</a></li></ol><pre><code>x\ny</code></pre>",
        )
        .unwrap();
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

    #[test]
    fn html_and_markdown_sanitize_xss_vectors_and_preserve_rich_blocks() {
        let xss_html = concat!(
            "<script>alert('xss')</script>",
            "<style>body{display:none}</style>",
            "<iframe src='https://evil.test'></iframe>",
            "<object data='evil.swf'></object>",
            "<p onclick='alert(1)'>Safe <strong>bold</strong> ",
            "<a href='javascript:alert(1)' onmouseover='evil()'>bad1</a> ",
            "<a href='j&#x61;vascript:alert(2)'>bad2</a> ",
            "<a href='vbscript:msgbox(1)'>bad3</a> ",
            "<a href='data:text/html,<script>alert(1)</script>'>bad4</a> ",
            "<a href='https://affine.pro'>good</a></p>",
            "<table><tr><th>K</th><th>V</th></tr><tr><td>A</td><td>1</td></tr></table>",
        );
        let slice = Slice::from_html(xss_html).expect("sanitized slice");
        let plain = slice.plain();
        assert!(!plain.contains("alert("), "script payload leaked: {plain}");
        assert!(
            !plain.contains("display:none"),
            "style payload leaked: {plain}"
        );
        assert!(plain.contains("Safe bold bad1 bad2 bad3 bad4 good"));
        let ops = slice.content[0].delta();
        let links: Vec<&str> = ops
            .iter()
            .filter_map(|op| match op {
                TextDeltaOp::Insert {
                    format: Some(attrs),
                    ..
                } => match attrs.get("link") {
                    Some(y_octo::Any::String(url)) => Some(url.as_str()),
                    _ => None,
                },
                _ => None,
            })
            .collect();
        assert_eq!(links, vec!["https://affine.pro"]);
        assert_eq!(slice.content[1].flavour, "affine:table");

        // Markdown roundtrip with rich blocks & XSS link stripping.
        let md = concat!(
            "# Heading\n\n",
            "Text with **bold**, *italic*, `code`, $E=mc^2$, ",
            "[safe](https://affine.pro) and [evil](javascript:alert(1)).\n\n",
            "- [x] Ship S3\n",
            "- [ ] Review\n\n",
            "> [!NOTE]\n",
            "> Callout line\n\n",
            "| Col1 | Col2 |\n",
            "| --- | --- |\n",
            "| R1C1 | R1C2 |\n\n",
            "```rust\nfn main() {}\n```\n",
        );
        let parsed = Slice::from_markdown(md).expect("markdown slice");
        assert!(parsed.content.iter().any(|b| b.flavour == "affine:table"));
        assert!(parsed.content.iter().any(|b| b.flavour == "affine:callout"));
        assert!(parsed.content.iter().any(|b| b.flavour == "affine:code"));
        assert!(parsed.content.iter().any(|b| b.flavour == "affine:list"));
        let exported = parsed.to_markdown();
        assert!(exported.contains("# Heading"));
        assert!(exported.contains("https://affine.pro"));
        assert!(!exported.contains("javascript:"));
        assert!(exported.contains("- [x] Ship S3"));
        assert!(exported.contains("| Col1 | Col2 |"));
        assert!(exported.contains("```rust"));
    }

    #[test]
    fn live_table_copy_unflattens_and_browser_clipboard_sanitizes_and_supports_markdown() {
        use blocksuite_playground_doc::{schema::BlockSpec, session::PageDocSession};

        // (a) Real PageDocSession table -> export_slice_props + SliceBlock::from_node -> to_markdown & properties round-trip.
        let mut page = PageDocSession::new("doc:clip-table", 11).unwrap();
        page.add_block("p", BlockSpec::Page { title: "T".into() }, None, None, 1)
            .unwrap();
        page.add_block("n", BlockSpec::Note { xywh: None }, Some("p"), None, 2)
            .unwrap();
        page.add_block(
            "tbl",
            BlockSpec::Table {
                rows: vec![
                    vec!["H1".into(), "H2".into()],
                    vec!["A1".into(), "A2".into()],
                ],
            },
            Some("n"),
            None,
            3,
        )
        .unwrap();
        let snap = page.read_page_snapshot().unwrap();
        let node = snap.block("tbl").unwrap();
        let exported_props = page.export_slice_props("tbl").unwrap();
        let slice_block = SliceBlock::from_node(node, exported_props, &[]);
        assert!(slice_block.props.contains_key("rows"));
        assert!(slice_block.props.contains_key("columns"));
        assert!(slice_block.props.contains_key("cells"));
        let slice = Slice::new("ws", "page", vec![slice_block.clone()]);
        let md = slice.to_markdown();
        assert!(md.contains("| H1 | H2 |"), "got {md}");
        assert!(md.contains("| A1 | A2 |"), "got {md}");
        let flat_back = slice_block.properties().unwrap();
        assert!(
            flat_back
                .iter()
                .any(|(k, _)| k.starts_with("prop:cells.") && k.ends_with(".text"))
        );

        // (b) Direct Slice::parse_json sanitizes javascript: URLs.
        let mut raw_evil = Slice::from_plain("bad");
        raw_evil.content[0].props.insert(
            "text".into(),
            json!({
                "$blocksuite:internal:text$": true,
                "delta": [{"insert": "bad", "attributes": {"link": "javascript:alert(1)"}}]
            }),
        );
        let evil = serde_json::to_value(&raw_evil).expect("serialize slice");
        let parsed_evil = Slice::parse_json(evil).expect("valid slice");
        let ops = parsed_evil.content[0].delta();
        assert!(ops.iter().all(|op| match op {
            TextDeltaOp::Insert {
                format: Some(attrs),
                ..
            } => !attrs.contains_key("link"),
            _ => true,
        }));

        // (c) ClipboardItem with both text/plain and rich formats (HTML / Markdown / snapshot)
        // restores the rich slice via the unified platform ClipboardItem path.
        let md_with_plain = ClipboardItem::new_string_with_json_metadata(
            "Title Paragraph text".into(),
            json!({"text/markdown": "# Title\n\nParagraph text"}),
        );
        let (md_slice, is_rich) = read_slice(&md_with_plain).expect("markdown with plain");
        assert!(is_rich);
        assert_eq!(md_slice.content.len(), 2);
        assert_eq!(md_slice.content[0].plain(), "Title");
        assert_eq!(md_slice.content[1].plain(), "Paragraph text");

        let html_with_plain = ClipboardItem::new_string_with_json_metadata(
            "Bold".into(),
            json!({"text/html": "<p><strong>Bold</strong></p>"}),
        );
        let (html_slice, is_rich) = read_slice(&html_with_plain).expect("html with plain");
        assert!(is_rich);
        assert_eq!(html_slice.content[0].plain(), "Bold");
        assert_eq!(
            html_slice.content[0].props["text"]["delta"][0]["attributes"]["bold"],
            true
        );

        // (d) Callout string emoji icon is preserved by sanitize_slice.
        let mut callout_slice = Slice::new(
            "ws",
            "page",
            vec![SliceBlock {
                kind: "block".into(),
                id: "c1".into(),
                flavour: "affine:callout".into(),
                version: Some(1),
                props: BTreeMap::from([("icon".into(), json!("\u{1F4A1}"))]),
                children: Vec::new(),
            }],
        );
        sanitize::sanitize_slice(&mut callout_slice);
        assert_eq!(
            callout_slice.content[0].props.get("icon"),
            Some(&json!("\u{1F4A1}"))
        );
    }

    #[test]
    fn parse_json_preserves_containers_and_unwrap_for_note_paste_flattens_wrappers() {
        let p1 = json!({
            "type": "block",
            "id": "p1",
            "flavour": "affine:paragraph",
            "props": {"type": "text", "text": {"$blocksuite:internal:text$": true, "delta": [{"insert": "First"}]}},
            "children": []
        });
        let p2 = json!({
            "type": "block",
            "id": "p2",
            "flavour": "affine:paragraph",
            "props": {"type": "text", "text": {"$blocksuite:internal:text$": true, "delta": [{"insert": "Second"}]}},
            "children": []
        });
        let note_wrapped = json!({
            "type": "slice",
            "content": [{
                "type": "block",
                "id": "note-1",
                "flavour": "affine:note",
                "props": {},
                "children": [p1, p2]
            }],
            "pageId": "doc-1",
            "workspaceId": "ws-1"
        });
        let mut parsed = Slice::parse_json(note_wrapped).expect("note-wrapped slice");
        assert_eq!(parsed.content.len(), 1);
        assert_eq!(parsed.content[0].flavour, "affine:note");
        parsed.unwrap_for_note_paste();
        assert_eq!(parsed.content.len(), 2);
        assert_eq!(parsed.content[0].flavour, "affine:paragraph");
        assert_eq!(parsed.content[0].plain(), "First");
        assert_eq!(parsed.content[1].plain(), "Second");

        let page_wrapped = json!({
            "type": "slice",
            "content": [{
                "type": "block",
                "id": "page-1",
                "flavour": "affine:page",
                "props": {},
                "children": [
                    {"type": "block", "id": "surf-1", "flavour": "affine:surface", "props": {}, "children": []},
                    {
                        "type": "block",
                        "id": "note-2",
                        "flavour": "affine:note",
                        "props": {},
                        "children": [p1]
                    }
                ]
            }],
            "pageId": "doc-1",
            "workspaceId": "ws-1"
        });
        let mut parsed_page = Slice::parse_json(page_wrapped).expect("page-wrapped slice");
        assert_eq!(parsed_page.content[0].flavour, "affine:page");
        parsed_page.unwrap_for_note_paste();
        assert_eq!(parsed_page.content.len(), 1);
        assert_eq!(parsed_page.content[0].flavour, "affine:paragraph");
        assert_eq!(parsed_page.content[0].plain(), "First");
    }
}
