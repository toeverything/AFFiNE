//! Screen-space affine transform (translation, uniform scale, and optional rotation around pivot)
//! for mounting Page overlays inside an Edgeless Note or rotated EdgelessText.

use crate::block_flow::FlowRect;

/// Affine screen-space mapping for overlays anchored inside an Edgeless spatial block
/// (Note or EdgelessText) rather than the Page column.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OverlayScreenTransform {
    /// Screen-space position of the unrotated local flow-layout origin `(0, 0)`.
    pub origin: (f32, f32),
    /// Screen-space rotation pivot (the spatial block's world center mapped through camera).
    pub pivot: (f32, f32),
    /// Effective scale (`item.scale * camera.zoom`).
    pub scale: f32,
    /// Rotation angle in degrees around `pivot` (`0.0` for unrotated blocks).
    pub rotate_deg: f32,
}

impl OverlayScreenTransform {
    fn map_point(&self, lx: f32, ly: f32) -> (f32, f32) {
        let ux = self.origin.0 + lx * self.scale;
        let uy = self.origin.1 + ly * self.scale;
        if self.rotate_deg.abs() <= 1e-4 {
            return (ux, uy);
        }
        let rad = self.rotate_deg.to_radians();
        let (sin, cos) = rad.sin_cos();
        let dx = ux - self.pivot.0;
        let dy = uy - self.pivot.1;
        (
            self.pivot.0 + dx * cos - dy * sin,
            self.pivot.1 + dx * sin + dy * cos,
        )
    }

    pub fn rect_to_screen(&self, rect: &FlowRect) -> FlowRect {
        if self.rotate_deg.abs() <= 1e-4 {
            return FlowRect::new(
                self.origin.0 + rect.x * self.scale,
                self.origin.1 + rect.y * self.scale,
                rect.w * self.scale,
                rect.h * self.scale,
            );
        }
        let corners = [
            self.map_point(rect.x, rect.y),
            self.map_point(rect.right(), rect.y),
            self.map_point(rect.x, rect.bottom()),
            self.map_point(rect.right(), rect.bottom()),
        ];
        let min_x = corners.iter().map(|p| p.0).fold(f32::INFINITY, f32::min);
        let max_x = corners
            .iter()
            .map(|p| p.0)
            .fold(f32::NEG_INFINITY, f32::max);
        let min_y = corners.iter().map(|p| p.1).fold(f32::INFINITY, f32::min);
        let max_y = corners
            .iter()
            .map(|p| p.1)
            .fold(f32::NEG_INFINITY, f32::max);
        FlowRect::new(min_x, min_y, max_x - min_x, max_y - min_y)
    }

    pub fn screen_to_local(&self, sx: f32, sy: f32) -> (f32, f32) {
        let (ux, uy) = if self.rotate_deg.abs() <= 1e-4 {
            (sx, sy)
        } else {
            let rad = (-self.rotate_deg).to_radians();
            let (sin, cos) = rad.sin_cos();
            let dx = sx - self.pivot.0;
            let dy = sy - self.pivot.1;
            (
                self.pivot.0 + dx * cos - dy * sin,
                self.pivot.1 + dx * sin + dy * cos,
            )
        };
        let inv = 1.0 / self.scale.max(0.05);
        ((ux - self.origin.0) * inv, (uy - self.origin.1) * inv)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotated_overlay_transform_projects_and_inverts() {
        let t = OverlayScreenTransform {
            origin: (100.0, 200.0),
            pivot: (150.0, 220.0),
            scale: 2.0,
            rotate_deg: 90.0,
        };
        let s = t.rect_to_screen(&FlowRect::new(50.0, 10.0, 10.0, 20.0));
        // Local (50, 10) -> unrotated (200, 220) -> +90deg around (150, 220) -> (150, 270).
        assert!((s.x - 110.0).abs() < 0.05 && (s.y - 270.0).abs() < 0.05);
        let (lx, ly) = t.screen_to_local(150.0, 270.0);
        assert!((lx - 50.0).abs() < 0.05 && (ly - 10.0).abs() < 0.05);
    }
}
