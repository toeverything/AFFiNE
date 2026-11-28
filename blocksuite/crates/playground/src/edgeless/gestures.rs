//! Pointer down/move gesture state machine for Edgeless selection, drag, resize, rotate, and tool creation.

use std::collections::BTreeSet;

use blocksuite_playground_doc::read::SurfaceElementKind;
use ui::{Context, MouseDownEvent, MouseMoveEvent, Window, point, px};

use crate::{PlaygroundView, TOPBAR_HEIGHT, editor_session::DocumentSelection};

use super::{
    DragItemInitial, EdgelessGesture, EdgelessTool, HandleKind, NOTE_CARD_PADDING, SpatialItemKind,
    find_surface_element, label_editor_text_origin, layout_label_editor_paragraph, normalized_rect,
    point_in_rotated_rect, rotate_point_around,
};

impl PlaygroundView {
    pub(crate) fn on_edgeless_left_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.editor_focus.focus(window, cx);
        let now_ms = self.now_ms(cx);
        self.overlays.close_context_menu(now_ms);
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let world_pt = self
            .edgeless
            .camera
            .screen_to_world(event.position, vp_origin);
        let wx = f32::from(world_pt.x);
        let wy = f32::from(world_pt.y);

        // Mobile read-only Edgeless mode (`enable_mobile_edgeless_editing == false`), Hand tool,
        // or Space-hold pans smoothly with left/single-finger drag and makes zero CRDT edits.
        if self.edgeless_readonly
            || self.edgeless.authoring.tool == EdgelessTool::Hand
            || self.edgeless.authoring.space_pan
        {
            self.edgeless_camera_transition = None;
            self.edgeless_pan_fling = None;
            self.edgeless_commit_inline_edit(window, cx);
            self.edgeless.authoring.gesture = Some(EdgelessGesture::Pan {
                start_screen: event.position,
                last_screen: event.position,
                moved: false,
            });
            cx.notify();
            return;
        }

        // If currently inline-editing a Note/EdgelessText and clicking inside it, route to EditorSession.
        if let Some((editing_id, is_note)) = self.edgeless.authoring.editing_spatial_block() {
            let editing_id = editing_id.to_string();
            if let Some(info) = self
                .edgeless
                .authoring
                .painted_items
                .iter()
                .find(|i| i.id == editing_id)
                .cloned()
                && point_in_rotated_rect(wx, wy, info.rect, info.rotate_deg)
            {
                let (cx_w, cy_w) = info.rect.center();
                let (lx, ly) = rotate_point_around(wx, wy, cx_w, cy_w, -info.rotate_deg);
                let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
                let flow_x = (lx - info.rect.x) / info.scale - pad;
                let flow_y = (ly - info.rect.y) / info.scale - pad;
                if let Some(layout) = self.edgeless.cached_block_layout(&editing_id, is_note)
                    && let Some(pt) = Self::hit_test_flow_layout(&layout, flow_x, flow_y)
                {
                    self.overlays.pointer_pressed(now_ms);
                    self.editor.slash_trigger = None;
                    let mut sel = DocumentSelection::caret(pt.clone());
                    if event.click_count >= 2 {
                        let s = self.block_text(&pt.block_id).unwrap_or("");
                        let range = if event.click_count == 2 {
                            crate::editor_session::word_range(s, pt.offset())
                        } else {
                            0..s.encode_utf16().count() as u64
                        };
                        sel.anchor =
                            crate::editor_session::DocPoint::new(&pt.block_id, range.start);
                        sel.focus = crate::editor_session::DocPoint::new(&pt.block_id, range.end);
                    } else if event.modifiers.shift
                        && let Some(old) = &self.editor.selection
                    {
                        sel.anchor = old.anchor.clone();
                    }
                    self.change_selection(sel, window, cx);
                    return;
                }
            }
        }

        // If currently inline-editing a label (Shape/Connector/SurfaceText/Frame) and clicking
        // inside its overlay bounds, hit-test the laid-out RichParagraph and place the caret.
        if self.edgeless_point_in_label_editor(
            f32::from(event.position.x),
            f32::from(event.position.y),
            window,
        ) {
            if self
                .edgeless
                .authoring
                .label_editor()
                .is_some_and(|e| e.composing())
            {
                let _ = self.edgeless_label_edit(window, cx, super::EdgelessLabelEditor::unmark);
            }
            let off = self
                .hit_label_editor_at(
                    f32::from(event.position.x),
                    f32::from(event.position.y),
                    window,
                )
                .map_or(0, |(off, _)| off);
            if let Some(ed_mut) = self.edgeless.authoring.label_editor_mut() {
                ed_mut.select(off..off);
            }
            self.edgeless_update_label_anchors();
            window.notify_text_input_changed(&self.editor_focus);
            cx.notify();
            return;
        }

        // Clicking outside an active inline label/block edit commits and exits it.
        if self.edgeless.authoring.inline_edit.is_some() {
            self.edgeless_commit_inline_edit(window, cx);
        }

        match self.edgeless.authoring.tool {
            EdgelessTool::Select => {
                // Double-click enters inline rich-text / label IME editing.
                if event.click_count >= 2 {
                    if let Some(hit) = self
                        .edgeless
                        .authoring
                        .hit_test_world(wx, wy, self.edgeless.camera.zoom)
                        .cloned()
                    {
                        self.edgeless_begin_inline_edit_at(&hit.id, Some((wx, wy)), window, cx);
                        return;
                    }
                }

                // 1. Check active selection handles first.
                let vp_w = self.window_size.0.max(1.0);
                let vp_h = (self.window_size.1 - TOPBAR_HEIGHT).max(1.0);
                if let Some(handle) = self.edgeless.authoring.hit_test_handles(
                    event.position,
                    vp_origin,
                    vp_w,
                    vp_h,
                    self.edgeless.camera,
                ) {
                    match handle {
                        HandleKind::Rotate => {
                            if let Some(single) = self.edgeless.authoring.single_selected().cloned()
                            {
                                let center = single.rect.center();
                                let start_angle = ((wy - center.1) as f64)
                                    .atan2((wx - center.0) as f64)
                                    .to_degrees();
                                self.edgeless.authoring.gesture =
                                    Some(EdgelessGesture::RotateSelection {
                                        id: single.id,
                                        surface_id: single.surface_id,
                                        is_block: single.kind.is_block(),
                                        center_world: center,
                                        start_angle,
                                        initial_rotate: single.rotate_deg as f64,
                                        current_rotate: single.rotate_deg as f64,
                                    });
                                cx.notify();
                                return;
                            }
                        }
                        HandleKind::DragHandle => {
                            let initial = self.collect_drag_initials();
                            if !initial.is_empty() {
                                self.edgeless.authoring.gesture =
                                    Some(EdgelessGesture::DragSelection {
                                        start_world: (wx, wy),
                                        current_world: (wx, wy),
                                        initial,
                                    });
                                cx.notify();
                                return;
                            }
                        }
                        _ => {
                            if let Some(initial_box) = self.edgeless.authoring.selection_world_box()
                            {
                                let initial = self.collect_drag_initials();
                                self.edgeless.authoring.gesture =
                                    Some(EdgelessGesture::ResizeSelection {
                                        handle,
                                        start_world: (wx, wy),
                                        current_world: (wx, wy),
                                        initial_box,
                                        initial,
                                    });
                                cx.notify();
                                return;
                            }
                        }
                    }
                }

                // 2. Top-to-bottom reverse paint-order hit-test.
                if let Some(hit) = self
                    .edgeless
                    .authoring
                    .hit_test_world(wx, wy, self.edgeless.camera.zoom)
                    .cloned()
                {
                    if event.modifiers.shift {
                        if !self.edgeless.authoring.selection.remove(&hit.id) {
                            self.edgeless.authoring.selection.insert(hit.id.clone());
                        }
                    } else if !self.edgeless.authoring.selection.contains(&hit.id) {
                        self.edgeless.authoring.selection.clear();
                        self.edgeless.authoring.selection.insert(hit.id.clone());
                    }
                    let initial = self.collect_drag_initials();
                    if !initial.is_empty() {
                        self.edgeless.authoring.gesture = Some(EdgelessGesture::DragSelection {
                            start_world: (wx, wy),
                            current_world: (wx, wy),
                            initial,
                        });
                    }
                    cx.notify();
                } else {
                    // Empty canvas: clear selection and start marquee box.
                    if !event.modifiers.shift {
                        self.edgeless.authoring.selection.clear();
                    }
                    self.edgeless.authoring.gesture = Some(EdgelessGesture::Marquee {
                        start_world: (wx, wy),
                        current_world: (wx, wy),
                    });
                    cx.notify();
                }
            }
            EdgelessTool::Shape(shape_type) => {
                self.edgeless.authoring.gesture = Some(EdgelessGesture::CreateShape {
                    shape_type,
                    start_world: (wx, wy),
                    current_world: (wx, wy),
                });
                cx.notify();
            }
            EdgelessTool::Frame => {
                self.edgeless.authoring.gesture = Some(EdgelessGesture::CreateFrame {
                    start_world: (wx, wy),
                    current_world: (wx, wy),
                });
                cx.notify();
            }
            EdgelessTool::Note => {
                self.edgeless.authoring.gesture = Some(EdgelessGesture::CreateNote {
                    start_world: (wx, wy),
                    current_world: (wx, wy),
                });
                cx.notify();
            }
            EdgelessTool::Connector => {
                let snapped = self.edgeless.authoring.snap_connector_port(
                    wx,
                    wy,
                    self.edgeless.camera.zoom,
                    None,
                );
                let (source_id, source_port, source_world) = match snapped {
                    Some((id, port, pt)) => (Some(id), Some(port), pt),
                    None => (None, None, (wx, wy)),
                };
                self.edgeless.authoring.gesture = Some(EdgelessGesture::CreateConnector {
                    source_id,
                    source_port,
                    source_world,
                    current_world: (wx, wy),
                    target_id: None,
                    target_port: None,
                    target_world: None,
                });
                cx.notify();
            }
            EdgelessTool::Brush | EdgelessTool::Highlighter => {
                let highlighter = self.edgeless.authoring.tool == EdgelessTool::Highlighter;
                self.edgeless.authoring.gesture = Some(EdgelessGesture::DrawStroke {
                    highlighter,
                    points_world: vec![(wx as f64, wy as f64)],
                });
                cx.notify();
            }
            EdgelessTool::Text => {
                self.create_edgeless_text_at(wx, wy, window, cx);
            }
            EdgelessTool::Hand => {}
        }
    }

    pub(crate) fn on_edgeless_pointer_move(
        &mut self,
        event: &MouseMoveEvent,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        // Middle-button pan continues to work as before.
        if let Some(prev) = self.edgeless.drag_pan_anchor {
            let dx = f32::from(event.position.x) - f32::from(prev.x);
            let dy = f32::from(event.position.y) - f32::from(prev.y);
            self.edgeless.camera.pan_by_screen_delta(dx, dy);
            self.edgeless.drag_pan_anchor = Some(event.position);
            self.edgeless.camera_initialized = true;
            cx.notify();
            return;
        }
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let world_pt = self
            .edgeless
            .camera
            .screen_to_world(event.position, vp_origin);
        let wx = f32::from(world_pt.x);
        let wy = f32::from(world_pt.y);
        let shift = event.modifiers.shift;
        let zoom = self.edgeless.camera.zoom;

        let conn_snap = match &self.edgeless.authoring.gesture {
            Some(EdgelessGesture::CreateConnector { source_id, .. }) => self
                .edgeless
                .authoring
                .snap_connector_port(wx, wy, zoom, source_id.as_deref()),
            _ => None,
        };

        match self.edgeless.authoring.gesture.as_mut() {
            Some(EdgelessGesture::Pan {
                start_screen,
                last_screen,
                moved,
            }) => {
                let dx = f32::from(event.position.x) - f32::from(last_screen.x);
                let dy = f32::from(event.position.y) - f32::from(last_screen.y);
                let total_dx = f32::from(event.position.x) - f32::from(start_screen.x);
                let total_dy = f32::from(event.position.y) - f32::from(start_screen.y);
                if total_dx.hypot(total_dy) > 4.0 {
                    *moved = true;
                }
                self.edgeless.camera.pan_by_screen_delta(dx, dy);
                *last_screen = event.position;
                self.edgeless.camera_initialized = true;
                cx.notify();
            }
            Some(EdgelessGesture::Marquee {
                start_world,
                current_world,
            }) => {
                *current_world = (wx, wy);
                let marquee = normalized_rect(*start_world, *current_world);
                let hits: BTreeSet<String> = self
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .filter(|item| item.rect.intersects(marquee))
                    .map(|item| item.id.clone())
                    .collect();
                self.edgeless.authoring.selection = hits;
                cx.notify();
            }
            Some(EdgelessGesture::DragSelection { current_world, .. })
            | Some(EdgelessGesture::ResizeSelection { current_world, .. })
            | Some(EdgelessGesture::CreateShape { current_world, .. })
            | Some(EdgelessGesture::CreateFrame { current_world, .. })
            | Some(EdgelessGesture::CreateNote { current_world, .. }) => {
                *current_world = (wx, wy);
                cx.notify();
            }
            Some(EdgelessGesture::RotateSelection {
                center_world,
                start_angle,
                initial_rotate,
                current_rotate,
                ..
            }) => {
                let angle = ((wy - center_world.1) as f64)
                    .atan2((wx - center_world.0) as f64)
                    .to_degrees();
                let mut next = (*initial_rotate + (angle - *start_angle)).rem_euclid(360.0);
                if shift {
                    next = (next / 15.0).round() * 15.0;
                }
                *current_rotate = next;
                cx.notify();
            }
            Some(EdgelessGesture::CreateConnector {
                current_world,
                target_id,
                target_port,
                target_world,
                ..
            }) => {
                *current_world = (wx, wy);
                if let Some((tid, port, pt)) = conn_snap {
                    *target_id = Some(tid);
                    *target_port = Some(port);
                    *target_world = Some(pt);
                } else {
                    *target_id = None;
                    *target_port = None;
                    *target_world = None;
                }
                cx.notify();
            }
            Some(EdgelessGesture::DrawStroke { points_world, .. }) => {
                let should_push = points_world
                    .last()
                    .is_none_or(|&(lx, ly)| ((wx as f64 - lx).hypot(wy as f64 - ly)) >= 2.0);
                if should_push {
                    points_world.push((wx as f64, wy as f64));
                    cx.notify();
                }
            }
            None => {}
        }
    }

    pub(super) fn collect_drag_initials(&self) -> Vec<DragItemInitial> {
        let Some(snapshot) = &self.snapshot else {
            return Vec::new();
        };
        let mut ids: BTreeSet<String> = self.edgeless.authoring.selection.clone();
        // When dragging a Frame, include all of its `prop:childElementIds` members too!
        for item in self.edgeless.authoring.painted_items.iter() {
            if item.kind == SpatialItemKind::Frame && ids.contains(&item.id) {
                for child_id in &item.frame_children {
                    ids.insert(child_id.clone());
                }
            }
        }
        let mut out = Vec::new();
        for item in self.edgeless.authoring.painted_items.iter() {
            if !ids.contains(&item.id) {
                continue;
            }
            let mut points = None;
            let mut connector_source = None;
            let mut connector_target = None;
            let mut connector_label_xywh = None;
            if let Some((_, el)) = find_surface_element(snapshot, &item.id) {
                match &el.kind {
                    SurfaceElementKind::Brush(s) | SurfaceElementKind::Highlighter(s) => {
                        points = Some(
                            s.points
                                .iter()
                                .map(|p| {
                                    if s.simulated_pressure {
                                        vec![p[0], p[1]]
                                    } else {
                                        vec![p[0], p[1], p[2]]
                                    }
                                })
                                .collect(),
                        );
                    }
                    SurfaceElementKind::Connector(c) => {
                        connector_source = Some((c.source.id.clone(), c.source.position));
                        connector_target = Some((c.target.id.clone(), c.target.position));
                        connector_label_xywh = c.label_xywh;
                    }
                    _ => {}
                }
            }
            out.push(DragItemInitial {
                id: item.id.clone(),
                kind: item.kind,
                surface_id: item.surface_id.clone(),
                rect: item.rect,
                points,
                connector_source,
                connector_target,
                connector_label_xywh,
            });
        }
        out
    }

    /// Return whether window coordinates `(sx, sy)` hit the active Edgeless inline label editor.
    pub(crate) fn edgeless_point_in_label_editor(&self, sx: f32, sy: f32, window: &Window) -> bool {
        let Some(ed) = self.edgeless.authoring.label_editor() else {
            return false;
        };
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let wp = self
            .edgeless
            .camera
            .screen_to_world(point(px(sx), px(sy)), vp_origin);
        let wx = f32::from(wp.x);
        let wy = f32::from(wp.y);
        if ed.target.rotates_in_place() {
            point_in_rotated_rect(wx, wy, ed.world_rect, ed.effective_rotate_deg())
        } else {
            let pt = point(px(sx), px(sy));
            self.edgeless_label_screen_bounds(window)
                .is_some_and(|b| b.contains(&pt))
                || point_in_rotated_rect(wx, wy, ed.world_rect, 0.0)
        }
    }

    /// Hit-test the UTF-16 caret offset and whether `(sx, sy)` lies inside the painted
    /// selection highlight of the active Edgeless label editor.
    pub(crate) fn hit_label_editor_at(
        &self,
        sx: f32,
        sy: f32,
        window: &mut Window,
    ) -> Option<(usize, bool)> {
        let bounds = self.edgeless_label_layout_screen_bounds(window);
        let ed = self.edgeless.authoring.label_editor()?;
        let res = bounds
            .and_then(|b| {
                let zoom = self.edgeless.camera.zoom;
                let laid_out = layout_label_editor_paragraph(
                    ed,
                    f32::from(b.size.width),
                    zoom,
                    self.theme,
                    window,
                )?;
                let (ox, oy) = label_editor_text_origin(
                    ed,
                    f32::from(b.size.height),
                    f32::from(laid_out.size().height),
                    zoom,
                );
                let rot = ed.effective_rotate_deg();
                let (ux, uy) = if rot.abs() > 1e-4 {
                    let cx_s = f32::from(b.origin.x) + f32::from(b.size.width) * 0.5;
                    let cy_s = f32::from(b.origin.y) + f32::from(b.size.height) * 0.5;
                    rotate_point_around(sx, sy, cx_s, cy_s, -rot)
                } else {
                    (sx, sy)
                };
                let local_pt = point(px(ux) - b.origin.x - px(ox), px(uy) - b.origin.y - px(oy));
                let off = laid_out.hit_test(local_pt).utf16_offset as usize;
                let in_sel = !ed.composing()
                    && !ed.input.selection.is_empty()
                    && laid_out
                        .selection_rects(
                            ed.input.selection.start as u64,
                            ed.input.selection.end as u64,
                        )
                        .iter()
                        .any(|r| r.contains(&local_pt));
                Some((off, in_sel))
            })
            .unwrap_or_else(|| (ed.input.text.encode_utf16().count(), false));
        Some(res)
    }

    /// Transform window coordinates `(x, y)` into an inline-edited Edgeless Note/EdgelessText
    /// block's local flow coordinates `(flow_x, flow_y)` when `(x, y)` lies inside the card.
    pub(crate) fn edgeless_screen_to_spatial_flow(
        &self,
        x: f32,
        y: f32,
        editing_id: &str,
        is_note: bool,
    ) -> Option<(f32, f32)> {
        let info = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .find(|i| i.id == editing_id)?;
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let world_pt = self
            .edgeless
            .camera
            .screen_to_world(point(px(x), px(y)), vp_origin);
        let wx = f32::from(world_pt.x);
        let wy = f32::from(world_pt.y);
        if !point_in_rotated_rect(wx, wy, info.rect, info.rotate_deg) {
            return None;
        }
        let (cx_w, cy_w) = info.rect.center();
        let (lx, ly) = rotate_point_around(wx, wy, cx_w, cy_w, -info.rotate_deg);
        let pad = if is_note {
            super::NOTE_CARD_PADDING
        } else {
            0.0
        };
        let flow_x = (lx - info.rect.x) / info.scale - pad;
        let flow_y = (ly - info.rect.y) / info.scale - pad;
        Some((flow_x, flow_y))
    }
}

/// Sample the routed connector polyline at `distance` (`0.0..=1.0`), matching
/// `surface::paint`'s `route.point_at_distance(mode, distance)`.
pub(super) fn connector_label_anchor_point(
    polyline: &[(f32, f32)],
    fallback_center: (f32, f32),
    mode: blocksuite_playground_doc::read::ConnectorMode,
    distance: f64,
) -> (f64, f64) {
    if polyline.len() < 2 {
        return (fallback_center.0 as f64, fallback_center.1 as f64);
    }
    let d = distance.clamp(0.0, 1.0);
    if mode == blocksuite_playground_doc::read::ConnectorMode::Curve {
        let f = d * (polyline.len() - 1) as f64;
        let i = (f.floor() as usize).min(polyline.len() - 2);
        let t = f - i as f64;
        let a = polyline[i];
        let b = polyline[i + 1];
        return (
            a.0 as f64 + (b.0 as f64 - a.0 as f64) * t,
            a.1 as f64 + (b.1 as f64 - a.1 as f64) * t,
        );
    }
    let seg_len = |a: (f32, f32), b: (f32, f32)| ((b.0 - a.0) as f64).hypot((b.1 - a.1) as f64);
    let total: f64 = polyline.windows(2).map(|w| seg_len(w[0], w[1])).sum();
    let mut rem = total * d;
    for w in polyline.windows(2) {
        let l = seg_len(w[0], w[1]);
        if rem <= l && l > 0.0 {
            let t = rem / l;
            return (
                w[0].0 as f64 + (w[1].0 as f64 - w[0].0 as f64) * t,
                w[0].1 as f64 + (w[1].1 as f64 - w[0].1 as f64) * t,
            );
        }
        rem -= l;
    }
    let last = *polyline.last().unwrap();
    (last.0 as f64, last.1 as f64)
}
