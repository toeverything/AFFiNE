use std::collections::HashMap;

use crate::{AuditViolation, CursorStyle, DebugElementSnapshot, ElementRole, FrameSnapshot};

/// Opacity at or below which an element counts as invisible.
pub const INVISIBLE_OPACITY: f32 = 0.01;
/// Tolerance for alignment comparisons, in logical pixels.
const ALIGN_TOLERANCE: f32 = 0.5;
/// Smallest radius step an inner corner falls back to when
/// `R_outer - padding` would go below it.
const MIN_RADIUS_STEP: f32 = 4.0;
/// Smallest interactive target, in logical pixels.
const MIN_HIT_TARGET: f32 = 24.0;

/// Rule identifiers reported in [`AuditViolation::rule`].
pub mod rules {
  /// Element visibly extends past its active `content_mask`.
  pub const PARENT_CLIP_FAULT: &str = "parent-clip-fault";
  /// An invisible element is interactive, or the renderer's hit test
  /// delivered a point to it.
  pub const ZERO_OPACITY_HIT_THROUGH: &str = "zero-opacity-hit-through";
  /// Interactive element smaller than 24 x 24.
  pub const MIN_HIT_TARGET: &str = "min-hit-target";
  /// Negative radius, or an inner radius above `max(R_outer - padding, 4)`.
  pub const CONCENTRIC_CORNER_RADIUS: &str = "concentric-corner-radius";
  /// Focused element entirely outside the viewport.
  pub const OFF_VIEWPORT_FOCUS: &str = "off-viewport-focus";
  /// Bounds off the 1x pixel grid.
  pub const PIXEL_ALIGNMENT: &str = "pixel-alignment";
  /// Baseline group member not on the main text's first line or baseline,
  /// or a group without the text metrics to check it.
  pub const FIRST_LINE_BASELINE: &str = "first-line-baseline";
  /// Wrapped footer actions put a more important action above a less
  /// important one, or the primary action is not leftmost on its row.
  pub const FOOTER_REVERSE_WRAP: &str = "footer-reverse-wrap";
  /// Adjacent dividers, or a divider before the first or after the last
  /// visible sibling.
  pub const DIVIDER_PLACEMENT: &str = "divider-placement";
  /// Pointer cursor on a non-interactive element, or a text cursor on
  /// content that is neither selectable nor an input.
  pub const STATIC_CURSOR: &str = "static-cursor";
  /// A hit-test probe inside an overlay reached something other than the
  /// overlay, or an overlay has no probe to prove it is on top.
  pub const OVERLAY_Z_ORDER: &str = "overlay-z-order";
  /// Text cut off without intended ellipsis.
  pub const TEXT_TRUNCATION: &str = "text-truncation";

  pub const ALL: [&str; 12] = [
    PARENT_CLIP_FAULT,
    ZERO_OPACITY_HIT_THROUGH,
    MIN_HIT_TARGET,
    CONCENTRIC_CORNER_RADIUS,
    OFF_VIEWPORT_FOCUS,
    PIXEL_ALIGNMENT,
    FIRST_LINE_BASELINE,
    FOOTER_REVERSE_WRAP,
    DIVIDER_PLACEMENT,
    STATIC_CURSOR,
    OVERLAY_Z_ORDER,
    TEXT_TRUNCATION,
  ];
}

/// Runs every rule. Per-element rules report in element id order, then the
/// group rules follow in [`rules::ALL`] order.
pub fn audit_frame_snapshot(snapshot: &FrameSnapshot) -> Vec<AuditViolation> {
  let mut out = Vec::new();
  for el in snapshot.elements.values() {
    element_rules(snapshot, el, &mut out);
  }
  hit_through_probes(snapshot, &mut out);
  first_line_baseline(snapshot, &mut out);
  footer_reverse_wrap(snapshot, &mut out);
  divider_placement(snapshot, &mut out);
  overlay_z_order(snapshot, &mut out);
  out
}

fn push(out: &mut Vec<AuditViolation>, rule: &str, el: &DebugElementSnapshot, message: String) {
  out.push(AuditViolation {
    rule: rule.into(),
    element_id: el.id.clone(),
    callsite: el.callsite.clone(),
    message,
  });
}

fn element_rules(snapshot: &FrameSnapshot, el: &DebugElementSnapshot, out: &mut Vec<AuditViolation>) {
  let b = el.bounds;
  let m = el.content_mask;
  if !b.is_empty()
    && (b.x + ALIGN_TOLERANCE < m.x
      || b.y + ALIGN_TOLERANCE < m.y
      || b.right() - ALIGN_TOLERANCE > m.right()
      || b.bottom() - ALIGN_TOLERANCE > m.bottom())
  {
    push(
      out,
      rules::PARENT_CLIP_FAULT,
      el,
      format!("bounds {b:?} extend past content_mask {m:?}"),
    );
  }

  if el.interactive && el.opacity <= 0.0 {
    push(
      out,
      rules::ZERO_OPACITY_HIT_THROUGH,
      el,
      "interactive element has zero opacity".into(),
    );
  }

  if el.interactive && (b.width < MIN_HIT_TARGET || b.height < MIN_HIT_TARGET) {
    push(
      out,
      rules::MIN_HIT_TARGET,
      el,
      format!(
        "interactive hit target {}x{} is smaller than {MIN_HIT_TARGET}x{MIN_HIT_TARGET}",
        b.width, b.height
      ),
    );
  }

  if el.corner_radius < 0.0 {
    push(
      out,
      rules::CONCENTRIC_CORNER_RADIUS,
      el,
      format!("negative corner radius {}", el.corner_radius),
    );
  } else if let Some(parent) = el.parent_id.as_ref().and_then(|p| snapshot.elements.get(p))
    && parent.corner_radius > 0.0
    && el.corner_radius > 0.0
    && parent.padding > 0.0
  {
    let limit = (parent.corner_radius - parent.padding).max(MIN_RADIUS_STEP);
    if el.corner_radius > limit + ALIGN_TOLERANCE {
      push(
        out,
        rules::CONCENTRIC_CORNER_RADIUS,
        el,
        format!(
          "inner radius {} exceeds concentric limit {limit} (parent radius {} - padding {}, at least \
           {MIN_RADIUS_STEP})",
          el.corner_radius, parent.corner_radius, parent.padding
        ),
      );
    }
  }

  let v = snapshot.viewport;
  if el.focused && (b.right() <= v.x || b.x >= v.right() || b.bottom() <= v.y || b.y >= v.bottom()) {
    push(
      out,
      rules::OFF_VIEWPORT_FOCUS,
      el,
      format!("focused element {b:?} lies outside viewport {v:?}"),
    );
  }

  let off_grid = |x: f32| (x - x.round()).abs() > 0.01;
  if off_grid(b.x) || off_grid(b.y) || off_grid(b.width) || off_grid(b.height) {
    push(
      out,
      rules::PIXEL_ALIGNMENT,
      el,
      format!("bounds {b:?} are not aligned to 1x pixel grid"),
    );
  }

  match el.cursor {
    Some(CursorStyle::Pointer) if !el.interactive => {
      push(
        out,
        rules::STATIC_CURSOR,
        el,
        "pointer cursor on a non-interactive element".into(),
      );
    }
    Some(CursorStyle::Text) if !el.selectable && el.role != ElementRole::Input => {
      push(
        out,
        rules::STATIC_CURSOR,
        el,
        "text cursor on content that is not selectable".into(),
      );
    }
    _ => {}
  }

  if el.is_visible() && el.text_metrics.is_some_and(|t| t.overflowed && !t.ellipsis_allowed) {
    push(
      out,
      rules::TEXT_TRUNCATION,
      el,
      "text is cut off without intended ellipsis".into(),
    );
  }
}

/// A point the renderer delivered to an invisible element is a hit-through,
/// whether or not the element registered listeners.
fn hit_through_probes(snapshot: &FrameSnapshot, out: &mut Vec<AuditViolation>) {
  for probe in &snapshot.hit_probes {
    let Some(el) = probe.receiver.as_ref().and_then(|r| snapshot.elements.get(r)) else {
      continue;
    };
    let already = el.interactive && el.opacity <= 0.0;
    if el.opacity <= INVISIBLE_OPACITY && !already {
      push(
        out,
        rules::ZERO_OPACITY_HIT_THROUGH,
        el,
        format!(
          "receives pointer events at ({}, {}) while invisible (opacity {})",
          probe.x, probe.y, el.opacity
        ),
      );
    }
  }
}

/// Visible elements grouped by `key`, in first-seen (id) order.
fn groups<'a>(
  snapshot: &'a FrameSnapshot,
  key: impl Fn(&'a DebugElementSnapshot) -> Option<&'a str>,
) -> Vec<Vec<&'a DebugElementSnapshot>> {
  let mut out: Vec<(&str, Vec<&DebugElementSnapshot>)> = Vec::new();
  for el in snapshot.elements.values().filter(|e| e.is_visible()) {
    if let Some(k) = key(el) {
      match out.iter_mut().find(|(g, _)| *g == k) {
        Some((_, members)) => members.push(el),
        None => out.push((k, vec![el])),
      }
    }
  }
  out.into_iter().map(|(_, members)| members).collect()
}

fn first_line_baseline(snapshot: &FrameSnapshot, out: &mut Vec<AuditViolation>) {
  for group in groups(snapshot, |e| e.baseline_group.as_deref()) {
    // The main text: most lines, then the tallest first line, then id.
    let anchor = group
      .iter()
      .filter_map(|e| e.text_metrics.map(|t| (*e, t)))
      .max_by(|(a, ta), (b, tb)| {
        (ta.line_count, ta.first_line.height)
          .partial_cmp(&(tb.line_count, tb.first_line.height))
          .unwrap_or(std::cmp::Ordering::Equal)
          .then_with(|| b.id.cmp(&a.id))
      });
    let Some((anchor, at)) = anchor else {
      for el in &group {
        push(
          out,
          rules::FIRST_LINE_BASELINE,
          el,
          "baseline group has no text metrics to align to".into(),
        );
      }
      continue;
    };
    let line_center = at.first_line.center_y();
    for el in group.iter().filter(|e| e.id != anchor.id) {
      match (el.text_metrics, &el.text) {
        (Some(t), _) => {
          if (t.first_baseline - at.first_baseline).abs() > ALIGN_TOLERANCE {
            push(
              out,
              rules::FIRST_LINE_BASELINE,
              el,
              format!(
                "first baseline at {} but `{}` sets it at {}",
                t.first_baseline, anchor.id, at.first_baseline
              ),
            );
          }
        }
        (None, Some(_)) => push(
          out,
          rules::FIRST_LINE_BASELINE,
          el,
          "text in a baseline group without text metrics".into(),
        ),
        (None, None) => {
          let c = el.bounds.center_y();
          if (c - line_center).abs() > ALIGN_TOLERANCE {
            let whole_block = at.line_count > 1 && (c - anchor.bounds.center_y()).abs() <= ALIGN_TOLERANCE;
            push(
              out,
              rules::FIRST_LINE_BASELINE,
              el,
              format!(
                "centered at {c} but the first line of `{}` centers at {line_center}{}",
                anchor.id,
                if whole_block {
                  " (centered on the whole text block)"
                } else {
                  ""
                }
              ),
            );
          }
        }
      }
    }
  }
}

fn footer_reverse_wrap(snapshot: &FrameSnapshot, out: &mut Vec<AuditViolation>) {
  let priority = |e: &DebugElementSnapshot| e.footer.as_ref().map_or(u32::MAX, |f| f.priority);
  for group in groups(snapshot, |e| e.footer.as_ref().map(|f| f.group.as_str())) {
    if group.len() < 2 {
      continue;
    }
    // Rows top to bottom: a new row starts more than half a button height
    // below the current row's first center.
    let mut by_y = group.clone();
    by_y.sort_by(|a, b| a.bounds.center_y().total_cmp(&b.bounds.center_y()));
    let mut row_of: HashMap<&str, usize> = HashMap::new();
    let (mut row, mut row_center) = (0, by_y[0].bounds.center_y());
    for el in &by_y {
      if el.bounds.center_y() - row_center > el.bounds.height.min(by_y[0].bounds.height) / 2.0 {
        row += 1;
        row_center = el.bounds.center_y();
      }
      row_of.insert(el.id.as_str(), row);
    }
    let row = |e: &DebugElementSnapshot| row_of[e.id.as_str()];
    for a in &group {
      if let Some(b) = group.iter().find(|b| priority(a) < priority(b) && row(a) < row(b)) {
        push(
          out,
          rules::FOOTER_REVERSE_WRAP,
          a,
          format!("more important action wraps above less important `{}`", b.id),
        );
      }
    }
    let top = group.iter().map(|e| priority(e)).min().unwrap_or(0);
    for primary in group.iter().filter(|e| priority(e) == top) {
      if let Some(left) = group
        .iter()
        .find(|o| row(o) == row(primary) && priority(o) > top && o.bounds.x < primary.bounds.x)
      {
        push(
          out,
          rules::FOOTER_REVERSE_WRAP,
          primary,
          format!("primary action is not leftmost: `{}` precedes it", left.id),
        );
      }
    }
  }
}

fn divider_placement(snapshot: &FrameSnapshot, out: &mut Vec<AuditViolation>) {
  let mut siblings: Vec<(Option<&str>, Vec<&DebugElementSnapshot>)> = Vec::new();
  for el in snapshot.elements.values().filter(|e| e.is_visible()) {
    let parent = el.parent_id.as_deref();
    match siblings.iter_mut().find(|(p, _)| *p == parent) {
      Some((_, list)) => list.push(el),
      None => siblings.push((parent, vec![el])),
    }
  }
  let is_divider = |e: &DebugElementSnapshot| e.role == ElementRole::Divider;
  for (_, mut list) in siblings {
    // Layout order: top to bottom, then left to right.
    list.sort_by(|a, b| {
      (a.bounds.y, a.bounds.x)
        .partial_cmp(&(b.bounds.y, b.bounds.x))
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.id.cmp(&b.id))
    });
    let last = list.len() - 1;
    for (i, el) in list.iter().enumerate().filter(|(_, e)| is_divider(e)) {
      if i == 0 {
        push(
          out,
          rules::DIVIDER_PLACEMENT,
          el,
          "divider before the first item".into(),
        );
      } else if is_divider(list[i - 1]) {
        push(
          out,
          rules::DIVIDER_PLACEMENT,
          el,
          format!("double divider after `{}`", list[i - 1].id),
        );
      }
      if i == last && i != 0 {
        push(out, rules::DIVIDER_PLACEMENT, el, "divider after the last item".into());
      }
    }
  }
}

fn overlay_z_order(snapshot: &FrameSnapshot, out: &mut Vec<AuditViolation>) {
  let within = |id: &str, root: &str| {
    let mut cur = Some(id);
    for _ in 0..=snapshot.elements.len() {
      match cur {
        Some(c) if c == root => return true,
        Some(c) => cur = snapshot.elements.get(c).and_then(|e| e.parent_id.as_deref()),
        None => return false,
      }
    }
    false
  };
  for overlay in snapshot
    .elements
    .values()
    .filter(|e| e.role == ElementRole::Overlay && e.is_visible())
  {
    let probes: Vec<_> = snapshot
      .hit_probes
      .iter()
      .filter(|p| overlay.bounds.contains_point(p.x, p.y))
      .collect();
    if probes.is_empty() {
      push(
        out,
        rules::OVERLAY_Z_ORDER,
        overlay,
        "no hit-test probe inside the overlay to prove it is on top".into(),
      );
    }
    for probe in probes {
      match &probe.receiver {
        Some(r) if within(r, &overlay.id) => {}
        receiver => push(
          out,
          rules::OVERLAY_Z_ORDER,
          overlay,
          format!(
            "point ({}, {}) inside the overlay reaches {}",
            probe.x,
            probe.y,
            receiver.as_deref().map_or("nothing".to_owned(), |r| format!("`{r}`"))
          ),
        ),
      }
    }
  }
}
