//! Accessibility parity and geometry alignment integration tests.
//!
//! Verifies:
//! 1. Four-edge safe-area insets (landscape left/right notches) x LTR/RTL synchronize published
//!    `AccessibilityTree` bounds with rendered `FrameSnapshot` bounds within `<= 1.0px`.
//! 2. Modal sheets prune background landmarks from the published tree and block background
//!    `perform_a11y_action` invocations.
//! 3. Every interactive node published across all routes and sheets activates cleanly via
//!    `perform_a11y_action`, and `mobile.explorer.back_btn`, `breadcrumb.slot.*`, and
//!    `mobile.sheet.backlink.0` produce identical `route`, `history`, and sheet state to clicks.

use std::{
    cell::RefCell,
    rc::Rc,
    sync::{Arc, Mutex},
    time::Duration,
};

use affine_client::{
    AccessibilityRole, AccessibilityTree, DirectKind, NavTarget, Origin, PlatformAccessibility,
};
use affine_mobile::{
    MobileA11yAction, MobileAppState, MobileBackCoordinator, MobileLocale, MobileRoute,
    MobileSheet, MobileShellView, MobileTab, perform_a11y_action, register_mobile_fonts,
    seed_showcase_state, validate_accessibility_tree,
};
use ui::{
    Application, Bounds, Edges, HeadlessPlatform, WindowBounds, WindowHandle, WindowInsets,
    WindowOptions, point, prelude::*, px, size,
};
use ui_tokens::ThemeMode;

struct ParityApp {
    platform: Rc<HeadlessPlatform>,
    app: ui::ApplicationHandle,
    window_handle: WindowHandle<MobileShellView>,
    headless_win: ui::HeadlessWindow,
}

impl ParityApp {
    fn launch_with_state(width: u32, height: u32, state: MobileAppState) -> Self {
        let platform = HeadlessPlatform::new(width, height, 1.0);
        let handle_cell: Rc<RefCell<Option<WindowHandle<MobileShellView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();

        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_mobile_fonts(cx).expect("register mobile fonts");
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

    fn set_insets(&self, left: f32, top: f32, right: f32, bottom: f32) {
        self.app
            .update(|cx| {
                self.window_handle.update(cx, |v, _, cx| {
                    v.set_insets_override(Some(WindowInsets {
                        safe_area: Edges {
                            top: px(top),
                            right: px(right),
                            bottom: px(bottom),
                            left: px(left),
                        },
                        ..WindowInsets::default()
                    }));
                    cx.notify();
                })
            })
            .unwrap();
        self.platform.run_until_parked();
        self.headless_win.request_frame();
    }

    fn click_id(&self, id: &str) {
        self.headless_win.request_frame();
        let pt = self
            .app
            .update(|cx| {
                self.window_handle.update(cx, |_, window, _| {
                    let snap = window.frame_snapshot();
                    let el = snap
                        .elements
                        .get(id)
                        .or_else(|| {
                            snap.elements
                                .iter()
                                .find(|(k, _)| k.starts_with(id))
                                .map(|(_, v)| v)
                        })
                        .unwrap_or_else(|| {
                            panic!(
                                "element `{id}` missing from snapshot: {:?}",
                                snap.elements.keys().collect::<Vec<_>>()
                            )
                        });
                    point(
                        px(el.bounds.x + el.bounds.width * 0.5),
                        px(el.bounds.y + el.bounds.height * 0.5),
                    )
                })
            })
            .unwrap();
        self.headless_win.simulate_click(pt);
        self.platform.run_until_parked();
        self.platform.advance_clock(Duration::from_millis(400));
        self.platform.run_until_parked();
        self.headless_win.request_frame();
    }

    fn assert_a11y_matches_snapshot(&self, tag: &str, expected_ids: &[&str]) {
        self.headless_win.request_frame();
        self.app
            .update(|cx| {
                self.window_handle.update(cx, |v, window, _| {
                    let snap = window.frame_snapshot();
                    let tree = v.published_a11y_tree();
                    assert!(
                        validate_accessibility_tree(tree).is_empty(),
                        "{tag}: invalid a11y tree"
                    );
                    for a11y_id in expected_ids {
                        let node = tree
                            .nodes
                            .get(*a11y_id)
                            .unwrap_or_else(|| panic!("{tag}: missing a11y node `{a11y_id}`"));
                        let snap_id = if *a11y_id == "page.backlinks.pill" {
                            "mobile.page.backlinks_pill".to_string()
                        } else if *a11y_id == "app.sheet.dialog" {
                            "mobile.sheet.panel".to_string()
                        } else if let Some(slot) = a11y_id.strip_prefix("breadcrumb.slot.") {
                            format!("mobile.page.breadcrumb.slot.{slot}")
                        } else {
                            (*a11y_id).to_string()
                        };
                        let el = snap.elements.get(&snap_id).unwrap_or_else(|| {
                            panic!("{tag}: missing snapshot element `{snap_id}` for `{a11y_id}`")
                        });
                        let diff = (node.bounds.x - el.bounds.x)
                            .abs()
                            .max((node.bounds.y - el.bounds.y).abs())
                            .max((node.bounds.width - el.bounds.width).abs())
                            .max((node.bounds.height - el.bounds.height).abs());
                        assert!(
                            diff <= 1.0,
                            "{tag}: `{a11y_id}` bounds drift {diff:.2}px: tree={:?} vs screen={:?}",
                            node.bounds,
                            el.bounds
                        );
                    }
                })
            })
            .unwrap();
    }
}

#[test]
fn landscape_notch_a11y_bounds_match_rendered_snapshot_in_ltr_and_rtl() {
    let cases = [
        ("left-notch-ltr", MobileLocale::En, 44.0_f32, 0.0_f32),
        ("left-notch-rtl", MobileLocale::Ar, 44.0_f32, 0.0_f32),
        ("right-notch-ltr", MobileLocale::En, 0.0_f32, 44.0_f32),
        ("right-notch-rtl", MobileLocale::Ar, 0.0_f32, 44.0_f32),
    ];

    for (label, locale, safe_left, safe_right) in cases {
        let state = seed_showcase_state(locale, ThemeMode::Light, "2026-11-25");
        let app = ParityApp::launch_with_state(844, 390, state);
        app.set_insets(safe_left, 0.0, safe_right, 21.0);

        // 1. Home + TabBar under landscape notch.
        app.assert_a11y_matches_snapshot(
            &format!("{label}/home"),
            &[
                "mobile.home.workspace_btn",
                "mobile.tab.home",
                "mobile.tab.explorer",
                "mobile.tab.journals",
                "mobile.tab.search",
            ],
        );

        // Verify physical LTR/RTL tab ordering respects horizontal notch + 8pt padding.
        app.app
            .update(|cx| {
                app.window_handle.update(cx, |v, _, _| {
                    let tree = v.published_a11y_tree();
                    let home_x = tree.nodes["mobile.tab.home"].bounds.x;
                    let search_x = tree.nodes["mobile.tab.search"].bounds.x;
                    if locale.direction().is_rtl() {
                        assert!(
                            home_x > search_x,
                            "{label}: RTL home tab must sit right of search tab"
                        );
                        assert!(
                            (search_x - (safe_left + 8.0)).abs() <= 1.0,
                            "{label}: RTL leftmost tab x={search_x} expected {}",
                            safe_left + 8.0
                        );
                    } else {
                        assert!(
                            home_x < search_x,
                            "{label}: LTR home tab must sit left of search tab"
                        );
                        assert!(
                            (home_x - (safe_left + 8.0)).abs() <= 1.0,
                            "{label}: LTR leftmost tab x={home_x} expected {}",
                            safe_left + 8.0
                        );
                    }
                })
            })
            .unwrap();

        // 2. Page with multi-location breadcrumb + Backlinks pill.
        app.app
            .update(|cx| {
                app.window_handle.update(cx, |v, _, cx| {
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
        app.platform.run_until_parked();
        app.headless_win.request_frame();

        let slot_ids: Vec<String> = app
            .app
            .update(|cx| {
                app.window_handle.update(cx, |v, _, _| {
                    v.published_a11y_tree()
                        .nodes
                        .keys()
                        .filter(|k| k.starts_with("breadcrumb.slot."))
                        .cloned()
                        .collect()
                })
            })
            .unwrap();
        assert!(!slot_ids.is_empty(), "{label}: breadcrumb slots expected");
        let mut page_ids = vec![
            "mobile.page.back_btn",
            "mobile.page.more_btn",
            "page.backlinks.pill",
        ];
        for s in &slot_ids {
            page_ids.push(s.as_str());
        }
        app.assert_a11y_matches_snapshot(&format!("{label}/page"), &page_ids);

        // 3. Settled Location & Trail modal sheet.
        app.app
            .update(|cx| {
                app.window_handle.update(cx, |v, _, cx| {
                    v.state.open_sheet(MobileSheet::LocationAndTrail, 0.0);
                    v.state.settle_animations(500.0);
                    cx.notify();
                })
            })
            .unwrap();
        app.platform.run_until_parked();
        app.assert_a11y_matches_snapshot(
            &format!("{label}/location-sheet"),
            &[
                "app.sheet.dialog",
                "mobile.sheet.done_btn",
                "mobile.sheet.trail.0",
                "mobile.sheet.owner_loc.0",
                "mobile.sheet.loc.0",
            ],
        );
    }
}

#[test]
fn all_published_interactive_a11y_nodes_activate_and_modal_blocks_background() {
    type StateFactory = Box<dyn Fn() -> MobileAppState>;
    let factories: Vec<(&'static str, StateFactory)> = vec![
        (
            "home",
            Box::new(|| seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25")),
        ),
        (
            "ws-sheet",
            Box::new(|| {
                let mut s = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
                s.open_sheet(MobileSheet::WorkspaceSelector, 0.0);
                s.settle_animations(500.0);
                s
            }),
        ),
        (
            "explorer-folder",
            Box::new(|| {
                let mut s = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
                s.switch_tab(MobileTab::Explorer, 0.0);
                s.navigate_target(
                    NavTarget::Folder("f-eng".into()),
                    Origin::Direct(DirectKind::AllDocs),
                );
                s.navigate_target(
                    NavTarget::Folder("f-mobile".into()),
                    Origin::Direct(DirectKind::AllDocs),
                );
                s
            }),
        ),
        (
            "page-multi",
            Box::new(|| {
                let mut s = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
                s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                s
            }),
        ),
        (
            "loc-sheet",
            Box::new(|| {
                let mut s = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
                s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                let arch_seq = s.history.current().unwrap().seq;
                s.open_doc(
                    "doc-sync",
                    Origin::DocLink {
                        parent_seq: arch_seq,
                        block_id: None,
                    },
                );
                s.open_sheet(MobileSheet::LocationAndTrail, 0.0);
                s.settle_animations(500.0);
                s
            }),
        ),
        (
            "backlinks-sheet",
            Box::new(|| {
                let mut s = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
                s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                s.open_sheet(MobileSheet::Backlinks, 0.0);
                s.settle_animations(500.0);
                s
            }),
        ),
        (
            "settings",
            Box::new(|| {
                let mut s = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
                s.open_settings();
                s
            }),
        ),
    ];

    for (name, make_state) in factories {
        let initial = make_state();
        let is_modal = initial.active_sheet != MobileSheet::None;
        let app = ParityApp::launch_with_state(390, 844, initial);
        app.headless_win.request_frame();

        let tree = app
            .app
            .update(|cx| {
                app.window_handle
                    .update(cx, |v, _, _| v.published_a11y_tree().clone())
            })
            .unwrap();
        assert!(
            validate_accessibility_tree(&tree).is_empty(),
            "{name}: invalid tree"
        );

        if is_modal {
            assert!(
                !tree.nodes.contains_key("app.nav.tabbar")
                    && !tree.nodes.contains_key("app.main")
                    && !tree.nodes.contains_key("app.nav.breadcrumb"),
                "{name}: modal sheet must prune background landmarks"
            );
            // Background actions must be rejected while modal sheet is open.
            for bg_id in [
                "mobile.tab.explorer",
                "mobile.home.workspace_btn",
                "mobile.page.back_btn",
                "page.backlinks.pill",
            ] {
                let mut probe = make_state();
                let before_route = probe.route.clone();
                let before_tab = probe.active_tab;
                assert!(
                    !perform_a11y_action(&mut probe, bg_id, MobileA11yAction::Activate, 600.0),
                    "{name}: background action `{bg_id}` must be blocked while modal is open"
                );
                assert_eq!(probe.route, before_route);
                assert_eq!(probe.active_tab, before_tab);
            }
        }

        // Every published interactive node must succeed on Activate via the real view dispatcher.
        for (id, node) in &tree.nodes {
            if matches!(
                node.role,
                AccessibilityRole::Button | AccessibilityRole::Tab | AccessibilityRole::Link
            ) {
                let probe_app = ParityApp::launch_with_state(390, 844, make_state());
                probe_app.headless_win.request_frame();
                let handled = probe_app
                    .app
                    .update(|cx| {
                        probe_app.window_handle.update(cx, |v, _, cx| {
                            v.perform_a11y_action(id, MobileA11yAction::Activate, cx)
                        })
                    })
                    .unwrap();
                assert!(
                    handled,
                    "{name}: published interactive node `{id}` ({:?}) failed Activate",
                    node.role
                );
            }
        }
    }
}

#[test]
fn a11y_actions_match_real_clicks_for_explorer_back_breadcrumb_and_backlink() {
    // 1. Explorer drill-down back button parity.
    {
        let make_state = || {
            let mut init = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
            init.switch_tab(MobileTab::Explorer, 0.0);
            init.navigate_target(
                NavTarget::Folder("f-eng".into()),
                Origin::Direct(DirectKind::AllDocs),
            );
            init.navigate_target(
                NavTarget::Folder("f-mobile".into()),
                Origin::Direct(DirectKind::AllDocs),
            );
            init
        };

        let click_app = ParityApp::launch_with_state(390, 844, make_state());
        click_app.click_id("mobile.explorer.back_btn");
        let (click_route, click_len, click_target) = click_app
            .app
            .update(|cx| {
                click_app.window_handle.update(cx, |v, _, _| {
                    (
                        v.state.route.clone(),
                        v.state.history.len(),
                        v.state.history.current().map(|e| e.target.clone()),
                    )
                })
            })
            .unwrap();

        let mut a11y_state = make_state();
        assert!(perform_a11y_action(
            &mut a11y_state,
            "mobile.explorer.back_btn",
            MobileA11yAction::Activate,
            400.0
        ));
        assert_eq!(a11y_state.route, click_route);
        assert_eq!(a11y_state.history.len(), click_len);
        assert_eq!(
            a11y_state.history.current().map(|e| e.target.clone()),
            click_target
        );
    }

    // 2. Breadcrumb ancestor folder slot parity.
    {
        let make_state = || {
            let mut init = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
            init.open_doc(
                "doc-sync",
                Origin::Placement {
                    link_id: "l-sync-eng".into(),
                },
            );
            init
        };

        let click_app = ParityApp::launch_with_state(390, 844, make_state());
        click_app.click_id("mobile.page.breadcrumb.slot.folder:f-eng");
        let (click_route, click_len, click_target) = click_app
            .app
            .update(|cx| {
                click_app.window_handle.update(cx, |v, _, _| {
                    (
                        v.state.route.clone(),
                        v.state.history.len(),
                        v.state.history.current().map(|e| e.target.clone()),
                    )
                })
            })
            .unwrap();

        let mut a11y_state = make_state();
        assert!(perform_a11y_action(
            &mut a11y_state,
            "breadcrumb.slot.folder:f-eng",
            MobileA11yAction::Activate,
            400.0
        ));
        assert_eq!(a11y_state.route, click_route);
        assert_eq!(a11y_state.history.len(), click_len);
        assert_eq!(
            a11y_state.history.current().map(|e| e.target.clone()),
            click_target
        );
    }

    // 3. Backlinks sheet row parity.
    {
        let make_state = || {
            let mut init = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
            init.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
            init.open_sheet(MobileSheet::Backlinks, 0.0);
            init.settle_animations(500.0);
            init
        };

        let click_app = ParityApp::launch_with_state(390, 844, make_state());
        click_app.click_id("mobile.sheet.backlink.0");
        let (click_route, click_sheet, click_len) = click_app
            .app
            .update(|cx| {
                click_app.window_handle.update(cx, |v, _, _| {
                    (
                        v.state.route.clone(),
                        v.state.active_sheet,
                        v.state.history.len(),
                    )
                })
            })
            .unwrap();

        let mut a11y_state = make_state();
        assert!(perform_a11y_action(
            &mut a11y_state,
            "mobile.sheet.backlink.0",
            MobileA11yAction::Activate,
            400.0
        ));
        assert_eq!(a11y_state.route, click_route);
        assert_eq!(a11y_state.active_sheet, click_sheet);
        assert_eq!(a11y_state.history.len(), click_len);
        assert_eq!(a11y_state.route, MobileRoute::Page("doc-journal".into()));
    }
}

#[test]
fn explorer_a11y_drilldown_and_origins_match_clicks_across_folder_collection_tag() {
    // 1. Full All Docs -> Engineering -> Mobile Rust -> doc-arch drilldown via a11y only.
    let make_root = || {
        let mut s = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
        s.switch_tab(MobileTab::Explorer, 0.0);
        s
    };
    let click_app = ParityApp::launch_with_state(390, 844, make_root());
    for id in [
        "mobile.explorer.folder.f-eng",
        "mobile.explorer.folder.f-mobile",
        "mobile.explorer.doc.doc-arch",
    ] {
        click_app.click_id(id);
    }
    let (click_origin, click_crumbs, click_hist_len) = click_app
        .app
        .update(|cx| {
            click_app.window_handle.update(cx, |v, _, _| {
                let d = v.state.derive_breadcrumb();
                let ids: Vec<String> = d.crumbs.iter().map(|c| c.id.clone()).collect();
                (
                    v.state.history.current().unwrap().origin.clone(),
                    ids,
                    v.state.history.len(),
                )
            })
        })
        .unwrap();

    let mut a11y_state = make_root();
    for id in [
        "mobile.explorer.folder.f-eng",
        "mobile.explorer.folder.f-mobile",
        "mobile.explorer.doc.doc-arch",
    ] {
        assert!(perform_a11y_action(
            &mut a11y_state,
            id,
            MobileA11yAction::Activate,
            400.0
        ));
    }
    let a11y_origin = a11y_state.history.current().unwrap().origin.clone();
    let a11y_crumbs: Vec<String> = a11y_state
        .derive_breadcrumb()
        .crumbs
        .iter()
        .map(|c| c.id.clone())
        .collect();
    assert_eq!(
        a11y_origin,
        Origin::Placement {
            link_id: "l-arch-eng".into()
        }
    );
    assert_eq!(a11y_origin, click_origin);
    assert_eq!(
        a11y_crumbs,
        vec!["folder:f-eng", "folder:f-mobile", "doc:doc-arch"]
    );
    assert_eq!(a11y_crumbs, click_crumbs);
    assert_eq!(a11y_state.history.len(), click_hist_len);

    // 2. Folder, Collection, and Tag origins match clicks 100%.
    let origin_cases: [(&str, NavTarget, &str, Origin); 3] = [
        (
            "folder",
            NavTarget::Folder("f-mobile".into()),
            "mobile.explorer.doc.doc-arch",
            Origin::Placement {
                link_id: "l-arch-eng".into(),
            },
        ),
        (
            "collection",
            NavTarget::Collection("col-sync".into()),
            "mobile.explorer.doc.doc-sync",
            Origin::Collection("col-sync".into()),
        ),
        (
            "tag",
            NavTarget::Tag("rust".into()),
            "mobile.explorer.doc.doc-arch",
            Origin::Tag("rust".into()),
        ),
    ];
    for (label, target, doc_row_id, expected_origin) in origin_cases {
        let make_ctx = || {
            let mut s = make_root();
            s.navigate_target(target.clone(), Origin::Direct(DirectKind::AllDocs));
            s
        };
        let app = ParityApp::launch_with_state(390, 844, make_ctx());
        app.assert_a11y_matches_snapshot(&format!("explorer-{label}"), &[doc_row_id]);
        app.click_id(doc_row_id);
        let (c_origin, c_crumbs) = app
            .app
            .update(|cx| {
                app.window_handle.update(cx, |v, _, _| {
                    let ids: Vec<String> = v
                        .state
                        .derive_breadcrumb()
                        .crumbs
                        .iter()
                        .map(|c| c.id.clone())
                        .collect();
                    (v.state.history.current().unwrap().origin.clone(), ids)
                })
            })
            .unwrap();

        let mut s = make_ctx();
        assert!(perform_a11y_action(
            &mut s,
            doc_row_id,
            MobileA11yAction::Activate,
            400.0
        ));
        let a_origin = s.history.current().unwrap().origin.clone();
        let a_crumbs: Vec<String> = s
            .derive_breadcrumb()
            .crumbs
            .iter()
            .map(|c| c.id.clone())
            .collect();
        assert_eq!(a_origin, expected_origin, "{label}: origin mismatch");
        assert_eq!(a_origin, c_origin, "{label}: click vs a11y origin mismatch");
        assert_eq!(a_crumbs, c_crumbs, "{label}: click vs a11y crumbs mismatch");
    }
}

#[test]
fn cross_sheet_stale_a11y_action_is_rejected() {
    let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
    state.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
    state.open_sheet(MobileSheet::Backlinks, 0.0);
    state.settle_animations(500.0);

    let ws_before = state.active_workspace_idx;
    let route_before = state.route.clone();
    assert!(!perform_a11y_action(
        &mut state,
        "mobile.sheet.ws.ws-personal",
        MobileA11yAction::Activate,
        600.0
    ));
    assert_eq!(state.active_workspace_idx, ws_before);
    assert_eq!(state.route, route_before);
    assert_eq!(state.active_sheet, MobileSheet::Backlinks);
}

#[test]
fn narrow_breadcrumb_ellipsis_sheet_close_restores_focus_to_ellipsis() {
    let mut init = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
    init.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
    let s1 = init.history.current().unwrap().seq;
    init.open_doc(
        "doc-sync",
        Origin::DocLink {
            parent_seq: s1,
            block_id: None,
        },
    );
    let s2 = init.history.current().unwrap().seq;
    init.open_doc(
        "doc-journal",
        Origin::DocLink {
            parent_seq: s2,
            block_id: None,
        },
    );

    let app = ParityApp::launch_with_state(320, 568, init);
    app.headless_win.request_frame();

    // Activate ellipsis -> opens LocationAndTrail -> close via Done -> focus returns to ellipsis.
    let ellipsis_id = "breadcrumb.slot.breadcrumb.ellipsis";
    app.app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, cx| {
                assert!(v.published_a11y_tree().nodes.contains_key(ellipsis_id));
                assert!(v.perform_a11y_action(ellipsis_id, MobileA11yAction::Activate, cx));
            })
        })
        .unwrap();
    app.platform.advance_clock(Duration::from_millis(400));
    app.platform.run_until_parked();
    app.headless_win.request_frame();

    app.app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, cx| {
                assert!(v.perform_a11y_action(
                    "mobile.sheet.done_btn",
                    MobileA11yAction::Activate,
                    cx
                ));
            })
        })
        .unwrap();
    app.platform.advance_clock(Duration::from_millis(400));
    app.platform.run_until_parked();
    app.headless_win.request_frame();

    let focused_after_done: Vec<String> = app
        .app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, _| {
                v.published_a11y_tree()
                    .nodes
                    .values()
                    .filter(|n| n.focused)
                    .map(|n| n.id.clone())
                    .collect()
            })
        })
        .unwrap();
    assert_eq!(focused_after_done, vec![ellipsis_id]);

    // Reopen via ellipsis and close via system Back -> focus returns to ellipsis.
    app.app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, cx| {
                assert!(v.perform_a11y_action(ellipsis_id, MobileA11yAction::Activate, cx));
                let t = v.clock_ms(cx) + 400.0;
                MobileBackCoordinator::handle_back(&mut v.state, t);
                cx.notify();
            })
        })
        .unwrap();
    app.platform.advance_clock(Duration::from_millis(400));
    app.platform.run_until_parked();
    app.headless_win.request_frame();

    let focused_after_back: Vec<String> = app
        .app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, _| {
                v.published_a11y_tree()
                    .nodes
                    .values()
                    .filter(|n| n.focused)
                    .map(|n| n.id.clone())
                    .collect()
            })
        })
        .unwrap();
    assert_eq!(focused_after_back, vec![ellipsis_id]);
}

#[derive(Clone, Default)]
struct RecordingSink {
    publishes: Arc<Mutex<Vec<AccessibilityTree>>>,
}

impl PlatformAccessibility for RecordingSink {
    fn publish_tree(&mut self, tree: &AccessibilityTree) {
        self.publishes.lock().unwrap().push(tree.clone());
    }

    fn announce(&mut self, _message: &str, _polite: bool) {}
}

#[test]
fn a11y_sink_publishes_once_per_frame_with_measured_bounds_including_rotation() {
    let sink = RecordingSink::default();
    let sink_view = sink.clone();
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
                        MobileShellView::with_a11y_sink(state, Arc::new(Mutex::new(sink_view)), cx)
                    })
                },
            )
            .expect("open headless mobile window");
        *handle_out.borrow_mut() = Some(win);
    });
    let window_handle = handle_cell.borrow_mut().take().unwrap();
    let headless_win = platform.windows().into_iter().next().unwrap();

    // Initial window open renders frame 1: must publish exactly ONCE (post-measurement only).
    {
        let trees = sink.publishes.lock().unwrap();
        assert_eq!(
            trees.len(),
            1,
            "initial frame 1 must publish exactly once (zero unmeasured pre-paint publishes)"
        );
        let tree = &trees[0];
        app.update(|cx| {
            window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                for id in [
                    "mobile.home.workspace_btn",
                    "mobile.tab.home",
                    "mobile.tab.search",
                ] {
                    let a = tree.nodes[id].bounds;
                    let s = snap.elements[id].bounds;
                    let d = (a.x - s.x)
                        .abs()
                        .max((a.y - s.y).abs())
                        .max((a.width - s.width).abs())
                        .max((a.height - s.height).abs());
                    assert!(d <= 1.0, "frame 1 `{id}` drift {d:.2}px");
                }
            })
        })
        .unwrap();
    }

    // Rotate to 844x390 landscape with left notch 44pt -> single post-measurement publish.
    sink.publishes.lock().unwrap().clear();
    app.update(|cx| {
        window_handle.update(cx, |v, window, cx| {
            window.resize(size(px(844.0), px(390.0)));
            v.set_insets_override(Some(WindowInsets {
                safe_area: Edges {
                    top: px(0.0),
                    right: px(0.0),
                    bottom: px(21.0),
                    left: px(44.0),
                },
                ..WindowInsets::default()
            }));
            cx.notify();
        })
    })
    .unwrap();
    platform.run_until_parked();
    headless_win.request_frame();

    let trees = sink.publishes.lock().unwrap();
    assert_eq!(trees.len(), 1, "rotated frame must publish exactly once");
    let tree = &trees[0];
    app.update(|cx| {
        window_handle.update(cx, |_, window, _| {
            let snap = window.frame_snapshot();
            for id in [
                "mobile.home.workspace_btn",
                "mobile.tab.home",
                "mobile.tab.search",
            ] {
                let a = tree.nodes[id].bounds;
                let s = snap.elements[id].bounds;
                let d = (a.x - s.x)
                    .abs()
                    .max((a.y - s.y).abs())
                    .max((a.width - s.width).abs())
                    .max((a.height - s.height).abs());
                assert!(d <= 1.0, "rotated `{id}` drift {d:.2}px");
            }
        })
    })
    .unwrap();
}

#[test]
fn stale_explorer_doc_action_from_previous_workspace_is_rejected() {
    let mut init = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
    init.switch_tab(MobileTab::Explorer, 0.0);
    init.navigate_target(
        NavTarget::Folder("f-eng".into()),
        Origin::Direct(DirectKind::AllDocs),
    );
    init.navigate_target(
        NavTarget::Folder("f-mobile".into()),
        Origin::Direct(DirectKind::AllDocs),
    );

    let app = ParityApp::launch_with_state(390, 844, init);
    app.headless_win.request_frame();

    // Confirm `mobile.explorer.doc.doc-arch` is published in AFFiNE Core's Mobile Rust folder.
    let present_in_core = app
        .app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, _| {
                v.published_a11y_tree()
                    .nodes
                    .contains_key("mobile.explorer.doc.doc-arch")
            })
        })
        .unwrap();
    assert!(present_in_core);

    // Switch workspace to Personal Notes (which does not contain `doc-arch`) and redraw.
    app.app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, cx| {
                let personal_idx = v
                    .state
                    .workspaces
                    .iter()
                    .position(|w| w.id == "ws-personal")
                    .expect("ws-personal exists");
                v.state.select_workspace(personal_idx, 500.0);
                v.state.settle_animations(1000.0);
                cx.notify();
            })
        })
        .unwrap();
    app.platform.run_until_parked();
    app.headless_win.request_frame();

    // Dispatching the stale `mobile.explorer.doc.doc-arch` action must return false and leave
    // workspace, route, and history completely untouched.
    app.app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, cx| {
                assert!(
                    !v.published_a11y_tree()
                        .nodes
                        .contains_key("mobile.explorer.doc.doc-arch")
                );
                let ws_before = v.state.scope.workspace_id.clone();
                let route_before = v.state.route.clone();
                let hist_before: Vec<NavTarget> = v
                    .state
                    .history
                    .entries()
                    .iter()
                    .map(|e| e.target.clone())
                    .collect();

                assert!(!v.perform_a11y_action(
                    "mobile.explorer.doc.doc-arch",
                    MobileA11yAction::Activate,
                    cx
                ));
                assert_eq!(v.state.scope.workspace_id, ws_before);
                assert_eq!(v.state.route, route_before);
                let hist_after: Vec<NavTarget> = v
                    .state
                    .history
                    .entries()
                    .iter()
                    .map(|e| e.target.clone())
                    .collect();
                assert_eq!(hist_after, hist_before);
            })
        })
        .unwrap();
}

#[test]
fn stale_breadcrumb_ellipsis_action_after_widening_viewport_is_rejected() {
    let mut init = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
    init.open_doc(
        "doc-arch",
        Origin::Placement {
            link_id: "l-arch-mobile".into(),
        },
    );
    let arch_seq = init.history.current().unwrap().seq;
    init.open_doc(
        "doc-sync",
        Origin::DocLink {
            parent_seq: arch_seq,
            block_id: None,
        },
    );
    let sync_seq = init.history.current().unwrap().seq;
    init.open_doc(
        "doc-journal",
        Origin::DocLink {
            parent_seq: sync_seq,
            block_id: None,
        },
    );

    // 1. At narrow 320x568 viewport, the 3-doc trail overflows and publishes an ellipsis slot.
    let app = ParityApp::launch_with_state(320, 568, init);
    app.headless_win.request_frame();

    app.app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, cx| {
                assert!(
                    v.published_a11y_tree()
                        .nodes
                        .contains_key("breadcrumb.slot.breadcrumb.ellipsis"),
                    "narrow 320px viewport must publish breadcrumb ellipsis slot"
                );
                assert!(v.perform_a11y_action(
                    "breadcrumb.slot.breadcrumb.ellipsis",
                    MobileA11yAction::Activate,
                    cx
                ));
                assert_eq!(v.state.active_sheet, MobileSheet::LocationAndTrail);
                assert!(v.perform_a11y_action(
                    "mobile.sheet.done_btn",
                    MobileA11yAction::Activate,
                    cx
                ));
                assert_eq!(v.state.active_sheet, MobileSheet::None);
            })
        })
        .unwrap();
    app.platform.run_until_parked();
    app.headless_win.request_frame();

    // 2. Widen viewport to 960x568 so all breadcrumb segments fit without an ellipsis slot.
    app.app
        .update(|cx| {
            app.window_handle.update(cx, |_, window, cx| {
                window.resize(ui::size(ui::px(960.0), ui::px(568.0)));
                cx.notify();
            })
        })
        .unwrap();
    app.platform.run_until_parked();
    app.headless_win.request_frame();

    // 3. Dispatching the stale ellipsis slot ID must now be rejected.
    app.app
        .update(|cx| {
            app.window_handle.update(cx, |v, _, cx| {
                assert!(
                    !v.published_a11y_tree()
                        .nodes
                        .contains_key("breadcrumb.slot.breadcrumb.ellipsis"),
                    "wide 960px viewport must not publish breadcrumb ellipsis slot"
                );
                assert!(!v.perform_a11y_action(
                    "breadcrumb.slot.breadcrumb.ellipsis",
                    MobileA11yAction::Activate,
                    cx
                ));
                assert_eq!(v.state.active_sheet, MobileSheet::None);
            })
        })
        .unwrap();
}
