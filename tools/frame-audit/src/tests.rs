use super::*;

const VIEW: SnapshotRect = SnapshotRect::new(0.0, 0.0, 390.0, 800.0);

fn el(id: &str, x: f32, y: f32, w: f32, h: f32) -> DebugElementSnapshot {
  DebugElementSnapshot::new(id, SnapshotRect::new(x, y, w, h), VIEW).with_parent("root")
}

fn button(id: &str, parent: &str, x: f32, y: f32) -> DebugElementSnapshot {
  el(id, x, y, 100.0, 32.0)
    .with_parent(parent)
    .with_interactive(true)
    .with_cursor(CursorStyle::Pointer)
}

/// Text whose first line starts at `top` with `line` height and a baseline
/// three quarters down the line.
fn text(id: &str, x: f32, top: f32, line: f32, lines: u32) -> DebugElementSnapshot {
  el(id, x, top, 200.0, line * lines as f32)
    .with_text(id)
    .with_text_metrics(TextMetrics {
      first_baseline: top + line * 0.75,
      first_line: SnapshotRect::new(x, top, 200.0, line),
      line_count: lines,
      overflowed: false,
      ellipsis_allowed: false,
    })
}

fn frame(elements: Vec<DebugElementSnapshot>, probes: &[(f32, f32, Option<&str>)]) -> FrameSnapshot {
  let mut f = FrameSnapshot::new(VIEW.width, VIEW.height, 1.0);
  f.record(DebugElementSnapshot::new("root", VIEW, VIEW));
  for e in elements {
    f.record(e);
  }
  for (x, y, r) in probes {
    f.record_hit_probe(*x, *y, r.map(str::to_owned));
  }
  f
}

fn card() -> DebugElementSnapshot {
  el("card", 10.0, 200.0, 370.0, 120.0)
    .with_corner_radius(16.0)
    .with_padding(8.0)
}

fn overlay(id: &str, x: f32, y: f32, w: f32, h: f32) -> DebugElementSnapshot {
  el(id, x, y, w, h).with_role(ElementRole::Overlay)
}

fn list_item(id: &str, y: f32, h: f32, role: ElementRole) -> DebugElementSnapshot {
  el(id, 0.0, y, 200.0, h).with_parent("list").with_role(role)
}

/// (case, frame, expected `(rule, element)` violations).
type Case = (&'static str, FrameSnapshot, Vec<(&'static str, &'static str)>);

fn cases() -> Vec<Case> {
  use ElementRole::{Divider, Generic, Input};
  let g = |e: DebugElementSnapshot| e.with_baseline_group("row");
  let icon = |center: f32| g(el("row.icon", 10.0, center - 8.0, 16.0, 16.0));
  vec![
    (
      "one frame obeying every rule",
      frame(
        vec![
          g(text("row.title", 40.0, 100.0, 20.0, 3)),
          icon(110.0),
          g(text("row.meta", 180.0, 103.0, 16.0, 1)),
          card(),
          button("card.secondary", "card", 18.0, 240.0)
            .with_corner_radius(8.0)
            .with_footer("actions", 1),
          button("card.primary", "card", 18.0, 280.0)
            .with_corner_radius(8.0)
            .with_footer("actions", 0),
          el("list", 0.0, 400.0, 200.0, 100.0),
          list_item("a", 400.0, 20.0, Generic),
          list_item("d1", 420.0, 1.0, Divider),
          list_item("b", 421.0, 20.0, Generic),
          list_item("hidden", 441.0, 20.0, Generic).with_opacity(0.0),
          list_item("d2", 441.0, 1.0, Divider),
          list_item("c", 462.0, 20.0, Generic),
          el("field", 0.0, 520.0, 200.0, 32.0)
            .with_role(Input)
            .with_cursor(CursorStyle::Text),
          el("body", 0.0, 560.0, 200.0, 20.0)
            .with_selectable(true)
            .with_cursor(CursorStyle::Text),
          overlay("menu", 200.0, 100.0, 120.0, 100.0),
          button("menu.item", "menu", 204.0, 104.0),
          el("row.close", 360.0, 100.0, 24.0, 24.0).with_opacity(0.0),
          text("name", 0.0, 600.0, 20.0, 1).with_text_metrics(TextMetrics {
            overflowed: true,
            ellipsis_allowed: true,
            ..text("name", 0.0, 600.0, 20.0, 1).text_metrics.unwrap()
          }),
        ],
        &[(210.0, 110.0, Some("menu.item")), (370.0, 110.0, Some("root"))],
      ),
      vec![],
    ),
    (
      "the six structural classes",
      {
        let mut f = FrameSnapshot::new(400.0, 300.0, 1.0);
        f.record(
          DebugElementSnapshot::new(
            "parent.pill",
            SnapshotRect::new(10.0, 10.0, 100.0, 40.0),
            SnapshotRect::new(0.0, 0.0, 400.0, 300.0),
          )
          .with_corner_radius(10.0)
          .with_padding(4.0),
        );
        f.record(
          DebugElementSnapshot::new(
            "child.bad_btn",
            SnapshotRect::new(14.0, 14.0, 16.0, 16.0),
            SnapshotRect::new(10.0, 10.0, 100.0, 40.0),
          )
          .with_parent("parent.pill")
          .with_interactive(true)
          .with_opacity(0.0)
          .with_corner_radius(8.0),
        );
        f.record(
          DebugElementSnapshot::new(
            "offscreen.focus",
            SnapshotRect::new(420.3, 10.0, 40.0, 30.0),
            SnapshotRect::new(0.0, 0.0, 400.0, 300.0),
          )
          .with_focused(true),
        );
        f
      },
      vec![
        (rules::ZERO_OPACITY_HIT_THROUGH, "child.bad_btn"),
        (rules::MIN_HIT_TARGET, "child.bad_btn"),
        (rules::CONCENTRIC_CORNER_RADIUS, "child.bad_btn"),
        (rules::PARENT_CLIP_FAULT, "offscreen.focus"),
        (rules::OFF_VIEWPORT_FOCUS, "offscreen.focus"),
        (rules::PIXEL_ALIGNMENT, "offscreen.focus"),
      ],
    ),
    (
      "icon centered on the whole multi-line block",
      frame(vec![g(text("row.title", 40.0, 100.0, 20.0, 3)), icon(130.0)], &[]),
      vec![(rules::FIRST_LINE_BASELINE, "row.icon")],
    ),
    (
      "smaller meta text box-centered above the baseline",
      frame(
        vec![
          g(text("row.title", 40.0, 100.0, 20.0, 1)),
          g(text("row.meta", 180.0, 102.0, 16.0, 1)),
        ],
        &[],
      ),
      vec![(rules::FIRST_LINE_BASELINE, "row.meta")],
    ),
    (
      "baseline group without any text metrics",
      frame(
        vec![
          icon(110.0),
          g(el("row.label", 40.0, 100.0, 200.0, 20.0).with_text("label")),
        ],
        &[],
      ),
      vec![
        (rules::FIRST_LINE_BASELINE, "row.icon"),
        (rules::FIRST_LINE_BASELINE, "row.label"),
      ],
    ),
    (
      "grouped text missing its metrics",
      frame(
        vec![
          g(text("row.title", 40.0, 100.0, 20.0, 1)),
          g(el("row.label", 300.0, 100.0, 60.0, 20.0).with_text("label")),
        ],
        &[],
      ),
      vec![(rules::FIRST_LINE_BASELINE, "row.label")],
    ),
    (
      "forward wrap pushes the primary action up",
      frame(
        vec![
          card(),
          button("card.primary", "card", 18.0, 240.0).with_footer("actions", 0),
          button("card.secondary", "card", 18.0, 280.0).with_footer("actions", 1),
        ],
        &[],
      ),
      vec![(rules::FOOTER_REVERSE_WRAP, "card.primary")],
    ),
    (
      "secondary action left of the primary",
      frame(
        vec![
          card(),
          button("card.secondary", "card", 18.0, 280.0).with_footer("actions", 1),
          button("card.primary", "card", 128.0, 280.0).with_footer("actions", 0),
        ],
        &[],
      ),
      vec![(rules::FOOTER_REVERSE_WRAP, "card.primary")],
    ),
    (
      "inner radius copied from the outer surface and a negative radius",
      frame(
        vec![
          card(),
          button("card.primary", "card", 18.0, 280.0).with_corner_radius(16.0),
          el("chip", 0.0, 600.0, 40.0, 20.0).with_corner_radius(-2.0),
        ],
        &[],
      ),
      vec![
        (rules::CONCENTRIC_CORNER_RADIUS, "card.primary"),
        (rules::CONCENTRIC_CORNER_RADIUS, "chip"),
      ],
    ),
    (
      "hidden group leaves leading, double and trailing dividers",
      frame(
        vec![
          el("list", 0.0, 400.0, 200.0, 100.0),
          list_item("lead", 400.0, 1.0, Divider),
          list_item("a", 401.0, 20.0, Generic),
          list_item("d1", 421.0, 1.0, Divider),
          list_item("hidden", 422.0, 0.0, Generic),
          list_item("d2", 422.0, 1.0, Divider),
          list_item("b", 423.0, 20.0, Generic),
          list_item("trail", 443.0, 1.0, Divider),
        ],
        &[],
      ),
      vec![
        (rules::DIVIDER_PLACEMENT, "lead"),
        (rules::DIVIDER_PLACEMENT, "d2"),
        (rules::DIVIDER_PLACEMENT, "trail"),
      ],
    ),
    (
      "pointer on a section header and text cursor on a label",
      frame(
        vec![
          el("header", 0.0, 0.0, 390.0, 32.0).with_cursor(CursorStyle::Pointer),
          el("label", 0.0, 40.0, 100.0, 20.0)
            .with_text("label")
            .with_cursor(CursorStyle::Text),
        ],
        &[],
      ),
      vec![(rules::STATIC_CURSOR, "header"), (rules::STATIC_CURSOR, "label")],
    ),
    (
      "alpha-0 hover buttons still receive the renderer's hit test",
      frame(
        vec![
          el("row.close", 300.0, 100.0, 24.0, 24.0).with_opacity(0.0),
          el("row.more", 330.0, 100.0, 24.0, 24.0)
            .with_opacity(0.0)
            .with_interactive(true),
        ],
        &[(310.0, 110.0, Some("row.close")), (340.0, 110.0, Some("row.more"))],
      ),
      vec![
        (rules::ZERO_OPACITY_HIT_THROUGH, "row.close"),
        (rules::ZERO_OPACITY_HIT_THROUGH, "row.more"),
      ],
    ),
    (
      "hover card covers the menu and a tooltip has no probe",
      frame(
        vec![
          overlay("menu", 200.0, 100.0, 120.0, 100.0),
          overlay("hover", 50.0, 50.0, 200.0, 150.0),
          el("hover.body", 60.0, 60.0, 180.0, 130.0).with_parent("hover"),
          overlay("tooltip", 0.0, 700.0, 80.0, 24.0),
        ],
        &[(210.0, 110.0, Some("hover.body")), (100.0, 100.0, Some("hover.body"))],
      ),
      vec![(rules::OVERLAY_Z_ORDER, "menu"), (rules::OVERLAY_Z_ORDER, "tooltip")],
    ),
    (
      "body text cut off without ellipsis",
      frame(
        vec![text("body", 0.0, 300.0, 20.0, 1).with_text_metrics(TextMetrics {
          overflowed: true,
          ..text("body", 0.0, 300.0, 20.0, 1).text_metrics.unwrap()
        })],
        &[],
      ),
      vec![(rules::TEXT_TRUNCATION, "body")],
    ),
  ]
}

#[test]
fn audit_cases_match_expected_violations_and_fail_every_rule() {
  let mut failed_rules = std::collections::BTreeSet::new();
  for (name, frame, expected) in cases() {
    let violations = audit_frame_snapshot(&frame);
    let mut found: Vec<(String, String)> = violations
      .iter()
      .map(|v| (v.rule.clone(), v.element_id.clone()))
      .collect();
    let mut expected: Vec<(String, String)> = expected
      .into_iter()
      .map(|(r, e)| (r.to_owned(), e.to_owned()))
      .collect();
    found.sort();
    expected.sort();
    assert_eq!(found, expected, "case: {name}\n{violations:#?}");
    for v in &violations {
      assert!(v.callsite.contains("tests.rs:"), "callsite recorded: {v:?}");
      failed_rules.insert(v.rule.clone());
    }
  }
  let mut all: Vec<String> = rules::ALL.iter().map(|r| r.to_string()).collect();
  all.sort();
  assert_eq!(
    failed_rules.into_iter().collect::<Vec<_>>(),
    all,
    "every rule has a failing case"
  );
}

#[test]
fn frame_snapshot_collection_sources_and_json_compatibility() {
  let mut frame = FrameSnapshot::new(800.0, 600.0, 1.0);
  frame.record(
    DebugElementSnapshot::new(
      "toolbar.button",
      SnapshotRect::new(10.0, 20.0, 48.0, 32.0),
      SnapshotRect::new(0.0, 0.0, 800.0, 600.0),
    )
    .with_interactive(true),
  );
  frame.record_hit_probe(20.0, 30.0, Some("toolbar.button".into()));
  assert_eq!(frame.debug_element_snapshots().len(), 1);
  let hits = frame.sources_at(20.0, 30.0);
  assert_eq!(hits.len(), 1);
  assert!(hits[0].starts_with("toolbar.button @ ") && hits[0].contains("tests.rs:"));
  assert!(frame.sources_at(500.0, 500.0).is_empty());

  let json = serde_json::to_string(&frame).unwrap();
  assert_eq!(serde_json::from_str::<FrameSnapshot>(&json).unwrap(), frame);

  // Snapshots written before the evidence fields existed still load.
  let legacy = r#"{
    "viewport": { "x": 0, "y": 0, "width": 320, "height": 640 },
    "scale_factor": 2,
    "elements": {
      "a": { "id": "a", "parent_id": null, "callsite": "x.rs:1",
             "bounds": { "x": 0, "y": 0, "width": 24, "height": 24 },
             "content_mask": { "x": 0, "y": 0, "width": 320, "height": 640 },
             "opacity": 1, "interactive": true, "focused": false,
             "corner_radius": 0, "padding": 0, "text": null }
    }
  }"#;
  let old: FrameSnapshot = serde_json::from_str(legacy).unwrap();
  assert_eq!(old.elements["a"].role, ElementRole::Generic);
  assert!(old.hit_probes.is_empty());
  assert!(audit_frame_snapshot(&old).is_empty());

  frame.reset(10.0, 10.0, 1.0);
  assert!(frame.elements.is_empty() && frame.hit_probes.is_empty());
}
