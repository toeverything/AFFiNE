//! Native Android text selection teardrop handles, magnifier loupe anchor,
//! and post-release context action menu geometry.
//!
//! Coordinates are kept in viewport pixel space scaled by `density` so the
//! Kotlin host can position overlay views without calling `SurfaceHolder.lockCanvas`.

use serde::Serialize;

/// Text layout direction controlling teardrop handle orientation.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[repr(i32)]
pub enum TextDirection {
    #[default]
    Ltr = 0,
    Rtl = 1,
}

impl TextDirection {
    /// Converts a raw JNI integer code into a [`TextDirection`].
    pub const fn from_code(code: i32) -> Self {
        match code {
            1 => Self::Rtl,
            _ => Self::Ltr,
        }
    }
}

/// Active selection handle identifier.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[repr(i32)]
pub enum SelectionHandleKind {
    #[default]
    None = 0,
    Start = 1,
    End = 2,
}

impl SelectionHandleKind {
    /// Converts a raw JNI integer code into a [`SelectionHandleKind`].
    pub const fn from_code(code: i32) -> Self {
        match code {
            1 => Self::Start,
            2 => Self::End,
            _ => Self::None,
        }
    }
}

/// Visual teardrop lean direction for a selection handle.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub enum TeardropOrientation {
    #[default]
    LeftLeaning,
    RightLeaning,
}

/// Axis-aligned rectangle in viewport pixels.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct RectF {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Computed geometry for a single teardrop selection handle.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct HandleGeometry {
    pub kind: SelectionHandleKind,
    pub tip_x: f32,
    pub tip_y: f32,
    pub center_x: f32,
    pub center_y: f32,
    pub radius: f32,
    pub orientation: TeardropOrientation,
    pub bounds: RectF,
    pub visible: bool,
}

/// Magnifier loupe position and visibility while dragging a selection handle.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct MagnifierState {
    pub visible: bool,
    pub anchor_x: f32,
    pub anchor_y: f32,
    pub loupe_x: f32,
    pub loupe_y: f32,
    pub zoom: f32,
}

/// Complete native selection overlay state for the Android host.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SelectionOverlayState {
    pub viewport_width: f32,
    pub viewport_height: f32,
    pub density: f32,
    pub direction: TextDirection,
    pub has_selection: bool,
    pub active_drag: SelectionHandleKind,
    pub line_height: f32,
    pub start_handle: HandleGeometry,
    pub end_handle: HandleGeometry,
    pub magnifier: MagnifierState,
    pub action_menu_rect: Option<RectF>,
    pub probe_x: f32,
    pub probe_y: f32,
    #[serde(skip)]
    raw_start_x: f32,
    #[serde(skip)]
    raw_start_y: f32,
    #[serde(skip)]
    raw_end_x: f32,
    #[serde(skip)]
    raw_end_y: f32,
    #[serde(skip)]
    grab_dx: f32,
    #[serde(skip)]
    grab_dy: f32,
}

const HANDLE_RADIUS_DP: f32 = 11.0;
const HANDLE_HIT_SLOP_DP: f32 = 24.0;
const LOUPE_WIDTH_DP: f32 = 100.0;
const LOUPE_HEIGHT_DP: f32 = 48.0;
const LOUPE_OFFSET_Y_DP: f32 = 56.0;
const LOUPE_DEFAULT_ZOOM: f32 = 1.25;
const ACTION_MENU_WIDTH_DP: f32 = 220.0;
const ACTION_MENU_HEIGHT_DP: f32 = 44.0;
const ACTION_MENU_GAP_DP: f32 = 12.0;

impl Default for SelectionOverlayState {
    fn default() -> Self {
        Self::new()
    }
}

impl SelectionOverlayState {
    /// Creates an empty selection overlay state.
    pub fn new() -> Self {
        Self {
            viewport_width: 0.0,
            viewport_height: 0.0,
            density: 1.0,
            direction: TextDirection::Ltr,
            has_selection: false,
            active_drag: SelectionHandleKind::None,
            line_height: 24.0,
            start_handle: HandleGeometry {
                kind: SelectionHandleKind::Start,
                orientation: TeardropOrientation::LeftLeaning,
                ..HandleGeometry::default()
            },
            end_handle: HandleGeometry {
                kind: SelectionHandleKind::End,
                orientation: TeardropOrientation::RightLeaning,
                ..HandleGeometry::default()
            },
            magnifier: MagnifierState {
                zoom: LOUPE_DEFAULT_ZOOM,
                ..MagnifierState::default()
            },
            action_menu_rect: None,
            probe_x: 0.0,
            probe_y: 0.0,
            raw_start_x: 0.0,
            raw_start_y: 0.0,
            raw_end_x: 0.0,
            raw_end_y: 0.0,
            grab_dx: 0.0,
            grab_dy: 0.0,
        }
    }

    /// Updates viewport dimensions and display density, reclamping active overlays.
    pub fn set_viewport(&mut self, width: f32, height: f32, density: f32) {
        self.viewport_width = sanitize_non_negative(width);
        self.viewport_height = sanitize_non_negative(height);
        self.density = sanitize_positive(density, 1.0);
        self.recompute();
    }

    /// Updates the selection endpoints, line height, and text direction.
    #[allow(clippy::too_many_arguments)]
    pub fn update_selection(
        &mut self,
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
        line_height: f32,
        direction: TextDirection,
        has_selection: bool,
    ) {
        self.direction = direction;
        self.line_height = sanitize_positive(line_height, 24.0 * self.density);
        self.has_selection = has_selection;
        if !has_selection {
            self.clear();
            return;
        }
        self.raw_start_x = sanitize_finite(start_x);
        self.raw_start_y = sanitize_finite(start_y);
        self.raw_end_x = sanitize_finite(end_x);
        self.raw_end_y = sanitize_finite(end_y);
        self.recompute();
    }

    /// Hit-tests a finger-down coordinate against the visible start and end teardrop handles,
    /// recording the grab offset so a zero-pixel drag keeps the endpoint stationary.
    pub fn begin_drag(&mut self, touch_x: f32, touch_y: f32) -> SelectionHandleKind {
        if !self.has_selection || !touch_x.is_finite() || !touch_y.is_finite() {
            self.active_drag = SelectionHandleKind::None;
            self.grab_dx = 0.0;
            self.grab_dy = 0.0;
            return SelectionHandleKind::None;
        }
        let hit_radius = HANDLE_HIT_SLOP_DP * self.density;
        let max_dist_sq = hit_radius * hit_radius;

        let start_dist_sq = if self.start_handle.visible {
            dist_sq(
                touch_x,
                touch_y,
                self.start_handle.center_x,
                self.start_handle.center_y,
            )
        } else {
            f32::INFINITY
        };
        let end_dist_sq = if self.end_handle.visible {
            dist_sq(
                touch_x,
                touch_y,
                self.end_handle.center_x,
                self.end_handle.center_y,
            )
        } else {
            f32::INFINITY
        };

        let hit = match (start_dist_sq <= max_dist_sq, end_dist_sq <= max_dist_sq) {
            (true, true) => {
                if start_dist_sq <= end_dist_sq {
                    SelectionHandleKind::Start
                } else {
                    SelectionHandleKind::End
                }
            }
            (true, false) => SelectionHandleKind::Start,
            (false, true) => SelectionHandleKind::End,
            (false, false) => SelectionHandleKind::None,
        };

        self.active_drag = hit;
        if hit != SelectionHandleKind::None {
            let (ax, ay) = self.active_anchor();
            self.grab_dx = ax - touch_x;
            self.grab_dy = ay - touch_y;
            self.action_menu_rect = None;
            let focus_y = (ay - 0.5 * self.line_height).max(0.0);
            self.update_magnifier(ax, focus_y, true);
        } else {
            self.grab_dx = 0.0;
            self.grab_dy = 0.0;
        }
        hit
    }

    /// Computes and clamps the grab-offset-compensated drag probe without mutating
    /// handle ownership, allowing UTF-16 text layout to be the single authority for
    /// start/end handle inversion and magnifier anchoring.
    pub fn probe_drag_position(&mut self, touch_x: f32, touch_y: f32) -> Option<(f32, f32)> {
        if self.active_drag == SelectionHandleKind::None
            || !touch_x.is_finite()
            || !touch_y.is_finite()
        {
            return None;
        }
        let next_x = self.clamp_x(touch_x + self.grab_dx);
        let next_y = self.clamp_y(touch_y + self.grab_dy);
        self.probe_x = next_x;
        self.probe_y = next_y;
        Some((next_x, next_y))
    }

    /// Applies authoritative text-layout selection endpoints and active handle kind
    /// during a text-driven handle drag without applying a secondary pixel-based swap.
    #[allow(clippy::too_many_arguments)]
    pub fn apply_text_drag_endpoints(
        &mut self,
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
        line_height: f32,
        direction: TextDirection,
        active_handle: SelectionHandleKind,
    ) {
        self.has_selection = true;
        self.direction = direction;
        self.line_height = if line_height.is_finite() && line_height > 0.0 {
            line_height
        } else {
            24.0 * self.density
        };
        self.raw_start_x = if start_x.is_finite() { start_x } else { 0.0 };
        self.raw_start_y = if start_y.is_finite() { start_y } else { 0.0 };
        self.raw_end_x = if end_x.is_finite() { end_x } else { 0.0 };
        self.raw_end_y = if end_y.is_finite() { end_y } else { 0.0 };
        self.active_drag = active_handle;
        self.recompute();
    }

    /// Moves the actively dragged selection handle using the recorded grab offset
    /// and updates the magnifier anchor.
    ///
    /// Automatically swaps start and end endpoints and flips `active_drag` when the
    /// dragged handle crosses past the opposite handle (same-line or cross-line).
    pub fn update_drag(&mut self, touch_x: f32, touch_y: f32) -> bool {
        if self.active_drag == SelectionHandleKind::None
            || !touch_x.is_finite()
            || !touch_y.is_finite()
        {
            return false;
        }
        let next_x = self.clamp_x(touch_x + self.grab_dx);
        let next_y = self.clamp_y(touch_y + self.grab_dy);
        self.probe_x = next_x;
        self.probe_y = next_y;
        match self.active_drag {
            SelectionHandleKind::Start => {
                self.raw_start_x = next_x;
                self.raw_start_y = next_y;
            }
            SelectionHandleKind::End => {
                self.raw_end_x = next_x;
                self.raw_end_y = next_y;
            }
            SelectionHandleKind::None => return false,
        }
        if self.is_selection_inverted() {
            core::mem::swap(&mut self.raw_start_x, &mut self.raw_end_x);
            core::mem::swap(&mut self.raw_start_y, &mut self.raw_end_y);
            self.active_drag = match self.active_drag {
                SelectionHandleKind::Start => SelectionHandleKind::End,
                SelectionHandleKind::End => SelectionHandleKind::Start,
                SelectionHandleKind::None => SelectionHandleKind::None,
            };
        }
        self.recompute();
        true
    }

    fn is_selection_inverted(&self) -> bool {
        let sy = self.raw_start_y;
        let ey = self.raw_end_y;
        let same_line_tol = 0.5 * self.line_height.max(16.0);
        if (sy - ey).abs() > same_line_tol {
            return sy > ey;
        }
        match self.direction {
            TextDirection::Ltr => self.raw_start_x > self.raw_end_x,
            TextDirection::Rtl => self.raw_start_x < self.raw_end_x,
        }
    }

    /// Packs the overlay geometry into a fixed 24-float array for zero-allocation,
    /// zero-JSON per-frame `AndroidSelectionOverlayView.onDraw` rendering.
    pub fn pack_overlay_floats(&self) -> [f32; 24] {
        let (menu_vis, mx, my, mw, mh) = match self.action_menu_rect {
            Some(r) => (1.0, r.x, r.y, r.width, r.height),
            None => (0.0, 0.0, 0.0, 0.0, 0.0),
        };
        [
            if self.has_selection { 1.0 } else { 0.0 },
            match self.direction {
                TextDirection::Ltr => 0.0,
                TextDirection::Rtl => 1.0,
            },
            if self.start_handle.visible { 1.0 } else { 0.0 },
            self.start_handle.tip_x,
            self.start_handle.tip_y,
            self.start_handle.center_x,
            self.start_handle.center_y,
            self.start_handle.radius,
            if self.end_handle.visible { 1.0 } else { 0.0 },
            self.end_handle.tip_x,
            self.end_handle.tip_y,
            self.end_handle.center_x,
            self.end_handle.center_y,
            self.end_handle.radius,
            if self.magnifier.visible { 1.0 } else { 0.0 },
            self.magnifier.anchor_x,
            self.magnifier.anchor_y,
            self.magnifier.loupe_x,
            self.magnifier.loupe_y,
            menu_vis,
            mx,
            my,
            mw,
            mh,
        ]
    }

    /// Ends handle dragging, hides the magnifier, and computes the context action menu rect.
    pub fn end_drag(&mut self) -> Option<RectF> {
        self.active_drag = SelectionHandleKind::None;
        self.grab_dx = 0.0;
        self.grab_dy = 0.0;
        self.magnifier.visible = false;
        self.recompute();
        self.action_menu_rect
    }

    /// Clears the selection handles, magnifier, and context action menu.
    pub fn clear(&mut self) {
        self.has_selection = false;
        self.active_drag = SelectionHandleKind::None;
        self.grab_dx = 0.0;
        self.grab_dy = 0.0;
        self.start_handle.visible = false;
        self.end_handle.visible = false;
        self.magnifier.visible = false;
        self.action_menu_rect = None;
    }

    /// Serializes the current selection overlay state to JSON for JNI consumers.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }

    fn is_y_in_viewport(&self, raw_y: f32) -> bool {
        if self.viewport_height <= 0.0 {
            return raw_y >= 0.0;
        }
        raw_y >= 0.0 && raw_y <= self.viewport_height
    }

    fn recompute(&mut self) {
        let same_line =
            (self.raw_start_y - self.raw_end_y).abs() < 0.5 * self.line_height.max(16.0);
        let (start_orient, end_orient) =
            if same_line && (self.raw_start_x - self.raw_end_x).abs() > 0.01 {
                if self.raw_start_x < self.raw_end_x {
                    (
                        TeardropOrientation::LeftLeaning,
                        TeardropOrientation::RightLeaning,
                    )
                } else {
                    (
                        TeardropOrientation::RightLeaning,
                        TeardropOrientation::LeftLeaning,
                    )
                }
            } else {
                match self.direction {
                    TextDirection::Ltr => (
                        TeardropOrientation::LeftLeaning,
                        TeardropOrientation::RightLeaning,
                    ),
                    TextDirection::Rtl => (
                        TeardropOrientation::RightLeaning,
                        TeardropOrientation::LeftLeaning,
                    ),
                }
            };

        let start_visible = self.has_selection && self.is_y_in_viewport(self.raw_start_y);
        let end_visible = self.has_selection && self.is_y_in_viewport(self.raw_end_y);

        let start_tip = (
            self.clamp_x(self.raw_start_x),
            self.clamp_y(self.raw_start_y),
        );
        let end_tip = (self.clamp_x(self.raw_end_x), self.clamp_y(self.raw_end_y));

        self.start_handle = self.build_handle(
            SelectionHandleKind::Start,
            start_tip.0,
            start_tip.1,
            start_orient,
            start_visible,
        );
        self.end_handle = self.build_handle(
            SelectionHandleKind::End,
            end_tip.0,
            end_tip.1,
            end_orient,
            end_visible,
        );

        if !self.has_selection {
            self.magnifier.visible = false;
            self.action_menu_rect = None;
            return;
        }

        if self.active_drag != SelectionHandleKind::None {
            let (ax, ay) = self.active_anchor();
            let focus_y = (ay - 0.5 * self.line_height).max(0.0);
            self.update_magnifier(ax, focus_y, true);
            self.action_menu_rect = None;
        } else if start_visible || end_visible {
            self.magnifier.visible = false;
            self.action_menu_rect = Some(self.compute_action_menu_rect());
        } else {
            self.magnifier.visible = false;
            self.action_menu_rect = None;
        }
    }

    fn build_handle(
        &self,
        kind: SelectionHandleKind,
        tip_x: f32,
        tip_y: f32,
        orientation: TeardropOrientation,
        visible: bool,
    ) -> HandleGeometry {
        let r = HANDLE_RADIUS_DP * self.density;
        let diameter = r * 2.0;
        let lean = match orientation {
            TeardropOrientation::LeftLeaning => -0.7 * r,
            TeardropOrientation::RightLeaning => 0.7 * r,
        };
        let raw_cx = tip_x + lean;
        let raw_cy = tip_y + r;

        let width = if self.viewport_width > 0.0 {
            diameter.min(self.viewport_width)
        } else {
            diameter
        };
        let height = if self.viewport_height > 0.0 {
            diameter.min(self.viewport_height)
        } else {
            diameter
        };
        let bounds_x = clamp_rect_origin(raw_cx - width * 0.5, width, self.viewport_width);
        let bounds_y = clamp_rect_origin(raw_cy - height * 0.5, height, self.viewport_height);

        HandleGeometry {
            kind,
            tip_x,
            tip_y,
            center_x: bounds_x + width * 0.5,
            center_y: bounds_y + height * 0.5,
            radius: r,
            orientation,
            bounds: RectF {
                x: bounds_x,
                y: bounds_y,
                width,
                height,
            },
            visible,
        }
    }

    fn active_anchor(&self) -> (f32, f32) {
        match self.active_drag {
            SelectionHandleKind::Start => (self.start_handle.tip_x, self.start_handle.tip_y),
            SelectionHandleKind::End => (self.end_handle.tip_x, self.end_handle.tip_y),
            SelectionHandleKind::None => (0.0, 0.0),
        }
    }

    fn update_magnifier(&mut self, anchor_x: f32, anchor_y: f32, visible: bool) {
        let half_w = LOUPE_WIDTH_DP * 0.5 * self.density;
        let half_h = LOUPE_HEIGHT_DP * 0.5 * self.density;
        let offset_y = LOUPE_OFFSET_Y_DP * self.density;

        let loupe_x = clamp_center(anchor_x, half_w, self.viewport_width);
        let loupe_y = clamp_center(anchor_y - offset_y, half_h, self.viewport_height);

        self.magnifier = MagnifierState {
            visible,
            anchor_x,
            anchor_y,
            loupe_x,
            loupe_y,
            zoom: LOUPE_DEFAULT_ZOOM,
        };
    }

    fn compute_action_menu_rect(&self) -> RectF {
        let menu_w = if self.viewport_width > 0.0 {
            (ACTION_MENU_WIDTH_DP * self.density).min(self.viewport_width)
        } else {
            ACTION_MENU_WIDTH_DP * self.density
        };
        let menu_h = if self.viewport_height > 0.0 {
            (ACTION_MENU_HEIGHT_DP * self.density).min(self.viewport_height)
        } else {
            ACTION_MENU_HEIGHT_DP * self.density
        };
        let gap = ACTION_MENU_GAP_DP * self.density;

        let mid_x = (self.start_handle.tip_x + self.end_handle.tip_x) * 0.5;
        let top_y = self.start_handle.tip_y.min(self.end_handle.tip_y);
        let bottom_y = self.start_handle.tip_y.max(self.end_handle.tip_y);

        let preferred_y = top_y - self.line_height - menu_h - gap;
        let y = if preferred_y >= 0.0 {
            preferred_y
        } else {
            let below_y = bottom_y + HANDLE_RADIUS_DP * 2.0 * self.density + gap;
            clamp_rect_origin(below_y, menu_h, self.viewport_height)
        };
        let margin_x = 12.0 * self.density;
        let x = if self.viewport_width > menu_w + 2.0 * margin_x {
            (mid_x - menu_w * 0.5).clamp(margin_x, self.viewport_width - margin_x - menu_w)
        } else {
            clamp_rect_origin(mid_x - menu_w * 0.5, menu_w, self.viewport_width)
        };

        RectF {
            x,
            y,
            width: menu_w,
            height: menu_h,
        }
    }

    fn clamp_x(&self, value: f32) -> f32 {
        let v = if value.is_finite() { value } else { 0.0 };
        if self.viewport_width > 0.0 {
            v.clamp(0.0, self.viewport_width)
        } else {
            v.max(0.0)
        }
    }

    fn clamp_y(&self, value: f32) -> f32 {
        let v = if value.is_finite() { value } else { 0.0 };
        if self.viewport_height > 0.0 {
            v.clamp(0.0, self.viewport_height)
        } else {
            v.max(0.0)
        }
    }
}

fn sanitize_finite(value: f32) -> f32 {
    if value.is_finite() { value } else { 0.0 }
}

fn sanitize_non_negative(value: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    }
}

fn sanitize_positive(value: f32, fallback: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

fn dist_sq(ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    let dx = ax - bx;
    let dy = ay - by;
    dx * dx + dy * dy
}

fn clamp_rect_origin(origin: f32, size: f32, viewport: f32) -> f32 {
    if viewport <= 0.0 {
        return origin.max(0.0);
    }
    let max_origin = (viewport - size).max(0.0);
    origin.clamp(0.0, max_origin)
}

fn clamp_center(center: f32, half_size: f32, viewport: f32) -> f32 {
    if viewport <= 0.0 {
        return center.max(0.0);
    }
    if viewport <= half_size * 2.0 {
        return viewport * 0.5;
    }
    center.clamp(half_size, viewport - half_size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_handles_flip_for_rtl_and_clamp_to_viewport() {
        let cases = [
            (
                TextDirection::Ltr,
                10.0,
                1075.0,
                TeardropOrientation::LeftLeaning,
                TeardropOrientation::RightLeaning,
            ),
            (
                TextDirection::Rtl,
                1075.0,
                10.0,
                TeardropOrientation::RightLeaning,
                TeardropOrientation::LeftLeaning,
            ),
        ];

        for (dir, start_x, end_x, expected_start, expected_end) in cases {
            let mut state = SelectionOverlayState::new();
            state.set_viewport(1080.0, 2400.0, 3.0);
            state.update_selection(start_x, 400.0, end_x, 400.0, 60.0, dir, true);
            assert!(state.start_handle.visible);
            assert!(state.end_handle.visible);
            assert_eq!(state.start_handle.orientation, expected_start);
            assert_eq!(state.end_handle.orientation, expected_end);
            assert!(state.start_handle.bounds.x >= 0.0);
            assert!(state.end_handle.bounds.x + state.end_handle.bounds.width <= 1080.0);
            assert!(state.action_menu_rect.is_some());
        }
    }

    #[test]
    fn drag_shows_clamped_magnifier_and_release_restores_action_menu() {
        let mut state = SelectionOverlayState::new();
        state.set_viewport(1080.0, 2400.0, 3.0);
        state.update_selection(200.0, 500.0, 700.0, 500.0, 60.0, TextDirection::Ltr, true);

        // Miss outside touch target.
        assert_eq!(state.begin_drag(50.0, 50.0), SelectionHandleKind::None);
        assert!(!state.magnifier.visible);

        // Hit end handle center -> magnifier appears, action menu hides.
        let hit = state.begin_drag(state.end_handle.center_x, state.end_handle.center_y);
        assert_eq!(hit, SelectionHandleKind::End);
        assert!(state.magnifier.visible);
        assert!(state.action_menu_rect.is_none());

        // Drag end handle right & upward to top-right edge -> loupe clamps cleanly inside viewport.
        // Because grab_dy = tip_y - center_y = -33.0, touch_y = 43.0 places tip_y at 10.0.
        assert!(state.update_drag(1200.0, 533.0));
        assert!(state.magnifier.visible);
        assert_eq!(state.end_handle.tip_x, 1080.0);
        assert_eq!(state.end_handle.tip_y, 500.0);
        assert!(state.magnifier.loupe_x <= 1080.0 - 150.0);
        assert!(state.magnifier.loupe_y >= 72.0);
        assert!(state.action_menu_rect.is_none());

        // Release -> magnifier hides and action menu flips below near top edge.
        let menu = state.end_drag().expect("action menu rect after release");
        assert!(!state.magnifier.visible);
        assert!(menu.x >= 0.0 && menu.x + menu.width <= 1080.0);
        assert!(menu.y >= 0.0 && menu.y + menu.height <= 2400.0);
    }

    #[test]
    fn drag_preserves_grab_offset_swaps_on_crossover_and_hides_offscreen_handles() {
        // 1. Zero-pixel move after grabbing handle center must not jump the endpoint.
        let mut state = SelectionOverlayState::new();
        state.set_viewport(1080.0, 2400.0, 3.0);
        state.update_selection(200.0, 500.0, 700.0, 500.0, 60.0, TextDirection::Ltr, true);
        let grab_x = state.start_handle.center_x;
        let grab_y = state.start_handle.center_y;
        assert_eq!(state.begin_drag(grab_x, grab_y), SelectionHandleKind::Start);
        assert!(state.update_drag(grab_x, grab_y));
        assert!((state.start_handle.tip_x - 200.0).abs() < 1e-3);
        assert!((state.start_handle.tip_y - 500.0).abs() < 1e-3);

        // 2. Same-line LTR crossover: drag Start past End -> swaps endpoints & flips active_drag to End.
        let dx_past_end = 700.0;
        assert!(state.update_drag(grab_x + dx_past_end, grab_y));
        assert_eq!(state.active_drag, SelectionHandleKind::End);
        assert!((state.start_handle.tip_x - 700.0).abs() < 1e-3);
        assert!((state.end_handle.tip_x - 900.0).abs() < 1e-3);
        assert_eq!(
            state.start_handle.orientation,
            TeardropOrientation::LeftLeaning
        );
        assert_eq!(
            state.end_handle.orientation,
            TeardropOrientation::RightLeaning
        );
        let _ = state.end_drag();

        // 3. Cross-line crossover: drag Start below End -> swaps endpoints & flips active_drag to End.
        state.update_selection(300.0, 400.0, 600.0, 600.0, 60.0, TextDirection::Ltr, true);
        let sx = state.start_handle.center_x;
        let sy = state.start_handle.center_y;
        assert_eq!(state.begin_drag(sx, sy), SelectionHandleKind::Start);
        assert!(state.update_drag(sx, sy + 400.0));
        assert_eq!(state.active_drag, SelectionHandleKind::End);
        assert!((state.start_handle.tip_y - 600.0).abs() < 1e-3);
        assert!((state.end_handle.tip_y - 800.0).abs() < 1e-3);
        let _ = state.end_drag();

        // 4. Same-line RTL crossover: drag Start left of End -> swaps endpoints & flips active_drag.
        state.update_selection(800.0, 500.0, 400.0, 500.0, 60.0, TextDirection::Rtl, true);
        let rsx = state.start_handle.center_x;
        let rsy = state.start_handle.center_y;
        assert_eq!(state.begin_drag(rsx, rsy), SelectionHandleKind::Start);
        assert!(state.update_drag(rsx - 600.0, rsy));
        assert_eq!(state.active_drag, SelectionHandleKind::End);
        assert!((state.start_handle.tip_x - 400.0).abs() < 1e-3);
        assert!((state.end_handle.tip_x - 200.0).abs() < 1e-3);
        let _ = state.end_drag();

        // 5. Off-screen scrolled endpoints hide their handles instead of pinning to y=0.
        state.update_selection(200.0, -40.0, 700.0, 500.0, 60.0, TextDirection::Ltr, true);
        assert!(!state.start_handle.visible);
        assert!(state.end_handle.visible);
        state.update_selection(200.0, -40.0, 700.0, 2600.0, 60.0, TextDirection::Ltr, true);
        assert!(!state.start_handle.visible);
        assert!(!state.end_handle.visible);
        assert!(state.action_menu_rect.is_none());

        // 6. Same-line vertical jitter (+/-1px, +/-2px, +/-15px) within 0.5 * line_height
        //    must NEVER falsely swap Start and End handles.
        state.update_selection(200.0, 500.0, 700.0, 500.0, 60.0, TextDirection::Ltr, true);
        let ex = state.end_handle.center_x;
        let ey = state.end_handle.center_y;
        assert_eq!(state.begin_drag(ex, ey), SelectionHandleKind::End);
        for dy in [-1.0_f32, 1.0, -2.0, 2.0, -15.0, 15.0] {
            assert!(state.update_drag(ex - 20.0, ey + dy));
            assert_eq!(
                state.active_drag,
                SelectionHandleKind::End,
                "vertical jitter {dy}px must not swap End to Start"
            );
            assert!(state.end_handle.tip_x > state.start_handle.tip_x);
        }
        let _ = state.end_drag();

        // 7. Mixed-BiDi outward teardrop orientation & 12dp menu horizontal margin.
        state.update_selection(200.0, 500.0, 240.0, 500.0, 60.0, TextDirection::Rtl, true);
        assert_eq!(
            state.start_handle.orientation,
            TeardropOrientation::LeftLeaning
        );
        assert_eq!(
            state.end_handle.orientation,
            TeardropOrientation::RightLeaning
        );
        assert!(
            (state.end_handle.center_x - state.start_handle.center_x).abs()
                > state.start_handle.radius * 2.0
        );
        state.update_selection(240.0, 500.0, 200.0, 500.0, 60.0, TextDirection::Ltr, true);
        assert_eq!(
            state.start_handle.orientation,
            TeardropOrientation::RightLeaning
        );
        assert_eq!(
            state.end_handle.orientation,
            TeardropOrientation::LeftLeaning
        );
        assert!(
            (state.start_handle.center_x - state.end_handle.center_x).abs()
                > state.start_handle.radius * 2.0
        );
        state.update_selection(10.0, 500.0, 40.0, 500.0, 60.0, TextDirection::Ltr, true);
        let menu = state.action_menu_rect.expect("left-edge action menu");
        assert!(
            menu.x >= 36.0 - 0.01,
            "action menu x ({}) must keep >= 12dp (36px) left margin",
            menu.x
        );
    }
}
