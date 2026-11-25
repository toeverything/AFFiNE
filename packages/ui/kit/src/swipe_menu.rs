//! Closed-form swipe-to-reveal action menu state machine with logical LTR/RTL direction support.

use ui::{Direction, Motion, MotionCurve};

/// Default snap duration for [`SwipeMenu`] (`230 ms`, `MotionCurve::SWIPE_MENU`).
pub const SWIPE_MENU_SNAP_MS: f64 = 230.0;
/// Velocity threshold (logical pixels per second) that commits a swipe open or closed.
const SWIPE_MENU_VELOCITY_THRESHOLD: f64 = 240.0;

/// Pure-data state of a [`SwipeMenu`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SwipeMenuState {
    Closed,
    Open,
    Snapping { motion: Motion, target_open: bool },
    Dragging { logical_offset: f64 },
}

/// Deterministic snapshot of a [`SwipeMenu`] evaluated at one scheduler timestamp.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwipeMenuSnapshot {
    /// Reveal distance in logical inline-end direction (`0.0..=action_width`).
    pub logical_offset: f64,
    /// Physical horizontal translation (`-logical_offset` in LTR, `+logical_offset` in RTL).
    pub physical_offset: f64,
    pub is_open: bool,
    pub is_animating: bool,
    /// Whether menu input interception is active. Drops to `false` on frame 0 of `close()`.
    pub accepts_input: bool,
}

impl SwipeMenuSnapshot {
    /// Deterministic byte representation for frame-rate replay invariance checks.
    pub fn to_bytes(self) -> [u8; 19] {
        let mut out = [0u8; 19];
        out[..8].copy_from_slice(&self.logical_offset.to_bits().to_le_bytes());
        out[8..16].copy_from_slice(&self.physical_offset.to_bits().to_le_bytes());
        out[16] = u8::from(self.is_open);
        out[17] = u8::from(self.is_animating);
        out[18] = u8::from(self.accepts_input);
        out
    }
}

/// Closed-form swipe-menu controller with continuous mid-flight interruption and RTL mirroring.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwipeMenu {
    action_width: f64,
    state: SwipeMenuState,
    snap_curve: MotionCurve,
    snap_duration_ms: f64,
}

impl SwipeMenu {
    pub const fn new(action_width: f64) -> Self {
        Self {
            action_width,
            state: SwipeMenuState::Closed,
            snap_curve: MotionCurve::SWIPE_MENU,
            snap_duration_ms: SWIPE_MENU_SNAP_MS,
        }
    }

    pub const fn action_width(&self) -> f64 {
        self.action_width
    }

    pub const fn state(&self) -> SwipeMenuState {
        self.state
    }

    /// Evaluates logical reveal offset (`0.0..=action_width`) at `now_ms`.
    pub fn logical_offset_at(&self, now_ms: f64) -> f64 {
        let max = self.action_width.max(0.0);
        match self.state {
            SwipeMenuState::Closed => 0.0,
            SwipeMenuState::Open => max,
            SwipeMenuState::Snapping { motion, .. } => motion.value_at(now_ms).clamp(0.0, max),
            SwipeMenuState::Dragging { logical_offset } => logical_offset.clamp(0.0, max),
        }
    }

    /// Evaluates signed physical x-translation (`-logical` in LTR, `+logical` in RTL).
    pub fn physical_offset_at(&self, now_ms: f64, direction: Direction) -> f64 {
        let logical = self.logical_offset_at(now_ms);
        match direction {
            Direction::Ltr => -logical,
            Direction::Rtl => logical,
        }
    }

    pub fn is_animating(&self, now_ms: f64) -> bool {
        matches!(
            self.state,
            SwipeMenuState::Snapping { motion, .. } if !motion.is_finished(now_ms)
        )
    }

    /// Snaps the menu open from its exact current offset.
    pub fn open(&mut self, now_ms: f64) {
        let max = self.action_width.max(0.0);
        let from = self.logical_offset_at(now_ms);
        if max <= 0.0 || from >= max {
            self.state = SwipeMenuState::Open;
            return;
        }
        let duration = self.snap_duration_ms * ((max - from) / max);
        self.state = SwipeMenuState::Snapping {
            motion: Motion::new(from, max, self.snap_curve, now_ms, duration),
            target_open: true,
        };
    }

    /// Snaps the menu closed from its exact current offset.
    pub fn close(&mut self, now_ms: f64) {
        let max = self.action_width.max(0.0);
        let from = self.logical_offset_at(now_ms);
        if max <= 0.0 || from <= 0.0 {
            self.state = SwipeMenuState::Closed;
            return;
        }
        let duration = self.snap_duration_ms * (from / max);
        self.state = SwipeMenuState::Snapping {
            motion: Motion::new(from, 0.0, self.snap_curve, now_ms, duration),
            target_open: false,
        };
    }

    /// Freezes the current offset into interactive drag mode.
    pub fn begin_drag(&mut self, now_ms: f64) {
        let logical_offset = self.logical_offset_at(now_ms);
        self.state = SwipeMenuState::Dragging { logical_offset };
    }

    /// Applies a physical horizontal pointer delta `dx` (`-dx` reveals in LTR, `+dx` reveals in RTL),
    /// starting continuously from the current offset at `now_ms` even if called mid-snap.
    pub fn drag_by_physical(&mut self, physical_dx: f64, direction: Direction, now_ms: f64) {
        let logical_delta = match direction {
            Direction::Ltr => -physical_dx,
            Direction::Rtl => physical_dx,
        };
        let current = self.logical_offset_at(now_ms);
        self.state = SwipeMenuState::Dragging {
            logical_offset: (current + logical_delta).clamp(0.0, self.action_width.max(0.0)),
        };
    }

    /// Releases drag and snaps open or closed based on logical reveal distance and physical velocity.
    pub fn end_drag(&mut self, physical_velocity_x: f64, direction: Direction, now_ms: f64) {
        let logical_velocity = match direction {
            Direction::Ltr => -physical_velocity_x,
            Direction::Rtl => physical_velocity_x,
        };
        let current = self.logical_offset_at(now_ms);
        let max = self.action_width.max(0.0);
        let should_open = if logical_velocity.abs() >= SWIPE_MENU_VELOCITY_THRESHOLD {
            logical_velocity > 0.0
        } else {
            current >= max * 0.5
        };
        if should_open {
            self.open(now_ms);
        } else {
            self.close(now_ms);
        }
    }

    /// Promotes a finished snap transition into its resting `Open` or `Closed` state.
    pub fn settle(&mut self, now_ms: f64) {
        if let SwipeMenuState::Snapping {
            motion,
            target_open,
        } = self.state
            && motion.is_finished(now_ms)
        {
            self.state = if target_open {
                SwipeMenuState::Open
            } else {
                SwipeMenuState::Closed
            };
        }
    }

    /// Evaluates the deterministic snapshot at `now_ms` for `direction`.
    pub fn snapshot_at(&self, now_ms: f64, direction: Direction) -> SwipeMenuSnapshot {
        let logical_offset = self.logical_offset_at(now_ms);
        let physical_offset = self.physical_offset_at(now_ms, direction);
        let is_animating = self.is_animating(now_ms);
        let is_open = match self.state {
            SwipeMenuState::Open => true,
            SwipeMenuState::Closed => false,
            SwipeMenuState::Snapping { target_open, .. } => {
                if is_animating {
                    logical_offset > 0.0
                } else {
                    target_open
                }
            }
            SwipeMenuState::Dragging { .. } => logical_offset > 0.0,
        };
        let accepts_input = match self.state {
            SwipeMenuState::Open => true,
            SwipeMenuState::Closed => false,
            SwipeMenuState::Snapping { target_open, .. } => target_open,
            SwipeMenuState::Dragging { .. } => logical_offset > 0.0,
        };
        SwipeMenuSnapshot {
            logical_offset,
            physical_offset,
            is_open,
            is_animating,
            accepts_input,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replay_at_fps(fps: f64, direction: Direction) -> [u8; 19] {
        let step_ms = 1000.0 / fps;
        let mut menu = SwipeMenu::new(144.0);
        menu.open(0.0);

        let mut t = 0.0;
        let mut reversed = false;
        while t < 500.0 {
            if !reversed && t >= 90.0 {
                let before = menu.logical_offset_at(90.0);
                menu.close(90.0);
                let after = menu.logical_offset_at(90.0);
                assert!(
                    (before - after).abs() < 1e-12,
                    "reversal must stay continuous"
                );
                menu.open(140.0);
                reversed = true;
            }
            menu.settle(t);
            t += step_ms;
        }
        menu.settle(500.0);
        menu.snapshot_at(500.0, direction).to_bytes()
    }

    #[test]
    fn swipe_menu_four_rate_replay_is_byte_identical_in_ltr_and_rtl() {
        for direction in [Direction::Ltr, Direction::Rtl] {
            let baseline = replay_at_fps(60.0, direction);
            for fps in [120.0, 24.0, 7.0] {
                assert_eq!(
                    replay_at_fps(fps, direction),
                    baseline,
                    "mismatch at {fps} fps ({direction:?})"
                );
            }
        }
    }

    fn sample_schedule_at_fps(fps: f64, direction: Direction) -> [[u8; 19]; 4] {
        let step_ms = 1000.0 / fps;
        let mut menu = SwipeMenu::new(144.0);
        menu.open(0.0);

        let mut mid_open = None;
        let mut rev_frame0 = None;
        let mut mid_close = None;
        let mut t = 0.0;
        while t < 500.0 {
            if mid_open.is_none() && t >= 100.0 {
                mid_open = Some(menu.snapshot_at(100.0, direction).to_bytes());
            }
            if rev_frame0.is_none() && t >= 120.0 {
                menu.close(120.0);
                rev_frame0 = Some(menu.snapshot_at(120.0, direction).to_bytes());
            }
            if mid_close.is_none() && t >= 200.0 {
                mid_close = Some(menu.snapshot_at(200.0, direction).to_bytes());
            }
            menu.settle(t);
            t += step_ms;
        }
        menu.settle(500.0);
        let terminal = menu.snapshot_at(500.0, direction).to_bytes();
        [
            mid_open.expect("mid-open sample"),
            rev_frame0.expect("reversal frame 0 sample"),
            mid_close.expect("mid-close sample"),
            terminal,
        ]
    }

    #[test]
    fn swipe_menu_mid_flight_reversal_and_terminal_match_across_60_90_120_144_hz() {
        for direction in [Direction::Ltr, Direction::Rtl] {
            let baseline = sample_schedule_at_fps(60.0, direction);
            for fps in [90.0, 120.0, 144.0] {
                assert_eq!(
                    sample_schedule_at_fps(fps, direction),
                    baseline,
                    "mid-flight/reversal/terminal mismatch at {fps} Hz ({direction:?})"
                );
            }
        }
    }

    #[test]
    fn swipe_menu_mirrors_drag_and_offset_between_ltr_and_rtl() {
        let mut ltr = SwipeMenu::new(120.0);
        let mut rtl = SwipeMenu::new(120.0);

        ltr.begin_drag(0.0);
        ltr.drag_by_physical(-80.0, Direction::Ltr, 0.0);
        rtl.begin_drag(0.0);
        rtl.drag_by_physical(80.0, Direction::Rtl, 0.0);

        assert_eq!(ltr.logical_offset_at(0.0), 80.0);
        assert_eq!(rtl.logical_offset_at(0.0), 80.0);
        assert_eq!(ltr.physical_offset_at(0.0, Direction::Ltr), -80.0);
        assert_eq!(rtl.physical_offset_at(0.0, Direction::Rtl), 80.0);

        ltr.end_drag(-300.0, Direction::Ltr, 10.0);
        rtl.end_drag(300.0, Direction::Rtl, 10.0);
        ltr.settle(400.0);
        rtl.settle(400.0);
        assert_eq!(ltr.state(), SwipeMenuState::Open);
        assert_eq!(rtl.state(), SwipeMenuState::Open);
        assert_eq!(
            ltr.physical_offset_at(400.0, Direction::Ltr),
            -rtl.physical_offset_at(400.0, Direction::Rtl)
        );
    }

    #[test]
    fn swipe_menu_releases_input_on_first_frame_of_close() {
        let mut menu = SwipeMenu::new(120.0);
        menu.open(0.0);
        assert!(menu.snapshot_at(0.0, Direction::Ltr).accepts_input);

        menu.settle(300.0);
        assert!(menu.snapshot_at(300.0, Direction::Ltr).accepts_input);

        menu.close(300.0);
        let frame0 = menu.snapshot_at(300.0, Direction::Ltr);
        assert!(!frame0.accepts_input);
        assert!(frame0.logical_offset > 0.0);
        assert!(frame0.is_animating);

        let mid = menu.snapshot_at(380.0, Direction::Rtl);
        assert!(!mid.accepts_input);
        assert!(mid.logical_offset > 0.0 && mid.logical_offset < 120.0);
    }

    #[test]
    fn swipe_menu_drag_by_physical_mid_snap_is_continuous() {
        let mut menu = SwipeMenu::new(120.0);
        menu.open(0.0);
        let before = menu.logical_offset_at(100.0);
        assert!(before > 0.0 && before < 120.0);

        menu.drag_by_physical(-5.0, Direction::Ltr, 100.0);
        let after = menu.logical_offset_at(100.0);
        assert!(
            (after - (before + 5.0).min(120.0)).abs() < 1e-12,
            "drag_by_physical during Snapping must stay continuous: before={before}, after={after}"
        );
    }
}
