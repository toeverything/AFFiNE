//! In-place live `Y.Text` editing glue for `affine:table` cells on [`PlaygroundView`].

use std::{ops::Range, rc::Rc};

use blocksuite_editor::inline_input::{TextSplice, utf16_len};
use blocksuite_playground_doc::{
    read::{BlockContent, TableCell, TableData},
    session::split_delta,
};
use ui::{Bounds, Context, KeyDownEvent, Pixels, Point, Window, div, prelude::*, px};
use y_octo::{TextDeltaOp, TextInsert};

use crate::{
    PlaygroundView, TOPBAR_HEIGHT,
    block_flow::{FlowLayout, FlowRect, PAGE_SURFACE_ID, PageViewport, page_geometry},
    edgeless::EdgelessInlineEdit,
    overlays::InlineTableCell,
    theme::Palette,
};

/// How [`PlaygroundView::finish_inline_targets`] handles any in-flight IME preedit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InlineTargetEnd {
    /// Commit any active IME preedit into the CRDT document before closing.
    CommitPreedit,
    /// Drop any active IME preedit without writing (e.g. document switch or remote delete).
    DiscardPreedit,
}

impl PlaygroundView {
    /// Active in-place table cell editor, if a cell is currently focused.
    pub fn active_table_cell(&self) -> Option<&InlineTableCell> {
        self.table_cell.as_ref()
    }

    /// Unified exit path for all anchored inline targets (in-place table cells and Edgeless
    /// label editors). Always closes the 500 ms undo capture window when a target was active,
    /// and suppresses unselected root-title input whenever no body selection remains.
    pub(crate) fn finish_inline_targets(
        &mut self,
        end: InlineTargetEnd,
        window: Option<&mut Window>,
        mut cx: Option<&mut Context<Self>>,
    ) -> bool {
        let mut closed = false;

        if let Some(mut cell) = self.table_cell.take() {
            if end == InlineTargetEnd::CommitPreedit
                && let Some((start, del, insert)) = cell.input.unmark()
            {
                let now_ms = cx.as_ref().map(|cx| self.now_ms(cx) as u64).unwrap_or(0);
                let commit = self.page_mut().ok().and_then(|page| {
                    page.splice_table_cell_text(
                        &cell.block_id,
                        &cell.row_id,
                        &cell.column_id,
                        start as u64,
                        del as u64,
                        &insert,
                        now_ms,
                    )
                    .ok()
                    .flatten()
                });
                if let Some(commit) = commit {
                    self.did_table_cell_commit(&cell.block_id, commit);
                }
            }
            closed = true;
        }

        if matches!(
            self.edgeless.authoring.inline_edit,
            Some(EdgelessInlineEdit::Label(_))
        ) {
            match (end, window.as_deref(), cx.as_deref_mut()) {
                (InlineTargetEnd::CommitPreedit, Some(w), Some(cx_ref)) => {
                    self.edgeless_flush_label_edit(w, cx_ref);
                }
                _ => {
                    self.edgeless.authoring.inline_edit = None;
                }
            }
            closed = true;
        }

        if !closed {
            return false;
        }

        if let Ok(page) = self.page_mut() {
            let _ = page.stop_capturing();
        }
        if self.editor.selection.is_none() {
            self.suppress_unselected_root_input = true;
        }
        if let Some(w) = window {
            w.notify_text_input_changed(&self.editor_focus);
            w.notify_text_selection_changed(&self.editor_focus);
        }
        if let Some(cx_ref) = cx {
            cx_ref.notify();
        }
        true
    }

    /// Focus an `affine:table` cell in place with zero document writeback.
    pub(crate) fn focus_table_cell(
        &mut self,
        block_id: String,
        row_id: String,
        column_id: String,
        screen_pos: Option<(f32, f32)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let same_cell = self.table_cell.as_ref().is_some_and(|c| {
            c.block_id == block_id && c.row_id == row_id && c.column_id == column_id
        });
        if same_cell {
            self.suppress_unselected_root_input = false;
            if self
                .table_cell
                .as_ref()
                .is_some_and(|c| c.input.composing())
            {
                let _ = self.table_cell_edit(window, cx, |cell| cell.input.unmark());
            }
            if let Some((sx, sy)) = screen_pos {
                let geom = page_geometry(f32::from(window.viewport_size().width));
                if let Some(layout) = self.ensure_layout(geom.column_width, window)
                    && let Some((bx, by, hit)) =
                        Self::find_table_cell_hit(&layout, &block_id, &row_id, &column_id)
                    && let Some(cell) = self.table_cell.as_mut()
                {
                    let local_x = sx - geom.column_x - bx;
                    let local_y = sy - TOPBAR_HEIGHT + self.scroll_y - by;
                    let off = hit
                        .hit_text(local_x, local_y, &cell.input.text)
                        .utf16_offset as usize;
                    cell.input.select(off..off);
                }
            }
        } else {
            self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
            let live = self
                .page()
                .and_then(|page| {
                    page.resolve_live_table_cell(&block_id, &row_id, &column_id)
                        .ok()
                })
                .flatten();
            if live.is_none() {
                return;
            }
            self.suppress_unselected_root_input = false;
            let now_ms = self.now_ms(cx);
            self.overlays.pointer_pressed(now_ms);
            self.equation_snapshot = None;
            self.editor.selection = None;
            self.editor.block_selection.clear();
            self.editor.dragging = false;
            self.editor.slash_trigger = None;
            self.announce_selection(cx);

            let initial = self
                .snapshot
                .as_ref()
                .and_then(|snap| snap.block(&block_id))
                .and_then(|node| match &node.content {
                    BlockContent::Table(t) => t
                        .cells
                        .get(&(row_id.clone(), column_id.clone()))
                        .map(|c| c.text.plain.clone()),
                    _ => None,
                })
                .unwrap_or_default();

            let mut cell = InlineTableCell::new(block_id, row_id, column_id, initial.clone());
            if let Some((sx, sy)) = screen_pos
                && let Some(layout) = self.flow_layout()
                && let Some((bx, by, hit)) = Self::find_table_cell_hit(
                    &layout,
                    &cell.block_id,
                    &cell.row_id,
                    &cell.column_id,
                )
            {
                let geom = page_geometry(f32::from(window.viewport_size().width));
                let local_x = sx - geom.column_x - bx;
                let local_y = sy - TOPBAR_HEIGHT + self.scroll_y - by;
                let off = hit.hit_text(local_x, local_y, &initial).utf16_offset as usize;
                cell.input.select(off..off);
            }
            self.table_cell = Some(cell);
        }
        self.table_cell_update_anchors();
        self.editor_focus.focus(window, cx);
        window.request_virtual_keyboard();
        window.notify_text_input_changed(&self.editor_focus);
        window.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
    }

    /// Apply a live UTF-16 splice on the focused table cell directly into `PageDocSession`,
    /// broadcasting the CRDT update and relayouting only the single table block.
    pub(crate) fn table_cell_edit(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut InlineTableCell) -> Option<TextSplice>,
    ) -> Option<()> {
        let (block_id, row_id, column_id, splice) = {
            let cell = self.table_cell.as_mut()?;
            let splice = f(cell);
            (
                cell.block_id.clone(),
                cell.row_id.clone(),
                cell.column_id.clone(),
                splice,
            )
        };
        if let Some((start, del, insert)) = splice {
            let now_ms = self.now_ms(cx) as u64;
            let commit = self.page_mut().ok().and_then(|page| {
                page.splice_table_cell_text(
                    &block_id,
                    &row_id,
                    &column_id,
                    start as u64,
                    del as u64,
                    &insert,
                    now_ms,
                )
                .ok()
                .flatten()
            });
            if let Some(commit) = commit {
                self.did_table_cell_commit(&block_id, commit);
            }
        }
        self.table_cell_update_anchors();
        window.notify_text_input_changed(&self.editor_focus);
        window.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
        Some(())
    }

    /// Update local selection or IME preedit state on the focused table cell without writing
    /// to the CRDT document.
    pub(crate) fn table_cell_input<R>(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut InlineTableCell) -> R,
    ) -> Option<R> {
        let (out, block_id, composing_changed) = {
            let cell = self.table_cell.as_mut()?;
            let was_composing = cell.input.composing();
            let before_pre = cell.input.preedit.clone();
            let out = f(cell);
            let changed =
                was_composing != cell.input.composing() || before_pre != cell.input.preedit;
            (out, cell.block_id.clone(), changed)
        };
        if composing_changed {
            if let Some(dirty) = &mut self.dirty_text {
                dirty.insert(block_id);
            }
            self.doc_rev += 1;
        }
        self.table_cell_update_anchors();
        window.notify_text_input_changed(&self.editor_focus);
        window.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
        Some(out)
    }

    fn did_table_cell_commit(
        &mut self,
        block_id: &str,
        commit: y_octo::SessionCommit<blocksuite_playground_doc::session::SelectionSnapshot>,
    ) {
        if let Some(page_id) = self.page_id.clone() {
            self.send_page_update(&page_id, commit.update);
        }
        if !self.refresh_table_block(block_id) {
            self.refresh_document();
        }
    }

    /// Incrementally refresh only a single `affine:table` block in `self.snapshot` via
    /// O(1) `PageDocSession::read_table_block` and zero-clone `Option::take`, marking
    /// only `block_id` in `self.dirty_text` so sibling blocks are reused untouched.
    fn refresh_table_block(&mut self, block_id: &str) -> bool {
        let Some(page) = self.page() else {
            return false;
        };
        let Ok(Some(fresh_table)) = page.read_table_block(block_id) else {
            return false;
        };
        let Some(root) = self
            .snapshot
            .as_mut()
            .and_then(|s| Rc::make_mut(s).root.as_mut())
        else {
            return false;
        };
        fn replace_table(
            node: &mut blocksuite_playground_doc::read::BlockNode,
            id: &str,
            table: &mut Option<TableData>,
        ) -> bool {
            if node.id == id {
                if let Some(t) = table.take() {
                    node.content = BlockContent::Table(t);
                }
                return true;
            }
            for child in &mut node.children {
                if replace_table(child, id, table) {
                    return true;
                }
            }
            false
        }
        let mut slot = Some(fresh_table);
        if !replace_table(root, block_id, &mut slot) {
            return false;
        }
        if let Some(changed) = &mut self.dirty_text {
            changed.insert(block_id.to_owned());
        }
        self.doc_rev += 1;
        true
    }

    pub(crate) fn table_cell_update_anchors(&mut self) {
        let Some(mut cell) = self.table_cell.take() else {
            return;
        };
        match self.page() {
            Some(page) => cell.anchored.update_anchors(|off| {
                page.encode_table_cell_relative_position(
                    &cell.block_id,
                    &cell.row_id,
                    &cell.column_id,
                    off as u64,
                )
                .ok()
                .flatten()
            }),
            None => {
                cell.anchored.anchors = None;
                cell.anchored.preedit_anchors = None;
            }
        }
        self.table_cell = Some(cell);
    }

    /// Reconcile an open in-place table cell focus after a remote update or Undo/Redo.
    pub(crate) fn sync_table_cell_from_snapshot(&mut self) {
        let Some(mut cell) = self.table_cell.take() else {
            return;
        };
        let live = self
            .page()
            .and_then(|p| {
                p.resolve_live_table_cell(&cell.block_id, &cell.row_id, &cell.column_id)
                    .ok()
            })
            .flatten();
        if live.is_none() {
            self.table_cell = Some(cell);
            self.finish_inline_targets(InlineTargetEnd::DiscardPreedit, None, None);
            return;
        }
        let latest = self
            .snapshot
            .as_ref()
            .and_then(|s| s.block(&cell.block_id))
            .and_then(|n| match &n.content {
                BlockContent::Table(t) => t
                    .cells
                    .get(&(cell.row_id.clone(), cell.column_id.clone()))
                    .map(|c| c.text.plain.clone()),
                _ => None,
            })
            .unwrap_or_default();
        cell.anchored.reconcile_from_text(latest, |pos| {
            self.page()
                .and_then(|p| {
                    p.resolve_table_cell_relative_position(
                        &cell.block_id,
                        &cell.row_id,
                        &cell.column_id,
                        pos,
                    )
                    .ok()
                    .flatten()
                })
                .map(|off| off as usize)
        });
        self.table_cell = Some(cell);
        self.table_cell_update_anchors();
    }

    fn find_table_cell_hit<'a>(
        layout: &'a FlowLayout,
        block_id: &str,
        row_id: &str,
        column_id: &str,
    ) -> Option<(f32, f32, &'a crate::block_flow::TableCellHit)> {
        let block = layout.block(block_id)?;
        let hit = block
            .body
            .table_cells
            .iter()
            .find(|c| c.row_id == row_id && c.column_id == column_id)?;
        Some((block.x, block.y, hit))
    }

    /// Move the table cell caret one visual line up or down using `TableCellHit` geometry.
    fn move_table_cell_vertical(&mut self, down: bool, shift: bool) -> bool {
        let Some((block_id, row_id, column_id, focus, display)) =
            self.table_cell.as_ref().map(|c| {
                (
                    c.block_id.clone(),
                    c.row_id.clone(),
                    c.column_id.clone(),
                    c.input.focus(),
                    c.input.display_text(),
                )
            })
        else {
            return false;
        };
        let end = utf16_len(&display);
        let to = self
            .flow_layout()
            .and_then(|layout| {
                let (_, _, hit) =
                    Self::find_table_cell_hit(&layout, &block_id, &row_id, &column_id)?;
                let lh = hit.text.line_height();
                let (cx_local, line) = hit.text.caret(focus);
                let lines = (hit.text.height() / lh.max(1.0)).round().max(1.0) as usize;
                let target = if down {
                    if line + 1 >= lines {
                        return Some(end);
                    }
                    line + 1
                } else if line == 0 {
                    return Some(0);
                } else {
                    line - 1
                };
                let y = hit.text_origin.1 + target as f32 * lh + lh * 0.5;
                Some(
                    hit.hit_text(hit.text_origin.0 + cx_local, y, &display)
                        .utf16_offset as usize,
                )
            })
            .unwrap_or(if down { end } else { 0 });
        if let Some(cell) = self.table_cell.as_mut() {
            cell.input.move_caret(to, shift);
            cell.clear_preedit_anchors();
            true
        } else {
            false
        }
    }

    /// Handle keyboard events while a table cell is focused in place. Returns `true` if consumed.
    pub(crate) fn table_cell_key_down(
        &mut self,
        e: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(composing) = self.table_cell.as_ref().map(|c| c.input.composing()) else {
            return false;
        };
        let key = e.keystroke.key.as_str();
        let m = e.keystroke.modifiers;
        let cmd = m.secondary(cx);
        if composing || e.prefer_character_input {
            if key == "escape" {
                let _ = self.table_cell_input(window, cx, |cell| {
                    cell.input.cancel_preedit();
                    cell.clear_preedit_anchors();
                });
                return true;
            }
            return false;
        }
        match key {
            "escape" => {
                self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
                true
            }
            "enter" if m.shift => {
                let _ = self.table_cell_edit(window, cx, |c| c.input.replace(None, "\n"));
                true
            }
            "enter" => {
                self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
                true
            }
            "up" | "down" if !cmd => {
                if self.move_table_cell_vertical(key == "down", m.shift) {
                    self.table_cell_update_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    window.notify_text_selection_changed(&self.editor_focus);
                    cx.notify();
                }
                true
            }
            "z" if cmd => {
                let _ = self.history(m.shift, window, cx);
                true
            }
            "y" if cmd => {
                let _ = self.history(true, window, cx);
                true
            }
            "c" | "x" if cmd => {
                let selected = self
                    .table_cell
                    .as_ref()
                    .map(|c| c.input.selected_text().to_string())
                    .unwrap_or_default();
                if !selected.is_empty() {
                    cx.write_to_clipboard(ui::ClipboardItem::new_string(selected));
                    if key == "x" {
                        let _ = self.table_cell_edit(window, cx, |c| c.input.replace(None, ""));
                    }
                }
                true
            }
            "v" if cmd => {
                if let Some(item) = cx.read_from_clipboard() {
                    if let Some(text) = item.text() {
                        let _ = self.table_cell_edit(window, cx, |c| c.input.replace(None, &text));
                    }
                    true
                } else {
                    false
                }
            }
            _ => {
                let outcome = self
                    .table_cell
                    .as_mut()
                    .and_then(|c| c.input.key(key, m.shift, cmd));
                match outcome {
                    Some(Some(splice)) => {
                        let _ = self.table_cell_edit(window, cx, |_| Some(splice));
                        true
                    }
                    Some(None) => {
                        self.table_cell_update_anchors();
                        window.notify_text_input_changed(&self.editor_focus);
                        window.notify_text_selection_changed(&self.editor_focus);
                        cx.notify();
                        true
                    }
                    None => false,
                }
            }
        }
    }

    /// Splice any active table cell IME preedit into a cloned snapshot using `split_delta` so
    /// all existing formatting marks (bold, code, link, chips) left and right of the preedit
    /// stay 100% intact.
    pub(crate) fn apply_table_cell_preedit_to_snapshot(
        &self,
        snapshot: &mut blocksuite_playground_doc::read::PageSnapshot,
    ) -> bool {
        let Some(cell) = self.table_cell.as_ref() else {
            return false;
        };
        let Some(pre) = cell.input.preedit.as_ref() else {
            return false;
        };
        let Some(root) = snapshot.root.as_mut() else {
            return false;
        };
        let display = cell.input.display_text();
        let rep = pre.replacement.clone();
        let pre_text = pre.text.as_str();
        fn patch_node(
            node: &mut blocksuite_playground_doc::read::BlockNode,
            block_id: &str,
            row_id: &str,
            column_id: &str,
            rep: &Range<usize>,
            pre_text: &str,
            display: &str,
        ) -> bool {
            if node.id == block_id {
                if let BlockContent::Table(table) = &mut node.content {
                    let entry = table
                        .cells
                        .entry((row_id.to_string(), column_id.to_string()))
                        .or_insert_with(|| TableCell {
                            text: blocksuite_playground_doc::read::RichText::default(),
                        });
                    let delta = if let Ok((mut before, rest)) =
                        split_delta(&entry.text.delta, rep.start as u64)
                        && let Ok((_, after)) =
                            split_delta(&rest, (rep.end.saturating_sub(rep.start)) as u64)
                    {
                        if !pre_text.is_empty() {
                            before.push(TextDeltaOp::Insert {
                                insert: TextInsert::Text(pre_text.to_string()),
                                format: None,
                            });
                        }
                        before.extend(after);
                        before
                    } else if display.is_empty() {
                        Vec::new()
                    } else {
                        vec![TextDeltaOp::Insert {
                            insert: TextInsert::Text(display.to_string()),
                            format: None,
                        }]
                    };
                    entry.text = blocksuite_playground_doc::read::RichText {
                        plain: display.to_string(),
                        delta,
                    };
                    return true;
                }
                return false;
            }
            for child in &mut node.children {
                if patch_node(child, block_id, row_id, column_id, rep, pre_text, display) {
                    return true;
                }
            }
            false
        }
        patch_node(
            root,
            &cell.block_id,
            &cell.row_id,
            &cell.column_id,
            &rep,
            pre_text,
            &display,
        )
    }

    /// Map a screen-space pointer location to a UTF-16 offset inside the focused table cell.
    pub(crate) fn table_cell_character_index_for_point(
        &self,
        p: Point<Pixels>,
        w: &Window,
    ) -> Option<usize> {
        let cell = self.table_cell.as_ref()?;
        let layout = self.flow_layout()?;
        let (bx, by, hit) =
            Self::find_table_cell_hit(&layout, &cell.block_id, &cell.row_id, &cell.column_id)?;
        let geom = page_geometry(f32::from(w.viewport_size().width));
        let local_x = f32::from(p.x) - geom.column_x - bx;
        let local_y = f32::from(p.y) - TOPBAR_HEIGHT + self.scroll_y - by;
        hit.rect.contains(local_x, local_y).then(|| {
            hit.hit_text(local_x, local_y, &cell.input.display_text())
                .utf16_offset as usize
        })
    }

    /// Screen-space IME candidate bounds for the focused table cell.
    pub(crate) fn table_cell_selection_bounds(
        &self,
        r: Range<usize>,
        layout: &FlowLayout,
        w: &Window,
    ) -> Vec<Bounds<Pixels>> {
        let Some((bx, by, hit)) = self.table_cell.as_ref().and_then(|cell| {
            Self::find_table_cell_hit(layout, &cell.block_id, &cell.row_id, &cell.column_id)
        }) else {
            return Vec::new();
        };
        let (lh, ox, oy) = (
            hit.text.line_height(),
            bx + hit.text_origin.0,
            by + hit.text_origin.1,
        );
        let mut rects: Vec<FlowRect> = hit
            .text
            .selection_spans(r.start, r.end)
            .into_iter()
            .map(|(line, a, b)| FlowRect::new(ox + a, oy + line as f32 * lh, (b - a).max(1.0), lh))
            .collect();
        if rects.is_empty() {
            let (cx, line) = hit.text.caret(r.start);
            rects.push(FlowRect::new(ox + cx, oy + line as f32 * lh, 1.5, lh));
        }
        rects.into_iter().map(|r| self.screen_rect(r, w)).collect()
    }

    /// In-place visual elements for a focused table cell: 1.5px brand focus border,
    /// selection highlight band, IME preedit underline, and live caret.
    pub(crate) fn table_cell_selection_elements(
        &self,
        layout: &FlowLayout,
        v: PageViewport,
        palette: &Palette,
    ) -> Vec<ui::AnyElement> {
        let mut out = Vec::new();
        let Some(cell) = self.table_cell.as_ref() else {
            return out;
        };
        let Some((bx, by, hit)) =
            Self::find_table_cell_hit(layout, &cell.block_id, &cell.row_id, &cell.column_id)
        else {
            return out;
        };
        let cell_world = hit.rect.translated(bx, by);
        if cell_world.bottom() < v.scroll_y || cell_world.y > v.scroll_y + v.height {
            return out;
        }
        let mut ring = div()
            .absolute()
            .left(px(v.column_x + cell_world.x))
            .top(px(cell_world.y - v.scroll_y))
            .w(px(cell_world.w))
            .h(px(cell_world.h))
            .border(px(1.5))
            .border_color(palette.brand);
        if v.fully_visible(&cell_world) {
            ring = ring
                .snapshot("page.table_cell_focus", Some(PAGE_SURFACE_ID))
                .snapshot_focused(true)
                .snapshot_text(cell.input.display_text());
        }
        out.push(ring.into_any_element());

        let lh = hit.text.line_height();
        let ox = bx + hit.text_origin.0;
        let oy = by + hit.text_origin.1;
        let (sel, reversed) = cell.input.shown_selection();
        let marked = cell.input.marked_range();

        if let Some(marked) = &marked {
            for (line, a, b) in hit.text.selection_spans(marked.start, marked.end) {
                let y = oy + line as f32 * lh + lh - 1.0;
                out.push(
                    div()
                        .absolute()
                        .left(px(v.column_x + ox + a))
                        .top(px(y - v.scroll_y))
                        .w(px((b - a).max(1.0)))
                        .h(px(1.0))
                        .bg(palette.text_secondary)
                        .into_any_element(),
                );
            }
        } else if !sel.is_empty() {
            let mut first = true;
            for (line, a, b) in hit.text.selection_spans(sel.start, sel.end) {
                let r = FlowRect::new(ox + a, oy + line as f32 * lh, (b - a).max(1.0), lh);
                let mut d = div()
                    .absolute()
                    .left(px(v.column_x + r.x))
                    .top(px(r.y - v.scroll_y))
                    .w(px(r.w))
                    .h(px(r.h))
                    .bg(palette.brand.opacity(0.22));
                if v.fully_visible(&r) && std::mem::take(&mut first) {
                    d = d.snapshot("page.selection", Some(PAGE_SURFACE_ID));
                }
                out.push(d.into_any_element());
            }
        }

        let caret_u16 = if reversed { sel.start } else { sel.end };
        let (cx_local, line) = hit.text.caret(caret_u16);
        let caret_rect = FlowRect::new(ox + cx_local, oy + line as f32 * lh, 1.5, lh);
        if caret_rect.bottom() >= v.scroll_y && caret_rect.y <= v.scroll_y + v.height {
            let mut caret_el = div()
                .absolute()
                .left(px(v.column_x + caret_rect.x))
                .top(px(caret_rect.y - v.scroll_y))
                .w(px(1.5))
                .h(px(caret_rect.h))
                .bg(palette.brand);
            if v.fully_visible(&caret_rect) {
                caret_el = caret_el.snapshot("page.table_cell_caret", Some(PAGE_SURFACE_ID));
            }
            out.push(caret_el.into_any_element());
        }
        out
    }
}
