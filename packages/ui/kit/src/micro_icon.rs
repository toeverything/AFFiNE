//! Compile-time baked keyframe vector micro-icons with a single-clock closed-form evaluator.
//!
//! Replaces runtime Lottie players with static `const` keyframe tables evaluated directly
//! from `elapsed_ms` via [`ui::MotionCurve`], guaranteeing bitwise-identical terminal frames
//! across `60 / 120 / 24 / 7 fps` sampling rates.

use ui::{Direction, MotionCurve};

/// The five mobile-reachable micro-animated vector icons.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum MicroIconKind {
    Home,
    Explorer,
    Journals,
    Search,
    SyncSpinner,
}

impl MicroIconKind {
    /// All supported micro-icons in canonical navigation order.
    pub const ALL: [Self; 5] = [
        Self::Home,
        Self::Explorer,
        Self::Journals,
        Self::Search,
        Self::SyncSpinner,
    ];

    /// Stable machine identifier for snapshot and accessibility labeling.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Explorer => "explorer",
            Self::Journals => "journals",
            Self::Search => "search",
            Self::SyncSpinner => "sync_spinner",
        }
    }

    /// Whether this icon is directional and must mirror horizontally in RTL layouts.
    pub const fn mirror_in_rtl(self) -> bool {
        matches!(self, Self::Explorer | Self::Search)
    }
}

/// Normalized 2D vector point inside the `[0.0, 24.0]` icon viewBox.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VecPoint {
    pub x: f32,
    pub y: f32,
}

impl VecPoint {
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    /// Mirror this point horizontally across `viewbox_width` when `direction` is RTL.
    pub fn resolve_x(self, viewbox_width: f32, direction: Direction, mirror_in_rtl: bool) -> f32 {
        if mirror_in_rtl && direction.is_rtl() {
            viewbox_width - self.x
        } else {
            self.x
        }
    }
}

/// One static vector stroke segment defined in the `24x24` viewBox.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BakedStroke {
    pub points: &'static [VecPoint],
    pub closed: bool,
    pub stroke_width: f32,
}

/// One keyframe sample baked at compile time.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MicroIconKeyframe {
    pub time_ms: f64,
    pub scale: f32,
    pub rotation_deg: f32,
    pub stroke_progress: f32,
    pub opacity: f32,
    pub curve_to_next: MotionCurve,
}

/// Compile-time baked keyframe table for one [`MicroIconKind`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BakedMicroIconSpec {
    pub kind: MicroIconKind,
    pub duration_ms: f64,
    pub looping: bool,
    pub mirror_in_rtl: bool,
    pub viewbox: f32,
    pub strokes: &'static [BakedStroke],
    pub keyframes: &'static [MicroIconKeyframe],
}

const HOME_ROOF: &[VecPoint] = &[
    VecPoint::new(3.0, 11.0),
    VecPoint::new(12.0, 3.5),
    VecPoint::new(21.0, 11.0),
];
const HOME_BODY: &[VecPoint] = &[
    VecPoint::new(5.5, 10.0),
    VecPoint::new(5.5, 20.0),
    VecPoint::new(18.5, 20.0),
    VecPoint::new(18.5, 10.0),
];
const HOME_STROKES: &[BakedStroke] = &[
    BakedStroke {
        points: HOME_ROOF,
        closed: false,
        stroke_width: 1.8,
    },
    BakedStroke {
        points: HOME_BODY,
        closed: false,
        stroke_width: 1.8,
    },
];
const HOME_KEYFRAMES: &[MicroIconKeyframe] = &[
    MicroIconKeyframe {
        time_ms: 0.0,
        scale: 0.90,
        rotation_deg: 0.0,
        stroke_progress: 0.25,
        opacity: 0.80,
        curve_to_next: MotionCurve::EaseOutQuad,
    },
    MicroIconKeyframe {
        time_ms: 140.0,
        scale: 1.08,
        rotation_deg: 0.0,
        stroke_progress: 0.92,
        opacity: 1.0,
        curve_to_next: MotionCurve::InOutSine,
    },
    MicroIconKeyframe {
        time_ms: 260.0,
        scale: 1.0,
        rotation_deg: 0.0,
        stroke_progress: 1.0,
        opacity: 1.0,
        curve_to_next: MotionCurve::Linear,
    },
];

const EXPLORER_FOLDER: &[VecPoint] = &[
    VecPoint::new(3.0, 6.0),
    VecPoint::new(9.5, 6.0),
    VecPoint::new(11.5, 8.5),
    VecPoint::new(21.0, 8.5),
    VecPoint::new(21.0, 19.0),
    VecPoint::new(3.0, 19.0),
];
const EXPLORER_CHEVRON: &[VecPoint] = &[
    VecPoint::new(10.0, 12.0),
    VecPoint::new(13.5, 14.0),
    VecPoint::new(10.0, 16.0),
];
const EXPLORER_STROKES: &[BakedStroke] = &[
    BakedStroke {
        points: EXPLORER_FOLDER,
        closed: true,
        stroke_width: 1.8,
    },
    BakedStroke {
        points: EXPLORER_CHEVRON,
        closed: false,
        stroke_width: 1.6,
    },
];
const EXPLORER_KEYFRAMES: &[MicroIconKeyframe] = &[
    MicroIconKeyframe {
        time_ms: 0.0,
        scale: 0.92,
        rotation_deg: -6.0,
        stroke_progress: 0.30,
        opacity: 0.82,
        curve_to_next: MotionCurve::EaseOutQuad,
    },
    MicroIconKeyframe {
        time_ms: 160.0,
        scale: 1.05,
        rotation_deg: 2.0,
        stroke_progress: 0.95,
        opacity: 1.0,
        curve_to_next: MotionCurve::EaseInOutCubic,
    },
    MicroIconKeyframe {
        time_ms: 280.0,
        scale: 1.0,
        rotation_deg: 0.0,
        stroke_progress: 1.0,
        opacity: 1.0,
        curve_to_next: MotionCurve::Linear,
    },
];

const JOURNALS_FRAME: &[VecPoint] = &[
    VecPoint::new(4.0, 5.0),
    VecPoint::new(20.0, 5.0),
    VecPoint::new(20.0, 20.0),
    VecPoint::new(4.0, 20.0),
];
const JOURNALS_HEADER: &[VecPoint] = &[VecPoint::new(4.0, 9.5), VecPoint::new(20.0, 9.5)];
const JOURNALS_DOT: &[VecPoint] = &[VecPoint::new(11.0, 14.5), VecPoint::new(13.0, 14.5)];
const JOURNALS_STROKES: &[BakedStroke] = &[
    BakedStroke {
        points: JOURNALS_FRAME,
        closed: true,
        stroke_width: 1.8,
    },
    BakedStroke {
        points: JOURNALS_HEADER,
        closed: false,
        stroke_width: 1.6,
    },
    BakedStroke {
        points: JOURNALS_DOT,
        closed: false,
        stroke_width: 2.2,
    },
];
const JOURNALS_KEYFRAMES: &[MicroIconKeyframe] = &[
    MicroIconKeyframe {
        time_ms: 0.0,
        scale: 0.88,
        rotation_deg: 0.0,
        stroke_progress: 0.20,
        opacity: 0.78,
        curve_to_next: MotionCurve::EaseOutQuint,
    },
    MicroIconKeyframe {
        time_ms: 240.0,
        scale: 1.0,
        rotation_deg: 0.0,
        stroke_progress: 1.0,
        opacity: 1.0,
        curve_to_next: MotionCurve::Linear,
    },
];

const SEARCH_LENS: &[VecPoint] = &[
    VecPoint::new(10.5, 4.5),
    VecPoint::new(15.0, 6.5),
    VecPoint::new(16.5, 10.5),
    VecPoint::new(15.0, 14.5),
    VecPoint::new(10.5, 16.5),
    VecPoint::new(6.0, 14.5),
    VecPoint::new(4.5, 10.5),
    VecPoint::new(6.0, 6.5),
];
const SEARCH_HANDLE: &[VecPoint] = &[VecPoint::new(15.2, 15.2), VecPoint::new(20.2, 20.2)];
const SEARCH_STROKES: &[BakedStroke] = &[
    BakedStroke {
        points: SEARCH_LENS,
        closed: true,
        stroke_width: 1.8,
    },
    BakedStroke {
        points: SEARCH_HANDLE,
        closed: false,
        stroke_width: 2.0,
    },
];
const SEARCH_KEYFRAMES: &[MicroIconKeyframe] = &[
    MicroIconKeyframe {
        time_ms: 0.0,
        scale: 0.90,
        rotation_deg: -12.0,
        stroke_progress: 0.35,
        opacity: 0.85,
        curve_to_next: MotionCurve::EaseOutQuad,
    },
    MicroIconKeyframe {
        time_ms: 150.0,
        scale: 1.06,
        rotation_deg: 4.0,
        stroke_progress: 1.0,
        opacity: 1.0,
        curve_to_next: MotionCurve::InOutSine,
    },
    MicroIconKeyframe {
        time_ms: 250.0,
        scale: 1.0,
        rotation_deg: 0.0,
        stroke_progress: 1.0,
        opacity: 1.0,
        curve_to_next: MotionCurve::Linear,
    },
];

const SYNC_ARC_TOP: &[VecPoint] = &[
    VecPoint::new(5.0, 11.0),
    VecPoint::new(7.5, 6.0),
    VecPoint::new(13.0, 4.5),
    VecPoint::new(18.0, 7.0),
];
const SYNC_ARC_BOTTOM: &[VecPoint] = &[
    VecPoint::new(19.0, 13.0),
    VecPoint::new(16.5, 18.0),
    VecPoint::new(11.0, 19.5),
    VecPoint::new(6.0, 17.0),
];
const SYNC_STROKES: &[BakedStroke] = &[
    BakedStroke {
        points: SYNC_ARC_TOP,
        closed: false,
        stroke_width: 1.8,
    },
    BakedStroke {
        points: SYNC_ARC_BOTTOM,
        closed: false,
        stroke_width: 1.8,
    },
];
const SYNC_KEYFRAMES: &[MicroIconKeyframe] = &[
    MicroIconKeyframe {
        time_ms: 0.0,
        scale: 1.0,
        rotation_deg: 0.0,
        stroke_progress: 0.85,
        opacity: 0.90,
        curve_to_next: MotionCurve::Linear,
    },
    MicroIconKeyframe {
        time_ms: 450.0,
        scale: 1.0,
        rotation_deg: 180.0,
        stroke_progress: 1.0,
        opacity: 1.0,
        curve_to_next: MotionCurve::Linear,
    },
    MicroIconKeyframe {
        time_ms: 900.0,
        scale: 1.0,
        rotation_deg: 360.0,
        stroke_progress: 0.85,
        opacity: 0.90,
        curve_to_next: MotionCurve::Linear,
    },
];

/// Compile-time lookup of the baked keyframe specification for `icon`.
pub const fn micro_icon_spec(icon: MicroIconKind) -> &'static BakedMicroIconSpec {
    const HOME: BakedMicroIconSpec = BakedMicroIconSpec {
        kind: MicroIconKind::Home,
        duration_ms: 260.0,
        looping: false,
        mirror_in_rtl: false,
        viewbox: 24.0,
        strokes: HOME_STROKES,
        keyframes: HOME_KEYFRAMES,
    };
    const EXPLORER: BakedMicroIconSpec = BakedMicroIconSpec {
        kind: MicroIconKind::Explorer,
        duration_ms: 280.0,
        looping: false,
        mirror_in_rtl: true,
        viewbox: 24.0,
        strokes: EXPLORER_STROKES,
        keyframes: EXPLORER_KEYFRAMES,
    };
    const JOURNALS: BakedMicroIconSpec = BakedMicroIconSpec {
        kind: MicroIconKind::Journals,
        duration_ms: 240.0,
        looping: false,
        mirror_in_rtl: false,
        viewbox: 24.0,
        strokes: JOURNALS_STROKES,
        keyframes: JOURNALS_KEYFRAMES,
    };
    const SEARCH: BakedMicroIconSpec = BakedMicroIconSpec {
        kind: MicroIconKind::Search,
        duration_ms: 250.0,
        looping: false,
        mirror_in_rtl: true,
        viewbox: 24.0,
        strokes: SEARCH_STROKES,
        keyframes: SEARCH_KEYFRAMES,
    };
    const SYNC: BakedMicroIconSpec = BakedMicroIconSpec {
        kind: MicroIconKind::SyncSpinner,
        duration_ms: 900.0,
        looping: true,
        mirror_in_rtl: false,
        viewbox: 24.0,
        strokes: SYNC_STROKES,
        keyframes: SYNC_KEYFRAMES,
    };

    match icon {
        MicroIconKind::Home => &HOME,
        MicroIconKind::Explorer => &EXPLORER,
        MicroIconKind::Journals => &JOURNALS,
        MicroIconKind::Search => &SEARCH,
        MicroIconKind::SyncSpinner => &SYNC,
    }
}

/// Deterministic evaluated frame of a micro-icon at one scheduler timestamp.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MicroIconFrame {
    pub kind: MicroIconKind,
    pub scale: f32,
    pub rotation_deg: f32,
    pub stroke_progress: f32,
    pub opacity: f32,
    pub mirror_in_rtl: bool,
    pub viewbox: f32,
    pub strokes: &'static [BakedStroke],
}

impl MicroIconFrame {
    /// Deterministic byte encoding for bitwise frame-rate replay assertions.
    pub fn to_bytes(self) -> [u8; 17] {
        let mut out = [0u8; 17];
        out[0..4].copy_from_slice(&self.scale.to_bits().to_le_bytes());
        out[4..8].copy_from_slice(&self.rotation_deg.to_bits().to_le_bytes());
        out[8..12].copy_from_slice(&self.stroke_progress.to_bits().to_le_bytes());
        out[12..16].copy_from_slice(&self.opacity.to_bits().to_le_bytes());
        out[16] = u8::from(self.mirror_in_rtl);
        out
    }

    /// Compute the bounding box `(x, width)` of the icon's primary stroke in `[0, viewbox]`
    /// after applying RTL mirroring when `direction` is RTL.
    pub fn stroke_horizontal_bounds(self, stroke_idx: usize, direction: Direction) -> (f32, f32) {
        let stroke = &self.strokes[stroke_idx];
        let mut min_x = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        for pt in stroke.points {
            let x = pt.resolve_x(self.viewbox, direction, self.mirror_in_rtl);
            if x < min_x {
                min_x = x;
            }
            if x > max_x {
                max_x = x;
            }
        }
        (min_x, (max_x - min_x).max(0.0))
    }
}

/// Closed-form single-clock evaluator for any [`MicroIconKind`].
pub fn evaluate_micro_icon(icon: MicroIconKind, elapsed_ms: f64) -> MicroIconFrame {
    let spec = micro_icon_spec(icon);
    let clamped_ms = if elapsed_ms <= 0.0 || !elapsed_ms.is_finite() {
        0.0
    } else if spec.looping && spec.duration_ms > 0.0 {
        elapsed_ms.rem_euclid(spec.duration_ms)
    } else {
        elapsed_ms.min(spec.duration_ms)
    };

    let frames = spec.keyframes;
    let first = frames[0];
    let last = frames[frames.len() - 1];

    if clamped_ms <= first.time_ms {
        return MicroIconFrame {
            kind: icon,
            scale: first.scale,
            rotation_deg: first.rotation_deg,
            stroke_progress: first.stroke_progress,
            opacity: first.opacity,
            mirror_in_rtl: spec.mirror_in_rtl,
            viewbox: spec.viewbox,
            strokes: spec.strokes,
        };
    }

    if clamped_ms >= last.time_ms {
        return MicroIconFrame {
            kind: icon,
            scale: last.scale,
            rotation_deg: last.rotation_deg,
            stroke_progress: last.stroke_progress,
            opacity: last.opacity,
            mirror_in_rtl: spec.mirror_in_rtl,
            viewbox: spec.viewbox,
            strokes: spec.strokes,
        };
    }

    for pair in frames.windows(2) {
        let a = pair[0];
        let b = pair[1];
        if clamped_ms >= a.time_ms && clamped_ms <= b.time_ms {
            let span = (b.time_ms - a.time_ms).max(1e-9);
            let raw_t = ((clamped_ms - a.time_ms) / span).clamp(0.0, 1.0);
            let eased = a.curve_to_next.sample(raw_t) as f32;
            return MicroIconFrame {
                kind: icon,
                scale: lerp_f32(a.scale, b.scale, eased),
                rotation_deg: lerp_f32(a.rotation_deg, b.rotation_deg, eased),
                stroke_progress: lerp_f32(a.stroke_progress, b.stroke_progress, eased),
                opacity: lerp_f32(a.opacity, b.opacity, eased),
                mirror_in_rtl: spec.mirror_in_rtl,
                viewbox: spec.viewbox,
                strokes: spec.strokes,
            };
        }
    }

    MicroIconFrame {
        kind: icon,
        scale: last.scale,
        rotation_deg: last.rotation_deg,
        stroke_progress: last.stroke_progress,
        opacity: last.opacity,
        mirror_in_rtl: spec.mirror_in_rtl,
        viewbox: spec.viewbox,
        strokes: spec.strokes,
    }
}

#[inline]
fn lerp_f32(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_terminal_at_fps(icon: MicroIconKind, fps: f64, total_ms: f64) -> [u8; 17] {
        let step_ms = 1000.0 / fps;
        let mut t = 0.0;
        while t < total_ms {
            let _ = evaluate_micro_icon(icon, t);
            t += step_ms;
        }
        evaluate_micro_icon(icon, total_ms).to_bytes()
    }

    #[test]
    fn all_five_micro_icons_have_bitwise_identical_terminal_frames_across_four_fps() {
        for icon in MicroIconKind::ALL {
            let total_ms = micro_icon_spec(icon).duration_ms + 40.0;
            let baseline = sample_terminal_at_fps(icon, 60.0, total_ms);
            for fps in [120.0, 24.0, 7.0] {
                assert_eq!(
                    sample_terminal_at_fps(icon, fps, total_ms),
                    baseline,
                    "terminal frame mismatch for {:?} at {fps} fps",
                    icon
                );
            }
        }
    }

    #[test]
    fn directional_micro_icons_satisfy_rtl_horizontal_mirror_invariant() {
        for icon in [MicroIconKind::Explorer, MicroIconKind::Search] {
            let frame = evaluate_micro_icon(icon, 300.0);
            assert!(frame.mirror_in_rtl);
            for idx in 0..frame.strokes.len() {
                let (ltr_x, ltr_w) = frame.stroke_horizontal_bounds(idx, Direction::Ltr);
                let (rtl_x, rtl_w) = frame.stroke_horizontal_bounds(idx, Direction::Rtl);
                assert!((ltr_w - rtl_w).abs() < 1e-4, "width changed in RTL");
                assert!(
                    ((rtl_x + rtl_w) - (frame.viewbox - ltr_x)).abs() < 1e-4,
                    "RTL mirror invariant violated for {:?} stroke {idx}: rtl_x={rtl_x}, w={rtl_w}, ltr_x={ltr_x}",
                    icon
                );
            }
        }
    }
}
