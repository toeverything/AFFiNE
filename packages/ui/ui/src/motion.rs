//! Pure-data motion transitions evaluated solely as a function of time.
//!
//! Motion is never stepped by frame-to-frame recurrence: declaring `(from, to,
//! curve, start_ms, duration_ms)` guarantees byte-identical terminal states
//! regardless of frame rate (`60 / 120 / 24 / 7 fps` or single-jump evaluation).

use serde::{Deserialize, Serialize};

/// Pure-data easing curve for deterministic motion evaluation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MotionCurve {
    Linear,
    EaseInOutCubic,
    EaseOutQuint,
}

impl MotionCurve {
    /// Evaluates the normalized progress `t` in `[0.0, 1.0]`.
    #[inline]
    pub fn sample(self, t: f64) -> f64 {
        let t = t.clamp(0.0, 1.0);
        match self {
            Self::Linear => t,
            Self::EaseInOutCubic => {
                if t < 0.5 {
                    4.0 * t * t * t
                } else {
                    1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
                }
            }
            Self::EaseOutQuint => 1.0 - (1.0 - t).powi(5),
        }
    }
}

/// A deterministic, pure-data scalar transition.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Motion {
    pub from: f64,
    pub to: f64,
    pub curve: MotionCurve,
    pub start_ms: f64,
    pub duration_ms: f64,
}

impl Motion {
    #[inline]
    pub const fn new(
        from: f64,
        to: f64,
        curve: MotionCurve,
        start_ms: f64,
        duration_ms: f64,
    ) -> Self {
        Self {
            from,
            to,
            curve,
            start_ms,
            duration_ms,
        }
    }

    /// Evaluates the transition at `now_ms`.
    #[inline]
    pub fn value_at(&self, now_ms: f64) -> f64 {
        if self.duration_ms <= 0.0 || now_ms >= self.start_ms + self.duration_ms {
            return self.to;
        }
        if now_ms <= self.start_ms {
            return self.from;
        }
        let raw_t = (now_ms - self.start_ms) / self.duration_ms;
        let eased = self.curve.sample(raw_t);
        self.from + (self.to - self.from) * eased
    }

    /// Returns `true` when `now_ms` is at or past the end of the transition.
    #[inline]
    pub fn is_finished(&self, now_ms: f64) -> bool {
        self.duration_ms <= 0.0 || now_ms >= self.start_ms + self.duration_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn motion_is_fps_invariant() {
        let motion = Motion::new(0.0, 240.0, MotionCurve::EaseInOutCubic, 100.0, 300.0);
        let reference_end = motion.value_at(400.0);
        assert_eq!(reference_end, 240.0);
        assert_eq!(motion.value_at(100.0), 0.0);
        assert!(motion.is_finished(400.0));
        assert!(!motion.is_finished(250.0));

        for fps in [60_u32, 120, 24, 7] {
            let dt = 1000.0 / f64::from(fps);
            let mut t = 100.0;
            let mut last = motion.value_at(t);
            while t < 400.0 {
                t = (t + dt).min(400.0);
                let next = motion.value_at(t);
                assert!(next >= last - f64::EPSILON);
                last = next;
            }
            assert_eq!(last, reference_end);
        }
    }
}
