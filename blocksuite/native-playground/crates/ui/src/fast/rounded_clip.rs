//! Rounded overflow clips keep their own padding-edge geometry. Intersecting
//! rectangular culling bounds must never move a corner or give a descendant
//! its ancestor's radius (zed#37480).
//!
//! Scopes refer to the unsorted paint operation stream, rather than GPU batch
//! indices: batching can reorder non-overlapping primitives. Replaying a view
//! copies the scopes owned by that view under the caller's current scope.

use std::ops::Range;

use crate::{
    App, Bounds, Corners, Overflow, Pixels, ScaledPixels, Scene, Size, Style, Window, point, size,
};

/// The curved padding edge, in device pixels. Adjacent borders can have
/// different widths, so the inner corner is generally an ellipse.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Shape {
    pub(crate) bounds: Bounds<ScaledPixels>,
    pub(crate) radii: Corners<Size<ScaledPixels>>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum ClipOperation {
    Begin(Shape),
    End,
}

impl ClipOperation {
    pub(crate) fn translated(self, delta: crate::Point<ScaledPixels>) -> Self {
        match self {
            Self::Begin(mut shape) => {
                shape.bounds.origin += delta;
                Self::Begin(shape)
            }
            Self::End => Self::End,
        }
    }

    pub(crate) fn hash(self, hasher: &mut impl std::hash::Hasher) {
        match self {
            Self::Begin(shape) => {
                hasher.write_u8(3);
                for value in [
                    shape.bounds.origin.x,
                    shape.bounds.origin.y,
                    shape.bounds.size.width,
                    shape.bounds.size.height,
                    shape.radii.top_left.width,
                    shape.radii.top_left.height,
                    shape.radii.top_right.width,
                    shape.radii.top_right.height,
                    shape.radii.bottom_right.width,
                    shape.radii.bottom_right.height,
                    shape.radii.bottom_left.width,
                    shape.radii.bottom_left.height,
                ] {
                    hasher.write_u32(value.0.to_bits());
                }
            }
            Self::End => hasher.write_u8(4),
        }
    }
}

impl Shape {
    fn for_style(style: &Style, bounds: Bounds<Pixels>, rem: Pixels, scale: f32) -> Option<Self> {
        // CSS curves overflow's padding edge only when both axes clip.
        if style.overflow.x == Overflow::Visible || style.overflow.y == Overflow::Visible {
            return None;
        }
        // Match the radii used to paint this element's background and border.
        let radii = style
            .corner_radii
            .to_pixels(rem)
            .clamp_radii_for_quad_size(bounds.size);
        if radii.max() <= Pixels::ZERO {
            return None;
        }
        let widths = style.border_widths.to_pixels(rem);
        let inner = |radius: Pixels, horizontal: Pixels, vertical: Pixels| {
            size(
                ScaledPixels(f32::from((radius - horizontal).max(Pixels::ZERO)) * scale),
                ScaledPixels(f32::from((radius - vertical).max(Pixels::ZERO)) * scale),
            )
        };
        Some(Self {
            bounds: Bounds {
                origin: (bounds.origin + point(widths.left, widths.top)).scale(scale),
                size: size(
                    (bounds.size.width - widths.left - widths.right).max(Pixels::ZERO),
                    (bounds.size.height - widths.top - widths.bottom).max(Pixels::ZERO),
                )
                .scale(scale),
            },
            radii: Corners {
                top_left: inner(radii.top_left, widths.left, widths.top),
                top_right: inner(radii.top_right, widths.right, widths.top),
                bottom_right: inner(radii.bottom_right, widths.right, widths.bottom),
                bottom_left: inner(radii.bottom_left, widths.left, widths.bottom),
            },
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Scope {
    pub(crate) operations: Range<usize>,
    pub(crate) shape: Shape,
    pub(crate) parent: Option<usize>,
}

/// Private scene data; ContentMask and all public primitive layouts stay
/// unchanged. An ordinary rectangular scene never allocates any scope data.
#[derive(Default)]
pub(crate) struct SceneClips {
    pub(crate) scopes: Vec<Scope>,
    active: Vec<usize>,
    pub(crate) compiled: bool,
}

impl SceneClips {
    fn begin(&mut self, operation: usize, shape: Shape) -> usize {
        let index = self.scopes.len();
        self.scopes.push(Scope {
            operations: operation..operation,
            shape,
            parent: self.active.last().copied(),
        });
        self.active.push(index);
        index
    }

    fn end(&mut self, scope: usize, operation: usize) {
        let active = self.active.pop();
        debug_assert_eq!(active, Some(scope));
        self.scopes[scope].operations.end = operation;
    }
}

pub(crate) fn clear(scene: &mut Scene) {
    scene.fast_rounded_clip.scopes.clear();
    scene.fast_rounded_clip.active.clear();
    scene.fast_rounded_clip.compiled = false;
}

/// The continuation paints descendants; the element's own border and drop
/// shadow remain outside this scope. The shape uses the original element
/// bounds, never the already-intersected rectangular content mask.
pub(crate) fn paint_children(
    style: &Style,
    bounds: Bounds<Pixels>,
    window: &mut Window,
    cx: &mut App,
    paint: impl FnOnce(&mut Window, &mut App),
) {
    let Some(shape) = Shape::for_style(style, bounds, window.rem_size(), window.scale_factor())
    else {
        return paint(window, cx);
    };
    record(&mut window.next_frame.scene, ClipOperation::Begin(shape));
    paint(window, cx);
    record(&mut window.next_frame.scene, ClipOperation::End);
}

/// Explicit operation markers distinguish scope ownership even when a parent
/// and its only child paint exactly the same primitive range. Markers change
/// neither the bounds tree nor the primitive draw orders.
pub(crate) fn record(scene: &mut Scene, operation: ClipOperation) {
    scene.fast_rounded_clip.compiled = false;
    let index = scene.len();
    match operation {
        ClipOperation::Begin(shape) => {
            scene.fast_rounded_clip.begin(index, shape);
        }
        ClipOperation::End => {
            let scope = *scene
                .fast_rounded_clip
                .active
                .last()
                .expect("balanced rounded clips");
            scene.fast_rounded_clip.end(scope, index + 1);
        }
    }
    scene
        .paint_operations
        .push(crate::scene::PaintOperation::FastRoundedClip(operation));
}

pub(crate) fn track(operation: ClipOperation, active: &mut Vec<Shape>) -> anyhow::Result<()> {
    match operation {
        ClipOperation::Begin(shape) => active.push(shape),
        ClipOperation::End => {
            anyhow::ensure!(
                active.pop().is_some(),
                "source scene closes a rounded clip that is not open"
            );
        }
    }
    Ok(())
}

#[cfg(any(test, feature = "harness"))]
impl Window {
    /// The complete rendered scene, including clip scopes and scroll layers,
    /// for tests that rasterize through a platform's headless GPU renderer.
    pub fn painted_scene(&self) -> &Scene {
        &self.rendered_frame.scene
    }
}
