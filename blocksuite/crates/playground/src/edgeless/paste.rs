//! Edgeless canvas clipboard paste for BlockSuite surface snapshots (including Web
//! double-encoded LZ-String `data-blocksuite-snapshot` HTML with `blocksuite/surface`,
//! `mindmap` trees, child `shape`s, `group`s, `connector`s, and `note` blocks) in one
//! atomic undo step and one room sync update.

use std::collections::HashMap;

use blocksuite_playground_doc::{fractional_index::generate_key_between, session::PastedBlockNode};
use serde_json::{Map, Value};
use ui::{Context, Window};
use y_octo::{Any, SessionValue, TextDeltaOp, TextInsert};

use super::paste_convert::{
    PASTE_OFFSET, block_json_to_session_value, offset_xywh_by, remap_database_cells,
    remap_group_children, remap_surface_element,
};
use crate::PlaygroundView;

impl PlaygroundView {
    /// Paste BlockSuite surface elements (`mindmap`, `shape`, `group`, `connector`, `text`)
    /// or `note` block subtrees from the clipboard into the current Edgeless canvas in one
    /// atomic undo step, pre-allocating globally unique IDs across all surface elements and
    /// note blocks before remapping connectors/groups/mindmaps, continuing fractional indices
    /// after the current canvas maximum, and offsetting coordinates by `(+24, +24)`.
    pub(crate) fn paste_edgeless_clipboard_item(
        &mut self,
        item: &ui::ClipboardItem,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(payload) = extract_edgeless_payload_from_item(item) else {
            return false;
        };
        let mut surface_elems = Vec::new();
        let mut note_blocks: Vec<Map<String, Value>> = Vec::new();
        if !collect_edgeless_items(&payload, &mut surface_elems, &mut note_blocks) {
            return false;
        }
        if surface_elems.is_empty() && note_blocks.is_empty() {
            return false;
        }
        if !surface_elems.iter().all(validate_surface_element) {
            return false;
        }
        if !note_blocks
            .iter()
            .all(|note| validate_note_block_tree(note, true, 0))
        {
            return false;
        }

        let now_ms = self.now_ms(cx) as u64;
        let Some(page_id) = self.page_id.clone() else {
            return false;
        };
        let mut prev_index = self.snapshot.as_deref().and_then(super::max_spatial_index);

        // Pass 1: allocate globally unique IDs for ALL surface elements AND ALL note subtrees
        // into the same `id_map` so Connectors/Groups pointing to pasted Notes remap cleanly.
        let mut id_map: HashMap<String, String> = HashMap::new();
        let mut assigned_elem_ids: Vec<String> = Vec::with_capacity(surface_elems.len());
        for elem in &surface_elems {
            let new_id = self.fresh_block_id();
            if let Some(old_id) = elem.get("id").and_then(Value::as_str)
                && !old_id.is_empty()
            {
                id_map.insert(old_id.to_string(), new_id.clone());
            }
            assigned_elem_ids.push(new_id);
        }
        let mut preallocated_notes: Vec<PreallocatedBlock> = Vec::with_capacity(note_blocks.len());
        for note in &note_blocks {
            preallocated_notes.push(preallocate_block_tree(note, &mut id_map, &mut || {
                self.fresh_block_id()
            }));
        }
        let prepared_notes: Vec<PastedBlockNode> = preallocated_notes
            .iter()
            .map(|n| materialize_pasted_block_tree(n, true, &id_map))
            .collect();

        let mut remapped_elems: Vec<(String, Vec<(String, SessionValue)>)> =
            Vec::with_capacity(surface_elems.len());
        for (i, (elem, new_id)) in surface_elems.iter().zip(assigned_elem_ids).enumerate() {
            let next_idx = generate_key_between(prev_index.as_deref(), None)
                .unwrap_or_else(|_| format!("z{i}"));
            prev_index = Some(next_idx.clone());
            let entries = remap_surface_element(elem, &new_id, &next_idx, &id_map);
            remapped_elems.push((new_id, entries));
        }

        let new_surface_id = (!remapped_elems.is_empty()).then(|| self.fresh_block_id());
        let Some(page) = self.state.workspace.page_mut(&page_id) else {
            return false;
        };
        let Ok(commit) =
            page.paste_edgeless_batch(remapped_elems, new_surface_id, prepared_notes, now_ms)
        else {
            return false;
        };
        if let Some(commit) = commit {
            self.send_page_update(&page_id, commit.update);
        }
        self.refresh_document();
        cx.notify();
        true
    }
}

fn extract_edgeless_payload_from_item(item: &ui::ClipboardItem) -> Option<Value> {
    if let Some(meta_str) = item.metadata()
        && let Ok(meta) = serde_json::from_str::<Value>(meta_str)
    {
        for mime in [
            "blocksuite/surface",
            crate::clipboard::SNAPSHOT_MIME,
            "BLOCKSUITE/SNAPSHOT",
        ] {
            if let Some(v) = meta.get(mime)
                && let Some(parsed) = parse_json_or_lz_value(v)
            {
                return Some(parsed);
            }
        }
        if let Some(html) = meta.get("text/html").and_then(Value::as_str)
            && let Some(parsed) = extract_from_html_snapshot(html)
        {
            return Some(parsed);
        }
    }
    let raw = item.text()?;
    extract_from_html_snapshot(&raw).or_else(|| {
        let trimmed = raw.trim();
        let parsed = (trimmed.starts_with('{') || trimmed.starts_with('['))
            .then(|| serde_json::from_str::<Value>(trimmed).ok())
            .flatten()?;
        is_explicit_blocksuite_envelope(&parsed).then_some(parsed)
    })
}

fn is_explicit_blocksuite_envelope(val: &Value) -> bool {
    match val {
        Value::Object(obj) => {
            obj.contains_key("blocksuite/surface")
                || obj.contains_key("BLOCKSUITE/SNAPSHOT")
                || obj.contains_key("surfaceElements")
                || matches!(
                    obj.get("flavour").and_then(Value::as_str),
                    Some("affine:surface" | "affine:note")
                )
        }
        Value::Array(items) => {
            !items.is_empty() && items.iter().all(is_explicit_blocksuite_envelope)
        }
        _ => false,
    }
}

fn is_allowed_note_child_flavour(flavour: &str) -> bool {
    matches!(
        flavour,
        "affine:paragraph"
            | "affine:list"
            | "affine:code"
            | "affine:divider"
            | "affine:image"
            | "affine:bookmark"
            | "affine:latex"
            | "affine:callout"
            | "affine:table"
            | "affine:attachment"
            | "affine:database"
            | "affine:surface-ref"
            | "affine:embed-linked-doc"
            | "affine:embed-synced-doc"
            | "affine:embed-youtube"
            | "affine:embed-figma"
            | "affine:embed-github"
            | "affine:embed-loom"
            | "affine:embed-iframe"
            | "affine:embed-html"
            | "affine:embed-web"
    )
}

fn validate_note_block_tree(obj: &Map<String, Value>, is_top_note: bool, depth: usize) -> bool {
    if depth > 128 {
        return false;
    }
    let Some(flavour) = obj.get("flavour").and_then(Value::as_str) else {
        return false;
    };
    if is_top_note {
        if flavour != "affine:note" {
            return false;
        }
    } else if !is_allowed_note_child_flavour(flavour) {
        return false;
    }
    if let Some(props) = obj.get("props")
        && !props.is_object()
        && !props.is_null()
    {
        return false;
    }
    if let Some(children_val) = obj.get("children") {
        let Some(arr) = children_val.as_array() else {
            return false;
        };
        if !is_top_note
            && blocksuite_playground_doc::schema::is_leaf_flavour(flavour)
            && !arr.is_empty()
        {
            return false;
        }
        for child in arr {
            let Some(child_obj) = child.as_object() else {
                return false;
            };
            if !validate_note_block_tree(child_obj, false, depth + 1) {
                return false;
            }
        }
    }
    true
}

fn validate_surface_element(elem: &Map<String, Value>) -> bool {
    let Some(ty) = elem.get("type").and_then(Value::as_str) else {
        return false;
    };
    let valid_xywh = |v: &Value| v.as_str().is_some_and(|s| super::parse_xywh(s).is_some());
    match ty {
        "shape" | "frame" | "text" | "highlighter" => elem.get("xywh").is_some_and(valid_xywh),
        "connector" => {
            elem.get("xywh").is_none_or(valid_xywh)
                && elem.get("source").is_none_or(Value::is_object)
                && elem.get("target").is_none_or(Value::is_object)
        }
        "brush" => elem.get("xywh").is_none_or(valid_xywh),
        "group" | "mindmap" => {
            elem.get("xywh").is_none_or(valid_xywh)
                && elem.get("children").is_none_or(Value::is_object)
        }
        _ => false,
    }
}

fn extract_from_html_snapshot(raw: &str) -> Option<Value> {
    let idx = raw.find("data-blocksuite-snapshot=")?;
    let rest = &raw[idx + "data-blocksuite-snapshot=".len()..];
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let inner = &rest[1..];
    let end = inner.find(quote)?;
    let attr = &inner[..end];
    if let Some(decoded) = crate::clipboard::decode_html_snapshot(attr)
        && let Ok(v) = serde_json::from_str::<Value>(&decoded)
    {
        return Some(v);
    }
    let unescaped = crate::clipboard::sanitize::decode_html_entities(attr);
    serde_json::from_str::<Value>(&unescaped).ok()
}

fn parse_json_or_lz_value(v: &Value) -> Option<Value> {
    match v {
        Value::String(s) => serde_json::from_str::<Value>(s).ok().or_else(|| {
            crate::clipboard::decode_html_snapshot(s)
                .and_then(|d| serde_json::from_str::<Value>(&d).ok())
        }),
        Value::Object(_) | Value::Array(_) => Some(v.clone()),
        _ => None,
    }
}

fn collect_edgeless_items(
    root: &Value,
    surface_out: &mut Vec<Map<String, Value>>,
    notes_out: &mut Vec<Map<String, Value>>,
) -> bool {
    match root {
        Value::Array(items) => {
            for item in items {
                if !collect_edgeless_items(item, surface_out, notes_out) {
                    return false;
                }
            }
            true
        }
        Value::Object(obj) => {
            let mut unwrapped_envelope = false;
            for key in ["blocksuite/surface", "BLOCKSUITE/SNAPSHOT", "snapshot"] {
                if let Some(inner) = obj.get(key)
                    && let Some(parsed) = parse_json_or_lz_value(inner)
                {
                    unwrapped_envelope = true;
                    if !collect_edgeless_items(&parsed, surface_out, notes_out) {
                        return false;
                    }
                }
            }
            if unwrapped_envelope {
                return true;
            }

            if obj.get("flavour").is_none() && obj.get("type").and_then(Value::as_str).is_some() {
                surface_out.push(obj.clone());
                return true;
            }

            if let Some(flavour) = obj.get("flavour").and_then(Value::as_str) {
                if flavour == "affine:surface" {
                    if let Some(el_val) = obj
                        .get("props")
                        .and_then(|p| p.get("elements"))
                        .and_then(|e| e.get("value").or(Some(e)))
                    {
                        return push_surface_elements_collection(el_val, surface_out);
                    }
                    return true;
                }
                if flavour == "affine:note" {
                    notes_out.push(obj.clone());
                    return true;
                }
                return false;
            }

            if let Some(elems) = obj.get("surfaceElements").or_else(|| obj.get("elements"))
                && !push_surface_elements_collection(elems, surface_out)
            {
                return false;
            }
            for list_key in ["blocks", "content", "children"] {
                if let Some(arr) = obj.get(list_key).and_then(Value::as_array) {
                    for item in arr {
                        if !collect_edgeless_items(item, surface_out, notes_out) {
                            return false;
                        }
                    }
                }
            }
            true
        }
        _ => true,
    }
}

fn push_surface_elements_collection(val: &Value, out: &mut Vec<Map<String, Value>>) -> bool {
    if let Some(arr) = val.as_array() {
        for item in arr {
            let Some(m) = item.as_object() else {
                return false;
            };
            out.push(m.clone());
        }
        true
    } else if let Some(map) = val.as_object() {
        if let Some(inner) = map.get("value")
            && (inner.is_object() || inner.is_array())
        {
            return push_surface_elements_collection(inner, out);
        }
        for (k, v) in map {
            let Some(mut m) = v.as_object().cloned() else {
                return false;
            };
            m.entry("id".to_string())
                .or_insert_with(|| Value::String(k.clone()));
            out.push(m);
        }
        true
    } else {
        false
    }
}

pub(super) struct PreallocatedBlock<'a> {
    new_id: String,
    obj: &'a Map<String, Value>,
    children: Vec<PreallocatedBlock<'a>>,
}

pub(super) fn preallocate_block_tree<'a>(
    obj: &'a Map<String, Value>,
    id_map: &mut HashMap<String, String>,
    alloc_id: &mut impl FnMut() -> String,
) -> PreallocatedBlock<'a> {
    let new_id = alloc_id();
    if let Some(old_id) = obj.get("id").and_then(Value::as_str)
        && !old_id.is_empty()
    {
        id_map.insert(old_id.to_string(), new_id.clone());
    }
    let mut children = Vec::new();
    if let Some(arr) = obj.get("children").and_then(Value::as_array) {
        for child in arr {
            if let Some(child_obj) = child.as_object() {
                children.push(preallocate_block_tree(child_obj, id_map, alloc_id));
            }
        }
    }
    PreallocatedBlock {
        new_id,
        obj,
        children,
    }
}

fn materialize_pasted_block_tree(
    node: &PreallocatedBlock<'_>,
    is_top_note: bool,
    id_map: &HashMap<String, String>,
) -> PastedBlockNode {
    materialize_pasted_block_tree_with_offset(node, is_top_note, PASTE_OFFSET, PASTE_OFFSET, id_map)
}

pub(super) fn materialize_pasted_block_tree_with_offset(
    node: &PreallocatedBlock<'_>,
    is_top_note: bool,
    dx: f64,
    dy: f64,
    id_map: &HashMap<String, String>,
) -> PastedBlockNode {
    let obj = node.obj;
    let new_id = node.new_id.clone();
    let flavour = obj
        .get("flavour")
        .and_then(Value::as_str)
        .unwrap_or("affine:paragraph");
    let default_version = match flavour {
        "affine:database" => 3,
        _ => 1,
    };
    let version = obj
        .get("version")
        .and_then(Value::as_i64)
        .and_then(|v| i32::try_from(v).ok())
        .unwrap_or(default_version);

    let mut entries = vec![
        (
            "sys:id".to_string(),
            SessionValue::Any(Any::String(new_id.clone())),
        ),
        (
            "sys:flavour".to_string(),
            SessionValue::Any(Any::String(flavour.to_string())),
        ),
        (
            "sys:version".to_string(),
            SessionValue::Any(Any::Integer(version)),
        ),
        ("sys:children".to_string(), SessionValue::Array(Vec::new())),
    ];

    if let Some(props) = obj.get("props").and_then(Value::as_object) {
        for (pk, pv) in props {
            let prop_key = if pk.starts_with("prop:") {
                pk.clone()
            } else {
                format!("prop:{pk}")
            };
            if is_top_note && prop_key == "prop:xywh" {
                let shifted = pv
                    .as_str()
                    .map(|s| offset_xywh_by(s, dx, dy))
                    .unwrap_or_else(|| "[0,0,448,120]".to_string());
                entries.push((prop_key, SessionValue::Any(Any::String(shifted))));
            } else if matches!(prop_key.as_str(), "prop:text" | "prop:title") && pv.is_string() {
                let s = pv.as_str().unwrap_or("");
                entries.push((
                    prop_key,
                    SessionValue::Text(if s.is_empty() {
                        Vec::new()
                    } else {
                        vec![TextDeltaOp::Insert {
                            insert: TextInsert::Text(s.to_string()),
                            format: None,
                        }]
                    }),
                ));
            } else if flavour == "affine:database" && prop_key == "prop:cells" {
                entries.push((prop_key, remap_database_cells(pv, id_map)));
            } else if flavour == "affine:surface-ref"
                && prop_key == "prop:reference"
                && let Some(orig) = pv.as_str()
                && let Some(mapped) = id_map.get(orig)
            {
                entries.push((prop_key, SessionValue::Any(Any::String(mapped.clone()))));
            } else if matches!(
                flavour,
                "affine:embed-linked-doc" | "affine:embed-synced-doc"
            ) && prop_key == "prop:pageId"
                && let Some(orig) = pv.as_str()
                && let Some(mapped) = id_map.get(orig)
            {
                entries.push((prop_key, SessionValue::Any(Any::String(mapped.clone()))));
            } else if flavour == "affine:frame" && prop_key == "prop:childElementIds" {
                entries.push((prop_key, remap_group_children(pv, id_map)));
            } else {
                entries.push((prop_key, block_json_to_session_value(pv, id_map)));
            }
        }
    }

    let has_key =
        |entries: &[(String, SessionValue)], k: &str| entries.iter().any(|(ek, _)| ek == k);
    match flavour {
        "affine:note" => {
            if !has_key(&entries, "prop:displayMode") {
                entries.push((
                    "prop:displayMode".to_string(),
                    SessionValue::Any(Any::String("both".to_string())),
                ));
            }
            if !has_key(&entries, "prop:xywh") {
                entries.push((
                    "prop:xywh".to_string(),
                    SessionValue::Any(Any::String("[24,24,448,120]".to_string())),
                ));
            }
        }
        "affine:paragraph" => {
            if !has_key(&entries, "prop:type") {
                entries.push((
                    "prop:type".to_string(),
                    SessionValue::Any(Any::String("text".to_string())),
                ));
            }
            if !has_key(&entries, "prop:text") {
                entries.push(("prop:text".to_string(), SessionValue::Text(Vec::new())));
            }
        }
        "affine:list" => {
            if !has_key(&entries, "prop:type") {
                entries.push((
                    "prop:type".to_string(),
                    SessionValue::Any(Any::String("bulleted".to_string())),
                ));
            }
            if !has_key(&entries, "prop:checked") {
                entries.push(("prop:checked".to_string(), SessionValue::Any(Any::False)));
            }
            if !has_key(&entries, "prop:text") {
                entries.push(("prop:text".to_string(), SessionValue::Text(Vec::new())));
            }
        }
        "affine:code" => {
            if !has_key(&entries, "prop:text") {
                entries.push(("prop:text".to_string(), SessionValue::Text(Vec::new())));
            }
        }
        "affine:database" => {
            if !has_key(&entries, "prop:title") {
                entries.push(("prop:title".to_string(), SessionValue::Text(Vec::new())));
            }
            if !has_key(&entries, "prop:views") {
                entries.push(("prop:views".to_string(), SessionValue::Array(Vec::new())));
            }
            if !has_key(&entries, "prop:columns") {
                entries.push(("prop:columns".to_string(), SessionValue::Array(Vec::new())));
            }
            if !has_key(&entries, "prop:cells") {
                entries.push(("prop:cells".to_string(), SessionValue::Map(Vec::new())));
            }
        }
        _ => {}
    }

    let children = node
        .children
        .iter()
        .map(|child| materialize_pasted_block_tree(child, false, id_map))
        .collect();

    PastedBlockNode {
        id: new_id,
        entries,
        children,
    }
}
