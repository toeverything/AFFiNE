//! Closed-form bottom sheet / swipe-dialog state machine driven by scheduler time.

use ui::{Motion, MotionCurve};

/// Default opening duration for [`SwipeDialog`] (`320 ms`, `MotionCurve::SWIPE_DIALOG`).
pub const SWIPE_DIALOG_OPEN_MS: f64 = 320.0;
/// Default closing duration for [`SwipeDialog`] (`320 ms`, `MotionCurve::SWIPE_DIALOG`).
pub const SWIPE_DIALOG_CLOSE_MS: f64 = 320.0;
/// Velocity threshold (progress units per second) that commits a swipe open or closed.
const SWIPE_VELOCITY_THRESHOLD: f64 = 1.2;

/// Pure-data state of a [`SwipeDialog`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SwipeDialogState {
    Closed,
    Open,
    Transition { motion: Motion, target_open: bool },
    Dragging { progress: f64 },
}

/// Deterministic snapshot of a [`SwipeDialog`] evaluated at one scheduler timestamp.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwipeDialogSnapshot {
    /// Normalized open progress in `[0.0, 1.0]` (`0.0` = closed, `1.0` = open).
    pub progress: f64,
    pub is_open: bool,
    pub is_animating: bool,
    /// Whether pointer/backdrop interception is active. Drops to `false` on frame 0 of `close()`.
    pub accepts_input: bool,
}

impl SwipeDialogSnapshot {
    /// Deterministic byte representation for frame-rate replay invariance checks.
    pub fn to_bytes(self) -> [u8; 11] {
        let mut out = [0u8; 11];
        out[..8].copy_from_slice(&self.progress.to_bits().to_le_bytes());
        out[8] = u8::from(self.is_open);
        out[9] = u8::from(self.is_animating);
        out[10] = u8::from(self.accepts_input);
        out
    }
}

/// Closed-form sheet / swipe-dialog controller with continuous mid-flight interruption.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwipeDialog {
    state: SwipeDialogState,
    open_curve: MotionCurve,
    close_curve: MotionCurve,
    open_duration_ms: f64,
    close_duration_ms: f64,
}

/// Alias for mobile sheet presentations backed by [`SwipeDialog`].
pub type Sheet = SwipeDialog;

impl Default for SwipeDialog {
    fn default() -> Self {
        Self::new()
    }
}

impl SwipeDialog {
    pub const fn new() -> Self {
        Self {
            state: SwipeDialogState::Closed,
            open_curve: MotionCurve::SWIPE_DIALOG,
            close_curve: MotionCurve::SWIPE_DIALOG,
            open_duration_ms: SWIPE_DIALOG_OPEN_MS,
            close_duration_ms: SWIPE_DIALOG_CLOSE_MS,
        }
    }

    pub const fn with_curves(
        mut self,
        open_curve: MotionCurve,
        close_curve: MotionCurve,
        open_duration_ms: f64,
        close_duration_ms: f64,
    ) -> Self {
        self.open_curve = open_curve;
        self.close_curve = close_curve;
        self.open_duration_ms = open_duration_ms;
        self.close_duration_ms = close_duration_ms;
        self
    }

    pub const fn state(&self) -> SwipeDialogState {
        self.state
    }

    /// Evaluates normalized open progress (`0.0..=1.0`) at scheduler time `now_ms`.
    pub fn progress_at(&self, now_ms: f64) -> f64 {
        match self.state {
            SwipeDialogState::Closed => 0.0,
            SwipeDialogState::Open => 1.0,
            SwipeDialogState::Transition { motion, .. } => motion.value_at(now_ms).clamp(0.0, 1.0),
            SwipeDialogState::Dragging { progress } => progress.clamp(0.0, 1.0),
        }
    }

    pub fn is_animating(&self, now_ms: f64) -> bool {
        matches!(
            self.state,
            SwipeDialogState::Transition { motion, .. } if !motion.is_finished(now_ms)
        )
    }

    /// Opens the dialog from its exact current progress (continuous on mid-flight reversal).
    pub fn open(&mut self, now_ms: f64) {
        let from = self.progress_at(now_ms);
        if from >= 1.0 {
            self.state = SwipeDialogState::Open;
            return;
        }
        let duration = self.open_duration_ms * (1.0 - from);
        self.state = SwipeDialogState::Transition {
            motion: Motion::new(from, 1.0, self.open_curve, now_ms, duration),
            target_open: true,
        };
    }

    /// Closes the dialog from its exact current progress (continuous on mid-flight reversal).
    pub fn close(&mut self, now_ms: f64) {
        let from = self.progress_at(now_ms);
        if from <= 0.0 {
            self.state = SwipeDialogState::Closed;
            return;
        }
        let duration = self.close_duration_ms * from;
        self.state = SwipeDialogState::Transition {
            motion: Motion::new(from, 0.0, self.close_curve, now_ms, duration),
            target_open: false,
        };
    }

    /// Freezes the current progress into interactive drag mode.
    pub fn begin_drag(&mut self, now_ms: f64) {
        let progress = self.progress_at(now_ms);
        self.state = SwipeDialogState::Dragging { progress };
    }

    /// Updates drag progress (`0.0..=1.0`).
    pub fn drag_to(&mut self, progress: f64) {
        self.state = SwipeDialogState::Dragging {
            progress: progress.clamp(0.0, 1.0),
        };
    }

    /// Releases drag and launches a closed-form settle transition based on progress and velocity.
    /// Positive `velocity_per_sec` moves toward open (`1.0`); negative moves toward closed (`0.0`).
    pub fn end_drag(&mut self, velocity_per_sec: f64, now_ms: f64) {
        let current = self.progress_at(now_ms);
        let should_open = if velocity_per_sec.abs() >= SWIPE_VELOCITY_THRESHOLD {
            velocity_per_sec > 0.0
        } else {
            current >= 0.5
        };
        if should_open {
            self.open(now_ms);
        } else {
            self.close(now_ms);
        }
    }

    /// Promotes a finished transition into its resting `Open` or `Closed` state.
    pub fn settle(&mut self, now_ms: f64) {
        if let SwipeDialogState::Transition {
            motion,
            target_open,
        } = self.state
            && motion.is_finished(now_ms)
        {
            self.state = if target_open {
                SwipeDialogState::Open
            } else {
                SwipeDialogState::Closed
            };
        }
    }

    /// Evaluates the full deterministic snapshot at `now_ms`.
    pub fn snapshot_at(&self, now_ms: f64) -> SwipeDialogSnapshot {
        let progress = self.progress_at(now_ms);
        let is_animating = self.is_animating(now_ms);
        let is_open = match self.state {
            SwipeDialogState::Open => true,
            SwipeDialogState::Closed => false,
            SwipeDialogState::Transition { target_open, .. } => {
                if is_animating {
                    progress > 0.0
                } else {
                    target_open
                }
            }
            SwipeDialogState::Dragging { .. } => progress > 0.0,
        };
        let accepts_input = match self.state {
            SwipeDialogState::Open => true,
            SwipeDialogState::Closed => false,
            SwipeDialogState::Transition { target_open, .. } => target_open,
            SwipeDialogState::Dragging { .. } => progress > 0.0,
        };
        SwipeDialogSnapshot {
            progress,
            is_open,
            is_animating,
            accepts_input,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replay_at_fps(fps: f64) -> [u8; 11] {
        let step_ms = 1000.0 / fps;
        let mut dialog = SwipeDialog::new();
        dialog.open(0.0);

        let mut t = 0.0;
        let mut reversed = false;
        while t < 600.0 {
            if !reversed && t >= 120.0 {
                // Mid-flight interruption at an exact scheduler timestamp.
                let before = dialog.progress_at(120.0);
                dialog.close(120.0);
                let after = dialog.progress_at(120.0);
                assert!(
                    (before - after).abs() < 1e-12,
                    "reversal must stay continuous"
                );
                reversed = true;
            }
            dialog.settle(t);
            t += step_ms;
        }
        dialog.settle(600.0);
        dialog.snapshot_at(600.0).to_bytes()
    }

    #[test]
    fn swipe_dialog_four_rate_replay_is_byte_identical() {
        let baseline = replay_at_fps(60.0);
        for fps in [120.0, 24.0, 7.0] {
            assert_eq!(replay_at_fps(fps), baseline, "mismatch at {fps} fps");
        }
    }

    fn sample_schedule_at_fps(fps: f64) -> [[u8; 11]; 4] {
        let step_ms = 1000.0 / fps;
        let mut dialog = SwipeDialog::new();
        dialog.open(0.0);

        let mut mid_open = None;
        let mut rev_frame0 = None;
        let mut mid_close = None;
        let mut t = 0.0;
        while t < 500.0 {
            if mid_open.is_none() && t >= 100.0 {
                mid_open = Some(dialog.snapshot_at(100.0).to_bytes());
            }
            if rev_frame0.is_none() && t >= 120.0 {
                dialog.close(120.0);
                rev_frame0 = Some(dialog.snapshot_at(120.0).to_bytes());
            }
            if mid_close.is_none() && t >= 200.0 {
                mid_close = Some(dialog.snapshot_at(200.0).to_bytes());
            }
            dialog.settle(t);
            t += step_ms;
        }
        dialog.settle(500.0);
        let terminal = dialog.snapshot_at(500.0).to_bytes();
        [
            mid_open.expect("mid-open sample"),
            rev_frame0.expect("reversal frame 0 sample"),
            mid_close.expect("mid-close sample"),
            terminal,
        ]
    }

    #[test]
    fn swipe_dialog_mid_flight_reversal_and_terminal_match_across_60_90_120_144_hz() {
        let baseline = sample_schedule_at_fps(60.0);
        for fps in [90.0, 120.0, 144.0] {
            assert_eq!(
                sample_schedule_at_fps(fps),
                baseline,
                "mid-flight/reversal/terminal mismatch at {fps} Hz"
            );
        }
    }

    #[test]
    fn swipe_dialog_drag_and_velocity_commit() {
        let mut dialog = SwipeDialog::new();
        dialog.begin_drag(10.0);
        dialog.drag_to(0.3);
        dialog.end_drag(2.0, 20.0);
        assert!(dialog.is_animating(25.0));
        dialog.settle(400.0);
        assert_eq!(dialog.state(), SwipeDialogState::Open);
        assert_eq!(dialog.progress_at(400.0), 1.0);
    }

    #[test]
    fn swipe_dialog_releases_input_on_first_frame_of_close() {
        let mut dialog = SwipeDialog::new();
        dialog.open(0.0);
        assert!(dialog.snapshot_at(0.0).accepts_input);

        dialog.settle(400.0);
        assert!(dialog.snapshot_at(400.0).accepts_input);

        dialog.close(400.0);
        let frame0 = dialog.snapshot_at(400.0);
        assert!(!frame0.accepts_input);
        assert!(frame0.progress > 0.0);
        assert!(frame0.is_animating);

        let mid = dialog.snapshot_at(500.0);
        assert!(!mid.accepts_input);
        assert!(mid.progress > 0.0 && mid.progress < 1.0);
    }
}
