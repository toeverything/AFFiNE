//! Touch gesture handling: inertial flings (`J1`/`T7`), long-press drag selection & action
//! capsule (`J2`), expanded 44pt control hit targets (`T2`), touch link/reference tap (`J4`/`J5`),
//! and read-only Edgeless link/reference tap + long-press word selection (`T6`).

use blocksuite_playground_doc::schema::ListType;
use ui::{
    AnyElement, Bounds, Context, FontWeight, InertialDecay, MouseButton, Pixels, TouchGesture,
    Window, div, point, prelude::*, px,
};

use crate::{
    PlaygroundMode, PlaygroundView, TOPBAR_HEIGHT,
    block_flow::{
        FlowKind, FlowLayout, FlowRect, FlowTextLayout, PAGE_SURFACE_ID,
        heading_marker_rect_for_direction, page_geometry,
    },
    edgeless::{NOTE_CARD_PADDING, SpatialItemKind, point_in_rotated_rect, rotate_point_around},
    editor_session::{DocPoint, DocumentSelection, word_range},
    overlays::{CONTROL_HIT_SIZE, OverlayEvent},
    rich_text::DecorationKind,
    theme::Palette,
};

const FLING_FRICTION: f64 = 3.25;
const FLING_MIN_VELOCITY: f32 = 20.0;
const TOUCH_CONTROL_HIT_SIZE: f32 = 44.0;

/// Axis lock for a single touch scroll gesture.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TouchScrollAxis {
    Horizontal,
    Vertical,
}

impl PlaygroundView {
    pub(crate) fn cancel_flings(&mut self) {
        self.page_scroll_fling = None;
        self.code_scroll_fling = None;
        self.edgeless_pan_fling = None;
    }

    pub(crate) fn handle_touch_gestures(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if window.active_touch_count() > 0 {
            self.cancel_flings();
        } else {
            self.touch_scroll_axis_lock = None;
        }
        let now_ms = self.now_ms(cx);
        if self.database_record_sheet.is_some() {
            self.cancel_flings();
            let geom = self.record_sheet_geometry(window);
            for gesture in window.take_touch_gestures() {
                let Some((sheet_left, sheet_top, sheet_w, _, max_scroll)) = geom else {
                    continue;
                };
                match gesture {
                    TouchGesture::Tap { position, count: 1 } => {
                        let (x, y) = (f32::from(position.x), f32::from(position.y));
                        let outside = y < sheet_top || x < sheet_left || x > sheet_left + sheet_w;
                        if outside {
                            self.close_database_record_sheet(cx);
                        }
                    }
                    TouchGesture::PanStart { origin, .. } => {
                        let (x, y) = (f32::from(origin.x), f32::from(origin.y));
                        if let Some(s) = self.database_record_sheet.as_mut() {
                            s.scroll_fling = None;
                            let in_sheet_x = x >= sheet_left && x <= sheet_left + sheet_w;
                            if in_sheet_x && y >= sheet_top && y <= sheet_top + 56.0 {
                                s.grabber_drag_start_y = Some(y);
                                s.touch_body_drag = false;
                            } else if in_sheet_x && y > sheet_top + 56.0 {
                                s.grabber_drag_start_y = None;
                                s.touch_body_drag = true;
                            } else {
                                s.grabber_drag_start_y = None;
                                s.touch_body_drag = false;
                            }
                        }
                    }
                    TouchGesture::PanUpdate { position, .. } => {
                        let y = f32::from(position.y);
                        let start_y = self
                            .database_record_sheet
                            .as_ref()
                            .and_then(|s| s.grabber_drag_start_y);
                        if let Some(y0) = start_y
                            && y - y0 >= 56.0
                        {
                            self.close_database_record_sheet(cx);
                        }
                    }
                    TouchGesture::PanEnd {
                        position,
                        velocity,
                        cancelled,
                        ..
                    } => {
                        self.touch_scroll_axis_lock = None;
                        let y = f32::from(position.y);
                        let vy = f32::from(velocity.y);
                        let header_start = self
                            .database_record_sheet
                            .as_mut()
                            .and_then(|s| s.grabber_drag_start_y.take());
                        let was_body = self
                            .database_record_sheet
                            .as_mut()
                            .is_some_and(|s| std::mem::take(&mut s.touch_body_drag));
                        if let Some(y0) = header_start {
                            if !cancelled && y - y0 >= 56.0 {
                                self.close_database_record_sheet(cx);
                            }
                        } else if was_body
                            && !cancelled
                            && vy.abs() >= FLING_MIN_VELOCITY
                            && max_scroll > 0.0
                            && let Some(s) = self.database_record_sheet.as_mut()
                        {
                            s.scroll_fling = Some(InertialDecay::new(
                                f64::from(s.scroll_y),
                                -f64::from(vy),
                                FLING_FRICTION,
                                now_ms,
                            ));
                            window.request_animation_frame();
                        }
                    }
                    _ => {}
                }
            }
            if window.active_touch_count() == 0 {
                self.touch_long_press_anchor = None;
                self.touch_scroll_axis_lock = None;
            }
            return;
        }
        for gesture in window.take_touch_gestures() {
            match (self.mode, gesture) {
                (_, TouchGesture::PanStart { .. } | TouchGesture::PinchStart { .. }) => {
                    self.cancel_flings();
                    self.touch_scroll_axis_lock = None;
                    self.touch_selection_menu_open = false;
                    self.edgeless_readonly_selection_target = None;
                }
                (PlaygroundMode::Page, TouchGesture::Tap { position, count: 1 }) => {
                    self.cancel_flings();
                    self.touch_scroll_axis_lock = None;
                    self.touch_selection_menu_open = false;
                    self.edgeless_readonly_selection_target = None;
                    let (x, y) = (f32::from(position.x), f32::from(position.y));
                    if self.try_touch_expanded_control_hit(x, y, window, cx) {
                        continue;
                    }
                    if let Some(page_id) = self.hit_inline_reference_at(x, y, window) {
                        self.last_opened_embed_doc = Some(page_id);
                        cx.notify();
                    } else if let Some(url) = self.hit_link_url_at(x, y, window) {
                        self.last_opened_link_url = Some(url.clone());
                        cx.open_url(&url);
                        cx.notify();
                    } else if self.point_hits_active_selection(x, y, window) {
                        self.bump_selection_menu_request_seq();
                        if !self.native_selection_ui {
                            self.touch_selection_menu_open = true;
                        }
                        cx.notify();
                    }
                }
                (PlaygroundMode::Edgeless, TouchGesture::Tap { .. }) => {
                    self.cancel_flings();
                    self.touch_scroll_axis_lock = None;
                    self.touch_selection_menu_open = false;
                    self.edgeless_readonly_selection_target = None;
                }
                (PlaygroundMode::Page, TouchGesture::LongPress { position }) => {
                    self.cancel_flings();
                    self.touch_selection_menu_open = false;
                    self.long_press_word(f32::from(position.x), f32::from(position.y), window, cx);
                    self.touch_long_press_anchor = self
                        .editor
                        .selection
                        .as_ref()
                        .map(|s| (s.anchor.clone(), s.focus.clone()));
                }
                (PlaygroundMode::Page, TouchGesture::LongPressDrag { position }) => {
                    if let Some((word_start, word_end)) = self.touch_long_press_anchor.clone()
                        && let Some(hit) = self.input_point(position, window)
                        && let Some(layout) = self.flow_layout()
                    {
                        let idx = |id: &str| layout.blocks.iter().position(|b| b.block_id == id);
                        let (anchor, focus) = match (
                            idx(&hit.block_id),
                            idx(&word_start.block_id),
                            idx(&word_end.block_id),
                        ) {
                            (Some(h), Some(ws), Some(we)) => {
                                let h_pos = (h, hit.offset());
                                if h_pos < (ws, word_start.offset()) {
                                    (word_end, hit)
                                } else if h_pos > (we, word_end.offset()) {
                                    (word_start, hit)
                                } else {
                                    (word_start, word_end)
                                }
                            }
                            _ => (word_start, word_end),
                        };
                        self.change_selection(DocumentSelection { anchor, focus }, window, cx);
                    }
                }
                (PlaygroundMode::Page, TouchGesture::LongPressEnd { .. }) => {
                    self.touch_long_press_anchor = None;
                    let geom = self.document_selection_geometry(window);
                    if geom.action_mask != 0 {
                        self.bump_selection_menu_request_seq();
                    }
                    self.touch_selection_menu_open =
                        geom.has_selection && !geom.is_collapsed && !self.native_selection_ui;
                    cx.notify();
                }
                (PlaygroundMode::Edgeless, TouchGesture::LongPress { position })
                    if self.edgeless_readonly =>
                {
                    self.cancel_flings();
                    self.long_press_edgeless_readonly_word(position, window, cx);
                }
                (
                    PlaygroundMode::Page,
                    TouchGesture::PanEnd {
                        position,
                        velocity,
                        cancelled,
                        ..
                    },
                ) => {
                    self.touch_scroll_axis_lock = None;
                    if cancelled {
                        continue;
                    }
                    let (vx, vy) = (f32::from(velocity.x), f32::from(velocity.y));
                    if vx.abs() > vy.abs()
                        && vx.abs() >= FLING_MIN_VELOCITY
                        && let Some(code_id) = self.hit_scrollable_code_block_at(position, window)
                    {
                        let cur = self.overlays.code_scroll_x(&code_id) as f64;
                        self.code_scroll_fling = Some((
                            code_id,
                            InertialDecay::new(cur, -f64::from(vx), FLING_FRICTION, now_ms),
                        ));
                        window.request_animation_frame();
                    } else if vy.abs() >= FLING_MIN_VELOCITY && self.max_scroll > 0.0 {
                        self.page_scroll_fling = Some(InertialDecay::new(
                            f64::from(self.scroll_y),
                            -f64::from(vy),
                            FLING_FRICTION,
                            now_ms,
                        ));
                        window.request_animation_frame();
                    }
                }
                (
                    PlaygroundMode::Edgeless,
                    TouchGesture::PanEnd {
                        velocity,
                        cancelled,
                        ..
                    },
                ) => {
                    self.touch_scroll_axis_lock = None;
                    if cancelled {
                        continue;
                    }
                    let (vx, vy) = (f32::from(velocity.x), f32::from(velocity.y));
                    if vx.hypot(vy) >= FLING_MIN_VELOCITY {
                        let z = f64::from(self.edgeless.camera.zoom.max(0.1));
                        self.edgeless_camera_transition = None;
                        self.edgeless_pan_fling = Some((
                            InertialDecay::new(
                                f64::from(self.edgeless.camera.pan_x),
                                -f64::from(vx) / z,
                                FLING_FRICTION,
                                now_ms,
                            ),
                            InertialDecay::new(
                                f64::from(self.edgeless.camera.pan_y),
                                -f64::from(vy) / z,
                                FLING_FRICTION,
                                now_ms,
                            ),
                        ));
                        window.request_animation_frame();
                    }
                }
                (
                    PlaygroundMode::Edgeless,
                    TouchGesture::PinchUpdate {
                        centroid,
                        translation,
                        scale_delta,
                        ..
                    },
                ) => {
                    let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
                    self.edgeless_camera_transition = None;
                    self.edgeless_pan_fling = None;
                    self.edgeless
                        .camera
                        .pan_by_screen_delta(f32::from(translation.x), f32::from(translation.y));
                    if (scale_delta - 1.0).abs() > 1e-5 {
                        let target_zoom = self.edgeless.camera.zoom * scale_delta.max(0.05);
                        self.edgeless
                            .camera
                            .zoom_at(target_zoom, centroid, vp_origin);
                    }
                    self.edgeless.camera_initialized = true;
                    cx.notify();
                }
                _ => {}
            }
        }
        if window.active_touch_count() == 0 {
            self.touch_long_press_anchor = None;
            self.touch_scroll_axis_lock = None;
        }
    }

    pub(crate) fn step_page_flings(&mut self, now_ms: f64, window: &mut Window) {
        if self.database_record_sheet.is_some() {
            self.page_scroll_fling = None;
            self.code_scroll_fling = None;
            let max_scroll = self
                .record_sheet_geometry(window)
                .map_or(0.0, |(_, _, _, _, m)| m);
            if let Some(s) = self.database_record_sheet.as_mut()
                && let Some(fling) = s.scroll_fling
            {
                let next = fling.value_at(now_ms) as f32;
                let clamped = next.clamp(0.0, max_scroll).round();
                s.scroll_y = clamped;
                if fling.velocity_at(now_ms).abs() <= fling.stop_velocity
                    || next <= 0.0
                    || next >= max_scroll
                {
                    s.scroll_fling = None;
                } else {
                    window.request_animation_frame();
                }
            }
            return;
        }
        if let Some(fling) = self.page_scroll_fling {
            let next = fling.value_at(now_ms) as f32;
            let clamped = next.clamp(0.0, self.max_scroll).round();
            self.scroll_y = clamped;
            if fling.velocity_at(now_ms).abs() <= fling.stop_velocity
                || next <= 0.0
                || next >= self.max_scroll
            {
                self.page_scroll_fling = None;
            } else {
                window.request_animation_frame();
            }
        }
        if let Some((block_id, fling)) = self.code_scroll_fling.clone() {
            let next = fling.value_at(now_ms) as f32;
            let cur = self.overlays.code_scroll_x(&block_id);
            let delta = next - cur;
            let moved =
                self.snapshot
                    .clone()
                    .zip(self.flow_layout())
                    .is_some_and(|(snap, layout)| {
                        let Some(block) = layout.block(&block_id) else {
                            return false;
                        };
                        let geom = page_geometry(self.window_size.0);
                        let sx = geom.column_x + block.x + block.body.width * 0.5;
                        let sy = TOPBAR_HEIGHT + block.y + block.body.height * 0.5 - self.scroll_y;
                        let scene =
                            self.overlay_scene(&snap, &layout, window.layout_direction(), None);
                        self.overlays.scroll_code(&scene, sx, sy, -delta, 0.0)
                    });
            if !moved || fling.velocity_at(now_ms).abs() <= fling.stop_velocity {
                self.code_scroll_fling = None;
            } else {
                window.request_animation_frame();
            }
        }
    }

    pub(crate) fn step_edgeless_fling(&mut self, now_ms: f64, window: &mut Window) {
        if let Some((fx, fy)) = self.edgeless_pan_fling {
            self.edgeless.camera.pan_x = fx.value_at(now_ms) as f32;
            self.edgeless.camera.pan_y = fy.value_at(now_ms) as f32;
            self.edgeless.camera_initialized = true;
            if fx.velocity_at(now_ms).abs() <= fx.stop_velocity
                && fy.velocity_at(now_ms).abs() <= fy.stop_velocity
            {
                self.edgeless_pan_fling = None;
            } else {
                window.request_animation_frame();
            }
        }
    }

    fn hit_scrollable_code_block_at(
        &self,
        pos: ui::Point<Pixels>,
        window: &Window,
    ) -> Option<String> {
        let layout = self.flow_layout()?;
        let geom = page_geometry(f32::from(window.viewport_size().width));
        let wx = f32::from(pos.x) - geom.column_x;
        let wy = f32::from(pos.y) - TOPBAR_HEIGHT + self.scroll_y;
        layout.blocks.iter().find_map(|b| {
            (b.body.code_scroll.is_some() && b.rect().contains(wx, wy)).then(|| b.block_id.clone())
        })
    }

    /// Expanded 44x44px touch hit target halo around checkbox, toggle, and heading collapse
    /// controls (`T2`). Only fires outside the inner 24x24px element box already handled by click.
    fn try_touch_expanded_control_hit(
        &mut self,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(layout) = self.flow_layout() else {
            return false;
        };
        let geom = page_geometry(f32::from(window.viewport_size().width));
        let wx = x - geom.column_x;
        let wy = y - TOPBAR_HEIGHT + self.scroll_y;
        let dir = window.layout_direction();
        let pad_y = (TOUCH_CONTROL_HIT_SIZE - CONTROL_HIT_SIZE) * 0.5;
        let expand_outer = |inner: FlowRect, text_edge: f32| {
            let (hx, hw) = match dir {
                ui::Direction::Ltr => {
                    let right = inner.right().min(text_edge);
                    (right - TOUCH_CONTROL_HIT_SIZE, TOUCH_CONTROL_HIT_SIZE)
                }
                ui::Direction::Rtl => {
                    let left = inner.x.max(text_edge);
                    (left, TOUCH_CONTROL_HIT_SIZE)
                }
            };
            FlowRect::new(hx, inner.y - pad_y, hw, inner.h + 2.0 * pad_y)
        };
        let mut hit_event = None;
        for block in &layout.blocks {
            let rect = block.rect();
            if block.has_gutter_chevron {
                let lh = match block.body.kind {
                    FlowKind::Paragraph(p) => crate::block_flow::paragraph_spec(p).line_height,
                    _ => {
                        crate::block_flow::paragraph_spec(
                            blocksuite_playground_doc::schema::ParagraphType::Text,
                        )
                        .line_height
                    }
                };
                let m = heading_marker_rect_for_direction(lh, rect.w, dir);
                let inner = FlowRect::new(
                    rect.x + m.x + (m.w - CONTROL_HIT_SIZE) * 0.5,
                    rect.y + m.y + (m.h - CONTROL_HIT_SIZE) * 0.5,
                    CONTROL_HIT_SIZE,
                    CONTROL_HIT_SIZE,
                );
                let edge = match dir {
                    ui::Direction::Ltr => rect.x,
                    ui::Direction::Rtl => rect.right(),
                };
                if expand_outer(inner, edge).contains(wx, wy) && !inner.contains(wx, wy) {
                    hit_event = Some(OverlayEvent::ToggleCollapsed(block.block_id.clone()));
                    break;
                }
            }
            if let FlowKind::List(kind @ (ListType::Todo | ListType::Toggle)) = block.body.kind
                && let Some(prefix) = block.body.prefix
            {
                let tx = match dir {
                    ui::Direction::Ltr => rect.x,
                    ui::Direction::Rtl => rect.right() - CONTROL_HIT_SIZE,
                };
                let inner = FlowRect::new(
                    tx,
                    rect.y + prefix.y + (prefix.h - CONTROL_HIT_SIZE) * 0.5,
                    CONTROL_HIT_SIZE,
                    CONTROL_HIT_SIZE,
                );
                let edge = match dir {
                    ui::Direction::Ltr => {
                        rect.x + block.body.text.as_ref().map_or(CONTROL_HIT_SIZE, |t| t.x)
                    }
                    ui::Direction::Rtl => block
                        .body
                        .text
                        .as_ref()
                        .map_or(rect.right() - CONTROL_HIT_SIZE, |t| {
                            rect.x + t.x + t.layout.content_width()
                        }),
                };
                if expand_outer(inner, edge).contains(wx, wy) && !inner.contains(wx, wy) {
                    hit_event = Some(if kind == ListType::Todo {
                        OverlayEvent::ToggleChecked(block.block_id.clone())
                    } else {
                        OverlayEvent::ToggleCollapsed(block.block_id.clone())
                    });
                    break;
                }
            }
        }
        if let Some(ev) = hit_event {
            self.dispatch_overlay(ev, window, cx);
            true
        } else {
            false
        }
    }

    fn hit_inline_reference_in_layout(layout: &FlowLayout, wx: f32, wy: f32) -> Option<String> {
        for block in &layout.blocks {
            if !block.rect().contains(wx, wy) {
                continue;
            }
            let Some(text) = &block.body.text else {
                continue;
            };
            let FlowTextLayout::Rich(rich) = &text.layout else {
                continue;
            };
            let pt = point(px(wx - block.x - text.x), px(wy - block.y - text.y));
            if let Some(pid) = rich
                .inline_decorations()
                .iter()
                .find_map(|d| match &d.kind {
                    DecorationKind::ReferenceChip(r)
                        if !r.page_id.is_empty() && d.bounds.contains(&pt) =>
                    {
                        Some(r.page_id.clone())
                    }
                    _ => None,
                })
            {
                return Some(pid);
            }
        }
        None
    }

    pub(crate) fn hit_inline_reference_at(
        &self,
        x: f32,
        y: f32,
        window: &Window,
    ) -> Option<String> {
        let layout = self.flow_layout()?;
        let geom = page_geometry(f32::from(window.viewport_size().width));
        let wx = x - geom.column_x;
        let wy = y - TOPBAR_HEIGHT + self.scroll_y;
        Self::hit_inline_reference_in_layout(&layout, wx, wy)
    }

    pub(crate) fn try_open_edgeless_readonly_link_or_ref(
        &mut self,
        wx: f32,
        wy: f32,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(snapshot) = self.snapshot.clone() else {
            return false;
        };
        for item in self.edgeless.authoring.painted_items.iter().rev() {
            if !matches!(
                item.kind,
                SpatialItemKind::Note | SpatialItemKind::EdgelessText
            ) || !point_in_rotated_rect(wx, wy, item.rect, item.rotate_deg)
            {
                continue;
            }
            let is_note = item.kind == SpatialItemKind::Note;
            let (cx_w, cy_w) = item.rect.center();
            let (lx, ly) = rotate_point_around(wx, wy, cx_w, cy_w, -item.rotate_deg);
            let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
            let fx = (lx - item.rect.x) / item.scale - pad;
            let fy = (ly - item.rect.y) / item.scale - pad;
            let Some(layout) = self.edgeless.cached_block_layout(&item.id, is_note) else {
                continue;
            };
            if let Some(pid) = Self::hit_inline_reference_in_layout(&layout, fx, fy) {
                self.last_opened_embed_doc = Some(pid);
                cx.notify();
                return true;
            }
            if let Some(url) = self.hit_link_in_layout(&layout, fx, fy, &snapshot) {
                self.last_opened_link_url = Some(url.clone());
                cx.open_url(&url);
                cx.notify();
                return true;
            }
        }
        false
    }

    fn long_press_edgeless_readonly_word(
        &mut self,
        pos: ui::Point<Pixels>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let wp = self.edgeless.camera.screen_to_world(pos, vp_origin);
        let (wx, wy) = (f32::from(wp.x), f32::from(wp.y));
        for item in self.edgeless.authoring.painted_items.iter().rev() {
            if !matches!(
                item.kind,
                SpatialItemKind::Note | SpatialItemKind::EdgelessText
            ) || !point_in_rotated_rect(wx, wy, item.rect, item.rotate_deg)
            {
                continue;
            }
            let is_note = item.kind == SpatialItemKind::Note;
            let (cx_w, cy_w) = item.rect.center();
            let (lx, ly) = rotate_point_around(wx, wy, cx_w, cy_w, -item.rotate_deg);
            let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
            let fx = (lx - item.rect.x) / item.scale - pad;
            let fy = (ly - item.rect.y) / item.scale - pad;
            if let Some(layout) = self.edgeless.cached_block_layout(&item.id, is_note)
                && let Some(pt) = Self::hit_test_flow_layout(&layout, fx, fy)
            {
                let text = self.block_text(&pt.block_id).unwrap_or("");
                let r = word_range(text, pt.offset());
                self.edgeless_readonly_selection_target = Some((item.id.clone(), is_note));
                self.change_selection(
                    DocumentSelection {
                        anchor: DocPoint::new(&pt.block_id, r.start),
                        focus: DocPoint::new(&pt.block_id, r.end),
                    },
                    window,
                    cx,
                );
                self.bump_selection_menu_request_seq();
                self.touch_selection_menu_open = !self.native_selection_ui;
                cx.notify();
                return;
            }
        }
    }

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
