//! Edgeless canvas clipboard copy/cut (`Mod+C` / `Mod+X`) and `Alt+Drag` cloning.

use std::collections::{BTreeSet, HashMap};

use blocksuite_playground_doc::{
    fractional_index::generate_key_between,
    read::{BlockContent, BlockNode, PageSnapshot, RichText, SurfaceElement},
    session::PastedBlockNode,
};
use serde_json::{Map, Value, json};
use ui::{ClipboardItem, Context};
use y_octo::{Any, SessionValue, TextDeltaOp, TextInsert};

use crate::PlaygroundView;

use super::{
    DragItemInitial, SpatialItemKind, find_block, find_surface_element, max_spatial_index, paste,
    paste_convert,
};

impl PlaygroundView {
    /// Copy (or cut) selected Edgeless elements and spatial blocks (`affine:note`,
    /// `affine:frame`, `affine:edgeless-text`) into the clipboard using structured
    /// snapshot metadata plus a clean plain-text summary.
    pub(crate) fn edgeless_copy_selection(&mut self, cut: bool, cx: &mut Context<Self>) -> bool {
        if self.edgeless.authoring.selection.is_empty() {
            return false;
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return false;
        };
        let ids = self.expand_selection_with_containers(&self.edgeless.authoring.selection);
        let (surface_vals, block_vals, serialized_ids, plain_lines) =
            serialize_edgeless_ids(&snapshot, &ids);
        if surface_vals.is_empty() && block_vals.is_empty() {
            return false;
        }
        let mut envelope = Map::new();
        if !surface_vals.is_empty() {
            envelope.insert("blocksuite/surface".to_string(), Value::Array(surface_vals));
        }
        if !block_vals.is_empty() {
            envelope.insert("blocks".to_string(), Value::Array(block_vals));
        }
        let envelope_val = Value::Object(envelope);
        let meta = json!({
            crate::clipboard::SNAPSHOT_MIME: envelope_val,
            "blocksuite/surface": envelope_val,
        });
        let plain_summary = plain_lines.join("\n");
        cx.write_to_clipboard(ClipboardItem::new_string_with_json_metadata(
            plain_summary,
            meta,
        ));
        if cut {
            self.edgeless_delete_ids(&serialized_ids, cx);
        }
        true
    }

    /// Clone dragged items offset by `(dx, dy)` (`Alt/Option+Drag`) in one atomic undo step
    /// with remapped IDs, leaving originals untouched and selecting the new clones.
    pub(super) fn edgeless_clone_items_by_delta(
        &mut self,
        initial: &[DragItemInitial],
        dx: f64,
        dy: f64,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(snapshot) = self.snapshot.clone() else {
            return false;
        };
        let Some(page_id) = self.page_id.clone() else {
            return false;
        };
        let base_ids: BTreeSet<String> = initial.iter().map(|i| i.id.clone()).collect();
        let ids = self.expand_selection_with_containers(&base_ids);
        let (surface_vals, block_vals, _, _) = serialize_edgeless_ids(&snapshot, &ids);
        let surface_elems: Vec<Map<String, Value>> = surface_vals
            .into_iter()
            .filter_map(|v| match v {
                Value::Object(m) => Some(m),
                _ => None,
            })
            .collect();
        let note_blocks: Vec<Map<String, Value>> = block_vals
            .into_iter()
            .filter_map(|v| match v {
                Value::Object(m) => Some(m),
                _ => None,
            })
            .collect();
        if surface_elems.is_empty() && note_blocks.is_empty() {
            return false;
        }

        let now_ms = self.now_ms(cx) as u64;
        let mut prev_index = max_spatial_index(&snapshot);
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
        let mut preallocated_notes = Vec::with_capacity(note_blocks.len());
        for note in &note_blocks {
            preallocated_notes.push(paste::preallocate_block_tree(
                note,
                &mut id_map,
                &mut || self.fresh_block_id(),
            ));
        }
        let prepared_notes: Vec<PastedBlockNode> = preallocated_notes
            .iter()
            .map(|n| paste::materialize_pasted_block_tree_with_offset(n, true, dx, dy, &id_map))
            .collect();

        let mut remapped_elems: Vec<(String, Vec<(String, SessionValue)>)> =
            Vec::with_capacity(surface_elems.len());
        for (i, (elem, new_id)) in surface_elems.iter().zip(&assigned_elem_ids).enumerate() {
            let next_idx = generate_key_between(prev_index.as_deref(), None)
                .unwrap_or_else(|_| format!("z{i}"));
            prev_index = Some(next_idx.clone());
            let entries = paste_convert::remap_surface_element_with_offset(
                elem, new_id, &next_idx, dx, dy, &id_map,
            );
            remapped_elems.push((new_id.clone(), entries));
        }

        let new_surface_id = (!remapped_elems.is_empty() || !prepared_notes.is_empty())
            .then(|| self.fresh_block_id());
        let Some(page) = self.state.workspace.page_mut(&page_id) else {
            return false;
        };
        let Ok(commit) =
            page.paste_edgeless_batch(remapped_elems, new_surface_id, prepared_notes, now_ms)
        else {
            return false;
        };
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
            let mut next_sel = BTreeSet::new();
            for old_id in &self.edgeless.authoring.selection {
                if let Some(new_id) = id_map.get(old_id) {
                    next_sel.insert(new_id.clone());
                }
            }
            if !next_sel.is_empty() {
                self.edgeless.authoring.selection = next_sel;
            }
            return true;
        }
        false
    }

    /// Expand a set of item IDs to include descendant members of selected Groups and Frames.
    pub(super) fn expand_selection_with_containers(
        &self,
        selected: &BTreeSet<String>,
    ) -> BTreeSet<String> {
        let mut ids = selected.clone();
        let mut changed = true;
        while changed {
            changed = false;
            for item in self.edgeless.authoring.painted_items.iter() {
                if !ids.contains(&item.id) {
                    continue;
                }
                if item.kind == SpatialItemKind::Frame {
                    for cid in &item.frame_children {
                        if ids.insert(cid.clone()) {
                            changed = true;
                        }
                    }
                }
                if item.kind == SpatialItemKind::Group {
                    for cid in &item.group_children {
                        if ids.insert(cid.clone()) {
                            changed = true;
                        }
                    }
                }
            }
        }
        ids
    }
}

fn serialize_edgeless_ids(
    snapshot: &PageSnapshot,
    ids: &BTreeSet<String>,
) -> (Vec<Value>, Vec<Value>, BTreeSet<String>, Vec<String>) {
    let mut surface_vals = Vec::new();
    let mut block_vals = Vec::new();
    let mut serialized_ids = BTreeSet::new();
    let mut plain_lines = Vec::new();
    for id in ids {
        if let Some((_, el)) = find_surface_element(snapshot, id) {
            serialized_ids.insert(el.id.clone());
            if let Some(line) = surface_element_plain(el)
                && !line.is_empty()
            {
                plain_lines.push(line);
            }
            surface_vals.push(surface_element_to_json(el));
        } else if let Some(node) = find_block(snapshot, id)
            && matches!(
                node.flavour.as_str(),
                "affine:note" | "affine:frame" | "affine:edgeless-text"
            )
        {
            serialized_ids.insert(node.id.clone());
            collect_block_plain_lines(node, &mut plain_lines);
            block_vals.push(block_node_to_json(node));
        }
    }
    (surface_vals, block_vals, serialized_ids, plain_lines)
}

fn surface_element_plain(el: &SurfaceElement) -> Option<String> {
    match &el.kind {
        blocksuite_playground_doc::read::SurfaceElementKind::Shape(s) => Some(s.text.plain.clone()),
        blocksuite_playground_doc::read::SurfaceElementKind::Connector(c) => {
            Some(c.text.plain.clone())
        }
        blocksuite_playground_doc::read::SurfaceElementKind::Text(t) => Some(t.text.plain.clone()),
        _ => None,
    }
}

fn collect_block_plain_lines(node: &BlockNode, out: &mut Vec<String>) {
    match &node.content {
        BlockContent::Paragraph { text, .. }
        | BlockContent::List { text, .. }
        | BlockContent::Callout { text, .. } => {
            if !text.plain.is_empty() {
                out.push(text.plain.clone());
            }
        }
        BlockContent::Frame { title, .. } => {
            if !title.plain.is_empty() {
                out.push(title.plain.clone());
            }
        }
        BlockContent::Code { text, .. } => {
            if !text.is_empty() {
                out.push(text.clone());
            }
        }
        _ => {}
    }
    for child in &node.children {
        collect_block_plain_lines(child, out);
    }
}

fn rich_text_to_delta_json(rt: &RichText) -> Value {
    let mut ops = Vec::with_capacity(rt.delta.len());
    for op in &rt.delta {
        if let TextDeltaOp::Insert {
            insert: TextInsert::Text(s),
            format,
        } = op
        {
            let mut item = Map::new();
            item.insert("insert".to_string(), Value::String(s.clone()));
            if let Some(attrs) = format
                && !attrs.is_empty()
            {
                let mut attr_map = Map::new();
                for (k, v) in attrs {
                    attr_map.insert(k.clone(), any_to_json(v));
                }
                item.insert("attributes".to_string(), Value::Object(attr_map));
            }
            ops.push(Value::Object(item));
        }
    }
    json!({ "delta": ops })
}

fn any_to_json(v: &Any) -> Value {
    match v {
        Any::Null | Any::Undefined => Value::Null,
        Any::True => Value::Bool(true),
        Any::False => Value::Bool(false),
        Any::Integer(i) => json!(*i),
        Any::BigInt64(i) => json!(*i),
        Any::Float32(f) => {
            serde_json::Number::from_f64(f64::from(f.0)).map_or(Value::Null, Value::Number)
        }
        Any::Float64(f) => serde_json::Number::from_f64(f.0).map_or(Value::Null, Value::Number),
        Any::String(s) => Value::String(s.clone()),
        Any::Binary(b) => Value::Array(b.iter().map(|x| json!(*x)).collect()),
        Any::Array(arr) => Value::Array(arr.iter().map(any_to_json).collect()),
        Any::Object(obj) => Value::Object(
            obj.iter()
                .map(|(k, val)| (k.clone(), any_to_json(val)))
                .collect(),
        ),
    }
}

fn surface_element_to_json(el: &SurfaceElement) -> Value {
    let mut map: Map<String, Value> = el
        .props
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    map.insert("id".to_string(), Value::String(el.id.clone()));
    map.insert("index".to_string(), Value::String(el.index.clone()));
    // Preserve full rich-text delta (including marks and inline references) on labels.
    match &el.kind {
        blocksuite_playground_doc::read::SurfaceElementKind::Shape(s)
            if !s.text.delta.is_empty() =>
        {
            map.insert("text".to_string(), rich_text_to_delta_json(&s.text));
        }
        blocksuite_playground_doc::read::SurfaceElementKind::Connector(c)
            if !c.text.delta.is_empty() =>
        {
            map.insert("text".to_string(), rich_text_to_delta_json(&c.text));
        }
        blocksuite_playground_doc::read::SurfaceElementKind::Text(t) => {
            map.insert("text".to_string(), rich_text_to_delta_json(&t.text));
        }
        _ => {}
    }
    Value::Object(map)
}

fn block_node_to_json(node: &BlockNode) -> Value {
    let mut props = Map::new();
    for (k, v) in &node.props {
        let stripped = k.strip_prefix("prop:").unwrap_or(k);
        props.insert(stripped.to_string(), v.clone());
    }
    match &node.content {
        BlockContent::Paragraph { text, .. }
        | BlockContent::List { text, .. }
        | BlockContent::Callout { text, .. } => {
            props.insert("text".to_string(), rich_text_to_delta_json(text));
        }
        BlockContent::Frame { title, .. } => {
            props.insert("title".to_string(), rich_text_to_delta_json(title));
        }
        _ => {}
    }
    let children: Vec<Value> = node.children.iter().map(block_node_to_json).collect();
    json!({
        "id": node.id,
        "flavour": node.flavour,
        "version": node.version,
        "props": props,
        "children": children,
    })
}
