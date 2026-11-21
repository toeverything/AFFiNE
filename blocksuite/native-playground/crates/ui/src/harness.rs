//! Deterministic headless snapshot, `#[track_caller]` source tracing, and
//! structural UI audit primitives.
//!
//! Full snapshot collection and auditing are active under `#[cfg(any(test, feature = "harness"))]`;
//! non-harness release builds compile down to zero-cost no-op stubs so layout and view code
//! never need inline `#[cfg(...)]` tester branches.

use serde::{Deserialize, Serialize};

/// Logical pixel rectangle recorded in structured element snapshots.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SnapshotRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl SnapshotRect {
    #[inline]
    pub const fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    #[inline]
    pub fn right(&self) -> f32 {
        self.x + self.width
    }

    #[inline]
    pub fn bottom(&self) -> f32 {
        self.y + self.height
    }

    #[inline]
    pub fn contains_point(&self, px: f32, py: f32) -> bool {
        px >= self.x && px <= self.right() && py >= self.y && py <= self.bottom()
    }
}

/// A structural violation reported by `audit_frame_snapshot`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditViolation {
    pub rule: String,
    pub element_id: String,
    pub callsite: String,
    pub message: String,
}

#[cfg(any(test, feature = "harness"))]
mod active {
    use super::{AuditViolation, SnapshotRect};
    use crate::SharedString;
    use serde::{Deserialize, Serialize};
    use std::collections::BTreeMap;
    use std::panic::Location;

    /// Metadata attached to an element so `Interactivity::paint` records a real
    /// post-layout `DebugElementSnapshot` into `Frame::element_snapshots`.
    #[derive(Clone, Debug)]
    pub(crate) struct SnapshotSpec {
        pub(crate) id: SharedString,
        pub(crate) parent_id: Option<SharedString>,
        pub(crate) callsite: &'static Location<'static>,
        pub(crate) focused: bool,
        pub(crate) text: Option<SharedString>,
    }

    /// Structured element snapshot with `#[track_caller]` origin for automated
    /// layout auditing and `sources_at(x, y)` reverse lookup.
    #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
    pub struct DebugElementSnapshot {
        pub id: String,
        pub parent_id: Option<String>,
        pub callsite: String,
        pub bounds: SnapshotRect,
        pub content_mask: SnapshotRect,
        pub opacity: f32,
        pub interactive: bool,
        pub focused: bool,
        pub corner_radius: f32,
        pub padding: f32,
        pub text: Option<String>,
    }

    impl DebugElementSnapshot {
        /// Constructs a snapshot capturing the caller's `file:line` via `#[track_caller]`.
        #[track_caller]
        pub fn new(
            id: impl Into<String>,
            bounds: SnapshotRect,
            content_mask: SnapshotRect,
        ) -> Self {
            Self::from_location(id, Location::caller(), bounds, content_mask)
        }

        /// Constructs a snapshot using a previously captured `#[track_caller]` location.
        pub fn from_location(
            id: impl Into<String>,
            loc: &'static Location<'static>,
            bounds: SnapshotRect,
            content_mask: SnapshotRect,
        ) -> Self {
            Self {
                id: id.into(),
                parent_id: None,
                callsite: format!("{}:{}", loc.file(), loc.line()),
                bounds,
                content_mask,
                opacity: 1.0,
                interactive: false,
                focused: false,
                corner_radius: 0.0,
                padding: 0.0,
                text: None,
            }
        }

        pub fn with_parent(mut self, parent_id: impl Into<String>) -> Self {
            self.parent_id = Some(parent_id.into());
            self
        }

        pub fn with_opacity(mut self, opacity: f32) -> Self {
            self.opacity = opacity;
            self
        }

        pub fn with_interactive(mut self, interactive: bool) -> Self {
            self.interactive = interactive;
            self
        }

        pub fn with_focused(mut self, focused: bool) -> Self {
            self.focused = focused;
            self
        }

        pub fn with_corner_radius(mut self, radius: f32) -> Self {
            self.corner_radius = radius;
            self
        }

        pub fn with_padding(mut self, padding: f32) -> Self {
            self.padding = padding;
            self
        }

        pub fn with_text(mut self, text: impl Into<String>) -> Self {
            self.text = Some(text.into());
            self
        }
    }

    /// Deterministic ordered collection of element snapshots for a rendered frame.
    #[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
    pub struct FrameSnapshot {
        pub viewport: SnapshotRect,
        pub scale_factor: f32,
        pub elements: BTreeMap<String, DebugElementSnapshot>,
    }

    impl FrameSnapshot {
        pub fn new(width: f32, height: f32, scale_factor: f32) -> Self {
            Self {
                viewport: SnapshotRect::new(0.0, 0.0, width, height),
                scale_factor,
                elements: BTreeMap::new(),
            }
        }

        pub fn reset(&mut self, width: f32, height: f32, scale_factor: f32) {
            self.viewport = SnapshotRect::new(0.0, 0.0, width, height);
            self.scale_factor = scale_factor;
            self.elements.clear();
        }

        pub fn clear(&mut self) {
            self.elements.clear();
        }

        pub fn record(&mut self, snapshot: DebugElementSnapshot) {
            self.elements.insert(snapshot.id.clone(), snapshot);
        }

        /// Returns all recorded element snapshots in deterministic lexicographic order.
        pub fn debug_element_snapshots(&self) -> Vec<&DebugElementSnapshot> {
            self.elements.values().collect()
        }

        /// Returns the callsites (`id @ file:line`) of all elements covering `(x, y)`.
        pub fn sources_at(&self, x: f32, y: f32) -> Vec<String> {
            self.elements
                .values()
                .filter(|el| el.bounds.contains_point(x, y))
                .map(|el| format!("{} @ {}", el.id, el.callsite))
                .collect()
        }
    }

    /// Runs structural UI audit rules against a `FrameSnapshot`:
    /// - `parent-clip-fault`: element visibly clipped outside its active `content_mask`
    /// - `zero-opacity-hit-through`: interactive element with `opacity <= 0.0`
    /// - `min-hit-target`: interactive element smaller than `24x24` logical px
    /// - `concentric-corner-radius`: inner rounded element violating `outer_r >= inner_r + padding`
    /// - `off-viewport-focus`: focused element completely outside the viewport
    /// - `pixel-alignment`: element origin or size off the `1x` pixel grid (sub-pixel drift > `0.01`)
    pub fn audit_frame_snapshot(snapshot: &FrameSnapshot) -> Vec<AuditViolation> {
        let mut violations = Vec::new();

        for el in snapshot.elements.values() {
            let eps = 0.5_f32;
            if el.bounds.width > 0.0 && el.bounds.height > 0.0 {
                if el.bounds.x + eps < el.content_mask.x
                    || el.bounds.y + eps < el.content_mask.y
                    || el.bounds.right() - eps > el.content_mask.right()
                    || el.bounds.bottom() - eps > el.content_mask.bottom()
                {
                    violations.push(AuditViolation {
                        rule: "parent-clip-fault".into(),
                        element_id: el.id.clone(),
                        callsite: el.callsite.clone(),
                        message: format!(
                            "bounds {:?} extend past content_mask {:?}",
                            el.bounds, el.content_mask
                        ),
                    });
                }
            }

            if el.interactive && el.opacity <= 0.0 {
                violations.push(AuditViolation {
                    rule: "zero-opacity-hit-through".into(),
                    element_id: el.id.clone(),
                    callsite: el.callsite.clone(),
                    message: "interactive element has zero opacity".into(),
                });
            }

            if el.interactive && (el.bounds.width < 24.0 || el.bounds.height < 24.0) {
                violations.push(AuditViolation {
                    rule: "min-hit-target".into(),
                    element_id: el.id.clone(),
                    callsite: el.callsite.clone(),
                    message: format!(
                        "interactive hit target {}x{} is smaller than 24x24",
                        el.bounds.width, el.bounds.height
                    ),
                });
            }

            if let Some(parent_id) = &el.parent_id {
                if let Some(parent) = snapshot.elements.get(parent_id) {
                    if parent.corner_radius > 0.0
                        && el.corner_radius > 0.0
                        && parent.padding > 0.0
                        && parent.corner_radius > parent.padding
                        && el.corner_radius > parent.corner_radius - parent.padding + 0.5
                    {
                        violations.push(AuditViolation {
                            rule: "concentric-corner-radius".into(),
                            element_id: el.id.clone(),
                            callsite: el.callsite.clone(),
                            message: format!(
                                "inner radius {} exceeds concentric limit (parent radius {} - padding {})",
                                el.corner_radius, parent.corner_radius, parent.padding
                            ),
                        });
                    }
                }
            }

            if el.focused {
                let outside = el.bounds.right() <= snapshot.viewport.x
                    || el.bounds.x >= snapshot.viewport.right()
                    || el.bounds.bottom() <= snapshot.viewport.y
                    || el.bounds.y >= snapshot.viewport.bottom();
                if outside {
                    violations.push(AuditViolation {
                        rule: "off-viewport-focus".into(),
                        element_id: el.id.clone(),
                        callsite: el.callsite.clone(),
                        message: format!(
                            "focused element {:?} lies outside viewport {:?}",
                            el.bounds, snapshot.viewport
                        ),
                    });
                }
            }

            let frac_bad = |v: f32| (v - v.round()).abs() > 0.01;
            if frac_bad(el.bounds.x)
                || frac_bad(el.bounds.y)
                || frac_bad(el.bounds.width)
                || frac_bad(el.bounds.height)
            {
                violations.push(AuditViolation {
                    rule: "pixel-alignment".into(),
                    element_id: el.id.clone(),
                    callsite: el.callsite.clone(),
                    message: format!("bounds {:?} are not aligned to 1x pixel grid", el.bounds),
                });
            }
        }

        violations
    }
}

#[cfg(not(any(test, feature = "harness")))]
mod active {
    use super::{AuditViolation, SnapshotRect};

    /// Zero-cost no-op snapshot builder used when the `harness` feature is disabled.
    #[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
    pub struct DebugElementSnapshot;

    impl DebugElementSnapshot {
        #[inline]
        pub fn new(_id: &str, _bounds: SnapshotRect, _content_mask: SnapshotRect) -> Self {
            Self
        }

        #[inline]
        pub fn with_parent(self, _parent_id: &str) -> Self {
            self
        }

        #[inline]
        pub fn with_opacity(self, _opacity: f32) -> Self {
            self
        }

        #[inline]
        pub fn with_interactive(self, _interactive: bool) -> Self {
            self
        }

        #[inline]
        pub fn with_focused(self, _focused: bool) -> Self {
            self
        }

        #[inline]
        pub fn with_corner_radius(self, _radius: f32) -> Self {
            self
        }

        #[inline]
        pub fn with_padding(self, _padding: f32) -> Self {
            self
        }

        #[inline]
        pub fn with_text(self, _text: &str) -> Self {
            self
        }
    }

    /// Zero-cost no-op frame snapshot collector used when the `harness` feature is disabled.
    #[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
    pub struct FrameSnapshot;

    impl FrameSnapshot {
        #[inline]
        pub fn new(_width: f32, _height: f32, _scale_factor: f32) -> Self {
            Self
        }

        #[inline]
        pub fn reset(&mut self, _width: f32, _height: f32, _scale_factor: f32) {}

        #[inline]
        pub fn clear(&mut self) {}

        #[inline]
        pub fn record(&mut self, _snapshot: DebugElementSnapshot) {}

        #[inline]
        pub fn debug_element_snapshots(&self) -> Vec<&DebugElementSnapshot> {
            Vec::new()
        }

        #[inline]
        pub fn sources_at(&self, _x: f32, _y: f32) -> Vec<String> {
            Vec::new()
        }
    }

    #[inline]
    pub fn audit_frame_snapshot(_snapshot: &FrameSnapshot) -> Vec<AuditViolation> {
        Vec::new()
    }
}

#[cfg(any(test, feature = "harness"))]
pub(crate) use active::SnapshotSpec;
pub use active::{DebugElementSnapshot, FrameSnapshot, audit_frame_snapshot};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_caller_and_sources_at_work() {
        let mut frame = FrameSnapshot::new(800.0, 600.0, 1.0);
        let snap = DebugElementSnapshot::new(
            "toolbar.button",
            SnapshotRect::new(10.0, 20.0, 48.0, 32.0),
            SnapshotRect::new(0.0, 0.0, 800.0, 600.0),
        )
        .with_interactive(true);
        assert!(snap.callsite.contains("harness.rs:"));
        frame.record(snap);

        assert_eq!(frame.debug_element_snapshots().len(), 1);
        let hits = frame.sources_at(20.0, 30.0);
        assert_eq!(hits.len(), 1);
        assert!(hits[0].starts_with("toolbar.button @ "));
        assert!(frame.sources_at(500.0, 500.0).is_empty());
        assert!(audit_frame_snapshot(&frame).is_empty());
    }

    #[test]
    fn audit_detects_all_six_violation_classes() {
        let mut frame = FrameSnapshot::new(400.0, 300.0, 1.0);
        frame.record(
            DebugElementSnapshot::new(
                "parent.pill",
                SnapshotRect::new(10.0, 10.0, 100.0, 40.0),
                SnapshotRect::new(0.0, 0.0, 400.0, 300.0),
            )
            .with_corner_radius(10.0)
            .with_padding(4.0),
        );
        frame.record(
            DebugElementSnapshot::new(
                "child.bad_btn",
                SnapshotRect::new(14.0, 14.0, 16.0, 16.0),
                SnapshotRect::new(10.0, 10.0, 100.0, 40.0),
            )
            .with_parent("parent.pill")
            .with_interactive(true)
            .with_opacity(0.0)
            .with_corner_radius(8.0),
        );
        frame.record(
            DebugElementSnapshot::new(
                "offscreen.focus",
                SnapshotRect::new(420.3, 10.0, 40.0, 30.0),
                SnapshotRect::new(0.0, 0.0, 400.0, 300.0),
            )
            .with_focused(true),
        );

        let violations = audit_frame_snapshot(&frame);
        let rules: Vec<&str> = violations.iter().map(|v| v.rule.as_str()).collect();
        assert!(rules.contains(&"concentric-corner-radius"), "{rules:?}");
        assert!(rules.contains(&"zero-opacity-hit-through"), "{rules:?}");
        assert!(rules.contains(&"min-hit-target"), "{rules:?}");
        assert!(rules.contains(&"parent-clip-fault"), "{rules:?}");
        assert!(rules.contains(&"off-viewport-focus"), "{rules:?}");
        assert!(rules.contains(&"pixel-alignment"), "{rules:?}");
    }
}
