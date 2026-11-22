use anyhow::{Context as _, Result, bail};
use blocksuite_playground_doc::{
    client_id_from_seed,
    read::BlockContent,
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
    wire::{DocMessage, RoomBinaryFrame, decode_binary_frame, encode_binary_frame},
};
use playground::{
    PlaygroundMode, PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    overlays::{ActiveSelection, FormatAction, OverlayEvent},
    register_bundled_fonts,
};
use playground::{
    editor_session::{DocPoint, DocumentSelection},
    room_client::DocState,
};
use serde::Serialize;
use std::cell::RefCell;
use std::path::PathBuf;
use std::process::Command;
use std::rc::Rc;
use std::time::{Duration, UNIX_EPOCH};
use ui::EntityInputHandler;
use ui::{
    Application, ApplicationHandle, Bounds, FrameSnapshot, HeadlessPlatform, HeadlessWindow,
    WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot, point, prelude::*, px, size,
};

#[derive(Serialize)]
struct TimingStat {
    median: f64,
    p95: f64,
}

#[derive(Default, Serialize)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    edgeless_1k_pan_zoom_blocks_relayout: Option<u64>,
    headless_frame_render_ms: TimingStat,
}

#[derive(Serialize)]
struct PerfMetricsV1 {
    schema_version: u32,
    commit: String,
    timestamp_utc: String,
    ci_wall_ms: CiWallMs,
    artifacts_bytes: ArtifactsBytes,
    benchmarks: BenchmarksV1,
}

struct HeadlessSession {
    platform: Rc<HeadlessPlatform>,
    app: ApplicationHandle,
    window_handle: WindowHandle<PlaygroundView>,
    headless_win: HeadlessWindow,
}

fn start_headless_session(
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
    fn view<R>(
        &self,
        f: impl FnOnce(&mut PlaygroundView, &mut ui::Context<PlaygroundView>) -> R,
    ) -> Result<R> {
        self.app
            .update(|cx| self.window_handle.update(cx, |view, _, cx| f(view, cx)))
    }

    /// Draw a frame through `Window::draw()` and read its element snapshot.
    fn frame(&self) -> Result<FrameSnapshot> {
        self.headless_win.request_frame();
        self.app.update(|cx| {
            self.window_handle
                .update(cx, |_, window, _| window.frame_snapshot().clone())
        })
    }

    fn overlay(&self, event: OverlayEvent) -> Result<()> {
        self.app.update(|cx| {
            self.window_handle.update(cx, |view, window, cx| {
                view.dispatch_overlay(event, window, cx);
            })
        })
    }

    /// Run what is queued, then let `millis` pass on the scheduler clock.
    fn settle(&self, millis: u64) {
        self.platform.run_until_parked();
        self.platform.advance_clock(Duration::from_millis(millis));
        self.platform.run_until_parked();
    }

    fn pointer_move(&self, x: f32, y: f32, pressed: bool) {
        self.headless_win
            .dispatch_input(ui::PlatformInput::MouseMove(ui::MouseMoveEvent {
                position: point(px(x), px(y)),
                pressed_button: pressed.then_some(ui::MouseButton::Left),
                modifiers: ui::Modifiers::default(),
            }));
        self.platform.run_until_parked();
    }

    fn pointer_down(&self, x: f32, y: f32) {
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

    fn pointer_up(&self, x: f32, y: f32) {
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
    fn scroll_block_to(&self, block_id: &str, top: f32) -> Result<FrameSnapshot> {
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
    fn select_text(&self, block_id: &str, needle: &str) -> Result<()> {
        let (start, end) = self.text_range(block_id, needle)?;
        self.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
            block_id: block_id.to_string(),
            start_utf16: start,
            end_utf16: end,
        })))
    }

    /// The plain text of a paragraph or list block.
    fn plain_text(&self, block_id: &str) -> Result<String> {
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
    fn text_range(&self, block_id: &str, needle: &str) -> Result<(usize, usize)> {
        let plain = self.plain_text(block_id)?;
        let at = plain
            .find(needle)
            .with_context(|| format!("{needle:?} is not in block {block_id}"))?;
        let start = plain[..at].encode_utf16().count();
        Ok((start, start + needle.encode_utf16().count()))
    }
}

fn element_center(snapshot: &FrameSnapshot, id: &str) -> Result<(f32, f32)> {
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

/// A named arrangement of overlays the harness can put a session into.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum OverlayState {
    Default,
    SlashMenuOpen,
    SlashMenuFiltered,
    SlashMenuEmpty,
    SlashMenuFlippedBottom,
    FormatToolbarOpen,
    FormatToolbarFlippedTop,
    FormatToolbarLink,
    DragHandleHover,
    DragDropIndicator,
    CodeHover,
    CodeHoverCopied,
}

impl OverlayState {
    const ALL: [Self; 12] = [
        Self::Default,
        Self::SlashMenuOpen,
        Self::SlashMenuFiltered,
        Self::SlashMenuEmpty,
        Self::SlashMenuFlippedBottom,
        Self::FormatToolbarOpen,
        Self::FormatToolbarFlippedTop,
        Self::FormatToolbarLink,
        Self::DragHandleHover,
        Self::DragDropIndicator,
        Self::CodeHover,
        Self::CodeHoverCopied,
    ];

    fn name(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::SlashMenuOpen => "slash_menu_open",
            Self::SlashMenuFiltered => "slash_menu_filtered",
            Self::SlashMenuEmpty => "slash_menu_empty",
            Self::SlashMenuFlippedBottom => "slash_menu_flipped_bottom",
            Self::FormatToolbarOpen => "format_toolbar_open",
            Self::FormatToolbarFlippedTop => "format_toolbar_flipped_top",
            Self::FormatToolbarLink => "format_toolbar_link",
            Self::DragHandleHover => "drag_handle_hover",
            Self::DragDropIndicator => "drag_drop_indicator",
            Self::CodeHover => "code_hover",
            Self::CodeHoverCopied => "code_hover_copied",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|state| state.name() == value)
    }

    /// Snapshot ids the state must show once it is applied.
    fn expected(self) -> &'static [&'static str] {
        match self {
            Self::Default => &[],
            Self::SlashMenuOpen => &["overlay.slash_menu", "overlay.slash_menu.item.text"],
            Self::SlashMenuFiltered => &["overlay.slash_menu", "overlay.slash_menu.item.h1"],
            Self::SlashMenuEmpty => &["overlay.slash_menu", "overlay.slash_menu.empty"],
            Self::SlashMenuFlippedBottom => &["overlay.slash_menu"],
            Self::FormatToolbarOpen | Self::FormatToolbarFlippedTop => &[
                "overlay.format_toolbar",
                "overlay.format_toolbar.bold",
                "overlay.format_toolbar.align_right",
            ],
            Self::FormatToolbarLink => &[
                "overlay.format_toolbar",
                "overlay.format_toolbar.link_input",
                "overlay.format_toolbar.link_apply",
                "overlay.format_toolbar.link_remove",
            ],
            Self::DragHandleHover => &["overlay.drag_handle"],
            Self::DragDropIndicator => &["overlay.drag_handle", "overlay.drop_indicator"],
            Self::CodeHover | Self::CodeHoverCopied => &["page.block.showcase-code.copy"],
        }
    }
}

/// Put a freshly opened showcase session into `state`, driving it through the same input
/// and overlay events a person or an editor would send.
fn apply_overlay_state(session: &HeadlessSession, state: OverlayState) -> Result<()> {
    const HEADING: &str = "showcase-h1";
    const QUOTE: &str = "showcase-quote";
    const INTRO: &str = "showcase-intro";
    const CODE: &str = "showcase-code";
    // Text blocks of the showcase from the quote down, last first.
    const LOWER_TEXT_BLOCKS: [&str; 12] = [
        "showcase-toggle-closed",
        "showcase-toggle-open-child",
        "showcase-toggle-open",
        "showcase-todo-done",
        "showcase-todo-open",
        "showcase-numbered-nested",
        "showcase-numbered-2",
        "showcase-numbered-1",
        "showcase-bullet-deep",
        "showcase-bullet-nested",
        "showcase-bullet",
        QUOTE,
    ];
    let mut slash_anchor = HEADING;
    session.frame()?;
    match state {
        OverlayState::Default => {}
        OverlayState::SlashMenuOpen
        | OverlayState::SlashMenuFiltered
        | OverlayState::SlashMenuEmpty => {
            session.overlay(OverlayEvent::OpenSlashMenu {
                block_id: HEADING.to_string(),
                utf16_offset: 0,
                anchor: None,
            })?;
            let query = match state {
                OverlayState::SlashMenuFiltered => "hea",
                OverlayState::SlashMenuEmpty => "zzz",
                _ => "",
            };
            if !query.is_empty() {
                session.overlay(OverlayEvent::SetSlashQuery {
                    query: query.to_string(),
                    in_document: false,
                })?;
            }
        }
        OverlayState::SlashMenuFlippedBottom => {
            // The lowest text block still in view leaves no room below its caret.
            let snapshot = session.frame()?;
            slash_anchor = LOWER_TEXT_BLOCKS
                .into_iter()
                .find(|id| snapshot.elements.contains_key(&format!("page.block.{id}")))
                .context("no showcase text block is fully in view")?;
            session.overlay(OverlayEvent::OpenSlashMenu {
                block_id: slash_anchor.to_string(),
                utf16_offset: 0,
                anchor: None,
            })?;
        }
        OverlayState::FormatToolbarOpen => session.select_text(INTRO, "bold")?,
        OverlayState::FormatToolbarFlippedTop => {
            // The selected line sits right under the top bar.
            session.scroll_block_to(QUOTE, 0.0)?;
            session.select_text(QUOTE, "Every block")?;
        }
        OverlayState::FormatToolbarLink => {
            session.select_text(INTRO, "links")?;
            session.frame()?;
            session.overlay(OverlayEvent::Format(FormatAction::Link))?;
        }
        OverlayState::DragHandleHover | OverlayState::DragDropIndicator => {
            let snapshot = session.scroll_block_to(QUOTE, 40.0)?;
            let (x, y) = element_center(&snapshot, &format!("page.block.{QUOTE}"))?;
            session.pointer_move(x, y, false);
            // From the block onto its handle, which then shows its dots.
            let snapshot = session.frame()?;
            let (handle_x, handle_y) = element_center(&snapshot, "overlay.drag_handle")?;
            session.pointer_move(handle_x, handle_y, false);
            anyhow::ensure!(
                session.view(|view, _| view.overlays().drag_handle_hot())?,
                "the pointer on the drag handle does not show its dots"
            );
            if state == OverlayState::DragDropIndicator {
                // Drag the quote down to between the two numbered items.
                let target = snapshot
                    .elements
                    .get("page.block.showcase-numbered-1")
                    .context("page.block.showcase-numbered-1 missing from FrameSnapshot")?
                    .bounds;
                session.pointer_down(handle_x, handle_y);
                session.pointer_move(handle_x, target.bottom() + 2.0, true);
            }
        }
        OverlayState::CodeHover | OverlayState::CodeHoverCopied => {
            let snapshot = session.scroll_block_to(CODE, 120.0)?;
            let (x, y) = element_center(&snapshot, &format!("page.block.{CODE}"))?;
            session.pointer_move(x, y, false);
            if state == OverlayState::CodeHoverCopied {
                let snapshot = session.frame()?;
                let (x, y) = element_center(&snapshot, &format!("page.block.{CODE}.copy"))?;
                session.headless_win.simulate_click(point(px(x), px(y)));
            }
        }
    }
    // Past every overlay transition, short of the `Copied` label's timeout.
    session.frame()?;
    session.settle(400);
    let snapshot = session.frame()?;
    for id in state.expected() {
        anyhow::ensure!(
            snapshot.elements.contains_key(*id),
            "state {} does not show {id}",
            state.name()
        );
    }
    // A popover sits on its preferred side, or on the other one in the flipped states.
    let bounds = |id: &str| {
        snapshot
            .elements
            .get(id)
            .map(|element| element.bounds)
            .with_context(|| format!("{id} missing from FrameSnapshot"))
    };
    match state {
        OverlayState::SlashMenuOpen => {
            let (menu, anchor) = (
                bounds("overlay.slash_menu")?,
                bounds(&format!("page.block.{slash_anchor}"))?,
            );
            anyhow::ensure!(
                menu.y >= anchor.y,
                "slash menu {menu:?} is not below its block {anchor:?}"
            );
        }
        OverlayState::SlashMenuFlippedBottom => {
            let (menu, anchor) = (
                bounds("overlay.slash_menu")?,
                bounds(&format!("page.block.{slash_anchor}"))?,
            );
            anyhow::ensure!(
                menu.bottom() <= anchor.y,
                "slash menu {menu:?} did not flip above its block {anchor:?}"
            );
        }
        OverlayState::FormatToolbarOpen => {
            let (toolbar, selection) =
                (bounds("overlay.format_toolbar")?, bounds("page.selection")?);
            anyhow::ensure!(
                toolbar.bottom() <= selection.y,
                "toolbar {toolbar:?} is not above the selection {selection:?}"
            );
        }
        OverlayState::FormatToolbarFlippedTop => {
            let (toolbar, selection) =
                (bounds("overlay.format_toolbar")?, bounds("page.selection")?);
            anyhow::ensure!(
                toolbar.y >= selection.bottom(),
                "toolbar {toolbar:?} did not flip below the selection {selection:?}"
            );
        }
        _ => {}
    }
    Ok(())
}

/// Audit every overlay state in both themes on a regular and a narrow window.
fn run_audit_states() -> Result<()> {
    let mut audited = 0_usize;
    for (width, height) in [(1280_u32, 800_u32), (320, 800)] {
        for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
            for state in OverlayState::ALL {
                let context = format!("{} {width}x{height} {}", state.name(), theme.as_str());
                let session = start_headless_session(
                    width,
                    height,
                    PlaygroundOptions {
                        theme,
                        ..PlaygroundOptions::default()
                    },
                )?;
                apply_overlay_state(&session, state).with_context(|| context.clone())?;
                let snapshot = session.frame()?;
                let violations = audit_frame_snapshot(&snapshot);
                anyhow::ensure!(
                    violations.is_empty(),
                    "audit violations in {context}: {violations:#?}"
                );
                // Nothing an overlay draws leaves the window.
                for (id, element) in &snapshot.elements {
                    if id.starts_with("overlay.") {
                        anyhow::ensure!(
                            element.bounds.x >= 0.0
                                && element.bounds.y >= 0.0
                                && element.bounds.right() <= snapshot.viewport.width
                                && element.bounds.bottom() <= snapshot.viewport.height,
                            "{id} leaves the window in {context}: {:?}",
                            element.bounds
                        );
                    }
                }
                audited += 1;
            }

            // Audit Edgeless default + zoomed states (0.5x, 2.0x) in both themes and widths.
            for (label, zoom_opt) in [
                ("edgeless_default", None),
                ("edgeless_zoom_0.5x", Some(0.5_f32)),
                ("edgeless_zoom_2.0x", Some(2.0_f32)),
            ] {
                let context = format!("{label} {width}x{height} {}", theme.as_str());
                let session = start_headless_session(
                    width,
                    height,
                    PlaygroundOptions {
                        theme,
                        mode: PlaygroundMode::Edgeless,
                        ..PlaygroundOptions::default()
                    },
                )?;
                let _ = session.frame()?;
                if let Some(z) = zoom_opt {
                    session.update(|v, _, cx| v.set_edgeless_zoom(z, cx))?;
                }
                let snapshot = session.frame()?;
                let violations = audit_frame_snapshot(&snapshot);
                anyhow::ensure!(
                    violations.is_empty(),
                    "audit violations in {context}: {violations:#?}"
                );
                anyhow::ensure!(
                    snapshot.elements.contains_key("edgeless.viewport"),
                    "edgeless.viewport missing in {context}"
                );
                anyhow::ensure!(
                    snapshot.elements.contains_key("chrome.edgeless_zoom"),
                    "chrome.edgeless_zoom missing in {context}"
                );
                audited += 1;
            }
        }
    }
    println!("audit-states passed: 0 violations across {audited} states");
    Ok(())
}

fn render_headless(
    width: u32,
    height: u32,
    out_png: PathBuf,
    out_snapshot: PathBuf,
    click_edgeless: bool,
    zoom: Option<f32>,
    pan: Option<(f32, f32)>,
    state: OverlayState,
    options: PlaygroundOptions,
) -> Result<()> {
    let theme = options.theme;
    let mode = options.mode;
    let session = start_headless_session(width, height, options)?;
    session.headless_win.request_frame();
    if state != OverlayState::Default {
        apply_overlay_state(&session, state)?;
    }

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

    if zoom.is_some() || pan.is_some() {
        session.update(|v, _, cx| match (pan, zoom) {
            (Some((px_w, py_w)), Some(z)) => v.set_edgeless_camera(px_w, py_w, z, cx),
            (Some((px_w, py_w)), None) => v.set_edgeless_pan(px_w, py_w, cx),
            (None, Some(z)) => v.set_edgeless_zoom(z, cx),
            (None, None) => {}
        })?;
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
        "headless render produced 0 text glyphs; check bundled font registration"
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

    let shown_mode = if click_edgeless || mode == PlaygroundMode::Edgeless {
        "edgeless"
    } else {
        "page"
    };
    println!(
        "Rendered {}x{} headless PNG ({} glyphs, {} {}) to {} and snapshot ({} elements) to {}",
        width,
        height,
        glyph_count,
        shown_mode,
        theme.as_str(),
        out_png.display(),
        snapshot.elements.len(),
        out_snapshot.display()
    );
    Ok(())
}

struct RichSample {
    paragraph: playground::rich_text::RichParagraph,
    rich: bool,
}

impl ui::Render for RichSample {
    fn render(&mut self, window: &mut ui::Window, _: &mut ui::Context<Self>) -> impl IntoElement {
        use playground::rich_text::{
            CaretPosition, RichParagraphElement, RichParagraphStyle, WrapAffinity,
        };
        let style = RichParagraphStyle::default();
        let frame = ui::div().size_full().bg(ui::white()).p(px(16.));
        if self.rich {
            let layout = self.paragraph.layout(window.text_system(), &style, 372.);
            let mut element = RichParagraphElement::new(std::sync::Arc::new(layout));
            element.selections.push((4..11, ui::rgb(0xd6eaff).into()));
            element.carets.push((
                CaretPosition {
                    utf16_offset: 11,
                    affinity: WrapAffinity::Downstream,
                },
                ui::rgb(0x286ce8).into(),
            ));
            frame.child(element)
        } else {
            frame.child(
                ui::div()
                    .w(px(372.))
                    .font_family(style.font_family)
                    .text_size(px(style.font_size))
                    .text_color(style.text_color)
                    .line_height(px(style.line_height))
                    .child(self.paragraph.source_text().to_owned()),
            )
        }
    }
}

fn render_rich_sample(mut args: impl Iterator<Item = String>) -> Result<()> {
    let (mut plain, mut rich) = (None, None);
    while let Some(flag) = args.next() {
        let path = match flag.as_str() {
            "--out-plain" => &mut plain,
            "--out-rich" => &mut rich,
            _ => bail!("unknown render-rich-sample flag: {flag}"),
        };
        *path = Some(PathBuf::from(
            args.next()
                .with_context(|| format!("{flag} requires a path"))?,
        ));
    }
    let plain = plain.context("render-rich-sample requires --out-plain <path>")?;
    let rich = rich.context("render-rich-sample requires --out-rich <path>")?;
    anyhow::ensure!(plain != rich, "plain and rich output paths must differ");
    let platform = HeadlessPlatform::new(404, 105, 2.);
    let init = Rc::new(RefCell::new(None));
    let handle_out = Rc::clone(&init);
    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        *handle_out.borrow_mut() = Some((|| -> Result<_> {
            register_bundled_fonts(cx)?;
            let paragraph = playground::rich_text::sample_paragraph()?;
            let bounds = Bounds::new(point(px(0.), px(0.)), size(px(404.), px(105.)));
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                },
                |_, cx| {
                    cx.new(|_| RichSample {
                        paragraph,
                        rich: false,
                    })
                },
            )
        })());
    });
    let handle = init
        .borrow_mut()
        .take()
        .context("headless application did not start")??;
    let win = platform
        .windows()
        .into_iter()
        .next()
        .context("sample window missing")?;
    for (show_marks, path) in [(false, plain), (true, rich)] {
        app.update(|cx| {
            handle.update(cx, |v, _, cx| {
                v.rich = show_marks;
                cx.notify();
            })
        })?;
        win.request_frame();
        let image =
            app.update(|cx| handle.update(cx, |_, window, _| window.render_to_image()))??;
        if let Some(dir) = path.parent().filter(|dir| !dir.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir)?;
        }
        image
            .save_with_format(&path, image::ImageFormat::Png)
            .with_context(|| format!("writing {}", path.display()))?;
    }
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

const FPS_RATES: [u32; 4] = [60, 120, 24, 7];

fn frame_interval(fps: u32) -> Duration {
    Duration::from_nanos((1_000_000_000_u64 + u64::from(fps) / 2) / u64::from(fps))
}

/// Step a popover's fade for 250 ms at `fps` and return the opacity of every frame it was
/// mounted in. Every frame is audited, and a mounted popover never sits at the window
/// origin or moves.
fn step_popover(
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
fn fps_check_popover(
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

fn run_fps_check() -> Result<()> {
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

fn fps_check_mode_switch() -> Result<()> {
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

fn validate_commit_sha(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() == 40 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(trimmed.to_ascii_lowercase())
    } else {
        None
    }
}

fn resolve_commit_sha(explicit_commit: Option<&str>) -> Result<String> {
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

fn run_doc_1k_edits_once(seed: u64) -> Result<()> {
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

fn bench_doc_1k_edits_ms() -> Result<TimingStat> {
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

fn run_room_sync_1k_ops_once(seed: u64) -> Result<()> {
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

fn bench_room_sync_1k_ops_ms() -> Result<TimingStat> {
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

impl HeadlessSession {
    fn update<R>(
        &self,
        f: impl FnOnce(&mut PlaygroundView, &mut ui::Window, &mut ui::Context<PlaygroundView>) -> R,
    ) -> Result<R> {
        self.app.update(|cx| self.window_handle.update(cx, f))
    }
    fn select(&self, block: &str, offset: u64) -> Result<()> {
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
    fn type_text(&self, text: &str) -> Result<()> {
        self.update(|v, w, cx| v.replace_text_in_range(None, text, w, cx))
    }
    fn key(&self, key: &str, shift: bool, command: bool) {
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
    fn caret(&self, id: &str, offset: u64) -> Result<ui::Point<ui::Pixels>> {
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
    fn image(&self) -> Result<image::RgbaImage> {
        self.update(|_, w, _| w.render_to_image())?
    }
    fn doc_json(&self) -> Result<serde_json::Value> {
        Ok(self.update(|v, _, _| {
            v.document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap()
                .export_doc_json()
        })??)
    }
    fn selection(&self) -> Result<DocumentSelection> {
        self.update(|v, _, _| v.document_selection().cloned())?
            .context("active selection")
    }
    fn set_texts(&self, texts: &[&str]) -> Result<()> {
        let doc = probe_doc(texts.iter().copied())?;
        self.update(|v, _, cx| v.set_document(doc, cx))?;
        self.headless_win.request_frame();
        Ok(())
    }
}

fn probe_doc<'a>(texts: impl IntoIterator<Item = &'a str>) -> Result<DocState> {
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

fn bench_page(session: &HeadlessSession) -> Result<(TimingStat, TimingStat, u64)> {
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

fn bench_edgeless_1k() -> Result<(TimingStat, u64)> {
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

fn run_bench(
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

fn probe_geometry(s: &HeadlessSession) -> Result<()> {
    use playground::rich_text::{
        CaretPosition, RichParagraph, RichParagraphStyle, WrapAffinity, sample_paragraph,
    };
    use y_octo::{TextDeltaOp, TextInsert};
    let n = s.update(|_, w, _| -> Result<usize> {
        let mut delta = sample_paragraph()?.delta().to_vec();
        delta.push(TextDeltaOp::Insert {
            insert: TextInsert::Text("中文👨‍👩‍👧‍👦".into()),
            format: None,
        });
        let p = RichParagraph::from_delta(delta)?;
        let layout = p.layout(w.text_system(), &RichParagraphStyle::default(), 158.);
        let mut n = 0;
        let mut offset = 0;
        loop {
            for affinity in [WrapAffinity::Downstream, WrapAffinity::Upstream] {
                let pos = CaretPosition {
                    utf16_offset: offset,
                    affinity,
                };
                if affinity == WrapAffinity::Upstream
                    && !layout.lines().windows(2).any(|l| {
                        l[0].source_utf16.end == offset && l[1].source_utf16.start == offset
                    })
                {
                    continue;
                }
                let rect = layout.caret_rect(pos);
                let hit = layout.hit_test(rect.origin + point(px(0.), rect.size.height * 0.5));
                anyhow::ensure!(hit == pos, "P1 {pos:?} at {:?} hit {hit:?}", rect.origin);
                n += 1;
            }
            if offset == p.index().utf16_len() {
                break;
            }
            offset = p.index().next_grapheme_utf16(offset);
        }
        Ok(n)
    })??;
    println!("P1 {n} grapheme/affinity positions, zero mismatches");
    let long = "Wrap this line across the page. ".repeat(30);
    s.set_texts(&[&long, "", "i", &long])?;
    s.select("p0", 15)?;
    s.headless_win.request_frame();
    let goal = s.caret("p0", 15)?.x;
    let mut visited = std::collections::BTreeSet::new();
    let mut max_drift = 0f32;
    let mut steps = 0;
    let column = s.update(|_, w, _| {
        playground::block_flow::page_geometry(f32::from(w.viewport_size().width)).column_x
    })?;
    for _ in 0..100 {
        s.key("down", false, false);
        s.headless_win.request_frame();
        let (sel, x) = s.update(|v, _, _| (v.document_selection().unwrap().clone(), v.goal_x()))?;
        let drift = (x.context("P2 missing goal")? + column - f32::from(goal)).abs();
        max_drift = max_drift.max(drift);
        visited.insert(sel.focus.block_id.clone());
        steps += 1;
        if sel.focus.block_id == "p3" {
            break;
        }
    }
    anyhow::ensure!(
        steps >= 7 && visited.len() == 4 && max_drift <= 1.0,
        "P2 {steps} steps over {visited:?}, drift {max_drift}"
    );
    s.key("up", true, false);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.selection()?.anchor.block_id == "p3" && s.selection()?.focus.block_id == "p2",
        "P2 reverse extension"
    );
    println!("P2 sticky goal crossed {steps} lines, drift {max_drift:.3}px");
    Ok(())
}

fn mouse(s: &HeadlessSession, id: &str, offset: u64, count: usize, drag: bool) -> Result<()> {
    let position = s.caret(id, offset)?;
    let mods = ui::Modifiers::default();
    if drag {
        s.headless_win
            .dispatch_input(ui::PlatformInput::MouseMove(ui::MouseMoveEvent {
                position,
                pressed_button: Some(ui::MouseButton::Left),
                modifiers: mods,
            }));
    } else {
        s.headless_win
            .dispatch_input(ui::PlatformInput::MouseDown(ui::MouseDownEvent {
                position,
                button: ui::MouseButton::Left,
                click_count: count,
                modifiers: mods,
                first_mouse: false,
            }));
    }
    s.platform.run_until_parked();
    Ok(())
}

fn probe_selection(s: &HeadlessSession) -> Result<()> {
    let wrapped = "two beta ".repeat(12);
    s.set_texts(&["one alpha", &wrapped, "three gamma"])?;
    let original = s.doc_json()?;
    for reverse in [false, true] {
        let (a, b) = if reverse {
            (("p2", 5), ("p0", 3))
        } else {
            (("p0", 3), ("p2", 5))
        };
        mouse(s, a.0, a.1, 1, false)?;
        mouse(s, b.0, b.1, 1, true)?;
        s.headless_win.request_frame();
        let sel = s.selection()?;
        anyhow::ensure!(
            sel.anchor == DocPoint::new(a.0, a.1) && sel.focus == DocPoint::new(b.0, b.1),
            "P3 incorrect drag {sel:?}"
        );
        s.update(|v, _, _| -> Result<()> {
            let layout = v.flow_layout().context("selection layout")?;
            let rects = v.selection_rects(&layout);
            let mut previous_bottom = None;
            let mut wrapped_rows = 0;
            for id in ["p0", "p1", "p2"] {
                let b = layout.block(id).context("selected block")?;
                let lines: Vec<_> = rects
                    .iter()
                    .filter(|r| r.y >= b.y && r.bottom() <= b.y + b.body.height + 0.01)
                    .collect();
                anyhow::ensure!(
                    !lines.is_empty()
                        && lines
                            .windows(2)
                            .all(|r| (r[0].bottom() - r[1].y).abs() < 0.01),
                    "line-box gap or overlap"
                );
                anyhow::ensure!(
                    previous_bottom.is_none_or(|y| y <= lines[0].y),
                    "non-monotonic block selection"
                );
                previous_bottom = lines.last().map(|l| l.bottom());
                wrapped_rows += lines.len();
            }
            anyhow::ensure!(
                wrapped_rows == rects.len() && wrapped_rows > 3,
                "unexpected inter-block rectangles or missing wrapped lines"
            );
            Ok(())
        })??;
        s.key("backspace", false, false);
        s.headless_win.request_frame();
        let joined = s.doc_json()?;
        anyhow::ensure!(
            joined["blocks"]["p0"]["prop:text"][0]["insert"] == "one gamma"
                && joined["blocks"]["p2"].is_null(),
            "P3 incorrect joined doc"
        );
        s.key("z", false, true);
        s.headless_win.request_frame();
        anyhow::ensure!(
            s.doc_json()? == original && s.selection()? == sel,
            "P3 undo failed to restore the range and document"
        );
    }
    println!(
        "P3 two drag directions, continuous line boxes within blocks, clear margins and one undo per delete"
    );
    mouse(s, "p0", 6, 2, false)?;
    let sel = s.selection()?;
    anyhow::ensure!(
        sel.anchor.caret.utf16_offset == 4 && sel.focus.caret.utf16_offset == 9,
        "P4 double click {sel:?}"
    );
    mouse(s, "p0", 6, 3, false)?;
    let sel = s.selection()?;
    anyhow::ensure!(
        sel.anchor.caret.utf16_offset == 0 && sel.focus.caret.utf16_offset == 9,
        "P4 triple click {sel:?}"
    );
    println!("P4 double-click 4..9, triple-click 0..9");
    Ok(())
}

fn peer_of(s: &HeadlessSession) -> Result<PageDocSession> {
    let mut peer = PageDocSession::new(playground::HOME_PAGE_ID, 31)?;
    peer.apply_remote_update_v1(&s.update(|v, _, _| {
        v.document()
            .workspace
            .page(playground::HOME_PAGE_ID)
            .unwrap()
            .encode_update_v1()
    })??)?;
    Ok(peer)
}

fn receive(s: &HeadlessSession, bytes: &[u8]) -> Result<()> {
    s.update(|v, _, cx| {
        v.edit_document(cx, |d| {
            d.workspace
                .page_mut(playground::HOME_PAGE_ID)
                .unwrap()
                .apply_remote_update_v1(bytes)
        })
    })??;
    s.headless_win.request_frame();
    Ok(())
}

fn probe_input(s: &HeadlessSession) -> Result<()> {
    s.set_texts(&["a"])?;
    s.select("p0", 1)?;
    s.headless_win.request_frame();
    let before = s.image()?;
    let left = s.caret("p0", 1)?;
    s.type_text("W")?;
    s.headless_win.request_frame();
    let after = s.image()?;
    let right = s.caret("p0", 2)?;
    let x0 = f32::from(left.x).ceil() as u32 + 1;
    let x1 = f32::from(right.x).floor() as u32;
    let y = f32::from(left.y) as u32;
    let ink = (x0..x1)
        .flat_map(|x| (y - 8..y + 8).map(move |y| (x, y)))
        .filter(|&(x, y)| before.get_pixel(x, y) != after.get_pixel(x, y))
        .count();
    anyhow::ensure!(ink > 0, "P5 next frame has no new glyph ink");
    println!("P5 {ink} changed glyph pixels after one frame");
    s.set_texts(&["ab"])?;
    s.select("p0", 1)?;
    s.headless_win.request_frame();
    let mut peer = peer_of(s)?;
    let initial = s.doc_json()?;
    let state = |s: &HeadlessSession| -> Result<Vec<u8>> {
        Ok(s.update(|v, _, _| {
            v.document()
                .workspace
                .page(playground::HOME_PAGE_ID)
                .unwrap()
                .encode_state_vector_v1()
        })??)
    };
    let vector = state(s)?;
    for pre in ["ni", "nihao"] {
        s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, pre, None, w, cx))?;
        s.headless_win.request_frame();
        anyhow::ensure!(
            state(s)? == vector && s.doc_json()? == initial,
            "P6 preedit changed CRDT"
        );
    }
    let update = peer
        .insert_text("p0", "prop:text", 0, "R", 10)?
        .unwrap()
        .update;
    receive(s, &update)?;
    let r = s.update(|v, w, cx| v.marked_text_range(w, cx))?;
    anyhow::ensure!(r == Some(2..7), "P6 shifted preedit {r:?}");
    s.type_text("你好")?;
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"][0]["insert"] == "Ra你好b",
        "P6 final placement"
    );
    println!("P6 no preedit CRDT changes, remote insertion shifted commit to UTF-16 offset 2");
    s.set_texts(&[""])?;
    s.select("p0", 0)?;
    s.headless_win.request_frame();
    for text in ["a", "b", "c"] {
        s.type_text(text)?;
        s.platform.advance_clock(Duration::from_millis(100));
    }
    s.platform.advance_clock(Duration::from_millis(600));
    s.type_text("d")?;
    s.key("z", false, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"][0]["insert"] == "abc",
        "P7 late edit was merged"
    );
    s.key("z", false, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"] == serde_json::json!([])
            && s.selection()?.focus.caret.utf16_offset == 0,
        "P7 early edits did not merge"
    );
    s.key("z", true, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.selection()?.focus.caret.utf16_offset == 3,
        "P7 redo caret"
    );
    println!("P7 100ms typing merged, 600ms gap split, redo caret restored");
    s.set_texts(&["ab"])?;
    s.select("p0", 1)?;
    s.headless_win.request_frame();
    let mut peer = peer_of(s)?;
    s.type_text("L")?;
    let update = peer
        .insert_text("p0", "prop:text", 0, "R", 10)?
        .unwrap()
        .update;
    receive(s, &update)?;
    s.key("z", false, true);
    s.headless_win.request_frame();
    anyhow::ensure!(
        s.doc_json()?["blocks"]["p0"]["prop:text"][0]["insert"] == "Rab"
            && s.selection()?.focus.caret.utf16_offset == 2,
        "P8 remote edit or local selection lost"
    );
    println!("P8 remote R survived local undo, caret restored at offset 2");
    Ok(())
}

fn probe_anchor(s: &HeadlessSession) -> Result<()> {
    s.set_texts(&["A reading paragraph."; 120])?;
    s.select("p70", 4)?;
    s.headless_win.request_frame();
    let before = s.caret("p70", 4)?;
    let mut peer = peer_of(s)?;
    let update = peer
        .add_block(
            "new",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Inserted above fold".into(),
            },
            Some("note"),
            Some(0),
            50,
        )?
        .unwrap()
        .update;
    receive(s, &update)?;
    let shift = f32::from(s.caret("p70", 4)?.y - before.y).abs();
    anyhow::ensure!(shift <= 0.5, "P9 anchor moved {shift}px");
    println!("P9 remote insertion above fold, anchor shifted {shift:.3}px");
    Ok(())
}

fn replay_editing() -> Result<()> {
    let mut reference = None;
    for fps in [60, 120, 24, 7] {
        let s = start_headless_session(800, 600, Default::default())?;
        s.set_texts(&["draft", "second"])?;
        s.select("p0", 5)?;
        s.headless_win.request_frame();
        s.type_text(" one")?;
        s.key("enter", false, false);
        s.headless_win.request_frame();
        s.type_text("two")?;
        s.headless_win.request_frame();
        for id in ["chrome.mode_switcher.edgeless", "chrome.mode_switcher.page"] {
            let p = s.update(|_, w, _| {
                let b = w.frame_snapshot().elements[id].bounds;
                point(px(b.x + b.width / 2.), px(b.y + b.height / 2.))
            })?;
            s.headless_win.simulate_click(p);
            for _ in 0..fps {
                s.platform
                    .advance_clock(Duration::from_secs_f64(1.0 / fps as f64));
                s.headless_win.request_frame();
            }
        }
        let frame = s.update(|_, w, _| serde_json::to_vec(w.frame_snapshot()))??;
        let terminal = (frame, serde_json::to_vec(&s.doc_json()?)?);
        if let Some(expected) = &reference {
            anyhow::ensure!(
                &terminal == expected,
                "P10 terminal state differs at {fps}fps"
            );
        } else {
            reference = Some(terminal);
        }
    }
    println!("P10 identical terminal frame and document bytes at 60/120/24/7 fps");
    Ok(())
}

fn render_editor(dir: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&dir)?;
    for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
        let s = start_headless_session(
            1280,
            800,
            PlaygroundOptions {
                theme,
                ..Default::default()
            },
        )?;
        s.headless_win.request_frame();
        let save = |name: &str| -> Result<()> {
            s.headless_win.request_frame();
            let violations = s.update(|_, w, _| audit_frame_snapshot(w.frame_snapshot()))?;
            anyhow::ensure!(
                violations.is_empty(),
                "editor render violations: {violations:?}"
            );
            s.image()?
                .save(dir.join(format!("{name}-{}.png", theme.as_str())))?;
            Ok(())
        };
        mouse(&s, "showcase-h1", 4, 1, false)?;
        save("caret")?;
        mouse(&s, "showcase-quote", 15, 1, true)?;
        save("selection")?;
        s.select("showcase-h1", 9)?;
        s.update(|v, w, cx| v.replace_and_mark_text_in_range(None, " nihao", None, w, cx))?;
        save("preedit")?;
        s.update(|v, w, cx| v.replace_text_in_range(None, " 你好", w, cx))?;
        s.select("showcase-intro", 0)?;
        s.type_text("- ")?;
        anyhow::ensure!(
            s.doc_json()?["blocks"][&s.selection()?.focus.block_id]["sys:flavour"] == "affine:list",
            "list conversion"
        );
        save("markdown")?;
    }
    Ok(())
}

/// The pointer drawn into recorded frames, hot spot at its top-left: `#` is the outline and
/// `o` the fill.
const DEMO_POINTER: [&str; 18] = [
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
const DEMO_FPS: u32 = 60;
/// Radius of the disc drawn under the pointer while its button is down.
const DEMO_PRESS_RADIUS: f32 = 10.0;

/// Drives a session through input events and saves every 60 fps frame of it.
struct DemoRecorder<'a> {
    session: &'a HeadlessSession,
    dir: PathBuf,
    frames: usize,
    pointer: (f32, f32),
    pressed: bool,
}

impl DemoRecorder<'_> {
    /// Let one frame interval pass on the scheduler clock, draw, audit and save the frame.
    fn frame(&mut self) -> Result<()> {
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

    fn hold(&mut self, frames: usize) -> Result<()> {
        (0..frames).try_for_each(|_| self.frame())
    }

    /// Name the moment the next frame shows, for picking stills out of the recording.
    fn chapter(&self, name: &str) {
        println!("frame {:05} {name}", self.frames);
    }

    fn draw_pointer(&self, image: &mut image::RgbaImage) {
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
    fn move_to(&mut self, target: (f32, f32), frames: usize) -> Result<()> {
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

    fn press(&mut self) {
        self.session.pointer_down(self.pointer.0, self.pointer.1);
        self.pressed = true;
    }

    fn release(&mut self) {
        self.session.pointer_up(self.pointer.0, self.pointer.1);
        self.pressed = false;
    }

    fn click(&mut self) -> Result<()> {
        self.press();
        self.hold(3)?;
        self.release();
        Ok(())
    }

    /// Scroll the page down by `distance` pixels over `frames` frames.
    fn scroll(&mut self, distance: f32, frames: usize) -> Result<()> {
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
    fn click_element(&mut self, id: &str, frames: usize) -> Result<()> {
        let target = element_center(&self.session.frame()?, id)?;
        self.move_to(target, frames)?;
        self.click()
    }

    /// Step the pointer aside, so it does not cover what it just clicked.
    fn step_aside(&mut self, frames: usize) -> Result<()> {
        self.move_to((self.pointer.0 + 30.0, self.pointer.1 + 16.0), frames)
    }

    /// Type through the input handler, one character every `frames` frames.
    fn type_text(&mut self, text: &str, frames: usize) -> Result<()> {
        for ch in text.chars() {
            self.session.type_text(ch.encode_utf8(&mut [0; 4]))?;
            self.hold(frames)?;
        }
        Ok(())
    }

    fn key(&mut self, key: &str, command: bool, frames: usize) -> Result<()> {
        self.session.key(key, false, command);
        self.hold(frames)
    }

    /// The middle of the caret at `offset` in a block's text.
    fn text_point(&self, block_id: &str, offset: usize) -> Result<(f32, f32)> {
        let at = self.session.caret(block_id, offset as u64)?;
        Ok((f32::from(at.x), f32::from(at.y)))
    }
}

/// Record a walk through the page editor and its overlays at 60 fps into `dir` as
/// `frame-<n>.png`: typing with marks and a composition, a slash command, a mouse selection
/// formatted from the toolbar, the block controls, and undo. Every step is an input event
/// or an input-handler call, every frame is audited, and the document is checked on the way.
fn record_demo(dir: PathBuf, theme: PlaygroundTheme) -> Result<()> {
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

fn run_probes() -> Result<()> {
    let s = start_headless_session(640, 720, Default::default())?;
    probe_geometry(&s)?;
    probe_selection(&s)?;
    probe_input(&s)?;
    probe_anchor(&s)?;
    replay_editing()
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let Some(cmd) = args.next() else {
        bail!(
            "usage: bs-harness <render|render-rich-sample|render-editor|record-demo|audit|audit-states|fps-check|probes|bench> [options]"
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
