use crate::{AffineWindowInsets, selection::AffineRect};

/// Deterministic result of evaluating a keyboard frame against window bounds and safe area.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffineKeyboardAvoidanceMetrics {
    /// Raw vertical intersection between the docked software keyboard and window bounds.
    pub raw_overlap_pt: f32,
    /// Absolute docked keyboard overlap height from the window bottom edge in logical points
    /// (`0.0` for floating, split, hardware, or hidden keyboards). Matches `ui::WindowInsets.ime.bottom`.
    pub ime_bottom_pt: f32,
    /// Additional keyboard height above `safe_bottom` (`max(0, ime_bottom_pt - safe_bottom)`).
    /// Provided for local containers that already deduct `safeAreaInsets.bottom`.
    pub ime_above_safe_bottom_pt: f32,
    /// Effective total bottom avoidance inset (`max(safe_bottom, ime_bottom_pt)`),
    /// matching `ui::WindowInsets::effective().bottom` and `safe_bottom + ime_above_safe_bottom_pt`.
    pub effective_bottom_pt: f32,
    /// True when the keyboard is floating or split (iPad) and does not dock to the bottom edge.
    pub is_floating_or_split: bool,
    /// True when no docked software keyboard overlaps the window (hidden or hardware keyboard).
    pub is_hardware_or_hidden: bool,
}

/// Active keyboard height animation tracked deterministically by `CADisplayLink` timestamps.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct KeyboardFrameTransition {
    pub active: bool,
    pub start_ime_bottom_pt: f32,
    pub target_ime_bottom_pt: f32,
    pub start_timestamp_sec: f64,
    pub duration_sec: f64,
}

impl KeyboardFrameTransition {
    /// Begin a smooth transition toward `target_ime_bottom_pt` starting at `start_timestamp_sec`.
    pub fn begin(
        current_ime_bottom_pt: f32,
        target_ime_bottom_pt: f32,
        start_timestamp_sec: f64,
        duration_sec: f64,
    ) -> Self {
        let cur = sanitize_non_neg(current_ime_bottom_pt);
        let tgt = sanitize_non_neg(target_ime_bottom_pt);
        let dur = if duration_sec.is_finite() && duration_sec > 0.0 {
            duration_sec
        } else {
            0.0
        };
        let ts = if start_timestamp_sec.is_finite() {
            start_timestamp_sec
        } else {
            0.0
        };
        Self {
            active: dur > 0.0 && (cur - tgt).abs() > 0.01,
            start_ime_bottom_pt: cur,
            target_ime_bottom_pt: tgt,
            start_timestamp_sec: ts,
            duration_sec: dur,
        }
    }

    /// Sample the eased keyboard inset at `timestamp_sec` (monotonic `CADisplayLink.timestamp`).
    /// Uses a cubic ease-out curve approximating UIKit's keyboard animation curve (`options: 7`).
    pub fn sample(&mut self, timestamp_sec: f64) -> f32 {
        if !self.active || self.duration_sec <= 0.0 {
            self.active = false;
            return self.target_ime_bottom_pt;
        }
        let now = if timestamp_sec.is_finite() {
            timestamp_sec
        } else {
            self.start_timestamp_sec + self.duration_sec
        };
        let elapsed = (now - self.start_timestamp_sec).max(0.0);
        let t = (elapsed / self.duration_sec).clamp(0.0, 1.0);
        if t >= 1.0 {
            self.active = false;
            return self.target_ime_bottom_pt;
        }
        let inv = 1.0 - t;
        let eased = 1.0 - inv * inv * inv;
        let value = f64::from(self.start_ime_bottom_pt)
            + (f64::from(self.target_ime_bottom_pt) - f64::from(self.start_ime_bottom_pt)) * eased;
        sanitize_non_neg(value as f32)
    }
}

/// Compute keyboard avoidance metrics from a keyboard frame in window coordinates,
/// isomorphic with `ui::WindowInsets::effective()` (`safe_area.bottom.max(ime.bottom)`).
///
/// - Floating or split iPad keyboards (narrower than the window or detached from the bottom edge)
///   produce `ime_bottom_pt = 0.0`, `ime_above_safe_bottom_pt = 0.0`, and `is_floating_or_split = true`.
/// - External hardware keyboards or hidden keyboards produce `ime_bottom_pt = 0.0`,
///   `ime_above_safe_bottom_pt = 0.0`, and `is_hardware_or_hidden = true`.
/// - Docked software keyboards report `ime_bottom_pt = overlap_h` (from window bottom edge),
///   `ime_above_safe_bottom_pt = (overlap_h - safe_bottom).max(0.0)`, and
///   `effective_bottom_pt = safe_bottom.max(ime_bottom_pt)` with zero double deduction.
pub fn compute_keyboard_avoidance(
    window_bounds: AffineRect,
    keyboard_frame_in_window: AffineRect,
    safe_bottom: f32,
    is_hidden: bool,
) -> AffineKeyboardAvoidanceMetrics {
    let wb = window_bounds.sanitized();
    let kb = keyboard_frame_in_window.sanitized();
    let safe_b = sanitize_non_neg(safe_bottom);

    if is_hidden || wb.width <= 0.0 || wb.height <= 0.0 || kb.width <= 0.0 || kb.height <= 0.0 {
        return AffineKeyboardAvoidanceMetrics {
            raw_overlap_pt: 0.0,
            ime_bottom_pt: 0.0,
            ime_above_safe_bottom_pt: 0.0,
            effective_bottom_pt: safe_b,
            is_floating_or_split: false,
            is_hardware_or_hidden: true,
        };
    }

    let inter_top = wb.y.max(kb.y);
    let inter_bottom = wb.bottom().min(kb.bottom());
    let inter_left = wb.x.max(kb.x);
    let inter_right = wb.right().min(kb.right());
    let overlap_h = (inter_bottom - inter_top).max(0.0);
    let overlap_w = (inter_right - inter_left).max(0.0);

    if overlap_h <= 0.5 || overlap_w <= 0.5 {
        return AffineKeyboardAvoidanceMetrics {
            raw_overlap_pt: 0.0,
            ime_bottom_pt: 0.0,
            ime_above_safe_bottom_pt: 0.0,
            effective_bottom_pt: safe_b,
            is_floating_or_split: false,
            is_hardware_or_hidden: true,
        };
    }

    // Floating or split/slide-over keyboards either overlap less than the full window width
    // or hover above the bottom edge of the window.
    let edge_tolerance = 1.5;
    let touches_bottom = kb.bottom() >= wb.bottom() - edge_tolerance;
    let spans_full_width = overlap_w >= wb.width - edge_tolerance;
    if !touches_bottom || !spans_full_width {
        return AffineKeyboardAvoidanceMetrics {
            raw_overlap_pt: 0.0,
            ime_bottom_pt: 0.0,
            ime_above_safe_bottom_pt: 0.0,
            effective_bottom_pt: safe_b,
            is_floating_or_split: true,
            is_hardware_or_hidden: false,
        };
    }

    let ime_above_safe_bottom_pt = (overlap_h - safe_b).max(0.0);
    AffineKeyboardAvoidanceMetrics {
        raw_overlap_pt: overlap_h,
        ime_bottom_pt: overlap_h,
        ime_above_safe_bottom_pt,
        effective_bottom_pt: safe_b.max(overlap_h),
        is_floating_or_split: false,
        is_hardware_or_hidden: false,
    }
}

/// Build an `AffineWindowInsets` snapshot from safe areas and non-double-counted `ime_bottom_pt`.
pub fn build_window_insets(
    safe_top: f32,
    safe_right: f32,
    safe_bottom: f32,
    safe_left: f32,
    ime_bottom_pt: f32,
) -> AffineWindowInsets {
    AffineWindowInsets {
        safe_top: sanitize_non_neg(safe_top),
        safe_right: sanitize_non_neg(safe_right),
        safe_bottom: sanitize_non_neg(safe_bottom),
        safe_left: sanitize_non_neg(safe_left),
        ime_bottom: sanitize_non_neg(ime_bottom_pt),
    }
}

fn sanitize_non_neg(v: f32) -> f32 {
    if v.is_finite() { v.max(0.0) } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyboard_avoidance_table_covers_docked_safe_area_floating_split_and_hardware() {
        struct Case {
            name: &'static str,
            window: AffineRect,
            keyboard: AffineRect,
            safe_bottom: f32,
            is_hidden: bool,
            expect_ime_bottom: f32,
            expect_ime_above_safe: f32,
            expect_effective: f32,
            expect_floating: bool,
            expect_hidden_or_hw: bool,
        }

        let iphone_window = AffineRect {
            x: 0.0,
            y: 0.0,
            width: 390.0,
            height: 844.0,
        };
        let ipad_window = AffineRect {
            x: 0.0,
            y: 0.0,
            width: 1024.0,
            height: 768.0,
        };

        let cases = [
            Case {
                name: "iphone_docked_matches_ui_window_insets_and_exposes_above_safe",
                window: iphone_window,
                keyboard: AffineRect {
                    x: 0.0,
                    y: 542.0,
                    width: 390.0,
                    height: 302.0,
                },
                safe_bottom: 34.0,
                is_hidden: false,
                expect_ime_bottom: 302.0,
                expect_ime_above_safe: 268.0,
                expect_effective: 302.0,
                expect_floating: false,
                expect_hidden_or_hw: false,
            },
            Case {
                name: "overlap_smaller_than_safe_bottom_keeps_effective_at_safe_bottom",
                window: iphone_window,
                keyboard: AffineRect {
                    x: 0.0,
                    y: 820.0,
                    width: 390.0,
                    height: 24.0,
                },
                safe_bottom: 34.0,
                is_hidden: false,
                expect_ime_bottom: 24.0,
                expect_ime_above_safe: 0.0,
                expect_effective: 34.0,
                expect_floating: false,
                expect_hidden_or_hw: false,
            },
            Case {
                name: "hardware_keyboard_offscreen_frame_yields_zero_ime",
                window: iphone_window,
                keyboard: AffineRect {
                    x: 0.0,
                    y: 844.0,
                    width: 390.0,
                    height: 302.0,
                },
                safe_bottom: 34.0,
                is_hidden: false,
                expect_ime_bottom: 0.0,
                expect_ime_above_safe: 0.0,
                expect_effective: 34.0,
                expect_floating: false,
                expect_hidden_or_hw: true,
            },
            Case {
                name: "explicit_hide_notification_yields_zero_ime",
                window: iphone_window,
                keyboard: AffineRect {
                    x: 0.0,
                    y: 542.0,
                    width: 390.0,
                    height: 302.0,
                },
                safe_bottom: 34.0,
                is_hidden: true,
                expect_ime_bottom: 0.0,
                expect_ime_above_safe: 0.0,
                expect_effective: 34.0,
                expect_floating: false,
                expect_hidden_or_hw: true,
            },
            Case {
                name: "ipad_floating_keyboard_narrower_than_window_yields_zero_ime",
                window: ipad_window,
                keyboard: AffineRect {
                    x: 640.0,
                    y: 420.0,
                    width: 320.0,
                    height: 280.0,
                },
                safe_bottom: 20.0,
                is_hidden: false,
                expect_ime_bottom: 0.0,
                expect_ime_above_safe: 0.0,
                expect_effective: 20.0,
                expect_floating: true,
                expect_hidden_or_hw: false,
            },
            Case {
                name: "ipad_split_undocked_keyboard_above_bottom_yields_zero_ime",
                window: ipad_window,
                keyboard: AffineRect {
                    x: 0.0,
                    y: 380.0,
                    width: 1024.0,
                    height: 260.0,
                },
                safe_bottom: 20.0,
                is_hidden: false,
                expect_ime_bottom: 0.0,
                expect_ime_above_safe: 0.0,
                expect_effective: 20.0,
                expect_floating: true,
                expect_hidden_or_hw: false,
            },
            Case {
                name: "slide_over_full_width_keyboard_partial_horizontal_overlap_yields_zero_ime",
                window: iphone_window,
                keyboard: AffineRect {
                    x: 380.0,
                    y: 544.0,
                    width: 390.0,
                    height: 300.0,
                },
                safe_bottom: 34.0,
                is_hidden: false,
                expect_ime_bottom: 0.0,
                expect_ime_above_safe: 0.0,
                expect_effective: 34.0,
                expect_floating: true,
                expect_hidden_or_hw: false,
            },
        ];

        for c in cases {
            let m = compute_keyboard_avoidance(c.window, c.keyboard, c.safe_bottom, c.is_hidden);
            assert_eq!(m.ime_bottom_pt, c.expect_ime_bottom, "{}", c.name);
            assert_eq!(
                m.ime_above_safe_bottom_pt, c.expect_ime_above_safe,
                "{}",
                c.name
            );
            assert_eq!(m.effective_bottom_pt, c.expect_effective, "{}", c.name);
            assert_eq!(
                m.effective_bottom_pt,
                c.safe_bottom + m.ime_above_safe_bottom_pt,
                "{}",
                c.name
            );
            assert_eq!(m.is_floating_or_split, c.expect_floating, "{}", c.name);
            assert_eq!(m.is_hardware_or_hidden, c.expect_hidden_or_hw, "{}", c.name);
        }
    }

    #[test]
    fn per_frame_keyboard_transition_interpolates_monotonically_to_target() {
        let mut tr = KeyboardFrameTransition::begin(0.0, 302.0, 10.0, 0.25);
        assert!(tr.active);
        let f0 = tr.sample(10.0);
        let f1 = tr.sample(10.05);
        let f2 = tr.sample(10.125);
        let f3 = tr.sample(10.25);
        assert_eq!(f0, 0.0);
        assert!(f1 > f0 && f1 < f2);
        assert!(f2 > 151.0 && f2 < 302.0);
        assert_eq!(f3, 302.0);
        assert!(!tr.active);
    }
}
