//! PlaygroundView glue for `blocksuite_editor::editor_session`.

mod block_selection;
mod clipboard_ops;
mod commands;
mod composition;
mod edit_ops;
mod input_handler;
mod markdown;
mod page_ops;
mod paste_markdown;

pub use blocksuite_editor::editor_session::*;
#[cfg(test)]
pub(crate) use commands::{
    HistoryRejectFault, set_history_reject_fault, take_history_reject_fallback_hits,
};

use input_handler::{list, paragraph};

use blocksuite_playground_doc::{
    DocError, DocResult,
    session::PageDocSession,
    wire::{DocMessage, RoomBinaryFrame},
};
use ui::{MouseButton, MouseDownEvent, MouseMoveEvent, Pixels, Point};

use super::*;
use crate::block_flow::{FlowBlock, FlowRect};
use crate::rich_text::TextBiIndex;

impl PlaygroundView {
    pub(crate) fn page(&self) -> Option<&PageDocSession> {
        self.state.workspace.page(self.page_id.as_deref()?)
    }
    pub(crate) fn page_mut(&mut self) -> DocResult<&mut PageDocSession> {
        self.page_id
            .as_deref()
            .and_then(|id| self.state.workspace.page_mut(id))
            .ok_or_else(|| DocError::InvalidState("no active page".into()))
    }
    pub(crate) fn block_text(&self, id: &str) -> Option<&str> {
        text_content(self.page_snapshot()?.block(id)?)
    }
    pub(crate) fn active_content_scope(&self) -> ContentScope<'_> {
        if self.mode == PlaygroundMode::Edgeless {
            if let Some((block_id, _)) = self.edgeless.authoring.editing_spatial_block() {
                return ContentScope::SpatialBlock(block_id);
            }
            if let Some((block_id, _)) = self.edgeless_readonly_selection_target.as_ref() {
                return ContentScope::SpatialBlock(block_id.as_str());
            }
        }
        ContentScope::Page
    }
    pub(super) fn input_point(&self, pos: Point<Pixels>, window: &Window) -> Option<DocPoint> {
        let geometry = page_geometry(f32::from(window.viewport_size().width));
        let layout = self.flow_layout()?;
        let (x, y) = (
            f32::from(pos.x) - geometry.column_x,
            f32::from(pos.y) - TOPBAR_HEIGHT + self.scroll_y,
        );
        let (block_id, mut caret) = layout.hit_document(x, y)?;
        // Lines of a sideways-scrolled code block sit left of where they were laid out.
        let scroll = self.overlays.code_scroll_x(&block_id);
        if scroll > 0.0
            && let Some(scrolled) = layout
                .block(&block_id)
                .and_then(|block| block.hit_text(x + scroll, y))
        {
            caret = scrolled;
        }
        caret.utf16_offset = caret
            .utf16_offset
            .min(self.block_text(&block_id)?.encode_utf16().count() as u64);
        Some(DocPoint { block_id, caret })
    }

    pub(crate) fn editor_mouse_down(
        &mut self,
        e: &MouseDownEvent,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(p) = self.input_point(e.position, w) else {
            return;
        };
        self.editor_focus.focus(w, cx);
        w.request_virtual_keyboard();
        self.editor.dragging = true;
        self.editor.drag_moved = false;
        let mut sel = DocumentSelection::caret(p.clone());
        if e.click_count >= 2 {
            let (range, drag_mode) = {
                let s = self.block_text(&p.block_id).unwrap_or("");
                if e.click_count == 2 {
                    let r = word_range(s, p.offset());
                    let mode = DragSelectionMode::Word {
                        block_id: p.block_id.clone(),
                        start: r.start,
                        end: r.end,
                    };
                    (r, mode)
                } else {
                    let len = s.encode_utf16().count() as u64;
                    (
                        0..len,
                        DragSelectionMode::Paragraph {
                            block_id: p.block_id.clone(),
                        },
                    )
                }
            };
            self.editor.drag_mode = drag_mode;
            sel.anchor = DocPoint::new(&p.block_id, range.start);
            sel.focus = DocPoint::new(&p.block_id, range.end);
        } else {
            self.editor.drag_mode = DragSelectionMode::Character;
            if e.modifiers.shift
                && let Some(old) = &self.editor.selection
            {
                let same_domain = self.flow_layout().is_none_or(|layout| {
                    let is_title = |id: &str| {
                        layout
                            .block(id)
                            .is_some_and(|b| matches!(b.body.kind, block_flow::FlowKind::Title))
                    };
                    is_title(&old.anchor.block_id) == is_title(&p.block_id)
                });
                if same_domain {
                    sel.anchor = old.anchor.clone();
                }
            }
        }
        self.change_selection(sel, w, cx);
        if e.click_count >= 2 && self.editor.selection.as_ref().is_some_and(|s| !s.empty()) {
            self.bump_selection_menu_request_seq();
        }
    }
    pub(crate) fn editor_mouse_move(
        &mut self,
        e: &MouseMoveEvent,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if e.pressed_button != Some(MouseButton::Left) {
            self.editor.dragging = false;
            self.editor.drag_moved = false;
            self.editor.drag_mode = DragSelectionMode::Character;
            return;
        }
        if self.editor.dragging
            && let Some(mut focus) = self.input_point(e.position, w)
            && let Some(sel) = &self.editor.selection
        {
            self.editor.drag_moved = true;
            let layout = self.flow_layout();
            if let Some(layout) = layout.as_ref() {
                let anchor_title = layout
                    .block(&sel.anchor.block_id)
                    .is_some_and(|b| matches!(b.body.kind, block_flow::FlowKind::Title));
                let focus_title = layout
                    .block(&focus.block_id)
                    .is_some_and(|b| matches!(b.body.kind, block_flow::FlowKind::Title));
                if anchor_title && !focus_title {
                    let len = self
                        .block_text(&sel.anchor.block_id)
                        .map_or(0, |s| s.encode_utf16().count() as u64);
                    focus = DocPoint::new(&sel.anchor.block_id, len);
                } else if !anchor_title && focus_title {
                    if let Some(first_body) = layout.blocks.iter().find(|b| {
                        b.editable() && !matches!(b.body.kind, block_flow::FlowKind::Title)
                    }) {
                        focus = DocPoint::new(&first_body.block_id, 0);
                    } else {
                        return;
                    }
                }
            }
            let next_sel = self.extend_drag_selection(sel, focus, layout.as_deref());
            self.change_selection(next_sel, w, cx);
        }
    }

    pub fn document_selection(&self) -> Option<&DocumentSelection> {
        self.editor.selection.as_ref()
    }
    pub fn block_selection(&self) -> &[String] {
        &self.editor.block_selection
    }
    pub fn goal_x(&self) -> Option<f32> {
        self.editor.goal_x
    }
    /// Focus a document range supplied by another page control.
    pub fn select_document_range(
        &mut self,
        selection: DocumentSelection,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.editor_focus.focus(w, cx);
        self.change_selection(selection, w, cx);
    }

    /// Commit any active body IME composition in place at its replacement range (`unmark`
    /// semantics) so clicking away or moving focus never drops composed text.
    pub(crate) fn commit_active_preedit(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        if let Some(pre) = self.editor.preedit.as_ref() {
            let text = pre.text.clone();
            if let Some(rep) = self.composition_selection() {
                self.editor.preedit = None;
                let _ = self.replace_selection(rep, &text, w, cx);
            } else {
                self.editor.preedit = None;
                self.dirty_text = None;
                self.doc_rev += 1;
            }
        }
    }

    pub(crate) fn change_selection(
        &mut self,
        sel: DocumentSelection,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.snapshot.as_ref().is_some_and(|snap| {
            !self.is_block_addressable_in_current_mode(snap, &sel.anchor.block_id)
                || !self.is_block_addressable_in_current_mode(snap, &sel.focus.block_id)
        }) {
            self.clear_body_selection(w, cx);
            return;
        }
        self.commit_active_preedit(w, cx);
        self.editor.selection = Some(sel);
        self.editor.block_selection.clear();
        self.editor.block_selection_anchor = None;
        self.editor.block_selection_focus = None;
        self.keep_keyboard_on_block_selection = false;
        self.block_selection_return_caret = None;
        self.editor.pending_marks.clear();
        self.editor.last_typing = None;
        self.editor.goal_x = None;
        self.editor.reveal = true;
        if let Ok(page) = self.page_mut() {
            let _ = page.stop_capturing();
        }
        self.announce_selection(cx);
        self.sync_slash_trigger(cx);
        self.sync_linked_doc_trigger(cx);
        self.reset_caret_blink(cx);
        w.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
    }

    /// Clear body document selection (committing any in-flight body IME composition in place)
    /// when focus moves to an inline cell/label editor, overlay text field, or non-editable block.
    pub(crate) fn clear_body_selection(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        self.commit_active_preedit(w, cx);
        self.editor.selection = None;
        self.editor.block_selection.clear();
        self.editor.block_selection_anchor = None;
        self.editor.block_selection_focus = None;
        self.keep_keyboard_on_block_selection = false;
        self.block_selection_return_caret = None;
        self.editor.pending_marks.clear();
        self.editor.last_typing = None;
        self.editor.goal_x = None;
        self.editor.dragging = false;
        self.editor.slash_trigger = None;
        self.announce_selection(cx);
        self.sync_slash_trigger(cx);
        self.sync_linked_doc_trigger(cx);
        self.reset_caret_blink(cx);
        w.notify_text_input_changed(&self.editor_focus);
        w.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
    }
    pub(crate) fn announce_selection(&mut self, cx: &Context<Self>) {
        self.editor.relative_selection = self
            .editor
            .selection
            .as_ref()
            .and_then(|s| s.snapshot(self.page()?).ok());
        let Some(page_id) = self.page_id.clone() else {
            return;
        };
        let key = format!("{page_id}:native");
        let Some(sel) = &self.editor.selection else {
            // Nothing is selected any more: peers stop showing this caret, and keep the
            // name and color it had.
            let local = self.state.awareness.local_client_id();
            if let Some(mut payload) = self.state.awareness.get_payload(local)
                && payload
                    .selection_v2
                    .get(&key)
                    .is_some_and(|selection| !selection.is_empty())
            {
                payload.set_selection(key, Vec::new());
                self.publish_awareness(&payload, cx);
            }
            return;
        };
        let state = if sel.empty() {
            TextSelectionState::caret(&sel.focus.block_id, sel.focus.offset())
        } else {
            let Some(layout) = self.flow_layout() else {
                return;
            };
            let Some((start, end, _, _, reverse)) = sel.ordered(&layout) else {
                return;
            };
            let single = start.block_id == end.block_id;
            let limit = if single {
                end.offset()
            } else {
                self.block_text(&start.block_id)
                    .map_or(0, |s| s.encode_utf16().count() as u64)
            };
            let from = TextRangePoint {
                block_id: start.block_id.clone(),
                index: start.offset(),
                length: limit.saturating_sub(start.offset()),
            };
            let to = (!single).then(|| TextRangePoint {
                block_id: end.block_id.clone(),
                index: 0,
                length: end.offset(),
            });
            TextSelectionState::range(from, to, reverse)
        };
        let mut payload = self
            .state
            .awareness
            .get_payload(self.state.awareness.local_client_id())
            .unwrap_or_else(|| {
                AwarenessPayload::new(
                    room_client::LOCAL_AWARENESS_NAME,
                    room_client::LOCAL_AWARENESS_COLOR,
                )
            });
        if payload.set_text_selection(key, state).is_ok() {
            self.publish_awareness(&payload, cx);
        }
    }

    /// Make `payload` the local awareness state and send it to the room.
    pub(super) fn publish_awareness(&mut self, payload: &AwarenessPayload, cx: &Context<Self>) {
        let now = self.now_ms(cx) as u64;
        if let Ok(bytes) = self.state.awareness.set_local_payload(payload, now)
            && let Some(room) = &self.room
        {
            room.link.send_binary(RoomBinaryFrame::Awareness(bytes));
        }
    }

    /// Pre-flight check before mutating `PageDocSession` on any forward edit that changes
    /// the root page's `prop:title`.
    ///
    /// Returns `true` when the edit may proceed (unchanged title or accepted by the
    /// authoritative `WorkspaceDocDirectory`), or `false` when rejected — callers MUST
    /// return early without mutating `PageDocSession`, guaranteeing zero CRDT clock gap,
    /// zero undo-stack pollution, and zero room broadcast.
    pub(super) fn preflight_title_change(&mut self, next_title: &str) -> bool {
        let Some(page_id) = self.page_id.clone() else {
            return true;
        };
        let current_title = self
            .snapshot
            .as_ref()
            .and_then(|s| s.root.as_ref())
            .and_then(text_content)
            .unwrap_or("");
        if next_title == current_title {
            return true;
        }
        match self
            .doc_directory_mut()
            .rename_doc_title(&crate::directory::EditorDocId::new(&page_id), next_title)
        {
            Ok(summary) => {
                self.preflight_renamed_title = Some((page_id, summary.title));
                true
            }
            Err(_) => false,
        }
    }

    /// Single outbound choke point for page V1 updates. When a deferred diff checkpoint is
    /// recorded for `doc_id`, encodes a gapless diff from that state vector and only consumes
    /// the checkpoint after the diff succeeds and is handed to the room.
    pub(crate) fn send_page_update(&mut self, doc_id: &str, update: Vec<u8>) {
        if let Some(sv) = self.pending_sync_since_sv.get(doc_id) {
            let Some(room) = &self.room else {
                return;
            };
            let Ok(diff) = self
                .state
                .workspace
                .page(doc_id)
                .ok_or_else(|| DocError::InvalidState("missing page".into()))
                .and_then(|page| page.encode_diff_v1(sv))
            else {
                return;
            };
            if !diff.is_empty() {
                room.link.send_binary(RoomBinaryFrame::Doc {
                    doc_id: doc_id.to_string(),
                    message: DocMessage::Update(diff),
                });
            }
            self.pending_sync_since_sv.remove(doc_id);
        } else if let Some(room) = &self.room
            && !update.is_empty()
        {
            room.link.send_binary(RoomBinaryFrame::Doc {
                doc_id: doc_id.to_string(),
                message: DocMessage::Update(update),
            });
        }
    }

    pub(crate) fn did_edit(
        &mut self,
        commit: Option<Commit>,
        dirty: Option<&str>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let (Some(commit), Some(id)) = (commit, self.page_id.clone()) {
            self.send_page_update(&id, commit.update);
        }
        let previous_title = self
            .snapshot
            .as_ref()
            .and_then(|s| s.root.as_ref())
            .and_then(|r| {
                (dirty.is_none() || dirty == Some(r.id.as_str()))
                    .then(|| text_content(r).map(str::to_owned))
                    .flatten()
            });
        if !dirty.is_some_and(|id| self.refresh_text_block(id)) {
            self.refresh_document();
        }
        let current_title = self
            .snapshot
            .as_ref()
            .and_then(|s| s.root.as_ref())
            .filter(|root| dirty.is_none() || dirty == Some(root.id.as_str()))
            .and_then(|root| match &root.content {
                BlockContent::Page { title } => Some(title.plain.clone()),
                _ => None,
            });
        if let Some(page_id) = self.page_id.clone()
            && let Some(current_title) = current_title
            && let Some(previous) = previous_title.as_ref()
            && previous != &current_title
        {
            let accepted_title = match self
                .preflight_renamed_title
                .take()
                .filter(|(id, _)| id == &page_id)
            {
                Some((_, accepted)) => Some(accepted),
                None => self
                    .doc_directory_mut()
                    .rename_doc_title(
                        &crate::directory::EditorDocId::new(&page_id),
                        &current_title,
                    )
                    .ok()
                    .map(|summary| summary.title),
            };
            if let Some(accepted_title) = accepted_title
                && let Ok(Some(root_commit)) = self
                    .state
                    .workspace
                    .set_page_title(&page_id, &accepted_title)
            {
                self.page_titles.insert(page_id, accepted_title);
                self.env_rev += 1;
                if let Some(room) = &self.room {
                    room.link.send_binary(RoomBinaryFrame::Doc {
                        doc_id: self.state.workspace.room().into(),
                        message: DocMessage::Update(root_commit.update),
                    });
                }
            }
        } else {
            self.preflight_renamed_title = None;
        }
        self.editor.reveal = true;
        self.editor.goal_x = None;
        self.announce_selection(cx);
        self.sync_slash_trigger(cx);
        self.sync_linked_doc_trigger(cx);
        self.reset_caret_blink(cx);
        w.notify_text_input_changed(&self.editor_focus);
        cx.notify();
    }

    pub(super) fn refresh_text_block(&mut self, id: &str) -> bool {
        let Some(page) = self.page() else {
            return false;
        };
        let Ok((rich, value)) = page.read_editable_text(id) else {
            return false;
        };
        let Some(root) = self
            .snapshot
            .as_mut()
            .and_then(|s| Rc::make_mut(s).root.as_mut())
        else {
            return false;
        };
        let Some(node) = node_mut(root, id) else {
            return false;
        };
        let key = match &mut node.content {
            BlockContent::Page { title } => {
                *title = rich;
                "prop:title"
            }
            BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => {
                *text = rich;
                "prop:text"
            }
            BlockContent::Code { text, .. } => {
                *text = rich.plain;
                "prop:text"
            }
            _ => return false,
        };
        if let Some(changed) = &mut self.dirty_text {
            changed.insert(if key == "prop:title" {
                "\0title".to_owned()
            } else {
                id.to_owned()
            });
        }
        node.props.insert(key.into(), value);
        self.doc_rev += 1;
        true
    }

    /// After a remote update: move the selection, and the typed slash menu with its `/`,
    /// to where their text went.
    pub(super) fn resolve_remote_selection(&mut self, cx: &Context<Self>) {
        self.resolve_relative_selection(cx);
        self.sync_slash_trigger(cx);
        self.sync_linked_doc_trigger(cx);
        self.sync_equation_target();
    }

    pub(super) fn resolve_relative_selection(&mut self, cx: &Context<Self>) {
        if !self.editor.block_selection.is_empty() {
            self.editor.relative_selection = None;
            if let Some(snapshot) = self.snapshot.as_ref() {
                self.editor
                    .block_selection
                    .retain(|id| snapshot.block(id).is_some());
            }
            return;
        }
        if self.editor.relative_selection.is_none() {
            return;
        }
        let restored = self
            .editor
            .relative_selection
            .as_ref()
            .and_then(|s| self.page()?.resolve_selection_snapshot(s).ok().flatten());
        if let (Some(r), Some(sel)) = (restored, self.editor.selection.as_mut()) {
            if sel.anchor.offset() == r.anchor.1 && sel.focus.offset() == r.focus.1 {
                return;
            }
            sel.anchor.caret.utf16_offset = r.anchor.1;
            sel.focus.caret.utf16_offset = r.focus.1;
            self.announce_selection(cx);
        } else {
            // The selected text is gone: so is the selection, here and for the peers.
            self.editor = EditorSession::default();
            self.announce_selection(cx);
        }
    }

    pub(super) fn geometry(&self, p: &DocPoint) -> Option<FlowRect> {
        self.flow_layout()?.block(&p.block_id)?.caret_rect(p.caret)
    }

    pub(super) fn navigate(
        &mut self,
        key: &str,
        shift: bool,
        word: bool,
        line_edge: bool,
        doc_edge: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<()> {
        let sel = self.editor.selection.clone()?;
        let layout = self.flow_layout()?;
        let mut p = sel.focus.clone();
        let block = layout.block(&p.block_id)?;
        let is_title = matches!(block.body.kind, block_flow::FlowKind::Title);
        let text = self.block_text(&p.block_id)?;
        let index = TextBiIndex::new(text);
        let backward = matches!(key, "left" | "up" | "home");
        let step = |b: &FlowBlock, back: bool| -> Option<&FlowBlock> {
            let i = layout
                .blocks
                .iter()
                .position(|other| other.block_id == b.block_id)?;
            let same_domain = |other: &FlowBlock| {
                !shift || (matches!(other.body.kind, block_flow::FlowKind::Title) == is_title)
            };
            if back {
                layout.blocks[..i]
                    .iter()
                    .rev()
                    .find(|b| b.editable() && same_domain(b))
            } else {
                layout.blocks[i + 1..]
                    .iter()
                    .find(|b| b.editable() && same_domain(b))
            }
        };
        let mut goal = None;
        if doc_edge {
            let target =
                if is_title {
                    block
                } else if backward {
                    layout.blocks.iter().find(|b| {
                        b.editable() && !matches!(b.body.kind, block_flow::FlowKind::Title)
                    })?
                } else {
                    layout.blocks.iter().rev().find(|b| {
                        b.editable() && !matches!(b.body.kind, block_flow::FlowKind::Title)
                    })?
                };
            let target_offset = if backward {
                0
            } else {
                self.block_text(&target.block_id)?.encode_utf16().count() as u64
            };
            p = DocPoint::new(&target.block_id, target_offset);
        } else if !shift && !sel.empty() && matches!(key, "left" | "right") {
            let (start, end, ..) = sel.ordered(&layout)?;
            p = if backward { start } else { end }.clone();
        } else if matches!(key, "up" | "down") {
            let rect = block.caret_rect(p.caret)?;
            let x = self.editor.goal_x.unwrap_or(rect.x);
            goal = Some(x);
            let mut y = rect.y
                + if backward {
                    -rect.h * 0.5
                } else {
                    rect.h * 1.5
                };
            let field = block.body.text.as_ref()?;
            let top = block.y + field.y;
            if y < top || y >= top + field.layout.height() {
                if let Some(next) = step(block, backward) {
                    let nt = next.body.text.as_ref()?;
                    y = next.y
                        + nt.y
                        + if backward {
                            nt.layout.height() - nt.layout.line_height() * 0.5
                        } else {
                            nt.layout.line_height() * 0.5
                        };
                    p = DocPoint {
                        block_id: next.block_id.clone(),
                        caret: next.hit_text(x, y)?,
                    };
                } else if !backward {
                    // Last line of the last editable block: move/extend to block end.
                    p = DocPoint::new(&block.block_id, index.utf16_len());
                } else {
                    // First line of the first block in domain: move/extend to block start.
                    p = DocPoint::new(&block.block_id, 0);
                }
            } else {
                p = DocPoint {
                    block_id: block.block_id.clone(),
                    caret: block.hit_text(x, y)?,
                };
            }
        } else if line_edge || matches!(key, "home" | "end") {
            let rect = block.caret_rect(p.caret)?;
            p.caret = block.hit_text(
                if backward { -1.0 } else { layout.width + 1. },
                rect.y + rect.h * 0.5,
            )?;
        } else if (backward && p.offset() == 0) || (!backward && p.offset() == index.utf16_len()) {
            let dest = step(block, backward)?;
            p = DocPoint::new(
                &dest.block_id,
                if backward {
                    self.block_text(&dest.block_id)?.encode_utf16().count() as u64
                } else {
                    0
                },
            );
        } else {
            let offset = if word {
                if backward {
                    edit_ops::prev_word_start_utf16(text, p.offset())
                } else {
                    edit_ops::next_word_end_utf16(text, p.offset())
                }
            } else if backward {
                index.prev_grapheme_utf16(p.offset())
            } else {
                index.next_grapheme_utf16(p.offset())
            };
            p = DocPoint::new(&p.block_id, offset);
        }
        self.change_selection(
            if shift {
                DocumentSelection {
                    anchor: sel.anchor,
                    focus: p,
                }
            } else {
                DocumentSelection::caret(p)
            },
            w,
            cx,
        );
        self.editor.goal_x = goal;
        Some(())
    }

    pub(crate) fn indent_code_block(
        &mut self,
        sel: DocumentSelection,
        outdent: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> blocksuite_playground_doc::DocResult {
        let id = sel.focus.block_id.clone();
        let Some(text) = self.block_text(&id).map(str::to_string) else {
            return Ok(());
        };
        let backward = sel.focus.offset() < sel.anchor.offset();
        let sel_start = sel.anchor.offset().min(sel.focus.offset());
        let sel_end = sel.anchor.offset().max(sel.focus.offset());
        let (splices, new_start, new_end) =
            blocksuite_editor::editor_session::code_block_indent_plan(
                &text, sel_start, sel_end, outdent,
            );
        if splices.is_empty() {
            return Ok(());
        }
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let before = sel.snapshot(page)?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            for (offset, del_len, insert) in &splices {
                if *del_len > 0 {
                    page.remove_text(&id, "prop:text", *offset, *del_len, now)?;
                }
                if !insert.is_empty() {
                    page.insert_text(&id, "prop:text", *offset, insert, now)?;
                }
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(before)?;
        }
        let next_sel = if backward {
            DocumentSelection {
                anchor: DocPoint::new(&id, new_end),
                focus: DocPoint::new(&id, new_start),
            }
        } else {
            DocumentSelection {
                anchor: DocPoint::new(&id, new_start),
                focus: DocPoint::new(&id, new_end),
            }
        };
        self.editor.selection = Some(next_sel);
        self.editor.last_typing = None;
        self.did_edit(commit, Some(&id), w, cx);
        Ok(())
    }
}
