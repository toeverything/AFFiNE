//! End-to-end deterministic tests for S7 mobile workspace shell:
//! - Workspace drawer open/filter/new-doc/switch + iOS 27 structure
//! - `MobileWorkspaceBridge` live `WorkspaceSession` integration (`open_document`, `@` query,
//!   image/attachment ingestion + single-step Undo)
//! - Production `PlatformAccessibility` tree (drawer, topbar, document title, block-level nodes,
//!   focus and action dispatch without `harness` branches)

use std::{
    cell::RefCell,
    rc::Rc,
    sync::{Arc, Mutex},
    time::Duration,
};

use affine_client::{
    AccessibilityRole, DocQueryCancelToken, DocQueryRequest, HostKind, PickedMediaInput,
    WorkspaceSession, WorkspaceSyncStatus,
};
use affine_mobile::{
    InMemoryPlatformAccessibility, MobileA11yAction, MobileDocBlock, MobileLocale, MobileRoute,
    MobileSheet, MobileShellView, MobileWorkspaceBridge, register_mobile_fonts,
    seed_showcase_state, validate_accessibility_tree,
};
use ui::{
    Application, Bounds, HeadlessPlatform, WindowBounds, WindowHandle, WindowOptions, point,
    prelude::*, px, size,
};
use ui_tokens::ThemeMode;

fn minimal_png_bytes(width: u32, height: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(24);
    out.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    out.extend_from_slice(&13u32.to_be_bytes());
    out.extend_from_slice(b"IHDR");
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&height.to_be_bytes());
    out
}

#[test]
fn workspace_drawer_doc_switch_media_undo_and_production_a11y_tree() {
    let sink = InMemoryPlatformAccessibility::new();
    let sink_for_view = sink.clone();

    let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28");
    let ws_session = WorkspaceSession::new(
        "ws-mobile-rust",
        "u-darksky",
        42,
        HostKind::Native,
        "affine-cloud",
        "https://app.affine.pro",
        1_000,
    )
    .unwrap();
    let mut bridge = MobileWorkspaceBridge::new(ws_session);

    // Create a new document through the live bridge, ingest image + attachment, then undo attachment.
    let (created, _) = bridge
        .create_and_open_document(&mut state, "S7 Live Doc", Some("s7-live-1"), 2_000)
        .unwrap();
    let doc_id = created.id.as_str().to_string();
    assert_eq!(state.route, MobileRoute::Page(doc_id.clone()));

    let q = bridge
        .query_linked_docs(&DocQueryRequest {
            query: "S7 Live".into(),
            limit: 5,
            cursor: None,
            cancel: DocQueryCancelToken::default(),
        })
        .unwrap();
    assert_eq!(q.items.len(), 1);
    assert_eq!(q.items[0].doc.id.as_str(), doc_id);

    let img_in = PickedMediaInput {
        filename: "shot.png".into(),
        mime_type: "image/png".into(),
        bytes: minimal_png_bytes(1024, 768),
        dimensions: None,
        caption: "Design mockup".into(),
    };
    let img_res = bridge
        .ingest_picked_media(&mut state, &doc_id, "note-1", None, &img_in, 2_500)
        .unwrap();

    let att_in = PickedMediaInput {
        filename: "notes.txt".into(),
        mime_type: "text/plain".into(),
        bytes: b"hello attachment".to_vec(),
        dimensions: None,
        caption: String::new(),
    };
    let att_res = bridge
        .ingest_picked_media(&mut state, &doc_id, "note-1", None, &att_in, 2_800)
        .unwrap();

    let blocks_before_undo = state.doc_by_id(&doc_id).unwrap().blocks.clone();
    assert!(
        blocks_before_undo
            .iter()
            .any(|b| matches!(b, MobileDocBlock::Image { id, .. } if id == &img_res.block_id))
    );
    assert!(
        blocks_before_undo
            .iter()
            .any(|b| matches!(b, MobileDocBlock::Attachment { id, .. } if id == &att_res.block_id))
    );

    // Single-step Undo removes the attachment while keeping the image block.
    assert!(bridge.undo_doc(&mut state, &doc_id, 3_000).unwrap());
    let blocks_after_undo = state.doc_by_id(&doc_id).unwrap().blocks.clone();
    assert!(!blocks_after_undo.iter().any(|b| b.id() == att_res.block_id));
    assert!(blocks_after_undo.iter().any(|b| b.id() == img_res.block_id));

    // Mount MobileShellView and verify production PlatformAccessibility tree + drawer interactions.
    state.set_sync_status(WorkspaceSyncStatus::Synced);
    let platform = HeadlessPlatform::new(390, 844, 1.0);
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

    let page_tree = sink.latest_tree().expect("frame-1 a11y tree");
    assert!(validate_accessibility_tree(&page_tree).is_empty());
    assert_eq!(
        page_tree.nodes["mobile.page.title"].role,
        AccessibilityRole::Heading
    );
    assert_eq!(
        page_tree.nodes["mobile.page.sync_status"].role,
        AccessibilityRole::Status
    );
    assert_eq!(
        page_tree.nodes[&format!("mobile.page.block.{}", img_res.block_id)].role,
        AccessibilityRole::Image
    );

    // Open WorkspaceDrawer via a11y action, verify Dialog children, and switch to `doc-sync`.
    app.update(|cx| {
        window_handle.update(cx, |v, _, cx| {
            assert!(v.perform_a11y_action(
                "mobile.page.drawer_btn",
                MobileA11yAction::Activate,
                cx
            ));
        })
    })
    .unwrap();
    platform.advance_clock(Duration::from_millis(400));
    platform.run_until_parked();
    headless_win.request_frame();

    let drawer_tree = sink.latest_tree().expect("drawer a11y tree");
    assert!(validate_accessibility_tree(&drawer_tree).is_empty());
    let dialog = drawer_tree.nodes.get("app.sheet.dialog").expect("dialog");
    assert_eq!(dialog.role, AccessibilityRole::Dialog);
    assert_eq!(dialog.name, "Workspace");
    assert!(drawer_tree.nodes.contains_key("mobile.drawer.close_btn"));
    assert!(drawer_tree.nodes.contains_key("mobile.drawer.new_doc_btn"));

    // Focus and activate `mobile.drawer.doc.doc-sync` via a11y actions.
    app.update(|cx| {
        window_handle.update(cx, |v, _, cx| {
            assert!(v.perform_a11y_action(
                "mobile.drawer.doc.doc-sync",
                MobileA11yAction::Focus,
                cx
            ));
            assert!(v.perform_a11y_action(
                "mobile.drawer.doc.doc-sync",
                MobileA11yAction::Activate,
                cx
            ));
        })
    })
    .unwrap();
    platform.advance_clock(Duration::from_millis(400));
    platform.run_until_parked();
    headless_win.request_frame();

    let (route, sheet) = app
        .update(|cx| {
            window_handle.update(cx, |v, _, _| (v.state.route.clone(), v.state.active_sheet))
        })
        .unwrap();
    assert_eq!(route, MobileRoute::Page("doc-sync".into()));
    assert_eq!(sheet, MobileSheet::None);

    // Verify live embedded PlaygroundView is mounted on Page route with WorkspaceDocDirectory,
    // real media ingestion + single-step Undo, and readonly mode for trashed documents.
    app.update(|cx| {
        window_handle.update(cx, |v, _, cx| {
            let editor = v.page_editor().expect("embedded PlaygroundView").clone();
            assert!(!editor.read(cx).page_readonly());
            let q = editor
                .read(cx)
                .query_linked_docs(&playground::directory::DocQueryRequest::new(
                    "Breadcrumb",
                    10,
                ))
                .expect("query injected WorkspaceDocDirectory");
            assert!(
                q.items.iter().any(|m| m.doc.id.as_str() == "doc-arch"),
                "injected WorkspaceDocDirectory must search active workspace docs"
            );
            let created = editor
                .update(cx, |pv, _| {
                    pv.create_linked_doc(
                        "Linked From Mention",
                        playground::directory::EditorDocMode::Page,
                        Some("intent-s7-1"),
                    )
                })
                .expect("create linked doc through PlaygroundView");
            assert_eq!(created.title, "Linked From Mention");

            let ingested = v
                .ingest_media_into_active_page(
                    &PickedMediaInput {
                        filename: "live-shot.png".into(),
                        mime_type: "image/png".into(),
                        bytes:
                            b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x01\x40\x00\x00\x00\xc8"
                                .to_vec(),
                        caption: "Live editor image".into(),
                        dimensions: Some((320, 200)),
                    },
                    "b-live-img-1",
                    1_764_001_500_000,
                    cx,
                )
                .expect("ingest image into live PlaygroundView");
            assert_eq!(ingested.block_id, "b-live-img-1");
            assert!(
                editor
                    .read(cx)
                    .page_snapshot()
                    .and_then(|s| s.block("b-live-img-1"))
                    .is_some()
            );

            // Single-step Undo inside PlaygroundView's PageDocSession removes the image block.
            editor.update(cx, |pv, cx| {
                pv.edit_document(cx, |ds| {
                    let page = ds.workspace.page_mut("doc-sync").unwrap();
                    assert!(page.undo().unwrap().is_some());
                });
            });
            assert!(
                editor
                    .read(cx)
                    .page_snapshot()
                    .and_then(|s| s.block("b-live-img-1"))
                    .is_none()
            );

            // Trashed document puts embedded PlaygroundView into page_readonly = true.
            v.state.open_doc(
                "doc-trash",
                affine_client::Origin::Direct(affine_client::DirectKind::AllDocs),
            );
            cx.notify();
        })
    })
    .unwrap();
    platform.run_until_parked();
    headless_win.request_frame();
    let (has_linked_doc, trash_readonly) = app
        .update(|cx| {
            window_handle.update(cx, |v, _, cx| {
                let has_linked = v
                    .state
                    .active_workspace()
                    .docs
                    .iter()
                    .any(|d| d.title == "Linked From Mention");
                let ro = v
                    .page_editor()
                    .map(|e| e.read(cx).page_readonly())
                    .unwrap_or(false);
                (has_linked, ro)
            })
        })
        .unwrap();
    assert!(
        has_linked_doc,
        "created linked doc must sync into MobileAppState"
    );
    assert!(
        trash_readonly,
        "trashed doc must set PlaygroundView page_readonly = true"
    );
}

#[test]
fn r7a_mobile_shell_p0_p1_p2_regressions() {
    use affine_client::{DirectKind, Origin, WorkspaceSyncStatus};
    use affine_mobile::{
        BackOutcome, MobileBackCoordinator, MobileTab, SettingsGroupId, build_accessibility_tree,
        perform_a11y_action,
    };

    // P1-5: `fa` / `ur` map to RtlFallback (RTL direction + English strings, never Arabic).
    let fa = MobileLocale::parse("fa-IR");
    assert_eq!(fa, MobileLocale::RtlFallback);
    assert!(fa.direction().is_rtl());
    assert_eq!(fa.strings().tab_home, "Home");
    assert_eq!(MobileLocale::parse("ur"), MobileLocale::RtlFallback);

    // P0-2: Root tab switches reset history so Back at any root tab yields YieldToHostExit.
    let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
    state.switch_tab(MobileTab::Explorer, 10.0);
    state.switch_tab(MobileTab::Journals, 20.0);
    state.switch_tab(MobileTab::Search, 30.0);
    assert_eq!(state.active_workspace().history.len(), 1);
    assert_eq!(
        MobileBackCoordinator::handle_back(&mut state, 40.0),
        BackOutcome::YieldToHostExit
    );

    // P0-1: DocActions Favorite + Move to Trash, and trashed doc hides `mobile.page.more_btn`.
    state.open_doc("doc-sync", Origin::Direct(DirectKind::Home));
    assert!(perform_a11y_action(
        &mut state,
        "mobile.page.more_btn",
        MobileA11yAction::Activate,
        50.0
    ));
    assert_eq!(state.active_sheet, MobileSheet::DocActions);
    let was_fav = state.doc_by_id("doc-sync").unwrap().is_favorite;
    assert!(perform_a11y_action(
        &mut state,
        "mobile.sheet.doc_action.favorite",
        MobileA11yAction::Activate,
        60.0
    ));
    assert_eq!(state.doc_by_id("doc-sync").unwrap().is_favorite, !was_fav);

    assert!(perform_a11y_action(
        &mut state,
        "mobile.page.more_btn",
        MobileA11yAction::Activate,
        70.0
    ));
    assert!(perform_a11y_action(
        &mut state,
        "mobile.sheet.doc_action.trash",
        MobileA11yAction::Activate,
        80.0
    ));
    assert!(state.doc_by_id("doc-sync").unwrap().trashed);
    let trashed_tree = build_accessibility_tree(&mut state, 390.0, 844.0);
    assert!(!trashed_tree.nodes.contains_key("mobile.page.more_btn"));

    // P1-2: Journals week navigation + Today jump.
    state.switch_tab(MobileTab::Journals, 90.0);
    assert!(perform_a11y_action(
        &mut state,
        "mobile.journals.prev_week_btn",
        MobileA11yAction::Activate,
        100.0
    ));
    assert_eq!(state.selected_journal_date, "2026-11-18");
    assert!(perform_a11y_action(
        &mut state,
        "mobile.journals.today_btn",
        MobileA11yAction::Activate,
        110.0
    ));
    assert_eq!(state.selected_journal_date, "2026-11-25");

    // P1-4: Settings Editor font scale + SyncOffline status.
    state.open_settings();
    assert!(state.activate_setting(SettingsGroupId::Editor));
    assert!((state.font_scale - 1.15).abs() < 0.01);
    assert!(state.activate_setting(SettingsGroupId::SyncOffline));
    assert_eq!(
        state.active_workspace().sync_status,
        WorkspaceSyncStatus::Offline
    );
    let settings_tree = build_accessibility_tree(&mut state, 390.0, 844.0);
    assert!(settings_tree.nodes.contains_key("mobile.settings.group.0"));
    assert!(
        settings_tree
            .nodes
            .contains_key("mobile.settings.row.editor")
    );

    // P0-3: Search route publishes input, clear_btn, and hits in A11y tree.
    state.switch_tab(MobileTab::Search, 120.0);
    let search_tree = build_accessibility_tree(&mut state, 390.0, 844.0);
    assert!(search_tree.nodes.contains_key("mobile.search.input"));
    assert!(search_tree.nodes.contains_key("mobile.search.clear_btn"));

    // P2-2: Backlink navigation sets Origin::Backlink.source_doc_id to the page navigated FROM.
    state.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
    state.open_sheet(MobileSheet::Backlinks, 130.0);
    assert!(perform_a11y_action(
        &mut state,
        "mobile.sheet.backlink.0",
        MobileA11yAction::Activate,
        140.0
    ));
    let origin = state
        .active_workspace()
        .history
        .current()
        .unwrap()
        .origin
        .clone();
    assert!(
        matches!(origin, Origin::Backlink { ref source_doc_id, .. } if source_doc_id == "doc-arch"),
        "expected source_doc_id == doc-arch, got {origin:?}"
    );
}

#[test]
fn embedded_playground_screen_click_hits_body_block_and_types_accurately() {
    use ui::{
        Application, Bounds, EntityInputHandler, HeadlessPlatform, WindowBounds, WindowHandle,
        WindowOptions, point, prelude::*, px, size,
    };

    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let handle_cell: std::rc::Rc<std::cell::RefCell<Option<WindowHandle<MobileShellView>>>> =
        std::rc::Rc::new(std::cell::RefCell::new(None));
    let handle_out = handle_cell.clone();

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        register_mobile_fonts(cx).expect("register mobile fonts");
        let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28");
        state.open_doc(
            "doc-arch",
            affine_client::Origin::Direct(affine_client::DirectKind::Home),
        );
        let win = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| MobileShellView::new(state, cx)),
            )
            .expect("open mobile window");
        *handle_out.borrow_mut() = Some(win);
    });

    let window_handle = handle_cell.borrow_mut().take().unwrap();
    let headless_win = platform.windows().into_iter().next().unwrap();
    headless_win.request_frame();
    platform.run_until_parked();
    headless_win.request_frame();

    // Locate the body paragraph block in window coordinates using PlaygroundView::canvas_rect.
    let (body_block_id, click_pt, canvas_origin_y) = app
        .update(|cx| {
            window_handle.update(cx, |v, window, cx| {
                let editor = v.page_editor().expect("embedded PlaygroundView").clone();
                let pv = editor.read(cx);
                let (origin, canvas_size) = pv.canvas_rect(window);
                let geom = playground::block_flow::page_geometry(f32::from(canvas_size.width));
                let layout = pv.flow_layout().expect("embedded page flow layout");
                let body = layout
                    .blocks
                    .iter()
                    .find(|b| {
                        b.editable()
                            && !matches!(b.body.kind, playground::block_flow::FlowKind::Title)
                    })
                    .expect("editable body paragraph block");
                let rect = body.rect();
                let pt = point(
                    px(f32::from(origin.x) + geom.column_x + rect.x + 16.0),
                    px(f32::from(origin.y) + rect.y + rect.h * 0.5),
                );
                (body.block_id.clone(), pt, f32::from(origin.y))
            })
        })
        .unwrap();

    assert!(
        canvas_origin_y > 120.0,
        "embedded PlaygroundView must be offset below Header+Breadcrumb+Backlinks, got y={canvas_origin_y}"
    );

    // Click at the computed window screen coordinate on the body paragraph block.
    headless_win.simulate_click(click_pt);
    platform.run_until_parked();

    // Verify selection landed on the exact body paragraph block and type text into it.
    let (selected_block, title_text, body_text) = app
        .update(|cx| {
            window_handle.update(cx, |v, window, cx| {
                let editor = v.page_editor().expect("embedded PlaygroundView").clone();
                let selected = editor
                    .read(cx)
                    .document_selection()
                    .map(|sel| sel.focus.block_id.clone());
                editor.update(cx, |pv, cx| {
                    pv.replace_text_in_range(None, " [hit-ok]", window, cx);
                });
                let snap = editor.read(cx).page_snapshot().expect("snapshot");
                let title = snap
                    .root
                    .as_ref()
                    .and_then(|r| match &r.content {
                        blocksuite_playground_doc::read::BlockContent::Page { title } => {
                            Some(title.plain.clone())
                        }
                        _ => None,
                    })
                    .unwrap_or_default();
                let body = snap
                    .block(&body_block_id)
                    .and_then(|b| match &b.content {
                        blocksuite_playground_doc::read::BlockContent::Paragraph {
                            text, ..
                        } => Some(text.plain.clone()),
                        _ => None,
                    })
                    .unwrap_or_default();
                (selected, title, body)
            })
        })
        .unwrap();

    assert_eq!(
        selected_block.as_deref(),
        Some(body_block_id.as_str()),
        "screen-space click must land on target body block `{body_block_id}`, not title or miss"
    );
    assert!(
        body_text.contains("[hit-ok]"),
        "typed text must land in target body block, got: {body_text:?}"
    );
    assert!(
        !title_text.contains("[hit-ok]"),
        "typed text must NOT shift upward into page title, got: {title_text:?}"
    );

    // Next frame reflects the edited body paragraph back into MobileAppState.
    headless_win.request_frame();
    platform.run_until_parked();
    let synced_preview = app
        .update(|cx| {
            window_handle.update(cx, |v, _, _| {
                v.state
                    .doc_by_id("doc-arch")
                    .map(|d| d.body_preview.clone())
                    .unwrap_or_default()
            })
        })
        .unwrap();
    assert!(
        synced_preview.contains("[hit-ok]"),
        "MobileAppState must reflect live PlaygroundView edit, got: {synced_preview:?}"
    );
}

#[test]
fn nested_blocks_rich_text_survive_doc_switch_and_reopen_via_crdt_source_of_truth() {
    use blocksuite_playground_doc::{
        read::BlockContent,
        schema::{BlockSpec, ListType, ParagraphType},
        session::PageDocSession,
    };
    use ui::{
        Application, Bounds, HeadlessPlatform, WindowBounds, WindowHandle, WindowOptions, point,
        prelude::*, px, size,
    };

    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let handle_cell: std::rc::Rc<std::cell::RefCell<Option<WindowHandle<MobileShellView>>>> =
        std::rc::Rc::new(std::cell::RefCell::new(None));
    let handle_out = handle_cell.clone();

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        register_mobile_fonts(cx).expect("register mobile fonts");
        let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28");
        state.open_doc(
            "doc-arch",
            affine_client::Origin::Direct(affine_client::DirectKind::Home),
        );
        let win = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| MobileShellView::new(state, cx)),
            )
            .expect("open mobile window");
        *handle_out.borrow_mut() = Some(win);
    });

    let window_handle = handle_cell.borrow_mut().take().unwrap();
    let headless_win = platform.windows().into_iter().next().unwrap();
    headless_win.request_frame();
    platform.run_until_parked();

    // Author nested paragraph B under parent paragraph A + H2 + Code + List in live PlaygroundView.
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                let editor = v.page_editor().expect("embedded PlaygroundView").clone();
                editor.update(cx, |pv, cx| {
                    pv.edit_document(cx, |ds| {
                        let page = ds.workspace.page_mut("doc-arch").unwrap();
                        let note_id = page
                            .read_page_snapshot()
                            .unwrap()
                            .root
                            .as_ref()
                            .unwrap()
                            .children
                            .iter()
                            .find(|n| n.is_page_visible_note())
                            .unwrap()
                            .id
                            .clone();
                        page.add_block(
                            "p-parent",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "Parent A".into(),
                            },
                            Some(&note_id),
                            None,
                            10,
                        )
                        .unwrap();
                        page.add_block(
                            "p-child",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "Nested Child B".into(),
                            },
                            Some("p-parent"),
                            None,
                            11,
                        )
                        .unwrap();
                        page.add_block(
                            "h2-1",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::H2,
                                text: "Section Heading".into(),
                            },
                            Some(&note_id),
                            None,
                            12,
                        )
                        .unwrap();
                        page.add_block(
                            "code-1",
                            BlockSpec::Code {
                                language: Some("rust".into()),
                                text: "fn main() {}".into(),
                                caption: String::new(),
                            },
                            Some(&note_id),
                            None,
                            13,
                        )
                        .unwrap();
                        page.add_block(
                            "list-1",
                            BlockSpec::List {
                                list_type: ListType::Bulleted,
                                text: "Bullet item".into(),
                                checked: false,
                                order: None,
                            },
                            Some(&note_id),
                            None,
                            14,
                        )
                        .unwrap();
                    });
                });
            })
            .unwrap();
    });
    platform.run_until_parked();

    // `cx.observe` must have persisted the authoritative CRDT update immediately (before next render).
    let crdt_bytes = app
        .update(|cx| {
            window_handle
                .update(cx, |v, _, _| {
                    v.state
                        .active_workspace()
                        .doc_crdt_updates
                        .get("doc-arch")
                        .cloned()
                })
                .unwrap()
        })
        .expect("cx.observe must persist authoritative Yjs V1 CRDT update immediately");
    assert!(!crdt_bytes.is_empty());

    // Switch to doc-sync, render, then switch back to doc-arch and render.
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                v.state.open_document("doc-sync", 20.0);
                cx.notify();
            })
            .unwrap();
    });
    headless_win.request_frame();
    platform.run_until_parked();

    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                v.state.open_document("doc-arch", 30.0);
                cx.notify();
            })
            .unwrap();
    });
    headless_win.request_frame();
    platform.run_until_parked();

    // Verify full block tree survived the doc switch intact (no flattening, no dropped block types).
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                let editor = v.page_editor().expect("embedded PlaygroundView").clone();
                let snap = editor.read(cx).page_snapshot().expect("reloaded snapshot");
                let parent = snap.block("p-parent").expect("parent paragraph preserved");
                assert_eq!(
                    parent.children.len(),
                    1,
                    "nested child under p-parent must NOT be flattened"
                );
                assert_eq!(parent.children[0].id, "p-child");
                assert!(matches!(
                    snap.block("h2-1").map(|b| &b.content),
                    Some(BlockContent::Paragraph {
                        kind: ParagraphType::H2,
                        ..
                    })
                ));
                assert!(matches!(
                    snap.block("code-1").map(|b| &b.content),
                    Some(BlockContent::Code { language, .. }) if language == "rust"
                ));
                assert!(matches!(
                    snap.block("list-1").map(|b| &b.content),
                    Some(BlockContent::List {
                        kind: ListType::Bulleted,
                        ..
                    })
                ));
            })
            .unwrap();
    });

    // Also verify re-opening from persisted CRDT bytes into a fresh PageDocSession preserves the tree.
    let mut fresh = PageDocSession::new("doc-arch", 9999).unwrap();
    fresh.apply_remote_update_v1(&crdt_bytes).unwrap();
    let fresh_snap = fresh.read_page_snapshot().unwrap();
    let fresh_parent = fresh_snap
        .block("p-parent")
        .expect("parent in fresh session");
    assert_eq!(fresh_parent.children.len(), 1);
    assert_eq!(fresh_parent.children[0].id, "p-child");
    assert!(fresh_snap.block("h2-1").is_some());
    assert!(fresh_snap.block("code-1").is_some());
    assert!(fresh_snap.block("list-1").is_some());
}

#[test]
fn ingest_media_into_workspace_session_created_doc_resolves_dynamic_note_parent() {
    use affine_client::{HostKind, PickedMediaInput, WorkspaceSession};
    use affine_mobile::MobileWorkspaceBridge;
    use ui::{
        Application, Bounds, HeadlessPlatform, WindowBounds, WindowHandle, WindowOptions, point,
        prelude::*, px, size,
    };

    let session = WorkspaceSession::new(
        "ws-dynamic-note",
        "u-dyn",
        7007,
        HostKind::Native,
        "local",
        "https://app.affine.pro",
        1_000,
    )
    .unwrap();
    let mut bridge = MobileWorkspaceBridge::new(session);
    let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28");
    // `WorkspaceSession::create_document` creates `"note-1"` (NOT `"note-root"`).
    let (created_doc, _) = bridge
        .create_and_open_document(&mut state, "Dynamic Note Doc", None, 2_000)
        .unwrap();
    let created_id = created_doc.id.as_str().to_string();

    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let handle_cell: std::rc::Rc<std::cell::RefCell<Option<WindowHandle<MobileShellView>>>> =
        std::rc::Rc::new(std::cell::RefCell::new(None));
    let handle_out = handle_cell.clone();

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        register_mobile_fonts(cx).expect("register mobile fonts");
        let win = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| MobileShellView::new(state, cx)),
            )
            .expect("open mobile window");
        *handle_out.borrow_mut() = Some(win);
    });

    let window_handle = handle_cell.borrow_mut().take().unwrap();
    let headless_win = platform.windows().into_iter().next().unwrap();
    headless_win.request_frame();
    platform.run_until_parked();

    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                let inserted = v
                    .ingest_media_into_active_page(
                        &PickedMediaInput {
                            filename: "dyn-note.png".into(),
                            mime_type: "image/png".into(),
                            bytes: b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x01\x40\x00\x00\x00\xc8"
                                .to_vec(),
                            caption: "Dynamic parent note image".into(),
                            dimensions: Some((320, 200)),
                        },
                        "b-dyn-img-1",
                        2_500,
                        cx,
                    )
                    .expect("image ingest must succeed on WorkspaceSession doc with note-1");
                assert_eq!(inserted.block_id, "b-dyn-img-1");
                let editor = v.page_editor().expect("embedded PlaygroundView");
                let snap = editor.read(cx).page_snapshot().expect("snapshot");
                let note_1 = snap.block("note-1").expect("WorkspaceSession note-1 preserved");
                assert!(
                    note_1.children.iter().any(|c| c.id == "b-dyn-img-1"),
                    "inserted image must be attached under dynamic note-1"
                );
                assert_eq!(
                    editor.read(cx).active_page_id(),
                    Some(created_id.as_str())
                );
            })
            .unwrap();
    });
}

#[cfg(not(target_family = "wasm"))]
#[tokio::test]
async fn bridge_open_document_preserves_embedded_editor_edits_and_persists_to_sqlite() {
    use affine_client::{HostKind, SqliteWorkspaceStore};
    use affine_mobile::MobileWorkspaceBridge;
    use blocksuite_playground_doc::{
        read::BlockContent,
        schema::{BlockSpec, ParagraphType},
    };
    use ui::{
        Application, Bounds, HeadlessPlatform, WindowBounds, WindowHandle, WindowOptions, point,
        prelude::*, px, size,
    };

    let base_dir =
        std::env::temp_dir().join(format!("affine-s7-bridge-e2e-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base_dir);
    std::fs::create_dir_all(&base_dir).unwrap();

    let store = SqliteWorkspaceStore::open(&base_dir, "workspace", "local", "ws-bridge-e2e")
        .await
        .unwrap();
    let session = store
        .load_workspace_session(
            "u-bridge",
            8080,
            HostKind::Native,
            "local",
            "https://app.affine.pro",
            1_000,
        )
        .await
        .unwrap();
    let mut bridge = MobileWorkspaceBridge::new(session);
    let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28");

    let (doc_a, pending_a) = bridge
        .create_and_open_document(&mut state, "Doc A", None, 1_100)
        .unwrap();
    store
        .persist_pending_updates(&pending_a, None, 1_100)
        .await
        .unwrap();
    let (doc_b, pending_b) = bridge
        .create_and_open_document(&mut state, "Doc B", None, 1_200)
        .unwrap();
    store
        .persist_pending_updates(&pending_b, None, 1_200)
        .await
        .unwrap();

    let doc_a_id = doc_a.id.as_str().to_string();
    let doc_b_id = doc_b.id.as_str().to_string();
    bridge.open_document(&mut state, &doc_a_id).unwrap();

    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let handle_cell: std::rc::Rc<std::cell::RefCell<Option<WindowHandle<MobileShellView>>>> =
        std::rc::Rc::new(std::cell::RefCell::new(None));
    let handle_out = handle_cell.clone();

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        register_mobile_fonts(cx).expect("register mobile fonts");
        let win = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| MobileShellView::new(state, cx)),
            )
            .expect("open mobile window");
        *handle_out.borrow_mut() = Some(win);
    });

    let window_handle = handle_cell.borrow_mut().take().unwrap();
    let headless_win = platform.windows().into_iter().next().unwrap();
    headless_win.request_frame();
    platform.run_until_parked();

    // Edit doc-a inside the embedded PlaygroundView (including a nested child block).
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                let editor = v.page_editor().expect("embedded PlaygroundView").clone();
                editor.update(cx, |pv, cx| {
                    pv.edit_document(cx, |ds| {
                        let page = ds.workspace.page_mut(&doc_a_id).unwrap();
                        let note_id = page
                            .read_page_snapshot()
                            .unwrap()
                            .root
                            .as_ref()
                            .unwrap()
                            .children
                            .iter()
                            .find(|n| n.is_page_visible_note())
                            .unwrap()
                            .id
                            .clone();
                        page.add_block(
                            "p-edited",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "EDITED_IN_EMBEDDED_EDITOR".into(),
                            },
                            Some(&note_id),
                            None,
                            2_000,
                        )
                        .unwrap();
                        page.add_block(
                            "p-nested",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "NESTED_CHILD_BLOCK".into(),
                            },
                            Some("p-edited"),
                            None,
                            2_100,
                        )
                        .unwrap();
                    });
                });
            })
            .unwrap();
    });
    platform.run_until_parked();

    // Production bridge switch: doc-a -> doc-b -> doc-a must merge and preserve live edits.
    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                bridge.open_document(&mut v.state, &doc_b_id).unwrap();
                cx.notify();
            })
            .unwrap();
    });
    headless_win.request_frame();
    platform.run_until_parked();

    app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                bridge.open_document(&mut v.state, &doc_a_id).unwrap();
                cx.notify();
            })
            .unwrap();
    });
    headless_win.request_frame();
    platform.run_until_parked();

    // Verify PlaygroundView still has EDITED_IN_EMBEDDED_EDITOR + nested child after round-trip.
    let pending_to_persist = app.update(|cx| {
        window_handle
            .update(cx, |v, _, cx| {
                let editor = v.page_editor().expect("embedded PlaygroundView");
                let snap = editor.read(cx).page_snapshot().expect("snapshot");
                let edited = snap
                    .block("p-edited")
                    .expect("edited paragraph must survive bridge.open_document round-trip");
                assert!(matches!(
                    &edited.content,
                    BlockContent::Paragraph { text, .. } if text.plain == "EDITED_IN_EMBEDDED_EDITOR"
                ));
                assert_eq!(edited.children.len(), 1);
                assert_eq!(edited.children[0].id, "p-nested");

                let updates = bridge.flush_pending_updates(&v.state, 3_000).unwrap();
                assert!(
                    !updates.is_empty(),
                    "bridge must emit non-empty pending updates for SQLite persistence"
                );
                // Calling flush again with no new edits must produce 0 duplicate updates.
                let dup = bridge.flush_pending_updates(&v.state, 3_100).unwrap();
                assert!(
                    dup.is_empty(),
                    "idempotent flush must not emit duplicate pending updates"
                );
                updates
            })
            .unwrap()
    });

    // Persist pending updates into SQLite, close, reopen fresh store, and verify 100% readback.
    store
        .persist_pending_updates(&pending_to_persist, None, 3_200)
        .await
        .unwrap();
    store.checkpoint().await.unwrap();
    store.close().await;

    let reopened = SqliteWorkspaceStore::open(&base_dir, "workspace", "local", "ws-bridge-e2e")
        .await
        .unwrap();
    let reloaded_page = reopened
        .load_doc_session(&doc_a_id, 9090)
        .await
        .unwrap()
        .expect("reloaded doc-a from SQLite");
    let reloaded_snap = reloaded_page.read_page_snapshot().unwrap();
    let reloaded_edited = reloaded_snap
        .block("p-edited")
        .expect("persisted edited paragraph must reload from SQLite");
    assert!(matches!(
        &reloaded_edited.content,
        BlockContent::Paragraph { text, .. } if text.plain == "EDITED_IN_EMBEDDED_EDITOR"
    ));
    assert_eq!(reloaded_edited.children.len(), 1);
    assert_eq!(reloaded_edited.children[0].id, "p-nested");

    // Delete-only mutation test (modifies Yjs DeleteSet without advancing StateVector):
    // delete leading 'E' -> "DITED_IN_EMBEDDED_EDITOR", verify peer diff, SQLite reopen,
    // and idempotent replay producing 0 duplicate updates.
    let mut peer_page =
        blocksuite_playground_doc::session::PageDocSession::new(&doc_a_id, 9191).unwrap();
    peer_page
        .apply_remote_update_v1(&reloaded_page.encode_update_v1().unwrap())
        .unwrap();

    let session2 = reopened
        .load_workspace_session(
            "u-bridge",
            9292,
            HostKind::Native,
            "local",
            "https://app.affine.pro",
            4_000,
        )
        .await
        .unwrap();
    let mut bridge2 = MobileWorkspaceBridge::new(session2);
    let mut state2 = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-28");
    bridge2.open_document(&mut state2, &doc_a_id).unwrap();

    let platform2 = HeadlessPlatform::new(390, 844, 1.0);
    let handle_cell2: std::rc::Rc<std::cell::RefCell<Option<WindowHandle<MobileShellView>>>> =
        std::rc::Rc::new(std::cell::RefCell::new(None));
    let handle_out2 = handle_cell2.clone();
    let app2 = Application::with_platform(platform2.clone()).run_embedded(move |cx| {
        register_mobile_fonts(cx).expect("register mobile fonts");
        let win = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| MobileShellView::new(state2, cx)),
            )
            .expect("open mobile window 2");
        *handle_out2.borrow_mut() = Some(win);
    });
    let window_handle2 = handle_cell2.borrow_mut().take().unwrap();
    let headless_win2 = platform2.windows().into_iter().next().unwrap();
    headless_win2.request_frame();
    platform2.run_until_parked();

    app2.update(|cx| {
        window_handle2
            .update(cx, |v, _, cx| {
                let editor = v.page_editor().expect("embedded PlaygroundView").clone();
                editor.update(cx, |pv, cx| {
                    pv.edit_document(cx, |ds| {
                        let page = ds.workspace.page_mut(&doc_a_id).unwrap();
                        page.remove_text("p-edited", "prop:text", 0, 1, 4_100)
                            .unwrap();
                    });
                });
            })
            .unwrap();
    });
    platform2.run_until_parked();

    let del_updates = app2.update(|cx| {
        window_handle2
            .update(cx, |v, _, _| {
                let updates = bridge2.flush_pending_updates(&v.state, 4_200).unwrap();
                assert!(
                    !updates.is_empty(),
                    "delete-only edit must enqueue non-empty CRDT update despite unchanged StateVector"
                );
                let dup = bridge2.flush_pending_updates(&v.state, 4_300).unwrap();
                assert!(
                    dup.is_empty(),
                    "replaying identical delete state must emit 0 duplicate updates"
                );
                updates
            })
            .unwrap()
    });

    for u in &del_updates {
        if u.doc_id == doc_a_id {
            peer_page.apply_remote_update_v1(&u.update).unwrap();
        }
    }
    let peer_snap = peer_page.read_page_snapshot().unwrap();
    assert!(matches!(
        &peer_snap.block("p-edited").unwrap().content,
        BlockContent::Paragraph { text, .. } if text.plain == "DITED_IN_EMBEDDED_EDITOR"
    ));

    reopened
        .persist_pending_updates(&del_updates, None, 4_400)
        .await
        .unwrap();
    reopened.checkpoint().await.unwrap();
    reopened.close().await;

    let reopened_after_del =
        SqliteWorkspaceStore::open(&base_dir, "workspace", "local", "ws-bridge-e2e")
            .await
            .unwrap();
    let after_del_page = reopened_after_del
        .load_doc_session(&doc_a_id, 9393)
        .await
        .unwrap()
        .expect("reloaded doc-a after delete");
    let after_del_snap = after_del_page.read_page_snapshot().unwrap();
    assert!(matches!(
        &after_del_snap.block("p-edited").unwrap().content,
        BlockContent::Paragraph { text, .. } if text.plain == "DITED_IN_EMBEDDED_EDITOR"
    ));

    reopened_after_del.close().await;
    let _ = std::fs::remove_dir_all(&base_dir);
}
