//! Document-level viewport selection geometry, authoritative action mask,
//! menu request sequence, and cross-block handle drag for native mobile hosts.

use ui::{Bounds, Pixels, Window, point, px};

mod doc_text;
mod drag;

pub use drag::SelectionEndpointAnchor;

use crate::{
    PlaygroundMode, PlaygroundView, TOPBAR_HEIGHT,
    block_flow::FlowRect,
    edgeless::{NOTE_CARD_PADDING, rotate_point_around},
};

/// Bitmask bit permitting `Copy` in the native selection menu.
pub const SELECTION_ACTION_COPY: u32 = 1 << 0;
/// Bitmask bit permitting `Cut` in the native selection menu.
pub const SELECTION_ACTION_CUT: u32 = 1 << 1;
/// Bitmask bit permitting `Paste` in the native selection menu.
pub const SELECTION_ACTION_PASTE: u32 = 1 << 2;
/// Bitmask bit permitting `Select All` in the native selection menu.
pub const SELECTION_ACTION_SELECT_ALL: u32 = 1 << 3;

/// Viewport-coordinate rectangle (`dp`/`pt`) with per-endpoint BiDi direction.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SelectionRectGeometry {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub is_rtl: bool,
    pub contains_start: bool,
    pub contains_end: bool,
}

impl SelectionRectGeometry {
    pub(super) fn from_bounds(b: Bounds<Pixels>, is_rtl: bool) -> Self {
        Self {
            x: f32::from(b.origin.x),
            y: f32::from(b.origin.y),
            width: f32::from(b.size.width).max(1.0),
            height: f32::from(b.size.height).max(1.0),
            is_rtl,
            contains_start: false,
            contains_end: false,
        }
    }

    fn right(&self) -> f32 {
        self.x + self.width
    }

    fn bottom(&self) -> f32 {
        self.y + self.height
    }
}

/// Complete document-level selection geometry and capabilities snapshot for native hosts.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DocumentSelectionGeometry {
    pub has_selection: bool,
    pub is_collapsed: bool,
    pub is_reversed: bool,
    pub start_caret: SelectionRectGeometry,
    pub end_caret: SelectionRectGeometry,
    pub start_visible: bool,
    pub end_visible: bool,
    pub selection_rects: Vec<SelectionRectGeometry>,
    pub menu_anchor_rect: SelectionRectGeometry,
    pub menu_anchor_visible: bool,
    pub action_mask: u32,
    pub menu_request_seq: u64,
    pub menu_suppressed_for_motion: bool,
    pub visible_top: f32,
    pub visible_bottom: f32,
}

fn is_strong_rtl_char(ch: char) -> bool {
    let cp = ch as u32;
    matches!(
        cp,
        0x0590..=0x05FF
            | 0x0600..=0x06FF
            | 0x0750..=0x077F
            | 0x08A0..=0x08FF
            | 0xFB1D..=0xFDFF
            | 0xFE70..=0xFEFF
    )
}

fn is_strong_ltr_char(ch: char) -> bool {
    ch.is_ascii_alphabetic()
        || matches!(
            ch as u32,
            0x00C0..=0x024F | 0x0370..=0x052F | 0x1E00..=0x1EFF
        )
}

fn paragraph_is_rtl(text: &str) -> bool {
    for ch in text.chars() {
        if is_strong_rtl_char(ch) {
            return true;
        }
        if is_strong_ltr_char(ch) {
            return false;
        }
    }
    false
}

fn char_at_utf16_offset(text: &str, utf16_offset: usize) -> Option<char> {
    let mut cur = 0usize;
    for ch in text.chars() {
        let len = ch.len_utf16();
        if utf16_offset < cur + len {
            return Some(ch);
        }
        cur += len;
    }
    None
}

pub(super) fn endpoint_is_rtl(text: &str, utf16_offset: usize, is_end: bool) -> bool {
    let base = paragraph_is_rtl(text);
    let total: usize = text.encode_utf16().count();
    if total == 0 {
        return base;
    }
    let idx = if is_end {
        utf16_offset.saturating_sub(1).min(total - 1)
    } else {
        utf16_offset.min(total - 1)
    };
    if let Some(ch) = char_at_utf16_offset(text, idx) {
        if is_strong_rtl_char(ch) {
            return true;
        }
        if is_strong_ltr_char(ch) {
            return false;
        }
    }
    base
}

fn rect_intersects_viewport(r: SelectionRectGeometry, vw: f32, top: f32, bottom: f32) -> bool {
    r.height > 0.0 && r.bottom() > top && r.y < bottom && r.right() > 0.0 && r.x < vw
}

impl PlaygroundView {
    /// Increment the monotonic menu-request sequence so native hosts reliably re-present
    /// the system edit menu (e.g. on repeated long-press of the same word).
    pub fn bump_selection_menu_request_seq(&mut self) {
        self.selection_menu_request_seq = self.selection_menu_request_seq.wrapping_add(1);
    }

    /// Current monotonic selection menu request counter.
    pub fn selection_menu_request_seq(&self) -> u64 {
        self.selection_menu_request_seq
    }

    /// Visible editing band `[visible_top, visible_bottom]` excluding the top bar,
    /// docked software keyboard inset, and mobile `KeyboardToolbar`.
    fn visible_editing_band(&self, window: &Window) -> (f32, f32, f32) {
        let vp = window.viewport_size();
        let vw = f32::from(vp.width).max(self.window_size.0).max(1.0);
        let vh = f32::from(vp.height).max(self.window_size.1).max(1.0);
        let bottom_inset = self
            .effective_ime_bottom(window)
            .max(self.ime_insets.last_bottom);
        let avail_win_h = (vh - bottom_inset).max(TOPBAR_HEIGHT);
        let toolbar_h = self.overlays.keyboard_toolbar_reserved_height(avail_win_h);
        let vis_top = TOPBAR_HEIGHT;
        let vis_bottom = (vh - bottom_inset - toolbar_h).max(vis_top);
        (vw, vis_top, vis_bottom)
    }

    fn is_selection_suppressed_by_overlay(&self) -> bool {
        self.database_record_sheet.is_some()
            || self.overlays.bookmark_prompt().is_some()
            || self.overlays.equation_editor().is_some()
            || self.overlays.link_field().is_some()
            || self.overlays.slash_menu().is_some()
    }

    fn is_motion_suppressing_menu(&self, window: &Window) -> bool {
        self.native_selection_drag_active
            || self.editor.dragging
            || (self.touch_long_press_anchor.is_some() && window.active_touch_count() > 0)
            || self.page_scroll_fling.is_some()
            || self.code_scroll_fling.is_some()
            || self.edgeless_pan_fling.is_some()
            || self.touch_scroll_axis_lock.is_some()
            || window.active_touch_count() > 0
    }

    fn compute_action_mask(
        &self,
        has_selection: bool,
        is_collapsed: bool,
        has_selectable_text: bool,
    ) -> u32 {
        if !has_selection {
            return 0;
        }
        let is_readonly = match self.mode {
            PlaygroundMode::Page => self.page_readonly,
            PlaygroundMode::Edgeless => {
                self.edgeless_readonly || self.edgeless_readonly_selection_target.is_some()
            }
        };
        let mut mask = 0u32;
        if !is_collapsed {
            mask |= SELECTION_ACTION_COPY;
            if !is_readonly {
                mask |= SELECTION_ACTION_CUT | SELECTION_ACTION_PASTE;
            }
        } else if !is_readonly {
            mask |= SELECTION_ACTION_PASTE;
        }
        if has_selectable_text {
            mask |= SELECTION_ACTION_SELECT_ALL;
        }
        mask
    }

    fn build_menu_anchor(
        rects: &[SelectionRectGeometry],
        start_caret: SelectionRectGeometry,
        end_caret: SelectionRectGeometry,
        vw: f32,
        vis_top: f32,
        vis_bottom: f32,
    ) -> (SelectionRectGeometry, bool) {
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut any = false;
        let mut include = |r: SelectionRectGeometry| {
            let cy0 = r.y.max(vis_top);
            let cy1 = r.bottom().min(vis_bottom);
            let cx0 = r.x.max(0.0);
            let cx1 = r.right().min(vw);
            if cy1 > cy0 && cx1 > cx0 {
                min_x = min_x.min(cx0);
                min_y = min_y.min(cy0);
                max_x = max_x.max(cx1);
                max_y = max_y.max(cy1);
                any = true;
            }
        };
        if rects.is_empty() {
            include(start_caret);
            include(end_caret);
        } else {
            for &r in rects {
                include(r);
            }
        }
        if !any {
            return (SelectionRectGeometry::default(), false);
        }
        (
            SelectionRectGeometry {
                x: min_x,
                y: min_y,
                width: (max_x - min_x).max(2.0),
                height: (max_y - min_y).max(2.0),
                is_rtl: start_caret.is_rtl,
                contains_start: true,
                contains_end: true,
            },
            true,
        )
    }

    /// Document-level viewport selection geometry, visibility flags, authoritative
    /// `SelectionActionMask`, and monotonic `menu_request_seq`.
    pub fn document_selection_geometry(&self, window: &Window) -> DocumentSelectionGeometry {
        let (vw, vis_top, vis_bottom) = self.visible_editing_band(window);
        let motion_suppressed = self.is_motion_suppressing_menu(window);
        let mut out = DocumentSelectionGeometry {
            menu_request_seq: self.selection_menu_request_seq,
            menu_suppressed_for_motion: motion_suppressed,
            visible_top: vis_top,
            visible_bottom: vis_bottom,
            ..DocumentSelectionGeometry::default()
        };
        if self.is_selection_suppressed_by_overlay() {
            return out;
        }

        // 1. Edgeless mode: Note / EdgelessText (editable or read-only word selection).
        if self.mode == PlaygroundMode::Edgeless {
            let Some((spatial_id, is_note)) = self
                .edgeless
                .authoring
                .editing_spatial_block()
                .map(|(id, n)| (id.to_string(), n))
                .or_else(|| self.edgeless_readonly_selection_target.clone())
            else {
                return out;
            };
            let Some(sel) = self.editor.selection.as_ref() else {
                return out;
            };
            let Some(layout) = self.edgeless.cached_block_layout(&spatial_id, is_note) else {
                return out;
            };
            let Some(item) = self
                .edgeless
                .authoring
                .painted_items
                .iter()
                .find(|i| i.id == spatial_id)
            else {
                return out;
            };
            let Some((start, end, _, _, backward)) = sel.ordered(&layout) else {
                return out;
            };
            let Some(sr) = layout
                .block(&start.block_id)
                .and_then(|b| b.caret_rect(start.caret))
            else {
                return out;
            };
            let Some(er) = layout
                .block(&end.block_id)
                .and_then(|b| b.caret_rect(end.caret))
            else {
                return out;
            };
            let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
            let vp = point(px(0.0), px(TOPBAR_HEIGHT));
            let to_screen = |r: FlowRect| {
                let lx = item.rect.x + (r.x + pad) * item.scale;
                let ly = item.rect.y + (r.y + pad) * item.scale;
                let (cx_w, cy_w) = item.rect.center();
                let (wx, wy) = rotate_point_around(lx, ly, cx_w, cy_w, item.rotate_deg);
                let p = self
                    .edgeless
                    .camera
                    .world_to_screen(point(px(wx), px(wy)), vp);
                let z = self.edgeless.camera.zoom * item.scale;
                Bounds::new(p, ui::size(px((r.w * z).max(1.0)), px((r.h * z).max(1.0))))
            };
            let start_text = self.block_text(&start.block_id).unwrap_or("");
            let end_text = self.block_text(&end.block_id).unwrap_or("");
            let start_rtl = endpoint_is_rtl(start_text, start.offset() as usize, false);
            let end_rtl = endpoint_is_rtl(end_text, end.offset() as usize, true);
            let mut start_caret = SelectionRectGeometry::from_bounds(to_screen(sr), start_rtl);
            let mut end_caret = SelectionRectGeometry::from_bounds(to_screen(er), end_rtl);
            let raw_rects = self.painted_selection_rects(&layout);
            let count = raw_rects.len();
            let rects: Vec<SelectionRectGeometry> = raw_rects
                .into_iter()
                .enumerate()
                .map(|(i, r)| {
                    let mut g = SelectionRectGeometry::from_bounds(to_screen(r), start_rtl);
                    g.contains_start = i == 0;
                    g.contains_end = i + 1 == count;
                    g
                })
                .collect();
            if !sel.empty()
                && (start_caret.y - end_caret.y).abs() < 1.0
                && (start_caret.x - end_caret.x).abs() < 0.5
                && let (Some(first), Some(last)) = (rects.first(), rects.last())
            {
                if start_rtl {
                    start_caret.x = first.right();
                    end_caret.x = last.x;
                } else {
                    start_caret.x = first.x;
                    end_caret.x = last.right();
                }
            }
            let is_collapsed = sel.empty();
            let has_text = !start_text.is_empty() || !end_text.is_empty();
            out.has_selection = true;
            out.is_collapsed = is_collapsed;
            out.is_reversed = backward;
            out.start_caret = start_caret;
            out.end_caret = end_caret;
            out.start_visible = rect_intersects_viewport(start_caret, vw, vis_top, vis_bottom);
            out.end_visible = rect_intersects_viewport(end_caret, vw, vis_top, vis_bottom);
            let (anchor, anchor_vis) =
                Self::build_menu_anchor(&rects, start_caret, end_caret, vw, vis_top, vis_bottom);
            out.selection_rects = rects;
            out.menu_anchor_rect = anchor;
            out.menu_anchor_visible = anchor_vis && !motion_suppressed;
            out.action_mask = self.compute_action_mask(true, is_collapsed, has_text);
            return out;
        }

        // 2. Page mode: in-place table cell selection.
        if let Some(cell) = self.table_cell.as_ref() {
            let Some(layout) = self.flow_layout() else {
                return out;
            };
            let disp = cell.input.display_text();
            let max_u16 = disp.encode_utf16().count();
            let (sel_range, _) = cell.input.shown_selection();
            let s = sel_range.start.min(max_u16);
            let e = sel_range.end.min(max_u16).max(s);
            let is_collapsed = s == e;
            let Some(sb) = self
                .table_cell_selection_bounds(s..s, &layout, window)
                .into_iter()
                .next()
            else {
                return out;
            };
            let Some(eb) = self
                .table_cell_selection_bounds(e..e, &layout, window)
                .into_iter()
                .next()
            else {
                return out;
            };
            let start_rtl = endpoint_is_rtl(&disp, s, false);
            let end_rtl = endpoint_is_rtl(&disp, e, true);
            let start_caret = SelectionRectGeometry::from_bounds(sb, start_rtl);
            let end_caret = SelectionRectGeometry::from_bounds(eb, end_rtl);
            let raw_rects = if is_collapsed {
                Vec::new()
            } else {
                self.table_cell_selection_bounds(s..e, &layout, window)
            };
            let count = raw_rects.len();
            let rects: Vec<SelectionRectGeometry> = raw_rects
                .into_iter()
                .enumerate()
                .map(|(i, b)| {
                    let mut g = SelectionRectGeometry::from_bounds(b, start_rtl);
                    g.contains_start = i == 0;
                    g.contains_end = i + 1 == count;
                    g
                })
                .collect();
            out.has_selection = true;
            out.is_collapsed = is_collapsed;
            out.is_reversed = cell.input.reversed;
            out.start_caret = start_caret;
            out.end_caret = end_caret;
            out.start_visible = rect_intersects_viewport(start_caret, vw, vis_top, vis_bottom);
            out.end_visible = rect_intersects_viewport(end_caret, vw, vis_top, vis_bottom);
            let (anchor, anchor_vis) =
                Self::build_menu_anchor(&rects, start_caret, end_caret, vw, vis_top, vis_bottom);
            out.selection_rects = rects;
            out.menu_anchor_rect = anchor;
            out.menu_anchor_visible = anchor_vis && !motion_suppressed;
            out.action_mask =
                self.compute_action_mask(true, is_collapsed, !cell.input.text.is_empty());
            return out;
        }

        // 3. Page mode: body text selection (single-block or cross-block).
        // Non-text block selection (`block_selection` with `selection == None`) returns
        // `has_selection = false` and `action_mask = 0` so no text selection menu appears.
        let Some(sel) = self.editor.selection.as_ref() else {
            return out;
        };
        let Some(layout) = self.flow_layout() else {
            return out;
        };
        let Some((start, end, _, _, backward)) = sel.ordered(&layout) else {
            return out;
        };
        let Some(sr) = layout
            .block(&start.block_id)
            .and_then(|b| b.caret_rect(start.caret))
        else {
            return out;
        };
        let Some(er) = layout
            .block(&end.block_id)
            .and_then(|b| b.caret_rect(end.caret))
        else {
            return out;
        };
        let start_scroll = self.overlays.code_scroll_x(&start.block_id);
        let end_scroll = self.overlays.code_scroll_x(&end.block_id);
        let sr = FlowRect::new(sr.x - start_scroll, sr.y, sr.w, sr.h);
        let er = FlowRect::new(er.x - end_scroll, er.y, er.w, er.h);
        let start_text = self.block_text(&start.block_id).unwrap_or("");
        let end_text = self.block_text(&end.block_id).unwrap_or("");
        let start_rtl = endpoint_is_rtl(start_text, start.offset() as usize, false);
        let end_rtl = endpoint_is_rtl(end_text, end.offset() as usize, true);
        let mut start_caret =
            SelectionRectGeometry::from_bounds(self.screen_rect(sr, window), start_rtl);
        let mut end_caret =
            SelectionRectGeometry::from_bounds(self.screen_rect(er, window), end_rtl);
        let raw_rects = self.painted_selection_rects(&layout);
        let count = raw_rects.len();
        let rects: Vec<SelectionRectGeometry> = raw_rects
            .into_iter()
            .enumerate()
            .map(|(i, r)| {
                let mut g =
                    SelectionRectGeometry::from_bounds(self.screen_rect(r, window), start_rtl);
                g.contains_start = i == 0;
                g.contains_end = i + 1 == count;
                g
            })
            .collect();
        // Guard single-line mixed BiDi spans where logical start/end carets share an X coordinate.
        if !sel.empty()
            && (start_caret.y - end_caret.y).abs() < 1.0
            && (start_caret.x - end_caret.x).abs() < 0.5
            && let (Some(first), Some(last)) = (rects.first(), rects.last())
        {
            if start_rtl {
                start_caret.x = first.right();
                end_caret.x = last.x;
            } else {
                start_caret.x = first.x;
                end_caret.x = last.right();
            }
        }
        let is_collapsed = sel.empty();
        let has_text = !start_text.is_empty()
            || !end_text.is_empty()
            || layout
                .blocks
                .iter()
                .any(|b| b.editable() && !b.body.plain.is_empty());
        out.has_selection = true;
        out.is_collapsed = is_collapsed;
        out.is_reversed = backward;
        out.start_caret = start_caret;
        out.end_caret = end_caret;
        out.start_visible = rect_intersects_viewport(start_caret, vw, vis_top, vis_bottom);
        out.end_visible = rect_intersects_viewport(end_caret, vw, vis_top, vis_bottom);
        let (anchor, anchor_vis) =
            Self::build_menu_anchor(&rects, start_caret, end_caret, vw, vis_top, vis_bottom);
        out.selection_rects = rects;
        out.menu_anchor_rect = anchor;
        out.menu_anchor_visible = anchor_vis && !motion_suppressed;
        out.action_mask = self.compute_action_mask(true, is_collapsed, has_text);
        out
    }
}

#[cfg(test)]
mod tests {
    use ui::{
        AppContext, Bounds, HeadlessPlatform, WindowBounds, WindowHandle, WindowOptions, point, px,
        size,
    };

    use super::*;
    use crate::{
        FormFactor, PlaygroundOptions,
        block_flow::page_geometry,
        editor_session::{DocPoint, DocumentSelection},
    };

    fn open_touch_view(
        native_selection_ui: bool,
        page_readonly: bool,
        edgeless_readonly: bool,
    ) -> (
        std::rc::Rc<HeadlessPlatform>,
        ui::ApplicationHandle,
        WindowHandle<PlaygroundView>,
        ui::HeadlessWindow,
    ) {
        let platform = HeadlessPlatform::new(390, 844, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let mut options = PlaygroundOptions::for_form_factor(FormFactor::Phone);
        options.native_selection_ui = native_selection_ui;
        options.page_readonly = page_readonly;
        options.edgeless_readonly = edgeless_readonly;
        let win = app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |window, cx| {
                    window.set_touch_gestures_enabled(true);
                    cx.new(|cx| PlaygroundView::with_options(options, cx))
                },
            )
            .unwrap()
        });
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();
        (platform, app, win, hw)
    }

    #[test]
    fn native_selection_ui_suppresses_gpu_menu_and_bumps_seq_on_repeat_long_press() {
        let (platform, app, win, hw) = open_touch_view(true, false, true);
        let (target_x, target_y) = app.update(|cx| {
            win.read_with(cx, |v, _| {
                let layout = v.flow_layout().unwrap();
                let block = layout
                    .blocks
                    .iter()
                    .find(|b| b.editable() && b.body.plain.contains("y-octo"))
                    .unwrap();
                let geom = page_geometry(390.0);
                (
                    geom.column_x + block.x + 60.0,
                    TOPBAR_HEIGHT + block.y + 12.0,
                )
            })
            .unwrap()
        });

        let seq0 = app.update(|cx| {
            win.read_with(cx, |v, _| v.selection_menu_request_seq())
                .unwrap()
        });
        let run_touch_lp = |tid: u64| {
            hw.dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                id: ui::TouchId(tid),
                phase: ui::TouchPhase::Started,
                position: point(px(target_x), px(target_y)),
                predicted_position: None,
                force: None,
            }));
            platform.advance_clock(std::time::Duration::from_millis(600));
            hw.request_frame();
            hw.dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                id: ui::TouchId(tid),
                phase: ui::TouchPhase::Ended,
                position: point(px(target_x), px(target_y)),
                predicted_position: None,
                force: None,
            }));
            hw.request_frame();
        };
        run_touch_lp(1);
        app.update(|cx| {
            win.update(cx, |v, w, _| {
                assert!(!v.touch_selection_menu_open);
                let g = v.document_selection_geometry(w);
                assert!(g.has_selection && !g.is_collapsed);
                assert!(g.start_visible && g.end_visible);
                assert!(g.menu_anchor_visible);
                assert_eq!(
                    g.action_mask,
                    SELECTION_ACTION_COPY
                        | SELECTION_ACTION_CUT
                        | SELECTION_ACTION_PASTE
                        | SELECTION_ACTION_SELECT_ALL
                );
                assert!(g.menu_request_seq > seq0);
            })
            .unwrap();
        });
        let seq1 = app.update(|cx| {
            win.read_with(cx, |v, _| v.selection_menu_request_seq())
                .unwrap()
        });
        // Real second long-press on the exact same word must bump menu_request_seq again.
        run_touch_lp(2);
        let seq2 = app.update(|cx| {
            win.read_with(cx, |v, _| v.selection_menu_request_seq())
                .unwrap()
        });
        assert!(seq2 > seq1);

        // Cancelled touch mid-long-press must immediately clear `touch_long_press_anchor`
        // so `menu_suppressed_for_motion` never sticks `true`.
        hw.dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
            id: ui::TouchId(3),
            phase: ui::TouchPhase::Started,
            position: point(px(target_x), px(target_y)),
            predicted_position: None,
            force: None,
        }));
        platform.advance_clock(std::time::Duration::from_millis(600));
        hw.request_frame();
        hw.dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
            id: ui::TouchId(3),
            phase: ui::TouchPhase::Cancelled,
            position: point(px(target_x), px(target_y)),
            predicted_position: None,
            force: None,
        }));
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, |v, w, _| {
                assert!(v.touch_long_press_anchor.is_none());
                assert!(!v.document_selection_geometry(w).menu_suppressed_for_motion);
            })
            .unwrap();
        });
    }

    #[test]
    fn action_mask_enforces_readonly_collapsed_and_non_text_block_rules() {
        let (_platform, app, win, _hw) = open_touch_view(true, true, true);
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                let layout = v.flow_layout().unwrap();
                let block = layout
                    .blocks
                    .iter()
                    .find(|b| b.editable() && b.body.plain.len() > 8)
                    .unwrap();
                let id = block.block_id.clone();
                // Non-collapsed selection in page_readonly=true: COPY | SELECT_ALL only.
                v.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new(&id, 0),
                        focus: DocPoint::new(&id, 5),
                    },
                    w,
                    cx,
                );
                let g = v.document_selection_geometry(w);
                assert_eq!(
                    g.action_mask,
                    SELECTION_ACTION_COPY | SELECTION_ACTION_SELECT_ALL
                );
                // Collapsed caret in page_readonly=true: never COPY/CUT/PASTE.
                v.select_document_range(DocumentSelection::caret(DocPoint::new(&id, 2)), w, cx);
                let g_collapsed = v.document_selection_geometry(w);
                assert_eq!(g_collapsed.action_mask & SELECTION_ACTION_COPY, 0);
                assert_eq!(g_collapsed.action_mask & SELECTION_ACTION_CUT, 0);
                assert_eq!(g_collapsed.action_mask & SELECTION_ACTION_PASTE, 0);

                // Non-text block selection: has_selection=false, action_mask=0.
                v.editor.selection = None;
                v.editor.block_selection = vec!["showcase-divider".to_string()];
                let g_block = v.document_selection_geometry(w);
                assert!(!g_block.has_selection);
                assert_eq!(g_block.action_mask, 0);
            })
            .unwrap();
        });
    }

    #[test]
    fn cross_block_handle_drag_and_scroll_visibility_work_in_document_coords() {
        let (_platform, app, win, hw) = open_touch_view(true, false, true);
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                let layout = v.flow_layout().unwrap();
                let editable: Vec<_> = layout
                    .blocks
                    .iter()
                    .filter(|b| {
                        b.editable()
                            && !matches!(b.body.kind, crate::block_flow::FlowKind::Title)
                            && b.body.plain.len() > 10
                    })
                    .take(2)
                    .collect();
                assert_eq!(editable.len(), 2);
                let id0 = editable[0].block_id.clone();
                let id1 = editable[1].block_id.clone();
                let geom = page_geometry(390.0);
                let p1_x = geom.column_x + editable[1].x + 40.0;
                let p1_y = TOPBAR_HEIGHT + editable[1].y + 12.0;

                v.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new(&id0, 0),
                        focus: DocPoint::new(&id0, 4),
                    },
                    w,
                    cx,
                );
                assert!(v.begin_document_selection_drag(2, w));
                assert!(v.update_document_selection_drag(p1_x, p1_y, w, cx));
                let during = v.document_selection_geometry(w);
                assert!(during.menu_suppressed_for_motion);
                assert!(!during.menu_anchor_visible);
                v.end_document_selection_drag(w, cx);

                let sel = v.document_selection().unwrap();
                assert_eq!(sel.anchor.block_id, id0);
                assert_eq!(sel.focus.block_id, id1);

                // Copy cross-block selection and verify both blocks are in the clipboard slice.
                v.selection_copy(w, cx);
                let clip = cx.read_from_clipboard().expect("clipboard item");
                let (slice, rich) = crate::clipboard::read_slice(&clip).expect("slice");
                assert!(rich);
                assert!(slice.content.len() >= 2);
            })
            .unwrap();
        });
        hw.request_frame();
    }

    #[test]
    fn native_selection_ui_suppresses_floating_format_buttons_but_keeps_link_input() {
        let (platform, app, win, hw) = open_touch_view(true, false, true);
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                let layout = v.flow_layout().unwrap();
                let id = layout
                    .blocks
                    .iter()
                    .find(|b| {
                        b.editable()
                            && !matches!(b.body.kind, crate::block_flow::FlowKind::Title)
                            && b.body.plain.len() > 10
                    })
                    .unwrap()
                    .block_id
                    .clone();
                v.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new(&id, 0),
                        focus: DocPoint::new(&id, 5),
                    },
                    w,
                    cx,
                );
                v.keyboard_toolbar_dismissed = true;
                v.overlays.set_keyboard_toolbar_visible(false);
            })
            .unwrap();
        });
        hw.request_frame();
        let snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(
            !snap.elements.contains_key("overlay.format_toolbar"),
            "native_selection_ui must suppress desktop floating format buttons even when keyboard_toolbar is hidden"
        );

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    crate::overlays::OverlayEvent::KeyboardToolbar(
                        crate::overlays::KeyboardToolbarAction::Link,
                    ),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(std::time::Duration::from_millis(200));
        hw.request_frame();
        let link_snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(
            link_snap
                .elements
                .contains_key("overlay.format_toolbar.link_input"),
            "KeyboardToolbarAction::Link must still open the single-row link input bar"
        );
        assert!(
            !link_snap
                .elements
                .contains_key("overlay.format_toolbar.bold"),
            "single-row link input bar must not render duplicate floating format buttons"
        );
    }

    #[test]
    fn empty_editable_paragraph_long_press_bumps_menu_seq_for_paste() {
        let (platform, app, win, hw) = open_touch_view(true, false, true);
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.load_empty_page_document(w, cx);
            })
            .unwrap();
        });
        hw.request_frame();
        let (tx, ty, seq_before) = app.update(|cx| {
            win.update(cx, |v, w, _| {
                let g = v.document_selection_geometry(w);
                (
                    g.start_caret.x + 8.0,
                    g.start_caret.y + 8.0,
                    v.selection_menu_request_seq(),
                )
            })
            .unwrap()
        });

        // Simulate real 550ms touch long-press on the empty paragraph.
        hw.dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
            id: ui::TouchId(1),
            phase: ui::TouchPhase::Started,
            position: point(px(tx), px(ty)),
            predicted_position: None,
            force: None,
        }));
        platform.advance_clock(std::time::Duration::from_millis(600));
        hw.request_frame();
        hw.dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
            id: ui::TouchId(1),
            phase: ui::TouchPhase::Ended,
            position: point(px(tx), px(ty)),
            predicted_position: None,
            force: None,
        }));
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |v, w, _| {
                let g = v.document_selection_geometry(w);
                assert!(g.has_selection && g.is_collapsed);
                assert_ne!(g.action_mask & SELECTION_ACTION_PASTE, 0);
                assert!(
                    g.menu_request_seq > seq_before,
                    "long-pressing an empty editable paragraph must bump menu_request_seq (before={seq_before}, after={})",
                    g.menu_request_seq
                );
            })
            .unwrap();
        });
    }

    #[test]
    fn edgeless_spatial_word_roundtrips_via_viewport_points_and_clamps_drag() {
        let (_platform, app, win, hw) = open_touch_view(true, false, true);
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                let mut state = crate::room_client::DocState::new("edgeless-tsel", 501).unwrap();
                state
                    .workspace
                    .create_page(crate::HOME_PAGE_ID, "Board", 1)
                    .unwrap();
                {
                    let page = state.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
                    page.add_block(
                        "root",
                        blocksuite_playground_doc::schema::BlockSpec::Page {
                            title: "Board".into(),
                        },
                        None,
                        None,
                        1,
                    )
                    .unwrap();
                    page.add_block(
                        "surf",
                        blocksuite_playground_doc::schema::BlockSpec::Surface,
                        Some("root"),
                        None,
                        2,
                    )
                    .unwrap();
                    page.add_block(
                        "note-1",
                        blocksuite_playground_doc::schema::BlockSpec::Note {
                            xywh: Some("[60,80,260,140]".into()),
                        },
                        Some("root"),
                        None,
                        3,
                    )
                    .unwrap();
                    page.add_block(
                        "np-1",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "SpatialWord SecondWord".into(),
                        },
                        Some("note-1"),
                        None,
                        4,
                    )
                    .unwrap();
                }
                v.set_document(state, cx);
                v.set_mode(PlaygroundMode::Edgeless, w, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                // Select "SpatialWord" in read-only Edgeless Note via long-press, then feed
                // the GPU-reported start/end caret viewport coordinates back into
                // `select_between_viewport_points` (viewport roundtrip probe).
                v.edgeless_readonly_selection_target = Some(("note-1".into(), true));
                v.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new("np-1", 0),
                        focus: DocPoint::new("np-1", 11),
                    },
                    w,
                    cx,
                );
                let g = v.document_selection_geometry(w);
                assert!(g.has_selection && !g.is_collapsed);
                let ax = g.start_caret.x + 0.1;
                let ay = g.start_caret.y + g.start_caret.height * 0.5;
                let fx = g.end_caret.x - 0.1;
                let fy = g.end_caret.y + g.end_caret.height * 0.5;
                assert!(v.select_between_viewport_points(ax, ay, fx, fy, w, cx));
                v.selection_copy(w, cx);
                let copied = cx
                    .read_from_clipboard()
                    .and_then(|c| c.text())
                    .unwrap_or_default();
                assert_eq!(
                    copied, "SpatialWord",
                    "Edgeless viewport roundtrip must preserve full 'SpatialWord'"
                );

                // Dragging End handle outside the Note's right edge must clamp cleanly to end of line.
                assert!(v.begin_document_selection_drag(2, w));
                assert!(v.update_document_selection_drag(380.0, fy, w, cx));
                v.end_document_selection_drag(w, cx);
                v.selection_copy(w, cx);
                let copied_clamped = cx
                    .read_from_clipboard()
                    .and_then(|c| c.text())
                    .unwrap_or_default();
                assert_eq!(copied_clamped, "SpatialWord SecondWord");
            })
            .unwrap();
        });
    }

    #[test]
    fn cjk_and_emoji_utf16_offsets_roundtrip_in_collapsed_hit_and_table_selection() {
        let (_platform, app, win, hw) = open_touch_view(true, false, true);

        app.update(|cx| {
            win.update(cx, |v, _, cx| {
                let mut state = crate::room_client::DocState::new("tsel-cjk-utf16", 502).unwrap();
                state
                    .workspace
                    .create_page(crate::HOME_PAGE_ID, "中文", 1)
                    .unwrap();
                {
                    let page = state.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
                    page.add_block(
                        "root",
                        blocksuite_playground_doc::schema::BlockSpec::Page {
                            title: "中文".into(),
                        },
                        None,
                        None,
                        1,
                    )
                    .unwrap();
                    page.add_block(
                        "note",
                        blocksuite_playground_doc::schema::BlockSpec::Note { xywh: None },
                        Some("root"),
                        None,
                        2,
                    )
                    .unwrap();
                    page.add_block(
                        "p-cjk",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "你好🚀世界".into(),
                        },
                        Some("note"),
                        None,
                        3,
                    )
                    .unwrap();
                    page.add_block(
                        "tbl-cjk",
                        blocksuite_playground_doc::schema::BlockSpec::Table {
                            rows: vec![vec!["表格🚀单元格".into()]],
                        },
                        Some("note"),
                        None,
                        4,
                    )
                    .unwrap();
                }
                v.set_document(state, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                // Position at UTF-16 offset 2 ("你好|🚀世界", byte offset 6 != utf16 offset 2)
                // and verify `focus_collapsed_for_text_hit` returns exact UTF-16 offset 2 (not None).
                v.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new("p-cjk", 2),
                        focus: DocPoint::new("p-cjk", 2),
                    },
                    w,
                    cx,
                );
                let g2 = v.document_selection_geometry(w);
                v.editor.selection = None;
                let off2 = v.focus_collapsed_for_text_hit(
                    g2.start_caret.x,
                    g2.start_caret.y + g2.start_caret.height * 0.5,
                    w,
                    cx,
                );
                assert_eq!(off2, Some(2));

                // Position after surrogate-pair emoji ("你好🚀|世界", utf16 offset 4).
                v.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new("p-cjk", 4),
                        focus: DocPoint::new("p-cjk", 4),
                    },
                    w,
                    cx,
                );
                let g4 = v.document_selection_geometry(w);
                v.editor.selection = None;
                let off4 = v.focus_collapsed_for_text_hit(
                    g4.start_caret.x,
                    g4.start_caret.y + g4.start_caret.height * 0.5,
                    w,
                    cx,
                );
                assert_eq!(off4, Some(4));

                // Focus table cell "表格🚀单元格" (UTF-16 len = 2 + 2 + 3 = 7) and select "🚀单元" (2..6).
                v.dispatch_overlay(
                    crate::overlays::OverlayEvent::FocusTableCell {
                        block_id: "tbl-cjk".into(),
                        row_id: "row-0".into(),
                        column_id: "col-0".into(),
                        screen_pos: None,
                    },
                    w,
                    cx,
                );
                let cell = v.table_cell.as_mut().expect("focused table cell");
                cell.input.selection = 2..6;
                assert_eq!(v.selected_plain_text(), "🚀单元");

                // Table-cell active IME preedit ("甲|" + setMarkedText("ni", 2..2) -> "甲ni|"):
                // doc endpoints and plain_text_between_anchors must report visible 3..3 ("甲ni").
                let cell = v.table_cell.as_mut().expect("focused table cell");
                cell.input.text = "甲".to_string();
                cell.input.selection = 1..1;
                cell.input.preedit = None;
                ui::EntityInputHandler::replace_and_mark_text_in_range(
                    v,
                    None,
                    "ni",
                    Some(2..2),
                    w,
                    cx,
                );
                assert_eq!(
                    v.current_selection_doc_endpoints(),
                    Some((
                        (super::drag::SelectionEndpointAnchor::TableCell(3), 0, 3),
                        (super::drag::SelectionEndpointAnchor::TableCell(3), 0, 3),
                    ))
                );
                assert_eq!(
                    v.plain_text_between_anchors(
                        &super::drag::SelectionEndpointAnchor::TableCell(0),
                        &super::drag::SelectionEndpointAnchor::TableCell(3),
                    ),
                    "甲ni"
                );
                let c1 = v
                    .caret_rect_for_anchor(&super::drag::SelectionEndpointAnchor::TableCell(1), w)
                    .expect("caret at 1");
                let c3 = v
                    .caret_rect_for_anchor(&super::drag::SelectionEndpointAnchor::TableCell(3), w)
                    .expect("caret at 3");
                assert!(
                    c3.x > c1.x + 4.0,
                    "table preedit caret at offset 3 ({}) must advance past offset 1 ({})",
                    c3.x,
                    c1.x
                );
            })
            .unwrap();
        });
    }
}
