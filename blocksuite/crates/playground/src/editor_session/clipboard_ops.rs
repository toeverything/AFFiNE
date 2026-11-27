use blocksuite_playground_doc::{DocError, DocResult, read::BlockNode, session::split_delta};
use y_octo::TextDeltaOp;

use super::*;

impl PlaygroundView {
    pub(super) fn clipboard_slice(&self) -> Option<crate::clipboard::Slice> {
        let sel = self.editor.selection.as_ref()?;
        if sel.empty() {
            return None;
        }
        let layout = self.flow_layout()?;
        let (start, end, _, _, _) = sel.ordered(&layout)?;
        let snapshot = self.page_snapshot()?;
        let page = self.page()?;
        let range = RangeBlocks::between(snapshot, &start.block_id, &end.block_id)?;
        let mut ids: BTreeSet<_> = range.intermediate.iter().map(String::as_str).collect();
        ids.extend([start.block_id.as_str(), end.block_id.as_str()]);
        let root = snapshot.root.as_ref()?;
        let mut selected = BTreeMap::new();
        let content =
            std::iter::once(root).chain(page_content_roots(root).flat_map(BlockNode::walk));
        for node in content.filter(|n| ids.contains(n.id.as_str())) {
            let delta = if text_content(node).is_some() {
                let (rich, _) = page.read_editable_text(&node.id).ok()?;
                let from = if node.id == start.block_id {
                    start.offset()
                } else {
                    0
                };
                let (_, tail) = split_delta(&rich.delta, from).ok()?;
                if node.id == end.block_id {
                    split_delta(&tail, end.offset() - from).ok()?.0
                } else {
                    tail
                }
            } else {
                Vec::new()
            };
            selected.insert(
                node.id.clone(),
                crate::clipboard::SliceBlock::from_node(
                    node,
                    page.export_slice_props(&node.id).ok()?,
                    &delta,
                ),
            );
        }
        let mut blocks: Vec<_> = selected.remove(&root.id).into_iter().collect();
        for child in page_content_roots(root) {
            crate::clipboard::SliceBlock::keep_selected(child, &mut selected, &mut blocks);
        }
        Some(crate::clipboard::Slice::new(
            self.state.workspace.room(),
            self.page_id.as_deref()?,
            blocks,
        ))
    }
    pub(super) fn paste_slice(
        &mut self,
        mut slice: crate::clipboard::Slice,
        rich: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        let Some(layout) = self.flow_layout() else {
            return Ok(());
        };
        let Some((start, end, a, b, _)) = sel.ordered(&layout) else {
            return Ok(());
        };
        slice.unwrap_for_note_paste();
        if slice.content.is_empty() {
            return Ok(());
        }
        if matches!(layout.blocks[a].body.kind, block_flow::FlowKind::Code) {
            return self.replace_selection(sel, &slice.plain(), w, cx);
        }
        let now = self.now_ms(cx) as u64;
        let from = start.offset();
        let id = start.block_id.clone();
        let snapshot = self
            .snapshot
            .clone()
            .ok_or_else(|| DocError::InvalidState("missing document".into()))?;
        let node = snapshot
            .block(&id)
            .ok_or_else(|| DocError::BlockNotFound(id.clone()))?;
        let title = matches!(node.content, BlockContent::Page { .. });
        let key = if title { "prop:title" } else { "prop:text" };
        let empty = a == b
            && text_content(node)
                .is_some_and(|s| s.encode_utf16().count() as u64 == end.offset() - from);
        let first = &slice.content[0];
        let use_existing =
            first.editable() && (!rich || !empty || first.flavour == node.flavour || title);
        let discard_empty = !use_existing && empty && !title;
        if !slice.content.last().is_some_and(|b| b.editable()) {
            slice
                .content
                .push(crate::clipboard::SliceBlock::plain_block(
                    "",
                    slice.content.len(),
                ));
        }
        let dest = if title {
            node.children
                .iter()
                .find(|n| n.is_page_visible_note())
                .map(|n| (n.id.clone(), 0))
        } else {
            parent_of(&snapshot, &id)
                .map(|(p, slot)| (p.id.clone(), slot + usize::from(!discard_empty)))
        };
        if dest.is_none()
            && (slice.content.len() > 1 || !use_existing || !slice.content[0].children.is_empty())
        {
            return Err(DocError::InvalidState("no parent for pasted blocks".into()));
        }
        let blocks = RangeBlocks::between(&snapshot, &id, &end.block_id)
            .ok_or_else(|| DocError::InvalidState("selection outside page content".into()))?;
        let keep_suffix =
            slice.content.len() == 1 && use_existing && slice.content[0].children.is_empty();
        if title {
            let current = text_content(node).unwrap_or("");
            let from_byte = crate::rich_text::TextBiIndex::new(current).utf16_to_utf8_clamped(from);
            let suffix = if !keep_suffix {
                ""
            } else if a == b {
                let end_byte =
                    crate::rich_text::TextBiIndex::new(current).utf16_to_utf8_clamped(end.offset());
                &current[end_byte..]
            } else {
                let end_text = snapshot
                    .block(&end.block_id)
                    .and_then(text_content)
                    .unwrap_or("");
                let end_byte = crate::rich_text::TextBiIndex::new(end_text)
                    .utf16_to_utf8_clamped(end.offset());
                &end_text[end_byte..]
            };
            let inserted = if use_existing {
                slice.content[0].plain()
            } else {
                String::new()
            };
            let next_title = format!("{}{}{}", &current[..from_byte], inserted, suffix);
            if !self.preflight_title_change(&next_title) {
                return Ok(());
            }
        }
        let count = slice
            .content
            .iter()
            .map(|b| b.walk().count())
            .sum::<usize>();
        let fresh: Vec<_> = (0..count).map(|_| self.fresh_block_id()).collect();
        let mut next = fresh.iter();
        let mut roots = Vec::new();
        let mut entries = Vec::new();
        for (i, block) in slice.content.iter().enumerate() {
            let mut pending = vec![(block, None)];
            while let Some((block, parent)) = pending.pop() {
                let new_id = next
                    .next()
                    .ok_or_else(|| DocError::InvalidState("missing paste id".into()))?;
                let existing = i == 0 && parent.is_none() && use_existing;
                let target = if existing { id.clone() } else { new_id.clone() };
                if parent.is_none() {
                    roots.push(target.clone());
                }
                entries.push((block, target.clone(), parent, existing, block.properties()?));
                pending.extend(
                    block
                        .children
                        .iter()
                        .rev()
                        .map(|b| (b, Some(target.clone()))),
                );
            }
        }
        let last_id = roots
            .last()
            .cloned()
            .ok_or_else(|| DocError::InvalidState("empty paste".into()))?;
        let last = slice
            .content
            .last()
            .ok_or_else(|| DocError::InvalidState("empty paste".into()))?;
        let last_pos =
            last.plain().encode_utf16().count() as u64 + if last_id == id { from } else { 0 };
        let page = self.page_mut()?;
        let before = sel.snapshot(page)?;
        let commit = page.structural_edit(now, |page| {
            if a != b {
                page.delete_cross_block_range(
                    (&id, from),
                    (&end.block_id, end.offset()),
                    &blocks.intermediate,
                    &blocks.survivors,
                    now,
                )?;
            } else if end.offset() > from {
                page.remove_text(&id, key, from, end.offset() - from, now)?;
            }
            let suffix = if keep_suffix {
                Vec::new()
            } else {
                let (original, _) = page.read_editable_text(&id)?;
                let (_, suffix) = split_delta(&original.delta, from)?;
                let suffix_len = original.plain.encode_utf16().count() as u64 - from;
                if suffix_len > 0 {
                    page.remove_text(&id, key, from, suffix_len, now)?;
                }
                suffix
            };
            let mut index = dest.as_ref().map_or(0, |(_, i)| *i);
            for (block, target, parent, existing, props) in entries {
                if existing {
                    if rich && empty && !title {
                        for (k, v) in props.iter().filter(|(k, _)| k != "prop:text") {
                            page.set_block_prop(&target, k, v.clone(), now)?;
                        }
                    }
                    let mut delta = vec![TextDeltaOp::Retain {
                        retain: from,
                        format: None,
                    }];
                    delta.extend(block.delta());
                    page.apply_text_delta(&target, key, &delta, now)?;
                } else {
                    let root_parent = dest.as_ref().map(|(id, _)| id.as_str());
                    let p = parent.as_deref().or(root_parent).ok_or_else(|| {
                        DocError::InvalidState("missing paste destination".into())
                    })?;
                    let at = parent.is_none().then_some(index as u64);
                    if at.is_some() {
                        index += 1;
                    }
                    let flavour = if block.flavour == "affine:page" {
                        "affine:paragraph"
                    } else {
                        &block.flavour
                    };
                    page.add_raw_block(
                        &target,
                        flavour,
                        block
                            .version
                            .and_then(|n| i32::try_from(n).ok())
                            .unwrap_or(1),
                        props,
                        Some(p),
                        at,
                        now,
                    )?;
                }
            }
            if discard_empty {
                page.remove_lifting_children(&id, now)?;
            }
            if !suffix.is_empty() {
                let mut delta = vec![TextDeltaOp::Retain {
                    retain: last_pos,
                    format: None,
                }];
                delta.extend(suffix);
                page.apply_text_delta(
                    &last_id,
                    if last_id == id { key } else { "prop:text" },
                    &delta,
                    now,
                )?;
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(last_id, last_pos)));
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(())
    }
}
