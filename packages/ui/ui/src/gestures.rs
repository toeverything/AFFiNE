//! Portable touch gesture recognizer driven strictly by scheduler timestamps.
//!
//! Zero wall-clock reads: every transition is a deterministic function of
//! `TouchEvent` inputs and monotonic millisecond timestamps (`now_ms: u64`).

use crate::{Direction, Pixels, Point, TouchEvent, TouchId, TouchPhase, point, px};
use smallvec::SmallVec;

/// Lifecycle phase of a direction-aware edge back gesture.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BackPhase {
    /// Touch began in the logical inline-start edge zone and crossed pan slop inward.
    Start,
    /// Normalized back progress in `0.0..=1.0`.
    Progress(f32),
    /// Gesture was cancelled or released below commit criteria.
    Cancel,
    /// Gesture reached commit distance or inward velocity on release.
    Commit,
}

/// Locked scroll axis for single-finger pans.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScrollAxis {
    Horizontal,
    Vertical,
}

/// Nested scroll container handoff target for a single-finger pan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PanHandoff {
    /// Current scroll container consumes the pan.
    Local,
    /// Current scroll container cannot scroll on the locked axis; hand off to parent.
    Parent,
}

/// High-level gesture emitted by [`TouchGestureRecognizer`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TouchGesture {
    Tap {
        position: Point<Pixels>,
        count: u32,
    },
    DoubleTap {
        position: Point<Pixels>,
    },
    LongPress {
        position: Point<Pixels>,
    },
    LongPressDrag {
        position: Point<Pixels>,
    },
    LongPressEnd {
        position: Point<Pixels>,
    },
    PanStart {
        origin: Point<Pixels>,
        axis: Option<ScrollAxis>,
    },
    PanUpdate {
        position: Point<Pixels>,
        delta: Point<Pixels>,
        velocity: Point<Pixels>,
        axis: Option<ScrollAxis>,
        handoff: PanHandoff,
    },
    PanEnd {
        position: Point<Pixels>,
        velocity: Point<Pixels>,
        axis: Option<ScrollAxis>,
        cancelled: bool,
    },
    PinchStart {
        centroid: Point<Pixels>,
        distance: f32,
    },
    PinchUpdate {
        centroid: Point<Pixels>,
        translation: Point<Pixels>,
        scale_delta: f32,
        total_scale: f32,
    },
    PinchEnd {
        centroid: Point<Pixels>,
        total_scale: f32,
    },
    EdgeBack(BackPhase),
}

/// Threshold configuration for [`TouchGestureRecognizer`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TouchGestureConfig {
    pub tap_slop_px: f32,
    pub double_tap_window_ms: u64,
    pub double_tap_slop_px: f32,
    pub long_press_duration_ms: u64,
    pub velocity_stale_ms: u64,
    pub edge_back_zone_px: f32,
    pub edge_back_commit_distance_px: f32,
    pub edge_back_commit_progress: f32,
    pub edge_back_commit_velocity_px_per_sec: f32,
    pub axis_lock_ratio: f32,
}

impl Default for TouchGestureConfig {
    fn default() -> Self {
        Self {
            tap_slop_px: 10.0,
            double_tap_window_ms: 300,
            double_tap_slop_px: 24.0,
            long_press_duration_ms: 500,
            velocity_stale_ms: 80,
            edge_back_zone_px: 24.0,
            edge_back_commit_distance_px: 96.0,
            edge_back_commit_progress: 0.45,
            edge_back_commit_velocity_px_per_sec: 420.0,
            axis_lock_ratio: 1.25,
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct ActiveTouch {
    id: TouchId,
    start_pos: Point<Pixels>,
    last_pos: Point<Pixels>,
    start_ms: u64,
    last_ms: u64,
    velocity: Point<Pixels>,
}

#[derive(Clone, Copy, Debug)]
struct LastTap {
    position: Point<Pixels>,
    end_ms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum RecognizerMode {
    Idle,
    PossibleTap {
        edge_candidate: bool,
        long_press_fired: bool,
    },
    Panning {
        axis: Option<ScrollAxis>,
    },
    EdgeBack {
        direction: Direction,
        progress: f32,
    },
    Pinching {
        initial_distance: f32,
        last_distance: f32,
        last_centroid: Point<Pixels>,
        total_scale: f32,
    },
}

/// Deterministic touch gesture recognizer driven by scheduler timestamps (`now_ms`).
#[derive(Clone, Debug)]
pub struct TouchGestureRecognizer {
    config: TouchGestureConfig,
    touches: SmallVec<[ActiveTouch; 4]>,
    mode: RecognizerMode,
    last_tap: Option<LastTap>,
}

impl Default for TouchGestureRecognizer {
    fn default() -> Self {
        Self::new(TouchGestureConfig::default())
    }
}

impl TouchGestureRecognizer {
    pub fn new(config: TouchGestureConfig) -> Self {
        Self {
            config,
            touches: SmallVec::new(),
            mode: RecognizerMode::Idle,
            last_tap: None,
        }
    }

    /// Returns the active threshold configuration.
    #[inline]
    pub const fn config(&self) -> TouchGestureConfig {
        self.config
    }

    /// Number of currently active touch points.
    #[inline]
    pub fn active_touch_count(&self) -> usize {
        self.touches.len()
    }

    /// Clears all active touch tracking and resets to idle.
    pub fn reset(&mut self) {
        self.touches.clear();
        self.mode = RecognizerMode::Idle;
    }

    /// Feeds a [`TouchEvent`] at scheduler timestamp `now_ms` with both scroll axes enabled.
    pub fn feed(
        &mut self,
        event: &TouchEvent,
        now_ms: u64,
        direction: Direction,
        viewport_width: Pixels,
    ) -> SmallVec<[TouchGesture; 2]> {
        self.feed_with_scroll_bounds(event, now_ms, direction, viewport_width, true, true)
    }

    /// Feeds a [`TouchEvent`] at scheduler timestamp `now_ms` with explicit nested scroll capability.
    pub fn feed_with_scroll_bounds(
        &mut self,
        event: &TouchEvent,
        now_ms: u64,
        direction: Direction,
        viewport_width: Pixels,
        can_scroll_horizontal: bool,
        can_scroll_vertical: bool,
    ) -> SmallVec<[TouchGesture; 2]> {
        let mut out = SmallVec::new();
        match event.phase {
            TouchPhase::Started => {
                self.touches.retain(|t| t.id != event.id);
                self.touches.push(ActiveTouch {
                    id: event.id,
                    start_pos: event.position,
                    last_pos: event.position,
                    start_ms: now_ms,
                    last_ms: now_ms,
                    velocity: Point::default(),
                });

                if self.touches.len() == 1 {
                    let edge_candidate = in_inline_start_edge(
                        event.position.x,
                        direction,
                        viewport_width,
                        self.config.edge_back_zone_px,
                    );
                    self.mode = RecognizerMode::PossibleTap {
                        edge_candidate,
                        long_press_fired: false,
                    };
                } else if self.touches.len() == 2 {
                    match self.mode {
                        RecognizerMode::EdgeBack { .. } => {
                            out.push(TouchGesture::EdgeBack(BackPhase::Cancel));
                        }
                        RecognizerMode::Panning { axis } => {
                            out.push(TouchGesture::PanEnd {
                                position: self.touches[0].last_pos,
                                velocity: Point::default(),
                                axis,
                                cancelled: true,
                            });
                        }
                        _ => {}
                    }
                    let (centroid, distance) =
                        pinch_metrics(self.touches[0].last_pos, self.touches[1].last_pos);
                    let safe_dist = distance.max(1.0);
                    self.mode = RecognizerMode::Pinching {
                        initial_distance: safe_dist,
                        last_distance: safe_dist,
                        last_centroid: centroid,
                        total_scale: 1.0,
                    };
                    out.push(TouchGesture::PinchStart {
                        centroid,
                        distance: safe_dist,
                    });
                }
            }
            TouchPhase::Moved => {
                let Some(idx) = self.touches.iter().position(|t| t.id == event.id) else {
                    return out;
                };
                let prev = self.touches[idx];
                let delta = point(
                    event.position.x - prev.last_pos.x,
                    event.position.y - prev.last_pos.y,
                );
                let dt_ms = now_ms.saturating_sub(prev.last_ms);
                let velocity = if dt_ms > 0 {
                    let scale = 1000.0 / dt_ms as f32;
                    point(
                        px(f32::from(delta.x) * scale),
                        px(f32::from(delta.y) * scale),
                    )
                } else {
                    prev.velocity
                };
                self.touches[idx].last_pos = event.position;
                self.touches[idx].last_ms = now_ms;
                self.touches[idx].velocity = velocity;

                match self.mode {
                    RecognizerMode::PossibleTap {
                        edge_candidate,
                        long_press_fired,
                    } => {
                        if long_press_fired {
                            out.push(TouchGesture::LongPressDrag {
                                position: event.position,
                            });
                        } else {
                            let total_dx = f32::from(event.position.x - prev.start_pos.x);
                            let total_dy = f32::from(event.position.y - prev.start_pos.y);
                            let dist = total_dx.hypot(total_dy);
                            if dist > self.config.tap_slop_px {
                                let inward_dx = match direction {
                                    Direction::Ltr => total_dx,
                                    Direction::Rtl => -total_dx,
                                };
                                if edge_candidate
                                    && inward_dx > 0.0
                                    && inward_dx.abs()
                                        >= total_dy.abs() * self.config.axis_lock_ratio
                                {
                                    let progress = (inward_dx
                                        / self.config.edge_back_commit_distance_px)
                                        .clamp(0.0, 1.0);
                                    self.mode = RecognizerMode::EdgeBack {
                                        direction,
                                        progress,
                                    };
                                    out.push(TouchGesture::EdgeBack(BackPhase::Start));
                                    out.push(TouchGesture::EdgeBack(BackPhase::Progress(progress)));
                                } else {
                                    let axis =
                                        lock_axis(total_dx, total_dy, self.config.axis_lock_ratio);
                                    let handoff = resolve_handoff(
                                        axis,
                                        can_scroll_horizontal,
                                        can_scroll_vertical,
                                    );
                                    self.mode = RecognizerMode::Panning { axis };
                                    out.push(TouchGesture::PanStart {
                                        origin: prev.start_pos,
                                        axis,
                                    });
                                    out.push(TouchGesture::PanUpdate {
                                        position: event.position,
                                        delta,
                                        velocity,
                                        axis,
                                        handoff,
                                    });
                                }
                            } else if now_ms.saturating_sub(prev.start_ms)
                                >= self.config.long_press_duration_ms
                            {
                                self.mode = RecognizerMode::PossibleTap {
                                    edge_candidate,
                                    long_press_fired: true,
                                };
                                out.push(TouchGesture::LongPress {
                                    position: event.position,
                                });
                            }
                        }
                    }
                    RecognizerMode::Panning { axis } => {
                        let handoff =
                            resolve_handoff(axis, can_scroll_horizontal, can_scroll_vertical);
                        out.push(TouchGesture::PanUpdate {
                            position: event.position,
                            delta,
                            velocity,
                            axis,
                            handoff,
                        });
                    }
                    RecognizerMode::EdgeBack { direction: dir, .. } => {
                        let total_dx = f32::from(event.position.x - prev.start_pos.x);
                        let inward_dx = match dir {
                            Direction::Ltr => total_dx,
                            Direction::Rtl => -total_dx,
                        };
                        let progress =
                            (inward_dx / self.config.edge_back_commit_distance_px).clamp(0.0, 1.0);
                        self.mode = RecognizerMode::EdgeBack {
                            direction: dir,
                            progress,
                        };
                        out.push(TouchGesture::EdgeBack(BackPhase::Progress(progress)));
                    }
                    RecognizerMode::Pinching {
                        initial_distance,
                        last_distance,
                        last_centroid,
                        ..
                    } => {
                        if self.touches.len() >= 2 {
                            let (centroid, distance) =
                                pinch_metrics(self.touches[0].last_pos, self.touches[1].last_pos);
                            let safe_dist = distance.max(1.0);
                            let scale_delta = safe_dist / last_distance.max(1.0);
                            let total_scale = safe_dist / initial_distance.max(1.0);
                            let translation =
                                point(centroid.x - last_centroid.x, centroid.y - last_centroid.y);
                            self.mode = RecognizerMode::Pinching {
                                initial_distance,
                                last_distance: safe_dist,
                                last_centroid: centroid,
                                total_scale,
                            };
                            out.push(TouchGesture::PinchUpdate {
                                centroid,
                                translation,
                                scale_delta,
                                total_scale,
                            });
                        }
                    }
                    RecognizerMode::Idle => {}
                }
            }
            TouchPhase::Ended => {
                let removed = self
                    .touches
                    .iter()
                    .position(|t| t.id == event.id)
                    .map(|idx| self.touches.remove(idx));
                let Some(touch) = removed else {
                    return out;
                };
                let release_velocity =
                    if now_ms.saturating_sub(touch.last_ms) > self.config.velocity_stale_ms {
                        Point::default()
                    } else {
                        touch.velocity
                    };

                match self.mode {
                    RecognizerMode::PossibleTap {
                        long_press_fired, ..
                    } => {
                        if long_press_fired {
                            out.push(TouchGesture::LongPressEnd {
                                position: event.position,
                            });
                            self.mode = RecognizerMode::Idle;
                        } else {
                            let dist = distance_px(touch.start_pos, event.position);
                            let elapsed_long_press = now_ms.saturating_sub(touch.start_ms)
                                >= self.config.long_press_duration_ms;
                            if elapsed_long_press && dist <= self.config.tap_slop_px {
                                out.push(TouchGesture::LongPress {
                                    position: touch.start_pos,
                                });
                                out.push(TouchGesture::LongPressEnd {
                                    position: event.position,
                                });
                            } else if !elapsed_long_press && dist <= self.config.tap_slop_px {
                                let is_double = self.last_tap.is_some_and(|prev_tap| {
                                    now_ms.saturating_sub(prev_tap.end_ms)
                                        <= self.config.double_tap_window_ms
                                        && distance_px(prev_tap.position, event.position)
                                            <= self.config.double_tap_slop_px
                                });
                                if is_double {
                                    self.last_tap = None;
                                    out.push(TouchGesture::Tap {
                                        position: event.position,
                                        count: 2,
                                    });
                                    out.push(TouchGesture::DoubleTap {
                                        position: event.position,
                                    });
                                } else {
                                    self.last_tap = Some(LastTap {
                                        position: event.position,
                                        end_ms: now_ms,
                                    });
                                    out.push(TouchGesture::Tap {
                                        position: event.position,
                                        count: 1,
                                    });
                                }
                            }
                            self.mode = RecognizerMode::Idle;
                        }
                    }
                    RecognizerMode::Panning { axis } => {
                        out.push(TouchGesture::PanEnd {
                            position: event.position,
                            velocity: release_velocity,
                            axis,
                            cancelled: false,
                        });
                        if self.touches.is_empty() {
                            self.mode = RecognizerMode::Idle;
                        }
                    }
                    RecognizerMode::EdgeBack {
                        direction: dir,
                        progress,
                    } => {
                        let inward_vel = match dir {
                            Direction::Ltr => f32::from(release_velocity.x),
                            Direction::Rtl => -f32::from(release_velocity.x),
                        };
                        let commit = progress >= self.config.edge_back_commit_progress
                            || inward_vel >= self.config.edge_back_commit_velocity_px_per_sec;
                        out.push(TouchGesture::EdgeBack(if commit {
                            BackPhase::Commit
                        } else {
                            BackPhase::Cancel
                        }));
                        self.mode = RecognizerMode::Idle;
                    }
                    RecognizerMode::Pinching {
                        last_centroid,
                        total_scale,
                        ..
                    } => {
                        if self.touches.len() < 2 {
                            out.push(TouchGesture::PinchEnd {
                                centroid: last_centroid,
                                total_scale,
                            });
                            if let Some(rem) = self.touches.first_mut() {
                                rem.start_pos = rem.last_pos;
                                rem.start_ms = now_ms;
                                rem.last_ms = now_ms;
                                rem.velocity = Point::default();
                                self.mode = RecognizerMode::Panning { axis: None };
                                out.push(TouchGesture::PanStart {
                                    origin: rem.last_pos,
                                    axis: None,
                                });
                            } else {
                                self.mode = RecognizerMode::Idle;
                            }
                        } else {
                            // Re-anchor remaining two fingers so scale does not jump.
                            let (centroid, distance) =
                                pinch_metrics(self.touches[0].last_pos, self.touches[1].last_pos);
                            let safe_dist = distance.max(1.0);
                            self.mode = RecognizerMode::Pinching {
                                initial_distance: (safe_dist / total_scale.max(1e-4)).max(1.0),
                                last_distance: safe_dist,
                                last_centroid: centroid,
                                total_scale,
                            };
                        }
                    }
                    RecognizerMode::Idle => {}
                }
            }
            TouchPhase::Cancelled => {
                self.touches.retain(|t| t.id != event.id);
                match self.mode {
                    RecognizerMode::EdgeBack { .. } => {
                        out.push(TouchGesture::EdgeBack(BackPhase::Cancel));
                        self.mode = RecognizerMode::Idle;
                    }
                    RecognizerMode::Pinching {
                        last_centroid,
                        total_scale,
                        ..
                    } => {
                        // Transition to Idle immediately so cancelling the second finger
                        // never emits a duplicate PinchEnd.
                        out.push(TouchGesture::PinchEnd {
                            centroid: last_centroid,
                            total_scale,
                        });
                        self.mode = RecognizerMode::Idle;
                    }
                    RecognizerMode::Panning { axis } => {
                        out.push(TouchGesture::PanEnd {
                            position: event.position,
                            velocity: Point::default(),
                            axis,
                            cancelled: true,
                        });
                        self.mode = RecognizerMode::Idle;
                    }
                    RecognizerMode::PossibleTap { .. } => {
                        self.mode = RecognizerMode::Idle;
                    }
                    RecognizerMode::Idle => {}
                }
            }
        }
        out
    }

    /// Evaluates time-based gestures (such as `LongPress`) at scheduler timestamp `now_ms`.
    pub fn tick(&mut self, now_ms: u64) -> SmallVec<[TouchGesture; 2]> {
        let mut out = SmallVec::new();
        if let RecognizerMode::PossibleTap {
            edge_candidate,
            long_press_fired: false,
        } = self.mode
            && self.touches.len() == 1
        {
            let touch = self.touches[0];
            if now_ms.saturating_sub(touch.start_ms) >= self.config.long_press_duration_ms
                && distance_px(touch.start_pos, touch.last_pos) <= self.config.tap_slop_px
            {
                self.mode = RecognizerMode::PossibleTap {
                    edge_candidate,
                    long_press_fired: true,
                };
                out.push(TouchGesture::LongPress {
                    position: touch.last_pos,
                });
            }
        }
        out
    }
}

#[inline]
fn distance_px(a: Point<Pixels>, b: Point<Pixels>) -> f32 {
    let dx = f32::from(b.x - a.x);
    let dy = f32::from(b.y - a.y);
    dx.hypot(dy)
}

#[inline]
fn pinch_metrics(a: Point<Pixels>, b: Point<Pixels>) -> (Point<Pixels>, f32) {
    let centroid = point(
        px((f32::from(a.x) + f32::from(b.x)) * 0.5),
        px((f32::from(a.y) + f32::from(b.y)) * 0.5),
    );
    (centroid, distance_px(a, b))
}

#[inline]
fn in_inline_start_edge(
    x: Pixels,
    direction: Direction,
    viewport_width: Pixels,
    zone_px: f32,
) -> bool {
    match direction {
        Direction::Ltr => f32::from(x) <= zone_px,
        Direction::Rtl => f32::from(viewport_width - x) <= zone_px,
    }
}

#[inline]
fn lock_axis(dx: f32, dy: f32, ratio: f32) -> Option<ScrollAxis> {
    let ax = dx.abs();
    let ay = dy.abs();
    if ax >= ay * ratio {
        Some(ScrollAxis::Horizontal)
    } else if ay >= ax * ratio {
        Some(ScrollAxis::Vertical)
    } else {
        None
    }
}

#[inline]
fn resolve_handoff(
    axis: Option<ScrollAxis>,
    can_scroll_horizontal: bool,
    can_scroll_vertical: bool,
) -> PanHandoff {
    match axis {
        Some(ScrollAxis::Horizontal) if !can_scroll_horizontal => PanHandoff::Parent,
        Some(ScrollAxis::Vertical) if !can_scroll_vertical => PanHandoff::Parent,
        _ => PanHandoff::Local,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(id: u64, phase: TouchPhase, x: f32, y: f32) -> TouchEvent {
        TouchEvent {
            id: TouchId(id),
            phase,
            position: point(px(x), px(y)),
            predicted_position: None,
            force: None,
        }
    }

    #[test]
    fn touch_gesture_recognizer_table_driven_scenarios() {
        let vw = px(390.0);
        let f = |r: &mut TouchGestureRecognizer, id, ph, x, y, t| {
            r.feed(&touch(id, ph, x, y), t, Direction::Ltr, vw)
        };
        let mut rec = TouchGestureRecognizer::default();
        // 1. Tap (including 350ms release below 500ms long-press threshold, no dead zone) & DoubleTap.
        assert!(f(&mut rec, 1, TouchPhase::Started, 100.0, 200.0, 0).is_empty());
        assert_eq!(
            f(&mut rec, 1, TouchPhase::Ended, 102.0, 201.0, 350).as_slice(),
            &[TouchGesture::Tap {
                position: point(px(102.0), px(201.0)),
                count: 1
            }]
        );
        assert!(f(&mut rec, 2, TouchPhase::Started, 104.0, 202.0, 450).is_empty());
        assert_eq!(
            f(&mut rec, 2, TouchPhase::Ended, 105.0, 202.0, 500).as_slice(),
            &[
                TouchGesture::Tap {
                    position: point(px(105.0), px(202.0)),
                    count: 2
                },
                TouchGesture::DoubleTap {
                    position: point(px(105.0), px(202.0))
                },
            ]
        );

        // 2. LongPress via scheduler tick (zero wall clock).
        let mut lp = TouchGestureRecognizer::default();
        f(&mut lp, 3, TouchPhase::Started, 120.0, 120.0, 1000);
        assert!(lp.tick(1499).is_empty());
        assert_eq!(
            lp.tick(1500).as_slice(),
            &[TouchGesture::LongPress {
                position: point(px(120.0), px(120.0))
            }]
        );
        let lp_end = f(&mut lp, 3, TouchPhase::Ended, 120.0, 120.0, 1600);
        assert_eq!(
            lp_end.as_slice(),
            &[TouchGesture::LongPressEnd {
                position: point(px(120.0), px(120.0))
            }]
        );

        // 3. Nested pan handoff + Panning -> Pinching emits PanEnd(cancelled: true) first.
        let mut pan = TouchGestureRecognizer::default();
        let fb = |r: &mut TouchGestureRecognizer, ph, x, y, t| {
            r.feed_with_scroll_bounds(&touch(4, ph, x, y), t, Direction::Ltr, vw, false, true)
        };
        fb(&mut pan, TouchPhase::Started, 100.0, 100.0, 0);
        assert!(matches!(
            fb(&mut pan, TouchPhase::Moved, 130.0, 102.0, 16).as_slice(),
            [
                TouchGesture::PanStart {
                    axis: Some(ScrollAxis::Horizontal),
                    ..
                },
                TouchGesture::PanUpdate {
                    axis: Some(ScrollAxis::Horizontal),
                    handoff: PanHandoff::Parent,
                    ..
                }
            ]
        ));
        assert!(matches!(
            f(&mut pan, 5, TouchPhase::Started, 230.0, 102.0, 24).as_slice(),
            [
                TouchGesture::PanEnd {
                    cancelled: true,
                    ..
                },
                TouchGesture::PinchStart { .. }
            ]
        ));
        // 4. Double-finger cancel deduplication: emits PinchEnd exactly once.
        assert!(matches!(
            f(&mut pan, 4, TouchPhase::Cancelled, 130.0, 102.0, 32).as_slice(),
            [TouchGesture::PinchEnd { .. }]
        ));
        assert!(f(&mut pan, 5, TouchPhase::Cancelled, 230.0, 102.0, 32).is_empty());

        // 5. Stale velocity zeroed when finger pauses > 80ms before lifting.
        let mut pause_pan = TouchGestureRecognizer::default();
        f(&mut pause_pan, 6, TouchPhase::Started, 50.0, 50.0, 0);
        f(&mut pause_pan, 6, TouchPhase::Moved, 120.0, 50.0, 16);
        assert!(matches!(
            f(&mut pause_pan, 6, TouchPhase::Ended, 120.0, 50.0, 150).as_slice(),
            [TouchGesture::PanEnd { velocity, cancelled: false, .. }] if *velocity == Point::default()
        ));

        // 6. Three-finger pinch lifting one finger re-anchors without scale jump.
        let mut pinch = TouchGestureRecognizer::default();
        f(&mut pinch, 10, TouchPhase::Started, 100.0, 200.0, 0);
        f(&mut pinch, 11, TouchPhase::Started, 200.0, 200.0, 10);
        f(&mut pinch, 11, TouchPhase::Moved, 300.0, 200.0, 26);
        f(&mut pinch, 12, TouchPhase::Started, 150.0, 300.0, 30);
        // Lift finger 11; remaining fingers 10 & 12 re-anchor at total_scale == 2.0.
        assert!(f(&mut pinch, 11, TouchPhase::Ended, 300.0, 200.0, 40).is_empty());
        match f(&mut pinch, 12, TouchPhase::Moved, 150.0, 300.0, 50)[0] {
            TouchGesture::PinchUpdate {
                scale_delta,
                total_scale,
                ..
            } => {
                assert!((scale_delta - 1.0).abs() < 1e-4);
                assert!((total_scale - 2.0).abs() < 1e-4);
            }
            other => panic!("expected PinchUpdate after 3-finger re-anchor, got {other:?}"),
        }

        // 7. Direction-aware edge back gesture (LTR left edge & RTL right edge).
        let edge_cases = [
            (Direction::Ltr, 8.0_f32, 70.0_f32, true),
            (Direction::Ltr, 8.0_f32, 26.0_f32, false),
            (Direction::Rtl, 382.0_f32, 320.0_f32, true),
            (Direction::Rtl, 382.0_f32, 364.0_f32, false),
        ];
        for (dir, start_x, end_x, expect_commit) in edge_cases {
            let mut back = TouchGestureRecognizer::default();
            back.feed(&touch(20, TouchPhase::Started, start_x, 200.0), 0, dir, vw);
            let moved = back.feed(&touch(20, TouchPhase::Moved, end_x, 200.0), 200, dir, vw);
            assert!(matches!(moved[0], TouchGesture::EdgeBack(BackPhase::Start)));
            assert!(matches!(
                moved[1],
                TouchGesture::EdgeBack(BackPhase::Progress(_))
            ));
            let ended = back.feed(&touch(20, TouchPhase::Ended, end_x, 200.0), 260, dir, vw);
            let expected = if expect_commit {
                BackPhase::Commit
            } else {
                BackPhase::Cancel
            };
            assert_eq!(
                ended.as_slice(),
                &[TouchGesture::EdgeBack(expected)],
                "dir={dir:?}"
            );
        }
    }
}
