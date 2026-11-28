//! Desktop Page-mode thin viewport scrollbar (logical inline-end edge).
//!
//! Hidden in mobile mode (`FormFactor::Phone | FormFactor::Tablet`) to match native
//! mobile scrolling. On desktop Page viewports with `max_scroll > 0`, renders an `8px`
//! rounded translucent thumb along the logical end edge (right in LTR, left in RTL)
//! supporting direct thumb dragging and track page-jump clicks.

use ui::{AnyElement, Context, Direction, MouseButton, MouseDownEvent, div, prelude::*, px};

use crate::{block_flow::PAGE_SURFACE_ID, theme::Palette};

/// Interactive hit-target width of the scrollbar gutter in logical pixels (`>= 24px` hit target).
pub const SCROLLBAR_HIT_WIDTH: f32 = 24.0;
/// Visual width of the scrollbar thumb in logical pixels.
pub const SCROLLBAR_WIDTH: f32 = 8.0;
/// Inset of the visual thumb from the logical inline-end viewport edge in logical pixels.
pub const SCROLLBAR_EDGE_INSET: f32 = 2.0;
/// Top and bottom inset of the scrollbar track in logical pixels.
pub const SCROLLBAR_VERTICAL_INSET: f32 = 4.0;
/// Minimum thumb height in logical pixels so long documents stay easy to grab.
pub const SCROLLBAR_MIN_THUMB: f32 = 32.0;

/// Computed layout metrics for the desktop Page scrollbar in viewport-local coordinates.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScrollbarMetrics {
    /// Left edge of the `24px` interactive hit-target gutter.
    pub hit_x: f32,
    /// Width of the interactive hit-target gutter (`24px`).
    pub hit_w: f32,
    /// Left edge of the `8px` visual bar relative to `hit_x`.
    pub visual_offset_x: f32,
    /// Left edge of the `8px` visual bar in viewport-local coordinates.
    pub track_x: f32,
    pub track_y: f32,
    pub track_w: f32,
    pub track_h: f32,
    pub thumb_top: f32,
    pub thumb_height: f32,
    pub travel: f32,
}

impl ScrollbarMetrics {
    /// Compute scrollbar track and thumb geometry, returning `None` when hidden
    /// (mobile mode or non-scrollable content).
    pub fn compute(
        viewport_width: f32,
        viewport_height: f32,
        scroll_y: f32,
        max_scroll: f32,
        direction: Direction,
        mobile_mode: bool,
    ) -> Option<Self> {
        if mobile_mode
            || max_scroll <= 0.0
            || viewport_height <= 2.0 * SCROLLBAR_VERTICAL_INSET + 1.0
        {
            return None;
        }
        let track_h = (viewport_height - 2.0 * SCROLLBAR_VERTICAL_INSET).floor();
        let content_h = viewport_height + max_scroll;
        let min_thumb = SCROLLBAR_MIN_THUMB.min(track_h);
        let thumb_height = ((viewport_height / content_h) * track_h)
            .clamp(min_thumb, track_h)
            .round();
        let travel = (track_h - thumb_height).max(0.0);
        let ratio = (scroll_y / max_scroll).clamp(0.0, 1.0);
        let thumb_top = (SCROLLBAR_VERTICAL_INSET + ratio * travel).round();
        let (hit_x, visual_offset_x, track_x) = match direction {
            Direction::Ltr => {
                let hx = (viewport_width - SCROLLBAR_HIT_WIDTH).round();
                let vo = (SCROLLBAR_HIT_WIDTH - SCROLLBAR_EDGE_INSET - SCROLLBAR_WIDTH).round();
                (hx, vo, hx + vo)
            }
            Direction::Rtl => {
                let vo = SCROLLBAR_EDGE_INSET.round();
                (0.0, vo, vo)
            }
        };
        Some(Self {
            hit_x,
            hit_w: SCROLLBAR_HIT_WIDTH,
            visual_offset_x,
            track_x,
            track_y: SCROLLBAR_VERTICAL_INSET,
            track_w: SCROLLBAR_WIDTH,
            track_h,
            thumb_top,
            thumb_height,
            travel,
        })
    }

    /// Map a viewport-local Y coordinate and grab offset within the thumb back to `scroll_y`.
    pub fn scroll_y_for_thumb_drag(
        &self,
        local_y: f32,
        grab_offset_y: f32,
        max_scroll: f32,
    ) -> f32 {
        if self.travel <= 0.0 || max_scroll <= 0.0 {
            return 0.0;
        }
        let top = (local_y - grab_offset_y - self.track_y).clamp(0.0, self.travel);
        ((top / self.travel) * max_scroll)
            .clamp(0.0, max_scroll)
            .round()
    }

    /// Compute the new `scroll_y` when clicking the track outside the thumb (page jump).
    pub fn scroll_y_for_track_click(
        &self,
        local_y: f32,
        current_scroll_y: f32,
        viewport_height: f32,
        max_scroll: f32,
    ) -> f32 {
        let step = (viewport_height * 0.9).max(32.0);
        let next = if local_y < self.thumb_top {
            current_scroll_y - step
        } else {
            current_scroll_y + step
        };
        next.clamp(0.0, max_scroll).round()
    }

    /// Whether `local_y` (relative to the page viewport top) hits the thumb.
    pub fn hits_thumb(&self, local_y: f32) -> bool {
        local_y >= self.thumb_top && local_y <= self.thumb_top + self.thumb_height
    }
}

/// Active scrollbar thumb drag session.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScrollbarDrag {
    /// Distance from the thumb's top edge to the pointer grab point (logical px).
    pub grab_offset_y: f32,
}

/// Build the desktop Page-mode scrollbar element positioned at the viewport's logical end edge.
pub fn build_page_scrollbar<V: 'static>(
    metrics: ScrollbarMetrics,
    dragging: bool,
    palette: &Palette,
    on_down: impl Fn(&mut V, &MouseDownEvent, &mut ui::Window, &mut Context<V>) + 'static,
    cx: &mut Context<V>,
) -> AnyElement {
    let thumb_idle = palette
        .text_secondary
        .opacity(if dragging { 0.52 } else { 0.30 });
    let thumb_hover = palette.text_secondary.opacity(0.52);
    let track_hover = palette.hover.opacity(0.35);
    let thumb_offset = (metrics.thumb_top - metrics.track_y).max(0.0);

    div()
        .id("page-scrollbar")
        .group("page-scrollbar")
        .absolute()
        .left(px(metrics.hit_x))
        .top(px(metrics.track_y))
        .w(px(metrics.hit_w))
        .h(px(metrics.track_h))
        .cursor_pointer()
        .on_mouse_down(MouseButton::Left, cx.listener(on_down))
        .snapshot("overlay.page_scrollbar", Some(PAGE_SURFACE_ID))
        .child(
            div()
                .absolute()
                .left(px(metrics.visual_offset_x))
                .top(px(0.0))
                .w(px(metrics.track_w))
                .h(px(metrics.track_h))
                .rounded(px(SCROLLBAR_WIDTH * 0.5))
                .when(dragging, |el| el.bg(track_hover))
                .group_hover("page-scrollbar", move |s| s.bg(track_hover)),
        )
        .child(
            div()
                .absolute()
                .left(px(metrics.visual_offset_x))
                .top(px(thumb_offset))
                .w(px(metrics.track_w))
                .h(px(metrics.thumb_height))
                .rounded(px(SCROLLBAR_WIDTH * 0.5))
                .bg(thumb_idle)
                .group_hover("page-scrollbar", move |s| s.bg(thumb_hover))
                .snapshot(
                    "overlay.page_scrollbar.thumb",
                    Some("overlay.page_scrollbar"),
                ),
        )
        .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrollbar_visibility_and_logical_side() {
        // Hidden on mobile mode or when max_scroll == 0; visible on narrow desktop (e.g. 600px).
        let narrow_desktop =
            ScrollbarMetrics::compute(600.0, 748.0, 0.0, 1200.0, Direction::Ltr, false)
                .expect("600px desktop viewport must display scrollbar");
        assert_eq!(narrow_desktop.track_w, 8.0);
        assert_eq!(narrow_desktop.track_x, 590.0);
        assert_eq!(
            ScrollbarMetrics::compute(1280.0, 748.0, 0.0, 1200.0, Direction::Ltr, true),
            None
        );
        assert_eq!(
            ScrollbarMetrics::compute(1280.0, 748.0, 0.0, 0.0, Direction::Ltr, false),
            None
        );

        // LTR places the 8px bar at the right edge; RTL places it at the left edge.
        let ltr = ScrollbarMetrics::compute(1280.0, 748.0, 0.0, 1496.0, Direction::Ltr, false)
            .expect("desktop LTR scrollbar");
        assert_eq!(ltr.track_w, 8.0);
        assert_eq!(ltr.track_x, 1270.0);
        assert_eq!(ltr.thumb_top, SCROLLBAR_VERTICAL_INSET);
        assert!(ltr.thumb_height >= SCROLLBAR_MIN_THUMB);

        let rtl = ScrollbarMetrics::compute(1280.0, 748.0, 0.0, 1496.0, Direction::Rtl, false)
            .expect("desktop RTL scrollbar");
        assert_eq!(rtl.track_x, SCROLLBAR_EDGE_INSET);
        assert_eq!(rtl.thumb_height, ltr.thumb_height);
    }

    #[test]
    fn scrollbar_min_thumb_drag_and_track_jump() {
        let m = ScrollbarMetrics::compute(1280.0, 748.0, 0.0, 50_000.0, Direction::Ltr, false)
            .expect("very long page scrollbar");
        assert_eq!(m.thumb_height, SCROLLBAR_MIN_THUMB);

        // Dragging thumb to bottom reaches max_scroll.
        let at_bottom = m.scroll_y_for_thumb_drag(m.track_y + m.travel + 10.0, 10.0, 50_000.0);
        assert_eq!(at_bottom, 50_000.0);

        // Dragging thumb to top returns 0.
        let at_top = m.scroll_y_for_thumb_drag(m.track_y + 10.0, 10.0, 50_000.0);
        assert_eq!(at_top, 0.0);

        // Track click below thumb pages down; above thumb pages up.
        let paged_down = m.scroll_y_for_track_click(m.thumb_top + 200.0, 0.0, 748.0, 50_000.0);
        assert!((paged_down - (748.0_f32 * 0.9).round()).abs() <= 1.0);
        let m_mid =
            ScrollbarMetrics::compute(1280.0, 748.0, 10_000.0, 50_000.0, Direction::Ltr, false)
                .expect("mid-scroll scrollbar");
        let paged_up = m_mid.scroll_y_for_track_click(m_mid.track_y, 10_000.0, 748.0, 50_000.0);
        assert!((paged_up - (10_000.0_f32 - 748.0 * 0.9).round()).abs() <= 1.0);
    }
}
