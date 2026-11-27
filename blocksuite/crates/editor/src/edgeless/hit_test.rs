//! Edgeless selection state, reverse paint-order world hit-testing, and geometry helpers.

use std::{
    collections::{BTreeMap, BTreeSet},
    rc::Rc,
};

use ui::{Pixels, Point, point, px};

use super::{
    EdgelessCamera, EdgelessInlineEdit, EdgelessLabelEditor, EdgelessTool, ShapePreset, WorldRect,
};

/// Interactive handle on the current Edgeless selection box.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HandleKind {
    NW,
    N,
    NE,
    E,
    SE,
    S,
    SW,
    W,
    Rotate,
    DragHandle,
}

impl HandleKind {
    pub const RESIZE_HANDLES: [Self; 8] = [
        Self::NW,
        Self::N,
        Self::NE,
        Self::E,
        Self::SE,
        Self::S,
        Self::SW,
        Self::W,
    ];

    pub fn snapshot_id(self) -> &'static str {
        match self {
            Self::NW => "edgeless.handle.nw",
            Self::N => "edgeless.handle.n",
            Self::NE => "edgeless.handle.ne",
            Self::E => "edgeless.handle.e",
            Self::SE => "edgeless.handle.se",
            Self::S => "edgeless.handle.s",
            Self::SW => "edgeless.handle.sw",
            Self::W => "edgeless.handle.w",
            Self::Rotate => "edgeless.handle.rotate",
            Self::DragHandle => "edgeless.drag_handle",
        }
    }
}

/// Spatial item classification for hit-testing, handles, and mutations.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpatialItemKind {
    Note,
    Frame,
    EdgelessText,
    Shape,
    Connector,
    Brush,
    Highlighter,
    SurfaceText,
    Group,
}

impl SpatialItemKind {
    pub fn is_block(self) -> bool {
        matches!(self, Self::Note | Self::Frame | Self::EdgelessText)
    }

    pub fn is_rotatable(self) -> bool {
        matches!(self, Self::Shape | Self::EdgelessText)
    }

    pub fn has_gfx_drag_handle(self) -> bool {
        matches!(self, Self::Note | Self::Frame | Self::EdgelessText)
    }
}

/// Snapshot-derived world-space descriptor for one painted Edgeless item in paint order.
#[derive(Clone, Debug)]
pub struct SpatialItemInfo {
    pub id: String,
    pub kind: SpatialItemKind,
    pub shape_type: Option<blocksuite_playground_doc::read::ShapeType>,
    pub surface_id: Option<String>,
    pub rect: WorldRect,
    pub rotate_deg: f32,
    pub index: String,
    pub scale: f32,
    pub stroke_width: f32,
    pub polyline: Vec<(f32, f32)>,
    pub frame_children: Vec<String>,
    pub title_pill_rect: Option<WorldRect>,
}

/// Target of an inline UTF-16 + IME label editor on the Edgeless canvas.

#[derive(Clone, Debug)]
pub struct DragItemInitial {
    pub id: String,
    pub kind: SpatialItemKind,
    pub surface_id: Option<String>,
    pub rect: WorldRect,
    pub points: Option<Vec<Vec<f64>>>,
    pub connector_source: Option<(Option<String>, Option<[f64; 2]>)>,
    pub connector_target: Option<(Option<String>, Option<[f64; 2]>)>,
    pub connector_label_xywh: Option<[f64; 4]>,
}

/// Active pointer gesture on the Edgeless canvas.
#[derive(Clone, Debug)]
pub enum EdgelessGesture {
    Pan {
        last_screen: Point<Pixels>,
    },
    Marquee {
        start_world: (f32, f32),
        current_world: (f32, f32),
    },
    DragSelection {
        start_world: (f32, f32),
        current_world: (f32, f32),
        initial: Vec<DragItemInitial>,
    },
    ResizeSelection {
        handle: HandleKind,
        start_world: (f32, f32),
        current_world: (f32, f32),
        initial_box: WorldRect,
        initial: Vec<DragItemInitial>,
    },
    RotateSelection {
        id: String,
        surface_id: Option<String>,
        is_block: bool,
        center_world: (f32, f32),
        start_angle: f64,
        initial_rotate: f64,
        current_rotate: f64,
    },
    CreateShape {
        shape_type: ShapePreset,
        start_world: (f32, f32),
        current_world: (f32, f32),
    },
    CreateFrame {
        start_world: (f32, f32),
        current_world: (f32, f32),
    },
    CreateNote {
        start_world: (f32, f32),
        current_world: (f32, f32),
    },
    CreateConnector {
        source_id: Option<String>,
        source_port: Option<[f64; 2]>,
        source_world: (f32, f32),
        current_world: (f32, f32),
        target_id: Option<String>,
        target_port: Option<[f64; 2]>,
        target_world: Option<(f32, f32)>,
    },
    DrawStroke {
        highlighter: bool,
        points_world: Vec<(f64, f64)>,
    },
}

/// Live geometry override applied during an active drag/resize/rotate gesture before commit.
#[derive(Clone, Copy, Debug)]
pub struct LiveGeomOverride {
    pub rect: WorldRect,
    pub rotate_deg: Option<f32>,
    pub delta: (f32, f32),
}

/// Interactive authoring state owned by `EdgelessCanvasState`.
#[derive(Default)]
pub struct EdgelessAuthoringState {
    pub tool: EdgelessTool,
    pub last_shape_type: Option<ShapePreset>,
    pub shape_picker_open: bool,
    pub selection: BTreeSet<String>,
    pub gesture: Option<EdgelessGesture>,
    pub inline_edit: Option<EdgelessInlineEdit>,
    pub space_pan: bool,
    pub next_id_seq: u64,
    /// Items in exact paint order from the most recent rendered frame.
    pub painted_items: Rc<[SpatialItemInfo]>,
}

impl EdgelessAuthoringState {
    pub fn reset_transient(&mut self) {
        self.gesture = None;
        self.space_pan = false;
    }

    pub fn active_shape_type(&self) -> ShapePreset {
        match self.tool {
            EdgelessTool::Shape(t) => t,
            _ => self.last_shape_type.unwrap_or(ShapePreset::Rect),
        }
    }

    pub fn label_editor(&self) -> Option<&EdgelessLabelEditor> {
        match &self.inline_edit {
            Some(EdgelessInlineEdit::Label(ed)) => Some(ed),
            _ => None,
        }
    }

    pub fn label_editor_mut(&mut self) -> Option<&mut EdgelessLabelEditor> {
        match &mut self.inline_edit {
            Some(EdgelessInlineEdit::Label(ed)) => Some(ed),
            _ => None,
        }
    }

    pub fn editing_spatial_block(&self) -> Option<(&str, bool)> {
        match &self.inline_edit {
            Some(EdgelessInlineEdit::SpatialBlock { block_id, is_note }) => {
                Some((block_id.as_str(), *is_note))
            }
            _ => None,
        }
    }

    pub fn next_id(&mut self, prefix: &str, client_id: u64) -> String {
        self.next_id_seq += 1;
        format!("{prefix}:{client_id}:{}", self.next_id_seq)
    }

    /// Compute live per-item geometry overrides for an active drag/resize/rotate gesture.
    pub fn live_overrides(&self) -> BTreeMap<String, LiveGeomOverride> {
        let mut out = BTreeMap::new();
        match &self.gesture {
            Some(EdgelessGesture::DragSelection {
                start_world,
                current_world,
                initial,
            }) => {
                let dx = current_world.0 - start_world.0;
                let dy = current_world.1 - start_world.1;
                for item in initial {
                    out.insert(
                        item.id.clone(),
                        LiveGeomOverride {
                            rect: WorldRect::new(
                                item.rect.x + dx,
                                item.rect.y + dy,
                                item.rect.w,
                                item.rect.h,
                            ),
                            rotate_deg: None,
                            delta: (dx, dy),
                        },
                    );
                }
            }
            Some(EdgelessGesture::ResizeSelection {
                handle,
                start_world,
                current_world,
                initial_box,
                initial,
            }) => {
                let new_box = resized_rect(*initial_box, *handle, *start_world, *current_world);
                let sx = if initial_box.w > 1e-3 {
                    new_box.w / initial_box.w
                } else {
                    1.0
                };
                let sy = if initial_box.h > 1e-3 {
                    new_box.h / initial_box.h
                } else {
                    1.0
                };
                for item in initial {
                    let nx = new_box.x + (item.rect.x - initial_box.x) * sx;
                    let ny = new_box.y + (item.rect.y - initial_box.y) * sy;
                    let nw = (item.rect.w * sx).max(16.0);
                    let nh = (item.rect.h * sy).max(16.0);
                    out.insert(
                        item.id.clone(),
                        LiveGeomOverride {
                            rect: WorldRect::new(nx, ny, nw, nh),
                            rotate_deg: None,
                            delta: (0.0, 0.0),
                        },
                    );
                }
            }
            Some(EdgelessGesture::RotateSelection {
                id, current_rotate, ..
            }) => {
                if let Some(info) = self.painted_items.iter().find(|i| i.id == *id) {
                    out.insert(
                        id.clone(),
                        LiveGeomOverride {
                            rect: info.rect,
                            rotate_deg: Some(*current_rotate as f32),
                            delta: (0.0, 0.0),
                        },
                    );
                }
            }
            _ => {}
        }
        out
    }

    /// True if the selection contains at least one item that supports the 8 resize handles
    /// (connectors hide the 8 resize handles because their geometry comes from endpoints).
    pub fn selection_has_non_connector(&self) -> bool {
        self.painted_items.iter().any(|item| {
            self.selection.contains(&item.id) && item.kind != SpatialItemKind::Connector
        })
    }

    /// Compute the selection's combined world-space bounding box (with live gesture overrides).
    pub fn selection_world_box(&self) -> Option<WorldRect> {
        let overrides = self.live_overrides();
        let mut combined = WorldRect::default();
        let mut any = false;
        for item in self.painted_items.iter() {
            if !self.selection.contains(&item.id) {
                continue;
            }
            let rect = overrides.get(&item.id).map_or(item.rect, |o| o.rect);
            combined = if any { combined.union(rect) } else { rect };
            any = true;
        }
        any.then_some(combined)
    }

    /// Return the single selected item if `selection.len() == 1`.
    pub fn single_selected(&self) -> Option<&SpatialItemInfo> {
        if self.selection.len() != 1 {
            return None;
        }
        let id = self.selection.iter().next()?;
        self.painted_items.iter().find(|i| i.id == *id)
    }

    /// Hit-test active selection handles in screen space (`vp_origin`-relative).
    pub fn hit_test_handles(
        &self,
        screen_pt: Point<Pixels>,
        vp_origin: Point<Pixels>,
        viewport_width: f32,
        viewport_height: f32,
        camera: EdgelessCamera,
    ) -> Option<HandleKind> {
        let sel_box = self.selection_world_box()?;
        let tl = camera.world_to_screen(point(px(sel_box.x), px(sel_box.y)), vp_origin);
        let br =
            camera.world_to_screen(point(px(sel_box.right()), px(sel_box.bottom())), vp_origin);
        let x0 = f32::from(tl.x);
        let y0 = f32::from(tl.y);
        let x1 = f32::from(br.x);
        let y1 = f32::from(br.y);
        let mx = (x0 + x1) * 0.5;
        let my = (y0 + y1) * 0.5;
        let px_s = f32::from(screen_pt.x);
        let py_s = f32::from(screen_pt.y);

        let single = self.single_selected();
        let rot_deg = single
            .filter(|s| s.kind.is_rotatable() && s.rotate_deg.abs() > 1e-3)
            .map_or(0.0, |s| s.rotate_deg);
        let (rx_pt, ry_pt) = if rot_deg.abs() > 1e-3 {
            rotate_point_around(px_s, py_s, mx, my, -rot_deg)
        } else {
            (px_s, py_s)
        };

        // Rotation handle (24px above top-center for single rotatable item).
        if let Some(single) = single
            && single.kind.is_rotatable()
        {
            let rx = mx;
            let ry = y0 - 24.0;
            if (rx_pt - rx).hypot(ry_pt - ry) <= 10.0 {
                return Some(HandleKind::Rotate);
            }
        }

        // Edgeless gfx 2x3 drag handle left of single selected block (matches overlay.rs clamp).
        if let Some(single) = single
            && single.kind.has_gfx_drag_handle()
        {
            let vp_x = f32::from(vp_origin.x);
            let vp_y = f32::from(vp_origin.y);
            let hx = (x0 - vp_x - 20.0)
                .clamp(4.0, (viewport_width - 18.0).max(4.0))
                .round()
                + vp_x;
            let hy = (y0 - vp_y)
                .clamp(4.0, (viewport_height - 28.0).max(4.0))
                .round()
                + vp_y;
            if px_s >= hx && px_s <= hx + 14.0 && py_s >= hy && py_s <= hy + 24.0 {
                return Some(HandleKind::DragHandle);
            }
        }

        if !self.selection_has_non_connector() {
            return None;
        }

        let coords = [
            (HandleKind::NW, x0, y0),
            (HandleKind::N, mx, y0),
            (HandleKind::NE, x1, y0),
            (HandleKind::E, x1, my),
            (HandleKind::SE, x1, y1),
            (HandleKind::S, mx, y1),
            (HandleKind::SW, x0, y1),
            (HandleKind::W, x0, my),
        ];
        for (kind, hx, hy) in coords {
            if (rx_pt - hx).abs() <= 7.0 && (ry_pt - hy).abs() <= 7.0 {
                return Some(kind);
            }
        }
        None
    }

    /// Top-to-bottom hit-testing in exact reverse `edgeless_order.rs` paint order.
    pub fn hit_test_world(
        &self,
        world_x: f32,
        world_y: f32,
        zoom: f32,
    ) -> Option<&SpatialItemInfo> {
        let inv_zoom = 1.0 / zoom.max(0.1);
        for item in self.painted_items.iter().rev() {
            match item.kind {
                SpatialItemKind::Shape
                | SpatialItemKind::SurfaceText
                | SpatialItemKind::EdgelessText => {
                    if point_in_rotated_rect(world_x, world_y, item.rect, item.rotate_deg) {
                        return Some(item);
                    }
                }
                SpatialItemKind::Note => {
                    if world_x >= item.rect.x
                        && world_x <= item.rect.right()
                        && world_y >= item.rect.y
                        && world_y <= item.rect.bottom()
                    {
                        return Some(item);
                    }
                }
                SpatialItemKind::Connector
                | SpatialItemKind::Brush
                | SpatialItemKind::Highlighter => {
                    let threshold = (item.stroke_width * 0.5 + 6.0 * inv_zoom).max(6.0);
                    if !item.polyline.is_empty() {
                        if distance_to_polyline((world_x, world_y), &item.polyline) <= threshold {
                            return Some(item);
                        }
                    } else if world_x >= item.rect.x - threshold
                        && world_x <= item.rect.right() + threshold
                        && world_y >= item.rect.y - threshold
                        && world_y <= item.rect.bottom() + threshold
                    {
                        return Some(item);
                    }
                }
                SpatialItemKind::Frame => {
                    // Frame hit-tests on its title pill and border so clicking inside an
                    // unselected frame can hit inner items or start a marquee selection.
                    if let Some(pill) = item.title_pill_rect
                        && world_x >= pill.x
                        && world_x <= pill.right()
                        && world_y >= pill.y
                        && world_y <= pill.bottom()
                    {
                        return Some(item);
                    }
                    let tol = (8.0 * inv_zoom).max(6.0);
                    let in_outer = world_x >= item.rect.x - tol
                        && world_x <= item.rect.right() + tol
                        && world_y >= item.rect.y - tol
                        && world_y <= item.rect.bottom() + tol;
                    let in_inner = world_x > item.rect.x + tol
                        && world_x < item.rect.right() - tol
                        && world_y > item.rect.y + tol
                        && world_y < item.rect.bottom() - tol;
                    if in_outer && !in_inner {
                        return Some(item);
                    }
                }
                SpatialItemKind::Group => {}
            }
        }
        None
    }

    /// Snap a world coordinate to the nearest cardinal port on a Shape or Note within `snap_world`.
    pub fn snap_connector_port(
        &self,
        world_x: f32,
        world_y: f32,
        zoom: f32,
        exclude_id: Option<&str>,
    ) -> Option<(String, [f64; 2], (f32, f32))> {
        let snap_dist = (24.0 / zoom.max(0.1)).max(16.0);
        let ports: [[f64; 2]; 4] = [[0.5, 0.0], [1.0, 0.5], [0.5, 1.0], [0.0, 0.5]];
        let mut best: Option<(f32, String, [f64; 2], (f32, f32))> = None;
        for item in self.painted_items.iter() {
            if !matches!(item.kind, SpatialItemKind::Shape | SpatialItemKind::Note) {
                continue;
            }
            if exclude_id.is_some_and(|ex| ex == item.id) {
                continue;
            }
            for port in ports {
                let px_w = item.rect.x + item.rect.w * port[0] as f32;
                let py_w = item.rect.y + item.rect.h * port[1] as f32;
                let (wx, wy) = rotate_point_around(
                    px_w,
                    py_w,
                    item.rect.center().0,
                    item.rect.center().1,
                    item.rotate_deg,
                );
                let d = (world_x - wx).hypot(world_y - wy);
                if d <= snap_dist && best.as_ref().is_none_or(|b| d < b.0) {
                    best = Some((d, item.id.clone(), port, (wx, wy)));
                }
            }
        }
        best.map(|(_, id, port, pt)| (id, port, pt))
    }
}

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

pub fn resized_rect(
    initial: WorldRect,
    handle: HandleKind,
    start: (f32, f32),
    current: (f32, f32),
) -> WorldRect {
    let dx = current.0 - start.0;
    let dy = current.1 - start.1;
    let mut left = initial.x;
    let mut top = initial.y;
    let mut right = initial.right();
    let mut bottom = initial.bottom();
    const MIN_DIM: f32 = 24.0;
    match handle {
        HandleKind::NW => {
            left = (left + dx).min(right - MIN_DIM);
            top = (top + dy).min(bottom - MIN_DIM);
        }
        HandleKind::N => {
            top = (top + dy).min(bottom - MIN_DIM);
        }
        HandleKind::NE => {
            right = (right + dx).max(left + MIN_DIM);
            top = (top + dy).min(bottom - MIN_DIM);
        }
        HandleKind::E => {
            right = (right + dx).max(left + MIN_DIM);
        }
        HandleKind::SE => {
            right = (right + dx).max(left + MIN_DIM);
            bottom = (bottom + dy).max(top + MIN_DIM);
        }
        HandleKind::S => {
            bottom = (bottom + dy).max(top + MIN_DIM);
        }
        HandleKind::SW => {
            left = (left + dx).min(right - MIN_DIM);
            bottom = (bottom + dy).max(top + MIN_DIM);
        }
        HandleKind::W => {
            left = (left + dx).min(right - MIN_DIM);
        }
        HandleKind::Rotate | HandleKind::DragHandle => {}
    }
    WorldRect::new(left, top, right - left, bottom - top)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        surface::{WorldBounds, layout_surface},
        theme::PlaygroundTheme,
    };
    use blocksuite_playground_doc::{
        read::{BlockContent, SurfaceElementKind},
        schema::{BlockSpec, ConnectorEndpointSpec, SurfaceElementSpec},
        session::PageDocSession,
    };
    use std::collections::BTreeMap;
    use ui::{AppContext, Application, HeadlessPlatform};

    #[test]
    fn reverse_paint_order_hit_test_handles_rotated_obb_polyline_and_frame_border() {
        let mut state = EdgelessAuthoringState::default();
        state.painted_items = vec![
            SpatialItemInfo {
                id: "frame1".into(),
                kind: SpatialItemKind::Frame,
                shape_type: None,
                surface_id: None,
                rect: WorldRect::new(0.0, 0.0, 400.0, 300.0),
                rotate_deg: 0.0,
                index: "a0".into(),
                scale: 1.0,
                stroke_width: 1.0,
                polyline: vec![],
                frame_children: vec!["rot_shape".into()],
                title_pill_rect: Some(WorldRect::new(0.0, -28.0, 80.0, 22.0)),
            },
            SpatialItemInfo {
                id: "rot_shape".into(),
                kind: SpatialItemKind::Shape,
                shape_type: Some(blocksuite_playground_doc::read::ShapeType::Rect),
                surface_id: Some("surf".into()),
                rect: WorldRect::new(100.0, 100.0, 100.0, 40.0),
                rotate_deg: 90.0,
                index: "a1".into(),
                scale: 1.0,
                stroke_width: 2.0,
                polyline: vec![],
                frame_children: vec![],
                title_pill_rect: None,
            },
            SpatialItemInfo {
                id: "brush1".into(),
                kind: SpatialItemKind::Brush,
                shape_type: None,
                surface_id: Some("surf".into()),
                rect: WorldRect::new(250.0, 50.0, 100.0, 10.0),
                rotate_deg: 0.0,
                index: "a2".into(),
                scale: 1.0,
                stroke_width: 4.0,
                polyline: vec![(250.0, 55.0), (350.0, 55.0)],
                frame_children: vec![],
                title_pill_rect: None,
            },
        ]
        .into();
        // Clicking empty interior of frame does NOT hit frame (allows marquee).
        assert!(state.hit_test_world(50.0, 50.0, 1.0).is_none());
        // Clicking frame title pill hits frame.
        assert_eq!(state.hit_test_world(20.0, -15.0, 1.0).unwrap().id, "frame1");
        // Clicking frame border hits frame.
        assert_eq!(state.hit_test_world(2.0, 150.0, 1.0).unwrap().id, "frame1");
        // Rotated 90° around (150, 120): (150, 75) is inside rotated 100x40 box!
        assert_eq!(
            state.hit_test_world(150.0, 75.0, 1.0).unwrap().id,
            "rot_shape"
        );
        // Polyline hit within stroke_width/2 + 6px.
        assert_eq!(state.hit_test_world(300.0, 58.0, 1.0).unwrap().id, "brush1");
        assert!(state.hit_test_world(300.0, 75.0, 1.0).is_none());
    }

    #[test]
    fn hit_test_world_hits_shapes_and_routed_element_bound_connector() {
        let mut page = PageDocSession::new("p1", 1).unwrap();
        page.add_block(
            "page-1",
            BlockSpec::Page {
                title: "Test".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        let surf = page.ensure_surface_block(2).unwrap();
        page.add_surface_element(
            &surf,
            "collect",
            "a0",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[818,522,150,82]".into(),
                seed: 31,
                filled: true,
                text: Some("Collect".into()),
            },
            3,
        )
        .unwrap();
        page.add_surface_element(
            &surf,
            "review",
            "a1",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[988,722,156,74]".into(),
                seed: 37,
                filled: true,
                text: Some("Review".into()),
            },
            4,
        )
        .unwrap();
        page.add_surface_element(
            &surf,
            "handoff",
            "a2",
            SurfaceElementSpec::Connector {
                mode: 1,
                seed: 41,
                source: ConnectorEndpointSpec::element("collect", Some([1.0, 0.5])),
                target: ConnectorEndpointSpec::element("review", Some([0.5, 0.0])),
                text: Some("Synthesize".into()),
                label_xywh: None,
            },
            5,
        )
        .unwrap();
        let snap = page.read_page_snapshot().unwrap();
        let surf_node = snap
            .root
            .as_ref()
            .unwrap()
            .children
            .iter()
            .find(|c| c.id == surf)
            .unwrap();
        let BlockContent::Surface { elements, .. } = &surf_node.content else {
            unreachable!()
        };

        let platform = HeadlessPlatform::new(64, 64, 1.0);
        let app = Application::with_platform(platform).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let hits: Vec<(&str, Option<String>)> = app.update(|cx| {
            let win = cx
                .open_window(Default::default(), |_, cx| cx.new(|_| ui::Empty))
                .unwrap();
            let layout = win
                .update(cx, |_, window, _| {
                    layout_surface(
                        elements,
                        &BTreeMap::<String, WorldBounds>::new(),
                        PlaygroundTheme::Light,
                        window,
                    )
                })
                .unwrap();
            let mut st = EdgelessAuthoringState::default();
            let mut items = Vec::new();
            for (idx, id) in layout.item_ids().enumerate() {
                let el = elements.iter().find(|e| e.id == id).unwrap();
                let (kind, rect) = match &el.kind {
                    SurfaceElementKind::Shape(s) => (
                        SpatialItemKind::Shape,
                        WorldRect::new(
                            s.xywh[0] as f32,
                            s.xywh[1] as f32,
                            s.xywh[2] as f32,
                            s.xywh[3] as f32,
                        ),
                    ),
                    SurfaceElementKind::Connector(_) => {
                        (SpatialItemKind::Connector, WorldRect::default())
                    }
                    _ => continue,
                };
                items.push(SpatialItemInfo {
                    id: id.to_string(),
                    kind,
                    shape_type: match &el.kind {
                        SurfaceElementKind::Shape(s) => Some(s.shape_type),
                        _ => None,
                    },
                    surface_id: Some(surf.clone()),
                    rect,
                    rotate_deg: el.rotate as f32,
                    index: el.index.clone(),
                    scale: 1.0,
                    stroke_width: layout.item_stroke_width(idx),
                    polyline: layout.item_polyline(idx).to_vec(),
                    frame_children: Vec::new(),
                    title_pill_rect: None,
                });
            }
            st.painted_items = items.into();
            [
                ("connector_mid", (1066.0, 640.0)),
                ("collect_shape", (893.0, 563.0)),
                ("review_shape", (1066.0, 759.0)),
                ("empty_canvas", (50.0, 50.0)),
            ]
            .into_iter()
            .map(|(case, (wx, wy))| (case, st.hit_test_world(wx, wy, 1.0).map(|it| it.id.clone())))
            .collect()
        });
        assert_eq!(
            hits,
            vec![
                ("connector_mid", Some("handoff".to_string())),
                ("collect_shape", Some("collect".to_string())),
                ("review_shape", Some("review".to_string())),
                ("empty_canvas", None),
            ]
        );
    }
}
