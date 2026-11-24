//! Pure-data motion transitions and closed-form physics curves evaluated solely
//! as a function of scheduler time.
//!
//! Motion is never stepped by frame-to-frame recurrence: declaring closed-form
//! parameters guarantees byte-identical terminal states regardless of frame rate
//! (`60 / 120 / 24 / 7 fps` or single-jump evaluation).

use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

/// Pure-data easing curve for deterministic motion evaluation.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum MotionCurve {
    Linear,
    EaseInOutCubic,
    EaseOutQuint,
    /// Sinusoidal ease-in-out curve (used by 230 ms `SwipeMenu`).
    InOutSine,
    /// Quadratic ease-out curve (`1 - (1 - t)^2`, runtime fallback of `animejs` `outQuad`).
    EaseOutQuad,
    /// Standard CSS cubic-bezier curve `(x1, y1, x2, y2)` (used by 320 ms `SwipeDialog`).
    CubicBezier {
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
    },
}

impl MotionCurve {
    /// Preset curve for 230 ms `SwipeMenu` transitions.
    pub const SWIPE_MENU: Self = Self::InOutSine;
    /// Intended preset curve for 320 ms `SwipeDialog` transitions (`cubicBezier(0.25, 0.36, 0.24, 0.97)`).
    pub const SWIPE_DIALOG: Self = Self::CubicBezier {
        x1: 0.25,
        y1: 0.36,
        x2: 0.24,
        y2: 0.97,
    };
    /// Runtime fallback curve for `SwipeDialog` when `animejs` defaults to `outQuad`.
    pub const SWIPE_DIALOG_RUNTIME_OUT_QUAD: Self = Self::EaseOutQuad;

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
            Self::InOutSine => -((PI * t).cos() - 1.0) * 0.5,
            Self::EaseOutQuad => 1.0 - (1.0 - t) * (1.0 - t),
            Self::CubicBezier { x1, y1, x2, y2 } => sample_cubic_bezier(t, x1, y1, x2, y2),
        }
    }
}

/// Evaluates a 1D cubic Bezier curve `B_y(u)` where `B_x(u) = t` using
/// Newton-Raphson iterations with deterministic bisection fallback.
fn sample_cubic_bezier(t: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    if t <= 0.0 {
        return 0.0;
    }
    if t >= 1.0 {
        return 1.0;
    }
    let ax = 3.0 * x1 - 3.0 * x2 + 1.0;
    let bx = 3.0 * x2 - 6.0 * x1;
    let cx = 3.0 * x1;

    let ay = 3.0 * y1 - 3.0 * y2 + 1.0;
    let by = 3.0 * y2 - 6.0 * y1;
    let cy = 3.0 * y1;

    let sample_x = |u: f64| ((ax * u + bx) * u + cx) * u;
    let sample_dx = |u: f64| (3.0 * ax * u + 2.0 * bx) * u + cx;
    let sample_y = |u: f64| ((ay * u + by) * u + cy) * u;

    let mut u = t;
    for _ in 0..8 {
        let err = sample_x(u) - t;
        if err.abs() < 1e-7 {
            return sample_y(u);
        }
        let dx = sample_dx(u);
        if dx.abs() < 1e-7 {
            break;
        }
        u = (u - err / dx).clamp(0.0, 1.0);
    }

    let mut lo = 0.0;
    let mut hi = 1.0;
    u = t;
    for _ in 0..24 {
        let x = sample_x(u);
        if (x - t).abs() < 1e-7 {
            break;
        }
        if x < t {
            lo = u;
        } else {
            hi = u;
        }
        u = 0.5 * (lo + hi);
    }
    sample_y(u)
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

    /// Re-anchors the transition at `now_ms` toward `new_to` without position jumps.
    #[inline]
    pub fn reanchor(&self, now_ms: f64, new_to: f64, new_duration_ms: f64) -> Self {
        Self {
            from: self.value_at(now_ms),
            to: new_to,
            curve: self.curve,
            start_ms: now_ms,
            duration_ms: new_duration_ms,
        }
    }
}

/// Closed-form exponential inertial decay `v(t) = v0 * exp(-k * t)`.
///
/// Velocities are expressed in units per second; timestamps are in milliseconds.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct InertialDecay {
    pub start_pos: f64,
    pub initial_velocity: f64,
    /// Exponential damping rate `k > 0` in `1 / second` (e.g. `3.25` for standard scroll).
    pub friction: f64,
    pub start_ms: f64,
    /// Velocity threshold (units/sec) at which the decay snaps to its exact rest position.
    pub stop_velocity: f64,
}

impl InertialDecay {
    pub const fn new(start_pos: f64, initial_velocity: f64, friction: f64, start_ms: f64) -> Self {
        Self {
            start_pos,
            initial_velocity,
            friction,
            start_ms,
            stop_velocity: 10.0,
        }
    }

    /// Exact closed-form resting position reached when velocity decays to `stop_velocity`.
    #[inline]
    pub fn rest_position(&self) -> f64 {
        if self.friction <= 0.0 || self.initial_velocity.abs() <= self.stop_velocity {
            return self.start_pos;
        }
        let dt_s = self.stop_duration_ms() / 1000.0;
        self.start_pos
            + (self.initial_velocity / self.friction) * (1.0 - (-self.friction * dt_s).exp())
    }

    /// Duration in milliseconds until `|v(t)| <= stop_velocity`.
    #[inline]
    pub fn stop_duration_ms(&self) -> f64 {
        let v0 = self.initial_velocity.abs();
        if self.friction <= 0.0 || v0 <= self.stop_velocity || self.stop_velocity <= 0.0 {
            return 0.0;
        }
        ((v0 / self.stop_velocity).ln() / self.friction) * 1000.0
    }

    /// Evaluates position at scheduler timestamp `now_ms`.
    #[inline]
    pub fn value_at(&self, now_ms: f64) -> f64 {
        let elapsed_ms = now_ms - self.start_ms;
        if elapsed_ms <= 0.0 {
            return self.start_pos;
        }
        let stop_ms = self.stop_duration_ms();
        if stop_ms <= 0.0 || elapsed_ms >= stop_ms {
            return self.rest_position();
        }
        let dt_s = elapsed_ms / 1000.0;
        self.start_pos
            + (self.initial_velocity / self.friction) * (1.0 - (-self.friction * dt_s).exp())
    }

    /// Evaluates velocity (units/sec) at scheduler timestamp `now_ms`.
    #[inline]
    pub fn velocity_at(&self, now_ms: f64) -> f64 {
        let elapsed_ms = now_ms - self.start_ms;
        if elapsed_ms <= 0.0 {
            return self.initial_velocity;
        }
        let stop_ms = self.stop_duration_ms();
        if stop_ms <= 0.0 || elapsed_ms >= stop_ms {
            return 0.0;
        }
        let dt_s = elapsed_ms / 1000.0;
        self.initial_velocity * (-self.friction * dt_s).exp()
    }

    /// Returns `true` once the inertial decay has reached its resting position.
    #[inline]
    pub fn is_finished(&self, now_ms: f64) -> bool {
        now_ms - self.start_ms >= self.stop_duration_ms()
    }
}

/// Closed-form iOS-style rubber-band overscroll resistance.
///
/// Maps raw overscroll `offset` beyond a boundary of `dimension > 0` with
/// resistance `coefficient` (typically `0.55`).
#[inline]
pub fn rubber_band(offset: f64, dimension: f64, coefficient: f64) -> f64 {
    if dimension <= 0.0 || coefficient <= 0.0 || offset == 0.0 {
        return 0.0;
    }
    let sign = offset.signum();
    let abs = offset.abs();
    sign * (1.0 - (1.0 / ((abs * coefficient / dimension) + 1.0))) * dimension
}

/// Closed-form critically damped spring with continuous position and velocity
/// re-anchoring on mid-flight interruption or reverse drag.
///
/// Solution: `x(t) = target + (c1 + c2 * t) * exp(-omega * t)`
/// where `c1 = start_pos - target` and `c2 = start_vel + omega * c1`.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct CriticallyDampedSpring {
    pub start_pos: f64,
    /// Initial velocity in units per second.
    pub start_vel: f64,
    pub target: f64,
    /// Natural angular frequency `omega > 0` in rad/s (e.g. `18.0` for crisp UI springs).
    pub omega: f64,
    pub start_ms: f64,
    /// Fixed deterministic settle duration in milliseconds after which `value_at` snaps to `target`.
    pub settle_duration_ms: f64,
}

impl CriticallyDampedSpring {
    pub fn new(start_pos: f64, start_vel: f64, target: f64, omega: f64, start_ms: f64) -> Self {
        let settle_duration_ms = if omega > 0.0 {
            // `exp(-omega * t) < 1e-4` around `omega * t = 12.0` -> deterministic exact snap.
            (12.0 / omega) * 1000.0
        } else {
            0.0
        };
        Self {
            start_pos,
            start_vel,
            target,
            omega,
            start_ms,
            settle_duration_ms,
        }
    }

    /// Evaluates position at scheduler timestamp `now_ms`.
    #[inline]
    pub fn value_at(&self, now_ms: f64) -> f64 {
        let elapsed_ms = now_ms - self.start_ms;
        if elapsed_ms <= 0.0 {
            return self.start_pos;
        }
        if self.omega <= 0.0 || elapsed_ms >= self.settle_duration_ms {
            return self.target;
        }
        let t = elapsed_ms / 1000.0;
        let c1 = self.start_pos - self.target;
        let c2 = self.start_vel + self.omega * c1;
        self.target + (c1 + c2 * t) * (-self.omega * t).exp()
    }

    /// Evaluates velocity (units/sec) at scheduler timestamp `now_ms`.
    #[inline]
    pub fn velocity_at(&self, now_ms: f64) -> f64 {
        let elapsed_ms = now_ms - self.start_ms;
        if elapsed_ms <= 0.0 {
            return self.start_vel;
        }
        if self.omega <= 0.0 || elapsed_ms >= self.settle_duration_ms {
            return 0.0;
        }
        let t = elapsed_ms / 1000.0;
        let c1 = self.start_pos - self.target;
        let c2 = self.start_vel + self.omega * c1;
        (c2 - self.omega * (c1 + c2 * t)) * (-self.omega * t).exp()
    }

    /// Returns `true` when the spring has settled at `target`.
    #[inline]
    pub fn is_finished(&self, now_ms: f64) -> bool {
        self.omega <= 0.0 || now_ms - self.start_ms >= self.settle_duration_ms
    }

    /// Retargets the spring at `now_ms` while preserving both current position and velocity.
    #[inline]
    pub fn retarget(&self, now_ms: f64, new_target: f64) -> Self {
        let pos = self.value_at(now_ms);
        let vel = self.velocity_at(now_ms);
        Self::new(pos, vel, new_target, self.omega, now_ms)
    }

    /// Re-anchors the spring at `now_ms` with an injected gesture position/velocity (e.g. reverse drag).
    #[inline]
    pub fn reanchor(&self, now_ms: f64, new_pos: f64, new_vel: f64, new_target: f64) -> Self {
        Self::new(new_pos, new_vel, new_target, self.omega, now_ms)
    }
}
