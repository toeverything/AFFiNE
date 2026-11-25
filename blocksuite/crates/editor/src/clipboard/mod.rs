//! BlockSuite's slice snapshot and its two textual clipboard representations.
mod html;

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

/// The browser's data transfer object can only be read synchronously in its paste event.
/// Capture its rich entries for the focused textarea's input-handler callback in that turn.
#[cfg(target_family = "wasm")]
pub mod browser {
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

pub fn write_slice(slice: &Slice, _cx: &mut ui::App) {
    #[cfg(target_family = "wasm")]
    browser::write(slice);
    #[cfg(not(target_family = "wasm"))]
    _cx.write_to_clipboard(slice.item());
}

pub fn read_slice(item: &ClipboardItem) -> Option<(Slice, bool)> {
    #[cfg(target_family = "wasm")]
    if let Some(slice) = browser::pasted() {
        return Some((slice, true));
    }
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
}
