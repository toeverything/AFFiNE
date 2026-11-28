//! Screen-space selection frame, handles, marquee, live creation previews, and inline label editor overlay.

use blocksuite_playground_doc::read::ConnectorMode;
use ui::{
    AnyElement, BorderStyle, Bounds, Corners, Edges, Hsla, PathBuilder, Pixels, Point, canvas, div,
    point, prelude::*, px, size,
};

use crate::theme::{Palette, PlaygroundTheme};

use super::{
    EDGELESS_VIEWPORT_ID, EdgelessAuthoringState, EdgelessCamera, EdgelessGesture, HandleKind,
    SpatialItemKind, constrain_shift_square, normalized_rect,
    overlay_label::build_inline_label_editor_overlay, rotate_point_around,
};

/// Screen-space selection frame, 8 resize handles, rotation handle, connector endpoint handles,
/// Edgeless `2×3` `gfx` drag handle, marquee box, live creation previews, and inline label editor overlay.
#[allow(clippy::too_many_arguments)]
pub fn build_edgeless_authoring_overlay(
    authoring: &EdgelessAuthoringState,
    camera: EdgelessCamera,
    viewport_width: f32,
    viewport_height: f32,
    palette: &Palette,
    theme: PlaygroundTheme,
    window: &ui::Window,
) -> Vec<AnyElement> {
    let mut elements = Vec::new();
    let vp_origin = point(px(0.0), px(0.0));
    let brand = palette.brand;
    let white = Hsla::white();

    // 1. Selection box + 8 resize handles + rotation handle + connector handles + Edgeless gfx drag handle.
    if let Some(sel_box) = authoring.selection_world_box() {
        let tl = camera.world_to_screen(point(px(sel_box.x), px(sel_box.y)), vp_origin);
        let br =
            camera.world_to_screen(point(px(sel_box.right()), px(sel_box.bottom())), vp_origin);
        let x0 = f32::from(tl.x);
        let y0 = f32::from(tl.y);
        let x1 = f32::from(br.x);
        let y1 = f32::from(br.y);
        let w = (x1 - x0).max(2.0);
        let h = (y1 - y0).max(2.0);

        let mx = (x0 + x1) * 0.5;
        let my = (y0 + y1) * 0.5;
        let live_overrides = authoring.live_overrides();
        let single_rotatable = authoring
            .single_selected()
            .filter(|s| s.kind.is_rotatable());
        let rot_deg = single_rotatable
            .map(|s| {
                live_overrides
                    .get(&s.id)
                    .and_then(|o| o.rotate_deg)
                    .unwrap_or(s.rotate_deg)
            })
            .filter(|r| r.abs() > 1e-3)
            .unwrap_or(0.0);

        let hide_selection_box = authoring
            .label_editor()
            .is_some_and(|ed| matches!(ed.target, super::LabelTarget::Connector { .. }));
        let visible_box =
            x0 >= 0.0 && y0 >= 0.0 && x0 + w <= viewport_width && y0 + h <= viewport_height;
        if hide_selection_box {
            // Suppress connector selection box while editing its label inline.
        } else if rot_deg.abs() > 1e-3 {
            let c0 = rotate_point_around(x0, y0, mx, my, rot_deg);
            let c1 = rotate_point_around(x1, y0, mx, my, rot_deg);
            let c2 = rotate_point_around(x1, y1, mx, my, rot_deg);
            let c3 = rotate_point_around(x0, y1, mx, my, rot_deg);
            elements.push(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        let ox = f32::from(bounds.origin.x);
                        let oy = f32::from(bounds.origin.y);
                        let mut pb = PathBuilder::stroke(px(2.0));
                        pb.move_to(point(px(ox + c0.0), px(oy + c0.1)));
                        pb.line_to(point(px(ox + c1.0), px(oy + c1.1)));
                        pb.line_to(point(px(ox + c2.0), px(oy + c2.1)));
                        pb.line_to(point(px(ox + c3.0), px(oy + c3.1)));
                        pb.line_to(point(px(ox + c0.0), px(oy + c0.1)));
                        if let Ok(path) = pb.build() {
                            window.paint_path(path, brand);
                        }
                    },
                )
                .absolute()
                .inset_0()
                .into_any_element(),
            );
            if visible_box {
                elements.push(
                    div()
                        .absolute()
                        .left(px(x0))
                        .top(px(y0))
                        .w(px(w))
                        .h(px(h))
                        .snapshot("edgeless.selection_box", Some(EDGELESS_VIEWPORT_ID))
                        .into_any_element(),
                );
            }
        } else {
            let mut box_el = div()
                .absolute()
                .left(px(x0))
                .top(px(y0))
                .w(px(w))
                .h(px(h))
                .border_color(brand)
                .border_2();
            if visible_box {
                box_el = box_el.snapshot("edgeless.selection_box", Some(EDGELESS_VIEWPORT_ID));
            }
            elements.push(box_el.into_any_element());
        }

        if authoring.inline_edit.is_none() {
            // Circular endpoint drag handles for a single selected connector.
            if let Some(single) = authoring.single_selected()
                && single.kind == SpatialItemKind::Connector
                && single.polyline.len() >= 2
            {
                let endpoints = [
                    (HandleKind::ConnectorStart, single.polyline[0]),
                    (HandleKind::ConnectorEnd, *single.polyline.last().unwrap()),
                ];
                for (kind, (wx, wy)) in endpoints {
                    let sp = camera.world_to_screen(point(px(wx), px(wy)), vp_origin);
                    let lx = (f32::from(sp.x) - 5.0).round();
                    let ty = (f32::from(sp.y) - 5.0).round();
                    let mut h_el = div()
                        .absolute()
                        .left(px(lx))
                        .top(px(ty))
                        .w(px(10.0))
                        .h(px(10.0))
                        .rounded(px(5.0))
                        .bg(white)
                        .border_2()
                        .border_color(brand);
                    if lx >= 0.0
                        && ty >= 0.0
                        && lx + 10.0 <= viewport_width
                        && ty + 10.0 <= viewport_height
                    {
                        h_el = h_el.snapshot(kind.snapshot_id(), Some(EDGELESS_VIEWPORT_ID));
                    }
                    elements.push(h_el.into_any_element());
                }
            }

            if authoring.selection_has_non_connector() {
                let handle_coords = [
                    (HandleKind::NW, x0, y0),
                    (HandleKind::N, mx, y0),
                    (HandleKind::NE, x1, y0),
                    (HandleKind::E, x1, my),
                    (HandleKind::SE, x1, y1),
                    (HandleKind::S, mx, y1),
                    (HandleKind::SW, x0, y1),
                    (HandleKind::W, x0, my),
                ];
                for (kind, hx, hy) in handle_coords {
                    let (hx, hy) = rotate_point_around(hx, hy, mx, my, rot_deg);
                    let lx = (hx - 4.0).round();
                    let ty = (hy - 4.0).round();
                    let mut h_el = div()
                        .absolute()
                        .left(px(lx))
                        .top(px(ty))
                        .w(px(8.0))
                        .h(px(8.0))
                        .rounded(px(2.0))
                        .bg(white)
                        .border_1()
                        .border_color(brand);
                    if lx >= 0.0
                        && ty >= 0.0
                        && lx + 8.0 <= viewport_width
                        && ty + 8.0 <= viewport_height
                    {
                        h_el = h_el.snapshot(kind.snapshot_id(), Some(EDGELESS_VIEWPORT_ID));
                    }
                    elements.push(h_el.into_any_element());
                }
            }

            // Top rotation handle for rotatable items (Shape / EdgelessText).
            if single_rotatable.is_some() {
                let stem_a = rotate_point_around(mx, y0, mx, my, rot_deg);
                let stem_b = rotate_point_around(mx, y0 - 20.0, mx, my, rot_deg);
                let knob_c = rotate_point_around(mx, y0 - 24.0, mx, my, rot_deg);
                let rx = (knob_c.0 - 5.0).round();
                let ry = (knob_c.1 - 5.0).round();
                elements.push(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, _| {
                            let ox = f32::from(bounds.origin.x);
                            let oy = f32::from(bounds.origin.y);
                            let mut pb = PathBuilder::stroke(px(1.5));
                            pb.move_to(point(px(ox + stem_a.0), px(oy + stem_a.1)));
                            pb.line_to(point(px(ox + stem_b.0), px(oy + stem_b.1)));
                            if let Ok(path) = pb.build() {
                                window.paint_path(path, brand);
                            }
                        },
                    )
                    .absolute()
                    .inset_0()
                    .into_any_element(),
                );
                let mut r_el = div()
                    .absolute()
                    .left(px(rx))
                    .top(px(ry))
                    .w(px(10.0))
                    .h(px(10.0))
                    .rounded(px(5.0))
                    .bg(white)
                    .border_1()
                    .border_color(brand);
                if rx >= 0.0
                    && ry >= 0.0
                    && rx + 10.0 <= viewport_width
                    && ry + 10.0 <= viewport_height
                {
                    r_el =
                        r_el.snapshot(HandleKind::Rotate.snapshot_id(), Some(EDGELESS_VIEWPORT_ID));
                }
                elements.push(r_el.into_any_element());
            }
        }

        // 2x3 6-dot 14px Edgeless gfx drag handle for Note / Frame / EdgelessText.
        if let Some(single) = authoring.single_selected()
            && single.kind.has_gfx_drag_handle()
        {
            let hx = (x0 - 20.0)
                .clamp(4.0, (viewport_width - 18.0).max(4.0))
                .round();
            let hy = y0.clamp(4.0, (viewport_height - 28.0).max(4.0)).round();
            let dots_color = theme
                .css_var("--affine-v2-icon-secondary")
                .unwrap_or(palette.icon);
            let pill_bg = theme
                .css_var("--affine-v2-layer-background-hoverOverlay")
                .unwrap_or(palette.hover);
            let mut dh = div()
                .absolute()
                .left(px(hx))
                .top(px(hy))
                .w(px(14.0))
                .h(px(24.0))
                .rounded(px(4.0))
                .bg(pill_bg)
                .flex()
                .items_center()
                .justify_center()
                .child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, _| {
                            for row in 0..3 {
                                for col in 0..2 {
                                    let dot = Bounds::new(
                                        point(
                                            bounds.origin.x + px(col as f32 * 5.0),
                                            bounds.origin.y + px(row as f32 * 5.0),
                                        ),
                                        size(px(3.0), px(3.0)),
                                    );
                                    window.paint_quad(
                                        ui::fill(dot, dots_color).corner_radii(px(1.5)),
                                    );
                                }
                            }
                        },
                    )
                    .w(px(8.0))
                    .h(px(13.0)),
                );
            if hx >= 0.0 && hy >= 0.0 && hx + 14.0 <= viewport_width && hy + 24.0 <= viewport_height
            {
                dh = dh.snapshot(
                    HandleKind::DragHandle.snapshot_id(),
                    Some(EDGELESS_VIEWPORT_ID),
                );
            }
            elements.push(dh.into_any_element());
        }
    }

    // 2. Active gesture previews (marquee, shape/frame/note creation, connector routing, freehand stroke).
    match &authoring.gesture {
        Some(EdgelessGesture::Marquee {
            start_world,
            current_world,
        }) => {
            let r = normalized_rect(*start_world, *current_world);
            let tl = camera.world_to_screen(point(px(r.x), px(r.y)), vp_origin);
            let br = camera.world_to_screen(point(px(r.right()), px(r.bottom())), vp_origin);
            let x = f32::from(tl.x).max(0.0);
            let y = f32::from(tl.y).max(0.0);
            let w = (f32::from(br.x).min(viewport_width) - x).max(1.0);
            let h = (f32::from(br.y).min(viewport_height) - y).max(1.0);
            let mut mq = div()
                .absolute()
                .left(px(x))
                .top(px(y))
                .w(px(w))
                .h(px(h))
                .bg(brand.opacity(0.12))
                .border_1()
                .border_color(brand);
            if x >= 0.0 && y >= 0.0 && x + w <= viewport_width && y + h <= viewport_height {
                mq = mq.snapshot("edgeless.marquee", Some(EDGELESS_VIEWPORT_ID));
            }
            elements.push(mq.into_any_element());
        }
        Some(EdgelessGesture::CreateShape {
            start_world,
            current_world,
            shift,
            ..
        }) => {
            let r = if *shift {
                constrain_shift_square(*start_world, *current_world)
            } else {
                normalized_rect(*start_world, *current_world)
            };
            elements.push(build_creation_rect_preview(r, camera, vp_origin, brand));
        }
        Some(EdgelessGesture::CreateFrame {
            start_world,
            current_world,
        })
        | Some(EdgelessGesture::CreateNote {
            start_world,
            current_world,
        }) => {
            let r = normalized_rect(*start_world, *current_world);
            elements.push(build_creation_rect_preview(r, camera, vp_origin, brand));
        }
        Some(EdgelessGesture::CreateConnector {
            mode,
            source_id,
            source_port,
            source_world,
            current_world,
            target_id,
            target_port,
            target_world,
        }) => {
            let dst = target_world.unwrap_or(*current_world);
            elements.push(build_connector_preview(
                *mode,
                source_id.as_deref(),
                *source_port,
                *source_world,
                target_id.as_deref(),
                *target_port,
                dst,
                true,
                target_world.is_some(),
                &authoring.painted_items,
                camera,
                vp_origin,
                brand,
                white,
            ));
        }
        Some(EdgelessGesture::DragConnectorEndpoint {
            is_start,
            mode,
            fixed_id,
            fixed_port,
            fixed_world,
            current_world,
            snap_id,
            snap_port,
            snap_world,
            ..
        }) => {
            let moving_world = snap_world.unwrap_or(*current_world);
            let (s_id, s_port, s_world, t_id, t_port, t_world, s_ring, t_ring) = if *is_start {
                (
                    snap_id.as_deref(),
                    *snap_port,
                    moving_world,
                    fixed_id.as_deref(),
                    *fixed_port,
                    *fixed_world,
                    snap_world.is_some(),
                    true,
                )
            } else {
                (
                    fixed_id.as_deref(),
                    *fixed_port,
                    *fixed_world,
                    snap_id.as_deref(),
                    *snap_port,
                    moving_world,
                    true,
                    snap_world.is_some(),
                )
            };
            elements.push(build_connector_preview(
                *mode,
                s_id,
                s_port,
                s_world,
                t_id,
                t_port,
                t_world,
                s_ring,
                t_ring,
                &authoring.painted_items,
                camera,
                vp_origin,
                brand,
                white,
            ));
        }
        Some(EdgelessGesture::DrawStroke {
            highlighter,
            points_world,
        }) if points_world.len() >= 2 => {
            let pts: Vec<Point<Pixels>> = points_world
                .iter()
                .map(|&(wx, wy)| {
                    camera.world_to_screen(point(px(wx as f32), px(wy as f32)), vp_origin)
                })
                .collect();
            let width = if *highlighter {
                (22.0 * camera.zoom).max(4.0)
            } else {
                (4.0 * camera.zoom).max(2.0)
            };
            let color = if *highlighter {
                ui::rgba(0x84cfff70).into()
            } else {
                palette.text_primary
            };
            elements.push(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        let ox = f32::from(bounds.origin.x);
                        let oy = f32::from(bounds.origin.y);
                        let mut pb = PathBuilder::stroke(px(width));
                        pb.move_to(point(
                            px(ox + f32::from(pts[0].x)),
                            px(oy + f32::from(pts[0].y)),
                        ));
                        for p in &pts[1..] {
                            pb.line_to(point(px(ox + f32::from(p.x)), px(oy + f32::from(p.y))));
                        }
                        if let Ok(path) = pb.build() {
                            window.paint_path(path, color);
                        }
                    },
                )
                .absolute()
                .inset_0()
                .into_any_element(),
            );
        }
        _ => {}
    }

    // 3. Inline label editor overlay (Shape / Connector / SurfaceText / Frame title).
    if let Some(editor) = authoring.label_editor()
        && let Some(el) = build_inline_label_editor_overlay(
            editor,
            camera,
            vp_origin,
            viewport_width,
            viewport_height,
            palette,
            theme,
            window,
        )
    {
        elements.push(el);
    }

    elements
}

fn build_creation_rect_preview(
    r: super::WorldRect,
    camera: EdgelessCamera,
    vp_origin: Point<Pixels>,
    brand: Hsla,
) -> AnyElement {
    let tl = camera.world_to_screen(point(px(r.x), px(r.y)), vp_origin);
    let br = camera.world_to_screen(point(px(r.right()), px(r.bottom())), vp_origin);
    let x = f32::from(tl.x);
    let y = f32::from(tl.y);
    let w = (f32::from(br.x) - x).max(2.0);
    let h = (f32::from(br.y) - y).max(2.0);
    div()
        .absolute()
        .left(px(x))
        .top(px(y))
        .w(px(w))
        .h(px(h))
        .bg(brand.opacity(0.08))
        .border_1()
        .border_color(brand)
        .rounded(px(4.0))
        .into_any_element()
}

#[allow(clippy::too_many_arguments)]
fn build_connector_preview(
    mode: ConnectorMode,
    source_id: Option<&str>,
    source_port: Option<[f64; 2]>,
    source_world: (f32, f32),
    target_id: Option<&str>,
    target_port: Option<[f64; 2]>,
    target_world: (f32, f32),
    highlight_start: bool,
    highlight_end: bool,
    items: &[super::SpatialItemInfo],
    camera: EdgelessCamera,
    vp_origin: Point<Pixels>,
    brand: Hsla,
    white: Hsla,
) -> AnyElement {
    let pts_screen: Vec<Point<Pixels>> = crate::surface::preview_connector_polyline(
        mode,
        source_id,
        source_port,
        source_world,
        target_id,
        target_port,
        target_world,
        items,
    )
    .into_iter()
    .map(|(wx, wy)| camera.world_to_screen(point(px(wx), px(wy)), vp_origin))
    .collect();
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            if pts_screen.len() < 2 {
                return;
            }
            let ox = f32::from(bounds.origin.x);
            let oy = f32::from(bounds.origin.y);
            let mut pb = PathBuilder::stroke(px(2.0));
            let first = point(
                px(ox + f32::from(pts_screen[0].x)),
                px(oy + f32::from(pts_screen[0].y)),
            );
            pb.move_to(first);
            for p in &pts_screen[1..] {
                pb.line_to(point(px(ox + f32::from(p.x)), px(oy + f32::from(p.y))));
            }
            if let Ok(path) = pb.build() {
                window.paint_path(path, brand);
            }
            let last_raw = *pts_screen.last().unwrap();
            let last = point(
                px(ox + f32::from(last_raw.x)),
                px(oy + f32::from(last_raw.y)),
            );
            for (pt, highlight) in [(first, highlight_start), (last, highlight_end)] {
                if highlight {
                    let ring = Bounds::new(
                        point(pt.x - px(5.0), pt.y - px(5.0)),
                        size(px(10.0), px(10.0)),
                    );
                    window.paint_quad(ui::quad(
                        ring,
                        Corners::all(px(5.0)),
                        white,
                        Edges::all(px(2.0)),
                        brand,
                        BorderStyle::Solid,
                    ));
                }
            }
        },
    )
    .absolute()
    .inset_0()
    .into_any_element()
}
