//! Table-driven regression tests for interaction batch 3:
//! IME (`I1-I3`, `N1`), `ContentScope`, Page/Edgeless touch (`J1-J5`, `K2`, `T2-T7`),
//! and table navigation / non-editable block selection (`L1-L3`, `L7`, `R1`).

use std::time::Duration;

use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, ParagraphType},
};
use ui::{
    AppContext, Autocapitalize, ClipboardItem, EntityInputHandler, HeadlessPlatform, KeyDownEvent,
    Keystroke, Modifiers, MouseButton, MouseDownEvent, PlatformInput, TouchEvent, TouchGesture,
    TouchGestureRecognizer, TouchId, TouchPhase, WindowBounds, WindowOptions, point, px, size,
};
use y_octo::Any;

use crate::{
    PlaygroundMode, PlaygroundOptions, PlaygroundView,
    block_flow::FormFactor,
    editor_session::{DocPoint, DocumentSelection},
    overlays::{KeyboardToolbarAction, OverlayEvent},
    room_client::DocState,
};

fn key_event(key: &str, shift: bool, cmd: bool) -> KeyDownEvent {
    KeyDownEvent {
        keystroke: Keystroke {
            key: key.to_string(),
            modifiers: Modifiers {
                shift,
                platform: cfg!(target_os = "macos") && cmd,
                control: !cfg!(target_os = "macos") && cmd,
                ..Default::default()
            },
            ..Default::default()
        },
        is_held: false,
        prefer_character_input: false,
    }
}

fn touch_ev(id: u64, phase: TouchPhase, x: f32, y: f32) -> TouchEvent {
    TouchEvent {
        id: TouchId(id),
        phase,
        position: point(px(x), px(y)),
        predicted_position: None,
        force: None,
    }
}

fn open_view(
    width: u32,
    height: u32,
    options: PlaygroundOptions,
    state: DocState,
) -> (
    std::rc::Rc<HeadlessPlatform>,
    ui::ApplicationHandle,
    ui::WindowHandle<PlaygroundView>,
    ui::HeadlessWindow,
) {
    let platform = HeadlessPlatform::new(width, height, 1.0);
    let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
        crate::register_bundled_fonts(cx).unwrap();
    });
    let win = app.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(ui::Bounds::new(
                    point(px(0.0), px(0.0)),
                    size(px(width as f32), px(height as f32)),
                ))),
                ..WindowOptions::default()
            },
            |_w, cx| {
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
    hw.request_frame();
    (platform, app, win, hw)
}

#[test]
fn ime_recomposition_click_commit_clause_and_text_input_config() {
    let mut state = DocState::new("ime-batch3", 51).unwrap();
    state
        .workspace
        .create_page(crate::HOME_PAGE_ID, " hello", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: " hello".into(),
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
        page.add_block(
            "p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: " hello".into(),
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "p2",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "second".into(),
            },
            Some("note"),
            None,
            4,
        )
        .unwrap();
        page.add_block(
            "code1",
            BlockSpec::Code {
                text: " hello".into(),
                language: Some("rust".into()),
                caption: String::new(),
            },
            Some("note"),
            None,
            5,
        )
        .unwrap();
        page.add_block(
            "tbl1",
            BlockSpec::Table {
                rows: vec![vec![" hello".into()]],
            },
            Some("note"),
            None,
            6,
        )
        .unwrap();
    }
    let (_platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default(), state);

    let cases = [
        ("p1", true, Autocapitalize::Sentences),
        ("root", true, Autocapitalize::Sentences),
        ("code1", false, Autocapitalize::None),
    ];
    for (block_id, want_assist, want_cap) in cases {
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    DocumentSelection::caret(DocPoint::new(block_id, 6)),
                    w,
                    cx,
                );
                let cfg = v.text_input_configuration(w, cx);
                assert_eq!(
                    cfg.autocorrect, want_assist,
                    "N1 autocorrect for {block_id}"
                );
                assert_eq!(
                    cfg.suggestions, want_assist,
                    "N1 suggestions for {block_id}"
                );
                assert_eq!(
                    cfg.autocapitalize, want_cap,
                    "N1 autocapitalize for {block_id}"
                );

                v.replace_and_mark_text_in_range(Some(1..6), "hellos", Some(0..6), w, cx);
                assert_eq!(v.marked_text_range(w, cx), Some(1..7));
                v.replace_text_in_range(None, "hellos", w, cx);
                assert_eq!(
                    v.block_text(block_id),
                    Some(" hellos"),
                    "I1 recomposition in {block_id}"
                );
            })
            .unwrap();
        });
    }

    let (row_id, col_id) = app.update(|cx| {
        win.update(cx, |v, _, _| {
            let BlockContent::Table(t) = &v.page_snapshot().unwrap().block("tbl1").unwrap().content
            else {
                panic!("expected table");
            };
            (t.rows[0].row_id.clone(), t.columns[0].column_id.clone())
        })
        .unwrap()
    });
    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.dispatch_overlay(
                OverlayEvent::FocusTableCell {
                    block_id: "tbl1".into(),
                    row_id: row_id.clone(),
                    column_id: col_id.clone(),
                    screen_pos: None,
                },
                w,
                cx,
            );
            let cfg = v.text_input_configuration(w, cx);
            assert!(cfg.autocorrect && cfg.suggestions);
            v.replace_and_mark_text_in_range(Some(1..6), "hellos", Some(0..6), w, cx);
            v.replace_text_in_range(None, "hellos", w, cx);
            assert_eq!(v.active_table_cell().unwrap().input.text, " hellos");
            v.table_cell_key_down(&key_event("escape", false, false), w, cx);
        })
        .unwrap();
    });

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.select_document_range(DocumentSelection::caret(DocPoint::new("p2", 6)), w, cx);
            v.replace_and_mark_text_in_range(None, "漢字", Some(0..2), w, cx);
            assert!(v.editor.composing());
            v.change_selection(DocumentSelection::caret(DocPoint::new("p1", 0)), w, cx);
            assert!(!v.editor.composing());
            assert_eq!(v.block_text("p2"), Some("second漢字"));
        })
        .unwrap();
    });

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.select_document_range(DocumentSelection::caret(DocPoint::new("p1", 0)), w, cx);
            v.replace_and_mark_text_in_range(None, "きょうは天気", Some(0..4), w, cx);
        })
        .unwrap();
    });
    hw.request_frame();
}

#[test]
fn content_scope_edgeless_note_two_replica_sync_block_paste() {
    let mut state_a = DocState::new("scope-sync", 61).unwrap();
    state_a
        .workspace
        .create_page(crate::HOME_PAGE_ID, "Scope", 1)
        .unwrap();
    {
        let page = state_a.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Scope".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note {
                xywh: Some("[0,0,400,240]".into()),
            },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        for (idx, (id, txt)) in [("b1", "One"), ("b2", "Two"), ("b3", "Three")]
            .into_iter()
            .enumerate()
        {
            page.add_block(
                id,
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: txt.into(),
                },
                Some("note"),
                None,
                3 + idx as u64,
            )
            .unwrap();
        }
    }
    let init_update = state_a
        .workspace
        .page(crate::HOME_PAGE_ID)
        .unwrap()
        .encode_update_v1()
        .unwrap();
    let mut state_b = DocState::new("scope-sync", 62).unwrap();
    state_b
        .workspace
        .create_page(crate::HOME_PAGE_ID, "Scope", 1)
        .unwrap();
    state_b
        .workspace
        .ensure_page(crate::HOME_PAGE_ID)
        .unwrap()
        .apply_remote_update_v1(&init_update)
        .unwrap();

    let (_platform, app, win, hw) = open_view(
        1280,
        800,
        PlaygroundOptions {
            mode: PlaygroundMode::Edgeless,
            ..Default::default()
        },
        state_a,
    );

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            assert!(v.edgeless_begin_inline_edit("note", w, cx));
            v.select_all_blocks(w, cx);
            assert_eq!(v.block_selection(), &["b1", "b2", "b3"]);
        })
        .unwrap();
    });

    let remote_update = {
        let page_b = state_b.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
        page_b
            .set_block_prop(
                "note",
                "prop:displayMode",
                y_octo::SessionValue::Any(Any::String("edgeless".into())),
                10,
            )
            .unwrap()
            .unwrap()
            .update
    };
    app.update(|cx| {
        win.update(cx, |v, _, cx| {
            v.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(crate::HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&remote_update)
                    .unwrap();
            });
        })
        .unwrap();
    });
    hw.request_frame();

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.paste(ClipboardItem::new_string("REPLACED".into()), w, cx);
            let note = v.page_snapshot().unwrap().block("note").unwrap();
            assert_eq!(note.children.len(), 1);
            assert_eq!(v.block_text(&note.children[0].id), Some("REPLACED"));
        })
        .unwrap();
    });

    let paste_state = app.update(|cx| {
        win.update(cx, |v, _, _| v.page().unwrap().encode_update_v1().unwrap())
            .unwrap()
    });
    state_b
        .workspace
        .page_mut(crate::HOME_PAGE_ID)
        .unwrap()
        .apply_remote_update_v1(&paste_state)
        .unwrap();
    let note_b = state_b
        .workspace
        .page(crate::HOME_PAGE_ID)
        .unwrap()
        .read_page_snapshot()
        .unwrap();
    assert_eq!(note_b.block("note").unwrap().children.len(), 1);

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.editor_key_down(&key_event("z", false, true), w, cx);
            let note = v.page_snapshot().unwrap().block("note").unwrap();
            assert_eq!(note.children.len(), 3, "Undo restores all 3 children");
            v.editor_key_down(&key_event("z", true, true), w, cx);
            let note = v.page_snapshot().unwrap().block("note").unwrap();
            assert_eq!(note.children.len(), 1, "Redo re-applies replacement");
        })
        .unwrap();
    });
}

#[test]
fn touch_pinch_handoff_fling_form_factor_code_and_edgeless_k2() {
    let mut rec = TouchGestureRecognizer::default();
    let dir = ui::Direction::Ltr;
    let vw = px(390.0);
    rec.feed(&touch_ev(1, TouchPhase::Started, 100.0, 200.0), 0, dir, vw);
    let g = rec.feed(&touch_ev(2, TouchPhase::Started, 200.0, 200.0), 10, dir, vw);
    assert!(
        g.iter()
            .any(|e| matches!(e, TouchGesture::PinchStart { .. }))
    );
    let g = rec.feed(&touch_ev(2, TouchPhase::Ended, 220.0, 200.0), 40, dir, vw);
    assert!(g.iter().any(|e| matches!(e, TouchGesture::PinchEnd { .. })));
    assert!(g.iter().any(|e| matches!(e, TouchGesture::PanStart { .. })));
    let g = rec.feed(&touch_ev(1, TouchPhase::Moved, 115.0, 210.0), 56, dir, vw);
    assert!(
        g.iter()
            .any(|e| matches!(e, TouchGesture::PanUpdate { .. }))
    );

    let mut rec = TouchGestureRecognizer::default();
    rec.feed(&touch_ev(1, TouchPhase::Started, 80.0, 120.0), 0, dir, vw);
    let lp = rec.tick(520);
    assert!(
        lp.iter()
            .any(|e| matches!(e, TouchGesture::LongPress { .. }))
    );
    let drag = rec.feed(&touch_ev(1, TouchPhase::Moved, 140.0, 120.0), 550, dir, vw);
    assert!(
        drag.iter()
            .any(|e| matches!(e, TouchGesture::LongPressDrag { .. }))
    );
    assert!(!drag.iter().any(|e| matches!(
        e,
        TouchGesture::PanStart { .. } | TouchGesture::PanUpdate { .. }
    )));

    let mut state = DocState::new("code-ff", 71).unwrap();
    state
        .workspace
        .create_page(crate::HOME_PAGE_ID, "Code", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Code".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note {
                xywh: Some("[0,0,400,240]".into()),
            },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "c1",
            BlockSpec::Code {
                text: "let a = 1;\nlet b = 2;".into(),
                language: Some("rust".into()),
                caption: String::new(),
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();
        for i in 0..30u64 {
            page.add_block(
                &format!("filler{i}"),
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: format!("Line {i}"),
                },
                Some("note"),
                None,
                10 + i,
            )
            .unwrap();
        }
    }
    let (platform, app, win, hw) = open_view(320, 640, PlaygroundOptions::default(), state);
    let desktop_code_x = app.update(|cx| {
        win.update(cx, |v, _, _| {
            v.flow_layout()
                .unwrap()
                .block("c1")
                .unwrap()
                .body
                .text
                .as_ref()
                .unwrap()
                .x
        })
        .unwrap()
    });
    app.update(|cx| {
        win.update(cx, |v, w, cx| v.set_form_factor(FormFactor::Tablet, w, cx))
            .unwrap();
    });
    hw.request_frame();
    let tablet_code_x = app.update(|cx| {
        win.update(cx, |v, _, _| {
            v.flow_layout()
                .unwrap()
                .block("c1")
                .unwrap()
                .body
                .text
                .as_ref()
                .unwrap()
                .x
        })
        .unwrap()
    });
    app.update(|cx| {
        win.update(cx, |v, w, cx| v.set_form_factor(FormFactor::Phone, w, cx))
            .unwrap();
    });
    hw.request_frame();
    let phone_code_x = app.update(|cx| {
        win.update(cx, |v, _, _| {
            v.flow_layout()
                .unwrap()
                .block("c1")
                .unwrap()
                .body
                .text
                .as_ref()
                .unwrap()
                .x
        })
        .unwrap()
    });
    assert_eq!(desktop_code_x, tablet_code_x);
    assert!(phone_code_x < desktop_code_x);

    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        9,
        TouchPhase::Started,
        160.0,
        400.0,
    )));
    platform.advance_clock(Duration::from_millis(16));
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        9,
        TouchPhase::Moved,
        160.0,
        350.0,
    )));
    platform.advance_clock(Duration::from_millis(16));
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        9,
        TouchPhase::Ended,
        160.0,
        300.0,
    )));
    hw.request_frame();
    let y0 = app.update(|cx| win.update(cx, |v, _, _| v.scroll_offset()).unwrap());
    platform.advance_clock(Duration::from_millis(120));
    hw.request_frame();
    let y1 = app.update(|cx| win.update(cx, |v, _, _| v.scroll_offset()).unwrap());
    assert!(y1 > y0, "J1 fling scrolls after PanEnd ({y0} -> {y1})");
    platform.advance_clock(Duration::from_millis(3000));
    hw.request_frame();
    let active = app.update(|cx| {
        win.update(cx, |v, _, _| v.page_scroll_fling.is_some())
            .unwrap()
    });
    assert!(!active, "J1 fling stops cleanly");
}

#[test]
fn table_navigation_escape_r1_non_editable_block_selection_and_l7() {
    let mut state = DocState::new("table-l", 81).unwrap();
    state
        .workspace
        .create_page(crate::HOME_PAGE_ID, "TableNav", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "TableNav".into(),
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
        page.add_block(
            "code_top",
            BlockSpec::Code {
                text: "fn f() {}".into(),
                language: Some("rust".into()),
                caption: String::new(),
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "bm1",
            BlockSpec::Bookmark {
                url: "https://affine.pro".into(),
                title: Some("AFFiNE".into()),
                description: None,
            },
            Some("note"),
            None,
            4,
        )
        .unwrap();
        page.add_block(
            "empty_p",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            Some("note"),
            None,
            5,
        )
        .unwrap();
        page.add_block(
            "p_above",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Above".into(),
            },
            Some("note"),
            None,
            6,
        )
        .unwrap();
        page.add_block(
            "tbl",
            BlockSpec::Table {
                rows: vec![
                    vec!["A1".into(), "B1".into()],
                    vec!["A2".into(), "B2".into()],
                ],
            },
            Some("note"),
            None,
            7,
        )
        .unwrap();
    }
    let (_platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default(), state);

    let bm_pos = app.update(|cx| {
        win.update(cx, |v, w, _| {
            let geom = crate::block_flow::page_geometry(f32::from(w.viewport_size().width));
            let r = v.flow_layout().unwrap().block("bm1").unwrap().rect();
            point(
                px(geom.column_x + r.x + 20.0),
                px(crate::TOPBAR_HEIGHT + r.y + 12.0),
            )
        })
        .unwrap()
    });
    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.page_mouse_down(
                &MouseDownEvent {
                    button: MouseButton::Left,
                    position: bm_pos,
                    modifiers: Modifiers::default(),
                    click_count: 1,
                    first_mouse: false,
                },
                w,
                cx,
            );
            assert_eq!(v.block_selection(), &["bm1"]);
            assert!(v.document_selection().is_none());
            v.editor_key_down(&key_event("backspace", false, false), w, cx);
            assert!(v.page_snapshot().unwrap().block("bm1").is_none());
            assert_eq!(v.block_text("code_top"), Some("fn f() {}"));
        })
        .unwrap();
    });

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.select_document_range(DocumentSelection::caret(DocPoint::new("empty_p", 0)), w, cx);
            v.dispatch_overlay(
                OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Table),
                w,
                cx,
            );
            assert!(v.page_snapshot().unwrap().block("empty_p").is_none());
            v.editor_key_down(&key_event("z", false, true), w, cx);
            assert!(v.page_snapshot().unwrap().block("empty_p").is_some());
        })
        .unwrap();
    });
    hw.request_frame();

    let (rows, cols) = app.update(|cx| {
        win.update(cx, |v, _, _| {
            let BlockContent::Table(t) = &v.page_snapshot().unwrap().block("tbl").unwrap().content
            else {
                panic!("expected table");
            };
            (
                t.rows.iter().map(|r| r.row_id.clone()).collect::<Vec<_>>(),
                t.columns
                    .iter()
                    .map(|c| c.column_id.clone())
                    .collect::<Vec<_>>(),
            )
        })
        .unwrap()
    });
    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.dispatch_overlay(
                OverlayEvent::FocusTableCell {
                    block_id: "tbl".into(),
                    row_id: rows[0].clone(),
                    column_id: cols[0].clone(),
                    screen_pos: None,
                },
                w,
                cx,
            );
            v.table_cell_key_down(&key_event("right", false, false), w, cx);
            assert_eq!(v.active_table_cell().unwrap().column_id, cols[1]);
            v.table_cell_key_down(&key_event("down", false, false), w, cx);
            assert_eq!(v.active_table_cell().unwrap().row_id, rows[1]);
            assert_eq!(v.active_table_cell().unwrap().column_id, cols[1]);
            v.table_cell_key_down(&key_event("down", false, false), w, cx);
            assert!(
                v.active_table_cell().is_some(),
                "table at document end keeps cell focus"
            );
            assert!(
                v.block_selection().is_empty(),
                "table at document end does not select table"
            );
            assert_eq!(v.active_table_cell().unwrap().input.focus(), 2);
            v.table_cell_key_down(&key_event("escape", false, false), w, cx);
            assert!(v.active_table_cell().is_none());
            assert_eq!(v.block_selection(), &["tbl"]);
        })
        .unwrap();
    });
}
