//! Document selection and text input shared by desktop, browser and headless views.

mod clipboard_ops;
mod commands;
mod composition;
mod input_handler;

use input_handler::{list, markdown_block, paragraph};

use std::ops::Range;

use blocksuite_playground_doc::{
    DocError, DocResult,
    read::BlockNode,
    session::{PageDocSession, SelectionSnapshot},
    wire::{DocMessage, RoomBinaryFrame},
};
use ui::{MouseButton, MouseDownEvent, MouseMoveEvent, Pixels, Point};
use unicode_segmentation::UnicodeSegmentation;
use y_octo::{Any, SessionCommit};

use super::*;
use crate::block_flow::{FlowBlock, FlowRect};
use crate::rich_text::{CaretPosition, TextBiIndex, WrapAffinity};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocPoint {
    pub block_id: String,
    pub caret: CaretPosition,
}

impl DocPoint {
    pub fn new(block_id: impl Into<String>, offset: u64) -> Self {
        Self {
            block_id: block_id.into(),
            caret: CaretPosition {
                utf16_offset: offset,
                affinity: WrapAffinity::Downstream,
            },
        }
    }
    pub(crate) fn offset(&self) -> u64 {
        self.caret.utf16_offset
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentSelection {
    pub anchor: DocPoint,
    pub focus: DocPoint,
}

impl DocumentSelection {
    pub(crate) fn caret(point: DocPoint) -> Self {
        Self {
            anchor: point.clone(),
            focus: point,
        }
    }
    pub(crate) fn empty(&self) -> bool {
        self.anchor.block_id == self.focus.block_id && self.anchor.offset() == self.focus.offset()
    }
    pub(crate) fn snapshot(&self, page: &PageDocSession) -> DocResult<SelectionSnapshot> {
        page.capture_selection_snapshot(
            &self.anchor.block_id,
            self.anchor.offset(),
            &self.focus.block_id,
            self.focus.offset(),
        )
    }
    pub(crate) fn ordered<'a>(
        &'a self,
        layout: &FlowLayout,
    ) -> Option<(&'a DocPoint, &'a DocPoint, usize, usize, bool)> {
        let index = |p: &DocPoint| layout.blocks.iter().position(|b| b.block_id == p.block_id);
        let a = index(&self.anchor)?;
        let f = index(&self.focus)?;
        Some(if (a, self.anchor.offset()) <= (f, self.focus.offset()) {
            (&self.anchor, &self.focus, a, f, false)
        } else {
            (&self.focus, &self.anchor, f, a, true)
        })
    }
}

#[derive(Default)]
pub(super) struct RangeBlocks {
    intermediate: Vec<String>,
    survivors: Vec<String>,
}

/// Root content blocks of Page-mode notes, in document order.
pub(super) fn page_content_roots(root: &BlockNode) -> impl DoubleEndedIterator<Item = &BlockNode> {
    root.children
        .iter()
        .filter(|note| note.is_page_visible_note())
        .flat_map(|note| &note.children)
}

impl RangeBlocks {
    pub(super) fn between(snapshot: &PageSnapshot, start: &str, end: &str) -> Option<Self> {
        if start == end {
            return Some(Self::default());
        }
        let root = snapshot.root.as_ref()?;
        let mut pending: Vec<_> = page_content_roots(root)
            .rev()
            .map(|node| (node, false))
            .collect();
        let mut intermediate = Vec::new();
        let mut after_start = root.id == start;
        // Each pending subtree records whether its parent belongs to the deletion.
        // At the endpoint the stack holds its children, then later siblings up the ancestor chain.
        while let Some((node, _)) = pending.pop() {
            pending.extend(node.children.iter().rev().map(|child| (child, after_start)));
            if after_start {
                if node.id == end {
                    let survivors = pending
                        .into_iter()
                        .rev()
                        .filter(|(_, parent_removed)| *parent_removed)
                        .map(|(child, _)| child.id.clone())
                        .collect();
                    return Some(Self {
                        intermediate,
                        survivors,
                    });
                }
                intermediate.push(node.id.clone());
            } else if node.id == start {
                after_start = true;
            }
        }
        None
    }
}

pub(super) struct Preedit {
    replacement: SelectionSnapshot,
    backward: bool,
    pub(super) text: String,
    pub(super) selected: Range<usize>,
}

#[derive(Default)]
pub struct EditorSession {
    pub selection: Option<DocumentSelection>,
    pub goal_x: Option<f32>,
    pub(super) preedit: Option<Preedit>,
    pub(super) relative_selection: Option<SelectionSnapshot>,
    pub(super) pending_marks: BTreeMap<String, Option<Any>>,
    pub(crate) last_typing: Option<u64>,
    pub(crate) reveal: bool,
    /// The primary button is held and extends the selection.
    pub(crate) dragging: bool,
    /// The `/` that opened the slash menu from typed text: its block and a relative
    /// position naming that character.
    pub(crate) slash_trigger: Option<(String, SelectionSnapshot)>,
    pub(super) next_id: u64,
}

impl EditorSession {
    /// Whether an input method composition is in progress.
    pub(crate) fn composing(&self) -> bool {
        self.preedit.is_some()
    }

    pub(crate) fn clear_preedit_state(&mut self) {
        self.preedit = None;
    }

    pub(crate) fn preedit_nonce(&self) -> u64 {
        self.preedit.as_ref().map_or(0u64, |pre| {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            pre.text.hash(&mut hasher);
            pre.selected.hash(&mut hasher);
            pre.backward.hash(&mut hasher);
            hasher.finish().max(1)
        })
    }
}

pub(super) fn word_range(text: &str, offset: u64) -> Range<u64> {
    let index = TextBiIndex::new(text);
    let byte = index.utf16_to_utf8_clamped(offset);
    text.split_word_bound_indices()
        .find(|(i, s)| i + s.len() > byte)
        .or_else(|| text.split_word_bound_indices().next_back())
        .map(|(i, s)| index.utf8_to_utf16(i)..index.utf8_to_utf16(i + s.len()))
        .unwrap_or(0..0)
}

pub(super) fn text_content(node: &BlockNode) -> Option<&str> {
    match &node.content {
        BlockContent::Page { title } => Some(&title.plain),
        BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => Some(&text.plain),
        BlockContent::Code { text, .. } => Some(text),
        _ => None,
    }
}

pub(super) fn node_mut<'a>(node: &'a mut BlockNode, id: &str) -> Option<&'a mut BlockNode> {
    if node.id == id {
        return Some(node);
    }
    node.children
        .iter_mut()
        .find_map(|child| node_mut(child, id))
}

pub(super) fn parent_of<'a>(
    snapshot: &'a PageSnapshot,
    id: &str,
) -> Option<(&'a BlockNode, usize)> {
    snapshot.root.as_ref()?.walk().find_map(|node| {
        node.children
            .iter()
            .position(|c| c.id == id)
            .map(|pos| (node, pos))
    })
}

pub(super) type Commit = SessionCommit<SelectionSnapshot>;

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
        let mut sel = DocumentSelection::caret(p.clone());
        if e.click_count >= 2 {
            let s = self.block_text(&p.block_id).unwrap_or("");
            let range = if e.click_count == 2 {
                word_range(s, p.offset())
            } else {
                0..s.encode_utf16().count() as u64
            };
            sel.anchor = DocPoint::new(&p.block_id, range.start);
            sel.focus = DocPoint::new(&p.block_id, range.end);
        } else if e.modifiers.shift
            && let Some(old) = &self.editor.selection
        {
            sel.anchor = old.anchor.clone();
        }
        self.change_selection(sel, w, cx);
    }
    pub(crate) fn editor_mouse_move(
        &mut self,
        e: &MouseMoveEvent,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if e.pressed_button != Some(MouseButton::Left) {
            self.editor.dragging = false;
            return;
        }
        if self.editor.dragging
            && let Some(focus) = self.input_point(e.position, w)
            && let Some(sel) = &self.editor.selection
        {
            self.change_selection(
                DocumentSelection {
                    anchor: sel.anchor.clone(),
                    focus,
                },
                w,
                cx,
            );
        }
    }

    pub fn document_selection(&self) -> Option<&DocumentSelection> {
        self.editor.selection.as_ref()
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

    pub(crate) fn change_selection(
        &mut self,
        sel: DocumentSelection,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.editor.preedit.take().is_some() {
            self.dirty_text = None;
            self.doc_rev += 1;
        }
        self.editor.selection = Some(sel);
        self.editor.pending_marks.clear();
        self.editor.last_typing = None;
        self.editor.goal_x = None;
        self.editor.reveal = true;
        if let Ok(page) = self.page_mut() {
            let _ = page.stop_capturing();
        }
        self.announce_selection(cx);
        self.sync_slash_trigger(cx);
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

    pub(crate) fn did_edit(
        &mut self,
        commit: Option<Commit>,
        dirty: Option<&str>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let (Some(commit), Some(room), Some(id)) = (commit, &self.room, &self.page_id) {
            room.link.send_binary(RoomBinaryFrame::Doc {
                doc_id: id.clone(),
                message: DocMessage::Update(commit.update),
            });
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
        if let Some(page_id) = self.page_id.clone()
            && let Some(root) = self.snapshot.as_ref().and_then(|s| s.root.as_ref())
            && (dirty.is_none() || dirty == Some(root.id.as_str()))
            && let BlockContent::Page { title } = &root.content
            && previous_title
                .as_ref()
                .is_some_and(|previous| previous != &title.plain)
            && let Ok(Some(commit)) = self.state.workspace.set_page_title(&page_id, &title.plain)
        {
            self.page_titles.insert(page_id, title.plain.clone());
            self.env_rev += 1;
            if let Some(room) = &self.room {
                room.link.send_binary(RoomBinaryFrame::Doc {
                    doc_id: self.state.workspace.room().into(),
                    message: DocMessage::Update(commit.update),
                });
            }
        }
        self.editor.reveal = true;
        self.editor.goal_x = None;
        self.announce_selection(cx);
        self.sync_slash_trigger(cx);
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
    }

    pub(super) fn resolve_relative_selection(&mut self, cx: &Context<Self>) {
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
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<()> {
        let sel = self.editor.selection.clone()?;
        let layout = self.flow_layout()?;
        let mut p = sel.focus.clone();
        let block = layout.block(&p.block_id)?;
        let text = self.block_text(&p.block_id)?;
        let index = TextBiIndex::new(text);
        let backward = matches!(key, "left" | "up" | "home");
        let step = |b: &FlowBlock, back: bool| -> Option<&FlowBlock> {
            let i = layout
                .blocks
                .iter()
                .position(|other| other.block_id == b.block_id)?;
            if back {
                layout.blocks[..i].iter().rev().find(|b| b.editable())
            } else {
                layout.blocks[i + 1..].iter().find(|b| b.editable())
            }
        };
        let mut goal = None;
        if !shift && !sel.empty() && matches!(key, "left" | "right") {
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
            let dest = if y < top || y >= top + field.layout.height() {
                let next = step(block, backward)?;
                let nt = next.body.text.as_ref()?;
                y = next.y
                    + nt.y
                    + if backward {
                        nt.layout.height() - nt.layout.line_height() * 0.5
                    } else {
                        nt.layout.line_height() * 0.5
                    };
                next
            } else {
                block
            };
            p = DocPoint {
                block_id: dest.block_id.clone(),
                caret: dest.hit_text(x, y)?,
            };
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
                let at = if backward {
                    index.prev_grapheme_utf16(p.offset())
                } else {
                    p.offset()
                };
                let range = word_range(text, at);
                if backward { range.start } else { range.end }
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
}
