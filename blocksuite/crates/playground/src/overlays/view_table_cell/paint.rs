//! Table cell preedit snapshot patching, hit-testing, IME bounds, and focus/caret/selection painting.

use std::ops::Range;

use blocksuite_playground_doc::{
    read::{BlockContent, TableCell},
    session::split_delta,
};
use ui::{Bounds, Pixels, Point, Window, div, prelude::*, px};
use y_octo::{TextDeltaOp, TextInsert};

use crate::{
    PlaygroundView, TOPBAR_HEIGHT,
    block_flow::{FlowLayout, FlowRect, PAGE_SURFACE_ID, PageViewport, page_geometry},
    theme::Palette,
};

impl PlaygroundView {
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

    /// Map a screen-space pointer location to a UTF-16 offset inside the focused table cell,
    /// accounting for any horizontal scroll offset of a wide table.
    pub(crate) fn table_cell_character_index_for_point(
        &self,
        p: Point<Pixels>,
        w: &Window,
    ) -> Option<usize> {
        let cell = self.table_cell.as_ref()?;
        let layout = self.flow_layout()?;
        let (bx, by, hit) =
            Self::find_table_cell_hit(&layout, &cell.block_id, &cell.row_id, &cell.column_id)?;
        let scroll_x = self.overlays.code_scroll_x(&cell.block_id);
        let geom = page_geometry(f32::from(w.viewport_size().width));
        let local_x = f32::from(p.x) - geom.column_x - bx + scroll_x;
        let local_y = f32::from(p.y) - TOPBAR_HEIGHT + self.scroll_y - by;
        hit.rect.contains(local_x, local_y).then(|| {
            hit.hit_text(local_x, local_y, &cell.input.display_text())
                .utf16_offset as usize
        })
    }

    /// Screen-space IME candidate bounds for the focused table cell, accounting for horizontal
    /// table scroll.
    pub(crate) fn table_cell_selection_bounds(
        &self,
        r: Range<usize>,
        layout: &FlowLayout,
        w: &Window,
    ) -> Vec<Bounds<Pixels>> {
        let Some((scroll_x, bx, by, hit)) = self.table_cell.as_ref().and_then(|cell| {
            let scroll_x = self.overlays.code_scroll_x(&cell.block_id);
            let (bx, by, hit) =
                Self::find_table_cell_hit(layout, &cell.block_id, &cell.row_id, &cell.column_id)?;
            Some((scroll_x, bx, by, hit))
        }) else {
            return Vec::new();
        };
        let (lh, ox, oy) = (
            hit.text.line_height(),
            bx + hit.text_origin.0 - scroll_x,
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
    /// selection highlight band, IME preedit underline, and live caret (shifted by any
    /// horizontal table scroll and clipped to the table viewport width).
    pub(crate) fn table_cell_selection_elements(
        &self,
        layout: &FlowLayout,
        v: PageViewport,
        palette: &Palette,
        caret_alpha: f32,
    ) -> Vec<ui::AnyElement> {
        let mut out = Vec::new();
        let Some(cell) = self.table_cell.as_ref() else {
            return out;
        };
        let Some(block) = layout.block(&cell.block_id) else {
            return out;
        };
        let Some((bx, by, hit)) =
            Self::find_table_cell_hit(layout, &cell.block_id, &cell.row_id, &cell.column_id)
        else {
            return out;
        };
        let scroll_x = self.overlays.code_scroll_x(&cell.block_id);
        let vis_left = bx;
        let vis_right = bx + block.body.width;
        let clip_x = |r: FlowRect| -> Option<FlowRect> {
            let left = r.x.max(vis_left);
            let right = r.right().min(vis_right);
            (right > left).then(|| FlowRect::new(left, r.y, right - left, r.h))
        };

        let cell_world = hit.rect.translated(bx - scroll_x, by);
        if cell_world.bottom() < v.scroll_y || cell_world.y > v.scroll_y + v.height {
            return out;
        }
        if let Some(clipped) = clip_x(cell_world) {
            let mut ring = div()
                .absolute()
                .left(px(v.column_x + clipped.x))
                .top(px(clipped.y - v.scroll_y))
                .w(px(clipped.w))
                .h(px(clipped.h))
                .border(px(1.5))
                .border_color(palette.brand);
            if v.fully_visible(&clipped) {
                ring = ring
                    .snapshot("page.table_cell_focus", Some(PAGE_SURFACE_ID))
                    .snapshot_focused(true)
                    .snapshot_text(cell.input.display_text());
            }
            out.push(ring.into_any_element());
        }

        let lh = hit.text.line_height();
        let ox = bx + hit.text_origin.0 - scroll_x;
        let oy = by + hit.text_origin.1;
        let (sel, reversed) = cell.input.shown_selection();
        let marked = cell.input.marked_range();

        if let Some(marked) = &marked {
            for (line, a, b) in hit.text.selection_spans(marked.start, marked.end) {
                let y = oy + line as f32 * lh + lh - 1.0;
                if let Some(clipped) = clip_x(FlowRect::new(ox + a, y, (b - a).max(1.0), 1.0)) {
                    out.push(
                        div()
                            .absolute()
                            .left(px(v.column_x + clipped.x))
                            .top(px(clipped.y - v.scroll_y))
                            .w(px(clipped.w))
                            .h(px(1.0))
                            .bg(palette.text_secondary)
                            .into_any_element(),
                    );
                }
            }
            if !sel.is_empty() {
                for (line, a, b) in hit.text.selection_spans(sel.start, sel.end) {
                    let span = FlowRect::new(ox + a, oy + line as f32 * lh, (b - a).max(1.0), lh);
                    if let Some(c) = clip_x(span) {
                        out.push(
                            div()
                                .absolute()
                                .left(px(v.column_x + c.x))
                                .top(px(c.y - v.scroll_y))
                                .w(px(c.w))
                                .h(px(c.h))
                                .bg(palette.brand.opacity(0.18))
                                .into_any_element(),
                        );
                        out.push(
                            div()
                                .absolute()
                                .left(px(v.column_x + c.x))
                                .top(px(c.y + c.h - 2.0 - v.scroll_y))
                                .w(px(c.w))
                                .h(px(2.0))
                                .bg(palette.brand)
                                .into_any_element(),
                        );
                    }
                }
            }
        } else if !sel.is_empty() {
            let mut first = true;
            for (line, a, b) in hit.text.selection_spans(sel.start, sel.end) {
                let Some(r) = clip_x(FlowRect::new(
                    ox + a,
                    oy + line as f32 * lh,
                    (b - a).max(1.0),
                    lh,
                )) else {
                    continue;
                };
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
        if caret_rect.bottom() >= v.scroll_y
            && caret_rect.y <= v.scroll_y + v.height
            && caret_rect.right() > vis_left
            && caret_rect.x < vis_right
        {
            let mut caret_el = div()
                .absolute()
                .left(px(v.column_x + caret_rect.x))
                .top(px(caret_rect.y - v.scroll_y))
                .w(px(1.5))
                .h(px(caret_rect.h))
                .bg(palette.brand.opacity(caret_alpha));
            if v.fully_visible(&caret_rect) {
                caret_el = caret_el.snapshot("page.table_cell_caret", Some(PAGE_SURFACE_ID));
            }
            out.push(caret_el.into_any_element());
        }
        out
    }

    pub(super) fn focused_table_grid(
        &self,
    ) -> Option<(String, Vec<String>, Vec<String>, usize, usize)> {
        let cell = self.table_cell.as_ref()?;
        let snap = self.snapshot.as_ref()?;
        let BlockContent::Table(table) = &snap.block(&cell.block_id)?.content else {
            return None;
        };
        let rows: Vec<String> = table.rows.iter().map(|r| r.row_id.clone()).collect();
        let cols: Vec<String> = table.columns.iter().map(|c| c.column_id.clone()).collect();
        let r_idx = rows.iter().position(|r| r == &cell.row_id)?;
        let c_idx = cols.iter().position(|c| c == &cell.column_id)?;
        Some((cell.block_id.clone(), rows, cols, r_idx, c_idx))
    }

    pub(super) fn focus_table_cell_at_edge(
        &mut self,
        block_id: String,
        row_id: String,
        column_id: String,
        at_end: bool,
        window: &mut Window,
        cx: &mut ui::Context<Self>,
    ) {
        self.focus_table_cell(block_id, row_id, column_id, None, window, cx);
        if let Some(cell) = self.table_cell.as_mut() {
            let pos = if at_end {
                blocksuite_editor::inline_input::utf16_len(&cell.input.text)
            } else {
                0
            };
            cell.input.select(pos..pos);
        }
        self.table_cell_update_anchors();
        window.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
    }

    pub(super) fn focus_table_cell_at_x(
        &mut self,
        block_id: String,
        row_id: String,
        column_id: String,
        goal_x: Option<f32>,
        from_top: bool,
        window: &mut Window,
        cx: &mut ui::Context<Self>,
    ) {
        self.focus_table_cell(
            block_id.clone(),
            row_id.clone(),
            column_id.clone(),
            None,
            window,
            cx,
        );
        let target_pos = goal_x.and_then(|gx| {
            let layout = self.flow_layout()?;
            let (_, _, hit) = Self::find_table_cell_hit(&layout, &block_id, &row_id, &column_id)?;
            let display = self.table_cell.as_ref()?.input.display_text();
            let lh = hit.text.line_height();
            let lines = (hit.text.height() / lh.max(1.0)).round().max(1.0) as usize;
            let line = if from_top { 0 } else { lines.saturating_sub(1) };
            let y = hit.text_origin.1 + line as f32 * lh + lh * 0.5;
            Some(
                hit.hit_text(hit.text_origin.0 + gx, y, &display)
                    .utf16_offset as usize,
            )
        });
        if let Some(cell) = self.table_cell.as_mut() {
            let pos = target_pos.unwrap_or_else(|| {
                if from_top {
                    0
                } else {
                    blocksuite_editor::inline_input::utf16_len(&cell.input.text)
                }
            });
            cell.input.select(pos..pos);
            cell.goal_x = goal_x;
        }
        self.table_cell_update_anchors();
        window.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
    }

    pub(super) fn exit_table_to_adjacent_block(
        &mut self,
        table_block_id: &str,
        forward: bool,
        allow_non_editable: bool,
        window: &mut Window,
        cx: &mut ui::Context<Self>,
    ) -> bool {
        let Some(layout) = self.flow_layout() else {
            return false;
        };
        let Some(idx) = layout
            .blocks
            .iter()
            .position(|b| b.block_id == table_block_id)
        else {
            return false;
        };
        let target = if forward {
            if allow_non_editable {
                layout.blocks.get(idx + 1)
            } else {
                layout.blocks[idx + 1..].iter().find(|b| b.editable())
            }
        } else if allow_non_editable {
            idx.checked_sub(1).and_then(|i| layout.blocks.get(i))
        } else {
            layout.blocks[..idx].iter().rev().find(|b| b.editable())
        };
        let Some(target) = target else {
            return false;
        };
        let target_id = target.block_id.clone();
        let target_editable = target.editable();
        let target_len = target.body.plain.encode_utf16().count() as u64;
        self.finish_inline_targets(
            super::InlineTargetEnd::CommitPreedit,
            Some(window),
            Some(cx),
        );
        self.suppress_unselected_root_input = false;
        if target_editable {
            let offset = if forward { 0 } else { target_len };
            self.change_selection(
                crate::editor_session::DocumentSelection::caret(
                    crate::editor_session::DocPoint::new(target_id, offset),
                ),
                window,
                cx,
            );
        } else {
            self.editor.selection = None;
            self.editor.block_selection = vec![target_id];
            self.announce_selection(cx);
            window.notify_text_selection_changed(&self.editor_focus);
            cx.notify();
        }
        true
    }
}
