//! Screen-space overlays and interactive block controls of the Page view (`Overlays`).
//!
//! State transitions are pure functions of `OverlayScene` and scheduler time `now_ms`,
//! emitting `OverlayEffects` (single-undo-step `DocEdit`s, clipboard writes, and timers).
//! Popovers mount at `>= 0.01` opacity while opening and drop listeners while fading out.

mod bookmark_prompt;
mod context_menu;
mod equation;
mod keyboard_toolbar;
mod paint_linked_doc;
mod paint_page;
mod paint_popovers;
mod scrollbar;
mod slash;
mod state;
mod table_cell;
mod toolbar;
mod transform;

pub use bookmark_prompt::BookmarkPrompt;
pub use context_menu::{
    CONTEXT_MENU_PADDING, CONTEXT_MENU_RADIUS, CONTEXT_MENU_ROW_HEIGHT, CONTEXT_MENU_WIDTH,
    CONTEXT_TOAST_MS, ContextMenuAction, ContextMenuState, ContextToast, place_context_menu,
};
pub use equation::{EquationEditor, EquationTarget};
pub use keyboard_toolbar::{
    DEFAULT_KEYBOARD_TOOLBAR_ITEMS, HighlightColor, KEYBOARD_TOOL_PANEL_HEIGHT,
    KEYBOARD_TOOLBAR_BUTTON, KEYBOARD_TOOLBAR_HEIGHT, KeyboardToolbarAction,
    KeyboardToolbarCapabilities, KeyboardToolbarDateKind, KeyboardToolbarLevel,
    KeyboardToolbarPanel, KeyboardToolbarState, MORE_TOOL_PANEL_GROUPS, TEXT_SUB_TOOLBAR_ITEMS,
    TURN_INTO_PANEL_ITEMS, ToolPanelGroupSpec, ToolbarActionSpec, ToolbarItemSpec,
    is_flavour_supported,
};
pub use paint_page::{block_text, bounding_rect, find_parent, shared_alignment};
pub use paint_popovers::{PlacedPopover, Placement, PopoverSide, place_popover};
pub use scrollbar::{
    SCROLLBAR_DESKTOP_MIN_WIDTH, SCROLLBAR_EDGE_INSET, SCROLLBAR_MIN_THUMB,
    SCROLLBAR_VERTICAL_INSET, SCROLLBAR_WIDTH, ScrollbarDrag, ScrollbarMetrics,
    build_page_scrollbar,
};
pub use slash::{
    SLASH_ITEMS, SlashCommand, SlashItem, SlashMenu, SlashRow, filter_slash_items,
    slash_item_by_id, slash_rows, slash_rows_for_query,
};
pub use table_cell::InlineTableCell;
pub use toolbar::LinkBar;
pub use toolbar::{
    ActiveSelection, FormatAction, MarkState, SelectionFormat, marks_in_range, normalize_url,
};
pub use transform::OverlayScreenTransform;

use paint_page::{
    align_glyph, caret_world_rect, drag_handle_rect, drop_slot, emit, hover_block, icon, place,
    text_len,
};
use toolbar::{FormatToolbar, utf16_to_byte};

use std::collections::HashMap;

use blocksuite_playground_doc::read::{PageSnapshot, TextAlign as BlockAlign};
use ui::{Context, Motion, MotionCurve, Window};

/// Host callbacks required by [`Overlays`] page-layer and popover builders.
pub trait OverlayHost: 'static + Sized {
    fn dispatch_overlay(
        &mut self,
        event: OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    );
}
use y_octo::Any;

use crate::{
    TOPBAR_HEIGHT,
    block_flow::{CodeScroll, FlowLayout, FlowRect, PageGeometry, PageViewport, ScrolledCode},
    editor_session::DocumentSelection,
};

/// Duration of every overlay transition.
pub const OVERLAY_MOTION_MS: f64 = 150.0;
/// Duration of the to-do checkbox radial pulse feedback in milliseconds.
pub const TODO_PULSE_MS: f64 = 240.0;
/// How long a code block's copy button reads `Copied`.
pub const COPIED_MS: u64 = 1_500;

/// Gap between a popover and the text it is anchored to.
pub const POPOVER_GAP: f32 = 8.0;
/// Closest a popover comes to the edges of its viewport.
pub const POPOVER_EDGE_MARGIN: f32 = 8.0;

/// Width of the slash menu on viewports that have room for it.
pub const SLASH_MENU_WIDTH: f32 = 280.0;
/// Tallest the slash menu's list grows before it scrolls. The fold then cuts through a
/// row, which together with the scroll thumb says there is more.
pub const SLASH_LIST_MAX_HEIGHT: f32 = 332.0;
/// Corner radius of the slash menu, as in BlockSuite. The menu has no border; its shadow
/// lifts it off the page.
pub const SLASH_MENU_RADIUS: f32 = 8.0;
/// Padding between the slash menu's edge and its rows. BlockSuite pads `8px 4px 8px 8px`;
/// 4 px all around keeps the 4 px row radius concentric with the menu's 8 px.
pub const SLASH_MENU_PADDING: f32 = 4.0;
/// Height of an item row: its 28 px icon box alongside title and description subtitle.
pub const SLASH_ITEM_HEIGHT: f32 = 44.0;
/// Side of the bordered box around an item's icon.
pub(super) const SLASH_ICON_BOX: f32 = 28.0;
/// Gap between an item's icon box and its title.
pub(super) const SLASH_ICON_GAP: f32 = 10.0;
pub(super) const SLASH_HEADER_HEIGHT: f32 = 28.0;
pub(super) const SLASH_GROUP_GAP: f32 = 4.0;
pub(super) const SLASH_QUERY_HEIGHT: f32 = 28.0;
pub(super) const SLASH_SCROLL_GUTTER: f32 = 6.0;

/// Side of a formatting toolbar button.
pub const TOOLBAR_BUTTON: f32 = 28.0;
/// Corner radius of the formatting toolbar.
pub const TOOLBAR_RADIUS: f32 = 8.0;
/// Padding between the toolbar's edge and its buttons.
pub const TOOLBAR_PADDING: f32 = 4.0;
pub(super) const TOOLBAR_GAP: f32 = 2.0;
pub(super) const TOOLBAR_ROW_GAP: f32 = 4.0;
/// Space on either side of the line between the mark buttons and the alignment buttons.
pub(super) const TOOLBAR_SEPARATOR_MARGIN: f32 = 8.0;
pub(super) const LINK_APPLY_WIDTH: f32 = 52.0;
pub(super) const LINK_REMOVE_WIDTH: f32 = 64.0;
pub(super) const LINK_GAP: f32 = 4.0;
pub(super) const POPOVER_BORDER: f32 = 1.0;

/// Side of the gutter drag handle's hit target.
pub const DRAG_HANDLE_SIZE: f32 = 24.0;
/// The Page-mode handle at rest: BlockSuite's 4 × 12 px upright grabber bar.
pub(super) const DRAG_GRABBER_WIDTH: f32 = 4.0;
/// The Page-mode handle under the pointer or in a drag: narrows to a 2 × 12 px vertical bar
/// (the 2 × 3 six-dot pill is reserved for Edgeless `gfx` drag handles).
pub(super) const DRAG_GRABBER_HOT_WIDTH: f32 = 2.0;
pub(super) const DRAG_GRABBER_HEIGHT: f32 = 12.0;
/// Closest the drag handle comes to the left window edge.
pub const DRAG_HANDLE_MIN_X: f32 = 4.0;
/// Thickness of the drop indicator line.
pub const DROP_INDICATOR_THICKNESS: f32 = 2.0;
/// Side of the hit target of a to-do box, a toggle chevron and a heading chevron.
pub const CONTROL_HIT_SIZE: f32 = 24.0;
pub(super) const COPY_BUTTON_SIZE: f32 = 28.0;
pub(super) const COPY_BUTTON_INSET: f32 = 4.0;
pub(super) const COPIED_LABEL_WIDTH: f32 = 64.0;
/// A pointer this close to a block's row still counts as hovering it.
pub(super) const HOVER_SLACK: f32 = 9.0;

/// Ease-out cubic of a normalized time `t`.
pub fn ease_out_cubic(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    1.0 - (1.0 - t).powi(3)
}

/// A scalar transition from `from` to `to` over [`OVERLAY_MOTION_MS`], eased out cubically
/// and evaluated as a pure function of scheduler time.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EaseOut {
    from: f64,
    to: f64,
    clock: Motion,
}

impl EaseOut {
    pub fn new(from: f64, to: f64, start_ms: f64) -> Self {
        Self::with_duration(from, to, start_ms, OVERLAY_MOTION_MS)
    }

    pub fn with_duration(from: f64, to: f64, start_ms: f64, duration_ms: f64) -> Self {
        Self {
            from,
            to,
            clock: Motion::new(0.0, 1.0, MotionCurve::Linear, start_ms, duration_ms),
        }
    }

    pub fn value_at(&self, now_ms: f64) -> f64 {
        if self.clock.is_finished(now_ms) {
            return self.to;
        }
        self.from + (self.to - self.from) * ease_out_cubic(self.clock.value_at(now_ms))
    }

    pub fn is_finished(&self, now_ms: f64) -> bool {
        self.clock.is_finished(now_ms)
    }
}

/// Fade of a popover: in while it opens, out once it is dismissed.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Presence {
    pub fade: EaseOut,
    pub closing: bool,
}

impl Presence {
    pub fn opening(now_ms: f64) -> Self {
        Self {
            fade: EaseOut::new(0.0, 1.0, now_ms),
            closing: false,
        }
    }

    /// Open again from wherever a fade-out got to.
    pub fn reopened(self, now_ms: f64) -> Self {
        if self.closing {
            Self {
                fade: EaseOut::new(self.fade.value_at(now_ms), 1.0, now_ms),
                closing: false,
            }
        } else {
            self
        }
    }

    pub fn close(&mut self, now_ms: f64) {
        if !self.closing {
            *self = Self {
                fade: EaseOut::new(self.fade.value_at(now_ms), 0.0, now_ms),
                closing: true,
            };
        }
    }

    pub fn progress(&self, now_ms: f64) -> f32 {
        self.fade.value_at(now_ms) as f32
    }

    pub fn in_flight(&self, now_ms: f64) -> bool {
        !self.fade.is_finished(now_ms)
    }

    pub fn gone(&self, now_ms: f64) -> bool {
        self.closing && self.fade.is_finished(now_ms)
    }
}

/// Where a dragged block would land.
#[derive(Clone, Debug, PartialEq)]
pub struct DropSlot {
    pub parent_id: String,
    /// Index in the parent's children the block would be inserted before, counted with the
    /// block still in place.
    pub insert_index: usize,
    /// The dragged block's current index in the parent's children.
    pub old_index: usize,
    /// World y of the indicator line's center.
    pub indicator_world_y: f32,
    /// World x of the indicator line's left end.
    pub indicator_world_x: f32,
    /// World width of the sibling column spanned by the indicator line.
    pub indicator_world_width: f32,
}

impl DropSlot {
    /// Index of the block among its siblings once it is taken out and put back, `None`
    /// when the slot leaves the block where it is.
    pub fn reorder_index(&self) -> Option<u64> {
        if self.insert_index == self.old_index || self.insert_index == self.old_index + 1 {
            return None;
        }
        let index = if self.insert_index > self.old_index {
            self.insert_index - 1
        } else {
            self.insert_index
        };
        Some(index as u64)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct BlockDrag {
    pub(super) block_id: String,
    pub(super) slot: Option<DropSlot>,
}

/// A document edit an overlay asks the view for. The view carries each out through the
/// editor's document session as one undo step.
#[derive(Clone, Debug, PartialEq)]
pub enum DocEdit {
    SetProp {
        block_id: String,
        key: &'static str,
        value: Any,
    },
    Reorder {
        parent_id: String,
        child_id: String,
        new_index: u64,
    },
    Slash {
        block_id: String,
        command: SlashCommand,
        /// Whether the command was typed into the block after a `/`, which goes first.
        typed: bool,
    },
    /// Toggle an inline mark over the text selection.
    Mark(&'static str),
    /// Align the selected blocks.
    Align(BlockAlign),
    /// Link the text selection to a URL, or clear its link.
    Link(Option<String>),
    /// Commit a LaTeX equation string to a block or inline target.
    Equation {
        target: EquationTarget,
        latex: String,
    },
    /// Insert a validated `affine:bookmark` block below `block_id`.
    Bookmark { block_id: String, url: String },
}

/// Something that happened to the overlays: input routed by the view, or a call of the
/// public API (`PlaygroundView::dispatch_overlay`). Pointer positions are in window space.
#[derive(Clone, Debug, PartialEq)]
pub enum OverlayEvent {
    PointerMoved {
        x: f32,
        y: f32,
        /// Whether the primary button is held.
        pressed: bool,
    },
    PointerUp,
    /// Open the slash menu for a block with a filter of its own. `anchor` is a
    /// screen-space rectangle to hang the menu from; the caret of `utf16_offset` when
    /// absent.
    OpenSlashMenu {
        block_id: String,
        utf16_offset: usize,
        anchor: Option<FlowRect>,
    },
    /// Replace the slash menu's filter. `in_document` says the filter is text typed into
    /// the block after its `/`.
    SetSlashQuery {
        query: String,
        in_document: bool,
    },
    CloseSlashMenu,
    SlashHover(usize),
    SlashExecute(usize),
    SlashScroll(f32),
    /// Set or clear the editor's text selection.
    SetSelection(Option<ActiveSelection>),
    Format(FormatAction),
    LinkApply,
    LinkRemove,
    /// Text pasted into the link field.
    Paste(String),
    ToggleChecked(String),
    ToggleCollapsed(String),
    CopyCode(String),
    DragStart(String),
    /// Open the `@` linked-document picker with an initial query.
    OpenLinkedDocMenu {
        block_id: String,
        query: String,
    },
    /// Update the open `@` linked-document picker query.
    SetLinkedDocQuery(String),
    /// Hover a row in the open `@` linked-document picker (`0..items.len()` or `items.len()` for Create).
    LinkedDocHover(usize),
    /// Select a row in the open `@` linked-document picker (`0..items.len()` inserts existing doc chip;
    /// `items.len()` creates a new linked doc and inserts its chip).
    LinkedDocSelect(usize),
    /// Dismiss the `@` linked-document picker.
    CloseLinkedDocMenu,
    /// Create a linked document (or convert a line to a linked doc) through the host directory
    /// and insert its `LinkedPage` inline reference chip into `block_id` as one undo step.
    CreateLinkedDoc {
        block_id: String,
        title: String,
        mode: crate::directory::EditorDocMode,
        intent_id: Option<String>,
    },
    /// Open the equation editor for a block or inline latex target.
    OpenEquationEditor {
        target: EquationTarget,
        initial: String,
    },
    /// Commit the equation editor's current LaTeX string.
    EquationApply,
    /// Click inside the multiline equation editor at window coordinates `(x, y)`.
    EquationClick {
        x: f32,
        y: f32,
        shift: bool,
    },
    /// Dismiss the equation editor without committing.
    CloseEquationEditor,
    /// Open the bookmark URL prompt anchored to `block_id`.
    OpenBookmarkPrompt {
        block_id: String,
    },
    /// Commit the bookmark URL prompt (no-op if empty or invalid).
    BookmarkApply,
    /// Dismiss the bookmark URL prompt without inserting a block.
    CloseBookmarkPrompt,
    /// Insert a decoded image blob chosen from the host file picker as an `affine:image` block.
    InsertImageBytes {
        bytes: Vec<u8>,
        caption: String,
    },
    /// Show or hide the mobile bottom keyboard toolbar.
    SetKeyboardToolbarVisible(bool),
    /// Scroll the horizontal mobile keyboard toolbar strip by `delta_x` px.
    KeyboardToolbarScroll(f32),
    /// Scroll the active mobile keyboard tool panel (`+`, `Turn into`, or `Highlight`) by `delta_y` px.
    KeyboardToolbarPanelScroll(f32),
    /// Trigger one action button on the mobile bottom keyboard toolbar.
    KeyboardToolbar(KeyboardToolbarAction),
    /// Focus an `affine:table` cell in place for live `Y.Text` CRDT editing.
    FocusTableCell {
        block_id: String,
        row_id: String,
        column_id: String,
        screen_pos: Option<(f32, f32)>,
    },
    /// Step the active PDF page preview of an `affine:attachment` block by `delta` (`-1` / `+1`).
    AttachmentPdfPage {
        block_id: String,
        delta: i32,
    },
    /// Open the target document of an `affine:embed-linked-doc` or `affine:embed-synced-doc` card.
    OpenEmbedDoc {
        page_id: String,
    },
    /// Touch long-press at window coordinates `(x, y)` to select the ICU word under the finger.
    LongPressWord {
        x: f32,
        y: f32,
    },
    /// Open the desktop right-click context menu at window coordinates `(x, y)`.
    OpenContextMenu {
        x: f32,
        y: f32,
    },
    /// Dismiss the desktop right-click context menu.
    CloseContextMenu,
    /// Execute a command from the desktop right-click context menu.
    ContextMenuAction(ContextMenuAction),
}

/// Active `@` linked-document menu state populated from [`crate::directory::WorkspaceDocDirectory`].
#[derive(Clone, Debug, PartialEq)]
pub struct LinkedDocMenuState {
    pub block_id: String,
    pub utf16_offset: usize,
    pub query: String,
    pub query_in_document: bool,
    pub selected: usize,
    pub results: crate::directory::DocQueryPage,
    pub presence: Presence,
    pub rect: Option<FlowRect>,
}

impl LinkedDocMenuState {
    /// Total selectable rows: matched documents plus the bottom Create row.
    pub fn row_count(&self) -> usize {
        self.results.items.len() + 1
    }
}

/// What the view has to do after an [`OverlayEvent`] or a key.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct OverlayEffects {
    /// Edits to carry out, in order.
    pub edits: Vec<DocEdit>,
    /// Text to put on the clipboard.
    pub clipboard: Option<String>,
    /// Start a [`COPIED_MS`] timer on the scheduler clock and report its end with
    /// [`Overlays::copied_expired`] and this generation.
    pub copied_timer: Option<u64>,
    /// Read the clipboard into the link field.
    pub paste: bool,
    pub redraw: bool,
    /// Whether a key was consumed.
    pub handled: bool,
}

/// Everything the overlays read about the page for one event or frame.
#[derive(Clone, Copy)]
pub struct OverlayScene<'a> {
    pub snapshot: &'a PageSnapshot,
    pub layout: &'a FlowLayout,
    pub geometry: PageGeometry,
    /// Window size in logical pixels.
    pub window: (f32, f32),
    pub scroll_y: f32,
    /// Explicit layout direction supplied by the host shell.
    pub direction: ui::Direction,
    /// Explicit device form factor supplied by the host shell.
    pub form_factor: crate::block_flow::FormFactor,
    /// Code block currently holding the caret or included in whole-block selection.
    pub focused_code_block: Option<&'a str>,
    /// The editor's finished, formattable text selection, for frames.
    pub selection: Option<&'a SelectionFormat>,
    /// Optional camera-mapped transform when editing inside an Edgeless Note / EdgelessText.
    pub screen_transform: Option<OverlayScreenTransform>,
}

impl OverlayScene<'_> {
    /// The page viewport below the top bar.
    pub fn page_viewport(&self) -> PageViewport {
        PageViewport {
            column_x: self.geometry.column_x,
            height: (self.window.1 - TOPBAR_HEIGHT).max(0.0),
            scroll_y: self.scroll_y,
        }
    }

    /// Screen-space area popovers may cover: the window below the top bar.
    pub fn popover_viewport(&self) -> FlowRect {
        FlowRect::new(
            0.0,
            TOPBAR_HEIGHT,
            self.window.0,
            (self.window.1 - TOPBAR_HEIGHT).max(0.0),
        )
    }

    pub(super) fn anchor_visible(&self, world: &FlowRect) -> bool {
        if self.screen_transform.is_some() {
            let s = self.world_to_screen(world);
            let v = self.popover_viewport();
            s.bottom() > v.y && s.y < v.bottom() && s.right() > v.x && s.x < v.right()
        } else {
            self.page_viewport().intersects(world)
        }
    }

    pub(super) fn world_to_screen(&self, rect: &FlowRect) -> FlowRect {
        if let Some(t) = self.screen_transform {
            t.rect_to_screen(rect)
        } else {
            rect.translated(self.geometry.column_x, TOPBAR_HEIGHT - self.scroll_y)
        }
    }

    pub(super) fn screen_to_world(&self, x: f32, y: f32) -> (f32, f32) {
        if let Some(t) = self.screen_transform {
            t.screen_to_local(x, y)
        } else {
            (
                x - self.geometry.column_x,
                y - TOPBAR_HEIGHT + self.scroll_y,
            )
        }
    }
}

/// Marks and alignment of one editor selection at one document revision.
pub(super) type FormatCache = (
    u64,
    DocumentSelection,
    Option<(MarkState, Option<BlockAlign>)>,
);

/// Overlay and block-control state of the Page view.
#[derive(Default)]
pub struct Overlays {
    pub(super) hovered: Option<String>,
    /// Whether the pointer is on the hovered block's drag handle itself.
    pub(super) handle_hot: bool,
    pub(super) slash: Option<SlashMenu>,
    toolbar: Option<FormatToolbar>,
    pub(super) drag: Option<BlockDrag>,
    /// Chevrons in flight by block id: `0.0` collapsed to `1.0` expanded.
    pub(super) chevrons: HashMap<String, EaseOut>,
    /// Active to-do checkbox radial pulse animations by block id (`0.0 -> 1.0`).
    pub(super) todo_pulses: HashMap<String, EaseOut>,
    /// Sideways scroll of unwrapped code blocks by block id.
    pub(super) code_scroll: HashMap<String, f32>,
    /// Code block whose copy button reads `Copied`, with the generation of its timer.
    pub(super) copied: Option<(String, u64)>,
    pub(super) copied_generation: u64,
    pub(super) linked_doc: Option<LinkedDocMenuState>,
    pub(super) equation: Option<EquationEditor>,
    pub(super) bookmark: Option<BookmarkPrompt>,
    pub(super) keyboard_toolbar: KeyboardToolbarState,
    pub(super) context_menu: Option<ContextMenuState>,
    pub(super) context_toast: Option<ContextToast>,
    pub(super) context_toast_generation: u64,
    pub format_cache: Option<FormatCache>,
}

impl Overlays {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reconcile popover state (formatting toolbar, slash/linked-doc fade-out) when editing
    /// inside an Edgeless Note or EdgelessText where `page_layer` is not invoked.
    pub fn reconcile_edgeless(
        &mut self,
        scene: &OverlayScene<'_>,
        now_ms: f64,
        window: &mut Window,
    ) {
        self.reconcile(scene, now_ms);
        if self.in_flight(now_ms) {
            window.request_animation_frame();
        }
    }

    /// Active `@` linked-document menu state, if open (not closing).
    pub fn linked_doc_menu(&self) -> Option<&LinkedDocMenuState> {
        self.linked_doc
            .as_ref()
            .filter(|menu| !menu.presence.closing)
    }

    /// Mutable access to the open `@` linked-document menu state.
    pub fn linked_doc_menu_mut(&mut self) -> Option<&mut LinkedDocMenuState> {
        self.linked_doc
            .as_mut()
            .filter(|menu| !menu.presence.closing)
    }

    /// Updates or clears the `@` linked-document menu state.
    pub fn set_linked_doc_menu(&mut self, state: Option<LinkedDocMenuState>) {
        self.linked_doc = state;
    }

    /// Dismiss the `@` linked-document menu with a fade-out transition.
    pub fn close_linked_doc(&mut self, now_ms: f64) -> bool {
        match self.linked_doc_menu_mut() {
            Some(menu) => {
                menu.presence.close(now_ms);
                true
            }
            None => false,
        }
    }

    /// The slash menu, while it is open.
    pub fn slash_menu(&self) -> Option<&SlashMenu> {
        self.slash.as_ref().filter(|menu| !menu.presence.closing)
    }

    /// Whether the formatting toolbar is open.
    pub fn format_toolbar_open(&self) -> bool {
        self.open_toolbar().is_some()
    }

    /// Text of the toolbar's link field, while that field is open.
    pub fn link_url(&self) -> Option<&str> {
        self.link_field().map(LinkBar::url)
    }

    /// The toolbar's link field, while it is open.
    pub fn link_field(&self) -> Option<&LinkBar> {
        self.open_toolbar()?.link.as_ref()
    }

    pub fn link_field_mut(&mut self) -> Option<&mut LinkBar> {
        self.open_toolbar_mut()?.link.as_mut()
    }

    /// Whichever overlay text field currently owns text input (equation, bookmark, or link).
    pub fn active_text_field(&self) -> Option<&LinkBar> {
        self.equation_editor()
            .map(|editor| &editor.input)
            .or_else(|| self.bookmark_prompt().map(|prompt| &prompt.input))
            .or_else(|| self.link_field())
    }

    pub fn active_text_field_mut(&mut self) -> Option<&mut LinkBar> {
        if self.equation_editor().is_some() {
            return self.equation_editor_mut().map(|editor| &mut editor.input);
        }
        if self.bookmark_prompt().is_some() {
            return self.bookmark_prompt_mut().map(|prompt| &mut prompt.input);
        }
        self.link_field_mut()
    }

    /// Whether the pointer is on the drag handle itself, not just on its block's row.
    pub fn drag_handle_hot(&self) -> bool {
        self.handle_hot
    }

    /// Block whose row the pointer is on.
    pub fn hovered_block(&self) -> Option<&str> {
        self.hovered.as_deref()
    }

    /// Block being dragged by its handle.
    pub fn dragged_block(&self) -> Option<&str> {
        self.drag.as_ref().map(|drag| drag.block_id.as_str())
    }

    /// Where the dragged block would land.
    pub fn drop_slot(&self) -> Option<&DropSlot> {
        self.drag.as_ref()?.slot.as_ref()
    }

    /// Sideways scroll of a code/table/database block.
    pub fn code_scroll_x(&self, block_id: &str) -> f32 {
        self.code_scroll.get(block_id).copied().unwrap_or(0.0)
    }

    /// Effective sideways scroll of a block, falling back to `code.initial_x` until the user
    /// scrolls it manually.
    pub fn code_scroll_x_for(&self, block_id: &str, code: CodeScroll) -> f32 {
        self.code_scroll
            .get(block_id)
            .copied()
            .unwrap_or(code.initial_x)
    }

    /// The code blocks of `layout` that are scrolled sideways.
    pub fn scrolled_code(&self, layout: &FlowLayout) -> Vec<ScrolledCode> {
        self.code_scroll
            .iter()
            .filter_map(|(block_id, scroll)| {
                ScrolledCode::of_block(layout.block(block_id)?, *scroll)
            })
            .collect()
    }

    /// Scroll a code block sideways so the caret at `caret_x` (relative to its code area,
    /// unscrolled) is in view.
    pub fn reveal_code_x(&mut self, block_id: &str, caret_x: f32, code: CodeScroll) {
        let current = self.code_scroll_x(block_id);
        let next = if caret_x < current {
            caret_x
        } else if caret_x > current + code.area.w - 2.0 {
            caret_x - code.area.w + 2.0
        } else {
            current
        };
        let next = next.clamp(0.0, code.max_x).round();
        if next > 0.0 {
            self.code_scroll.insert(block_id.to_string(), next);
        } else {
            self.code_scroll.remove(block_id);
        }
    }

    /// Whether a block's disclosure chevron is turning between its two states.
    pub fn chevron_turning(&self, block_id: &str) -> bool {
        self.chevrons.contains_key(block_id)
    }

    /// Code block whose copy button currently reads `Copied`.
    pub fn copied_block(&self) -> Option<&str> {
        self.copied.as_ref().map(|(block_id, _)| block_id.as_str())
    }

    /// The `Copied` timer of `generation` ran out. Returns whether a label went away.
    pub fn copied_expired(&mut self, generation: u64) -> bool {
        if self
            .copied
            .as_ref()
            .is_some_and(|(_, current)| *current == generation)
        {
            self.copied = None;
            return true;
        }
        false
    }

    /// Whether a to-do checkbox radial pulse is currently in flight for `block_id`.
    pub fn todo_pulse_active(&self, block_id: &str) -> bool {
        self.todo_pulses.contains_key(block_id)
    }

    /// Drop every popover, hover and gesture at once, e.g. when the page is hidden or
    /// replaced.
    pub fn reset(&mut self) {
        self.hovered = None;
        self.handle_hot = false;
        self.slash = None;
        self.toolbar = None;
        self.drag = None;
        self.chevrons.clear();
        self.todo_pulses.clear();
        self.linked_doc = None;
        self.equation = None;
        self.bookmark = None;
        self.context_menu = None;
        self.context_toast = None;
        self.keyboard_toolbar.close_transient();
        self.format_cache = None;
    }
}
