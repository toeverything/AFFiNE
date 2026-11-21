use anyhow::{Context as _, Result, bail};
use playground::{PlaygroundView, register_bundled_fonts};
use serde::Serialize;
use std::cell::RefCell;
use std::path::PathBuf;
use std::process::Command;
use std::rc::Rc;
use std::time::{Duration, UNIX_EPOCH};
use ui::{
    Application, ApplicationHandle, Bounds, FrameSnapshot, HeadlessPlatform, HeadlessWindow,
    WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot, point, prelude::*, px, size,
};

#[derive(Serialize)]
struct TimingStat {
    median: f64,
    p95: f64,
}

#[derive(Serialize)]
struct CiWallMs {
    #[serde(skip_serializing_if = "Option::is_none")]
    lint_and_wasm: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    headless_linux: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_critical_path: Option<u64>,
}

#[derive(Serialize)]
struct ArtifactsBytes {
    #[serde(skip_serializing_if = "Option::is_none")]
    web_wasm_raw: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    web_wasm_gzip: Option<u64>,
    headless_bin: u64,
}

#[derive(Serialize)]
struct BenchmarksV1 {
    #[serde(skip_serializing_if = "Option::is_none")]
    doc_1k_edits_ms: Option<TimingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    room_sync_1k_ops_ms: Option<TimingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layout_10k_blocks_cold_ms: Option<TimingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layout_single_keystroke_ms: Option<TimingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layout_single_keystroke_blocks_relayout: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    edgeless_1k_pan_zoom_frame_ms: Option<TimingStat>,
    headless_frame_render_ms: TimingStat,
}

#[derive(Serialize)]
struct PerfMetricsV1 {
    schema_version: u32,
    commit: String,
    timestamp_utc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ci_wall_ms: Option<CiWallMs>,
    artifacts_bytes: ArtifactsBytes,
    benchmarks: BenchmarksV1,
}

struct HeadlessSession {
    platform: Rc<HeadlessPlatform>,
    app: ApplicationHandle,
    window_handle: WindowHandle<PlaygroundView>,
    headless_win: HeadlessWindow,
}

fn start_headless_session(width: u32, height: u32) -> Result<HeadlessSession> {
    let platform = HeadlessPlatform::new(width, height, 1.0);
    let init_cell: Rc<RefCell<Option<Result<WindowHandle<PlaygroundView>>>>> =
        Rc::new(RefCell::new(None));
    let init_out = init_cell.clone();

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        let res = (|| -> Result<WindowHandle<PlaygroundView>> {
            register_bundled_fonts(cx).context("registering bundled Inter font")?;
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(width as f32), px(height as f32)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(PlaygroundView::new),
            )
            .context("opening headless PlaygroundView window")
        })();
        *init_out.borrow_mut() = Some(res);
    });

    let window_handle = init_cell
        .borrow_mut()
        .take()
        .context("headless application did not execute")??;
    let headless_win = platform
        .windows()
        .into_iter()
        .next()
        .context("headless window not registered")?;

    Ok(HeadlessSession {
        platform,
        app,
        window_handle,
        headless_win,
    })
}

fn render_headless(
    width: u32,
    height: u32,
    out_png: PathBuf,
    out_snapshot: PathBuf,
    click_edgeless: bool,
) -> Result<()> {
    let session = start_headless_session(width, height)?;
    session.headless_win.request_frame();

    if click_edgeless {
        let click_pt = session.app.update(|cx| {
            session.window_handle.update(cx, |_, window, _| {
                let btn = window
                    .frame_snapshot()
                    .elements
                    .get("chrome.mode_switcher.edgeless")
                    .context("chrome.mode_switcher.edgeless missing from FrameSnapshot")?;
                Ok::<_, anyhow::Error>(point(
                    px(btn.bounds.x + btn.bounds.width * 0.5),
                    px(btn.bounds.y + btn.bounds.height * 0.5),
                ))
            })
        })??;
        session.headless_win.simulate_click(click_pt);
        session.platform.run_until_parked();
        session.platform.advance_clock(Duration::from_millis(250));
        session.headless_win.request_frame();
    }

    let (image, snapshot, glyph_count) = session.app.update(|cx| {
        session.window_handle.update(cx, |_, window, _| {
            let snapshot = window.frame_snapshot().clone();
            let glyph_count = window.rendered_scene().monochrome_sprites.len();
            let image = window.render_to_image()?;
            Ok::<_, anyhow::Error>((image, snapshot, glyph_count))
        })
    })??;

    anyhow::ensure!(
        glyph_count > 0,
        "headless render produced 0 text glyphs; check bundled Inter font registration"
    );

    if let Some(parent) = out_png.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    image
        .save(&out_png)
        .with_context(|| format!("writing PNG to {}", out_png.display()))?;

    if let Some(parent) = out_snapshot.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let snapshot_json = serde_json::to_string_pretty(&snapshot)?;
    std::fs::write(&out_snapshot, snapshot_json)
        .with_context(|| format!("writing snapshot to {}", out_snapshot.display()))?;

    println!(
        "Rendered {}x{} headless PNG ({} glyphs{}) to {} and snapshot ({} elements) to {}",
        width,
        height,
        glyph_count,
        if click_edgeless { ", edgeless" } else { "" },
        out_png.display(),
        snapshot.elements.len(),
        out_snapshot.display()
    );
    Ok(())
}

fn run_audit(snapshot_path: PathBuf) -> Result<()> {
    let raw = std::fs::read_to_string(&snapshot_path)
        .with_context(|| format!("reading snapshot {}", snapshot_path.display()))?;
    let snapshot: FrameSnapshot = serde_json::from_str(&raw)?;
    let violations = audit_frame_snapshot(&snapshot);
    if !violations.is_empty() {
        for v in &violations {
            eprintln!(
                "AUDIT VIOLATION [{}] {} ({}): {}",
                v.rule, v.element_id, v.callsite, v.message
            );
        }
        bail!("audit failed with {} violation(s)", violations.len());
    }
    println!(
        "Audit passed: 0 violations across {} elements",
        snapshot.elements.len()
    );
    Ok(())
}

fn run_fps_check() -> Result<()> {
    let rates = [60_u32, 120, 24, 7];
    let mut reference_terminal_json: Option<String> = None;

    for fps in rates {
        let dt_nanos = (1_000_000_000_u64 + u64::from(fps) / 2) / u64::from(fps);
        let dt = Duration::from_nanos(dt_nanos);

        let session = start_headless_session(1280, 800)?;
        session.headless_win.request_frame();

        let (page_x, edgeless_x, click_pt) = session.app.update(|cx| {
            session.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                let page_btn = snap
                    .elements
                    .get("chrome.mode_switcher.page")
                    .context("page button missing")?;
                let edge_btn = snap
                    .elements
                    .get("chrome.mode_switcher.edgeless")
                    .context("edgeless button missing")?;
                let click_pt = point(
                    px(edge_btn.bounds.x + edge_btn.bounds.width * 0.5),
                    px(edge_btn.bounds.y + edge_btn.bounds.height * 0.5),
                );
                Ok::<_, anyhow::Error>((page_btn.bounds.x, edge_btn.bounds.x, click_pt))
            })
        })??;

        session.headless_win.simulate_click(click_pt);
        session.platform.run_until_parked();

        let mut elapsed = Duration::ZERO;
        let total_duration = Duration::from_millis(250);
        let mut prev_x = page_x;
        let mut steps = 0_usize;
        let mut intermediate_count = 0_usize;

        while elapsed < total_duration {
            session.platform.advance_clock(dt);
            elapsed += dt;
            session.headless_win.request_frame();
            steps += 1;

            let cur_x = session.app.update(|cx| {
                session.window_handle.update(cx, |_, window, _| {
                    let snap = window.frame_snapshot();
                    let violations = audit_frame_snapshot(snap);
                    anyhow::ensure!(
                        violations.is_empty(),
                        "audit violations mid-transition at {fps} fps: {violations:#?}"
                    );
                    Ok::<_, anyhow::Error>(
                        snap.elements
                            .get("chrome.mode_switcher.indicator")
                            .context("indicator missing")?
                            .bounds
                            .x,
                    )
                })
            })??;

            anyhow::ensure!(
                cur_x + 0.01 >= prev_x,
                "non-monotonic slide at {fps} fps step {steps}: {cur_x} < {prev_x}"
            );
            if cur_x > page_x + 0.5 && cur_x < edgeless_x - 0.5 {
                intermediate_count += 1;
            }
            prev_x = cur_x;
        }

        anyhow::ensure!(
            intermediate_count >= 1,
            "expected at least 1 strictly intermediate indicator frame at {fps} fps, saw 0"
        );
        anyhow::ensure!(
            (prev_x - edgeless_x).abs() <= 0.5,
            "indicator did not reach edgeless_x ({edgeless_x}) at {fps} fps: ended at {prev_x}"
        );

        let terminal_json = session.app.update(|cx| {
            session.window_handle.update(cx, |_, window, _| {
                let snap = window.frame_snapshot();
                let violations = audit_frame_snapshot(snap);
                anyhow::ensure!(
                    violations.is_empty(),
                    "terminal audit violations at {fps} fps: {violations:#?}"
                );
                Ok::<_, anyhow::Error>(serde_json::to_string(snap)?)
            })
        })??;

        if let Some(ref expected) = reference_terminal_json {
            if &terminal_json != expected {
                bail!("fps-check terminal FrameSnapshot mismatch at {fps} fps");
            }
        } else {
            reference_terminal_json = Some(terminal_json);
        }

        println!(
            "fps-check {fps:>3} fps ({steps:>2} steps, {intermediate_count:>2} in-flight frames): indicator x {page_x} -> {prev_x}"
        );
    }

    println!(
        "fps-check passed: 60/120/24/7 fps stepped real PlaygroundView transition monotonically with byte-identical terminal FrameSnapshot."
    );
    Ok(())
}

fn resolve_commit_sha() -> String {
    if let Ok(sha) = std::env::var("GITHUB_SHA") {
        let trimmed = sha.trim();
        if trimmed.len() == 40 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
            return trimmed.to_ascii_lowercase();
        }
    }
    if let Ok(output) = Command::new("git").args(["rev-parse", "HEAD"]).output() {
        if output.status.success() {
            let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if sha.len() == 40 && sha.chars().all(|c| c.is_ascii_hexdigit()) {
                return sha.to_ascii_lowercase();
            }
        }
    }
    "0".repeat(40)
}

fn format_utc_iso8601() -> String {
    let secs = ui::system_now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn timing_stat(mut samples_ms: Vec<f64>) -> TimingStat {
    if samples_ms.is_empty() {
        return TimingStat {
            median: 0.0,
            p95: 0.0,
        };
    }
    samples_ms.sort_by(|a, b| a.total_cmp(b));
    let n = samples_ms.len();
    let median = samples_ms[n / 2];
    let p95_idx = ((n as f64) * 0.95).ceil() as usize;
    let p95 = samples_ms[p95_idx.saturating_sub(1).min(n - 1)];
    TimingStat {
        median: (median * 1000.0).round() / 1000.0,
        p95: (p95 * 1000.0).round() / 1000.0,
    }
}

fn run_bench(
    out_json: PathBuf,
    web_wasm_raw: Option<u64>,
    web_wasm_gzip: Option<u64>,
) -> Result<()> {
    let session = start_headless_session(1280, 800)?;

    // 1 warmup frame outside timing loop
    session.headless_win.request_frame();
    let _ = session.app.update(|cx| {
        session
            .window_handle
            .update(cx, |_, window, _| window.render_to_image())
    })??;

    // 30 warm steady-state frames
    let mut frame_times_ms = Vec::with_capacity(30);
    for _ in 0..30 {
        let start = ui::clock_now();
        session.app.update(|cx| {
            let _ = session
                .window_handle
                .update(cx, |_, window, _| window.refresh());
        });
        session.headless_win.request_frame();
        let _ = session.app.update(|cx| {
            session
                .window_handle
                .update(cx, |_, window, _| window.render_to_image())
        })??;
        frame_times_ms.push(start.elapsed().as_secs_f64() * 1000.0);
    }

    let headless_bin = std::env::current_exe()
        .ok()
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0);

    let metrics = PerfMetricsV1 {
        schema_version: 1,
        commit: resolve_commit_sha(),
        timestamp_utc: format_utc_iso8601(),
        ci_wall_ms: None,
        artifacts_bytes: ArtifactsBytes {
            web_wasm_raw,
            web_wasm_gzip,
            headless_bin,
        },
        benchmarks: BenchmarksV1 {
            doc_1k_edits_ms: None,
            room_sync_1k_ops_ms: None,
            layout_10k_blocks_cold_ms: None,
            layout_single_keystroke_ms: None,
            layout_single_keystroke_blocks_relayout: None,
            edgeless_1k_pan_zoom_frame_ms: None,
            headless_frame_render_ms: timing_stat(frame_times_ms),
        },
    };

    if let Some(parent) = out_json.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&out_json, serde_json::to_string_pretty(&metrics)?)?;
    println!(
        "Wrote v1 perf metrics (30 warm frames) to {}",
        out_json.display()
    );
    Ok(())
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let Some(cmd) = args.next() else {
        bail!("usage: bs-harness <render|audit|fps-check|bench> [options]");
    };

    match cmd.as_str() {
        "render" => {
            let mut out_png = PathBuf::from("frame.png");
            let mut out_snapshot = PathBuf::from("frame.json");
            let mut width = 1280_u32;
            let mut height = 800_u32;
            let mut click_edgeless = false;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--out" => out_png = PathBuf::from(args.next().context("--out requires path")?),
                    "--snapshot" => {
                        out_snapshot =
                            PathBuf::from(args.next().context("--snapshot requires path")?)
                    }
                    "--width" => width = args.next().context("--width requires value")?.parse()?,
                    "--height" => {
                        height = args.next().context("--height requires value")?.parse()?
                    }
                    "--click-edgeless" => click_edgeless = true,
                    other => bail!("unknown render flag: {other}"),
                }
            }
            render_headless(width, height, out_png, out_snapshot, click_edgeless)
        }
        "audit" => {
            let mut snapshot = None;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--snapshot" => {
                        snapshot = Some(PathBuf::from(
                            args.next().context("--snapshot requires path")?,
                        ))
                    }
                    other => bail!("unknown audit flag: {other}"),
                }
            }
            run_audit(snapshot.context("audit requires --snapshot <json>")?)
        }
        "fps-check" => run_fps_check(),
        "bench" => {
            let mut out_json = PathBuf::from("perf-metrics.json");
            let mut web_wasm_raw = None;
            let mut web_wasm_gzip = None;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--json" => {
                        out_json = PathBuf::from(args.next().context("--json requires path")?)
                    }
                    "--web-wasm-raw" => {
                        web_wasm_raw = Some(
                            args.next()
                                .context("--web-wasm-raw requires bytes")?
                                .parse()?,
                        )
                    }
                    "--web-wasm-gzip" => {
                        web_wasm_gzip = Some(
                            args.next()
                                .context("--web-wasm-gzip requires bytes")?
                                .parse()?,
                        )
                    }
                    other => bail!("unknown bench flag: {other}"),
                }
            }
            run_bench(out_json, web_wasm_raw, web_wasm_gzip)
        }
        other => bail!("unknown subcommand: {other}"),
    }
}
