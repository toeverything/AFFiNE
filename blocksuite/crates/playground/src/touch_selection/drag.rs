//! Native selection handle drag, viewport hit-testing across Page/Edgeless/TableCell,
//! live drag preview geometry, and authoritative selection actions (`Copy`/`Cut`/`Paste`/`Select All`).

use ui::{Bounds, Context, Window, point, px};

use super::{SelectionRectGeometry, endpoint_is_rtl};
use crate::{
    PlaygroundMode, PlaygroundView,
    block_flow::{FlowKind, FlowLayout, FlowRect, page_geometry},
    edgeless::{NOTE_CARD_PADDING, rotate_point_around},
    editor_session::{DocPoint, DocumentSelection, word_range},
};

/// Authoritative fixed endpoint of an active selection (document `DocPoint` or table-cell UTF-16 offset).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SelectionEndpointAnchor {
    Doc(DocPoint),
    TableCell(usize),
}

impl PlaygroundView {
    /// Returns `true` when window coordinate `(x, y)` lies inside the currently active
    /// non-empty painted text selection.
    pub(crate) fn point_hits_active_selection(&self, x: f32, y: f32, window: &Window) -> bool {
        let geom = self.document_selection_geometry(window);
        if !geom.has_selection || geom.is_collapsed {
            return false;
        }
        geom.selection_rects
            .iter()
            .any(|r: &SelectionRectGeometry| {
                x >= r.x - 4.0 && x <= r.right() + 4.0 && y >= r.y - 4.0 && y <= r.bottom() + 4.0
            })
    }

    /// Returns `true` when an iOS touch starting at `(x, y)` hits non-text chrome, overlays,
    /// Edgeless canvas, or interactive block widgets and should be forwarded to GPUI immediately
    /// instead of letting `UITextInteraction` handle single/multi-tap and loupe gestures.
    pub fn should_forward_ios_touch_immediately(&self, x: f32, y: f32, window: &Window) -> bool {
        if self.mode == PlaygroundMode::Edgeless
            || self.is_selection_suppressed_by_overlay()
            || self.table_cell.is_some()
        {
            return true;
        }
        let (_, vis_top, vis_bottom) = self.visible_editing_band(window);
        if y < vis_top || y >= vis_bottom {
            return true;
        }
        if self.hit_link_url_at(x, y, window).is_some()
            || self.hit_inline_reference_at(x, y, window).is_some()
        {
            return true;
        }
        let Some(layout) = self.flow_layout() else {
            return false;
        };
        let (origin, canvas_size) = self.canvas_rect(window);
        let geom = page_geometry(f32::from(canvas_size.width));
        let wx = x - f32::from(origin.x) - geom.column_x;
        let wy = y - f32::from(origin.y) + self.scroll_y;
        if let Some(last) = layout.blocks.last()
            && wy > last.rect().bottom() + 12.0
        {
            return true;
        }
        if self.hits_touch_gutter_or_prefix_control(&layout, wx, wy, window.layout_direction()) {
            return true;
        }
        for block in &layout.blocks {
            let rect = block.rect();
            if wy < rect.y || wy > rect.bottom() {
                continue;
            }
            if !block.editable() {
                return true;
            }
            if matches!(block.body.kind, FlowKind::Code) && wy < rect.y + 34.0 {
                return true;
            }
        }
        false
    }

    pub(super) fn active_selection_layout(&self) -> Option<std::rc::Rc<FlowLayout>> {
        if self.mode == PlaygroundMode::Edgeless {
            let (spatial_id, is_note) = self
                .edgeless
                .authoring
                .editing_spatial_block()
                .map(|(id, n)| (id.to_string(), n))
                .or_else(|| self.edgeless_readonly_selection_target.clone())?;
            self.edgeless.cached_block_layout(&spatial_id, is_note)
        } else {
            self.flow_layout()
        }
    }

    pub(super) fn hit_test_selection_viewport_point(
        &self,
        x: f32,
        y: f32,
        window: &Window,
    ) -> Option<DocPoint> {
        if self.mode == PlaygroundMode::Edgeless {
            let (spatial_id, is_note) = self
                .edgeless
                .authoring
                .editing_spatial_block()
                .map(|(id, n)| (id.to_string(), n))
                .or_else(|| self.edgeless_readonly_selection_target.clone())?;
            let (vp_origin, _) = self.canvas_rect(window);
            let wp = self
                .edgeless
                .camera
                .screen_to_world(point(px(x), px(y)), vp_origin);
            let (wx, wy) = (f32::from(wp.x), f32::from(wp.y));
            let item = self
                .edgeless
                .authoring
                .painted_items
                .iter()
                .find(|i| i.id == spatial_id)?;
            let layout = self.edgeless.cached_block_layout(&spatial_id, is_note)?;
            let (cx_w, cy_w) = item.rect.center();
            let (lx, ly) = rotate_point_around(wx, wy, cx_w, cy_w, -item.rotate_deg);
            let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
            let scale = item.scale.max(f32::EPSILON);
            let fx = ((lx - item.rect.x) / scale - pad).clamp(0.0, layout.width.max(0.0));
            let fy = ((ly - item.rect.y) / scale - pad).clamp(0.0, layout.height.max(0.0));
            Self::hit_test_flow_layout(&layout, fx, fy)
        } else {
            self.input_point(point(px(x), px(y)), window)
        }
    }

    pub(super) fn constrain_selection_focus_domain(
        &self,
        anchor: &DocPoint,
        mut focus: DocPoint,
    ) -> Option<DocPoint> {
        if self.mode == PlaygroundMode::Page
            && let Some(layout) = self.flow_layout()
        {
            let anchor_title = layout
                .block(&anchor.block_id)
                .is_some_and(|b| matches!(b.body.kind, crate::block_flow::FlowKind::Title));
            let focus_title = layout
                .block(&focus.block_id)
                .is_some_and(|b| matches!(b.body.kind, crate::block_flow::FlowKind::Title));
            if anchor_title && !focus_title {
                let len = self
                    .block_text(&anchor.block_id)
                    .map_or(0, |s| s.encode_utf16().count() as u64);
                focus = DocPoint::new(&anchor.block_id, len);
            } else if !anchor_title && focus_title {
                let first_body = layout.blocks.iter().find(|b| {
                    b.editable() && !matches!(b.body.kind, crate::block_flow::FlowKind::Title)
                })?;
                focus = DocPoint::new(&first_body.block_id, 0);
            }
        }
        Some(focus)
    }

    pub(super) fn flow_rect_to_viewport(&self, r: FlowRect, window: &Window) -> Bounds<ui::Pixels> {
        if self.mode == PlaygroundMode::Edgeless {
            if let Some((spatial_id, is_note)) = self
                .edgeless
                .authoring
                .editing_spatial_block()
                .map(|(id, n)| (id.to_string(), n))
                .or_else(|| self.edgeless_readonly_selection_target.clone())
                && let Some(item) = self
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.id == spatial_id)
            {
                let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
                let lx = item.rect.x + (r.x + pad) * item.scale;
                let ly = item.rect.y + (r.y + pad) * item.scale;
                let (cx_w, cy_w) = item.rect.center();
                let (wx, wy) = rotate_point_around(lx, ly, cx_w, cy_w, item.rotate_deg);
                let (vp, _) = self.canvas_rect(window);
                let p = self
                    .edgeless
                    .camera
                    .world_to_screen(point(px(wx), px(wy)), vp);
                let z = self.edgeless.camera.zoom * item.scale;
                return Bounds::new(p, ui::size(px((r.w * z).max(1.0)), px((r.h * z).max(1.0))));
            }
        }
        self.screen_rect(r, window)
    }

    /// Document-level caret rectangle at viewport point `(x, y)` (used by UIKit loupe and
    /// live grabber handle drag across blocks).
    pub fn caret_rect_at_viewport_point(
        &self,
        x: f32,
        y: f32,
        window: &Window,
    ) -> Option<SelectionRectGeometry> {
        if let Some(cell) = self.table_cell.as_ref() {
            let layout = self.flow_layout()?;
            let off = self.table_cell_character_index_for_point(point(px(x), px(y)), window)?;
            let b = self
                .table_cell_selection_bounds(off..off, &layout, window)
                .into_iter()
                .next()?;
            let rtl = endpoint_is_rtl(&cell.input.text, off, false);
            return Some(SelectionRectGeometry::from_bounds(b, rtl));
        }
        let pt = self.hit_test_selection_viewport_point(x, y, window)?;
        let layout = self.active_selection_layout()?;
        let mut cr = layout.block(&pt.block_id)?.caret_rect(pt.caret)?;
        if self.mode == PlaygroundMode::Page {
            cr.x -= self.overlays.code_scroll_x(&pt.block_id);
        }
        let text = self.block_text(&pt.block_id).unwrap_or("");
        let rtl = endpoint_is_rtl(text, pt.offset() as usize, false);
        Some(SelectionRectGeometry::from_bounds(
            self.flow_rect_to_viewport(cr, window),
            rtl,
        ))
    }

    /// Read-only preview of document selection rectangles during an active UIKit handle drag
    /// (`UITextRangeAdjustmentGestureRecognizer` queries `selectionRects(for:)` before setting
    /// `selectedTextRange`).
    pub fn preview_selection_rects_for_drag(
        &self,
        fixed: SelectionEndpointAnchor,
        fx: f32,
        fy: f32,
        window: &Window,
    ) -> Vec<SelectionRectGeometry> {
        match fixed {
            SelectionEndpointAnchor::TableCell(cell_anchor) => {
                let (Some(cell), Some(layout)) = (self.table_cell.as_ref(), self.flow_layout())
                else {
                    return Vec::new();
                };
                let Some(off) =
                    self.table_cell_character_index_for_point(point(px(fx), px(fy)), window)
                else {
                    return Vec::new();
                };
                let (lo, hi) = if off <= cell_anchor {
                    (off, cell_anchor)
                } else {
                    (cell_anchor, off)
                };
                if lo == hi {
                    return Vec::new();
                }
                let rtl = endpoint_is_rtl(&cell.input.text, lo, false);
                let raw = self.table_cell_selection_bounds(lo..hi, &layout, window);
                let n = raw.len();
                raw.into_iter()
                    .enumerate()
                    .map(|(i, b)| {
                        let mut g = SelectionRectGeometry::from_bounds(b, rtl);
                        g.contains_start = i == 0;
                        g.contains_end = i + 1 == n;
                        g
                    })
                    .collect()
            }
            SelectionEndpointAnchor::Doc(anchor) => {
                let Some(raw_focus) = self.hit_test_selection_viewport_point(fx, fy, window) else {
                    return Vec::new();
                };
                let Some(focus) = self.constrain_selection_focus_domain(&anchor, raw_focus) else {
                    return Vec::new();
                };
                let Some(layout) = self.active_selection_layout() else {
                    return Vec::new();
                };
                let sel = DocumentSelection { anchor, focus };
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
        }
    }

    /// Plain-text string of the active single-block or cross-block selection.
    pub fn selected_plain_text(&self) -> String {
        if let Some(cell) = self.table_cell.as_ref() {
            let units: Vec<u16> = cell.input.text.encode_utf16().collect();
            let s = cell.input.selection.start.min(units.len());
            let e = cell.input.selection.end.min(units.len());
            return String::from_utf16_lossy(&units[s..e.max(s)]);
        }
        let Some(sel) = self.editor.selection.as_ref() else {
            return String::new();
        };
        if sel.empty() {
            return String::new();
        }
        let Some(layout) = self.active_selection_layout() else {
            return String::new();
        };
        let Some((start, end, a, b, _)) = sel.ordered(&layout) else {
            return String::new();
        };
        let mut lines = Vec::with_capacity(b.saturating_sub(a) + 1);
        for block in &layout.blocks[a..=b] {
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

    /// Focus a collapsed caret at `(x, y)` when no non-empty range selection is active so
    /// native `UITextInput.closestPosition(to:)` resolves UTF-16 offsets across unfocused blocks.
    pub fn focus_collapsed_for_text_hit(
        &mut self,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<usize> {
        if self.overlays.active_text_field().is_some()
            || self.overlays.equation_editor().is_some()
            || self.table_cell.is_some()
        {
            return None;
        }
        if self.editor.selection.as_ref().is_some_and(|s| !s.empty()) {
            return None;
        }
        let pt = self.hit_test_selection_viewport_point(x, y, window)?;
        self.keyboard_toolbar_dismissed = false;
        if self
            .editor
            .selection
            .as_ref()
            .is_none_or(|s| s.focus != pt || !s.empty())
        {
            self.select_document_range(
                DocumentSelection {
                    anchor: pt.clone(),
                    focus: pt.clone(),
                },
                window,
                cx,
            );
        } else {
            self.editor_focus.focus(window, cx);
        }
        let text = self.block_text(&pt.block_id)?;
        Some((pt.offset() as usize).min(text.encode_utf16().count()))
    }

    /// Select the ICU word under viewport coordinate `(x, y)` and bump `selection_menu_request_seq`.
    pub fn select_word_at_viewport_point(
        &mut self,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(pt) = self.hit_test_selection_viewport_point(x, y, window) else {
            return false;
        };
        let text = self.block_text(&pt.block_id).unwrap_or("");
        let r = word_range(text, pt.offset());
        self.keyboard_toolbar_dismissed = false;
        self.select_document_range(
            DocumentSelection {
                anchor: DocPoint::new(&pt.block_id, r.start),
                focus: DocPoint::new(&pt.block_id, r.end),
            },
            window,
            cx,
        );
        if self.document_selection_geometry(window).action_mask != 0 {
            self.bump_selection_menu_request_seq();
        }
        cx.notify();
        true
    }

    /// Ordered `(start, end)` selection endpoints in authoritative document/cell space.
    pub fn ordered_selection_endpoints(
        &self,
    ) -> Option<(SelectionEndpointAnchor, SelectionEndpointAnchor)> {
        if let Some(cell) = self.table_cell.as_ref() {
            return Some((
                SelectionEndpointAnchor::TableCell(cell.input.selection.start),
                SelectionEndpointAnchor::TableCell(cell.input.selection.end),
            ));
        }
        let sel = self.editor.selection.as_ref()?;
        let layout = self.active_selection_layout()?;
        let (start, end, _, _, _) = sel.ordered(&layout)?;
        Some((
            SelectionEndpointAnchor::Doc(start.clone()),
            SelectionEndpointAnchor::Doc(end.clone()),
        ))
    }

    /// Update selection from an authoritative fixed endpoint to viewport coordinate `(x, y)`.
    pub fn select_from_anchor_to_viewport_point(
        &mut self,
        fixed: SelectionEndpointAnchor,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        match fixed {
            SelectionEndpointAnchor::TableCell(cell_anchor) => {
                let Some(off) =
                    self.table_cell_character_index_for_point(point(px(x), px(y)), window)
                else {
                    return false;
                };
                let (lo, hi) = if off <= cell_anchor {
                    (off, cell_anchor)
                } else {
                    (cell_anchor, off)
                };
                let reversed = off < cell_anchor;
                let _ = self.table_cell_input(window, cx, |c| {
                    c.input.select(lo..hi);
                    c.input.reversed = reversed;
                });
                true
            }
            SelectionEndpointAnchor::Doc(anchor) => {
                let Some(raw_focus) = self.hit_test_selection_viewport_point(x, y, window) else {
                    return false;
                };
                let Some(focus) = self.constrain_selection_focus_domain(&anchor, raw_focus) else {
                    return false;
                };
                self.select_document_range(DocumentSelection { anchor, focus }, window, cx);
                true
            }
        }
    }

    /// Begin dragging a native selection handle (`1 = Start`, `2 = End`), recording the
    /// fixed document-level anchor endpoint so dragging can cross blocks and invert cleanly.
    pub fn begin_document_selection_drag(&mut self, handle: u8, _window: &Window) -> bool {
        if handle != 1 && handle != 2 {
            return false;
        }
        let Some((start, end)) = self.ordered_selection_endpoints() else {
            return false;
        };
        match if handle == 1 { end } else { start } {
            SelectionEndpointAnchor::Doc(anchor) => {
                self.native_selection_drag_anchor = Some(anchor);
                self.native_selection_drag_cell_anchor = None;
            }
            SelectionEndpointAnchor::TableCell(anchor) => {
                self.native_selection_drag_cell_anchor = Some(anchor);
                self.native_selection_drag_anchor = None;
            }
        }
        self.native_selection_drag_active = true;
        true
    }

    /// Update an active native selection handle drag from viewport coordinates `(x, y)`.
    pub fn update_document_selection_drag(
        &mut self,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if !self.native_selection_drag_active {
            return false;
        }
        let fixed = if let Some(cell_anchor) = self.native_selection_drag_cell_anchor {
            SelectionEndpointAnchor::TableCell(cell_anchor)
        } else if let Some(anchor) = self.native_selection_drag_anchor.clone() {
            SelectionEndpointAnchor::Doc(anchor)
        } else {
            return false;
        };
        self.select_from_anchor_to_viewport_point(fixed, x, y, window, cx)
    }

    /// Finish an active native selection handle drag and bump `selection_menu_request_seq`
    /// when a non-empty selection remains.
    pub fn end_document_selection_drag(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        let was_active = self.native_selection_drag_active;
        self.native_selection_drag_active = false;
        self.native_selection_drag_anchor = None;
        self.native_selection_drag_cell_anchor = None;
        if was_active {
            let has_non_empty = self.editor.selection.as_ref().is_some_and(|s| !s.empty())
                || self
                    .table_cell
                    .as_ref()
                    .is_some_and(|c| !c.input.selection.is_empty());
            if has_non_empty {
                self.bump_selection_menu_request_seq();
            }
            cx.notify();
        }
    }

    /// Cancel an active native selection handle drag without requesting a menu.
    pub fn cancel_document_selection_drag(&mut self) {
        self.native_selection_drag_active = false;
        self.native_selection_drag_anchor = None;
        self.native_selection_drag_cell_anchor = None;
    }

    /// Set document-level text selection directly between two viewport coordinates
    /// `(ax, ay)` and `(fx, fy)` across Page, Edgeless, and in-place TableCell scopes.
    pub fn select_between_viewport_points(
        &mut self,
        ax: f32,
        ay: f32,
        fx: f32,
        fy: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.table_cell.is_some() {
            let Some(a_off) =
                self.table_cell_character_index_for_point(point(px(ax), px(ay)), window)
            else {
                return false;
            };
            return self.select_from_anchor_to_viewport_point(
                SelectionEndpointAnchor::TableCell(a_off),
                fx,
                fy,
                window,
                cx,
            );
        }
        let Some(anchor) = self.hit_test_selection_viewport_point(ax, ay, window) else {
            return false;
        };
        let Some(raw_focus) = self.hit_test_selection_viewport_point(fx, fy, window) else {
            return false;
        };
        let Some(focus) = self.constrain_selection_focus_domain(&anchor, raw_focus) else {
            return false;
        };
        self.select_document_range(DocumentSelection { anchor, focus }, window, cx);
        true
    }

    /// Re-enable software keyboard requests after explicit dismissal when native `UITextInput`
    /// focuses or updates editable selection.
    pub fn restore_software_keyboard_on_focus(&mut self) {
        self.keyboard_toolbar_dismissed = false;
    }

    /// Restore or update document-level selection directly between two interned
    /// [`SelectionEndpointAnchor`] endpoints (e.g. when UIKit reads `selectedTextRange` on a
    /// cross-block selection and writes the exact two-token range back).
    pub fn select_between_anchors(
        &mut self,
        start: SelectionEndpointAnchor,
        end: SelectionEndpointAnchor,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        self.keyboard_toolbar_dismissed = false;
        match (start, end) {
            (SelectionEndpointAnchor::TableCell(a), SelectionEndpointAnchor::TableCell(b)) => {
                let Some(cell) = self.table_cell.as_mut() else {
                    return false;
                };
                let max = cell.input.text.encode_utf16().count();
                let lo = a.min(b).min(max);
                let hi = a.max(b).min(max);
                cell.input.selection = lo..hi;
                cx.notify();
                true
            }
            (SelectionEndpointAnchor::Doc(start_pt), SelectionEndpointAnchor::Doc(end_pt)) => {
                let (anchor, raw_focus) = if let Some((
                    SelectionEndpointAnchor::Doc(prev_start),
                    SelectionEndpointAnchor::Doc(prev_end),
                )) = self.ordered_selection_endpoints()
                {
                    if end_pt == prev_end && start_pt != prev_start {
                        (end_pt, start_pt)
                    } else {
                        (start_pt, end_pt)
                    }
                } else {
                    (start_pt, end_pt)
                };
                let Some(focus) = self.constrain_selection_focus_domain(&anchor, raw_focus) else {
                    return false;
                };
                self.select_document_range(DocumentSelection { anchor, focus }, window, cx);
                true
            }
            _ => false,
        }
    }

    /// Execute editor-authoritative `Copy` (rich multi-MIME slice + HTML + Markdown + plain).
    pub fn selection_copy(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.run_selection_copy(None, window, cx);
        self.touch_selection_menu_open = false;
        cx.notify();
    }

    /// Execute editor-authoritative `Cut` (blocked in read-only modes).
    pub fn selection_cut(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.run_selection_cut(None, window, cx);
        self.touch_selection_menu_open = false;
        cx.notify();
    }

    /// Execute editor-authoritative `Paste` (reads multi-MIME `ClipboardItem`, blocked in read-only modes).
    pub fn selection_paste(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.run_selection_paste(None, window, cx);
        self.touch_selection_menu_open = false;
        cx.notify();
    }

    /// Execute editor-authoritative `Select All`.
    pub fn selection_select_all(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.run_selection_select_all(None, window, cx);
        self.bump_selection_menu_request_seq();
        cx.notify();
    }
}
