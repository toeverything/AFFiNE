use anyhow::{Context as _, Result, bail};
use blocksuite_playground_doc::{
    client_id_from_seed,
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
    wire::{DocMessage, RoomBinaryFrame, decode_binary_frame, encode_binary_frame},
};
use playground::{PlaygroundMode, PlaygroundOptions};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::time::UNIX_EPOCH;

use super::*;

#[derive(Serialize)]
pub(super) struct TimingStat {
    median: f64,
    p95: f64,
}

#[derive(Default, Serialize)]
pub(super) struct CiWallMs {
    #[serde(skip_serializing_if = "Option::is_none")]
    lint_and_wasm: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    headless_linux: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_critical_path: Option<u64>,
}

#[derive(Serialize)]
pub(super) struct ArtifactsBytes {
    #[serde(skip_serializing_if = "Option::is_none")]
    web_wasm_raw: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    web_wasm_gzip: Option<u64>,
    headless_bin: u64,
}

#[derive(Serialize)]
pub(super) struct BenchmarksV1 {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    edgeless_1k_pan_zoom_blocks_relayout: Option<u64>,
    headless_frame_render_ms: TimingStat,
}

#[derive(Serialize)]
pub(super) struct PerfMetricsV1 {
    schema_version: u32,
    commit: String,
    timestamp_utc: String,
    ci_wall_ms: CiWallMs,
    artifacts_bytes: ArtifactsBytes,
    benchmarks: BenchmarksV1,
}

pub(super) fn validate_commit_sha(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() == 40 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(trimmed.to_ascii_lowercase())
    } else {
        None
    }
}

pub(super) fn resolve_commit_sha(explicit_commit: Option<&str>) -> Result<String> {
    if let Some(raw) = explicit_commit {
        return validate_commit_sha(raw).with_context(|| {
            format!("--commit must be a 40-character hexadecimal Git SHA, got {raw:?}")
        });
    }
    if let Ok(sha) = std::env::var("GITHUB_SHA")
        && let Some(valid) = validate_commit_sha(&sha)
    {
        return Ok(valid);
    }
    if let Ok(output) = Command::new("git").args(["rev-parse", "HEAD"]).output()
        && output.status.success()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(valid) = validate_commit_sha(&stdout) {
            return Ok(valid);
        }
    }
    bail!(
        "unable to resolve a 40-character hexadecimal commit SHA (pass --commit <40-hex>, set GITHUB_SHA, or run inside a git worktree)"
    )
}

pub(super) fn format_utc_iso8601() -> String {
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

pub(super) fn timing_stat(mut samples_ms: Vec<f64>) -> TimingStat {
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

pub(super) fn run_doc_1k_edits_once(seed: u64) -> Result<()> {
    let mut doc = PageDocSession::new("bench-page", client_id_from_seed(seed))?;
    doc.add_block(
        "page-root",
        BlockSpec::Page {
            title: "Bench Page".to_string(),
        },
        None,
        None,
        1_000,
    )?;
    doc.add_block(
        "note-root",
        BlockSpec::Note { xywh: None },
        Some("page-root"),
        None,
        1_001,
    )?;
    doc.add_block(
        "p-main",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: String::new(),
        },
        Some("note-root"),
        None,
        1_002,
    )?;

    let mut now_ms = 2_000_u64;
    // 100 block additions
    for i in 0..100_u64 {
        doc.add_block(
            format!("p-{i}"),
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: format!("block {i}"),
            },
            Some("note-root"),
            None,
            now_ms,
        )?;
        now_ms += 600;
    }

    // 700 text insertions into p-main
    let mut text_len = 0_u64;
    for i in 0..700_u64 {
        let ch = if i % 2 == 0 { "a" } else { "b" };
        doc.insert_text("p-main", "prop:text", text_len, ch, now_ms)?;
        text_len += 1;
        now_ms += 600;
    }

    // 100 text removals
    for _ in 0..100_u64 {
        text_len -= 1;
        doc.remove_text("p-main", "prop:text", text_len, 1, now_ms)?;
        now_ms += 600;
    }

    // 50 undos + 50 redos
    for _ in 0..50_u64 {
        doc.undo()?;
    }
    for _ in 0..50_u64 {
        doc.redo()?;
    }

    Ok(())
}

pub(super) fn bench_doc_1k_edits_ms() -> Result<TimingStat> {
    // 1 warmup iteration outside timing loop
    run_doc_1k_edits_once(0)?;

    let mut samples_ms = Vec::with_capacity(20);
    for sample in 1..=20_u64 {
        let start = ui::clock_now();
        run_doc_1k_edits_once(sample)?;
        samples_ms.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    Ok(timing_stat(samples_ms))
}

pub(super) fn run_room_sync_1k_ops_once(seed: u64) -> Result<()> {
    let mut peer_a = PageDocSession::new("bench-sync", client_id_from_seed(seed * 2 + 1))?;
    let mut peer_b = PageDocSession::new("bench-sync", client_id_from_seed(seed * 2 + 2))?;

    peer_a.add_block(
        "page-root",
        BlockSpec::Page {
            title: "Sync Bench".to_string(),
        },
        None,
        None,
        1_000,
    )?;
    peer_a.add_block(
        "note-root",
        BlockSpec::Note { xywh: None },
        Some("page-root"),
        None,
        1_001,
    )?;
    peer_a.add_block(
        "p-sync",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: String::new(),
        },
        Some("note-root"),
        None,
        1_002,
    )?;

    let init_update = peer_a.encode_update_v1()?;
    peer_b.apply_remote_update_v1(&init_update)?;

    let mut now_ms = 2_000_u64;
    for i in 0..1_000_u64 {
        let commit = peer_a
            .insert_text(
                "p-sync",
                "prop:text",
                i,
                if i % 2 == 0 { "x" } else { "y" },
                now_ms,
            )?
            .context("insert_text should emit a commit")?;
        now_ms += 10;

        let encoded = encode_binary_frame(&RoomBinaryFrame::Doc {
            doc_id: "bench-sync".to_string(),
            message: DocMessage::Update(commit.update),
        })?;
        match decode_binary_frame(&encoded)? {
            RoomBinaryFrame::Doc {
                message: DocMessage::Update(update),
                ..
            } => {
                peer_b.apply_remote_update_v1(&update)?;
            }
            other => bail!("unexpected decoded room frame: {other:?}"),
        }
    }

    Ok(())
}

pub(super) fn bench_room_sync_1k_ops_ms() -> Result<TimingStat> {
    // 1 warmup iteration outside timing loop
    run_room_sync_1k_ops_once(0)?;

    let mut samples_ms = Vec::with_capacity(20);
    for sample in 1..=20_u64 {
        let start = ui::clock_now();
        run_room_sync_1k_ops_once(sample)?;
        samples_ms.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    Ok(timing_stat(samples_ms))
}

pub(super) fn bench_page(session: &HeadlessSession) -> Result<(TimingStat, TimingStat, u64)> {
    const COUNT: usize = 10_000;
    let mut cold = Vec::new();
    let mut edits = Vec::new();
    let mut frames = Vec::new();
    let mut work = 0;
    for _ in 0..5 {
        let doc = probe_doc(std::iter::repeat_n("An editable paragraph.", COUNT - 2))?;
        session.update(|v, _, cx| v.set_document(doc, cx))?;
        let t = ui::clock_now();
        session.headless_win.request_frame();
        cold.push(t.elapsed().as_secs_f64() * 1000.);
        let laid_out = session.update(|v, _, _| v.flow_layout().unwrap().stats.laid_out)?;
        anyhow::ensure!(
            laid_out == COUNT - 1,
            "cold pass laid out {laid_out} visible-flow blocks"
        );
        session.select("p5000", 5)?;
        session.headless_win.request_frame();
        for _ in 0..6 {
            let t = ui::clock_now();
            session.type_text("x")?;
            session.headless_win.request_frame();
            edits.push(t.elapsed().as_secs_f64() * 1000.);
            let (count, visible) = session.update(|v, w, _| {
                (
                    v.flow_layout().unwrap().stats.laid_out,
                    w.frame_snapshot()
                        .elements
                        .keys()
                        .filter(|id| id.starts_with("page.block."))
                        .count(),
                )
            })?;
            anyhow::ensure!(count == 1, "single edit reshaped {count} blocks");
            anyhow::ensure!(
                visible > 0 && visible < 40,
                "viewport instantiated {visible} complete blocks"
            );
            work = count as u64;
            let t = ui::clock_now();
            session.update(|_, w, _| w.refresh())?;
            session.headless_win.request_frame();
            let _ = session.image()?;
            frames.push(t.elapsed().as_secs_f64() * 1000.);
        }
    }
    let (cold, edits, frames) = (timing_stat(cold), timing_stat(edits), timing_stat(frames));
    println!(
        "10k blocks: cold median/p95 {:.3}/{:.3} ms, edit {:.3}/{:.3} ms, restored viewport frame+readback {:.3}/{:.3} ms, {work} body laid out",
        cold.median, cold.p95, edits.median, edits.p95, frames.median, frames.p95
    );
    Ok((cold, edits, work))
}

pub(super) fn bench_edgeless_1k() -> Result<(TimingStat, u64)> {
    use blocksuite_playground_doc::{
        client_id_from_seed,
        schema::{BlockSpec, ParagraphType},
    };
    use playground::room_client::DocState;

    let session = start_headless_session(
        1280,
        800,
        PlaygroundOptions {
            mode: PlaygroundMode::Edgeless,
            ..PlaygroundOptions::default()
        },
    )?;

    // Build a 1,000-block spatial Edgeless scene: 250 Notes (each with 3 paragraphs = 1,000
    // blocks), 20 Frames, and 30 rotated EdgelessTexts spread across a 2D grid.
    let mut doc = DocState::new("bench-edgeless-1k", client_id_from_seed(0x4d35))?;
    doc.workspace.initialize_meta()?;
    doc.workspace.create_page(
        playground::HOME_PAGE_ID,
        "Edgeless 1K Bench",
        1_700_000_000_000,
    )?;
    let page = doc.workspace.ensure_page(playground::HOME_PAGE_ID)?;
    let mut now_ms = 1_000_u64;
    let mut tick = || {
        now_ms += 1;
        now_ms
    };
    page.add_block(
        "e1k-page",
        BlockSpec::Page {
            title: "Edgeless 1K Bench".to_string(),
        },
        None,
        None,
        tick(),
    )?;
    page.add_block(
        "e1k-surface",
        BlockSpec::Surface,
        Some("e1k-page"),
        None,
        tick(),
    )?;

    for f in 0..20 {
        let col = (f % 5) as f32;
        let row = (f / 5) as f32;
        page.add_block(
            &format!("e1k-frame-{f}"),
            BlockSpec::Frame {
                title: format!("Frame {f}"),
                xywh: Some(format!(
                    "[{},{},1800,1200]",
                    col * 2000.0 - 40.0,
                    row * 1400.0 - 40.0
                )),
                presentation_index: Some(format!("a{f:02}")),
            },
            Some("e1k-page"),
            None,
            tick(),
        )?;
    }
    for n in 0..250 {
        let col = (n % 25) as f32;
        let row = (n / 25) as f32;
        let note_id = format!("e1k-note-{n}");
        page.add_block(
            &note_id,
            BlockSpec::Note {
                xywh: Some(format!("[{},{},340,180]", col * 400.0, row * 240.0)),
            },
            Some("e1k-page"),
            None,
            tick(),
        )?;
        for p in 0..3 {
            page.add_block(
                &format!("e1k-note-{n}-p{p}"),
                BlockSpec::Paragraph {
                    paragraph_type: if p == 0 {
                        ParagraphType::H4
                    } else {
                        ParagraphType::Text
                    },
                    text: format!("Note {n} paragraph {p}: GPU transform spatial test."),
                },
                Some(&note_id),
                None,
                tick(),
            )?;
        }
    }
    for t in 0..30 {
        let et_id = format!("e1k-text-{t}");
        page.add_block(
            &et_id,
            BlockSpec::EdgelessText {
                xywh: Some(format!(
                    "[{},{},260,64]",
                    (t % 10) as f32 * 480.0,
                    2600.0 + (t / 10) as f32 * 140.0
                )),
            },
            Some("e1k-page"),
            None,
            tick(),
        )?;
        page.set_block_prop(
            &et_id,
            "prop:rotate",
            y_octo::SessionValue::Any(y_octo::Any::Float64((((t % 7) as f64 - 3.0) * 5.0).into())),
            tick(),
        )?;
        page.add_block(
            &format!("e1k-text-{t}-p"),
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: format!("Rotated label #{t}"),
            },
            Some(&et_id),
            None,
            tick(),
        )?;
    }

    session.update(|v, _, cx| v.set_document(doc, cx))?;
    // Warmup frame: lays out and caches all Notes and EdgelessTexts once.
    session.headless_win.request_frame();
    let _ = session.image()?;

    // 30-step pan + 0.25x..4.0x zoom sweep: must incur ZERO block relayouts.
    let mut times = Vec::with_capacity(30);
    let mut relayout_count = 0_u64;
    for step in 0..30 {
        let frac = step as f32 / 29.0;
        let zoom = 0.25 * (16.0_f32).powf(frac); // 0.25x -> 4.0x
        let pan_x = -200.0 + frac * 1800.0;
        let pan_y = -100.0 + (frac * std::f32::consts::TAU).sin() * 400.0 + 400.0;
        let t = ui::clock_now();
        session.update(|v, w, cx| {
            v.set_edgeless_camera(pan_x, pan_y, zoom, cx);
            w.refresh();
        })?;
        session.headless_win.request_frame();
        let _ = session.image()?;
        times.push(t.elapsed().as_secs_f64() * 1000.0);
        relayout_count += session.update(|v, _, _| v.edgeless_last_frame_relayouts())?;
    }
    anyhow::ensure!(
        relayout_count == 0,
        "edgeless 1k pan/zoom sweep triggered {relayout_count} block relayouts (expected 0)"
    );
    let stat = timing_stat(times);
    println!(
        "edgeless 1k pan/zoom (30 steps, 0.25x..4.0x): median/p95 {:.3}/{:.3} ms, {} blocks relayout",
        stat.median, stat.p95, relayout_count
    );
    Ok((stat, relayout_count))
}

pub(super) fn run_bench(
    out_json: PathBuf,
    explicit_commit: Option<String>,
    web_wasm_raw: Option<u64>,
    web_wasm_gzip: Option<u64>,
) -> Result<()> {
    let commit = resolve_commit_sha(explicit_commit.as_deref())?;
    let doc_1k_edits_ms = bench_doc_1k_edits_ms()?;
    let room_sync_1k_ops_ms = bench_room_sync_1k_ops_ms()?;
    let session = start_headless_session(1280, 800, PlaygroundOptions::default())?;

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

    let (cold, edits, work) = bench_page(&session)?;
    let (edgeless_ms, edgeless_relayouts) = bench_edgeless_1k()?;
    let metrics = PerfMetricsV1 {
        schema_version: 1,
        commit,
        timestamp_utc: format_utc_iso8601(),
        ci_wall_ms: CiWallMs::default(),
        artifacts_bytes: ArtifactsBytes {
            web_wasm_raw,
            web_wasm_gzip,
            headless_bin,
        },
        benchmarks: BenchmarksV1 {
            doc_1k_edits_ms: Some(doc_1k_edits_ms),
            room_sync_1k_ops_ms: Some(room_sync_1k_ops_ms),
            layout_10k_blocks_cold_ms: Some(cold),
            layout_single_keystroke_ms: Some(edits),
            layout_single_keystroke_blocks_relayout: Some(work),
            edgeless_1k_pan_zoom_frame_ms: Some(edgeless_ms),
            edgeless_1k_pan_zoom_blocks_relayout: Some(edgeless_relayouts),
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
