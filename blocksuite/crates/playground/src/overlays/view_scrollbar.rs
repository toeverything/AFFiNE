//! PlaygroundView glue for desktop Page-mode thin scrollbar thumb dragging and track clicks.

use ui::{Context, MouseDownEvent, Window};

use crate::{PlaygroundView, TOPBAR_HEIGHT};

use super::{ScrollbarDrag, ScrollbarMetrics};

impl PlaygroundView {
    /// Handle left mouse-down on the desktop Page scrollbar (thumb drag or track page-jump).
    pub(crate) fn on_scrollbar_mouse_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        cx.stop_propagation();
        let now_ms = self.now_ms(cx);
        self.overlays.close_context_menu(now_ms);
        let vp_w = self.window_size.0;
        let vp_h = (self.window_size.1 - TOPBAR_HEIGHT).max(0.0);
        let Some(metrics) = ScrollbarMetrics::compute(
            vp_w,
            vp_h,
            self.scroll_y,
            self.max_scroll,
            window.layout_direction(),
            self.form_factor.is_touch_form_factor() || self.edgeless_readonly,
        ) else {
            return;
        };
        let local_y = f32::from(event.position.y) - TOPBAR_HEIGHT;
        if metrics.hits_thumb(local_y) {
            self.scrollbar_drag = Some(ScrollbarDrag {
                grab_offset_y: local_y - metrics.thumb_top,
            });
            self.editor.dragging = false;
        } else {
            self.scroll_y =
                metrics.scroll_y_for_track_click(local_y, self.scroll_y, vp_h, self.max_scroll);
        }
        cx.notify();
    }

    /// Update `scroll_y` while dragging the desktop Page scrollbar thumb.
    pub(crate) fn update_scrollbar_drag(
        &mut self,
        y: f32,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(drag) = self.scrollbar_drag else {
            return false;
        };
        let vp_w = self.window_size.0;
        let vp_h = (self.window_size.1 - TOPBAR_HEIGHT).max(0.0);
        let Some(metrics) = ScrollbarMetrics::compute(
            vp_w,
            vp_h,
            self.scroll_y,
            self.max_scroll,
            window.layout_direction(),
            self.form_factor.is_touch_form_factor() || self.edgeless_readonly,
        ) else {
            self.scrollbar_drag = None;
            return false;
        };
        let local_y = y - TOPBAR_HEIGHT;
        let next = metrics.scroll_y_for_thumb_drag(local_y, drag.grab_offset_y, self.max_scroll);
        if (next - self.scroll_y).abs() > 0.5 {
            self.scroll_y = next;
            cx.notify();
        }
        true
    }
}
