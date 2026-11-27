//! Regression tests for RTL touch halo geometry, single-open read-only Edgeless link tap,
//! and unified selection action commands.

use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, ListType, ParagraphType},
};
use ui::{
    AppContext, HeadlessPlatform, PlatformInput, TouchEvent, TouchId, TouchPhase, WindowBounds,
    WindowOptions, point, px, size,
};

use crate::{
    PlaygroundMode, PlaygroundOptions, PlaygroundView,
    block_flow::FormFactor,
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

#[test]
fn rtl_todo_halo_readonly_edgeless_single_open_and_unified_capsule_actions() {
    let mut state = DocState::new("rtl-open-cap", 113).unwrap();
    state
        .workspace
        .create_page(crate::HOME_PAGE_ID, "Unified", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(crate::HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Unified".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note {
                xywh: Some("[40,40,320,200]".into()),
            },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "todo_rtl",
            BlockSpec::List {
                list_type: ListType::Todo,
                text: "مرحبا".into(),
                checked: false,
                order: None,
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "p_link",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "visit link".into(),
            },
            Some("note"),
            None,
            4,
        )
        .unwrap();
        page.format_text(
            "p_link",
            "prop:text",
            0,
            10,
            y_octo::TextAttributes::from([(
                "link".into(),
                y_octo::Any::String("https://affine.pro".into()),
            )]),
            5,
        )
        .unwrap();
    }
    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
        crate::register_bundled_fonts(cx).unwrap();
    });
    let win = app.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(ui::Bounds::new(
                    point(px(0.0), px(0.0)),
                    size(px(390.0), px(844.0)),
                ))),
                ..WindowOptions::default()
            },
            |_w, cx| {
                cx.new(|cx| {
                    let mut v = PlaygroundView::with_options(
                        PlaygroundOptions {
                            form_factor: FormFactor::Phone,
                            edgeless_readonly: true,
                            ..Default::default()
                        },
                        cx,
                    );
                    v.set_document(state, cx);
                    v
                })
            },
        )
        .unwrap()
    });
    let hw = platform.windows().into_iter().next().unwrap();
    app.update(|cx| {
        win.update(cx, |_, w, _| {
            w.set_root_layout_direction(ui::Direction::Rtl)
        })
        .unwrap()
    });
    hw.request_frame();

    let (above_icon, rtl_first_char) = app.update(|cx| {
        win.update(cx, |v, w, _| {
            let layout = v.flow_layout().unwrap();
            let tb = layout.block("todo_rtl").unwrap();
            let geom = crate::page_geometry(f32::from(w.viewport_size().width));
            let icon_cx = geom.column_x + tb.rect().right() - 12.0;
            let icon_cy = crate::TOPBAR_HEIGHT + tb.y + tb.body.prefix.unwrap().y + 12.0;
            ((icon_cx, icon_cy - 17.0), (icon_cx - 20.0, icon_cy))
        })
        .unwrap()
    });
    let checked = || {
        app.update(|cx| {
            win.update(cx, |v, _, _| {
                matches!(
                    v.page_snapshot()
                        .unwrap()
                        .block("todo_rtl")
                        .unwrap()
                        .content,
                    BlockContent::List { checked: true, .. }
                )
            })
            .unwrap()
        })
    };
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Started,
        rtl_first_char.0,
        rtl_first_char.1,
    )));
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        1,
        TouchPhase::Ended,
        rtl_first_char.0,
        rtl_first_char.1,
    )));
    hw.request_frame();
    assert!(!checked(), "RTL first char must not trigger todo halo");
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        2,
        TouchPhase::Started,
        above_icon.0,
        above_icon.1,
    )));
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        2,
        TouchPhase::Ended,
        above_icon.0,
        above_icon.1,
    )));
    hw.request_frame();
    assert!(checked(), "RTL 17pt above icon toggles todo");

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.select_document_range(
                DocumentSelection {
                    anchor: DocPoint::new("p_link", 0),
                    focus: DocPoint::new("p_link", 5),
                },
                w,
                cx,
            );
            v.run_selection_select_all(None, w, cx);
            assert!(v.block_selection().is_empty());
            assert_eq!(
                v.document_selection()
                    .map(|s| (s.anchor.offset(), s.focus.offset())),
                Some((0, 10))
            );
        })
        .unwrap();
    });

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            w.set_root_layout_direction(ui::Direction::Ltr);
            v.set_mode(PlaygroundMode::Edgeless, w, cx);
        })
        .unwrap()
    });
    hw.request_frame();
    let link_pt = app.update(|cx| {
        win.update(cx, |v, _, _| {
            let layout = v.edgeless.cached_block_layout("note", true).unwrap();
            let b = layout.block("p_link").unwrap();
            let p = v.edgeless.camera.world_to_screen(
                point(px(40.0 + 24.0 + b.x + 16.0), px(40.0 + 24.0 + b.y + 10.0)),
                point(px(0.0), px(crate::TOPBAR_HEIGHT)),
            );
            (f32::from(p.x), f32::from(p.y))
        })
        .unwrap()
    });
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        3,
        TouchPhase::Started,
        link_pt.0,
        link_pt.1,
    )));
    hw.dispatch_input(PlatformInput::Touch(touch_ev(
        3,
        TouchPhase::Ended,
        link_pt.0,
        link_pt.1,
    )));
    let opened_once = app.update(|cx| {
        win.update(cx, |v, _, _| v.last_opened_link_url.take())
            .unwrap()
    });
    assert_eq!(opened_once.as_deref(), Some("https://affine.pro"));
    hw.request_frame();
    hw.request_frame();
    let opened_again = app.update(|cx| {
        win.update(cx, |v, _, _| v.last_opened_link_url.take())
            .unwrap()
    });
    assert!(opened_again.is_none(), "touch tap must not open link twice");
}

#[test]
fn page_readonly_blocks_overlay_edit_block_delete_and_cut_paste() {
    let mut state = DocState::new("page-ro", 98).unwrap();
    state.workspace.initialize_meta().unwrap();
    state.workspace.create_page("page-ro", "RO", 1_000).unwrap();
    let page = state.workspace.ensure_page("page-ro").unwrap();
    page.add_block(
        "pg",
        BlockSpec::Page { title: "RO".into() },
        None,
        None,
        1_000,
    )
    .unwrap();
    page.add_block(
        "note",
        BlockSpec::Note {
            xywh: Some("[0,0,760,600]".into()),
        },
        Some("pg"),
        None,
        1_000,
    )
    .unwrap();
    page.add_block(
        "p1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "immutable".into(),
        },
        Some("note"),
        None,
        1_000,
    )
    .unwrap();

    let platform = HeadlessPlatform::new(800, 600, 1.0);
    let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
        crate::register_bundled_fonts(cx).unwrap();
    });
    let win = app.update(|cx| {
        let mut opts = PlaygroundOptions::default();
        opts.page_readonly = true;
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(ui::Bounds::new(
                    point(px(0.0), px(0.0)),
                    size(px(800.0), px(600.0)),
                ))),
                ..WindowOptions::default()
            },
            |_, cx| {
                cx.new(|cx| {
                    let mut v = PlaygroundView::with_options(opts, cx);
                    v.set_document(state, cx);
                    v
                })
            },
        )
        .unwrap()
    });
    let hw = platform.windows().into_iter().next().unwrap();
    hw.request_frame();

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.select_document_range(
                DocumentSelection {
                    anchor: DocPoint::new("p1", 0),
                    focus: DocPoint::new("p1", 9),
                },
                w,
                cx,
            );
            v.run_overlay_edit(super::DocEdit::Mark("bold"), w, cx)
                .unwrap();
            let target = v.capture_context_target().expect("body selection target");
            assert!(
                !v.can_execute_paste_on_target(&target),
                "page_readonly must block paste"
            );
            v.execute_copy_or_cut_on_target(&target, false, w, cx);
            assert_eq!(
                cx.read_from_clipboard().and_then(|c| c.text()).as_deref(),
                Some("immutable"),
                "page_readonly must still allow copy"
            );
            v.execute_copy_or_cut_on_target(&target, true, w, cx);
            v.editor.block_selection = vec!["p1".to_string()];
            v.delete_selected_blocks(w, cx).unwrap();
            let (rich, _) = v.page().unwrap().read_editable_text("p1").unwrap();
            assert_eq!(
                rich.plain, "immutable",
                "page_readonly must block cut/delete"
            );
            let has_bold = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert { format: Some(f), .. } if f.contains_key("bold")
                )
            });
            assert!(!has_bold, "page_readonly must block overlay mark edit");
        })
        .unwrap();
    });
}
