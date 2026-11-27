//! Frame deletion cascade and key-level incremental `prop:childElementIds` CRDT updates.

use y_octo::{Any, SessionReadValue, SessionValue, TypePath, TypeTarget};

use super::{PageCommit, PageDocSession};
use crate::DocResult;

impl PageDocSession {
    /// Delete the given blocks and surface elements, recursively expanding any deleted
    /// `affine:frame`'s `prop:childElementIds` (`true` entries only), deduplicating ancestors,
    /// pruning deleted IDs from surviving frames, and cascading connected `Connector`s,
    /// all in one atomic undoable transaction.
    pub fn delete_blocks_and_elements_with_connectors(
        &mut self,
        block_ids: &[&str],
        surface_elements: &[(&str, &str)],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let snap = self.read_page_snapshot()?;
        let mut all_block_ids: Vec<String> = block_ids.iter().map(|s| (*s).to_string()).collect();
        let mut all_surf: Vec<(String, String)> = surface_elements
            .iter()
            .map(|(s, e)| ((*s).to_string(), (*e).to_string()))
            .collect();
        let mut deleted_ids: std::collections::HashSet<String> = all_block_ids
            .iter()
            .cloned()
            .chain(all_surf.iter().map(|(_, eid)| eid.clone()))
            .collect();

        // Recursively expand deleted Frames (`prop:childElementIds` true entries) and
        // deleted Groups (`SurfaceElementKind::Group.children`) to fixpoint.
        let find_surface_owner = |target_id: &str| -> Option<String> {
            snap.root.as_ref()?.walk().find_map(|n| match &n.content {
                crate::read::BlockContent::Surface { elements, .. }
                    if elements.iter().any(|el| el.id == target_id) =>
                {
                    Some(n.id.clone())
                }
                _ => None,
            })
        };
        let mut b_cursor = 0;
        let mut s_cursor = 0;
        while b_cursor < all_block_ids.len() || s_cursor < all_surf.len() {
            while b_cursor < all_block_ids.len() {
                let bid = all_block_ids[b_cursor].clone();
                b_cursor += 1;
                let Some(node) = snap.block(&bid) else {
                    continue;
                };
                if !matches!(node.content, crate::read::BlockContent::Frame { .. }) {
                    continue;
                }
                let Some(children) = node
                    .props
                    .get("prop:childElementIds")
                    .and_then(|v| v.as_object())
                else {
                    continue;
                };
                for child_id in children
                    .iter()
                    .filter(|(_, v)| v.as_bool() == Some(true))
                    .map(|(k, _)| k)
                {
                    if !deleted_ids.insert(child_id.clone()) {
                        continue;
                    }
                    if snap.block(child_id).is_some() {
                        all_block_ids.push(child_id.clone());
                    } else if let Some(sid) = find_surface_owner(child_id) {
                        all_surf.push((sid, child_id.clone()));
                    }
                }
            }
            while s_cursor < all_surf.len() {
                let (sid, eid) = all_surf[s_cursor].clone();
                s_cursor += 1;
                let Some(snode) = snap.block(&sid) else {
                    continue;
                };
                let crate::read::BlockContent::Surface { elements, .. } = &snode.content else {
                    continue;
                };
                let Some(el) = elements.iter().find(|e| e.id == eid) else {
                    continue;
                };
                let crate::read::SurfaceElementKind::Group { children, .. } = &el.kind else {
                    continue;
                };
                for child_id in children {
                    if !deleted_ids.insert(child_id.clone()) {
                        continue;
                    }
                    if snap.block(child_id).is_some() {
                        all_block_ids.push(child_id.clone());
                    } else if let Some(owner) = find_surface_owner(child_id) {
                        all_surf.push((owner, child_id.clone()));
                    }
                }
            }
        }

        let mut was_live_before = std::collections::HashSet::new();
        for node in snap
            .root
            .iter()
            .flat_map(|r| r.walk())
            .chain(snap.detached.iter().flat_map(|n| n.walk()))
        {
            was_live_before.insert(node.id.clone());
            if let crate::read::BlockContent::Surface { elements, .. } = &node.content {
                for el in elements {
                    was_live_before.insert(el.id.clone());
                }
            }
        }

        let graph = self.child_graph()?;
        let parent_edges: Vec<(String, String)> = graph
            .iter()
            .flat_map(|(parent, children)| {
                children.iter().map(move |c| (c.clone(), parent.clone()))
            })
            .collect();
        let mut block_parent_removals: Vec<(String, String)> = Vec::new();
        for bid in &all_block_ids {
            let mut visited = std::collections::HashSet::new();
            let mut stack: Vec<&str> = vec![bid.as_str()];
            let mut has_deleted_ancestor = false;
            while let Some(cur) = stack.pop() {
                if !visited.insert(cur) {
                    continue;
                }
                for (c, p) in &parent_edges {
                    if c == cur {
                        if deleted_ids.contains(p) {
                            has_deleted_ancestor = true;
                            break;
                        }
                        stack.push(p.as_str());
                    }
                }
                if has_deleted_ancestor {
                    break;
                }
            }
            if has_deleted_ancestor {
                continue;
            }
            for (c, p) in &parent_edges {
                if c == bid
                    && !deleted_ids.contains(p)
                    && !block_parent_removals
                        .iter()
                        .any(|x| x.0 == *bid && x.1 == *p)
                {
                    block_parent_removals.push((bid.clone(), p.clone()));
                }
            }
        }

        self.structural_edit(now_ms, move |page| {
            for (sid, eid) in &all_surf {
                page.remove_surface_element(sid, eid, now_ms)?;
            }
            for (bid, parent_id) in &block_parent_removals {
                page.delete_block_subtree(parent_id, bid, now_ms)?;
            }

            let collect_live = |s: &crate::read::PageSnapshot| {
                let mut live = std::collections::HashSet::new();
                for n in s
                    .root
                    .iter()
                    .flat_map(|r| r.walk())
                    .chain(s.detached.iter().flat_map(|d| d.walk()))
                {
                    live.insert(n.id.clone());
                    if let crate::read::BlockContent::Surface { elements, .. } = &n.content {
                        for el in elements {
                            live.insert(el.id.clone());
                        }
                    }
                }
                live
            };

            loop {
                let after = page.read_page_snapshot()?;
                let live_now = collect_live(&after);
                let mut next_connectors: Vec<(String, String)> = Vec::new();
                for node in after
                    .root
                    .iter()
                    .flat_map(|r| r.walk())
                    .chain(after.detached.iter().flat_map(|d| d.walk()))
                {
                    if let crate::read::BlockContent::Surface { elements, .. } = &node.content {
                        for el in elements {
                            if let crate::read::SurfaceElementKind::Connector(c) = &el.kind {
                                let src_gone = c.source.id.as_deref().is_some_and(|id| {
                                    was_live_before.contains(id) && !live_now.contains(id)
                                });
                                let tgt_gone = c.target.id.as_deref().is_some_and(|id| {
                                    was_live_before.contains(id) && !live_now.contains(id)
                                });
                                if src_gone || tgt_gone {
                                    next_connectors.push((node.id.clone(), el.id.clone()));
                                }
                            }
                        }
                    }
                }
                if next_connectors.is_empty() {
                    for node in after
                        .root
                        .iter()
                        .flat_map(|r| r.walk())
                        .chain(after.detached.iter().flat_map(|d| d.walk()))
                    {
                        if !matches!(node.content, crate::read::BlockContent::Frame { .. }) {
                            continue;
                        }
                        if let Some(children) = node
                            .props
                            .get("prop:childElementIds")
                            .and_then(|v| v.as_object())
                        {
                            let removes: Vec<String> = children
                                .iter()
                                .filter(|(k, v)| {
                                    v.as_bool() == Some(true)
                                        && was_live_before.contains(*k)
                                        && !live_now.contains(*k)
                                })
                                .map(|(k, _)| k.clone())
                                .collect();
                            if !removes.is_empty() {
                                page.apply_frame_child_element_ids_delta(&node.id, &[], &removes)?;
                            }
                        }
                    }
                    break;
                }
                for (sid, eid) in &next_connectors {
                    page.remove_surface_element(sid, eid, now_ms)?;
                }
            }
            Ok(())
        })
    }

    pub(super) fn apply_frame_child_element_ids_delta(
        &mut self,
        frame_id: &str,
        add_ids: &[String],
        remove_ids: &[String],
    ) -> DocResult<()> {
        if add_ids.is_empty() && remove_ids.is_empty() {
            return Ok(());
        }
        let block = TypeTarget::Path(TypePath::root("blocks").key(frame_id));
        match self.session.get_map_value(&block, "prop:childElementIds")? {
            Some(SessionReadValue::Map(map_id)) => {
                let target = TypeTarget::Identity(map_id);
                for id in remove_ids {
                    let _ = self.session.map_remove(&target, id);
                }
                for id in add_ids {
                    self.session
                        .map_set(&target, id.clone(), SessionValue::Any(Any::True))?;
                }
            }
            Some(SessionReadValue::Any(Any::Object(obj))) => {
                let mut entries: Vec<(String, SessionValue)> = obj
                    .into_iter()
                    .filter(|(k, v)| *v == Any::True && !remove_ids.iter().any(|r| r == k))
                    .map(|(k, _)| (k, SessionValue::Any(Any::True)))
                    .collect();
                for id in add_ids {
                    if !entries.iter().any(|(k, _)| k == id) {
                        entries.push((id.clone(), SessionValue::Any(Any::True)));
                    }
                }
                self.session.map_set(
                    &block,
                    "prop:childElementIds".into(),
                    SessionValue::Map(entries),
                )?;
            }
            _ if !add_ids.is_empty() => {
                let entries = add_ids
                    .iter()
                    .map(|id| (id.clone(), SessionValue::Any(Any::True)))
                    .collect();
                self.session.map_set(
                    &block,
                    "prop:childElementIds".into(),
                    SessionValue::Map(entries),
                )?;
            }
            _ => {}
        }
        Ok(())
    }

    /// Incrementally insert/remove keys in an `affine:frame`'s `prop:childElementIds` `Y.Map`
    /// without replacing the map, preserving concurrent multi-replica additions.
    pub fn update_frame_child_element_ids(
        &mut self,
        frame_id: &str,
        add_ids: &[String],
        remove_ids: &[String],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let frame_id = frame_id.to_string();
        let add_ids = add_ids.to_vec();
        let remove_ids = remove_ids.to_vec();
        self.structural_edit(now_ms, move |page| {
            page.apply_frame_child_element_ids_delta(&frame_id, &add_ids, &remove_ids)
        })
    }

    /// Replace `prop:childElementIds` on an `affine:frame` block.
    pub fn set_frame_child_element_ids(
        &mut self,
        frame_id: &str,
        child_ids: &[String],
        now_ms: u64,
    ) -> DocResult<PageCommit> {
        let entries = child_ids
            .iter()
            .map(|id| (id.clone(), SessionValue::Any(Any::True)))
            .collect();
        self.set_block_prop(
            frame_id,
            "prop:childElementIds",
            SessionValue::Map(entries),
            now_ms,
        )
    }
}
