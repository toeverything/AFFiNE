//! Deterministic headless snapshot, `#[track_caller]` source tracing, and
//! structural UI audit primitives.
//!
//! The snapshot schema and the audit rules live in the renderer-independent
//! `frame-audit` crate (repository `crates/frame-audit`) and are re-exported
//! here. Full snapshot collection and auditing are active under
//! `#[cfg(any(test, feature = "harness"))]`; non-harness release builds compile
//! down to zero-cost no-op stubs so layout and view code never need inline
//! `#[cfg(...)]` tester branches.

pub use frame_audit::{AuditViolation, SnapshotRect};

#[cfg(any(test, feature = "harness"))]
mod active {
    use crate::SharedString;
    use std::panic::Location;

    pub use frame_audit::{DebugElementSnapshot, FrameSnapshot, audit_frame_snapshot};

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
