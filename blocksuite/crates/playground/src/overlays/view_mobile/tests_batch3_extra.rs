//! Additional regression tests and offscreen visual evidence capture for interaction batch 3:
//! long-press word-union drag, table-cell action capsule, Edgeless `FormFactor` propagation,
//! and database click body-selection clearing (`M2`).

use std::time::Duration;

use blocksuite_playground_doc::schema::{BlockSpec, DatabaseSpec, ParagraphType};
use ui::{
    AppContext, EntityInputHandler, HeadlessPlatform, Modifiers, MouseButton, MouseDownEvent,
    PlatformInput, TouchEvent, TouchId, TouchPhase, WindowBounds, WindowOptions, point, px, size,
};

use crate::{
    PlaygroundMode, PlaygroundOptions, PlaygroundView,
    block_flow::FormFactor,
    database::DatabaseHitKind,
    editor_session::{DocPoint, DocumentSelection},
    room_client::DocState,
};

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
fn long_press_word_union_table_cell_capsule_and_edgeless_form_factor() {
    let mut state = DocState::new("lp-union", 91).unwrap();
    state
        .workspace
        .create_page(crate::HOME_PAGE_ID, "Touch", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Touch".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note {
                xywh: Some("[0,0,400,260]".into()),
            },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "alpha document omega".into(),
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "tbl",
            BlockSpec::Table {
                rows: vec![vec!["hello world".into()]],
            },
            Some("note"),
            None,
            4,
        )
        .unwrap();
        page.add_block(
            "c1",
            BlockSpec::Code {
                text: "fn main() {\n    println!(\"hi\");\n}".into(),
                language: Some("rust".into()),
                caption: String::new(),
            },
            Some("note"),
            None,
            5,
        )
        .unwrap();
    }
    let (platform, app, win, hw) = open_view(
        390,
        844,
        PlaygroundOptions {
            form_factor: FormFactor::Phone,
            ..Default::default()
        },
        state,
    );

    let (pt_alpha, pt_doc_mid, pt_doc_jit, pt_omega, pt_cell) = app.update(|cx| {
        win.update(cx, |v, w, _| {
            let layout = v.flow_layout().unwrap();
            let b = layout.block("p1").unwrap();
            let caret_pt = |off: u64| {
                let r = v.screen_rect(b.caret_rect(DocPoint::new("p1", off).caret).unwrap(), w);
                (
                    f32::from(r.origin.x) + 1.0,
                    f32::from(r.origin.y) + f32::from(r.size.height) * 0.5,
                )
            };
            let tbl = layout.block("tbl").unwrap();
            let cell_r = tbl.body.table_cells[0].rect;
            let geom = crate::block_flow::page_geometry(f32::from(w.viewport_size().width));
            let cell_pt = (
                geom.column_x + tbl.x + cell_r.x + 14.0,
                crate::TOPBAR_HEIGHT + tbl.y + cell_r.y + cell_r.h * 0.5,
            );
            (
                caret_pt(1),
                caret_pt(10),
                caret_pt(11),
                caret_pt(17),
                cell_pt,
            )
        })
        .unwrap()
    });

    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Started,
        pt_doc_mid.0,
        pt_doc_mid.1,
    )));
    platform.advance_clock(Duration::from_millis(550));
    hw.request_frame();
    let sel0 = app.update(|cx| {
        win.update(cx, |v, _, _| v.document_selection().cloned())
            .unwrap()
    });
    assert_eq!(
        sel0.as_ref().map(|s| (s.anchor.offset(), s.focus.offset())),
        Some((6, 14)),
        "long press selects whole word 'document'"
    );

    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Moved,
        pt_doc_jit.0,
        pt_doc_jit.1,
    )));
    hw.request_frame();
    let sel_jit = app.update(|cx| {
        win.update(cx, |v, _, _| v.document_selection().cloned())
            .unwrap()
    });
    assert_eq!(
        sel_jit
            .as_ref()
            .map(|s| (s.anchor.offset(), s.focus.offset())),
        Some((6, 14)),
        "jitter inside word preserves full word"
    );

    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Moved,
        pt_alpha.0,
        pt_alpha.1,
    )));
    hw.request_frame();
    let sel_left = app.update(|cx| {
        win.update(cx, |v, _, _| v.document_selection().cloned())
            .unwrap()
    });
    assert_eq!(sel_left.as_ref().map(|s| s.anchor.offset()), Some(14));
    assert!(sel_left.as_ref().unwrap().focus.offset() < 6);

    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Moved,
        pt_omega.0,
        pt_omega.1,
    )));
    hw.request_frame();
    let sel_right = app.update(|cx| {
        win.update(cx, |v, _, _| v.document_selection().cloned())
            .unwrap()
    });
    assert_eq!(sel_right.as_ref().map(|s| s.anchor.offset()), Some(6));
    assert!(sel_right.as_ref().unwrap().focus.offset() > 14);
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Ended,
        pt_omega.0,
        pt_omega.1,
    )));
    hw.request_frame();

    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        2,
        TouchPhase::Started,
        pt_cell.0,
        pt_cell.1,
    )));
    platform.advance_clock(Duration::from_millis(550));
    hw.request_frame();
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        2,
        TouchPhase::Ended,
        pt_cell.0,
        pt_cell.1,
    )));
    hw.request_frame();
    let (menu_open, cell_sel, menu_rect) = app.update(|cx| {
        win.update(cx, |v, w, _| {
            let sel = v
                .active_table_cell()
                .map(|c| c.input.selected_text().to_string());
            let rect = w
                .frame_snapshot()
                .elements
                .get("overlay.touch_selection_menu")
                .map(|e| e.bounds);
            (v.touch_selection_menu_open, sel, rect)
        })
        .unwrap()
    });
    assert!(menu_open, "table cell long-press opens action capsule");
    assert_eq!(cell_sel.as_deref(), Some("hello"));
    let menu_b = menu_rect.expect("touch selection menu rendered for table cell");
    hw.simulate_click(point(
        px(menu_b.x + 68.0),
        px(menu_b.y + menu_b.height * 0.5),
    ));
    hw.request_frame();
    let (after_cut, clip_txt) = app.update(|cx| {
        let clip = cx.read_from_clipboard().and_then(|i| i.text());
        let txt = win
            .update(cx, |v, _, _| {
                v.active_table_cell().map(|c| c.input.text.clone())
            })
            .unwrap();
        (txt, clip)
    });
    assert_eq!(clip_txt.as_deref(), Some("hello"));
    assert_eq!(after_cut.as_deref(), Some(" world"));

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.long_press_word(pt_doc_mid.0, pt_doc_mid.1, w, cx);
            assert!(
                v.active_table_cell().is_none(),
                "long_press_word on body clears stale table_cell"
            );
        })
        .unwrap();
    });

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.set_mode(PlaygroundMode::Edgeless, w, cx);
            v.set_form_factor(FormFactor::Desktop, w, cx);
        })
        .unwrap();
    });
    hw.request_frame();
    let edgeless_desktop_x = app.update(|cx| {
        win.update(cx, |v, _, _| {
            v.edgeless
                .cached_block_layout("note", true)
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
    let edgeless_phone_x = app.update(|cx| {
        win.update(cx, |v, _, _| {
            v.edgeless
                .cached_block_layout("note", true)
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
    assert!(
        edgeless_phone_x < edgeless_desktop_x,
        "Edgeless Note code block hides line numbers on Phone ({edgeless_phone_x} < {edgeless_desktop_x})"
    );
}

#[test]
fn database_click_clears_title_selection_and_readonly_selects_block() {
    let mut state = DocState::new("db-m2", 95).unwrap();
    state
        .workspace
        .create_page(crate::HOME_PAGE_ID, "Original Title", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Original Title".into(),
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
            "db1",
            BlockSpec::Database(DatabaseSpec::default()),
            Some("note"),
            None,
            3,
        )
        .unwrap();
    }
    let (_platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default(), state);
    hw.request_frame();

    let add_pt = app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.select_document_range(DocumentSelection::caret(DocPoint::new("root", 14)), w, cx);
            let geom = crate::page_geometry(f32::from(w.viewport_size().width));
            let layout = v.flow_layout().unwrap();
            let block = layout.block("db1").unwrap();
            let hit = v
                .database_hits("db1")
                .iter()
                .find(|h| matches!(h.kind, DatabaseHitKind::AddRow))
                .expect("AddRow hit target")
                .clone();
            point(
                px(geom.column_x + block.x + hit.rect.x + hit.rect.w * 0.5),
                px(crate::TOPBAR_HEIGHT + block.y + hit.rect.y + hit.rect.h * 0.5),
            )
        })
        .unwrap()
    });
    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.page_mouse_down(
                &MouseDownEvent {
                    button: MouseButton::Left,
                    position: add_pt,
                    modifiers: Modifiers::default(),
                    click_count: 1,
                    first_mouse: false,
                },
                w,
                cx,
            );
            let sel = v
                .document_selection()
                .expect("clicking database + New record focuses the new row");
            assert_ne!(
                sel.focus.block_id, "root",
                "clicking database + New record must move selection off page title"
            );
            let new_row_id = sel.focus.block_id.clone();
            v.replace_text_in_range(None, "New Record Title", w, cx);
            assert_eq!(
                v.block_text("root"),
                Some("Original Title"),
                "typing after clicking database + New record must not overwrite page title"
            );
            assert_eq!(
                v.block_text(&new_row_id),
                Some("New Record Title"),
                "typing after clicking database + New record must write into the newly created row"
            );
        })
        .unwrap();
    });
}

#[test]
fn t2_halo_no_text_intrusion_t4_explicit_false_and_t6_readonly_edgeless_copy() {
    use blocksuite_playground_doc::{read::BlockContent, schema::ListType};
    let mut state = DocState::new("t2-t4-t6", 109).unwrap();
    state
        .workspace
        .create_page(crate::HOME_PAGE_ID, "R2Checks", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "R2Checks".into(),
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
            "todo1",
            BlockSpec::List {
                list_type: ListType::Todo,
                text: "FirstLetter".into(),
                checked: false,
                order: None,
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "code_off",
            BlockSpec::Code {
                text: "let x = 1;".into(),
                language: Some("rust".into()),
                caption: String::new(),
            },
            Some("note"),
            None,
            4,
        )
        .unwrap();
        page.set_block_prop(
            "code_off",
            "prop:lineNumber",
            y_octo::SessionValue::Any(y_octo::Any::False),
            5,
        )
        .unwrap();
        page.add_block(
            "enote",
            BlockSpec::Note {
                xywh: Some("[40,40,320,160]".into()),
            },
            Some("root"),
            None,
            6,
        )
        .unwrap();
        page.set_block_prop(
            "enote",
            "prop:displayMode",
            y_octo::SessionValue::Any(y_octo::Any::String("edgeless".into())),
            7,
        )
        .unwrap();
        page.add_block(
            "ep1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "SpatialWord".into(),
            },
            Some("enote"),
            None,
            8,
        )
        .unwrap();
    }
    let (platform, app, win, hw) = open_view(
        390,
        844,
        PlaygroundOptions {
            form_factor: FormFactor::Desktop,
            edgeless_readonly: true,
            ..Default::default()
        },
        state,
    );
    // T4: explicit prop:lineNumber = false hides line numbers even on Desktop.
    let (code_x, first_char_pt, halo_pt) = app.update(|cx| {
        win.update(cx, |v, w, _| {
            let layout = v.flow_layout().unwrap();
            let cx_off = layout
                .block("code_off")
                .unwrap()
                .body
                .text
                .as_ref()
                .unwrap()
                .x;
            let tb = layout.block("todo1").unwrap();
            let geom = crate::page_geometry(f32::from(w.viewport_size().width));
            let y = crate::TOPBAR_HEIGHT + tb.y + 12.0;
            (
                cx_off,
                (geom.column_x + tb.x + 25.0, y),
                (geom.column_x + tb.x - 8.0, y),
            )
        })
        .unwrap()
    });
    assert!(
        code_x < 24.0,
        "T4 explicit false hides line numbers on Desktop ({code_x})"
    );

    // T2: tapping first character at x = rect.x + 25.0 must NOT toggle checkbox.
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Started,
        first_char_pt.0,
        first_char_pt.1,
    )));
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Ended,
        first_char_pt.0,
        first_char_pt.1,
    )));
    hw.request_frame();
    let is_checked = || {
        app.update(|cx| {
            win.update(cx, |v, _, _| {
                matches!(
                    v.page_snapshot().unwrap().block("todo1").unwrap().content,
                    BlockContent::List { checked: true, .. }
                )
            })
            .unwrap()
        })
    };
    assert!(
        !is_checked(),
        "T2 must not intrude into first character at x+25"
    );
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        2,
        TouchPhase::Started,
        halo_pt.0,
        halo_pt.1,
    )));
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        2,
        TouchPhase::Ended,
        halo_pt.0,
        halo_pt.1,
    )));
    hw.request_frame();
    assert!(is_checked(), "T2 outer margin halo toggles checkbox");

    // T6: read-only Edgeless edgeless-only Note long-press -> selection_endpoint_rects + Copy.
    app.update(|cx| {
        win.update(cx, |v, w, cx| v.set_mode(PlaygroundMode::Edgeless, w, cx))
            .unwrap();
    });
    hw.request_frame();
    let note_pt = app.update(|cx| {
        win.update(cx, |v, _, _| {
            let p = v.edgeless.camera.world_to_screen(
                point(px(90.0), px(80.0)),
                point(px(0.0), px(crate::TOPBAR_HEIGHT)),
            );
            (f32::from(p.x), f32::from(p.y))
        })
        .unwrap()
    });
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        3,
        TouchPhase::Started,
        note_pt.0,
        note_pt.1,
    )));
    platform.advance_clock(Duration::from_millis(550));
    hw.request_frame();
    let (has_rects, copied) = app.update(|cx| {
        win.update(cx, |v, w, _| {
            let rects = v.selection_endpoint_rects(w).is_some();
            let plain = v.clipboard_slice().map(|s| s.plain());
            (rects, plain)
        })
        .unwrap()
    });
    assert!(
        has_rects,
        "T6 edgeless-only Note computes screen endpoint rects"
    );
    assert_eq!(copied.as_deref(), Some("SpatialWord"));
}
