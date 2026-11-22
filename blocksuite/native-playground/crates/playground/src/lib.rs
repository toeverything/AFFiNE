//! Native BlockSuite Playground shell (native desktop + Web Wasm canvas + headless harness).
//!
//! All targets execute the single shipping [`PlaygroundView`] element tree: screen-space
//! chrome (top bar, mode switcher, theme toggle, presence) around the world-space page
//! rendered by [`block_flow`], with the popovers and block controls of [`overlays`] on top.

pub mod block_flow;
pub mod clipboard;
pub mod edgeless_camera;
pub mod edgeless_canvas;
pub mod editor_session;
pub mod overlays;
pub mod rich_text;
pub mod room_client;
pub mod theme;

use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    rc::Rc,
    sync::Arc,
    time::Duration,
};

use blocksuite_playground_doc::{
    DocResult,
    awareness::{AwarenessPayload, RoomAwareness, TextRangePoint, TextSelectionState},
    client_id_from_seed,
    read::{BlockContent, PageSnapshot},
    schema::{BlockSpec, ListType, ParagraphType},
    session::PageDocSession,
};
use ui::{
    AnyElement, BorderStyle, Bounds, Corners, Edges, FontWeight, Motion, MotionCurve, MouseButton,
    ScrollEvent, SharedString, Task, TextRun, Window, canvas, div, point, prelude::*, px, size,
};
use y_octo::{AHashMap, Any, SessionValue, TextAttributes};

use crate::{
    block_flow::{
        BlockFlow, FlowInput, FlowLayout, ImageSlot, PAGE_SURFACE_ID, PageViewport, RemotePoint,
        RemotePresence, RemoteSelection, decode_image, page_elements, page_geometry,
    },
    overlays::Overlays,
    room_client::{
        DocState, RoomCommand, RoomConfig, RoomEffects, RoomEvent, RoomLink, RoomProtocol,
        RoomStatus,
    },
    theme::{FONT_SANS, Palette},
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

const PILL_WIDTH: f32 = 186.0;
const PILL_PAGE_X: f64 = 4.0;
const PILL_EDGELESS_X: f64 = 94.0;
const PILL_TRANSITION_MS: f64 = 200.0;
const THEME_TOGGLE_SIZE: f32 = 32.0;
const TOPBAR_EDGE: f32 = 12.0;
const SCROLL_LINE: f32 = 20.0;

/// Images whose blob is still missing after this many fetches show as unavailable.
const BLOB_MISSES_SHOWN_UNAVAILABLE: u32 = 3;
/// Longest wait between two fetches of a blob the relay does not have yet.
const BLOB_RETRY_MAX_MS: u64 = 4_000;

/// Wait before fetching a blob again after `misses` consecutive misses: 500 ms, doubling
/// up to [`BLOB_RETRY_MAX_MS`].
fn blob_retry_backoff_ms(misses: u32) -> u64 {
    (250_u64 << misses.clamp(1, 5)).min(BLOB_RETRY_MAX_MS)
}

/// Fetch of a room blob the page references but the document state does not hold yet.
/// It is retried for as long as the page references the blob: an uploader writes the
/// `sourceId` into the document before its upload finishes, and the relay announces no
/// completed upload.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct BlobFetchState {
    in_flight: bool,
    /// Consecutive fetches that found no blob.
    misses: u32,
    /// Scheduler time of the next fetch, once none is in flight.
    next_retry_ms: u64,
}

struct RoomRuntime {
    config: RoomConfig,
    protocol: RoomProtocol,
    link: RoomLink,
    error: Option<String>,
}

type LayoutKey = (u64, u32, PlaygroundTheme, u64);

/// Interactive GPUI root view for desktop, Web canvas, and headless verification sessions.
pub struct PlaygroundView {
    mode: PlaygroundMode,
    theme: PlaygroundTheme,
    origin_time: ui::scheduler::Instant,
    pill_motion: Option<Motion>,
    editor: editor_session::EditorSession,
    editor_focus: ui::FocusHandle,
    reading_anchor: Option<(String, f32)>,
    state: DocState,
    room: Option<RoomRuntime>,
    page_id: Option<String>,
    snapshot: Option<Rc<PageSnapshot>>,
    page_titles: BTreeMap<String, String>,
    /// What each referenced image shows. An entry without a pending fetch was decoded
    /// from its blob and is final.
    images: HashMap<String, ImageSlot>,
    blob_fetches: BTreeMap<String, BlobFetchState>,
    dirty_text: Option<BTreeSet<String>>,
    doc_rev: u64,
    env_rev: u64,
    flow: BlockFlow,
    layout: Option<(LayoutKey, Rc<FlowLayout>)>,
    scroll_y: f32,
    max_scroll: f32,
    /// Window size of the latest frame, in logical pixels.
    window_size: (f32, f32),
    edgeless: edgeless_canvas::EdgelessCanvasState,
    overlays: Overlays,
    /// Timer that ends a code block's `Copied` label; a newer copy replaces it.
    copied_timer: Option<Task<()>>,
    _tasks: Vec<Task<()>>,
}

#[cfg(not(target_family = "wasm"))]
fn fresh_client_id() -> u64 {
    blocksuite_playground_doc::random_client_id()
}

#[cfg(target_family = "wasm")]
fn fresh_client_id() -> u64 {
    client_id_from_seed((js_sys::Math::random() * 9_007_199_254_740_992.0) as u64)
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
            edgeless: edgeless_canvas::EdgelessCanvasState::new(),
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

    pub fn edgeless_camera(&self) -> edgeless_camera::EdgelessCamera {
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

    fn edgeless_viewport_size(&self) -> (f32, f32) {
        let vw = self.window_size.0.max(1.0);
        let vh = (self.window_size.1 - TOPBAR_HEIGHT).max(1.0);
        (vw, vh)
    }

    fn on_edgeless_scroll(&mut self, event: &ScrollEvent, _: &mut Window, cx: &mut Context<Self>) {
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

    fn on_edgeless_pan_start(
        &mut self,
        event: &ui::MouseDownEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.edgeless.drag_pan_anchor = Some(event.position);
        cx.notify();
    }

    fn on_edgeless_pan_move(
        &mut self,
        event: &ui::MouseMoveEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let Some(prev) = self.edgeless.drag_pan_anchor {
            let dx = f32::from(event.position.x) - f32::from(prev.x);
            let dy = f32::from(event.position.y) - f32::from(prev.y);
            self.edgeless.camera.pan_by_screen_delta(dx, dy);
            self.edgeless.drag_pan_anchor = Some(event.position);
            self.edgeless.camera_initialized = true;
            cx.notify();
        }
    }

    fn on_edgeless_pan_end(
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

    /// World-space layout painted by the latest Page frame.
    pub fn flow_layout(&self) -> Option<Rc<FlowLayout>> {
        self.layout.as_ref().map(|(_, layout)| layout.clone())
    }

    /// Connection state of the live room, `None` for the showcase document.
    pub fn room_status(&self) -> Option<RoomStatus> {
        self.room.as_ref().map(|room| room.protocol.status())
    }

    /// Handle every room event already delivered by the transport; returns how many.
    ///
    /// The view also handles events as they arrive on its own; hosts that step the
    /// application manually call this to apply what is queued right now.
    pub fn pump_room(&mut self, cx: &mut Context<Self>) -> usize {
        let Some(events) = self.room.as_ref().map(|room| room.link.events().clone()) else {
            return 0;
        };
        let mut handled = 0;
        while let Ok(event) = events.try_recv() {
            self.handle_room_event(event, cx);
            handled += 1;
        }
        handled
    }

    fn now_ms(&self, cx: &Context<Self>) -> f64 {
        cx.background_executor()
            .now()
            .saturating_duration_since(self.origin_time)
            .as_secs_f64()
            * 1000.0
    }

    fn handle_room_event(&mut self, event: RoomEvent, cx: &mut Context<Self>) {
        let now_ms = self.now_ms(cx) as u64;
        let Some(room) = self.room.as_mut() else {
            return;
        };
        let effects = match event {
            RoomEvent::Opened => {
                let effects = room.protocol.on_open(&mut self.state, now_ms);
                // A fresh connection fetches every missing blob again right away.
                for (source_id, fetch) in &mut self.blob_fetches {
                    fetch.misses = 0;
                    fetch.next_retry_ms = now_ms;
                    if !fetch.in_flight {
                        fetch.in_flight = true;
                        room.link.send(RoomCommand::FetchBlob(source_id.clone()));
                    }
                    if matches!(self.images.get(source_id), Some(ImageSlot::Unavailable)) {
                        self.images.insert(source_id.clone(), ImageSlot::Loading);
                        self.env_rev += 1;
                    }
                }
                effects
            }
            RoomEvent::Frame(frame) => room.protocol.on_frame(&mut self.state, &frame, now_ms),
            RoomEvent::Closed(reason) => Ok(room.protocol.on_close(reason)),
            RoomEvent::Blob {
                source_id,
                bytes: Some(bytes),
            } => {
                // Present bytes are decoded once; bytes that are no image stay unavailable
                // and are never fetched again.
                self.blob_fetches.remove(&source_id);
                let slot = decode_image(&bytes).map_or(ImageSlot::Unavailable, ImageSlot::Ready);
                self.state.blobs.insert(source_id.clone(), Arc::new(bytes));
                self.images.insert(source_id, slot);
                self.env_rev += 1;
                Ok(RoomEffects::default())
            }
            RoomEvent::Blob {
                source_id,
                bytes: None,
            } => {
                if let Some(fetch) = self.blob_fetches.get_mut(&source_id) {
                    fetch.in_flight = false;
                    fetch.misses = fetch.misses.saturating_add(1);
                    fetch.next_retry_ms =
                        now_ms.saturating_add(blob_retry_backoff_ms(fetch.misses));
                    // The frame says so after a few misses; the fetch keeps retrying.
                    if fetch.misses >= BLOB_MISSES_SHOWN_UNAVAILABLE
                        && !matches!(self.images.get(&source_id), Some(ImageSlot::Unavailable))
                    {
                        self.images.insert(source_id, ImageSlot::Unavailable);
                        self.env_rev += 1;
                    }
                }
                Ok(RoomEffects::default())
            }
        };
        match effects {
            Ok(effects) => {
                room.error = None;
                for frame in effects.outbound {
                    room.link.send(RoomCommand::Send(frame));
                }
                if effects.doc_changed {
                    self.capture_reading_anchor();
                    self.refresh_document();
                    self.resolve_remote_selection(cx);
                }
            }
            Err(err) => room.error = Some(err.to_string()),
        }
        cx.notify();
    }

    fn tick_room(&mut self, cx: &mut Context<Self>) {
        let now_ms = self.now_ms(cx) as u64;
        let Some(room) = self.room.as_mut() else {
            return;
        };
        if let Ok(effects) = room.protocol.tick(&mut self.state, now_ms) {
            for frame in effects.outbound {
                room.link.send(RoomCommand::Send(frame));
            }
            if effects.awareness_changed {
                cx.notify();
            }
        }
        // Fetch missing blobs again once their backoff ran out, unless the room is offline.
        if !matches!(room.protocol.status(), RoomStatus::Offline(_)) {
            for (source_id, fetch) in &mut self.blob_fetches {
                if !fetch.in_flight && now_ms >= fetch.next_retry_ms {
                    fetch.in_flight = true;
                    room.link.send(RoomCommand::FetchBlob(source_id.clone()));
                }
            }
        }
    }

    pub fn scroll_offset(&self) -> f32 {
        self.scroll_y
    }
    fn capture_reading_anchor(&mut self) {
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
    fn refresh_document(&mut self) {
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

    fn target_pill_x(mode: PlaygroundMode) -> f64 {
        match mode {
            PlaygroundMode::Page => PILL_PAGE_X,
            PlaygroundMode::Edgeless => PILL_EDGELESS_X,
        }
    }

    fn indicator_x(&self, now_ms: f64) -> f64 {
        match self.pill_motion {
            Some(motion) => motion.value_at(now_ms),
            None => Self::target_pill_x(self.mode),
        }
    }

    fn set_mode(&mut self, target: PlaygroundMode, cx: &mut Context<Self>) {
        if self.mode == target {
            return;
        }
        let now_ms = self.now_ms(cx);
        let current_x = self.indicator_x(now_ms);
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

    fn on_scroll(&mut self, event: &ScrollEvent, _: &mut Window, cx: &mut Context<Self>) {
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

    /// Remote collaborators of the shown page, ordered by client id.
    fn remote_presences(&self, palette: &Palette) -> Vec<RemotePresence> {
        const FALLBACK_COLORS: [&str; 8] = [
            "--affine-multi-players-purple",
            "--affine-multi-players-magenta",
            "--affine-multi-players-red",
            "--affine-multi-players-orange",
            "--affine-multi-players-green",
            "--affine-multi-players-blue",
            "--affine-multi-players-brown",
            "--affine-multi-players-grey",
        ];
        let awareness = &self.state.awareness;
        awareness
            .active_remote_clients()
            .into_iter()
            .filter_map(|client_id| {
                let payload = awareness.get_payload(client_id)?;
                let color = self.theme.css_color(&payload.color).unwrap_or_else(|| {
                    let fallback = FALLBACK_COLORS[(client_id % 8) as usize];
                    self.theme.css_var(fallback).unwrap_or(palette.brand)
                });
                Some(RemotePresence {
                    client_id,
                    name: payload.user.name.clone(),
                    color,
                    selection: self.text_selection(&payload),
                })
            })
            .collect()
    }

    /// The collaborator's text selection in the shown page, if it has one.
    fn text_selection(&self, payload: &AwarenessPayload) -> Option<RemoteSelection> {
        let page_id = self.page_id.as_deref()?;
        // BlockSuite keys `selectionV2` by `${store.id}:${nanoid()}`, and a bare page id is
        // accepted too. JS matches entries with `startsWith(store.id)`; splitting at the
        // last colon is deliberately stricter, so `doc:home` never picks up the selections
        // of `doc:home2` or `doc:home:archive`, and a selection in another page is never
        // shown in this one.
        let selection = payload
            .selection_v2
            .iter()
            .filter(|(key, _)| {
                key.as_str() == page_id
                    || key
                        .rsplit_once(':')
                        .is_some_and(|(store, id)| store == page_id && !id.is_empty())
            })
            .flat_map(|(_, selections)| selections)
            .filter_map(|value| serde_json::from_value::<TextSelectionState>(value.clone()).ok())
            .find(|selection| selection.kind == "text")?;
        let remote_point = |point: TextRangePoint| RemotePoint {
            block_id: point.block_id,
            index: usize::try_from(point.index).unwrap_or(usize::MAX),
            length: usize::try_from(point.length).unwrap_or(0),
        };
        Some(RemoteSelection {
            from: remote_point(selection.from),
            to: selection.to.map(remote_point),
            reverse: selection.reverse.unwrap_or(false),
        })
    }

    fn ensure_layout(&mut self, width: f32, window: &Window) -> Option<Rc<FlowLayout>> {
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

    fn render_mode_switcher(
        &mut self,
        palette: &Palette,
        left: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let now_ms = self.now_ms(cx);
        let raw_indicator_x = self.indicator_x(now_ms);
        if let Some(motion) = self.pill_motion {
            if motion.is_finished(now_ms) {
                self.pill_motion = None;
            } else {
                window.request_animation_frame();
            }
        }
        let indicator_x = raw_indicator_x.round() as f32;
        let is_page = self.mode == PlaygroundMode::Page;
        let is_edgeless = self.mode == PlaygroundMode::Edgeless;

        let indicator = div()
            .absolute()
            .left(px(indicator_x))
            .top(px(4.0))
            .w(px(86.0))
            .h(px(26.0))
            .rounded(px(6.0))
            .bg(palette.background)
            .border_1()
            .border_color(palette.brand)
            .snapshot(
                "chrome.mode_switcher.indicator",
                Some("chrome.mode_switcher"),
            );

        let segment = |id: &'static str, x: f64, active: bool| {
            div()
                .id(id)
                .absolute()
                .left(px(x as f32))
                .top(px(4.0))
                .w(px(86.0))
                .h(px(26.0))
                .rounded(px(6.0))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_color(if active {
                    palette.text_primary
                } else {
                    palette.text_secondary
                })
                .text_size(px(13.0))
                .font_weight(FontWeight::MEDIUM)
        };

        let page_button = segment("mode-page", PILL_PAGE_X, is_page)
            .on_click(cx.listener(|this, _, _, cx| {
                this.set_mode(PlaygroundMode::Page, cx);
            }))
            .snapshot("chrome.mode_switcher.page", Some("chrome.mode_switcher"))
            .snapshot_focused(is_page)
            .snapshot_text("Page")
            .child("Page");

        let edgeless_button = segment("mode-edgeless", PILL_EDGELESS_X, is_edgeless)
            .on_click(cx.listener(|this, _, _, cx| {
                this.set_mode(PlaygroundMode::Edgeless, cx);
            }))
            .snapshot(
                "chrome.mode_switcher.edgeless",
                Some("chrome.mode_switcher"),
            )
            .snapshot_focused(is_edgeless)
            .snapshot_text("Edgeless")
            .child("Edgeless");

        div()
            .absolute()
            .left(px(left))
            .top(px(8.0))
            .w(px(PILL_WIDTH))
            .h(px(36.0))
            .p(px(4.0))
            .rounded(px(10.0))
            .bg(palette.background_secondary)
            .border_1()
            .border_color(palette.border)
            .snapshot("chrome.mode_switcher", Some("chrome.topbar"))
            .child(indicator)
            .child(page_button)
            .child(edgeless_button)
    }

    fn render_theme_toggle(
        &self,
        palette: &Palette,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let ink = palette.text_primary;
        let hover = palette.hover;
        div()
            .id("theme-toggle")
            .flex_none()
            .w(px(THEME_TOGGLE_SIZE))
            .h(px(THEME_TOGGLE_SIZE))
            .rounded(px(8.0))
            .bg(palette.background)
            .border_1()
            .border_color(palette.border)
            .cursor_pointer()
            .hover(move |style| style.bg(hover))
            .on_click(cx.listener(|this, _, _, cx| {
                let next = this.theme.toggled();
                this.set_theme(next, cx);
            }))
            .snapshot("chrome.theme_toggle", Some("chrome.topbar"))
            .snapshot_text(match self.theme {
                PlaygroundTheme::Light => "Light",
                PlaygroundTheme::Dark => "Dark",
            })
            .child(
                // Contrast glyph: a ring whose left half is filled.
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        let glyph = Bounds::new(
                            point(
                                bounds.origin.x + (bounds.size.width - px(14.0)) / 2.0,
                                bounds.origin.y + (bounds.size.height - px(14.0)) / 2.0,
                            ),
                            size(px(14.0), px(14.0)),
                        );
                        window.paint_quad(ui::quad(
                            glyph,
                            Corners::all(px(7.0)),
                            ui::transparent_black(),
                            Edges::all(px(1.5)),
                            ink,
                            BorderStyle::Solid,
                        ));
                        window.paint_quad(ui::quad(
                            Bounds::new(glyph.origin, size(px(7.0), px(14.0))),
                            Corners {
                                top_left: px(7.0),
                                top_right: px(0.0),
                                bottom_right: px(0.0),
                                bottom_left: px(7.0),
                            },
                            ink,
                            Edges::all(px(0.0)),
                            ui::transparent_black(),
                            BorderStyle::Solid,
                        ));
                    },
                )
                .size_full(),
            )
    }

    /// Presence badges that fit in `available` px: name pills on regular viewports,
    /// initials on narrow ones, and a `+N` chip for collaborators that do not fit.
    fn render_presence(
        presences: &[RemotePresence],
        palette: &Palette,
        available: f32,
        compact: bool,
        window: &Window,
    ) -> Vec<AnyElement> {
        const NAME_MAX: f32 = 72.0;
        let slot = if compact {
            32.0
        } else {
            8.0 + 8.0 + 6.0 + NAME_MAX + 10.0 + 8.0
        };
        let capacity = ((available / slot).floor().max(0.0) as usize).min(3);
        if capacity == 0 || presences.is_empty() {
            return Vec::new();
        }
        let shown = if presences.len() > capacity {
            capacity - 1
        } else {
            presences.len()
        };
        let mut badges = Vec::new();
        let hidden = presences.len() - shown;
        if hidden > 0 {
            badges.push(
                div()
                    .flex_none()
                    .w(px(24.0))
                    .h(px(24.0))
                    .rounded(px(12.0))
                    .bg(palette.background_secondary)
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(11.0))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(palette.text_secondary)
                    .snapshot("chrome.presence.more", Some("chrome.topbar"))
                    .snapshot_text(format!("+{hidden}"))
                    .child(format!("+{hidden}"))
                    .into_any_element(),
            );
        }
        for presence in &presences[..shown] {
            let id = SharedString::from(format!("chrome.presence.{}", presence.client_id));
            let name = SharedString::from(presence.name.clone());
            let badge = if compact {
                let initial: String = presence
                    .name
                    .chars()
                    .find(|ch| ch.is_alphanumeric())
                    .map(|ch| ch.to_uppercase().collect())
                    .unwrap_or_else(|| "?".to_string());
                div()
                    .flex_none()
                    .w(px(24.0))
                    .h(px(24.0))
                    .rounded(px(12.0))
                    .bg(presence.color)
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(12.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.on_accent)
                    .snapshot(id, Some("chrome.topbar"))
                    .snapshot_text(name)
                    .child(initial)
            } else {
                // The name box gets an explicit whole-pixel width so the pill stays on
                // the pixel grid whatever the name measures.
                let mut font = ui::font(FONT_SANS);
                font.weight = FontWeight::MEDIUM;
                let measured = window.text_system().shape_line(
                    name.clone(),
                    px(12.0),
                    &[TextRun {
                        len: name.len(),
                        font,
                        color: palette.text_primary,
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    }],
                    None,
                );
                let name_width = f32::from(measured.width()).ceil().min(NAME_MAX);
                div()
                    .flex_none()
                    .h(px(24.0))
                    .pl(px(8.0))
                    .pr(px(10.0))
                    .rounded(px(12.0))
                    .bg(presence.color.opacity(0.14))
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .snapshot(id, Some("chrome.topbar"))
                    .snapshot_text(name.clone())
                    .child(
                        div()
                            .flex_none()
                            .w(px(8.0))
                            .h(px(8.0))
                            .rounded(px(4.0))
                            .bg(presence.color),
                    )
                    .child(
                        div()
                            .flex_none()
                            .w(px(name_width))
                            .truncate()
                            .text_size(px(12.0))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(palette.text_primary)
                            .child(name),
                    )
            };
            badges.push(badge.into_any_element());
        }
        badges
    }

    fn render_page(
        &mut self,
        palette: &Palette,
        viewport_width: f32,
        viewport_height: f32,
        presences: &[RemotePresence],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        if window.focused(cx).is_none() {
            self.editor_focus.focus(window, cx);
        }
        let geometry = page_geometry(viewport_width);
        let surface = div()
            .id("page-viewport")
            .relative()
            .flex_1()
            .w_full()
            .min_h_0()
            .overflow_hidden()
            .bg(palette.background)
            .track_focus(&self.editor_focus)
            .on_mouse_down(MouseButton::Left, cx.listener(Self::page_mouse_down))
            .on_key_down(cx.listener(Self::editor_key_down))
            .on_scroll(cx.listener(Self::on_scroll))
            .snapshot(PAGE_SURFACE_ID, Some("root.canvas"));

        let Some(layout) = self.ensure_layout(geometry.column_width, window) else {
            self.max_scroll = 0.0;
            self.scroll_y = 0.0;
            return surface
                .child(self.render_status(palette, &geometry))
                .into_any_element();
        };
        self.max_scroll = (layout.height - viewport_height).max(0.0).ceil();
        if let Some((id, screen_y)) = self.reading_anchor.take()
            && let Some(block) = layout.block(&id)
        {
            self.scroll_y = (block.y - screen_y).round();
        }
        self.reveal_caret(viewport_height);
        self.scroll_y = self.scroll_y.clamp(0.0, self.max_scroll);
        let viewport = PageViewport {
            column_x: geometry.column_x,
            height: viewport_height,
            scroll_y: self.scroll_y,
        };
        let local = self.local_selection_elements(&layout, viewport, palette);
        let focus = self.editor_focus.clone();
        let entity = cx.entity();
        let marks = layout.presence_marks(presences, palette, window);
        let (paint, controls) = self.overlay_page_layer(&layout, palette, window, cx);
        surface
            .children(page_elements(
                &layout,
                marks,
                PageViewport {
                    column_x: geometry.column_x,
                    height: viewport_height,
                    scroll_y: self.scroll_y,
                },
                &paint,
            ))
            .children(local)
            .child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, cx| {
                        window.handle_input(
                            &focus,
                            ui::ElementInputHandler::new(bounds, entity),
                            cx,
                        )
                    },
                )
                .absolute()
                .size_full(),
            )
            .children(controls)
            .into_any_element()
    }

    /// Shown while a live room has not delivered a page yet.
    fn render_status(
        &self,
        palette: &Palette,
        geometry: &block_flow::PageGeometry,
    ) -> impl IntoElement + use<> {
        let (headline, detail) = match &self.room {
            Some(room) => {
                let headline = match room.protocol.status() {
                    RoomStatus::Connecting => format!("Connecting to room {}", room.config.room),
                    RoomStatus::Syncing { .. } => format!("Syncing room {}", room.config.room),
                    RoomStatus::Live => format!("Room {} has no page yet", room.config.room),
                    RoomStatus::Offline(_) => format!("Room {} is offline", room.config.room),
                };
                let detail = match (room.protocol.status(), &room.error) {
                    (_, Some(error)) => error.clone(),
                    (RoomStatus::Offline(reason), None) => reason,
                    (RoomStatus::Live, None) => {
                        "The page appears here as soon as a peer creates it.".to_string()
                    }
                    _ => room.config.ws_url.clone(),
                };
                (headline, detail)
            }
            None => (
                "This document has no page yet".to_string(),
                "Add an affine:page root block to see it here.".to_string(),
            ),
        };
        div()
            .absolute()
            .left(px(geometry.column_x))
            .top(px(block_flow::TITLE_PADDING_Y))
            .w(px(geometry.column_width))
            .flex()
            .flex_col()
            .gap(px(8.0))
            .snapshot("page.status", Some(PAGE_SURFACE_ID))
            .snapshot_text(headline.clone())
            .child(
                div()
                    .text_size(px(20.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.text_primary)
                    .child(headline),
            )
            .child(
                div()
                    .text_size(px(14.0))
                    .text_color(palette.text_secondary)
                    .child(detail),
            )
    }

    fn render_edgeless(
        &mut self,
        palette: &Palette,
        viewport_width: f32,
        viewport_height: f32,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let Some(snapshot) = self.snapshot.clone() else {
            return div()
                .flex_1()
                .w_full()
                .min_h_0()
                .bg(palette.background_secondary)
                .snapshot(edgeless_canvas::EDGELESS_VIEWPORT_ID, Some("root.canvas"))
                .into_any_element();
        };

        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let vp_size = size(px(viewport_width.max(1.0)), px(viewport_height.max(1.0)));

        let zoom_controls = edgeless_canvas::build_zoom_controls(
            self.edgeless.camera.zoom,
            palette,
            self.theme,
            move |this: &mut Self, _, _, cx| {
                this.edgeless.camera.zoom_out(vp_origin, vp_size);
                this.edgeless.camera_initialized = true;
                cx.notify();
            },
            move |this: &mut Self, _, _, cx| {
                this.edgeless.camera.reset_zoom(vp_origin, vp_size);
                this.edgeless.camera_initialized = true;
                cx.notify();
            },
            move |this: &mut Self, _, _, cx| {
                this.edgeless.camera.zoom_in(vp_origin, vp_size);
                this.edgeless.camera_initialized = true;
                cx.notify();
            },
            move |this: &mut Self, _, _, cx| {
                if let Some(snap) = &this.snapshot {
                    let bounds = this.edgeless.scene_world_bounds(snap);
                    this.edgeless.camera.fit_to_bounds(bounds, vp_size, 48.0);
                    this.edgeless.camera_initialized = true;
                    cx.notify();
                }
            },
            cx,
        );

        let input = edgeless_canvas::EdgelessRenderInput {
            snapshot: &snapshot,
            doc_rev: self.doc_rev,
            env_rev: self.env_rev,
            theme: self.theme,
            palette,
            page_titles: &self.page_titles,
            images: &self.images,
            viewport_width,
            viewport_height,
        };
        let layer = edgeless_canvas::build_edgeless_layer(
            &mut self.edgeless,
            &input,
            window,
            zoom_controls,
        );

        div()
            .flex_1()
            .w_full()
            .min_h_0()
            .flex()
            .flex_col()
            .on_scroll(cx.listener(Self::on_edgeless_scroll))
            .on_mouse_down(
                MouseButton::Middle,
                cx.listener(Self::on_edgeless_pan_start),
            )
            .on_mouse_move(cx.listener(Self::on_edgeless_pan_move))
            .on_mouse_up(MouseButton::Middle, cx.listener(Self::on_edgeless_pan_end))
            .child(layer)
            .into_any_element()
    }
}

impl ui::Render for PlaygroundView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let palette = self.theme.palette();
        let viewport = window.viewport_size();
        let viewport_width = f32::from(viewport.width).floor();
        let viewport_height = (f32::from(viewport.height) - TOPBAR_HEIGHT)
            .max(0.0)
            .floor();
        self.window_size = (viewport_width, f32::from(viewport.height).floor());

        let presences = self.remote_presences(&palette);
        let switcher_left = ((viewport_width - PILL_WIDTH) / 2.0).floor().max(0.0);
        let mode_switcher = self.render_mode_switcher(&palette, switcher_left, window, cx);
        let theme_toggle = self.render_theme_toggle(&palette, cx);
        let presence_room = viewport_width
            - TOPBAR_EDGE
            - THEME_TOGGLE_SIZE
            - 8.0
            - (switcher_left + PILL_WIDTH + 8.0);
        let badges = Self::render_presence(
            &presences,
            &palette,
            presence_room,
            viewport_width < 720.0,
            window,
        );

        let content = match self.mode {
            PlaygroundMode::Page => self.render_page(
                &palette,
                viewport_width,
                viewport_height,
                &presences,
                window,
                cx,
            ),
            PlaygroundMode::Edgeless => {
                self.render_edgeless(&palette, viewport_width, viewport_height, window, cx)
            }
        };
        let popovers = self.overlay_popovers(&palette, window, cx);

        div()
            .relative()
            .size_full()
            .font_family(FONT_SANS)
            .flex()
            .flex_col()
            .bg(palette.background)
            .text_color(palette.text_primary)
            .on_mouse_move(cx.listener(Self::root_mouse_move))
            .on_mouse_up(MouseButton::Left, cx.listener(Self::root_mouse_up))
            .snapshot("root.canvas", None)
            .child(
                div()
                    .relative()
                    .flex_none()
                    .w_full()
                    .h(px(TOPBAR_HEIGHT))
                    .bg(palette.panel)
                    .border_b_1()
                    .border_color(palette.border)
                    .snapshot("chrome.topbar", Some("root.canvas"))
                    .child(mode_switcher)
                    .child(
                        div()
                            .absolute()
                            .right(px(TOPBAR_EDGE))
                            .top(px(0.0))
                            .h(px(TOPBAR_HEIGHT - 1.0))
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .children(badges)
                            .child(theme_toggle),
                    ),
            )
            .child(content)
            .children(popovers)
    }
}

struct ShowcaseSeed<'a> {
    page: &'a mut PageDocSession,
    now_ms: u64,
}

impl ShowcaseSeed<'_> {
    fn tick(&mut self) -> u64 {
        self.now_ms += 600;
        self.now_ms
    }

    fn add(&mut self, id: &str, spec: BlockSpec, parent: Option<&str>) -> DocResult {
        let now_ms = self.tick();
        self.page.add_block(id, spec, parent, None, now_ms)?;
        Ok(())
    }

    fn paragraph(&mut self, id: &str, kind: ParagraphType, text: &str, parent: &str) -> DocResult {
        self.add(
            id,
            BlockSpec::Paragraph {
                paragraph_type: kind,
                text: text.to_string(),
            },
            Some(parent),
        )
    }

    fn list(
        &mut self,
        id: &str,
        kind: ListType,
        text: &str,
        checked: bool,
        parent: &str,
    ) -> DocResult {
        self.add(
            id,
            BlockSpec::List {
                list_type: kind,
                text: text.to_string(),
                checked,
                order: None,
            },
            Some(parent),
        )
    }

    /// A numbered item with its explicit `prop:order`, as the JavaScript editor stores it.
    fn numbered(&mut self, id: &str, text: &str, order: i32, parent: &str) -> DocResult {
        self.add(
            id,
            BlockSpec::List {
                list_type: ListType::Numbered,
                text: text.to_string(),
                checked: false,
                order: Some(order),
            },
            Some(parent),
        )
    }

    /// Apply an inline attribute to the first occurrence of `needle` in the block's text.
    fn mark(&mut self, id: &str, text: &str, needle: &str, key: &str, value: Any) -> DocResult {
        let Some(start) = text.find(needle) else {
            return Ok(());
        };
        let index = text[..start].encode_utf16().count() as u64;
        let len = needle.encode_utf16().count() as u64;
        let mut attrs = TextAttributes::new();
        attrs.insert(key.to_string(), value);
        let now_ms = self.tick();
        self.page
            .format_text(id, "prop:text", index, len, attrs, now_ms)?;
        Ok(())
    }
}

/// The showcase image: a 64 × 40 diagonal gradient PNG, byte-identical on every target.
fn showcase_gradient_png() -> Vec<u8> {
    const WIDTH: u32 = 64;
    const HEIGHT: u32 = 40;
    const FROM: [u32; 3] = [30, 150, 235];
    const TO: [u32; 3] = [123, 97, 255];
    let span = 2 * (WIDTH - 1) * (HEIGHT - 1);
    let mut rgba = Vec::with_capacity((WIDTH * HEIGHT * 4) as usize);
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            let t = x * (HEIGHT - 1) + y * (WIDTH - 1);
            for channel in 0..3 {
                rgba.push(((FROM[channel] * (span - t) + TO[channel] * t) / span) as u8);
            }
            rgba.push(255);
        }
    }
    encode_png_rgba(WIDTH, HEIGHT, &rgba)
}

/// Encode 8-bit RGBA pixels as a PNG whose image data sits in stored (uncompressed)
/// deflate blocks: small, dependency-free, and the same bytes everywhere.
fn encode_png_rgba(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = u32::MAX;
        for &byte in bytes {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xEDB8_8320 & 0_u32.wrapping_sub(crc & 1));
            }
        }
        !crc
    }
    fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let start = out.len();
        out.extend_from_slice(kind);
        out.extend_from_slice(data);
        let crc = crc32(&out[start..]);
        out.extend_from_slice(&crc.to_be_bytes());
    }

    // Scanlines: a zero filter byte followed by the row's pixels.
    let stride = width as usize * 4;
    let mut raw = Vec::with_capacity((stride + 1) * height as usize);
    for row in rgba.chunks_exact(stride).take(height as usize) {
        raw.push(0);
        raw.extend_from_slice(row);
    }

    let mut zlib = vec![0x78, 0x01];
    let mut blocks = raw.chunks(0xFFFF).peekable();
    while let Some(block) = blocks.next() {
        let len = block.len() as u16;
        zlib.push(u8::from(blocks.peek().is_none()));
        zlib.extend_from_slice(&len.to_le_bytes());
        zlib.extend_from_slice(&(!len).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    let (mut a, mut b) = (1_u32, 0_u32);
    for &byte in &raw {
        a = (a + u32::from(byte)) % 65_521;
        b = (b + a) % 65_521;
    }
    zlib.extend_from_slice(&((b << 16) | a).to_be_bytes());

    let mut png = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    // 8 bits per channel, RGBA, deflate, adaptive filtering, no interlace.
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(&mut png, b"IHDR", &header);
    chunk(&mut png, b"IDAT", &zlib);
    chunk(&mut png, b"IEND", &[]);
    png
}

/// Build the deterministic showcase workspace: one page exercising every Page-mode block,
/// its image blob, and one remote collaborator with a text selection.
pub fn seed_showcase_doc() -> DocResult<DocState> {
    const CREATED: i64 = 1_700_000_000_000;
    const REFERENCED_PAGE: &str = "doc:edgeless-notes";
    const INTRO: &str = "This page is a y-octo document laid out by the native BlockFlow \
        renderer. Inline marks keep their styles: bold, italic, inline code, links, and page \
        references such as .";
    const INTRO_TAIL: &str =
        " Remote carets and selections are drawn in each collaborator's color.";

    let mut state = DocState::new(SHOWCASE_ROOM, client_id_from_seed(0x4d32))?;
    state.workspace.initialize_meta()?;
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Native BlockSuite Playground", CREATED)?;
    state
        .workspace
        .create_page(REFERENCED_PAGE, "Edgeless notes", CREATED + 1)?;

    let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
    let mut seed = ShowcaseSeed {
        page,
        now_ms: 1_000,
    };
    seed.add(
        "showcase-page",
        BlockSpec::Page {
            title: "Native BlockSuite Playground".to_string(),
        },
        None,
    )?;
    seed.add(
        "showcase-surface",
        BlockSpec::Surface,
        Some("showcase-page"),
    )?;
    seed.add(
        "showcase-frame",
        BlockSpec::Frame {
            title: "Workspace Overview".to_string(),
            xywh: Some("[-40,-60,1240,1320]".to_string()),
            presentation_index: Some("a0".to_string()),
        },
        Some("showcase-surface"),
    )?;
    seed.add(
        "showcase-note",
        BlockSpec::Note {
            xywh: Some("[0,0,760,1180]".to_string()),
        },
        Some("showcase-page"),
    )?;
    let note = "showcase-note";

    seed.paragraph("showcase-h1", ParagraphType::H1, "Page mode", note)?;
    seed.paragraph("showcase-intro", ParagraphType::Text, INTRO, note)?;
    seed.mark("showcase-intro", INTRO, "bold", "bold", Any::True)?;
    seed.mark("showcase-intro", INTRO, "italic", "italic", Any::True)?;
    seed.mark("showcase-intro", INTRO, "inline code", "code", Any::True)?;
    seed.mark(
        "showcase-intro",
        INTRO,
        "links",
        "link",
        Any::String("https://affine.pro".to_string()),
    )?;
    // A linked-page reference is a single placeholder character carrying the page id.
    let reference_index = INTRO.encode_utf16().count() as u64 - 1;
    let now_ms = seed.tick();
    seed.page
        .insert_text("showcase-intro", "prop:text", reference_index, " ", now_ms)?;
    let mut reference = AHashMap::default();
    reference.insert("type".to_string(), Any::String("LinkedPage".to_string()));
    reference.insert(
        "pageId".to_string(),
        Any::String(REFERENCED_PAGE.to_string()),
    );
    let mut attrs = TextAttributes::new();
    attrs.insert("reference".to_string(), Any::Object(Box::new(reference)));
    let now_ms = seed.tick();
    seed.page.format_text(
        "showcase-intro",
        "prop:text",
        reference_index,
        1,
        attrs,
        now_ms,
    )?;
    let now_ms = seed.tick();
    seed.page.insert_text(
        "showcase-intro",
        "prop:text",
        reference_index + 2,
        INTRO_TAIL,
        now_ms,
    )?;

    seed.paragraph("showcase-h2", ParagraphType::H2, "Blocks", note)?;
    seed.paragraph(
        "showcase-quote",
        ParagraphType::Quote,
        "Every block below comes from the same document the JavaScript editor edits.",
        note,
    )?;

    seed.list(
        "showcase-bullet",
        ListType::Bulleted,
        "Bulleted list item",
        false,
        note,
    )?;
    seed.list(
        "showcase-bullet-nested",
        ListType::Bulleted,
        "Nested item",
        false,
        "showcase-bullet",
    )?;
    seed.list(
        "showcase-bullet-deep",
        ListType::Bulleted,
        "Third level",
        false,
        "showcase-bullet-nested",
    )?;
    seed.numbered("showcase-numbered-1", "First step", 1, note)?;
    seed.numbered("showcase-numbered-2", "Second step", 2, note)?;
    seed.numbered(
        "showcase-numbered-nested",
        "Sub-step",
        1,
        "showcase-numbered-2",
    )?;
    seed.list(
        "showcase-todo-open",
        ListType::Todo,
        "Render remote selections",
        false,
        note,
    )?;
    seed.list(
        "showcase-todo-done",
        ListType::Todo,
        "Read the block tree",
        true,
        note,
    )?;
    seed.list(
        "showcase-toggle-open",
        ListType::Toggle,
        "Toggle with details",
        false,
        note,
    )?;
    seed.paragraph(
        "showcase-toggle-open-child",
        ParagraphType::Text,
        "Children stay visible while the toggle is open.",
        "showcase-toggle-open",
    )?;
    seed.list(
        "showcase-toggle-closed",
        ListType::Toggle,
        "Collapsed toggle",
        false,
        note,
    )?;
    seed.paragraph(
        "showcase-toggle-closed-child",
        ParagraphType::Text,
        "Hidden until expanded.",
        "showcase-toggle-closed",
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-toggle-closed",
        "prop:collapsed",
        SessionValue::Any(Any::True),
        now_ms,
    )?;

    seed.add("showcase-divider", BlockSpec::Divider, Some(note))?;
    seed.add(
        "showcase-code",
        BlockSpec::Code {
            text: "fn main() {\n    println!(\"hello, blocks\");\n}".to_string(),
            language: Some("rust".to_string()),
            caption: String::new(),
        },
        Some(note),
    )?;
    // Wrapped, so narrow windows show every character instead of clipping the long line.
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-code",
        "prop:wrap",
        SessionValue::Any(Any::True),
        now_ms,
    )?;
    seed.add(
        "showcase-bookmark",
        BlockSpec::Bookmark {
            url: "https://affine.pro/".to_string(),
            title: Some("AFFiNE".to_string()),
            description: Some(
                "Open-source workspace for docs, whiteboards and databases.".to_string(),
            ),
        },
        Some(note),
    )?;
    seed.add(
        "showcase-image",
        BlockSpec::Image {
            source_id: SHOWCASE_IMAGE_ID.to_string(),
            caption: "A 64 \u{00d7} 40 gradient decoded from the blob store".to_string(),
            width: 320.0,
            height: 200.0,
            xywh: None,
        },
        Some(note),
    )?;
    let now_ms = seed.tick();
    seed.page.add_raw_block(
        "showcase-database",
        "affine:database",
        3,
        vec![
            (
                "prop:title".to_string(),
                SessionValue::Text(vec![y_octo::TextDeltaOp::Insert {
                    insert: y_octo::TextInsert::Text("Tasks".to_string()),
                    format: None,
                }]),
            ),
            ("prop:views".to_string(), SessionValue::Array(Vec::new())),
            ("prop:columns".to_string(), SessionValue::Array(Vec::new())),
            ("prop:cells".to_string(), SessionValue::Map(Vec::new())),
        ],
        Some(note),
        None,
        now_ms,
    )?;

    // Edgeless-only spatial blocks (excluded from Page mode by `is_edgeless_only`).
    seed.add(
        "showcase-edgeless-note",
        BlockSpec::Note {
            xywh: Some("[820,40,340,260]".to_string()),
        },
        Some("showcase-page"),
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-note",
        "prop:displayMode",
        SessionValue::Any(Any::String("edgeless".to_string())),
        now_ms,
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-note",
        "prop:background",
        SessionValue::Any(Any::String(
            "var(--affine-background-primary-color)".to_string(),
        )),
        now_ms,
    )?;
    seed.paragraph(
        "showcase-edgeless-note-h",
        ParagraphType::H3,
        "Spatial Notes",
        "showcase-edgeless-note",
    )?;
    seed.list(
        "showcase-edgeless-note-b1",
        ListType::Bulleted,
        "GPU world-space transforms & crisp dot-grid",
        false,
        "showcase-edgeless-note",
    )?;
    seed.list(
        "showcase-edgeless-note-b2",
        ListType::Bulleted,
        "Zero BlockFlow relayout during pan & zoom",
        false,
        "showcase-edgeless-note",
    )?;

    seed.add(
        "showcase-edgeless-text",
        BlockSpec::EdgelessText {
            xywh: Some("[820,360,320,84]".to_string()),
        },
        Some("showcase-surface"),
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-text",
        "prop:rotate",
        SessionValue::Any(Any::Float64((-4.0_f64).into())),
        now_ms,
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-text",
        "prop:scale",
        SessionValue::Any(Any::Float64((1.0_f64).into())),
        now_ms,
    )?;
    seed.paragraph(
        "showcase-edgeless-text-p",
        ParagraphType::H4,
        "Rotated EdgelessText on GPU",
        "showcase-edgeless-text",
    )?;

    let image = showcase_gradient_png();
    if !image.is_empty() {
        state
            .blobs
            .insert(SHOWCASE_IMAGE_ID.to_string(), Arc::new(image));
    }

    let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
    let history = page.undo_stack_id();
    page.inner_mut().clear_stack_history(history, true, true)?;

    // One remote collaborator selecting the first words of the intro paragraph, which
    // stay on its first line at every viewport width.
    let mut peer = RoomAwareness::new(client_id_from_seed(0x0ada))?;
    let mut payload =
        AwarenessPayload::new(SHOWCASE_PEER_NAME, "var(--affine-multi-players-purple)");
    let selected = "y-octo document";
    let index = INTRO
        .find(selected)
        .map_or(0, |start| INTRO[..start].encode_utf16().count());
    payload.set_text_selection(
        HOME_PAGE_ID,
        TextSelectionState::range(
            TextRangePoint {
                block_id: "showcase-intro".to_string(),
                index: index as u64,
                length: selected.encode_utf16().count() as u64,
            },
            None,
            false,
        ),
    )?;
    let update = peer.set_local_payload(&payload, 0)?;
    state.awareness.apply_update(&update, 0)?;

    Ok(state)
}

#[cfg(target_family = "wasm")]
fn web_options() -> PlaygroundOptions {
    let mut options = PlaygroundOptions::default();
    let Some(window) = web_sys::window() else {
        return options;
    };
    let location = window.location();
    let Some(params) = location
        .search()
        .ok()
        .and_then(|search| web_sys::UrlSearchParams::new_with_str(&search).ok())
    else {
        return options;
    };
    if let Some(theme) = params.get("theme").and_then(|v| PlaygroundTheme::parse(&v)) {
        options.theme = theme;
    }
    if let Some(mode) = params.get("mode").and_then(|v| PlaygroundMode::parse(&v)) {
        options.mode = mode;
    }
    if let Some(room) = params.get("room").filter(|room| !room.is_empty()) {
        // `?ws=` names the relay; without it the page's own origin serves the room.
        let relay = params.get("ws").filter(|ws| !ws.is_empty()).or_else(|| {
            let protocol = location.protocol().ok()?;
            let host = location.host().ok()?;
            let scheme = if protocol == "https:" { "wss" } else { "ws" };
            Some(format!("{scheme}://{host}"))
        });
        options.room = Some(RoomConfig::new(&room, relay.as_deref()));
    }
    options
}

#[cfg(target_family = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn wasm_main() {
    console_error_panic_hook::set_once();
    clipboard::browser::install();
    let platform = std::rc::Rc::new(ui::WebPlatform::new(false));
    ui::Application::with_platform(platform).run(|cx| {
        if let Err(err) = register_bundled_fonts(cx) {
            panic!("failed to register bundled fonts on web: {err:#}");
        }
        let options = web_options();
        if let Err(err) = cx.open_window(ui::WindowOptions::default(), |_, cx| {
            cx.new(|cx| PlaygroundView::with_options(options, cx))
        }) {
            panic!("failed to open playground web window: {err:#}");
        }
    });
}

#[cfg(test)]
mod tests {
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

            // Count distinct non-white ink pixels inside the rendered Note card region
            // where the code language header ("rust"), code line, and bookmark description sit.
            let card_left = 50_u32;
            let card_top = (TOPBAR_HEIGHT + 40.0) as u32;
            let card_w = (600.0 * zoom).min(1200.0) as u32;
            let card_h = (320.0 * zoom).min(680.0) as u32;
            let mut dark_ink_pixels = 0_u64;
            for y in card_top..(card_top + card_h).min(img.height()) {
                for x in card_left..(card_left + card_w).min(img.width()) {
                    let p = img.get_pixel(x, y);
                    // Text ink in light theme is significantly darker than the white/gray card surface.
                    if p[0] < 180 && p[1] < 180 && p[2] < 180 {
                        dark_ink_pixels += 1;
                    }
                }
            }
            assert!(
                dark_ink_pixels > 150,
                "zoom={zoom}: expected visible glyph ink for code header/line + bookmark description, got only {dark_ink_pixels} dark pixels"
            );

            // Also verify the GPU scene emitted monochrome glyph sprites for the panned note
            // (language label + code + bookmark title/description/url > 40 glyphs).
            let glyph_count = session.app.update(|cx| {
                session
                    .window
                    .update(cx, |_, window, _| {
                        window.rendered_scene().monochrome_sprites.len()
                    })
                    .expect("read scene")
            });
            assert!(
                glyph_count > 60,
                "zoom={zoom}: expected >60 glyph sprites in scene, got {glyph_count}"
            );
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
            (note_w - (400.0 / 2.0 - 2.0 * edgeless_canvas::NOTE_CARD_PADDING)).abs() < 0.01,
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
    fn edgeless_collapsed_note_clips_overflow_content_to_stored_height() {
        let mut doc = DocState::new("collapse-note", client_id_from_seed(0x504)).expect("state");
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
                xywh: Some("[40,40,420,120]".to_string()),
            },
            Some("c-page"),
        )
        .expect("note");
        let mut edgeless_map = AHashMap::default();
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
            (note_bounds.height - 120.0).abs() < 1.0,
            "collapsed note height must stay clamped to 120, got {}",
            note_bounds.height
        );

        // Region well below the 120px collapsed card (and its drop shadow) must contain no dark text ink.
        let check_top = (TOPBAR_HEIGHT + 40.0 + 120.0 + 36.0) as u32;
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
