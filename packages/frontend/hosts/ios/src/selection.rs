use crate::{AffineUtf16Range, AffineWindowInsets};

/// C-ABI 2D point in logical points matching `AffinePoint` in `include/affine_mobile_host.h`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffinePoint {
    pub x: f32,
    pub y: f32,
}

/// C-ABI rectangle in logical points matching `AffineRect` in `include/affine_mobile_host.h`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffineRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl AffineRect {
    pub fn sanitized(self) -> Self {
        Self {
            x: sanitize_f32(self.x),
            y: sanitize_f32(self.y),
            width: sanitize_f32(self.width).max(0.0),
            height: sanitize_f32(self.height).max(0.0),
        }
    }

    pub fn right(self) -> f32 {
        self.x + self.width
    }

    pub fn bottom(self) -> f32 {
        self.y + self.height
    }
}

/// Which teardrop handle is active or hit-tested (`0 = none, 1 = start, 2 = end`).
#[repr(u8)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum AffineSelectionHandleKind {
    #[default]
    None = 0,
    Start = 1,
    End = 2,
}

impl AffineSelectionHandleKind {
    pub fn from_u8(raw: u8) -> Self {
        match raw {
            1 => Self::Start,
            2 => Self::End,
            _ => Self::None,
        }
    }
}

/// Writing direction for teardrop handle horizontal bias (`0 = LTR, 1 = RTL`).
#[repr(u8)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum AffineWritingDirection {
    #[default]
    Ltr = 0,
    Rtl = 1,
}

impl AffineWritingDirection {
    pub fn from_u8(raw: u8) -> Self {
        match raw {
            1 => Self::Rtl,
            _ => Self::Ltr,
        }
    }
}

/// Computed layout for one teardrop selection handle.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffineTeardropHandleLayout {
    pub visible: bool,
    pub drop_above: bool,
    pub stem_x: f32,
    pub stem_top_y: f32,
    pub stem_bottom_y: f32,
    pub stem_width: f32,
    pub drop_center_x: f32,
    pub drop_center_y: f32,
    pub drop_radius: f32,
    pub drop_offset_x: f32,
}

/// Computed layout for the circular magnifier loupe shown during handle drags.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffineLoupeLayout {
    pub visible: bool,
    pub center_x: f32,
    pub center_y: f32,
    pub focus_x: f32,
    pub focus_y: f32,
    pub diameter: f32,
    pub zoom_scale: f32,
}

/// Full deterministic selection overlay snapshot consumed by Swift `SelectionOverlayView`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffineSelectionOverlayState {
    pub has_selection: bool,
    pub is_collapsed: bool,
    pub is_rtl: bool,
    pub active_drag_handle: u8,
    pub show_floating_menu: bool,
    pub range: AffineUtf16Range,
    pub drag_probe_point: AffinePoint,
    pub start_handle: AffineTeardropHandleLayout,
    pub end_handle: AffineTeardropHandleLayout,
    pub loupe: AffineLoupeLayout,
    pub menu_anchor_rect: AffineRect,
}

/// Deterministic selection handle geometry and drag state machine.
#[derive(Debug, Clone, Default)]
pub struct SelectionOverlayController {
    has_selection: bool,
    range: AffineUtf16Range,
    writing_direction: AffineWritingDirection,
    start_caret: AffineRect,
    end_caret: AffineRect,
    active_drag: AffineSelectionHandleKind,
    drag_anchor_utf16: Option<u32>,
    drag_touch_point: AffinePoint,
    grab_offset: AffinePoint,
}

impl SelectionOverlayController {
    pub const STEM_WIDTH_PT: f32 = 2.0;
    pub const DROP_RADIUS_PT: f32 = 6.0;
    pub const DROP_BIAS_PT: f32 = 3.0;
    pub const LOUPE_DIAMETER_PT: f32 = 88.0;
    pub const LOUPE_ZOOM_SCALE: f32 = 1.5;
    pub const LOUPE_VERTICAL_OFFSET_PT: f32 = 68.0;
    pub const MIN_TOUCH_HIT_RADIUS_PT: f32 = 22.0;
    pub const VIEWPORT_MARGIN_PT: f32 = 4.0;

    pub fn set_selection(
        &mut self,
        start_caret: AffineRect,
        end_caret: AffineRect,
        range: AffineUtf16Range,
        writing_direction: AffineWritingDirection,
    ) {
        self.has_selection = true;
        self.range = range;
        self.writing_direction = writing_direction;
        self.start_caret = start_caret.sanitized();
        self.end_caret = end_caret.sanitized();
        if range.length == 0 {
            self.active_drag = AffineSelectionHandleKind::None;
        }
    }

    pub fn clear(&mut self) {
        self.has_selection = false;
        self.range = AffineUtf16Range::default();
        self.start_caret = AffineRect::default();
        self.end_caret = AffineRect::default();
        self.active_drag = AffineSelectionHandleKind::None;
        self.drag_anchor_utf16 = None;
        self.drag_touch_point = AffinePoint::default();
        self.grab_offset = AffinePoint::default();
    }

    pub fn active_drag_handle(&self) -> AffineSelectionHandleKind {
        self.active_drag
    }

    pub fn drag_anchor_utf16(&self) -> Option<u32> {
        self.drag_anchor_utf16
    }

    pub fn hit_test_handle(
        &self,
        point: AffinePoint,
        hit_radius_pt: f32,
        viewport_w: f32,
        viewport_h: f32,
        insets: AffineWindowInsets,
    ) -> AffineSelectionHandleKind {
        let state = self.layout(viewport_w, viewport_h, insets);
        if !state.has_selection || state.is_collapsed {
            return AffineSelectionHandleKind::None;
        }
        let radius = sanitize_f32(hit_radius_pt).max(Self::MIN_TOUCH_HIT_RADIUS_PT);
        let px = sanitize_f32(point.x);
        let py = sanitize_f32(point.y);
        let d_start = distance_to_handle(px, py, state.start_handle);
        let d_end = distance_to_handle(px, py, state.end_handle);

        match (d_start <= radius, d_end <= radius) {
            (true, true) => {
                if d_start <= d_end {
                    AffineSelectionHandleKind::Start
                } else {
                    AffineSelectionHandleKind::End
                }
            }
            (true, false) => AffineSelectionHandleKind::Start,
            (false, true) => AffineSelectionHandleKind::End,
            (false, false) => AffineSelectionHandleKind::None,
        }
    }

    pub fn begin_drag(
        &mut self,
        handle: AffineSelectionHandleKind,
        touch_point: AffinePoint,
    ) -> bool {
        if !self.has_selection || self.range.length == 0 {
            return false;
        }
        let active_caret = match handle {
            AffineSelectionHandleKind::Start => self.start_caret,
            AffineSelectionHandleKind::End => self.end_caret,
            AffineSelectionHandleKind::None => return false,
        };
        let tx = sanitize_f32(touch_point.x);
        let ty = sanitize_f32(touch_point.y);
        let caret_ref_x = active_caret.x + active_caret.width * 0.5;
        let caret_ref_y = active_caret.y + active_caret.height * 0.5;
        self.active_drag = handle;
        self.drag_anchor_utf16 = Some(match handle {
            AffineSelectionHandleKind::Start => {
                self.range.location.saturating_add(self.range.length)
            }
            AffineSelectionHandleKind::End => self.range.location,
            AffineSelectionHandleKind::None => return false,
        });
        self.drag_touch_point = AffinePoint { x: tx, y: ty };
        self.grab_offset = AffinePoint {
            x: caret_ref_x - tx,
            y: caret_ref_y - ty,
        };
        true
    }

    /// Compute the caret-aligned probe point (`touch + grab_offset`) for an active drag,
    /// ensuring a 0pt move on the teardrop center causes zero vertical or horizontal line jump.
    pub fn drag_probe_point_for(&self, touch_point: AffinePoint) -> AffinePoint {
        let tx = sanitize_f32(touch_point.x);
        let ty = sanitize_f32(touch_point.y);
        if self.active_drag == AffineSelectionHandleKind::None {
            return AffinePoint { x: tx, y: ty };
        }
        AffinePoint {
            x: sanitize_f32(tx + self.grab_offset.x),
            y: sanitize_f32(ty + self.grab_offset.y),
        }
    }

    /// Update an in-progress drag from authoritative UTF-16 anchor/target offsets and
    /// caller-supplied shaped start/end caret rects, without guessing crossover from
    /// 2D caret coordinates (safe for mixed BiDi runs and vertical finger drift).
    pub fn apply_text_drag_endpoints(
        &mut self,
        touch_point: AffinePoint,
        target_offset: u32,
        start_caret: AffineRect,
        end_caret: AffineRect,
    ) -> bool {
        if self.active_drag == AffineSelectionHandleKind::None {
            return false;
        }
        let anchor = self
            .drag_anchor_utf16
            .unwrap_or_else(|| match self.active_drag {
                AffineSelectionHandleKind::Start => {
                    self.range.location.saturating_add(self.range.length)
                }
                AffineSelectionHandleKind::End => self.range.location,
                AffineSelectionHandleKind::None => 0,
            });
        self.drag_touch_point = AffinePoint {
            x: sanitize_f32(touch_point.x),
            y: sanitize_f32(touch_point.y),
        };
        let new_start = anchor.min(target_offset);
        let new_end = anchor.max(target_offset);
        self.range = AffineUtf16Range {
            location: new_start,
            length: new_end.saturating_sub(new_start),
        };
        self.start_caret = start_caret.sanitized();
        self.end_caret = end_caret.sanitized();
        if target_offset < anchor {
            self.active_drag = AffineSelectionHandleKind::Start;
        } else if target_offset > anchor {
            self.active_drag = AffineSelectionHandleKind::End;
        }
        true
    }

    pub fn end_drag(&mut self) -> bool {
        if self.active_drag == AffineSelectionHandleKind::None {
            return false;
        }
        self.active_drag = AffineSelectionHandleKind::None;
        self.drag_anchor_utf16 = None;
        self.grab_offset = AffinePoint::default();
        if self.range.length == 0 {
            self.clear();
        }
        true
    }

    pub fn layout(
        &self,
        viewport_w: f32,
        viewport_h: f32,
        insets: AffineWindowInsets,
    ) -> AffineSelectionOverlayState {
        let vw = sanitize_f32(viewport_w).max(0.0);
        let vh = sanitize_f32(viewport_h).max(0.0);
        let safe_left = sanitize_f32(insets.safe_left).max(0.0).min(vw);
        let safe_right = sanitize_f32(insets.safe_right).max(0.0).min(vw);
        let safe_top = sanitize_f32(insets.safe_top).max(0.0).min(vh);
        let bottom_inset = sanitize_f32(insets.safe_bottom)
            .max(0.0)
            .max(sanitize_f32(insets.ime_bottom).max(0.0))
            .min(vh);

        let min_x = safe_left;
        let max_x = (vw - safe_right).max(min_x);
        let min_y = safe_top;
        let max_y = (vh - bottom_inset).max(min_y);

        let is_collapsed = !self.has_selection || self.range.length == 0;
        let is_rtl = self.writing_direction == AffineWritingDirection::Rtl;
        let drag_probe_point = if self.active_drag != AffineSelectionHandleKind::None {
            self.drag_probe_point_for(self.drag_touch_point)
        } else {
            AffinePoint::default()
        };
        let loupe = if self.active_drag != AffineSelectionHandleKind::None {
            build_loupe(drag_probe_point, min_x, max_x, min_y, max_y)
        } else {
            AffineLoupeLayout::default()
        };

        if !self.has_selection || is_collapsed {
            let start_handle = if self.has_selection
                && self.active_drag == AffineSelectionHandleKind::Start
            {
                build_teardrop_handle(self.start_caret, true, is_rtl, min_x, max_x, min_y, max_y)
            } else {
                AffineTeardropHandleLayout::default()
            };
            let end_handle =
                if self.has_selection && self.active_drag == AffineSelectionHandleKind::End {
                    build_teardrop_handle(self.end_caret, false, is_rtl, min_x, max_x, min_y, max_y)
                } else {
                    AffineTeardropHandleLayout::default()
                };
            return AffineSelectionOverlayState {
                has_selection: self.has_selection,
                is_collapsed: true,
                is_rtl,
                active_drag_handle: self.active_drag as u8,
                show_floating_menu: false,
                range: self.range,
                drag_probe_point,
                start_handle,
                end_handle,
                loupe,
                menu_anchor_rect: AffineRect::default(),
            };
        }

        let start_handle =
            build_teardrop_handle(self.start_caret, true, is_rtl, min_x, max_x, min_y, max_y);
        let end_handle =
            build_teardrop_handle(self.end_caret, false, is_rtl, min_x, max_x, min_y, max_y);

        let sel_top = self.start_caret.y.min(self.end_caret.y);
        let sel_bottom = self
            .start_caret
            .bottom()
            .max(self.end_caret.bottom())
            .max(sel_top + 1.0);
        let selection_visible = sel_bottom > min_y && sel_top < max_y;
        let show_floating_menu = self.active_drag == AffineSelectionHandleKind::None
            && (start_handle.visible || end_handle.visible || selection_visible);
        let menu_anchor_rect = if show_floating_menu {
            build_menu_anchor_rect(self.start_caret, self.end_caret, min_x, max_x, min_y, max_y)
        } else {
            AffineRect::default()
        };

        AffineSelectionOverlayState {
            has_selection: true,
            is_collapsed: false,
            is_rtl,
            active_drag_handle: self.active_drag as u8,
            show_floating_menu,
            range: self.range,
            drag_probe_point,
            start_handle,
            end_handle,
            loupe,
            menu_anchor_rect,
        }
    }
}

fn build_teardrop_handle(
    caret: AffineRect,
    is_start: bool,
    is_rtl: bool,
    min_x: f32,
    max_x: f32,
    min_y: f32,
    max_y: f32,
) -> AffineTeardropHandleLayout {
    let caret_bottom = caret.bottom().max(caret.y + 1.0);
    let in_x = caret.x >= min_x && caret.x <= max_x;
    let in_y = caret_bottom >= min_y && caret.y <= max_y;
    if !in_x || !in_y {
        return AffineTeardropHandleLayout::default();
    }

    let r = SelectionOverlayController::DROP_RADIUS_PT;
    let bias = SelectionOverlayController::DROP_BIAS_PT;
    let stem_x = clamp_safe(caret.x, min_x, max_x);
    let stem_top_y = clamp_safe(caret.y, min_y, max_y);
    let stem_bottom_y = clamp_safe(caret_bottom, stem_top_y, max_y);

    // Start handle: teardrop above stem, biased left in LTR and right in RTL.
    // End handle: teardrop below stem, biased right in LTR and left in RTL.
    let drop_offset_x = match (is_start, is_rtl) {
        (true, false) | (false, true) => -bias,
        (true, true) | (false, false) => bias,
    };

    let drop_x_min = min_x + r;
    let drop_x_max = max_x - r;
    let drop_center_x = if drop_x_min <= drop_x_max {
        clamp_safe(stem_x + drop_offset_x, drop_x_min, drop_x_max)
    } else {
        (min_x + max_x) * 0.5
    };

    let raw_drop_y = if is_start {
        stem_top_y - r
    } else {
        stem_bottom_y + r
    };
    let drop_y_min = min_y + r;
    let drop_y_max = max_y - r;
    let drop_center_y = if drop_y_min <= drop_y_max {
        clamp_safe(raw_drop_y, drop_y_min, drop_y_max)
    } else {
        (min_y + max_y) * 0.5
    };

    AffineTeardropHandleLayout {
        visible: true,
        drop_above: is_start,
        stem_x,
        stem_top_y,
        stem_bottom_y,
        stem_width: SelectionOverlayController::STEM_WIDTH_PT,
        drop_center_x,
        drop_center_y,
        drop_radius: r,
        drop_offset_x,
    }
}

fn build_loupe(
    touch: AffinePoint,
    min_x: f32,
    max_x: f32,
    min_y: f32,
    max_y: f32,
) -> AffineLoupeLayout {
    let diameter = SelectionOverlayController::LOUPE_DIAMETER_PT;
    let radius = diameter * 0.5;
    let margin = SelectionOverlayController::VIEWPORT_MARGIN_PT;
    let focus_x = clamp_safe(touch.x, min_x, max_x);
    let focus_y = clamp_safe(touch.y, min_y, max_y);

    let cx_min = min_x + radius + margin;
    let cx_max = max_x - radius - margin;
    let center_x = if cx_min <= cx_max {
        clamp_safe(focus_x, cx_min, cx_max)
    } else {
        (min_x + max_x) * 0.5
    };

    let cy_min = min_y + radius + margin;
    let cy_max = max_y - radius - margin;
    let preferred_y = focus_y - SelectionOverlayController::LOUPE_VERTICAL_OFFSET_PT;
    let center_y = if cy_min <= cy_max {
        clamp_safe(preferred_y, cy_min, cy_max)
    } else {
        (min_y + max_y) * 0.5
    };

    AffineLoupeLayout {
        visible: true,
        center_x,
        center_y,
        focus_x,
        focus_y,
        diameter,
        zoom_scale: SelectionOverlayController::LOUPE_ZOOM_SCALE,
    }
}

fn build_menu_anchor_rect(
    start_caret: AffineRect,
    end_caret: AffineRect,
    min_x: f32,
    max_x: f32,
    min_y: f32,
    max_y: f32,
) -> AffineRect {
    let left = clamp_safe(start_caret.x.min(end_caret.x), min_x, max_x);
    let right = clamp_safe(start_caret.right().max(end_caret.right()), left, max_x);
    let top = clamp_safe(start_caret.y.min(end_caret.y), min_y, max_y);
    let bottom = clamp_safe(start_caret.bottom().max(end_caret.bottom()), top, max_y);
    AffineRect {
        x: left,
        y: top,
        width: (right - left).max(1.0),
        height: (bottom - top).max(1.0),
    }
}

fn distance_to_handle(px: f32, py: f32, handle: AffineTeardropHandleLayout) -> f32 {
    if !handle.visible {
        return f32::INFINITY;
    }
    let d_drop = hypot(px - handle.drop_center_x, py - handle.drop_center_y);
    let clamped_y = clamp_safe(py, handle.stem_top_y, handle.stem_bottom_y);
    let d_stem = hypot(px - handle.stem_x, py - clamped_y);
    d_drop.min(d_stem)
}

fn hypot(dx: f32, dy: f32) -> f32 {
    (dx * dx + dy * dy).sqrt()
}

fn clamp_safe(value: f32, min: f32, max: f32) -> f32 {
    let v = sanitize_f32(value);
    if min <= max { v.clamp(min, max) } else { min }
}

fn sanitize_f32(v: f32) -> f32 {
    if v.is_finite() { v } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn standard_insets() -> AffineWindowInsets {
        AffineWindowInsets {
            safe_top: 59.0,
            safe_right: 0.0,
            safe_bottom: 34.0,
            safe_left: 0.0,
            ime_bottom: 0.0,
        }
    }

    #[test]
    fn teardrop_geometry_table_covers_ltr_rtl_collapsed_multiline_and_narrow_clamp() {
        struct Case {
            name: &'static str,
            start: AffineRect,
            end: AffineRect,
            range: AffineUtf16Range,
            dir: AffineWritingDirection,
            vw: f32,
            vh: f32,
            expect_visible: bool,
            expect_start_offset_sign: f32,
            expect_end_offset_sign: f32,
        }

        let cases = [
            Case {
                name: "ltr_single_line",
                start: AffineRect {
                    x: 80.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                end: AffineRect {
                    x: 240.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                range: AffineUtf16Range {
                    location: 0,
                    length: 10,
                },
                dir: AffineWritingDirection::Ltr,
                vw: 390.0,
                vh: 844.0,
                expect_visible: true,
                expect_start_offset_sign: -1.0,
                expect_end_offset_sign: 1.0,
            },
            Case {
                name: "rtl_flips_teardrop_bias",
                start: AffineRect {
                    x: 280.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                end: AffineRect {
                    x: 110.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                range: AffineUtf16Range {
                    location: 2,
                    length: 8,
                },
                dir: AffineWritingDirection::Rtl,
                vw: 390.0,
                vh: 844.0,
                expect_visible: true,
                expect_start_offset_sign: 1.0,
                expect_end_offset_sign: -1.0,
            },
            Case {
                name: "collapsed_caret_hides_handles",
                start: AffineRect {
                    x: 120.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                end: AffineRect {
                    x: 120.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                range: AffineUtf16Range {
                    location: 4,
                    length: 0,
                },
                dir: AffineWritingDirection::Ltr,
                vw: 390.0,
                vh: 844.0,
                expect_visible: false,
                expect_start_offset_sign: 0.0,
                expect_end_offset_sign: 0.0,
            },
            Case {
                name: "multiline_and_narrow_viewport_clamps_handles_inside_bounds",
                start: AffineRect {
                    x: 1.0,
                    y: 60.0,
                    width: 2.0,
                    height: 22.0,
                },
                end: AffineRect {
                    x: 319.0,
                    y: 420.0,
                    width: 2.0,
                    height: 22.0,
                },
                range: AffineUtf16Range {
                    location: 0,
                    length: 64,
                },
                dir: AffineWritingDirection::Ltr,
                vw: 320.0,
                vh: 568.0,
                expect_visible: true,
                expect_start_offset_sign: -1.0,
                expect_end_offset_sign: 1.0,
            },
        ];

        for c in cases {
            let mut ctrl = SelectionOverlayController::default();
            ctrl.set_selection(c.start, c.end, c.range, c.dir);
            let layout = ctrl.layout(c.vw, c.vh, standard_insets());
            assert_eq!(layout.start_handle.visible, c.expect_visible, "{}", c.name);
            assert_eq!(layout.end_handle.visible, c.expect_visible, "{}", c.name);
            assert_eq!(layout.show_floating_menu, c.expect_visible, "{}", c.name);
            if c.expect_visible {
                assert!(layout.start_handle.drop_above, "{}", c.name);
                assert!(!layout.end_handle.drop_above, "{}", c.name);
                assert_eq!(
                    layout.start_handle.drop_offset_x.signum(),
                    c.expect_start_offset_sign,
                    "{}",
                    c.name
                );
                assert_eq!(
                    layout.end_handle.drop_offset_x.signum(),
                    c.expect_end_offset_sign,
                    "{}",
                    c.name
                );
                assert!(
                    layout.start_handle.drop_center_x >= SelectionOverlayController::DROP_RADIUS_PT,
                    "{}",
                    c.name
                );
                assert!(
                    layout.end_handle.drop_center_x
                        <= c.vw - SelectionOverlayController::DROP_RADIUS_PT,
                    "{}",
                    c.name
                );
                assert!(
                    layout.start_handle.drop_center_y
                        >= 59.0 + SelectionOverlayController::DROP_RADIUS_PT,
                    "{}",
                    c.name
                );
                assert!(layout.menu_anchor_rect.width >= 1.0, "{}", c.name);
                assert!(layout.menu_anchor_rect.height >= 20.0, "{}", c.name);
            }
        }
    }

    #[test]
    fn drag_lifecycle_activates_clamped_loupe_swaps_crossed_handles_and_restores_menu() {
        let mut ctrl = SelectionOverlayController::default();
        let insets = standard_insets();
        ctrl.set_selection(
            AffineRect {
                x: 80.0,
                y: 120.0,
                width: 2.0,
                height: 20.0,
            },
            AffineRect {
                x: 200.0,
                y: 120.0,
                width: 2.0,
                height: 20.0,
            },
            AffineUtf16Range {
                location: 0,
                length: 12,
            },
            AffineWritingDirection::Ltr,
        );

        let hit = ctrl.hit_test_handle(
            AffinePoint { x: 77.0, y: 114.0 },
            22.0,
            390.0,
            844.0,
            insets,
        );
        assert_eq!(hit, AffineSelectionHandleKind::Start);
        assert!(ctrl.begin_drag(hit, AffinePoint { x: 10.0, y: 70.0 }));

        let dragging = ctrl.layout(390.0, 844.0, insets);
        assert!(dragging.loupe.visible);
        assert!(!dragging.show_floating_menu);
        assert_eq!(
            dragging.loupe.zoom_scale,
            SelectionOverlayController::LOUPE_ZOOM_SCALE
        );
        // Loupe must clamp away from left and top safe edges.
        let min_cx = SelectionOverlayController::LOUPE_DIAMETER_PT * 0.5
            + SelectionOverlayController::VIEWPORT_MARGIN_PT;
        let min_cy = 59.0
            + SelectionOverlayController::LOUPE_DIAMETER_PT * 0.5
            + SelectionOverlayController::VIEWPORT_MARGIN_PT;
        assert!(dragging.loupe.center_x >= min_cx);
        assert!(dragging.loupe.center_y >= min_cy);

        // Drag start handle past end handle: authoritative UTF-16 anchor updates range and flips active drag to End.
        assert!(ctrl.apply_text_drag_endpoints(
            AffinePoint { x: 260.0, y: 125.0 },
            18,
            AffineRect {
                x: 200.0,
                y: 120.0,
                width: 2.0,
                height: 20.0,
            },
            AffineRect {
                x: 260.0,
                y: 120.0,
                width: 2.0,
                height: 20.0,
            },
        ));
        assert_eq!(ctrl.active_drag_handle(), AffineSelectionHandleKind::End);

        // Release handle: loupe closes and floating menu anchor appears.
        assert!(ctrl.end_drag());
        let settled = ctrl.layout(390.0, 844.0, insets);
        assert!(!settled.loupe.visible);
        assert!(settled.show_floating_menu);
        assert_eq!(settled.menu_anchor_rect.x, 200.0);
        assert_eq!(settled.menu_anchor_rect.width, 62.0);
    }

    #[test]
    fn grab_offset_prevents_zero_pt_drag_line_jump_and_offscreen_handles_hide() {
        let mut ctrl = SelectionOverlayController::default();
        let insets = standard_insets();
        ctrl.set_selection(
            AffineRect {
                x: 80.0,
                y: 200.0,
                width: 2.0,
                height: 20.0,
            },
            AffineRect {
                x: 200.0,
                y: 200.0,
                width: 2.0,
                height: 20.0,
            },
            AffineUtf16Range {
                location: 0,
                length: 12,
            },
            AffineWritingDirection::Ltr,
        );
        let initial = ctrl.layout(390.0, 844.0, insets);
        let drop_center = AffinePoint {
            x: initial.end_handle.drop_center_x,
            y: initial.end_handle.drop_center_y,
        };
        assert!(ctrl.begin_drag(AffineSelectionHandleKind::End, drop_center));
        // 0pt move on teardrop center must probe exact caret midpoint (201.0, 210.0), not drop_center_y (226.0).
        let probe = ctrl.drag_probe_point_for(drop_center);
        assert_eq!(probe.x, 201.0);
        assert_eq!(probe.y, 210.0);
        let state = ctrl.layout(390.0, 844.0, insets);
        assert_eq!(state.drag_probe_point, probe);

        // Offscreen carets (above safe_top or below keyboard) must hide their handles.
        let kb_insets = AffineWindowInsets {
            safe_top: 59.0,
            safe_right: 0.0,
            safe_bottom: 34.0,
            safe_left: 0.0,
            ime_bottom: 302.0,
        };
        ctrl.set_selection(
            AffineRect {
                x: 80.0,
                y: 10.0,
                width: 2.0,
                height: 20.0,
            },
            AffineRect {
                x: 200.0,
                y: 620.0,
                width: 2.0,
                height: 20.0,
            },
            AffineUtf16Range {
                location: 0,
                length: 20,
            },
            AffineWritingDirection::Ltr,
        );
        let offscreen = ctrl.layout(390.0, 844.0, kb_insets);
        assert!(!offscreen.start_handle.visible);
        assert!(!offscreen.end_handle.visible);
    }

    #[test]
    fn crossover_table_swaps_active_drag_and_preserves_anchor_for_ltr_rtl_and_multiline() {
        struct Case {
            name: &'static str,
            dir: AffineWritingDirection,
            start: AffineRect,
            end: AffineRect,
            drag: AffineSelectionHandleKind,
            target: AffineRect,
            expect_active_after: AffineSelectionHandleKind,
            expect_start_x: f32,
            expect_start_y: f32,
            expect_end_x: f32,
            expect_end_y: f32,
        }

        let cases = [
            Case {
                name: "ltr_same_line_start_crosses_end",
                dir: AffineWritingDirection::Ltr,
                start: AffineRect {
                    x: 80.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                end: AffineRect {
                    x: 180.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                drag: AffineSelectionHandleKind::Start,
                target: AffineRect {
                    x: 240.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                expect_active_after: AffineSelectionHandleKind::End,
                expect_start_x: 180.0,
                expect_start_y: 200.0,
                expect_end_x: 240.0,
                expect_end_y: 200.0,
            },
            Case {
                name: "ltr_same_line_end_crosses_before_start",
                dir: AffineWritingDirection::Ltr,
                start: AffineRect {
                    x: 120.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                end: AffineRect {
                    x: 220.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                drag: AffineSelectionHandleKind::End,
                target: AffineRect {
                    x: 60.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                expect_active_after: AffineSelectionHandleKind::Start,
                expect_start_x: 60.0,
                expect_start_y: 200.0,
                expect_end_x: 120.0,
                expect_end_y: 200.0,
            },
            Case {
                name: "rtl_same_line_end_crosses_before_start",
                dir: AffineWritingDirection::Rtl,
                start: AffineRect {
                    x: 240.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                end: AffineRect {
                    x: 120.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                drag: AffineSelectionHandleKind::End,
                target: AffineRect {
                    x: 300.0,
                    y: 200.0,
                    width: 2.0,
                    height: 20.0,
                },
                expect_active_after: AffineSelectionHandleKind::Start,
                expect_start_x: 300.0,
                expect_start_y: 200.0,
                expect_end_x: 240.0,
                expect_end_y: 200.0,
            },
            Case {
                name: "multiline_end_crosses_above_start",
                dir: AffineWritingDirection::Ltr,
                start: AffineRect {
                    x: 100.0,
                    y: 240.0,
                    width: 2.0,
                    height: 20.0,
                },
                end: AffineRect {
                    x: 200.0,
                    y: 280.0,
                    width: 2.0,
                    height: 20.0,
                },
                drag: AffineSelectionHandleKind::End,
                target: AffineRect {
                    x: 150.0,
                    y: 180.0,
                    width: 2.0,
                    height: 20.0,
                },
                expect_active_after: AffineSelectionHandleKind::Start,
                expect_start_x: 150.0,
                expect_start_y: 180.0,
                expect_end_x: 100.0,
                expect_end_y: 240.0,
            },
        ];

        let insets = standard_insets();
        for c in cases {
            let mut ctrl = SelectionOverlayController::default();
            ctrl.set_selection(
                c.start,
                c.end,
                AffineUtf16Range {
                    location: 2,
                    length: 8,
                },
                c.dir,
            );
            assert!(
                ctrl.begin_drag(c.drag, AffinePoint { x: 100.0, y: 200.0 }),
                "{}",
                c.name
            );
            // Authoritative UTF-16 target offset crosses past the fixed anchor (2 or 10).
            let target_offset = match c.expect_active_after {
                AffineSelectionHandleKind::End => 12,
                AffineSelectionHandleKind::Start => 1,
                AffineSelectionHandleKind::None => 2,
            };
            let new_start = AffineRect {
                x: c.expect_start_x,
                y: c.expect_start_y,
                width: 2.0,
                height: 20.0,
            };
            let new_end = AffineRect {
                x: c.expect_end_x,
                y: c.expect_end_y,
                width: 2.0,
                height: 20.0,
            };
            assert!(
                ctrl.apply_text_drag_endpoints(
                    AffinePoint {
                        x: c.target.x,
                        y: c.target.y,
                    },
                    target_offset,
                    new_start,
                    new_end,
                ),
                "{}",
                c.name
            );
            assert_eq!(
                ctrl.active_drag_handle(),
                c.expect_active_after,
                "{}",
                c.name
            );
            let layout = ctrl.layout(390.0, 844.0, insets);
            assert_eq!(layout.start_handle.stem_x, c.expect_start_x, "{}", c.name);
            assert_eq!(
                layout.start_handle.stem_top_y, c.expect_start_y,
                "{}",
                c.name
            );
            assert_eq!(layout.end_handle.stem_x, c.expect_end_x, "{}", c.name);
            assert_eq!(layout.end_handle.stem_top_y, c.expect_end_y, "{}", c.name);
        }
    }

    #[test]
    fn keyboard_occlusion_hides_handles_and_menu_then_restores_on_dismiss() {
        let mut ctrl = SelectionOverlayController::default();
        ctrl.set_selection(
            AffineRect {
                x: 40.0,
                y: 710.0,
                width: 2.0,
                height: 20.0,
            },
            AffineRect {
                x: 180.0,
                y: 710.0,
                width: 2.0,
                height: 20.0,
            },
            AffineUtf16Range {
                location: 10,
                length: 8,
            },
            AffineWritingDirection::Ltr,
        );

        let no_kb = standard_insets();
        let before = ctrl.layout(390.0, 844.0, no_kb);
        assert!(before.start_handle.visible && before.end_handle.visible);
        assert!(before.show_floating_menu);

        let with_kb = AffineWindowInsets {
            ime_bottom: 302.0,
            ..no_kb
        };
        let occluded = ctrl.layout(390.0, 844.0, with_kb);
        assert!(!occluded.start_handle.visible && !occluded.end_handle.visible);
        assert!(!occluded.show_floating_menu);
        assert!(occluded.has_selection);
        assert_eq!(occluded.range.location, 10);
        assert_eq!(occluded.range.length, 8);

        let restored = ctrl.layout(390.0, 844.0, no_kb);
        assert!(restored.start_handle.visible && restored.end_handle.visible);
        assert!(restored.show_floating_menu);
    }

    #[test]
    fn apply_text_drag_endpoints_handles_bidi_crossover_zero_length_and_vertical_drift() {
        let mut ctrl = SelectionOverlayController::default();
        let start_c = AffineRect {
            x: 180.0,
            y: 120.0,
            width: 2.0,
            height: 22.0,
        };
        let end_c = AffineRect {
            x: 120.0,
            y: 120.0,
            width: 2.0,
            height: 22.0,
        };
        // Mixed BiDi: LTR doc with RTL substring where start_caret.x > end_caret.x.
        ctrl.set_selection(
            start_c,
            end_c,
            AffineUtf16Range {
                location: 6,
                length: 5,
            },
            AffineWritingDirection::Ltr,
        );
        assert!(ctrl.begin_drag(
            AffineSelectionHandleKind::End,
            AffinePoint { x: 120.0, y: 148.0 }
        ));
        assert_eq!(ctrl.drag_anchor_utf16(), Some(6));

        // 1. Mixed BiDi coordinates (start.x > end.x under LTR) + +50pt vertical finger drift
        // must NOT flip active_drag or swap start/end carets.
        assert!(ctrl.apply_text_drag_endpoints(
            AffinePoint { x: 140.0, y: 198.0 },
            9,
            start_c,
            AffineRect {
                x: 140.0,
                y: 120.0,
                width: 2.0,
                height: 22.0,
            },
        ));
        assert_eq!(ctrl.active_drag_handle(), AffineSelectionHandleKind::End);
        let st = ctrl.layout(390.0, 844.0, standard_insets());
        assert_eq!(
            st.range,
            AffineUtf16Range {
                location: 6,
                length: 3
            }
        );

        // 2. Crossing through length == 0 (target == anchor == 6) keeps dragged handle visible,
        // then crossing to 3 flips active_drag to Start, and dragging back to 8 flips back to End.
        let at_anchor = AffineRect {
            x: 180.0,
            y: 120.0,
            width: 2.0,
            height: 22.0,
        };
        assert!(ctrl.apply_text_drag_endpoints(
            AffinePoint { x: 180.0, y: 148.0 },
            6,
            at_anchor,
            at_anchor,
        ));
        let st_zero = ctrl.layout(390.0, 844.0, standard_insets());
        assert_eq!(
            st_zero.active_drag_handle,
            AffineSelectionHandleKind::End as u8
        );
        assert!(
            st_zero.end_handle.visible,
            "dragged handle stays visible at length == 0"
        );

        assert!(ctrl.apply_text_drag_endpoints(
            AffinePoint { x: 210.0, y: 148.0 },
            3,
            AffineRect {
                x: 210.0,
                y: 120.0,
                width: 2.0,
                height: 22.0,
            },
            at_anchor,
        ));
        assert_eq!(ctrl.active_drag_handle(), AffineSelectionHandleKind::Start);
        let st_cross = ctrl.layout(390.0, 844.0, standard_insets());
        assert_eq!(
            st_cross.range,
            AffineUtf16Range {
                location: 3,
                length: 3
            }
        );

        assert!(ctrl.apply_text_drag_endpoints(
            AffinePoint { x: 150.0, y: 148.0 },
            8,
            at_anchor,
            AffineRect {
                x: 150.0,
                y: 120.0,
                width: 2.0,
                height: 22.0,
            },
        ));
        assert_eq!(ctrl.active_drag_handle(), AffineSelectionHandleKind::End);
        let st_back = ctrl.layout(390.0, 844.0, standard_insets());
        assert_eq!(
            st_back.range,
            AffineUtf16Range {
                location: 6,
                length: 2
            }
        );

        assert!(ctrl.end_drag());
        assert_eq!(ctrl.drag_anchor_utf16(), None);
    }
}
