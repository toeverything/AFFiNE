//! Deterministic offscreen verification, SQLite stress test, and screenshot gallery CLI
//! for `affine-desktop`:
//! - `audit`: renders all core states in Light & Dark at `1440×900` and `1280×720` and runs
//!   `audit_frame_snapshot` + viewport bounds checks.
//! - `gallery --out <dir>`: renders `1440×900` Light & Dark PNGs for all desktop shell states.
//! - `stress-sqlite --db <path>`: opens a real `.affine` SQLite workspace in place, asserts
//!   zero writeback (byte-identical SHA-256), renders AppSidebar + SplitView + QuickSearch,
//!   and prints strictly sanitized aggregate metrics.

use std::{cell::RefCell, path::PathBuf, rc::Rc};

use affine_desktop::{
    ContentHash, DesktopAppState, DesktopDocStore, DesktopRoute, DesktopShellView, DocInspectorTab,
    register_desktop_fonts,
};
use anyhow::{Context as _, Result, bail};
use serde_json::json;
use ui::{
    Application, ApplicationHandle, Bounds, FrameSnapshot, HeadlessPlatform, HeadlessWindow,
    WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot, point, prelude::*, px, size,
};
use ui_tokens::ThemeMode;

struct DesktopSession {
    platform: Rc<HeadlessPlatform>,
    app: ApplicationHandle,
    window_handle: WindowHandle<DesktopShellView>,
    headless_win: HeadlessWindow,
}

fn start_session(
    width: u32,
    height: u32,
    scale_factor: f32,
    state: DesktopAppState,
) -> Result<DesktopSession> {
    let platform = HeadlessPlatform::new(width, height, scale_factor);
    let init_cell: Rc<RefCell<Option<Result<WindowHandle<DesktopShellView>>>>> =
        Rc::new(RefCell::new(None));
    let init_out = init_cell.clone();
    let state_cell = RefCell::new(Some(state));

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        let res = (|| -> Result<WindowHandle<DesktopShellView>> {
            register_desktop_fonts(cx).context("registering desktop fonts")?;
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
                |_, cx| cx.new(|cx| DesktopShellView::new(initial_state, cx)),
            )
            .context("opening headless DesktopShellView window")
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

    Ok(DesktopSession {
        platform,
        app,
        window_handle,
        headless_win,
    })
}

impl DesktopSession {
    fn update_state<R>(&self, f: impl FnOnce(&mut DesktopAppState) -> R) -> Result<R> {
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

fn check_snapshot(snapshot: &FrameSnapshot, vp_w: f32, vp_h: f32, ctx: &str) -> Vec<String> {
    let mut violations = Vec::new();
    for v in audit_frame_snapshot(snapshot) {
        violations.push(format!("{ctx}: frame-audit {v:?}"));
    }
    for (id, el) in &snapshot.elements {
        let b = &el.bounds;
        if b.x < -0.5 || b.y < -0.5 || b.x + b.width > vp_w + 0.5 || b.y + b.height > vp_h + 0.5 {
            violations.push(format!(
                "{ctx}: element {id} out of bounds ({:.1},{:.1},{:.1}x{:.1}) in {vp_w}x{vp_h}",
                b.x, b.y, b.width, b.height
            ));
        }
    }
    violations
}

fn setup_states() -> Vec<(&'static str, Box<dyn Fn(&mut DesktopAppState)>)> {
    vec![
        (
            "sidebar-page",
            Box::new(|s| {
                s.inspector_tab = Some(DocInspectorTab::Outline);
            }),
        ),
        (
            "split-view",
            Box::new(|s| {
                s.open_split_edgeless_for_active_doc();
            }),
        ),
        (
            "quick-search",
            Box::new(|s| {
                s.open_quick_search();
            }),
        ),
        (
            "peek-view",
            Box::new(|s| {
                s.open_peek_view("doc-sync");
            }),
        ),
        (
            "trash",
            Box::new(|s| {
                s.navigate_active_pane(DesktopRoute::Trash);
            }),
        ),
        (
            "settings",
            Box::new(|s| {
                s.navigate_active_pane(DesktopRoute::Trash);
                s.open_settings();
            }),
        ),
    ]
}

fn run_audit() -> Result<()> {
    let mut violations = Vec::new();
    let mut frames = 0usize;
    let states = setup_states();

    for (vp_w, vp_h) in [(1440_u32, 900_u32), (1280, 720)] {
        for theme in [ThemeMode::Light, ThemeMode::Dark] {
            let initial = DesktopAppState::seed_showcase(theme, "2026-11-28");
            let session = start_session(vp_w, vp_h, 1.0, initial)?;
            for (name, setup) in &states {
                let mut next = DesktopAppState::seed_showcase(theme, "2026-11-28");
                setup(&mut next);
                session.update_state(|s| *s = next)?;
                let snap = session.frame()?;
                frames += 1;
                let ctx = format!("{vp_w}x{vp_h}/{theme:?}/{name}");
                violations.extend(check_snapshot(&snap, vp_w as f32, vp_h as f32, &ctx));
            }
        }
    }

    let report = json!({
        "frames_audited": frames,
        "violations": violations.len(),
        "details": violations,
    });
    println!("{}", serde_json::to_string_pretty(&report)?);
    if !violations.is_empty() {
        bail!(
            "desktop-harness audit failed with {} violations",
            violations.len()
        );
    }
    Ok(())
}

fn run_gallery(out_dir: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&out_dir)?;
    let states = setup_states();
    let initial = DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28");
    let session = start_session(1440, 900, 1.0, initial)?;

    for theme in [ThemeMode::Light, ThemeMode::Dark] {
        let theme_tag = match theme {
            ThemeMode::Light => "light",
            ThemeMode::Dark => "dark",
        };
        for (name, setup) in &states {
            let mut next = DesktopAppState::seed_showcase(theme, "2026-11-28");
            setup(&mut next);
            session.update_state(|s| *s = next)?;
            let out_path = out_dir.join(format!("desktop-{name}-{theme_tag}.png"));
            let glyphs = session.render_png(&out_path)?;
            println!(
                "gallery: rendered {} (1440x900, {glyphs} glyphs)",
                out_path.display()
            );
        }
    }
    Ok(())
}

fn run_stress_sqlite(db_path: PathBuf) -> Result<()> {
    let bytes_before = std::fs::read(&db_path)
        .with_context(|| format!("reading sqlite file {}", db_path.display()))?;
    let hash_before = ContentHash::of_bytes(&bytes_before);

    let (store, stats) = DesktopDocStore::open_sqlite_file(&db_path)?;
    anyhow::ensure!(
        stats.pending_writebacks == 0,
        "expected 0 pending writebacks on read-only open, got {}",
        stats.pending_writebacks
    );

    let state = DesktopAppState::from_doc_store_in_memory(store, ThemeMode::Light, "2026-11-28");
    let session = start_session(1440, 900, 1.0, state)?;

    // 1. Render initial AppSidebar + first hydrated document.
    let snap_initial = session.frame()?;
    let initial_elements = snap_initial.elements.len();

    // 2. Open Split View (Left Page + Right Edgeless of the same real document).
    session.update_state(|s| {
        s.open_split_edgeless_for_active_doc();
    })?;
    let snap_split = session.frame()?;
    let split_elements = snap_split.elements.len();

    // 3. Exercise QuickSearch over all loaded documents + scrolling.
    let qs_total = session.update_state(|s| {
        s.open_quick_search();
        s.quick_search.scroll_y = 120.0;
        s.quick_search.items(&s.store).len()
    })?;
    let _ = session.frame()?;

    // 4. Exercise AllDocs list scrolling and Sidebar scrolling.
    session.update_state(|s| {
        s.quick_search.close();
        s.sidebar.scroll_y = 240.0;
        s.navigate_active_pane(DesktopRoute::AllDocs);
        s.split.active_mut().scroll_y = 320.0;
    })?;
    let _ = session.frame()?;

    // Verify 0 writeback on disk (byte-identical SHA-256).
    let bytes_after = std::fs::read(&db_path)?;
    let hash_after = ContentHash::of_bytes(&bytes_after);
    anyhow::ensure!(
        hash_before == hash_after,
        "SQLite file mutated during read-only stress test (expected 0 writeback)"
    );

    let report = json!({
        "sqlite_bytes": bytes_before.len(),
        "zero_writeback_verified": true,
        "total_docs": stats.total_docs,
        "visible_docs": stats.visible_docs,
        "trashed_docs": stats.trashed_docs,
        "journal_docs": stats.journal_docs,
        "favorite_docs": stats.favorite_docs,
        "folder_rows": stats.folder_rows,
        "blob_count": stats.blob_count,
        "quick_search_items": qs_total,
        "initial_frame_elements": initial_elements,
        "split_frame_elements": split_elements,
    });
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let Some(cmd) = args.next() else {
        bail!("usage: desktop-harness <audit | gallery --out <dir> | stress-sqlite --db <path>>");
    };
    match cmd.as_str() {
        "audit" => run_audit(),
        "gallery" => {
            let mut out_dir = PathBuf::from("evidence/desktop");
            while let Some(arg) = args.next() {
                if arg == "--out" {
                    out_dir = PathBuf::from(args.next().context("--out requires a directory")?);
                }
            }
            run_gallery(out_dir)
        }
        "stress-sqlite" => {
            let mut db_path: Option<PathBuf> = None;
            while let Some(arg) = args.next() {
                if arg == "--db" {
                    db_path = Some(PathBuf::from(args.next().context("--db requires a path")?));
                }
            }
            run_stress_sqlite(db_path.context("--db <path> is required")?)
        }
        other => bail!("unknown subcommand `{other}`"),
    }
}
