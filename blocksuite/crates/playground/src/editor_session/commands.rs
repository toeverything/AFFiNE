use blocksuite_playground_doc::{
    DocError, DocResult,
    schema::{BlockSpec, ParagraphType},
    session::split_delta,
};
use ui::{EntityInputHandler, KeyDownEvent};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use super::*;
use crate::overlays::LinkBar;
use crate::rich_text::TextBiIndex;

#[cfg(test)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum HistoryRejectFault {
    None,
    NoopRevert,
    ErrRevert,
    FailMerge,
}

#[cfg(test)]
std::thread_local! {
    static HISTORY_REJECT_FAULT: std::cell::Cell<HistoryRejectFault> =
        const { std::cell::Cell::new(HistoryRejectFault::None) };
    static HISTORY_REJECT_FALLBACK_HITS: std::cell::Cell<usize> =
        const { std::cell::Cell::new(0) };
}

#[cfg(test)]
pub(crate) fn set_history_reject_fault(fault: HistoryRejectFault) {
    HISTORY_REJECT_FAULT.with(|slot| slot.set(fault));
}

#[cfg(test)]
pub(crate) fn take_history_reject_fallback_hits() -> usize {
    HISTORY_REJECT_FALLBACK_HITS.with(|slot| slot.replace(0))
}

impl PlaygroundView {
    pub(crate) fn fresh_block_id(&mut self) -> String {
        loop {
            self.editor.next_id += 1;
            let id = format!(
                "native-{:x}-{:x}",
                self.state.awareness.local_client_id(),
                self.editor.next_id
            );
            if self.page_snapshot().is_none_or(|s| s.block(&id).is_none()) {
                return id;
            }
        }
    }
    pub(super) fn history(
        &mut self,
        redo: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let sel = self.editor.selection.clone();
        let root_id = self
            .snapshot
            .as_ref()
            .and_then(|s| s.root.as_ref())
            .map(|r| r.id.clone());
        let previous_title = self
            .snapshot
            .as_ref()
            .and_then(|s| s.root.as_ref())
            .and_then(|r| text_content(r).map(str::to_owned));
        let page = self.page_mut()?;
        let pre_sv = page.encode_state_vector_v1()?;
        let prev_title_target_and_delta = root_id.as_deref().and_then(|rid| {
            let target = y_octo::TypeTarget::Path(
                y_octo::TypePath::root("blocks").key(rid).key("prop:title"),
            );
            page.inner()
                .read_text_delta(&target)
                .ok()
                .map(|delta| (target, delta))
        });
        let opposite = sel.as_ref().and_then(|s| s.snapshot(page).ok());
        page.stop_capturing()?;
        let commit = if redo { page.redo()? } else { page.undo()? };
        let Some(commit) = commit else { return Ok(()) };
        let restored_title = page
            .read_page_snapshot()
            .ok()
            .and_then(|s| s.root)
            .and_then(|r| text_content(&r).map(str::to_owned));
        if let Some(page_id) = self.page_id.clone()
            && let Some(prev) = previous_title.as_deref()
            && let Some(next) = restored_title.as_deref()
            && prev != next
        {
            match self
                .doc_directory_mut()
                .rename_doc_title(&crate::directory::EditorDocId::new(&page_id), next)
            {
                Ok(summary) => {
                    self.preflight_renamed_title = Some((page_id, summary.title));
                }
                Err(_) => {
                    #[cfg(test)]
                    let injected_fault = HISTORY_REJECT_FAULT.with(|slot| slot.get());
                    let revert_res: DocResult<Option<Commit>> = {
                        #[cfg(test)]
                        match injected_fault {
                            HistoryRejectFault::NoopRevert => Ok(None),
                            HistoryRejectFault::ErrRevert => {
                                Err(DocError::InvalidState("injected revert error".into()))
                            }
                            _ => self
                                .page_mut()
                                .and_then(|page| if redo { page.undo() } else { page.redo() }),
                        }
                        #[cfg(not(test))]
                        {
                            self.page_mut()
                                .and_then(|page| if redo { page.undo() } else { page.redo() })
                        }
                    };
                    match revert_res {
                        Ok(Some(rev)) => {
                            let meta_ok = match commit.selection_meta {
                                Some(meta) => {
                                    let restored_stack = if redo {
                                        y_octo::UndoStack::Redo
                                    } else {
                                        y_octo::UndoStack::Undo
                                    };
                                    self.page_mut()
                                        .and_then(|page| {
                                            Ok(page.inner().set_stack_selection_meta(
                                                page.undo_stack_id(),
                                                restored_stack,
                                                meta,
                                            )?)
                                        })
                                        .is_ok()
                                }
                                None => true,
                            };
                            #[cfg(test)]
                            let force_merge_err = injected_fault == HistoryRejectFault::FailMerge;
                            #[cfg(not(test))]
                            let force_merge_err = false;
                            let merged_bytes = if !meta_ok || force_merge_err {
                                None
                            } else {
                                y_octo::merge_updates_v1([
                                    commit.update.as_slice(),
                                    rev.update.as_slice(),
                                ])
                                .and_then(|u| u.encode_v1())
                                .ok()
                            };
                            if let Some(merged) = merged_bytes {
                                self.send_page_update(&page_id, merged);
                            } else {
                                #[cfg(test)]
                                HISTORY_REJECT_FALLBACK_HITS.with(|slot| slot.set(slot.get() + 1));
                                self.pending_sync_since_sv.entry(page_id).or_insert(pre_sv);
                            }
                        }
                        Ok(None) | Err(_) => {
                            #[cfg(test)]
                            HISTORY_REJECT_FALLBACK_HITS.with(|slot| slot.set(slot.get() + 1));
                            if let Some((title_target, prev_delta)) = prev_title_target_and_delta
                                && let Ok(page) = self.page_mut()
                            {
                                let inner = page.inner_mut();
                                if inner.begin_tx(y_octo::SessionTxOrigin::Untracked).is_ok() {
                                    if let Ok(cur_len) = inner.read_text_len(&title_target)
                                        && cur_len > 0
                                    {
                                        let _ = inner.text_remove(&title_target, 0, cur_len);
                                    }
                                    if !prev_delta.is_empty() {
                                        let _ = inner.text_apply_delta(&title_target, &prev_delta);
                                    }
                                    let _ = inner.commit_tx();
                                }
                            }
                            self.pending_sync_since_sv.entry(page_id).or_insert(pre_sv);
                        }
                    }
                    self.editor.selection = sel;
                    self.editor.last_typing = None;
                    self.editor.preedit = None;
                    self.refresh_document();
                    self.announce_selection(cx);
                    cx.notify();
                    return Ok(());
                }
            }
        }
        let page = self.page_mut()?;
        if let Some(other) = opposite {
            let stack = if redo {
                y_octo::UndoStack::Undo
            } else {
                y_octo::UndoStack::Redo
            };
            page.inner()
                .set_stack_selection_meta(page.undo_stack_id(), stack, other)?;
        }
        let restored = commit
            .selection_meta
            .as_ref()
            .map(|s| page.resolve_selection_snapshot(s))
            .transpose()?
            .flatten();
        if let Some(s) = restored {
            self.editor.selection = Some(DocumentSelection {
                anchor: DocPoint::new(s.anchor.0, s.anchor.1),
                focus: DocPoint::new(s.focus.0, s.focus.1),
            });
        }
        self.editor.last_typing = None;
        self.editor.preedit = None;
        self.did_edit(Some(commit), None, w, cx);
        Ok(())
    }
    pub(super) fn insertion_marks(&self, point: &DocPoint) -> DocResult<TextAttributes> {
        let offset = point.offset();
        if offset == 0 {
            return Ok(TextAttributes::new());
        }
        let (rich, _) = self
            .page()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?
            .read_editable_text(&point.block_id)?;
        let mut cursor = 0;
        for op in rich.delta {
            if let TextDeltaOp::Insert { insert, format } = op {
                cursor += match &insert {
                    TextInsert::Text(s) => s.encode_utf16().count(),
                    TextInsert::Embed(v) => v.len(),
                } as u64;
                if offset <= cursor {
                    if matches!(insert, TextInsert::Embed(_))
                        || format.as_ref().is_some_and(|attrs| {
                            attrs.contains_key("reference") || attrs.contains_key("latex")
                        })
                    {
                        break;
                    }
                    let mut marks = format.unwrap_or_default();
                    if offset == cursor {
                        marks.remove("code");
                        marks.remove("link");
                    }
                    return Ok(marks);
                }
            }
        }
        Ok(TextAttributes::new())
    }

    pub(crate) fn format_mark(
        &mut self,
        key: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        if sel.empty() {
            let inherited = self.insertion_marks(&sel.focus)?;
            let on = self.editor.pending_marks.get(key).map_or_else(
                || inherited.get(key) == Some(&Any::True),
                |v| *v == Some(Any::True),
            );
            self.editor
                .pending_marks
                .insert(key.into(), (!on).then_some(Any::True));
            return Ok(());
        }
        let Some(layout) = self.flow_layout() else {
            return Ok(());
        };
        let Some((start, end, a, b, _)) = sel.ordered(&layout) else {
            return Ok(());
        };
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let mut ranges = Vec::new();
        let mut marked = true;
        for block in layout.blocks[a..=b].iter().filter(|b| b.editable()) {
            let id = &block.block_id;
            let from = if id == &start.block_id {
                start.offset()
            } else {
                0
            };
            let to = if id == &end.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            if to <= from {
                continue;
            }
            let (rich, _) = page.read_editable_text(id)?;
            let (_, tail) = split_delta(&rich.delta, from)?;
            let (part, _) = split_delta(&tail, to - from)?;
            marked &= part.iter().all(|op|matches!(op,TextDeltaOp::Insert{format:Some(f),..} if f.get(key)==Some(&Any::True)));
            let prop = if matches!(block.body.kind, block_flow::FlowKind::Title) {
                "prop:title"
            } else {
                "prop:text"
            };
            ranges.push((id, prop, from, to - from));
        }
        let snap = sel.snapshot(page)?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            for (id, prop, from, n) in ranges {
                page.format_text(
                    id,
                    prop,
                    from,
                    n,
                    TextAttributes::from([(
                        key.to_owned(),
                        if marked { Any::Null } else { Any::True },
                    )]),
                    now,
                )?;
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(snap)?;
        }
        self.editor.last_typing = None;
        self.did_edit(commit, (a == b).then_some(&start.block_id), w, cx);
        Ok(())
    }
    pub(super) fn edit_key(
        &mut self,
        key: &str,
        shift: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        let id = sel.focus.block_id.clone();
        let offset = sel.focus.offset();
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(());
        };
        let Some(node) = snapshot.block(&id) else {
            return Ok(());
        };
        let text = text_content(node).unwrap_or("");
        let n = text.encode_utf16().count() as u64;
        let code = matches!(node.content, BlockContent::Code { .. });
        let backwards = key == "backspace";
        let now = self.now_ms(cx) as u64;
        if key == "enter" && !sel.empty() && !shift && !code {
            return self.paste_slice(crate::clipboard::Slice::from_plain("\n"), false, w, cx);
        }
        if key == "tab" && code {
            return self.replace_selection(sel, "  ", w, cx);
        }
        if key == "enter" && !shift && self.apply_markdown(&sel, "\n", w, cx)? {
            return Ok(());
        }
        if key == "enter" && (shift || code) {
            return self.replace_selection(sel, "\n", w, cx);
        }
        if matches!(key, "backspace" | "delete")
            && (!sel.empty() || (backwards && offset > 0) || (!backwards && offset < n))
        {
            let range = if !sel.empty() {
                sel.clone()
            } else {
                let idx = TextBiIndex::new(text);
                let next = if backwards {
                    idx.prev_grapheme_utf16(offset)
                } else {
                    idx.next_grapheme_utf16(offset)
                };
                DocumentSelection {
                    anchor: sel.focus.clone(),
                    focus: DocPoint::new(&id, next),
                }
            };
            let before = sel.snapshot(self.page_mut()?)?;
            let rev_before = self.doc_rev;
            self.editor.last_typing = None;
            self.replace_selection(range, "", w, cx)?;
            if self.doc_rev != rev_before {
                self.page_mut()?.set_undo_selection_snapshot(before)?;
            }
            self.editor.last_typing = None;
            return Ok(());
        }
        let before = sel.snapshot(self.page_mut()?)?;
        let mut focus = sel.focus.clone();
        let nested_empty_list_enter = key == "enter"
            && text.is_empty()
            && matches!(node.content, BlockContent::List { .. })
            && parent_of(&snapshot, &id)
                .is_some_and(|(parent, _)| matches!(parent.content, BlockContent::List { .. }));
        let demote = !nested_empty_list_enter
            && (matches!(
                node.content,
                BlockContent::List { .. }
                    | BlockContent::Paragraph {
                        kind: ParagraphType::Quote,
                        ..
                    }
            ) && ((text.is_empty() && key == "enter") || (backwards && offset == 0))
                || (backwards
                    && offset == 0
                    && matches!(node.content,BlockContent::Paragraph {kind,..} if kind!=ParagraphType::Text)));
        let last_nested = backwards
            && offset == 0
            && !code
            && parent_of(&snapshot, &id).is_some_and(|(parent, pos)| {
                matches!(
                    parent.content,
                    BlockContent::List { .. } | BlockContent::Paragraph { .. }
                ) && pos + 1 == parent.children.len()
            });
        let commit = if last_nested || nested_empty_list_enter {
            self.page_mut()?.dedent_block(&id, now)?
        } else if demote {
            let fresh = self.fresh_block_id();
            if node.flavour != "affine:paragraph" {
                focus = DocPoint::new(&fresh, offset);
            }
            self.page_mut()?
                .convert_block_flavour(&id, &fresh, paragraph(), now)?
        } else if key == "tab" {
            let Some((parent, pos)) = parent_of(&snapshot, &id) else {
                return Ok(());
            };
            let dest = if shift {
                if !matches!(
                    parent.content,
                    BlockContent::List { .. } | BlockContent::Paragraph { .. }
                ) {
                    return Ok(());
                }
                parent_of(&snapshot, &parent.id).map(|(p, i)| (&p.id, i + 1))
            } else {
                pos.checked_sub(1)
                    .and_then(|i| parent.children.get(i))
                    .filter(|b| {
                        matches!(
                            b.content,
                            BlockContent::List { .. } | BlockContent::Paragraph { .. }
                        )
                    })
                    .map(|b| (&b.id, b.children.len()))
            };
            let Some((dest, index)) = dest else {
                return Ok(());
            };
            if shift {
                self.page_mut()?.dedent_block(&id, now)?
            } else {
                self.page_mut()?
                    .reparent_block(&id, &parent.id, dest, index as u64, now)?
            }
        } else if key == "enter" {
            if matches!(node.content, BlockContent::Page { .. }) {
                let split_byte = TextBiIndex::new(text).utf16_to_utf8_clamped(offset);
                if !self.preflight_title_change(&text[..split_byte]) {
                    return Ok(());
                }
            }
            let spec = match &node.content {
                BlockContent::Paragraph { kind, .. }
                    if offset < n || *kind == ParagraphType::Quote =>
                {
                    BlockSpec::Paragraph {
                        paragraph_type: *kind,
                        text: String::new(),
                    }
                }
                BlockContent::List { kind, order, .. } => list(
                    *kind,
                    false,
                    order
                        .and_then(|i| i.checked_add(1))
                        .and_then(|i| i32::try_from(i).ok()),
                ),
                _ => paragraph(),
            };
            let new_id = self.fresh_block_id();
            focus = DocPoint::new(&new_id, 0);
            self.page_mut()?
                .split_text_block(&id, &new_id, offset, spec, now)?
        } else {
            let Some(layout) = self.flow_layout() else {
                return Ok(());
            };
            let Some(i) = layout.blocks.iter().position(|b| b.block_id == id) else {
                return Ok(());
            };
            let adjacent = if backwards {
                layout.blocks[..i].last()
            } else {
                layout.blocks.get(i + 1)
            };
            let Some(adjacent) = adjacent else {
                return Ok(());
            };
            let nesting = parent_of(&snapshot, &id).filter(|(p, _)| {
                matches!(
                    p.content,
                    BlockContent::Paragraph { .. } | BlockContent::List { .. }
                )
            });
            let mergeable = !code
                && adjacent.editable()
                && !matches!(adjacent.body.kind, block_flow::FlowKind::Code);
            if backwards && !code && !mergeable && nesting.is_some() {
                self.page_mut()?.dedent_block(&id, now)?
            } else if !mergeable {
                if !backwards
                    || !text.is_empty()
                    || code
                    || !parent_of(&snapshot, &id).is_some_and(|(p, _)| p.children.len() > 1)
                {
                    return Ok(());
                }
                let Some(next) = layout.blocks[..i]
                    .iter()
                    .rev()
                    .chain(&layout.blocks[i + 1..])
                    .find(|b| b.editable())
                else {
                    return Ok(());
                };
                focus = DocPoint::new(
                    &next.block_id,
                    if next.y < layout.blocks[i].y {
                        next.body.plain.encode_utf16().count() as u64
                    } else {
                        0
                    },
                );
                self.page_mut()?.remove_lifting_children(&id, now)?
            } else {
                let (target, source) = if backwards {
                    (&adjacent.block_id, &id)
                } else {
                    (&id, &adjacent.block_id)
                };
                if snapshot.root.as_ref().is_some_and(|r| r.id == *target) {
                    let target_text = snapshot.block(target).and_then(text_content).unwrap_or("");
                    let source_text = snapshot.block(source).and_then(text_content).unwrap_or("");
                    let next_title = format!("{target_text}{source_text}");
                    if !self.preflight_title_change(&next_title) {
                        return Ok(());
                    }
                }
                let Some((parent, _)) = parent_of(&snapshot, source) else {
                    return Ok(());
                };
                let (join, commit) = self
                    .page_mut()?
                    .merge_with_previous_text_block(target, source, &parent.id, now)?;
                focus = DocPoint::new(target, join);
                commit
            }
        };
        if commit.is_some() {
            self.page_mut()?.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(focus));
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(())
    }

    pub(crate) fn hit_test_flow_layout(layout: &FlowLayout, x: f32, y: f32) -> Option<DocPoint> {
        let block = layout
            .blocks
            .iter()
            .filter(|b| b.editable())
            .min_by(|a, b| {
                let ar = a.rect();
                let br = b.rect();
                let da = if y < ar.y {
                    ar.y - y
                } else if y > ar.bottom() {
                    y - ar.bottom()
                } else {
                    0.0
                };
                let db = if y < br.y {
                    br.y - y
                } else if y > br.bottom() {
                    y - br.bottom()
                } else {
                    0.0
                };
                da.total_cmp(&db)
            })?;
        Some(DocPoint {
            block_id: block.block_id.clone(),
            caret: block.hit_text(x, y)?,
        })
    }

    pub(crate) fn editor_key_down(
        &mut self,
        e: &KeyDownEvent,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.mode == crate::PlaygroundMode::Edgeless {
            if self.edgeless_key_down(e, w, cx) {
                w.prevent_default();
                cx.stop_propagation();
                return;
            }
            if self.edgeless.authoring.editing_spatial_block().is_none() {
                return;
            }
        }
        if self.editor.preedit.is_some() || e.prefer_character_input {
            return;
        }
        // An open link field or slash menu takes its keys before the document does.
        if self.overlay_key_down(e, w, cx) {
            w.prevent_default();
            cx.stop_propagation();
            return;
        }
        // A composition in the link or equation field keeps its keys from the document as well.
        if self
            .overlays
            .active_text_field()
            .is_some_and(LinkBar::composing)
        {
            return;
        }
        // Active whole-block selection intercepts navigation/edit/clipboard keys first.
        match self.handle_block_selection_key(e, w, cx) {
            Ok(true) => {
                w.prevent_default();
                cx.stop_propagation();
                return;
            }
            Ok(false) => {}
            Err(err) => {
                eprintln!("block selection command: {err}");
                w.prevent_default();
                cx.stop_propagation();
                return;
            }
        }
        let m = e.keystroke.modifiers;
        let cmd = m.secondary(cx);
        let key = e.keystroke.key.as_str();
        if cmd
            && let Some(command) = block_selection::conversion_shortcut(key, m.alt, m.shift)
            && let Some(block_id) = self
                .editor
                .selection
                .as_ref()
                .map(|sel| sel.focus.block_id.clone())
        {
            if let Err(err) = self.run_slash_command(&block_id, command, false, w, cx) {
                eprintln!("conversion shortcut {key}: {err}");
            }
            w.prevent_default();
            cx.stop_propagation();
            return;
        }
        let result = match key {
            "escape" => {
                if let Some(sel) = self.editor.selection.as_ref()
                    && let Some(layout) = self.flow_layout()
                    && layout
                        .block(&sel.focus.block_id)
                        .is_some_and(|b| !matches!(b.body.kind, block_flow::FlowKind::Title))
                {
                    let block_id = sel.focus.block_id.clone();
                    self.editor.selection = None;
                    self.editor.block_selection = vec![block_id];
                    self.editor.pending_marks.clear();
                    self.announce_selection(cx);
                    w.notify_text_selection_changed(&self.editor_focus);
                    cx.notify();
                }
                Ok(())
            }
            "left" | "right" | "up" | "down" | "home" | "end" => {
                self.navigate(
                    key,
                    m.shift,
                    m.alt,
                    m.platform && matches!(key, "left" | "right"),
                    w,
                    cx,
                );
                Ok(())
            }
            "enter" | "backspace" | "delete" | "tab" => self.edit_key(key, m.shift, w, cx),
            "a" if cmd => {
                let width = page_geometry(f32::from(w.viewport_size().width)).column_width;
                if let Some(sel) = self.editor.selection.clone()
                    && let Some(layout) = self.ensure_layout(width, w)
                    && let Some(block) = layout.block(&sel.focus.block_id)
                {
                    let full_len = block.body.plain.encode_utf16().count() as u64;
                    let anchor = DocPoint::new(&block.block_id, 0);
                    let focus = DocPoint::new(&block.block_id, full_len);
                    let already_full_block = full_len == 0
                        || (sel.anchor == anchor && sel.focus == focus)
                        || (sel.focus == anchor && sel.anchor == focus);
                    if already_full_block {
                        self.select_all_blocks(w, cx);
                    } else {
                        self.change_selection(DocumentSelection { anchor, focus }, w, cx);
                    }
                }
                Ok(())
            }
            "k" if cmd && !m.alt && !m.shift => {
                self.open_link_bar_shortcut(w, cx);
                Ok(())
            }
            "c" | "x" if cmd => {
                if let Some(slice) = self.clipboard_slice() {
                    crate::clipboard::write_slice(&slice, cx);
                    if key == "x" {
                        self.edit_key("backspace", false, w, cx)
                    } else {
                        Ok(())
                    }
                } else {
                    Ok(())
                }
            }
            "v" if cmd => {
                if let Some(item) = cx.read_from_clipboard() {
                    self.paste(item, w, cx);
                } else {
                    return;
                }
                Ok(())
            }
            "z" if cmd => self.history(m.shift, w, cx),
            "y" if cmd => self.history(true, w, cx),
            "b" | "i" | "u" | "e" | "s" if cmd && (key != "s" || m.shift) => self.format_mark(
                match key {
                    "b" => "bold",
                    "i" => "italic",
                    "u" => "underline",
                    "e" => "code",
                    _ => "strike",
                },
                w,
                cx,
            ),
            _ => return,
        };
        if let Err(e) = result {
            eprintln!("document command {key}: {e}");
        }
        w.prevent_default();
        cx.stop_propagation();
    }
}
