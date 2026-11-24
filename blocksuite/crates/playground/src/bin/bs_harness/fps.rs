use anyhow::{Context as _, Result, bail};
use playground::{PlaygroundOptions, overlays::OverlayEvent};
use std::time::Duration;
use ui::{audit_frame_snapshot, point, px};

use super::*;

pub(super) const FPS_RATES: [u32; 4] = [60, 120, 24, 7];

pub(super) fn frame_interval(fps: u32) -> Duration {
    Duration::from_nanos((1_000_000_000_u64 + u64::from(fps) / 2) / u64::from(fps))
}

/// Step a popover's fade for 250 ms at `fps` and return the opacity of every frame it was
/// mounted in. Every frame is audited, and a mounted popover never sits at the window
/// origin or moves.
pub(super) fn step_popover(
    session: &HeadlessSession,
    fps: u32,
    id: &str,
    what: &str,
) -> Result<Vec<Option<f32>>> {
    let dt = frame_interval(fps);
    let mut elapsed = Duration::ZERO;
    let mut opacities = Vec::new();
    let mut placed: Option<(f32, f32)> = None;
    // The frame the transition starts in comes first.
    loop {
        let snapshot = session.frame()?;
        let violations = audit_frame_snapshot(&snapshot);
        anyhow::ensure!(
            violations.is_empty(),
            "audit violations while {what} at {fps} fps: {violations:#?}"
        );
        let element = snapshot.elements.get(id);
        if let Some(element) = element {
            let origin = (element.bounds.x, element.bounds.y);
            anyhow::ensure!(
                origin != (0.0, 0.0) && element.opacity > 0.0,
                "{id} flashed at {origin:?} with opacity {} while {what} at {fps} fps",
                element.opacity
            );
            anyhow::ensure!(
                placed.is_none_or(|placed| placed == origin),
                "{id} moved from {placed:?} to {origin:?} while {what} at {fps} fps"
            );
            placed = Some(origin);
        }
        opacities.push(element.map(|element| element.opacity));
        if elapsed >= Duration::from_millis(250) {
            break;
        }
        session.platform.advance_clock(dt);
        elapsed += dt;
    }
    Ok(opacities)
}

/// Open and close one popover at every rate: the fade is monotonic with at least one
/// in-flight frame each way, and the frames it settles in are byte-identical.
pub(super) fn fps_check_popover(
    name: &str,
    id: &str,
    open: impl Fn(&HeadlessSession) -> Result<()>,
    close: impl Fn(&HeadlessSession) -> Result<()>,
) -> Result<()> {
    let mut reference: Option<(String, String)> = None;
    for fps in FPS_RATES {
        let session = start_headless_session(1280, 800, PlaygroundOptions::default())?;
        session.frame()?;

        open(&session)?;
        session.platform.run_until_parked();
        let opening = step_popover(&session, fps, id, "opening")?;
        let shown: Vec<f32> = opening.iter().flatten().copied().collect();
        anyhow::ensure!(
            shown.windows(2).all(|pair| pair[1] >= pair[0]),
            "{name} fade-in is not monotonic at {fps} fps: {shown:?}"
        );
        let in_flight_open = shown.iter().filter(|opacity| **opacity < 1.0).count();
        anyhow::ensure!(
            in_flight_open >= 1 && shown.last() == Some(&1.0),
            "{name} fade-in at {fps} fps needs an in-flight frame and a full end: {shown:?}"
        );
        let open_json = serde_json::to_string(&session.frame()?)?;

        close(&session)?;
        session.platform.run_until_parked();
        let closing = step_popover(&session, fps, id, "closing")?;
        let fading: Vec<f32> = closing.iter().flatten().copied().collect();
        anyhow::ensure!(
            fading.windows(2).all(|pair| pair[1] <= pair[0]),
            "{name} fade-out is not monotonic at {fps} fps: {fading:?}"
        );
        let in_flight_close = fading.iter().filter(|opacity| **opacity < 1.0).count();
        anyhow::ensure!(
            in_flight_close >= 1 && closing.last() == Some(&None),
            "{name} fade-out at {fps} fps needs an in-flight frame and to unmount: {closing:?}"
        );
        let closed_json = serde_json::to_string(&session.frame()?)?;

        match &reference {
            Some((open_reference, closed_reference)) => {
                if &open_json != open_reference || &closed_json != closed_reference {
                    bail!("fps-check terminal FrameSnapshot mismatch for {name} at {fps} fps");
                }
            }
            None => reference = Some((open_json, closed_json)),
        }
        println!(
            "fps-check {fps:>3} fps {name}: {in_flight_open} in-flight frames in, {in_flight_close} out"
        );
    }
    Ok(())
}

pub(super) fn run_fps_check() -> Result<()> {
    fps_check_mode_switch()?;
    fps_check_popover(
        "slash menu",
        "overlay.slash_menu",
        |session| {
            session.overlay(OverlayEvent::OpenSlashMenu {
                block_id: "showcase-h2".to_string(),
                utf16_offset: 0,
                anchor: None,
            })
        },
        |session| session.overlay(OverlayEvent::CloseSlashMenu),
    )?;
    fps_check_popover(
        "format toolbar",
        "overlay.format_toolbar",
        |session| session.select_text("showcase-quote", "Every block"),
        |session| session.overlay(OverlayEvent::SetSelection(None)),
    )?;
    println!(
        "fps-check passed: 60/120/24/7 fps stepped the mode switch, the slash menu and the format toolbar monotonically with byte-identical terminal FrameSnapshots."
    );
    Ok(())
}

pub(super) fn fps_check_mode_switch() -> Result<()> {
    let rates = FPS_RATES;
    let mut reference_terminal_json: Option<String> = None;

    for fps in rates {
        let dt_nanos = (1_000_000_000_u64 + u64::from(fps) / 2) / u64::from(fps);
        let dt = Duration::from_nanos(dt_nanos);

        let session = start_headless_session(1280, 800, PlaygroundOptions::default())?;
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

    Ok(())
}
