//! Screen-space selection endpoint rects and touch selection action capsule.

use ui::{
    AnyElement, Bounds, Context, FontWeight, MouseButton, Pixels, Window, div, point, prelude::*,
    px,
};

use crate::{
    PlaygroundMode, PlaygroundView, TOPBAR_HEIGHT,
    block_flow::{FlowRect, PAGE_SURFACE_ID},
    edgeless::{NOTE_CARD_PADDING, rotate_point_around},
    theme::Palette,
};

impl PlaygroundView {
    /// Screen-space bounding rectangles `(start_rect, end_rect)` of the active text selection
    /// endpoints for native iOS/Android selection-handle overlays (`J2`).
    pub fn selection_endpoint_rects(
        &self,
        window: &Window,
    ) -> Option<(Bounds<Pixels>, Bounds<Pixels>)> {
        if self.mode == PlaygroundMode::Edgeless {
            let (spatial_id, is_note) = self
                .edgeless
                .authoring
                .editing_spatial_block()
                .map(|(id, n)| (id.to_string(), n))
                .or_else(|| self.edgeless_readonly_selection_target.clone())?;
            let sel = self.editor.selection.as_ref()?;
            let layout = self.edgeless.cached_block_layout(&spatial_id, is_note)?;
            let item = self
                .edgeless
                .authoring
                .painted_items
                .iter()
                .find(|i| i.id == spatial_id)?;
            let (start, end, _, _, _) = sel.ordered(&layout)?;
            let sr = layout.block(&start.block_id)?.caret_rect(start.caret)?;
            let er = layout.block(&end.block_id)?.caret_rect(end.caret)?;
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
            return Some((to_screen(sr), to_screen(er)));
        }
        if let Some(cell) = self.table_cell.as_ref() {
            let layout = self.flow_layout()?;
            let s = cell.input.selection.start;
            let e = cell.input.selection.end;
            let start_b = self
                .table_cell_selection_bounds(s..s, &layout, window)
                .into_iter()
                .next()?;
            let end_b = self
                .table_cell_selection_bounds(e..e, &layout, window)
                .into_iter()
                .next()?;
            return Some((start_b, end_b));
        }
        let sel = self.editor.selection.as_ref()?;
        let layout = self.flow_layout()?;
        let (start, end, _, _, _) = sel.ordered(&layout)?;
        let sr = layout.block(&start.block_id)?.caret_rect(start.caret)?;
        let er = layout.block(&end.block_id)?.caret_rect(end.caret)?;
        Some((self.screen_rect(sr, window), self.screen_rect(er, window)))
    }

    /// Compact touch selection action capsule (`Copy` / `Cut` / `Paste` / `Select All`) shown
    /// after touch long-press selection when no native host menu takes over (`J2`).
    pub(crate) fn render_touch_selection_menu(
        &self,
        palette: &Palette,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        if self.native_selection_ui || !self.touch_selection_menu_open {
            return None;
        }
        let (start_b, end_b) = self.selection_endpoint_rects(window)?;
        let mid_x = (f32::from(start_b.origin.x) + f32::from(end_b.origin.x)) * 0.5;
        let top_y = (f32::from(start_b.origin.y) - 48.0).max(TOPBAR_HEIGHT + 6.0);
        let readonly = self.mode == PlaygroundMode::Edgeless && self.edgeless_readonly;
        let menu_w = if readonly { 72.0 } else { 228.0 };
        let left = (mid_x - menu_w * 0.5)
            .clamp(8.0, (self.window_size.0 - menu_w - 8.0).max(8.0))
            .round();
        let mut bar = div()
            .absolute()
            .left(px(left))
            .top(px(top_y.round()))
            .h(px(40.0))
            .px(px(6.0))
            .rounded(px(8.0))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .flex()
            .items_center()
            .gap(px(4.0))
            .snapshot("overlay.touch_selection_menu", Some(PAGE_SURFACE_ID));
        let btn = |id: &'static str, label: &'static str| {
            div()
                .id(id)
                .px(px(8.0))
                .h(px(36.0))
                .rounded(px(4.0))
                .flex()
                .items_center()
                .text_size(px(12.0))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_primary)
                .cursor_pointer()
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .child(label)
        };
        bar = bar.child(
            btn("touch-sel-copy", "Copy").on_click(cx.listener(|this, _, w, cx| {
                this.run_selection_copy(None, w, cx);
                this.touch_selection_menu_open = false;
                cx.notify();
            })),
        );
        if !readonly {
            bar = bar
                .child(
                    btn("touch-sel-cut", "Cut").on_click(cx.listener(|this, _, w, cx| {
                        this.run_selection_cut(None, w, cx);
                        this.touch_selection_menu_open = false;
                        cx.notify();
                    })),
                )
                .child(
                    btn("touch-sel-paste", "Paste").on_click(cx.listener(|this, _, w, cx| {
                        this.run_selection_paste(None, w, cx);
                        this.touch_selection_menu_open = false;
                        cx.notify();
                    })),
                )
                .child(btn("touch-sel-all", "Select All").on_click(cx.listener(
                    |this, _, w, cx| {
                        this.run_selection_select_all(None, w, cx);
                        this.touch_selection_menu_open = false;
                        cx.notify();
                    },
                )));
        }
        Some(bar.into_any_element())
    }
}
