//! Pointer-up gesture commit to `PageDocSession` (shapes, connectors, brushes, notes, frames, transforms).

use blocksuite_playground_doc::{
    fractional_index::generate_key_between,
    read::{BlockContent, SurfaceElementKind},
    schema::{ConnectorEndpointSpec, SurfaceElementSpec, map_array_any},
    session::PageDocSession,
};
use ui::{Context, MouseUpEvent, Window};
use y_octo::{Any, SessionValue};

use crate::{
    PlaygroundView,
    editor_session::{DocPoint, DocumentSelection},
};

use super::{
    EdgelessGesture, EdgelessInlineEdit, EdgelessTool, HandleKind, NOTE_MIN_WIDTH, SpatialItemKind,
    WorldRect, compute_frame_membership_updates, constrain_shift_drag, constrain_shift_square,
    max_spatial_index, normalized_rect, resized_rect_constrained, rotated_bounds,
};

impl PlaygroundView {
    pub(crate) fn on_edgeless_left_up(
        &mut self,
        event: &MouseUpEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(gesture) = self.edgeless.authoring.gesture.take() else {
            return;
        };
        let now_ms = self.now_ms(cx) as u64;
        match gesture {
            EdgelessGesture::Pan { moved, .. } => {
                if self.edgeless_readonly && !moved {
                    let vp_origin = self.canvas_origin();
                    let wp = self
                        .edgeless
                        .camera
                        .screen_to_world(event.position, vp_origin);
                    self.try_open_edgeless_readonly_link_or_ref(
                        f32::from(wp.x),
                        f32::from(wp.y),
                        window,
                        cx,
                    );
                }
                cx.notify();
            }
            EdgelessGesture::Marquee { .. } | EdgelessGesture::SelectLabelText { .. } => {
                cx.notify();
            }
            EdgelessGesture::DragSelection {
                start_world,
                current_world,
                initial,
                shift,
                alt_clone,
                pending_dblclick,
            } => {
                let (dx_f32, dy_f32) = if shift {
                    constrain_shift_drag(start_world, current_world)
                } else {
                    (
                        current_world.0 - start_world.0,
                        current_world.1 - start_world.1,
                    )
                };
                let dx = dx_f32 as f64;
                let dy = dy_f32 as f64;
                if dx.hypot(dy) < 0.5 {
                    if let Some((item_id, world_pos)) = pending_dblclick {
                        self.edgeless_begin_inline_edit_at(&item_id, Some(world_pos), window, cx);
                    } else {
                        cx.notify();
                    }
                    return;
                }
                if alt_clone {
                    self.edgeless_clone_items_by_delta(&initial, dx, dy, cx);
                    return;
                }
                let constrained_world = (start_world.0 + dx_f32, start_world.1 + dy_f32);
                let frame_updates = compute_frame_membership_updates(
                    &self.edgeless.authoring.painted_items,
                    &initial,
                    constrained_world,
                );
                let commit = self.page_mut().ok().and_then(|page| {
                    page.structural_edit(now_ms, move |page| {
                        for item in &initial {
                            let new_xywh = [
                                item.rect.x as f64 + dx,
                                item.rect.y as f64 + dy,
                                item.rect.w as f64,
                                item.rect.h as f64,
                            ];
                            if item.kind.is_block() {
                                page.set_block_xywh(&item.id, new_xywh, now_ms)?;
                            } else if item.kind == SpatialItemKind::Connector {
                                if let Some(surface_id) = &item.surface_id {
                                    if let Some((None, Some([sx, sy]))) = &item.connector_source {
                                        page.set_surface_element_field(
                                            surface_id,
                                            &item.id,
                                            "source",
                                            SessionValue::Any(
                                                ConnectorEndpointSpec::point(sx + dx, sy + dy)
                                                    .to_any(),
                                            ),
                                            now_ms,
                                        )?;
                                    }
                                    if let Some((None, Some([tx, ty]))) = &item.connector_target {
                                        page.set_surface_element_field(
                                            surface_id,
                                            &item.id,
                                            "target",
                                            SessionValue::Any(
                                                ConnectorEndpointSpec::point(tx + dx, ty + dy)
                                                    .to_any(),
                                            ),
                                            now_ms,
                                        )?;
                                    }
                                    if let Some([lx, ly, lw, lh]) = item.connector_label_xywh {
                                        page.set_surface_element_field(
                                            surface_id,
                                            &item.id,
                                            "labelXYWH",
                                            SessionValue::Any(map_array_any(vec![
                                                Any::Float64((lx + dx).into()),
                                                Any::Float64((ly + dy).into()),
                                                Any::Float64(lw.into()),
                                                Any::Float64(lh.into()),
                                            ])),
                                            now_ms,
                                        )?;
                                    }
                                }
                            } else if item.kind == SpatialItemKind::Group {
                                // Groups derive bounds from their children; never write synthetic xywh.
                            } else if let Some(surface_id) = &item.surface_id {
                                page.set_surface_element_field(
                                    surface_id,
                                    &item.id,
                                    "xywh",
                                    SessionValue::Any(Any::String(PageDocSession::format_xywh(
                                        new_xywh,
                                    ))),
                                    now_ms,
                                )?;
                            }
                        }
                        for (frame_id, add_ids, remove_ids) in &frame_updates {
                            page.update_frame_child_element_ids(
                                frame_id, add_ids, remove_ids, now_ms,
                            )?;
                        }
                        Ok(())
                    })
                    .ok()
                    .flatten()
                });
                if let Some(commit) = commit {
                    self.did_edgeless_doc_commit(commit, cx);
                }
            }
            EdgelessGesture::ResizeSelection {
                handle,
                start_world,
                current_world,
                initial_box,
                initial,
                shift,
                rotate_deg,
            } => {
                let min_w = if initial.len() == 1 && initial[0].kind == SpatialItemKind::Note {
                    NOTE_MIN_WIDTH
                } else {
                    24.0
                };
                let lock_ratio = shift || initial.len() > 1;
                let new_box = resized_rect_constrained(
                    initial_box,
                    handle,
                    start_world,
                    current_world,
                    min_w,
                    24.0,
                    lock_ratio,
                    rotate_deg,
                );
                if (new_box.x - initial_box.x).abs() < 0.5
                    && (new_box.y - initial_box.y).abs() < 0.5
                    && (new_box.w - initial_box.w).abs() < 0.5
                    && (new_box.h - initial_box.h).abs() < 0.5
                {
                    cx.notify();
                    return;
                }
                let sx = (new_box.w / initial_box.w.max(1.0)) as f64;
                let sy = (new_box.h / initial_box.h.max(1.0)) as f64;
                let horizontal_resize = matches!(
                    handle,
                    HandleKind::E
                        | HandleKind::W
                        | HandleKind::NE
                        | HandleKind::NW
                        | HandleKind::SE
                        | HandleKind::SW
                );
                let single_rotated = initial.len() == 1 && rotate_deg.abs() > 1e-3;
                let commit = self.page_mut().ok().and_then(|page| {
                    page.structural_edit(now_ms, move |page| {
                        for item in &initial {
                            let (nx, ny, nw, nh) = if single_rotated {
                                (
                                    new_box.x as f64,
                                    new_box.y as f64,
                                    new_box.w as f64,
                                    new_box.h as f64,
                                )
                            } else {
                                let nx =
                                    new_box.x as f64 + (item.rect.x - initial_box.x) as f64 * sx;
                                let ny =
                                    new_box.y as f64 + (item.rect.y - initial_box.y) as f64 * sy;
                                let item_min_w = if item.kind == SpatialItemKind::Note {
                                    NOTE_MIN_WIDTH as f64
                                } else {
                                    16.0
                                };
                                let nw = (item.rect.w as f64 * sx).max(item_min_w);
                                let nh = (item.rect.h as f64 * sy).max(16.0);
                                (nx, ny, nw, nh)
                            };
                            if item.kind.is_block() {
                                page.set_block_xywh(&item.id, [nx, ny, nw, nh], now_ms)?;
                                if item.kind == SpatialItemKind::EdgelessText && horizontal_resize {
                                    page.set_block_prop(
                                        &item.id,
                                        "prop:hasMaxWidth",
                                        SessionValue::Any(Any::True),
                                        now_ms,
                                    )?;
                                }
                            } else if item.kind == SpatialItemKind::Connector {
                                if let Some(surface_id) = &item.surface_id {
                                    if let Some((None, Some([px_0, py_0]))) = &item.connector_source
                                    {
                                        let ex =
                                            new_box.x as f64 + (px_0 - initial_box.x as f64) * sx;
                                        let ey =
                                            new_box.y as f64 + (py_0 - initial_box.y as f64) * sy;
                                        page.set_surface_element_field(
                                            surface_id,
                                            &item.id,
                                            "source",
                                            SessionValue::Any(
                                                ConnectorEndpointSpec::point(ex, ey).to_any(),
                                            ),
                                            now_ms,
                                        )?;
                                    }
                                    if let Some((None, Some([px_0, py_0]))) = &item.connector_target
                                    {
                                        let ex =
                                            new_box.x as f64 + (px_0 - initial_box.x as f64) * sx;
                                        let ey =
                                            new_box.y as f64 + (py_0 - initial_box.y as f64) * sy;
                                        page.set_surface_element_field(
                                            surface_id,
                                            &item.id,
                                            "target",
                                            SessionValue::Any(
                                                ConnectorEndpointSpec::point(ex, ey).to_any(),
                                            ),
                                            now_ms,
                                        )?;
                                    }
                                }
                            } else if item.kind == SpatialItemKind::Group {
                                // Groups derive bounds from their children; never write synthetic xywh.
                            } else if let Some(surface_id) = &item.surface_id {
                                page.set_surface_element_field(
                                    surface_id,
                                    &item.id,
                                    "xywh",
                                    SessionValue::Any(Any::String(PageDocSession::format_xywh([
                                        nx, ny, nw, nh,
                                    ]))),
                                    now_ms,
                                )?;
                                if let Some(points) = &item.points {
                                    let scaled: Vec<Any> = points
                                        .iter()
                                        .map(|p| {
                                            if p.len() >= 3 {
                                                Any::Array(vec![
                                                    Any::Float64((p[0] * sx).into()),
                                                    Any::Float64((p[1] * sy).into()),
                                                    Any::Float64(p[2].into()),
                                                ])
                                            } else {
                                                Any::Array(vec![
                                                    Any::Float64((p[0] * sx).into()),
                                                    Any::Float64((p[1] * sy).into()),
                                                ])
                                            }
                                        })
                                        .collect();
                                    page.set_surface_element_field(
                                        surface_id,
                                        &item.id,
                                        "points",
                                        SessionValue::Any(map_array_any(scaled)),
                                        now_ms,
                                    )?;
                                }
                            }
                        }
                        Ok(())
                    })
                    .ok()
                    .flatten()
                });
                if let Some(commit) = commit {
                    self.did_edgeless_doc_commit(commit, cx);
                }
            }
            EdgelessGesture::RotateSelection {
                id,
                surface_id,
                is_block,
                initial_rotate,
                current_rotate,
                ..
            } => {
                if (current_rotate - initial_rotate).abs() < 0.1 {
                    cx.notify();
                    return;
                }
                let commit = self.page_mut().ok().and_then(|page| {
                    page.structural_edit(now_ms, move |page| {
                        if is_block {
                            page.set_block_rotate(&id, current_rotate, now_ms)?;
                        } else if let Some(sid) = &surface_id {
                            page.set_surface_element_field(
                                sid,
                                &id,
                                "rotate",
                                SessionValue::Any(Any::Float64(current_rotate.into())),
                                now_ms,
                            )?;
                        }
                        Ok(())
                    })
                    .ok()
                    .flatten()
                });
                if let Some(commit) = commit {
                    self.did_edgeless_doc_commit(commit, cx);
                }
            }
            EdgelessGesture::CreateShape {
                shape_type,
                start_world,
                current_world,
                shift,
            } => {
                let mut r = if shift {
                    constrain_shift_square(start_world, current_world)
                } else {
                    normalized_rect(start_world, current_world)
                };
                if r.w < 12.0 && r.h < 12.0 {
                    r = WorldRect::new(start_world.0 - 80.0, start_world.1 - 50.0, 160.0, 100.0);
                } else if shift {
                    let side = r.w.max(r.h).max(40.0);
                    r.w = side;
                    r.h = side;
                } else {
                    r.w = r.w.max(40.0);
                    r.h = r.h.max(32.0);
                }
                let next_idx = self
                    .snapshot
                    .as_deref()
                    .and_then(max_spatial_index)
                    .and_then(|m| generate_key_between(Some(&m), None).ok())
                    .unwrap_or_else(|| "a0".to_string());
                let shape_str = shape_type.as_spec_str();
                let seed = (self.edgeless.authoring.next_id_seq as i32 + 17) * 97;
                let cid = self.page().map(|p| p.client_id());
                let id_opt = cid.map(|c| self.edgeless.authoring.next_id("shape", c));
                if let Some(elem_id) = id_opt {
                    let elem_id_clone = elem_id.clone();
                    let commit = self.page_mut().ok().and_then(|page| {
                        page.structural_edit(now_ms, move |page| {
                            let surface_id = page.ensure_surface_block(now_ms)?;
                            page.add_surface_element(
                                &surface_id,
                                elem_id_clone.clone(),
                                &next_idx,
                                SurfaceElementSpec::Shape {
                                    shape_type: shape_str.to_string(),
                                    xywh: PageDocSession::format_xywh([
                                        r.x as f64, r.y as f64, r.w as f64, r.h as f64,
                                    ]),
                                    seed,
                                    filled: true,
                                    text: None,
                                },
                                now_ms,
                            )?;
                            Ok(())
                        })
                        .ok()
                        .flatten()
                    });
                    if let Some(commit) = commit {
                        self.did_edgeless_doc_commit(commit, cx);
                        self.edgeless.authoring.selection.clear();
                        self.edgeless.authoring.selection.insert(elem_id);
                        self.edgeless.authoring.tool = EdgelessTool::Select;
                        self.edgeless.authoring.shape_picker_open = false;
                        let close_ms = self.now_ms(cx);
                        if let Some(p) = self.edgeless_shape_picker_presence.as_mut() {
                            p.close(close_ms);
                        }
                    }
                }
            }
            EdgelessGesture::CreateFrame {
                start_world,
                current_world,
            } => {
                let mut r = normalized_rect(start_world, current_world);
                if r.w < 20.0 && r.h < 20.0 {
                    r = WorldRect::new(start_world.0 - 160.0, start_world.1 - 120.0, 320.0, 240.0);
                } else {
                    r.w = r.w.max(120.0);
                    r.h = r.h.max(80.0);
                }
                let next_idx = self
                    .snapshot
                    .as_deref()
                    .and_then(max_spatial_index)
                    .and_then(|m| generate_key_between(Some(&m), None).ok())
                    .unwrap_or_else(|| "a0".to_string());
                let mut grouped_ids = std::collections::HashSet::<&str>::new();
                if let Some(root) = self.snapshot.as_ref().and_then(|s| s.root.as_ref()) {
                    for node in root.walk() {
                        if let BlockContent::Surface { elements, .. } = &node.content {
                            for el in elements {
                                if let SurfaceElementKind::Group { children, .. } = &el.kind {
                                    for cid in children {
                                        grouped_ids.insert(cid.as_str());
                                    }
                                }
                            }
                        }
                    }
                }
                let enclosed: Vec<String> = self
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .filter(|item| {
                        item.kind != SpatialItemKind::Frame
                            && !grouped_ids.contains(item.id.as_str())
                            && r.contains_rect(rotated_bounds(item.rect, item.rotate_deg))
                    })
                    .map(|item| item.id.clone())
                    .collect();
                let cid = self.page().map(|p| p.client_id());
                let id_opt = cid.map(|c| self.edgeless.authoring.next_id("frame", c));
                if let Some(frame_id) = id_opt {
                    let frame_id_clone = frame_id.clone();
                    let commit = self.page_mut().ok().and_then(|page| {
                        let enclosed_refs: Vec<&str> =
                            enclosed.iter().map(String::as_str).collect();
                        page.add_frame_with_children(
                            None,
                            &frame_id_clone,
                            "Frame",
                            &next_idx,
                            [r.x as f64, r.y as f64, r.w as f64, r.h as f64],
                            &enclosed_refs,
                            now_ms,
                        )
                        .ok()
                        .flatten()
                    });
                    if let Some(commit) = commit {
                        self.did_edgeless_doc_commit(commit, cx);
                        self.edgeless.authoring.selection.clear();
                        self.edgeless.authoring.selection.insert(frame_id);
                        self.edgeless.authoring.tool = EdgelessTool::Select;
                    }
                }
            }
            EdgelessGesture::CreateNote {
                start_world,
                current_world,
            } => {
                let mut r = normalized_rect(start_world, current_world);
                if r.w < 40.0 {
                    r = WorldRect::new(start_world.0 - 200.0, start_world.1 - 60.0, 440.0, 140.0);
                } else {
                    r.w = r.w.max(240.0);
                    r.h = r.h.max(92.0);
                }
                let next_idx = self
                    .snapshot
                    .as_deref()
                    .and_then(max_spatial_index)
                    .and_then(|m| generate_key_between(Some(&m), None).ok())
                    .unwrap_or_else(|| "a0".to_string());
                let root_id = self
                    .snapshot
                    .as_ref()
                    .and_then(|s| s.root.as_ref())
                    .map(|r| r.id.clone());
                let cid = self.page().map(|p| p.client_id());
                let ids = cid.map(|c| {
                    (
                        self.edgeless.authoring.next_id("note", c),
                        self.edgeless.authoring.next_id("para", c),
                    )
                });
                if let (Some(root_id), Some((note_id, para_id))) = (root_id, ids) {
                    let note_id_clone = note_id.clone();
                    let para_id_clone = para_id.clone();
                    let commit = self.page_mut().ok().and_then(|page| {
                        page.add_edgeless_note(
                            &root_id,
                            &note_id_clone,
                            &para_id_clone,
                            &next_idx,
                            [r.x as f64, r.y as f64, r.w as f64, r.h as f64],
                            "",
                            now_ms,
                        )
                        .ok()
                        .flatten()
                    });
                    if let Some(commit) = commit {
                        self.did_edgeless_doc_commit(commit, cx);
                        self.edgeless.authoring.selection.clear();
                        self.edgeless.authoring.selection.insert(note_id.clone());
                        self.edgeless.authoring.tool = EdgelessTool::Select;
                        self.edgeless.authoring.inline_edit =
                            Some(EdgelessInlineEdit::SpatialBlock {
                                block_id: note_id,
                                is_note: true,
                                created_new: false,
                            });
                        let pt = DocPoint::new(&para_id, 0);
                        self.editor.selection = Some(DocumentSelection {
                            anchor: pt.clone(),
                            focus: pt,
                        });
                        window.notify_text_input_changed(&self.editor_focus);
                    }
                }
            }
            EdgelessGesture::CreateConnector {
                mode,
                source_id,
                source_port,
                source_world,
                current_world,
                target_id,
                target_port,
                target_world,
            } => {
                self.commit_create_connector(
                    mode,
                    source_id,
                    source_port,
                    source_world,
                    current_world,
                    target_id,
                    target_port,
                    target_world,
                    now_ms,
                    cx,
                );
            }
            EdgelessGesture::DragConnectorEndpoint {
                id,
                surface_id,
                is_start,
                current_world,
                snap_id,
                snap_port,
                ..
            } => {
                self.commit_connector_endpoint_drag(
                    id,
                    surface_id,
                    is_start,
                    current_world,
                    snap_id,
                    snap_port,
                    now_ms,
                    cx,
                );
            }
            EdgelessGesture::DrawStroke {
                highlighter,
                points_world,
            } => {
                if points_world.len() < 2 {
                    cx.notify();
                    return;
                }
                let mut min_x = f64::INFINITY;
                let mut min_y = f64::INFINITY;
                let mut max_x = f64::NEG_INFINITY;
                let mut max_y = f64::NEG_INFINITY;
                for &(x, y) in &points_world {
                    min_x = min_x.min(x);
                    min_y = min_y.min(y);
                    max_x = max_x.max(x);
                    max_y = max_y.max(y);
                }
                let line_width = if highlighter { 22.0 } else { 4.0 };
                let half = line_width * 0.5;
                let bx = min_x - half;
                let by = min_y - half;
                let bw = (max_x - min_x + line_width).max(line_width);
                let bh = (max_y - min_y + line_width).max(line_width);
                let local_points: Vec<Vec<f64>> = points_world
                    .iter()
                    .map(|&(x, y)| vec![x - bx, y - by])
                    .collect();
                let next_idx = self
                    .snapshot
                    .as_deref()
                    .and_then(max_spatial_index)
                    .and_then(|m| generate_key_between(Some(&m), None).ok())
                    .unwrap_or_else(|| "a0".to_string());
                let seed = (self.edgeless.authoring.next_id_seq as i32 + 53) * 61;
                let prefix = if highlighter { "hl" } else { "brush" };
                let cid = self.page().map(|p| p.client_id());
                let id_opt = cid.map(|c| self.edgeless.authoring.next_id(prefix, c));
                if let Some(stroke_id) = id_opt {
                    let stroke_id_clone = stroke_id.clone();
                    let xywh = PageDocSession::format_xywh([bx, by, bw, bh]);
                    let spec = if highlighter {
                        SurfaceElementSpec::Highlighter {
                            seed,
                            points: local_points,
                            xywh,
                        }
                    } else {
                        SurfaceElementSpec::Brush {
                            seed,
                            points: local_points,
                            xywh,
                        }
                    };
                    let commit = self.page_mut().ok().and_then(|page| {
                        page.structural_edit(now_ms, move |page| {
                            let surface_id = page.ensure_surface_block(now_ms)?;
                            page.add_surface_element(
                                &surface_id,
                                stroke_id_clone.clone(),
                                &next_idx,
                                spec.clone(),
                                now_ms,
                            )?;
                            Ok(())
                        })
                        .ok()
                        .flatten()
                    });
                    if let Some(commit) = commit {
                        self.did_edgeless_doc_commit(commit, cx);
                        // Align with Web `brush-tool.ts`: stay in Brush/Highlighter mode with
                        // empty selection so the user can keep drawing continuously.
                        self.edgeless.authoring.selection.clear();
                    }
                }
            }
        }
    }

    pub(super) fn create_edgeless_text_at(
        &mut self,
        wx: f32,
        wy: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let now_ms = self.now_ms(cx) as u64;
        let next_idx = self
            .snapshot
            .as_deref()
            .and_then(max_spatial_index)
            .and_then(|m| generate_key_between(Some(&m), None).ok())
            .unwrap_or_else(|| "a0".to_string());
        let cid = self.page().map(|p| p.client_id());
        let ids = cid.map(|c| {
            (
                self.edgeless.authoring.next_id("edgeless-text", c),
                self.edgeless.authoring.next_id("para", c),
            )
        });
        let Some((text_id, para_id)) = ids else {
            return;
        };
        let text_id_clone = text_id.clone();
        let para_id_clone = para_id.clone();
        let commit = self.page_mut().ok().and_then(|page| {
            page.add_edgeless_text(
                None,
                &text_id_clone,
                &para_id_clone,
                &next_idx,
                [wx as f64, wy as f64, 160.0, 26.0],
                "",
                now_ms,
            )
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
            self.edgeless.authoring.selection.clear();
            self.edgeless.authoring.selection.insert(text_id.clone());
            self.edgeless.authoring.tool = EdgelessTool::Select;
            self.edgeless.authoring.inline_edit = Some(EdgelessInlineEdit::SpatialBlock {
                block_id: text_id,
                is_note: false,
                created_new: true,
            });
            let pt = DocPoint::new(&para_id, 0);
            self.editor.selection = Some(DocumentSelection {
                anchor: pt.clone(),
                focus: pt,
            });
            if let Ok(page) = self.page_mut() {
                let _ = page.stop_capturing();
            }
            window.notify_text_input_changed(&self.editor_focus);
            cx.notify();
        }
    }
}
