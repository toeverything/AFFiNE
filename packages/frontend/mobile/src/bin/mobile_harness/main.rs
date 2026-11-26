//! Deterministic offscreen verification CLI for `affine-mobile`:
//! - `audit-matrix`: 5 viewports × 2 themes × 3 locales = 30 states × 6 routes
//! - `fps-replay`: 60 / 120 / 24 / 7 fps byte-identical terminal `FrameSnapshot` replay
//! - `gallery --out <dir>`: 7 offscreen PNGs (`390×844 @ 2x = 780×1688`) in `< 5s`

use std::{cell::RefCell, path::PathBuf, rc::Rc, time::Duration};

use affine_client::{AccessibilityRole, DirectKind, Origin};
use affine_mobile::{
    BackOutcome, MobileAppState, MobileBackCoordinator, MobileLocale, MobileSheet, MobileShellView,
    MobileTab, build_accessibility_tree, register_mobile_fonts, seed_showcase_state,
    validate_accessibility_tree,
};
use anyhow::{Context as _, Result, bail};
use serde_json::json;
use ui::{
    Application, ApplicationHandle, Bounds, Direction, FrameSnapshot, HeadlessPlatform,
    HeadlessWindow, WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot, point,
    prelude::*, px, size,
};
use ui_kit::{BreadcrumbBarConfig, BreadcrumbItem, BreadcrumbItemKind, layout_breadcrumb_bar};
use ui_tokens::ThemeMode;

const VIEWPORTS: [(u32, u32); 6] = [
    (320, 568),
    (375, 667),
    (390, 844),
    (430, 932),
    (844, 390),
    (568, 320),
];
const FPS_RATES: [u32; 4] = [60, 120, 24, 7];

struct MobileSession {
    platform: Rc<HeadlessPlatform>,
    app: ApplicationHandle,
    window_handle: WindowHandle<MobileShellView>,
    headless_win: HeadlessWindow,
}

fn start_session(
    width: u32,
    height: u32,
    scale_factor: f32,
    state: MobileAppState,
) -> Result<MobileSession> {
    let platform = HeadlessPlatform::new(width, height, scale_factor);
    let init_cell: Rc<RefCell<Option<Result<WindowHandle<MobileShellView>>>>> =
        Rc::new(RefCell::new(None));
    let init_out = init_cell.clone();
    let state_cell = RefCell::new(Some(state));

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        let res = (|| -> Result<WindowHandle<MobileShellView>> {
            register_mobile_fonts(cx).context("registering mobile fonts")?;
            let initial_state = state_cell
                .borrow_mut()
                .take()
                .context("state already moved")?;
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(width as f32), px(height as f32)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| MobileShellView::new(initial_state, cx)),
            )
            .context("opening headless MobileShellView window")
        })();
        *init_out.borrow_mut() = Some(res);
    });

    let window_handle = init_cell
        .borrow_mut()
        .take()
        .context("headless app did not execute")??;
    let headless_win = platform
        .windows()
        .into_iter()
        .next()
        .context("headless window not registered")?;

    Ok(MobileSession {
        platform,
        app,
        window_handle,
        headless_win,
    })
}

impl MobileSession {
    fn update_state<R>(&self, f: impl FnOnce(&mut MobileAppState) -> R) -> Result<R> {
        let res = self.app.update(|cx| {
            self.window_handle.update(cx, |view, _, cx| {
                let out = f(view.state_mut());
                cx.notify();
                out
            })
        })?;
        self.platform.run_until_parked();
        Ok(res)
    }

    fn frame(&self) -> Result<FrameSnapshot> {
        self.headless_win.request_frame();
        self.app.update(|cx| {
            self.window_handle
                .update(cx, |_, window, _| window.frame_snapshot().clone())
        })
    }

    fn measured_breadcrumb(&self) -> Result<Option<ui_kit::BreadcrumbBarLayout>> {
        self.app.update(|cx| {
            self.window_handle
                .update(cx, |view, _, _| view.last_measured_breadcrumb().cloned())
        })
    }

    fn render_png(&self, out_path: &PathBuf) -> Result<usize> {
        self.headless_win.request_frame();
        let (image, glyph_count) = self.app.update(|cx| {
            self.window_handle.update(cx, |_, window, _| {
                let glyphs = window.rendered_scene().monochrome_sprites.len();
                let img = window.render_to_image()?;
                Ok::<_, anyhow::Error>((img, glyphs))
            })
        })??;
        anyhow::ensure!(
            glyph_count > 0,
            "rendered 0 glyphs for {}",
            out_path.display()
        );
        if let Some(parent) = out_path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }
        image
            .save(out_path)
            .with_context(|| format!("writing PNG {}", out_path.display()))?;
        Ok(glyph_count)
    }
}

fn check_snapshot_bounds(
    snapshot: &FrameSnapshot,
    vp_w: f32,
    vp_h: f32,
    context: &str,
) -> Vec<String> {
    let mut violations = Vec::new();
    for v in audit_frame_snapshot(snapshot) {
        violations.push(format!("{context}: frame-audit {v:?}"));
    }
    for (id, el) in &snapshot.elements {
        let b = &el.bounds;
        if b.x < -0.5 || b.y < -0.5 || b.x + b.width > vp_w + 0.5 || b.y + b.height > vp_h + 0.5 {
            violations.push(format!(
                "{context}: element {id} out of bounds ({:.1},{:.1},{:.1}x{:.1}) in {vp_w}x{vp_h}",
                b.x, b.y, b.width, b.height
            ));
        }
        let is_touch_control = id.contains(".btn")
            || id.contains("_btn")
            || id.starts_with("mobile.tab.")
            || id.starts_with("mobile.journals.day.")
            || id.starts_with("mobile.settings.row.")
            || id == "mobile.page.backlinks_pill"
            || id == "mobile.page.breadcrumb_bar";
        if is_touch_control && (b.height < 43.5 || b.width < 43.5) {
            violations.push(format!(
                "{context}: touch target {id} size {:.1}x{:.1} < 44x44pt",
                b.width, b.height
            ));
        }
    }
    violations
}

fn current_seq(s: &MobileAppState) -> u64 {
    s.active_workspace().history.current().map_or(1, |e| e.seq)
}

fn open_doclink_multi(s: &mut MobileAppState) {
    s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
    let arch_seq = current_seq(s);
    s.open_doc(
        "doc-sync",
        Origin::DocLink {
            parent_seq: arch_seq,
            block_id: None,
        },
    );
}

fn check_doclink_switcher(
    snap: &FrameSnapshot,
    tree: &affine_client::AccessibilityTree,
    measured_bc: Option<&ui_kit::BreadcrumbBarLayout>,
    locale: MobileLocale,
    ctx: &str,
    violations: &mut Vec<String>,
) {
    if snap
        .elements
        .contains_key("mobile.page.breadcrumb.slot.breadcrumb.ellipsis")
    {
        violations.push(format!(
            "{ctx}: doclink multi-location switcher degraded to bare ellipsis"
        ));
    }
    let ok = tree
        .nodes
        .get("app.nav.breadcrumb")
        .and_then(|nav| nav.children.first())
        .and_then(|id| tree.nodes.get(id))
        .is_some_and(|n| {
            n.id != "breadcrumb.slot.breadcrumb.ellipsis"
                && n.role == AccessibilityRole::Link
                && n.state.expanded.is_some()
        });
    if !ok {
        violations.push(format!(
            "{ctx}: expected Switcher as first breadcrumb slot in accessibility tree"
        ));
    }
    let expected_unit = match locale {
        MobileLocale::En => "2 places",
        MobileLocale::ZhHans => "2 处",
        MobileLocale::Ar => "2 مواقع",
    };
    match measured_bc.and_then(|bc| bc.slots.first()) {
        Some(slot) if slot.kind == ui_kit::BreadcrumbSlotKind::Switcher => {
            let text = slot
                .display_text
                .trim_matches(|c| c == ui_kit::BIDI_FSI || c == ui_kit::BIDI_PDI);
            let has_unit = text.contains(expected_unit);
            let has_owner_prefix = text.rsplit_once(" · ").is_some_and(|(prefix, _)| {
                !prefix
                    .trim_matches(|c: char| c.is_whitespace() || c == '…')
                    .is_empty()
            });
            if !has_unit || !has_owner_prefix {
                violations.push(format!(
                    "{ctx}: switcher text `{text}` must preserve owner prefix and `{expected_unit}`"
                ));
            }
        }
        _ => violations.push(format!("{ctx}: missing measured Switcher slot")),
    }
}

fn run_audit_matrix() -> Result<()> {
    let mut all_violations: Vec<String> = Vec::new();
    let mut states_audited = 0usize;
    let mut frames_audited = 0usize;

    let sample_bc_items = vec![
        BreadcrumbItem {
            id: "f-eng".into(),
            label: "Engineering".into(),
            kind: BreadcrumbItemKind::Segment,
            clickable: true,
        },
        BreadcrumbItem {
            id: "f-mob".into(),
            label: "Mobile".into(),
            kind: BreadcrumbItemKind::Segment,
            clickable: true,
        },
        BreadcrumbItem {
            id: "doc-arch".into(),
            label: "Spec".into(),
            kind: BreadcrumbItemKind::Current,
            clickable: false,
        },
    ];

    for (vp_w, vp_h) in VIEWPORTS {
        // Verify RTL mirror symmetry for this viewport width.
        let ltr = layout_breadcrumb_bar(
            &sample_bc_items,
            &BreadcrumbBarConfig::new(vp_w as f32, Direction::Ltr),
        );
        let rtl = layout_breadcrumb_bar(
            &sample_bc_items,
            &BreadcrumbBarConfig::new(vp_w as f32, Direction::Rtl),
        );
        for (l, r) in ltr.slots.iter().zip(rtl.slots.iter()) {
            if ((r.x + r.width) - (vp_w as f32 - l.x)).abs() > 1e-3 {
                all_violations.push(format!(
                    "RTL mirror violation at {vp_w}x{vp_h} for slot {}",
                    l.id
                ));
            }
        }

        for theme in [ThemeMode::Light, ThemeMode::Dark] {
            for locale in MobileLocale::ALL {
                states_audited += 1;
                let state = seed_showcase_state(locale, theme, "2026-11-25");
                let session = start_session(vp_w, vp_h, 1.0, state)?;
                let tag_prefix = format!("{vp_w}x{vp_h}/{:?}/{}", theme, locale.code());

                let routes: [(&str, Box<dyn Fn(&mut MobileAppState)>); 9] = [
                    ("home", Box::new(|s| s.switch_tab(MobileTab::Home, 0.0))),
                    (
                        "explorer",
                        Box::new(|s| s.switch_tab(MobileTab::Explorer, 50.0)),
                    ),
                    (
                        "journals",
                        Box::new(|s| s.switch_tab(MobileTab::Journals, 75.0)),
                    ),
                    (
                        "page_multi",
                        Box::new(|s| {
                            s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                        }),
                    ),
                    ("page_doclink_multi", Box::new(open_doclink_multi)),
                    (
                        "page_trash",
                        Box::new(|s| {
                            s.open_doc("doc-trash", Origin::Direct(DirectKind::AllDocs));
                        }),
                    ),
                    (
                        "location_sheet",
                        Box::new(|s| {
                            s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                            s.open_sheet(MobileSheet::LocationAndTrail, 100.0);
                            s.settle_animations(500.0);
                        }),
                    ),
                    (
                        "search",
                        Box::new(|s| {
                            s.close_sheet(600.0);
                            s.settle_animations(1000.0);
                            s.switch_tab(MobileTab::Search, 1000.0);
                        }),
                    ),
                    ("settings", Box::new(|s| s.open_settings())),
                ];

                for (route_name, setup) in &routes {
                    session.update_state(|s| setup(s))?;
                    let snap = session.frame()?;
                    frames_audited += 1;
                    let ctx = format!("{tag_prefix}/{route_name}");
                    all_violations.extend(check_snapshot_bounds(
                        &snap,
                        vp_w as f32,
                        vp_h as f32,
                        &ctx,
                    ));
                    let (a11y_errors, tree) = session.update_state(|s| {
                        let tree = build_accessibility_tree(s, vp_w as f32, vp_h as f32);
                        let errs = validate_accessibility_tree(&tree);
                        (errs, tree)
                    })?;
                    if *route_name == "page_doclink_multi" {
                        let measured_bc = session.measured_breadcrumb()?;
                        check_doclink_switcher(
                            &snap,
                            &tree,
                            measured_bc.as_ref(),
                            locale,
                            &ctx,
                            &mut all_violations,
                        );
                    }
                    for err in a11y_errors {
                        all_violations.push(format!("{ctx}: a11y {err}"));
                    }
                }
            }
        }
    }

    // Extra 1.35x dynamic font-scale audit on the narrowest 320x568 viewport across all 3 locales.
    for locale in MobileLocale::ALL {
        states_audited += 1;
        let mut state = seed_showcase_state(locale, ThemeMode::Light, "2026-11-25");
        state.font_scale = 1.35;
        let session = start_session(320, 568, 1.0, state)?;
        for route_name in ["page_multi", "page_doclink_multi", "location_sheet"] {
            session.update_state(|s| match route_name {
                "page_doclink_multi" => open_doclink_multi(s),
                "location_sheet" => {
                    s.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
                    s.open_sheet(MobileSheet::LocationAndTrail, 100.0);
                    s.settle_animations(500.0);
                }
                _ => s.open_doc("doc-arch", Origin::Direct(DirectKind::Home)),
            })?;
            let snap = session.frame()?;
            frames_audited += 1;
            let ctx = format!("320x568@1.35x/Light/{}/{route_name}", locale.code());
            all_violations.extend(check_snapshot_bounds(&snap, 320.0, 568.0, &ctx));
            if route_name == "page_doclink_multi" {
                let tree = session.update_state(|s| build_accessibility_tree(s, 320.0, 568.0))?;
                let measured_bc = session.measured_breadcrumb()?;
                check_doclink_switcher(
                    &snap,
                    &tree,
                    measured_bc.as_ref(),
                    locale,
                    &ctx,
                    &mut all_violations,
                );
            }
        }
    }

    let report = json!({
        "states_audited": states_audited,
        "frames_audited": frames_audited,
        "violations": all_violations.len(),
        "details": all_violations,
    });
    println!("{}", serde_json::to_string_pretty(&report)?);

    if !all_violations.is_empty() {
        bail!(
            "audit-matrix failed with {} violations",
            all_violations.len()
        );
    }
    Ok(())
}

fn frame_interval(fps: u32) -> Duration {
    Duration::from_nanos((1_000_000_000_u64 + u64::from(fps) / 2) / u64::from(fps))
}

fn step_for(session: &MobileSession, fps: u32, total_ms: u64) -> Result<f64> {
    let dt = frame_interval(fps);
    let mut elapsed = Duration::ZERO;
    let target = Duration::from_millis(total_ms);
    while elapsed < target {
        session.platform.advance_clock(dt);
        elapsed += dt;
        session.frame()?;
    }
    Ok(elapsed.as_secs_f64() * 1000.0)
}

fn run_fps_replay() -> Result<()> {
    let mut reference_json: Option<String> = None;
    let mut mid_flight_counts: Vec<usize> = Vec::new();

    for fps in FPS_RATES {
        let state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
        let session = start_session(390, 844, 1.0, state)?;
        session.frame()?;

        let mut clock_ms = 0.0_f64;

        // 1. Tab switch -> Explorer.
        session.update_state(|s| s.switch_tab(MobileTab::Explorer, clock_ms))?;
        clock_ms += step_for(&session, fps, 300)?;

        // 2. Open multi-location doc `doc-arch`.
        session.update_state(|s| s.open_doc("doc-arch", Origin::Direct(DirectKind::AllDocs)))?;
        session.frame()?;

        // 3. Open & close Location & Trail Sheet, verifying mid-flight sheet presence.
        session.update_state(|s| s.open_sheet(MobileSheet::LocationAndTrail, clock_ms))?;
        clock_ms += step_for(&session, fps, 100)?;
        let mid_snap = session.frame()?;
        anyhow::ensure!(
            mid_snap.elements.contains_key("mobile.sheet.panel"),
            "expected mobile.sheet.panel during mid-flight open at {fps} fps"
        );
        mid_flight_counts.push(mid_snap.elements.len());
        clock_ms += step_for(&session, fps, 260)?;

        session.update_state(|s| s.close_sheet(clock_ms))?;
        clock_ms += step_for(&session, fps, 80)?;
        let mid_close_snap = session.frame()?;
        anyhow::ensure!(
            mid_close_snap.elements.contains_key("mobile.sheet.panel"),
            "expected closing sheet content retained mid-flight at {fps} fps"
        );
        clock_ms += step_for(&session, fps, 280)?;

        // 4. Open doc-sync via DocLink, click breadcrumb ancestor doc-arch (Push), then Back gesture.
        let arch_seq = session.update_state(|s| current_seq(s))?;
        session.update_state(|s| {
            s.open_doc(
                "doc-sync",
                Origin::DocLink {
                    parent_seq: arch_seq,
                    block_id: None,
                },
            );
        })?;
        session.frame()?;

        session.update_state(|s| {
            let d = s.derive_breadcrumb();
            if let Some(ancestor) = d.crumbs.iter().find(|c| c.id == "doc:doc-arch") {
                let action = ancestor.action.clone();
                s.click_breadcrumb(&action, clock_ms);
            }
        })?;
        session.frame()?;

        let outcome = session.update_state(|s| MobileBackCoordinator::handle_back(s, clock_ms))?;
        anyhow::ensure!(
            outcome == BackOutcome::NavigatedBack,
            "expected Back gesture to return to doc-sync at {fps} fps, got {outcome:?}"
        );
        step_for(&session, fps, 100)?;

        let terminal_snap = session.frame()?;
        let terminal_json = serde_json::to_string(&terminal_snap)?;
        match &reference_json {
            Some(ref_json) => {
                if &terminal_json != ref_json {
                    bail!("fps-replay terminal FrameSnapshot mismatch at {fps} fps");
                }
            }
            None => reference_json = Some(terminal_json),
        }
        println!("fps-replay {fps:>3} fps: OK (byte-identical terminal FrameSnapshot)");
    }

    println!("fps-replay passed across 60 / 120 / 24 / 7 fps.");

    // Exact same-timestamp RGBA pixel comparison across 100 / 50 / 25 fps at t = 120 ms (mid-flight)
    // and t = 320 ms (terminal, common multiple of 10/20/40 ms) to prove frame-rate-independent visual output.
    let mut ref_mid_rgba: Option<Vec<u8>> = None;
    let mut ref_end_rgba: Option<Vec<u8>> = None;
    for fps in [100_u32, 50, 25] {
        let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
        state.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
        let session = start_session(390, 844, 1.0, state)?;
        session.frame()?;
        session.update_state(|s| s.open_sheet(MobileSheet::LocationAndTrail, 0.0))?;
        step_for(&session, fps, 120)?;
        let mid_rgba = session
            .app
            .update(|cx| {
                session
                    .window_handle
                    .update(cx, |_, window, _| window.render_to_image())
            })??
            .into_raw();
        match &ref_mid_rgba {
            Some(expected) => anyhow::ensure!(
                &mid_rgba == expected,
                "mid-flight t=120ms RGBA mismatch at {fps} fps"
            ),
            None => ref_mid_rgba = Some(mid_rgba),
        }

        step_for(&session, fps, 200)?;
        let end_rgba = session
            .app
            .update(|cx| {
                session
                    .window_handle
                    .update(cx, |_, window, _| window.render_to_image())
            })??
            .into_raw();
        match &ref_end_rgba {
            Some(expected) => anyhow::ensure!(
                &end_rgba == expected,
                "terminal t=320ms RGBA mismatch at {fps} fps"
            ),
            None => ref_end_rgba = Some(end_rgba),
        }
        println!("fps-replay {fps:>3} fps RGBA: OK (byte-identical at t=120ms and t=320ms)");
    }
    Ok(())
}

fn run_gallery(out_dir: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&out_dir)?;

    type ShotSetup = Box<dyn Fn(&mut MobileAppState)>;
    let shots: Vec<(&str, MobileLocale, ThemeMode, ShotSetup)> = vec![
        (
            "mobile-home-light.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|_| {}),
        ),
        (
            "mobile-explorer-light.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| s.switch_tab(MobileTab::Explorer, 0.0)),
        ),
        (
            "mobile-page-breadcrumb-multi.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| s.open_doc("doc-arch", Origin::Direct(DirectKind::Home))),
        ),
        (
            "mobile-location-trail-sheet.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| {
                open_doclink_multi(s);
                s.open_sheet(MobileSheet::LocationAndTrail, 0.0);
                s.settle_animations(500.0);
            }),
        ),
        (
            "mobile-search-exact.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| s.switch_tab(MobileTab::Search, 0.0)),
        ),
        (
            "mobile-settings-dark.png",
            MobileLocale::En,
            ThemeMode::Dark,
            Box::new(|s| s.open_settings()),
        ),
        (
            "mobile-page-rtl-ar.png",
            MobileLocale::Ar,
            ThemeMode::Light,
            Box::new(|s| s.open_doc("doc-arch", Origin::Direct(DirectKind::Home))),
        ),
        (
            "mobile-page-zh-hans.png",
            MobileLocale::ZhHans,
            ThemeMode::Light,
            Box::new(open_doclink_multi),
        ),
        (
            "mobile-page-doclink-multi-en.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(open_doclink_multi),
        ),
        (
            "mobile-page-doclink-multi-ar.png",
            MobileLocale::Ar,
            ThemeMode::Light,
            Box::new(open_doclink_multi),
        ),
        (
            "mobile-page-blank-untitled.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| {
                s.create_doc(None, 0.0);
            }),
        ),
        (
            "search-empty-no-results.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| {
                s.switch_tab(MobileTab::Search, 0.0);
                s.search_query = "NonexistentQuery".to_string();
            }),
        ),
        (
            "journals-today-and-other-day.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| {
                s.switch_tab(MobileTab::Journals, 0.0);
                s.select_journal_date("2026-11-26");
            }),
        ),
        (
            "trash-doc-actions.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| {
                s.open_doc("doc-trash", Origin::Direct(DirectKind::AllDocs));
            }),
        ),
        (
            "trash-delete-confirm-sheet.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| {
                s.open_doc("doc-trash", Origin::Direct(DirectKind::AllDocs));
                let delete_id = format!(
                    "mobile.page.trash_delete_btn.{}",
                    affine_mobile::encode_scoped_doc_target("ws-mobile-rust", "doc-trash")
                );
                s.request_delete_doc_scoped("ws-mobile-rust", "doc-trash", Some(&delete_id), 0.0);
                s.settle_animations(500.0);
            }),
        ),
        (
            "explorer-30-docs-scrolled.png",
            MobileLocale::En,
            ThemeMode::Light,
            Box::new(|s| {
                let docs = &mut s.active_workspace_mut().docs;
                for i in 1..=30 {
                    docs.push(affine_mobile::MobileDocRecord {
                        id: format!("doc-bulk-{i}"),
                        title: format!("Spec Document #{i:02}"),
                        body_preview: format!("Body preview for document #{i:02}."),
                        tags: Vec::new(),
                        updated_at_ms: 1_764_000_000 + i as i64,
                        is_favorite: false,
                        trashed: false,
                        journal_date: None,
                        clock: 1,
                        outgoing_edges: Vec::new(),
                    });
                }
                s.switch_tab(MobileTab::Explorer, 0.0);
                s.explorer_scroll_y = 2000.0;
            }),
        ),
    ];

    // Reuse one HeadlessPlatform + GPU surface across all 390x844 shots.
    let initial = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
    let session = start_session(390, 844, 2.0, initial)?;

    for (filename, locale, theme, setup) in shots {
        let mut next_state = seed_showcase_state(locale, theme, "2026-11-25");
        setup(&mut next_state);
        session.update_state(|s| *s = next_state)?;
        let out_path = out_dir.join(filename);
        let glyphs = session.render_png(&out_path)?;
        println!(
            "gallery: rendered {} (780x1688, {glyphs} glyphs)",
            out_path.display()
        );
    }

    // 320x568 narrow viewport shots (Journals LTR/RTL + 1.35x ZhHans DocLink switcher).
    let narrow_session = start_session(
        320,
        568,
        2.0,
        seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25"),
    )?;
    let narrow_shots: [(&str, MobileLocale, f32, fn(&mut MobileAppState)); 3] = [
        ("journals-320-ltr.png", MobileLocale::En, 1.0, |s| {
            s.switch_tab(MobileTab::Journals, 0.0);
        }),
        ("journals-320-rtl.png", MobileLocale::Ar, 1.0, |s| {
            s.switch_tab(MobileTab::Journals, 0.0);
        }),
        (
            "mobile-page-doclink-multi-zh-320-135x.png",
            MobileLocale::ZhHans,
            1.35,
            open_doclink_multi,
        ),
    ];
    for (filename, locale, font_scale, setup) in narrow_shots {
        let mut next_state = seed_showcase_state(locale, ThemeMode::Light, "2026-11-25");
        next_state.font_scale = font_scale;
        setup(&mut next_state);
        narrow_session.update_state(|s| *s = next_state)?;
        let out_path = out_dir.join(filename);
        let glyphs = narrow_session.render_png(&out_path)?;
        println!(
            "gallery: rendered {} (640x1136, {glyphs} glyphs)",
            out_path.display()
        );
    }

    Ok(())
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let Some(cmd) = args.next() else {
        bail!("usage: mobile-harness <audit-matrix | fps-replay | gallery --out <dir>>");
    };

    match cmd.as_str() {
        "audit-matrix" => run_audit_matrix(),
        "fps-replay" => run_fps_replay(),
        "gallery" => {
            let mut out_dir = PathBuf::from("evidence/s3-shell");
            while let Some(arg) = args.next() {
                if arg == "--out" {
                    out_dir = PathBuf::from(args.next().context("--out requires a directory")?);
                }
            }
            run_gallery(out_dir)
        }
        other => bail!("unknown subcommand `{other}`"),
    }
}
