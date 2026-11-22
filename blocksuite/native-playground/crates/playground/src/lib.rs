//! Native BlockSuite Playground shell (native desktop + Web Wasm canvas + headless harness).
//!
//! All targets execute the single shipping [`PlaygroundView`] element tree: screen-space
//! chrome (top bar, mode switcher, theme toggle, presence) around the world-space page
//! rendered by [`block_flow`], with the popovers and block controls of [`overlays`] on top.

pub mod block_flow;
mod chrome;
pub mod clipboard;
pub mod edgeless;
pub mod editor_session;
pub mod overlays;
pub mod rich_text;
pub mod room_client;
pub mod surface;
pub mod theme;

mod showcase;
mod view_room;

pub use showcase::seed_showcase_doc;
#[cfg(target_arch = "wasm32")]
pub use view_room::wasm_main;

use view_room::{BlobFetchState, RoomRuntime};

use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    rc::Rc,
    time::Duration,
};

use blocksuite_playground_doc::{
    awareness::{AwarenessPayload, TextRangePoint, TextSelectionState},
    read::{BlockContent, PageSnapshot},
};
use ui::{Motion, MotionCurve, ScrollEvent, Task, Window, point, prelude::*, px, size};

use crate::{
    block_flow::{BlockFlow, FlowInput, FlowLayout, ImageSlot, decode_image, page_geometry},
    overlays::Overlays,
    room_client::{DocState, RoomCommand, RoomConfig, RoomProtocol},
};

pub use crate::theme::{PlaygroundTheme, register_bundled_fonts};

/// Height of the top bar, including its bottom border.
pub const TOPBAR_HEIGHT: f32 = 53.0;

/// Room id of the built-in showcase workspace.
pub const SHOWCASE_ROOM: &str = "showcase";
/// Page shown first in any workspace, and the showcase page id.
pub const HOME_PAGE_ID: &str = "doc:home";
/// Name of the showcase's remote collaborator.
pub const SHOWCASE_PEER_NAME: &str = "Ada";
/// `sourceId` of the showcase image blob.
pub const SHOWCASE_IMAGE_ID: &str = "showcase-gradient";

/// Active view mode for the playground frame.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PlaygroundMode {
    #[default]
    Page,
    Edgeless,
}

impl PlaygroundMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "page" => Some(Self::Page),
            "edgeless" => Some(Self::Edgeless),
            _ => None,
        }
    }
}

/// Initial configuration of a [`PlaygroundView`].
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PlaygroundOptions {
    pub theme: PlaygroundTheme,
    pub mode: PlaygroundMode,
    /// Live room to join. Without one the view shows the built-in showcase document.
    pub room: Option<RoomConfig>,
}

impl PlaygroundOptions {
    /// Parse command-line flags: `--theme light|dark`, `--mode page|edgeless`,
    /// `--room <room>` and `--relay <ws_url>` (a relay without a room is an error).
    pub fn from_args(args: impl IntoIterator<Item = String>) -> anyhow::Result<Self> {
        let mut options = Self::default();
        let mut room = None;
        let mut relay = None;
        let mut args = args.into_iter();
        while let Some(flag) = args.next() {
            let mut value = || {
                args.next()
                    .ok_or_else(|| anyhow::anyhow!("{flag} requires a value"))
            };
            match flag.as_str() {
                "--theme" => {
                    let value = value()?;
                    options.theme = PlaygroundTheme::parse(&value)
                        .ok_or_else(|| anyhow::anyhow!("unknown theme {value:?} (light|dark)"))?;
                }
                "--mode" => {
                    let value = value()?;
                    options.mode = PlaygroundMode::parse(&value)
                        .ok_or_else(|| anyhow::anyhow!("unknown mode {value:?} (page|edgeless)"))?;
                }
                "--room" => room = Some(value()?),
                "--relay" => relay = Some(value()?),
                other => anyhow::bail!("unknown flag: {other}"),
            }
        }
        match (room, relay) {
            (Some(room), relay) => {
                let config = RoomConfig::new(&room, relay.as_deref());
                #[cfg(not(target_family = "wasm"))]
                config.validate_native()?;
                options.room = Some(config);
            }
            (None, Some(_)) => anyhow::bail!("--relay requires --room <room>"),
            (None, None) => {}
        }
        Ok(options)
    }
}

pub(crate) const PILL_WIDTH: f32 = 186.0;
pub(crate) const PILL_PAGE_X: f64 = 4.0;
pub(crate) const PILL_EDGELESS_X: f64 = 94.0;
pub(crate) const PILL_TRANSITION_MS: f64 = 200.0;
pub(crate) const THEME_TOGGLE_SIZE: f32 = 32.0;
pub(crate) const TOPBAR_EDGE: f32 = 12.0;
const SCROLL_LINE: f32 = 20.0;

type LayoutKey = (u64, u32, PlaygroundTheme, u64);

/// Interactive GPUI root view for desktop, Web canvas, and headless verification sessions.
pub struct PlaygroundView {
    pub(crate) mode: PlaygroundMode,
    pub(crate) theme: PlaygroundTheme,
    pub(crate) origin_time: ui::scheduler::Instant,
    pub(crate) pill_motion: Option<Motion>,
    pub(crate) editor: editor_session::EditorSession,
    pub(crate) editor_focus: ui::FocusHandle,
    pub(crate) reading_anchor: Option<(String, f32)>,
    pub(crate) state: DocState,
    pub(crate) room: Option<RoomRuntime>,
    pub(crate) page_id: Option<String>,
    pub(crate) snapshot: Option<Rc<PageSnapshot>>,
    pub(crate) page_titles: BTreeMap<String, String>,
    /// What each referenced image shows. An entry without a pending fetch was decoded
    /// from its blob and is final.
    pub(crate) images: HashMap<String, ImageSlot>,
    pub(crate) blob_fetches: BTreeMap<String, BlobFetchState>,
    pub(crate) dirty_text: Option<BTreeSet<String>>,
    pub(crate) doc_rev: u64,
    pub(crate) env_rev: u64,
    pub(crate) flow: BlockFlow,
    pub(crate) layout: Option<(LayoutKey, Rc<FlowLayout>)>,
    pub(crate) scroll_y: f32,
    pub(crate) max_scroll: f32,
    /// Window size of the latest frame, in logical pixels.
    pub(crate) window_size: (f32, f32),
    pub(crate) edgeless: edgeless::EdgelessCanvasState,
    pub(crate) overlays: Overlays,
    /// Timer that ends a code block's `Copied` label; a newer copy replaces it.
    pub(crate) copied_timer: Option<Task<()>>,
    pub(crate) _tasks: Vec<Task<()>>,
}

#[cfg(not(target_family = "wasm"))]
fn fresh_client_id() -> u64 {
    blocksuite_playground_doc::random_client_id()
}

#[cfg(target_family = "wasm")]
fn fresh_client_id() -> u64 {
    blocksuite_playground_doc::client_id_from_seed(
        (js_sys::Math::random() * 9_007_199_254_740_992.0) as u64,
    )
}

impl PlaygroundView {
    /// Open the built-in showcase document in the light theme.
    pub fn new(cx: &mut Context<Self>) -> Self {
        Self::with_options(PlaygroundOptions::default(), cx)
    }

    /// Open the view with an explicit theme and mode, joining `options.room` when given.
    pub fn with_options(options: PlaygroundOptions, cx: &mut Context<Self>) -> Self {
        let mut tasks = Vec::new();
        let (state, room) = match options.room {
            Some(config) => {
                let state = DocState::new(&config.room, fresh_client_id())
                    .expect("generated client ids are always in the 53-bit range");
                let link = room_client::connect(config.clone());
                let events = link.events().clone();
                tasks.push(cx.spawn(async move |this, cx| {
                    while let Ok(event) = events.recv().await {
                        let handled = this.update(cx, |this, cx| this.handle_room_event(event, cx));
                        if handled.is_err() {
                            break;
                        }
                    }
                }));
                tasks.push(cx.spawn(async move |this, cx| {
                    loop {
                        cx.background_executor().timer(Duration::from_secs(1)).await;
                        if this.update(cx, |this, cx| this.tick_room(cx)).is_err() {
                            break;
                        }
                    }
                }));
                let runtime = RoomRuntime {
                    protocol: RoomProtocol::new(config.room.clone()),
                    config,
                    link,
                    error: None,
                };
                (state, Some(runtime))
            }
            None => (
                seed_showcase_doc().expect("the showcase document seeds deterministically"),
                None,
            ),
        };

        let mut view = Self {
            mode: options.mode,
            theme: options.theme,
            origin_time: cx.background_executor().now(),
            pill_motion: None,
            state,
            room,
            editor: Default::default(),
            editor_focus: cx.focus_handle(),
            reading_anchor: None,
            page_id: None,
            snapshot: None,
            page_titles: BTreeMap::new(),
            images: HashMap::new(),
            blob_fetches: BTreeMap::new(),
            dirty_text: None,
            doc_rev: 0,
            env_rev: 0,
            flow: BlockFlow::new(),
            layout: None,
            scroll_y: 0.0,
            max_scroll: 0.0,
            window_size: (0.0, 0.0),
            edgeless: edgeless::EdgelessCanvasState::new(),
            overlays: Overlays::new(),
            copied_timer: None,
            _tasks: tasks,
        };
        view.refresh_document();
        view
    }

    pub fn mode(&self) -> PlaygroundMode {
        self.mode
    }

    pub fn theme(&self) -> PlaygroundTheme {
        self.theme
    }

    pub fn edgeless_camera(&self) -> edgeless::EdgelessCamera {
        self.edgeless.camera
    }

    pub fn set_edgeless_camera(
        &mut self,
        pan_x: f32,
        pan_y: f32,
        zoom: f32,
        cx: &mut Context<Self>,
    ) {
        self.edgeless.set_camera(pan_x, pan_y, zoom);
        cx.notify();
    }

    pub fn set_edgeless_zoom(&mut self, zoom: f32, cx: &mut Context<Self>) {
        let (vw, vh) = self.edgeless_viewport_size();
        self.edgeless.set_zoom_centered(
            zoom,
            point(px(0.0), px(TOPBAR_HEIGHT)),
            size(px(vw), px(vh)),
        );
        cx.notify();
    }

    pub fn set_edgeless_pan(&mut self, pan_x: f32, pan_y: f32, cx: &mut Context<Self>) {
        self.edgeless.set_pan(pan_x, pan_y);
        cx.notify();
    }

    pub fn edgeless_last_frame_relayouts(&self) -> u64 {
        self.edgeless.last_frame_relayouts
    }

    pub(crate) fn edgeless_viewport_size(&self) -> (f32, f32) {
        let vw = self.window_size.0.max(1.0);
        let vh = (self.window_size.1 - TOPBAR_HEIGHT).max(1.0);
        (vw, vh)
    }

    pub(crate) fn on_edgeless_scroll(
        &mut self,
        event: &ScrollEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let delta = event.delta.pixel_delta(px(SCROLL_LINE));
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        if event.modifiers.control || event.modifiers.platform {
            let factor = (-f32::from(delta.y) * 0.002).exp();
            let target_zoom = self.edgeless.camera.zoom * factor;
            self.edgeless
                .camera
                .zoom_at(target_zoom, event.position, vp_origin);
        } else {
            self.edgeless
                .camera
                .pan_by_screen_delta(f32::from(delta.x), f32::from(delta.y));
        }
        self.edgeless.camera_initialized = true;
        cx.notify();
    }

    pub(crate) fn on_edgeless_pan_start(
        &mut self,
        event: &ui::MouseDownEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.edgeless.drag_pan_anchor = Some(event.position);
        cx.notify();
    }

    pub(crate) fn on_edgeless_pan_end(
        &mut self,
        _: &ui::MouseUpEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.edgeless.drag_pan_anchor.take().is_some() {
            cx.notify();
        }
    }

    pub fn set_theme(&mut self, theme: PlaygroundTheme, cx: &mut Context<Self>) {
        if self.theme != theme {
            self.theme = theme;
            cx.notify();
        }
    }

    /// Document, presence and blobs currently shown.
    pub fn document(&self) -> &DocState {
        &self.state
    }

    /// Replace the shown document, e.g. with one prepared by a host or a test.
    pub fn set_document(&mut self, state: DocState, cx: &mut Context<Self>) {
        self.editor = Default::default();
        self.overlays.reset();
        self.reading_anchor = None;
        self.flow = BlockFlow::new();
        self.layout = None;
        self.state = state;
        self.images.clear();
        self.blob_fetches.clear();
        self.scroll_y = 0.0;
        self.refresh_document();
        cx.notify();
    }

    /// Mutate the shown document and re-read it.
    pub fn edit_document<R>(
        &mut self,
        cx: &mut Context<Self>,
        edit: impl FnOnce(&mut DocState) -> R,
    ) -> R {
        self.capture_reading_anchor();
        let result = edit(&mut self.state);
        self.refresh_document();
        self.resolve_remote_selection(cx);
        cx.notify();
        result
    }

    /// Snapshot of the page currently shown, if its root block exists.
    pub fn page_snapshot(&self) -> Option<&PageSnapshot> {
        self.snapshot.as_deref()
    }

    /// World-space layout painted by the latest Page frame, or the active inline-edited
    /// Edgeless Note/EdgelessText layout when editing on the Edgeless canvas.
    pub fn flow_layout(&self) -> Option<Rc<FlowLayout>> {
        if self.mode == PlaygroundMode::Edgeless
            && let Some((block_id, is_note)) = self.edgeless.authoring.editing_spatial_block()
        {
            return self.edgeless.cached_block_layout(block_id, is_note);
        }
        self.layout.as_ref().map(|(_, layout)| layout.clone())
    }

    pub fn scroll_offset(&self) -> f32 {
        self.scroll_y
    }
    pub(crate) fn capture_reading_anchor(&mut self) {
        if self.reading_anchor.is_none() && self.scroll_y > 0.0 {
            self.reading_anchor = self.flow_layout().and_then(|layout| {
                layout
                    .blocks
                    .iter()
                    .find(|block| block.rect().bottom() > self.scroll_y)
                    .map(|block| (block.block_id.clone(), block.y - self.scroll_y))
            });
        }
    }

    /// Re-read the shown page from the workspace and bring images in line with the blobs.
    pub(crate) fn refresh_document(&mut self) {
        self.dirty_text = None;
        let pages = self.state.workspace.list_pages().unwrap_or_default();
        let titles: BTreeMap<String, String> = pages
            .iter()
            .map(|page| (page.id.clone(), page.title.clone()))
            .collect();
        if titles != self.page_titles {
            self.page_titles = titles;
            self.env_rev += 1;
        }

        self.page_id = pages
            .iter()
            .find(|page| page.id == HOME_PAGE_ID)
            .or(pages.first())
            .map(|page| page.id.clone());
        self.snapshot = self
            .page_id
            .as_deref()
            .and_then(|id| self.state.workspace.page(id))
            .and_then(|page| page.read_page_snapshot().ok())
            .filter(|snapshot| snapshot.root.is_some())
            .map(Rc::new);
        self.doc_rev += 1;
        self.edgeless_refresh_label_editor_from_snapshot();

        let mut referenced = BTreeSet::new();
        for node in self
            .snapshot
            .iter()
            .flat_map(|snapshot| snapshot.root.iter())
            .flat_map(|root| root.walk())
        {
            if let BlockContent::Image { source_id, .. } = &node.content
                && !source_id.is_empty()
            {
                referenced.insert(source_id.clone());
            }
        }
        // Fetches of blobs the page no longer references stop. An ordinary document
        // update never restarts a fetch that is already tracked.
        let images = &mut self.images;
        self.blob_fetches.retain(|source_id, _| {
            let keep = referenced.contains(source_id);
            if !keep {
                images.remove(source_id);
            }
            keep
        });
        for source_id in referenced {
            if let Some(bytes) = self.state.blobs.get(&source_id) {
                // Decoded once; a blob that is no image stays unavailable.
                if !self.images.contains_key(&source_id)
                    || self.blob_fetches.remove(&source_id).is_some()
                {
                    let slot = decode_image(bytes).map_or(ImageSlot::Unavailable, ImageSlot::Ready);
                    self.images.insert(source_id, slot);
                    self.env_rev += 1;
                }
            } else if let Some(room) = &self.room
                && !self.blob_fetches.contains_key(&source_id)
            {
                self.blob_fetches.insert(
                    source_id.clone(),
                    BlobFetchState {
                        in_flight: true,
                        ..BlobFetchState::default()
                    },
                );
                room.link.send(RoomCommand::FetchBlob(source_id));
            }
        }
    }

    pub(crate) fn target_pill_x(mode: PlaygroundMode) -> f64 {
        match mode {
            PlaygroundMode::Page => PILL_PAGE_X,
            PlaygroundMode::Edgeless => PILL_EDGELESS_X,
        }
    }

    pub(crate) fn indicator_x(&self, now_ms: f64) -> f64 {
        match self.pill_motion {
            Some(motion) => motion.value_at(now_ms),
            None => Self::target_pill_x(self.mode),
        }
    }

    pub(crate) fn set_mode(
        &mut self,
        target: PlaygroundMode,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.mode == target {
            return;
        }
        let now_ms = self.now_ms(cx);
        let current_x = self.indicator_x(now_ms);
        // Commit any pending inline Edgeless edit cleanly before switching modes.
        self.edgeless_flush_label_edit(window, cx);
        if self.edgeless.authoring.editing_spatial_block().is_some() {
            self.edgeless.authoring.inline_edit = None;
            self.editor.clear_preedit_state();
            self.editor.selection = None;
            self.announce_selection(cx);
        }
        self.edgeless.authoring.reset_transient();
        self.mode = target;
        self.overlays.reset();
        self.pill_motion = Some(Motion::new(
            current_x,
            Self::target_pill_x(target),
            MotionCurve::EaseInOutCubic,
            now_ms,
            PILL_TRANSITION_MS,
        ));
        cx.notify();
    }

    pub(crate) fn on_scroll(
        &mut self,
        event: &ScrollEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let delta = event.delta.pixel_delta(px(SCROLL_LINE));
        // A sideways scroll over an unwrapped code block scrolls its lines, not the page.
        if let Some((snapshot, layout)) = self.snapshot.clone().zip(self.flow_layout()) {
            let scene = self.overlay_scene(&snapshot, &layout, None);
            if self.overlays.scroll_code(
                &scene,
                f32::from(event.position.x),
                f32::from(event.position.y),
                f32::from(delta.x),
                f32::from(delta.y),
            ) {
                cx.notify();
                return;
            }
        }
        let delta = f32::from(delta.y);
        let target = (self.scroll_y - delta).clamp(0.0, self.max_scroll).round();
        if target != self.scroll_y {
            self.scroll_y = target;
            cx.notify();
        }
    }

    pub(crate) fn ensure_layout(&mut self, width: f32, window: &Window) -> Option<Rc<FlowLayout>> {
        let snapshot = self.snapshot.clone()?;
        let key = (self.doc_rev, width.to_bits(), self.theme, self.env_rev);
        if let Some((cached, layout)) = &self.layout
            && *cached == key
        {
            return Some(layout.clone());
        }
        let snapshot = self.preedit_snapshot().map(Rc::new).unwrap_or(snapshot);
        let dirty = self.dirty_text.take().filter(|_| {
            self.layout
                .as_ref()
                .is_some_and(|(old, _)| old.1 == key.1 && old.2 == key.2 && old.3 == key.3)
        });
        let layout = Rc::new(self.flow.layout_changed(
            &FlowInput {
                snapshot: &snapshot,
                width,
                theme: self.theme,
                page_titles: &self.page_titles,
                images: &self.images,
                env_rev: self.env_rev,
            },
            window,
            dirty.as_ref(),
        ));
        self.dirty_text = Some(BTreeSet::new());
        self.layout = Some((key, layout.clone()));
        Some(layout)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use blocksuite_playground_doc::{
        awareness::RoomAwareness,
        client_id_from_seed,
        schema::{BlockSpec, ListType, ParagraphType},
    };
    use ui::{Bounds, FontWeight, canvas};
    use y_octo::{AHashMap, Any, SessionValue};

    use super::*;
    use crate::{
        block_flow::{
            BOOKMARK_HEIGHT, CHILD_INDENT, CODE_PADDING, CODE_RADIUS, DIVIDER_HEIGHT, FlowKind,
            FlowTextLayout, LIST_PREFIX_WIDTH, QUOTE_BAR_WIDTH, QUOTE_PADDING, TITLE_PADDING_Y,
            TITLE_SPEC, paragraph_spec,
        },
        room_client::RoomFrame,
        theme::{TYPOGRAPHY, tokens},
    };
    use crate::{
        room_client::RoomStatus,
        showcase::{ShowcaseSeed, showcase_gradient_png},
        theme::FONT_SANS,
        view_room::blob_retry_backoff_ms,
    };
    use blocksuite_playground_doc::{
        room::RoomHub,
        session::WorkspaceSession,
        wire::{
            DocMessage, DocSyncState, RoomBinaryFrame, RoomControlFrame, decode_binary_frame,
            decode_control_frame, encode_binary_frame,
        },
    };
    use futures_util::{SinkExt, StreamExt};
    use std::cell::RefCell;
    use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};
    use ui::{
        Application, ApplicationHandle, FrameSnapshot, HeadlessPlatform, HeadlessWindow,
        WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot,
    };

    struct Session {
        platform: Rc<HeadlessPlatform>,
        app: ApplicationHandle,
        window: WindowHandle<PlaygroundView>,
        headless: HeadlessWindow,
    }

    fn open(width: u32, height: u32, options: PlaygroundOptions) -> Session {
        let platform = HeadlessPlatform::new(width, height, 1.0);
        let handle_cell: Rc<RefCell<Option<WindowHandle<PlaygroundView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();
        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_bundled_fonts(cx).expect("register bundled fonts");
            let window = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(width as f32), px(height as f32)),
                        ))),
                        ..WindowOptions::default()
                    },
                    |_, cx| cx.new(|cx| PlaygroundView::with_options(options, cx)),
                )
                .expect("open headless window");
            *handle_out.borrow_mut() = Some(window);
        });
        let window = handle_cell.borrow_mut().take().expect("window opened");
        let headless = platform
            .windows()
            .into_iter()
            .next()
            .expect("headless window registered");
        Session {
            platform,
            app,
            window,
            headless,
        }
    }

    impl Session {
        /// Draw a frame through the real `Window::draw()` and read it back.
        fn frame(&self) -> (FrameSnapshot, image::RgbaImage) {
            self.headless.request_frame();
            self.app.update(|cx| {
                self.window
                    .update(cx, |_, window, _| {
                        let snapshot = window.frame_snapshot().clone();
                        let image = window.render_to_image().expect("render frame");
                        (snapshot, image)
                    })
                    .expect("read frame")
            })
        }

        fn view<R>(
            &self,
            f: impl FnOnce(&mut PlaygroundView, &mut Context<PlaygroundView>) -> R,
        ) -> R {
            self.app.update(|cx| {
                self.window
                    .update(cx, |view, _, cx| f(view, cx))
                    .expect("update view")
            })
        }

        fn click(&self, snapshot: &FrameSnapshot, id: &str) {
            let bounds = snapshot.elements[id].bounds;
            self.headless.simulate_click(point(
                px(bounds.x + bounds.width * 0.5),
                px(bounds.y + bounds.height * 0.5),
            ));
            self.platform.run_until_parked();
        }
    }

    fn assert_no_violations(snapshot: &FrameSnapshot, context: &str) {
        let violations = audit_frame_snapshot(snapshot);
        assert!(violations.is_empty(), "{context}: {violations:#?}");
    }

    fn pixel(image: &image::RgbaImage, x: f32, y: f32) -> [u8; 3] {
        let pixel = image.get_pixel(x as u32, y as u32);
        [pixel[0], pixel[1], pixel[2]]
    }

    fn assert_color(actual: [u8; 3], expected: [u8; 3], what: &str) {
        let close = actual
            .iter()
            .zip(expected)
            .all(|(a, e)| (i32::from(*a) - i32::from(e)).abs() <= 2);
        assert!(close, "{what}: rendered {actual:?}, expected {expected:?}");
    }

    fn token_rgb(color: tokens::Rgba) -> [u8; 3] {
        [color.r, color.g, color.b]
    }

    fn css_px(value: &serde_json::Value) -> f32 {
        value
            .as_str()
            .and_then(|text| text.strip_suffix("px"))
            .and_then(|number| number.parse().ok())
            .unwrap_or_else(|| panic!("not a px value: {value}"))
    }

    /// Parse `rgb(r, g, b)`, `rgba(r, g, b, a)` or `#RRGGBB` as recorded by the oracle.
    fn css_rgb(value: &serde_json::Value) -> [u8; 3] {
        let text = value
            .as_str()
            .unwrap_or_else(|| panic!("not a color: {value}"));
        if let Some(hex) = text.strip_prefix('#') {
            let channel = |index: usize| u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16);
            return [
                channel(0).expect("hex color"),
                channel(1).expect("hex color"),
                channel(2).expect("hex color"),
            ];
        }
        let inner = text
            .split_once('(')
            .and_then(|(_, rest)| rest.strip_suffix(')'))
            .unwrap_or_else(|| panic!("unsupported color: {text}"));
        let mut channels = inner.split(',').map(|part| part.trim().parse::<f32>());
        let mut next = || channels.next().expect("channel").expect("number") as u8;
        [next(), next(), next()]
    }

    fn oracle() -> serde_json::Value {
        serde_json::from_str(include_str!("../../../tokens/style-oracle.json"))
            .expect("style oracle is valid JSON")
    }

    #[test]
    fn headless_playground_renders_and_clicking_edgeless_mutates_snapshot_and_image() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let (page_snap, page_img) = session.frame();
        let page_glyphs = session.app.update(|cx| {
            session
                .window
                .update(cx, |_, window, _| {
                    window.rendered_scene().monochrome_sprites.len()
                })
                .expect("read scene")
        });
        assert!(
            page_glyphs > 50,
            "expected real shaped glyphs in initial frame, got {page_glyphs}"
        );
        assert_no_violations(&page_snap, "Page");

        // Dispatch real click on Edgeless and step scheduler past 200ms transition
        session.click(&page_snap, "chrome.mode_switcher.edgeless");
        session.platform.advance_clock(Duration::from_millis(250));
        let (edgeless_snap, edgeless_img) = session.frame();
        assert_no_violations(&edgeless_snap, "Edgeless");

        let page_ind_x = page_snap.elements["chrome.mode_switcher.indicator"]
            .bounds
            .x;
        let edge_ind_x = edgeless_snap.elements["chrome.mode_switcher.indicator"]
            .bounds
            .x;
        assert!(
            edge_ind_x > page_ind_x + 80.0,
            "indicator did not slide right: page={page_ind_x}, edgeless={edge_ind_x}"
        );
        assert!(edgeless_snap.elements["chrome.mode_switcher.edgeless"].focused);
        assert!(!edgeless_snap.elements["chrome.mode_switcher.page"].focused);
        assert_eq!(
            page_snap.elements["page.title_block"].text.as_deref(),
            Some("Native BlockSuite Playground")
        );
        assert!(
            edgeless_snap.elements.contains_key("edgeless.viewport"),
            "edgeless viewport missing from FrameSnapshot"
        );
        assert!(
            edgeless_snap.elements.contains_key("chrome.edgeless_zoom"),
            "edgeless zoom bar missing from FrameSnapshot"
        );
        assert!(
            !edgeless_snap.elements.contains_key("page.title_block"),
            "page.title_block should not remain mounted in Edgeless mode"
        );
        assert_ne!(
            page_img.as_raw(),
            edgeless_img.as_raw(),
            "clicking Edgeless must produce a visibly different rendered PNG"
        );
    }

    #[test]
    fn variable_font_bold_increases_advance_width_and_rasterized_ink() {
        use ui::Platform as _;

        let platform = HeadlessPlatform::new(1280, 800, 1.0);
        let text = "Native BlockSuite Playground";
        let font_size = px(24.0);

        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_bundled_fonts(cx).expect("register bundled fonts");
        });

        let (width_400, ink_400, width_700, ink_700, mono_width) = app.update(|cx| {
            let platform_ts = platform.text_system();

            let measure = |family: &'static str, weight: FontWeight| -> (f32, u64) {
                let mut font = ui::font(family);
                font.weight = weight;
                let font_id = cx.text_system().resolve_font(&font);
                let layout = platform_ts.layout_line(
                    text,
                    font_size,
                    &[ui::FontRun {
                        len: text.len(),
                        font_id,
                    }],
                );
                let mut ink: u64 = 0;
                for run in &layout.runs {
                    for glyph in &run.glyphs {
                        let params = ui::RenderGlyphParams {
                            font_id: run.font_id,
                            glyph_id: glyph.id,
                            font_size,
                            subpixel_variant: point(0, 0),
                            scale_factor: 1.0,
                            is_emoji: glyph.is_emoji,
                            subpixel_rendering: false,
                            dilation: 0,
                        };
                        if let Ok(bounds) = platform_ts.glyph_raster_bounds(&params)
                            && bounds.size.width.0 > 0
                            && bounds.size.height.0 > 0
                        {
                            let (_, bitmap) = platform_ts
                                .rasterize_glyph(&params, bounds)
                                .expect("rasterize glyph");
                            ink += bitmap.iter().map(|&b| u64::from(b)).sum::<u64>();
                        }
                    }
                }
                (f32::from(layout.width), ink)
            };

            let (w400, i400) = measure(FONT_SANS, FontWeight::NORMAL);
            let (w700, i700) = measure(FONT_SANS, FontWeight::BOLD);
            let (mono, _) = measure(theme::FONT_CODE, FontWeight::NORMAL);
            (w400, i400, w700, i700, mono)
        });

        assert!(
            width_700 > width_400,
            "expected Bold (700) advance width > Regular (400): bold={width_700}, regular={width_400}"
        );
        assert!(
            ink_700 * 100 > ink_400 * 115,
            "expected Bold (700) rasterized ink > 1.15x Regular (400): bold={ink_700}, regular={ink_400}"
        );
        // IBM Plex Mono is registered: every glyph advances exactly 0.6em.
        let expected_mono = text.chars().count() as f32 * 24.0 * 0.6;
        assert!(
            (mono_width - expected_mono).abs() < 1.0,
            "expected monospace advance {expected_mono}, got {mono_width}"
        );
    }

    #[test]
    fn showcase_covers_every_block_kind_with_zero_violations_across_themes_and_viewports() {
        for (width, height) in [(1280_u32, 1700_u32), (800, 1900), (390, 2800), (320, 3600)] {
            for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
                let context = format!("{width}x{height} {}", theme.as_str());
                let session = open(
                    width,
                    height,
                    PlaygroundOptions {
                        theme,
                        ..PlaygroundOptions::default()
                    },
                );
                let (snapshot, _) = session.frame();
                assert_no_violations(&snapshot, &context);

                let layout = session.view(|view, _| view.flow_layout().expect("page layout"));
                assert!(
                    layout.height <= height as f32 - TOPBAR_HEIGHT,
                    "{context}: page is {} tall; raise the test viewport",
                    layout.height
                );
                for kind in [
                    FlowKind::Title,
                    FlowKind::Paragraph(ParagraphType::H1),
                    FlowKind::Paragraph(ParagraphType::H2),
                    FlowKind::Paragraph(ParagraphType::Text),
                    FlowKind::Paragraph(ParagraphType::Quote),
                    FlowKind::List(ListType::Bulleted),
                    FlowKind::List(ListType::Numbered),
                    FlowKind::List(ListType::Todo),
                    FlowKind::List(ListType::Toggle),
                    FlowKind::Divider,
                    FlowKind::Code,
                    FlowKind::Bookmark,
                    FlowKind::Image,
                    FlowKind::Unknown,
                ] {
                    assert!(
                        layout.blocks.iter().any(|block| block.body.kind == kind),
                        "{context}: no {kind:?} block laid out"
                    );
                }

                let column = page_geometry(width as f32);
                for block in &layout.blocks {
                    // Every block is on the pixel grid, inside the column, and recorded.
                    let element = snapshot
                        .elements
                        .get(block.snapshot_id.as_ref())
                        .unwrap_or_else(|| panic!("{context}: {} not recorded", block.snapshot_id));
                    assert!(
                        element.bounds.x >= column.column_x
                            && element.bounds.right() <= column.column_x + column.column_width,
                        "{context}: {} overflows the column: {:?}",
                        block.snapshot_id,
                        element.bounds
                    );
                    // Wrapped text never extends past its block.
                    if let Some(text) = &block.body.text {
                        assert!(
                            text.x + text.layout.content_width() <= block.body.width + 0.5,
                            "{context}: text of {} is {} wide in a {} wide block",
                            block.snapshot_id,
                            text.x + text.layout.content_width(),
                            block.body.width
                        );
                    }
                }
                assert_eq!(
                    snapshot.elements["page.block.showcase-database"]
                        .text
                        .as_deref(),
                    Some("[Unsupported block: affine:database]")
                );
                // The image blob decoded: the block shows the picture, not the loading frame.
                assert_ne!(
                    snapshot.elements["page.block.showcase-image"]
                        .text
                        .as_deref(),
                    Some("Loading image")
                );
            }
        }
    }

    /// Title, every heading, a paragraph, a quote, a three-line code block and a divider.
    fn oracle_document() -> DocState {
        let mut state = DocState::new("oracle", client_id_from_seed(0x0c1e)).expect("state");
        state.workspace.initialize_meta().expect("meta");
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Oracle", 1)
            .expect("page");
        let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        let mut seed = ShowcaseSeed { page, now_ms: 0 };
        seed.add(
            "o-page",
            BlockSpec::Page {
                title: "Oracle".to_string(),
            },
            None,
        )
        .expect("page block");
        seed.add("o-note", BlockSpec::Note { xywh: None }, Some("o-page"))
            .expect("note");
        for (id, kind, text) in [
            ("o-h1", ParagraphType::H1, "Heading 1"),
            ("o-h2", ParagraphType::H2, "Heading 2"),
            ("o-h3", ParagraphType::H3, "Heading 3"),
            ("o-h4", ParagraphType::H4, "Heading 4"),
            ("o-h5", ParagraphType::H5, "Heading 5"),
            ("o-h6", ParagraphType::H6, "Heading 6"),
            ("o-text", ParagraphType::Text, "Paragraph"),
            ("o-quote", ParagraphType::Quote, "Quote"),
        ] {
            seed.paragraph(id, kind, text, "o-note").expect("paragraph");
        }
        seed.add(
            "o-code",
            BlockSpec::Code {
                text: "one\ntwo\nthree".to_string(),
                language: Some("rust".to_string()),
                caption: String::new(),
            },
            Some("o-note"),
        )
        .expect("code");
        seed.add("o-divider", BlockSpec::Divider, Some("o-note"))
            .expect("divider");
        state
    }

    #[test]
    fn tokens_and_block_metrics_match_the_style_oracle_in_light_and_dark() {
        let oracle = oracle();
        let mut light_geometry: Vec<(String, ui::SnapshotRect)> = Vec::new();

        for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
            let name = theme.as_str();
            let themed = &oracle["themes"][name];
            let vars = &themed["root_css_vars"];
            let blocks = &themed["page_blocks"];
            let inline = &themed["inline_formats"];
            let tokens = theme.tokens();

            // L1: generated tokens against the browser's resolved CSS variables.
            for (token, var) in [
                (tokens.text_primary, "--affine-text-primary-color"),
                (tokens.text_secondary, "--affine-text-secondary-color"),
                (
                    tokens.background_primary,
                    "--affine-background-primary-color",
                ),
                (
                    tokens.background_code_block,
                    "--affine-background-code-block",
                ),
                (tokens.divider, "--affine-divider-color"),
                (tokens.quote, "--affine-quote-color"),
                (tokens.link, "--affine-link-color"),
            ] {
                assert_eq!(token_rgb(token), css_rgb(&vars[var]), "{name} {var}");
            }
            for (value, var) in [
                (TYPOGRAPHY.font_base_px, "--affine-font-base"),
                (TYPOGRAPHY.font_sm_px, "--affine-font-sm"),
                (TYPOGRAPHY.font_xs_px, "--affine-font-xs"),
                (TYPOGRAPHY.font_h1_px, "--affine-font-h-1"),
                (TYPOGRAPHY.font_h2_px, "--affine-font-h-2"),
                (TYPOGRAPHY.font_h3_px, "--affine-font-h-3"),
                (TYPOGRAPHY.font_h4_px, "--affine-font-h-4"),
                (TYPOGRAPHY.font_h5_px, "--affine-font-h-5"),
                (TYPOGRAPHY.font_h6_px, "--affine-font-h-6"),
                (block_flow::EDITOR_WIDTH, "--affine-editor-width"),
                (TYPOGRAPHY.paragraph_space_px, "--affine-paragraph-space"),
            ] {
                assert_eq!(value, css_px(&vars[var]), "{name} {var}");
            }

            // L1: typography and box metrics of each block against computed styles.
            let title = &blocks["page_title"]["computed"];
            assert_eq!(TITLE_SPEC.font_size, css_px(&title["font_size"]));
            assert_eq!(TITLE_SPEC.line_height, css_px(&title["line_height"]));
            assert_eq!(TITLE_SPEC.font_weight.to_string(), title["font_weight"]);
            assert_eq!(title["letter_spacing"], "normal");
            assert_eq!(TITLE_SPEC.letter_spacing, 0.0);
            // The browser reports a baseline one pixel apart between its two theme passes;
            // the light pass is the reference.
            let baseline_slack = if theme == PlaygroundTheme::Light {
                0.0
            } else {
                1.0
            };
            let title_baseline = blocks["page_title"]["baseline_offset_px"].as_f64().unwrap();
            assert!(
                (TITLE_SPEC.baseline - title_baseline as f32).abs() <= baseline_slack,
                "{name} title baseline {title_baseline}"
            );
            assert_eq!(
                token_rgb(tokens.text_primary),
                css_rgb(&title["color"]),
                "{name} title color"
            );
            for (key, kind) in [
                ("h1", ParagraphType::H1),
                ("h2", ParagraphType::H2),
                ("h3", ParagraphType::H3),
                ("h4", ParagraphType::H4),
                ("h5", ParagraphType::H5),
                ("h6", ParagraphType::H6),
                ("paragraph_rich", ParagraphType::Text),
                ("quote", ParagraphType::Quote),
            ] {
                let computed = &blocks[key]["computed"];
                let spec = paragraph_spec(kind);
                assert_eq!(spec.font_size, css_px(&computed["font_size"]), "{key} size");
                assert_eq!(
                    spec.font_weight.to_string(),
                    computed["font_weight"],
                    "{key} weight"
                );
                assert_eq!(
                    spec.line_height,
                    css_px(&computed["line_height"]),
                    "{key} line height"
                );
                // The wrapper margin collapses with the block container's 10px margin.
                assert_eq!(
                    spec.margin_top,
                    css_px(&computed["margin_top"]).max(block_flow::TEXT_BLOCK_MARGIN),
                    "{key} margin top"
                );
                assert_eq!(
                    spec.margin_bottom,
                    css_px(&computed["margin_bottom"]).max(block_flow::TEXT_BLOCK_MARGIN),
                    "{key} margin bottom"
                );
                let letter_spacing = match computed["letter_spacing"].as_str() {
                    Some("normal") => 0.0,
                    _ => css_px(&computed["letter_spacing"]),
                };
                assert_eq!(spec.letter_spacing, letter_spacing, "{key} letter spacing");
                // Measured from the top of the wrapper, so below its top padding.
                let baseline = blocks[key]["baseline_offset_px"].as_f64().unwrap() as f32
                    - css_px(&computed["padding_top"]);
                assert!(
                    (spec.baseline - baseline).abs() <= baseline_slack,
                    "{name} {key} baseline {baseline} vs {}",
                    spec.baseline
                );
                assert_eq!(
                    token_rgb(tokens.text_primary),
                    css_rgb(&computed["color"]),
                    "{name} {key} color"
                );
            }
            let quote = &blocks["quote"]["computed"];
            assert_eq!(QUOTE_PADDING.0, css_px(&quote["padding_left"]));
            assert_eq!(QUOTE_PADDING.1, css_px(&quote["padding_top"]));
            assert_eq!(QUOTE_PADDING.2, css_px(&quote["padding_bottom"]));
            let bar = &themed["quote_accent_bar"];
            assert_eq!(QUOTE_BAR_WIDTH, css_px(&bar["width"]));
            assert_eq!(QUOTE_PADDING.1, css_px(&bar["margin_top"]));
            assert_eq!(token_rgb(tokens.quote), css_rgb(&bar["background_color"]));

            let code = &blocks["code"]["computed"];
            assert_eq!(CODE_PADDING.0, css_px(&code["padding_top"]));
            assert_eq!(CODE_PADDING.0, css_px(&code["padding_bottom"]));
            assert_eq!(CODE_PADDING.1, css_px(&code["padding_left"]));
            assert_eq!(CODE_PADDING.1, css_px(&code["padding_right"]));
            assert_eq!(CODE_RADIUS, css_px(&code["border_radius"]));
            assert_eq!(
                token_rgb(tokens.background_code_block),
                css_rgb(&code["background_color"])
            );
            let code_text = &blocks["code_inline_editor"]["computed"];
            assert_eq!(TYPOGRAPHY.font_xs_px, css_px(&code_text["font_size"]));
            assert_eq!(
                TYPOGRAPHY.font_xs_px + 8.0,
                css_px(&code_text["line_height"])
            );
            assert!(
                code_text["font_family"]
                    .as_str()
                    .is_some_and(|family| family.starts_with("\"IBM Plex Mono\"")),
                "code font family"
            );

            let divider = &blocks["divider"];
            assert_eq!(DIVIDER_HEIGHT, divider["rect"]["height"]);
            assert_eq!(
                TYPOGRAPHY.paragraph_space_px,
                css_px(&divider["computed"]["margin_top"])
            );
            assert_eq!(
                token_rgb(tokens.divider),
                css_rgb(&blocks["divider_hr"]["computed"]["border_top_color"])
            );

            let palette = theme.palette();
            let bookmark = &blocks["bookmark"];
            assert_eq!(BOOKMARK_HEIGHT, bookmark["rect"]["height"]);
            assert_eq!(
                Some(palette.card_border),
                theme.css_color(&format!(
                    "#{:02x}{:02x}{:02x}",
                    css_rgb(&bookmark["computed"]["border_top_color"])[0],
                    css_rgb(&bookmark["computed"]["border_top_color"])[1],
                    css_rgb(&bookmark["computed"]["border_top_color"])[2],
                )),
                "{name} bookmark border"
            );
            let inline_code = &inline["inline_code"]["computed"];
            assert_eq!(
                TYPOGRAPHY.font_base_px - 3.0,
                css_px(&inline_code["font_size"])
            );
            assert_eq!(
                token_rgb(tokens.background_code_block),
                css_rgb(&inline_code["background_color"])
            );
            assert_eq!(
                token_rgb(tokens.border),
                css_rgb(&inline_code["border_top_color"])
            );
            assert_eq!(
                token_rgb(tokens.link),
                css_rgb(&inline["link"]["computed"]["color"])
            );

            // L2: the rendered frame against the oracle's layout rectangles.
            let session = open(
                1280,
                1400,
                PlaygroundOptions {
                    theme,
                    ..PlaygroundOptions::default()
                },
            );
            session.view(|view, cx| view.set_document(oracle_document(), cx));
            let (snapshot, image) = session.frame();
            assert_no_violations(&snapshot, name);

            let column = page_geometry(1280.0);
            let title = snapshot.elements["page.title_block"].bounds;
            assert_eq!(title.x, column.column_x);
            assert_eq!(title.y, TOPBAR_HEIGHT + TITLE_PADDING_Y);
            assert_eq!(title.width, blocks["page_title"]["rect"]["width"]);
            assert_eq!(title.height, blocks["page_title"]["rect"]["height"]);
            let note_top = title.bottom() + TITLE_PADDING_Y;

            let light_blocks = &oracle["themes"]["light"]["page_blocks"];
            let mut geometry = Vec::new();
            for (id, key) in [
                ("o-h1", "h1"),
                ("o-h2", "h2"),
                ("o-h3", "h3"),
                ("o-h4", "h4"),
                ("o-h5", "h5"),
                ("o-h6", "h6"),
                ("o-text", "paragraph_rich"),
                ("o-quote", "quote"),
            ] {
                let bounds = snapshot.elements[&format!("page.block.{id}")].bounds;
                // Plain single-line blocks stack exactly like the light oracle page.
                let rect = &light_blocks[key]["rect"];
                assert_eq!(bounds.x - column.column_x, rect["x"], "{name} {id} x");
                assert_eq!(bounds.y - note_top, rect["y"], "{name} {id} y");
                assert_eq!(bounds.width, rect["width"], "{name} {id} width");
                assert_eq!(bounds.height, rect["height"], "{name} {id} height");
                // The dark oracle paragraph holds taller inline content; headings and the
                // quote match the themed oracle as well.
                if key != "paragraph_rich" {
                    assert_eq!(bounds.height, blocks[key]["rect"]["height"], "{name} {id}");
                }
                geometry.push((id.to_string(), bounds));
            }
            let quote = snapshot.elements["page.block.o-quote"].bounds;
            let code = snapshot.elements["page.block.o-code"].bounds;
            let divider = snapshot.elements["page.block.o-divider"].bounds;
            assert_eq!(code.y, quote.bottom() + block_flow::CARD_BLOCK_MARGIN);
            assert_eq!(code.height, blocks["code"]["rect"]["height"]);
            assert_eq!(code.width, blocks["code"]["rect"]["width"]);
            // Code's 18px bottom margin wins over the divider's 8px top margin.
            assert_eq!(divider.y, code.bottom() + block_flow::CARD_BLOCK_MARGIN);
            assert_eq!(divider.height, DIVIDER_HEIGHT);
            geometry.push(("o-code".to_string(), code));
            geometry.push(("o-divider".to_string(), divider));

            // Painted pixels carry the oracle colors.
            assert_color(
                pixel(&image, 20.0, 600.0),
                token_rgb(tokens.background_primary),
                "page background",
            );
            assert_color(
                pixel(&image, code.x + 300.0, code.y + 6.0),
                token_rgb(tokens.background_code_block),
                "code block background",
            );
            assert_color(
                pixel(&image, divider.x + 100.0, divider.y + DIVIDER_HEIGHT / 2.0),
                token_rgb(tokens.divider),
                "divider line",
            );
            assert_color(
                pixel(&image, quote.x, quote.y + 20.0),
                token_rgb(tokens.quote),
                "quote accent bar",
            );

            // Switching the theme recolors the page without moving a block.
            if theme == PlaygroundTheme::Light {
                light_geometry = geometry;
            } else {
                assert_eq!(light_geometry, geometry);
            }
        }
    }

    #[test]
    fn list_prefixes_sit_on_the_first_line_and_children_indent_and_collapse() {
        let long = "wraps onto a second line because it carries far more words than \
            one row of the page column can hold at its regular width, even on a wide window";
        let mut state = DocState::new("lists", client_id_from_seed(0x1157)).expect("state");
        state.workspace.initialize_meta().expect("meta");
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Lists", 1)
            .expect("page");
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
            let mut seed = ShowcaseSeed { page, now_ms: 0 };
            seed.add(
                "l-page",
                BlockSpec::Page {
                    title: "Lists".to_string(),
                },
                None,
            )
            .expect("page block");
            seed.add("l-note", BlockSpec::Note { xywh: None }, Some("l-page"))
                .expect("note");
            for (id, kind) in [
                ("l-bullet", ListType::Bulleted),
                ("l-number", ListType::Numbered),
                ("l-todo", ListType::Todo),
                ("l-toggle", ListType::Toggle),
            ] {
                seed.list(id, kind, &format!("{kind:?} item {long}"), false, "l-note")
                    .expect("list");
            }
        }

        let session = open(1280, 900, PlaygroundOptions::default());
        session.view(|view, cx| view.set_document(state, cx));
        let (snapshot, _) = session.frame();
        assert_no_violations(&snapshot, "lists");
        let layout = session.view(|view, _| view.flow_layout().expect("layout"));
        for id in ["l-bullet", "l-number", "l-todo", "l-toggle"] {
            let body = &layout.block(id).expect("list block").body;
            let text = body.text.as_ref().expect("list text");
            assert!(text.layout.line_count() >= 2, "{id} should wrap");
            assert_eq!(body.height, text.layout.height(), "{id} height");
            let prefix = body.prefix.expect("list prefix");
            let first_line_center = text.layout.line_height() / 2.0;
            let prefix_center = prefix.y + prefix.h / 2.0;
            assert!(
                (prefix_center - first_line_center).abs() <= 1.0,
                "{id} prefix center {prefix_center} is off the first line center {first_line_center}"
            );
            assert!(
                prefix.right() <= text.x,
                "{id} prefix overlaps the text column"
            );
        }

        // The showcase nests lists, keeps an open toggle's child and hides a collapsed one.
        let session = open(1280, 1700, PlaygroundOptions::default());
        session.frame();
        let layout = session.view(|view, _| view.flow_layout().expect("layout"));
        let block = |id: &str| layout.block(id).unwrap_or_else(|| panic!("{id} laid out"));
        assert_eq!(block("showcase-bullet").x, 0.0);
        assert_eq!(block("showcase-bullet-nested").x, CHILD_INDENT);
        assert_eq!(block("showcase-bullet-deep").x, 2.0 * CHILD_INDENT);
        assert_eq!(block("showcase-toggle-open-child").x, CHILD_INDENT);
        assert!(layout.block("showcase-toggle-closed-child").is_none());
        // Sibling margins collapse to a single 10px gap, also after nested children.
        let gap = |above: &str, below: &str| block(below).y - block(above).rect().bottom();
        assert_eq!(gap("showcase-bullet", "showcase-bullet-nested"), 10.0);
        assert_eq!(gap("showcase-bullet-deep", "showcase-numbered-1"), 10.0);
        assert_eq!(gap("showcase-toggle-closed", "showcase-divider"), 10.0);
        assert_eq!(gap("showcase-divider", "showcase-code"), 18.0);
        assert_eq!(gap("showcase-code", "showcase-bookmark"), 18.0);
    }

    #[test]
    fn editing_one_block_lays_out_only_that_block_again() {
        let session = open(1280, 800, PlaygroundOptions::default());
        session.frame();
        let first = session.view(|view, _| view.flow_layout().expect("layout"));
        assert_eq!(first.stats.laid_out, first.blocks.len());
        assert_eq!(first.stats.reused, 0);

        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                state
                    .workspace
                    .page_mut(HOME_PAGE_ID)
                    .expect("showcase page")
                    .insert_text("showcase-quote", "prop:text", 0, "Edited. ", 900_000)
                    .expect("insert text");
            });
        });
        let (snapshot, _) = session.frame();
        let second = session.view(|view, _| view.flow_layout().expect("layout"));
        assert_eq!(second.blocks.len(), first.blocks.len());
        assert_eq!(
            second.stats.laid_out, 1,
            "only the edited quote is laid out"
        );
        assert_eq!(second.stats.reused, first.blocks.len() - 1);
        assert!(
            snapshot.elements["page.block.showcase-quote"]
                .text
                .as_deref()
                .is_some_and(|text| text.starts_with("Edited. "))
        );
    }

    #[test]
    fn theme_toggle_and_remote_presence_render_in_chrome_and_page() {
        let peer = client_id_from_seed(0x0ada);
        let session = open(1280, 800, PlaygroundOptions::default());
        let (light, light_image) = session.frame();
        assert_no_violations(&light, "light");
        assert_eq!(
            light.elements["chrome.theme_toggle"].text.as_deref(),
            Some("Light")
        );
        assert_color(
            pixel(&light_image, 20.0, 400.0),
            token_rgb(tokens::LIGHT_THEME.background_primary),
            "light page background",
        );

        // The collaborator shows as a badge in the top bar and as caret + name tag in the page.
        let badge = &light.elements[&format!("chrome.presence.{peer}")];
        assert_eq!(badge.text.as_deref(), Some(SHOWCASE_PEER_NAME));
        let caret = light.elements[&format!("page.presence.{peer}.caret")].bounds;
        let label = &light.elements[&format!("page.presence.{peer}.label")];
        assert_eq!(label.text.as_deref(), Some(SHOWCASE_PEER_NAME));
        let intro = light.elements["page.block.showcase-intro"].bounds;
        assert!(caret.x >= intro.x && caret.right() <= intro.right());
        assert!(caret.y >= intro.y && caret.bottom() <= intro.bottom());
        assert_eq!(
            label.bounds.bottom(),
            caret.y,
            "name tag hangs above the caret"
        );
        assert!(label.bounds.x >= intro.x && label.bounds.right() <= intro.right());
        // The caret is painted in the collaborator's color.
        let purple = tokens::LIGHT_THEME
            .color("--affine-multi-players-purple")
            .expect("presence color token");
        assert_color(
            pixel(&light_image, caret.x, caret.y + caret.height / 2.0),
            token_rgb(purple),
            "remote caret",
        );

        session.click(&light, "chrome.theme_toggle");
        let (dark, dark_image) = session.frame();
        assert_no_violations(&dark, "dark");
        assert_eq!(session.view(|view, _| view.theme()), PlaygroundTheme::Dark);
        assert_eq!(
            dark.elements["chrome.theme_toggle"].text.as_deref(),
            Some("Dark")
        );
        assert_color(
            pixel(&dark_image, 20.0, 400.0),
            token_rgb(tokens::DARK_THEME.background_primary),
            "dark page background",
        );
        // Same elements at the same places: only colors change with the theme.
        assert_eq!(
            light.elements.keys().collect::<Vec<_>>(),
            dark.elements.keys().collect::<Vec<_>>()
        );
        for (id, element) in &light.elements {
            assert_eq!(element.bounds, dark.elements[id].bounds, "{id}");
        }

        // A narrow window keeps the badge as an initial and never overlaps the switcher.
        let narrow = open(390, 800, PlaygroundOptions::default());
        let (snapshot, _) = narrow.frame();
        assert_no_violations(&snapshot, "narrow");
        let switcher = snapshot.elements["chrome.mode_switcher"].bounds;
        let badge = snapshot.elements[&format!("chrome.presence.{peer}")].bounds;
        let toggle = snapshot.elements["chrome.theme_toggle"].bounds;
        assert!(
            switcher.right() <= badge.x,
            "badge overlaps the mode switcher"
        );
        assert!(badge.right() <= toggle.x);
        assert!(toggle.right() <= 390.0);
        assert_eq!((badge.width, badge.height), (24.0, 24.0));
    }

    /// Content that stresses the layout: an empty title, a collapsed heading, an unbroken
    /// long word, decorated inline runs, a hard break, images without usable bytes, a bare
    /// bookmark, an empty code block, an Edgeless-only note and a second page note.
    fn edge_document() -> DocState {
        let mut state = DocState::new("edge", client_id_from_seed(0x0ed6)).expect("state");
        state.workspace.initialize_meta().expect("meta");
        state
            .workspace
            .create_page(HOME_PAGE_ID, "", 1)
            .expect("page");
        state
            .blobs
            .insert("broken".to_string(), Arc::new(b"not an image".to_vec()));
        let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        let mut seed = ShowcaseSeed { page, now_ms: 0 };
        seed.add(
            "e-page",
            BlockSpec::Page {
                title: String::new(),
            },
            None,
        )
        .expect("page block");
        seed.add("e-note", BlockSpec::Note { xywh: None }, Some("e-page"))
            .expect("note");
        let note = "e-note";

        seed.paragraph("e-collapsed", ParagraphType::H2, "Collapsed section", note)
            .expect("heading");
        seed.paragraph(
            "e-hidden-child",
            ParagraphType::Text,
            "Hidden child",
            "e-collapsed",
        )
        .expect("paragraph");
        seed.paragraph("e-hidden", ParagraphType::Text, "Hidden paragraph", note)
            .expect("paragraph");
        seed.paragraph("e-hidden-h3", ParagraphType::H3, "Hidden subsection", note)
            .expect("heading");
        seed.paragraph("e-next", ParagraphType::H2, "Next section", note)
            .expect("heading");
        let now_ms = seed.tick();
        seed.page
            .set_block_prop(
                "e-collapsed",
                "prop:collapsed",
                SessionValue::Any(Any::True),
                now_ms,
            )
            .expect("collapse");

        let long_word = format!(
            "https://example.com/{}",
            "a-very-long-path-segment/".repeat(12)
        );
        seed.paragraph("e-long", ParagraphType::Text, &long_word, note)
            .expect("paragraph");

        let marks = "underlined struck highlighted colored plain";
        seed.paragraph("e-marks", ParagraphType::Text, marks, note)
            .expect("paragraph");
        seed.mark("e-marks", marks, "underlined", "underline", Any::True)
            .expect("mark");
        seed.mark("e-marks", marks, "struck", "strike", Any::True)
            .expect("mark");
        seed.mark(
            "e-marks",
            marks,
            "highlighted",
            "background",
            Any::String("var(--affine-text-highlight-orange)".to_string()),
        )
        .expect("mark");
        seed.mark(
            "e-marks",
            marks,
            "colored",
            "color",
            Any::String("var(--affine-text-highlight-foreground-blue)".to_string()),
        )
        .expect("mark");

        seed.paragraph("e-break", ParagraphType::Text, "line one\nline two", note)
            .expect("paragraph");
        for (id, source) in [
            ("e-image-missing", "missing-blob"),
            ("e-image-broken", "broken"),
        ] {
            seed.add(
                id,
                BlockSpec::Image {
                    source_id: source.to_string(),
                    caption: String::new(),
                    width: 300.0,
                    height: 120.0,
                    xywh: None,
                },
                Some(note),
            )
            .expect("image");
        }
        seed.add(
            "e-bookmark",
            BlockSpec::Bookmark {
                url: "https://example.org/some/path".to_string(),
                title: None,
                description: None,
            },
            Some(note),
        )
        .expect("bookmark");
        seed.add(
            "e-code",
            BlockSpec::Code {
                text: String::new(),
                language: None,
                caption: "Empty listing".to_string(),
            },
            Some(note),
        )
        .expect("code");

        seed.add(
            "e-edgeless-note",
            BlockSpec::Note { xywh: None },
            Some("e-page"),
        )
        .expect("note");
        seed.paragraph(
            "e-edgeless-text",
            ParagraphType::Text,
            "Only on the canvas",
            "e-edgeless-note",
        )
        .expect("paragraph");
        let now_ms = seed.tick();
        seed.page
            .set_block_prop(
                "e-edgeless-note",
                "prop:displayMode",
                SessionValue::Any(Any::String("edgeless".to_string())),
                now_ms,
            )
            .expect("display mode");
        seed.add(
            "e-second-note",
            BlockSpec::Note { xywh: None },
            Some("e-page"),
        )
        .expect("note");
        seed.paragraph(
            "e-second",
            ParagraphType::Text,
            "Second note",
            "e-second-note",
        )
        .expect("paragraph");
        state
    }

    #[test]
    fn edge_content_wraps_collapses_and_degrades_without_violations() {
        for (width, theme) in [
            (1280_u32, PlaygroundTheme::Light),
            (390, PlaygroundTheme::Dark),
        ] {
            let context = format!("{width} {}", theme.as_str());
            let session = open(
                width,
                2000,
                PlaygroundOptions {
                    theme,
                    ..PlaygroundOptions::default()
                },
            );
            session.view(|view, cx| view.set_document(edge_document(), cx));
            let (snapshot, _) = session.frame();
            assert_no_violations(&snapshot, &context);
            let layout = session.view(|view, _| view.flow_layout().expect("layout"));
            let block = |id: &str| layout.block(id).unwrap_or_else(|| panic!("{id} laid out"));
            let text_of = |id: &str| {
                snapshot.elements[&format!("page.block.{id}")]
                    .text
                    .clone()
                    .unwrap_or_default()
            };

            // An empty title shows its placeholder.
            assert_eq!(
                snapshot.elements["page.title_block"].text.as_deref(),
                Some("Title")
            );
            // A collapsed heading hides its own children and what follows up to the next
            // heading of its level.
            assert!(layout.block("e-hidden-child").is_none(), "{context}");
            assert!(layout.block("e-hidden").is_none(), "{context}");
            let marker_x = snapshot.elements["page.block.e-collapsed"].bounds.x - 20.0;
            assert!(
                marker_x >= 0.0,
                "{context}: collapse marker fits the side padding"
            );
            assert!(layout.block("e-hidden-h3").is_none(), "{context}");
            assert_eq!(text_of("e-next"), "Next section");
            assert_eq!(block("e-next").x, 0.0);
            assert_eq!(
                block("e-next").y - block("e-collapsed").rect().bottom(),
                paragraph_spec(ParagraphType::H2).margin_top
            );

            // A word wider than the column breaks inside the word instead of overflowing.
            let long = block("e-long");
            let long_text = long.body.text.as_ref().expect("text");
            assert!(long_text.layout.line_count() >= 2, "{context}");
            assert!(long_text.layout.content_width() <= long.body.width + 0.5);
            // A hard break starts a new line.
            let broken = block("e-break").body.text.as_ref().expect("text");
            assert_eq!(broken.layout.line_count(), 2, "{context}");
            assert_eq!(block("e-marks").body.height, 23.0, "{context}");

            // Images without usable bytes keep their frame and say why.
            assert_eq!(text_of("e-image-missing"), "Loading image");
            assert_eq!(text_of("e-image-broken"), "Image unavailable");
            let frame_width = 300.0_f32.min(long.body.width);
            assert_eq!(
                block("e-image-missing").body.height,
                (120.0 * frame_width / 300.0).round()
            );
            // A bookmark without metadata falls back to its host name.
            assert_eq!(text_of("e-bookmark"), "example.org");
            // An empty code block still has one line, plus its caption.
            assert_eq!(
                block("e-code").body.height,
                2.0 * CODE_PADDING.0 + 20.0 + 4.0 + 22.0
            );

            // The Edgeless-only note is skipped; the next page note starts a fresh flow.
            assert!(layout.block("e-edgeless-text").is_none(), "{context}");
            assert_eq!(
                block("e-second").y,
                block("e-code").rect().bottom()
                    + block_flow::CARD_BLOCK_MARGIN
                    + block_flow::TEXT_BLOCK_MARGIN
            );
        }
    }

    #[test]
    fn scrolling_maps_world_space_onto_the_viewport_and_clamps_at_both_ends() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let (top, _) = session.frame();
        let scroll = |delta_y: f32| {
            let position = point(px(640.0), px(400.0));
            session
                .headless
                .dispatch_input(ui::PlatformInput::MouseMove(ui::MouseMoveEvent {
                    position,
                    pressed_button: None,
                    modifiers: ui::Modifiers::default(),
                }));
            session
                .headless
                .dispatch_input(ui::PlatformInput::Scroll(ScrollEvent {
                    position,
                    delta: ui::ScrollDelta::Pixels(point(px(0.0), px(delta_y))),
                    modifiers: ui::Modifiers::default(),
                    touch_phase: ui::TouchPhase::Moved,
                    source: ui::ScrollSource::Pointer,
                }));
            session.platform.run_until_parked();
        };

        // Scrolling moves every block by the same amount and nothing sideways.
        scroll(-300.0);
        let (scrolled, _) = session.frame();
        assert_no_violations(&scrolled, "scrolled");
        let before = top.elements["page.block.showcase-quote"].bounds;
        let after = scrolled.elements["page.block.showcase-quote"].bounds;
        assert_eq!((after.x, after.y), (before.x, before.y - 300.0));
        assert_eq!((after.width, after.height), (before.width, before.height));
        // Blocks that left the viewport stop recording; blocks that entered start.
        assert!(top.elements.contains_key("page.title_block"));
        assert!(!scrolled.elements.contains_key("page.title_block"));
        assert!(!top.elements.contains_key("page.block.showcase-code"));
        assert!(scrolled.elements.contains_key("page.block.showcase-code"));

        // The end of the page stops at the bottom padding.
        scroll(-100_000.0);
        let (bottom, _) = session.frame();
        assert_no_violations(&bottom, "bottom");
        let last = bottom.elements["page.block.showcase-database"].bounds;
        assert_eq!(
            last.bottom(),
            800.0 - block_flow::BOTTOM_PADDING - block_flow::CARD_BLOCK_MARGIN
        );

        scroll(100_000.0);
        let (back, _) = session.frame();
        assert_eq!(
            back.elements["page.title_block"].bounds,
            top.elements["page.title_block"].bounds
        );
        assert_eq!(back.elements.len(), top.elements.len());
    }

    type Socket = tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >;

    /// Run the full `Step1` / `Step2` / reverse `Step2` / `ready` handshake for one document.
    async fn peer_sync(socket: &mut Socket, workspace: &mut WorkspaceSession, doc_id: &str) {
        let mut state = DocSyncState::new(doc_id);
        let step1 = state.begin_pull(workspace.encode_state_vector_v1(doc_id).unwrap());
        socket
            .send(WsMessage::Binary(
                encode_binary_frame(&step1).unwrap().into(),
            ))
            .await
            .unwrap();
        let hub_sv = loop {
            let WsMessage::Binary(bytes) = socket.next().await.unwrap().unwrap() else {
                continue;
            };
            match decode_binary_frame(&bytes).unwrap() {
                RoomBinaryFrame::Doc {
                    doc_id: id,
                    message: DocMessage::Step2(diff),
                } if id == doc_id => {
                    if !(diff.is_empty() || diff == [0, 0]) {
                        if doc_id == workspace.room() {
                            workspace.apply_root_update_v1(&diff).unwrap();
                        } else {
                            workspace
                                .ensure_page(doc_id)
                                .unwrap()
                                .apply_remote_update_v1(&diff)
                                .unwrap();
                        }
                    }
                    if let Some(sv) = state.on_hub_step2() {
                        break sv;
                    }
                }
                RoomBinaryFrame::Doc {
                    doc_id: id,
                    message: DocMessage::Step1(sv),
                } if id == doc_id => {
                    if let Some(sv) = state.on_hub_step1(sv) {
                        break sv;
                    }
                }
                _ => {}
            }
        };
        let diff = workspace.encode_diff_v1(doc_id, &hub_sv).unwrap();
        let reverse = state.build_reverse_step2(diff);
        socket
            .send(WsMessage::Binary(
                encode_binary_frame(&reverse).unwrap().into(),
            ))
            .await
            .unwrap();
        loop {
            if let WsMessage::Text(text) = socket.next().await.unwrap().unwrap()
                && let Ok(RoomControlFrame::Ready { doc_id: id }) = decode_control_frame(&text)
                && id == doc_id
            {
                break;
            }
        }
    }

    /// Upload a blob to the relay with a bare HTTP/1.1 `PUT`.
    async fn put_blob(url: &str, body: &[u8]) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let rest = url.strip_prefix("http://").expect("plain http blob url");
        let (authority, path) = rest.split_at(rest.find('/').expect("blob path"));
        let mut stream = tokio::net::TcpStream::connect(authority).await.unwrap();
        let head = format!(
            "PUT {path} HTTP/1.1\r\nHost: {authority}\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).await.unwrap();
        stream.write_all(body).await.unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        let response = String::from_utf8_lossy(&response);
        assert!(
            response.starts_with("HTTP/1.1 2"),
            "blob upload failed: {response}"
        );
    }

    /// Start an in-process relay on a free local port.
    fn start_relay(runtime: &tokio::runtime::Runtime) -> std::net::SocketAddr {
        runtime.block_on(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            tokio::spawn(async move {
                axum::serve(listener, RoomHub::new().router())
                    .await
                    .unwrap();
            });
            addr
        })
    }

    fn relay_runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("tokio runtime")
    }

    /// A workspace with one page holding a title, a note and one paragraph (`p-1`).
    fn relay_page_peer(room: &str, client_id: u64) -> WorkspaceSession {
        let mut peer = WorkspaceSession::new(room, client_id).unwrap();
        peer.initialize_meta().unwrap();
        peer.create_page(HOME_PAGE_ID, "Relay Page", 1).unwrap();
        let page = peer.page_mut(HOME_PAGE_ID).unwrap();
        let mut seed = ShowcaseSeed { page, now_ms: 0 };
        seed.add(
            "page",
            BlockSpec::Page {
                title: "Relay Page".to_string(),
            },
            None,
        )
        .unwrap();
        seed.add("note", BlockSpec::Note { xywh: None }, Some("page"))
            .unwrap();
        seed.paragraph("p-1", ParagraphType::Text, "Hello from the relay", "note")
            .unwrap();
        peer
    }

    /// Connect a peer to the room and publish its root document and home page.
    fn join_as_peer(
        runtime: &tokio::runtime::Runtime,
        addr: std::net::SocketAddr,
        room: &str,
        peer: &mut WorkspaceSession,
    ) -> Socket {
        runtime.block_on(async {
            let url = format!("ws://{addr}/native-sync/rooms/{room}");
            let (mut socket, _) = connect_async(url.as_str()).await.unwrap();
            tokio::time::timeout(Duration::from_secs(10), async {
                peer_sync(&mut socket, peer, room).await;
                peer_sync(&mut socket, peer, HOME_PAGE_ID).await;
            })
            .await
            .expect("peer handshake");
            socket
        })
    }

    async fn send_doc_update(socket: &mut Socket, update: Vec<u8>) {
        let frame = encode_binary_frame(&RoomBinaryFrame::Doc {
            doc_id: HOME_PAGE_ID.to_string(),
            message: DocMessage::Update(update),
        })
        .unwrap();
        socket.send(WsMessage::Binary(frame.into())).await.unwrap();
    }

    /// Step the headless application until `done`, applying room events as they arrive.
    fn wait_for(session: &Session, what: &str, done: impl Fn(&PlaygroundView) -> bool) {
        for _ in 0..500 {
            session.view(|view, cx| {
                view.pump_room(cx);
            });
            session.platform.run_until_parked();
            if session.view(|view, _| done(view)) {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        panic!("timed out waiting for {what}");
    }

    #[test]
    fn live_room_sync_updates_the_frame_snapshot_in_light_and_dark() {
        let runtime = relay_runtime();
        let addr = start_relay(&runtime);

        // A peer seeds the room over WebSocket before the view joins.
        let room = "room-native-view";
        let peer_id = client_id_from_seed(77);
        let mut peer = relay_page_peer(room, peer_id);
        let mut socket = join_as_peer(&runtime, addr, room, &mut peer);

        let config = RoomConfig::new(room, Some(&format!("ws://{addr}")));
        let session = open(
            1280,
            800,
            PlaygroundOptions {
                room: Some(config.clone()),
                ..PlaygroundOptions::default()
            },
        );
        wait_for(&session, "the seeded page", |view| {
            view.room_status() == Some(RoomStatus::Live)
                && view
                    .page_snapshot()
                    .is_some_and(|snapshot| snapshot.block("p-1").is_some())
        });
        let (snapshot, _) = session.frame();
        assert_no_violations(&snapshot, "initial sync");
        assert_eq!(
            snapshot.elements["page.title_block"].text.as_deref(),
            Some("Relay Page")
        );
        assert_eq!(
            snapshot.elements["page.block.p-1"].text.as_deref(),
            Some("Hello from the relay")
        );
        assert!(!snapshot.elements.contains_key("page.block.p-2"));

        // The peer edits the page, uploads a blob, and announces its caret, all live.
        let edit = {
            let page = peer.page_mut(HOME_PAGE_ID).unwrap();
            let paragraph = page
                .add_block(
                    "p-2",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "Synced live edit".to_string(),
                    },
                    Some("note"),
                    None,
                    50_000,
                )
                .unwrap()
                .expect("paragraph commit");
            let image = page
                .add_block(
                    "img",
                    BlockSpec::Image {
                        source_id: "img-1".to_string(),
                        caption: String::new(),
                        width: 64.0,
                        height: 40.0,
                        xywh: None,
                    },
                    Some("note"),
                    None,
                    51_000,
                )
                .unwrap()
                .expect("image commit");
            [paragraph.update, image.update]
        };
        let mut awareness = RoomAwareness::new(peer_id).unwrap();
        let mut payload = AwarenessPayload::new("Rita", "var(--affine-multi-players-orange)");
        payload
            .set_text_selection(HOME_PAGE_ID, TextSelectionState::caret("p-2", 6))
            .unwrap();
        let presence = awareness.set_local_payload(&payload, 0).unwrap();
        runtime.block_on(async {
            put_blob(&config.blob_url("img-1"), &showcase_gradient_png()).await;
            for update in edit {
                send_doc_update(&mut socket, update).await;
            }
            let frame = encode_binary_frame(&RoomBinaryFrame::Awareness(presence)).unwrap();
            socket.send(WsMessage::Binary(frame.into())).await.unwrap();
        });

        wait_for(&session, "the live edit, blob and presence", |view| {
            view.page_snapshot()
                .is_some_and(|snapshot| snapshot.block("img").is_some())
                && view.document().blobs.contains_key("img-1")
                && view.document().awareness.get_payload(peer_id).is_some()
        });
        let (light, light_image) = session.frame();
        assert_no_violations(&light, "live edit (light)");
        assert_eq!(
            light.elements["page.block.p-2"].text.as_deref(),
            Some("Synced live edit")
        );
        assert_eq!(
            light.elements[&format!("chrome.presence.{peer_id}")]
                .text
                .as_deref(),
            Some("Rita")
        );
        let caret = light.elements[&format!("page.presence.{peer_id}.caret")].bounds;
        let paragraph = light.elements["page.block.p-2"].bounds;
        assert!(caret.x > paragraph.x && caret.right() < paragraph.right());
        assert_eq!((caret.y, caret.height), (paragraph.y, paragraph.height));
        // The fetched blob is decoded and painted at the block's size.
        let image_block = &light.elements["page.block.img"];
        assert_ne!(image_block.text.as_deref(), Some("Loading image"));
        assert_eq!(image_block.bounds.height, 40.0);

        session.view(|view, cx| view.set_theme(PlaygroundTheme::Dark, cx));
        let (dark, dark_image) = session.frame();
        assert_no_violations(&dark, "live edit (dark)");
        assert_eq!(
            dark.elements["page.block.p-2"].text.as_deref(),
            Some("Synced live edit")
        );
        assert_eq!(
            light.elements.keys().collect::<Vec<_>>(),
            dark.elements.keys().collect::<Vec<_>>()
        );
        assert_ne!(light_image.as_raw(), dark_image.as_raw());
        assert_color(
            pixel(&dark_image, 20.0, 600.0),
            token_rgb(tokens::DARK_THEME.background_primary),
            "dark page background",
        );
    }

    #[test]
    fn typing_preedit_awareness_and_local_undo_reach_two_live_views() {
        use crate::editor_session::{DocPoint, DocumentSelection};
        use ui::EntityInputHandler;
        let rt = relay_runtime();
        let addr = start_relay(&rt);
        let room = "room-live-editor";
        let mut seed = relay_page_peer(room, client_id_from_seed(92));
        let _socket = join_as_peer(&rt, addr, room, &mut seed);
        let options = PlaygroundOptions {
            room: Some(RoomConfig::new(room, Some(&format!("ws://{addr}")))),
            ..Default::default()
        };
        let first = open(800, 600, options.clone());
        let second = open(800, 600, options);
        for session in [&first, &second] {
            wait_for(session, "the initial editable page", |v| {
                v.room_status() == Some(RoomStatus::Live)
                    && v.page_snapshot().and_then(|p| p.block("p-1")).is_some()
            });
            session.frame();
        }
        let edit =
            |s: &Session, f: fn(&mut PlaygroundView, &mut Window, &mut Context<PlaygroundView>)| {
                s.app.update(|cx| s.window.update(cx, f)).unwrap();
            };
        fn select(
            v: &mut PlaygroundView,
            offset: u64,
            w: &mut Window,
            cx: &mut Context<PlaygroundView>,
        ) {
            let p = DocPoint::new("p-1", offset);
            v.select_document_range(
                DocumentSelection {
                    anchor: p.clone(),
                    focus: p,
                },
                w,
                cx,
            );
        }
        let first_id = first.view(|v, _| v.document().awareness.local_client_id());
        edit(&first, |v, w, cx| {
            select(v, 1, w, cx);
            v.replace_and_mark_text_in_range(None, "private-preedit", None, w, cx);
        });
        wait_for(&second, "the first native selection", |v| {
            v.document()
                .awareness
                .get_payload(first_id)
                .is_some_and(|p| {
                    p.selection_v2
                        .get(&format!("{HOME_PAGE_ID}:native"))
                        .is_some_and(|s| s[0]["from"]["index"] == 1)
                })
        });
        let text_is = |v: &PlaygroundView, s: &str| matches!(&v.page_snapshot().unwrap().block("p-1").unwrap().content,BlockContent::Paragraph{text,..} if text.plain==s);
        assert!(second.view(|v, _| text_is(v, "Hello from the relay")));
        edit(&first, |v, w, cx| v.replace_text_in_range(None, "L", w, cx));
        wait_for(&second, "the first native edit", |v| {
            text_is(v, "HLello from the relay")
        });
        edit(&second, |v, w, cx| {
            select(v, 0, w, cx);
            v.replace_text_in_range(None, "R", w, cx);
        });
        wait_for(&first, "the interleaved peer edit", |v| {
            text_is(v, "RHLello from the relay")
        });
        first.frame();
        first
            .headless
            .dispatch_input(ui::PlatformInput::KeyDown(ui::KeyDownEvent {
                keystroke: ui::Keystroke {
                    key: "z".into(),
                    key_char: None,
                    modifiers: ui::Modifiers {
                        platform: true,
                        control: true,
                        ..Default::default()
                    },
                },
                is_held: false,
                prefer_character_input: false,
            }));
        wait_for(&second, "the first editor's undo", |v| {
            text_is(v, "RHello from the relay")
        });
        assert_eq!(
            first.view(|v, _| v.document_selection().unwrap().focus.caret.utf16_offset),
            2
        );
    }

    #[test]
    fn overlay_edits_reach_the_peers_of_a_live_room() {
        let runtime = relay_runtime();
        let addr = start_relay(&runtime);
        let room = "room-overlay-edits";
        let mut peer = relay_page_peer(room, client_id_from_seed(91));
        {
            let page = peer.page_mut(HOME_PAGE_ID).unwrap();
            let mut seed = ShowcaseSeed {
                page,
                now_ms: 10_000,
            };
            seed.list("todo", ListType::Todo, "Ship the overlays", false, "note")
                .unwrap();
        }
        let mut socket = join_as_peer(&runtime, addr, room, &mut peer);

        let config = RoomConfig::new(room, Some(&format!("ws://{addr}")));
        let session = open(
            1280,
            800,
            PlaygroundOptions {
                room: Some(config),
                ..PlaygroundOptions::default()
            },
        );
        wait_for(&session, "the seeded to-do item", |view| {
            view.room_status() == Some(RoomStatus::Live)
                && view
                    .page_snapshot()
                    .is_some_and(|snapshot| snapshot.block("todo").is_some())
        });
        let checked = |snapshot: &PageSnapshot| {
            matches!(
                snapshot.block("todo").map(|node| &node.content),
                Some(BlockContent::List { checked: true, .. })
            )
        };

        // Ticking the box edits the local document at once...
        let (snapshot, _) = session.frame();
        assert_no_violations(&snapshot, "live to-do");
        session.click(&snapshot, "page.block.todo.checkbox");
        assert!(session.view(|view, _| view.page_snapshot().is_some_and(checked)));

        // ...and the peer receives the same edit as a document update of the page.
        runtime.block_on(async {
            tokio::time::timeout(Duration::from_secs(10), async {
                loop {
                    let WsMessage::Binary(bytes) = socket.next().await.unwrap().unwrap() else {
                        continue;
                    };
                    let Ok(RoomBinaryFrame::Doc {
                        doc_id,
                        message: DocMessage::Update(update),
                    }) = decode_binary_frame(&bytes)
                    else {
                        continue;
                    };
                    if doc_id != HOME_PAGE_ID {
                        continue;
                    }
                    let page = peer.page_mut(HOME_PAGE_ID).unwrap();
                    page.apply_remote_update_v1(&update).unwrap();
                    if checked(&page.read_page_snapshot().unwrap()) {
                        break;
                    }
                }
            })
            .await
            .expect("the peer receives the checked to-do item");
        });
    }

    #[test]
    fn dropping_the_selection_clears_the_caret_peers_see_and_keeps_the_presence() {
        use crate::overlays::{ActiveSelection, OverlayEvent};
        let runtime = relay_runtime();
        let addr = start_relay(&runtime);
        let room = "room-cleared-selection";
        let mut seed = relay_page_peer(room, client_id_from_seed(93));
        let _socket = join_as_peer(&runtime, addr, room, &mut seed);
        let options = PlaygroundOptions {
            room: Some(RoomConfig::new(room, Some(&format!("ws://{addr}")))),
            ..Default::default()
        };
        let first = open(800, 600, options.clone());
        let second = open(800, 600, options);
        for session in [&first, &second] {
            wait_for(session, "the initial editable page", |view| {
                view.room_status() == Some(RoomStatus::Live)
                    && view
                        .page_snapshot()
                        .and_then(|page| page.block("p-1"))
                        .is_some()
            });
            session.frame();
        }
        let first_id = first.view(|view, _| view.document().awareness.local_client_id());
        let key = format!("{HOME_PAGE_ID}:native");
        let set_selection = |selection: Option<ActiveSelection>| {
            first
                .app
                .update(|cx| {
                    first.window.update(cx, |view, window, cx| {
                        view.dispatch_overlay(OverlayEvent::SetSelection(selection), window, cx);
                    })
                })
                .unwrap();
        };
        // What the second view knows of the first one's selection on this page.
        let seen = |view: &PlaygroundView| {
            view.document()
                .awareness
                .get_payload(first_id)
                .map(|payload| payload.selection_v2.get(&key).cloned())
        };

        set_selection(Some(ActiveSelection::caret("p-1", 3)));
        wait_for(&second, "the first view's caret", |view| {
            seen(view)
                .flatten()
                .is_some_and(|selection| selection.len() == 1 && selection[0]["from"]["index"] == 3)
        });
        let caret = format!("page.presence.{first_id}.caret");
        assert!(second.frame().0.elements.contains_key(&caret));

        // Without a selection the entry stays, empty: the caret goes, the peer does not.
        set_selection(None);
        wait_for(&second, "the cleared selection", |view| {
            seen(view) == Some(Some(Vec::new()))
        });
        let payload = second
            .view(|view, _| view.document().awareness.get_payload(first_id))
            .expect("the first view is still present");
        assert_eq!(payload.user.name, room_client::LOCAL_AWARENESS_NAME);
        assert_eq!(payload.color, room_client::LOCAL_AWARENESS_COLOR);
        let (frame, _) = second.frame();
        assert!(!frame.elements.contains_key(&caret));
        assert!(
            frame
                .elements
                .contains_key(&format!("chrome.presence.{first_id}"))
        );
    }

    #[test]
    fn a_blob_uploaded_after_its_image_block_is_fetched_by_capped_retries() {
        let runtime = relay_runtime();
        let addr = start_relay(&runtime);
        let room = "room-late-blob";
        let source = "late-blob";

        // The image block reaches the room before any blob does, as when the JavaScript
        // editor writes `sourceId` while its upload is still running.
        let mut peer = relay_page_peer(room, client_id_from_seed(91));
        peer.page_mut(HOME_PAGE_ID)
            .unwrap()
            .add_block(
                "img",
                BlockSpec::Image {
                    source_id: source.to_string(),
                    caption: String::new(),
                    width: 320.0,
                    height: 200.0,
                    xywh: None,
                },
                Some("note"),
                None,
                40_000,
            )
            .unwrap();
        let mut socket = join_as_peer(&runtime, addr, room, &mut peer);

        let config = RoomConfig::new(room, Some(&format!("ws://{addr}")));
        let session = open(
            1280,
            800,
            PlaygroundOptions {
                room: Some(config.clone()),
                ..PlaygroundOptions::default()
            },
        );
        let fetch = |view: &PlaygroundView| view.blob_fetches.get(source).copied();
        let image_text = || {
            let (snapshot, _) = session.frame();
            assert_no_violations(&snapshot, "late blob");
            snapshot.elements["page.block.img"].text.clone()
        };
        wait_for(&session, "the first miss", |view| {
            fetch(view).is_some_and(|fetch| !fetch.in_flight && fetch.misses == 1)
        });
        assert_eq!(image_text().as_deref(), Some("Loading image"));

        // A peer edit re-reads the document without fetching the blob again.
        let before = session.view(|view, _| fetch(view));
        let edit = peer
            .page_mut(HOME_PAGE_ID)
            .unwrap()
            .add_block(
                "p-2",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Typed while the upload runs".to_string(),
                },
                Some("note"),
                None,
                41_000,
            )
            .unwrap()
            .expect("paragraph commit");
        runtime.block_on(send_doc_update(&mut socket, edit.update));
        wait_for(&session, "the peer edit", |view| {
            view.page_snapshot()
                .is_some_and(|snapshot| snapshot.block("p-2").is_some())
        });
        assert_eq!(session.view(|view, _| fetch(view)), before);

        // Only the scheduler clock drives the retries: the gap doubles up to its cap and
        // the fetch never gives up, with no edit or reconnect in between.
        let step = |target: &dyn Fn(&PlaygroundView) -> bool, what: &str| {
            for _ in 0..40 {
                if session.view(|view, _| target(view)) {
                    return;
                }
                // One second of scheduler time runs the view's room tick once; a fetch it
                // starts is answered by the relay before the clock moves again.
                session.platform.advance_clock(Duration::from_secs(1));
                wait_for(&session, what, |view| {
                    target(view) || fetch(view).is_none_or(|fetch| !fetch.in_flight)
                });
            }
            panic!("timed out stepping the clock for {what}");
        };
        step(
            &|view| fetch(view).is_some_and(|fetch| !fetch.in_flight && fetch.misses >= 3),
            "the third miss",
        );
        assert_eq!(image_text().as_deref(), Some("Image unavailable"));
        step(
            &|view| fetch(view).is_some_and(|fetch| !fetch.in_flight && fetch.misses >= 6),
            "retries past the backoff cap",
        );
        assert_eq!(image_text().as_deref(), Some("Image unavailable"));
        assert_eq!(
            [1, 2, 3, 4, 5, 6, 60].map(blob_retry_backoff_ms),
            [500, 1_000, 2_000, 4_000, 4_000, 4_000, 4_000]
        );

        // The upload finishes late; the next retry picks the blob up and the image shows.
        runtime.block_on(put_blob(&config.blob_url(source), &showcase_gradient_png()));
        step(
            &|view| view.document().blobs.contains_key(source),
            "the uploaded blob",
        );
        session.view(|view, _| {
            assert!(matches!(view.images.get(source), Some(ImageSlot::Ready(_))));
            assert!(view.blob_fetches.is_empty());
        });
        let (snapshot, _) = session.frame();
        assert_no_violations(&snapshot, "late blob ready");
        let image = &snapshot.elements["page.block.img"];
        assert!(
            !matches!(
                image.text.as_deref(),
                Some("Loading image" | "Image unavailable")
            ),
            "{:?}",
            image.text
        );
        assert_eq!(image.bounds.height, 200.0);
    }

    #[test]
    fn corrupt_and_supported_image_bytes_decode_once() {
        // PNG is decoded; bytes that are no supported image are rejected for good.
        assert!(decode_image(&showcase_gradient_png()).is_some());
        assert!(decode_image(b"not an image").is_none());
        assert!(decode_image(&[]).is_none());
        // Every supported container is recognized by its signature.
        let mut image = image::RgbaImage::new(3, 2);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            *pixel = image::Rgba([x as u8 * 80, y as u8 * 120, 200, 255]);
        }
        for format in [
            image::ImageFormat::Png,
            image::ImageFormat::Jpeg,
            image::ImageFormat::WebP,
            image::ImageFormat::Gif,
            image::ImageFormat::Bmp,
        ] {
            let mut bytes = std::io::Cursor::new(Vec::new());
            let encoded = match format {
                // JPEG has no alpha channel.
                image::ImageFormat::Jpeg => image::DynamicImage::ImageRgba8(image.clone())
                    .into_rgb8()
                    .write_to(&mut bytes, format),
                _ => image.write_to(&mut bytes, format),
            };
            encoded.unwrap_or_else(|err| panic!("{format:?}: {err}"));
            let decoded =
                decode_image(bytes.get_ref()).unwrap_or_else(|| panic!("{format:?} decodes"));
            let size = decoded.size(0);
            assert_eq!((size.width.0, size.height.0), (3, 2), "{format:?}");
        }
        // An icon is a real image format, but not one a page image may use.
        let mut icon = std::io::Cursor::new(Vec::new());
        image.write_to(&mut icon, image::ImageFormat::Ico).unwrap();
        assert!(decode_image(icon.get_ref()).is_none());
    }

    #[test]
    fn reconnecting_presence_outranks_the_relay_tombstone() {
        async fn send_frames(socket: &mut Socket, frames: Vec<RoomFrame>) {
            for frame in frames {
                let message = match frame {
                    RoomFrame::Binary(bytes) => WsMessage::Binary(bytes.into()),
                    RoomFrame::Text(text) => WsMessage::Text(text.into()),
                };
                socket.send(message).await.unwrap();
            }
        }

        /// Open the protocol on `socket` and run its handshakes until the room is live.
        async fn open_protocol(
            socket: &mut Socket,
            protocol: &mut RoomProtocol,
            state: &mut DocState,
        ) {
            let effects = protocol.on_open(state, 0).unwrap();
            send_frames(socket, effects.outbound).await;
            while protocol.status() != RoomStatus::Live {
                let frame = match socket.next().await.unwrap().unwrap() {
                    WsMessage::Binary(bytes) => RoomFrame::Binary(bytes.to_vec()),
                    WsMessage::Text(text) => RoomFrame::Text(text.to_string()),
                    _ => continue,
                };
                let effects = protocol.on_frame(state, &frame, 0).unwrap();
                send_frames(socket, effects.outbound).await;
            }
        }

        /// Read awareness frames until `client` is present (or gone) for this observer.
        async fn await_presence(
            socket: &mut Socket,
            awareness: &mut RoomAwareness,
            client: u64,
            present: bool,
        ) {
            while awareness.get_payload(client).is_some() != present {
                if let WsMessage::Binary(bytes) = socket.next().await.unwrap().unwrap()
                    && let RoomBinaryFrame::Awareness(update) = decode_binary_frame(&bytes).unwrap()
                {
                    awareness.apply_update(&update, 0).unwrap();
                }
            }
        }

        let runtime = relay_runtime();
        let addr = start_relay(&runtime);
        let room = "room-reconnect";
        let url = format!("ws://{addr}/native-sync/rooms/{room}");
        let native = client_id_from_seed(5);
        runtime.block_on(async {
            tokio::time::timeout(Duration::from_secs(20), async {
                let mut state = DocState::new(room, native).unwrap();
                let mut protocol = RoomProtocol::new(room);
                let mut watcher_view = RoomAwareness::new(client_id_from_seed(6)).unwrap();
                let (mut watcher, _) = connect_async(url.as_str()).await.unwrap();

                let (mut first, _) = connect_async(url.as_str()).await.unwrap();
                open_protocol(&mut first, &mut protocol, &mut state).await;
                await_presence(&mut watcher, &mut watcher_view, native, true).await;

                // The connection drops: the relay tombstones the client one clock above
                // its presence.
                first.close(None).await.unwrap();
                drop(first);
                protocol.on_close("connection lost");
                await_presence(&mut watcher, &mut watcher_view, native, false).await;

                // Reconnecting right away announces a presence the relay accepts ...
                let (mut second, _) = connect_async(url.as_str()).await.unwrap();
                open_protocol(&mut second, &mut protocol, &mut state).await;
                await_presence(&mut watcher, &mut watcher_view, native, true).await;

                // ... so an observer joining before any renewal sees it at once.
                let mut fresh_view = RoomAwareness::new(client_id_from_seed(7)).unwrap();
                let (mut fresh, _) = connect_async(url.as_str()).await.unwrap();
                await_presence(&mut fresh, &mut fresh_view, native, true).await;
                assert_eq!(
                    fresh_view.get_payload(native).unwrap().user.name,
                    room_client::LOCAL_AWARENESS_NAME
                );
            })
            .await
            .expect("presence after reconnect");
        });
    }

    #[test]
    fn remote_selection_reads_only_the_selection_keys_of_the_shown_page() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let client = client_id_from_seed(0x05e1);
        let mut peer = RoomAwareness::new(client).unwrap();
        let caret_id = format!("page.presence.{client}.caret");
        let mut announce = |keys: &[(&str, &str)]| {
            let mut payload = AwarenessPayload::new("Kim", "var(--affine-multi-players-green)");
            for (key, block) in keys {
                payload
                    .set_text_selection(*key, TextSelectionState::caret(*block, 2))
                    .unwrap();
            }
            let update = peer.set_local_payload(&payload, 0).unwrap();
            session.view(|view, cx| {
                view.edit_document(cx, |state| {
                    state.awareness.apply_update(&update, 0).unwrap()
                });
            });
            session.frame().0
        };
        let inside = |snapshot: &FrameSnapshot, block: &str| {
            let caret = snapshot.elements[&caret_id].bounds;
            let block = snapshot.elements[&format!("page.block.{block}")].bounds;
            caret.y >= block.y && caret.bottom() <= block.bottom()
        };

        // Managers of other stores never match, however similar their ids look.
        let others = [
            ("doc:aaa:m1", "showcase-h1"),
            ("doc:home2:m1", "showcase-h2"),
            ("doc:home:archive:m2", "showcase-intro"),
        ];
        let snapshot = announce(&others[..]);
        assert!(
            snapshot
                .elements
                .contains_key(&format!("chrome.presence.{client}"))
        );
        assert!(!snapshot.elements.contains_key(&caret_id));

        // The manager of the shown page (`<pageId>:<nanoid>`) is found among them.
        let mut keys = others.to_vec();
        keys.push(("doc:home:m3", "showcase-quote"));
        let snapshot = announce(keys.as_slice());
        assert!(inside(&snapshot, "showcase-quote"));

        // A bare page id is read as well; an empty manager id is not.
        let snapshot = announce(&[("doc:home", "showcase-bullet")][..]);
        assert!(inside(&snapshot, "showcase-bullet"));
        let snapshot = announce(&[("doc:home:", "showcase-bullet")][..]);
        assert!(!snapshot.elements.contains_key(&caret_id));
    }

    /// Right-aligned wrapped text with an inheriting and an overriding child, a centered
    /// list item, and the caret of collaborator `peer_id` at the end of the wrapped text.
    fn alignment_document(peer_id: u64) -> DocState {
        let long = "Right aligned text wraps onto several lines, and every one of its lines \
            ends at the right edge of the column, whatever its length happens to be."
            .repeat(2);
        let mut state = DocState::new("align", client_id_from_seed(0x0a12)).expect("state");
        state.workspace.initialize_meta().expect("meta");
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Alignment", 1)
            .expect("page");
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
            let mut seed = ShowcaseSeed { page, now_ms: 0 };
            seed.add(
                "a-page",
                BlockSpec::Page {
                    title: "Alignment".to_string(),
                },
                None,
            )
            .expect("page block");
            seed.add("a-note", BlockSpec::Note { xywh: None }, Some("a-page"))
                .expect("note");
            seed.paragraph("a-right", ParagraphType::Text, &long, "a-note")
                .expect("paragraph");
            seed.paragraph("a-child", ParagraphType::Text, "Inherits right", "a-right")
                .expect("paragraph");
            seed.paragraph(
                "a-child-left",
                ParagraphType::Text,
                "Explicit left",
                "a-right",
            )
            .expect("paragraph");
            seed.list(
                "a-list",
                ListType::Bulleted,
                "Centered item",
                false,
                "a-note",
            )
            .expect("list");
            seed.paragraph("a-plain", ParagraphType::Text, "Default left", "a-note")
                .expect("paragraph");
            for (id, align) in [
                ("a-right", "right"),
                ("a-child-left", "left"),
                ("a-list", "center"),
            ] {
                let now_ms = seed.tick();
                seed.page
                    .set_block_prop(
                        id,
                        "prop:textAlign",
                        SessionValue::Any(Any::String(align.to_string())),
                        now_ms,
                    )
                    .expect("text align");
            }
        }
        // A collaborator's caret sits at the end of the right-aligned paragraph.
        let mut payload = AwarenessPayload::new("Rita", "var(--affine-multi-players-orange)");
        payload
            .set_text_selection(
                HOME_PAGE_ID,
                TextSelectionState::caret("a-right", long.encode_utf16().count() as u64),
            )
            .expect("selection");
        let update = RoomAwareness::new(peer_id)
            .expect("peer")
            .set_local_payload(&payload, 0)
            .expect("payload");
        state.awareness.apply_update(&update, 0).expect("presence");
        state
    }

    #[test]
    fn text_alignment_moves_wrapped_lines_and_carets_and_is_inherited_by_children() {
        let peer_id = client_id_from_seed(0x0a11);
        let session = open(800, 900, PlaygroundOptions::default());
        session.view(|view, cx| view.set_document(alignment_document(peer_id), cx));
        let (snapshot, _) = session.frame();
        assert_no_violations(&snapshot, "aligned text");
        let layout = session.view(|view, _| view.flow_layout().expect("layout"));
        // `(left edge, right edge)` of every line of a block's text, in column coordinates.
        let lines = |id: &str| -> Vec<(f32, f32)> {
            let block = layout.block(id).unwrap_or_else(|| panic!("{id} laid out"));
            let text = block.body.text.as_ref().expect("text");
            let FlowTextLayout::Rich(rich) = &text.layout else {
                panic!("{id} is rich text");
            };
            rich.lines()
                .iter()
                .map(|line| {
                    let left = block.x + text.x + f32::from(line.x);
                    (left, left + f32::from(line.width))
                })
                .collect()
        };
        let column = layout.width;
        let ends_right = |right: f32| right <= column && column - right < 1.0;

        let right = lines("a-right");
        assert!(right.len() >= 3, "{right:?}");
        assert!(
            right.iter().all(|(_, right)| ends_right(*right)),
            "{right:?}"
        );
        assert!(right.iter().any(|(left, _)| *left > 40.0), "{right:?}");

        // Children inherit the alignment unless they set their own.
        assert_eq!(layout.block("a-child").expect("child").x, CHILD_INDENT);
        let child = lines("a-child");
        assert!(ends_right(child[0].1), "{child:?}");
        assert_eq!(lines("a-child-left")[0].0, CHILD_INDENT);
        assert_eq!(lines("a-plain")[0].0, 0.0);

        // A list keeps its prefix at the left edge and centers only its text box.
        let list = layout.block("a-list").expect("list");
        let prefix = list.body.prefix.expect("prefix");
        assert!(prefix.x + prefix.w <= LIST_PREFIX_WIDTH);
        let (left, right) = lines("a-list")[0];
        let free = column - LIST_PREFIX_WIDTH - (right - left);
        assert!(free > 100.0);
        assert!(
            (left - (LIST_PREFIX_WIDTH + free / 2.0)).abs() <= 1.0,
            "{left} {right}"
        );

        // The remote caret follows the last right-aligned line to the column's right edge.
        let caret = snapshot.elements[&format!("page.presence.{peer_id}.caret")].bounds;
        let block = snapshot.elements["page.block.a-right"].bounds;
        let line_height = paragraph_spec(ParagraphType::Text).line_height;
        assert!((block.right() - caret.right()).abs() <= 2.0, "{caret:?}");
        assert_eq!(
            caret.y,
            block.y + (right_line_count(&layout) - 1) as f32 * line_height
        );
        assert_eq!(caret.height, line_height);
    }

    fn right_line_count(layout: &FlowLayout) -> usize {
        layout
            .block("a-right")
            .and_then(|block| block.body.text.as_ref())
            .map_or(0, |text| text.layout.line_count())
    }

    #[test]
    fn native_flags_reject_tls_relays() {
        let args = |relay: &str| ["--room", "r", "--relay", relay].map(String::from);
        for relay in ["wss://relay.example", "https://relay.example"] {
            let error = PlaygroundOptions::from_args(args(relay))
                .expect_err("a TLS relay is rejected")
                .to_string();
            assert!(error.contains("ws://"), "{error}");
        }
        let options = PlaygroundOptions::from_args(args("http://127.0.0.1:9000")).unwrap();
        assert_eq!(
            options.room.expect("room").ws_url,
            "ws://127.0.0.1:9000/native-sync/rooms/r"
        );
    }

    #[test]
    fn edgeless_surface_parentage_includes_frame_text_and_note() {
        let mut doc = DocState::new("surf-tree", client_id_from_seed(0x501)).expect("state");
        doc.workspace.initialize_meta().expect("meta");
        doc.workspace
            .create_page(HOME_PAGE_ID, "Surface Tree", 1)
            .expect("page");
        let page = doc.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        let mut seed = ShowcaseSeed { page, now_ms: 0 };
        seed.add(
            "s-page",
            BlockSpec::Page {
                title: "Surface Tree".to_string(),
            },
            None,
        )
        .expect("page");
        seed.add("s-surface", BlockSpec::Surface, Some("s-page"))
            .expect("surface");
        seed.add(
            "s-frame",
            BlockSpec::Frame {
                title: "Surface Frame".to_string(),
                xywh: Some("[0,0,700,420]".to_string()),
                presentation_index: Some("a0".to_string()),
            },
            Some("s-surface"),
        )
        .expect("frame under surface");
        seed.add(
            "s-text",
            BlockSpec::EdgelessText {
                xywh: Some("[440,60,220,60]".to_string()),
            },
            Some("s-surface"),
        )
        .expect("edgeless text under surface");
        seed.paragraph("s-text-p", ParagraphType::H4, "Under Surface", "s-text")
            .expect("text child");
        seed.add(
            "s-note",
            BlockSpec::Note {
                xywh: Some("[40,40,360,240]".to_string()),
            },
            Some("s-page"),
        )
        .expect("note under page");
        seed.paragraph("s-note-p", ParagraphType::Text, "Page note body", "s-note")
            .expect("note child");

        let session = open(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..PlaygroundOptions::default()
            },
        );
        session.view(|view, cx| view.set_document(doc, cx));
        let (snap, _) = session.frame();
        assert_no_violations(&snap, "Edgeless surface tree");
        assert!(
            snap.elements.contains_key("edgeless.frame.s-frame"),
            "Frame under Surface missing from snapshot"
        );
        assert!(
            snap.elements.contains_key("edgeless.text.s-text"),
            "EdgelessText under Surface missing from snapshot"
        );
        assert!(
            snap.elements.contains_key("edgeless.note.s-note"),
            "Note under Page missing from snapshot"
        );
    }

    #[test]
    fn edgeless_panned_code_and_bookmark_render_glyph_ink_across_zooms() {
        let mut doc = DocState::new("pan-clip", client_id_from_seed(0x502)).expect("state");
        doc.workspace.initialize_meta().expect("meta");
        doc.workspace
            .create_page(HOME_PAGE_ID, "Pan Clip", 1)
            .expect("page");
        let page = doc.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        let mut seed = ShowcaseSeed { page, now_ms: 0 };
        seed.add(
            "p-page",
            BlockSpec::Page {
                title: "Pan Clip".to_string(),
            },
            None,
        )
        .expect("page");
        seed.add("p-surface", BlockSpec::Surface, Some("p-page"))
            .expect("surface");
        seed.add(
            "p-note",
            BlockSpec::Note {
                xywh: Some("[2000,100,600,360]".to_string()),
            },
            Some("p-page"),
        )
        .expect("note");
        seed.add(
            "p-code",
            BlockSpec::Code {
                text: "fn edgeless_local_clip() -> u32 { 42 }".to_string(),
                language: Some("rust".to_string()),
                caption: String::new(),
            },
            Some("p-note"),
        )
        .expect("code");
        let now_ms = seed.tick();
        seed.page
            .set_block_prop("p-code", "prop:wrap", SessionValue::Any(Any::False), now_ms)
            .expect("unwrap code");
        seed.add(
            "p-bookmark",
            BlockSpec::Bookmark {
                url: "https://affine.pro/docs".to_string(),
                title: Some("AFFiNE Docs".to_string()),
                description: Some(
                    "Local-first collaborative workspace description text.".to_string(),
                ),
            },
            Some("p-note"),
        )
        .expect("bookmark");

        let session = open(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..PlaygroundOptions::default()
            },
        );
        session.view(|view, cx| view.set_document(doc, cx));

        for zoom in [0.5_f32, 1.0, 2.0] {
            let pan_x = 2000.0 - 50.0 / zoom;
            let pan_y = 100.0 - 40.0 / zoom;
            session.view(|view, cx| view.set_edgeless_camera(pan_x, pan_y, zoom, cx));
            let (_, img) = session.frame();

            let layout = session.view(|v, _| v.edgeless.cached_note_layout("p-note").unwrap());
            for (id, name, dx, dy, width, height) in [
                ("p-code", "language", 20., 8., 30., 16.),
                ("p-code", "body", 52., 32., 320., 20.),
                ("p-bookmark", "description", 13., 39., 390., 20.),
            ] {
                let block = layout.block(id).unwrap();
                let left = 50. + (24. + block.x + dx) * zoom;
                let top = TOPBAR_HEIGHT + 40. + (24. + block.y + dy) * zoom;
                let mut ink = 0;
                for y in top.ceil() as u32..(top + height * zoom) as u32 {
                    for x in left.ceil() as u32..(left + width * zoom) as u32 {
                        let p = img.get_pixel(x, y);
                        ink += usize::from(p[0] < 195 && p[1] < 195 && p[2] < 195);
                    }
                }
                assert!(
                    ink > 2,
                    "zoom {zoom}, {name} band contains {ink} glyph pixels"
                );
            }
        }
    }

    #[test]
    fn edgeless_scale_2x_wraps_at_half_logical_width_with_zero_camera_relayout() {
        let mut doc = DocState::new("scale-2x", client_id_from_seed(0x503)).expect("state");
        doc.workspace.initialize_meta().expect("meta");
        doc.workspace
            .create_page(HOME_PAGE_ID, "Scale 2x", 1)
            .expect("page");
        let page = doc.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        let mut seed = ShowcaseSeed { page, now_ms: 0 };
        seed.add(
            "sc-page",
            BlockSpec::Page {
                title: "Scale 2x".to_string(),
            },
            None,
        )
        .expect("page");
        seed.add("sc-surface", BlockSpec::Surface, Some("sc-page"))
            .expect("surface");
        seed.add(
            "sc-note",
            BlockSpec::Note {
                xywh: Some("[0,0,400,200]".to_string()),
            },
            Some("sc-page"),
        )
        .expect("note");
        let mut edgeless_map = AHashMap::default();
        edgeless_map.insert("scale".to_string(), Any::Float64(2.0_f64.into()));
        let now_ms = seed.tick();
        seed.page
            .set_block_prop(
                "sc-note",
                "prop:edgeless",
                SessionValue::Any(Any::Object(Box::new(edgeless_map))),
                now_ms,
            )
            .expect("note scale");
        seed.paragraph(
            "sc-note-p",
            ParagraphType::Text,
            "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
            "sc-note",
        )
        .expect("note text");

        seed.add(
            "sc-text",
            BlockSpec::EdgelessText {
                xywh: Some("[460,0,400,80]".to_string()),
            },
            Some("sc-surface"),
        )
        .expect("edgeless text");
        let now_ms = seed.tick();
        seed.page
            .set_block_prop(
                "sc-text",
                "prop:scale",
                SessionValue::Any(Any::Float64(2.0_f64.into())),
                now_ms,
            )
            .expect("text scale");
        let now_ms = seed.tick();
        seed.page
            .set_block_prop(
                "sc-text",
                "prop:hasMaxWidth",
                SessionValue::Any(Any::True),
                now_ms,
            )
            .expect("hasMaxWidth");
        seed.paragraph(
            "sc-text-p",
            ParagraphType::Text,
            "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
            "sc-text",
        )
        .expect("text paragraph");

        let session = open(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..PlaygroundOptions::default()
            },
        );
        session.view(|view, cx| view.set_document(doc, cx));
        let _ = session.frame();

        let (note_w, text_w, text_lines) = session.view(|view, _| {
            let note_layout = view
                .edgeless
                .cached_note_layout("sc-note")
                .expect("cached note layout");
            let text_layout = view
                .edgeless
                .cached_text_layout("sc-text")
                .expect("cached text layout");
            let lines = text_layout
                .block("sc-text-p")
                .and_then(|b| b.body.text.as_ref())
                .map_or(0, |t| t.layout.line_count());
            (note_layout.width, text_layout.width, lines)
        });
        assert!(
            (note_w - (400.0 / 2.0 - 2.0 * edgeless::NOTE_CARD_PADDING)).abs() < 0.01,
            "expected Note logical width 152.0, got {note_w}"
        );
        assert!(
            (text_w - 200.0).abs() < 0.01,
            "expected EdgelessText logical width 200.0, got {text_w}"
        );
        assert!(
            text_lines >= 2,
            "expected EdgelessText at 200px logical width to wrap into >=2 lines, got {text_lines}"
        );

        // Subsequent camera pan + zoom must trigger zero BlockFlow relayouts.
        for zoom in [0.5_f32, 1.5, 2.0] {
            session.view(|view, cx| view.set_edgeless_camera(-20.0, -20.0, zoom, cx));
            let _ = session.frame();
            let relayouts = session.view(|view, _| view.edgeless_last_frame_relayouts());
            assert_eq!(
                relayouts, 0,
                "camera zoom={zoom} must cause 0 BlockFlow relayouts"
            );
        }
    }

    #[test]
    fn edgeless_camera_reuses_the_surface_geometry_and_page_snapshot() {
        let session = open(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        session.frame();
        let cached = |v: &mut PlaygroundView, _: &mut Context<PlaygroundView>| {
            (
                v.snapshot.as_ref().unwrap().clone(),
                v.edgeless.cached_surface_layouts(),
            )
        };
        let (page, layouts) = session.view(cached);
        for zoom in [0.5, 1., 2.] {
            session.view(|v, cx| v.set_edgeless_camera(740., 476., zoom, cx));
            let (snapshot, _) = session.frame();
            assert!(snapshot.elements.contains_key("edgeless.surface.collect"));
            let (new_page, new_layouts) = session.view(cached);
            assert!(Rc::ptr_eq(&new_page, &page));
            assert!(Rc::ptr_eq(&new_layouts, &layouts));
            session.view(|v, _| assert_eq!(v.edgeless.last_frame_relayouts, 0));
        }
        session.view(|v, cx| v.set_theme(PlaygroundTheme::Dark, cx));
        session.frame();
        assert!(!Rc::ptr_eq(&session.view(cached).1, &layouts));
    }

    #[test]
    fn yjs_bring_to_front_repaints_the_shape_over_the_note() {
        let oracle: serde_json::Value =
            serde_json::from_str(include_str!("../../../tokens/surface-oracle.json")).unwrap();
        let update =
            |name: &str| serde_json::from_value::<Vec<u8>>(oracle["layers"][name].clone()).unwrap();
        let mut doc = DocState::new("order", 71).unwrap();
        doc.workspace.initialize_meta().unwrap();
        doc.workspace
            .create_page(HOME_PAGE_ID, "Layer order", 1)
            .unwrap();
        doc.workspace
            .ensure_page(HOME_PAGE_ID)
            .unwrap()
            .apply_remote_update_v1(&update("initial"))
            .unwrap();
        let session = open(
            400,
            300,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        session.view(|view, cx| {
            view.set_document(doc, cx);
            view.set_edgeless_camera(0., 0., 1., cx);
        });
        let (_, before) = session.frame();
        // Canvas2D's nonzero fill covers these pixels in the tight turn and right cap.
        // Both are holes under even-odd filling, including a two-pixel margin.
        for (x, y) in [(47, 28), (112, 50)] {
            assert_eq!(
                before.get_pixel(140 + x, TOPBAR_HEIGHT as u32 + 30 + y).0,
                [0, 0, 255, 255],
                "stroke pixel {x},{y}"
            );
        }
        let pixel = (60, TOPBAR_HEIGHT as u32 + 60);
        assert_eq!(before.get_pixel(pixel.0, pixel.1).0, [0, 255, 0, 255]);
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .ensure_page(HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&update("bringToFront"))
                    .unwrap();
            })
        });
        let (_, after) = session.frame();
        assert_eq!(after.get_pixel(pixel.0, pixel.1).0, [255, 0, 0, 255]);
    }

    #[test]
    fn edgeless_rotated_label_respects_local_and_viewport_clips() {
        use blocksuite_playground_doc::schema::SurfaceElementSpec;
        let session = open(
            480,
            320,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                let page = doc.workspace.ensure_page(HOME_PAGE_ID).unwrap();
                page.add_surface_element(
                    "showcase-surface",
                    "clip",
                    "z1",
                    SurfaceElementSpec::Shape {
                        shape_type: "rect".into(),
                        xywh: "[3000,3000,180,54]".into(),
                        filled: true,
                        seed: 1,
                        text: Some("WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW".into()),
                    },
                    1,
                )
                .unwrap();
                for (key, value) in [
                    ("rotate", Any::Integer(30)),
                    ("color", Any::String("#ff00ff".into())),
                    ("fillColor", Any::String("#00ff00".into())),
                    ("strokeStyle", Any::String("none".into())),
                ] {
                    page.set_surface_element_field(
                        "showcase-surface",
                        "clip",
                        key,
                        SessionValue::Any(value),
                        2,
                    )
                    .unwrap();
                }
            });
            view.set_edgeless_camera(2970., 3020., 1., cx);
        });
        let (snapshot, image) = session.frame();
        assert!(!snapshot.elements.contains_key("edgeless.surface.clip"));
        let (sin, cos) = 30_f32.to_radians().sin_cos();
        let mut ink = 0;
        let mut touches_local_edge = false;
        let mut touches_viewport = false;
        for (x, y, p) in image.enumerate_pixels() {
            let label = p[0] > 160 && p[2] > 160 && p[1] < 80;
            let fill = p[1] > 220 && p[0] < 30 && p[2] < 30;
            if !label && !fill {
                continue;
            }
            assert!(y as f32 >= TOPBAR_HEIGHT, "viewport leaked at {x},{y}");
            touches_viewport |= y == TOPBAR_HEIGHT as u32;
            if label {
                let dx = x as f32 + 0.5 - 120.;
                let dy = y as f32 + 0.5 - TOPBAR_HEIGHT - 7.;
                let local_x = dx * cos + dy * sin;
                let local_y = -dx * sin + dy * cos;
                // Horizontal padding constrains the column. Vertical clipping uses the shape edge.
                assert!(
                    local_x.abs() <= 70.6 && local_y.abs() <= 27.6,
                    "label pixel outside rotated clip: {local_x},{local_y}"
                );
                touches_local_edge |= local_y.abs() > 25.5 || local_x.abs() > 68.5;
                ink += 1;
            }
        }
        assert!(
            ink > 50 && touches_local_edge && touches_viewport,
            "ink={ink}, local edge={touches_local_edge}, viewport={touches_viewport}"
        );
    }

    #[test]
    fn edgeless_rotated_text_survives_culling_of_its_unrotated_rect() {
        let session = open(
            320,
            TOPBAR_HEIGHT as u32 + 100,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                let page = doc.workspace.ensure_page(HOME_PAGE_ID).unwrap();
                let mut seed = ShowcaseSeed {
                    page,
                    now_ms: 10000,
                };
                seed.add(
                    "rotated",
                    BlockSpec::EdgelessText {
                        xywh: Some("[3000,300,800,40]".into()),
                    },
                    Some("showcase-surface"),
                )
                .unwrap();
                let now = seed.tick();
                seed.page
                    .set_block_prop(
                        "rotated",
                        "prop:rotate",
                        SessionValue::Any(Any::Integer(90)),
                        now,
                    )
                    .unwrap();
                seed.paragraph(
                    "rotated-line",
                    ParagraphType::Text,
                    "Rotated text remains visible near the top edge of the camera.",
                    "rotated",
                )
                .unwrap();
            });
            view.set_edgeless_camera(3380., 0., 1., cx);
        });
        let (_, image) = session.frame();
        let ink = image
            .enumerate_pixels()
            .filter(|(x, y, p)| {
                (15..55).contains(x)
                    && (*y as f32) > TOPBAR_HEIGHT + 3.
                    && p[0] < 120
                    && p[1] < 120
                    && p[2] < 120
            })
            .count();
        assert!(ink > 40, "rotated text had {ink} visible glyph pixels");
    }

    #[test]
    fn borderless_rotated_quad_blends_inside_its_outer_edge() {
        struct QuadSample;
        impl Render for QuadSample {
            fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
                canvas(
                    |_, _, _| (),
                    |bounds, (), window, _| {
                        window.paint_quad(ui::fill(bounds, ui::rgb(0xffffff)));
                        let matrix = ui::TransformationMatrix::unit()
                            .translate(point(ui::ScaledPixels(96.), ui::ScaledPixels(80.)))
                            .rotate(ui::radians(30_f32.to_radians()));
                        window.with_paint_transformation(matrix, |window| {
                            window.paint_quad(ui::fill(
                                Bounds::new(point(px(-70.), px(-25.)), size(px(140.), px(50.))),
                                ui::rgb(0),
                            ));
                        });
                    },
                )
                .size_full()
            }
        }
        let session = open(200, 160, Default::default());
        let window = session.app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.), px(0.)),
                        size(px(200.), px(160.)),
                    ))),
                    ..Default::default()
                },
                |_, cx| cx.new(|_| QuadSample),
            )
            .unwrap()
        });
        session.platform.windows().last().unwrap().request_frame();
        let image = session.app.update(|cx| {
            window
                .update(cx, |_, win, _| win.render_to_image().unwrap())
                .unwrap()
        });
        let (sin, cos) = 30_f32.to_radians().sin_cos();
        let mut blends = 0;
        for (x, y, p) in image.enumerate_pixels() {
            let dx = x as f32 + 0.5 - 96.;
            let dy = y as f32 + 0.5 - 80.;
            let u = dx * cos + dy * sin;
            let v = -dx * sin + dy * cos;
            if u.abs() < 65. && (24.6..24.95).contains(&v.abs()) && (5..250).contains(&p[0]) {
                blends += 1;
            }
        }
        assert!(blends > 15, "found {blends} blended interior edge pixels");
    }

    #[test]
    fn edgeless_collapsed_note_clips_overflow_content_to_stored_height() {
        for scale in [1_f32, 2.] {
            let height = scale * 120.;
            let mut doc =
                DocState::new("collapse-note", client_id_from_seed(0x504)).expect("state");
            doc.workspace.initialize_meta().expect("meta");
            doc.workspace
                .create_page(HOME_PAGE_ID, "Collapsed Note", 1)
                .expect("page");
            let page = doc.workspace.ensure_page(HOME_PAGE_ID).expect("page");
            let mut seed = ShowcaseSeed { page, now_ms: 0 };
            seed.add(
                "c-page",
                BlockSpec::Page {
                    title: "Collapsed Note".to_string(),
                },
                None,
            )
            .expect("page");
            seed.add(
                "c-note",
                BlockSpec::Note {
                    xywh: Some(format!("[40,40,420,{height}]")),
                },
                Some("c-page"),
            )
            .expect("note");
            let mut edgeless_map = AHashMap::default();
            edgeless_map.insert("scale".into(), Any::Float64(f64::from(scale).into()));
            edgeless_map.insert("collapse".to_string(), Any::True);
            edgeless_map.insert(
                "collapsedHeight".to_string(),
                Any::Float64(120.0_f64.into()),
            );
            let now_ms = seed.tick();
            seed.page
                .set_block_prop(
                    "c-note",
                    "prop:edgeless",
                    SessionValue::Any(Any::Object(Box::new(edgeless_map))),
                    now_ms,
                )
                .expect("collapse prop");
            for i in 0..12 {
                seed.paragraph(
                    &format!("c-p-{i}"),
                    ParagraphType::Text,
                    "Overflowing dark text line that must be clipped below collapsed height",
                    "c-note",
                )
                .expect("paragraph");
            }

            let session = open(
                1280,
                800,
                PlaygroundOptions {
                    mode: PlaygroundMode::Edgeless,
                    ..PlaygroundOptions::default()
                },
            );
            session.view(|view, cx| {
                view.set_document(doc, cx);
                view.set_edgeless_camera(0.0, 0.0, 1.0, cx);
            });
            let (snap, img) = session.frame();
            let note_bounds = snap.elements["edgeless.note.c-note"].bounds;
            assert!(
                (note_bounds.height - height).abs() < 1.0,
                "collapsed note height must stay at {height}, got {}",
                note_bounds.height
            );

            // Start immediately below the stored world-space card.
            let check_top = (TOPBAR_HEIGHT + 40.0 + height + 1.0) as u32;
            let check_bottom = (check_top + 160).min(img.height());
            let mut leaked_dark = 0_u64;
            for y in check_top..check_bottom {
                for x in 60..440 {
                    let p = img.get_pixel(x, y);
                    if p[0] < 160 && p[1] < 160 && p[2] < 160 {
                        leaked_dark += 1;
                    }
                }
            }
            assert_eq!(
                leaked_dark, 0,
                "collapsed note leaked {leaked_dark} dark text pixels below its clamped height"
            );
        }
    }
}
