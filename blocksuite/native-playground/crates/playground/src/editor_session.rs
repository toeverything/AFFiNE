//! Document selection and text input shared by desktop, browser and headless views.
use std::ops::Range;

use blocksuite_playground_doc::{
    DocError, DocResult,
    read::{BlockNode, RichText},
    session::{PageDocSession, SelectionSnapshot, split_delta},
    wire::{DocMessage, RoomBinaryFrame},
};
use ui::{
    EntityInputHandler, KeyDownEvent, MouseButton, MouseDownEvent, MouseMoveEvent, Pixels, Point,
    UTF16Selection,
};
use unicode_segmentation::UnicodeSegmentation;
use y_octo::{SessionCommit, TextDeltaOp, TextInsert};

use super::*;
use crate::block_flow::{FlowBlock, FlowRect, ScrolledCode};
use crate::overlays::LinkBar;
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
struct RangeBlocks {
    intermediate: Vec<String>,
    survivors: Vec<String>,
}

/// Root content blocks of Page-mode notes, in document order.
fn page_content_roots(root: &BlockNode) -> impl DoubleEndedIterator<Item = &BlockNode> {
    root.children
        .iter()
        .filter(|note| note.is_page_visible_note())
        .flat_map(|note| &note.children)
}

impl RangeBlocks {
    fn between(snapshot: &PageSnapshot, start: &str, end: &str) -> Option<Self> {
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

struct Preedit {
    replacement: SelectionSnapshot,
    backward: bool,
    text: String,
    selected: Range<usize>,
}

#[derive(Default)]
pub struct EditorSession {
    pub selection: Option<DocumentSelection>,
    pub goal_x: Option<f32>,
    preedit: Option<Preedit>,
    relative_selection: Option<SelectionSnapshot>,
    pending_marks: BTreeMap<String, Option<Any>>,
    pub(crate) last_typing: Option<u64>,
    pub(crate) reveal: bool,
    /// The primary button is held and extends the selection.
    pub(crate) dragging: bool,
    /// The `/` that opened the slash menu from typed text: its block and a relative
    /// position naming that character.
    pub(crate) slash_trigger: Option<(String, SelectionSnapshot)>,
    next_id: u64,
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

fn word_range(text: &str, offset: u64) -> Range<u64> {
    let index = TextBiIndex::new(text);
    let byte = index.utf16_to_utf8_clamped(offset);
    text.split_word_bound_indices()
        .find(|(i, s)| i + s.len() > byte)
        .or_else(|| text.split_word_bound_indices().next_back())
        .map(|(i, s)| index.utf8_to_utf16(i)..index.utf8_to_utf16(i + s.len()))
        .unwrap_or(0..0)
}

fn text_content(node: &BlockNode) -> Option<&str> {
    match &node.content {
        BlockContent::Page { title } => Some(&title.plain),
        BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => Some(&text.plain),
        BlockContent::Code { text, .. } => Some(text),
        _ => None,
    }
}

fn node_mut<'a>(node: &'a mut BlockNode, id: &str) -> Option<&'a mut BlockNode> {
    if node.id == id {
        return Some(node);
    }
    node.children
        .iter_mut()
        .find_map(|child| node_mut(child, id))
}

fn parent_of<'a>(snapshot: &'a PageSnapshot, id: &str) -> Option<(&'a BlockNode, usize)> {
    snapshot.root.as_ref()?.walk().find_map(|node| {
        node.children
            .iter()
            .position(|c| c.id == id)
            .map(|pos| (node, pos))
    })
}

type Commit = SessionCommit<SelectionSnapshot>;

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
    fn input_point(&self, pos: Point<Pixels>, window: &Window) -> Option<DocPoint> {
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
    fn publish_awareness(&mut self, payload: &AwarenessPayload, cx: &Context<Self>) {
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

    fn refresh_text_block(&mut self, id: &str) -> bool {
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

    fn resolve_relative_selection(&mut self, cx: &Context<Self>) {
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

    fn geometry(&self, p: &DocPoint) -> Option<FlowRect> {
        self.flow_layout()?.block(&p.block_id)?.caret_rect(p.caret)
    }

    fn navigate(
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

impl PlaygroundView {
    fn composition_selection(&self) -> Option<DocumentSelection> {
        let r = self
            .page()?
            .resolve_selection_snapshot(&self.editor.preedit.as_ref()?.replacement)
            .ok()??;
        Some(DocumentSelection {
            anchor: DocPoint::new(r.anchor.0, r.anchor.1),
            focus: DocPoint::new(r.focus.0, r.focus.1),
        })
    }
    fn composition_endpoints(&self) -> Option<(DocPoint, DocPoint)> {
        let sel = self.composition_selection()?;
        Some(if self.editor.preedit.as_ref()?.backward {
            (sel.focus, sel.anchor)
        } else {
            (sel.anchor, sel.focus)
        })
    }
    fn composed_range(&self) -> Option<(String, Range<u64>)> {
        let (start, end) = self.composition_endpoints()?;
        let to = if start.block_id == end.block_id {
            end.offset()
        } else {
            self.block_text(&start.block_id)?.encode_utf16().count() as u64
        };
        Some((start.block_id.clone(), start.offset()..to))
    }
    fn display_text(&self) -> Option<String> {
        if let Some((start, end)) = self.composition_endpoints() {
            let left = self.block_text(&start.block_id)?;
            let right = self.block_text(&end.block_id)?;
            let a = TextBiIndex::new(left).utf16_to_utf8_clamped(start.offset());
            let b = TextBiIndex::new(right).utf16_to_utf8_clamped(end.offset());
            return Some(format!(
                "{}{}{}",
                &left[..a],
                self.editor.preedit.as_ref()?.text,
                &right[b..]
            ));
        }
        self.block_text(&self.editor.selection.as_ref()?.focus.block_id)
            .map(str::to_owned)
    }
    pub(super) fn preedit_snapshot(&self) -> Option<PageSnapshot> {
        let pre = self.editor.preedit.as_ref()?;
        let (start, end) = self.composition_endpoints()?;
        let mut snapshot = self.page_snapshot()?.clone();
        let plain = self.display_text()?;
        let rich = |p: &DocPoint| {
            self.page()?
                .read_editable_text(&p.block_id)
                .ok()
                .map(|(r, _)| r)
        };
        let (mut delta, _) = split_delta(&rich(&start)?.delta, start.offset()).ok()?;
        let (_, right) = split_delta(&rich(&end)?.delta, end.offset()).ok()?;
        delta.push(TextDeltaOp::Insert {
            insert: TextInsert::Text(pre.text.clone()),
            format: None,
        });
        delta.extend(right);
        if start.block_id != end.block_id {
            let blocks = RangeBlocks::between(&snapshot, &start.block_id, &end.block_id)?;
            let leaf_parent = if blocksuite_playground_doc::schema::is_leaf_flavour(
                &snapshot.block(&start.block_id)?.flavour,
            ) {
                Some(parent_of(&snapshot, &start.block_id)?.0.id.clone())
            } else {
                None
            };
            let root = snapshot.root.as_mut()?;
            let children: Vec<_> = blocks
                .survivors
                .iter()
                .filter_map(|id| root.walk().find(|node| node.id == *id).cloned())
                .collect();
            fn prune(node: &mut BlockNode, hidden: &[String], end: &str) {
                node.children.retain_mut(|child| {
                    if child.id == end || hidden.contains(&child.id) {
                        return false;
                    }
                    prune(child, hidden, end);
                    true
                });
            }
            prune(root, &blocks.intermediate, &end.block_id);
            if root.id == start.block_id {
                if let Some(note) = root.children.iter_mut().find(|n| n.is_page_visible_note()) {
                    note.children.splice(0..0, children);
                }
            } else if let Some(parent_id) = leaf_parent {
                let parent = node_mut(root, &parent_id)?;
                let slot = parent
                    .children
                    .iter()
                    .position(|child| child.id == start.block_id)?
                    + 1;
                parent.children.splice(slot..slot, children);
            } else {
                node_mut(root, &start.block_id)?.children.extend(children);
            }
        }
        match &mut node_mut(snapshot.root.as_mut()?, &start.block_id)?.content {
            BlockContent::Code { text, .. } => *text = plain,
            BlockContent::Page { title: rich }
            | BlockContent::Paragraph { text: rich, .. }
            | BlockContent::List { text: rich, .. } => *rich = RichText { delta, plain },
            _ => return None,
        }
        Some(snapshot)
    }
    pub(crate) fn clear_composition(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        if let Some(sel) = self.composition_selection() {
            self.editor.selection = Some(sel);
        }
        if self.editor.preedit.take().is_some() {
            self.dirty_text = None;
            self.doc_rev += 1;
            self.ensure_layout(
                page_geometry(f32::from(w.viewport_size().width)).column_width,
                w,
            );
            self.announce_selection(cx);
            w.notify_text_input_changed(&self.editor_focus);
            cx.notify();
        }
    }
    pub(crate) fn visual_focus(&self) -> Option<DocPoint> {
        if let Some((id, r)) = self.composed_range() {
            return Some(DocPoint::new(
                id,
                r.start + self.editor.preedit.as_ref()?.selected.end as u64,
            ));
        }
        Some(self.editor.selection.as_ref()?.focus.clone())
    }
    pub(super) fn reveal_caret(&mut self, height: f32) {
        if std::mem::take(&mut self.editor.reveal)
            && let Some(focus) = self.visual_focus()
            && let Some(rect) = self.geometry(&focus)
        {
            if rect.y < self.scroll_y {
                self.scroll_y = rect.y.round();
            } else if rect.bottom() > self.scroll_y + height {
                self.scroll_y = (rect.bottom() - height).round();
            }
            self.reveal_code_caret(&focus.block_id, rect.x);
        }
    }
    fn world_spans(block: &FlowBlock, r: Range<u64>) -> Vec<FlowRect> {
        let Some(t) = &block.body.text else {
            return Vec::new();
        };
        t.layout
            .selection_spans(r.start as usize, r.end as usize)
            .into_iter()
            .map(|(line, a, b)| {
                FlowRect::new(
                    block.x + t.x + a,
                    block.y + t.y + line as f32 * t.layout.line_height(),
                    b - a,
                    t.layout.line_height(),
                )
            })
            .collect()
    }
    /// Selected glyph runs and the paragraph breaks between them, in page coordinates.
    pub fn selection_rects(&self, layout: &FlowLayout) -> Vec<FlowRect> {
        let mut out = Vec::new();
        let Some(sel) = &self.editor.selection else {
            return out;
        };
        if sel.empty() {
            return out;
        }
        let Some((start, end, a, b, _)) = sel.ordered(layout) else {
            return out;
        };

        for block in &layout.blocks[a..=b] {
            let from = if start.block_id == block.block_id {
                start.offset()
            } else {
                0
            };
            let to = if end.block_id == block.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            let runs = Self::world_spans(block, from..to);
            let first = runs.first().copied().unwrap_or(FlowRect::new(
                block.x,
                block.y,
                1.0,
                block.body.height,
            ));
            if runs.is_empty() && a != b && block.editable() && block.body.plain.is_empty() {
                out.push(first);
            }
            out.extend(runs);
        }
        out
    }
    pub(super) fn local_selection_elements(
        &self,
        layout: &FlowLayout,
        v: PageViewport,
        palette: &Palette,
    ) -> Vec<AnyElement> {
        let mut el = Vec::new();
        let scrolled = self.overlays.scrolled_code(layout);
        let mut first_box = true;
        let mut draw = |mut r: FlowRect, color: ui::Hsla, caret: bool| {
            // Inside a sideways-scrolled code block the text sits left of its layout, and
            // what scrolled out of the code area is not painted.
            if let Some(code) = ScrolledCode::containing(&scrolled, &r) {
                let shown = if caret { code.caret(r) } else { code.span(r) };
                let Some(shown) = shown else {
                    return;
                };
                r = shown;
            }
            if r.bottom() < v.scroll_y || r.y > v.scroll_y + v.height {
                return;
            }
            let mut d = div()
                .absolute()
                .left(px(v.column_x + r.x))
                .top(px(r.y - v.scroll_y))
                .w(px(r.w.max(1.0)))
                .h(px(r.h))
                .bg(color);
            if r.y >= v.scroll_y && r.bottom() <= v.scroll_y + v.height {
                if caret {
                    d = d.snapshot("page.local_caret", Some(PAGE_SURFACE_ID));
                } else if std::mem::take(&mut first_box) {
                    d = d.snapshot("page.selection", Some(PAGE_SURFACE_ID));
                }
            }
            el.push(d.into_any_element());
        };
        if let Some((id, r)) = self.composed_range()
            && let Some(pre) = &self.editor.preedit
            && let Some(block) = layout.block(&id)
        {
            for mut rect in Self::world_spans(
                block,
                r.start..r.start + pre.text.encode_utf16().count() as u64,
            ) {
                rect.y += rect.h - 1.0;
                rect.h = 1.0;
                draw(rect, palette.text_secondary, false);
            }
        } else {
            for r in self.selection_rects(layout) {
                draw(r, palette.brand.opacity(0.22), false);
            }
        }
        // While the link field takes the keys, its caret is the only one shown.
        if self.overlays.link_url().is_none()
            && let Some(p) = self.visual_focus()
            && let Some(rect) = layout
                .block(&p.block_id)
                .and_then(|b| b.caret_rect(p.caret))
        {
            draw(rect, palette.text_primary, true);
        }
        el
    }
    fn begin_input(&mut self) {
        if self.editor.selection.is_none()
            && let Some(root) = self.page_snapshot().and_then(|s| s.root.as_ref())
        {
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(&root.id, 0)));
        }
    }
    fn replacement_selection(&self, range: Option<Range<usize>>) -> Option<DocumentSelection> {
        let sel = self.editor.selection.as_ref()?;
        if let Some(selection) = self.composition_selection() {
            return Some(selection);
        }
        Some(if let Some(r) = range {
            if sel.anchor.block_id != sel.focus.block_id
                && r.is_empty()
                && r.start as u64 == sel.focus.offset()
            {
                return Some(sel.clone());
            }
            DocumentSelection {
                anchor: DocPoint::new(&sel.focus.block_id, r.start as u64),
                focus: DocPoint::new(&sel.focus.block_id, r.end as u64),
            }
        } else {
            sel.clone()
        })
    }
    fn apply_markdown(
        &mut self,
        sel: &DocumentSelection,
        typed: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        if !sel.empty() || self.editor.preedit.is_some() || typed.is_empty() {
            return Ok(false);
        }
        let Some(snapshot) = self.snapshot.as_ref().cloned() else {
            return Ok(false);
        };
        let id = &sel.focus.block_id;
        let Some(node) = snapshot.block(id) else {
            return Ok(false);
        };
        let BlockContent::Paragraph {
            kind, text: rich, ..
        } = &node.content
        else {
            return Ok(false);
        };
        if *kind == ParagraphType::Quote {
            return Ok(false);
        }
        let offset = sel.focus.offset();
        let index = TextBiIndex::new(&rich.plain);
        let byte = index.utf16_to_utf8_clamped(offset);
        let mut prefix = rich.plain[..byte].to_owned();
        prefix.push_str(typed);
        let now = self.now_ms(cx) as u64;
        if let Some(spec) = markdown_block(&prefix) {
            let Some((parent, index)) = parent_of(&snapshot, id) else {
                return Ok(false);
            };
            let replacement = self.fresh_block_id();
            let trailing = self.fresh_block_id();
            let divider = matches!(spec, BlockSpec::Divider);
            let code = matches!(spec, BlockSpec::Code { .. });
            let focus = if divider || spec.flavour() == node.flavour {
                id
            } else {
                &replacement
            };
            let page = self.page_mut()?;
            let before = sel.snapshot(page)?;
            let commit = page.structural_edit(now, |page| {
                if offset > 0 {
                    page.remove_text(id, "prop:text", 0, offset, now)?;
                }
                if divider || code {
                    page.add_block(
                        &replacement,
                        spec,
                        Some(&parent.id),
                        Some(index as u64),
                        now,
                    )?;
                    if code {
                        let remaining = page.read_editable_text(id)?.0;
                        if !remaining.is_empty() {
                            page.add_block(
                                &trailing,
                                paragraph(),
                                Some(&parent.id),
                                Some(index as u64 + 1),
                                now,
                            )?;
                            page.apply_text_delta(&trailing, "prop:text", &remaining.delta, now)?;
                        }
                        page.remove_lifting_children(id, now)?;
                    }
                } else {
                    page.convert_markdown_block(id, &replacement, spec, now)?;
                }
                Ok(())
            })?;
            if commit.is_some() {
                page.set_undo_selection_snapshot(before)?;
            }
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(focus, 0)));
            self.editor.last_typing = None;
            self.did_edit(commit, None, w, cx);
            return Ok(true);
        }
        if let Some(body) = prefix.strip_suffix('`')
            && let Some(open) = body.rfind('`')
            && !body[open + 1..].is_empty()
            && !body[open + 1..].contains('\n')
        {
            let from = body[..open].encode_utf16().count() as u64;
            // Preserve existing inline marks in the text between the delimiters.
            let existing = offset.saturating_sub(from + 1);
            let mut delta = vec![TextDeltaOp::Retain {
                retain: from,
                format: None,
            }];
            if from < offset {
                delta.push(TextDeltaOp::Delete { delete: 1 });
            }
            let attrs = Some(TextAttributes::from([("code".into(), Any::True)]));
            if existing > 0 {
                delta.push(TextDeltaOp::Retain {
                    retain: existing,
                    format: attrs.clone(),
                });
            }
            let content = &body[open + 1..];
            let ix = TextBiIndex::new(content);
            let new = &content[ix.utf16_to_utf8_clamped(existing)..];
            if !new.is_empty() {
                delta.push(TextDeltaOp::Insert {
                    insert: TextInsert::Text(new.into()),
                    format: attrs,
                });
            }
            let page = self.page_mut()?;
            let before = sel.snapshot(page)?;
            page.stop_capturing()?;
            let commit = page.apply_text_delta(id, "prop:text", &delta, now)?;
            if commit.is_some() {
                page.set_undo_selection_snapshot(before)?;
            }
            page.stop_capturing()?;
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
                id,
                from + ix.utf16_len(),
            )));
            self.editor.last_typing = None;
            self.did_edit(commit, Some(id), w, cx);
            return Ok(true);
        }
        Ok(false)
    }

    fn replace_selection(
        &mut self,
        sel: DocumentSelection,
        text: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        self.ensure_layout(
            page_geometry(f32::from(w.viewport_size().width)).column_width,
            w,
        );
        if self.apply_markdown(&sel, text, w, cx)? {
            return Ok(());
        }
        let now = self.now_ms(cx) as u64;
        let layout = self
            .flow_layout()
            .ok_or_else(|| DocError::InvalidState("missing layout".into()))?;
        let (start, end, a, b, _) = sel
            .ordered(&layout)
            .ok_or_else(|| DocError::InvalidState("selection is no longer visible".into()))?;
        let id = start.block_id.clone();
        let cross = a != b;
        let key = if matches!(layout.blocks[a].body.kind, block_flow::FlowKind::Title) {
            "prop:title"
        } else {
            "prop:text"
        };
        let mut marks = self.insertion_marks(start)?;
        for (key, value) in &self.editor.pending_marks {
            if let Some(v) = value {
                marks.insert(key.clone(), v.clone());
            } else {
                marks.remove(key);
            }
        }
        // A `/` typed at a caret in paragraph or list text, outside inline code, opens
        // the slash menu at that character.
        let slash = (text == "/"
            && sel.empty()
            && matches!(
                layout.blocks[a].body.kind,
                block_flow::FlowKind::Paragraph(_) | block_flow::FlowKind::List(_)
            )
            && marks.get("code") != Some(&Any::True))
        .then(|| (id.clone(), start.offset()));
        let group = self
            .editor
            .last_typing
            .is_some_and(|t| now.saturating_sub(t) < 500)
            && sel.empty()
            && !cross;
        let blocks = RangeBlocks::between(
            self.page_snapshot()
                .ok_or_else(|| DocError::InvalidState("missing page".into()))?,
            &id,
            &end.block_id,
        )
        .ok_or_else(|| DocError::InvalidState("selection outside page content".into()))?;
        let page = self.page_mut()?;
        let snapshot = sel.snapshot(page)?;
        if !group {
            page.stop_capturing()?;
        }
        let mut delta = vec![TextDeltaOp::Retain {
            retain: start.offset(),
            format: None,
        }];
        if !cross && end.offset() > start.offset() {
            delta.push(TextDeltaOp::Delete {
                delete: end.offset() - start.offset(),
            });
        }
        if !text.is_empty() {
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(text.into()),
                format: (!marks.is_empty()).then_some(marks),
            });
        }
        let commit = if cross {
            page.structural_edit(now, |page| {
                page.delete_cross_block_range(
                    (&id, start.offset()),
                    (&end.block_id, end.offset()),
                    &blocks.intermediate,
                    &blocks.survivors,
                    now,
                )?;
                if !text.is_empty() {
                    page.apply_text_delta(&id, key, &delta, now)?;
                }
                Ok(())
            })?
        } else {
            page.apply_text_delta(&id, key, &delta, now)?
        };
        if commit.is_some() && !group {
            page.set_undo_selection_snapshot(snapshot)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
            &id,
            start.offset() + text.encode_utf16().count() as u64,
        )));
        self.editor.last_typing = (!cross).then_some(now);
        self.editor.preedit = None;
        self.did_edit(commit, (!cross).then_some(&id), w, cx);
        if let Some((block_id, offset)) = slash {
            self.open_typed_slash_menu(block_id, offset, cx);
        }
        Ok(())
    }
    fn screen_rect(&self, r: FlowRect, w: &Window) -> Bounds<Pixels> {
        Bounds::new(
            point(
                px(page_geometry(f32::from(w.viewport_size().width)).column_x + r.x),
                px(TOPBAR_HEIGHT + r.y - self.scroll_y),
            ),
            size(px(r.w), px(r.h)),
        )
    }
}

impl EntityInputHandler for PlaygroundView {
    fn paste(&mut self, item: ui::ClipboardItem, w: &mut Window, cx: &mut Context<Self>) {
        if self.overlays.link_field().is_some() {
            if let Some(text) = item.text() {
                let _ = self.link_input(w, cx, |link| link.replace(None, &text));
            }
            return;
        }
        if self.edgeless.authoring.label_editor().is_some() {
            if let Some(text) = item.text() {
                let _ = self.edgeless_label_edit(w, cx, |ed| ed.replace(None, &text));
            }
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        self.begin_input();
        if let Some((slice, rich)) = crate::clipboard::read_slice(&item)
            && let Err(e) = self.paste_slice(slice, rich, w, cx)
        {
            eprintln!("clipboard paste: {e}");
        }
    }
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        adjusted: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        if let Some(link) = self.overlays.link_field() {
            let (text, covered) = link.text_for_range(range);
            *adjusted = Some(covered);
            return Some(text);
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            let (text, covered) = ed.text_for_range(range);
            *adjusted = Some(covered);
            return Some(text);
        }
        let text = self.display_text()?;
        let index = TextBiIndex::new(&text);
        let start = index.utf16_to_utf8_clamped(range.start as u64);
        let end = index.utf16_to_utf8_clamped(range.end as u64).max(start);
        *adjusted = Some(index.utf8_to_utf16(start) as usize..index.utf8_to_utf16(end) as usize);
        Some(text[start..end].into())
    }
    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        if let Some(link) = self.overlays.link_field() {
            let (range, reversed) = link.shown_selection();
            return Some(UTF16Selection { range, reversed });
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            let (range, reversed) = ed.shown_selection();
            return Some(UTF16Selection { range, reversed });
        }
        if let Some((_, r)) = self.composed_range()
            && let Some(pre) = &self.editor.preedit
        {
            return Some(UTF16Selection {
                range: r.start as usize + pre.selected.start..r.start as usize + pre.selected.end,
                reversed: false,
            });
        }
        let sel = self.editor.selection.as_ref()?;
        let f = sel.focus.offset() as usize;
        let a = if sel.anchor.block_id == sel.focus.block_id {
            sel.anchor.offset() as usize
        } else {
            f
        };
        Some(UTF16Selection {
            range: a.min(f)..a.max(f),
            reversed: a > f,
        })
    }
    fn text_length_utf16(&mut self, _: &mut Window, _: &mut Context<Self>) -> Option<usize> {
        if let Some(link) = self.overlays.link_field() {
            return Some(link.text().encode_utf16().count());
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            return Some(ed.display_text().encode_utf16().count());
        }
        Some(self.display_text()?.encode_utf16().count())
    }
    fn set_selected_text_range(&mut self, r: Range<usize>, w: &mut Window, cx: &mut Context<Self>) {
        if self
            .link_input(w, cx, |link| link.select(r.clone()))
            .is_some()
        {
            return;
        }
        if self
            .edgeless_label_input(w, cx, |ed| ed.select(r.clone()))
            .is_some()
        {
            return;
        }
        if let Some(focus) = self.visual_focus() {
            self.change_selection(
                DocumentSelection {
                    anchor: DocPoint::new(&focus.block_id, r.start as u64),
                    focus: DocPoint::new(&focus.block_id, r.end as u64),
                },
                w,
                cx,
            );
        }
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        if let Some(link) = self.overlays.link_field() {
            return link.marked_range();
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            return ed.marked_range();
        }
        let (_, r) = self.composed_range()?;
        let start = r.start as usize;
        Some(start..start + self.editor.preedit.as_ref()?.text.encode_utf16().count())
    }
    fn unmark_text(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        if self.link_input(w, cx, LinkBar::unmark).is_some() {
            return;
        }
        if self
            .edgeless_label_edit(w, cx, crate::edgeless::EdgelessLabelEditor::unmark)
            .is_some()
        {
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        if let Some(pre) = self.editor.preedit.as_ref() {
            let text = pre.text.clone();
            self.replace_text_in_range(None, &text, w, cx);
        }
    }
    fn replace_text_in_range(
        &mut self,
        r: Option<Range<usize>>,
        text: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self
            .link_input(w, cx, |link| link.replace(r.clone(), text))
            .is_some()
        {
            return;
        }
        if self
            .edgeless_label_edit(w, cx, |ed| ed.replace(r.clone(), text))
            .is_some()
        {
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        self.begin_input();
        let selection = self.replacement_selection(r);
        if self.editor.preedit.is_some() {
            self.clear_composition(w, cx);
            if text.is_empty() {
                return;
            }
        }
        if let Some(sel) = selection
            && let Err(e) = self.replace_selection(sel, text, w, cx)
        {
            eprintln!("text replacement: {e}");
        }
    }
    fn replace_and_mark_text_in_range(
        &mut self,
        r: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self
            .link_input(w, cx, |link| link.mark(r.clone(), text, selected.clone()))
            .is_some()
        {
            return;
        }
        if self
            .edgeless_label_input(w, cx, |ed| ed.mark(r.clone(), text, selected.clone()))
            .is_some()
        {
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        self.begin_input();
        if text.is_empty() {
            self.clear_composition(w, cx);
            return;
        }
        let Some(sel) = self.replacement_selection(r) else {
            return;
        };
        let Some(page) = self.page() else { return };
        let backward = if let Some(pre) = &self.editor.preedit {
            pre.backward
        } else if sel.empty() {
            false
        } else {
            let Some(layout) = self.flow_layout() else {
                return;
            };
            let Some((_, _, _, _, backward)) = sel.ordered(&layout) else {
                return;
            };
            backward
        };
        let Ok(replacement) = sel.snapshot(page) else {
            return;
        };
        let n = text.encode_utf16().count();
        let selected = selected.unwrap_or(n..n);
        self.dirty_text = None;
        self.editor.preedit = Some(Preedit {
            replacement,
            backward,
            text: text.into(),
            selected: selected.start.min(n)..selected.end.min(n),
        });
        self.editor.reveal = true;
        self.doc_rev += 1;
        w.notify_text_input_changed(&self.editor_focus);
        cx.notify();
    }
    fn bounds_for_range(
        &mut self,
        r: Range<usize>,
        bounds: Bounds<Pixels>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        self.selection_bounds_for_range(r, bounds, w, cx)
            .into_iter()
            .next()
    }
    fn selection_bounds_for_range(
        &mut self,
        r: Range<usize>,
        _: Bounds<Pixels>,
        w: &mut Window,
        _: &mut Context<Self>,
    ) -> Vec<Bounds<Pixels>> {
        // The link field answers with its box: candidates open under the field.
        if let Some(link) = self.overlays.link_field() {
            return link
                .bounds()
                .map(|field| field.bounds(point(px(0.0), px(0.0))))
                .into_iter()
                .collect();
        }
        if self.mode == crate::PlaygroundMode::Edgeless {
            if let Some(bounds) = self.edgeless_label_screen_bounds() {
                return vec![bounds];
            }
            if let Some(sel) = &self.editor.selection {
                let id = self
                    .composed_range()
                    .map(|(id, _)| id)
                    .unwrap_or_else(|| sel.focus.block_id.clone());
                if let Some(bounds) = self.edgeless_spatial_block_caret_bounds(&id, r.start as u64)
                {
                    return vec![bounds];
                }
            }
        }
        let Some(sel) = &self.editor.selection else {
            return vec![];
        };
        let id = self
            .composed_range()
            .map(|(id, _)| id)
            .unwrap_or_else(|| sel.focus.block_id.clone());
        let Some(layout) = self.ensure_layout(
            page_geometry(f32::from(w.viewport_size().width)).column_width,
            w,
        ) else {
            return vec![];
        };
        let Some(block) = layout.block(&id) else {
            return vec![];
        };
        let mut rects = Self::world_spans(block, r.start as u64..r.end as u64);
        if rects.is_empty()
            && let Some(caret) = block.caret_rect(DocPoint::new(&id, r.start as u64).caret)
        {
            rects.push(caret);
        }
        // The lines of a sideways-scrolled code block sit left of their layout; what the
        // input method is told follows them and stays inside the code area.
        if let Some(code) = ScrolledCode::of_block(block, self.overlays.code_scroll_x(&id)) {
            let caret = rects.len() == 1 && rects[0].w <= 1.0;
            rects = rects
                .into_iter()
                .filter_map(|rect| {
                    if caret {
                        code.caret(rect)
                    } else {
                        code.span(rect)
                    }
                })
                .collect();
        }
        rects.into_iter().map(|r| self.screen_rect(r, w)).collect()
    }
    fn character_index_for_point(
        &mut self,
        p: Point<Pixels>,
        w: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        if let Some(link) = self.overlays.link_field() {
            let (selection, reversed) = link.shown_selection();
            return link
                .bounds()
                .filter(|field| field.contains(f32::from(p.x), f32::from(p.y)))
                .map(|_| {
                    if reversed {
                        selection.start
                    } else {
                        selection.end
                    }
                });
        }
        let p = self.input_point(p, w)?;
        (self.editor.selection.as_ref()?.focus.block_id == p.block_id)
            .then_some(p.offset() as usize)
    }
}

fn paragraph() -> BlockSpec {
    BlockSpec::Paragraph {
        paragraph_type: ParagraphType::Text,
        text: String::new(),
    }
}
fn list(kind: ListType, checked: bool, order: Option<i32>) -> BlockSpec {
    BlockSpec::List {
        list_type: kind,
        text: String::new(),
        checked,
        order,
    }
}
fn markdown_block(input: &str) -> Option<BlockSpec> {
    let spec = match input {
        "# " => "h1",
        "## " => "h2",
        "### " => "h3",
        "#### " => "h4",
        "##### " => "h5",
        "###### " => "h6",
        "> " => "quote",
        "- " | "* " => return Some(list(ListType::Bulleted, false, None)),
        s if s.ends_with(". ") => {
            let digits = s.strip_suffix(". ")?;
            if !digits.bytes().all(|c| c.is_ascii_digit()) {
                return None;
            }
            let order = digits.parse::<i32>().ok().filter(|n| *n >= 0)?;
            return Some(list(ListType::Numbered, false, Some(order)));
        }
        "[] " | "[ ] " => return Some(list(ListType::Todo, false, None)),
        "[x] " => return Some(list(ListType::Todo, true, None)),
        s if s.strip_suffix(char::is_whitespace).is_some_and(|run| {
            run.len() >= 3
                && matches!(run.as_bytes()[0], b'-' | b'*' | b'_')
                && run.bytes().all(|b| b == run.as_bytes()[0])
        }) =>
        {
            return Some(BlockSpec::Divider);
        }
        s if s.starts_with("```") && s.ends_with([' ', '\n']) => {
            let language = &s[3..s.len() - 1];
            if !language
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '+' | '#' | '.' | '-'))
            {
                return None;
            }
            return Some(BlockSpec::Code {
                text: String::new(),
                language: (!language.is_empty()).then(|| language.into()),
                caption: String::new(),
            });
        }
        _ => return None,
    };
    Some(BlockSpec::Paragraph {
        paragraph_type: match spec {
            "h1" => ParagraphType::H1,
            "h2" => ParagraphType::H2,
            "h3" => ParagraphType::H3,
            "h4" => ParagraphType::H4,
            "h5" => ParagraphType::H5,
            "h6" => ParagraphType::H6,
            _ => ParagraphType::Quote,
        },
        text: String::new(),
    })
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
    fn history(&mut self, redo: bool, w: &mut Window, cx: &mut Context<Self>) -> DocResult {
        let sel = self.editor.selection.clone();
        let page = self.page_mut()?;
        let opposite = sel.and_then(|s| s.snapshot(page).ok());
        page.stop_capturing()?;
        let commit = if redo { page.redo()? } else { page.undo()? };
        let Some(commit) = commit else { return Ok(()) };
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
    fn insertion_marks(&self, point: &DocPoint) -> DocResult<TextAttributes> {
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
                        || format
                            .as_ref()
                            .is_some_and(|attrs| attrs.contains_key("reference"))
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
    fn edit_key(
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
            self.editor.last_typing = None;
            self.replace_selection(range, "", w, cx)?;
            self.page_mut()?.set_undo_selection_snapshot(before)?;
            self.editor.last_typing = None;
            return Ok(());
        }
        let before = sel.snapshot(self.page_mut()?)?;
        let mut focus = sel.focus.clone();
        let demote = matches!(
            node.content,
            BlockContent::List { .. }
                | BlockContent::Paragraph {
                    kind: ParagraphType::Quote,
                    ..
                }
        ) && ((text.is_empty() && key == "enter") || (backwards && offset == 0))
            || (backwards
                && offset == 0
                && matches!(node.content,BlockContent::Paragraph {kind,..} if kind!=ParagraphType::Text));
        let last_nested = backwards
            && offset == 0
            && !code
            && parent_of(&snapshot, &id).is_some_and(|(parent, pos)| {
                matches!(
                    parent.content,
                    BlockContent::List { .. } | BlockContent::Paragraph { .. }
                ) && pos + 1 == parent.children.len()
            });
        let commit = if last_nested {
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
            let spec = match &node.content {
                BlockContent::Paragraph { kind, .. } if offset < n => BlockSpec::Paragraph {
                    paragraph_type: *kind,
                    text: String::new(),
                },
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

    pub(super) fn editor_key_down(
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
        // A composition in the link field keeps its keys from the document as well.
        if self.overlays.link_field().is_some_and(LinkBar::composing) {
            return;
        }
        let m = e.keystroke.modifiers;
        let cmd = m.secondary(cx);
        let key = e.keystroke.key.as_str();
        let result = match key {
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
                if let Some(sel) = self.editor.selection.clone()
                    && let Some(layout) = self.flow_layout()
                    && let Some(block) = layout.block(&sel.focus.block_id)
                {
                    let mut anchor = DocPoint::new(&block.block_id, 0);
                    let mut focus = DocPoint::new(
                        &block.block_id,
                        block.body.plain.encode_utf16().count() as u64,
                    );
                    if (sel.anchor == anchor && sel.focus == focus
                        || sel.focus == anchor && sel.anchor == focus)
                        && let Some(first) = layout.blocks.iter().find(|b| b.editable())
                        && let Some(last) = layout.blocks.iter().rfind(|b| b.editable())
                    {
                        anchor = DocPoint::new(&first.block_id, 0);
                        focus = DocPoint::new(
                            &last.block_id,
                            last.body.plain.encode_utf16().count() as u64,
                        );
                    }
                    self.change_selection(DocumentSelection { anchor, focus }, w, cx);
                }
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

impl PlaygroundView {
    fn clipboard_slice(&self) -> Option<crate::clipboard::Slice> {
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
    fn paste_slice(
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
