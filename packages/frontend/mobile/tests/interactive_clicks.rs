//! End-to-end headless integration tests verifying real `.on_click(cx.listener(...))`
//! dispatch, multi-workspace isolation, Explorer drill-down & ancestor breadcrumbs,
//! `d0 -> cur` location pick + `Return to Trail`, Search focus + keyboard + IME commit,
//! live frame-1 `published_a11y_tree` Dialog children + focus restoration, closing-sheet
//! content retention & click-through, and compact `568x320` landscape sheet reachability.

use std::{
    cell::RefCell,
    rc::Rc,
    sync::{Arc, Mutex},
    time::Duration,
};

use affine_client::{ContextState, DirectKind, NavTarget, Origin};
use affine_mobile::{
    BackOutcome, InMemoryPlatformAccessibility, MobileA11yAction, MobileBackCoordinator,
    MobileLocale, MobileRoute, MobileSheet, MobileShellView, register_mobile_fonts,
    seed_showcase_state, validate_accessibility_tree,
};
use ui::{
    Application, Bounds, EntityInputHandler, HeadlessPlatform, KeyDownEvent, Keystroke,
    PlatformInput, WindowBounds, WindowHandle, WindowOptions, point, prelude::*, px, size,
};
use ui_tokens::ThemeMode;

struct TestApp {
    platform: Rc<HeadlessPlatform>,
    app: ui::ApplicationHandle,
    window_handle: WindowHandle<MobileShellView>,
    headless_win: ui::HeadlessWindow,
}

impl TestApp {
    fn launch(width: u32, height: u32, locale: MobileLocale) -> Self {
        let platform = HeadlessPlatform::new(width, height, 1.0);
        let handle_cell: Rc<RefCell<Option<WindowHandle<MobileShellView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();

        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_mobile_fonts(cx).expect("register mobile fonts");
            let state = seed_showcase_state(locale, ThemeMode::Light, "2026-11-25");
            let win = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(width as f32), px(height as f32)),
                        ))),
                        ..WindowOptions::default()
                    },
                    |_, cx| cx.new(|cx| MobileShellView::new(state, cx)),
                )
                .expect("open headless mobile window");
            *handle_out.borrow_mut() = Some(win);
        });

        let window_handle = handle_cell
            .borrow_mut()
            .take()
            .expect("window handle initialized");
        let headless_win = platform
            .windows()
            .into_iter()
            .next()
            .expect("headless window registered");

        Self {
            platform,
            app,
            window_handle,
            headless_win,
        }
    }

    fn click_id(&self, id_or_prefix: &str) {
        self.click_id_with_advance(id_or_prefix, 400);
    }

    fn click_id_with_advance(&self, id_or_prefix: &str, advance_ms: u64) {
        self.headless_win.request_frame();
        let pt = self
            .app
            .update(|cx| {
                self.window_handle.update(cx, |_, window, _| {
                    let snap = window.frame_snapshot();
                    let el = snap
                        .elements
                        .get(id_or_prefix)
                        .or_else(|| {
                            snap.elements
                                .iter()
                                .find(|(k, _)| k.starts_with(id_or_prefix))
                                .map(|(_, v)| v)
                        })
                        .unwrap_or_else(|| {
                            panic!(
                                "element `{id_or_prefix}` missing from FrameSnapshot (keys: {:?})",
                                snap.elements.keys().collect::<Vec<_>>()
                            )
                        });
                    point(
                        px(el.bounds.x + el.bounds.width * 0.5),
                        px(el.bounds.y + el.bounds.height * 0.5),
                    )
                })
            })
            .expect("read snapshot");
        self.headless_win.simulate_click(pt);
        self.platform.run_until_parked();
        if advance_ms > 0 {
            self.platform
                .advance_clock(Duration::from_millis(advance_ms));
            self.platform.run_until_parked();
        }
        self.headless_win.request_frame();
    }
}

#[test]
fn headless_click_drives_tabs_doc_open_location_pick_and_back_navigation() {
    let t = TestApp::launch(390, 844, MobileLocale::En);

    t.click_id("mobile.tab.explorer");
    let route = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route, MobileRoute::Explorer);

    t.click_id("mobile.tab.home");
    t.click_id("mobile.home.doc.doc-arch");
    let (route, is_multi) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let d = v.state.derive_breadcrumb();
                (
                    v.state.route.clone(),
                    matches!(d.context, ContextState::MultiLocation { count: 2, .. }),
                )
            })
        })
        .unwrap();
    assert_eq!(route, MobileRoute::Page("doc-arch".into()));
    assert!(is_multi);

    t.click_id("mobile.page.breadcrumb.slot.switcher:");
    t.click_id("mobile.sheet.loc.0");
    let (sheet_after, labels) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let d = v.state.derive_breadcrumb();
                let labels: Vec<String> = d.crumbs.iter().map(|c| c.label.clone()).collect();
                (v.state.active_sheet, labels)
            })
        })
        .unwrap();
    assert_eq!(sheet_after, MobileSheet::None);
    assert_eq!(
        labels,
        vec![
            "Engineering",
            "Mobile Rust",
            "Mobile Shell & Breadcrumb Spec"
        ]
    );

    t.click_id("mobile.page.back_btn");
    let route = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route, MobileRoute::Home);
}

#[test]
fn workspace_switch_isolates_docs_backlinks_and_back_stack() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.home.workspace_btn");
    t.click_id("mobile.sheet.ws.ws-personal");

    let (ws_id, has_arch, has_personal, bl_count) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                (
                    v.state.active_workspace().scope.workspace_id.clone(),
                    v.state.doc_by_id("doc-arch").is_some(),
                    v.state.doc_by_id("doc-personal-1").is_some(),
                    v.state.backlinks_for("doc-personal-1").items.len(),
                )
            })
        })
        .unwrap();
    assert_eq!(ws_id, "ws-personal");
    assert!(!has_arch);
    assert!(has_personal);
    assert_eq!(bl_count, 1);

    t.click_id("mobile.home.doc.doc-personal-1");
    t.click_id("mobile.page.back_btn");
    let route = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route, MobileRoute::Home);
}

#[test]
fn explorer_drilldown_and_breadcrumb_folder_navigation_roundtrip() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.tab.explorer");
    t.click_id("mobile.explorer.folder.f-eng");
    t.click_id("mobile.explorer.folder.f-mobile");
    t.click_id("mobile.explorer.doc.14:ws-mobile-rustdoc-arch");

    let route = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route, MobileRoute::Page("doc-arch".into()));

    // Click ancestor folder crumb `Engineering` -> opens folder drilldown for `f-eng`.
    t.click_id("mobile.page.breadcrumb.slot.folder:f-eng");
    let (route, target) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                (
                    v.state.route.clone(),
                    v.state
                        .active_workspace()
                        .history
                        .current()
                        .map(|e| e.target.clone()),
                )
            })
        })
        .unwrap();
    assert_eq!(route, MobileRoute::Explorer);
    assert_eq!(target, Some(NavTarget::Folder("f-eng".into())));
}

#[test]
fn doc_link_cur_location_pick_preserves_d0_and_return_to_trail_restores_without_push() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                v.state
                    .open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                let arch_seq = v.state.active_workspace().history.current().unwrap().seq;
                v.state.open_doc(
                    "doc-sync",
                    Origin::DocLink {
                        parent_seq: arch_seq,
                        block_id: None,
                    },
                );
                cx.notify();
            })
        })
        .unwrap();
    t.platform.run_until_parked();

    let len_before = t
        .app
        .update(|cx| {
            t.window_handle
                .update(cx, |v, _, _| v.state.active_workspace().history.len())
        })
        .unwrap();

    // Open Location & Trail sheet via DocActions and pick cur (`doc-sync`)'s own folder location.
    t.click_id("mobile.page.more_btn");
    t.click_id("mobile.sheet.doc_action.location_trail");
    t.click_id("mobile.sheet.loc.0");

    let (can_return, d0_pick_is_none, len_after_pick) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let d = v.state.derive_breadcrumb();
                let arch_entry = v
                    .state
                    .active_workspace()
                    .history
                    .entries()
                    .iter()
                    .find(|e| e.target == NavTarget::Doc("doc-arch".into()))
                    .unwrap();
                (
                    d.can_return_to_trail,
                    arch_entry.pick.is_none(),
                    v.state.active_workspace().history.len(),
                )
            })
        })
        .unwrap();
    assert!(can_return, "must be able to return to trail after cur pick");
    assert!(d0_pick_is_none, "picking cur location MUST NOT mutate d0");
    assert_eq!(len_after_pick, len_before);

    // Reopen sheet and click `Return to Trail` -> restores `d0 -> cur` trail with zero history push.
    t.click_id("mobile.page.more_btn");
    t.click_id("mobile.sheet.doc_action.location_trail");
    t.click_id("mobile.sheet.use_trail_btn");
    let (trail_len, len_after_return) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let d = v.state.derive_breadcrumb();
                (d.trail.len(), v.state.active_workspace().history.len())
            })
        })
        .unwrap();
    assert_eq!(trail_len, 2);
    assert_eq!(len_after_return, len_before);
}

#[test]
fn search_focus_ime_composition_and_commit_opens_matching_doc() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.tab.search");
    t.click_id("mobile.search.clear_btn");
    t.click_id("mobile.search.input");

    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, window, cx| {
                v.replace_and_mark_text_in_range(None, "Sy", None, window, cx);
                assert!(v.marked_text_range(window, cx).is_some());
                v.replace_text_in_range(None, "Sync", window, cx);
                assert!(v.marked_text_range(window, cx).is_none());
            })
        })
        .unwrap();
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    t.click_id("mobile.search.hit.doc-sync");
    let route = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route, MobileRoute::Page("doc-sync".into()));
}

#[test]
fn published_a11y_tree_exposes_dialog_children_restores_focus_and_sheet_close_passes_clicks() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.home.doc.doc-arch");
    t.click_id("mobile.page.more_btn");

    // Verify published_a11y_tree has valid Dialog with children.
    let (errors, has_done_child) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let tree = v.published_a11y_tree();
                let dialog = tree.nodes.get("app.sheet.dialog").expect("dialog node");
                (
                    validate_accessibility_tree(tree),
                    dialog.children.iter().any(|c| c == "mobile.sheet.done_btn"),
                )
            })
        })
        .unwrap();
    assert!(errors.is_empty(), "a11y errors: {errors:?}");
    assert!(has_done_child);

    // Click Done and advance only 60ms (mid-close transition!): content must remain mounted,
    // focus restored to trigger `mobile.page.more_btn`, AND underlying `< Back` button clickable!
    t.click_id_with_advance("mobile.sheet.done_btn", 60);
    let (panel_present, focus_restored) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, window, _| {
                let snap = window.frame_snapshot();
                let focused_more = v
                    .published_a11y_tree()
                    .nodes
                    .get("mobile.page.more_btn")
                    .is_some_and(|n| n.focused);
                (
                    snap.elements.contains_key("mobile.sheet.panel"),
                    focused_more,
                )
            })
        })
        .unwrap();
    assert!(
        panel_present,
        "closing sheet must retain content mid-flight"
    );
    assert!(
        focus_restored,
        "closing sheet must restore focus to trigger"
    );

    // Click `< Back` WHILE sheet is still closing -> input must pass through to underlying route!
    t.click_id("mobile.page.back_btn");
    let route = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route, MobileRoute::Home);
}

#[test]
fn compact_landscape_location_sheet_keeps_owner_locations_and_use_trail_reachable() {
    let t = TestApp::launch(568, 320, MobileLocale::En);
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                v.state
                    .open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                let parent_seq = v
                    .state
                    .active_workspace()
                    .history
                    .current()
                    .expect("doc-arch entry")
                    .seq;
                v.state.open_doc(
                    "doc-sync",
                    Origin::DocLink {
                        parent_seq,
                        block_id: Some("b-ref-sync".into()),
                    },
                );
                v.state.open_sheet(MobileSheet::LocationAndTrail, 0.0);
                v.state.settle_animations(500.0);
                cx.notify();
            })
        })
        .unwrap();
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    let (owner_bounds, use_trail_hidden_initially) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                let owner = snap
                    .elements
                    .get("mobile.sheet.owner_loc.0")
                    .expect("owner_loc.0 must remain mounted on 568x320 landscape")
                    .bounds;
                (
                    owner,
                    !snap.elements.contains_key("mobile.sheet.use_trail_btn"),
                )
            })
        })
        .expect("read compact landscape snapshot");

    assert!(owner_bounds.width >= 44.0 && owner_bounds.height >= 44.0);
    assert!(
        use_trail_hidden_initially,
        "use_trail_btn should only render when can_return_to_trail is true"
    );

    // Pick cur's own location, reopen sheet, and verify `Return to Trail` is mounted and >= 44x44.
    t.click_id("mobile.sheet.loc.0");
    t.click_id("mobile.page.more_btn");
    t.click_id("mobile.sheet.doc_action.location_trail");
    let use_trail_bounds = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                window
                    .frame_snapshot()
                    .elements
                    .get("mobile.sheet.use_trail_btn")
                    .expect("use_trail_btn must be mounted after cur location pick")
                    .bounds
            })
        })
        .expect("read compact landscape snapshot after pick");
    assert!(use_trail_bounds.width >= 44.0 && use_trail_bounds.height >= 44.0);
}

#[test]
fn explorer_drilldown_back_pops_history_with_dynamic_parent_label() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.tab.explorer");
    t.click_id("mobile.explorer.folder.f-eng");
    t.click_id("mobile.explorer.folder.f-mobile");

    let (len_at_mobile, back_name_at_mobile) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let name = v
                    .published_a11y_tree()
                    .nodes
                    .get("mobile.explorer.back_btn")
                    .map(|n| n.name.clone())
                    .unwrap_or_default();
                (v.state.active_workspace().history.len(), name)
            })
        })
        .unwrap();
    assert_eq!(len_at_mobile, 3);
    assert_eq!(back_name_at_mobile, "Engineering");

    t.click_id("mobile.explorer.back_btn");
    let (target_after_1, len_after_1, back_name_at_eng) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let name = v
                    .published_a11y_tree()
                    .nodes
                    .get("mobile.explorer.back_btn")
                    .map(|n| n.name.clone())
                    .unwrap_or_default();
                (
                    v.state
                        .active_workspace()
                        .history
                        .current()
                        .map(|e| e.target.clone()),
                    v.state.active_workspace().history.len(),
                    name,
                )
            })
        })
        .unwrap();
    assert_eq!(target_after_1, Some(NavTarget::Folder("f-eng".into())));
    assert_eq!(len_after_1, 2, "drill-down back must pop rather than push");
    assert_eq!(back_name_at_eng, "All Docs");

    t.click_id("mobile.explorer.back_btn");
    let (target_after_2, len_after_2, root_back_action) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let target = v
                    .state
                    .active_workspace()
                    .history
                    .current()
                    .map(|e| e.target.clone());
                let len = v.state.active_workspace().history.len();
                let action = MobileBackCoordinator::handle_back(&mut v.state, 1000.0);
                (target, len, action)
            })
        })
        .unwrap();
    assert_eq!(target_after_2, Some(NavTarget::AllDocs));
    assert_eq!(len_after_2, 1);
    assert_eq!(root_back_action, BackOutcome::YieldToHostExit);
}

#[test]
fn explorer_collections_and_tags_index_filter_exact_members() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.tab.explorer");
    t.click_id("mobile.explorer.collections");
    t.click_id("mobile.explorer.collection.col-sync");

    let (has_sync, has_journal, has_arch) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                (
                    snap.elements
                        .contains_key("mobile.explorer.doc.14:ws-mobile-rustdoc-sync"),
                    snap.elements
                        .contains_key("mobile.explorer.doc.14:ws-mobile-rustdoc-journal"),
                    snap.elements
                        .contains_key("mobile.explorer.doc.14:ws-mobile-rustdoc-arch"),
                )
            })
        })
        .unwrap();
    assert!(
        has_sync && has_journal,
        "col-sync must show its member docs"
    );
    assert!(!has_arch, "col-sync must not show non-member doc-arch");

    t.click_id("mobile.explorer.back_btn");
    let target_index = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                v.state
                    .active_workspace()
                    .history
                    .current()
                    .map(|e| e.target.clone())
            })
        })
        .unwrap();
    assert_eq!(target_index, Some(NavTarget::Collection(String::new())));

    t.click_id("mobile.explorer.back_btn");
    t.click_id("mobile.explorer.tags");
    t.click_id("mobile.explorer.tag.sync");
    let (tag_has_sync, tag_has_arch) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                (
                    snap.elements
                        .contains_key("mobile.explorer.doc.14:ws-mobile-rustdoc-sync"),
                    snap.elements
                        .contains_key("mobile.explorer.doc.14:ws-mobile-rustdoc-arch"),
                )
            })
        })
        .unwrap();
    assert!(tag_has_sync);
    assert!(!tag_has_arch);
}

#[test]
fn search_single_channel_input_and_reversed_range_clamping() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.tab.search");
    t.click_id("mobile.search.clear_btn");
    t.click_id("mobile.search.input");

    // Simulate both KeyDown('a') and EntityInputHandler::replace_text_in_range("a"):
    // query must receive "a" once, never "aa".
    let mut ks_a = Keystroke::parse("a").unwrap();
    ks_a.key_char = Some("a".into());
    t.headless_win
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: ks_a,
            is_held: false,
            prefer_character_input: false,
        }));
    t.platform.run_until_parked();
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, window, cx| {
                v.replace_text_in_range(None, "a", window, cx);
                assert_eq!(
                    v.state.search_query, "a",
                    "printable input must not duplicate across key_down + EntityInputHandler"
                );
                // Reversed / out-of-bounds range must clamp safely without panicking.
                let reversed = std::ops::Range { start: 5, end: 1 };
                v.replace_text_in_range(Some(reversed), "b", window, cx);
                assert_eq!(v.state.search_query, "ab");
            })
        })
        .unwrap();

    t.headless_win
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: Keystroke::parse("backspace").unwrap(),
            is_held: false,
            prefer_character_input: false,
        }));
    t.platform.run_until_parked();
    let query_after_bs = t
        .app
        .update(|cx| {
            t.window_handle
                .update(cx, |v, _, _| v.state.search_query.clone())
        })
        .unwrap();
    assert_eq!(query_after_bs, "a");
}

#[test]
fn host_a11y_sink_receives_published_tree_with_contained_dialog_bounds_and_actions() {
    let sink = InMemoryPlatformAccessibility::new();
    let sink_for_view = sink.clone();

    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let handle_cell: Rc<RefCell<Option<WindowHandle<MobileShellView>>>> =
        Rc::new(RefCell::new(None));
    let handle_out = handle_cell.clone();
    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        register_mobile_fonts(cx).expect("register mobile fonts");
        let state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
        let win = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                move |_, cx| {
                    cx.new(|cx| {
                        MobileShellView::with_a11y_sink(
                            state,
                            Arc::new(Mutex::new(sink_for_view)),
                            cx,
                        )
                    })
                },
            )
            .expect("open headless mobile window");
        *handle_out.borrow_mut() = Some(win);
    });
    let window_handle = handle_cell.borrow_mut().take().unwrap();
    let headless_win = platform.windows().into_iter().next().unwrap();
    headless_win.request_frame();
    assert!(sink.publish_count() >= 1);

    app.update(|cx| {
        window_handle.update(cx, |v, _, cx| {
            v.state
                .open_doc("doc-arch", Origin::Direct(DirectKind::Home));
            assert!(v.perform_a11y_action("mobile.page.more_btn", MobileA11yAction::Activate, cx));
            assert!(v.perform_a11y_action(
                "mobile.sheet.doc_action.location_trail",
                MobileA11yAction::Activate,
                cx
            ));
        })
    })
    .unwrap();
    platform.advance_clock(Duration::from_millis(400));
    platform.run_until_parked();
    headless_win.request_frame();

    let tree = sink.latest_tree().expect("latest published tree");
    assert!(validate_accessibility_tree(&tree).is_empty());
    let dialog = tree.nodes.get("app.sheet.dialog").expect("dialog node");
    assert!(dialog.bounds.y > 0.0);
    for child_id in &dialog.children {
        let c = tree.nodes.get(child_id).expect("dialog child");
        assert!(
            c.bounds.x >= dialog.bounds.x - 0.5
                && c.bounds.y >= dialog.bounds.y - 0.5
                && c.bounds.x + c.bounds.width <= dialog.bounds.x + dialog.bounds.width + 0.5
                && c.bounds.y + c.bounds.height <= dialog.bounds.y + dialog.bounds.height + 0.5,
            "dialog child `{child_id}` {:?} exceeds dialog {:?}",
            c.bounds,
            dialog.bounds
        );
    }

    app.update(|cx| {
        window_handle.update(cx, |v, _, cx| {
            assert!(v.perform_a11y_action("mobile.sheet.loc.0", MobileA11yAction::Activate, cx));
        })
    })
    .unwrap();
    platform.advance_clock(Duration::from_millis(400));
    platform.run_until_parked();
    headless_win.request_frame();

    let final_tree = sink.latest_tree().expect("post-action tree");
    assert!(!final_tree.nodes.contains_key("app.sheet.dialog"));
    assert!(
        final_tree
            .nodes
            .get("mobile.page.more_btn")
            .is_some_and(|n| n.focused)
    );
}

#[test]
fn single_click_sheet_animation_completes_via_request_animation_frame_without_extra_input() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.home.doc.doc-arch");

    t.click_id_with_advance("mobile.page.more_btn", 0);
    for _ in 0..24 {
        t.platform.advance_clock(Duration::from_millis(16));
        t.platform.run_until_parked();
        t.headless_win.request_frame();
    }
    let (open_done, active_sheet) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                let now_ms = v.clock_ms(cx);
                (!v.state.has_active_animation(now_ms), v.state.active_sheet)
            })
        })
        .unwrap();
    assert_eq!(active_sheet, MobileSheet::DocActions);
    assert!(open_done);

    t.click_id_with_advance("mobile.sheet.done_btn", 0);
    for _ in 0..24 {
        t.platform.advance_clock(Duration::from_millis(16));
        t.platform.run_until_parked();
        t.headless_win.request_frame();
    }
    let (close_done, panel_mounted) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, window, cx| {
                let now_ms = v.clock_ms(cx);
                (
                    !v.state.has_active_animation(now_ms),
                    window
                        .frame_snapshot()
                        .elements
                        .contains_key("mobile.sheet.panel"),
                )
            })
        })
        .unwrap();
    assert!(close_done);
    assert!(!panel_mounted);
}

#[test]
fn create_doc_from_home_explorer_root_and_folder_opens_with_expected_origin() {
    let t = TestApp::launch(390, 844, MobileLocale::ZhHans);

    // 1. Create doc from Home `+` button -> empty stored title, localized display_title,
    //    workspace-scoped id, Origin::Direct(AllDocs).
    t.click_id("mobile.home.new_doc_btn");
    let (route1, stored_title1, display_zh, display_en, origin1) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let id = match &v.state.route {
                    MobileRoute::Page(id) => id.clone(),
                    other => panic!("expected Page route, got {other:?}"),
                };
                let doc = v.state.doc_by_id(&id).unwrap();
                let origin = v
                    .state
                    .active_workspace()
                    .history
                    .current()
                    .unwrap()
                    .origin
                    .clone();
                (
                    id,
                    doc.title.clone(),
                    doc.display_title(MobileLocale::ZhHans),
                    doc.display_title(MobileLocale::En),
                    origin,
                )
            })
        })
        .unwrap();
    assert_eq!(route1, "doc-ws-mobile-rust-new-1");
    assert!(
        stored_title1.is_empty(),
        "new doc stored title must stay empty so locale switches update display_title"
    );
    assert_eq!(display_zh, "无标题");
    assert_eq!(display_en, "Untitled");
    assert_eq!(origin1, Origin::Direct(DirectKind::AllDocs));

    // 2. Return to Home, go to All Docs root -> newly created doc and unfiled journal are listed.
    t.click_id("mobile.page.back_btn");
    t.click_id("mobile.tab.explorer");
    let (has_new_doc, has_journal) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                (
                    snap.elements.contains_key(
                        "mobile.explorer.doc.14:ws-mobile-rustdoc-ws-mobile-rust-new-1",
                    ),
                    snap.elements
                        .contains_key("mobile.explorer.doc.14:ws-mobile-rustdoc-journal"),
                )
            })
        })
        .unwrap();
    assert!(
        has_new_doc,
        "new doc must appear in All Docs Documents list"
    );
    assert!(
        has_journal,
        "unfiled journal doc must appear in All Docs Documents list"
    );

    // 3. Drill into folder `f-eng` and click `+` -> creates doc mounted in `f-eng` with valid fractional index.
    t.click_id("mobile.explorer.folder.f-eng");
    t.click_id("mobile.explorer.new_doc_btn");
    let (route2, origin2, folder_index) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let id = match &v.state.route {
                    MobileRoute::Page(id) => id.clone(),
                    other => panic!("expected Page route, got {other:?}"),
                };
                let origin = v
                    .state
                    .active_workspace()
                    .history
                    .current()
                    .unwrap()
                    .origin
                    .clone();
                let idx = v
                    .state
                    .active_workspace()
                    .folder_rows
                    .iter()
                    .find(|r| {
                        r.folder_type == "doc"
                            && r.data == id
                            && r.parent_id.as_deref() == Some("f-eng")
                    })
                    .map(|r| r.index.clone());
                (id, origin, idx)
            })
        })
        .unwrap();
    assert_eq!(route2, "doc-ws-mobile-rust-new-2");
    assert!(matches!(origin2, Origin::Placement { .. }));
    let idx = folder_index.expect("new folder doc must be linked under f-eng");
    assert!(
        idx.as_str() > "a0" && !idx.starts_with("z9"),
        "folder doc index {idx:?} must be a valid fractional index after existing siblings"
    );

    // 4. Opening a nonexistent doc renders explicit `Document not found` empty state.
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                v.state.route = MobileRoute::Page("doc-does-not-exist".into());
                cx.notify();
            })
        })
        .unwrap();
    t.platform.run_until_parked();
    t.headless_win.request_frame();
    let has_not_found = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                snap.elements.contains_key("mobile.page.not_found")
                    && snap.elements.contains_key("mobile.page.not_found_back_btn")
            })
        })
        .unwrap();
    assert!(
        has_not_found,
        "missing doc id must render explicit Document not found state"
    );
}

#[test]
fn search_no_results_omits_bordered_list_and_shows_empty_state() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.tab.search");
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                v.state.search_query = "NonexistentQuery".to_string();
                cx.notify();
            })
        })
        .unwrap();
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    let (has_list, has_empty) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                (
                    snap.elements.contains_key("mobile.search.results"),
                    snap.elements.contains_key("mobile.search.empty_state"),
                )
            })
        })
        .unwrap();
    assert!(!has_list, "empty search must not render bordered list box");
    assert!(has_empty, "empty search must render centered empty state");
}

#[test]
fn journals_week_strip_switches_date_and_creates_new_journal_for_empty_day() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.click_id("mobile.tab.journals");

    // Today (2026-11-25) already has `doc-journal`: clicking CTA opens it without creating a new doc.
    let docs_before = t
        .app
        .update(|cx| {
            t.window_handle
                .update(cx, |v, _, _| v.state.active_workspace().docs.len())
        })
        .unwrap();
    t.click_id("mobile.journals.create_btn");
    let (route_today, docs_after_today) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                (v.state.route.clone(), v.state.active_workspace().docs.len())
            })
        })
        .unwrap();
    assert_eq!(route_today, MobileRoute::Page("doc-journal".into()));
    assert_eq!(docs_after_today, docs_before);

    // Go back, select 2026-11-26 (no journal yet), and click CTA -> creates & opens new journal.
    t.click_id("mobile.page.back_btn");
    t.click_id("mobile.journals.day.2026-11-26");
    t.click_id("mobile.journals.create_btn");
    let (new_route, new_title, new_date, origin) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let id = match &v.state.route {
                    MobileRoute::Page(id) => id.clone(),
                    other => panic!("expected Page route, got {other:?}"),
                };
                let doc = v.state.doc_by_id(&id).unwrap();
                (
                    id,
                    doc.title.clone(),
                    doc.journal_date.clone(),
                    v.state
                        .active_workspace()
                        .history
                        .current()
                        .unwrap()
                        .origin
                        .clone(),
                )
            })
        })
        .unwrap();
    assert_ne!(new_route, "doc-journal");
    assert_eq!(new_title, "Journal 2026-11-26");
    assert_eq!(new_date.as_deref(), Some("2026-11-26"));
    assert_eq!(origin, Origin::Journal);
}

#[test]
fn trashed_doc_supports_restore_ready_backlinks_two_step_delete_and_history_purge() {
    // 1. Restore clears trashed flag, hides banner, keeps backlinks `Ready` workspace-wide,
    //    and rejects late/stale delete or restore calls on non-trashed or wrong-workspace docs.
    let t1 = TestApp::launch(390, 844, MobileLocale::En);
    t1.click_id("mobile.tab.explorer");
    t1.click_id("mobile.explorer.trash");
    t1.click_id("mobile.explorer.doc.14:ws-mobile-rustdoc-trash");
    t1.click_id("mobile.page.trash_restore_btn.14:ws-mobile-rustdoc-trash");
    let (route_after_restore, still_trashed, has_banner, arch_bl_ready, arch_bl_len) = t1
        .app
        .update(|cx| {
            t1.window_handle.update(cx, |v, window, _| {
                let bl = v.state.backlinks_for("doc-arch");
                assert!(!v.state.restore_doc_scoped("ws-mobile-rust", "doc-trash"));
                assert!(!v.state.delete_doc_permanently_scoped(
                    "ws-mobile-rust",
                    "doc-trash",
                    500.0
                ));
                assert!(
                    !v.state
                        .delete_doc_permanently_scoped("ws-personal", "doc-trash", 500.0)
                );
                (
                    v.state.route.clone(),
                    v.state.doc_by_id("doc-trash").unwrap().trashed,
                    window
                        .frame_snapshot()
                        .elements
                        .contains_key("mobile.page.trash_banner"),
                    bl.completeness == affine_client::BacklinkCompleteness::Ready,
                    bl.items.len(),
                )
            })
        })
        .unwrap();
    assert_eq!(route_after_restore, MobileRoute::Page("doc-trash".into()));
    assert!(!still_trashed);
    assert!(!has_banner);
    assert!(
        arch_bl_ready,
        "restoring trashed doc must sync link_graph clock so backlinks stay Ready"
    );
    assert_eq!(arch_bl_len, 2);

    // 2. Delete permanently requires two-step confirmation; Cancel preserves doc; Confirm purges
    //    all history entries pointing to `doc-trash` (`Home -> doc-trash -> doc-arch -> doc-trash`).
    let t2 = TestApp::launch(390, 844, MobileLocale::En);
    t2.app
        .update(|cx| {
            t2.window_handle.update(cx, |v, _, cx| {
                v.state
                    .open_doc("doc-trash", Origin::Direct(DirectKind::AllDocs));
                v.state
                    .open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                v.state
                    .open_doc("doc-trash", Origin::Direct(DirectKind::AllDocs));
                cx.notify();
            })
        })
        .unwrap();
    t2.platform.run_until_parked();
    t2.headless_win.request_frame();

    // First click opens confirmation sheet without deleting.
    t2.click_id("mobile.page.trash_delete_btn.14:ws-mobile-rustdoc-trash");
    let (sheet_after_first, doc_still_exists) = t2
        .app
        .update(|cx| {
            t2.window_handle.update(cx, |v, _, _| {
                (
                    v.state.active_sheet,
                    v.state.doc_by_id("doc-trash").is_some(),
                )
            })
        })
        .unwrap();
    assert_eq!(sheet_after_first, MobileSheet::ConfirmDeleteDoc);
    assert!(doc_still_exists, "first click must NOT delete immediately");
    let has_done_btn = t2
        .app
        .update(|cx| {
            t2.window_handle.update(cx, |_, window, _| {
                window
                    .frame_snapshot()
                    .elements
                    .contains_key("mobile.sheet.done_btn")
            })
        })
        .unwrap();
    assert!(
        !has_done_btn,
        "ConfirmDeleteDoc sheet must not render ambiguous top-right Done button"
    );

    // Cancel closes sheet and keeps doc intact.
    t2.click_id("app.sheet.delete_cancel.14:ws-mobile-rustdoc-trash");
    let (sheet_after_cancel, doc_after_cancel) = t2
        .app
        .update(|cx| {
            t2.window_handle.update(cx, |v, _, _| {
                (
                    v.state.active_sheet,
                    v.state.doc_by_id("doc-trash").is_some(),
                )
            })
        })
        .unwrap();
    assert_eq!(sheet_after_cancel, MobileSheet::None);
    assert!(doc_after_cancel);

    // Reopen and confirm delete -> doc removed, lands on `doc-arch`, one Back goes straight to `Home`.
    t2.click_id("mobile.page.trash_delete_btn.14:ws-mobile-rustdoc-trash");
    t2.click_id("app.sheet.delete_confirm.14:ws-mobile-rustdoc-trash");
    let (route_after_del, doc_exists) = t2
        .app
        .update(|cx| {
            t2.window_handle.update(cx, |v, _, _| {
                (
                    v.state.route.clone(),
                    v.state.doc_by_id("doc-trash").is_some(),
                )
            })
        })
        .unwrap();
    assert_eq!(route_after_del, MobileRoute::Page("doc-arch".into()));
    assert!(!doc_exists);

    t2.click_id("mobile.page.back_btn");
    let route_after_back = t2
        .app
        .update(|cx| t2.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(
        route_after_back,
        MobileRoute::Home,
        "Back after permanent delete must skip purged ghost entries and reach Home"
    );
}

#[test]
fn explorer_scrolls_30_docs_keeps_tabbar_fixed_and_opens_30th_doc() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                for i in 1..=30 {
                    v.state
                        .active_workspace_mut()
                        .docs
                        .push(affine_mobile::MobileDocRecord {
                            id: format!("doc-bulk-{i}"),
                            title: format!("Bulk Document {i}"),
                            body_preview: format!("Preview {i}"),
                            tags: Vec::new(),
                            updated_at_ms: 1_764_000_000 + i as i64,
                            is_favorite: false,
                            trashed: false,
                            journal_date: None,
                            clock: 1,
                            outgoing_edges: Vec::new(),
                            blocks: Vec::new(),
                        });
                }
                v.state.switch_tab(affine_mobile::MobileTab::Explorer, 0.0);
                cx.notify();
            })
        })
        .unwrap();
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    let tabbar_before = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                window.frame_snapshot().elements["mobile.tabbar"].bounds
            })
        })
        .unwrap();

    // Dispatch real scroll-wheel events to scroll to the bottom of the 30-doc list.
    for _ in 0..8 {
        t.headless_win
            .dispatch_input(PlatformInput::Scroll(ui::ScrollEvent {
                position: point(px(195.0), px(400.0)),
                delta: ui::ScrollDelta::Pixels(point(px(0.0), px(-300.0))),
                modifiers: ui::Modifiers::default(),
                touch_phase: ui::TouchPhase::Moved,
                ..Default::default()
            }));
        t.platform.run_until_parked();
        t.headless_win.request_frame();
    }

    let doc30_id = "mobile.explorer.doc.14:ws-mobile-rustdoc-bulk-30";
    let (tabbar_after, snap_bounds, a11y_bounds) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, window, _| {
                let snap = window.frame_snapshot();
                let tb = snap.elements["mobile.tabbar"].bounds;
                let sb = snap
                    .elements
                    .get(doc30_id)
                    .expect("30th doc must be visible in FrameSnapshot after scrolling")
                    .bounds;
                let ab = v
                    .published_a11y_tree()
                    .nodes
                    .get(doc30_id)
                    .expect("30th doc must be published in AccessibilityTree after scrolling")
                    .bounds;
                (tb, sb, ab)
            })
        })
        .unwrap();

    assert!((tabbar_after.y - tabbar_before.y).abs() <= 0.5);
    let drift = (snap_bounds.x - a11y_bounds.x)
        .abs()
        .max((snap_bounds.y - a11y_bounds.y).abs())
        .max((snap_bounds.width - a11y_bounds.width).abs())
        .max((snap_bounds.height - a11y_bounds.height).abs());
    assert!(drift <= 1.0, "30th doc a11y drift {drift:.2}px");

    t.click_id(doc30_id);
    let route = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route, MobileRoute::Page("doc-bulk-30".into()));
}

#[test]
fn touch_swipe_scrolls_30_docs_without_accidental_click_and_back_restores_scroll() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                for i in 1..=30 {
                    v.state
                        .active_workspace_mut()
                        .docs
                        .push(affine_mobile::MobileDocRecord {
                            id: format!("doc-bulk-{i}"),
                            title: format!("Bulk Document {i}"),
                            body_preview: format!("Preview {i}"),
                            tags: Vec::new(),
                            updated_at_ms: 1_764_000_000 + i as i64,
                            is_favorite: false,
                            trashed: false,
                            journal_date: None,
                            clock: 1,
                            outgoing_edges: Vec::new(),
                            blocks: Vec::new(),
                        });
                }
                v.state.switch_tab(affine_mobile::MobileTab::Explorer, 0.0);
                cx.notify();
            })
        })
        .unwrap();
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    let tabbar_before = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |_, window, _| {
                window.frame_snapshot().elements["mobile.tabbar"].bounds
            })
        })
        .unwrap();

    // Perform 4 native Touch pan swipes upward (y=600 -> y=160) to scroll to the 30th doc.
    for swipe in 0..4u64 {
        let touch_id = ui::TouchId(swipe + 1);
        t.headless_win
            .dispatch_input(PlatformInput::Touch(ui::TouchEvent {
                id: touch_id,
                phase: ui::TouchPhase::Started,
                position: point(px(195.0), px(600.0)),
                predicted_position: None,
                force: None,
            }));
        for step in 1..=8 {
            let y = 600.0 - (step as f32) * 55.0;
            t.headless_win
                .dispatch_input(PlatformInput::Touch(ui::TouchEvent {
                    id: touch_id,
                    phase: ui::TouchPhase::Moved,
                    position: point(px(195.0), px(y)),
                    predicted_position: None,
                    force: None,
                }));
        }
        t.headless_win
            .dispatch_input(PlatformInput::Touch(ui::TouchEvent {
                id: touch_id,
                phase: ui::TouchPhase::Ended,
                position: point(px(195.0), px(160.0)),
                predicted_position: None,
                force: None,
            }));
        t.platform.run_until_parked();
        t.headless_win.request_frame();
    }

    let doc30_id = format!(
        "mobile.explorer.doc.{}",
        affine_mobile::encode_scoped_doc_target("ws-mobile-rust", "doc-bulk-30")
    );
    let (route_after_swipe, scroll_after_swipe, tabbar_after, doc30_bounds) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, window, _| {
                let snap = window.frame_snapshot();
                (
                    v.state.route.clone(),
                    v.state.explorer_scroll_y,
                    snap.elements["mobile.tabbar"].bounds,
                    snap.elements
                        .get(&doc30_id)
                        .expect("30th doc must be visible after touch swipe")
                        .bounds,
                )
            })
        })
        .unwrap();
    assert_eq!(
        route_after_swipe,
        MobileRoute::Explorer,
        "touch swipe must never accidentally open an intermediate document"
    );
    assert!(
        scroll_after_swipe > 600.0,
        "expected scroll_y > 600 after swipes, got {scroll_after_swipe}"
    );
    assert!((tabbar_after.y - tabbar_before.y).abs() <= 0.5);

    // Tap the 30th document via native Touch Started -> Ended.
    let tap_pos = point(
        px(doc30_bounds.x + doc30_bounds.width * 0.5),
        px(doc30_bounds.y + doc30_bounds.height * 0.5),
    );
    t.headless_win
        .dispatch_input(PlatformInput::Touch(ui::TouchEvent {
            id: ui::TouchId(99),
            phase: ui::TouchPhase::Started,
            position: tap_pos,
            predicted_position: None,
            force: None,
        }));
    t.headless_win
        .dispatch_input(PlatformInput::Touch(ui::TouchEvent {
            id: ui::TouchId(99),
            phase: ui::TouchPhase::Ended,
            position: tap_pos,
            predicted_position: None,
            force: None,
        }));
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    let route_after_tap = t
        .app
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.route.clone()))
        .unwrap();
    assert_eq!(route_after_tap, MobileRoute::Page("doc-bulk-30".into()));

    // Pressing Back must restore the exact saved Explorer scroll position.
    t.click_id("mobile.page.back_btn");
    let (route_after_back, restored_scroll) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                (v.state.route.clone(), v.state.explorer_scroll_y)
            })
        })
        .unwrap();
    assert_eq!(route_after_back, MobileRoute::Explorer);
    assert!(
        (restored_scroll - scroll_after_swipe).abs() <= 1.0,
        "expected restored scroll {scroll_after_swipe}, got {restored_scroll}"
    );
}

#[test]
fn mouse_drag_off_list_and_hover_does_not_scroll_or_open_doc() {
    let t = TestApp::launch(390, 844, MobileLocale::En);
    t.app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, cx| {
                for i in 1..=30 {
                    v.state
                        .active_workspace_mut()
                        .docs
                        .push(affine_mobile::MobileDocRecord {
                            id: format!("doc-bulk-{i}"),
                            title: format!("Bulk Document {i}"),
                            body_preview: format!("Preview {i}"),
                            tags: Vec::new(),
                            updated_at_ms: 1_764_000_000 + i as i64,
                            is_favorite: false,
                            trashed: false,
                            journal_date: None,
                            clock: 1,
                            outgoing_edges: Vec::new(),
                            blocks: Vec::new(),
                        });
                }
                v.state.switch_tab(affine_mobile::MobileTab::Explorer, 0.0);
                cx.notify();
            })
        })
        .unwrap();
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    // Press mouse on a list row, drag onto the bottom TabBar, release on TabBar, then hover back across list.
    t.headless_win
        .dispatch_input(PlatformInput::MouseDown(ui::MouseDownEvent {
            button: ui::MouseButton::Left,
            position: point(px(195.0), px(450.0)),
            modifiers: ui::Modifiers::default(),
            click_count: 1,
            first_mouse: false,
        }));
    t.headless_win
        .dispatch_input(PlatformInput::MouseMove(ui::MouseMoveEvent {
            position: point(px(195.0), px(810.0)),
            pressed_button: Some(ui::MouseButton::Left),
            modifiers: ui::Modifiers::default(),
        }));
    t.headless_win
        .dispatch_input(PlatformInput::MouseUp(ui::MouseUpEvent {
            button: ui::MouseButton::Left,
            position: point(px(195.0), px(810.0)),
            modifiers: ui::Modifiers::default(),
            click_count: 1,
        }));
    for y in [700.0_f32, 550.0, 400.0, 250.0] {
        t.headless_win
            .dispatch_input(PlatformInput::MouseMove(ui::MouseMoveEvent {
                position: point(px(195.0), px(y)),
                pressed_button: None,
                modifiers: ui::Modifiers::default(),
            }));
    }
    t.platform.run_until_parked();
    t.headless_win.request_frame();

    let (route, scroll_y) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                (v.state.route.clone(), v.state.explorer_scroll_y)
            })
        })
        .unwrap();
    assert_eq!(route, MobileRoute::Explorer);
    assert_eq!(
        scroll_y, 0.0,
        "mouse drag off-list and subsequent unpressed hover must not scroll Explorer"
    );
}
