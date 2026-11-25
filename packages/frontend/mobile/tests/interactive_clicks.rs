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
                    v.state.scope.workspace_id.clone(),
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
    t.click_id("mobile.explorer.doc.doc-arch");

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
                    v.state.history.current().map(|e| e.target.clone()),
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
                let arch_seq = v.state.history.current().unwrap().seq;
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
        .update(|cx| t.window_handle.update(cx, |v, _, _| v.state.history.len()))
        .unwrap();

    // Open Location & Trail sheet and pick cur (`doc-sync`)'s own folder location.
    t.click_id("mobile.page.more_btn");
    t.click_id("mobile.sheet.loc.0");

    let (can_return, d0_pick_is_none, len_after_pick) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let d = v.state.derive_breadcrumb();
                let arch_entry = v
                    .state
                    .history
                    .entries()
                    .iter()
                    .find(|e| e.target == NavTarget::Doc("doc-arch".into()))
                    .unwrap();
                (
                    d.can_return_to_trail,
                    arch_entry.pick.is_none(),
                    v.state.history.len(),
                )
            })
        })
        .unwrap();
    assert!(can_return, "must be able to return to trail after cur pick");
    assert!(d0_pick_is_none, "picking cur location MUST NOT mutate d0");
    assert_eq!(len_after_pick, len_before);

    // Reopen sheet and click `Return to Trail` -> restores `d0 -> cur` trail with zero history push.
    t.click_id("mobile.page.more_btn");
    t.click_id("mobile.sheet.use_trail_btn");
    let (trail_len, len_after_return) = t
        .app
        .update(|cx| {
            t.window_handle.update(cx, |v, _, _| {
                let d = v.state.derive_breadcrumb();
                (d.trail.len(), v.state.history.len())
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
                let parent_seq = v.state.history.current().expect("doc-arch entry").seq;
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
                (v.state.history.len(), name)
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
                    v.state.history.current().map(|e| e.target.clone()),
                    v.state.history.len(),
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
                let target = v.state.history.current().map(|e| e.target.clone());
                let len = v.state.history.len();
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
                    snap.elements.contains_key("mobile.explorer.doc.doc-sync"),
                    snap.elements
                        .contains_key("mobile.explorer.doc.doc-journal"),
                    snap.elements.contains_key("mobile.explorer.doc.doc-arch"),
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
                v.state.history.current().map(|e| e.target.clone())
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
                    snap.elements.contains_key("mobile.explorer.doc.doc-sync"),
                    snap.elements.contains_key("mobile.explorer.doc.doc-arch"),
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
    assert_eq!(active_sheet, MobileSheet::LocationAndTrail);
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
