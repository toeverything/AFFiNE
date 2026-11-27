//! Native BlockSuite Playground shell (native desktop + Web Wasm canvas + headless harness).
//!
//! All targets execute the single shipping [`PlaygroundView`] element tree: screen-space
//! chrome (top bar, mode switcher, theme toggle, presence) around the world-space page
//! rendered by [`block_flow`], with the popovers and block controls of [`overlays`] on top.

pub use blocksuite_editor::{
    TOPBAR_HEIGHT, block_flow, clipboard, database, directory, rich_text, surface, theme,
};
mod chrome;
pub mod edgeless;
pub mod editor_session;
mod layout_cache;
pub mod overlays;
pub mod room_client;

mod showcase;
mod view_room;
#[cfg(target_family = "wasm")]
pub mod wasm_crdt;
#[cfg(target_family = "wasm")]
mod wasm_preview;

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
use ui::{Motion, ScrollEvent, Task, Window, point, prelude::*, px, size};

use crate::{
    block_flow::{BlockFlow, FlowLayout, ImageSlot, page_geometry},
    overlays::Overlays,
    room_client::{DocState, RoomConfig, RoomProtocol},
};

pub use crate::theme::PlaygroundTheme;

/// Registers the tracked repository fonts via `blocksuite-editor` and adds Linux headless
/// Emoji fallback fonts at the host layer so `blocksuite-editor` reads zero host filesystem paths.
pub fn register_bundled_fonts(cx: &ui::App) -> anyhow::Result<()> {
    crate::theme::register_bundled_fonts(cx)?;
    #[cfg(all(target_os = "linux", not(target_arch = "wasm32")))]
    {
        let mut extra: Vec<std::borrow::Cow<'static, [u8]>> = Vec::new();
        for path in [
            "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
            "/usr/share/fonts/truetype/noto/NotoEmoji-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ] {
            if let Ok(bytes) = std::fs::read(path) {
                extra.push(std::borrow::Cow::Owned(bytes));
            }
        }
        if !extra.is_empty() {
            cx.text_system().add_fonts(extra)?;
        }
    }
    Ok(())
}

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
    /// Defaults to `false`. When set to `true` (e.g. via `?mobile=1`, `?edgeless_readonly=1`,
    /// or `--edgeless-readonly` where `enable_mobile_edgeless_editing == false`),
    /// Edgeless mode hides the creation toolbar, disables element authoring/mutation,
    /// and pans smoothly on single-finger / left-pointer drags.
    pub edgeless_readonly: bool,
}

impl PlaygroundOptions {
    /// Parse command-line flags: `--theme light|dark`, `--mode page|edgeless`,
    /// `--edgeless-readonly`, `--room <room>` and `--relay <ws_url>` (a relay without a room is an error).
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
                "--edgeless-readonly" => options.edgeless_readonly = true,
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
pub(crate) const SCROLL_LINE: f32 = 20.0;

type LayoutKey = (u64, u32, PlaygroundTheme, u64, u64, u64, bool, i32, i64);

#[cfg(test)]
pub(crate) static GLOBAL_PREVIEW_PROVIDER_TEST_LOCK: std::sync::Mutex<()> =
    std::sync::Mutex::new(());

pub(crate) type CalendarClockFn = Rc<dyn Fn() -> (i64, i32)>;
pub(crate) type CalendarOffsetAtFn = Rc<dyn Fn(i64) -> i32>;
pub(crate) type ImagePickerFn = Rc<dyn Fn()>;

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
    pub(crate) default_doc_directory: directory::InMemoryDocDirectory,
    pub(crate) cached_page_revisions: HashMap<String, u64>,
    pub(crate) custom_doc_directory: Option<Box<dyn directory::WorkspaceDocDirectory>>,
    pub(crate) preflight_renamed_title: Option<(String, String)>,
    pub(crate) pending_sync_since_sv: BTreeMap<String, Vec<u8>>,
    /// What each referenced image shows. An entry without a pending fetch was decoded
    /// from its blob and is final.
    pub(crate) images: HashMap<String, ImageSlot>,
    /// Rasterized PDF attachment previews keyed by attachment block id.
    pub(crate) pdf_previews: HashMap<String, block_flow::PdfPreviewPage>,
    /// Cache key `(source_id, page_index)` for each rendered PDF attachment block.
    pub(crate) pdf_preview_keys: HashMap<String, (String, usize)>,
    /// Failed PDF blobs `(source_id, byte_len)` skipped on subsequent frames.
    pub(crate) failed_pdf_blobs: BTreeSet<(String, usize)>,
    /// Active 0-based page index for each embedded PDF attachment block id.
    pub(crate) pdf_page_indices: HashMap<String, usize>,
    /// Whether the user explicitly dismissed the mobile keyboard toolbar for the current focus.
    pub(crate) keyboard_toolbar_dismissed: bool,
    /// Bottom software-keyboard inset height from the latest frame (logical px).
    pub(crate) last_keyboard_inset: f32,
    /// Focused in-place `affine:table` cell editor, if active.
    pub(crate) table_cell: Option<overlays::InlineTableCell>,
    pub(crate) suppress_unselected_root_input: bool,
    /// Most recent document id opened via clicking an `embed-linked-doc` / `embed-synced-doc` card.
    pub(crate) last_opened_embed_doc: Option<String>,
    pub(crate) blob_fetches: BTreeMap<String, BlobFetchState>,
    pub(crate) blob_uploads: BTreeMap<String, view_room::BlobUploadState>,
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
    pub(crate) edgeless_readonly: bool,
    pub(crate) database_readonly: bool,
    pub(crate) overlays: Overlays,
    pub(crate) equation_snapshot: Option<blocksuite_playground_doc::session::SelectionSnapshot>,
    pub(crate) calendar_clock: Option<CalendarClockFn>,
    pub(crate) calendar_offset_at: Option<CalendarOffsetAtFn>,
    pub(crate) image_picker: Option<ImagePickerFn>,
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

        let default_doc_directory = directory::InMemoryDocDirectory::with_namespace(format!(
            "doc:{:x}",
            state.awareness.local_client_id()
        ));
        let mut flow = BlockFlow::new();
        flow.database_state.mobile_readonly = options.edgeless_readonly;
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
            default_doc_directory,
            cached_page_revisions: HashMap::new(),
            custom_doc_directory: None,
            preflight_renamed_title: None,
            pending_sync_since_sv: BTreeMap::new(),
            images: HashMap::new(),
            pdf_previews: HashMap::new(),
            pdf_preview_keys: HashMap::new(),
            failed_pdf_blobs: BTreeSet::new(),
            pdf_page_indices: HashMap::new(),
            keyboard_toolbar_dismissed: false,
            last_keyboard_inset: 0.0,
            table_cell: None,
            suppress_unselected_root_input: false,
            last_opened_embed_doc: None,
            blob_fetches: BTreeMap::new(),
            blob_uploads: BTreeMap::new(),
            dirty_text: None,
            doc_rev: 0,
            env_rev: 0,
            flow,
            layout: None,
            scroll_y: 0.0,
            max_scroll: 0.0,
            window_size: (0.0, 0.0),
            edgeless: edgeless::EdgelessCanvasState::new(),
            edgeless_readonly: options.edgeless_readonly,
            database_readonly: options.edgeless_readonly,
            overlays: Overlays::new(),
            equation_snapshot: None,
            calendar_clock: None,
            calendar_offset_at: None,
            image_picker: None,
            copied_timer: None,
            _tasks: tasks,
        };
        view.flow.database_state.mobile_readonly = view.database_readonly;
        view.flow.database_state.clock_ms = view.local_calendar_now(cx).0;
        view.refresh_document();
        view
    }

    pub(crate) fn doc_directory(&self) -> &dyn directory::WorkspaceDocDirectory {
        self.custom_doc_directory
            .as_deref()
            .unwrap_or(&self.default_doc_directory)
    }

    pub(crate) fn doc_directory_mut(&mut self) -> &mut dyn directory::WorkspaceDocDirectory {
        match self.custom_doc_directory.as_deref_mut() {
            Some(custom) => custom,
            None => &mut self.default_doc_directory,
        }
    }

    /// Replaces the host [`directory::WorkspaceDocDirectory`] adapter used by this view.
    pub fn set_doc_directory(&mut self, dir: Box<dyn directory::WorkspaceDocDirectory>) {
        self.custom_doc_directory = Some(dir);
    }

    /// Queries linked documents through the active [`directory::WorkspaceDocDirectory`] adapter.
    pub fn query_linked_docs(
        &self,
        req: &directory::DocQueryRequest,
    ) -> Result<directory::DocQueryPage, directory::DirectoryError> {
        self.doc_directory().query_linked_docs(req)
    }

    /// Creates a linked document through the active [`directory::WorkspaceDocDirectory`] adapter.
    pub fn create_linked_doc(
        &mut self,
        title: &str,
        mode: directory::EditorDocMode,
        intent_id: Option<&str>,
    ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
        let summary = self
            .doc_directory_mut()
            .create_linked_doc(title, mode, intent_id)?;
        let now_ms = summary.updated_at_ms.max(1) as u64;
        self.ensure_workspace_page_and_broadcast(&summary, now_ms)?;
        Ok(summary)
    }

    pub fn mode(&self) -> PlaygroundMode {
        self.mode
    }

    pub fn theme(&self) -> PlaygroundTheme {
        self.theme
    }

    /// Most recent document id opened by clicking an embedded linked/synced document card.
    pub fn last_opened_embed_doc(&self) -> Option<&str> {
        self.last_opened_embed_doc.as_deref()
    }

    /// Active 0-based PDF preview page index for an attachment block.
    pub fn attachment_pdf_page_index(&self, block_id: &str) -> Option<usize> {
        self.pdf_previews.get(block_id).map(|p| p.page_index)
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
            let factor = (f32::from(delta.y) * 0.002).exp();
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

    pub(crate) fn on_edgeless_pinch(
        &mut self,
        event: &ui::PinchEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if event.delta.abs() < 1e-6 {
            return;
        }
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let target_zoom = self.edgeless.camera.zoom * (1.0 + event.delta).max(0.05);
        self.edgeless
            .camera
            .zoom_at(target_zoom, event.position, vp_origin);
        self.edgeless.camera_initialized = true;
        cx.notify();
    }

    /// Whether Edgeless authoring is gated read-only (`enable_mobile_edgeless_editing == false`).
    pub fn edgeless_readonly(&self) -> bool {
        self.edgeless_readonly
    }

    /// Enable or disable the mobile Edgeless read-only authoring gate.
    pub fn set_edgeless_readonly(
        &mut self,
        readonly: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.edgeless_readonly == readonly {
            return;
        }
        if readonly {
            self.edgeless_commit_inline_edit(window, cx);
            self.edgeless.authoring.selection.clear();
            self.edgeless.authoring.gesture = None;
            self.edgeless.authoring.tool = edgeless::EdgelessTool::Hand;
        } else if self.edgeless.authoring.tool == edgeless::EdgelessTool::Hand {
            self.edgeless.authoring.tool = edgeless::EdgelessTool::Select;
        }
        self.edgeless_readonly = readonly;
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
        let had_composing = self.editor.composing()
            || self
                .overlays
                .active_text_field()
                .is_some_and(|f| f.composing())
            || self
                .table_cell
                .as_ref()
                .is_some_and(|c| c.input.composing())
            || self
                .edgeless
                .authoring
                .label_editor()
                .is_some_and(|e| e.composing());
        self.finish_inline_targets(overlays::InlineTargetEnd::DiscardPreedit, None, None);
        self.editor = Default::default();
        self.overlays.reset();
        self.reading_anchor = None;
        self.flow = BlockFlow::new();
        self.flow.database_state.mobile_readonly = self.database_readonly;
        self.flow.database_state.clock_ms = self.local_calendar_now(cx).0;
        self.layout = None;
        self.edgeless = edgeless::EdgelessCanvasState::new();
        self.state = state;
        self.default_doc_directory = directory::InMemoryDocDirectory::with_namespace(format!(
            "doc:{:x}",
            self.state.awareness.local_client_id()
        ));
        self.preflight_renamed_title = None;
        self.cached_page_revisions.clear();
        self.pending_sync_since_sv.clear();
        self.images.clear();
        self.pdf_previews.clear();
        self.pdf_preview_keys.clear();
        self.failed_pdf_blobs.clear();
        self.pdf_page_indices.clear();
        self.keyboard_toolbar_dismissed = false;
        self.last_keyboard_inset = 0.0;
        self.suppress_unselected_root_input = had_composing;
        self.last_opened_embed_doc = None;
        self.blob_fetches.clear();
        self.blob_uploads.clear();
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
}

#[cfg(test)]
pub(crate) mod tests {
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
            TITLE_SPEC, decode_image, paragraph_spec,
        },
        room_client::{RoomCommand, RoomFrame},
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
        serde_json::from_str(include_str!("../../oracle/style-oracle.json"))
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
        for (width, height) in [(1280_u32, 2000_u32), (800, 2200), (390, 3100), (320, 3900)] {
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
                    FlowKind::Database,
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
                let db_text = snapshot.elements["page.block.showcase-database"]
                    .text
                    .as_deref()
                    .unwrap_or("");
                assert!(
                    db_text.contains("Tasks [table: Table View]")
                        && db_text.contains("Native Database Views"),
                    "expected rendered database snapshot text, got {db_text:?}"
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

    pub(crate) type Socket = tokio_tungstenite::WebSocketStream<
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
    pub(crate) fn start_relay(runtime: &tokio::runtime::Runtime) -> std::net::SocketAddr {
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

    pub(crate) fn relay_runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("tokio runtime")
    }

    /// A workspace with one page holding a title, a note and one paragraph (`p-1`).
    pub(crate) fn relay_page_peer(room: &str, client_id: u64) -> WorkspaceSession {
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
    pub(crate) fn join_as_peer(
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
                v.edgeless
                    .cached_surface_layouts()
                    .expect("cached surface layouts"),
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
            serde_json::from_str(include_str!("../../oracle/surface-oracle.json")).unwrap();
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

    #[test]
    fn injected_doc_directory_receives_title_edits_queries_and_idempotent_creates() {
        use std::cell::RefCell;

        struct RecordingDocDirectory {
            inner: directory::InMemoryDocDirectory,
            log: Rc<RefCell<Vec<String>>>,
        }

        impl directory::WorkspaceDocDirectory for RecordingDocDirectory {
            fn query_linked_docs(
                &self,
                req: &directory::DocQueryRequest,
            ) -> Result<directory::DocQueryPage, directory::DirectoryError> {
                self.log.borrow_mut().push(format!("query:{}", req.query));
                self.inner.query_linked_docs(req)
            }

            fn rename_doc_title(
                &mut self,
                id: &directory::EditorDocId,
                title: &str,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                self.log
                    .borrow_mut()
                    .push(format!("rename:{}:{title}", id.as_str()));
                self.inner.rename_doc_title(id, title)
            }

            fn create_linked_doc(
                &mut self,
                title: &str,
                mode: directory::EditorDocMode,
                intent_id: Option<&str>,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                self.log
                    .borrow_mut()
                    .push(format!("create:{title}:{}", intent_id.unwrap_or("none")));
                self.inner.create_linked_doc(title, mode, intent_id)
            }

            fn has_create_intent(&self, intent_id: &str) -> bool {
                self.inner.has_create_intent(intent_id)
            }

            fn is_create_intent_linked(&self, intent_id: &str) -> bool {
                self.inner.is_create_intent_linked(intent_id)
            }

            fn mark_create_intent_linked(&mut self, intent_id: &str) {
                self.inner.mark_create_intent_linked(intent_id);
            }

            fn mark_doc_root_registered(&mut self, id: &directory::EditorDocId) {
                self.inner.mark_doc_root_registered(id);
            }
        }

        let session = open(1280, 800, PlaygroundOptions::default());
        let (snap, _) = session.frame();
        let log = Rc::new(RefCell::new(Vec::new()));
        let inner = directory::InMemoryDocDirectory::with_docs([directory::EditorDocSummary {
            id: directory::EditorDocId::from(HOME_PAGE_ID),
            title: "Native BlockSuite Playground".into(),
            mode: directory::EditorDocMode::Page,
            updated_at_ms: 1,
        }]);
        session.view(|view, _| {
            view.set_doc_directory(Box::new(RecordingDocDirectory {
                inner,
                log: log.clone(),
            }));
        });

        // Edit the page title through normal editor input so `did_edit` fires.
        session.click(&snap, "page.title_block");
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    ui::EntityInputHandler::replace_text_in_range(
                        view, None, " Edited", window, cx,
                    );
                })
                .expect("replace title text");
        });
        let _ = session.frame();

        let (queried, created_first, created_retry) = session.view(|view, _| {
            let queried = view
                .query_linked_docs(&directory::DocQueryRequest::new("Edited", 10))
                .expect("query linked docs");
            let first = view
                .create_linked_doc(
                    "Linked Spec",
                    directory::EditorDocMode::Page,
                    Some("retry-1"),
                )
                .expect("first create");
            let retry = view
                .create_linked_doc(
                    "Linked Spec",
                    directory::EditorDocMode::Page,
                    Some("retry-1"),
                )
                .expect("idempotent retry");
            (queried, first, retry)
        });

        assert_eq!(queried.items.len(), 1);
        assert_eq!(
            queried.items[0].doc.id,
            directory::EditorDocId::from(HOME_PAGE_ID)
        );
        assert!(queried.items[0].doc.title.contains("Edited"));
        assert_eq!(created_first, created_retry);

        let calls = log.borrow();
        assert!(
            calls.iter().any(
                |entry| entry.starts_with(&format!("rename:{HOME_PAGE_ID}:"))
                    && entry.contains("Edited")
            ),
            "expected rename_doc_title call on injected adapter, got {calls:?}"
        );
        assert!(
            calls.iter().any(|entry| entry == "query:Edited"),
            "expected query_linked_docs call on injected adapter, got {calls:?}"
        );
        assert_eq!(
            calls
                .iter()
                .filter(|entry| entry.as_str() == "create:Linked Spec:retry-1")
                .count(),
            2,
            "expected both create_linked_doc calls to hit injected adapter, got {calls:?}"
        );
        drop(calls);

        // User-facing OverlayEvent commands (`@` query + CreateLinkedDoc) also route through
        // the injected WorkspaceDocDirectory and insert `[title](page:<id>)` into the block.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::OpenLinkedDocMenu {
                            block_id: "showcase-intro".to_string(),
                            query: "Edited".to_string(),
                        },
                        window,
                        cx,
                    );
                    assert_eq!(
                        view.overlays()
                            .linked_doc_menu()
                            .expect("linked doc menu open")
                            .results
                            .items
                            .len(),
                        1
                    );
                    view.dispatch_overlay(
                        overlays::OverlayEvent::SetLinkedDocQuery("Spec".to_string()),
                        window,
                        cx,
                    );
                    assert_eq!(
                        view.overlays()
                            .linked_doc_menu()
                            .expect("linked doc menu updated")
                            .results
                            .items
                            .len(),
                        1
                    );
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "showcase-intro".to_string(),
                            title: "Line Converted Doc".to_string(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("line-intent-1".to_string()),
                        },
                        window,
                        cx,
                    );
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "showcase-intro".to_string(),
                            title: "Line Converted Doc".to_string(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("line-intent-1".to_string()),
                        },
                        window,
                        cx,
                    );
                })
                .expect("dispatch linked doc overlay events");
        });
        let _ = session.frame();
        let ref_count = session.view(|view, _| {
            view.page_snapshot()
                .and_then(|s| s.block("showcase-intro"))
                .and_then(overlays::block_text)
                .map(|t| {
                    t.delta
                        .iter()
                        .filter(|op| {
                            matches!(
                                op,
                                y_octo::TextDeltaOp::Insert { format: Some(attrs), .. }
                                if matches!(
                                    attrs.get("reference"),
                                    Some(y_octo::Any::Object(obj))
                                        if matches!(
                                            obj.get("pageId"),
                                            Some(y_octo::Any::String(pid)) if pid == "doc:linked-2"
                                        )
                                )
                            )
                        })
                        .count()
                })
                .unwrap_or(0)
        });
        assert_eq!(
            ref_count, 1,
            "replayed CreateLinkedDoc with same intent_id must insert exactly one LinkedPage InlineReference chip"
        );
    }

    #[test]
    fn rejecting_doc_directory_preserves_peer_crdt_clock_and_continuous_typing_undo() {
        struct ConditionalRenameDirectory {
            inner: directory::InMemoryDocDirectory,
        }

        impl directory::WorkspaceDocDirectory for ConditionalRenameDirectory {
            fn query_linked_docs(
                &self,
                req: &directory::DocQueryRequest,
            ) -> Result<directory::DocQueryPage, directory::DirectoryError> {
                self.inner.query_linked_docs(req)
            }

            fn rename_doc_title(
                &mut self,
                id: &directory::EditorDocId,
                title: &str,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                if title.contains("Forbidden") {
                    return Err(directory::DirectoryError::Other("forbidden title".into()));
                }
                self.inner.rename_doc_title(id, title)
            }

            fn create_linked_doc(
                &mut self,
                title: &str,
                mode: directory::EditorDocMode,
                intent_id: Option<&str>,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                self.inner.create_linked_doc(title, mode, intent_id)
            }

            fn has_create_intent(&self, intent_id: &str) -> bool {
                self.inner.has_create_intent(intent_id)
            }

            fn is_create_intent_linked(&self, intent_id: &str) -> bool {
                self.inner.is_create_intent_linked(intent_id)
            }

            fn mark_create_intent_linked(&mut self, intent_id: &str) {
                self.inner.mark_create_intent_linked(intent_id);
            }

            fn mark_doc_root_registered(&mut self, id: &directory::EditorDocId) {
                self.inner.mark_doc_root_registered(id);
            }
        }

        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        // Sync a real remote peer workspace + page from the initial showcase state.
        let (room_name, initial_root_update, initial_page_update, original_title) =
            session.view(|view, _| {
                let ws = &view.document().workspace;
                let root_u = ws.encode_diff_v1(ws.room(), &[0]).expect("root update");
                let page_u = ws
                    .page(HOME_PAGE_ID)
                    .expect("home page")
                    .encode_update_v1()
                    .expect("page update");
                let title = ws
                    .list_pages()
                    .expect("pages")
                    .into_iter()
                    .find(|p| p.id == HOME_PAGE_ID)
                    .expect("home")
                    .title;
                (ws.room().to_string(), root_u, page_u, title)
            });

        let peer_ws = Rc::new(RefCell::new(
            WorkspaceSession::new(&room_name, client_id_from_seed(0xBEEF)).expect("peer ws"),
        ));
        {
            let mut peer = peer_ws.borrow_mut();
            peer.apply_root_update_v1(&initial_root_update)
                .expect("peer apply root");
            peer.ensure_page(HOME_PAGE_ID)
                .expect("peer page")
                .apply_remote_update_v1(&initial_page_update)
                .expect("peer apply page");
        }

        let peer_sink = peer_ws.clone();
        let room_for_sink = room_name.clone();
        let (_tx, rx) = async_channel::unbounded();
        let capture_link = room_client::RoomLink::from_parts(rx, move |cmd| {
            if let RoomCommand::Send(RoomFrame::Binary(bytes)) = cmd
                && let Ok(RoomBinaryFrame::Doc {
                    doc_id,
                    message: DocMessage::Update(update),
                }) = decode_binary_frame(&bytes)
            {
                let mut peer = peer_sink.borrow_mut();
                if doc_id == room_for_sink {
                    peer.apply_root_update_v1(&update)
                        .expect("peer apply root update");
                } else {
                    peer.ensure_page(&doc_id)
                        .expect("peer page")
                        .apply_remote_update_v1(&update)
                        .expect("peer apply page update");
                }
            }
        });

        session.view(|view, _| {
            view.room = Some(RoomRuntime {
                protocol: RoomProtocol::new(room_name.clone()),
                config: RoomConfig::new(&room_name, None),
                link: capture_link,
                error: None,
            });
            let inner = directory::InMemoryDocDirectory::with_docs([directory::EditorDocSummary {
                id: directory::EditorDocId::from(HOME_PAGE_ID),
                title: original_title.clone(),
                mode: directory::EditorDocMode::Page,
                updated_at_ms: 1,
            }]);
            view.set_doc_directory(Box::new(ConditionalRenameDirectory { inner }));
        });

        // Continuous typing (< 500ms, same caret session): allowed " A", then rejected " Forbidden".
        let root_id = session.view(|view, _| {
            view.page_snapshot()
                .and_then(|s| s.root.as_ref())
                .map(|r| r.id.clone())
                .expect("root id")
        });
        let title_end = original_title.encode_utf16().count();
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::SetSelection(Some(
                            overlays::ActiveSelection::caret(root_id.clone(), title_end),
                        )),
                        window,
                        cx,
                    );
                    ui::EntityInputHandler::replace_text_in_range(view, None, " A", window, cx);
                    ui::EntityInputHandler::replace_text_in_range(
                        view,
                        None,
                        " Forbidden",
                        window,
                        cx,
                    );
                })
                .expect("continuous title edits");
        });
        let _ = session.frame();

        // Subsequent body edit must apply cleanly on peer (zero CRDT clock gap!).
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::SetSelection(Some(
                            overlays::ActiveSelection::caret("showcase-intro", 0),
                        )),
                        window,
                        cx,
                    );
                    ui::EntityInputHandler::replace_text_in_range(view, None, " more", window, cx);
                })
                .expect("body edit");
        });
        let _ = session.frame();

        let expected_title = format!("{original_title} A");
        let (local_title, local_body) = session.view(|view, _| {
            let snap = view.page_snapshot().expect("snap");
            let t = snap
                .root
                .as_ref()
                .and_then(|r| match &r.content {
                    BlockContent::Page { title } => Some(title.plain.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            let b = snap
                .block("showcase-intro")
                .and_then(overlays::block_text)
                .map(|rt| rt.plain.clone())
                .unwrap_or_default();
            (t, b)
        });
        let (peer_meta_title, peer_page_title, peer_body) = {
            let peer = peer_ws.borrow();
            let meta = peer
                .list_pages()
                .expect("peer pages")
                .into_iter()
                .find(|p| p.id == HOME_PAGE_ID)
                .expect("peer home")
                .title;
            let snap = peer
                .page(HOME_PAGE_ID)
                .expect("peer page")
                .read_page_snapshot()
                .expect("peer snap");
            let pt = snap
                .root
                .as_ref()
                .and_then(|r| match &r.content {
                    BlockContent::Page { title } => Some(title.plain.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            let pb = snap
                .block("showcase-intro")
                .and_then(overlays::block_text)
                .map(|rt| rt.plain.clone())
                .unwrap_or_default();
            (meta, pt, pb)
        };
        assert_eq!(local_title, expected_title);
        assert_eq!(peer_meta_title, expected_title);
        assert_eq!(peer_page_title, expected_title);
        assert!(local_body.starts_with(" more"), "local body={local_body:?}");
        assert!(
            peer_body.starts_with(" more"),
            "peer body missed later edit (CRDT clock gap!): {peer_body:?}"
        );

        // Redo must not resurrect " Forbidden"; undo cleanly unwinds " more" then " A".
        session.view(|view, _| {
            let page = view
                .state
                .workspace
                .page_mut(HOME_PAGE_ID)
                .expect("home page");
            assert!(page.redo().expect("redo").is_none());
            assert!(page.undo().expect("undo body").is_some());
            assert!(page.undo().expect("undo title").is_some());
            let snap = page.read_page_snapshot().expect("snap after undo");
            let reverted = snap
                .root
                .as_ref()
                .and_then(|r| match &r.content {
                    BlockContent::Page { title } => Some(title.plain.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            assert_eq!(reverted, original_title);
        });
    }

    #[test]
    fn default_doc_directory_preserves_intents_and_edgeless_metadata_across_refresh() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let first = session.view(|view, _| {
            view.create_linked_doc(
                "Edgeless Spec",
                directory::EditorDocMode::Edgeless,
                Some("intent-x"),
            )
            .expect("first create")
        });
        assert_eq!(first.mode, directory::EditorDocMode::Edgeless);
        assert!(first.updated_at_ms > 0);

        // Structural edit triggers `refresh_document()` while the view is in Page mode.
        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).expect("home page");
                page.add_block(
                    "structural-divider",
                    BlockSpec::Divider,
                    Some("showcase-note"),
                    None,
                    3_000_000,
                )
                .expect("add divider");
            });
        });
        let _ = session.frame();

        let (replayed, queried) = session.view(|view, _| {
            let replayed = view
                .create_linked_doc(
                    "Edgeless Spec",
                    directory::EditorDocMode::Edgeless,
                    Some("intent-x"),
                )
                .expect("replayed create");
            let queried = view
                .query_linked_docs(&directory::DocQueryRequest::new("Edgeless Spec", 10))
                .expect("query edgeless");
            (replayed, queried)
        });
        assert_eq!(replayed.id, first.id);
        assert_eq!(queried.items.len(), 1);
        assert_eq!(
            queried.items[0].doc.mode,
            directory::EditorDocMode::Edgeless
        );
        assert_eq!(queried.items[0].doc.updated_at_ms, first.updated_at_ms);
    }

    #[test]
    fn typed_at_opens_linked_doc_menu_and_slash_linked_converts_line_to_reference_chip() {
        let capture_dir = std::env::var("W2_CAPTURE_LINKED_DOC_PNG_DIR").ok();
        for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
            let session = open(
                1280,
                800,
                PlaygroundOptions {
                    theme,
                    ..PlaygroundOptions::default()
                },
            );
            let _ = session.frame();

            // Seed an additional linked doc so the `@` menu displays multiple items + Create row.
            session.view(|view, _| {
                let _ = view
                    .create_linked_doc("Project Roadmap", directory::EditorDocMode::Page, None)
                    .expect("seed roadmap");
            });

            // Place caret at the start of `showcase-intro` and type `@Project` to open `@` menu.
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::SetSelection(Some(
                                overlays::ActiveSelection::caret("showcase-intro", 0),
                            )),
                            window,
                            cx,
                        );
                        ui::EntityInputHandler::replace_text_in_range(view, None, "@", window, cx);
                        ui::EntityInputHandler::replace_text_in_range(
                            view, None, "Project", window, cx,
                        );
                    })
                    .expect("type @Project");
            });
            session.platform.advance_clock(Duration::from_millis(200));
            let (menu_snap, menu_img) = session.frame();
            assert_no_violations(&menu_snap, "linked doc menu open");
            assert!(
                menu_snap.elements.contains_key("overlay.linked_doc_menu"),
                "expected overlay.linked_doc_menu in FrameSnapshot"
            );
            assert!(
                menu_snap
                    .elements
                    .contains_key("overlay.linked_doc_menu.item.0"),
                "expected matched item row in linked doc menu"
            );
            assert!(
                menu_snap
                    .elements
                    .contains_key("overlay.linked_doc_menu.create"),
                "expected create row in linked doc menu"
            );
            if let Some(dir) = &capture_dir {
                let _ = std::fs::create_dir_all(dir);
                let path = format!("{dir}/linked_doc_menu_{}.png", theme.as_str());
                menu_img.save(&path).expect("save linked doc menu png");
            }

            // Select the first matched doc: removes `@Project` and inserts LinkedPage ReferenceChip.
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::LinkedDocSelect(0),
                            window,
                            cx,
                        );
                    })
                    .expect("select linked doc");
            });
            session.platform.advance_clock(Duration::from_millis(200));
            let (after_snap, _) = session.frame();
            assert_no_violations(&after_snap, "after linked doc reference chip");
            let has_chip = session.view(|view, _| {
                view.page_snapshot()
                    .and_then(|s| s.block("showcase-intro"))
                    .and_then(overlays::block_text)
                    .is_some_and(|t| {
                        !t.plain.contains("@Project")
                            && t.delta.iter().any(|op| {
                                matches!(
                                    op,
                                    y_octo::TextDeltaOp::Insert { format: Some(attrs), .. }
                                    if attrs.contains_key("reference")
                                )
                            })
                    })
            });
            assert!(has_chip, "expected InlineReference chip after @ selection");

            // Also verify `/newdoc` (`SlashCommand::NewDoc`) creates a new empty doc and inserts
            // an InlineReference chip at the caret while preserving surrounding text.
            if matches!(theme, PlaygroundTheme::Light) {
                let docs_before = session.view(|view, _| {
                    view.query_linked_docs(&directory::DocQueryRequest::new("", 50))
                        .expect("docs before /newdoc")
                        .items
                        .len()
                });
                session.app.update(|cx| {
                    session
                        .window
                        .update(cx, |view, window, cx| {
                            view.dispatch_overlay(
                                overlays::OverlayEvent::SetSelection(Some(
                                    overlays::ActiveSelection::caret("showcase-intro", 0),
                                )),
                                window,
                                cx,
                            );
                            ui::EntityInputHandler::replace_text_in_range(
                                view, None, "/", window, cx,
                            );
                            ui::EntityInputHandler::replace_text_in_range(
                                view, None, "newdoc", window, cx,
                            );
                            view.dispatch_overlay(
                                overlays::OverlayEvent::SlashExecute(0),
                                window,
                                cx,
                            );
                        })
                        .expect("execute /newdoc");
                });
                let (docs_after, slash_chip) = session.view(|view, _| {
                    let count = view
                        .query_linked_docs(&directory::DocQueryRequest::new("", 50))
                        .expect("docs after /newdoc")
                        .items
                        .len();
                    let chip = view
                        .page_snapshot()
                        .and_then(|s| s.block("showcase-intro"))
                        .and_then(overlays::block_text)
                        .is_some_and(|t| {
                            t.plain.starts_with(' ')
                                && t.plain.len() > 1
                                && !t.plain.contains("/newdoc")
                                && t.delta.iter().any(|op| {
                                    matches!(
                                        op,
                                        y_octo::TextDeltaOp::Insert { format: Some(attrs), .. }
                                        if attrs.contains_key("reference")
                                    )
                                })
                        });
                    (count, chip)
                });
                assert_eq!(docs_after, docs_before + 1);
                assert!(slash_chip, "expected InlineReference chip after /newdoc");
            }
        }
    }

    #[test]
    fn default_doc_directory_syncs_on_workspace_switch() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let mut fresh_doc = DocState::new("fresh-ws", client_id_from_seed(0x9999)).expect("doc");
        fresh_doc.workspace.initialize_meta().expect("meta");
        fresh_doc
            .workspace
            .create_page("doc:alpha", "Fresh Workspace Alpha", 1)
            .expect("create alpha");
        let page = fresh_doc
            .workspace
            .ensure_page("doc:alpha")
            .expect("ensure alpha");
        let mut seed = ShowcaseSeed { page, now_ms: 0 };
        seed.add(
            "alpha-page",
            BlockSpec::Page {
                title: "Fresh Workspace Alpha".to_string(),
            },
            None,
        )
        .expect("page block");

        session.view(|view, cx| view.set_document(fresh_doc, cx));
        let _ = session.frame();

        let (old_hits, new_hits) = session.view(|view, _| {
            let old = view
                .query_linked_docs(&directory::DocQueryRequest::new("Playground", 10))
                .expect("query old");
            let new = view
                .query_linked_docs(&directory::DocQueryRequest::new("Fresh Workspace", 10))
                .expect("query new");
            (old, new)
        });
        assert!(
            old_hits.items.is_empty(),
            "stale showcase pages must not remain after set_document: {old_hits:?}"
        );
        assert_eq!(new_hits.items.len(), 1);
        assert_eq!(
            new_hits.items[0].doc.id,
            directory::EditorDocId::from("doc:alpha")
        );
    }

    #[test]
    fn edgeless_note_layout_cache_invalidates_on_rtl_direction_switch() {
        let build_doc = || {
            let mut doc = DocState::new("rtl-edgeless", client_id_from_seed(0x4171)).expect("doc");
            doc.workspace.initialize_meta().expect("meta");
            doc.workspace
                .create_page(HOME_PAGE_ID, "RTL Edgeless", 1)
                .expect("page");
            let page = doc.workspace.ensure_page(HOME_PAGE_ID).expect("page");
            let mut seed = ShowcaseSeed { page, now_ms: 0 };
            seed.add(
                "r-page",
                BlockSpec::Page {
                    title: "RTL Edgeless".to_string(),
                },
                None,
            )
            .expect("page");
            seed.add(
                "r-note",
                BlockSpec::Note {
                    xywh: Some("[40,40,420,240]".to_string()),
                },
                Some("r-page"),
            )
            .expect("note");
            seed.add(
                "r-todo",
                BlockSpec::List {
                    list_type: ListType::Todo,
                    text: "Parent todo item".to_string(),
                    checked: false,
                    order: None,
                },
                Some("r-note"),
            )
            .expect("todo");
            seed.paragraph(
                "r-child",
                ParagraphType::Text,
                "Indented child paragraph",
                "r-todo",
            )
            .expect("child");
            doc
        };

        let snapshot_blocks = |layout: &FlowLayout| -> Vec<(String, f32, f32, f32, f32)> {
            layout
                .blocks
                .iter()
                .map(|b| (b.block_id.clone(), b.x, b.y, b.body.width, b.body.height))
                .collect()
        };

        // Session A: render LTR first, then switch direction to RTL without mutating doc/theme/size.
        let switched = open(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..PlaygroundOptions::default()
            },
        );
        switched.view(|view, cx| {
            view.set_document(build_doc(), cx);
            view.set_edgeless_camera(0.0, 0.0, 1.0, cx);
        });
        let _ = switched.frame();
        let ltr_layout = switched.view(|view, _| {
            view.edgeless
                .cached_note_layout("r-note")
                .expect("ltr note layout")
        });
        assert_eq!(ltr_layout.direction, ui::Direction::Ltr);

        switched.app.update(|cx| {
            switched
                .window
                .update(cx, |_, window, cx| {
                    window.set_root_layout_direction(ui::Direction::Rtl);
                    cx.notify();
                })
                .expect("switch to rtl");
        });
        let _ = switched.frame();
        let switched_rtl = switched.view(|view, _| {
            view.edgeless
                .cached_note_layout("r-note")
                .expect("rtl note layout")
        });
        assert_eq!(switched_rtl.direction, ui::Direction::Rtl);

        // Session B: fresh Edgeless session created directly in RTL.
        let fresh_rtl_session = open(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..PlaygroundOptions::default()
            },
        );
        fresh_rtl_session.app.update(|cx| {
            fresh_rtl_session
                .window
                .update(cx, |view, window, cx| {
                    window.set_root_layout_direction(ui::Direction::Rtl);
                    view.set_document(build_doc(), cx);
                    view.set_edgeless_camera(0.0, 0.0, 1.0, cx);
                })
                .expect("init fresh rtl");
        });
        let _ = fresh_rtl_session.frame();
        let fresh_rtl = fresh_rtl_session.view(|view, _| {
            view.edgeless
                .cached_note_layout("r-note")
                .expect("fresh rtl note layout")
        });
        assert_eq!(fresh_rtl.direction, ui::Direction::Rtl);
        assert_eq!(snapshot_blocks(&switched_rtl), snapshot_blocks(&fresh_rtl));
    }

    #[test]
    fn keyboard_undo_title_rejection_keeps_root_page_and_peer_consistent() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let (room_name, initial_root_update, initial_page_update, original_title, root_id) =
            session.view(|view, _| {
                let ws = &view.document().workspace;
                let root_u = ws.encode_diff_v1(ws.room(), &[0]).expect("root update");
                let page_u = ws
                    .page(HOME_PAGE_ID)
                    .expect("home page")
                    .encode_update_v1()
                    .expect("page update");
                let title = ws
                    .list_pages()
                    .expect("pages")
                    .into_iter()
                    .find(|p| p.id == HOME_PAGE_ID)
                    .expect("home")
                    .title;
                let rid = view
                    .page_snapshot()
                    .and_then(|s| s.root.as_ref())
                    .map(|r| r.id.clone())
                    .expect("root id");
                (ws.room().to_string(), root_u, page_u, title, rid)
            });

        let peer_ws = Rc::new(RefCell::new(
            WorkspaceSession::new(&room_name, client_id_from_seed(0xCAFE)).expect("peer ws"),
        ));
        {
            let mut peer = peer_ws.borrow_mut();
            peer.apply_root_update_v1(&initial_root_update)
                .expect("peer root");
            peer.ensure_page(HOME_PAGE_ID)
                .expect("peer page")
                .apply_remote_update_v1(&initial_page_update)
                .expect("peer apply page");
        }

        let outbox: Rc<RefCell<Vec<(String, Vec<u8>)>>> = Rc::new(RefCell::new(Vec::new()));
        let sink = outbox.clone();
        let (_tx, rx) = async_channel::unbounded();
        let capture_link = room_client::RoomLink::from_parts(rx, move |cmd| {
            if let RoomCommand::Send(RoomFrame::Binary(bytes)) = cmd
                && let Ok(RoomBinaryFrame::Doc {
                    doc_id,
                    message: DocMessage::Update(update),
                }) = decode_binary_frame(&bytes)
            {
                sink.borrow_mut().push((doc_id, update));
            }
        });

        let blocked_title = Rc::new(RefCell::new(Option::<String>::None));
        let blocked_for_dir = blocked_title.clone();
        struct PolicyRejectDirectory {
            inner: directory::InMemoryDocDirectory,
            blocked_title: Rc<RefCell<Option<String>>>,
        }
        impl directory::WorkspaceDocDirectory for PolicyRejectDirectory {
            fn query_linked_docs(
                &self,
                req: &directory::DocQueryRequest,
            ) -> Result<directory::DocQueryPage, directory::DirectoryError> {
                self.inner.query_linked_docs(req)
            }
            fn rename_doc_title(
                &mut self,
                id: &directory::EditorDocId,
                title: &str,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                if self.blocked_title.borrow().as_deref() == Some(title) {
                    return Err(directory::DirectoryError::Other(
                        "title rejected by policy".into(),
                    ));
                }
                self.inner.rename_doc_title(id, title)
            }
            fn create_linked_doc(
                &mut self,
                title: &str,
                mode: directory::EditorDocMode,
                intent_id: Option<&str>,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                self.inner.create_linked_doc(title, mode, intent_id)
            }

            fn has_create_intent(&self, intent_id: &str) -> bool {
                self.inner.has_create_intent(intent_id)
            }

            fn is_create_intent_linked(&self, intent_id: &str) -> bool {
                self.inner.is_create_intent_linked(intent_id)
            }

            fn mark_create_intent_linked(&mut self, intent_id: &str) {
                self.inner.mark_create_intent_linked(intent_id);
            }

            fn mark_doc_root_registered(&mut self, id: &directory::EditorDocId) {
                self.inner.mark_doc_root_registered(id);
            }
        }
        session.view(|view, _| {
            view.room = Some(RoomRuntime {
                config: room_client::RoomConfig::new(&room_name, Some("ws://127.0.0.1:1")),
                link: capture_link,
                protocol: RoomProtocol::new(&room_name),
                error: None,
            });
            let inner = directory::InMemoryDocDirectory::with_docs([directory::EditorDocSummary {
                id: directory::EditorDocId::from(HOME_PAGE_ID),
                title: original_title.clone(),
                mode: directory::EditorDocMode::Page,
                updated_at_ms: 1,
            }]);
            view.set_doc_directory(Box::new(PolicyRejectDirectory {
                inner,
                blocked_title: blocked_for_dir,
            }));
        });

        let drain_and_assert_peer_never_sees = |forbidden: Option<&str>| {
            let frames: Vec<(String, Vec<u8>)> = outbox.borrow_mut().drain(..).collect();
            for (doc_id, update) in frames {
                let mut peer = peer_ws.borrow_mut();
                if doc_id == room_name {
                    peer.apply_root_update_v1(&update)
                        .expect("peer apply root update");
                } else {
                    peer.ensure_page(&doc_id)
                        .expect("peer page")
                        .apply_remote_update_v1(&update)
                        .expect("peer apply page update");
                }
                if let Some(bad) = forbidden {
                    let page_t = peer
                        .page(HOME_PAGE_ID)
                        .expect("peer home page")
                        .read_page_snapshot()
                        .expect("peer snap")
                        .root
                        .as_ref()
                        .and_then(|r| match &r.content {
                            BlockContent::Page { title } => Some(title.plain.clone()),
                            _ => None,
                        })
                        .unwrap_or_default();
                    assert_ne!(
                        page_t, bad,
                        "peer observed forbidden intermediate title {bad:?} after a single frame"
                    );
                }
            }
        };

        let make_key = |shift: bool| ui::KeyDownEvent {
            keystroke: ui::Keystroke {
                modifiers: ui::Modifiers {
                    control: true,
                    platform: true,
                    shift,
                    ..Default::default()
                },
                key: "z".to_string(),
                key_char: None,
            },
            is_held: false,
            prefer_character_input: false,
        };

        // 1. Allow Base -> Base A, drain frames to peer.
        let title_end = original_title.encode_utf16().count();
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::SetSelection(Some(
                            overlays::ActiveSelection::caret(root_id.clone(), title_end),
                        )),
                        window,
                        cx,
                    );
                    ui::EntityInputHandler::replace_text_in_range(view, None, " A", window, cx);
                })
                .expect("append A");
        });
        let _ = session.frame();
        drain_and_assert_peer_never_sees(None);

        // 2. Reject keyboard Undo (`Base A -> Base`): peer must NEVER see `Base` on any frame.
        *blocked_title.borrow_mut() = Some(original_title.clone());
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.editor_key_down(&make_key(false), window, cx);
                })
                .expect("rejected keyboard undo");
        });
        drain_and_assert_peer_never_sees(Some(&original_title));

        // 3. Allow Undo (`Base A -> Base`), then reject keyboard Redo (`Base -> Base A`):
        // peer must NEVER see `Base A` on any frame.
        *blocked_title.borrow_mut() = None;
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.editor_key_down(&make_key(false), window, cx);
                })
                .expect("allowed keyboard undo");
        });
        drain_and_assert_peer_never_sees(None);

        let title_a = format!("{original_title} A");
        *blocked_title.borrow_mut() = Some(title_a.clone());
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.editor_key_down(&make_key(true), window, cx);
                    view.dispatch_overlay(
                        overlays::OverlayEvent::SetSelection(Some(
                            overlays::ActiveSelection::caret("showcase-intro", 0),
                        )),
                        window,
                        cx,
                    );
                    ui::EntityInputHandler::replace_text_in_range(view, None, " next", window, cx);
                })
                .expect("rejected keyboard redo + body edit");
        });
        let _ = session.frame();
        drain_and_assert_peer_never_sees(Some(&title_a));

        let (local_root_title, local_page_title) = session.view(|view, _| {
            let root_t = view
                .document()
                .workspace
                .list_pages()
                .expect("local pages")
                .into_iter()
                .find(|p| p.id == HOME_PAGE_ID)
                .expect("local home")
                .title;
            let page_t = view
                .page_snapshot()
                .and_then(|s| s.root.as_ref())
                .and_then(|r| match &r.content {
                    BlockContent::Page { title } => Some(title.plain.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            (root_t, page_t)
        });
        let (peer_root_title, peer_page_title, peer_body) = {
            let peer = peer_ws.borrow();
            let root_t = peer
                .list_pages()
                .expect("peer pages")
                .into_iter()
                .find(|p| p.id == HOME_PAGE_ID)
                .expect("peer home")
                .title;
            let snap = peer
                .page(HOME_PAGE_ID)
                .expect("peer home page")
                .read_page_snapshot()
                .expect("peer snap");
            let page_t = snap
                .root
                .as_ref()
                .and_then(|r| match &r.content {
                    BlockContent::Page { title } => Some(title.plain.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            let body = snap
                .block("showcase-intro")
                .and_then(overlays::block_text)
                .map(|rt| rt.plain.clone())
                .unwrap_or_default();
            (root_t, page_t, body)
        };
        assert_eq!(local_root_title, original_title);
        assert_eq!(local_page_title, original_title);
        assert_eq!(peer_root_title, original_title);
        assert_eq!(peer_page_title, original_title);
        assert!(
            peer_body.starts_with(" next"),
            "peer missed body edit after rejected keyboard undo/redo: {peer_body:?}"
        );

        // 4. Fault-injection checks: run each fault (`NoopRevert`, `ErrRevert`, and `FailMerge`)
        // in its own fresh isolated session + peer + outbox with deterministic `Undo = [pre-body]`,
        // `Redo = [Base A]`, proving fallback hit == 1, 0 outbound frames on rejection, full
        // preservation of both Redo (title) and Undo (prior body edit), gapless peer sync, and
        // zero title leak if the user edits body while title rejection is still active.
        for fault in [
            editor_session::HistoryRejectFault::NoopRevert,
            editor_session::HistoryRejectFault::ErrRevert,
            editor_session::HistoryRejectFault::FailMerge,
        ] {
            let iso = open(1280, 800, PlaygroundOptions::default());
            let _ = iso.frame();

            // Write `"!"` via `PageDocSession::inner_mut()` before syncing to peer and clearing
            // history, proving direct `inner_mut()` writes and `Untracked` initial showcase blocks
            // survive all 3 fault paths without any persistent replay journal.
            iso.view(|view, _| {
                let page = view
                    .state
                    .workspace
                    .page_mut(HOME_PAGE_ID)
                    .expect("home page");
                let intro_target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key("showcase-intro")
                        .key("prop:text"),
                );
                let _ = page
                    .inner_mut()
                    .text_insert(&intro_target, 0, "!")
                    .expect("inner_mut text_insert");
                let history = page.undo_stack_id();
                page.inner_mut()
                    .clear_stack_history(history, true, true)
                    .expect("clear history after inner_mut");
                view.refresh_document();
            });

            let (
                iso_room,
                iso_init_root,
                iso_init_page,
                iso_base_title,
                iso_root_id,
                iso_orig_body,
            ) = iso.view(|view, _| {
                let ws = &view.document().workspace;
                let r = ws.encode_diff_v1(ws.room(), &[0]).expect("root u");
                let p = ws
                    .page(HOME_PAGE_ID)
                    .expect("home")
                    .encode_update_v1()
                    .expect("page u");
                let t = ws
                    .list_pages()
                    .expect("pages")
                    .into_iter()
                    .find(|pg| pg.id == HOME_PAGE_ID)
                    .expect("home")
                    .title;
                let snap = view.page_snapshot().expect("snap");
                let rid = snap.root.as_ref().expect("root").id.clone();
                let body = snap
                    .block("showcase-intro")
                    .and_then(overlays::block_text)
                    .map(|rt| rt.plain.clone())
                    .unwrap_or_default();
                (ws.room().to_string(), r, p, t, rid, body)
            });
            let iso_peer = Rc::new(RefCell::new(
                WorkspaceSession::new(&iso_room, client_id_from_seed(0xC0DE)).expect("iso peer"),
            ));
            {
                let mut peer = iso_peer.borrow_mut();
                peer.apply_root_update_v1(&iso_init_root)
                    .expect("peer init root");
                peer.ensure_page(HOME_PAGE_ID)
                    .expect("peer home")
                    .apply_remote_update_v1(&iso_init_page)
                    .expect("peer init page");
            }
            let iso_outbox: Rc<RefCell<Vec<(String, Vec<u8>)>>> = Rc::new(RefCell::new(Vec::new()));
            let iso_sink = iso_outbox.clone();
            let (_tx2, rx2) = async_channel::unbounded();
            let iso_link = room_client::RoomLink::from_parts(rx2, move |cmd| {
                if let RoomCommand::Send(RoomFrame::Binary(bytes)) = cmd
                    && let Ok(RoomBinaryFrame::Doc {
                        doc_id,
                        message: DocMessage::Update(update),
                    }) = decode_binary_frame(&bytes)
                {
                    iso_sink.borrow_mut().push((doc_id, update));
                }
            });
            let iso_blocked = Rc::new(RefCell::new(Option::<String>::None));
            let iso_blocked_dir = iso_blocked.clone();
            iso.view(|view, _| {
                view.room = Some(RoomRuntime {
                    config: room_client::RoomConfig::new(&iso_room, Some("ws://127.0.0.1:1")),
                    link: iso_link,
                    protocol: RoomProtocol::new(&iso_room),
                    error: None,
                });
                let inner =
                    directory::InMemoryDocDirectory::with_docs([directory::EditorDocSummary {
                        id: directory::EditorDocId::from(HOME_PAGE_ID),
                        title: iso_base_title.clone(),
                        mode: directory::EditorDocMode::Page,
                        updated_at_ms: 1,
                    }]);
                view.set_doc_directory(Box::new(PolicyRejectDirectory {
                    inner,
                    blocked_title: iso_blocked_dir,
                }));
            });
            let drain_iso = |forbidden: Option<&str>| {
                let frames: Vec<(String, Vec<u8>)> = iso_outbox.borrow_mut().drain(..).collect();
                for (doc_id, update) in frames {
                    let mut peer = iso_peer.borrow_mut();
                    if doc_id == iso_room {
                        peer.apply_root_update_v1(&update)
                            .expect("iso peer apply root");
                    } else {
                        peer.ensure_page(&doc_id)
                            .expect("iso peer page")
                            .apply_remote_update_v1(&update)
                            .expect("iso peer apply page");
                    }
                    if let Some(bad) = forbidden {
                        let pt = peer
                            .page(HOME_PAGE_ID)
                            .expect("peer home")
                            .read_page_snapshot()
                            .expect("peer snap")
                            .root
                            .as_ref()
                            .and_then(|r| match &r.content {
                                BlockContent::Page { title } => Some(title.plain.clone()),
                                _ => None,
                            })
                            .unwrap_or_default();
                        assert_ne!(pt, bad, "{fault:?}: peer observed forbidden title {bad:?}");
                    }
                }
            };

            // Step 1: insert `" pre-body "` in body -> Undo = [pre-body].
            iso.app.update(|cx| {
                iso.window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::SetSelection(Some(
                                overlays::ActiveSelection::caret("showcase-intro", 0),
                            )),
                            window,
                            cx,
                        );
                        ui::EntityInputHandler::replace_text_in_range(
                            view,
                            None,
                            " pre-body ",
                            window,
                            cx,
                        );
                    })
                    .expect("insert pre-body");
            });
            drain_iso(None);

            // Step 2: append `" A"` to title -> Undo = [pre-body, Base A].
            iso.platform.advance_clock(Duration::from_millis(600));
            let iso_title_end = iso_base_title.encode_utf16().count();
            iso.app.update(|cx| {
                iso.window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::SetSelection(Some(
                                overlays::ActiveSelection::caret(
                                    iso_root_id.clone(),
                                    iso_title_end,
                                ),
                            )),
                            window,
                            cx,
                        );
                        ui::EntityInputHandler::replace_text_in_range(view, None, " A", window, cx);
                    })
                    .expect("append A");
            });
            drain_iso(None);

            // Step 3: allow Undo -> Undo = [pre-body], Redo = [Base A].
            iso.app.update(|cx| {
                iso.window
                    .update(cx, |view, window, cx| {
                        view.editor_key_down(&make_key(false), window, cx);
                    })
                    .expect("undo Base A");
            });
            drain_iso(None);

            // Step 4: reject Redo under injected `fault` -> fallback hits == 1, outbox empty!
            let iso_title_a = format!("{iso_base_title} A");
            let _ = editor_session::take_history_reject_fallback_hits();
            iso_outbox.borrow_mut().clear();
            *iso_blocked.borrow_mut() = Some(iso_title_a.clone());
            editor_session::set_history_reject_fault(fault);
            iso.app.update(|cx| {
                iso.window
                    .update(cx, |view, window, cx| {
                        view.editor_key_down(&make_key(true), window, cx);
                    })
                    .expect("fault-injected rejected redo");
            });
            editor_session::set_history_reject_fault(editor_session::HistoryRejectFault::None);
            assert_eq!(
                editor_session::take_history_reject_fallback_hits(),
                1,
                "{fault:?}: fallback branch must be hit exactly once"
            );
            assert!(
                iso_outbox.borrow().is_empty(),
                "{fault:?}: rejected fallback must emit 0 outbound frames"
            );

            let read_titles = || {
                let local = iso.view(|view, _| {
                    view.page_snapshot()
                        .and_then(|s| s.root.as_ref())
                        .and_then(|r| match &r.content {
                            BlockContent::Page { title } => Some(title.plain.clone()),
                            _ => None,
                        })
                        .unwrap_or_default()
                });
                let peer = iso_peer
                    .borrow()
                    .page(HOME_PAGE_ID)
                    .expect("peer home")
                    .read_page_snapshot()
                    .expect("peer snap")
                    .root
                    .as_ref()
                    .and_then(|r| match &r.content {
                        BlockContent::Page { title } => Some(title.plain.clone()),
                        _ => None,
                    })
                    .unwrap_or_default();
                (local, peer)
            };
            assert_eq!(
                read_titles(),
                (iso_base_title.clone(), iso_base_title.clone())
            );
            let root_title_after_reject = iso.view(|view, _| {
                view.document()
                    .workspace
                    .list_pages()
                    .expect("root pages")
                    .into_iter()
                    .find(|pg| pg.id == HOME_PAGE_ID)
                    .expect("root home")
                    .title
            });
            assert_eq!(
                root_title_after_reject, iso_base_title,
                "{fault:?}: root meta.pages title must stay at Base"
            );

            // Step 5: for `FailMerge` (where reverse undo succeeded), verify Redo still restores
            // `Base A` once rejection is lifted, then Undo returns to `Base` and re-reject under
            // `FailMerge` before testing edits while blocked.
            if fault == editor_session::HistoryRejectFault::FailMerge {
                *iso_blocked.borrow_mut() = None;
                iso.app.update(|cx| {
                    iso.window
                        .update(cx, |view, window, cx| {
                            view.editor_key_down(&make_key(true), window, cx);
                        })
                        .expect("redo Base A after FailMerge fallback");
                });
                drain_iso(None);
                assert_eq!(
                    read_titles(),
                    (iso_title_a.clone(), iso_title_a.clone()),
                    "FailMerge: title Redo must remain intact after fallback"
                );

                iso.app.update(|cx| {
                    iso.window
                        .update(cx, |view, window, cx| {
                            view.editor_key_down(&make_key(false), window, cx);
                        })
                        .expect("undo #1 back to Base");
                });
                drain_iso(None);
                assert_eq!(
                    read_titles(),
                    (iso_base_title.clone(), iso_base_title.clone())
                );

                let _ = editor_session::take_history_reject_fallback_hits();
                iso_outbox.borrow_mut().clear();
                *iso_blocked.borrow_mut() = Some(iso_title_a.clone());
                editor_session::set_history_reject_fault(fault);
                iso.app.update(|cx| {
                    iso.window
                        .update(cx, |view, window, cx| {
                            view.editor_key_down(&make_key(true), window, cx);
                        })
                        .expect("second FailMerge rejected redo");
                });
                editor_session::set_history_reject_fault(editor_session::HistoryRejectFault::None);
                assert_eq!(editor_session::take_history_reject_fallback_hits(), 1);
                assert!(iso_outbox.borrow().is_empty());
            }

            // Step 5b: while rejection is STILL active, insert `" while-blocked "` in body —
            // peer must receive `" while-blocked "` (and preserve `inner_mut()` `"!"`) while
            // NEVER observing the rejected title `Base A`!
            iso.platform.advance_clock(Duration::from_millis(600));
            iso.app.update(|cx| {
                iso.window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::SetSelection(Some(
                                overlays::ActiveSelection::caret("showcase-intro", 0),
                            )),
                            window,
                            cx,
                        );
                        ui::EntityInputHandler::replace_text_in_range(
                            view,
                            None,
                            " while-blocked ",
                            window,
                            cx,
                        );
                    })
                    .expect("while-blocked body edit");
            });
            drain_iso(Some(&iso_title_a));
            assert_eq!(
                read_titles(),
                (iso_base_title.clone(), iso_base_title.clone()),
                "{fault:?}: titles must remain Base after while-blocked edit"
            );
            let peer_body_while_blocked = iso_peer
                .borrow()
                .page(HOME_PAGE_ID)
                .expect("peer home")
                .read_page_snapshot()
                .expect("peer snap")
                .block("showcase-intro")
                .and_then(overlays::block_text)
                .map(|rt| rt.plain.clone())
                .unwrap_or_default();
            assert!(
                peer_body_while_blocked.starts_with(" while-blocked "),
                "{fault:?}: peer missed while-blocked edit: {peer_body_while_blocked:?}"
            );
            assert!(
                peer_body_while_blocked.contains('!'),
                "{fault:?}: inner_mut() write '!' must survive fallback: {peer_body_while_blocked:?}"
            );

            // Step 5c: lift rejection and undo all the way to the bottom of the undo stack —
            // initial `Untracked` showcase skeleton and `inner_mut()` `"!"` MUST remain intact!
            *iso_blocked.borrow_mut() = None;
            for _ in 0..8 {
                let can_undo = iso.view(|view, _| view.page().is_some_and(|p| p.can_undo()));
                if !can_undo {
                    break;
                }
                iso.app.update(|cx| {
                    iso.window
                        .update(cx, |view, window, cx| {
                            view.editor_key_down(&make_key(false), window, cx);
                        })
                        .expect("undo to bottom of stack");
                });
                drain_iso(None);
            }
            let local_body_undone = iso.view(|view, _| {
                view.page_snapshot()
                    .and_then(|s| s.block("showcase-intro"))
                    .and_then(overlays::block_text)
                    .map(|rt| rt.plain.clone())
                    .unwrap_or_default()
            });
            let peer_body_undone = iso_peer
                .borrow()
                .page(HOME_PAGE_ID)
                .expect("peer home")
                .read_page_snapshot()
                .expect("peer snap")
                .block("showcase-intro")
                .and_then(overlays::block_text)
                .map(|rt| rt.plain.clone())
                .unwrap_or_default();
            assert_eq!(
                local_body_undone, iso_orig_body,
                "{fault:?}: initial Untracked skeleton and inner_mut '!' must remain intact at undo bottom"
            );
            assert_eq!(
                peer_body_undone, iso_orig_body,
                "{fault:?}: peer must match undone body at stack bottom"
            );

            iso.app.update(|cx| {
                iso.window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::SetSelection(Some(
                                overlays::ActiveSelection::caret("showcase-intro", 0),
                            )),
                            window,
                            cx,
                        );
                        ui::EntityInputHandler::replace_text_in_range(
                            view,
                            None,
                            " post-check",
                            window,
                            cx,
                        );
                    })
                    .expect("post-check body edit");
            });
            drain_iso(None);
            let peer_body_post = iso_peer
                .borrow()
                .page(HOME_PAGE_ID)
                .expect("peer home")
                .read_page_snapshot()
                .expect("peer snap")
                .block("showcase-intro")
                .and_then(overlays::block_text)
                .map(|rt| rt.plain.clone())
                .unwrap_or_default();
            assert!(
                peer_body_post.starts_with(" post-check"),
                "{fault:?}: peer missed post-check edit: {peer_body_post:?}"
            );
        }
    }

    #[test]
    fn send_page_update_preserves_pending_checkpoint_on_corrupted_sv() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let outbox: Rc<RefCell<Vec<(String, Vec<u8>)>>> = Rc::new(RefCell::new(Vec::new()));
        let sink = outbox.clone();
        let (_tx, rx) = async_channel::unbounded();
        let link = room_client::RoomLink::from_parts(rx, move |cmd| {
            if let RoomCommand::Send(RoomFrame::Binary(bytes)) = cmd
                && let Ok(RoomBinaryFrame::Doc {
                    doc_id,
                    message: DocMessage::Update(update),
                }) = decode_binary_frame(&bytes)
            {
                sink.borrow_mut().push((doc_id, update));
            }
        });

        let bad_sv = vec![0xff, 0xff];
        session.view(|view, _| {
            let room_name = view.document().workspace.room().to_string();
            view.room = Some(RoomRuntime {
                config: room_client::RoomConfig::new(&room_name, Some("ws://127.0.0.1:1")),
                link,
                protocol: RoomProtocol::new(&room_name),
                error: None,
            });
            view.pending_sync_since_sv
                .insert(HOME_PAGE_ID.to_string(), bad_sv.clone());
            view.send_page_update(HOME_PAGE_ID, vec![1, 2, 3, 4]);
            assert_eq!(
                view.pending_sync_since_sv.get(HOME_PAGE_ID),
                Some(&bad_sv),
                "failed encode_diff_v1 must preserve pending_sync_since_sv"
            );
        });
        assert!(
            outbox.borrow().is_empty(),
            "failed encode_diff_v1 must NOT fall back to sending fragmented commit.update"
        );
    }

    #[test]
    fn deleted_linked_doc_cannot_be_revived_by_replaying_create_intent_e2e() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let (room_name, init_root, init_home) = session.view(|view, _| {
            let ws = &view.document().workspace;
            let root = ws.encode_diff_v1(ws.room(), &[0]).expect("init root");
            let home = ws
                .page(HOME_PAGE_ID)
                .expect("home")
                .encode_update_v1()
                .expect("init home");
            (ws.room().to_string(), root, home)
        });

        let mut peer_ws =
            WorkspaceSession::new(&room_name, client_id_from_seed(0xBEEF)).expect("peer ws");
        peer_ws
            .apply_root_update_v1(&init_root)
            .expect("peer init root");
        peer_ws
            .ensure_page(HOME_PAGE_ID)
            .expect("peer home")
            .apply_remote_update_v1(&init_home)
            .expect("peer init home");

        let outbox: Rc<RefCell<Vec<(String, Vec<u8>)>>> = Rc::new(RefCell::new(Vec::new()));
        let sink = outbox.clone();
        let (_tx, rx) = async_channel::unbounded();
        let link = room_client::RoomLink::from_parts(rx, move |cmd| {
            if let RoomCommand::Send(RoomFrame::Binary(bytes)) = cmd
                && let Ok(RoomBinaryFrame::Doc {
                    doc_id,
                    message: DocMessage::Update(update),
                }) = decode_binary_frame(&bytes)
            {
                sink.borrow_mut().push((doc_id, update));
            }
        });
        session.view(|view, _| {
            view.room = Some(RoomRuntime {
                config: room_client::RoomConfig::new(&room_name, Some("ws://127.0.0.1:1")),
                link,
                protocol: RoomProtocol::new(&room_name),
                error: None,
            });
        });

        let create_event = overlays::OverlayEvent::CreateLinkedDoc {
            block_id: "showcase-intro".to_string(),
            title: "Ephemeral Child".to_string(),
            mode: directory::EditorDocMode::Page,
            intent_id: Some("intent-del-e2e".to_string()),
        };

        // 1. Create linked doc and drain outbound frames to peer.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(create_event.clone(), window, cx);
                })
                .expect("create linked doc");
        });
        for (doc_id, update) in outbox.borrow_mut().drain(..) {
            if doc_id == room_name {
                peer_ws
                    .apply_root_update_v1(&update)
                    .expect("peer apply root");
            } else {
                peer_ws
                    .ensure_page(&doc_id)
                    .expect("peer page")
                    .apply_remote_update_v1(&update)
                    .expect("peer apply page");
            }
        }
        let child_id = session.view(|view, _| {
            view.document()
                .workspace
                .list_pages()
                .expect("list pages")
                .into_iter()
                .find(|p| p.title == "Ephemeral Child")
                .expect("child created in root")
                .id
        });
        assert!(
            peer_ws
                .list_pages()
                .expect("peer pages")
                .iter()
                .any(|p| p.id == child_id),
            "peer must receive created child page"
        );

        // Confirm the created child in the directory from the valid root list before deletion.
        session.view(|view, _| {
            view.refresh_document();
        });

        // 2. Delete the child from workspace root `meta.pages` and refresh document.
        session.view(|view, _| {
            let pages_target =
                y_octo::TypeTarget::Path(y_octo::TypePath::root("meta").key("pages"));
            let pages = view
                .state
                .workspace
                .list_pages()
                .expect("list pages before delete");
            let idx = pages
                .iter()
                .position(|p| p.id == child_id)
                .expect("child index in meta.pages") as u64;
            view.state
                .workspace
                .root_mut()
                .array_remove(&pages_target, idx, 1)
                .expect("remove child from meta.pages");
            view.refresh_document();
        });
        outbox.borrow_mut().clear();

        // 3. Replay the exact same CreateLinkedDoc intent — must NOT revive in picker, root, or room.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(create_event.clone(), window, cx);
                })
                .expect("replay create linked doc");
        });

        let (picker_hits, root_has_child) = session.view(|view, _| {
            let hits = view
                .doc_directory()
                .query_linked_docs(&directory::DocQueryRequest::new("Ephemeral Child", 10))
                .expect("query picker")
                .items
                .len();
            let in_root = view
                .document()
                .workspace
                .list_pages()
                .expect("root pages")
                .iter()
                .any(|p| p.id == child_id);
            (hits, in_root)
        });
        assert_eq!(
            picker_hits, 0,
            "picker must remain empty after replaying deleted intent"
        );
        assert!(
            !root_has_child,
            "root meta.pages must not revive deleted child"
        );
        assert!(
            outbox.borrow().is_empty(),
            "replaying deleted create intent must emit 0 outbound frames, got {}",
            outbox.borrow().len()
        );

        // 4. No-intermediate-refresh branch: call public `view.create_linked_doc(...)`,
        // delete from root `meta.pages` WITHOUT any intermediate `refresh_document()`, then
        // call `refresh_document()` once -> picker MUST be empty, replay MUST return NotFound,
        // root MUST have 0 revived entries, and outbox MUST have 0 frames.
        let direct_id = session.view(|view, _| {
            let summary = view
                .create_linked_doc(
                    "No-Mid-Refresh Child",
                    directory::EditorDocMode::Page,
                    Some("intent-no-mid-refresh"),
                )
                .expect("direct create_linked_doc");
            let pages_target =
                y_octo::TypeTarget::Path(y_octo::TypePath::root("meta").key("pages"));
            let pages = view
                .state
                .workspace
                .list_pages()
                .expect("list pages before immediate delete");
            let idx = pages
                .iter()
                .position(|p| p.id == summary.id.as_str())
                .expect("direct child index in meta.pages") as u64;
            view.state
                .workspace
                .root_mut()
                .array_remove(&pages_target, idx, 1)
                .expect("remove direct child from meta.pages");
            view.refresh_document();
            summary.id
        });
        outbox.borrow_mut().clear();

        let (direct_picker_hits, direct_replay_err, direct_in_root) = session.view(|view, _| {
            let hits = view
                .doc_directory()
                .query_linked_docs(&directory::DocQueryRequest::new("No-Mid-Refresh Child", 10))
                .expect("query picker after immediate delete")
                .items
                .len();
            let err = view
                .create_linked_doc(
                    "No-Mid-Refresh Child",
                    directory::EditorDocMode::Page,
                    Some("intent-no-mid-refresh"),
                )
                .expect_err("replaying deleted direct intent must fail with NotFound");
            let in_root = view
                .document()
                .workspace
                .list_pages()
                .expect("root pages after direct replay")
                .iter()
                .any(|p| p.id == direct_id.as_str());
            (hits, err, in_root)
        });
        assert_eq!(direct_picker_hits, 0);
        assert_eq!(
            direct_replay_err,
            directory::DirectoryError::NotFound(direct_id)
        );
        assert!(!direct_in_root);
        assert!(outbox.borrow().is_empty());
    }

    #[test]
    fn concurrent_replicas_create_linked_docs_without_page_id_collision() {
        // Seed one shared room state, then clone it into replica B via initial V1 updates so both
        // replicas share the same `meta.pages` Y.Array and `"shared-para"` Y.Text before diverging.
        let mut doc_a = DocState::new("shared-room", client_id_from_seed(0x1111)).expect("doc a");
        doc_a.workspace.initialize_meta().expect("meta");
        doc_a
            .workspace
            .create_page(HOME_PAGE_ID, "Shared Home", 1)
            .expect("create home");
        doc_a
            .workspace
            .ensure_page(HOME_PAGE_ID)
            .expect("home")
            .structural_edit(1, |p| {
                p.add_block(
                    "root-page",
                    BlockSpec::Page {
                        title: "Shared Home".into(),
                    },
                    None,
                    None,
                    1,
                )?;
                p.add_block(
                    "root-note",
                    BlockSpec::Note { xywh: None },
                    Some("root-page"),
                    None,
                    1,
                )?;
                p.add_block(
                    "shared-para",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "hello".into(),
                    },
                    Some("root-note"),
                    None,
                    1,
                )?;
                Ok(())
            })
            .expect("seed");
        let init_root = doc_a
            .workspace
            .encode_diff_v1(doc_a.workspace.room(), &[0])
            .expect("init root");
        let init_home = doc_a
            .workspace
            .page(HOME_PAGE_ID)
            .expect("home")
            .encode_update_v1()
            .expect("init home");

        let mut doc_b = DocState::new("shared-room", client_id_from_seed(0x2222)).expect("doc b");
        doc_b
            .workspace
            .apply_root_update_v1(&init_root)
            .expect("b root");
        doc_b
            .workspace
            .ensure_page(HOME_PAGE_ID)
            .expect("b home")
            .apply_remote_update_v1(&init_home)
            .expect("b home update");

        let mount_replica = |doc: DocState| {
            let session = open(1280, 800, PlaygroundOptions::default());
            let outbox: Rc<RefCell<Vec<(String, Vec<u8>)>>> = Rc::new(RefCell::new(Vec::new()));
            let sink = outbox.clone();
            let (_tx, rx) = async_channel::unbounded();
            let link = room_client::RoomLink::from_parts(rx, move |cmd| {
                if let RoomCommand::Send(RoomFrame::Binary(bytes)) = cmd
                    && let Ok(RoomBinaryFrame::Doc {
                        doc_id,
                        message: DocMessage::Update(update),
                    }) = decode_binary_frame(&bytes)
                {
                    sink.borrow_mut().push((doc_id, update));
                }
            });
            session.view(|view, cx| {
                view.set_document(doc, cx);
                view.room = Some(RoomRuntime {
                    config: room_client::RoomConfig::new("shared-room", Some("ws://127.0.0.1:1")),
                    link,
                    protocol: RoomProtocol::new("shared-room"),
                    error: None,
                });
            });
            let _ = session.frame();
            (session, outbox)
        };

        let (session_a, out_a) = mount_replica(doc_a);
        let (session_b, out_b) = mount_replica(doc_b);

        // Concurrently create distinct linked docs before exchanging any frames.
        session_a.app.update(|cx| {
            session_a
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "shared-para".into(),
                            title: "Alpha".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("intent-a".into()),
                        },
                        window,
                        cx,
                    );
                })
                .expect("create Alpha");
        });
        session_b.app.update(|cx| {
            session_b
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "shared-para".into(),
                            title: "Beta".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("intent-b".into()),
                        },
                        window,
                        cx,
                    );
                })
                .expect("create Beta");
        });

        let frames_a = out_a.borrow().clone();
        let frames_b = out_b.borrow().clone();
        let apply_frames = |target: &Session, frames: &[(String, Vec<u8>)]| {
            target.view(|view, cx| {
                view.edit_document(cx, |doc| {
                    for (doc_id, update) in frames {
                        if doc_id == doc.workspace.room() {
                            doc.workspace
                                .apply_root_update_v1(update)
                                .expect("apply root");
                        } else {
                            doc.workspace
                                .ensure_page(doc_id)
                                .expect("ensure subdoc")
                                .apply_remote_update_v1(update)
                                .expect("apply subdoc");
                        }
                    }
                });
            });
        };
        apply_frames(&session_a, &frames_b);
        apply_frames(&session_b, &frames_a);

        for (label, s) in [("A", &session_a), ("B", &session_b)] {
            s.view(|view, _| {
                let pages = view.document().workspace.list_pages().expect("pages");
                let alpha = pages
                    .iter()
                    .find(|p| p.title == "Alpha")
                    .expect("Alpha page");
                let beta = pages.iter().find(|p| p.title == "Beta").expect("Beta page");
                assert_ne!(
                    alpha.id, beta.id,
                    "replica {label}: Alpha and Beta collided on page ID"
                );
                for id in [&alpha.id, &beta.id] {
                    let snap = view
                        .document()
                        .workspace
                        .page(id)
                        .expect("subdoc present")
                        .read_page_snapshot()
                        .expect("subdoc snapshot");
                    assert!(snap.root.is_some(), "replica {label}: subdoc {id} has root");
                }
                let ref_ids: BTreeSet<String> = view
                    .page_snapshot()
                    .and_then(|s| s.block("shared-para"))
                    .and_then(overlays::block_text)
                    .map(|t| {
                        t.delta
                            .iter()
                            .filter_map(|op| match op {
                                y_octo::TextDeltaOp::Insert {
                                    format: Some(attrs),
                                    ..
                                } => match attrs.get("reference") {
                                    Some(y_octo::Any::Object(obj)) => match obj.get("pageId") {
                                        Some(y_octo::Any::String(pid)) => Some(pid.clone()),
                                        _ => None,
                                    },
                                    _ => None,
                                },
                                _ => None,
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                assert!(
                    ref_ids.contains(&alpha.id) && ref_ids.contains(&beta.id),
                    "replica {label}: expected chips for both distinct subdocs, got {ref_ids:?}"
                );
            });
        }
    }

    #[test]
    fn late_arriving_block_create_linked_doc_retries_and_inserts_once() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        // Dispatch before `"late-block"` exists: chip write fails, intent must stay retryable.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "late-block".into(),
                            title: "Late Target".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("intent-late".into()),
                        },
                        window,
                        cx,
                    );
                })
                .expect("first create before block arrives");
        });

        // Now `"late-block"` arrives in the document.
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                let page = doc.workspace.page_mut(HOME_PAGE_ID).expect("home");
                let note_id = page
                    .read_page_snapshot()
                    .expect("snap")
                    .root
                    .as_ref()
                    .expect("root")
                    .children
                    .iter()
                    .find(|b| matches!(b.content, BlockContent::Note { .. }))
                    .expect("note")
                    .id
                    .clone();
                page.structural_edit(500, |p| {
                    p.add_block(
                        "late-block",
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: "arrived".into(),
                        },
                        Some(&note_id),
                        None,
                        500,
                    )?;
                    Ok(())
                })
                .expect("add late-block");
            });
        });

        // Replay twice with the same `intent-late`: second succeeds, third is idempotent no-op.
        for _ in 0..2 {
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::CreateLinkedDoc {
                                block_id: "late-block".into(),
                                title: "Late Target".into(),
                                mode: directory::EditorDocMode::Page,
                                intent_id: Some("intent-late".into()),
                            },
                            window,
                            cx,
                        );
                    })
                    .expect("replay create");
            });
        }

        let (chip_count, root_matches) = session.view(|view, _| {
            let chips = view
                .page_snapshot()
                .and_then(|s| s.block("late-block"))
                .and_then(overlays::block_text)
                .map(|t| {
                    t.delta
                        .iter()
                        .filter(|op| {
                            matches!(
                                op,
                                y_octo::TextDeltaOp::Insert { format: Some(attrs), .. }
                                if attrs.contains_key("reference")
                            )
                        })
                        .count()
                })
                .unwrap_or(0);
            let roots = view
                .document()
                .workspace
                .list_pages()
                .expect("pages")
                .into_iter()
                .filter(|p| p.title == "Late Target")
                .count();
            (chips, roots)
        });
        assert_eq!(chip_count, 1, "expected exactly one retried reference chip");
        assert_eq!(root_matches, 1, "expected unique root metadata entry");
    }

    #[test]
    fn preexisting_root_page_entry_completes_four_block_child_page_without_duplicating_root() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        session.view(|view, _| {
            view.state
                .workspace
                .create_page("doc:pre", "Pre", 1)
                .expect("seed root entry only");
            let summary = directory::EditorDocSummary {
                id: directory::EditorDocId::new("doc:pre"),
                title: "Pre".into(),
                mode: directory::EditorDocMode::Page,
                updated_at_ms: 2,
            };
            view.ensure_workspace_page_and_broadcast(&summary, 2)
                .expect("complete child page");
            // Replay a second time to verify idempotency.
            view.ensure_workspace_page_and_broadcast(&summary, 3)
                .expect("idempotent replay");

            let root_entries = view
                .document()
                .workspace
                .list_pages()
                .expect("pages")
                .into_iter()
                .filter(|p| p.id == "doc:pre")
                .count();
            assert_eq!(root_entries, 1, "must not duplicate existing root entry");

            let snap = view
                .document()
                .workspace
                .page("doc:pre")
                .expect("child page exists")
                .read_page_snapshot()
                .expect("child page snapshot");
            let root = snap.root.as_ref().expect("expected affine:page root");
            assert!(
                root.children
                    .iter()
                    .any(|b| matches!(b.content, BlockContent::Surface { .. })),
                "expected affine:surface block"
            );
            let note = root
                .children
                .iter()
                .find(|b| matches!(b.content, BlockContent::Note { .. }))
                .expect("expected affine:note block");
            assert!(
                note.children
                    .iter()
                    .any(|b| matches!(b.content, BlockContent::Paragraph { .. })),
                "expected initial affine:paragraph block"
            );
        });
    }

    fn reference_chip_utf16_len(
        snap: Option<&PageSnapshot>,
        block_id: &str,
        page_id: &str,
    ) -> usize {
        snap.and_then(|s| s.block(block_id))
            .and_then(overlays::block_text)
            .map(|t| {
                t.delta
                    .iter()
                    .filter_map(|op| match op {
                        y_octo::TextDeltaOp::Insert {
                            insert: y_octo::TextInsert::Text(text),
                            format: Some(attrs),
                        } if matches!(
                            attrs.get("reference"),
                            Some(y_octo::Any::Object(obj))
                                if matches!(
                                    obj.get("pageId"),
                                    Some(y_octo::Any::String(pid)) if pid == page_id
                                )
                        ) =>
                        {
                            Some(text.encode_utf16().count())
                        }
                        _ => None,
                    })
                    .sum()
            })
            .unwrap_or(0)
    }

    #[test]
    fn replaying_completed_create_intent_past_4096_boundary_does_not_duplicate_chip() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        // Spread the 4,100 intermediate real `OverlayEvent::CreateLinkedDoc` chips across 64
        // paragraphs so each `Y.Text` stays <= 65 runs (O(N) in debug builds instead of O(N^2)),
        // while `intent-0` and its post-4096 replay both target `"showcase-intro"`.
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                let page = doc.workspace.page_mut(HOME_PAGE_ID).expect("home");
                let note_id = page
                    .read_page_snapshot()
                    .expect("snap")
                    .root
                    .as_ref()
                    .expect("root")
                    .children
                    .iter()
                    .find(|b| matches!(b.content, BlockContent::Note { .. }))
                    .expect("note")
                    .id
                    .clone();
                page.structural_edit(100, |p| {
                    for b in 0..64 {
                        p.add_block(
                            &format!("chip-bucket-{b}"),
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: String::new(),
                            },
                            Some(&note_id),
                            None,
                            100,
                        )?;
                    }
                    Ok(())
                })
                .expect("add chip buckets");
            });
        });

        // Dispatch 4,101 real `OverlayEvent::CreateLinkedDoc` events (`intent-0..=intent-4100`),
        // each inserting a real source reference chip, then replay `intent-0`.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "showcase-intro".into(),
                            title: "Intent Zero".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("intent-0".into()),
                        },
                        window,
                        cx,
                    );
                    for i in 1..=4100 {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::CreateLinkedDoc {
                                block_id: format!("chip-bucket-{}", i % 64),
                                title: format!("Doc {i}"),
                                mode: directory::EditorDocMode::Page,
                                intent_id: Some(format!("intent-{i}")),
                            },
                            window,
                            cx,
                        );
                    }
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "showcase-intro".into(),
                            title: "Intent Zero".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("intent-0".into()),
                        },
                        window,
                        cx,
                    );
                })
                .expect("4101 creates + replay intent-0");
        });

        let (doc0_id, chip_utf16_len) = session.view(|view, _| {
            let id = view
                .query_linked_docs(&directory::DocQueryRequest::new("Intent Zero", 5))
                .expect("query intent-0")
                .items[0]
                .doc
                .id
                .as_str()
                .to_string();
            let len = reference_chip_utf16_len(view.page_snapshot(), "showcase-intro", &id);
            (id, len)
        });
        assert_eq!(
            chip_utf16_len, 1,
            "replaying intent-0 ({doc0_id}) after 4,100 real CreateLinkedDoc events must keep UTF-16 chip length == 1"
        );
    }

    #[test]
    fn transient_root_write_failure_returns_err_skips_chip_and_recovers_on_retry() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let (room_name, init_root, init_home) = session.view(|view, _| {
            let ws = &view.document().workspace;
            let r = ws.encode_diff_v1(ws.room(), &[0]).expect("init root");
            let h = ws
                .page(HOME_PAGE_ID)
                .expect("home")
                .encode_update_v1()
                .expect("init home");
            (ws.room().to_string(), r, h)
        });

        let peer_ws = Rc::new(RefCell::new(
            WorkspaceSession::new(&room_name, client_id_from_seed(0x5555)).expect("peer ws"),
        ));
        {
            let mut peer = peer_ws.borrow_mut();
            peer.apply_root_update_v1(&init_root).expect("peer root");
            peer.ensure_page(HOME_PAGE_ID)
                .expect("peer home")
                .apply_remote_update_v1(&init_home)
                .expect("peer home update");
        }

        let outbox: Rc<RefCell<Vec<(String, Vec<u8>)>>> = Rc::new(RefCell::new(Vec::new()));
        let sink = outbox.clone();
        let (_tx, rx) = async_channel::unbounded();
        let link = room_client::RoomLink::from_parts(rx, move |cmd| {
            if let RoomCommand::Send(RoomFrame::Binary(bytes)) = cmd
                && let Ok(RoomBinaryFrame::Doc {
                    doc_id,
                    message: DocMessage::Update(update),
                }) = decode_binary_frame(&bytes)
            {
                sink.borrow_mut().push((doc_id, update));
            }
        });
        session.view(|view, _| {
            view.room = Some(RoomRuntime {
                config: room_client::RoomConfig::new(&room_name, Some("ws://127.0.0.1:1")),
                link,
                protocol: RoomProtocol::new(&room_name),
                error: None,
            });
        });

        // Temporarily corrupt root `meta.pages` to a non-Array value so `create_page` fails.
        let corrupt_commit = session.view(|view, _| {
            let root = view.state.workspace.root_mut();
            let meta = y_octo::TypeTarget::Path(y_octo::TypePath::root("meta"));
            let commit = root
                .map_set(
                    &meta,
                    "pages".to_string(),
                    y_octo::SessionValue::Any(y_octo::Any::Integer(42)),
                )
                .expect("corrupt meta.pages")
                .expect("corrupt commit");

            assert!(
                view.create_linked_doc(
                    "Direct Fail",
                    directory::EditorDocMode::Page,
                    Some("intent-direct-fail"),
                )
                .is_err(),
                "create_linked_doc must surface Err when root write fails"
            );
            assert_eq!(
                view.document().workspace.root().tx_depth(),
                0,
                "failed create_page must not leak an open root transaction"
            );
            commit
        });
        peer_ws
            .borrow_mut()
            .apply_root_update_v1(&corrupt_commit.update)
            .expect("peer apply corrupt");

        // Dispatch `OverlayEvent::CreateLinkedDoc` while corrupted: must NOT insert a chip,
        // and must leave `root.tx_depth() == 0`.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "showcase-intro".into(),
                            title: "Recoverable Doc".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("intent-recover".into()),
                        },
                        window,
                        cx,
                    );
                })
                .expect("corrupted create");
        });

        let rec_id = session.view(|view, _| {
            assert_eq!(view.document().workspace.root().tx_depth(), 0);
            view.query_linked_docs(&directory::DocQueryRequest::new("Recoverable Doc", 5))
                .expect("query")
                .items[0]
                .doc
                .id
                .as_str()
                .to_string()
        });
        assert_eq!(
            session.view(|view, _| reference_chip_utf16_len(
                view.page_snapshot(),
                "showcase-intro",
                &rec_id
            )),
            0,
            "failed root write must not insert a dangling reference chip"
        );

        // Trigger normal `refresh_document` via `edit_document` BEFORE repair, then repair
        // `meta.pages` via `edit_document` (triggering another `refresh_document`). Unlinked
        // pending intent must keep the exact same `rec_id`, and zero orphan child pages exist.
        session.view(|view, cx| {
            view.edit_document(cx, |_| {});
            assert!(
                view.document().workspace.page(&rec_id).is_none(),
                "failed root write must not create an orphan child page"
            );
            let preserved = view
                .query_linked_docs(&directory::DocQueryRequest::new(
                    "Native BlockSuite Playground",
                    10,
                ))
                .expect("query under corrupted meta.pages");
            assert!(
                preserved
                    .items
                    .iter()
                    .any(|item| item.doc.id.as_str() == HOME_PAGE_ID),
                "refresh_document must preserve existing directory entries when list_pages returns Err"
            );
        });
        let repair_commits = session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                let root = doc.workspace.root_mut();
                let meta = y_octo::TypeTarget::Path(y_octo::TypePath::root("meta"));
                let c1 = root
                    .map_set(
                        &meta,
                        "pages".to_string(),
                        y_octo::SessionValue::Array(Vec::new()),
                    )
                    .expect("repair meta.pages")
                    .expect("repair commit");
                let c2 = doc
                    .workspace
                    .create_page(HOME_PAGE_ID, "Native BlockSuite Playground", 1)
                    .expect("restore home page meta")
                    .expect("home meta commit");
                (c1, c2)
            })
        });
        peer_ws
            .borrow_mut()
            .apply_root_update_v1(&repair_commits.0.update)
            .expect("peer apply repair");
        peer_ws
            .borrow_mut()
            .apply_root_update_v1(&repair_commits.1.update)
            .expect("peer apply restored home meta");

        for _ in 0..2 {
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::CreateLinkedDoc {
                                block_id: "showcase-intro".into(),
                                title: "Recoverable Doc".into(),
                                mode: directory::EditorDocMode::Page,
                                intent_id: Some("intent-recover".into()),
                            },
                            window,
                            cx,
                        );
                    })
                    .expect("replay after repair");
            });
        }

        let mut peer_child_ids_seen = BTreeSet::new();
        let drain_to_peer = |seen: &mut BTreeSet<String>| {
            let frames: Vec<(String, Vec<u8>)> = outbox.borrow_mut().drain(..).collect();
            for (doc_id, update) in frames {
                let mut peer = peer_ws.borrow_mut();
                if doc_id == room_name {
                    peer.apply_root_update_v1(&update)
                        .expect("peer apply root update");
                } else {
                    if doc_id != HOME_PAGE_ID {
                        seen.insert(doc_id.clone());
                    }
                    peer.ensure_page(&doc_id)
                        .expect("peer page")
                        .apply_remote_update_v1(&update)
                        .expect("peer apply page update");
                }
            }
        };
        drain_to_peer(&mut peer_child_ids_seen);

        assert_eq!(
            peer_child_ids_seen.len(),
            1,
            "peer must receive exactly 1 child page ID (no orphan child pages): {peer_child_ids_seen:?}"
        );
        assert!(
            peer_child_ids_seen.contains(&rec_id),
            "recovered child page must keep original rec_id {rec_id}, got {peer_child_ids_seen:?}"
        );

        assert_eq!(
            session.view(|view, _| reference_chip_utf16_len(
                view.page_snapshot(),
                "showcase-intro",
                &rec_id
            )),
            1,
            "local HOME_PAGE_ID must have exactly 1 chip UTF-16 unit on retry"
        );
        assert_eq!(
            reference_chip_utf16_len(
                peer_ws
                    .borrow()
                    .page(HOME_PAGE_ID)
                    .expect("peer home")
                    .read_page_snapshot()
                    .ok()
                    .as_ref(),
                "showcase-intro",
                &rec_id
            ),
            1,
            "peer HOME_PAGE_ID must have exactly 1 chip UTF-16 unit on retry"
        );
        for (who, ws_pages, snap) in [
            (
                "local",
                session.view(|view, _| view.document().workspace.list_pages().expect("pages")),
                session.view(|view, _| {
                    view.document()
                        .workspace
                        .page(&rec_id)
                        .expect("local child")
                        .read_page_snapshot()
                        .expect("local child snap")
                }),
            ),
            (
                "peer",
                peer_ws.borrow().list_pages().expect("peer pages"),
                peer_ws
                    .borrow()
                    .page(&rec_id)
                    .expect("peer child")
                    .read_page_snapshot()
                    .expect("peer child snap"),
            ),
        ] {
            let entries = ws_pages.iter().filter(|p| p.id == rec_id).count();
            assert_eq!(entries, 1, "{who}: expected unique root metadata entry");
            let root = snap.root.as_ref().expect("root");
            assert!(
                root.children
                    .iter()
                    .any(|b| matches!(b.content, BlockContent::Surface { .. })),
                "{who}: surface"
            );
            let note = root
                .children
                .iter()
                .find(|b| matches!(b.content, BlockContent::Note { .. }))
                .expect("note");
            assert!(
                note.children
                    .iter()
                    .any(|b| matches!(b.content, BlockContent::Paragraph { .. })),
                "{who}: paragraph"
            );
        }

        // Subsequent independent root mutation must still emit a root update frame to `peer_ws`.
        let second = session.view(|view, _| {
            view.create_linked_doc("Post Recovery Doc", directory::EditorDocMode::Page, None)
                .expect("post recovery create")
        });
        drain_to_peer(&mut peer_child_ids_seen);
        assert!(
            peer_ws
                .borrow()
                .list_pages()
                .expect("peer pages")
                .iter()
                .any(|p| p.id == second.id.as_str() && p.title == "Post Recovery Doc"),
            "peer must receive subsequent root updates after recovery (zero leaked tx)"
        );
    }

    #[test]
    fn create_intent_tracks_source_chip_across_direct_create_and_view_recovery() {
        // Case A: direct `create_linked_doc` (page only, 0 chips) followed by first
        // `OverlayEvent::CreateLinkedDoc` with same `intent_id` -> 1 chip, replay -> still 1 chip.
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let pre = session.view(|view, _| {
            view.create_linked_doc(
                "Pre Created",
                directory::EditorDocMode::Page,
                Some("intent-pre"),
            )
            .expect("direct create")
        });
        assert_eq!(
            session.view(|view, _| reference_chip_utf16_len(
                view.page_snapshot(),
                "showcase-intro",
                pre.id.as_str()
            )),
            0
        );

        for _ in 0..2 {
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::CreateLinkedDoc {
                                block_id: "showcase-intro".into(),
                                title: "Pre Created".into(),
                                mode: directory::EditorDocMode::Page,
                                intent_id: Some("intent-pre".into()),
                            },
                            window,
                            cx,
                        );
                    })
                    .expect("overlay create for pre-created intent");
            });
        }
        assert_eq!(
            session.view(|view, _| reference_chip_utf16_len(
                view.page_snapshot(),
                "showcase-intro",
                pre.id.as_str()
            )),
            1,
            "first overlay CreateLinkedDoc after direct create must insert 1 chip; replay must stay 1"
        );

        // Case B: shared persistent directory across view recreation after late-block failure.
        struct SharedDirectory(Rc<RefCell<directory::InMemoryDocDirectory>>);
        impl directory::WorkspaceDocDirectory for SharedDirectory {
            fn query_linked_docs(
                &self,
                req: &directory::DocQueryRequest,
            ) -> Result<directory::DocQueryPage, directory::DirectoryError> {
                self.0.borrow().query_linked_docs(req)
            }
            fn rename_doc_title(
                &mut self,
                id: &directory::EditorDocId,
                title: &str,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                self.0.borrow_mut().rename_doc_title(id, title)
            }
            fn create_linked_doc(
                &mut self,
                title: &str,
                mode: directory::EditorDocMode,
                intent_id: Option<&str>,
            ) -> Result<directory::EditorDocSummary, directory::DirectoryError> {
                self.0
                    .borrow_mut()
                    .create_linked_doc(title, mode, intent_id)
            }
            fn has_create_intent(&self, intent_id: &str) -> bool {
                self.0.borrow().has_create_intent(intent_id)
            }
            fn is_create_intent_linked(&self, intent_id: &str) -> bool {
                self.0.borrow().is_create_intent_linked(intent_id)
            }
            fn mark_create_intent_linked(&mut self, intent_id: &str) {
                self.0.borrow_mut().mark_create_intent_linked(intent_id);
            }
            fn mark_doc_root_registered(&mut self, id: &directory::EditorDocId) {
                self.0.borrow_mut().mark_doc_root_registered(id);
            }
        }

        let shared_dir = Rc::new(RefCell::new(directory::InMemoryDocDirectory::new()));
        let view1 = open(1280, 800, PlaygroundOptions::default());
        let _ = view1.frame();
        view1.view(|view, _| view.set_doc_directory(Box::new(SharedDirectory(shared_dir.clone()))));

        // Fail chip insertion in view1 because `"late-block"` does not exist yet.
        view1.app.update(|cx| {
            view1
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "late-block".into(),
                            title: "Recovered Across Views".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some("intent-recover-view".into()),
                        },
                        window,
                        cx,
                    );
                })
                .expect("view1 late block create");
        });

        let recovered_id = directory::WorkspaceDocDirectory::query_linked_docs(
            &*shared_dir.borrow(),
            &directory::DocQueryRequest::new("Recovered Across Views", 5),
        )
        .expect("query")
        .items[0]
            .doc
            .id
            .as_str()
            .to_string();

        // Add `"late-block"` and export full state into a brand-new view2 with the same directory.
        let (root_u, home_u, child_u) = view1.view(|view, cx| {
            view.edit_document(cx, |doc| {
                let page = doc.workspace.page_mut(HOME_PAGE_ID).expect("home");
                let note_id = page
                    .read_page_snapshot()
                    .expect("snap")
                    .root
                    .as_ref()
                    .expect("root")
                    .children
                    .iter()
                    .find(|b| matches!(b.content, BlockContent::Note { .. }))
                    .expect("note")
                    .id
                    .clone();
                page.structural_edit(500, |p| {
                    p.add_block(
                        "late-block",
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: "ready".into(),
                        },
                        Some(&note_id),
                        None,
                        500,
                    )?;
                    Ok(())
                })
                .expect("add late-block");
            });
            let ws = &view.document().workspace;
            (
                ws.encode_diff_v1(ws.room(), &[0]).expect("root u"),
                ws.page(HOME_PAGE_ID)
                    .expect("home")
                    .encode_update_v1()
                    .expect("home u"),
                ws.page(&recovered_id)
                    .expect("child")
                    .encode_update_v1()
                    .expect("child u"),
            )
        });

        let view2 = open(1280, 800, PlaygroundOptions::default());
        let mut doc2 = DocState::new("recovered-room", client_id_from_seed(0x8888)).expect("doc2");
        doc2.workspace.apply_root_update_v1(&root_u).expect("root2");
        doc2.workspace
            .ensure_page(HOME_PAGE_ID)
            .expect("home2")
            .apply_remote_update_v1(&home_u)
            .expect("home2 u");
        doc2.workspace
            .ensure_page(&recovered_id)
            .expect("child2")
            .apply_remote_update_v1(&child_u)
            .expect("child2 u");
        view2.view(|view, cx| {
            view.set_document(doc2, cx);
            view.set_doc_directory(Box::new(SharedDirectory(shared_dir.clone())));
        });
        let _ = view2.frame();

        for _ in 0..2 {
            view2.app.update(|cx| {
                view2
                    .window
                    .update(cx, |view, window, cx| {
                        view.dispatch_overlay(
                            overlays::OverlayEvent::CreateLinkedDoc {
                                block_id: "late-block".into(),
                                title: "Recovered Across Views".into(),
                                mode: directory::EditorDocMode::Page,
                                intent_id: Some("intent-recover-view".into()),
                            },
                            window,
                            cx,
                        );
                    })
                    .expect("view2 replay");
            });
        }
        assert_eq!(
            view2.view(|view, _| reference_chip_utf16_len(
                view.page_snapshot(),
                "late-block",
                &recovered_id
            )),
            1,
            "replaying after view recreation must insert exactly 1 chip and remain idempotent"
        );

        // Case C: same `client_id` + same `SharedDirectory` across view recreation: typing `@First`
        // in `v_a`, then replaying its intent and typing `@Second` in `v_b` must never collide on
        // the old `at-...` intent key.
        let same_cid = client_id_from_seed(0x4242);
        let shared_c = Rc::new(RefCell::new(directory::InMemoryDocDirectory::new()));
        let mut init_doc = DocState::new("same-cid-room", same_cid).expect("init doc");
        init_doc.workspace.initialize_meta().expect("meta");
        init_doc
            .workspace
            .create_page(HOME_PAGE_ID, "Home", 1)
            .expect("home");
        init_doc
            .workspace
            .ensure_page(HOME_PAGE_ID)
            .expect("home page")
            .structural_edit(1, |p| {
                p.add_block(
                    "p-root",
                    BlockSpec::Page {
                        title: "Home".into(),
                    },
                    None,
                    None,
                    1,
                )?;
                p.add_block(
                    "p-note",
                    BlockSpec::Note { xywh: None },
                    Some("p-root"),
                    None,
                    1,
                )?;
                p.add_block(
                    "p-body",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: String::new(),
                    },
                    Some("p-note"),
                    None,
                    1,
                )?;
                Ok(())
            })
            .expect("seed home");

        let v_a = open(1280, 800, PlaygroundOptions::default());
        v_a.view(|view, cx| {
            view.set_document(init_doc, cx);
            view.set_doc_directory(Box::new(SharedDirectory(shared_c.clone())));
        });
        let _ = v_a.frame();

        let first_intent = v_a.app.update(|cx| {
            v_a.window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::SetSelection(Some(
                            overlays::ActiveSelection::caret("p-body", 0),
                        )),
                        window,
                        cx,
                    );
                    ui::EntityInputHandler::replace_text_in_range(view, None, "@", window, cx);
                    ui::EntityInputHandler::replace_text_in_range(view, None, "First", window, cx);
                    let intent = view
                        .editor
                        .linked_doc_trigger
                        .as_ref()
                        .expect("trigger")
                        .2
                        .clone();
                    let create_idx = view
                        .overlays
                        .linked_doc_menu()
                        .map_or(0, |m| m.results.items.len());
                    view.dispatch_overlay(
                        overlays::OverlayEvent::LinkedDocSelect(create_idx),
                        window,
                        cx,
                    );
                    intent
                })
                .expect("create @First")
        });

        let first_id = directory::WorkspaceDocDirectory::query_linked_docs(
            &*shared_c.borrow(),
            &directory::DocQueryRequest::new("First", 5),
        )
        .expect("query First")
        .items[0]
            .doc
            .id
            .as_str()
            .to_string();

        // Recreate a fresh `PlaygroundView` (`v_b`, resetting `editor.next_id = 0`) with the
        // exact same `DocState` (same `client_id`) and same `SharedDirectory`.
        let moved_doc = v_a.view(|view, _| {
            let dummy = DocState::new("dummy", client_id_from_seed(0x9999)).expect("dummy");
            std::mem::replace(&mut view.state, dummy)
        });
        let v_b = open(1280, 800, PlaygroundOptions::default());
        v_b.view(|view, cx| {
            view.set_document(moved_doc, cx);
            view.set_doc_directory(Box::new(SharedDirectory(shared_c.clone())));
        });
        let _ = v_b.frame();

        // Replay old `first_intent` (must be no-op), then type `@Second` and create it.
        v_b.app.update(|cx| {
            v_b.window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::CreateLinkedDoc {
                            block_id: "p-body".into(),
                            title: "First".into(),
                            mode: directory::EditorDocMode::Page,
                            intent_id: Some(first_intent.clone()),
                        },
                        window,
                        cx,
                    );
                    let end = view
                        .page_snapshot()
                        .and_then(|s| s.block("p-body"))
                        .and_then(overlays::block_text)
                        .map_or(0, |t| t.plain.encode_utf16().count());
                    view.dispatch_overlay(
                        overlays::OverlayEvent::SetSelection(Some(
                            overlays::ActiveSelection::caret("p-body", end),
                        )),
                        window,
                        cx,
                    );
                    ui::EntityInputHandler::replace_text_in_range(view, None, " ", window, cx);
                    ui::EntityInputHandler::replace_text_in_range(view, None, "@", window, cx);
                    ui::EntityInputHandler::replace_text_in_range(view, None, "Second", window, cx);
                    let create_idx = view
                        .overlays
                        .linked_doc_menu()
                        .map_or(0, |m| m.results.items.len());
                    view.dispatch_overlay(
                        overlays::OverlayEvent::LinkedDocSelect(create_idx),
                        window,
                        cx,
                    );
                })
                .expect("replay First + create @Second");
        });

        let second_id = directory::WorkspaceDocDirectory::query_linked_docs(
            &*shared_c.borrow(),
            &directory::DocQueryRequest::new("Second", 5),
        )
        .expect("query Second")
        .items[0]
            .doc
            .id
            .as_str()
            .to_string();
        assert_ne!(
            first_id, second_id,
            "@Second must allocate a distinct doc ID"
        );
        v_b.view(|view, _| {
            assert_eq!(
                reference_chip_utf16_len(view.page_snapshot(), "p-body", &first_id),
                1,
                "First chip count must stay 1"
            );
            assert_eq!(
                reference_chip_utf16_len(view.page_snapshot(), "p-body", &second_id),
                1,
                "Second chip count must be 1"
            );
        });
    }

    #[test]
    fn newly_created_child_page_excludes_four_block_skeleton_from_user_undo_stack() {
        let session = open(1280, 800, PlaygroundOptions::default());
        let _ = session.frame();

        let summary = session.view(|view, _| {
            view.create_linked_doc("Fresh Child", directory::EditorDocMode::Page, None)
                .expect("create child")
        });
        let child_id = summary.id.as_str().to_string();

        // Sync initial child page state to a peer.
        let mut peer_page = blocksuite_playground_doc::session::PageDocSession::new(
            &child_id,
            client_id_from_seed(0x7777),
        )
        .expect("peer child");
        let para_id = session.view(|view, _| {
            let page = view.document().workspace.page(&child_id).expect("child");
            assert!(
                !page.can_undo(),
                "4-block skeleton must not sit on user undo stack"
            );
            assert!(!page.can_redo());
            let init_u = page.encode_update_v1().expect("init update");
            peer_page
                .apply_remote_update_v1(&init_u)
                .expect("peer init");

            let snap = page.read_page_snapshot().expect("snap");
            let root = snap.root.as_ref().expect("root");
            let note = root
                .children
                .iter()
                .find(|b| matches!(b.content, BlockContent::Note { .. }))
                .expect("note");
            assert_eq!(
                note.props.get("prop:xywh").and_then(|v| v.as_str()),
                Some("[0, 0, 800, 92]")
            );
            note.children
                .iter()
                .find(|b| matches!(b.content, BlockContent::Paragraph { .. }))
                .expect("para")
                .id
                .clone()
        });

        // Type into the initial paragraph, sync to peer, then undo and sync to peer.
        session.view(|view, _| {
            let page = view.state.workspace.page_mut(&child_id).expect("child mut");
            let write_commit = page
                .insert_text(&para_id, "prop:text", 0, "hello", 1000)
                .expect("insert text")
                .expect("commit");
            peer_page
                .apply_remote_update_v1(&write_commit.update)
                .expect("peer write");
            assert!(page.can_undo());

            let undo_commit = page.undo().expect("undo").expect("undo commit");
            peer_page
                .apply_remote_update_v1(&undo_commit.update)
                .expect("peer undo");
            assert!(
                !page.can_undo(),
                "after undoing user text, skeleton must still be excluded from undo stack"
            );

            for (who, snap) in [
                ("local", page.read_page_snapshot().expect("local snap")),
                ("peer", peer_page.read_page_snapshot().expect("peer snap")),
            ] {
                let root = snap.root.as_ref().expect("root intact");
                assert!(
                    root.children
                        .iter()
                        .any(|b| matches!(b.content, BlockContent::Surface { .. })),
                    "{who}: surface intact"
                );
                let note = root
                    .children
                    .iter()
                    .find(|b| matches!(b.content, BlockContent::Note { .. }))
                    .expect("note intact");
                let para = note
                    .children
                    .iter()
                    .find(|b| b.id == para_id)
                    .expect("para intact");
                assert_eq!(
                    overlays::block_text(para).map(|t| t.plain.as_str()),
                    Some(""),
                    "{who}: user text undone cleanly"
                );
            }
        });
    }

    fn send_key(session: &Session, key: &str, modifiers: ui::Modifiers) {
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    let event = ui::KeyDownEvent {
                        keystroke: ui::Keystroke {
                            modifiers,
                            key: key.to_string(),
                            key_char: None,
                        },
                        is_held: false,
                        prefer_character_input: false,
                    };
                    view.editor_key_down(&event, window, cx);
                })
                .expect("dispatch key");
        });
    }

    fn type_text(session: &Session, text: &str) {
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    ui::EntityInputHandler::replace_text_in_range(view, None, text, window, cx);
                })
                .expect("type text");
        });
    }

    fn set_caret(session: &Session, block_id: &str, offset: u64) {
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.select_document_range(
                        editor_session::DocumentSelection::caret(editor_session::DocPoint::new(
                            block_id, offset,
                        )),
                        window,
                        cx,
                    );
                })
                .expect("set caret");
        });
    }

    fn cmd_mod() -> ui::Modifiers {
        if cfg!(target_os = "macos") {
            ui::Modifiers {
                platform: true,
                ..Default::default()
            }
        } else {
            ui::Modifiers {
                control: true,
                ..Default::default()
            }
        }
    }

    #[test]
    fn s2_touch_tap_and_pan_scroll_work_at_mobile_viewport() {
        let session = open(390, 844, PlaygroundOptions::default());
        session.app.update(|cx| {
            session
                .window
                .update(cx, |_, window, _| {
                    window.set_touch_gestures_enabled(true);
                })
                .expect("enable touch gestures");
        });
        let _ = session.frame();

        // Tap inside the intro paragraph to place caret.
        let target_pos = session.view(|view, _| {
            let layout = view.flow_layout().expect("layout");
            let block = layout.block("showcase-intro").expect("intro");
            let geo = block_flow::page_geometry(390.0);
            point(
                px(geo.column_x + block.x + 20.0),
                px(TOPBAR_HEIGHT + block.y + 10.0),
            )
        });
        session
            .headless
            .dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                id: ui::TouchId(1),
                phase: ui::TouchPhase::Started,
                position: target_pos,
                predicted_position: None,
                force: None,
            }));
        session
            .headless
            .dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                id: ui::TouchId(1),
                phase: ui::TouchPhase::Ended,
                position: target_pos,
                predicted_position: None,
                force: None,
            }));
        let sel_block =
            session.view(|view, _| view.document_selection().map(|s| s.focus.block_id.clone()));
        assert_eq!(sel_block.as_deref(), Some("showcase-intro"));

        // Pan finger upward (y: 400 -> 200) to scroll page downward (`scroll_y` increases).
        let scroll_before = session.view(|view, _| view.scroll_offset());
        session
            .headless
            .dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                id: ui::TouchId(2),
                phase: ui::TouchPhase::Started,
                position: point(px(195.0), px(400.0)),
                predicted_position: None,
                force: None,
            }));
        for y in [360.0_f32, 300.0, 240.0, 200.0] {
            session
                .headless
                .dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                    id: ui::TouchId(2),
                    phase: ui::TouchPhase::Moved,
                    position: point(px(195.0), px(y)),
                    predicted_position: None,
                    force: None,
                }));
        }
        session
            .headless
            .dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                id: ui::TouchId(2),
                phase: ui::TouchPhase::Ended,
                position: point(px(195.0), px(200.0)),
                predicted_position: None,
                force: None,
            }));
        let scroll_after = session.view(|view, _| view.scroll_offset());
        assert!(
            scroll_after > scroll_before + 50.0,
            "upward touch pan must increase scroll_y: before={scroll_before}, after={scroll_after}"
        );
    }

    #[test]
    fn s2_linked_doc_triggers_at_mid_word_and_double_brackets() {
        let session = open(1024, 720, PlaygroundOptions::default());
        let _ = session.frame();

        for (prefix, trigger, expected_plain) in [
            ("foo", "@", "foo@"),
            ("bar", "[[", "bar@"),
            ("baz[", "[", "baz@"),
            ("中文", "【【", "中文@"),
            ("中文【", "【", "中文@"),
        ] {
            let block_id = session.view(|view, cx| {
                let id = view.fresh_block_id();
                view.edit_document(cx, |state| {
                    let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                    let snap = page.read_page_snapshot().expect("snap");
                    let note_id = snap
                        .root
                        .as_ref()
                        .unwrap()
                        .children
                        .iter()
                        .find(|n| n.is_page_visible_note())
                        .unwrap()
                        .id
                        .clone();
                    page.add_block(
                        &id,
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: prefix.to_string(),
                        },
                        Some(&note_id),
                        None,
                        100,
                    )
                    .expect("add block");
                });
                id
            });
            let _ = session.frame();
            set_caret(&session, &block_id, prefix.encode_utf16().count() as u64);
            type_text(&session, trigger);
            let (menu_open, plain) = session.view(|view, _| {
                let open = view.overlays().linked_doc_menu().is_some();
                let plain = view.block_text(&block_id).unwrap_or("").to_string();
                (open, plain)
            });
            assert!(
                menu_open,
                "trigger {trigger:?} after {prefix:?} must open @ menu"
            );
            assert_eq!(plain, expected_plain);
            send_key(&session, "escape", ui::Modifiers::default());
        }
    }

    #[test]
    fn s2_inline_markdown_rules_ime_guard_and_c1_keep_space_no_leak() {
        let session = open(1024, 720, PlaygroundOptions::default());
        let _ = session.frame();

        let cases = [
            ("***bi***", "bi", "bold", true),
            ("**bold**", "bold", "bold", false),
            ("*ital*", "ital", "italic", false),
            ("~~del~~", "del", "strike", false),
            ("~und~", "und", "underline", false),
            ("`code`", "code", "code", false),
            ("[site](https://affine.pro)", "site", "link", false),
        ];

        for (raw, expected_word, mark_key, also_italic) in cases {
            let block_id = session.view(|view, cx| {
                let id = view.fresh_block_id();
                view.edit_document(cx, |state| {
                    let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                    let snap = page.read_page_snapshot().expect("snap");
                    let note_id = snap
                        .root
                        .as_ref()
                        .unwrap()
                        .children
                        .iter()
                        .find(|n| n.is_page_visible_note())
                        .unwrap()
                        .id
                        .clone();
                    page.add_block(
                        &id,
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: format!("a {raw}"),
                        },
                        Some(&note_id),
                        None,
                        100,
                    )
                    .expect("add block");
                });
                id
            });
            let _ = session.frame();
            let full_len = format!("a {raw}").encode_utf16().count() as u64;
            set_caret(&session, &block_id, full_len);

            // Fullwidth space must NOT trigger conversion.
            type_text(&session, "\u{3000}");
            assert!(
                session.view(|v, _| v.block_text(&block_id).unwrap_or("").ends_with('\u{3000}')),
                "fullwidth space must not trigger markdown for {raw}"
            );
            send_key(&session, "backspace", ui::Modifiers::default());

            // ASCII space triggers C1-KeepSpaceNoLeak: keeps trailing space without new mark.
            type_text(&session, " ");
            type_text(&session, "z");
            session.view(|view, _| {
                let (rich, _) = view.page().unwrap().read_editable_text(&block_id).unwrap();
                assert_eq!(rich.plain, format!("a {expected_word} z"), "for {raw}");
                let marked_word = rich.delta.iter().any(|op| {
                    matches!(
                        op,
                        y_octo::TextDeltaOp::Insert {
                            insert: y_octo::TextInsert::Text(t),
                            format: Some(f),
                        } if t == expected_word
                            && f.contains_key(mark_key)
                            && (!also_italic || f.get("italic") == Some(&Any::True))
                    )
                });
                assert!(
                    marked_word,
                    "expected mark {mark_key} on {expected_word} for {raw}"
                );
                let leaked_on_z = rich.delta.iter().any(|op| {
                    matches!(
                        op,
                        y_octo::TextDeltaOp::Insert {
                            insert: y_octo::TextInsert::Text(t),
                            format: Some(f),
                        } if t.contains('z')
                            && f.get(mark_key).is_some_and(|v| *v != Any::Null)
                    )
                });
                assert!(
                    !leaked_on_z,
                    "mark {mark_key} must not leak onto trailing 'z' for {raw}: delta={:?}",
                    rich.delta
                );
            });
        }

        // Verify Enter trigger swallows Enter, leaves no trailing space, and does not leak mark.
        let enter_id = session.view(|view, cx| {
            let id = view.fresh_block_id();
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                let snap = page.read_page_snapshot().expect("snap");
                let note_id = snap
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .find(|n| n.is_page_visible_note())
                    .unwrap()
                    .id
                    .clone();
                page.add_block(
                    &id,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "**hi**".into(),
                    },
                    Some(&note_id),
                    None,
                    100,
                )
                .expect("add");
            });
            id
        });
        let _ = session.frame();
        set_caret(&session, &enter_id, 6);
        let blocks_before = session.view(|v, _| v.flow_layout().unwrap().blocks.len());
        send_key(&session, "enter", ui::Modifiers::default());
        type_text(&session, "x");
        session.view(|view, _| {
            assert_eq!(
                view.flow_layout().unwrap().blocks.len(),
                blocks_before,
                "Enter-triggered inline markdown must not split block"
            );
            let (rich, _) = view.page().unwrap().read_editable_text(&enter_id).unwrap();
            assert_eq!(rich.plain, "hix");
            let x_is_bold = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t.contains('x') && f.get("bold") == Some(&Any::True)
                )
            });
            assert!(!x_is_bold, "closed bold mark must not leak after Enter");
        });

        // Verify inline `$$E=mc^2$$` conversion and zero `latex` mark leak even after caret move,
        // plus multi-character `type_text("**multi** ")` trigger.
        let latex_id = session.view(|view, cx| {
            let id = view.fresh_block_id();
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                let snap = page.read_page_snapshot().expect("snap");
                let note_id = snap
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .find(|n| n.is_page_visible_note())
                    .unwrap()
                    .id
                    .clone();
                page.add_block(
                    &id,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "$$E=mc^2$$".into(),
                    },
                    Some(&note_id),
                    None,
                    100,
                )
                .expect("add latex block");
            });
            id
        });
        let _ = session.frame();
        set_caret(&session, &latex_id, 10);
        send_key(&session, "enter", ui::Modifiers::default());
        // Reposition caret right after the inline formula (clearing pending_marks) and type "x".
        set_caret(&session, &latex_id, 1);
        type_text(&session, "x");
        type_text(&session, "**multi** ");
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text(&latex_id).unwrap();
            let has_latex = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == " " && f.get("latex") == Some(&Any::String("E=mc^2".into()))
                )
            });
            assert!(has_latex, "expected inline latex node: {:?}", rich.delta);
            let x_has_latex = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t.contains('x') && f.contains_key("latex")
                )
            });
            assert!(
                !x_has_latex,
                "latex mark must not leak onto trailing 'x': {:?}",
                rich.delta
            );
            let has_multi_bold = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == "multi" && f.get("bold") == Some(&Any::True)
                )
            });
            assert!(
                has_multi_bold,
                "multi-character type_text('**multi** ') must convert: {:?}",
                rich.delta
            );
        });
    }

    #[test]
    fn s2_block_markdown_enter_list_quote_and_quote_double_enter() {
        let session = open(1024, 720, PlaygroundOptions::default());
        let _ = session.frame();

        // A.4: block prefix + Enter converts and swallows Enter.
        for (prefix, expect_flavour) in [
            ("-", "affine:list"),
            ("+", "affine:list"),
            ("1.", "affine:list"),
            ("##", "affine:paragraph"),
            ("[]", "affine:list"),
            (">", "affine:paragraph"),
        ] {
            let block_id = session.view(|view, cx| {
                let id = view.fresh_block_id();
                view.edit_document(cx, |state| {
                    let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                    let snap = page.read_page_snapshot().expect("snap");
                    let note_id = snap
                        .root
                        .as_ref()
                        .unwrap()
                        .children
                        .iter()
                        .find(|n| n.is_page_visible_note())
                        .unwrap()
                        .id
                        .clone();
                    page.add_block(
                        &id,
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: prefix.into(),
                        },
                        Some(&note_id),
                        None,
                        100,
                    )
                    .expect("add");
                });
                id
            });
            let _ = session.frame();
            let count_before = session.view(|v, _| v.flow_layout().unwrap().blocks.len());
            set_caret(&session, &block_id, prefix.len() as u64);
            send_key(&session, "enter", ui::Modifiers::default());
            let _ = session.frame();
            session.view(|view, _| {
                assert_eq!(
                    view.flow_layout().unwrap().blocks.len(),
                    count_before,
                    "prefix {prefix} + Enter must not add extra block"
                );
                let focus_id = view.document_selection().unwrap().focus.block_id.clone();
                let node = view.page_snapshot().unwrap().block(&focus_id).unwrap();
                assert_eq!(node.flavour, expect_flavour, "for prefix {prefix}");
            });
        }

        // A.7: quote("q") -> Enter -> Enter -> "after" yields strictly Quote("q") + Paragraph("after").
        let quote_id = session.view(|view, cx| {
            let id = view.fresh_block_id();
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                let snap = page.read_page_snapshot().expect("snap");
                let note_id = snap
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .find(|n| n.is_page_visible_note())
                    .unwrap()
                    .id
                    .clone();
                page.add_block(
                    &id,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Quote,
                        text: "q".into(),
                    },
                    Some(&note_id),
                    None,
                    100,
                )
                .expect("add quote");
            });
            id
        });
        let _ = session.frame();
        let blocks_before_quote = session.view(|v, _| v.flow_layout().unwrap().blocks.len());
        set_caret(&session, &quote_id, 1);
        send_key(&session, "enter", ui::Modifiers::default());
        send_key(&session, "enter", ui::Modifiers::default());
        type_text(&session, "after");
        let _ = session.frame();
        session.view(|view, _| {
            assert_eq!(
                view.flow_layout().unwrap().blocks.len(),
                blocks_before_quote + 1,
                "quote double-enter must produce exactly 1 new block, not 2"
            );
            let after_id = view.document_selection().unwrap().focus.block_id.clone();
            let after_node = view.page_snapshot().unwrap().block(&after_id).unwrap();
            assert!(matches!(
                &after_node.content,
                BlockContent::Paragraph {
                    kind: ParagraphType::Text,
                    text,
                    ..
                } if text.plain == "after"
            ));
        });
    }

    #[test]
    fn s2_nested_list_outdent_slash_c2_shortcuts_and_block_selection() {
        let session = open(1024, 720, PlaygroundOptions::default());
        let _ = session.frame();

        // A.6: nested empty list Enter outdents first.
        let (parent_list, child_list) = session.view(|view, cx| {
            let p_id = view.fresh_block_id();
            let c_id = view.fresh_block_id();
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                let snap = page.read_page_snapshot().expect("snap");
                let note_id = snap
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .find(|n| n.is_page_visible_note())
                    .unwrap()
                    .id
                    .clone();
                page.add_block(
                    &p_id,
                    BlockSpec::List {
                        list_type: ListType::Bulleted,
                        text: "parent".into(),
                        checked: false,
                        order: None,
                    },
                    Some(&note_id),
                    None,
                    100,
                )
                .expect("add parent list");
                page.add_block(
                    &c_id,
                    BlockSpec::List {
                        list_type: ListType::Bulleted,
                        text: String::new(),
                        checked: false,
                        order: None,
                    },
                    Some(&p_id),
                    None,
                    101,
                )
                .expect("add child list");
            });
            (p_id, c_id)
        });
        let _ = session.frame();
        set_caret(&session, &child_list, 0);
        send_key(&session, "enter", ui::Modifiers::default());
        session.view(|view, _| {
            let snap = view.page_snapshot().unwrap();
            let node = snap.block(&child_list).unwrap();
            assert_eq!(
                node.flavour, "affine:list",
                "first Enter must keep affine:list"
            );
            assert_ne!(
                editor_session::parent_of(snap, &child_list).map(|(p, _)| p.id.as_str()),
                Some(parent_list.as_str()),
                "first Enter must outdent from parent list"
            );
        });
        // Second Enter at top level demotes to paragraph.
        send_key(&session, "enter", ui::Modifiers::default());
        session.view(|view, _| {
            let focus_id = view.document_selection().unwrap().focus.block_id.clone();
            let node = view.page_snapshot().unwrap().block(&focus_id).unwrap();
            assert_eq!(node.flavour, "affine:paragraph");
        });

        // C.2: in-document slash with no match closes menu and passes Enter through to split.
        type_text(&session, "11");
        type_text(&session, "/");
        type_text(&session, "25");
        assert!(session.view(|v, _| v.overlays().slash_menu().is_some()));
        let blocks_before_enter = session.view(|v, _| v.flow_layout().unwrap().blocks.len());
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        session.view(|view, _| {
            assert!(
                view.overlays().slash_menu().is_none(),
                "C.2 must close slash menu"
            );
            assert_eq!(
                view.flow_layout().unwrap().blocks.len(),
                blocks_before_enter + 1,
                "C.2 must pass Enter through to split block"
            );
        });

        // A.10: Mod-Alt-2 converts block to H2; Mod-k opens link bar on selection.
        let conv_block =
            session.view(|v, _| v.document_selection().unwrap().focus.block_id.clone());
        type_text(&session, "heading text");
        let mut alt_cmd = cmd_mod();
        alt_cmd.alt = true;
        send_key(&session, "2", alt_cmd);
        session.view(|view, _| {
            let node = view.page_snapshot().unwrap().block(&conv_block).unwrap();
            assert!(matches!(
                node.content,
                BlockContent::Paragraph {
                    kind: ParagraphType::H2,
                    ..
                }
            ));
        });
        // First Mod-a selects all text in block; Mod-k opens link field.
        send_key(&session, "a", cmd_mod());
        send_key(&session, "k", cmd_mod());
        assert!(
            session.view(|v, _| v.overlays().link_field().is_some()),
            "Mod-k must open formatting toolbar link field"
        );
        send_key(&session, "escape", ui::Modifiers::default());

        // A.11: Escape selects current block; second Mod-a selects all content blocks.
        send_key(&session, "escape", ui::Modifiers::default());
        assert_eq!(
            session.view(|v, _| v.block_selection().to_vec()),
            vec![conv_block.clone()]
        );
        send_key(&session, "a", cmd_mod());
        let all_selected = session.view(|v, _| v.block_selection().len());
        assert!(
            all_selected > 1,
            "second Mod-a must select all content blocks"
        );
        send_key(&session, "escape", ui::Modifiers::default());
        assert!(session.view(|v, _| v.block_selection().is_empty()));
    }

    #[test]
    fn s2_delete_selected_parent_with_nested_child_creates_fallback_and_ignores_direct_typing() {
        let session = open(1024, 720, PlaygroundOptions::default());
        let mut state = DocState::new("nested-del", client_id_from_seed(77)).expect("doc");
        state.workspace.initialize_meta().expect("meta");
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Nested Delete", 1)
            .expect("create page");
        let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        page.structural_edit(1, |page| {
            page.add_block(
                "page-root",
                BlockSpec::Page {
                    title: "Nested Delete".into(),
                },
                None,
                None,
                1,
            )?;
            page.add_block(
                "note-root",
                BlockSpec::Note { xywh: None },
                Some("page-root"),
                None,
                1,
            )?;
            page.add_block(
                "list-parent",
                BlockSpec::List {
                    list_type: ListType::Bulleted,
                    text: "parent".into(),
                    checked: false,
                    order: None,
                },
                Some("note-root"),
                None,
                1,
            )?;
            page.add_block(
                "list-child",
                BlockSpec::List {
                    list_type: ListType::Bulleted,
                    text: "child".into(),
                    checked: false,
                    order: None,
                },
                Some("list-parent"),
                None,
                1,
            )?;
            Ok(())
        })
        .expect("seed nested list");
        session.view(|view, cx| view.set_document(state, cx));
        let _ = session.frame();

        set_caret(&session, "list-parent", 2);
        send_key(&session, "escape", ui::Modifiers::default());
        assert_eq!(
            session.view(|v, _| v.block_selection().to_vec()),
            vec!["list-parent".to_string()]
        );

        // Direct printable typing while whole-block selection is active must not corrupt page title.
        type_text(&session, "ignored");
        assert_eq!(
            session.view(|v, _| v.block_text("page-root").unwrap_or("").to_string()),
            "Nested Delete"
        );

        // Backspace deletes parent + nested child and creates a surviving empty paragraph.
        send_key(&session, "backspace", ui::Modifiers::default());
        let _ = session.frame();
        let focus_after_del = session.view(|view, _| {
            let snap = view.page_snapshot().unwrap();
            assert!(snap.block("list-parent").is_none());
            assert!(snap.block("list-child").is_none());
            let focus_id = view
                .document_selection()
                .expect("fallback selection")
                .focus
                .block_id
                .clone();
            assert!(
                snap.block(&focus_id).is_some(),
                "caret must point to a surviving block, not deleted child"
            );
            focus_id
        });

        type_text(&session, "hello");
        assert_eq!(
            session.view(|v, _| v.block_text(&focus_after_del).unwrap_or("").to_string()),
            "hello"
        );

        // Undo reverts typing and then restores the deleted parent + nested child subtree.
        send_key(&session, "z", cmd_mod());
        assert_eq!(
            session.view(|v, _| v.block_text(&focus_after_del).unwrap_or("").to_string()),
            ""
        );
        send_key(&session, "z", cmd_mod());
        session.view(|view, _| {
            let snap = view.page_snapshot().unwrap();
            assert!(
                snap.block("list-parent").is_some(),
                "undo must restore parent list"
            );
            assert!(
                snap.block("list-child").is_some(),
                "undo must restore nested child list"
            );
        });
    }

    #[test]
    fn s2_latex_markdown_triggers_undo_and_multi_block_delete_clears_selection() {
        let session = open(1024, 720, PlaygroundOptions::default());
        let mut state = DocState::new("s2-parity", client_id_from_seed(91)).expect("doc");
        state.workspace.initialize_meta().expect("meta");
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Parity Doc", 1)
            .expect("create page");
        let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        page.structural_edit(1, |page| {
            page.add_block(
                "page-root",
                BlockSpec::Page {
                    title: "Parity Doc".into(),
                },
                None,
                None,
                1,
            )?;
            page.add_block(
                "note-root",
                BlockSpec::Note { xywh: None },
                Some("page-root"),
                None,
                1,
            )?;
            for (id, text) in [
                ("p-1", "First block"),
                ("p-2", "Second block"),
                ("p-3", "Third block"),
                ("p-latex", ""),
            ] {
                page.add_block(
                    id,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: text.into(),
                    },
                    Some("note-root"),
                    None,
                    1,
                )?;
            }
            Ok(())
        })
        .expect("seed parity doc");
        session.view(|view, cx| view.set_document(state, cx));
        let _ = session.frame();

        // 1. Multi-block delete of block 3 clears selection instead of jumping to first block.
        set_caret(&session, "p-3", 2);
        send_key(&session, "escape", ui::Modifiers::default());
        assert_eq!(
            session.view(|v, _| v.block_selection().to_vec()),
            vec!["p-3".to_string()]
        );
        send_key(&session, "backspace", ui::Modifiers::default());
        let _ = session.frame();
        session.view(|view, _| {
            assert!(view.page_snapshot().unwrap().block("p-3").is_none());
            assert!(view.block_selection().is_empty());
            assert!(
                view.document_selection().is_none(),
                "deleting a block when other blocks survive must clear selection"
            );
        });

        // 2. Single `$` stays plain text (`$5 and $10 ` never triggers inline latex).
        set_caret(&session, "p-latex", 0);
        type_text(&session, "$5 and $10 ");
        let _ = session.frame();
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text("p-latex").unwrap();
            assert_eq!(rich.plain, "$5 and $10 ");
            assert!(
                rich.delta.iter().all(|op| !matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        format: Some(f),
                        ..
                    } if f.contains_key("latex")
                )),
                "single $ must never trigger inline latex: {:?}",
                rich.delta
            );
        });

        // 3. Inline populated `$$x^2$$ `, `$$ x $$ ` (spaces inside), `$$$ ` (keeps leading `$`),
        // and empty `$$ ` + single-step Undo restores raw markdown.
        for (input, expected_latex, expected_prefix) in [
            ("$$x^2$$ ", "x^2", ""),
            ("$$ x $$ ", " x ", ""),
            ("$$ ", "", ""),
            ("$$$ ", "", "$"),
        ] {
            session.view(|view, cx| {
                view.edit_document(cx, |state| {
                    let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
                    let len = page
                        .read_editable_text("p-latex")
                        .unwrap()
                        .0
                        .plain
                        .encode_utf16()
                        .count() as u64;
                    if len > 0 {
                        page.remove_text("p-latex", "prop:text", 0, len, 200)
                            .unwrap();
                    }
                    page.stop_capturing().unwrap();
                });
            });
            let _ = session.frame();
            set_caret(&session, "p-latex", 0);
            type_text(&session, input);
            let _ = session.frame();
            // Dismiss equation editor if empty inline equation opened it.
            if expected_latex.is_empty() {
                send_key(&session, "escape", ui::Modifiers::default());
            }
            session.view(|view, _| {
                let (rich, _) = view.page().unwrap().read_editable_text("p-latex").unwrap();
                let found = rich.delta.iter().any(|op| {
                    matches!(
                        op,
                        y_octo::TextDeltaOp::Insert {
                            insert: y_octo::TextInsert::Text(t),
                            format: Some(f),
                        } if t == " " && f.get("latex") == Some(&Any::String(expected_latex.into()))
                    )
                });
                assert!(
                    found,
                    "expected inline latex {expected_latex:?} for {input:?}: {:?}",
                    rich.delta
                );
                assert!(
                    rich.plain.starts_with(expected_prefix),
                    "expected prefix {expected_prefix:?} for {input:?}, got {:?}",
                    rich.plain
                );
            });
            send_key(&session, "z", cmd_mod());
            let _ = session.frame();
            assert_eq!(
                session.view(|v, _| v.block_text("p-latex").unwrap_or("").to_string()),
                input,
                "single-step undo must restore raw markdown {input:?}"
            );
        }

        // 4. Inline equation editor flow: `aa$$` + Space + `bbb` + Enter => `latex == "bbb"`.
        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
                let len = page
                    .read_editable_text("p-latex")
                    .unwrap()
                    .0
                    .plain
                    .encode_utf16()
                    .count() as u64;
                if len > 0 {
                    page.remove_text("p-latex", "prop:text", 0, len, 250)
                        .unwrap();
                }
                page.stop_capturing().unwrap();
            });
        });
        let _ = session.frame();
        set_caret(&session, "p-latex", 0);
        type_text(&session, "aa$$ ");
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_some()));
        type_text(&session, "bbb");
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_none()));
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text("p-latex").unwrap();
            let has_bbb = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == " " && f.get("latex") == Some(&Any::String("bbb".into()))
                )
            });
            assert!(
                has_bbb,
                "expected inline latex 'bbb' after equation editor commit: {:?}",
                rich.delta
            );
        });

        // 5. Block equation flow: `$$$$` + Enter + `aaa` + Enter => `affine:latex` with `latex == "aaa"`
        // rendered as `FlowKind::Latex` (not `FlowKind::Unknown`), and Undo restores cleanly.
        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
                let len = page
                    .read_editable_text("p-latex")
                    .unwrap()
                    .0
                    .plain
                    .encode_utf16()
                    .count() as u64;
                if len > 0 {
                    page.remove_text("p-latex", "prop:text", 0, len, 300)
                        .unwrap();
                }
                page.stop_capturing().unwrap();
            });
        });
        let _ = session.frame();
        set_caret(&session, "p-latex", 0);
        type_text(&session, "$$$$");
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_some()));
        type_text(&session, "aaa");
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_none()));
        session.view(|view, _| {
            let snap = view.page_snapshot().unwrap();
            let note = snap.block("note-root").unwrap();
            let idx = note
                .children
                .iter()
                .position(|c| c.id == "p-latex")
                .unwrap();
            let next = note.children.get(idx + 1).expect("inserted latex block");
            assert_eq!(next.flavour, "affine:latex");
            assert_eq!(
                next.content,
                BlockContent::Latex {
                    latex: "aaa".into()
                }
            );
            let layout = view.flow_layout().unwrap();
            let flow_block = layout.block(&next.id).expect("laid out latex block");
            assert_eq!(flow_block.body.kind, crate::block_flow::FlowKind::Latex);
            assert_eq!(flow_block.body.plain, "aaa");
            assert_eq!(view.block_text("p-latex").unwrap_or(""), "");
        });
        // First undo reverts `prop:latex = "aaa"` -> `""`; second undo removes `affine:latex` and restores `$$$$`.
        send_key(&session, "z", cmd_mod());
        send_key(&session, "z", cmd_mod());
        let _ = session.frame();
        session.view(|view, _| {
            let snap = view.page_snapshot().unwrap();
            let note = snap.block("note-root").unwrap();
            assert!(
                note.children.iter().all(|c| c.flavour != "affine:latex"),
                "undo must remove inserted affine:latex block"
            );
            assert_eq!(view.block_text("p-latex").unwrap_or(""), "$$$$");
        });

        // 6. Clicking an existing inline latex chip opens EquationEditor with its current latex
        //    and pressing Enter updates the document.
        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
                let len = page
                    .read_editable_text("p-latex")
                    .unwrap()
                    .0
                    .plain
                    .encode_utf16()
                    .count() as u64;
                if len > 0 {
                    page.remove_text("p-latex", "prop:text", 0, len, 350)
                        .unwrap();
                }
                page.stop_capturing().unwrap();
            });
        });
        let _ = session.frame();
        set_caret(&session, "p-latex", 0);
        type_text(&session, "$$x^2$$ ");
        let _ = session.frame();
        let chip_center = session.view(|view, _| {
            let layout = view.flow_layout().unwrap();
            let block = layout.block("p-latex").expect("p-latex laid out");
            let body_text = block.body.text.as_ref().expect("p-latex body text");
            let deco = body_text
                .layout
                .decorations()
                .iter()
                .find(|d| matches!(&d.kind, crate::rich_text::DecorationKind::LatexChip(l) if l == "x^2"))
                .expect("inline latex chip decoration");
            let geom = page_geometry(1024.0);
            point(
                px(geom.column_x
                    + block.x
                    + body_text.x
                    + f32::from(deco.bounds.origin.x)
                    + f32::from(deco.bounds.size.width) * 0.5),
                px(TOPBAR_HEIGHT - view.scroll_y
                    + block.y
                    + body_text.y
                    + f32::from(deco.bounds.origin.y)
                    + f32::from(deco.bounds.size.height) * 0.5),
            )
        });
        session.headless.simulate_click(chip_center);
        let _ = session.frame();
        session.view(|view, _| {
            let field = view
                .overlays()
                .active_text_field()
                .expect("equation editor opened on inline latex chip click");
            assert_eq!(field.text(), "x^2");
        });
        send_key(&session, "a", cmd_mod());
        type_text(&session, "y^2");
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_none()));
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text("p-latex").unwrap();
            let has_y2 = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == " " && f.get("latex") == Some(&Any::String("y^2".into()))
                )
            });
            assert!(
                has_y2,
                "expected updated inline latex 'y^2' after chip click edit: {:?}",
                rich.delta
            );
        });
    }

    #[test]
    fn s2_equation_editor_collab_drift_deletion_and_ime_done() {
        let session = open(1024, 720, PlaygroundOptions::default());
        let mut state = DocState::new("s2-eq-collab", client_id_from_seed(92)).expect("doc");
        state.workspace.initialize_meta().expect("meta");
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Equation Collab", 1)
            .expect("create page");
        let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        page.structural_edit(1, |page| {
            page.add_block(
                "page-root",
                BlockSpec::Page {
                    title: "Equation Collab".into(),
                },
                None,
                None,
                1,
            )?;
            page.add_block(
                "note-root",
                BlockSpec::Note { xywh: None },
                Some("page-root"),
                None,
                1,
            )?;
            page.add_block(
                "p-eq",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: String::new(),
                },
                Some("note-root"),
                None,
                1,
            )?;
            Ok(())
        })
        .expect("seed eq collab doc");
        session.view(|view, cx| view.set_document(state, cx));
        let _ = session.frame();

        // 1. IME composing() + click Done (EquationApply) must commit preedit text without dropping it.
        set_caret(&session, "p-eq", 0);
        type_text(&session, "$$ ");
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_some()));
        type_text(&session, "x");
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    ui::EntityInputHandler::replace_and_mark_text_in_range(
                        view, None, "中", None, window, cx,
                    );
                })
                .unwrap();
        });
        assert!(session.view(|v, _| {
            v.overlays()
                .active_text_field()
                .is_some_and(|f| f.composing())
        }));
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(crate::overlays::OverlayEvent::EquationApply, window, cx);
                })
                .unwrap();
        });
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_none()));
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text("p-eq").unwrap();
            let has_ime = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == " " && f.get("latex") == Some(&Any::String("x中".into()))
                )
            });
            assert!(
                has_ime,
                "expected 'x中' after clicking Done during IME composition: {:?}",
                rich.delta
            );
        });

        // 2. Remote insertion before an open inline equation drifts target offset via CRDT snapshot;
        //    clicking Done updates the shifted formula and leaves the remote prefix untouched.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        crate::overlays::OverlayEvent::OpenEquationEditor {
                            target: crate::overlays::EquationTarget::Inline {
                                block_id: "p-eq".into(),
                                utf16_offset: 0,
                            },
                            initial: "x中".into(),
                        },
                        window,
                        cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_some()));
        // Simulate remote peer inserting "X" at offset 0 of `p-eq`.
        let remote_insert = session.view(|view, _| {
            let full = view.page().unwrap().encode_update_v1().unwrap();
            let mut peer = blocksuite_playground_doc::session::PageDocSession::new(
                HOME_PAGE_ID,
                blocksuite_playground_doc::client_id_from_seed(93),
            )
            .unwrap();
            peer.apply_remote_update_v1(&full).unwrap();
            peer.insert_text("p-eq", "prop:text", 0, "X", 200)
                .unwrap()
                .expect("remote insert commit")
                .update
        });
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&remote_insert)
                    .unwrap();
            });
        });
        let _ = session.frame();
        session.view(|view, _| {
            let editor = view
                .overlays()
                .equation_editor()
                .expect("editor stays open after remote prefix insert");
            assert_eq!(
                editor.target,
                crate::overlays::EquationTarget::Inline {
                    block_id: "p-eq".into(),
                    utf16_offset: 1,
                }
            );
        });
        send_key(&session, "a", cmd_mod());
        type_text(&session, "z^2");
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(crate::overlays::OverlayEvent::EquationApply, window, cx);
                })
                .unwrap();
        });
        let _ = session.frame();
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text("p-eq").unwrap();
            assert!(
                matches!(
                    rich.delta.first(),
                    Some(y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format,
                    }) if t == "X" && format.as_ref().is_none_or(|f| !f.contains_key("latex"))
                ),
                "remote 'X' must remain plain text: {:?}",
                rich.delta
            );
            let has_z2 = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == " " && f.get("latex") == Some(&Any::String("z^2".into()))
                )
            });
            assert!(
                has_z2,
                "shifted inline formula must update to 'z^2': {:?}",
                rich.delta
            );
        });

        // 3. Remote deletion of an open inline equation (and block equation) auto-closes the editor
        //    with zero writes.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        crate::overlays::OverlayEvent::OpenEquationEditor {
                            target: crate::overlays::EquationTarget::Inline {
                                block_id: "p-eq".into(),
                                utf16_offset: 1,
                            },
                            initial: "z^2".into(),
                        },
                        window,
                        cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();
        let remote_del_inline = session.view(|view, _| {
            let full = view.page().unwrap().encode_update_v1().unwrap();
            let mut peer = blocksuite_playground_doc::session::PageDocSession::new(
                HOME_PAGE_ID,
                blocksuite_playground_doc::client_id_from_seed(94),
            )
            .unwrap();
            peer.apply_remote_update_v1(&full).unwrap();
            peer.remove_text("p-eq", "prop:text", 1, 1, 250)
                .unwrap()
                .expect("remote delete inline")
                .update
        });
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&remote_del_inline)
                    .unwrap();
            });
        });
        assert!(
            session.view(|v, _| v.overlays().equation_editor().is_none()),
            "remote deletion of inline equation must auto-close editor"
        );

        // Now test remote deletion of a block equation.
        set_caret(&session, "p-eq", 1);
        type_text(&session, "$$$$");
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        let latex_block_id =
            session.view(
                |v, _| match &v.overlays().equation_editor().unwrap().target {
                    crate::overlays::EquationTarget::Block { block_id } => block_id.clone(),
                    _ => panic!("expected block equation target"),
                },
            );
        let remote_del_block = session.view(|view, _| {
            let full = view.page().unwrap().encode_update_v1().unwrap();
            let mut peer = blocksuite_playground_doc::session::PageDocSession::new(
                HOME_PAGE_ID,
                blocksuite_playground_doc::client_id_from_seed(95),
            )
            .unwrap();
            peer.apply_remote_update_v1(&full).unwrap();
            peer.remove_lifting_children(&latex_block_id, 300)
                .unwrap()
                .expect("remote delete block")
                .update
        });
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&remote_del_block)
                    .unwrap();
            });
        });
        assert!(
            session.view(|v, _| v.overlays().equation_editor().is_none()),
            "remote deletion of block equation must auto-close editor"
        );

        // 4. Clicking outside EquationEditor commits the formula into the document (matching Web
        //    closeOnClickAway), whereas Escape discards without writing.
        set_caret(&session, "p-eq", 1);
        type_text(&session, "$$ ");
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_some()));
        type_text(&session, "w^2");
        session.headless.simulate_click(point(px(20.0), px(200.0)));
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_none()));
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text("p-eq").unwrap();
            let has_w2 = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == " " && f.get("latex") == Some(&Any::String("w^2".into()))
                )
            });
            assert!(
                has_w2,
                "clicking outside EquationEditor must commit 'w^2': {:?}",
                rich.delta
            );
        });

        // 5a. Remote insertion immediately AFTER an open inline equation keeps the editor open
        //     and commits cleanly to the original formula, leaving the peer suffix after it.
        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
                let len = page
                    .read_editable_text("p-eq")
                    .unwrap()
                    .0
                    .plain
                    .encode_utf16()
                    .count() as u64;
                if len > 0 {
                    page.remove_text("p-eq", "prop:text", 0, len, 350).unwrap();
                }
                page.stop_capturing().unwrap();
            });
        });
        let _ = session.frame();
        set_caret(&session, "p-eq", 0);
        type_text(&session, "aa$$ ");
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_some()));
        let remote_after = session.view(|view, _| {
            let full = view.page().unwrap().encode_update_v1().unwrap();
            let mut peer = blocksuite_playground_doc::session::PageDocSession::new(
                HOME_PAGE_ID,
                blocksuite_playground_doc::client_id_from_seed(96),
            )
            .unwrap();
            peer.apply_remote_update_v1(&full).unwrap();
            peer.insert_text("p-eq", "prop:text", 3, "Y", 400)
                .unwrap()
                .expect("remote insert after formula")
                .update
        });
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&remote_after)
                    .unwrap();
            });
        });
        let _ = session.frame();
        assert!(
            session.view(|v, _| v.overlays().equation_editor().is_some()),
            "remote insert immediately after inline formula must keep EquationEditor open"
        );
        type_text(&session, "ccc");
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(crate::overlays::OverlayEvent::EquationApply, window, cx);
                })
                .unwrap();
        });
        let _ = session.frame();
        session.view(|view, _| {
            let (rich, _) = view.page().unwrap().read_editable_text("p-eq").unwrap();
            let has_ccc = rich.delta.iter().any(|op| {
                matches!(
                    op,
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(t),
                        format: Some(f),
                    } if t == " " && f.get("latex") == Some(&Any::String("ccc".into()))
                )
            });
            assert!(
                has_ccc && rich.plain == "aa Y ",
                "expected 'ccc' formula followed by 'Y': plain={:?} delta={:?}",
                rich.plain,
                rich.delta
            );
        });

        // 5b. Remote delete + re-insert of a new inline formula at the same offset closes local
        //     EquationEditor (CRDT item ID differs) without overwriting the peer's formula.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        crate::overlays::OverlayEvent::OpenEquationEditor {
                            target: crate::overlays::EquationTarget::Inline {
                                block_id: "p-eq".into(),
                                utf16_offset: 2,
                            },
                            initial: "ccc".into(),
                        },
                        window,
                        cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();
        let remote_replace = session.view(|view, _| {
            let full = view.page().unwrap().encode_update_v1().unwrap();
            let mut peer = blocksuite_playground_doc::session::PageDocSession::new(
                HOME_PAGE_ID,
                blocksuite_playground_doc::client_id_from_seed(97),
            )
            .unwrap();
            peer.apply_remote_update_v1(&full).unwrap();
            peer.apply_text_delta(
                "p-eq",
                "prop:text",
                &[
                    y_octo::TextDeltaOp::Retain {
                        retain: 2,
                        format: None,
                    },
                    y_octo::TextDeltaOp::Delete { delete: 1 },
                    y_octo::TextDeltaOp::Insert {
                        insert: y_octo::TextInsert::Text(" ".into()),
                        format: Some([("latex".to_string(), Any::String("peer".into()))].into()),
                    },
                ],
                450,
            )
            .unwrap()
            .expect("remote replace inline formula")
            .update
        });
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&remote_replace)
                    .unwrap();
            });
        });
        assert!(
            session.view(|v, _| v.overlays().equation_editor().is_none()),
            "remote delete+reinsert at same offset must auto-close local EquationEditor"
        );

        // 6. Opening a block equation without typing and clicking outside must NOT write back
        //    stale initial text over a peer's concurrent edit.
        set_caret(&session, "p-eq", 0);
        type_text(&session, "$$$$");
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        type_text(&session, "x");
        send_key(&session, "enter", ui::Modifiers::default());
        let _ = session.frame();
        let blk_id = session.view(|view, _| {
            view.page_snapshot()
                .unwrap()
                .block("note-root")
                .unwrap()
                .children
                .iter()
                .find(|c| c.flavour == "affine:latex")
                .expect("latex block")
                .id
                .clone()
        });
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        crate::overlays::OverlayEvent::OpenEquationEditor {
                            target: crate::overlays::EquationTarget::Block {
                                block_id: blk_id.clone(),
                            },
                            initial: "x".into(),
                        },
                        window,
                        cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();
        let remote_block_edit = session.view(|view, _| {
            let full = view.page().unwrap().encode_update_v1().unwrap();
            let mut peer = blocksuite_playground_doc::session::PageDocSession::new(
                HOME_PAGE_ID,
                blocksuite_playground_doc::client_id_from_seed(98),
            )
            .unwrap();
            peer.apply_remote_update_v1(&full).unwrap();
            peer.set_block_prop(
                &blk_id,
                "prop:latex",
                y_octo::SessionValue::Any(Any::String("y".into())),
                500,
            )
            .unwrap()
            .expect("remote block edit")
            .update
        });
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .apply_remote_update_v1(&remote_block_edit)
                    .unwrap();
            });
        });
        // Click outside without editing -> must close with zero write, keeping peer's "y".
        session.headless.simulate_click(point(px(20.0), px(200.0)));
        let _ = session.frame();
        assert!(session.view(|v, _| v.overlays().equation_editor().is_none()));
        session.view(|view, _| {
            assert_eq!(
                view.page_snapshot()
                    .unwrap()
                    .block(&blk_id)
                    .unwrap()
                    .content,
                BlockContent::Latex { latex: "y".into() }
            );
        });
    }

    #[test]
    fn touch_long_press_selects_word_before_lift_and_soft_keyboard_hide_dismisses_toolbar() {
        let session = open(390, 844, PlaygroundOptions::default());
        let _ = session.frame();

        let target_pos = session.view(|view, _| {
            let layout = view.flow_layout().expect("layout");
            let block = layout.block("showcase-intro").expect("intro");
            let geo = block_flow::page_geometry(390.0);
            point(
                px(geo.column_x + block.x + 24.0),
                px(TOPBAR_HEIGHT + block.y + 10.0),
            )
        });
        // Dispatch TouchPhase::Started and advance 550ms WITHOUT TouchPhase::Ended.
        session
            .headless
            .dispatch_input(ui::PlatformInput::Touch(ui::TouchEvent {
                id: ui::TouchId(7),
                phase: ui::TouchPhase::Started,
                position: target_pos,
                predicted_position: None,
                force: None,
            }));
        session.platform.advance_clock(Duration::from_millis(550));
        let _ = session.frame();

        let sel = session
            .view(|view, _| view.document_selection().cloned())
            .expect("selection after 500ms touch long-press before lift");
        assert_eq!(sel.focus.block_id, "showcase-intro");
        assert!(
            sel.anchor.offset() != sel.focus.offset(),
            "expected non-empty word selection before finger lift, got {sel:?}"
        );
        assert!(
            session.view(|view, _| view.overlays().keyboard_toolbar_visible()),
            "expected keyboard toolbar visible on narrow viewport with active selection"
        );

        // System soft-keyboard dismissal hides KeyboardToolbar while preserving selection.
        session.view(|view, cx| view.set_software_keyboard_visible(false, cx));
        let _ = session.frame();
        assert!(
            !session.view(|view, _| view.overlays().keyboard_toolbar_visible()),
            "expected keyboard toolbar hidden after software keyboard dismissal"
        );
        assert!(session.view(|view, _| view.document_selection().is_some()));

        // Desktop MouseDown held > 500ms must NOT trigger touch long-press word selection.
        session.view(|view, cx| {
            view.editor.selection = None;
            cx.notify();
        });
        let _ = session.frame();
        session
            .headless
            .dispatch_input(ui::PlatformInput::MouseDown(ui::MouseDownEvent {
                button: ui::MouseButton::Left,
                position: target_pos,
                modifiers: ui::Modifiers::none(),
                click_count: 1,
                first_mouse: false,
            }));
        session.platform.advance_clock(Duration::from_millis(550));
        let _ = session.frame();
        let desktop_sel = session
            .view(|view, _| view.document_selection().cloned())
            .expect("caret placed on desktop mouse down");
        assert!(
            desktop_sel.empty(),
            "desktop mouse hold >500ms must keep collapsed caret instead of touch word selection, got {desktop_sel:?}"
        );
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn set_document_reloads_pdf_preview_and_source_id_change_invalidates_stale_texture() {
        fn minimal_pdf() -> Vec<u8> {
            let mut out = b"%PDF-1.4\n".to_vec();
            let mut offsets = vec![0usize];
            let objs: [&[u8]; 4] = [
                b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
                b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
                b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>\nendobj\n",
                b"4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
            ];
            for obj in objs {
                offsets.push(out.len());
                out.extend_from_slice(obj);
            }
            let xref = out.len();
            out.extend_from_slice(format!("xref\n0 {}\n", offsets.len()).as_bytes());
            out.extend_from_slice(b"0000000000 65535 f \n");
            for off in offsets.iter().skip(1) {
                out.extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
            }
            out.extend_from_slice(
                format!(
                    "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
                    offsets.len()
                )
                .as_bytes(),
            );
            out
        }

        let make_pdf_doc = |blob_id: &str| {
            let mut state = DocState::new("doc:pdf-reload", 33).unwrap();
            state.workspace.create_page(HOME_PAGE_ID, "PDF", 1).unwrap();
            state.blobs.insert(blob_id.into(), minimal_pdf().into());
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "PDF".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "b-pdf",
                BlockSpec::Attachment {
                    name: "spec.pdf".into(),
                    size: 1024,
                    mime_type: "application/pdf".into(),
                    source_id: blob_id.into(),
                    caption: String::new(),
                    embed: true,
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
            state
        };

        let session = open(800, 600, PlaygroundOptions::default());
        session.view(|view, cx| view.set_document(make_pdf_doc("blob-a"), cx));
        assert!(session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));

        // Re-opening a fresh DocState with the same (block_id, source_id) must still render.
        session.view(|view, cx| view.set_document(make_pdf_doc("blob-a"), cx));
        assert!(session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));

        // Switching sourceId from "blob-a" to not-yet-downloaded "blob-b" invalidates stale "blob-a".
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .set_block_prop(
                        "b-pdf",
                        "prop:sourceId",
                        y_octo::SessionValue::Any(Any::String("blob-b".into())),
                        10,
                    )
                    .unwrap();
            });
        });
        assert!(!session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));

        // Once "blob-b" bytes arrive, preview renders for "blob-b".
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.blobs.insert("blob-b".into(), minimal_pdf().into());
            });
        });
        assert!(session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));
        assert_eq!(
            session.view(|view, _| view.pdf_preview_keys.get("b-pdf").map(|(s, _)| s.clone())),
            Some("blob-b".to_string())
        );

        // Switching to "blob-c" and delivering bytes via real RoomEvent::Blob (without edit_document)
        // must immediately rasterize Page 1 for "blob-c".
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                doc.workspace
                    .page_mut(HOME_PAGE_ID)
                    .unwrap()
                    .set_block_prop(
                        "b-pdf",
                        "prop:sourceId",
                        y_octo::SessionValue::Any(Any::String("blob-c".into())),
                        12,
                    )
                    .unwrap();
            });
        });
        assert!(!session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));
        session.view(|view, cx| {
            let (_, ev_rx) = async_channel::unbounded();
            let link = room_client::RoomLink::from_parts(ev_rx, |_| {});
            view.room = Some(view_room::RoomRuntime {
                config: room_client::RoomConfig::new("doc:pdf-reload", Some("ws://127.0.0.1:1")),
                protocol: room_client::RoomProtocol::new("doc:pdf-reload"),
                link,
                error: None,
            });
            view.handle_room_event(
                room_client::RoomEvent::Blob {
                    source_id: "blob-c".into(),
                    bytes: Some(minimal_pdf()),
                },
                cx,
            );
        });
        assert!(session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));
        assert_eq!(
            session.view(|view, _| view.pdf_preview_keys.get("b-pdf").map(|(s, _)| s.clone())),
            Some("blob-c".to_string())
        );
    }

    #[test]
    fn table_cell_inline_focus_live_edit_undo_empty_preserves_focus_and_remote_delete_closes() {
        use ui::EntityInputHandler;

        let mut state = DocState::new("doc:inline-table", 44).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Inline Table", 1)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Inline Table".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "tbl",
                BlockSpec::Table {
                    rows: vec![
                        vec!["Col A".into(), "Col B".into()],
                        vec![String::new(), "Existing".into()],
                    ],
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
            page.stop_capturing().unwrap();
        }

        let session = open(800, 600, PlaygroundOptions::default());
        session.view(|view, cx| view.set_document(state, cx));
        let _ = session.frame();

        // 1. Focusing an empty cell produces zero CRDT writeback.
        let sv_before =
            session.view(|view, _| view.page().unwrap().encode_state_vector_v1().unwrap());
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::FocusTableCell {
                            block_id: "tbl".into(),
                            row_id: "row-1".into(),
                            column_id: "col-0".into(),
                            screen_pos: None,
                        },
                        window,
                        cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();
        assert!(session.view(|view, _| view.active_table_cell().is_some()));
        let sv_after_focus =
            session.view(|view, _| view.page().unwrap().encode_state_vector_v1().unwrap());
        assert_eq!(
            sv_before, sv_after_focus,
            "focus-only must be zero writeback"
        );

        // 2. Typing splices live Y.Text directly and relayouts only the single table block.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.replace_text_in_range(None, "X", window, cx);
                })
                .unwrap();
        });
        let _ = session.frame();
        let read_r1c0 = || {
            session.view(|view, _| {
                let snap = view.page_snapshot().unwrap();
                let BlockContent::Table(t) = &snap.block("tbl").unwrap().content else {
                    panic!("expected table");
                };
                t.cells[&("row-1".into(), "col-0".into())]
                    .text
                    .plain
                    .clone()
            })
        };
        assert_eq!(read_r1c0(), "X");

        // 3. Undoing the first character back to empty keeps cell focus alive with caret at 0.
        send_key(&session, "z", cmd_mod());
        let _ = session.frame();
        assert_eq!(read_r1c0(), "");
        let focused_sel =
            session.view(|view, _| view.active_table_cell().map(|c| c.input.selection.clone()));
        assert_eq!(
            focused_sel,
            Some(0..0),
            "undoing back to empty must keep table cell focused with caret at 0"
        );

        // 4. Remote deletion of the focused row silently closes focus.
        session.view(|view, cx| {
            view.edit_document(cx, |doc| {
                let page = doc.workspace.page_mut(HOME_PAGE_ID).unwrap();
                let blk = y_octo::TypeTarget::Path(y_octo::TypePath::root("blocks").key("tbl"));
                page.inner_mut()
                    .map_remove(&blk, "prop:rows.row-1.rowId")
                    .unwrap();
                page.inner_mut()
                    .map_remove(&blk, "prop:rows.row-1.order")
                    .unwrap();
            });
        });
        let _ = session.frame();
        assert!(
            session.view(|view, _| view.active_table_cell().is_none()),
            "remote deletion of focused row must silently close cell focus"
        );
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn default_build_uses_registered_pdf_page_provider_and_falls_back_when_absent() {
        use std::sync::Mutex;

        static PDF_PROVIDER_LOCK: Mutex<()> = Mutex::new(());
        struct TestPdfProvider;
        impl block_flow::PdfPageProvider for TestPdfProvider {
            fn page_count(&self, _cache_key: &str, _bytes: &[u8]) -> block_flow::PdfPageCount {
                block_flow::PdfPageCount::Ready(2)
            }
            fn render_pdf_page(
                &self,
                _cache_key: &str,
                _bytes: &[u8],
                page_index: usize,
                _scale: f32,
            ) -> Option<block_flow::PdfPreviewPage> {
                let frame = image::Frame::new(image::RgbaImage::from_pixel(
                    4,
                    4,
                    image::Rgba([0, 0, 0, 255]),
                ));
                Some(block_flow::PdfPreviewPage {
                    page_index,
                    page_count: 2,
                    image: Arc::new(ui::RenderImage::new(vec![frame])),
                    width_pt: 200.0,
                    height_pt: 100.0,
                })
            }
        }
        struct ResetGuard;
        impl Drop for ResetGuard {
            fn drop(&mut self) {
                block_flow::register_pdf_page_provider(None);
            }
        }

        let _lock = PDF_PROVIDER_LOCK.lock().unwrap();
        let _guard = ResetGuard;
        block_flow::register_pdf_page_provider(None);

        let make_doc = || {
            let mut state = DocState::new("doc:pdf-provider", 55).unwrap();
            state.workspace.create_page(HOME_PAGE_ID, "PDF", 1).unwrap();
            state
                .blobs
                .insert("blob-host".into(), Arc::new(b"%PDF-1.4\n%%EOF\n".to_vec()));
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "PDF".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "b-pdf",
                BlockSpec::Attachment {
                    name: "host.pdf".into(),
                    size: 512,
                    mime_type: "application/pdf".into(),
                    source_id: "blob-host".into(),
                    caption: String::new(),
                    embed: true,
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
            state
        };

        let session = open(800, 600, PlaygroundOptions::default());
        // (a) Without a registered provider, no preview is generated (file card fallback).
        session.view(|view, cx| view.set_document(make_doc(), cx));
        assert!(!session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));

        // (b) With a host-registered PdfPageProvider, Page 1 texture is generated.
        block_flow::register_pdf_page_provider(Some(Arc::new(TestPdfProvider)));
        session.view(|view, cx| view.set_document(make_doc(), cx));
        assert!(session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));
    }

    #[test]
    fn paste_markdown_only_clipboard_item_inserts_h1_heading_block() {
        use ui::EntityInputHandler;

        let session = open(800, 600, PlaygroundOptions::default());
        let _ = session.frame();
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    let intro_end = view
                        .page_snapshot()
                        .and_then(|snap| snap.block("showcase-intro"))
                        .and_then(|node| match &node.content {
                            BlockContent::Paragraph { text, .. } => {
                                Some(text.plain.encode_utf16().count() as u64)
                            }
                            _ => None,
                        })
                        .unwrap_or(0);
                    view.select_document_range(
                        editor_session::DocumentSelection::caret(editor_session::DocPoint::new(
                            "showcase-intro",
                            intro_end,
                        )),
                        window,
                        cx,
                    );
                    let item = ui::ClipboardItem::new_string_with_json_metadata(
                        String::new(),
                        serde_json::json!({ "text/markdown": "Lead\n\n# Title" }),
                    );
                    view.paste(item, window, cx);
                })
                .unwrap();
        });
        let has_h1_title = session.view(|view, _| {
            view.page_snapshot()
                .unwrap()
                .root
                .iter()
                .flat_map(|root| root.walk())
                .any(|node| match &node.content {
                    BlockContent::Paragraph {
                        kind: blocksuite_playground_doc::schema::ParagraphType::H1,
                        text,
                        ..
                    } => text.plain == "Title",
                    _ => false,
                })
        });
        assert!(has_h1_title, "expected H1 heading block with text 'Title'");
    }

    fn make_table_doc_state(
        doc_id: &str,
        title: &str,
        rows: Vec<Vec<String>>,
        para: Option<&str>,
    ) -> DocState {
        let mut state = DocState::new(doc_id, 44).unwrap();
        state.workspace.create_page(HOME_PAGE_ID, title, 1).unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: title.into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block("tbl", BlockSpec::Table { rows }, Some("note"), None, 3)
                .unwrap();
            if let Some(text) = para {
                page.add_block(
                    "p1",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: text.to_string(),
                    },
                    Some("note"),
                    None,
                    4,
                )
                .unwrap();
            }
            page.stop_capturing().unwrap();
        }
        state
    }

    fn focus_table_cell_at(session: &Session, row: &str, col: &str) {
        let (row, col) = (row.to_string(), col.to_string());
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        overlays::OverlayEvent::FocusTableCell {
                            block_id: "tbl".into(),
                            row_id: row,
                            column_id: col,
                            screen_pos: None,
                        },
                        window,
                        cx,
                    );
                })
                .unwrap();
        });
    }

    #[test]
    fn table_cell_trailing_marks_match_paragraph_and_preedit_preserves_pixels() {
        use ui::EntityInputHandler;

        let reference = y_octo::Any::Object(Box::new(
            [
                ("type".to_string(), y_octo::Any::String("LinkedPage".into())),
                (
                    "pageId".to_string(),
                    y_octo::Any::String("doc:other".into()),
                ),
            ]
            .into_iter()
            .collect(),
        ));
        for (name, text, attr) in [
            ("bold", "see word", ("bold".to_string(), y_octo::Any::True)),
            ("code", "see code", ("code".to_string(), y_octo::Any::True)),
            (
                "link",
                "see site",
                (
                    "link".to_string(),
                    y_octo::Any::String("https://affine.pro".into()),
                ),
            ),
            ("reference", "see  ", ("reference".to_string(), reference)),
            (
                "latex",
                "see  ",
                ("latex".to_string(), y_octo::Any::String("x^2".into())),
            ),
        ] {
            let mut state = make_table_doc_state(
                "doc:cell-marks",
                "Marks",
                vec![vec!["H".into()], vec![text.into()]],
                Some(text),
            );
            {
                let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
                let run = (text.encode_utf16().count() - 4) as u64;
                let ops = vec![
                    y_octo::TextDeltaOp::Retain {
                        retain: 4,
                        format: None,
                    },
                    y_octo::TextDeltaOp::Retain {
                        retain: run,
                        format: Some(y_octo::TextAttributes::from([attr])),
                    },
                ];
                page.apply_text_delta("tbl", "prop:cells.row-1:col-0.text", &ops, 5)
                    .unwrap();
                page.apply_text_delta("p1", "prop:text", &ops, 6).unwrap();
                page.stop_capturing().unwrap();
            }
            let session = open(800, 500, PlaygroundOptions::default());
            session.view(|v, cx| v.set_document(state, cx));
            let _ = session.frame();
            set_caret(&session, "p1", text.encode_utf16().count() as u64);
            type_text(&session, "XY");
            let para_delta =
                session.view(|v, _| v.page().unwrap().read_editable_text("p1").unwrap().0.delta);
            focus_table_cell_at(&session, "row-1", "col-0");
            let _ = session.frame();
            type_text(&session, "XY");
            let cell_delta = session.view(|v, _| {
                v.page()
                    .unwrap()
                    .read_table_block("tbl")
                    .unwrap()
                    .unwrap()
                    .cells[&("row-1".into(), "col-0".into())]
                    .text
                    .delta
                    .clone()
            });
            assert_eq!(
                cell_delta, para_delta,
                "table cell delta must match paragraph delta after {name}"
            );
        }

        let text = "Plan for the launch review ";
        let mut state = make_table_doc_state(
            "doc:cell-preedit-px",
            "Preedit",
            vec![
                vec!["Task".into(), "Owner".into()],
                vec![text.into(), "Ann".into()],
            ],
            None,
        );
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.apply_text_delta(
                "tbl",
                "prop:cells.row-1:col-0.text",
                &[
                    y_octo::TextDeltaOp::Retain {
                        retain: 4,
                        format: Some(y_octo::TextAttributes::from([(
                            "bold".to_string(),
                            y_octo::Any::True,
                        )])),
                    },
                    y_octo::TextDeltaOp::Retain {
                        retain: 9,
                        format: None,
                    },
                    y_octo::TextDeltaOp::Retain {
                        retain: 6,
                        format: Some(y_octo::TextAttributes::from([(
                            "link".to_string(),
                            y_octo::Any::String("https://affine.pro".into()),
                        )])),
                    },
                ],
                5,
            )
            .unwrap();
            page.stop_capturing().unwrap();
        }
        let session = open(800, 420, PlaygroundOptions::default());
        session.view(|v, cx| v.set_document(state, cx));
        let _ = session.frame();
        focus_table_cell_at(&session, "row-1", "col-0");
        let (s0, i0) = session.frame();
        let caret0 = s0.elements["page.table_cell_caret"].bounds.x;
        let sv0 = session.view(|v, _| v.page().unwrap().encode_state_vector_v1().unwrap());
        session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                })
                .unwrap();
        });
        let (_, i1) = session.frame();
        let sv1 = session.view(|v, _| v.page().unwrap().encode_state_vector_v1().unwrap());
        assert_eq!(sv0, sv1, "preedit must not write to CRDT");
        let cell_b = s0.elements["page.block.tbl.cell.row-1.col-0"].bounds;
        let (x0, x1) = (cell_b.x as u32 + 2, (caret0 as u32).saturating_sub(2));
        let (y0, y1) = (cell_b.y as u32 + 2, (cell_b.y + cell_b.height) as u32 - 2);
        let mut changed = 0u32;
        for y in y0..y1 {
            for x in x0..x1 {
                if i0.get_pixel(x, y) != i1.get_pixel(x, y) {
                    changed += 1;
                }
            }
        }
        assert_eq!(
            changed, 0,
            "existing formatted text pixels left of caret must not change during IME preedit"
        );
        let hit_idx = session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    v.character_index_for_point(
                        point(px(cell_b.x + 12.0), px(cell_b.y + cell_b.height * 0.5)),
                        w,
                        cx,
                    )
                })
                .unwrap()
        });
        assert!(
            hit_idx.is_some(),
            "character_index_for_point must resolve inside focused cell"
        );
    }

    #[test]
    fn table_cell_exit_preserves_editor_focus_and_suppresses_unselected_root_input() {
        use ui::EntityInputHandler;

        let assert_editor_focused = |session: &Session, ctx: &str| {
            let ok = session.app.update(|cx| {
                session
                    .window
                    .update(cx, |v, w, cx| w.focused(cx) == Some(v.editor_focus.clone()))
                    .unwrap()
            });
            assert!(ok, "{ctx}: window.focused(cx) must stay on editor_focus");
        };

        // Switching to Edgeless closes the focused cell, preserves editor_focus across two
        // consecutive frames, and prevents typing/pasting from mutating the table cell.
        {
            let state = make_table_doc_state(
                "doc:cell-mode-switch",
                "Mode",
                vec![vec!["H".into()], vec!["cell".into()]],
                None,
            );
            let session = open(1280, 800, PlaygroundOptions::default());
            session.view(|v, cx| v.set_document(state, cx));
            let _ = session.frame();
            focus_table_cell_at(&session, "row-1", "col-0");
            let (snap, _) = session.frame();
            session.click(&snap, "chrome.mode_switcher.edgeless");
            let _ = session.frame();
            assert_editor_focused(&session, "edgeless switch frame 1");
            let _ = session.frame();
            assert_editor_focused(&session, "edgeless switch frame 2");
            assert!(session.view(|v, _| v.active_table_cell().is_none()));
            let sv0 = session.view(|v, _| v.page().unwrap().encode_state_vector_v1().unwrap());
            type_text(&session, "q");
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |v, w, cx| {
                        v.paste(ui::ClipboardItem::new_string("PASTED".into()), w, cx);
                    })
                    .unwrap();
            });
            let sv1 = session.view(|v, _| v.page().unwrap().encode_state_vector_v1().unwrap());
            assert_eq!(
                sv0, sv1,
                "typing/pasting in Edgeless must not mutate table cell"
            );
        }

        // Enter / Shift+Enter insert newlines inside the cell; Tab stays consumed; Escape and
        // remote row delete exit while keeping editor_focus and suppressing residual title typing.
        for how in ["escape", "peer deletes the row"] {
            let state = make_table_doc_state(
                "doc:cell-exit",
                "Probe",
                vec![vec!["H".into()], vec!["cell".into()]],
                Some("para"),
            );
            let session = open(800, 420, PlaygroundOptions::default());
            session.view(|v, cx| v.set_document(state, cx));
            let (snap, _) = session.frame();
            session.click(&snap, "page.block.tbl.cell.row-1.col-0");
            let _ = session.frame();
            if how == "escape" {
                send_key(&session, "enter", ui::Modifiers::default());
                assert!(session.view(|v, _| v.active_table_cell().is_some()));
                session.app.update(|cx| {
                    session
                        .window
                        .update(cx, |v, w, cx| {
                            v.paste(ui::ClipboardItem::new_string("a\tb".into()), w, cx);
                        })
                        .unwrap();
                });
                let cell_text = session.view(|v, _| {
                    v.page()
                        .unwrap()
                        .read_table_block("tbl")
                        .unwrap()
                        .unwrap()
                        .cells[&("row-1".into(), "col-0".into())]
                        .text
                        .plain
                        .clone()
                });
                assert_eq!(cell_text, "cell\na b");
            }
            type_text(&session, "A");
            match how {
                "peer deletes the row" => {
                    session.app.update(|cx| {
                        session
                            .window
                            .update(cx, |v, w, cx| {
                                v.replace_and_mark_text_in_range(None, "hao", None, w, cx);
                            })
                            .unwrap();
                    });
                    session.view(|v, cx| {
                        v.edit_document(cx, |doc| {
                            let page = doc.workspace.page_mut(HOME_PAGE_ID).unwrap();
                            let blk = y_octo::TypeTarget::Path(
                                y_octo::TypePath::root("blocks").key("tbl"),
                            );
                            page.inner_mut()
                                .map_remove(&blk, "prop:rows.row-1.rowId")
                                .unwrap();
                            page.inner_mut()
                                .map_remove(&blk, "prop:rows.row-1.order")
                                .unwrap();
                        });
                    });
                }
                key => send_key(&session, key, ui::Modifiers::default()),
            }
            let _ = session.frame();
            assert_editor_focused(&session, &format!("{how} frame 1"));
            let _ = session.frame();
            assert_editor_focused(&session, &format!("{how} frame 2"));
            let sv0 = session.view(|v, _| v.page().unwrap().encode_state_vector_v1().unwrap());
            type_text(&session, "B");
            type_text(&session, "C");
            let _ = session.frame();
            let sv1 = session.view(|v, _| v.page().unwrap().encode_state_vector_v1().unwrap());
            let title = session.view(|v, _| v.page_snapshot().unwrap().title().to_string());
            assert_eq!(title, "Probe", "({how}) must never write into page title");
            assert_eq!(
                sv0, sv1,
                "({how}) residual typing must produce zero CRDT writeback"
            );
        }
    }

    #[test]
    fn set_document_discards_preedit_and_suppresses_late_input_only_when_composing() {
        use blocksuite_playground_doc::schema::SurfaceElementSpec;
        use ui::EntityInputHandler;

        let make_doc_a = || {
            let mut state = make_table_doc_state(
                "doc:switch-a",
                "DocA",
                vec![vec!["H".into()], vec!["cell".into()]],
                Some("hello world"),
            );
            {
                let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
                page.add_block("surf", BlockSpec::Surface, Some("root"), None, 5)
                    .unwrap();
                page.add_surface_element(
                    "surf",
                    "sh-1",
                    "a0",
                    SurfaceElementSpec::Shape {
                        shape_type: "rect".into(),
                        xywh: "[80,80,180,90]".into(),
                        seed: 1,
                        filled: true,
                        text: Some("shape".into()),
                    },
                    6,
                )
                .unwrap();
                page.add_block(
                    "eq-1",
                    BlockSpec::Latex {
                        latex: "x^2".into(),
                    },
                    Some("note"),
                    None,
                    7,
                )
                .unwrap();
                page.stop_capturing().unwrap();
            }
            state
        };

        let cases = [
            ("paragraph_composing", true),
            ("link_bar_composing", true),
            ("equation_bar_composing", true),
            ("table_cell_composing", true),
            ("edgeless_label_composing", true),
            ("no_active_target", false),
            ("table_cell_focused_idle", false),
        ];

        for (case, expect_suppressed) in cases {
            let session = open(1280, 800, PlaygroundOptions::default());
            session.view(|v, cx| v.set_document(make_doc_a(), cx));
            let _ = session.frame();

            match case {
                "paragraph_composing" => {
                    set_caret(&session, "p1", 5);
                    session.app.update(|cx| {
                        session
                            .window
                            .update(cx, |v, w, cx| {
                                v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                            })
                            .unwrap();
                    });
                }
                "link_bar_composing" => {
                    session.app.update(|cx| {
                        session
                            .window
                            .update(cx, |v, w, cx| {
                                v.dispatch_overlay(
                                    overlays::OverlayEvent::SetSelection(Some(
                                        overlays::ActiveSelection {
                                            block_id: "p1".into(),
                                            start_utf16: 0,
                                            end_utf16: 5,
                                        },
                                    )),
                                    w,
                                    cx,
                                );
                                v.dispatch_overlay(
                                    overlays::OverlayEvent::Format(overlays::FormatAction::Link),
                                    w,
                                    cx,
                                );
                                v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                            })
                            .unwrap();
                    });
                }
                "equation_bar_composing" => {
                    session.app.update(|cx| {
                        session
                            .window
                            .update(cx, |v, w, cx| {
                                v.dispatch_overlay(
                                    overlays::OverlayEvent::OpenEquationEditor {
                                        target: overlays::EquationTarget::Block {
                                            block_id: "eq-1".into(),
                                        },
                                        initial: "x^2".into(),
                                    },
                                    w,
                                    cx,
                                );
                                v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                            })
                            .unwrap();
                    });
                }
                "table_cell_composing" => {
                    focus_table_cell_at(&session, "row-1", "col-0");
                    session.app.update(|cx| {
                        session
                            .window
                            .update(cx, |v, w, cx| {
                                v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                            })
                            .unwrap();
                    });
                }
                "edgeless_label_composing" => {
                    session.app.update(|cx| {
                        session
                            .window
                            .update(cx, |v, w, cx| {
                                v.set_mode(PlaygroundMode::Edgeless, w, cx);
                            })
                            .unwrap();
                    });
                    let _ = session.frame();
                    session.app.update(|cx| {
                        session
                            .window
                            .update(cx, |v, w, cx| {
                                assert!(v.edgeless_begin_inline_edit("sh-1", w, cx));
                                v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                            })
                            .unwrap();
                    });
                }
                "no_active_target" => {}
                "table_cell_focused_idle" => {
                    focus_table_cell_at(&session, "row-1", "col-0");
                }
                _ => unreachable!(),
            }

            let doc_b = make_table_doc_state("doc:switch-b", "DocB", vec![vec!["H".into()]], None);
            session.view(|v, cx| v.set_document(doc_b, cx));
            let _ = session.frame();
            type_text(&session, "X");
            let _ = session.frame();
            let title_b = session.view(|v, _| v.page_snapshot().unwrap().title().to_string());
            if expect_suppressed {
                assert_eq!(
                    title_b, "DocB",
                    "case {case}: late input after composing set_document must not mutate new title"
                );
            } else {
                assert_eq!(
                    title_b, "XDocB",
                    "case {case}: non-composing set_document must allow typing into new title"
                );
            }
        }
    }

    #[test]
    fn same_target_pointer_press_commits_preedit_before_repositioning_caret() {
        use blocksuite_playground_doc::schema::SurfaceElementSpec;
        use ui::EntityInputHandler;

        // Table cell: select 3..5 in "abcdef", compose "ni", click near cell start, unmark.
        {
            let state = make_table_doc_state(
                "doc:same-cell-press",
                "SameCell",
                vec![vec!["H".into()], vec!["abcdef".into()]],
                None,
            );
            let session = open(800, 420, PlaygroundOptions::default());
            session.view(|v, cx| v.set_document(state, cx));
            let (snap, _) = session.frame();
            focus_table_cell_at(&session, "row-1", "col-0");
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |v, w, cx| {
                        v.set_selected_text_range(3..5, w, cx);
                        v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                    })
                    .unwrap();
            });
            let _ = session.frame();
            let cell_b = snap.elements["page.block.tbl.cell.row-1.col-0"].bounds;
            session.headless.simulate_click(point(
                px(cell_b.x + 2.0),
                px(cell_b.y + cell_b.height * 0.5),
            ));
            session.platform.run_until_parked();
            let _ = session.frame();
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |v, w, cx| v.unmark_text(w, cx))
                    .unwrap();
            });
            let (plain, sel) = session.view(|v, _| {
                let text = v
                    .page()
                    .unwrap()
                    .read_table_block("tbl")
                    .unwrap()
                    .unwrap()
                    .cells[&("row-1".into(), "col-0".into())]
                    .text
                    .plain
                    .clone();
                let sel = v.active_table_cell().unwrap().input.selection.clone();
                (text, sel)
            });
            assert_eq!(
                plain, "abcnif",
                "table cell preedit must commit once into original 3..5 range"
            );
            assert_eq!(sel, 0..0, "caret must sit at clicked offset 0");
        }

        // Edgeless shape label: select 2..4 in "abcdef", compose "ni", click near start, unmark.
        {
            let mut state = make_table_doc_state(
                "doc:same-label-press",
                "SameLabel",
                vec![vec!["H".into()]],
                None,
            );
            {
                let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
                page.add_block("surf", BlockSpec::Surface, Some("root"), None, 5)
                    .unwrap();
                page.add_surface_element(
                    "surf",
                    "sh-1",
                    "a0",
                    SurfaceElementSpec::Shape {
                        shape_type: "rect".into(),
                        xywh: "[80,80,220,90]".into(),
                        seed: 1,
                        filled: true,
                        text: Some("abcdef".into()),
                    },
                    6,
                )
                .unwrap();
                page.stop_capturing().unwrap();
            }
            let session = open(1280, 800, PlaygroundOptions::default());
            session.view(|v, cx| v.set_document(state, cx));
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |v, w, cx| v.set_mode(PlaygroundMode::Edgeless, w, cx))
                    .unwrap();
            });
            let _ = session.frame();
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |v, w, cx| {
                        assert!(v.edgeless_begin_inline_edit("sh-1", w, cx));
                        v.set_selected_text_range(2..4, w, cx);
                        v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
                    })
                    .unwrap();
            });
            let _ = session.frame();
            let bounds =
                session.view(|v, _| v.edgeless_label_screen_bounds().expect("label bounds"));
            session.headless.simulate_click(point(
                bounds.origin.x + px(4.0),
                bounds.origin.y + bounds.size.height * 0.5,
            ));
            session.platform.run_until_parked();
            let _ = session.frame();
            session.app.update(|cx| {
                session
                    .window
                    .update(cx, |v, w, cx| v.unmark_text(w, cx))
                    .unwrap();
            });
            let (plain, sel) = session.view(|v, _| {
                let ed = v.edgeless.authoring.label_editor().expect("label editor");
                (ed.input.text.clone(), ed.input.selection.clone())
            });
            assert_eq!(
                plain, "abnief",
                "edgeless label preedit must commit once into original 2..4 range"
            );
            assert!(
                sel.start == sel.end && sel.start < 2,
                "caret must sit at clicked offset before 2, got {sel:?}"
            );
        }
    }

    #[test]
    fn async_pdf_provider_pending_then_ready_renders_and_steps_pages_without_false_failure() {
        use std::sync::{Mutex, RwLock};

        struct AsyncTestPdfProvider {
            count: RwLock<block_flow::PdfPageCount>,
            ready_pages: RwLock<std::collections::HashSet<usize>>,
        }
        impl block_flow::PdfPageProvider for AsyncTestPdfProvider {
            fn page_count(&self, cache_key: &str, _bytes: &[u8]) -> block_flow::PdfPageCount {
                assert_eq!(cache_key, "blob-async-pdf");
                *self.count.read().unwrap()
            }
            fn render_pdf_page(
                &self,
                cache_key: &str,
                _bytes: &[u8],
                page_index: usize,
                _scale: f32,
            ) -> Option<block_flow::PdfPreviewPage> {
                assert_eq!(cache_key, "blob-async-pdf");
                if !self.ready_pages.read().unwrap().contains(&page_index) {
                    return None;
                }
                let frame = image::Frame::new(image::RgbaImage::from_pixel(
                    8,
                    6,
                    image::Rgba([30, 60, 120, 255]),
                ));
                Some(block_flow::PdfPreviewPage {
                    page_index,
                    page_count: 2,
                    image: Arc::new(ui::RenderImage::new(vec![frame])),
                    width_pt: 240.0,
                    height_pt: 160.0,
                })
            }
        }
        struct ResetGuard;
        impl Drop for ResetGuard {
            fn drop(&mut self) {
                block_flow::register_pdf_page_provider(None);
            }
        }

        static LOCK: Mutex<()> = Mutex::new(());
        let _global_lock = crate::GLOBAL_PREVIEW_PROVIDER_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let _lock = LOCK.lock().unwrap();
        let _guard = ResetGuard;

        let provider = Arc::new(AsyncTestPdfProvider {
            count: RwLock::new(block_flow::PdfPageCount::Pending),
            ready_pages: RwLock::new(std::collections::HashSet::new()),
        });
        block_flow::register_pdf_page_provider(Some(provider.clone()));

        let mut state = DocState::new("doc:async-pdf", 56).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "AsyncPDF", 1)
            .unwrap();
        state.blobs.insert(
            "blob-async-pdf".into(),
            Arc::new(b"%PDF-1.4\n%%EOF\n".to_vec()),
        );
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "AsyncPDF".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "b-pdf",
                BlockSpec::Attachment {
                    name: "async.pdf".into(),
                    size: 512,
                    mime_type: "application/pdf".into(),
                    source_id: "blob-async-pdf".into(),
                    caption: String::new(),
                    embed: true,
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
        }

        let session = open(800, 600, PlaygroundOptions::default());
        session.view(|view, cx| view.set_document(state, cx));
        let _ = session.frame();

        // 1. First tick returns Pending -> must NOT poison `failed_pdf_blobs`!
        assert!(session.view(|view, _| view.failed_pdf_blobs.is_empty()));
        assert!(!session.view(|view, _| view.pdf_previews.contains_key("b-pdf")));

        // 2. Worker finishes page_count = 2 and page 0 -> refresh_pdf_previews populates page 0!
        *provider.count.write().unwrap() = block_flow::PdfPageCount::Ready(2);
        provider.ready_pages.write().unwrap().insert(0);
        session.view(|view, cx| {
            let attachments = view.active_pdf_attachments();
            view.refresh_pdf_previews(&attachments);
            cx.notify();
        });
        assert_eq!(
            session.view(|view, _| view.pdf_previews.get("b-pdf").map(|p| p.page_index)),
            Some(0)
        );

        // 3. Step to page 1 while page 1 is still in flight (`None`) -> target page 1 is retained,
        //    then once worker delivers page 1, `refresh_pdf_previews` lands on page 1!
        session.app.update(|cx| {
            session
                .window
                .update(cx, |view, window, cx| {
                    view.dispatch_overlay(
                        crate::overlays::OverlayEvent::AttachmentPdfPage {
                            block_id: "b-pdf".into(),
                            delta: 1,
                        },
                        window,
                        cx,
                    );
                })
                .unwrap();
        });
        assert_eq!(
            session.view(|view, _| view.pdf_page_indices.get("b-pdf").copied()),
            Some(1)
        );
        provider.ready_pages.write().unwrap().insert(1);
        session.view(|view, cx| {
            let attachments = view.active_pdf_attachments();
            view.refresh_pdf_previews(&attachments);
            cx.notify();
        });
        assert_eq!(
            session.view(|view, _| view.pdf_previews.get("b-pdf").map(|p| p.page_index)),
            Some(1)
        );
    }

    #[test]
    fn equation_multiline_live_preview_and_zero_writeback_cancel() {
        let mut state = DocState::new("eq-live", 101).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "EqLive", 1)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "EqLive".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "b-eq",
                BlockSpec::Latex {
                    latex: r"x^2".into(),
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
            page.stop_capturing().unwrap();
        }
        let session = open(1280, 800, PlaygroundOptions::default());
        session.view(|v, cx| v.set_document(state, cx));
        let _ = session.frame();
        let before_update = session.view(|v, _| {
            v.state
                .workspace
                .page(HOME_PAGE_ID)
                .unwrap()
                .encode_update_v1()
                .unwrap()
        });

        // Open equation editor on b-eq and insert a newline via Shift+Enter plus new LaTeX.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    v.dispatch_overlay(
                        crate::overlays::OverlayEvent::OpenEquationEditor {
                            target: crate::overlays::EquationTarget::Block {
                                block_id: "b-eq".into(),
                            },
                            initial: r"x^2".into(),
                        },
                        w,
                        cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();

        // Type Shift+Enter and "+ 1", then mark IME preedit "ni" (must not leak into draft preview).
        session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    let key = ui::KeyDownEvent {
                        keystroke: ui::Keystroke::parse("shift-enter").unwrap(),
                        is_held: false,
                        prefer_character_input: false,
                    };
                    v.editor_key_down(&key, w, cx);
                    ui::EntityInputHandler::replace_text_in_range(v, None, "+ 1", w, cx);
                    ui::EntityInputHandler::replace_and_mark_text_in_range(
                        v, None, "ni", None, w, cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();

        // Live preview reflects committed draft ("x^2\n+ 1") excluding IME preedit ("ni"),
        // while CRDT document still holds original "x^2" with zero writeback!
        let (crdt_latex, draft_committed) = session.view(|v, _| {
            let page = v.state.workspace.page(HOME_PAGE_ID).unwrap();
            let snap = page.read_page_snapshot().unwrap();
            let eq = snap
                .root
                .as_ref()
                .unwrap()
                .walk()
                .find(|n| n.id == "b-eq")
                .map(|n| match &n.content {
                    BlockContent::Latex { latex, .. } => latex.clone(),
                    _ => String::new(),
                })
                .unwrap_or_default();
            let draft = v
                .overlays
                .equation_editor()
                .map(|e| e.committed_draft().to_string())
                .unwrap_or_default();
            (eq, draft)
        });
        assert_eq!(
            crdt_latex, "x^2",
            "draft editing must perform zero CRDT writeback"
        );
        assert_eq!(
            draft_committed, "x^2\n+ 1",
            "committed draft must include Shift+Enter newline and exclude IME preedit"
        );

        // Escape cancels with zero CRDT writeback and zero undo pollution.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    let esc = ui::KeyDownEvent {
                        keystroke: ui::Keystroke::parse("escape").unwrap(),
                        is_held: false,
                        prefer_character_input: false,
                    };
                    v.editor_key_down(&esc, w, cx);
                    // Second Escape closes editor after abandoning preedit.
                    v.editor_key_down(&esc, w, cx);
                })
                .unwrap();
        });
        let _ = session.frame();
        let (after_cancel, after_update) = session.view(|v, _| {
            let page = v.state.workspace.page(HOME_PAGE_ID).unwrap();
            let snap = page.read_page_snapshot().unwrap();
            let eq = snap
                .root
                .as_ref()
                .unwrap()
                .walk()
                .find(|n| n.id == "b-eq")
                .map(|n| match &n.content {
                    BlockContent::Latex { latex, .. } => latex.clone(),
                    _ => String::new(),
                })
                .unwrap_or_default();
            (eq, page.encode_update_v1().unwrap())
        });
        assert_eq!(after_cancel, "x^2");
        assert_eq!(
            after_update, before_update,
            "cancelling equation editor must leave CRDT bytes and undo history untouched"
        );
    }

    #[test]
    fn callout_horizontal_row_and_embeds_zero_internal_ids() {
        let mut state = DocState::new("p4-p6", 102).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "RichParity", 1)
            .unwrap();
        state
            .workspace
            .create_page("doc:roadmap", "Roadmap 2026", 2)
            .unwrap();
        state
            .workspace
            .create_page("doc:synced", "Synced Spec", 3)
            .unwrap();
        {
            let synced = state.workspace.ensure_page("doc:synced").unwrap();
            synced
                .add_block(
                    "s-root",
                    BlockSpec::Page {
                        title: "Synced Spec".into(),
                    },
                    None,
                    None,
                    1,
                )
                .unwrap();
            synced
                .add_block(
                    "s-note",
                    BlockSpec::Note { xywh: None },
                    Some("s-root"),
                    None,
                    2,
                )
                .unwrap();
            synced
                .add_block(
                    "s-p",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "Synced body line".into(),
                    },
                    Some("s-note"),
                    None,
                    3,
                )
                .unwrap();
        }
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "RichParity".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "b-callout",
                BlockSpec::Callout {
                    icon: "\u{1F4A1}".into(),
                    background_color: Some("blue".into()),
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
            page.add_block(
                "b-callout-p",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Same row body".into(),
                },
                Some("b-callout"),
                None,
                4,
            )
            .unwrap();
            page.add_block(
                "b-link",
                BlockSpec::EmbedLinkedDoc {
                    page_id: "doc:roadmap".into(),
                    style: "horizontal".into(),
                    caption: String::new(),
                },
                Some("note"),
                None,
                5,
            )
            .unwrap();
            page.add_block(
                "b-sync",
                BlockSpec::EmbedSyncedDoc {
                    page_id: "doc:synced".into(),
                    caption: String::new(),
                },
                Some("note"),
                None,
                6,
            )
            .unwrap();
            page.add_block(
                "b-sref",
                BlockSpec::SurfaceRef {
                    reference: "frame-overview".into(),
                    ref_flavour: "affine:frame".into(),
                    caption: String::new(),
                },
                Some("note"),
                None,
                7,
            )
            .unwrap();
        }
        let session = open(1280, 800, PlaygroundOptions::default());
        session.view(|v, cx| v.set_document(state, cx));
        let _ = session.frame();

        session.view(|v, _| {
            let (_, layout) = v.layout.as_ref().expect("layout");
            let callout = layout
                .blocks
                .iter()
                .find(|b| b.block_id == "b-callout")
                .expect("callout");
            let child = layout
                .blocks
                .iter()
                .find(|b| b.block_id == "b-callout-p")
                .expect("callout child");
            assert!(
                (child.rect().y - (callout.rect().y + 5.0)).abs() <= 2.0,
                "callout child must sit on same row at top+5 (callout.y={}, child.y={})",
                callout.rect().y,
                child.rect().y
            );
            assert!(
                (child.rect().x - (callout.rect().x + 44.0)).abs() <= 2.0,
                "callout child must start at x+44 (callout.x={}, child.x={})",
                callout.rect().x,
                child.rect().x
            );
            for id in ["b-link", "b-sync", "b-sref"] {
                let b = layout
                    .blocks
                    .iter()
                    .find(|b| b.block_id == id)
                    .expect("embed block");
                for forbidden in ["doc:", "affine:frame", "frame-", "Synced document preview"] {
                    assert!(
                        !b.body.plain.contains(forbidden),
                        "embed block {id} leaked internal identifier '{forbidden}' in plain: {:?}",
                        b.body.plain
                    );
                }
            }
        });
    }

    #[test]
    fn wide_table_horizontal_scroll_shifts_hit_test_and_ime_bounds() {
        let state = make_table_doc_state(
            "doc:wide-table",
            "WideTable",
            vec![
                (0..8).map(|i| format!("Column Header {i}")).collect(),
                (0..8)
                    .map(|i| format!("Cell Value {i} long text"))
                    .collect(),
            ],
            None,
        );
        let session = open(640, 800, PlaygroundOptions::default());
        session.view(|v, cx| v.set_document(state, cx));
        let _ = session.frame();

        let (has_scroll, max_x, tbl_center) = session.view(|v, _| {
            let (_, layout) = v.layout.as_ref().expect("layout");
            let tb = layout
                .blocks
                .iter()
                .find(|b| b.block_id == "tbl")
                .expect("table block");
            let r = tb.rect();
            let cx_pt = r.x + r.w * 0.5;
            let cy_pt = TOPBAR_HEIGHT + r.y + r.h * 0.5;
            match &tb.body.code_scroll {
                Some(s) => (true, s.max_x, (cx_pt, cy_pt)),
                None => (false, 0.0, (cx_pt, cy_pt)),
            }
        });
        assert!(
            has_scroll && max_x > 100.0,
            "wide 8-column table must enable horizontal scroll (max_x={max_x})"
        );

        // Focus a cell, measure IME bounds at scroll_x=0, then scroll horizontally and confirm bounds shift by -scroll_x.
        session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    v.dispatch_overlay(
                        crate::overlays::OverlayEvent::FocusTableCell {
                            block_id: "tbl".into(),
                            row_id: "row-1".into(),
                            column_id: "col-1".into(),
                            screen_pos: None,
                        },
                        w,
                        cx,
                    );
                })
                .unwrap();
        });
        let _ = session.frame();
        let bounds_0 = session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    ui::EntityInputHandler::bounds_for_range(v, 0..4, Bounds::default(), w, cx)
                        .expect("IME bounds at scroll 0")
                })
                .unwrap()
        });

        session.app.update(|cx| {
            session
                .window
                .update(cx, |v, _w, cx| {
                    let (_, layout) = v.layout.as_ref().expect("layout").clone();
                    let snapshot = v.page_snapshot().expect("snapshot").clone();
                    let scene = v.overlay_scene(&snapshot, &layout, ui::Direction::Ltr, None);
                    assert!(
                        v.overlays
                            .scroll_code(&scene, tbl_center.0, tbl_center.1, -80.0, 0.0),
                        "horizontal scroll over wide table must be consumed"
                    );
                    cx.notify();
                })
                .unwrap();
        });
        let _ = session.frame();
        let bounds_80 = session.app.update(|cx| {
            session
                .window
                .update(cx, |v, w, cx| {
                    ui::EntityInputHandler::bounds_for_range(v, 0..4, Bounds::default(), w, cx)
                        .expect("IME bounds at scroll 80")
                })
                .unwrap()
        });
        let dx = f32::from(bounds_0.origin.x) - f32::from(bounds_80.origin.x);
        assert!(
            (dx - 80.0).abs() <= 1.5,
            "IME bounds must shift left by scroll_x=80, got dx={dx} (b0={bounds_0:?}, b80={bounds_80:?})"
        );
    }
}
