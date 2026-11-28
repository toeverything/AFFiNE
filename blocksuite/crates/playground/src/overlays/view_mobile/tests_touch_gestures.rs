//! Regression tests for touch scroll axis lock reset between independent gestures,
//! phone calendar single-source-of-truth month stepping, long Record sheet vertical scroll
//! & Escape close, and real view-tab `max_scroll` clamping.

use std::{collections::BTreeMap, time::Duration};

use blocksuite_playground_doc::schema::{
    BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec, ParagraphType,
};
use ui::{
    KeyDownEvent, Keystroke, Modifiers, PlatformInput, ScrollDelta, ScrollEvent, ScrollSource,
    TouchEvent, TouchId, TouchPhase, point, px,
};

use crate::{
    DocState, FormFactor, HOME_PAGE_ID, PlaygroundOptions,
    overlays::{ActiveSelection, OverlayEvent},
};

use super::tests::MobileSession;

#[test]
fn touch_axis_lock_calendar_month_and_record_sheet_scroll_escape() {
    // 1. Two independent raw TouchEvent gestures: vertical drag -> lift -> horizontal drag
    //    must unlock Vertical axis lock and lock Horizontal on the second gesture.
    let touch = MobileSession::open_with_options(
        390,
        844,
        PlaygroundOptions::for_form_factor(FormFactor::Phone),
    );
    let _ = touch.frame();
    let tid1 = TouchId(101);
    for (phase, y) in [
        (TouchPhase::Started, 420.0_f32),
        (TouchPhase::Moved, 380.0),
        (TouchPhase::Moved, 330.0),
        (TouchPhase::Ended, 320.0),
    ] {
        touch
            .headless
            .dispatch_input(PlatformInput::Touch(TouchEvent {
                id: tid1,
                phase,
                position: point(px(195.0), px(y)),
                predicted_position: None,
                force: None,
            }));
        touch.platform.run_until_parked();
        let _ = touch.frame();
    }
    assert_eq!(
        touch.view(|v| v.touch_scroll_axis_lock),
        None,
        "lifting first vertical touch gesture must clear touch_scroll_axis_lock"
    );
    let tid2 = TouchId(102);
    for (phase, x) in [
        (TouchPhase::Started, 300.0_f32),
        (TouchPhase::Moved, 250.0),
        (TouchPhase::Moved, 190.0),
    ] {
        touch
            .headless
            .dispatch_input(PlatformInput::Touch(TouchEvent {
                id: tid2,
                phase,
                position: point(px(x), px(400.0)),
                predicted_position: None,
                force: None,
            }));
        touch.platform.run_until_parked();
    }
    assert_eq!(
        touch.view(|v| v.touch_scroll_axis_lock),
        Some(crate::TouchScrollAxis::Horizontal),
        "second independent horizontal touch drag must switch axis lock to Horizontal"
    );
    touch
        .headless
        .dispatch_input(PlatformInput::Touch(TouchEvent {
            id: tid2,
            phase: TouchPhase::Ended,
            position: point(px(190.0), px(400.0)),
            predicted_position: None,
            force: None,
        }));
    touch.platform.run_until_parked();
    let _ = touch.frame();
    assert_eq!(touch.view(|v| v.touch_scroll_axis_lock), None);

    // 2. Phone calendar with today = 2026-12-01 and records in March 2026:
    //    header/grid/plain must show 2026-12 and next-month step must land on 2027-01.
    let dec_2026_ms = 1_796_126_400_000_i64; // 2026-12-01T12:00:00Z
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                v.set_calendar_clock(Some(std::rc::Rc::new(move || (dec_2026_ms, 0))));
                v.set_database_active_view("showcase-database", "view-calendar", cx);
            })
            .unwrap();
    });
    let _ = touch.frame();
    let plain_before = touch.view(|v| {
        v.flow_layout()
            .and_then(|l| l.block("showcase-database").map(|b| b.body.plain.clone()))
            .unwrap_or_default()
    });
    assert!(
        plain_before.contains("2026-12"),
        "Phone calendar must default to today's month 2026-12, got: {plain_before}"
    );
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                v.step_database_calendar_month("showcase-database", 1, cx);
            })
            .unwrap();
    });
    let _ = touch.frame();
    let plain_after = touch.view(|v| {
        v.flow_layout()
            .and_then(|l| l.block("showcase-database").map(|b| b.body.plain.clone()))
            .unwrap_or_default()
    });
    assert!(
        plain_after.contains("2027-01"),
        "Phone calendar next-month step from 2026-12 must advance to 2027-01, got: {plain_after}"
    );

    // 3. Long Record sheet vertical scroll + Escape close + non-overflowing view-tab max_scroll == 0.
    let mut cols = Vec::new();
    let mut row_cells = BTreeMap::new();
    let mut view_cols = vec![serde_json::json!({"id": "title", "width": 160})];
    for i in 0..14 {
        let cid = format!("col-{i}");
        cols.push(DatabaseColumnSpec {
            id: cid.clone(),
            column_type: "rich-text".into(),
            name: format!("Field {i}"),
            data: serde_json::json!({}),
        });
        row_cells.insert(cid.clone(), DatabaseCellSpec::Text(format!("Value {i}")));
        view_cols.push(serde_json::json!({"id": cid, "width": 100, "hide": i >= 12}));
    }
    let long_db = DatabaseSpec {
        title: "Long Record DB".into(),
        columns: cols,
        views: vec![DatabaseViewSpec {
            id: "v-table".into(),
            name: "Table".into(),
            mode: "table".into(),
            raw: serde_json::json!({ "columns": view_cols }),
        }],
        cells: BTreeMap::from([("row-long".to_string(), row_cells)]),
    };
    let mut state = DocState::new("long-record-sheet", 99).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Long Sheet", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Long Sheet".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note-1",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "db-long",
            BlockSpec::Database(long_db),
            Some("note-1"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "row-long",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Detailed Record with Many Properties".into(),
            },
            Some("db-long"),
            None,
            4,
        )
        .unwrap();
    }
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| v.set_document(state, cx))
            .unwrap();
    });
    let _ = touch.frame();
    assert_eq!(
        touch.view(|v| v.flow.database_view_tabs_max_scroll("db-long")),
        0,
        "single-tab database must have view_tabs_max_scroll == 0"
    );
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                v.open_database_record_sheet("db-long", "row-long", cx);
            })
            .unwrap();
    });
    let _ = touch.frame();
    let page_scroll_before = touch.view(|v| v.scroll_offset());
    touch
        .headless
        .dispatch_input(PlatformInput::Scroll(ScrollEvent {
            position: point(px(195.0), px(620.0)),
            delta: ScrollDelta::Pixels(point(px(0.0), px(-160.0))),
            modifiers: Modifiers::default(),
            touch_phase: TouchPhase::Moved,
            source: ScrollSource::Touch,
        }));
    touch.platform.run_until_parked();
    let _ = touch.frame();
    assert!(
        touch
            .view(|v| v.database_record_sheet().map(|s| s.scroll_y))
            .unwrap_or(0.0)
            > 0.0,
        "scrolling a long Record sheet must advance sheet scroll_y"
    );
    assert_eq!(
        touch.view(|v| v.scroll_offset()),
        page_scroll_before,
        "scrolling inside Record sheet must not scroll background page"
    );
    touch
        .headless
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: Keystroke::parse("escape").unwrap(),
            is_held: false,
            prefer_character_input: false,
        }));
    touch.platform.run_until_parked();
    let _ = touch.frame();
    assert!(
        touch.view(|v| v.database_record_sheet().is_none()),
        "pressing Escape must close the open Record sheet"
    );

    // 4. Phone + soft keyboard open: Backspace at empty paragraph below table
    //    must select the table AND keep wants_software_keyboard() == true; 2nd Backspace deletes
    //    the table without eating text from the paragraph above.
    let mut tbl_state = DocState::new("phone-kb-keep-block-sel", 104).unwrap();
    tbl_state
        .workspace
        .create_page(HOME_PAGE_ID, "Table Keep KB", 1)
        .unwrap();
    {
        let page = tbl_state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Table Keep KB".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note-1",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "p-above",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Safe paragraph".into(),
            },
            Some("note-1"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "tbl-1",
            BlockSpec::Table {
                rows: vec![vec!["A".into(), "B".into()]],
            },
            Some("note-1"),
            None,
            4,
        )
        .unwrap();
        page.add_block(
            "p-below",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            Some("note-1"),
            None,
            5,
        )
        .unwrap();
    }
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                v.set_document(tbl_state, cx);
                v.set_host_ime_bottom(300.0);
            })
            .unwrap();
    });
    let _ = touch.frame();
    touch.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "p-below", 0,
    ))));
    let _ = touch.frame();
    assert!(touch.view(|v| v.wants_software_keyboard()));

    // 1st Backspace: selects table AND keeps software keyboard open.
    touch
        .headless
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: Keystroke::parse("backspace").unwrap(),
            is_held: false,
            prefer_character_input: false,
        }));
    touch.platform.run_until_parked();
    let _ = touch.frame();
    assert_eq!(
        touch.view(|v| v.block_selection().to_vec()),
        vec!["tbl-1".to_string()],
        "1st Backspace must select table block"
    );
    assert!(
        touch.view(|v| v.wants_software_keyboard()),
        "selecting adjacent block via Backspace must NOT dismiss software keyboard"
    );

    // 2nd Backspace: deletes the selected table without touching paragraph above.
    touch
        .headless
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: Keystroke::parse("backspace").unwrap(),
            is_held: false,
            prefer_character_input: false,
        }));
    touch.platform.run_until_parked();
    let _ = touch.frame();
    assert!(
        touch.view(|v| v.page_snapshot().and_then(|s| s.block("tbl-1")).is_none()),
        "2nd Backspace must delete the selected table block"
    );
    assert!(
        touch.view(|v| v.wants_software_keyboard()),
        "2nd Backspace deleting selected block must restore text caret and keep software keyboard open"
    );
    assert_eq!(
        touch.view(|v| v.block_text("p-above").map(str::to_owned)),
        Some("Safe paragraph".to_string()),
        "2nd Backspace must preserve the paragraph above the deleted table"
    );

    // 4b. Non-empty paragraph below a divider: 1st Backspace selects divider, typing restores
    //     caret into `p-below` and inserts text; re-selecting then 2nd Backspace deletes divider,
    //     restores caret to ("p-below", 0) with `wants_software_keyboard() == true`; moving caret
    //     clears `keep_keyboard_on_block_selection`.
    let mut div_state = DocState::new("phone-div-bs", 106).unwrap();
    div_state
        .workspace
        .create_page(HOME_PAGE_ID, "Div BS", 1)
        .unwrap();
    {
        let page = div_state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Div BS".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note-1",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "p-above",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Keep intact".into(),
            },
            Some("note-1"),
            None,
            3,
        )
        .unwrap();
        page.add_block("div-1", BlockSpec::Divider, Some("note-1"), None, 4)
            .unwrap();
        page.add_block(
            "p-below",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Below text".into(),
            },
            Some("note-1"),
            None,
            5,
        )
        .unwrap();
    }
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                v.set_document(div_state, cx);
                v.set_host_ime_bottom(300.0);
            })
            .unwrap();
    });
    let _ = touch.frame();
    touch.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "p-below", 0,
    ))));
    let _ = touch.frame();
    touch
        .headless
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: Keystroke::parse("backspace").unwrap(),
            is_held: false,
            prefer_character_input: false,
        }));
    touch.platform.run_until_parked();
    let _ = touch.frame();
    assert_eq!(
        touch.view(|v| v.block_selection().to_vec()),
        vec!["div-1".to_string()]
    );
    // Typing while divider is selected restores caret to p-below and inserts text.
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, w, cx| {
                use ui::EntityInputHandler as _;
                v.replace_text_in_range(None, "x", w, cx);
            })
            .unwrap();
    });
    let _ = touch.frame();
    assert!(touch.view(|v| v.block_selection().is_empty()));
    assert_eq!(
        touch.view(|v| v.block_text("p-below").map(str::to_owned)),
        Some("xBelow text".to_string()),
        "typing during block selection must restore return caret and insert text"
    );
    // Move back to offset 0, Backspace x1 selects divider, Backspace x2 deletes divider & keeps keyboard.
    touch.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "p-below", 0,
    ))));
    let _ = touch.frame();
    for _ in 0..2 {
        touch
            .headless
            .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
                keystroke: Keystroke::parse("backspace").unwrap(),
                is_held: false,
                prefer_character_input: false,
            }));
        touch.platform.run_until_parked();
        let _ = touch.frame();
    }
    assert!(touch.view(|v| v.page_snapshot().and_then(|s| s.block("div-1")).is_none()));
    assert_eq!(
        touch.view(|v| v
            .document_selection()
            .map(|s| (s.focus.block_id.clone(), s.focus.offset()))),
        Some(("p-below".to_string(), 0)),
        "2nd Backspace deleting divider must restore caret to (p-below, 0)"
    );
    assert!(
        touch.view(|v| v.wants_software_keyboard()),
        "2nd Backspace deleting divider must keep wants_software_keyboard() == true"
    );
    assert!(
        !touch.view(|v| v.keep_keyboard_on_block_selection),
        "keep_keyboard_on_block_selection must clear once caret is restored"
    );

    // 4c. Long 4-line title Record sheet: real height measurement exposes hidden toggle at bottom,
    //     raw touch drag/flick inside sheet never scrolls page behind, header pull closes sheet,
    //     and `handle_back()` closes open sheet before returning false when idle.
    let mut long_db = DocState::new("phone-long-sheet", 107).unwrap();
    long_db
        .workspace
        .create_page(HOME_PAGE_ID, "Long Sheet", 1)
        .unwrap();
    {
        let page = long_db.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Long Sheet".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note-1",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        for i in 0..16 {
            page.add_block(
                &format!("pad-{i}"),
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: format!("Filler paragraph {i} so page behind sheet is scrollable."),
                },
                Some("note-1"),
                None,
                3 + i,
            )
            .unwrap();
        }
        let cols: Vec<DatabaseColumnSpec> = (0..7)
            .map(|i| DatabaseColumnSpec {
                id: format!("c-{i}"),
                name: format!("Field {i}"),
                column_type: "rich-text".into(),
                data: serde_json::json!({}),
            })
            .collect();
        let view_cols: Vec<serde_json::Value> = (0..7)
            .map(|i| serde_json::json!({ "id": format!("c-{i}"), "hide": i == 6 }))
            .collect();
        let mut row_cells = BTreeMap::new();
        for i in 0..7 {
            row_cells.insert(
                format!("c-{i}"),
                DatabaseCellSpec::Text(format!("Value {i}")),
            );
        }
        page.add_block(
            "db-long",
            BlockSpec::Database(DatabaseSpec {
                title: "Records".into(),
                columns: cols,
                views: vec![DatabaseViewSpec {
                    id: "v-tbl".into(),
                    name: "Table".into(),
                    mode: "table".into(),
                    raw: serde_json::json!({ "columns": view_cols }),
                }],
                cells: BTreeMap::from([("row-long".to_string(), row_cells)]),
            }),
            Some("note-1"),
            None,
            20,
        )
        .unwrap();
        page.add_block(
            "row-long",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "A record whose title is long enough to wrap onto four lines inside the mobile detail sheet so that the title card grows much taller than one line".into(),
            },
            Some("db-long"),
            None,
            21,
        )
        .unwrap();
    }
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                v.set_document(long_db, cx);
                v.open_database_record_sheet("db-long", "row-long", cx);
            })
            .unwrap();
    });
    let _ = touch.frame();
    let page_y_before = touch.view(|v| v.scroll_y);
    // Scroll sheet to bottom via raw touch drag + flick inside sheet body; page behind must stay 0.
    let send_touch = |t: &MobileSession, id: u64, phase: TouchPhase, y: f32| {
        t.headless.dispatch_input(PlatformInput::Touch(TouchEvent {
            id: TouchId(id),
            phase,
            position: point(px(195.0), px(y)),
            predicted_position: None,
            force: None,
        }));
        let _ = t.frame();
    };
    for step in 0..4 {
        touch.platform.advance_clock(Duration::from_millis(200));
        send_touch(&touch, 50 + step, TouchPhase::Started, 760.0);
        for dy in 1..=6 {
            touch.platform.advance_clock(Duration::from_millis(16));
            send_touch(
                &touch,
                50 + step,
                TouchPhase::Moved,
                760.0 - dy as f32 * 45.0,
            );
        }
        touch.platform.advance_clock(Duration::from_millis(16));
        send_touch(&touch, 50 + step, TouchPhase::Ended, 490.0);
    }
    touch.platform.advance_clock(Duration::from_millis(400));
    let bottom_snap = touch.frame();
    assert_eq!(touch.view(|v| v.scroll_y), page_y_before);
    let hidden_btn = bottom_snap
        .elements
        .get("overlay.database_record_sheet.hidden_toggle")
        .expect("hidden_toggle must be present");
    assert!(
        hidden_btn.bounds.y + hidden_btn.bounds.height <= 844.0,
        "hidden_toggle bottom ({}) must fit inside 844px window",
        hidden_btn.bounds.y + hidden_btn.bounds.height
    );
    let sheet_top = bottom_snap
        .elements
        .get("overlay.database_record_sheet")
        .expect("sheet bounds")
        .bounds
        .y;
    touch.platform.advance_clock(Duration::from_millis(200));
    send_touch(&touch, 90, TouchPhase::Started, sheet_top + 14.0);
    touch.platform.advance_clock(Duration::from_millis(32));
    send_touch(&touch, 90, TouchPhase::Moved, sheet_top + 110.0);
    send_touch(&touch, 90, TouchPhase::Ended, sheet_top + 110.0);
    assert!(touch.view(|v| v.database_record_sheet().is_none()));
    // Re-open and verify `handle_back()` closes it and returns true, then false when none open.
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                v.open_database_record_sheet("db-long", "row-long", cx)
            })
            .unwrap();
    });
    let _ = touch.frame();
    let back_1 = touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, w, cx| v.handle_back(w, cx))
            .unwrap()
    });
    let back_2 = touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, w, cx| v.handle_back(w, cx))
            .unwrap()
    });
    assert!(back_1 && touch.view(|v| v.database_record_sheet().is_none()) && !back_2);

    // 5. Phone database with 10 views (first view active): manual horizontal scroll to max_scroll
    //    must expose the trailing view tab `v-9` with a clickable `SwitchView` hit target without
    //    snapping back to `v-0`, while programmatic `set_database_active_view` still reveals it.
    let many_views: Vec<DatabaseViewSpec> = (0..10)
        .map(|i| DatabaseViewSpec {
            id: format!("v-{i}"),
            name: format!("View {i}"),
            mode: "table".into(),
            raw: serde_json::json!({ "columns": [{"id": "title", "width": 160}] }),
        })
        .collect();
    let mut tabs_state = DocState::new("phone-many-tabs", 105).unwrap();
    tabs_state
        .workspace
        .create_page(HOME_PAGE_ID, "Many Tabs", 1)
        .unwrap();
    {
        let page = tabs_state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Many Tabs".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note-1",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "db-tabs",
            BlockSpec::Database(DatabaseSpec {
                title: "Ten Views".into(),
                columns: Vec::new(),
                views: many_views,
                cells: BTreeMap::new(),
            }),
            Some("note-1"),
            None,
            3,
        )
        .unwrap();
    }
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| v.set_document(tabs_state, cx))
            .unwrap();
    });
    let _ = touch.frame();
    let max_tabs_scroll = touch.view(|v| v.flow.database_view_tabs_max_scroll("db-tabs"));
    assert!(
        max_tabs_scroll > 400,
        "10 views at 390pt must overflow horizontally, got {max_tabs_scroll}"
    );
    touch.app.update(|cx| {
        touch
            .window
            .update(cx, |v, _, cx| {
                assert!(v.flow.database_state.scroll_view_tabs(
                    "db-tabs",
                    -max_tabs_scroll,
                    max_tabs_scroll
                ));
                cx.notify();
            })
            .unwrap();
    });
    let _ = touch.frame();
    let has_v9_hit = touch.view(|v| {
        v.database_hits("db-tabs").iter().any(|h| {
            h.kind
                == crate::database::DatabaseHitKind::SwitchView {
                    view_id: "v-9".to_string(),
                }
        })
    });
    assert!(
        has_v9_hit,
        "manual horizontal scroll to max_scroll must expose trailing view tab v-9 hit target"
    );
}
