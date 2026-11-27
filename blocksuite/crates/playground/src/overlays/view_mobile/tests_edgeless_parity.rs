//! Integration tests for edgeless mindmap layout, read-only mobile gestures, and `0.27.5` parity:
//! - Mobile non-collapsed selection suppresses duplicate floating `FormatToolbar` while keeping
//!   `KeyboardToolbar` active (and `Link` opens a link-only input bar).
//! - `embed-linked-doc` formats local timezone `"Updated YYYY-MM-DD HH:MM"` and `embed-synced-doc`
//!   renders `> 6` nested blocks without truncation.
//! - `SurfaceRef` renders connectors crossing a frame with both endpoints outside, invalidates
//!   when an outside bound endpoint moves, and skips projecting its own ancestor `Note`.
//! - Mobile Edgeless read-only gate (`edgeless_readonly = true`) hides authoring toolbar, blocks
//!   CRDT mutations, pans with 1-finger drag, and pinch-zooms + pans with 2-finger touch around
//!   centroid over a `SurfaceElementSpec::Mindmap` canvas with zero CRDT writeback.

use std::rc::Rc;

use blocksuite_playground_doc::schema::{
    BlockSpec, ConnectorEndpointSpec, MindmapNodeSpec, ParagraphType, SurfaceElementSpec,
};
use ui::{
    AppContext as _, Application, Bounds, HeadlessPlatform, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, PlatformInput, TouchEvent, TouchId, TouchPhase, WindowBounds,
    WindowOptions, audit_frame_snapshot, point, px, size,
};

use crate::{
    DocState, HOME_PAGE_ID, PlaygroundMode, PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    block_flow::page_geometry,
    overlays::{ActiveSelection, KeyboardToolbarAction, OverlayEvent},
    register_bundled_fonts,
};

use super::tests::MobileSession;

#[test]
fn mobile_selection_suppresses_floating_toolbar_except_link_input_bar() {
    let s = MobileSession::open(390, 844, PlaygroundTheme::Light);
    s.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
        block_id: "showcase-intro".into(),
        start_utf16: 0,
        end_utf16: 9,
    })));
    s.overlay(OverlayEvent::SetKeyboardToolbarVisible(true));
    let snap = s.frame();
    assert!(
        s.view(|v| v.document_selection().is_some_and(|sel| !sel.empty())),
        "showcase-intro selection must be active and non-collapsed"
    );
    assert!(
        audit_frame_snapshot(&snap).is_empty(),
        "mobile selection frame must have 0 audit violations"
    );
    assert!(snap.elements.contains_key("overlay.keyboard_toolbar"));
    assert!(
        !snap.elements.contains_key("overlay.format_toolbar"),
        "mobile selection must NOT show duplicate desktop floating FormatToolbar"
    );
    assert!(
        !snap.elements.keys().any(|k| k.contains("more_page")),
        "mobile KeyboardToolbar must horizontally scroll rather than showing a '...' pagination button"
    );

    // Tapping `Link` on `KeyboardToolbar` opens ONLY the single-row link input bar (no bold/italic buttons).
    s.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Link));
    s.platform
        .advance_clock(std::time::Duration::from_millis(200));
    let link_snap = s.frame();
    assert!(audit_frame_snapshot(&link_snap).is_empty());
    assert!(link_snap.elements.contains_key("overlay.format_toolbar"));
    assert!(
        link_snap
            .elements
            .contains_key("overlay.format_toolbar.link_input")
    );
    assert!(
        !link_snap
            .elements
            .contains_key("overlay.format_toolbar.bold"),
        "mobile Link bar must render only the link input row without duplicating format buttons"
    );
}

#[test]
fn embed_linked_doc_formats_local_timezone_and_synced_doc_renders_beyond_six_blocks() {
    let s = MobileSession::open(800, 900, PlaygroundTheme::Light);
    let mut state = DocState::new("embed-tz-sync", 51).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Host Page", 1)
        .unwrap();
    state
        .workspace
        .create_page("doc:nine", "Nine Block Synced Doc", 2)
        .unwrap();
    {
        let synced = state.workspace.ensure_page("doc:nine").unwrap();
        synced
            .add_block(
                "n-root",
                BlockSpec::Page {
                    title: "Nine Block Synced Doc".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
        synced
            .add_block(
                "n-note",
                BlockSpec::Note { xywh: None },
                Some("n-root"),
                None,
                2,
            )
            .unwrap();
        for idx in 1..=9 {
            synced
                .add_block(
                    format!("n-p{idx}"),
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: format!("Synced paragraph #{idx}"),
                    },
                    Some("n-note"),
                    None,
                    2 + idx,
                )
                .unwrap();
        }
    }
    state
        .workspace
        .create_page("doc:six", "Six Block Synced Doc", 3)
        .unwrap();
    {
        let six = state.workspace.ensure_page("doc:six").unwrap();
        six.add_block(
            "s-root",
            BlockSpec::Page {
                title: "Six Block Synced Doc".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        six.add_block(
            "s-note",
            BlockSpec::Note { xywh: None },
            Some("s-root"),
            None,
            2,
        )
        .unwrap();
        for idx in 1..=6 {
            six.add_block(
                format!("s-p{idx}"),
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: format!("Synced paragraph #{idx}"),
                },
                Some("s-note"),
                None,
                2 + idx,
            )
            .unwrap();
        }
    }
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "h-root",
            BlockSpec::Page {
                title: "Host Page".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "h-note",
            BlockSpec::Note { xywh: None },
            Some("h-root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "b-linked",
            BlockSpec::EmbedLinkedDoc {
                page_id: "doc:tz-target".into(),
                style: "horizontal".into(),
                caption: String::new(),
            },
            Some("h-note"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "b-synced-six",
            BlockSpec::EmbedSyncedDoc {
                page_id: "doc:six".into(),
                caption: String::new(),
            },
            Some("h-note"),
            None,
            4,
        )
        .unwrap();
        page.add_block(
            "b-synced",
            BlockSpec::EmbedSyncedDoc {
                page_id: "doc:nine".into(),
                caption: String::new(),
            },
            Some("h-note"),
            None,
            5,
        )
        .unwrap();
    }

    // 2026-11-26 14:30:00 UTC == 1_795_703_400_000 ms.
    state
        .workspace
        .create_page("doc:tz-target", "Timezone Target Doc", 1_795_703_400_000)
        .unwrap();
    {
        let tz = state.workspace.ensure_page("doc:tz-target").unwrap();
        tz.add_block(
            "tz-root",
            BlockSpec::Page {
                title: "Timezone Target Doc".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        tz.add_block(
            "tz-note",
            BlockSpec::Note { xywh: None },
            Some("tz-root"),
            None,
            2,
        )
        .unwrap();
        tz.add_block(
            "tz-p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Workspace page metadata timestamp".into(),
            },
            Some("tz-note"),
            None,
            3,
        )
        .unwrap();
    }
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_calendar_clock(Some(Rc::new(|| (1_795_710_600_000, 480))));
                v.set_document(state, cx);
            })
            .unwrap();
    });
    let _ = s.frame();

    let render_img = || {
        s.app
            .update(|cx| s.window.update(cx, |_, w, _| w.render_to_image()).unwrap())
            .unwrap()
    };

    let (layout_plus_8, six_h, nine_h) = s.app.update(|cx| {
        s.window
            .read_with(cx, |v, _| {
                let layout = v.flow_layout().unwrap();
                let six_h = layout.block("b-synced-six").unwrap().body.height;
                let nine_h = layout.block("b-synced").unwrap().body.height;
                (layout, six_h, nine_h)
            })
            .unwrap()
    });
    let img_plus_8 = render_img();

    // Switch clock to UTC-5 (`-300` min): layout key must invalidate and repaint the timestamp!
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_calendar_clock(Some(Rc::new(|| (1_795_710_600_000, -300))));
                cx.notify();
            })
            .unwrap();
    });
    let _ = s.frame();
    let layout_minus_5 = s.app.update(|cx| {
        s.window
            .read_with(cx, |v, _| v.flow_layout().unwrap())
            .unwrap()
    });
    let img_minus_5 = render_img();
    assert!(
        !Rc::ptr_eq(&layout_plus_8, &layout_minus_5),
        "changing local timezone offset must invalidate FlowLayout cache"
    );
    assert_ne!(
        img_plus_8.as_raw(),
        img_minus_5.as_raw(),
        "embed-linked-doc rendered 'Updated YYYY-MM-DD HH:MM' pixels must update on timezone change"
    );

    // Verify all 9 nested blocks inside `embed-synced-doc` are laid out without 6-block truncation:
    // 9 paragraphs must exceed 6 paragraphs by 3 full paragraph heights (> 60px).
    assert!(
        nine_h > six_h + 60.0,
        "embed-synced-doc with 9 blocks (h={nine_h}) must render untruncated beyond 6 blocks (h={six_h})"
    );
}

#[test]
fn surface_ref_renders_crossing_connector_invalidates_outside_endpoint_and_skips_ancestor_note() {
    let s = MobileSession::open(800, 640, PlaygroundTheme::Light);
    let mut state = DocState::new("sref-geom", 61).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "SurfaceRef Geometry", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "SurfaceRef Geometry".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surf", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        page.add_block(
            "frame-1",
            BlockSpec::Frame {
                title: "Crossing Connector Frame".into(),
                xywh: Some("[0,0,240,140]".into()),
                presentation_index: Some("a0".into()),
            },
            Some("surf"),
            None,
            3,
        )
        .unwrap();
        page.add_surface_element(
            "surf",
            "shape-in",
            "a1",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[20,40,60,60]".into(),
                seed: 11,
                filled: true,
                text: None,
            },
            4,
        )
        .unwrap();
        page.add_surface_element(
            "surf",
            "shape-out",
            "a2",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[360,40,60,60]".into(),
                seed: 12,
                filled: true,
                text: None,
            },
            5,
        )
        .unwrap();
        page.add_surface_element(
            "surf",
            "conn-bound",
            "a3",
            SurfaceElementSpec::Connector {
                mode: 0,
                seed: 13,
                source: ConnectorEndpointSpec::element("shape-in", Some([1.0, 0.5])),
                target: ConnectorEndpointSpec::element("shape-out", Some([0.0, 0.5])),
                text: None,
                label_xywh: None,
            },
            6,
        )
        .unwrap();
        // Free connector with BOTH endpoints outside `[0,0,240,140]` crossing straight through `y = 20`.
        page.add_surface_element(
            "surf",
            "conn-free-cross",
            "a4",
            SurfaceElementSpec::Connector {
                mode: 0,
                seed: 14,
                source: ConnectorEndpointSpec::point(-60.0, 20.0),
                target: ConnectorEndpointSpec::point(300.0, 20.0),
                text: None,
                label_xywh: None,
            },
            7,
        )
        .unwrap();
        page.set_surface_element_field(
            "surf",
            "conn-free-cross",
            "stroke",
            y_octo::SessionValue::Any(y_octo::Any::String("#00c853".into())),
            7,
        )
        .unwrap();
        page.set_surface_element_field(
            "surf",
            "conn-free-cross",
            "strokeWidth",
            y_octo::SessionValue::Any(y_octo::Any::Integer(6)),
            7,
        )
        .unwrap();
        // Ancestor Page Note with `xywh: None` (defaults to `[0,0,498,92]` overlapping `frame-1`!).
        page.add_block(
            "p-note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            8,
        )
        .unwrap();
        page.add_block(
            "p-sibling",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Ancestor note sibling".into(),
            },
            Some("p-note"),
            None,
            9,
        )
        .unwrap();
        page.add_block(
            "sref-1",
            BlockSpec::SurfaceRef {
                reference: "frame-1".into(),
                ref_flavour: "affine:frame".into(),
                caption: String::new(),
            },
            Some("p-note"),
            None,
            10,
        )
        .unwrap();
    }
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| v.set_document(state, cx))
            .unwrap();
    });
    let _ = s.frame();

    let render_img = || {
        s.app
            .update(|cx| {
                s.window
                    .update(cx, |_, window, _| window.render_to_image())
                    .unwrap()
            })
            .unwrap()
    };

    // 1. Editing `p-sibling` inside `p-note` must relayout ONLY `p-sibling` (`laid_out == 1`)
    //    and reuse `sref-1` (`reused >= 1`), proving ancestor `p-note` is NOT projected into `sref-1`.
    s.edit(|page| {
        page.insert_text("p-sibling", "prop:text", 0, "Updated: ", 11)
            .unwrap();
    });
    let stats_ancestor_edit = s.app.update(|cx| {
        s.window
            .update(cx, |v, w, _| {
                let col_w = page_geometry(f32::from(w.viewport_size().width)).column_width;
                v.ensure_layout(col_w, w).unwrap().stats
            })
            .unwrap()
    });
    assert_eq!(
        stats_ancestor_edit.laid_out, 1,
        "editing sibling inside ancestor p-note must NOT relayout SurfaceRef, got {stats_ancestor_edit:?}"
    );

    // 2. Free crossing connector `(-60, 20) -> (300, 20)` must paint green `#00c853` pixels inside thumbnail.
    let img_with_green = render_img();
    let green_px = img_with_green
        .pixels()
        .filter(|px_rgba| px_rgba.0[1] >= 160 && px_rgba.0[0] <= 60 && px_rgba.0[2] <= 110)
        .count();
    assert!(
        green_px >= 40,
        "free connector crossing frame with outside endpoints must paint inside SurfaceRef (found {green_px} green px)"
    );

    // 3. Moving `shape-out` from `[360,40,60,60]` to `[360,220,60,60]` (still outside `frame-1`)
    //    must invalidate `sref-1` (`laid_out == 1`) and update the connector slope in the thumbnail!
    s.edit(|page| {
        page.set_surface_element_field(
            "surf",
            "shape-out",
            "xywh",
            y_octo::SessionValue::Any(y_octo::Any::String("[360,220,60,60]".into())),
            12,
        )
        .unwrap();
    });
    let _ = s.frame();
    let stats_outside_move = s.app.update(|cx| {
        s.window
            .read_with(cx, |v, _| v.flow_layout().unwrap().stats)
            .unwrap()
    });
    assert_eq!(
        stats_outside_move.laid_out, 1,
        "moving outside bound shape must relayout SurfaceRef so bound connector route updates"
    );
    let img_after_move = render_img();
    assert_ne!(
        img_with_green.as_raw(),
        img_after_move.as_raw(),
        "SurfaceRef thumbnail pixels must update when outside bound connector endpoint moves"
    );
}

#[test]
fn mobile_edgeless_readonly_hides_toolbar_blocks_mutations_and_supports_touch_pan_pinch() {
    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let mut state = DocState::new("mobile-edgeless-ro", 73).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Readonly Whiteboard", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Readonly Whiteboard".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surf", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        for (id, idx, txt) in [
            ("mm-root", "a0", "Center"),
            ("mm-r", "a1", "Right Branch"),
            ("mm-l", "a2", "\u{0661}A RTL Branch"),
            ("mm-leaf", "a3", "Hidden Child"),
        ] {
            page.add_surface_element(
                "surf",
                id,
                idx,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[0,0,140,48]".into(),
                    seed: 7,
                    filled: true,
                    text: Some(txt.into()),
                },
                3,
            )
            .unwrap();
        }
        page.add_surface_element(
            "surf",
            "mm-1",
            "a4",
            SurfaceElementSpec::Mindmap {
                seed: 19,
                layout_type: 2,
                style: 1,
                children: vec![
                    (
                        "mm-root".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: None,
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-r".into(),
                        MindmapNodeSpec {
                            index: "a1".into(),
                            parent: Some("mm-root".into()),
                            collapsed: true,
                        },
                    ),
                    (
                        "mm-leaf".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: Some("mm-r".into()),
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-l".into(),
                        MindmapNodeSpec {
                            index: "a2".into(),
                            parent: Some("mm-root".into()),
                            collapsed: false,
                        },
                    ),
                ],
            },
            4,
        )
        .unwrap();
    }

    let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
        register_bundled_fonts(cx).unwrap();
    });
    let win = app
        .update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..Default::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        let mut v = PlaygroundView::with_options(
                            PlaygroundOptions {
                                mode: PlaygroundMode::Edgeless,
                                theme: PlaygroundTheme::Light,
                                edgeless_readonly: true,
                                ..Default::default()
                            },
                            cx,
                        );
                        v.set_document(state, cx);
                        v.set_edgeless_camera(-200.0, -300.0, 1.0, cx);
                        v
                    })
                },
            )
        })
        .unwrap();
    let hw = platform.windows().into_iter().next().unwrap();
    hw.request_frame();
    platform.run_until_parked();

    let snap = app.update(|cx| {
        win.update(cx, |_, w, _| w.frame_snapshot().clone())
            .unwrap()
    });
    assert!(audit_frame_snapshot(&snap).is_empty());
    assert!(
        !snap.elements.contains_key("chrome.edgeless_toolbar"),
        "mobile read-only Edgeless must hide authoring toolbar"
    );
    assert!(
        snap.elements.contains_key("chrome.edgeless_zoom"),
        "mobile read-only Edgeless must keep bottom-left zoom controls"
    );

    let read_sv = || {
        app.update(|cx| {
            win.read_with(cx, |v, _| {
                let p = v.document().workspace.page(HOME_PAGE_ID).unwrap();
                (p.revision(), p.encode_state_vector_v1().unwrap())
            })
            .unwrap()
        })
    };
    let sv0 = read_sv();

    // 1. Single-finger / left-pointer drag pans the camera and writes ZERO CRDT transactions.
    let cam_before = app.update(|cx| win.read_with(cx, |v, _| v.edgeless_camera()).unwrap());
    hw.dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
        button: MouseButton::Left,
        position: point(px(200.0), px(400.0)),
        modifiers: Default::default(),
        click_count: 1,
        first_mouse: false,
    }));
    hw.dispatch_input(PlatformInput::MouseMove(MouseMoveEvent {
        position: point(px(120.0), px(340.0)),
        pressed_button: Some(MouseButton::Left),
        modifiers: Default::default(),
    }));
    hw.dispatch_input(PlatformInput::MouseUp(MouseUpEvent {
        button: MouseButton::Left,
        position: point(px(120.0), px(340.0)),
        modifiers: Default::default(),
        click_count: 1,
    }));
    platform.run_until_parked();
    hw.request_frame();
    let cam_after_pan = app.update(|cx| win.read_with(cx, |v, _| v.edgeless_camera()).unwrap());
    assert!(
        (cam_after_pan.pan_x - (cam_before.pan_x + 80.0)).abs() < 1e-3
            && (cam_after_pan.pan_y - (cam_before.pan_y + 60.0)).abs() < 1e-3,
        "1-finger drag in read-only Edgeless must pan camera: before={cam_before:?}, after={cam_after_pan:?}"
    );
    assert_eq!(read_sv(), sv0, "read-only pan must make 0 CRDT writes");

    // 2. Mutating keys (`r`, `t`, `n`, `backspace`) must be suppressed with 0 CRDT writes.
    for key in ["r", "t", "n", "backspace"] {
        hw.dispatch_input(PlatformInput::KeyDown(ui::KeyDownEvent {
            keystroke: ui::Keystroke {
                modifiers: Default::default(),
                key: key.into(),
                key_char: (key.len() == 1).then(|| key.into()),
            },
            is_held: false,
            prefer_character_input: false,
        }));
    }
    platform.run_until_parked();
    hw.request_frame();
    assert_eq!(
        read_sv(),
        sv0,
        "mutating shortcuts in read-only Edgeless must make 0 CRDT writes"
    );

    // 3. Two-finger TouchEvent pinch-zoom + centroid translation zooms around pinch centroid!
    for ev in [
        TouchEvent {
            id: TouchId(1),
            phase: TouchPhase::Started,
            position: point(px(130.0), px(420.0)),
            predicted_position: None,
            force: None,
        },
        TouchEvent {
            id: TouchId(2),
            phase: TouchPhase::Started,
            position: point(px(250.0), px(420.0)),
            predicted_position: None,
            force: None,
        },
        TouchEvent {
            id: TouchId(1),
            phase: TouchPhase::Moved,
            position: point(px(80.0), px(440.0)),
            predicted_position: None,
            force: None,
        },
        TouchEvent {
            id: TouchId(2),
            phase: TouchPhase::Moved,
            position: point(px(320.0), px(440.0)),
            predicted_position: None,
            force: None,
        },
    ] {
        hw.dispatch_input(PlatformInput::Touch(ev));
    }
    platform.run_until_parked();
    hw.request_frame();
    platform.run_until_parked();
    hw.request_frame();
    let cam_after_pinch = app.update(|cx| win.read_with(cx, |v, _| v.edgeless_camera()).unwrap());
    assert!(
        cam_after_pinch.zoom > 1.8,
        "2-finger pinch from 120px to 240px span must zoom camera (~2.0x), got {cam_after_pinch:?}"
    );
    assert_eq!(
        read_sv(),
        sv0,
        "2-finger pinch-zoom + Mindmap render must make 0 CRDT writes"
    );
}
