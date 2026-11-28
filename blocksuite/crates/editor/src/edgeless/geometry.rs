//! Pure geometry, rotated resize, Shift constraints, and connector port snapping for Edgeless.

use super::{HandleKind, SpatialItemInfo, SpatialItemKind, WorldRect};

pub fn rotate_point_around(x: f32, y: f32, cx: f32, cy: f32, deg: f32) -> (f32, f32) {
    if deg.abs() < 1e-4 {
        return (x, y);
    }
    let (s, c) = deg.to_radians().sin_cos();
    let dx = x - cx;
    let dy = y - cy;
    (cx + dx * c - dy * s, cy + dx * s + dy * c)
}

pub fn point_in_rotated_rect(wx: f32, wy: f32, rect: WorldRect, rotate_deg: f32) -> bool {
    let (cx, cy) = rect.center();
    let (lx, ly) = rotate_point_around(wx, wy, cx, cy, -rotate_deg);
    lx >= rect.x && lx <= rect.right() && ly >= rect.y && ly <= rect.bottom()
}

pub fn distance_to_segment(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let vx = b.0 - a.0;
    let vy = b.1 - a.1;
    let len_sq = vx * vx + vy * vy;
    if len_sq < 1e-8 {
        return (p.0 - a.0).hypot(p.1 - a.1);
    }
    let t = (((p.0 - a.0) * vx + (p.1 - a.1) * vy) / len_sq).clamp(0.0, 1.0);
    let proj_x = a.0 + t * vx;
    let proj_y = a.1 + t * vy;
    (p.0 - proj_x).hypot(p.1 - proj_y)
}

pub fn distance_to_polyline(p: (f32, f32), pts: &[(f32, f32)]) -> f32 {
    if pts.is_empty() {
        return f32::INFINITY;
    }
    if pts.len() == 1 {
        return (p.0 - pts[0].0).hypot(p.1 - pts[0].1);
    }
    pts.windows(2)
        .map(|w| distance_to_segment(p, w[0], w[1]))
        .fold(f32::INFINITY, f32::min)
}

pub fn normalized_rect(a: (f32, f32), b: (f32, f32)) -> WorldRect {
    let x = a.0.min(b.0);
    let y = a.1.min(b.1);
    WorldRect::new(x, y, (a.0 - b.0).abs(), (a.1 - b.1).abs())
}

/// Lock a drag delta to the dominant horizontal or vertical axis (Shift+Drag).
pub fn constrain_shift_drag(start: (f32, f32), current: (f32, f32)) -> (f32, f32) {
    let dx = current.0 - start.0;
    let dy = current.1 - start.1;
    if dx.abs() >= dy.abs() {
        (dx, 0.0)
    } else {
        (0.0, dy)
    }
}

/// Square a shape creation drag while preserving the quadrant from `start` toward `current`.
pub fn constrain_shift_square(start: (f32, f32), current: (f32, f32)) -> WorldRect {
    let dx = current.0 - start.0;
    let dy = current.1 - start.1;
    let side = dx.abs().max(dy.abs());
    let sx = if dx < 0.0 { -side } else { side };
    let sy = if dy < 0.0 { -side } else { side };
    normalized_rect(start, (start.0 + sx, start.1 + sy))
}

pub fn resized_rect(
    initial: WorldRect,
    handle: HandleKind,
    start: (f32, f32),
    current: (f32, f32),
) -> WorldRect {
    resized_rect_with_min(initial, handle, start, current, 24.0, 24.0)
}

pub fn resized_rect_with_min(
    initial: WorldRect,
    handle: HandleKind,
    start: (f32, f32),
    current: (f32, f32),
    min_w: f32,
    min_h: f32,
) -> WorldRect {
    resized_rect_constrained(initial, handle, start, current, min_w, min_h, false, 0.0)
}

/// Resize `initial` by dragging `handle` from `start` to `current` in world space.
///
/// When `rotate_deg != 0`, transforms the pointer delta into the element's inverse-rotated
/// local frame and keeps the opposite corner/edge pinned in world space.
/// When `lock_ratio` is true, preserves `initial.w / initial.h` across both corner and side handles.
#[allow(clippy::too_many_arguments)]
pub fn resized_rect_constrained(
    initial: WorldRect,
    handle: HandleKind,
    start: (f32, f32),
    current: (f32, f32),
    min_w: f32,
    min_h: f32,
    lock_ratio: bool,
    rotate_deg: f32,
) -> WorldRect {
    let (cx0, cy0) = initial.center();
    let (s_loc, c_loc) = if rotate_deg.abs() > 1e-3 {
        (
            rotate_point_around(start.0, start.1, cx0, cy0, -rotate_deg),
            rotate_point_around(current.0, current.1, cx0, cy0, -rotate_deg),
        )
    } else {
        (start, current)
    };
    let dx = c_loc.0 - s_loc.0;
    let dy = c_loc.1 - s_loc.1;

    let mut left = initial.x;
    let mut top = initial.y;
    let mut right = initial.right();
    let mut bottom = initial.bottom();
    match handle {
        HandleKind::NW => {
            left = (left + dx).min(right - min_w);
            top = (top + dy).min(bottom - min_h);
        }
        HandleKind::N => {
            top = (top + dy).min(bottom - min_h);
        }
        HandleKind::NE => {
            right = (right + dx).max(left + min_w);
            top = (top + dy).min(bottom - min_h);
        }
        HandleKind::E => {
            right = (right + dx).max(left + min_w);
        }
        HandleKind::SE => {
            right = (right + dx).max(left + min_w);
            bottom = (bottom + dy).max(top + min_h);
        }
        HandleKind::S => {
            bottom = (bottom + dy).max(top + min_h);
        }
        HandleKind::SW => {
            left = (left + dx).min(right - min_w);
            bottom = (bottom + dy).max(top + min_h);
        }
        HandleKind::W => {
            left = (left + dx).min(right - min_w);
        }
        HandleKind::Rotate
        | HandleKind::DragHandle
        | HandleKind::ConnectorStart
        | HandleKind::ConnectorEnd => {
            return initial;
        }
    }

    let mut nw = (right - left).max(min_w);
    let mut nh = (bottom - top).max(min_h);

    if lock_ratio && initial.w > 1e-3 && initial.h > 1e-3 {
        let ratio = initial.w / initial.h;
        match handle {
            HandleKind::E | HandleKind::W => {
                nh = (nw / ratio).max(min_h);
                nw = (nh * ratio).max(min_w);
            }
            HandleKind::N | HandleKind::S => {
                nw = (nh * ratio).max(min_w);
                nh = (nw / ratio).max(min_h);
            }
            HandleKind::NW | HandleKind::NE | HandleKind::SE | HandleKind::SW => {
                // Follow the axis with smaller relative distortion (or dominant scale),
                // matching BlockSuite's proportional corner lock (`w = new_w, h = w / ratio`
                // when horizontal change is smaller or equal; clamp both to minimums).
                let sx = nw / initial.w;
                let sy = nh / initial.h;
                let scale = if (sx - 1.0).abs() >= (sy - 1.0).abs() {
                    sx
                } else {
                    sy
                };
                let min_scale = (min_w / initial.w).max(min_h / initial.h);
                let s = scale.max(min_scale);
                nw = initial.w * s;
                nh = initial.h * s;
            }
            _ => {}
        }
    }

    // Opposite anchor normalized coordinates `(u, v)` in `[0, 1]^2` that remain fixed in world space.
    let (u, v) = match handle {
        HandleKind::NW => (1.0_f32, 1.0_f32),
        HandleKind::N => (0.5, 1.0),
        HandleKind::NE => (0.0, 1.0),
        HandleKind::E => (0.0, 0.5),
        HandleKind::SE => (0.0, 0.0),
        HandleKind::S => (0.5, 0.0),
        HandleKind::SW => (1.0, 0.0),
        HandleKind::W => (1.0, 0.5),
        _ => (0.5, 0.5),
    };

    if rotate_deg.abs() > 1e-3 {
        let anchor_local_0 = (initial.x + initial.w * u, initial.y + initial.h * v);
        let anchor_world =
            rotate_point_around(anchor_local_0.0, anchor_local_0.1, cx0, cy0, rotate_deg);
        let off_local = ((u - 0.5) * nw, (v - 0.5) * nh);
        let off_world = rotate_point_around(off_local.0, off_local.1, 0.0, 0.0, rotate_deg);
        let new_cx = anchor_world.0 - off_world.0;
        let new_cy = anchor_world.1 - off_world.1;
        WorldRect::new(new_cx - nw * 0.5, new_cy - nh * 0.5, nw, nh)
    } else {
        let anchor_x = initial.x + initial.w * u;
        let anchor_y = initial.y + initial.h * v;
        WorldRect::new(anchor_x - u * nw, anchor_y - v * nh, nw, nh)
    }
}

/// Snap a world coordinate to any connectable element (`Shape | Note | EdgelessText | Frame`).
///
/// Supports magnetic snapping to the 4 cardinal midpoints as well as arbitrary perimeter points
/// (and interior drop-to-nearest-edge for non-Frame elements, matching Web `connector-manager.ts`).
pub fn snap_connector_port_on_items(
    items: &[SpatialItemInfo],
    world_x: f32,
    world_y: f32,
    zoom: f32,
    exclude_id: Option<&str>,
) -> Option<(String, [f64; 2], (f32, f32))> {
    let inv_zoom = 1.0 / zoom.max(0.1);
    let snap_dist = (24.0 * inv_zoom).max(16.0);
    let cardinal_dist = (10.0 * inv_zoom).max(8.0);
    let cardinals: [[f32; 2]; 4] = [[0.5, 0.0], [1.0, 0.5], [0.5, 1.0], [0.0, 0.5]];

    let mut best: Option<(f32, bool, String, [f64; 2], (f32, f32))> = None;

    // Walk reverse paint order so topmost element wins ties.
    for item in items.iter().rev() {
        if !matches!(
            item.kind,
            SpatialItemKind::Shape
                | SpatialItemKind::Note
                | SpatialItemKind::EdgelessText
                | SpatialItemKind::Frame
        ) {
            continue;
        }
        if exclude_id.is_some_and(|ex| ex == item.id) {
            continue;
        }
        if item.rect.w <= 1e-3 || item.rect.h <= 1e-3 {
            continue;
        }
        let (cx, cy) = item.rect.center();
        let (lx, ly) = rotate_point_around(world_x, world_y, cx, cy, -item.rotate_deg);

        // 1. Check magnetic cardinal midpoints first.
        let mut matched_cardinal = false;
        for [cu, cv] in cardinals {
            let px_l = item.rect.x + item.rect.w * cu;
            let py_l = item.rect.y + item.rect.h * cv;
            let d = (lx - px_l).hypot(ly - py_l);
            if d <= cardinal_dist {
                matched_cardinal = true;
                let world = rotate_point_around(px_l, py_l, cx, cy, item.rotate_deg);
                let is_frame = item.kind == SpatialItemKind::Frame;
                let better = best.as_ref().is_none_or(|b| {
                    // Prefer non-frame over frame when both match; otherwise strictly closer.
                    (!is_frame && b.1) || (is_frame == b.1 && d < b.0)
                });
                if better {
                    best = Some((d, is_frame, item.id.clone(), [cu as f64, cv as f64], world));
                }
            }
        }
        if matched_cardinal {
            continue;
        }

        // 2. Project onto the nearest point on the element's 4 perimeter edges.
        let inside = lx >= item.rect.x
            && lx <= item.rect.right()
            && ly >= item.rect.y
            && ly <= item.rect.bottom();

        let (ex, ey, dist) = if inside {
            let d_left = lx - item.rect.x;
            let d_right = item.rect.right() - lx;
            let d_top = ly - item.rect.y;
            let d_bottom = item.rect.bottom() - ly;
            let min_d = d_left.min(d_right).min(d_top).min(d_bottom);
            // Large container blocks (Frames and Notes) only snap near their border so items
            // or free connectors inside them are not hijacked to a distant edge.
            if matches!(item.kind, SpatialItemKind::Frame | SpatialItemKind::Note)
                && min_d > snap_dist
            {
                continue;
            }
            if min_d == d_left {
                (item.rect.x, ly, min_d)
            } else if min_d == d_right {
                (item.rect.right(), ly, min_d)
            } else if min_d == d_top {
                (lx, item.rect.y, min_d)
            } else {
                (lx, item.rect.bottom(), min_d)
            }
        } else {
            let cx_p = lx.clamp(item.rect.x, item.rect.right());
            let cy_p = ly.clamp(item.rect.y, item.rect.bottom());
            let d = (lx - cx_p).hypot(ly - cy_p);
            if d > snap_dist {
                continue;
            }
            (cx_p, cy_p, d)
        };

        let u = ((ex - item.rect.x) / item.rect.w).clamp(0.0, 1.0);
        let v = ((ey - item.rect.y) / item.rect.h).clamp(0.0, 1.0);
        let world = rotate_point_around(ex, ey, cx, cy, item.rotate_deg);
        let is_frame = item.kind == SpatialItemKind::Frame;
        // For interior points on non-frame elements, treat effective distance as 0 so
        // starting/ending a connector inside a shape always binds to that shape.
        let eff_dist = if inside && !is_frame { 0.0 } else { dist };
        let better = best
            .as_ref()
            .is_none_or(|b| (!is_frame && b.1) || (is_frame == b.1 && eff_dist < b.0));
        if better {
            best = Some((
                eff_dist,
                is_frame,
                item.id.clone(),
                [u as f64, v as f64],
                world,
            ));
        }
    }

    best.map(|(_, _, id, port, pt)| (id, port, pt))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_item(
        id: &str,
        kind: SpatialItemKind,
        rect: WorldRect,
        rotate_deg: f32,
    ) -> SpatialItemInfo {
        SpatialItemInfo {
            id: id.into(),
            kind,
            shape_type: None,
            surface_id: (!kind.is_block()).then(|| "surf".into()),
            rect,
            rotate_deg,
            index: "a0".into(),
            scale: 1.0,
            stroke_width: 2.0,
            polyline: Vec::new(),
            frame_children: Vec::new(),
            group_children: Vec::new(),
            parent_group_id: None,
            title_pill_rect: None,
        }
    }

    #[test]
    fn rotated_resize_keeps_opposite_anchor_and_expands_outward() {
        let initial = WorldRect::new(100.0, 100.0, 180.0, 100.0);
        // 180° rotated: NW handle is visually at bottom-right (280, 200); dragging +100,+80 expands to 280x180.
        let r180 = resized_rect_constrained(
            initial,
            HandleKind::NW,
            (280.0, 200.0),
            (380.0, 280.0),
            24.0,
            24.0,
            false,
            180.0,
        );
        assert!((r180.w - 280.0).abs() < 1e-2, "w={}", r180.w);
        assert!((r180.h - 180.0).abs() < 1e-2, "h={}", r180.h);
        // Visual top-left (SE anchor in local coords rotated by 180°) stays pinned at (100, 100).
        let (cx, cy) = r180.center();
        let anchor_w = rotate_point_around(r180.right(), r180.bottom(), cx, cy, 180.0);
        assert!((anchor_w.0 - 100.0).abs() < 1e-2 && (anchor_w.1 - 100.0).abs() < 1e-2);

        // Aspect ratio lock with Shift on SE handle: 160x100 dragged (+40, +180) keeps 1.6 ratio.
        let r_lock = resized_rect_constrained(
            WorldRect::new(0.0, 0.0, 160.0, 100.0),
            HandleKind::SE,
            (160.0, 100.0),
            (200.0, 280.0),
            24.0,
            24.0,
            true,
            0.0,
        );
        assert!(((r_lock.w / r_lock.h) - 1.6).abs() < 1e-3);
    }

    #[test]
    fn shift_constraints_and_full_perimeter_connector_snapping() {
        assert_eq!(
            constrain_shift_drag((10.0, 10.0), (50.0, 22.0)),
            (40.0, 0.0)
        );
        assert_eq!(
            constrain_shift_drag((10.0, 10.0), (15.0, 60.0)),
            (0.0, 50.0)
        );
        let sq = constrain_shift_square((100.0, 100.0), (220.0, 180.0));
        assert_eq!(sq, WorldRect::new(100.0, 100.0, 120.0, 120.0));

        let items = vec![
            mk_item(
                "frame1",
                SpatialItemKind::Frame,
                WorldRect::new(0.0, 0.0, 500.0, 400.0),
                0.0,
            ),
            mk_item(
                "s1",
                SpatialItemKind::Shape,
                WorldRect::new(100.0, 100.0, 200.0, 200.0),
                0.0,
            ),
            mk_item(
                "et1",
                SpatialItemKind::EdgelessText,
                WorldRect::new(350.0, 120.0, 100.0, 40.0),
                0.0,
            ),
        ];
        // Non-cardinal top-right edge of s1 (295, 130) snaps to s1 perimeter (not frame1).
        let (id, port, _) = snap_connector_port_on_items(&items, 295.0, 130.0, 1.0, None).unwrap();
        assert_eq!(id, "s1");
        assert!((port[0] - 1.0).abs() < 1e-3 && (port[1] - 0.15).abs() < 0.05);
        // EdgelessText snaps.
        let (id_et, _, _) = snap_connector_port_on_items(&items, 355.0, 140.0, 1.0, None).unwrap();
        assert_eq!(id_et, "et1");
        // Frame border snaps when outside inner items.
        let (id_f, _, _) = snap_connector_port_on_items(&items, 4.0, 200.0, 1.0, None).unwrap();
        assert_eq!(id_f, "frame1");
    }
}
