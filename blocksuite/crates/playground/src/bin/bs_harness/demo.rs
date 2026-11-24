use anyhow::{Context as _, Result};
use playground::{PlaygroundOptions, PlaygroundTheme};
use std::path::PathBuf;
use ui::EntityInputHandler;
use ui::{audit_frame_snapshot, point, px};

use super::*;

/// The pointer drawn into recorded frames, hot spot at its top-left: `#` is the outline and
/// `o` the fill.
pub(super) const DEMO_POINTER: [&str; 18] = [
    "#           ",
    "##          ",
    "#o#         ",
    "#oo#        ",
    "#ooo#       ",
    "#oooo#      ",
    "#ooooo#     ",
    "#oooooo#    ",
    "#ooooooo#   ",
    "#oooooooo#  ",
    "#ooooooooo# ",
    "#oooooo#####",
    "#ooo#oo#    ",
    "#oo# #oo#   ",
    "#o#  #oo#   ",
    "##    #oo#  ",
    "#     #oo#  ",
    "       ##   ",
];
pub(super) const DEMO_FPS: u32 = 60;
/// Radius of the disc drawn under the pointer while its button is down.
pub(super) const DEMO_PRESS_RADIUS: f32 = 10.0;

/// Drives a session through input events and saves every 60 fps frame of it.
pub(super) struct DemoRecorder<'a> {
    session: &'a HeadlessSession,
    dir: PathBuf,
    frames: usize,
    pointer: (f32, f32),
    pressed: bool,
}

impl DemoRecorder<'_> {
    /// Let one frame interval pass on the scheduler clock, draw, audit and save the frame.
    pub(super) fn frame(&mut self) -> Result<()> {
        let session = self.session;
        session.platform.run_until_parked();
        session.platform.advance_clock(frame_interval(DEMO_FPS));
        session.platform.run_until_parked();
        let violations = audit_frame_snapshot(&session.frame()?);
        anyhow::ensure!(
            violations.is_empty(),
            "demo frame {} violations: {violations:?}",
            self.frames
        );
        let mut image = session.image()?;
        self.draw_pointer(&mut image);
        image.save(self.dir.join(format!("frame-{:05}.png", self.frames)))?;
        self.frames += 1;
        Ok(())
    }

    pub(super) fn hold(&mut self, frames: usize) -> Result<()> {
        (0..frames).try_for_each(|_| self.frame())
    }

    /// Name the moment the next frame shows, for picking stills out of the recording.
    pub(super) fn chapter(&self, name: &str) {
        println!("frame {:05} {name}", self.frames);
    }

    pub(super) fn draw_pointer(&self, image: &mut image::RgbaImage) {
        let (x, y) = (self.pointer.0.round() as i64, self.pointer.1.round() as i64);
        let mut blend = |px: i64, py: i64, color: [u8; 3], alpha: f32| {
            if px < 0 || py < 0 || px >= image.width() as i64 || py >= image.height() as i64 {
                return;
            }
            let pixel = image.get_pixel_mut(px as u32, py as u32);
            for (channel, value) in pixel.0.iter_mut().zip(color) {
                *channel =
                    (f32::from(*channel) * (1.0 - alpha) + f32::from(value) * alpha).round() as u8;
            }
        };
        if self.pressed {
            let reach = DEMO_PRESS_RADIUS.ceil() as i64;
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    let distance = ((dx * dx + dy * dy) as f32).sqrt();
                    let coverage = (DEMO_PRESS_RADIUS + 0.5 - distance).clamp(0.0, 1.0);
                    blend(x + dx, y + dy, [30, 150, 235], 0.35 * coverage);
                }
            }
        }
        for (row, line) in DEMO_POINTER.iter().enumerate() {
            for (column, cell) in line.bytes().enumerate() {
                let color = match cell {
                    b'#' => [255, 255, 255],
                    b'o' => [20, 20, 20],
                    _ => continue,
                };
                blend(x + column as i64, y + row as i64, color, 1.0);
            }
        }
    }

    /// Glide the pointer to `target` over `frames` frames.
    pub(super) fn move_to(&mut self, target: (f32, f32), frames: usize) -> Result<()> {
        let from = self.pointer;
        for step in 1..=frames {
            let t = step as f32 / frames as f32;
            let eased = t * t * (3.0 - 2.0 * t);
            self.pointer = (
                from.0 + (target.0 - from.0) * eased,
                from.1 + (target.1 - from.1) * eased,
            );
            self.session
                .pointer_move(self.pointer.0, self.pointer.1, self.pressed);
            self.frame()?;
        }
        Ok(())
    }

    pub(super) fn press(&mut self) {
        self.session.pointer_down(self.pointer.0, self.pointer.1);
        self.pressed = true;
    }

    pub(super) fn release(&mut self) {
        self.session.pointer_up(self.pointer.0, self.pointer.1);
        self.pressed = false;
    }

    pub(super) fn click(&mut self) -> Result<()> {
        self.press();
        self.hold(3)?;
        self.release();
        Ok(())
    }

    /// Scroll the page down by `distance` pixels over `frames` frames.
    pub(super) fn scroll(&mut self, distance: f32, frames: usize) -> Result<()> {
        let ease = |step: usize| {
            let t = step as f32 / frames as f32;
            t * t * (3.0 - 2.0 * t)
        };
        for step in 1..=frames {
            let delta = distance * (ease(step) - ease(step - 1));
            self.session
                .headless_win
                .dispatch_input(ui::PlatformInput::Scroll(ui::ScrollEvent {
                    position: point(px(self.pointer.0), px(self.pointer.1)),
                    delta: ui::ScrollDelta::Pixels(point(px(0.0), px(-delta))),
                    modifiers: ui::Modifiers::default(),
                    touch_phase: ui::TouchPhase::Moved,
                    source: ui::ScrollSource::Pointer,
                }));
            self.frame()?;
        }
        Ok(())
    }

    /// Glide to the middle of an element of the current frame and click it.
    pub(super) fn click_element(&mut self, id: &str, frames: usize) -> Result<()> {
        let target = element_center(&self.session.frame()?, id)?;
        self.move_to(target, frames)?;
        self.click()
    }

    /// Step the pointer aside, so it does not cover what it just clicked.
    pub(super) fn step_aside(&mut self, frames: usize) -> Result<()> {
        self.move_to((self.pointer.0 + 30.0, self.pointer.1 + 16.0), frames)
    }

    /// Type through the input handler, one character every `frames` frames.
    pub(super) fn type_text(&mut self, text: &str, frames: usize) -> Result<()> {
        for ch in text.chars() {
            self.session.type_text(ch.encode_utf8(&mut [0; 4]))?;
            self.hold(frames)?;
        }
        Ok(())
    }

    pub(super) fn key(&mut self, key: &str, command: bool, frames: usize) -> Result<()> {
        self.session.key(key, false, command);
        self.hold(frames)
    }

    /// The middle of the caret at `offset` in a block's text.
    pub(super) fn text_point(&self, block_id: &str, offset: usize) -> Result<(f32, f32)> {
        let at = self.session.caret(block_id, offset as u64)?;
        Ok((f32::from(at.x), f32::from(at.y)))
    }
}

/// Record a 60 fps full-product walkthrough: Page editing -> Edgeless switch ->
/// select/drag/rotate shape with live connector rerouting -> create shape, connector & brush ->
/// double-click inline IME label editing -> Undo/Redo -> Dark/Light theme toggle.
pub(super) fn record_authoring_demo(dir: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&dir)?;
    let session = start_headless_session(
        1280,
        800,
        PlaygroundOptions {
            theme: PlaygroundTheme::Light,
            ..Default::default()
        },
    )?;
    session.frame()?;
    let mut demo = DemoRecorder {
        session: &session,
        dir,
        frames: 0,
        pointer: (640.0, 400.0),
        pressed: false,
    };

    // 1. Page editing (~0.8s).
    demo.hold(12)?;
    let intro_end = session.plain_text("showcase-intro")?.encode_utf16().count();
    let (ix, iy) = demo.text_point("showcase-intro", intro_end)?;
    demo.move_to((ix + 16.0, iy), 10)?;
    demo.click()?;
    demo.type_text(" live!", 6)?;
    demo.hold(12)?;

    // 2. Smooth mode switch to Edgeless (~0.6s).
    let snap = session.frame()?;
    let (ex, ey) = element_center(&snap, "chrome.mode_switcher.edgeless")?;
    demo.move_to((ex, ey), 10)?;
    demo.click()?;
    demo.hold(24)?;

    // 3. Select & drag "collect" shape with live connector rerouting (~1.1s).
    let snap = session.frame()?;
    if let Ok((sx, sy)) = element_center(&snap, "edgeless.surface.collect") {
        demo.move_to((sx, sy), 12)?;
        demo.press();
        demo.move_to((sx + 70.0, sy - 35.0), 30)?;
        demo.release();
        demo.hold(15)?;
    }

    // 4. Rotate selected shape via top rotation handle (~0.8s).
    let snap = session.frame()?;
    if let Ok((rx, ry)) = element_center(&snap, "edgeless.handle.rotate") {
        demo.move_to((rx, ry), 10)?;
        demo.press();
        demo.move_to((rx + 48.0, ry + 18.0), 24)?;
        demo.release();
        demo.hold(12)?;
    }

    // 5. Frame clean open whiteboard space to the right (world x >= 1220) and draw a Diamond shape (~1.0s).
    session.update(|v, _, cx| {
        v.set_edgeless_camera(740.0, 140.0, 0.85, cx);
    })?;
    demo.hold(10)?;
    let snap = session.frame()?;
    if let Ok((tx, ty)) = element_center(&snap, "chrome.edgeless_toolbar.shape") {
        demo.move_to((tx, ty), 10)?;
        demo.click()?;
        demo.hold(6)?;
    }
    session.update(|v, w, cx| {
        v.edgeless_select_tool(
            playground::edgeless::EdgelessTool::Shape(
                blocksuite_playground_doc::read::ShapeType::Diamond,
            ),
            w,
            cx,
        );
    })?;
    demo.move_to((433.5, 137.0), 10)?;
    demo.press();
    demo.move_to((569.5, 239.0), 22)?;
    demo.release();
    demo.hold(12)?;

    // 6. Pick Connector tool and drag a port-snapped orthogonal connector from "review" to the Diamond (~1.0s).
    let snap = session.frame()?;
    if let Ok((cx_t, cy_t)) = element_center(&snap, "chrome.edgeless_toolbar.connector") {
        demo.move_to((cx_t, cy_t), 10)?;
        demo.click()?;
        demo.hold(6)?;
    }
    demo.move_to((343.0, 578.0), 10)?;
    demo.press();
    demo.move_to((501.5, 239.0), 22)?;
    demo.release();
    demo.hold(12)?;

    // 7. Pick Brush tool and draw a smooth freehand stroke in open canvas space (~1.0s).
    let snap = session.frame()?;
    if let Ok((bx, by)) = element_center(&snap, "chrome.edgeless_toolbar.brush") {
        demo.move_to((bx, by), 10)?;
        demo.click()?;
        demo.hold(6)?;
    }
    demo.move_to((442.0, 385.0), 8)?;
    demo.press();
    for step in 1..=24 {
        let t = step as f32 / 24.0;
        let x = 442.0 + t * 260.0;
        let y = 385.0 + (t * std::f32::consts::TAU).sin() * 34.0;
        demo.move_to((x, y), 1)?;
    }
    demo.release();
    demo.hold(12)?;

    // 8. Inline IME editing on "collect" shape label using bundled Inter glyphs (0 tofu boxes, ~1.2s).
    session.update(|v, w, cx| {
        v.edgeless_select_tool(playground::edgeless::EdgelessTool::Select, w, cx);
        v.edgeless_begin_inline_edit("collect", w, cx);
    })?;
    demo.hold(12)?;
    for pre in ["s", "sy", "syn", "sync"] {
        session.update(|v, w, cx| {
            v.replace_and_mark_text_in_range(None, pre, None, w, cx);
        })?;
        demo.hold(8)?;
    }
    session.update(|v, w, cx| {
        v.replace_text_in_range(None, " + synced", w, cx);
        v.edgeless_commit_inline_edit(w, cx);
    })?;
    demo.hold(16)?;

    // 9. Undo & Redo (~0.8s).
    demo.key("z", true, 16)?;
    demo.hold(14)?;
    session.key("z", true, true);
    demo.hold(18)?;

    // 10. Dark / Light theme toggle (~0.9s).
    let snap = session.frame()?;
    if let Ok((thx, thy)) = element_center(&snap, "chrome.theme_toggle") {
        demo.move_to((thx, thy), 10)?;
        demo.click()?;
        demo.hold(24)?;
        demo.click()?;
        demo.hold(18)?;
    }

    println!(
        "record-authoring-demo wrote {} frames at 60 fps",
        demo.frames
    );
    Ok(())
}

/// Record a walk through the page editor and its overlays at 60 fps into `dir` as
/// `frame-<n>.png`: typing with marks and a composition, a slash command, a mouse selection
/// formatted from the toolbar, the block controls, and undo. Every step is an input event
/// or an input-handler call, every frame is audited, and the document is checked on the way.
pub(super) fn record_demo(dir: PathBuf, theme: PlaygroundTheme) -> Result<()> {
    std::fs::create_dir_all(&dir)?;
    let session = start_headless_session(
        1280,
        800,
        PlaygroundOptions {
            theme,
            ..Default::default()
        },
    )?;
    session.frame()?;
    let flavour = |block: &str| -> Result<serde_json::Value> {
        Ok(session.doc_json()?["blocks"][block]["sys:flavour"].clone())
    };
    let prop = |block: &str, key: &str| -> Result<serde_json::Value> {
        Ok(session.doc_json()?["blocks"][block][key].clone())
    };
    let mut demo = DemoRecorder {
        session: &session,
        dir,
        frames: 0,
        pointer: (760.0, 420.0),
        pressed: false,
    };
    session.pointer_move(demo.pointer.0, demo.pointer.1, false);
    demo.hold(6)?;

    // A click after the introduction, a new paragraph, and text typed with a mark.
    demo.chapter("typing");
    let intro_end = session.plain_text("showcase-intro")?.encode_utf16().count();
    let (x, y) = demo.text_point("showcase-intro", intro_end)?;
    demo.move_to((x + 24.0, y), 16)?;
    demo.click()?;
    demo.hold(4)?;
    demo.key("enter", false, 6)?;
    let typed = session.selection()?.focus.block_id;
    demo.type_text("Typed ", 3)?;
    demo.key("b", true, 0)?;
    demo.type_text("natively", 3)?;
    demo.key("b", true, 0)?;
    demo.type_text(" ", 3)?;

    // A composition previews its text and writes it once on commit.
    demo.chapter("composition");
    let before_composition = prop(&typed, "prop:text")?;
    for preview in ["n", "ni", "nih", "nihao"] {
        session.update(|view, window, cx| {
            view.replace_and_mark_text_in_range(None, preview, None, window, cx)
        })?;
        demo.hold(5)?;
    }
    anyhow::ensure!(
        prop(&typed, "prop:text")? == before_composition,
        "a composition preview changed the document"
    );
    demo.hold(6)?;
    session.type_text("你好")?;
    demo.hold(8)?;

    // `/bul` filters the slash menu in the document, `Enter` turns the paragraph into a list.
    demo.chapter("slash menu");
    demo.key("enter", false, 6)?;
    demo.type_text("/", 12)?;
    demo.type_text("bul", 7)?;
    demo.hold(10)?;
    demo.key("enter", false, 8)?;
    let item = session.selection()?.focus.block_id;
    anyhow::ensure!(
        flavour(&item)? == "affine:list" && prop(&item, "prop:type")? == "bulleted",
        "the slash command did not make a bulleted list item"
    );
    demo.type_text("Slash menu", 3)?;
    demo.hold(6)?;

    // Dragging over text selects it; the toolbar makes it bold and links it.
    demo.chapter("formatting toolbar");
    let (start, end) = session.text_range("showcase-quote", "same document")?;
    let from = demo.text_point("showcase-quote", start)?;
    demo.move_to(from, 16)?;
    demo.press();
    demo.hold(2)?;
    let to = demo.text_point("showcase-quote", end)?;
    demo.move_to(to, 18)?;
    demo.release();
    demo.hold(12)?;
    demo.click_element("overlay.format_toolbar.bold", 10)?;
    demo.hold(8)?;
    demo.click_element("overlay.format_toolbar.link", 8)?;
    demo.hold(8)?;
    demo.type_text("affine.pro", 2)?;
    demo.hold(8)?;
    demo.key("enter", false, 12)?;
    let quote = prop("showcase-quote", "prop:text")?;
    let linked = quote
        .as_array()
        .and_then(|ops| ops.iter().find(|op| op["insert"] == "same document"))
        .context("the selection is not one formatted run")?;
    anyhow::ensure!(
        linked["attributes"]["bold"] == true
            && linked["attributes"]["link"] == "https://affine.pro",
        "the toolbar did not format the selection: {linked}"
    );

    // The block controls: a to-do box and a toggle, scrolled up from the fold first.
    demo.chapter("block controls");
    let below = element_center(&session.frame()?, "page.block.showcase-todo-open")?;
    demo.move_to(below, 10)?;
    demo.scroll(170.0, 14)?;
    demo.click_element("page.block.showcase-todo-open.checkbox", 8)?;
    demo.step_aside(6)?;
    demo.hold(6)?;
    anyhow::ensure!(
        prop("showcase-todo-open", "prop:checked")? == true,
        "the to-do box did not check"
    );
    demo.click_element("page.block.showcase-toggle-open.toggle", 8)?;
    demo.step_aside(6)?;
    demo.hold(14)?;
    anyhow::ensure!(
        prop("showcase-toggle-open", "prop:collapsed")? == true,
        "the toggle did not collapse"
    );

    // Each of them is one undo step.
    demo.chapter("undo");
    demo.key("z", true, 15)?;
    anyhow::ensure!(
        prop("showcase-toggle-open", "prop:collapsed")? != true,
        "undo did not expand the toggle"
    );
    demo.key("z", true, 15)?;
    anyhow::ensure!(
        prop("showcase-todo-open", "prop:checked")? != true,
        "undo did not clear the to-do box"
    );
    demo.key("z", true, 15)?;
    anyhow::ensure!(
        prop("showcase-quote", "prop:text")?
            .as_array()
            .is_some_and(|ops| ops.iter().all(|op| op["attributes"]["link"].is_null())),
        "undo did not remove the link"
    );
    demo.hold(12)?;
    println!(
        "Recorded {} frames at {DEMO_FPS} fps ({:.2} s)",
        demo.frames,
        demo.frames as f64 / f64::from(DEMO_FPS)
    );
    Ok(())
}

/// Capture a seven-second camera walkthrough on the same scheduler as the editor demo.
pub(super) fn record_edgeless_demo(dir: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&dir)?;
    let session = start_headless_session(1280, 800, Default::default())?;
    let mut demo = DemoRecorder {
        session: &session,
        dir,
        frames: 0,
        pointer: (600., 72.),
        pressed: false,
    };
    demo.hold(22)?;
    session.view(|v, cx| v.set_edgeless_camera(-30., -50., 1., cx))?;
    demo.click_element("chrome.mode_switcher.edgeless", 16)?;
    demo.hold(14)?;
    let mut start = (610., 324., 1_f32);
    for (end, frames) in [
        ((887., 550., 1.), 70),
        ((665., 590., 0.5), 72),
        ((984., 715., 2.), 96),
        ((845., 560., 1.), 74),
    ] {
        for frame in 1..=frames {
            let t = frame as f32 / frames as f32;
            let t = t * t * (3. - 2. * t);
            let x = start.0 + (end.0 - start.0) * t;
            let y = start.1 + (end.1 - start.1) * t;
            let zoom = start.2 * (end.2 / start.2).powf(t);
            session.view(|v, cx| {
                v.set_edgeless_camera(
                    x - 640. / zoom,
                    y - (800. - playground::TOPBAR_HEIGHT) * 0.5 / zoom,
                    zoom,
                    cx,
                )
            })?;
            demo.frame()?;
        }
        start = end;
    }
    demo.click_element("chrome.theme_toggle", 20)?;
    demo.hold(420 - demo.frames)
}
