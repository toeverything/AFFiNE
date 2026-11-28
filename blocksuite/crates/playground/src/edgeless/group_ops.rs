//! Group/ungroup (`Mod+G` / `Mod+Shift+G`), wrap-selection-in-Frame (`F`), delete, and z-order ops.

use std::collections::BTreeSet;

use blocksuite_playground_doc::{
    fractional_index::generate_key_between, schema::SurfaceElementSpec,
};
use ui::Context;
use y_octo::{Any, SessionValue};

use crate::PlaygroundView;

use super::{
    EdgelessTool, SpatialItemInfo, SpatialItemKind, commands::min_spatial_index, max_spatial_index,
};

impl PlaygroundView {
    /// Wrap the current non-empty Edgeless selection inside a new Frame and populate `prop:childElementIds`.
    pub(crate) fn edgeless_wrap_selection_in_frame(&mut self, cx: &mut Context<Self>) -> bool {
        if self.edgeless.authoring.selection.is_empty() {
            return false;
        }
        let Some(sel_box) = self.edgeless.authoring.selection_world_box() else {
            return false;
        };
        let pad = 40.0_f32;
        let frame_xywh = [
            (sel_box.x - pad) as f64,
            (sel_box.y - pad) as f64,
            (sel_box.w + pad * 2.0).max(120.0) as f64,
            (sel_box.h + pad * 2.0).max(80.0) as f64,
        ];
        let children: Vec<String> = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .filter(|item| {
                self.edgeless.authoring.selection.contains(&item.id)
                    && item.kind != SpatialItemKind::Frame
            })
            .map(|item| item.id.clone())
            .collect();
        let next_idx = self
            .snapshot
            .as_deref()
            .and_then(max_spatial_index)
            .and_then(|m| generate_key_between(Some(&m), None).ok())
            .unwrap_or_else(|| "a0".to_string());
        let Some(cid) = self.page().map(|p| p.client_id()) else {
            return false;
        };
        let frame_id = self.edgeless.authoring.next_id("frame", cid);
        let now_ms = self.now_ms(cx) as u64;
        let frame_id_clone = frame_id.clone();
        let commit = self.page_mut().ok().and_then(|page| {
            let child_refs: Vec<&str> = children.iter().map(String::as_str).collect();
            page.add_frame_with_children(
                None,
                &frame_id_clone,
                "Frame",
                &next_idx,
                frame_xywh,
                &child_refs,
                now_ms,
            )
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
            self.edgeless.authoring.selection.clear();
            self.edgeless.authoring.selection.insert(frame_id);
            self.edgeless.authoring.tool = EdgelessTool::Select;
            return true;
        }
        false
    }

    /// Group selected items (`Mod+G`) into a new `Group` surface element in one atomic undo step.
    pub(crate) fn edgeless_group_selection(&mut self, cx: &mut Context<Self>) -> bool {
        let members: Vec<String> = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .filter(|item| {
                self.edgeless.authoring.selection.contains(&item.id)
                    && item.kind != SpatialItemKind::Frame
            })
            .map(|item| item.id.clone())
            .collect();
        if members.len() < 2 {
            return false;
        }
        let next_idx = self
            .snapshot
            .as_deref()
            .and_then(max_spatial_index)
            .and_then(|m| generate_key_between(Some(&m), None).ok())
            .unwrap_or_else(|| "a0".to_string());
        let Some(cid) = self.page().map(|p| p.client_id()) else {
            return false;
        };
        let group_id = self.edgeless.authoring.next_id("group", cid);
        let seed = (self.edgeless.authoring.next_id_seq as i32 + 71) * 53;
        let now_ms = self.now_ms(cx) as u64;
        let group_id_clone = group_id.clone();
        let commit = self.page_mut().ok().and_then(|page| {
            page.structural_edit(now_ms, move |page| {
                let surface_id = page.ensure_surface_block(now_ms)?;
                page.add_surface_element(
                    &surface_id,
                    group_id_clone.clone(),
                    &next_idx,
                    SurfaceElementSpec::Group {
                        seed,
                        title: "Group".into(),
                        children: members.clone(),
                    },
                    now_ms,
                )?;
                Ok(())
            })
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
            self.edgeless.authoring.selection.clear();
            self.edgeless.authoring.selection.insert(group_id);
            return true;
        }
        false
    }

    /// Ungroup any selected `Group` elements (`Mod+Shift+G`), restoring their children to selection.
    pub(crate) fn edgeless_ungroup_selection(&mut self, cx: &mut Context<Self>) -> bool {
        let Some(snapshot) = self.snapshot.as_deref() else {
            return false;
        };
        let mut groups: Vec<(String, String)> = Vec::new();
        let mut next_selection: BTreeSet<String> = self.edgeless.authoring.selection.clone();
        for id in &self.edgeless.authoring.selection {
            if let Some((surface_id, el)) = super::find_surface_element(snapshot, id)
                && let blocksuite_playground_doc::read::SurfaceElementKind::Group {
                    children, ..
                } = &el.kind
            {
                groups.push((surface_id.to_string(), id.clone()));
                next_selection.remove(id);
                for cid in children {
                    next_selection.insert(cid.clone());
                }
            }
        }
        if groups.is_empty() {
            return false;
        }
        let now_ms = self.now_ms(cx) as u64;
        let commit = self.page_mut().ok().and_then(|page| {
            page.structural_edit(now_ms, move |page| {
                for (surface_id, group_id) in &groups {
                    page.remove_surface_element(surface_id, group_id, now_ms)?;
                }
                Ok(())
            })
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
            self.edgeless.authoring.selection = next_selection;
            return true;
        }
        false
    }

    pub(crate) fn edgeless_delete_selection(&mut self, cx: &mut Context<Self>) {
        let targets = self.edgeless.authoring.selection.clone();
        self.edgeless_delete_ids(&targets, cx);
    }

    pub(crate) fn edgeless_delete_ids(
        &mut self,
        targets: &BTreeSet<String>,
        cx: &mut Context<Self>,
    ) {
        if targets.is_empty() {
            return;
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        let root_id = snapshot.root.as_ref().map(|r| r.id.clone());
        let page_visible_notes: Vec<String> = snapshot
            .root
            .as_ref()
            .map(|r| {
                r.children
                    .iter()
                    .filter(|c| c.is_page_visible_note())
                    .map(|c| c.id.clone())
                    .collect()
            })
            .unwrap_or_default();

        let expanded_ids = self.expand_selection_with_containers(targets);
        let selected: Vec<SpatialItemInfo> = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .filter(|i| expanded_ids.contains(&i.id))
            .cloned()
            .collect();

        let mut protected_note_id: Option<String> = None;
        if !page_visible_notes.is_empty()
            && page_visible_notes
                .iter()
                .all(|nid| expanded_ids.contains(nid))
        {
            protected_note_id = Some(page_visible_notes[0].clone());
        }

        let mut block_ids: Vec<String> = Vec::new();
        let mut surface_elements: Vec<(String, String)> = Vec::new();
        for item in &selected {
            if root_id.as_deref() == Some(item.id.as_str()) {
                continue;
            }
            if protected_note_id.as_deref() == Some(item.id.as_str()) {
                continue;
            }
            if item.kind.is_block() {
                block_ids.push(item.id.clone());
            } else if let Some(surface_id) = &item.surface_id {
                surface_elements.push((surface_id.clone(), item.id.clone()));
            }
        }
        let now_ms = self.now_ms(cx) as u64;
        let commit = self.page_mut().ok().and_then(|page| {
            let b_refs: Vec<&str> = block_ids.iter().map(String::as_str).collect();
            let s_refs: Vec<(&str, &str)> = surface_elements
                .iter()
                .map(|(s, e)| (s.as_str(), e.as_str()))
                .collect();
            let p_refs: Vec<&str> = protected_note_id.iter().map(String::as_str).collect();
            if b_refs.is_empty() && s_refs.is_empty() {
                return None;
            }
            page.delete_blocks_and_elements_preserving(&b_refs, &s_refs, &p_refs, now_ms)
                .ok()
                .flatten()
        });
        self.edgeless
            .authoring
            .selection
            .retain(|id| !targets.contains(id));
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
        }
        cx.notify();
    }

    pub(crate) fn edgeless_reorder_selection(
        &mut self,
        bring_to_front: bool,
        cx: &mut Context<Self>,
    ) {
        if self.edgeless.authoring.selection.is_empty() {
            return;
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        let mut cursor = if bring_to_front {
            max_spatial_index(&snapshot)
        } else {
            min_spatial_index(&snapshot)
        };
        let selected: Vec<SpatialItemInfo> = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .filter(|i| self.edgeless.authoring.selection.contains(&i.id))
            .cloned()
            .collect();
        let now_ms = self.now_ms(cx) as u64;
        let mut updates = Vec::new();
        let ordered: Vec<SpatialItemInfo> = if bring_to_front {
            selected
        } else {
            selected.into_iter().rev().collect()
        };
        for item in ordered {
            let next = if bring_to_front {
                generate_key_between(cursor.as_deref(), None).ok()
            } else {
                generate_key_between(None, cursor.as_deref()).ok()
            };
            if let Some(key) = next {
                cursor = Some(key.clone());
                updates.push((item, key));
            }
        }
        if updates.is_empty() {
            return;
        }
        let commit = self.page_mut().ok().and_then(|page| {
            page.structural_edit(now_ms, move |page| {
                for (item, key) in &updates {
                    if item.kind.is_block() {
                        page.set_block_index(&item.id, key, now_ms)?;
                    } else if let Some(surface_id) = &item.surface_id {
                        page.set_surface_element_field(
                            surface_id,
                            &item.id,
                            "index",
                            SessionValue::Any(Any::String(key.clone())),
                            now_ms,
                        )?;
                    }
                }
                Ok(())
            })
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
        }
    }
}
