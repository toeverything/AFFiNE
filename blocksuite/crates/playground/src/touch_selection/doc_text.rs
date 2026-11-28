//! Pure read-only document-level text position, word boundary, caret geometry,
//! and cross-block preview rectangle queries for native `UITextInput` hosts.
//!
//! Unlike `PlatformInputHandler` (which addresses only the focused block), every
//! query in this module addresses the entire active editing scope (`Page` blocks,
//! `Edgeless` spatial block, or active `TableCell`) without mutating selection.

use blocksuite_playground_doc::schema::{ListType, ParagraphType};
use ui::{Direction, Window, point, px};

use super::{SelectionEndpointAnchor, SelectionRectGeometry, endpoint_is_rtl};
use crate::{
    PlaygroundMode, PlaygroundView,
    block_flow::{
        FlowKind, FlowLayout, FlowRect, heading_marker_rect_for_direction, paragraph_spec,
    },
    editor_session::{DocPoint, DocumentSelection, word_range},
    overlays::CONTROL_HIT_SIZE,
};

const TOUCH_CONTROL_HIT_SIZE: f32 = 44.0;

impl PlaygroundView {
    /// Returns `true` when flow-space `(wx, wy)` hits a heading collapse chevron,
    /// Todo checkbox, or Toggle triangle (either its 24pt inner box or 44pt outer halo),
    /// without overlapping editable heading/list prose.
    pub(super) fn hits_touch_gutter_or_prefix_control(
        &self,
        layout: &FlowLayout,
        wx: f32,
        wy: f32,
        dir: Direction,
    ) -> bool {
        let pad_y = (TOUCH_CONTROL_HIT_SIZE - CONTROL_HIT_SIZE) * 0.5;
        let expand_outer = |inner: FlowRect, text_edge: f32| {
            let (hx, hw) = match dir {
                Direction::Ltr => {
                    let right = inner.right().min(text_edge);
                    (right - TOUCH_CONTROL_HIT_SIZE, TOUCH_CONTROL_HIT_SIZE)
                }
                Direction::Rtl => {
                    let left = inner.x.max(text_edge);
                    (left, TOUCH_CONTROL_HIT_SIZE)
                }
            };
            FlowRect::new(hx, inner.y - pad_y, hw, inner.h + 2.0 * pad_y)
        };
        for block in &layout.blocks {
            let rect = block.rect();
            if block.has_gutter_chevron {
                let lh = match block.body.kind {
                    FlowKind::Paragraph(p) => paragraph_spec(p).line_height,
                    _ => paragraph_spec(ParagraphType::Text).line_height,
                };
                let m = heading_marker_rect_for_direction(lh, rect.w, dir);
                let inner = FlowRect::new(
                    rect.x + m.x + (m.w - CONTROL_HIT_SIZE) * 0.5,
                    rect.y + m.y + (m.h - CONTROL_HIT_SIZE) * 0.5,
                    CONTROL_HIT_SIZE,
                    CONTROL_HIT_SIZE,
                );
                let edge = match dir {
                    Direction::Ltr => rect.x,
                    Direction::Rtl => rect.right(),
                };
                if inner.contains(wx, wy) || expand_outer(inner, edge).contains(wx, wy) {
                    return true;
                }
            }
            if matches!(
                block.body.kind,
                FlowKind::List(ListType::Todo | ListType::Toggle)
            ) && let Some(prefix) = block.body.prefix
            {
                let tx = match dir {
                    Direction::Ltr => rect.x,
                    Direction::Rtl => rect.right() - CONTROL_HIT_SIZE,
                };
                let inner = FlowRect::new(
                    tx,
                    rect.y + prefix.y + (prefix.h - CONTROL_HIT_SIZE) * 0.5,
                    CONTROL_HIT_SIZE,
                    CONTROL_HIT_SIZE,
                );
                let edge = match dir {
                    Direction::Ltr => {
                        rect.x + block.body.text.as_ref().map_or(CONTROL_HIT_SIZE, |t| t.x)
                    }
                    Direction::Rtl => block
                        .body
                        .text
                        .as_ref()
                        .map_or(rect.right() - CONTROL_HIT_SIZE, |t| {
                            rect.x + t.x + t.layout.content_width()
                        }),
                };
                if inner.contains(wx, wy) || expand_outer(inner, edge).contains(wx, wy) {
                    return true;
                }
            }
        }
        false
    }

    fn doc_point_order_and_utf16(&self, pt: &DocPoint, layout: &FlowLayout) -> Option<(i32, u32)> {
        let idx = layout
            .blocks
            .iter()
            .position(|b| b.block_id == pt.block_id)?;
        let max_u16 = layout.blocks[idx].body.plain.encode_utf16().count();
        let off = (pt.offset() as usize).min(max_u16) as u32;
        Some((idx as i32, off))
    }

    /// Layout index (`0..`) of the currently focused block (or `0` for table-cell/overlay/none).
    pub fn focused_selection_block_order(&self) -> i32 {
        if self.overlays.active_text_field().is_some()
            || self.overlays.equation_editor().is_some()
            || self.table_cell.is_some()
        {
            return 0;
        }
        let Some(sel) = self.editor.selection.as_ref() else {
            return 0;
        };
        let Some(layout) = self.active_selection_layout() else {
            return 0;
        };
        layout
            .blocks
            .iter()
            .position(|b| b.block_id == sel.focus.block_id)
            .unwrap_or(0) as i32
    }

    /// Ordered `(start, end)` selection endpoints with `(block_order, utf16_offset)` for both
    /// collapsed carets and non-collapsed single/cross-block ranges.
    pub fn current_selection_doc_endpoints(
        &self,
    ) -> Option<(
        (SelectionEndpointAnchor, i32, u32),
        (SelectionEndpointAnchor, i32, u32),
    )> {
        if self.overlays.active_text_field().is_some()
            || self.edgeless.authoring.label_editor().is_some()
            || self.editor.preedit.is_some()
        {
            return None;
        }
        if let Some(cell) = self.table_cell.as_ref() {
            let max_u16 = cell.input.display_text().encode_utf16().count();
            let (sel_range, _) = cell.input.shown_selection();
            let s = sel_range.start.min(max_u16);
            let e = sel_range.end.min(max_u16).max(s);
            return Some((
                (SelectionEndpointAnchor::TableCell(s), 0, s as u32),
                (SelectionEndpointAnchor::TableCell(e), 0, e as u32),
            ));
        }
        let sel = self.editor.selection.as_ref()?;
        let layout = self.active_selection_layout()?;
        if sel.empty() {
            let (order, off) = self.doc_point_order_and_utf16(&sel.focus, &layout)?;
            let anchor =
                SelectionEndpointAnchor::Doc(DocPoint::new(&sel.focus.block_id, off as u64));
            return Some(((anchor.clone(), order, off), (anchor, order, off)));
        }
        let (start, end, a, b, _) = sel.ordered(&layout)?;
        let s_max = layout.blocks[a].body.plain.encode_utf16().count();
        let e_max = layout.blocks[b].body.plain.encode_utf16().count();
        let s_off = (start.offset() as usize).min(s_max) as u32;
        let e_off = (end.offset() as usize).min(e_max) as u32;
        Some((
            (
                SelectionEndpointAnchor::Doc(DocPoint::new(&start.block_id, s_off as u64)),
                a as i32,
                s_off,
            ),
            (
                SelectionEndpointAnchor::Doc(DocPoint::new(&end.block_id, e_off as u64)),
                b as i32,
                e_off,
            ),
        ))
    }

    /// Pure read-only viewport hit-test returning `(anchor, block_order, utf16_offset)`.
    /// Never mutates `self.editor.selection` or focused block state.
    pub fn hit_test_doc_position(
        &self,
        x: f32,
        y: f32,
        window: &Window,
    ) -> Option<(SelectionEndpointAnchor, i32, u32)> {
        if let Some(cell) = self.table_cell.as_ref() {
            let off = self.table_cell_character_index_for_point(point(px(x), px(y)), window)?;
            let clamped = off.min(cell.input.display_text().encode_utf16().count());
            return Some((
                SelectionEndpointAnchor::TableCell(clamped),
                0,
                clamped as u32,
            ));
        }
        let pt = self.hit_test_selection_viewport_point(x, y, window)?;
        let layout = self.active_selection_layout()?;
        let (order, off) = self.doc_point_order_and_utf16(&pt, &layout)?;
        Some((
            SelectionEndpointAnchor::Doc(DocPoint::new(&pt.block_id, off as u64)),
            order,
            off,
        ))
    }

    /// Pure read-only viewport caret rectangle for an interned [`SelectionEndpointAnchor`].
    pub fn caret_rect_for_anchor(
        &self,
        anchor: &SelectionEndpointAnchor,
        window: &Window,
    ) -> Option<SelectionRectGeometry> {
        match anchor {
            SelectionEndpointAnchor::TableCell(off) => {
                let cell = self.table_cell.as_ref()?;
                let layout = self.flow_layout()?;
                let disp = cell.input.display_text();
                let clamped = (*off).min(disp.encode_utf16().count());
                let b = self
                    .table_cell_selection_bounds(clamped..clamped, &layout, window)
                    .into_iter()
                    .next()?;
                let rtl = endpoint_is_rtl(&disp, clamped, false);
                Some(SelectionRectGeometry::from_bounds(b, rtl))
            }
            SelectionEndpointAnchor::Doc(pt) => {
                let layout = self.active_selection_layout()?;
                let block = layout.block(&pt.block_id)?;
                let mut cr = block.caret_rect(pt.caret)?;
                if self.mode == PlaygroundMode::Page {
                    cr.x -= self.overlays.code_scroll_x(&pt.block_id);
                }
                let rtl = endpoint_is_rtl(&block.body.plain, pt.offset() as usize, false);
                Some(SelectionRectGeometry::from_bounds(
                    self.flow_rect_to_viewport(cr, window),
                    rtl,
                ))
            }
        }
    }

    /// Step `delta` UTF-16 code units from `anchor` within its block/cell (`None` if out of bounds).
    pub fn step_anchor_utf16(
        &self,
        anchor: &SelectionEndpointAnchor,
        delta: isize,
    ) -> Option<(SelectionEndpointAnchor, i32, u32)> {
        match anchor {
            SelectionEndpointAnchor::TableCell(off) => {
                let cell = self.table_cell.as_ref()?;
                let len = cell.input.display_text().encode_utf16().count() as isize;
                let next = (*off as isize).checked_add(delta)?;
                if next < 0 || next > len {
                    return None;
                }
                Some((
                    SelectionEndpointAnchor::TableCell(next as usize),
                    0,
                    next as u32,
                ))
            }
            SelectionEndpointAnchor::Doc(pt) => {
                let layout = self.active_selection_layout()?;
                let (order, cur_off) = self.doc_point_order_and_utf16(pt, &layout)?;
                let len = layout.blocks[order as usize]
                    .body
                    .plain
                    .encode_utf16()
                    .count() as isize;
                let next = (cur_off as isize).checked_add(delta)?;
                if next < 0 || next > len {
                    return None;
                }
                Some((
                    SelectionEndpointAnchor::Doc(DocPoint::new(&pt.block_id, next as u64)),
                    order,
                    next as u32,
                ))
            }
        }
    }

    /// Authoritative ICU word boundary `(start, end)` enclosing `anchor` inside its block/cell.
    pub fn word_anchors_at(
        &self,
        anchor: &SelectionEndpointAnchor,
    ) -> Option<(
        (SelectionEndpointAnchor, i32, u32),
        (SelectionEndpointAnchor, i32, u32),
    )> {
        match anchor {
            SelectionEndpointAnchor::TableCell(off) => {
                let cell = self.table_cell.as_ref()?;
                let r = word_range(&cell.input.display_text(), *off as u64);
                let (s, e) = (r.start as usize, r.end as usize);
                (s < e).then_some((
                    (SelectionEndpointAnchor::TableCell(s), 0, s as u32),
                    (SelectionEndpointAnchor::TableCell(e), 0, e as u32),
                ))
            }
            SelectionEndpointAnchor::Doc(pt) => {
                let layout = self.active_selection_layout()?;
                let (order, off) = self.doc_point_order_and_utf16(pt, &layout)?;
                let plain = &layout.blocks[order as usize].body.plain;
                let r = word_range(plain, off as u64);
                (r.start < r.end).then_some((
                    (
                        SelectionEndpointAnchor::Doc(DocPoint::new(&pt.block_id, r.start)),
                        order,
                        r.start as u32,
                    ),
                    (
                        SelectionEndpointAnchor::Doc(DocPoint::new(&pt.block_id, r.end)),
                        order,
                        r.end as u32,
                    ),
                ))
            }
        }
    }

    fn cumulative_doc_utf16(&self, anchor: &SelectionEndpointAnchor) -> Option<i32> {
        match anchor {
            SelectionEndpointAnchor::TableCell(off) => Some(*off as i32),
            SelectionEndpointAnchor::Doc(pt) => {
                let layout = self.active_selection_layout()?;
                let mut acc = 0i32;
                for block in &layout.blocks {
                    if block.block_id == pt.block_id {
                        let max_u16 = block.body.plain.encode_utf16().count();
                        let off = (pt.offset() as usize).min(max_u16) as i32;
                        return Some(acc.saturating_add(off));
                    }
                    if block.editable() {
                        acc = acc
                            .saturating_add(block.body.plain.encode_utf16().count() as i32)
                            .saturating_add(1);
                    }
                }
                None
            }
        }
    }

    /// Signed UTF-16 distance from `from` to `to` across blocks (`+1` per newline separator).
    pub fn offset_between_anchors(
        &self,
        from: &SelectionEndpointAnchor,
        to: &SelectionEndpointAnchor,
    ) -> i32 {
        let (Some(a), Some(b)) = (
            self.cumulative_doc_utf16(from),
            self.cumulative_doc_utf16(to),
        ) else {
            return 0;
        };
        b.saturating_sub(a)
    }

    /// Plain-text UTF-8 substring between two interned anchors (single-block or cross-block).
    pub fn plain_text_between_anchors(
        &self,
        a: &SelectionEndpointAnchor,
        b: &SelectionEndpointAnchor,
    ) -> String {
        match (a, b) {
            (SelectionEndpointAnchor::TableCell(x), SelectionEndpointAnchor::TableCell(y)) => {
                let Some(cell) = self.table_cell.as_ref() else {
                    return String::new();
                };
                let units: Vec<u16> = cell.input.display_text().encode_utf16().collect();
                let lo = (*x).min(*y).min(units.len());
                let hi = (*x).max(*y).min(units.len());
                String::from_utf16_lossy(&units[lo..hi])
            }
            (SelectionEndpointAnchor::Doc(pa), SelectionEndpointAnchor::Doc(pb)) => {
                let Some(layout) = self.active_selection_layout() else {
                    return String::new();
                };
                let sel = DocumentSelection {
                    anchor: pa.clone(),
                    focus: pb.clone(),
                };
                if sel.empty() {
                    return String::new();
                }
                let Some((start, end, ia, ib, _)) = sel.ordered(&layout) else {
                    return String::new();
                };
                let mut lines = Vec::with_capacity(ib.saturating_sub(ia) + 1);
                for block in &layout.blocks[ia..=ib] {
                    if !block.editable() {
                        continue;
                    }
                    let units: Vec<u16> = block.body.plain.encode_utf16().collect();
                    let from = if start.block_id == block.block_id {
                        (start.offset() as usize).min(units.len())
                    } else {
                        0
                    };
                    let to = if end.block_id == block.block_id {
                        (end.offset() as usize).min(units.len())
                    } else {
                        units.len()
                    };
                    lines.push(String::from_utf16_lossy(&units[from..to.max(from)]));
                }
                lines.join("\n")
            }
            _ => String::new(),
        }
    }

    /// Pure read-only selection rectangles between two interned anchors (used by UIKit for both
    /// active selections and live cross-block handle drag previews).
    pub fn selection_rects_between_anchors(
        &self,
        a: SelectionEndpointAnchor,
        b: SelectionEndpointAnchor,
        window: &Window,
    ) -> Vec<SelectionRectGeometry> {
        match (a, b) {
            (SelectionEndpointAnchor::TableCell(x), SelectionEndpointAnchor::TableCell(y)) => {
                let (Some(cell), Some(layout)) = (self.table_cell.as_ref(), self.flow_layout())
                else {
                    return Vec::new();
                };
                let lo = x.min(y);
                let hi = x.max(y);
                if lo == hi {
                    return Vec::new();
                }
                let rtl = endpoint_is_rtl(&cell.input.text, lo, false);
                let raw = self.table_cell_selection_bounds(lo..hi, &layout, window);
                let n = raw.len();
                raw.into_iter()
                    .enumerate()
                    .map(|(i, rect)| {
                        let mut g = SelectionRectGeometry::from_bounds(rect, rtl);
                        g.contains_start = i == 0;
                        g.contains_end = i + 1 == n;
                        g
                    })
                    .collect()
            }
            (SelectionEndpointAnchor::Doc(anchor), SelectionEndpointAnchor::Doc(raw_focus)) => {
                let Some(focus) = self.constrain_selection_focus_domain(&anchor, raw_focus) else {
                    return Vec::new();
                };
                let Some(layout) = self.active_selection_layout() else {
                    return Vec::new();
                };
                let sel = DocumentSelection { anchor, focus };
                if sel.empty() {
                    return Vec::new();
                }
                let Some((start, _, _, _, _)) = sel.ordered(&layout) else {
                    return Vec::new();
                };
                let start_text = self.block_text(&start.block_id).unwrap_or("");
                let rtl = endpoint_is_rtl(start_text, start.offset() as usize, false);
                let raw = if self.mode == PlaygroundMode::Edgeless {
                    Self::selection_rects_for(&sel, &layout)
                } else {
                    self.painted_selection_rects_for(&sel, &layout)
                };
                let n = raw.len();
                raw.into_iter()
                    .enumerate()
                    .map(|(i, r)| {
                        let mut g = SelectionRectGeometry::from_bounds(
                            self.flow_rect_to_viewport(r, window),
                            rtl,
                        );
                        g.contains_start = i == 0;
                        g.contains_end = i + 1 == n;
                        g
                    })
                    .collect()
            }
            _ => Vec::new(),
        }
    }
}
