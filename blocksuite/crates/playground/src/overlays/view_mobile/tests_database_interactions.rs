//! End-to-end pointer (`MouseDownEvent`), `set_document` readonly persistence,
//! empty-calendar clock tracking, and RTL initial horizontal scroll tests for `affine:database`.

use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, DatabaseSpec},
};
use ui::{point, px};

use crate::{PlaygroundTheme, database::DatabaseHitKind};

use super::tests::MobileSession;

fn seed_single_db_doc(
    doc_id: &str,
    page_id: &str,
    title: &str,
    db_id: &str,
    spec: DatabaseSpec,
    seed: u64,
) -> crate::DocState {
    let mut doc = crate::DocState::new(doc_id, seed).expect("doc");
    doc.workspace.initialize_meta().unwrap();
    doc.workspace
        .create_page(page_id, title, 1_700_000_000_000)
        .unwrap();
    let page = doc.workspace.ensure_page(page_id).unwrap();
    page.add_block(
        "p-root",
        BlockSpec::Page {
            title: title.into(),
        },
        None,
        None,
        1,
    )
    .unwrap();
    page.add_block(
        "p-note",
        BlockSpec::Note { xywh: None },
        Some("p-root"),
        None,
        2,
    )
    .unwrap();
    page.add_block(db_id, BlockSpec::Database(spec), Some("p-note"), None, 3)
        .unwrap();
    doc
}

fn encode_page_bytes(s: &MobileSession) -> Vec<u8> {
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                v.page().expect("active page").encode_update_v1().unwrap()
            })
            .unwrap()
    })
}

fn simulate_click_database_hit(
    s: &MobileSession,
    block_id: &str,
    pred: impl Fn(&DatabaseHitKind) -> bool,
) {
    let screen_pt = s.app.update(|cx| {
        s.window
            .update(cx, |v, window, _| {
                let geom = crate::page_geometry(f32::from(window.viewport_size().width));
                let layout = v.flow_layout().expect("flow layout");
                let block = layout.block(block_id).expect("database block in layout");
                let scroll_x = block
                    .body
                    .code_scroll
                    .map_or(0.0, |cs| v.overlays().code_scroll_x_for(block_id, cs));
                let hit = v
                    .database_hits(block_id)
                    .iter()
                    .find(|h| pred(&h.kind))
                    .expect("expected database hit target");
                let local_x = if hit.scrolls_x {
                    hit.rect.x - scroll_x + hit.rect.w * 0.5
                } else {
                    hit.rect.x + hit.rect.w * 0.5
                };
                let local_y = hit.rect.y + hit.rect.h * 0.5;
                point(
                    px(geom.column_x + block.x + local_x),
                    px(crate::TOPBAR_HEIGHT + block.y - v.scroll_y + local_y),
                )
            })
            .unwrap()
    });
    s.headless.simulate_click(screen_pt);
    s.platform.run_until_parked();
    s.frame();
}

#[test]
fn database_pointer_mouse_down_drives_tabs_calendar_readonly_and_desktop_edits() {
    // 1. Desktop pointer test: Table -> Kanban -> Calendar -> Next/Prev/Today (0 writeback),
    // then Table -> Checkbox toggle & delete-middle-row + `+ New record` with two-replica sync.
    let s = MobileSession::open(1280, 2400, PlaygroundTheme::Light);
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                v.set_calendar_clock(Some(std::rc::Rc::new(|| (1_773_057_600_000, 0))));
            })
            .unwrap();
    });
    s.frame();
    let before_bytes = encode_page_bytes(&s);

    // Click Kanban View tab via real MouseDownEvent.
    simulate_click_database_hit(
        &s,
        "showcase-database",
        |k| matches!(k, DatabaseHitKind::SwitchView { view_id } if view_id == "view-kanban"),
    );
    let snap_k = s.frame();
    assert!(
        snap_k.elements["page.block.showcase-database"]
            .text
            .as_deref()
            .unwrap_or("")
            .contains("[kanban: Kanban View]")
    );

    // Click Calendar View tab -> Next Month -> Today via real MouseDownEvent.
    simulate_click_database_hit(
        &s,
        "showcase-database",
        |k| matches!(k, DatabaseHitKind::SwitchView { view_id } if view_id == "view-calendar"),
    );
    simulate_click_database_hit(&s, "showcase-database", |k| {
        matches!(k, DatabaseHitKind::CalendarNextMonth)
    });
    let snap_apr = s.frame();
    assert!(
        snap_apr.elements["page.block.showcase-database"]
            .text
            .as_deref()
            .unwrap_or("")
            .contains("2026-04")
    );
    simulate_click_database_hit(&s, "showcase-database", |k| {
        matches!(k, DatabaseHitKind::CalendarToday)
    });
    assert_eq!(
        encode_page_bytes(&s),
        before_bytes,
        "pointer tab switching and calendar nav must be 0 CRDT writeback"
    );

    // Switch back to Table View via pointer, toggle Checkbox via pointer, verify CRDT write.
    simulate_click_database_hit(
        &s,
        "showcase-database",
        |k| matches!(k, DatabaseHitKind::SwitchView { view_id } if view_id == "view-table"),
    );
    let mut replica = blocksuite_playground_doc::session::PageDocSession::new("replica-peer", 77)
        .expect("replica");
    replica
        .apply_remote_update_v1(&before_bytes)
        .expect("seed replica");

    simulate_click_database_hit(&s, "showcase-database", |k| {
        matches!(k, DatabaseHitKind::ToggleCheckbox { current: false, .. })
    });

    // Delete middle row `showcase-db-row-2`, then click `+ New record` via real MouseDownEvent.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                let _ = v.page_mut().unwrap().delete_block_subtree(
                    "showcase-database",
                    "showcase-db-row-2",
                    500,
                );
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
    });
    s.frame();
    simulate_click_database_hit(&s, "showcase-database", |k| {
        matches!(k, DatabaseHitKind::AddRow)
    });

    // Sync full update to second replica and verify checkbox + new row with no ID collision.
    let after_bytes = encode_page_bytes(&s);
    replica
        .apply_remote_update_v1(&after_bytes)
        .expect("sync replica");
    let replica_snap = replica.read_page_snapshot().expect("replica snapshot");
    let BlockContent::Database(db) = &replica_snap
        .block("showcase-database")
        .expect("db in replica")
        .content
    else {
        panic!("expected database in replica");
    };
    assert_eq!(
        db.cells[&("showcase-db-row-1".into(), "col-done".into())].as_bool(),
        Some(true),
        "replica must receive checkbox toggle"
    );
    assert_eq!(
        db.rows.len(),
        4,
        "deleting 1 of 4 rows then adding 1 must keep 4 unique rows without overwriting"
    );
    assert!(
        db.rows.iter().any(|r| r.row_id == "showcase-db-row-3")
            && db.rows.iter().any(|r| r.row_id == "showcase-db-row-4")
            && db.rows.iter().any(|r| r.title.plain.is_empty()),
        "existing rows must survive and new row must have unique id with empty title: {:?}",
        db.rows
    );

    // 2. Mobile readonly pointer test: clicking a database cell shows banner, 0 writeback, no caret.
    let m = MobileSession::open(390, 2400, PlaygroundTheme::Light);
    m.app.update(|cx| {
        m.window
            .update(cx, |v, _, cx| {
                v.set_database_mobile_readonly(true, cx);
            })
            .unwrap();
    });
    m.frame();
    let m_before = encode_page_bytes(&m);
    simulate_click_database_hit(&m, "showcase-database", |k| {
        matches!(k, DatabaseHitKind::CellReadOnly)
    });
    let (notice, has_sel) = m.app.update(|cx| {
        m.window
            .update(cx, |v, _, _| {
                (
                    v.database_mobile_readonly_notice("showcase-database"),
                    v.document_selection().is_some(),
                )
            })
            .unwrap()
    });
    assert!(notice, "mobile pointer click must show readonly banner");
    assert!(
        !has_sel,
        "mobile readonly database click must not place editor caret in adjacent block"
    );
    assert_eq!(encode_page_bytes(&m), m_before);
}

#[test]
fn database_set_document_preserves_readonly_and_empty_calendar_follows_clock() {
    use blocksuite_playground_doc::schema::{
        BlockSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec,
    };
    use serde_json::json;
    use std::collections::BTreeMap;

    let s = MobileSession::open(390, 2400, PlaygroundTheme::Light);
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_database_mobile_readonly(true, cx);
                // America/New_York EST (-300) on 2026-11-05T15:00:00Z
                v.set_calendar_clock(Some(std::rc::Rc::new(|| (1_793_890_800_000, -300))));
                v.set_calendar_offset_at(|_| -300, cx);
            })
            .unwrap();
    });
    s.frame();

    // Replace document via `set_document` with an empty Calendar database (no date records).
    let mut doc2 = crate::DocState::new("doc-empty-cal", 42).expect("doc2");
    doc2.workspace.initialize_meta().unwrap();
    doc2.workspace
        .create_page("page-empty-cal", "Second Doc", 1_700_000_000_000)
        .unwrap();
    let page = doc2.workspace.ensure_page("page-empty-cal").unwrap();
    page.add_block(
        "p2-root",
        BlockSpec::Page {
            title: "Second Doc".into(),
        },
        None,
        None,
        1,
    )
    .unwrap();
    page.add_block(
        "p2-note",
        BlockSpec::Note { xywh: None },
        Some("p2-root"),
        None,
        2,
    )
    .unwrap();
    page.add_block(
        "db-empty-cal",
        BlockSpec::Database(DatabaseSpec {
            title: "Empty Calendar".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-date".into(),
                    column_type: "date".into(),
                    name: "Due".into(),
                    data: json!({}),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v-cal".into(),
                name: "Calendar".into(),
                mode: "calendar".into(),
                raw: json!({
                    "date": {"startColumnId": "col-date"},
                    "filter": {"type": "group", "op": "and", "conditions": []}
                }),
            }],
            cells: BTreeMap::new(),
        }),
        Some("p2-note"),
        None,
        3,
    )
    .unwrap();

    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_document(doc2, cx);
            })
            .unwrap();
    });
    let snap = s.frame();
    let db_id = "db-empty-cal".to_string();
    let text = snap.elements[&format!("page.block.{db_id}")]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text.contains("2026-11"),
        "empty calendar must follow injected clock (2026-11), got {text:?}"
    );

    // Stepping `>` from empty calendar must advance to 2026-12.
    simulate_click_database_hit(&s, &db_id, |k| {
        matches!(k, DatabaseHitKind::CalendarNextMonth)
    });
    let snap_dec = s.frame();
    assert!(
        snap_dec.elements[&format!("page.block.{db_id}")]
            .text
            .as_deref()
            .unwrap_or("")
            .contains("2026-12")
    );

    // Mobile readonly gate must survive `set_document`: clicking a calendar cell shows banner, 0 writeback.
    let before = encode_page_bytes(&s);
    simulate_click_database_hit(&s, &db_id, |k| matches!(k, DatabaseHitKind::CellReadOnly));
    let notice = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| v.database_mobile_readonly_notice(&db_id))
            .unwrap()
    });
    assert!(notice, "readonly gate must persist across set_document");
    assert_eq!(encode_page_bytes(&s), before);
}

#[test]
fn database_rtl_overflow_initial_scroll_shows_logical_first_column() {
    let s = MobileSession::open(390, 2400, PlaygroundTheme::Light);
    s.app.update(|cx| {
        s.window
            .update(cx, |_, window, cx| {
                window.set_root_layout_direction(ui::Direction::Rtl);
                cx.notify();
            })
            .unwrap();
    });
    s.frame();
    let cs = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                v.flow_layout()
                    .and_then(|l| {
                        l.block("showcase-database")
                            .and_then(|b| b.body.code_scroll)
                    })
                    .expect("overflowing RTL table must have CodeScroll")
            })
            .unwrap()
    });
    assert!(
        cs.max_x > 0.0,
        "expected overflowing table in 390px viewport"
    );
    assert_eq!(
        cs.initial_x, cs.max_x,
        "RTL overflowing database must initialize scroll to max_x (logical first column on right)"
    );
}

#[test]
fn database_ymap_row_any_object_cell_clicks_toggle_and_preserves_extra() {
    use blocksuite_playground_doc::schema::{
        BlockSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec, ParagraphType,
    };
    use serde_json::json;
    use std::collections::{BTreeMap, HashMap};
    use y_octo::{Any, SessionReadValue, SessionTxOrigin, SessionValue, TypePath, TypeTarget};

    let mut doc = seed_single_db_doc(
        "doc-any-cell",
        "page-any-cell",
        "Any Cell Doc",
        "db-any",
        DatabaseSpec {
            title: "Tasks".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-done".into(),
                    column_type: "checkbox".into(),
                    name: "Done".into(),
                    data: json!({}),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v-table".into(),
                name: "Table".into(),
                mode: "table".into(),
                raw: json!({
                    "columns": [
                        {"id": "title", "width": 180},
                        {"id": "col-done", "width": 80}
                    ]
                }),
            }],
            cells: BTreeMap::new(),
        },
        55,
    );
    let page = doc.workspace.ensure_page("page-any-cell").unwrap();
    page.add_block(
        "row-1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Item 1".into(),
        },
        Some("db-any"),
        None,
        4,
    )
    .unwrap();

    // Put an Any::Object cell inside a shared Y.Map row.
    let cells_path = TypePath::root("blocks").key("db-any").key("prop:cells");
    let mut cell_obj = HashMap::default();
    cell_obj.insert("columnId".into(), Any::String("col-done".into()));
    cell_obj.insert("value".into(), Any::False);
    cell_obj.insert("extra".into(), Any::String("keep".into()));
    page.inner_mut()
        .begin_tx(SessionTxOrigin::Untracked)
        .unwrap();
    page.inner_mut()
        .map_set(
            &TypeTarget::Path(cells_path.clone()),
            "row-1".into(),
            SessionValue::Map(vec![(
                "col-done".into(),
                SessionValue::Any(Any::Object(Box::new(cell_obj))),
            )]),
        )
        .unwrap();
    page.inner_mut().commit_tx().unwrap();

    let s = MobileSession::open(1280, 2400, PlaygroundTheme::Light);
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_document(doc, cx);
            })
            .unwrap();
    });
    s.frame();

    let read_done_and_extra = || {
        s.app.update(|cx| {
            s.window
                .update(cx, |v, _, _| {
                    let snap = v.page_snapshot().unwrap();
                    let BlockContent::Database(db) = &snap.block("db-any").unwrap().content else {
                        panic!("expected database");
                    };
                    let checked = db.cells[&("row-1".into(), "col-done".into())].as_bool();
                    let extra = v
                        .page()
                        .unwrap()
                        .inner()
                        .get_map_value(
                            &TypeTarget::Path(cells_path.clone().key("row-1").key("col-done")),
                            "extra",
                        )
                        .unwrap();
                    (checked, extra)
                })
                .unwrap()
        })
    };

    // Click 1: false -> true (also lazily upgrades Any::Object cell to Y.Map preserving `extra`).
    simulate_click_database_hit(&s, "db-any", |k| {
        matches!(k, DatabaseHitKind::ToggleCheckbox { current: false, .. })
    });
    assert_eq!(
        read_done_and_extra(),
        (
            Some(true),
            Some(SessionReadValue::Any(Any::String("keep".into())))
        )
    );

    // Click 2: true -> false.
    simulate_click_database_hit(&s, "db-any", |k| {
        matches!(k, DatabaseHitKind::ToggleCheckbox { current: true, .. })
    });
    assert_eq!(
        read_done_and_extra(),
        (
            Some(false),
            Some(SessionReadValue::Any(Any::String("keep".into())))
        )
    );
}

#[test]
fn database_empty_calendar_midnight_rollover_updates_month_and_steps_without_skip() {
    use blocksuite_playground_doc::schema::{DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec};
    use serde_json::json;
    use std::cell::Cell;
    use std::collections::BTreeMap;
    use std::rc::Rc;

    // 2026-11-30 23:59 at UTC-05:00 => 2026-12-01T04:59:00Z = 1_796_101_140_000 ms
    // 2026-12-01 00:01 at UTC-05:00 => 2026-12-01T05:01:00Z = 1_796_101_260_000 ms
    let clock_ms = Rc::new(Cell::new(1_796_101_140_000_i64));
    let clock_ref = clock_ms.clone();

    let doc = seed_single_db_doc(
        "doc-midnight-cal",
        "page-midnight-cal",
        "Midnight Cal",
        "db-midnight",
        DatabaseSpec {
            title: "Empty Calendar".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-date".into(),
                    column_type: "date".into(),
                    name: "Due".into(),
                    data: json!({}),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v-cal".into(),
                name: "Calendar".into(),
                mode: "calendar".into(),
                raw: json!({
                    "date": {"startColumnId": "col-date"},
                    "filter": {"type": "group", "op": "and", "conditions": []}
                }),
            }],
            cells: BTreeMap::new(),
        },
        66,
    );

    let s = MobileSession::open(1280, 2400, PlaygroundTheme::Light);
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_calendar_clock(Some(Rc::new(move || (clock_ref.get(), -300))));
                v.set_calendar_offset_at(|_| -300, cx);
                v.set_document(doc, cx);
            })
            .unwrap();
    });
    let snap_nov = s.frame();
    let text_nov = snap_nov.elements["page.block.db-midnight"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text_nov.contains("2026-11"),
        "before local midnight expected 2026-11, got {text_nov:?}"
    );

    // Advance clock across local midnight to 2026-12-01 00:01 (same UTC-05:00 offset) and repaint.
    clock_ms.set(1_796_101_260_000);
    s.app.update(|cx| {
        s.window
            .update(cx, |_, _, cx| {
                cx.notify();
            })
            .unwrap();
    });
    let snap_dec = s.frame();
    let text_dec = snap_dec.elements["page.block.db-midnight"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text_dec.contains("2026-12"),
        "after local midnight rollover expected 2026-12 immediately, got {text_dec:?}"
    );

    // Clicking Next Month once from 2026-12 must step to 2027-01 (never skipping December).
    simulate_click_database_hit(&s, "db-midnight", |k| {
        matches!(k, DatabaseHitKind::CalendarNextMonth)
    });
    let snap_jan = s.frame();
    let text_jan = snap_jan.elements["page.block.db-midnight"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text_jan.contains("2027-01"),
        "stepping next month from 2026-12 expected 2027-01, got {text_jan:?}"
    );
}

#[test]
fn database_calendar_renders_all_four_same_day_entries_without_truncation() {
    use blocksuite_playground_doc::schema::{
        BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec,
        ParagraphType,
    };
    use serde_json::json;
    use std::collections::BTreeMap;

    let mut cells: BTreeMap<String, BTreeMap<String, DatabaseCellSpec>> = BTreeMap::new();
    // 2026-03-10 12:00:00 UTC
    let day_ms = 1_773_144_000_000_i64;
    for i in 1..=4 {
        let mut row_cells = BTreeMap::new();
        row_cells.insert("col-date".to_string(), DatabaseCellSpec::Integer(day_ms));
        cells.insert(format!("row-cal-{i}"), row_cells);
    }

    let mut doc = seed_single_db_doc(
        "doc-cal-4",
        "page-cal-4",
        "Calendar 4 Events",
        "db-cal-4",
        DatabaseSpec {
            title: "Dense Calendar".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "col-date".into(),
                    column_type: "date".into(),
                    name: "Due".into(),
                    data: json!({}),
                },
            ],
            views: vec![DatabaseViewSpec {
                id: "v-cal".into(),
                name: "Calendar".into(),
                mode: "calendar".into(),
                raw: json!({
                    "date": {"startColumnId": "col-date"},
                    "filter": {"type": "group", "op": "and", "conditions": []}
                }),
            }],
            cells,
        },
        66,
    );
    let page = doc.workspace.ensure_page("page-cal-4").unwrap();
    for (idx, label) in [
        ("row-cal-1", "SameDay Alpha"),
        ("row-cal-2", "SameDay Bravo"),
        ("row-cal-3", "SameDay Charlie"),
        ("row-cal-4", "SameDay Delta"),
    ]
    .into_iter()
    .enumerate()
    {
        page.add_block(
            label.0,
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: label.1.into(),
            },
            Some("db-cal-4"),
            None,
            (4 + idx) as u64,
        )
        .unwrap();
    }

    let s = MobileSession::open(1280, 2400, PlaygroundTheme::Light);
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_calendar_clock(Some(std::rc::Rc::new(move || (day_ms, 0))));
                v.set_calendar_offset_at(|_| 0, cx);
                v.set_document(doc, cx);
            })
            .unwrap();
    });
    let snap = s.frame();
    let block_el = &snap.elements["page.block.db-cal-4"];
    let height_four = block_el.bounds.height;
    let text = block_el.text.as_deref().unwrap_or("");
    for expected in [
        "SameDay Alpha",
        "SameDay Bravo",
        "SameDay Charlie",
        "SameDay Delta",
    ] {
        assert!(
            text.contains(expected),
            "calendar day cell must render all 4 same-day events without truncation; missing {expected:?} in {text:?}"
        );
    }

    // Delete 2 of the 4 rows and verify the rendered Calendar block height shrinks by the 2
    // removed 21px (`18px + 3px`) event chip rows (proving layout expanded for all 4 chips).
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                let page = v.page_mut().unwrap();
                page.delete_block_subtree("db-cal-4", "row-cal-3", 100)
                    .unwrap();
                page.delete_block_subtree("db-cal-4", "row-cal-4", 101)
                    .unwrap();
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
    });
    let snap_two = s.frame();
    let height_two = snap_two.elements["page.block.db-cal-4"].bounds.height;
    assert!(
        height_four >= height_two + 36.0,
        "4 same-day calendar chips must expand week height over 2 chips: height_four={height_four}, height_two={height_two}"
    );
}
