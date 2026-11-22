//! Spatial camera, coordinate conversion, and BlockSuite dot-grid spacing for Edgeless mode.

use ui::{Pixels, Point, Size, TransformationMatrix, point, px};

/// Minimum allowed Edgeless zoom factor (10%).
pub const MIN_ZOOM: f32 = 0.1;
/// Maximum allowed Edgeless zoom factor (600%).
pub const MAX_ZOOM: f32 = 6.0;
/// Multiplicative step applied by zoom-in / zoom-out controls.
const ZOOM_STEP: f32 = 1.25;

/// Axis-aligned rectangle in Edgeless world coordinates.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WorldRect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl WorldRect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }

    pub fn right(self) -> f32 {
        self.x + self.w
    }

    pub fn bottom(self) -> f32 {
        self.y + self.h
    }

    pub fn center(self) -> (f32, f32) {
        (self.x + self.w * 0.5, self.y + self.h * 0.5)
    }

    pub fn is_empty(self) -> bool {
        self.w <= 0.0 || self.h <= 0.0
    }

    pub fn intersects(self, other: Self) -> bool {
        self.x < other.right()
            && self.right() > other.x
            && self.y < other.bottom()
            && self.bottom() > other.y
    }

    pub fn contains_rect(self, inner: Self) -> bool {
        inner.x >= self.x
            && inner.y >= self.y
            && inner.right() <= self.right()
            && inner.bottom() <= self.bottom()
    }

    pub fn union(self, other: Self) -> Self {
        if self.is_empty() {
            return other;
        }
        if other.is_empty() {
            return self;
        }
        let min_x = self.x.min(other.x);
        let min_y = self.y.min(other.y);
        let max_x = self.right().max(other.right());
        let max_y = self.bottom().max(other.bottom());
        Self::new(min_x, min_y, max_x - min_x, max_y - min_y)
    }

    pub fn dilate(self, margin: f32) -> Self {
        Self::new(
            self.x - margin,
            self.y - margin,
            self.w + 2.0 * margin,
            self.h + 2.0 * margin,
        )
    }
}

/// Parse a BlockSuite `"[x,y,w,h]"` string into a [`WorldRect`].
pub fn parse_xywh(xywh: &str) -> Option<WorldRect> {
    let trimmed = xywh.trim();
    let inner = trimmed.strip_prefix('[')?.strip_suffix(']')?;
    let mut parts = inner.split(',').map(|s| s.trim().parse::<f32>().ok());
    let x = parts.next()??;
    let y = parts.next()??;
    let w = parts.next()??;
    let h = parts.next()??;
    if parts.next().is_some()
        || !x.is_finite()
        || !y.is_finite()
        || !w.is_finite()
        || !h.is_finite()
    {
        return None;
    }
    Some(WorldRect::new(x, y, w.max(0.0), h.max(0.0)))
}

/// World-to-screen camera for the infinite Edgeless canvas.
///
/// Mapping: `screen = viewport_origin + (world - pan) * zoom`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EdgelessCamera {
    /// World X coordinate at the top-left of the viewport.
    pub pan_x: f32,
    /// World Y coordinate at the top-left of the viewport.
    pub pan_y: f32,
    /// Uniform zoom factor in `[MIN_ZOOM, MAX_ZOOM]`.
    pub zoom: f32,
}

impl Default for EdgelessCamera {
    fn default() -> Self {
        Self {
            pan_x: 0.0,
            pan_y: 0.0,
            zoom: 1.0,
        }
    }
}

impl EdgelessCamera {
    pub fn new(pan_x: f32, pan_y: f32, zoom: f32) -> Self {
        Self {
            pan_x,
            pan_y,
            zoom: zoom.clamp(MIN_ZOOM, MAX_ZOOM),
        }
    }

    /// Map a world-space point into window screen coordinates.
    pub fn world_to_screen(
        &self,
        world: Point<Pixels>,
        viewport_origin: Point<Pixels>,
    ) -> Point<Pixels> {
        point(
            px(f32::from(viewport_origin.x) + (f32::from(world.x) - self.pan_x) * self.zoom),
            px(f32::from(viewport_origin.y) + (f32::from(world.y) - self.pan_y) * self.zoom),
        )
    }

    /// Map a window screen-space point into world coordinates.
    pub fn screen_to_world(
        &self,
        screen: Point<Pixels>,
        viewport_origin: Point<Pixels>,
    ) -> Point<Pixels> {
        let z = self.zoom.max(MIN_ZOOM);
        point(
            px((f32::from(screen.x) - f32::from(viewport_origin.x)) / z + self.pan_x),
            px((f32::from(screen.y) - f32::from(viewport_origin.y)) / z + self.pan_y),
        )
    }

    /// Build the 2D GPU transformation matrix mapping logical world pixels to logical screen pixels.
    pub fn to_transformation_matrix(&self, viewport_origin: Point<Pixels>) -> TransformationMatrix {
        TransformationMatrix {
            rotation_scale: [[self.zoom, 0.0], [0.0, self.zoom]],
            translation: [
                f32::from(viewport_origin.x) - self.pan_x * self.zoom,
                f32::from(viewport_origin.y) - self.pan_y * self.zoom,
            ],
        }
    }

    /// Visible world-space rectangle covered by a viewport of `viewport_size`.
    pub fn visible_world_bounds(&self, viewport_size: Size<Pixels>) -> WorldRect {
        let z = self.zoom.max(MIN_ZOOM);
        WorldRect::new(
            self.pan_x,
            self.pan_y,
            f32::from(viewport_size.width) / z,
            f32::from(viewport_size.height) / z,
        )
    }

    /// Translate the camera by a screen-space delta (positive `dx`/`dy` drags content right/down).
    pub fn pan_by_screen_delta(&mut self, dx: f32, dy: f32) {
        let z = self.zoom.max(MIN_ZOOM);
        self.pan_x -= dx / z;
        self.pan_y -= dy / z;
    }

    /// Change zoom to `new_zoom` while keeping the world point under `anchor_screen` fixed.
    pub fn zoom_at(
        &mut self,
        new_zoom: f32,
        anchor_screen: Point<Pixels>,
        viewport_origin: Point<Pixels>,
    ) {
        let world_before = self.screen_to_world(anchor_screen, viewport_origin);
        self.zoom = new_zoom.clamp(MIN_ZOOM, MAX_ZOOM);
        self.pan_x = f32::from(world_before.x)
            - (f32::from(anchor_screen.x) - f32::from(viewport_origin.x)) / self.zoom;
        self.pan_y = f32::from(world_before.y)
            - (f32::from(anchor_screen.y) - f32::from(viewport_origin.y)) / self.zoom;
    }

    /// Zoom in one step anchored at the viewport center.
    pub fn zoom_in(&mut self, viewport_origin: Point<Pixels>, viewport_size: Size<Pixels>) {
        let center = point(
            px(f32::from(viewport_origin.x) + f32::from(viewport_size.width) * 0.5),
            px(f32::from(viewport_origin.y) + f32::from(viewport_size.height) * 0.5),
        );
        self.zoom_at(self.zoom * ZOOM_STEP, center, viewport_origin);
    }

    /// Zoom out one step anchored at the viewport center.
    pub fn zoom_out(&mut self, viewport_origin: Point<Pixels>, viewport_size: Size<Pixels>) {
        let center = point(
            px(f32::from(viewport_origin.x) + f32::from(viewport_size.width) * 0.5),
            px(f32::from(viewport_origin.y) + f32::from(viewport_size.height) * 0.5),
        );
        self.zoom_at(self.zoom / ZOOM_STEP, center, viewport_origin);
    }

    /// Reset zoom to `1.0` anchored at the viewport center.
    pub fn reset_zoom(&mut self, viewport_origin: Point<Pixels>, viewport_size: Size<Pixels>) {
        let center = point(
            px(f32::from(viewport_origin.x) + f32::from(viewport_size.width) * 0.5),
            px(f32::from(viewport_origin.y) + f32::from(viewport_size.height) * 0.5),
        );
        self.zoom_at(1.0, center, viewport_origin);
    }

    /// Frame `world_bounds` inside `viewport_size` with `padding` screen pixels on all sides.
    pub fn fit_to_bounds(
        &mut self,
        world_bounds: WorldRect,
        viewport_size: Size<Pixels>,
        padding: f32,
    ) {
        let vw = f32::from(viewport_size.width).max(1.0);
        let vh = f32::from(viewport_size.height).max(1.0);
        if world_bounds.is_empty() {
            self.zoom = 1.0;
            self.pan_x = -vw * 0.5;
            self.pan_y = -vh * 0.5;
            return;
        }
        let avail_w = (vw - 2.0 * padding).max(1.0);
        let avail_h = (vh - 2.0 * padding).max(1.0);
        let fit_zoom = (avail_w / world_bounds.w)
            .min(avail_h / world_bounds.h)
            .min(1.0)
            .clamp(MIN_ZOOM, MAX_ZOOM);
        self.zoom = fit_zoom;
        let (cx, cy) = world_bounds.center();
        self.pan_x = cx - vw / (2.0 * self.zoom);
        self.pan_y = cy - vh / (2.0 * self.zoom);
    }

    /// Screen-space phase offset `(phase_x, phase_y)` in `[0, gap)` centering each dot inside
    /// its `gap × gap` tile and anchoring the dot-grid to world `(0, 0)` during panning.
    pub fn dot_grid_phase(&self, gap: f32) -> (f32, f32) {
        let gap = gap.max(1.0);
        (
            (-self.pan_x * self.zoom + gap * 0.5).rem_euclid(gap),
            (-self.pan_y * self.zoom + gap * 0.5).rem_euclid(gap),
        )
    }
}

/// Exact BlockSuite dot-grid screen spacing (`getBgGridGap` in `get-bg-grip-gap.ts`).
pub fn bg_grid_gap(zoom: f32) -> f32 {
    let step = if zoom < 0.5 {
        2.0
    } else {
        1.0 / zoom.floor().max(1.0)
    };
    (20.0 * step * zoom).clamp(10.0, 50.0).round()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ui::size;

    #[test]
    fn world_screen_roundtrip_and_matrix_match() {
        let cam = EdgelessCamera::new(-120.0, 45.0, 1.75);
        let origin = point(px(0.0), px(52.0));
        let world = point(px(340.0), px(-80.0));
        let screen = cam.world_to_screen(world, origin);
        let back = cam.screen_to_world(screen, origin);
        assert!((f32::from(back.x) - f32::from(world.x)).abs() < 1e-4);
        assert!((f32::from(back.y) - f32::from(world.y)).abs() < 1e-4);

        let mat = cam.to_transformation_matrix(origin);
        let mapped = mat.apply(world);
        assert!((f32::from(mapped.x) - f32::from(screen.x)).abs() < 1e-4);
        assert!((f32::from(mapped.y) - f32::from(screen.y)).abs() < 1e-4);
    }

    #[test]
    fn cursor_anchored_zoom_preserves_world_point() {
        let mut cam = EdgelessCamera::new(100.0, 200.0, 1.0);
        let origin = point(px(0.0), px(52.0));
        let cursor = point(px(420.0), px(310.0));
        let before = cam.screen_to_world(cursor, origin);
        cam.zoom_at(2.5, cursor, origin);
        let after = cam.screen_to_world(cursor, origin);
        assert!((f32::from(before.x) - f32::from(after.x)).abs() < 1e-3);
        assert!((f32::from(before.y) - f32::from(after.y)).abs() < 1e-3);
    }

    #[test]
    fn bg_grid_gap_clamps_across_zoom_range() {
        for zoom in [0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 4.0, 6.0] {
            let gap = bg_grid_gap(zoom);
            assert!((10.0..=50.0).contains(&gap), "zoom={zoom} gap={gap}");
        }
        assert_eq!(bg_grid_gap(1.0), 20.0);
    }

    #[test]
    fn fit_to_bounds_centers_content() {
        let mut cam = EdgelessCamera::default();
        let bounds = WorldRect::new(0.0, 0.0, 800.0, 600.0);
        let viewport = size(px(1280.0), px(748.0));
        cam.fit_to_bounds(bounds, viewport, 48.0);
        assert!((cam.zoom - 1.0).abs() < 1e-4);
        let center = cam.world_to_screen(point(px(400.0), px(300.0)), point(px(0.0), px(0.0)));
        assert!((f32::from(center.x) - 640.0).abs() < 1e-3);
        assert!((f32::from(center.y) - 374.0).abs() < 1e-3);
    }

    #[test]
    fn parse_xywh_handles_valid_and_invalid() {
        assert_eq!(
            parse_xywh("[-40, 20.5, 800, 600]"),
            Some(WorldRect::new(-40.0, 20.5, 800.0, 600.0))
        );
        assert_eq!(parse_xywh("[1,2,3]"), None);
        assert_eq!(parse_xywh("bad"), None);
    }
}
