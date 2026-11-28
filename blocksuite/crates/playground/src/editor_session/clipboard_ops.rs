use blocksuite_playground_doc::{DocError, DocResult, read::BlockNode, session::split_delta};
use y_octo::TextDeltaOp;

use super::*;

enum PasteTarget {
    TextSelection,
    BlockSelection {
        first_parent_id: String,
        first_slot: usize,
        first_id: String,
        first_editable: bool,
        first_len: u64,
        extra_deletes: Vec<(String, String)>,
    },
}

impl PlaygroundView {
    pub(crate) fn clipboard_slice(&self) -> Option<crate::clipboard::Slice> {
        let sel = self.editor.selection.as_ref()?;
        if sel.empty() {
            return None;
        }
        let layout = self.flow_layout()?;
        let (start, end, _, _, _) = sel.ordered(&layout)?;
        let snapshot = self.page_snapshot()?;
        let page = self.page()?;
        let scope = self.active_content_scope();
        let range =
            RangeBlocks::between_in_scope(snapshot, &scope, &start.block_id, &end.block_id)?;
        let mut ids: BTreeSet<_> = range.intermediate.iter().map(String::as_str).collect();
        ids.extend([start.block_id.as_str(), end.block_id.as_str()]);
        let root = snapshot.root.as_ref()?;
        let scope_roots = scope.content_roots(root);
        let mut selected = BTreeMap::new();
        let content =
            std::iter::once(root).chain(scope_roots.iter().copied().flat_map(BlockNode::walk));
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
        for child in scope_roots {
            crate::clipboard::SliceBlock::keep_selected(child, &mut selected, &mut blocks);
        }
        Some(crate::clipboard::Slice::new(
            self.state.workspace.room(),
            self.page_id.as_deref()?,
            blocks,
        ))
    }

    pub(super) fn current_flow_layout(&mut self, w: &Window) -> Option<Rc<FlowLayout>> {
        if self.mode == crate::PlaygroundMode::Page {
            let width = page_geometry(f32::from(w.viewport_size().width)).column_width;
            self.ensure_layout(width, w)
        } else {
            self.flow_layout()
        }
    }

    pub(crate) fn paste_into_block_selection(
        &mut self,
        item: &ui::ClipboardItem,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some((slice, rich)) = crate::clipboard::read_slice(item) else {
            return Ok(());
        };
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(());
        };
        let Some(root) = snapshot.root.as_ref() else {
            return Ok(());
        };
        let selected_set: BTreeSet<&str> = self
            .editor
            .block_selection
            .iter()
            .map(String::as_str)
            .collect();
        let scope = self.active_content_scope();
        let doc_nodes: Vec<&BlockNode> = scope
            .content_roots(root)
            .into_iter()
            .flat_map(BlockNode::walk)
            .collect();
        let Some(&first_node) = doc_nodes.iter().find(|n| {
            !matches!(
                n.content,
                BlockContent::Page { .. } | BlockContent::Note { .. }
            ) && selected_set.contains(n.id.as_str())
        }) else {
            return Ok(());
        };
        let Some((first_parent, first_slot)) = parent_of(&snapshot, &first_node.id) else {
            return Ok(());
        };
        let first_id = first_node.id.clone();
        let first_editable = text_content(first_node).is_some();
        let first_len = text_content(first_node).map_or(0, |s| s.encode_utf16().count() as u64);
        // Walk the full document tree (including blocks hidden inside collapsed headings or
        // toggles) and collect every other selected block not already covered by a subtree-deleted
        // ancestor (`!first_editable` `first_id` or any non-`first_id` selected ancestor).
        let mut extra_deletes: Vec<(String, String)> = Vec::new();
        for n in doc_nodes {
            if n.id == first_id
                || matches!(
                    n.content,
                    BlockContent::Page { .. } | BlockContent::Note { .. }
                )
                || !selected_set.contains(n.id.as_str())
            {
                continue;
            }
            let mut cur = n.id.as_str();
            let mut covered_by_deleted_ancestor = false;
            while let Some((parent, _)) = parent_of(&snapshot, cur) {
                if (parent.id == first_id && !first_editable)
                    || (parent.id != first_id && selected_set.contains(parent.id.as_str()))
                {
                    covered_by_deleted_ancestor = true;
                    break;
                }
                cur = &parent.id;
            }
            if !covered_by_deleted_ancestor && let Some((parent, _)) = parent_of(&snapshot, &n.id) {
                extra_deletes.push((parent.id.clone(), n.id.clone()));
            }
        }
        self.paste_with_target(
            slice,
            rich,
            PasteTarget::BlockSelection {
                first_parent_id: first_parent.id.clone(),
                first_slot,
                first_id,
                first_editable,
                first_len,
                extra_deletes,
            },
            w,
            cx,
        )
    }

    pub(crate) fn paste_slice(
        &mut self,
        slice: crate::clipboard::Slice,
        rich: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        self.paste_with_target(slice, rich, PasteTarget::TextSelection, w, cx)
    }

    fn paste_with_target(
        &mut self,
        mut slice: crate::clipboard::Slice,
        mut rich: bool,
        target: PasteTarget,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let (text_sel, start, end, single_block, first_editable, block_dest, extra_deletes) =
            match target {
                PasteTarget::TextSelection => {
                    let Some(layout) = self.current_flow_layout(w) else {
                        return Ok(());
                    };
                    let Some(sel) = self.editor.selection.clone() else {
                        return Ok(());
                    };
                    let (start, end, single_block) = {
                        let Some((s, e, a, b, _)) = sel.ordered(&layout) else {
                            return Ok(());
                        };
                        (s.clone(), e.clone(), a == b)
                    };
                    (Some(sel), start, end, single_block, true, None, Vec::new())
                }
                PasteTarget::BlockSelection {
                    first_parent_id,
                    first_slot,
                    first_id,
                    first_editable,
                    first_len,
                    extra_deletes,
                } => (
                    None,
                    DocPoint::new(&first_id, 0),
                    DocPoint::new(&first_id, first_len),
                    true,
                    first_editable,
                    Some((first_parent_id, first_slot)),
                    extra_deletes,
                ),
            };
        slice.unwrap_for_note_paste();
        if slice.content.is_empty() {
            return Ok(());
        }
        let is_block_paste = block_dest.is_some();
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
        if first_editable && matches!(node.content, BlockContent::Code { .. }) {
            if extra_deletes.is_empty()
                && let Some(sel) = text_sel
            {
                return self.replace_selection(sel, &slice.plain(), w, cx);
            }
            let plain = slice.plain();
            slice = crate::clipboard::Slice::new(
                self.state.workspace.room(),
                self.page_id.as_deref().unwrap_or(""),
                vec![crate::clipboard::SliceBlock::plain_block(&plain, 0)],
            );
            rich = false;
        }
        let title = matches!(node.content, BlockContent::Page { .. });
        let key = if title { "prop:title" } else { "prop:text" };
        let empty = !first_editable
            || (single_block
                && text_content(node)
                    .is_some_and(|s| s.encode_utf16().count() as u64 == end.offset() - from));
        let first = &slice.content[0];
        let use_existing = first_editable
            && first.editable()
            && (!rich || !empty || first.flavour == node.flavour || title);
        let discard_empty = !use_existing && empty && !title;
        if !slice.content.last().is_some_and(|b| b.editable()) {
            slice
                .content
                .push(crate::clipboard::SliceBlock::plain_block(
                    "",
                    slice.content.len(),
                ));
        }
        let dest = if let Some((ref parent_id, slot)) = block_dest {
            Some((parent_id.clone(), slot + usize::from(!discard_empty)))
        } else if title {
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
        let scope = self.active_content_scope();
        let blocks = RangeBlocks::between_in_scope(&snapshot, &scope, &id, &end.block_id)
            .ok_or_else(|| DocError::InvalidState("selection outside page content".into()))?;
        let keep_suffix = !first_editable
            || (slice.content.len() == 1 && use_existing && slice.content[0].children.is_empty());
        if title {
            let current = text_content(node).unwrap_or("");
            let from_byte = crate::rich_text::TextBiIndex::new(current).utf16_to_utf8_clamped(from);
            let suffix = if !keep_suffix {
                ""
            } else if single_block {
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
        let before = match text_sel {
            Some(ref sel) => Some(sel.snapshot(page)?),
            None => None,
        };
        if is_block_paste {
            page.stop_capturing()?;
        }
        let commit = page.structural_edit(now, |page| {
            for (parent_id, child_id) in extra_deletes.iter().rev() {
                page.delete_block_subtree(parent_id, child_id, now)?;
            }
            if !single_block {
                page.delete_cross_block_range(
                    (&id, from),
                    (&end.block_id, end.offset()),
                    &blocks.intermediate,
                    &blocks.survivors,
                    now,
                )?;
            } else if first_editable && end.offset() > from {
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
                if !first_editable && let Some((ref first_parent_id, _)) = block_dest {
                    page.delete_block_subtree(first_parent_id, &id, now)?;
                } else {
                    page.remove_lifting_children(&id, now)?;
                }
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
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        if is_block_paste {
            self.editor.block_selection.clear();
        }
        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(last_id, last_pos)));
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(())
    }
}
