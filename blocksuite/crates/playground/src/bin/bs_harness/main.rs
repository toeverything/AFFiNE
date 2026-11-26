mod bench;
mod demo;
mod fps;
mod probes;
mod render;
mod s3_evidence;
mod states;

use bench::run_bench;
use demo::{record_authoring_demo, record_demo, record_edgeless_demo};
use fps::{frame_interval, run_fps_check};
use probes::{render_editor, run_probes};
use render::{render_headless, render_rich_sample, render_surface_sample};
use states::{OverlayState, apply_overlay_state, run_audit_states};

use anyhow::{Context as _, Result, bail};
use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, ParagraphType},
};
use playground::{
    PlaygroundMode, PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    editor_session::{DocPoint, DocumentSelection},
    overlays::{ActiveSelection, OverlayEvent},
    register_bundled_fonts,
    room_client::DocState,
};
use std::cell::RefCell;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;
use ui::EntityInputHandler;
use ui::{
    Application, ApplicationHandle, Bounds, FrameSnapshot, HeadlessPlatform, HeadlessWindow,
    WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot, point, prelude::*, px, size,
};

pub(crate) struct HeadlessSession {
    pub(crate) platform: Rc<HeadlessPlatform>,
    pub(crate) app: ApplicationHandle,
    pub(crate) window_handle: WindowHandle<PlaygroundView>,
    pub(crate) headless_win: HeadlessWindow,
}

pub(crate) fn start_headless_session(
    width: u32,
    height: u32,
    options: PlaygroundOptions,
) -> Result<HeadlessSession> {
    let platform = HeadlessPlatform::new(width, height, 1.0);
    let init_cell: Rc<RefCell<Option<Result<WindowHandle<PlaygroundView>>>>> =
        Rc::new(RefCell::new(None));
    let init_out = init_cell.clone();

    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        let res = (|| -> Result<WindowHandle<PlaygroundView>> {
            register_bundled_fonts(cx).context("registering bundled fonts")?;
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(width as f32), px(height as f32)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| PlaygroundView::with_options(options, cx)),
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

impl HeadlessSession {
    pub(crate) fn view<R>(
        &self,
        f: impl FnOnce(&mut PlaygroundView, &mut ui::Context<PlaygroundView>) -> R,
    ) -> Result<R> {
        self.app
            .update(|cx| self.window_handle.update(cx, |view, _, cx| f(view, cx)))
    }

    /// Draw a frame through `Window::draw()` and read its element snapshot.
    pub(crate) fn frame(&self) -> Result<FrameSnapshot> {
        self.headless_win.request_frame();
        self.app.update(|cx| {
            self.window_handle
                .update(cx, |_, window, _| window.frame_snapshot().clone())
        })
    }

    pub(crate) fn overlay(&self, event: OverlayEvent) -> Result<()> {
        self.app.update(|cx| {
            self.window_handle.update(cx, |view, window, cx| {
                view.dispatch_overlay(event, window, cx);
            })
        })
    }

    /// Run what is queued, then let `millis` pass on the scheduler clock.
    pub(crate) fn settle(&self, millis: u64) {
        self.platform.run_until_parked();
        self.platform.advance_clock(Duration::from_millis(millis));
        self.platform.run_until_parked();
    }

    pub(crate) fn pointer_move(&self, x: f32, y: f32, pressed: bool) {
        self.headless_win
            .dispatch_input(ui::PlatformInput::MouseMove(ui::MouseMoveEvent {
                position: point(px(x), px(y)),
                pressed_button: pressed.then_some(ui::MouseButton::Left),
                modifiers: ui::Modifiers::default(),
            }));
        self.platform.run_until_parked();
    }

    pub(crate) fn pointer_down(&self, x: f32, y: f32) {
        self.headless_win
            .dispatch_input(ui::PlatformInput::MouseDown(ui::MouseDownEvent {
                button: ui::MouseButton::Left,
                position: point(px(x), px(y)),
                modifiers: ui::Modifiers::default(),
                click_count: 1,
                first_mouse: false,
            }));
        self.platform.run_until_parked();
    }

    pub(crate) fn pointer_up(&self, x: f32, y: f32) {
        self.headless_win
            .dispatch_input(ui::PlatformInput::MouseUp(ui::MouseUpEvent {
                button: ui::MouseButton::Left,
                position: point(px(x), px(y)),
                modifiers: ui::Modifiers::default(),
                click_count: 1,
            }));
        self.platform.run_until_parked();
    }

    /// Scroll the page so `block_id` sits `top` pixels below the top of the page viewport
    /// (as far as the page scrolls), and return the frame after it.
    pub(crate) fn scroll_block_to(&self, block_id: &str, top: f32) -> Result<FrameSnapshot> {
        let block_y = self
            .view(|view, _| {
                view.flow_layout()
                    .and_then(|layout| layout.block(block_id).map(|block| block.y))
            })?
            .with_context(|| format!("block {block_id} is not laid out"))?;
        let viewport = self.frame()?.viewport;
        let position = point(px(viewport.width / 2.0), px(viewport.height / 2.0));
        // Back to the top first, so the scroll below is absolute.
        for delta in [1_000_000.0, top - block_y] {
            self.headless_win
                .dispatch_input(ui::PlatformInput::Scroll(ui::ScrollEvent {
                    position,
                    delta: ui::ScrollDelta::Pixels(point(px(0.0), px(delta))),
                    modifiers: ui::Modifiers::default(),
                    touch_phase: ui::TouchPhase::Moved,
                    source: ui::ScrollSource::Pointer,
                }));
            self.platform.run_until_parked();
            self.frame()?;
        }
        self.frame()
    }

    /// Select the first occurrence of `needle` in a block's text.
    pub(crate) fn select_text(&self, block_id: &str, needle: &str) -> Result<()> {
        let (start, end) = self.text_range(block_id, needle)?;
        self.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
            block_id: block_id.to_string(),
            start_utf16: start,
            end_utf16: end,
        })))
    }

    /// The plain text of a paragraph or list block.
    pub(crate) fn plain_text(&self, block_id: &str) -> Result<String> {
        self.view(|view, _| {
            view.page_snapshot()
                .and_then(|snapshot| snapshot.block(block_id))
                .and_then(|node| match &node.content {
                    BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => {
                        Some(text.plain.clone())
                    }
                    _ => None,
                })
        })?
        .with_context(|| format!("block {block_id} has no text"))
    }

    /// The UTF-16 range of the first occurrence of `needle` in a block's text.
    pub(crate) fn text_range(&self, block_id: &str, needle: &str) -> Result<(usize, usize)> {
        let plain = self.plain_text(block_id)?;
        let at = plain
            .find(needle)
            .with_context(|| format!("{needle:?} is not in block {block_id}"))?;
        let start = plain[..at].encode_utf16().count();
        Ok((start, start + needle.encode_utf16().count()))
    }
}

pub(crate) fn element_center(snapshot: &FrameSnapshot, id: &str) -> Result<(f32, f32)> {
    let bounds = snapshot
        .elements
        .get(id)
        .with_context(|| format!("{id} missing from FrameSnapshot"))?
        .bounds;
    Ok((
        bounds.x + bounds.width * 0.5,
        bounds.y + bounds.height * 0.5,
    ))
}

impl HeadlessSession {
    pub(crate) fn update<R>(
        &self,
        f: impl FnOnce(&mut PlaygroundView, &mut ui::Window, &mut ui::Context<PlaygroundView>) -> R,
    ) -> Result<R> {
        self.app.update(|cx| self.window_handle.update(cx, f))
    }
    pub(crate) fn select(&self, block: &str, offset: u64) -> Result<()> {
        self.update(|v, w, cx| {
            let p = DocPoint::new(block, offset);
            v.select_document_range(
                DocumentSelection {
                    anchor: p.clone(),
                    focus: p,
                },
                w,
                cx,
            );
        })
    }
    pub(crate) fn type_text(&self, text: &str) -> Result<()> {
        self.update(|v, w, cx| v.replace_text_in_range(None, text, w, cx))
    }
    pub(crate) fn key(&self, key: &str, shift: bool, command: bool) {
        self.headless_win
            .dispatch_input(ui::PlatformInput::KeyDown(ui::KeyDownEvent {
                keystroke: ui::Keystroke {
                    key: key.into(),
                    key_char: None,
                    modifiers: ui::Modifiers {
                        shift,
                        platform: command,
                        control: command,
                        ..Default::default()
                    },
                },
                is_held: false,
                prefer_character_input: false,
            }));
    }
    pub(crate) fn caret(&self, id: &str, offset: u64) -> Result<ui::Point<ui::Pixels>> {
        self.update(|v, w, _| {
            let layout = v.flow_layout().context("page layout")?;
            let rect = layout
                .block(id)
                .context("caret block")?
                .caret_rect(DocPoint::new(id, offset).caret)
                .context("editable block")?;
            let column =
                playground::block_flow::page_geometry(f32::from(w.viewport_size().width)).column_x;
            Ok(point(
                px(column + rect.x),
                px(playground::TOPBAR_HEIGHT + rect.y + rect.h * 0.5 - v.scroll_offset()),
            ))
        })?
    }
    pub(crate) fn image(&self) -> Result<image::RgbaImage> {
        self.update(|_, w, _| w.render_to_image())?
    }
    pub(crate) fn doc_json(&self) -> Result<serde_json::Value> {
        Ok(self.update(|v, _, _| {
            v.document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap()
                .export_doc_json()
        })??)
    }
    pub(crate) fn selection(&self) -> Result<DocumentSelection> {
        self.update(|v, _, _| v.document_selection().cloned())?
            .context("active selection")
    }
    pub(crate) fn set_texts(&self, texts: &[&str]) -> Result<()> {
        let doc = probe_doc(texts.iter().copied())?;
        self.update(|v, _, cx| v.set_document(doc, cx))?;
        self.headless_win.request_frame();
        Ok(())
    }
}

pub(crate) fn probe_doc<'a>(texts: impl IntoIterator<Item = &'a str>) -> Result<DocState> {
    let mut doc = DocState::new("editing", 23)?;
    doc.workspace
        .create_page(playground::HOME_PAGE_ID, "Editing", 0)?;
    let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
    page.inner_mut()
        .begin_tx(y_octo::SessionTxOrigin::Untracked)?;
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "Editing".into(),
        },
        None,
        None,
        0,
    )?;
    page.add_block(
        "note",
        BlockSpec::Note { xywh: None },
        Some("root"),
        None,
        0,
    )?;
    for (i, text) in texts.into_iter().enumerate() {
        page.add_block(
            format!("p{i}"),
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: text.into(),
            },
            Some("note"),
            None,
            0,
        )?;
    }
    page.inner_mut().commit_tx()?;
    Ok(doc)
}

pub(crate) fn run_audit(snapshot_path: PathBuf) -> Result<()> {
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

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let Some(cmd) = args.next() else {
        bail!(
            "usage: bs-harness <render|render-surface-sample|render-rich-sample|render-editor|record-demo|record-edgeless-demo|record-authoring-demo|audit|audit-states|fps-check|probes|bench> [options]"
        );
    };

    match cmd.as_str() {
        "render" => {
            let mut out_png = PathBuf::from("frame.png");
            let mut out_snapshot = PathBuf::from("frame.json");
            let mut width = 1280_u32;
            let mut height = 800_u32;
            let mut click_edgeless = false;
            let mut zoom: Option<f32> = None;
            let mut pan: Option<(f32, f32)> = None;
            let mut state = OverlayState::Default;
            let mut options = PlaygroundOptions::default();
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
                    "--zoom" => {
                        zoom = Some(args.next().context("--zoom requires float")?.parse()?);
                    }
                    "--pan" => {
                        let raw = args.next().context("--pan requires <x>,<y>")?;
                        let (xs, ys) = raw
                            .split_once(',')
                            .context("--pan must be formatted as <x>,<y>")?;
                        pan = Some((xs.trim().parse()?, ys.trim().parse()?));
                    }
                    "--state" => {
                        let value = args.next().context("--state requires an overlay state")?;
                        state = OverlayState::parse(&value).with_context(|| {
                            let names: Vec<&str> =
                                OverlayState::ALL.iter().map(|state| state.name()).collect();
                            format!("unknown state {value:?} ({})", names.join("|"))
                        })?;
                    }
                    "--theme" => {
                        let value = args.next().context("--theme requires light|dark")?;
                        options.theme = PlaygroundTheme::parse(&value)
                            .with_context(|| format!("unknown theme {value:?} (light|dark)"))?;
                    }
                    "--mode" => {
                        let value = args.next().context("--mode requires page|edgeless")?;
                        options.mode = PlaygroundMode::parse(&value)
                            .with_context(|| format!("unknown mode {value:?} (page|edgeless)"))?;
                    }
                    other => bail!("unknown render flag: {other}"),
                }
            }
            render_headless(
                width,
                height,
                out_png,
                out_snapshot,
                click_edgeless,
                zoom,
                pan,
                state,
                options,
            )
        }
        "render-surface-sample" => render_surface_sample(args),
        "render-rich-sample" => render_rich_sample(args),
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
        "render-editor" => render_editor(
            args.next()
                .context("render-editor requires an output directory")?
                .into(),
        ),
        "render-s3-evidence" => s3_evidence::render_s3_evidence(&PathBuf::from(
            args.next()
                .context("render-s3-evidence requires an output directory")?,
        )),
        "record-edgeless-demo" => record_edgeless_demo(
            args.next()
                .context("record-edgeless-demo requires an output directory")?
                .into(),
        ),
        "record-authoring-demo" => record_authoring_demo(
            args.next()
                .context("record-authoring-demo requires an output directory")?
                .into(),
        ),
        "record-demo" => {
            let dir = args
                .next()
                .context("record-demo requires an output directory")?;
            let mut theme = PlaygroundTheme::Light;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--theme" => {
                        let value = args.next().context("--theme requires light|dark")?;
                        theme = PlaygroundTheme::parse(&value)
                            .with_context(|| format!("unknown theme {value:?} (light|dark)"))?;
                    }
                    other => bail!("unknown record-demo flag: {other}"),
                }
            }
            record_demo(dir.into(), theme)
        }
        "probes" => run_probes(),
        "audit-states" => run_audit_states(),
        "fps-check" => run_fps_check(),
        "bench" => {
            let mut out_json = PathBuf::from("perf-metrics.json");
            let mut explicit_commit = None;
            let mut web_wasm_raw = None;
            let mut web_wasm_gzip = None;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--json" => {
                        out_json = PathBuf::from(args.next().context("--json requires path")?)
                    }
                    "--commit" => {
                        explicit_commit = Some(args.next().context("--commit requires 40-hex SHA")?)
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
            run_bench(out_json, explicit_commit, web_wasm_raw, web_wasm_gzip)
        }
        other => bail!("unknown subcommand: {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::probes::{mouse, peer_of, receive};
    use super::*;

    #[test]
    fn every_overlay_state_audits_clean_in_both_themes_and_on_a_narrow_window() {
        run_audit_states().unwrap();
    }

    #[test]
    fn popovers_and_the_mode_switch_replay_identically_at_four_rates() {
        run_fps_check().unwrap();
    }

    #[test]
    fn markdown_and_clipboard_use_the_document_editor_and_undo_stack() -> Result<()> {
        use playground::clipboard::Slice;
        let s = start_headless_session(800, 600, Default::default())?;
        for (prefix, flavour, kind) in [
            ("# ", "affine:paragraph", "h1"),
            ("###### ", "affine:paragraph", "h6"),
            ("> ", "affine:paragraph", "quote"),
            ("* ", "affine:list", "bulleted"),
            ("2. ", "affine:list", "numbered"),
            ("[x] ", "affine:list", "todo"),
            ("```rust ", "affine:code", ""),
            ("--- ", "affine:divider", ""),
        ] {
            s.set_texts(&[""])?;
            s.select("p0", 0)?;
            s.headless_win.request_frame();
            s.type_text(prefix)?;
            let json = s.doc_json()?;
            let block =
                &json["blocks"][json["blocks"]["note"]["sys:children"][0].as_str().unwrap()];
            assert_eq!(block["sys:flavour"], flavour, "{prefix}");
            if !kind.is_empty() {
                assert_eq!(block["prop:type"], kind, "{prefix}");
            }
            s.key("z", false, true);
            assert_eq!(
                s.doc_json()?["blocks"]["p0"]["sys:flavour"],
                "affine:paragraph"
            );
        }
        for delimiter in ["enter", "space"] {
            s.set_texts(&[""])?;
            s.select("p0", 0)?;
            s.headless_win.request_frame();
            for ch in "```rust".chars() {
                s.type_text(&ch.to_string())?;
            }
            if delimiter == "enter" {
                s.key("enter", false, false);
            } else {
                s.type_text(" ")?;
            }
            let json = s.doc_json()?;
            let block =
                &json["blocks"][json["blocks"]["note"]["sys:children"][0].as_str().unwrap()];
            assert_eq!(block["prop:language"], "rust");
            assert_eq!(block["prop:text"], serde_json::json!([]));
        }
        s.set_texts(&[""])?;
        s.select("p0", 0)?;
        s.headless_win.request_frame();
        for ch in "`code`".chars() {
            s.type_text(&ch.to_string())?;
        }
        assert_eq!(
            s.doc_json()?["blocks"]["p0"]["prop:text"],
            serde_json::json!([{"insert":"`code`"}])
        );
        s.key("enter", false, false);
        assert_eq!(
            s.doc_json()?["blocks"]["p0"]["prop:text"],
            serde_json::json!([{"insert":"code","attributes":{"code":true}}])
        );
        s.set_texts(&[""])?;
        s.select("p0", 0)?;
        s.headless_win.request_frame();
        let slice = Slice::from_html(
            "<h3><em>Hello</em></h3><ol><li>World</li></ol><pre><code>x\ny</code></pre>",
        )
        .unwrap();
        s.update(|v, w, cx| v.paste(slice.item(), w, cx))?;
        let json = s.doc_json()?;
        let blocks = &json["blocks"];
        let ids = blocks["note"]["sys:children"].as_array().unwrap();
        assert_eq!(ids.len(), 3);
        assert_eq!(blocks["p0"]["prop:type"], "h3");
        assert_eq!(blocks["p0"]["prop:text"][0]["attributes"]["italic"], true);
        assert_eq!(blocks[ids[1].as_str().unwrap()]["prop:type"], "numbered");
        assert_eq!(
            blocks[ids[2].as_str().unwrap()]["prop:text"][0]["insert"],
            "x\ny"
        );
        s.key("z", false, true);
        s.headless_win.request_frame();
        assert_eq!(
            s.doc_json()?["blocks"]["note"]["sys:children"],
            serde_json::json!(["p0"])
        );
        Ok(())
    }

    #[test]
    fn composing_over_a_directional_range_changes_only_the_preview_until_commit() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        for reverse in [false, true] {
            s.set_texts(&["one", "middle", "end"])?;
            let original = s.doc_json()?;
            let (a, b) = if reverse { ("p2", "p0") } else { ("p0", "p2") };
            mouse(&s, a, 1, 1, false)?;
            mouse(&s, b, 1, 1, true)?;
            let range = s.selection()?;
            for cancel_with_commit in [false, true] {
                s.update(|v, w, cx| {
                    v.replace_and_mark_text_in_range(Some(1..1), "ni", None, w, cx)
                })?;
                s.headless_win.request_frame();
                assert_eq!(s.doc_json()?, original);
                s.update(|v, w, cx| {
                    let layout = v.flow_layout().unwrap();
                    assert_eq!(layout.block("p0").unwrap().body.plain, "onind");
                    assert!(layout.block("p1").is_none() && layout.block("p2").is_none());
                    assert_eq!(v.marked_text_range(w, cx), Some(1..3));
                    if cancel_with_commit {
                        v.replace_text_in_range(None, "", w, cx);
                    } else {
                        v.replace_and_mark_text_in_range(None, "", None, w, cx);
                    }
                    assert!(v.marked_text_range(w, cx).is_none());
                    assert!(
                        !v.document()
                            .workspace
                            .page(playground::HOME_PAGE_ID)
                            .unwrap()
                            .can_undo()
                    );
                })?;
                assert_eq!(s.selection()?, range);
                assert_eq!(s.doc_json()?, original);
            }
            s.update(|v, w, cx| {
                v.replace_and_mark_text_in_range(Some(1..1), "nihao", None, w, cx)
            })?;
            s.headless_win.request_frame();
            s.type_text("你好")?;
            assert_eq!(
                s.doc_json()?["blocks"]["p0"]["prop:text"][0]["insert"],
                "o你好nd"
            );
            s.key("z", false, true);
            assert_eq!(s.doc_json()?, original);
            assert_eq!(s.selection()?, range);
        }
        Ok(())
    }

    #[test]
    fn typing_inherits_marks_with_explicit_overrides_and_unmarked_edges() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        for (key, offset, toggle, ime, expected) in [
            ("bold", 1, false, false, true),
            ("bold", 1, false, true, true),
            ("bold", 1, true, false, false),
            ("bold", 0, false, false, false),
            ("link", 1, false, false, true),
            ("link", 2, false, true, false),
            ("code", 1, false, false, true),
            ("code", 2, false, false, false),
        ] {
            let mut doc = probe_doc(["ab"])?;
            let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
            let value = if key == "link" {
                y_octo::Any::String("https://example.org".into())
            } else {
                y_octo::Any::True
            };
            page.format_text(
                "p0",
                "prop:text",
                0,
                2,
                y_octo::TextAttributes::from([(key.into(), value.clone())]),
                1,
            )?;
            s.update(|v, _, cx| v.set_document(doc, cx))?;
            s.headless_win.request_frame();
            s.select("p0", offset)?;
            if toggle {
                s.key("b", false, true);
            }
            if ime {
                s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, "x", None, w, cx))?;
            }
            s.type_text("X")?;
            let json = s.doc_json()?;
            let run = json["blocks"]["p0"]["prop:text"]
                .as_array()
                .unwrap()
                .iter()
                .find(|v| v["insert"].as_str().unwrap().contains('X'))
                .unwrap();
            assert_eq!(
                run["attributes"].get(key).is_some(),
                expected,
                "{key} {offset} {toggle} {ime}"
            );
        }
        Ok(())
    }

    #[test]
    fn joining_into_a_nested_endpoint_preserves_later_subtrees() -> Result<()> {
        use playground::clipboard::Slice;
        let s = start_headless_session(800, 600, Default::default())?;
        let mut doc = probe_doc(["Ax", "B"])?;
        let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
        for (id, parent) in [("B1", "p1"), ("B2", "p1"), ("B2a", "B2"), ("B3", "p1")] {
            page.add_block(
                id,
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: id.into(),
                },
                Some(parent),
                None,
                1,
            )?;
        }
        s.update(|v, _, cx| v.set_document(doc, cx))?;
        s.headless_win.request_frame();
        let original = s.doc_json()?;
        mouse(&s, "p0", 1, 1, false)?;
        mouse(&s, "B1", 1, 1, true)?;
        let selection = s.selection()?;
        s.key("c", false, true);
        let item = s
            .update(|_, _, cx| cx.read_from_clipboard())?
            .context("copied items")?;
        let slice = Slice::from_item(&item).context("rich slice")?;
        assert_eq!(slice.content.len(), 2);
        assert_eq!(slice.content[0].id, "p0");
        assert_eq!(slice.content[1].id, "p1");
        assert_eq!(slice.content[1].children.len(), 1);
        assert_eq!(slice.content[1].children[0].id, "B1");
        assert!(slice.content[1].children[0].children.is_empty());
        s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, "ni", None, w, cx))?;
        s.headless_win.request_frame();
        s.update(|v, w, cx| {
            let layout = v.flow_layout().unwrap();
            let ids: Vec<_> = layout.blocks.iter().map(|b| b.block_id.as_str()).collect();
            assert_eq!(ids, ["root", "p0", "B2", "B2a", "B3"]);
            v.replace_text_in_range(None, "", w, cx);
        })?;
        assert_eq!(s.doc_json()?, original);
        s.key("backspace", false, false);
        let blocks = &s.doc_json()?["blocks"];
        assert_eq!(blocks["p0"]["prop:text"][0]["insert"], "A1");
        assert_eq!(
            blocks["p0"]["sys:children"],
            serde_json::json!(["B2", "B3"])
        );
        assert_eq!(blocks["B2"]["sys:children"], serde_json::json!(["B2a"]));
        assert_eq!(blocks["note"]["sys:children"], serde_json::json!(["p0"]));
        s.key("z", false, true);
        assert_eq!(s.doc_json()?, original);
        assert_eq!(s.selection()?, selection);
        Ok(())
    }

    #[test]
    fn markdown_list_order_starts_at_the_typed_number_and_stays_local() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        s.set_texts(&["Above", "", "Below"])?;
        s.select("p1", 0)?;
        s.type_text("5. ")?;
        let first = s.selection()?.focus.block_id;
        assert_eq!(s.doc_json()?["blocks"][&first]["prop:order"], 5);
        s.type_text("item")?;
        s.key("enter", false, false);
        let second = s.selection()?.focus.block_id;
        assert_eq!(s.doc_json()?["blocks"][&second]["prop:order"], 6);
        for id in ["p0", "p2"] {
            s.select(id, 1)?;
            s.key("enter", false, false);
            let blocks = &s.doc_json()?["blocks"];
            assert_eq!(blocks[&first]["prop:order"], 5);
            assert_eq!(blocks[&second]["prop:order"], 6);
        }
        Ok(())
    }

    fn text_block(id: &str, kind: ParagraphType) -> BlockSpec {
        BlockSpec::Paragraph {
            paragraph_type: kind,
            text: id.to_owned(),
        }
    }

    fn select_across(s: &HeadlessSession, start: &str, end: &str) -> Result<()> {
        s.update(|v, w, cx| {
            v.select_document_range(
                DocumentSelection {
                    anchor: DocPoint::new(start, 1),
                    focus: DocPoint::new(end, 1),
                },
                w,
                cx,
            )
        })
    }

    #[test]
    fn collapsed_endpoint_children_survive_preview_and_delete() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        let mut doc = probe_doc(["A"])?;
        let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
        page.add_block(
            "T",
            BlockSpec::List {
                list_type: blocksuite_playground_doc::schema::ListType::Toggle,
                text: "Toggle".into(),
                checked: false,
                order: None,
            },
            Some("note"),
            None,
            0,
        )?;
        page.set_block_prop(
            "T",
            "prop:collapsed",
            y_octo::SessionValue::Any(y_octo::Any::True),
            0,
        )?;
        for id in ["T1", "T2"] {
            page.add_block(id, text_block(id, ParagraphType::Text), Some("T"), None, 0)?;
        }
        s.update(|v, _, cx| v.set_document(doc, cx))?;
        s.headless_win.request_frame();
        let original = s.doc_json()?;
        select_across(&s, "p0", "T")?;
        s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, "ni", None, w, cx))?;
        s.headless_win.request_frame();
        s.update(|v, w, cx| {
            let l = v.flow_layout().unwrap();
            assert_eq!(
                l.blocks
                    .iter()
                    .map(|b| b.block_id.as_str())
                    .collect::<Vec<_>>(),
                ["root", "p0", "T1", "T2"]
            );
            v.replace_text_in_range(None, "", w, cx);
        })?;
        assert_eq!(s.doc_json()?, original);
        s.key("backspace", false, false);
        assert_eq!(
            s.doc_json()?["blocks"]["p0"]["sys:children"],
            serde_json::json!(["T1", "T2"])
        );
        s.key("z", false, true);
        assert_eq!(s.doc_json()?, original);
        Ok(())
    }

    #[test]
    fn cut_includes_a_hidden_sibling_before_the_endpoint() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        let mut doc = probe_doc(["Aa", "B"])?;
        let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
        for (id, kind) in [
            ("H", ParagraphType::H1),
            ("X", ParagraphType::Text),
            ("E", ParagraphType::H1),
            ("S", ParagraphType::Text),
        ] {
            page.add_block(id, text_block(id, kind), Some("p1"), None, 0)?;
        }
        page.set_block_prop(
            "H",
            "prop:collapsed",
            y_octo::SessionValue::Any(y_octo::Any::True),
            0,
        )?;
        s.update(|v, _, cx| v.set_document(doc, cx))?;
        s.headless_win.request_frame();
        assert!(s.update(|v, _, _| v.flow_layout().unwrap().block("X").is_none())?);
        let original = s.doc_json()?;
        select_across(&s, "p0", "E")?;
        s.key("x", false, true);
        let cut = s.doc_json()?;
        assert!(cut["blocks"].get("X").is_none());
        assert_eq!(
            cut["blocks"]["p0"]["sys:children"],
            serde_json::json!(["S"])
        );
        let item = s
            .update(|_, _, cx| cx.read_from_clipboard())?
            .context("cut clipboard")?;
        let slice = playground::clipboard::Slice::from_item(&item).context("cut slice")?;
        assert_eq!(
            slice.content[1]
                .children
                .iter()
                .map(|b| b.id.as_str())
                .collect::<Vec<_>>(),
            ["H", "X", "E"]
        );
        s.key("v", false, true);
        let pasted = s.doc_json()?;
        let blocks = &pasted["blocks"];
        let parent = blocks["note"]["sys:children"][1].as_str().unwrap();
        let restored = blocks[parent]["sys:children"][1].as_str().unwrap();
        assert_eq!(
            blocks[restored]["prop:text"],
            original["blocks"]["X"]["prop:text"]
        );
        s.key("z", false, true);
        assert_eq!(s.doc_json()?, cut);
        s.key("z", false, true);
        assert_eq!(s.doc_json()?, original);
        Ok(())
    }

    #[test]
    fn page_title_and_cross_note_cuts_preserve_page_containers() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        let mut doc = probe_doc(["One"])?;
        let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
        page.add_block("surface", BlockSpec::Surface, Some("root"), Some(0), 0)?;
        for (note, id) in [
            ("canvas", "canvas-text"),
            ("hidden", "hidden-text"),
            ("note2", "Two"),
        ] {
            page.add_block(note, BlockSpec::Note { xywh: None }, Some("root"), None, 0)?;
            page.add_block(id, text_block(id, ParagraphType::Text), Some(note), None, 0)?;
        }
        page.set_block_prop(
            "canvas",
            "prop:displayMode",
            y_octo::SessionValue::Any(y_octo::Any::String("edgeless".into())),
            0,
        )?;
        page.set_block_prop(
            "hidden",
            "prop:hidden",
            y_octo::SessionValue::Any(y_octo::Any::True),
            0,
        )?;
        s.update(|v, _, cx| v.set_document(doc, cx))?;
        s.headless_win.request_frame();
        let original = s.doc_json()?;
        for (start, end) in [("root", "p0"), ("p0", "Two")] {
            select_across(&s, start, end)?;
            s.key("x", false, true);
            let cut = s.doc_json()?;
            for id in ["surface", "canvas", "canvas-text", "hidden", "hidden-text"] {
                assert_eq!(cut["blocks"][id], original["blocks"][id]);
            }
            assert_eq!(
                cut["blocks"]["root"]["sys:children"],
                serde_json::json!(["surface", "note", "canvas", "hidden", "note2"])
            );
            for note in ["note", "note2"] {
                assert_eq!(cut["blocks"][note]["sys:id"], note);
            }
            let item = s.update(|_, _, cx| cx.read_from_clipboard())?.unwrap();
            let slice = playground::clipboard::Slice::from_item(&item).unwrap();
            assert_eq!(
                slice
                    .content
                    .iter()
                    .map(|b| b.id.as_str())
                    .collect::<Vec<_>>(),
                [start, end]
            );
            assert!(slice.content.iter().all(|b| b.children.is_empty()));
            s.key("z", false, true);
            assert_eq!(s.doc_json()?, original);
        }
        Ok(())
    }

    #[test]
    fn code_range_lifts_following_subtrees_as_siblings() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        let mut doc = probe_doc(["B", "C"])?;
        let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
        page.add_block(
            "A",
            BlockSpec::Code {
                text: "Code".into(),
                language: None,
                caption: String::new(),
            },
            Some("note"),
            Some(0),
            0,
        )?;
        for id in ["B1", "B2"] {
            page.add_block(id, text_block(id, ParagraphType::Text), Some("p0"), None, 0)?;
        }
        s.update(|v, _, cx| v.set_document(doc, cx))?;
        s.headless_win.request_frame();
        let original = s.doc_json()?;
        select_across(&s, "A", "B1")?;
        s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, "x", None, w, cx))?;
        s.headless_win.request_frame();
        s.update(|v, w, cx| {
            let l = v.flow_layout().unwrap();
            assert_eq!(l.block("B2").unwrap().x, l.block("p1").unwrap().x);
            v.replace_text_in_range(None, "", w, cx);
        })?;
        s.key("backspace", false, false);
        let cut = s.doc_json()?;
        assert_eq!(
            cut["blocks"]["note"]["sys:children"],
            serde_json::json!(["A", "B2", "p1"])
        );
        assert_eq!(cut["blocks"]["A"]["sys:children"], serde_json::json!([]));
        s.key("z", false, true);
        assert_eq!(s.doc_json()?, original);
        Ok(())
    }

    #[test]
    fn zero_based_markdown_and_list_only_order_correction() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        s.set_texts(&["Item", "Break", "Later"])?;
        s.select("p0", 0)?;
        s.type_text("0. ")?;
        let first = s.selection()?.focus.block_id;
        let numbered = s.doc_json()?;
        assert_eq!(numbered["blocks"][&first]["prop:type"], "numbered");
        assert_eq!(numbered["blocks"][&first]["prop:order"], 0);
        s.select(&first, 4)?;
        s.key("enter", false, false);
        let second = s.selection()?.focus.block_id;
        assert_eq!(s.doc_json()?["blocks"][&first]["prop:order"], 1);
        assert_eq!(s.doc_json()?["blocks"][&second]["prop:order"], 2);
        s.select("p2", 0)?;
        s.type_text("5. ")?;
        let fifth = s.selection()?.focus.block_id;
        s.select(&fifth, 5)?;
        s.key("enter", false, false);
        let sixth = s.selection()?.focus.block_id;
        s.select("p1", 0)?;
        s.key("tab", false, false);
        let indented = s.doc_json()?;
        assert_eq!(
            indented["blocks"][&second]["sys:children"],
            serde_json::json!(["p1"])
        );
        assert_eq!(indented["blocks"][&fifth]["prop:order"], 5);
        assert_eq!(indented["blocks"][&sixth]["prop:order"], 6);
        s.set_texts(&["One", "Two", "Three"])?;
        let mut ids = Vec::new();
        for id in ["p0", "p1", "p2"] {
            s.select(id, 0)?;
            s.type_text("1. ")?;
            ids.push(s.selection()?.focus.block_id);
        }
        s.select(&ids[1], 0)?;
        s.key("backspace", false, false);
        assert_eq!(s.doc_json()?["blocks"][&ids[2]]["prop:order"], 3);
        assert_eq!(
            s.doc_json()?["blocks"][&s.selection()?.focus.block_id]["sys:flavour"],
            "affine:paragraph"
        );
        Ok(())
    }

    #[test]
    fn paste_preserves_concurrent_suffix_deletion_and_relative_positions() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        s.set_texts(&["abcd"])?;
        s.select("p0", 1)?;
        let mut peer = peer_of(&s)?;
        let suffix = peer.capture_selection_snapshot("p0", 1, "p0", 3)?;
        let initial = peer.encode_state_vector_v1()?;
        let remote = peer
            .remove_text("p0", "prop:text", 2, 1, 1)?
            .unwrap()
            .update;
        s.update(|v, w, cx| v.paste(ui::ClipboardItem::new_string("X".into()), w, cx))?;
        let local = s.update(|v, _, _| {
            v.document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap()
                .encode_diff_v1(&initial)
        })??;
        receive(&s, &remote)?;
        peer.apply_remote_update_v1(&local)?;
        assert_eq!(s.doc_json()?, peer.export_doc_json()?);
        assert_eq!(peer.read_editable_text("p0")?.0.plain, "aXbd");
        let pos = peer.resolve_selection_snapshot(&suffix)?.unwrap();
        assert_eq!((pos.anchor.1, pos.focus.1), (2, 3));
        assert_eq!(
            s.update(|v, _, _| v
                .document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap()
                .resolve_selection_snapshot(&suffix))??,
            Some(pos)
        );
        Ok(())
    }

    #[test]
    fn typing_and_ime_after_a_reference_leave_exactly_one_chip() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        for (input, ime) in [(" ", false), ("好", true)] {
            let mut doc = probe_doc([" "])?;
            let reference = serde_json::json!({"type":"LinkedPage","pageId":"dest"});
            let attrs = y_octo::TextAttributes::from([(
                "reference".into(),
                serde_json::from_value(reference.clone())?,
            )]);
            doc.workspace
                .page_mut(playground::HOME_PAGE_ID)
                .unwrap()
                .format_text("p0", "prop:text", 0, 1, attrs, 1)?;
            s.update(|v, _, cx| v.set_document(doc, cx))?;
            s.headless_win.request_frame();
            s.select("p0", 1)?;
            if ime {
                s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, "hao", None, w, cx))?;
            }
            s.type_text(input)?;
            assert_eq!(
                s.doc_json()?["blocks"]["p0"]["prop:text"],
                serde_json::json!([{"insert":" ","attributes":{"reference":reference}},{"insert":input}])
            );
        }
        Ok(())
    }

    #[test]
    fn image_survives_cross_block_cut_paste_and_undo() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        let mut doc = probe_doc(["one", "end"])?;
        let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
        page.add_block(
            "pic",
            BlockSpec::Image {
                source_id: "digest".into(),
                caption: "caption".into(),
                width: 80.,
                height: 40.,
                xywh: Some("[1,2,80,40]".into()),
            },
            Some("note"),
            Some(1),
            1,
        )?;
        let shared_text = |text: &str| {
            y_octo::SessionValue::Text(vec![y_octo::TextDeltaOp::Insert {
                insert: y_octo::TextInsert::Text(text.into()),
                format: None,
            }])
        };
        page.add_raw_block(
            "vendor",
            "custom:widget",
            4,
            vec![
                ("prop:caption".into(), shared_text("Caption")),
                (
                    "prop:meta".into(),
                    y_octo::SessionValue::Map(vec![("label".into(), shared_text("Label"))]),
                ),
            ],
            Some("pic"),
            None,
            2,
        )?;
        s.update(|v, _, cx| v.set_document(doc, cx))?;
        s.headless_win.request_frame();
        let original = s.doc_json()?;
        s.update(|v, w, cx| {
            v.select_document_range(
                DocumentSelection {
                    anchor: DocPoint::new("p0", 1),
                    focus: DocPoint::new("p1", 1),
                },
                w,
                cx,
            )
        })?;
        s.key("x", false, true);
        s.headless_win.request_frame();
        let cut = s.doc_json()?;
        assert!(cut["blocks"].get("pic").is_none());
        let item = s
            .update(|_, _, cx| cx.read_from_clipboard())?
            .context("cut clipboard item")?;
        let slice = playground::clipboard::Slice::from_item(&item).context("snapshot")?;
        let html =
            playground::clipboard::Slice::from_html(&slice.html()).context("HTML snapshot")?;
        assert_eq!(slice, html);
        s.update(|v, w, cx| v.paste(html.item(), w, cx))?;
        s.headless_win.request_frame();
        let restored = s.doc_json()?;
        let ids = restored["blocks"]["note"]["sys:children"]
            .as_array()
            .unwrap();
        assert_eq!(ids.len(), 3);
        let image = &restored["blocks"][ids[1].as_str().unwrap()];
        for key in [
            "sys:flavour",
            "sys:version",
            "prop:sourceId",
            "prop:caption",
            "prop:width",
            "prop:height",
            "prop:xywh",
        ] {
            assert_eq!(image[key], original["blocks"]["pic"][key], "{key}");
        }
        let custom_id = image["sys:children"][0].as_str().unwrap();
        let nested = &restored["blocks"][custom_id];
        assert_eq!(nested["sys:flavour"], "custom:widget");
        assert_eq!(nested["sys:version"], 4);
        let mut replica = peer_of(&s)?;
        let block = y_octo::TypePath::root("blocks").key(custom_id);
        for (parent, key, expected) in [
            (block.clone(), "prop:caption", "Caption"),
            (block.key("prop:meta"), "label", "Label"),
        ] {
            let value = replica
                .inner()
                .get_map_value(&y_octo::TypeTarget::Path(parent), key)?;
            let Some(y_octo::SessionReadValue::Text(identity)) = value else {
                panic!("expected shared text at {key}")
            };
            let target = y_octo::TypeTarget::Identity(identity);
            replica.inner_mut().text_insert(&target, 0, "!")?;
            assert_eq!(
                replica.inner().read_text_string(&target)?,
                format!("!{expected}")
            );
        }
        s.key("z", false, true);
        assert_eq!(s.doc_json()?, cut);
        s.key("z", false, true);
        assert_eq!(s.doc_json()?, original);
        Ok(())
    }

    #[test]
    fn multiline_paste_into_a_title_without_a_visible_note_preserves_peer_and_undo() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        let mut doc = probe_doc(["hidden"])?;
        let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
        page.inner_mut()
            .begin_tx(y_octo::SessionTxOrigin::Untracked)?;
        page.set_block_prop(
            "note",
            "prop:hidden",
            y_octo::SessionValue::Any(y_octo::Any::True),
            1,
        )?;
        page.inner_mut().commit_tx()?;
        s.update(|v, _, cx| v.set_document(doc, cx))?;
        s.headless_win.request_frame();
        s.select("root", 2)?;
        let peer = peer_of(&s)?;
        let before = peer.export_doc_json()?;
        let vector = peer.encode_state_vector_v1()?;
        let original_diff = s.update(|v, _, _| {
            v.document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap()
                .encode_diff_v1(&vector)
        })??;
        s.update(|v, w, cx| v.paste(ui::ClipboardItem::new_string("A\nB".into()), w, cx))?;
        assert_eq!(s.doc_json()?, before);
        s.update(|v, _, _| {
            let page = v
                .document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap();
            assert!(!page.can_undo());
            assert_eq!(page.encode_diff_v1(&vector).unwrap(), original_diff);
        })?;
        Ok(())
    }

    #[test]
    fn title_edits_paste_merge_and_history_update_workspace_metadata() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        s.set_texts(&["body"])?;
        let title = || {
            s.update(|v, _, _| {
                v.document().workspace.list_pages().unwrap()[0]
                    .title
                    .clone()
            })
        };
        s.select("root", 7)?;
        s.type_text("!")?;
        assert_eq!(title()?, "Editing!");
        s.update(|v, w, cx| v.paste(ui::ClipboardItem::new_string(" X".into()), w, cx))?;
        assert_eq!(title()?, "Editing! X");
        s.select("p0", 0)?;
        s.key("backspace", false, false);
        assert_eq!(title()?, "Editing! Xbody");
        assert_eq!(
            s.doc_json()?["blocks"]["note"]["sys:children"],
            serde_json::json!(["p0"])
        );
        s.key("z", false, true);
        assert_eq!(title()?, "Editing! X");
        s.key("z", true, true);
        assert_eq!(title()?, "Editing! Xbody");
        Ok(())
    }

    #[test]
    fn divider_and_fence_keep_trailing_text_and_place_children_at_the_right_level() -> Result<()> {
        let s = start_headless_session(800, 600, Default::default())?;
        for trigger in ["---", "***", "___", "```c++"] {
            let mut doc = probe_doc(["suffix"])?;
            let page = doc.workspace.page_mut(playground::HOME_PAGE_ID).unwrap();
            page.add_block(
                "child",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "nested".into(),
                },
                Some("p0"),
                None,
                1,
            )?;
            s.update(|v, _, cx| v.set_document(doc, cx))?;
            s.headless_win.request_frame();
            s.select("p0", 0)?;
            s.type_text(trigger)?;
            assert_eq!(
                s.doc_json()?["blocks"]["p0"]["sys:flavour"],
                "affine:paragraph"
            );
            s.type_text(" ")?;
            let json = s.doc_json()?;
            let b = &json["blocks"];
            let ids = b["note"]["sys:children"].as_array().unwrap();
            let new = ids[0].as_str().unwrap();
            if trigger.starts_with('`') {
                assert_eq!(b[new]["sys:flavour"], "affine:code");
                assert_eq!(b[new]["prop:language"], "c++");
                assert_eq!(
                    b[ids[1].as_str().unwrap()]["prop:text"][0]["insert"],
                    "suffix"
                );
                assert_eq!(ids[2], "child");
                assert!(b.get("p0").is_none());
                assert_eq!(s.selection()?.focus, DocPoint::new(new, 0));
            } else {
                assert_eq!(b[new]["sys:flavour"], "affine:divider");
                assert_eq!(ids[1], "p0");
                assert_eq!(b["p0"]["sys:children"], serde_json::json!(["child"]));
                assert_eq!(s.selection()?.focus, DocPoint::new("p0", 0));
            }
            s.key("z", false, true);
            assert_eq!(
                s.doc_json()?["blocks"]["note"]["sys:children"],
                serde_json::json!(["p0"])
            );
        }
        Ok(())
    }

    #[test]
    fn document_editing_probes() {
        run_probes().unwrap();
    }
    #[test]
    fn rich_sample_writes_two_reproducible_pngs() {
        let dir = tempfile::tempdir().unwrap();
        let plain = dir.path().join("plain.png");
        let rich = dir.path().join("rich.png");
        let render = || {
            render_rich_sample(
                [
                    "--out-plain".to_owned(),
                    plain.display().to_string(),
                    "--out-rich".to_owned(),
                    rich.display().to_string(),
                ]
                .into_iter(),
            )
            .unwrap();
            [
                std::fs::read(&plain).unwrap(),
                std::fs::read(&rich).unwrap(),
            ]
        };
        let images = render();
        assert_ne!(images[0], images[1]);
        for bytes in &images {
            let frame =
                image::load_from_memory_with_format(bytes, image::ImageFormat::Png).unwrap();
            assert_eq!((frame.width(), frame.height()), (808, 210));
        }
        assert_eq!(images, render());
    }
}
