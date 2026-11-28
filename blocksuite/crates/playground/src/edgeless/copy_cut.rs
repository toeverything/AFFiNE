//! Edgeless canvas clipboard copy/cut (`Mod+C` / `Mod+X`) and `Alt+Drag` cloning.

use std::collections::{BTreeSet, HashMap};

use blocksuite_playground_doc::{
    fractional_index::generate_key_between,
    read::{BlockNode, PageSnapshot, SurfaceElement},
    session::PastedBlockNode,
};
use serde_json::{Map, Value, json};
use ui::{ClipboardItem, Context};
use y_octo::SessionValue;

use crate::PlaygroundView;

use super::{
    DragItemInitial, SpatialItemKind, find_block, find_surface_element, max_spatial_index, paste,
    paste_convert,
};

impl PlaygroundView {
    /// Copy (or cut) selected Edgeless elements and blocks into the clipboard using the
    /// BlockSuite surface snapshot envelope consumed by `paste_edgeless_clipboard_item`.
    pub(crate) fn edgeless_copy_selection(&mut self, cut: bool, cx: &mut Context<Self>) -> bool {
        if self.edgeless.authoring.selection.is_empty() {
            return false;
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return false;
        };
        let ids = self.expand_selection_with_containers(&self.edgeless.authoring.selection);
        let (surface_vals, block_vals) = serialize_edgeless_ids(&snapshot, &ids);
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
        let Ok(payload_str) = serde_json::to_string(&Value::Object(envelope)) else {
            return false;
        };
        cx.write_to_clipboard(ClipboardItem::new_string(payload_str));
        if cut {
            self.edgeless_delete_selection(cx);
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
        let (surface_vals, block_vals) = serialize_edgeless_ids(&snapshot, &ids);
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
) -> (Vec<Value>, Vec<Value>) {
    let mut surface_vals = Vec::new();
    let mut block_vals = Vec::new();
    for id in ids {
        if let Some((_, el)) = find_surface_element(snapshot, id) {
            surface_vals.push(surface_element_to_json(el));
        } else if let Some(node) = find_block(snapshot, id)
            && node.flavour == "affine:note"
        {
            block_vals.push(block_node_to_json(node));
        }
    }
    (surface_vals, block_vals)
}

fn surface_element_to_json(el: &SurfaceElement) -> Value {
    let mut map: Map<String, Value> = el
        .props
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    map.insert("id".to_string(), Value::String(el.id.clone()));
    map.insert("index".to_string(), Value::String(el.index.clone()));
    // Preserve rich-text delta on shapes/connectors/text when present.
    match &el.kind {
        blocksuite_playground_doc::read::SurfaceElementKind::Shape(s)
            if !s.text.plain.is_empty() =>
        {
            map.insert(
                "text".to_string(),
                json!({ "delta": [{ "insert": s.text.plain }] }),
            );
        }
        blocksuite_playground_doc::read::SurfaceElementKind::Connector(c)
            if !c.text.plain.is_empty() =>
        {
            map.insert(
                "text".to_string(),
                json!({ "delta": [{ "insert": c.text.plain }] }),
            );
        }
        blocksuite_playground_doc::read::SurfaceElementKind::Text(t) => {
            map.insert(
                "text".to_string(),
                json!({ "delta": [{ "insert": t.text.plain }] }),
            );
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
    let children: Vec<Value> = node.children.iter().map(block_node_to_json).collect();
    json!({
        "id": node.id,
        "flavour": node.flavour,
        "version": node.version,
        "props": props,
        "children": children,
    })
}
