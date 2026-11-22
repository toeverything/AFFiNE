//! Pointer down/move gesture state machine for Edgeless selection, drag, resize, rotate, and tool creation.

use std::collections::BTreeSet;

use blocksuite_playground_doc::read::SurfaceElementKind;
use ui::{Context, MouseDownEvent, MouseMoveEvent, Window, point, px};

use crate::{PlaygroundView, TOPBAR_HEIGHT, editor_session::DocumentSelection};

use super::{
    DragItemInitial, EdgelessGesture, EdgelessTool, HandleKind, NOTE_CARD_PADDING, SpatialItemKind,
    find_surface_element, layout_label_editor_paragraph, normalized_rect, point_in_rotated_rect,
    rotate_point_around,
};

impl PlaygroundView {
    pub(crate) fn on_edgeless_left_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.editor_focus.focus(window, cx);
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let world_pt = self
            .edgeless
            .camera
            .screen_to_world(event.position, vp_origin);
        let wx = f32::from(world_pt.x);
        let wy = f32::from(world_pt.y);

        // Hand tool or Space-hold pans with left drag.
        if self.edgeless.authoring.tool == EdgelessTool::Hand || self.edgeless.authoring.space_pan {
            self.edgeless_commit_inline_edit(window, cx);
            self.edgeless.authoring.gesture = Some(EdgelessGesture::Pan {
                last_screen: event.position,
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
                    let sel = DocumentSelection {
                        anchor: pt.clone(),
                        focus: pt,
                    };
                    self.change_selection(sel, window, cx);
                    return;
                }
            }
        }

        // If currently inline-editing a label (Shape/Connector/SurfaceText/Frame) and clicking
        // inside its overlay bounds, hit-test the laid-out RichParagraph and place the caret.
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            let bounds = self.edgeless_label_screen_bounds();
            let inside_overlay = bounds.is_some_and(|b| b.contains(&event.position))
                || point_in_rotated_rect(wx, wy, ed.world_rect, ed.rotate_deg);
            if inside_overlay {
                let off = bounds
                    .and_then(|b| {
                        let laid_out = layout_label_editor_paragraph(
                            ed,
                            f32::from(b.size.width),
                            self.theme,
                            window,
                        )?;
                        let local_pt = point(
                            event.position.x - b.origin.x - px(6.0),
                            event.position.y - b.origin.y - px(6.0),
                        );
                        Some(laid_out.hit_test(local_pt).utf16_offset as usize)
                    })
                    .unwrap_or_else(|| ed.text.encode_utf16().count());
                if let Some(ed_mut) = self.edgeless.authoring.label_editor_mut() {
                    ed_mut.select(off..off);
                }
                self.edgeless_update_label_anchors(off..off);
                window.notify_text_input_changed(&self.editor_focus);
                cx.notify();
                return;
            }
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
                        self.edgeless_begin_inline_edit(&hit.id, window, cx);
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
                self.create_surface_text_at(wx, wy, window, cx);
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
            Some(EdgelessGesture::Pan { last_screen }) => {
                let dx = f32::from(event.position.x) - f32::from(last_screen.x);
                let dy = f32::from(event.position.y) - f32::from(last_screen.y);
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
}
