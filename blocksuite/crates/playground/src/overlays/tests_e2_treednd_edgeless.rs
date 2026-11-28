//! Integration tests for E2 deliverables:
//! - C-E3-1: Multi-level `TreeDropTarget` (+24px stepped indent), shared `Tab` nesting predicate,
//!   collapsed parent auto-expand on drop, and drag-handle click block menu.
//! - C-E3-2: Pure local-view-state `Paragraph`/`Quote` collapse (zero CRDT `prop:collapsed` writes,
//!   cleared on document switch, 24px gutter slot released when childless).
//! - C-E4-2 & C-E1-1: Logical bottom-left Edgeless zoom bar `[FitIcon] [−] [100%] [+]` and
//!   `170ms ease-out` Fit camera transition (instant when `reduce_motion` is enabled).
//! - Edgeless floating `Element Toolbar` MVP-1 (colors, stroke style/width, rough style, font size)
//!   with single-step Undo.

use std::time::Duration;

use blocksuite_playground_doc::{
    read::{BlockContent, ShapeStyle, StrokeStyle, SurfaceElementKind},
    schema::{BlockSpec, ListType, ParagraphType, SurfaceElementSpec},
    session::PageDocSession,
};
use ui::{AppContext, HeadlessPlatform, point, px};

use crate::{
    DocState, HOME_PAGE_ID, PlaygroundMode, PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    edgeless::{CAMERA_TRANSITION_MS, EdgelessElementAction, ElementColorSlot},
    overlays::{BlockMenuAction, OverlayEvent, find_parent},
};

fn build_e2_page_state() -> DocState {
    let mut state = DocState::new("e2-test", 42).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "E2 Test", 1)
        .unwrap();
    let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "E2 Test".into(),
        },
        None,
        None,
        1,
    )
    .unwrap();
    page.add_block(
        "n1",
        BlockSpec::Note { xywh: None },
        Some("root"),
        Some(0),
        1,
    )
    .unwrap();
    page.add_block(
        "p1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Parent paragraph".into(),
        },
        Some("n1"),
        Some(0),
        2,
    )
    .unwrap();
    page.add_block(
        "p1_child",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Child under p1".into(),
        },
        Some("p1"),
        Some(0),
        3,
    )
    .unwrap();
    page.add_block(
        "q1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Quote,
            text: "Quote with child".into(),
        },
        Some("n1"),
        Some(1),
        4,
    )
    .unwrap();
    page.add_block(
        "q1_child",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Child under quote".into(),
        },
        Some("q1"),
        Some(0),
        5,
    )
    .unwrap();
    page.add_block(
        "p_leaf",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Childless paragraph".into(),
        },
        Some("n1"),
        Some(2),
        6,
    )
    .unwrap();
    page.add_block(
        "t1",
        BlockSpec::List {
            list_type: ListType::Toggle,
            text: "Collapsed toggle".into(),
            checked: false,
            order: None,
        },
        Some("n1"),
        Some(3),
        7,
    )
    .unwrap();
    page.set_block_prop(
        "t1",
        "prop:collapsed",
        y_octo::SessionValue::Any(y_octo::Any::True),
        7,
    )
    .unwrap();
    page.add_block(
        "t1_child",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Hidden toggle child".into(),
        },
        Some("t1"),
        Some(0),
        8,
    )
    .unwrap();
    page.add_block(
        "p_drag",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Draggable paragraph".into(),
        },
        Some("n1"),
        Some(4),
        9,
    )
    .unwrap();
    page.stop_capturing().unwrap();
    state
}

fn open_view(
    state: DocState,
    mode: PlaygroundMode,
) -> (
    std::rc::Rc<HeadlessPlatform>,
    ui::ApplicationHandle,
    ui::WindowHandle<PlaygroundView>,
    ui::HeadlessWindow,
) {
    let platform = HeadlessPlatform::new(1280, 800, 1.0);
    let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
        crate::register_bundled_fonts(cx).unwrap();
    });
    let win = app.update(|cx| {
        cx.open_window(ui::WindowOptions::default(), |_, cx| {
            let mut opts = PlaygroundOptions::default();
            opts.mode = mode;
            opts.theme = PlaygroundTheme::Light;
            cx.new(|cx| {
                let mut v = PlaygroundView::with_options(opts, cx);
                v.set_document(state, cx);
                v
            })
        })
        .unwrap()
    });
    let hw = platform.windows().into_iter().next().unwrap();
    hw.request_frame();
    (platform, app, win, hw)
}

#[test]
fn e2_tree_drop_target_indents_outdents_and_expands_collapsed_toggle_on_drop() {
    let (_platform, app, win, hw) = open_view(build_e2_page_state(), PlaygroundMode::Page);

    // 1. Drag `p_drag` onto the gap below `t1` with +24px horizontal indent -> nests into `t1`
    // and auto-expands `t1` only on drop (not during hover!).
    let t1_rect = app
        .update(|cx| {
            win.update(cx, |v, _, _| {
                v.flow_layout().unwrap().block("t1").unwrap().rect()
            })
        })
        .unwrap();
    let col_x = crate::block_flow::page_geometry(1280.0).column_x;
    let target_screen_x = col_x + 32.0; // > 24px -> depth 1 (inside t1)
    let target_screen_y = crate::TOPBAR_HEIGHT + t1_rect.bottom() + 2.0;

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.dispatch_overlay(OverlayEvent::DragStart("p_drag".into()), w, cx);
            v.dispatch_overlay(
                OverlayEvent::PointerMoved {
                    x: target_screen_x,
                    y: target_screen_y,
                    pressed: true,
                },
                w,
                cx,
            );
            // Hovering must NOT expand `t1` prematurely (zero hover jitter).
            let snap = v.page_snapshot().unwrap();
            assert!(matches!(
                snap.block("t1").unwrap().content,
                BlockContent::List {
                    collapsed: true,
                    ..
                }
            ));
            let slot = v.overlays().drop_slot().expect("drop slot must resolve");
            assert_eq!(slot.parent_id, "t1");
            assert_eq!(slot.depth, 1);
            assert!((slot.indicator_world_x - crate::block_flow::CHILD_INDENT).abs() < 0.5);
        })
    })
    .unwrap();
    hw.request_frame();

    // Release -> reparents `p_drag` under `t1` and expands `t1` in ONE undo step.
    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.dispatch_overlay(OverlayEvent::PointerUp, w, cx);
            let snap = v.page_snapshot().unwrap();
            let root = snap.root.as_ref().unwrap();
            let (parent, _) = find_parent(root, "p_drag").unwrap();
            assert_eq!(parent.id, "t1");
            assert!(matches!(
                snap.block("t1").unwrap().content,
                BlockContent::List {
                    collapsed: false,
                    ..
                }
            ));
            // Single undo restores both parent and collapsed state.
            let _ = v.page_mut().unwrap().undo();
            v.refresh_document();
            let snap2 = v.page_snapshot().unwrap();
            let (parent2, _) = find_parent(snap2.root.as_ref().unwrap(), "p_drag").unwrap();
            assert_eq!(parent2.id, "n1");
            assert!(matches!(
                snap2.block("t1").unwrap().content,
                BlockContent::List {
                    collapsed: true,
                    ..
                }
            ));
        })
    })
    .unwrap();
}

#[test]
fn e2_drag_handle_click_opens_block_menu_and_executes_undoable_actions() {
    let (_platform, app, win, hw) = open_view(build_e2_page_state(), PlaygroundMode::Page);

    // Click without displacement opens `overlay.block_menu`.
    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            v.dispatch_overlay(
                OverlayEvent::DragHandlePress {
                    block_id: "p_leaf".into(),
                    anchor: (240.0, 260.0),
                },
                w,
                cx,
            );
            v.dispatch_overlay(OverlayEvent::PointerUp, w, cx);
            assert_eq!(
                v.overlays().block_menu().map(|m| m.block_id.as_str()),
                Some("p_leaf")
            );
        })
    })
    .unwrap();
    hw.request_frame();

    // Duplicate creates a sibling right after `p_leaf`, undone in 1 step.
    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            let before_count = v
                .page_snapshot()
                .unwrap()
                .block("n1")
                .unwrap()
                .children
                .len();
            v.dispatch_overlay(
                OverlayEvent::BlockMenuAction {
                    block_id: "p_leaf".into(),
                    action: BlockMenuAction::Duplicate,
                },
                w,
                cx,
            );
            let after_count = v
                .page_snapshot()
                .unwrap()
                .block("n1")
                .unwrap()
                .children
                .len();
            assert_eq!(after_count, before_count + 1);
            let _ = v.page_mut().unwrap().undo();
            v.refresh_document();
            assert_eq!(
                v.page_snapshot()
                    .unwrap()
                    .block("n1")
                    .unwrap()
                    .children
                    .len(),
                before_count
            );

            // Delete removes `p_leaf`, undone in 1 step.
            v.dispatch_overlay(
                OverlayEvent::BlockMenuAction {
                    block_id: "p_leaf".into(),
                    action: BlockMenuAction::Delete,
                },
                w,
                cx,
            );
            assert!(v.page_snapshot().unwrap().block("p_leaf").is_none());
            let _ = v.page_mut().unwrap().undo();
            v.refresh_document();
            assert!(v.page_snapshot().unwrap().block("p_leaf").is_some());
        })
    })
    .unwrap();
}

#[test]
fn e2_paragraph_and_quote_collapse_is_pure_local_state_with_zero_crdt_writes() {
    let (_platform, app, win, hw) = open_view(build_e2_page_state(), PlaygroundMode::Page);

    app.update(|cx| {
        win.update(cx, |v, w, cx| {
            let layout = v.flow_layout().unwrap();
            assert!(layout.block("p1").unwrap().has_gutter_chevron);
            assert!(layout.block("q1").unwrap().has_gutter_chevron);
            // Childless paragraph releases its 24px gutter slot.
            assert!(!layout.block("p_leaf").unwrap().has_gutter_chevron);

            let rev_before = v.doc_rev;
            v.dispatch_overlay(OverlayEvent::ToggleCollapsed("p1".into()), w, cx);
            v.dispatch_overlay(OverlayEvent::ToggleCollapsed("q1".into()), w, cx);
            // Zero CRDT mutation!
            assert_eq!(v.doc_rev, rev_before);
            assert!(v.flow.local_collapsed.contains("p1"));
            assert!(v.flow.local_collapsed.contains("q1"));
            let snap = v.page_snapshot().unwrap();
            assert!(matches!(
                snap.block("p1").unwrap().content,
                BlockContent::Paragraph {
                    collapsed: false,
                    ..
                }
            ));
            assert!(matches!(
                snap.block("q1").unwrap().content,
                BlockContent::Paragraph {
                    collapsed: false,
                    ..
                }
            ));
        })
    })
    .unwrap();
    hw.request_frame();

    // Children of `p1` and `q1` are hidden in layout, and switching documents clears local state.
    app.update(|cx| {
        win.update(cx, |v, _, cx| {
            let layout = v.flow_layout().unwrap();
            assert!(layout.block("p1_child").is_none());
            assert!(layout.block("q1_child").is_none());

            v.set_document(build_e2_page_state(), cx);
            assert!(v.flow.local_collapsed.is_empty());
        })
    })
    .unwrap();
}

#[test]
fn e2_edgeless_zoom_bar_bottom_left_fit_motion_and_element_toolbar_undo() {
    let mut state = DocState::new("e2-edgeless", 99).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "E2 Edgeless", 1)
        .unwrap();
    let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "E2 Edgeless".into(),
        },
        None,
        None,
        1,
    )
    .unwrap();
    let surface_id = page.ensure_surface_block(1).unwrap();
    page.add_surface_element(
        &surface_id,
        "s1",
        "a0",
        SurfaceElementSpec::Shape {
            shape_type: "rect".into(),
            xywh: PageDocSession::format_xywh([200.0, 200.0, 180.0, 100.0]),
            seed: 17,
            filled: true,
            text: Some("Box".into()),
        },
        2,
    )
    .unwrap();
    page.stop_capturing().unwrap();

    let (platform, app, win, hw) = open_view(state, PlaygroundMode::Edgeless);

    // 1. Zoom bar is at logical bottom-left in LTR, ordered [FitIcon] [-] [100%] [+].
    let snap = app
        .update(|cx| win.update(cx, |_, w, _| w.frame_snapshot().clone()))
        .unwrap();
    let zoom_bar = snap.elements["chrome.edgeless_zoom"].bounds;
    assert!(
        zoom_bar.x < 40.0,
        "zoom bar should sit at bottom-left, got x={}",
        zoom_bar.x
    );
    let fit_x = snap.elements["chrome.edgeless_zoom.fit"].bounds.x;
    let out_x = snap.elements["chrome.edgeless_zoom.out"].bounds.x;
    let reset_x = snap.elements["chrome.edgeless_zoom.reset"].bounds.x;
    let in_x = snap.elements["chrome.edgeless_zoom.in"].bounds.x;
    assert!(fit_x < out_x && out_x < reset_x && reset_x < in_x);

    // 2. Fit button animates smoothly over 170ms on scheduler clock.
    app.update(|cx| win.update(cx, |v, _, cx| v.set_edgeless_zoom(2.5, cx)))
        .unwrap();
    hw.request_frame();
    let fit_b = app
        .update(|cx| {
            win.update(cx, |_, w, _| {
                w.frame_snapshot().elements["chrome.edgeless_zoom.fit"].bounds
            })
        })
        .unwrap();
    hw.simulate_click(point(
        px(fit_b.x + fit_b.width * 0.5),
        px(fit_b.y + fit_b.height * 0.5),
    ));
    platform.run_until_parked();
    platform.advance_clock(Duration::from_millis((CAMERA_TRANSITION_MS * 0.5) as u64));
    hw.request_frame();
    let mid_zoom = app
        .update(|cx| win.update(cx, |v, _, _| v.edgeless_camera().zoom))
        .unwrap();
    assert!(mid_zoom < 2.5 && mid_zoom > 1.0);
    platform.advance_clock(Duration::from_millis(CAMERA_TRANSITION_MS as u64));
    hw.request_frame();
    let end_zoom = app
        .update(|cx| win.update(cx, |v, _, _| v.edgeless_camera().zoom))
        .unwrap();
    assert!((end_zoom - 1.0).abs() < 0.05);

    // 3. Selecting shape `s1` mounts `chrome.edgeless_element_toolbar` and actions undo in 1 step.
    app.update(|cx| {
        win.update(cx, |v, _, cx| {
            v.edgeless.authoring.selection.clear();
            v.edgeless.authoring.selection.insert("s1".into());
            cx.notify();
        })
    })
    .unwrap();
    hw.request_frame();
    let sel_snap = app
        .update(|cx| win.update(cx, |_, w, _| w.frame_snapshot().clone()))
        .unwrap();
    assert!(
        sel_snap
            .elements
            .contains_key("chrome.edgeless_element_toolbar")
    );
    assert!(
        sel_snap
            .elements
            .contains_key("chrome.edgeless_element_toolbar.fill")
    );
    assert!(
        sel_snap
            .elements
            .contains_key("chrome.edgeless_element_toolbar.stroke_style")
    );
    assert!(
        sel_snap
            .elements
            .contains_key("chrome.edgeless_element_toolbar.rough_style")
    );
    assert!(
        sel_snap
            .elements
            .contains_key("chrome.edgeless_element_toolbar.font_size")
    );

    // Toggle color picker -> set fill -> set stroke style -> toggle rough -> undo step by step.
    app.update(|cx| {
        win.update(cx, |v, _, cx| {
            v.apply_edgeless_element_action(
                EdgelessElementAction::ToggleColorPicker(ElementColorSlot::Fill),
                cx,
            );
            assert_eq!(
                v.edgeless_element_color_picker(),
                Some(ElementColorSlot::Fill)
            );
            v.apply_edgeless_element_action(
                EdgelessElementAction::SetFillColor("--affine-palette-shape-blue".into()),
                cx,
            );
            assert_eq!(v.edgeless_element_color_picker(), None);
            v.apply_edgeless_element_action(
                EdgelessElementAction::SetStrokeStyle(StrokeStyle::Dash),
                cx,
            );
            v.apply_edgeless_element_action(EdgelessElementAction::ToggleRoughStyle, cx);
            v.apply_edgeless_element_action(EdgelessElementAction::SetFontSize(24.0), cx);

            let read_shape = |v: &PlaygroundView| {
                let snap = v.page_snapshot().unwrap();
                for node in snap.root.as_ref().unwrap().walk() {
                    if let BlockContent::Surface { elements, .. } = &node.content {
                        if let Some(el) = elements.iter().find(|e| e.id == "s1") {
                            if let SurfaceElementKind::Shape(s) = &el.kind {
                                return s.clone();
                            }
                        }
                    }
                }
                panic!("shape s1 missing");
            };
            let s = read_shape(v);
            assert_eq!(s.stroke_style, StrokeStyle::Dash);
            assert_eq!(s.shape_style, ShapeStyle::Scribbled);
            assert!((s.font_size - 24.0).abs() < 1e-3);

            // Single undo reverts font_size only.
            let _ = v.page_mut().unwrap().undo();
            v.refresh_document();
            let s_undo = read_shape(v);
            assert!((s_undo.font_size - 20.0).abs() < 1e-3);
            assert_eq!(s_undo.shape_style, ShapeStyle::Scribbled);
        })
    })
    .unwrap();
}
