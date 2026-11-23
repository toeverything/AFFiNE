//! Renderer-independent frame snapshots and UI audit rules.
//!
//! A renderer records one laid-out frame as a [`FrameSnapshot`]: every
//! element's post-layout bounds, clip (`content_mask`), opacity,
//! interactivity, radii and `#[track_caller]` callsite, plus optional
//! evidence (text metrics, roles, cursors, footer slots, real hit-test
//! receivers). [`audit_frame_snapshot`] checks it against deterministic
//! geometry and interaction rules ([`rules`]). The crate depends on `serde`
//! only, so the native UI crate, headless harnesses and server-side tooling
//! share one schema and one engine.
//!
//! Rules that need evidence only run on elements that opt in (a baseline
//! group, a footer slot, a role, a cursor), and an opted-in element without
//! the evidence its rule needs is itself a violation.

use std::{collections::BTreeMap, panic::Location};

use serde::{Deserialize, Serialize};

mod audit;

pub use audit::{audit_frame_snapshot, rules};

/// Logical pixel rectangle.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SnapshotRect {
  pub x: f32,
  pub y: f32,
  pub width: f32,
  pub height: f32,
}

impl SnapshotRect {
  #[inline]
  pub const fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
    Self { x, y, width, height }
  }

  #[inline]
  pub fn right(&self) -> f32 {
    self.x + self.width
  }

  #[inline]
  pub fn bottom(&self) -> f32 {
    self.y + self.height
  }

  #[inline]
  pub fn center_y(&self) -> f32 {
    self.y + self.height / 2.0
  }

  #[inline]
  pub fn is_empty(&self) -> bool {
    self.width <= 0.0 || self.height <= 0.0
  }

  #[inline]
  pub fn contains_point(&self, px: f32, py: f32) -> bool {
    px >= self.x && px <= self.right() && py >= self.y && py <= self.bottom()
  }
}

/// A violation reported by [`audit_frame_snapshot`]; `rule` is one of
/// [`rules::ALL`].
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditViolation {
  pub rule: String,
  pub element_id: String,
  pub callsite: String,
  pub message: String,
}

/// What an element is, for the rules that depend on it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ElementRole {
  #[default]
  Generic,
  Divider,
  /// Popover, menu, tooltip or hover card floating above the page.
  Overlay,
  /// Editable text field (justifies a text cursor).
  Input,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CursorStyle {
  Default,
  Pointer,
  Text,
  Grab,
  NotAllowed,
}

/// Laid-out text evidence in absolute logical pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct TextMetrics {
  /// Y of the first line's baseline.
  pub first_baseline: f32,
  /// Box of the first line.
  pub first_line: SnapshotRect,
  pub line_count: u32,
  /// The text did not fit its box (clipped or ellipsized).
  #[serde(default)]
  pub overflowed: bool,
  /// Ellipsis is the intended presentation.
  #[serde(default)]
  pub ellipsis_allowed: bool,
}

/// Membership in a wrapping footer button row.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FooterSlot {
  pub group: String,
  /// 0 is the primary action; larger is less important.
  pub priority: u32,
}

/// Which element the renderer's own hit test delivered a point to.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HitProbe {
  pub x: f32,
  pub y: f32,
  /// Topmost element receiving pointer events at `(x, y)`, if any.
  pub receiver: Option<String>,
}

/// Structured element snapshot with its `#[track_caller]` origin.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DebugElementSnapshot {
  pub id: String,
  pub parent_id: Option<String>,
  pub callsite: String,
  pub bounds: SnapshotRect,
  pub content_mask: SnapshotRect,
  pub opacity: f32,
  pub interactive: bool,
  pub focused: bool,
  pub corner_radius: f32,
  pub padding: f32,
  pub text: Option<String>,
  #[serde(default)]
  pub role: ElementRole,
  #[serde(default)]
  pub cursor: Option<CursorStyle>,
  /// Text can be selected (justifies a text cursor).
  #[serde(default)]
  pub selectable: bool,
  #[serde(default)]
  pub text_metrics: Option<TextMetrics>,
  /// Elements sharing a group align to the group's main text line.
  #[serde(default)]
  pub baseline_group: Option<String>,
  #[serde(default)]
  pub footer: Option<FooterSlot>,
}

impl DebugElementSnapshot {
  /// A snapshot whose callsite is the caller's `file:line`.
  #[track_caller]
  pub fn new(id: impl Into<String>, bounds: SnapshotRect, content_mask: SnapshotRect) -> Self {
    Self::from_location(id, Location::caller(), bounds, content_mask)
  }

  /// A snapshot whose callsite is a previously captured location.
  pub fn from_location(
    id: impl Into<String>,
    loc: &'static Location<'static>,
    bounds: SnapshotRect,
    content_mask: SnapshotRect,
  ) -> Self {
    Self {
      id: id.into(),
      parent_id: None,
      callsite: format!("{}:{}", loc.file(), loc.line()),
      bounds,
      content_mask,
      opacity: 1.0,
      interactive: false,
      focused: false,
      corner_radius: 0.0,
      padding: 0.0,
      text: None,
      role: ElementRole::Generic,
      cursor: None,
      selectable: false,
      text_metrics: None,
      baseline_group: None,
      footer: None,
    }
  }

  pub fn with_parent(mut self, parent_id: impl Into<String>) -> Self {
    self.parent_id = Some(parent_id.into());
    self
  }

  pub fn with_opacity(mut self, opacity: f32) -> Self {
    self.opacity = opacity;
    self
  }

  pub fn with_interactive(mut self, interactive: bool) -> Self {
    self.interactive = interactive;
    self
  }

  pub fn with_focused(mut self, focused: bool) -> Self {
    self.focused = focused;
    self
  }

  pub fn with_corner_radius(mut self, radius: f32) -> Self {
    self.corner_radius = radius;
    self
  }

  pub fn with_padding(mut self, padding: f32) -> Self {
    self.padding = padding;
    self
  }

  pub fn with_text(mut self, text: impl Into<String>) -> Self {
    self.text = Some(text.into());
    self
  }

  pub fn with_role(mut self, role: ElementRole) -> Self {
    self.role = role;
    self
  }

  pub fn with_cursor(mut self, cursor: CursorStyle) -> Self {
    self.cursor = Some(cursor);
    self
  }

  pub fn with_selectable(mut self, selectable: bool) -> Self {
    self.selectable = selectable;
    self
  }

  pub fn with_text_metrics(mut self, metrics: TextMetrics) -> Self {
    self.text_metrics = Some(metrics);
    self
  }

  pub fn with_baseline_group(mut self, group: impl Into<String>) -> Self {
    self.baseline_group = Some(group.into());
    self
  }

  pub fn with_footer(mut self, group: impl Into<String>, priority: u32) -> Self {
    self.footer = Some(FooterSlot {
      group: group.into(),
      priority,
    });
    self
  }

  /// Visible to the eye: opacity above [`audit::INVISIBLE_OPACITY`] and a
  /// non-empty box.
  pub fn is_visible(&self) -> bool {
    self.opacity > audit::INVISIBLE_OPACITY && !self.bounds.is_empty()
  }
}

/// Deterministic ordered collection of element snapshots for one frame.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct FrameSnapshot {
  pub viewport: SnapshotRect,
  pub scale_factor: f32,
  pub elements: BTreeMap<String, DebugElementSnapshot>,
  /// Points the renderer hit-tested, with the element that received each.
  #[serde(default)]
  pub hit_probes: Vec<HitProbe>,
}

impl FrameSnapshot {
  pub fn new(width: f32, height: f32, scale_factor: f32) -> Self {
    Self {
      viewport: SnapshotRect::new(0.0, 0.0, width, height),
      scale_factor,
      elements: BTreeMap::new(),
      hit_probes: Vec::new(),
    }
  }

  pub fn reset(&mut self, width: f32, height: f32, scale_factor: f32) {
    self.viewport = SnapshotRect::new(0.0, 0.0, width, height);
    self.scale_factor = scale_factor;
    self.clear();
  }

  pub fn clear(&mut self) {
    self.elements.clear();
    self.hit_probes.clear();
  }

  pub fn record(&mut self, snapshot: DebugElementSnapshot) {
    self.elements.insert(snapshot.id.clone(), snapshot);
  }

  pub fn record_hit_probe(&mut self, x: f32, y: f32, receiver: Option<String>) {
    self.hit_probes.push(HitProbe { x, y, receiver });
  }

  /// All recorded element snapshots in lexicographic id order.
  pub fn debug_element_snapshots(&self) -> Vec<&DebugElementSnapshot> {
    self.elements.values().collect()
  }

  /// Callsites (`id @ file:line`) of all elements covering `(x, y)`.
  pub fn sources_at(&self, x: f32, y: f32) -> Vec<String> {
    self
      .elements
      .values()
      .filter(|el| el.bounds.contains_point(x, y))
      .map(|el| format!("{} @ {}", el.id, el.callsite))
      .collect()
  }
}

#[cfg(test)]
mod tests;
