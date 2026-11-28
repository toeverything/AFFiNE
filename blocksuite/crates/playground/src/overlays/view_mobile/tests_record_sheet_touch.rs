//! Deterministic regression tests for collaborative record sheet release, single-truth record
//! sheet wrapping & touch ownership, RTL mobile database view-tab swiping, Edgeless connector
//! multiline growth & frame title inline-edit alignment, touch selection menu dismissal, linked
//! document navigation, and table-cell vertical `goal_x` + paragraph triple-click.

use std::{rc::Rc, time::Duration};

use blocksuite_playground_doc::schema::{
    BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, ParagraphType,
};
use ui::{
    AppContext, Bounds, Direction, HeadlessPlatform, Modifiers, MouseButton, MouseDownEvent,
    PlatformInput, TouchEvent, TouchId, TouchPhase, WindowBounds, WindowOptions, point, px, size,
};

use crate::{
    FormFactor, HOME_PAGE_ID, PlaygroundOptions, PlaygroundView, database::DatabaseHitKind,
    room_client::DocState,
};

struct TestHarness {
    platform: Rc<HeadlessPlatform>,
    app: ui::ApplicationHandle,
    win: ui::WindowHandle<PlaygroundView>,
    hw: ui::HeadlessWindow,
}

impl TestHarness {
    fn open(w: u32, h: u32, options: PlaygroundOptions, state: DocState) -> Self {
        let platform = HeadlessPlatform::new(w, h, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(w as f32), px(h as f32)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        let mut v = PlaygroundView::with_options(options, cx);
                        v.set_document(state, cx);
                        v
                    })
                },
            )
            .unwrap()
        });
        let hw = platform.windows().into_iter().next().unwrap();
        let h = Self {
            platform,
            app,
            win,
            hw,
        };
        h.pump();
        h
    }

    fn pump(&self) {
        for _ in 0..3 {
            self.hw.request_frame();
            self.platform.run_until_parked();
        }
    }

    fn view<R>(
        &self,
        f: impl FnOnce(&mut PlaygroundView, &mut ui::Window, &mut ui::Context<PlaygroundView>) -> R,
    ) -> R {
        self.app.update(|cx| self.win.update(cx, f).unwrap())
    }

    fn snap(&self) -> ui::FrameSnapshot {
        self.pump();
        self.view(|_, w, _| w.frame_snapshot().clone())
    }

    fn save_evidence_png(&self, filename: &str) {
        self.pump();
        if let Ok(dir) = std::env::var("P5_EVIDENCE_DIR") {
            let _ = std::fs::create_dir_all(&dir);
            self.view(|_, w, _| {
                if let Ok(img) = w.render_to_image() {
                    let _ = img.save(format!("{dir}/{filename}"));
                }
            });
        }
    }

    fn touch(&self, id: u64, phase: TouchPhase, x: f32, y: f32) {
        self.hw.dispatch_input(PlatformInput::Touch(TouchEvent {
            id: TouchId(id),
            phase,
            position: point(px(x), px(y)),
            predicted_position: None,
            force: None,
        }));
        self.platform.run_until_parked();
        self.pump();
    }

    fn finger(&self, id: u64, x0: f32, y0: f32, x1: f32, y1: f32, steps: usize, step_ms: u64) {
        self.touch(id, TouchPhase::Started, x0, y0);
        for i in 1..=steps {
            if step_ms > 0 {
                self.platform.advance_clock(Duration::from_millis(step_ms));
            }
            let t = i as f32 / steps as f32;
            self.touch(
                id,
                TouchPhase::Moved,
                x0 + (x1 - x0) * t,
                y0 + (y1 - y0) * t,
            );
        }
        if step_ms > 0 {
            self.platform.advance_clock(Duration::from_millis(step_ms));
        }
        self.touch(id, TouchPhase::Ended, x1, y1);
    }

    fn settle(&self, ms: u64) {
        for _ in 0..(ms / 16) {
            self.platform.advance_clock(Duration::from_millis(16));
            self.pump();
        }
    }
}

fn para(text: &str) -> BlockSpec {
    BlockSpec::Paragraph {
        paragraph_type: ParagraphType::Text,
        text: text.into(),
    }
}

fn build_record_sheet_doc(extra_wrapping_fields: usize) -> DocState {
    let mut state = DocState::new("record-sheet-doc", 301).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Records", 1)
        .unwrap();
    let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "Records".into(),
        },
        None,
        None,
        1,
    )
    .unwrap();
    page.add_block(
        "note",
        BlockSpec::Note { xywh: None },
        Some("root"),
        None,
        2,
    )
    .unwrap();
    for i in 0..30_u64 {
        page.add_block(
            format!("p-{i}"),
            para("Filler paragraph so the underlying page has ample scroll range."),
            Some("note"),
            None,
            10 + i,
        )
        .unwrap();
    }
    let mut spec = PlaygroundView::showcase_database_spec();
    for i in 1..=extra_wrapping_fields {
        let id = format!("col-extra-{i:02}");
        spec.columns.push(DatabaseColumnSpec {
            id: id.clone(),
            column_type: if i == extra_wrapping_fields {
                "link".into()
            } else {
                "rich-text".into()
            },
            name: format!("Extra {i:02}"),
            data: serde_json::json!({}),
        });
        let val = if i == extra_wrapping_fields {
            "https://affine.pro/workspace/docs/very-long-unbroken-segment-for-character-wrap-verification-2026".to_string()
        } else {
            format!(
                "value {i:02} with a longer piece of descriptive text that must wrap cleanly inside the sheet without clipping"
            )
        };
        spec.cells
            .entry("showcase-db-row-1".to_string())
            .or_default()
            .insert(id, DatabaseCellSpec::Text(val));
    }
    page.add_block("db", BlockSpec::Database(spec), Some("note"), None, 100)
        .unwrap();
    page.add_block(
        "showcase-db-row-1",
        para("A long record title that wraps onto multiple lines inside the top card"),
        Some("db"),
        None,
        101,
    )
    .unwrap();
    state
}

#[test]
fn record_sheet_remote_delete_releases_scroll_immediately() {
    let local_state = build_record_sheet_doc(2);
    let initial_update = local_state
        .workspace
        .page(HOME_PAGE_ID)
        .unwrap()
        .encode_update_v1()
        .unwrap();
    let mut remote_state = DocState::new("record-sheet-doc", 302).unwrap();
    remote_state
        .workspace
        .create_page(HOME_PAGE_ID, "Records", 1)
        .unwrap();
    remote_state
        .workspace
        .ensure_page(HOME_PAGE_ID)
        .unwrap()
        .apply_remote_update_v1(&initial_update)
        .unwrap();

    let h = TestHarness::open(
        390,
        844,
        PlaygroundOptions::for_form_factor(FormFactor::Phone),
        local_state,
    );
    h.view(|v, _, cx| v.open_database_record_sheet("db", "showcase-db-row-1", cx));
    h.pump();
    assert!(h.view(|v, _, _| v.database_record_sheet().is_some()));

    // Remote collaborator deletes the database block and syncs delta to local replica.
    let remote_del = remote_state
        .workspace
        .ensure_page(HOME_PAGE_ID)
        .unwrap()
        .delete_block_subtree("note", "db", 500)
        .unwrap()
        .unwrap();
    h.view(|v, _, cx| {
        v.edit_document(cx, |doc| {
            doc.workspace
                .ensure_page(HOME_PAGE_ID)
                .unwrap()
                .apply_remote_update_v1(&remote_del.update)
                .unwrap();
        });
    });
    h.pump();
    assert!(
        h.view(|v, _, _| v.database_record_sheet().is_none()),
        "record sheet state must auto-clear when its database is deleted remotely"
    );

    // Immediately drag up 200px: page must scroll without needing Back.
    h.finger(1, 195.0, 560.0, 195.0, 360.0, 8, 12);
    let scroll_y = h.view(|v, _, _| v.scroll_y);
    assert!(
        scroll_y > 0.0,
        "page must scroll immediately after remote database deletion, got scroll_y={scroll_y}"
    );
}

#[test]
fn record_sheet_wrapping_max_scroll_and_touch_owner_isolation() {
    for (w, h_px) in [(390_u32, 844_u32), (320_u32, 568_u32)] {
        let h = TestHarness::open(
            w,
            h_px,
            PlaygroundOptions::for_form_factor(FormFactor::Phone),
            build_record_sheet_doc(8),
        );
        // First scroll the underlying page via touch finger (latches TouchStrokeOwner::Page),
        // then verify opening the Record sheet resets ownership so sheet scrolling never leaks.
        h.finger(1, 195.0, 560.0, 195.0, 320.0, 8, 12);
        h.settle(400);
        let page_y_before = h.view(|v, _, _| v.scroll_y);
        assert!(page_y_before > 50.0);

        h.view(|v, _, cx| v.open_database_record_sheet("db", "showcase-db-row-1", cx));
        let snap = h.snap();
        let sheet_b = snap.elements["overlay.database_record_sheet"].bounds;
        let sheet_right = sheet_b.x + sheet_b.width;
        // Drag inside the Record sheet body after a prior Page scroll: sheet scrolls, page stays fixed.
        h.finger(
            2,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + sheet_b.height * 0.75,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + sheet_b.height * 0.35,
            8,
            12,
        );
        assert!(
            h.view(|v, _, _| v.database_record_sheet().unwrap().scroll_y) > 0.0,
            "{w}x{h_px}: dragging inside record sheet after a page touch scroll must scroll the sheet"
        );
        assert_eq!(
            h.view(|v, _, _| v.scroll_y),
            page_y_before,
            "{w}x{h_px}: dragging inside record sheet after a page touch scroll must not leak to page"
        );
        h.view(|v, _, cx| {
            let s = v.database_record_sheet.as_mut().unwrap();
            s.scroll_fling = None;
            s.scroll_y = 0.0;
            cx.notify();
        });
        let snap = h.snap();

        // Every rendered field & URL box must stay within sheet width and wrap multi-line.
        let mut wrapped_count = 0;
        for (id, el) in &snap.elements {
            if id.starts_with("overlay.database_record_sheet.field.")
                || id.starts_with("overlay.database_record_sheet.url.")
            {
                assert!(
                    el.bounds.x + el.bounds.width <= sheet_right + 0.5,
                    "{w}x{h_px}: {id} overflows sheet right ({} > {})",
                    el.bounds.x + el.bounds.width,
                    sheet_right
                );
                if el.bounds.height > 24.0 {
                    wrapped_count += 1;
                }
            }
        }
        assert!(
            wrapped_count >= 1,
            "{w}x{h_px}: long text/URL fields must wrap to multiple lines"
        );

        // Scroll to max_scroll and verify Hidden fields toggle sits flush above bottom padding.
        let max_s = h.view(|v, win, _| v.record_sheet_geometry(win).unwrap().4);
        assert!(max_s > 0.0);
        h.view(|v, _, cx| {
            v.database_record_sheet.as_mut().unwrap().scroll_y = max_s;
            cx.notify();
        });
        let end_snap = h.snap();
        if w == 390 {
            h.save_evidence_png("p5-record-sheet-390-after.png");
        }
        let hidden_b = end_snap.elements["overlay.database_record_sheet.hidden_toggle"].bounds;
        let bottom_gap = (sheet_b.y + sheet_b.height) - (hidden_b.y + hidden_b.height);
        assert!(
            (15.0..=32.0).contains(&bottom_gap),
            "{w}x{h_px}: bottom gap below hidden_toggle at max_scroll must match bottom padding, got {bottom_gap}"
        );

        // Pull 40px (< 56px) on grabber: sheet stays open and sheet scroll_y does not wiggle.
        let sheet_y_before = h.view(|v, _, _| v.database_record_sheet().unwrap().scroll_y);
        h.finger(
            10,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + 8.0,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + 48.0,
            6,
            16,
        );
        assert!(h.view(|v, _, _| v.database_record_sheet().is_some()));
        assert_eq!(
            h.view(|v, _, _| v.database_record_sheet().unwrap().scroll_y),
            sheet_y_before,
            "{w}x{h_px}: sub-threshold grabber pull must not scroll sheet body"
        );

        // Slow 200px pull down on grabber: closes sheet and leaves page scroll_y unchanged (delta == 0).
        h.finger(
            11,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + 8.0,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + 208.0,
            10,
            16,
        );
        h.settle(400);
        assert!(h.view(|v, _, _| v.database_record_sheet().is_none()));
        assert_eq!(
            h.view(|v, _, _| v.scroll_y),
            page_y_before,
            "{w}x{h_px}: slow pull-to-close must not move underlying page"
        );

        // Fast flick 160px / 120ms down on grabber: closes sheet with zero leaked page fling.
        h.view(|v, _, cx| v.open_database_record_sheet("db", "showcase-db-row-1", cx));
        h.pump();
        h.finger(
            12,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + 8.0,
            sheet_b.x + sheet_b.width * 0.5,
            sheet_b.y + 168.0,
            8,
            15,
        );
        h.settle(600);
        assert!(h.view(|v, _, _| v.database_record_sheet().is_none()));
        assert_eq!(
            h.view(|v, _, _| v.scroll_y),
            page_y_before,
            "{w}x{h_px}: fast flick pull-to-close must not leak momentum to underlying page"
        );
    }
}

#[test]
fn rtl_mobile_database_view_tabs_swipe_exposes_and_activates_last_view() {
    let mut state = DocState::new("rtl-tabs", 310).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "RTL Tabs", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "RTL Tabs".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        let mut spec = PlaygroundView::showcase_database_spec();
        let proto = spec.views[0].clone();
        spec.views.clear();
        for i in 0..10 {
            let mut v = proto.clone();
            v.id = format!("v-{i}");
            v.name = format!("View {i}");
            spec.views.push(v);
        }
        page.add_block("db-rtl", BlockSpec::Database(spec), Some("note"), None, 3)
            .unwrap();
        page.add_block("showcase-db-row-1", para("Row"), Some("db-rtl"), None, 4)
            .unwrap();
    }

    let h = TestHarness::open(
        390,
        844,
        PlaygroundOptions::for_form_factor(FormFactor::Phone),
        state,
    );
    h.view(|_, w, _| w.set_root_layout_direction(Direction::Rtl));
    h.pump();

    let (block_x, block_y, max_scroll) = h.view(|v, _, _| {
        let layout = v.flow_layout().unwrap();
        let b = layout.block("db-rtl").unwrap();
        (b.x, b.y, v.flow.database_view_tabs_max_scroll("db-rtl"))
    });
    assert!(max_scroll > 100);
    let strip_y = crate::TOPBAR_HEIGHT + block_y + 54.0;

    // Swipe finger RIGHT (dx > 0) in RTL to reveal trailing views v-9 on the left side.
    for step in 0..5_u64 {
        h.finger(30 + step, 80.0, strip_y, 320.0, strip_y, 6, 0);
    }
    let scroll_px = h.view(|v, _, _| {
        v.flow
            .database_state
            .state_for("db-rtl")
            .view_tabs_scroll_px
    });
    assert!(
        scroll_px >= max_scroll - 2,
        "RTL rightward swipe must advance view_tabs_scroll_px to expose v-9 (got {scroll_px}/{max_scroll})"
    );

    let v9_hit = h.view(|v, _, _| {
        v.database_hits("db-rtl")
            .iter()
            .find(|hit| matches!(&hit.kind, DatabaseHitKind::SwitchView { view_id } if view_id == "v-9"))
            .cloned()
            .expect("v-9 tab must be visible and hittable after RTL swipe")
    });
    let geom = crate::page_geometry(390.0);
    let click_pt = point(
        px(geom.column_x + block_x + v9_hit.rect.x + v9_hit.rect.w * 0.5),
        px(crate::TOPBAR_HEIGHT + block_y + v9_hit.rect.y + v9_hit.rect.h * 0.5),
    );
    h.view(|v, w, cx| {
        v.page_mouse_down(
            &MouseDownEvent {
                button: MouseButton::Left,
                position: click_pt,
                modifiers: Modifiers::default(),
                click_count: 1,
                first_mouse: false,
            },
            w,
            cx,
        );
    });
    assert_eq!(
        h.view(|v, _, _| v
            .flow
            .database_state
            .state_for("db-rtl")
            .active_view_id
            .clone()),
        Some("v-9".to_string())
    );
}

#[test]
fn kanban_and_record_sheet_render_graphical_checkbox_and_progress() {
    let mut state = DocState::new("checkbox-progress", 322).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Database Controls", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Database Controls".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        let mut spec = PlaygroundView::showcase_database_spec();
        if let Some(kanban) = spec.views.iter_mut().find(|v| v.id == "view-kanban") {
            kanban.raw = serde_json::json!({
                "columns": [
                    {"id": "title"},
                    {"id": "col-progress"},
                    {"id": "col-done"},
                    {"id": "col-tags"},
                    {"id": "col-start", "hide": true},
                    {"id": "col-end", "hide": true},
                    {"id": "col-budget", "hide": true}
                ],
                "filter": {"type": "group", "op": "and", "conditions": []},
                "groupBy": {
                    "type": "groupBy",
                    "columnId": "col-status",
                    "name": "select",
                    "hideEmpty": false
                },
                "groupProperties": [
                    {"key": "opt-todo", "hide": false, "manuallyCardSort": []},
                    {"key": "opt-doing", "hide": false, "manuallyCardSort": []},
                    {"key": "opt-done", "hide": false, "manuallyCardSort": []}
                ],
                "header": {"titleColumn": "title", "iconColumn": "type"}
            });
        }
        page.add_block("db", BlockSpec::Database(spec), Some("note"), None, 10)
            .unwrap();
        page.add_block(
            "showcase-db-row-1",
            para("Ship graphical checkbox & progress"),
            Some("db"),
            None,
            11,
        )
        .unwrap();
        page.add_block(
            "showcase-db-row-2",
            para("Verify unchecked state"),
            Some("db"),
            None,
            12,
        )
        .unwrap();
    }
    let h = TestHarness::open(
        390,
        844,
        PlaygroundOptions::for_form_factor(FormFactor::Phone),
        state,
    );
    h.view(|v, _, cx| {
        v.set_database_active_view("db", "view-kanban", cx);
    });
    h.pump();
    h.view(|v, _, cx| {
        v.open_database_record_sheet("db", "showcase-db-row-1", cx);
    });
    let snap = h.snap();
    assert!(snap.elements.contains_key("overlay.database_record_sheet"));
    h.save_evidence_png("p5-checkbox-progress-after.png");
}
