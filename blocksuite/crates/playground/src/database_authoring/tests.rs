use std::collections::BTreeMap;

use blocksuite_editor::database::{DatabaseAuthoringHitKind, DatabaseHitKind};
use blocksuite_playground_doc::{
    read::{BlockContent, DatabaseData},
    schema::{
        BlockSpec, DatabaseCellSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec,
        ParagraphType,
    },
};
use serde_json::json;
use ui::{
    Application, Bounds, EntityInputHandler, HeadlessPlatform, KeyDownEvent, Keystroke, Modifiers,
    MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, WindowBounds, WindowOptions, point,
    prelude::*, px, size,
};

use crate::{
    HOME_PAGE_ID, PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    editor_session::{DocPoint, DocumentSelection},
    room_client::DocState,
};

fn build_e2e_database_doc() -> (DocState, String) {
    let mut doc = DocState::new("e2e-db-auth", 77).expect("doc");
    doc.workspace.initialize_meta().unwrap();
    doc.workspace
        .create_page(HOME_PAGE_ID, "Desktop DB E2E", 1_773_000_000_000)
        .unwrap();
    let page = doc.workspace.ensure_page(HOME_PAGE_ID).unwrap();
    page.add_block(
        "p-root",
        BlockSpec::Page {
            title: "Desktop DB E2E".into(),
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
    page.add_block(
        "p-body",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Outside paragraph".into(),
        },
        Some("p-note"),
        None,
        2,
    )
    .unwrap();
    let db_id = "db-e2e".to_string();
    let mut cells = BTreeMap::new();
    cells.insert(
        "r1".into(),
        BTreeMap::from([
            ("c-status".into(), DatabaseCellSpec::Text("opt-todo".into())),
            ("c-note".into(), DatabaseCellSpec::Text(String::new())),
            ("c-prog".into(), DatabaseCellSpec::Integer(20)),
            ("c-due".into(), DatabaseCellSpec::Integer(1_773_014_400_000)),
        ]),
    );
    page.add_block(
        &db_id,
        BlockSpec::Database(DatabaseSpec {
            title: "E2E Roadmap".into(),
            columns: vec![
                DatabaseColumnSpec {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Task".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "c-status".into(),
                    column_type: "select".into(),
                    name: "Status".into(),
                    data: json!({
                        "options": [
                            { "id": "opt-todo", "value": "Todo", "color": "var(--affine-tag-blue)" },
                            { "id": "opt-done", "value": "Done", "color": "var(--affine-tag-green)" }
                        ]
                    }),
                },
                DatabaseColumnSpec {
                    id: "c-note".into(),
                    column_type: "rich-text".into(),
                    name: "Notes".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "c-prog".into(),
                    column_type: "progress".into(),
                    name: "Progress".into(),
                    data: json!({}),
                },
                DatabaseColumnSpec {
                    id: "c-due".into(),
                    column_type: "date".into(),
                    name: "Due".into(),
                    data: json!({}),
                },
            ],
            views: vec![
                DatabaseViewSpec {
                    id: "v-table".into(),
                    name: "Table".into(),
                    mode: "table".into(),
                    raw: json!({
                        "columns": [
                            { "id": "title", "width": 160 },
                            { "id": "c-status", "width": 110 },
                            { "id": "c-note", "width": 110 },
                            { "id": "c-prog", "width": 120 },
                            { "id": "c-due", "width": 110 }
                        ]
                    }),
                },
                DatabaseViewSpec {
                    id: "v-cal".into(),
                    name: "Calendar".into(),
                    mode: "calendar".into(),
                    raw: json!({ "date": { "startColumnId": "c-due" } }),
                },
            ],
            cells,
        }),
        Some("p-note"),
        None,
        3,
    )
    .unwrap();
    page.add_block(
        "r1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Ship Wiring".into(),
        },
        Some(&db_id),
        None,
        4,
    )
    .unwrap();
    page.stop_capturing().unwrap();
    (doc, db_id)
}

fn key_event(key: &str, key_char: Option<&str>, modifiers: Modifiers) -> KeyDownEvent {
    KeyDownEvent {
        keystroke: Keystroke {
            modifiers,
            key: key.to_string(),
            key_char: key_char.map(str::to_string),
        },
        is_held: false,
        prefer_character_input: false,
    }
}

fn undo_modifiers() -> Modifiers {
    if cfg!(target_os = "macos") {
        Modifiers {
            platform: true,
            ..Default::default()
        }
    } else {
        Modifiers {
            control: true,
            ..Default::default()
        }
    }
}

fn read_db(view: &PlaygroundView, db_id: &str) -> DatabaseData {
    let snap = view.snapshot.as_ref().expect("snapshot");
    let BlockContent::Database(db) = &snap.block(db_id).expect("db").content else {
        panic!("expected database");
    };
    db.clone()
}

fn screen_pt_for_auth_hit(
    view: &PlaygroundView,
    window: &ui::Window,
    db_id: &str,
    pred: impl Fn(&DatabaseAuthoringHitKind) -> bool,
) -> ui::Point<ui::Pixels> {
    let geom = crate::page_geometry(f32::from(window.viewport_size().width));
    let layout = view.flow_layout().expect("flow layout");
    let block = layout.block(db_id).expect("database block");
    let scroll_x = block
        .body
        .code_scroll
        .map_or(0.0, |cs| view.overlays().code_scroll_x_for(db_id, cs));
    let hit = view
        .flow
        .database_authoring_hits(db_id)
        .iter()
        .rev()
        .find(|h| pred(&h.kind))
        .expect("expected authoring hit");
    let local_x = if hit.scrolls_x {
        hit.rect.x - scroll_x + hit.rect.w * 0.5
    } else {
        hit.rect.x + hit.rect.w * 0.5
    };
    let local_y = hit.rect.y + hit.rect.h * 0.5;
    point(
        px(geom.column_x + block.x + local_x),
        px(crate::TOPBAR_HEIGHT + block.y - view.scroll_y + local_y),
    )
}

fn screen_pt_for_db_hit(
    view: &PlaygroundView,
    window: &ui::Window,
    db_id: &str,
    pred: impl Fn(&DatabaseHitKind) -> bool,
) -> ui::Point<ui::Pixels> {
    let geom = crate::page_geometry(f32::from(window.viewport_size().width));
    let layout = view.flow_layout().expect("flow layout");
    let block = layout.block(db_id).expect("database block");
    let hit = view
        .flow
        .database_hits(db_id)
        .iter()
        .rev()
        .find(|h| pred(&h.kind))
        .expect("expected database hit");
    point(
        px(geom.column_x + block.x + hit.rect.x + hit.rect.w * 0.5),
        px(crate::TOPBAR_HEIGHT + block.y - view.scroll_y + hit.rect.y + hit.rect.h * 0.5),
    )
}

fn open_desktop_db_window(
    page_readonly: bool,
) -> (
    std::rc::Rc<HeadlessPlatform>,
    ui::ApplicationHandle,
    ui::WindowHandle<PlaygroundView>,
    ui::HeadlessWindow,
    String,
) {
    let platform = HeadlessPlatform::new(1280, 1200, 1.0);
    let win_cell = std::rc::Rc::new(std::cell::RefCell::new(None));
    let win_out = win_cell.clone();
    let (doc, db_id) = build_e2e_database_doc();
    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        let _ = crate::register_bundled_fonts(cx);
        let handle = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(1280.0), px(1200.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        let mut view = PlaygroundView::with_options(
                            PlaygroundOptions {
                                theme: PlaygroundTheme::Light,
                                ..Default::default()
                            },
                            cx,
                        );
                        view.set_calendar_clock(Some(std::rc::Rc::new(|| (1_773_057_600_000, 0))));
                        view.set_document(doc, cx);
                        if page_readonly {
                            view.set_page_readonly(true, cx);
                        }
                        view
                    })
                },
            )
            .unwrap();
        *win_out.borrow_mut() = Some(handle);
    });
    let window_handle = win_cell.borrow_mut().take().expect("window");
    let headless = platform.windows().into_iter().next().expect("headless");
    (platform, app, window_handle, headless, db_id)
}

#[test]
fn desktop_playground_mouse_drag_key_ime_and_undo_e2e_database_authoring() {
    let (platform, app, window_handle, headless, db_id) = open_desktop_db_window(false);
    let tick = || {
        platform.run_until_parked();
        headless.request_frame();
        platform.run_until_parked();
    };
    tick();

    // 1. Click "+" to add a new column via real MouseDownEvent (and verify no block_selection).
    let add_col_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::AddColumn)
                })
            })
            .unwrap()
    });
    headless.simulate_click(add_col_pt);
    tick();
    let new_col_id = app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                assert!(
                    v.editor.block_selection.is_empty(),
                    "desktop click inside database must not whole-select block"
                );
                let db = read_db(v, &db_id);
                assert_eq!(db.columns.len(), 6);
                db.columns.last().unwrap().id.clone()
            })
            .unwrap()
    });

    // 2. Click new column header -> open Type submenu -> change type to "number".
    let col_hdr_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::OpenColumnMenu { column_id } if column_id == &new_col_id)
                })
            })
            .unwrap()
    });
    headless.simulate_click(col_hdr_pt);
    tick();
    let type_btn_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::ColumnMenuToggleTypeSubmenu)
                })
            })
            .unwrap()
    });
    headless.simulate_click(type_btn_pt);
    tick();
    let num_type_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(
                        k,
                        DatabaseAuthoringHitKind::ColumnMenuSelectType {
                            column_id,
                            target_type
                        } if column_id == &new_col_id && target_type == "number"
                    )
                })
            })
            .unwrap()
    });
    headless.simulate_click(num_type_pt);
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                let db = read_db(v, &db_id);
                let col = db.columns.iter().find(|c| c.id == new_col_id).unwrap();
                assert_eq!(col.column_type, "number");
            })
            .unwrap();
    });

    // 3. Drag column resize handle (+60px) via MouseDown + MouseMove + MouseUp.
    let resize_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::ResizeColumnHandle { column_id, .. } if column_id == "c-status")
                })
            })
            .unwrap()
    });
    app.update(|cx| {
        window_handle
            .update(cx, |v, w, cx| {
                let down = MouseDownEvent {
                    button: MouseButton::Left,
                    position: resize_pt,
                    modifiers: Modifiers::default(),
                    click_count: 1,
                    first_mouse: false,
                };
                v.page_mouse_down(&down, w, cx);
                let moved = MouseMoveEvent {
                    position: point(resize_pt.x + px(60.0), resize_pt.y),
                    pressed_button: Some(MouseButton::Left),
                    modifiers: Modifiers::default(),
                };
                v.root_mouse_move(&moved, w, cx);
                let up = MouseUpEvent {
                    button: MouseButton::Left,
                    position: point(resize_pt.x + px(60.0), resize_pt.y),
                    modifiers: Modifiers::default(),
                    click_count: 1,
                };
                v.root_mouse_up(&up, w, cx);
            })
            .unwrap();
    });
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                let db = read_db(v, &db_id);
                let w = db.views[0]
                    .columns
                    .iter()
                    .find(|c| c.id == "c-status")
                    .unwrap()
                    .width;
                assert_eq!(w, Some(170.0));
            })
            .unwrap();
    });

    // 4. Progress scrub drag across multiple mouse_move steps -> single CRDT commit + 1-step Undo.
    let prog_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::SetProgress { row_id, column_id } if row_id == "r1" && column_id == "c-prog")
                })
            })
            .unwrap()
    });
    app.update(|cx| {
        window_handle
            .update(cx, |v, w, cx| {
                let down = MouseDownEvent {
                    button: MouseButton::Left,
                    position: prog_pt,
                    modifiers: Modifiers::default(),
                    click_count: 1,
                    first_mouse: false,
                };
                v.page_mouse_down(&down, w, cx);
                for dx in [6.0_f32, 14.0, 24.0] {
                    let mv = MouseMoveEvent {
                        position: point(prog_pt.x + px(dx), prog_pt.y),
                        pressed_button: Some(MouseButton::Left),
                        modifiers: Modifiers::default(),
                    };
                    v.root_mouse_move(&mv, w, cx);
                }
                // Still 20 in CRDT during drag (zero intermediate undo frames).
                assert_eq!(
                    read_db(v, &db_id).cells[&("r1".into(), "c-prog".into())].as_i64(),
                    Some(20)
                );
                let up = MouseUpEvent {
                    button: MouseButton::Left,
                    position: point(prog_pt.x + px(24.0), prog_pt.y),
                    modifiers: Modifiers::default(),
                    click_count: 1,
                };
                v.root_mouse_up(&up, w, cx);
            })
            .unwrap();
    });
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, w, cx| {
                let after = read_db(v, &db_id).cells[&("r1".into(), "c-prog".into())].as_i64();
                assert!(
                    after.is_some_and(|val| val > 50),
                    "expected progress > 50, got {after:?}"
                );
                // Single Cmd/Ctrl+Z restores original 20 in one step.
                v.editor_key_down(&key_event("z", None, undo_modifiers()), w, cx);
            })
            .unwrap();
    });
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                assert_eq!(
                    read_db(v, &db_id).cells[&("r1".into(), "c-prog".into())].as_i64(),
                    Some(20)
                );
            })
            .unwrap();
    });

    // 5. CJK IME isolation: select outside paragraph "p-body", click database cell "c-note",
    //    compose preedit "ni", commit "你", press Enter -> "p-body" untouched, cell == "你".
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                v.editor.selection = Some(DocumentSelection::caret(DocPoint::new("p-body", 7)));
            })
            .unwrap();
    });
    let note_cell_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::EditCell { row_id, column_id, .. } if row_id == "r1" && column_id == "c-note")
                })
            })
            .unwrap()
    });
    headless.simulate_click(note_cell_pt);
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, w, cx| {
                assert!(
                    v.editor.selection.is_none(),
                    "entering database cell editor must clear outside paragraph selection"
                );
                v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                assert_eq!(v.marked_text_range(w, cx), Some(0..2));
                assert!(
                    v.editor.preedit.is_none(),
                    "database IME preedit must never leak into body editor.preedit"
                );
                assert_eq!(v.block_text("p-body"), Some("Outside paragraph"));
                v.replace_text_in_range(None, "你", w, cx);
                assert_eq!(v.marked_text_range(w, cx), None);
                v.editor_key_down(&key_event("enter", None, Modifiers::default()), w, cx);
            })
            .unwrap();
    });
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                assert_eq!(v.block_text("p-body"), Some("Outside paragraph"));
                let db = read_db(v, &db_id);
                assert_eq!(
                    db.cells[&("r1".into(), "c-note".into())].as_str(),
                    Some("你")
                );
            })
            .unwrap();
    });

    // 6. Click Select cell -> pick "Done" option via real clicks.
    let sel_cell_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::EditCell { row_id, column_id, .. } if row_id == "r1" && column_id == "c-status")
                })
            })
            .unwrap()
    });
    headless.simulate_click(sel_cell_pt);
    tick();
    let done_opt_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::SelectToggleOption { option_id, .. } if option_id == "opt-done")
                })
            })
            .unwrap()
    });
    headless.simulate_click(done_opt_pt);
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                let db = read_db(v, &db_id);
                assert_eq!(
                    db.cells[&("r1".into(), "c-status".into())].as_str(),
                    Some("opt-done")
                );
            })
            .unwrap();
    });

    // 7. Click Filter toolbar -> type filter value via replace_text_in_range + Enter.
    let filter_btn_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::ToolbarToggleFilter)
                })
            })
            .unwrap()
    });
    headless.simulate_click(filter_btn_pt);
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, w, cx| {
                v.replace_text_in_range(None, "Ship Wiring", w, cx);
                v.editor_key_down(&key_event("enter", None, Modifiers::default()), w, cx);
            })
            .unwrap();
    });
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                let db = read_db(v, &db_id);
                assert!(
                    db.views[0]
                        .filter
                        .as_ref()
                        .and_then(|f| f.get("conditions"))
                        .and_then(|c| c.as_array())
                        .is_some_and(|a| a.len() == 1)
                );
            })
            .unwrap();
    });

    // 8. Switch to Calendar view -> click day "+" to create a row with Date cell -> Undo.
    let cal_tab_pt =
        app.update(|cx| {
            window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_db_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseHitKind::SwitchView { view_id } if view_id == "v-cal")
                })
            })
            .unwrap()
        });
    headless.simulate_click(cal_tab_pt);
    tick();
    let cal_add_pt = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::CalendarAddRowOnDay { day_index } if *day_index == 20525)
                })
            })
            .unwrap()
    });
    headless.simulate_click(cal_add_pt);
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                let db = read_db(v, &db_id);
                assert_eq!(db.rows.len(), 2);
                let new_row = &db.rows[1].row_id;
                assert_eq!(
                    db.cells[&(new_row.clone(), "c-due".into())].as_i64(),
                    Some(20525 * 86_400_000)
                );
            })
            .unwrap();
    });
    app.update(|cx| {
        window_handle
            .update(cx, |v, w, cx| {
                v.editor_key_down(&key_event("z", None, undo_modifiers()), w, cx);
            })
            .unwrap();
    });
    tick();
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                assert_eq!(read_db(v, &db_id).rows.len(), 1);
            })
            .unwrap();
    });

    // 9. Clicking outside the database dismisses any open popover cleanly.
    let filter_btn_pt2 = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                screen_pt_for_auth_hit(v, w, &db_id, |k| {
                    matches!(k, DatabaseAuthoringHitKind::ToolbarToggleFilter)
                })
            })
            .unwrap()
    });
    headless.simulate_click(filter_btn_pt2);
    tick();
    assert!(app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| v.active_database_authoring_block().is_some())
            .unwrap()
    }));
    headless.simulate_click(point(px(20.0), px(1000.0)));
    tick();
    assert!(app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| v.active_database_authoring_block().is_none())
            .unwrap()
    }));
}

#[test]
fn page_readonly_blocks_all_database_mutations_and_produces_zero_crdt_updates() {
    let (platform, app, window_handle, headless, db_id) = open_desktop_db_window(true);
    let tick = || {
        platform.run_until_parked();
        headless.request_frame();
        platform.run_until_parked();
    };
    tick();

    let (sv_before, update_before, cols_before, rows_before) = app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                let page = v.page().unwrap();
                let db = read_db(v, &db_id);
                (
                    page.encode_state_vector_v1().unwrap(),
                    page.encode_update_v1().unwrap(),
                    db.columns.len(),
                    db.rows.len(),
                )
            })
            .unwrap()
    });

    // Attempt AddColumn, EditCell, SetProgress, and AddRow while page_readonly is true.
    let targets: Vec<ui::Point<ui::Pixels>> = app.update(|cx| {
        window_handle
            .update(cx, |v, w, _| {
                vec![
                    screen_pt_for_auth_hit(v, w, &db_id, |k| {
                        matches!(k, DatabaseAuthoringHitKind::AddColumn)
                    }),
                    screen_pt_for_auth_hit(v, w, &db_id, |k| {
                        matches!(
                            k,
                            DatabaseAuthoringHitKind::EditCell { row_id, column_id, .. }
                            if row_id == "r1" && column_id == "c-note"
                        )
                    }),
                    screen_pt_for_auth_hit(v, w, &db_id, |k| {
                        matches!(
                            k,
                            DatabaseAuthoringHitKind::SetProgress { row_id, column_id }
                            if row_id == "r1" && column_id == "c-prog"
                        )
                    }),
                    screen_pt_for_db_hit(v, w, &db_id, |k| matches!(k, DatabaseHitKind::AddRow)),
                ]
            })
            .unwrap()
    });

    for pt in targets {
        headless.simulate_click(pt);
        tick();
    }

    app.update(|cx| {
        window_handle
            .update(cx, |v, _, _| {
                assert!(
                    v.active_database_authoring_block().is_none(),
                    "page_readonly must never open authoring popovers"
                );
                let db = read_db(v, &db_id);
                assert_eq!(db.columns.len(), cols_before);
                assert_eq!(db.rows.len(), rows_before);
                assert_eq!(db.cells[&("r1".into(), "c-prog".into())].as_i64(), Some(20));
                let page = v.page().unwrap();
                assert_eq!(page.encode_state_vector_v1().unwrap(), sv_before);
                assert_eq!(page.encode_update_v1().unwrap(), update_before);
            })
            .unwrap();
    });
}
