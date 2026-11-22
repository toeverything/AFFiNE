//! Screen-space overlays and interactive block controls of the Page view.
//!
//! [`Overlays`] owns what floats above or reacts inside the page: the slash menu, the
//! formatting toolbar of the text selection, the gutter drag handle with its drop
//! indicator, and the clickable parts of blocks (to-do boxes, toggle and heading chevrons,
//! the code block's copy button and sideways scroll). The text selection itself is the
//! editor's (`editor_session`); the overlays read it.
//!
//! The state machine is data in, commands out: an [`OverlayScene`] and an
//! [`OverlayEvent`] or key go in, [`OverlayEffects`] come out (document edits, clipboard
//! text, a timer to start). It reads no clock: every transition is an [`EaseOut`]
//! evaluated at the scheduler time passed in. The `PlaygroundView` glue at the end of the
//! module feeds it input and carries each edit out through the editor's document session
//! as one undo step.
//!
//! Popovers are placed by the pure [`place_popover`]. Opening popovers mount on frame 1
//! with opacity clamped to at least `0.01` so interactive controls are immediately clickable
//! without triggering `zero-opacity-hit-through`; a popover that is fully closed is not
//! mounted at all, and one that is fading out carries no handlers, so nothing invisible can
//! be clicked.

use std::{collections::HashMap, ops::Range, time::Duration};

use blocksuite_playground_doc::{
    DocError, DocResult,
    read::{BlockContent, BlockNode, PageSnapshot, RichText, TextAlign as BlockAlign},
    schema::{BlockSpec, ListType, ParagraphType},
    session::SelectionSnapshot,
};
use ui::{
    AnyElement, App, ClickEvent, ClipboardItem, Context, Div, FontWeight, Hsla, KeyDownEvent,
    Keystroke, Motion, MotionCurve, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent,
    ScrollEvent, SharedString, TextRun, Window, canvas, div, point, prelude::*, px, size,
};
use y_octo::{Any, SessionValue, TextAttributes, TextDeltaOp, TextInsert};

use crate::{
    PlaygroundMode, PlaygroundView, TOPBAR_HEIGHT,
    block_flow::{
        CODE_RADIUS, CodeScroll, FlowBlock, FlowKind, FlowLayout, FlowRect, PAGE_SURFACE_ID,
        PageGeometry, PagePaint, PageViewport, ScrolledCode, heading_marker_rect, paint_chevron,
        paragraph_spec,
    },
    editor_session::{DocPoint, DocumentSelection},
    theme::{FONT_SANS, IconPaint, Palette, TYPOGRAPHY},
};

/// Duration of every overlay transition.
pub const OVERLAY_MOTION_MS: f64 = 150.0;
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
/// Height of an item row: its 28 px icon box with 2 px above and below.
const SLASH_ITEM_HEIGHT: f32 = 32.0;
/// Side of the bordered box around an item's icon.
const SLASH_ICON_BOX: f32 = 28.0;
/// Gap between an item's icon box and its title.
const SLASH_ICON_GAP: f32 = 10.0;
const SLASH_HEADER_HEIGHT: f32 = 28.0;
const SLASH_GROUP_GAP: f32 = 4.0;
const SLASH_QUERY_HEIGHT: f32 = 28.0;
const SLASH_SCROLL_GUTTER: f32 = 6.0;

/// Side of a formatting toolbar button.
pub const TOOLBAR_BUTTON: f32 = 28.0;
/// Corner radius of the formatting toolbar.
pub const TOOLBAR_RADIUS: f32 = 8.0;
/// Padding between the toolbar's edge and its buttons.
pub const TOOLBAR_PADDING: f32 = 4.0;
const TOOLBAR_GAP: f32 = 2.0;
const TOOLBAR_ROW_GAP: f32 = 4.0;
/// Space on either side of the line between the mark buttons and the alignment buttons.
const TOOLBAR_SEPARATOR_MARGIN: f32 = 8.0;
const LINK_APPLY_WIDTH: f32 = 52.0;
const LINK_REMOVE_WIDTH: f32 = 64.0;
const LINK_GAP: f32 = 4.0;
const POPOVER_BORDER: f32 = 1.0;

/// Side of the gutter drag handle's hit target.
pub const DRAG_HANDLE_SIZE: f32 = 24.0;
/// The handle at rest: BlockSuite's upright grabber bar.
const DRAG_GRABBER_WIDTH: f32 = 4.0;
const DRAG_GRABBER_HEIGHT: f32 = 12.0;
/// The handle under the pointer or in a drag: two columns of three dots on a pill.
const DRAG_DOTS_PILL_WIDTH: f32 = 14.0;
const DRAG_DOT: f32 = 4.0;
const DRAG_DOT_GAP: f32 = 2.0;
/// Closest the drag handle comes to the left window edge.
pub const DRAG_HANDLE_MIN_X: f32 = 4.0;
/// Thickness of the drop indicator line.
pub const DROP_INDICATOR_THICKNESS: f32 = 2.0;
/// Side of the hit target of a to-do box, a toggle chevron and a heading chevron.
pub const CONTROL_HIT_SIZE: f32 = 24.0;
const COPY_BUTTON_SIZE: f32 = 28.0;
const COPY_BUTTON_INSET: f32 = 4.0;
const COPIED_LABEL_WIDTH: f32 = 64.0;
/// A pointer this close to a block's row still counts as hovering it.
const HOVER_SLACK: f32 = 9.0;

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
        Self {
            from,
            to,
            clock: Motion::new(0.0, 1.0, MotionCurve::Linear, start_ms, OVERLAY_MOTION_MS),
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
struct Presence {
    fade: EaseOut,
    closing: bool,
}

impl Presence {
    fn opening(now_ms: f64) -> Self {
        Self {
            fade: EaseOut::new(0.0, 1.0, now_ms),
            closing: false,
        }
    }

    /// Open again from wherever a fade-out got to.
    fn reopened(self, now_ms: f64) -> Self {
        if self.closing {
            Self {
                fade: EaseOut::new(self.fade.value_at(now_ms), 1.0, now_ms),
                closing: false,
            }
        } else {
            self
        }
    }

    fn close(&mut self, now_ms: f64) {
        if !self.closing {
            *self = Self {
                fade: EaseOut::new(self.fade.value_at(now_ms), 0.0, now_ms),
                closing: true,
            };
        }
    }

    fn progress(&self, now_ms: f64) -> f32 {
        self.fade.value_at(now_ms) as f32
    }

    fn in_flight(&self, now_ms: f64) -> bool {
        !self.fade.is_finished(now_ms)
    }

    fn gone(&self, now_ms: f64) -> bool {
        self.closing && self.fade.is_finished(now_ms)
    }
}

/// Side and alignment a popover prefers relative to its anchor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Placement {
    /// Above the anchor, centered on it.
    Above,
    /// Below the anchor, starting at its left edge.
    BelowStart,
}

/// Side of the anchor a popover ended up on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PopoverSide {
    Above,
    Below,
}

/// Result of [`place_popover`], on the pixel grid.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlacedPopover {
    pub rect: FlowRect,
    pub side: PopoverSide,
    /// Whether the popover left its preferred side.
    pub flipped: bool,
}

/// Place a popover of `popover_size` next to `anchor` inside `viewport`, all in screen
/// space.
///
/// The popover sits `gap` away from the anchor on its preferred side. When that side would
/// bring it closer than `edge_margin` to the viewport's top or bottom it flips to the other
/// side; when neither side has room it takes the roomier one and is held inside the
/// viewport. Horizontally it is clamped to
/// `[viewport.x + edge_margin, viewport.right() - edge_margin - width]`.
pub fn place_popover(
    anchor: FlowRect,
    popover_size: (f32, f32),
    viewport: FlowRect,
    preferred: Placement,
    gap: f32,
    edge_margin: f32,
) -> PlacedPopover {
    let (width, height) = popover_size;
    let top_limit = viewport.y + edge_margin;
    let bottom_limit = viewport.bottom() - edge_margin;
    let above_y = anchor.y - gap - height;
    let below_y = anchor.bottom() + gap;
    let fits_above = above_y >= top_limit;
    let fits_below = below_y + height <= bottom_limit;

    let preferred_side = match preferred {
        Placement::Above => PopoverSide::Above,
        Placement::BelowStart => PopoverSide::Below,
    };
    let side = match (preferred_side, fits_above, fits_below) {
        (PopoverSide::Above, true, _) | (PopoverSide::Below, true, false) => PopoverSide::Above,
        (PopoverSide::Below, _, true) | (PopoverSide::Above, false, true) => PopoverSide::Below,
        // Neither side has room: the roomier one, preferred side on a tie.
        (preferred_side, false, false) => {
            let room_above = anchor.y - viewport.y;
            let room_below = viewport.bottom() - anchor.bottom();
            if room_above > room_below {
                PopoverSide::Above
            } else if room_below > room_above {
                PopoverSide::Below
            } else {
                preferred_side
            }
        }
    };
    let y = match side {
        PopoverSide::Above => above_y,
        PopoverSide::Below => below_y,
    };
    let y = y.min(bottom_limit - height).max(top_limit);

    let x = match preferred {
        Placement::Above => anchor.x + (anchor.w - width) / 2.0,
        Placement::BelowStart => anchor.x,
    };
    let left_limit = viewport.x + edge_margin;
    let x = x
        .min(viewport.right() - edge_margin - width)
        .max(left_limit);

    PlacedPopover {
        rect: FlowRect::new(x.round(), y.round(), width, height),
        side,
        flipped: side != preferred_side,
    }
}

/// What a slash menu item turns the anchor block into, or inserts below it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SlashCommand {
    Paragraph(ParagraphType),
    List(ListType),
    Divider,
    Code,
}

impl SlashCommand {
    fn block_spec(self) -> BlockSpec {
        match self {
            Self::Paragraph(paragraph_type) => BlockSpec::Paragraph {
                paragraph_type,
                text: String::new(),
            },
            Self::List(list_type) => BlockSpec::List {
                list_type,
                text: String::new(),
                checked: false,
                order: None,
            },
            Self::Divider => BlockSpec::Divider,
            Self::Code => BlockSpec::Code {
                text: String::new(),
                language: None,
                caption: String::new(),
            },
        }
    }
}

/// One entry of the slash menu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SlashItem {
    /// Stable id, the last segment of the row's snapshot id.
    pub id: &'static str,
    pub title: &'static str,
    pub group: &'static str,
    /// Name of the generated icon.
    pub icon: &'static str,
    /// Lowercase search words matched by prefix, besides the title.
    pub keywords: &'static [&'static str],
    pub command: SlashCommand,
}

const fn slash_item(
    id: &'static str,
    title: &'static str,
    group: &'static str,
    icon: &'static str,
    keywords: &'static [&'static str],
    command: SlashCommand,
) -> SlashItem {
    SlashItem {
        id,
        title,
        group,
        icon,
        keywords,
        command,
    }
}

/// Every slash menu item, in menu order; items of one group are adjacent. The order is
/// BlockSuite's (text, headings, code, quote, divider, then lists), with all six headings
/// in the list itself so each is one filter away.
pub const SLASH_ITEMS: [SlashItem; 14] = [
    slash_item(
        "text",
        "Text",
        "Basic",
        "TextIcon",
        &["paragraph", "plain"],
        SlashCommand::Paragraph(ParagraphType::Text),
    ),
    slash_item(
        "h1",
        "Heading 1",
        "Basic",
        "Heading1Icon",
        &["h1", "heading1", "title"],
        SlashCommand::Paragraph(ParagraphType::H1),
    ),
    slash_item(
        "h2",
        "Heading 2",
        "Basic",
        "Heading2Icon",
        &["h2", "heading2"],
        SlashCommand::Paragraph(ParagraphType::H2),
    ),
    slash_item(
        "h3",
        "Heading 3",
        "Basic",
        "Heading3Icon",
        &["h3", "heading3"],
        SlashCommand::Paragraph(ParagraphType::H3),
    ),
    slash_item(
        "h4",
        "Heading 4",
        "Basic",
        "Heading4Icon",
        &["h4", "heading4"],
        SlashCommand::Paragraph(ParagraphType::H4),
    ),
    slash_item(
        "h5",
        "Heading 5",
        "Basic",
        "Heading5Icon",
        &["h5", "heading5"],
        SlashCommand::Paragraph(ParagraphType::H5),
    ),
    slash_item(
        "h6",
        "Heading 6",
        "Basic",
        "Heading6Icon",
        &["h6", "heading6"],
        SlashCommand::Paragraph(ParagraphType::H6),
    ),
    slash_item(
        "code",
        "Code Block",
        "Basic",
        "CodeBlockIcon",
        &["snippet", "pre"],
        SlashCommand::Code,
    ),
    slash_item(
        "quote",
        "Quote",
        "Basic",
        "QuoteIcon",
        &["blockquote"],
        SlashCommand::Paragraph(ParagraphType::Quote),
    ),
    slash_item(
        "divider",
        "Divider",
        "Basic",
        "DividerIcon",
        &["hr", "line", "separator"],
        SlashCommand::Divider,
    ),
    slash_item(
        "bulleted",
        "Bulleted List",
        "List",
        "BulletedListIcon",
        &["ul", "unordered"],
        SlashCommand::List(ListType::Bulleted),
    ),
    slash_item(
        "numbered",
        "Numbered List",
        "List",
        "NumberedListIcon",
        &["ol", "ordered"],
        SlashCommand::List(ListType::Numbered),
    ),
    slash_item(
        "todo",
        "To-do List",
        "List",
        "CheckBoxCheckLinearIcon",
        &["todo", "task", "checkbox"],
        SlashCommand::List(ListType::Todo),
    ),
    slash_item(
        "toggle",
        "Toggle List",
        "List",
        "ToggleRightIcon",
        &["collapse", "fold"],
        SlashCommand::List(ListType::Toggle),
    ),
];

/// Items matching `query`, in menu order: the query is found anywhere in a title (case and
/// spaces ignored) or starts a keyword. An empty query matches every item.
pub fn filter_slash_items(query: &str) -> Vec<&'static SlashItem> {
    let needle: String = query
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect();
    SLASH_ITEMS
        .iter()
        .filter(|item| {
            if needle.is_empty() {
                return true;
            }
            let title: String = item
                .title
                .chars()
                .filter(|ch| !ch.is_whitespace())
                .flat_map(char::to_lowercase)
                .collect();
            title.contains(&needle)
                || item
                    .keywords
                    .iter()
                    .any(|keyword| keyword.starts_with(&needle))
        })
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum SlashRow {
    Header(&'static str),
    Item(usize),
    Empty,
}

/// Rows of the slash menu list as `(row, y, height)`, and the list's total height.
fn slash_rows(items: &[&'static SlashItem]) -> (Vec<(SlashRow, f32, f32)>, f32) {
    if items.is_empty() {
        return (
            vec![(SlashRow::Empty, 0.0, SLASH_ITEM_HEIGHT)],
            SLASH_ITEM_HEIGHT,
        );
    }
    let mut rows = Vec::new();
    let mut y = 0.0;
    let mut group = "";
    for (index, item) in items.iter().enumerate() {
        if item.group != group {
            group = item.group;
            if index > 0 {
                y += SLASH_GROUP_GAP;
            }
            rows.push((SlashRow::Header(group), y, SLASH_HEADER_HEIGHT));
            y += SLASH_HEADER_HEIGHT;
        }
        rows.push((SlashRow::Item(index), y, SLASH_ITEM_HEIGHT));
        y += SLASH_ITEM_HEIGHT;
    }
    (rows, y)
}

/// The open slash menu.
#[derive(Clone, Debug, PartialEq)]
pub struct SlashMenu {
    /// Block the menu acts on.
    pub block_id: String,
    /// UTF-16 offset in the block's text the menu was opened at.
    pub utf16_offset: usize,
    /// Live filter.
    pub query: String,
    /// Index of the active row among the filtered items.
    pub selected: usize,
    /// Whether an editor typed the query into the document itself; the menu then shows no
    /// query row of its own.
    pub query_in_document: bool,
    /// Explicit world-space anchor; the caret of `utf16_offset` when absent.
    anchor_world: Option<FlowRect>,
    scroll: f32,
    reveal_selected: bool,
    presence: Presence,
    /// Screen-space box of the menu as last laid out.
    rect: Option<FlowRect>,
}

/// An action of the formatting toolbar.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FormatAction {
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    Link,
    AlignLeft,
    AlignCenter,
    AlignRight,
}

impl FormatAction {
    /// Toolbar buttons in order; a separator sits before the alignment group.
    pub const ALL: [Self; 9] = [
        Self::Bold,
        Self::Italic,
        Self::Underline,
        Self::Strike,
        Self::Code,
        Self::Link,
        Self::AlignLeft,
        Self::AlignCenter,
        Self::AlignRight,
    ];

    /// Last segment of the button's snapshot id.
    pub fn id(self) -> &'static str {
        match self {
            Self::Bold => "bold",
            Self::Italic => "italic",
            Self::Underline => "underline",
            Self::Strike => "strike",
            Self::Code => "code",
            Self::Link => "link",
            Self::AlignLeft => "align_left",
            Self::AlignCenter => "align_center",
            Self::AlignRight => "align_right",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Bold => "Bold",
            Self::Italic => "Italic",
            Self::Underline => "Underline",
            Self::Strike => "Strikethrough",
            Self::Code => "Inline Code",
            Self::Link => "Link",
            Self::AlignLeft => "Align Left",
            Self::AlignCenter => "Align Center",
            Self::AlignRight => "Align Right",
        }
    }

    fn icon(self) -> Option<&'static str> {
        match self {
            Self::Bold => Some("BoldIcon"),
            Self::Italic => Some("ItalicIcon"),
            Self::Underline => Some("UnderLineIcon"),
            Self::Strike => Some("StrikeThroughIcon"),
            Self::Code => Some("CodeIcon"),
            Self::Link => Some("LinkIcon"),
            Self::AlignLeft | Self::AlignCenter | Self::AlignRight => None,
        }
    }

    /// Inline attribute the action toggles, if it is a mark.
    fn mark_key(self) -> Option<&'static str> {
        match self {
            Self::Bold => Some("bold"),
            Self::Italic => Some("italic"),
            Self::Underline => Some("underline"),
            Self::Strike => Some("strike"),
            Self::Code => Some("code"),
            _ => None,
        }
    }

    fn align(self) -> Option<BlockAlign> {
        match self {
            Self::AlignLeft => Some(BlockAlign::Left),
            Self::AlignCenter => Some(BlockAlign::Center),
            Self::AlignRight => Some(BlockAlign::Right),
            _ => None,
        }
    }
}

/// Marks carried by every unit of a text range.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MarkState {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
    pub code: bool,
    /// The link shared by the whole range.
    pub link: Option<String>,
}

impl MarkState {
    fn has(&self, key: &str) -> bool {
        match key {
            "bold" => self.bold,
            "italic" => self.italic,
            "underline" => self.underline,
            "strike" => self.strike,
            "code" => self.code,
            _ => false,
        }
    }
}

/// Marks that hold across the whole UTF-16 range `start..end` of `text`: a mark counts only
/// when every unit of the range carries it. An empty range carries none.
pub fn marks_in_range(text: &RichText, start: usize, end: usize) -> MarkState {
    let mut state = MarkState::default();
    let mut covered = false;
    let mut link: Option<Option<String>> = None;
    let mut offset = 0_usize;
    let mut all = [true; 5];
    const KEYS: [&str; 5] = ["bold", "italic", "underline", "strike", "code"];
    for op in &text.delta {
        let TextDeltaOp::Insert { insert, format } = op else {
            continue;
        };
        let len = match insert {
            TextInsert::Text(text) => text.encode_utf16().count(),
            TextInsert::Embed(_) => 1,
        };
        let (op_start, op_end) = (offset, offset + len);
        offset = op_end;
        if op_end <= start || op_start >= end || len == 0 {
            continue;
        }
        covered = true;
        for (index, key) in KEYS.iter().enumerate() {
            let on = format
                .as_ref()
                .is_some_and(|attrs| attrs.get(*key) == Some(&Any::True));
            all[index] &= on;
        }
        let op_link = format.as_ref().and_then(|attrs| match attrs.get("link") {
            Some(Any::String(url)) => Some(url.clone()),
            _ => None,
        });
        link = match link {
            None => Some(op_link),
            Some(shared) if shared == op_link => Some(shared),
            Some(_) => Some(None),
        };
    }
    if covered {
        state.bold = all[0];
        state.italic = all[1];
        state.underline = all[2];
        state.strike = all[3];
        state.code = all[4];
        state.link = link.flatten();
    }
    state
}

/// A text range inside one block, as hosts and tests hand it to
/// [`OverlayEvent::SetSelection`]. `start_utf16` is the anchor and `end_utf16` the focus,
/// so a backward selection has `end < start`. The view turns it into the editor's
/// document selection.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActiveSelection {
    pub block_id: String,
    pub start_utf16: usize,
    pub end_utf16: usize,
}

impl ActiveSelection {
    pub fn caret(block_id: impl Into<String>, utf16_offset: usize) -> Self {
        Self {
            block_id: block_id.into(),
            start_utf16: utf16_offset,
            end_utf16: utf16_offset,
        }
    }

    pub fn is_collapsed(&self) -> bool {
        self.start_utf16 == self.end_utf16
    }

    /// The selected range as `(low, high)`.
    pub fn range(&self) -> (usize, usize) {
        (
            self.start_utf16.min(self.end_utf16),
            self.start_utf16.max(self.end_utf16),
        )
    }
}

/// What the formatting toolbar reads from the editor's text selection for one frame.
#[derive(Clone, Debug, PartialEq)]
pub struct SelectionFormat {
    /// World-space box around the selected text.
    pub anchor_world: FlowRect,
    /// Marks every selected unit carries.
    pub marks: MarkState,
    /// Alignment the selected blocks share, `None` when they differ.
    pub align: Option<BlockAlign>,
}

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// Byte index of a UTF-16 offset in `text`, clamped to the text and never inside a
/// character.
fn utf16_to_byte(text: &str, offset: usize) -> usize {
    let mut units = 0;
    for (byte, ch) in text.char_indices() {
        if units + ch.len_utf16() > offset {
            return byte;
        }
        units += ch.len_utf16();
    }
    text.len()
}

/// A composition running in the link field. Offsets are UTF-16 units.
#[derive(Clone, Debug, PartialEq, Eq)]
struct LinkPreedit {
    /// Range of the URL the composition replaces once it commits.
    replacement: Range<usize>,
    text: String,
    /// Selected part of `text`.
    selected: Range<usize>,
}

/// URL field attached to the formatting toolbar: a one-line text input of its own, with
/// a selection and an input-method composition. While it is open it is the view's text
/// input; the document's text, selection and composition stay untouched. Offsets are
/// UTF-16 units.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct LinkBar {
    url: String,
    /// Selected range of `url`, empty at the caret.
    selection: Range<usize>,
    /// Whether the caret is at the start of the selection.
    reversed: bool,
    preedit: Option<LinkPreedit>,
    /// Screen-space box of the field as last laid out.
    bounds: Option<FlowRect>,
}

impl LinkBar {
    fn new(url: String) -> Self {
        let end = utf16_len(&url);
        Self {
            url,
            selection: end..end,
            ..Self::default()
        }
    }

    /// The URL as committed so far, without a running composition.
    pub(crate) fn url(&self) -> &str {
        &self.url
    }

    /// The field's text as shown: the URL with a running composition in place.
    pub(crate) fn text(&self) -> String {
        match &self.preedit {
            Some(preedit) => format!(
                "{}{}{}",
                &self.url[..utf16_to_byte(&self.url, preedit.replacement.start)],
                preedit.text,
                &self.url[utf16_to_byte(&self.url, preedit.replacement.end)..],
            ),
            None => self.url.clone(),
        }
    }

    /// The selection as shown, and whether its caret is at its start.
    pub(crate) fn shown_selection(&self) -> (Range<usize>, bool) {
        match &self.preedit {
            Some(preedit) => {
                let start = preedit.replacement.start;
                (
                    start + preedit.selected.start..start + preedit.selected.end,
                    false,
                )
            }
            None => (self.selection.clone(), self.reversed),
        }
    }

    /// Range of the shown text a running composition covers.
    pub(crate) fn marked_range(&self) -> Option<Range<usize>> {
        let preedit = self.preedit.as_ref()?;
        Some(preedit.replacement.start..preedit.replacement.start + utf16_len(&preedit.text))
    }

    pub(crate) fn composing(&self) -> bool {
        self.preedit.is_some()
    }

    /// Screen-space box of the field as last laid out.
    pub(crate) fn bounds(&self) -> Option<FlowRect> {
        self.bounds
    }

    /// A slice of the shown text and the range it really covers.
    pub(crate) fn text_for_range(&self, range: Range<usize>) -> (String, Range<usize>) {
        let text = self.text();
        let start = utf16_to_byte(&text, range.start);
        let end = utf16_to_byte(&text, range.end).max(start);
        let covered = utf16_len(&text[..start])..utf16_len(&text[..end]);
        (text[start..end].to_string(), covered)
    }

    /// `range` ordered, inside the URL and on character boundaries.
    fn clamped(&self, range: Range<usize>) -> Range<usize> {
        let at = |offset: usize| utf16_len(&self.url[..utf16_to_byte(&self.url, offset)]);
        let (start, end) = (
            at(range.start.min(range.end)),
            at(range.start.max(range.end)),
        );
        start..end
    }

    /// Put `text` in place of a running composition, else of `range`, else of the
    /// selection, and leave the caret behind it. Control characters are dropped: the
    /// field is one line.
    pub(crate) fn replace(&mut self, range: Option<Range<usize>>, text: &str) {
        let target = match self.preedit.take() {
            Some(preedit) => preedit.replacement,
            None => range.map_or(self.selection.clone(), |range| self.clamped(range)),
        };
        let text: String = text.chars().filter(|ch| !ch.is_control()).collect();
        let start = utf16_to_byte(&self.url, target.start);
        let end = utf16_to_byte(&self.url, target.end);
        self.url.replace_range(start..end, &text);
        let caret = target.start + utf16_len(&text);
        self.selection = caret..caret;
        self.reversed = false;
    }

    /// Show `text` as a composition over `range` (the selection when absent; the first
    /// range for as long as the composition runs). The URL and its selection stay as they
    /// are until the composition commits, and an empty `text` abandons it.
    pub(crate) fn mark(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
    ) {
        if text.is_empty() {
            self.preedit = None;
            return;
        }
        let replacement = match &self.preedit {
            Some(preedit) => preedit.replacement.clone(),
            None => range.map_or(self.selection.clone(), |range| self.clamped(range)),
        };
        let text: String = text.chars().filter(|ch| !ch.is_control()).collect();
        let len = utf16_len(&text);
        let selected = selected.unwrap_or(len..len);
        self.preedit = Some(LinkPreedit {
            replacement,
            text,
            selected: selected.start.min(len)..selected.end.min(len),
        });
    }

    /// Commit a running composition as it stands.
    pub(crate) fn unmark(&mut self) {
        if let Some(preedit) = &self.preedit {
            let text = preedit.text.clone();
            self.replace(None, &text);
        }
    }

    /// Select `range` of the URL; a running composition is abandoned.
    pub(crate) fn select(&mut self, range: Range<usize>) {
        self.preedit = None;
        self.selection = self.clamped(range);
        self.reversed = false;
    }

    fn selected_text(&self) -> &str {
        &self.url[utf16_to_byte(&self.url, self.selection.start)
            ..utf16_to_byte(&self.url, self.selection.end)]
    }

    fn focus(&self) -> usize {
        if self.reversed {
            self.selection.start
        } else {
            self.selection.end
        }
    }

    /// Move the caret to `to`; `extend` keeps the other end of the selection.
    fn move_caret(&mut self, to: usize, extend: bool) {
        let anchor = if !extend {
            to
        } else if self.reversed {
            self.selection.end
        } else {
            self.selection.start
        };
        self.selection = anchor.min(to)..anchor.max(to);
        self.reversed = to < anchor;
    }

    /// The offset one character before or after `from`.
    fn step(&self, from: usize, forward: bool) -> usize {
        let byte = utf16_to_byte(&self.url, from);
        let next = if forward {
            self.url[byte..]
                .chars()
                .next()
                .map_or(byte, |ch| byte + ch.len_utf8())
        } else {
            self.url[..byte]
                .chars()
                .next_back()
                .map_or(byte, |ch| byte - ch.len_utf8())
        };
        utf16_len(&self.url[..next])
    }

    /// An editing key of the field: caret movement (with `shift` extending the
    /// selection), deletion and select-all. Returns whether the key was one.
    fn key(&mut self, key: &str, shift: bool, secondary: bool) -> bool {
        let end = utf16_len(&self.url);
        let collapsed = self.selection.is_empty();
        match key {
            "left" | "right" | "home" | "end" | "up" | "down" => {
                let forward = matches!(key, "right" | "end" | "down");
                let to = if matches!(key, "left" | "right") && !secondary {
                    if collapsed || shift {
                        self.step(self.focus(), forward)
                    } else if forward {
                        self.selection.end
                    } else {
                        self.selection.start
                    }
                } else if forward {
                    end
                } else {
                    0
                };
                self.move_caret(to, shift);
            }
            "backspace" | "delete" => {
                let forward = key == "delete";
                let range = if !collapsed {
                    self.selection.clone()
                } else {
                    let caret = self.focus();
                    let to = match (secondary, forward) {
                        (true, true) => end,
                        (true, false) => 0,
                        (false, forward) => self.step(caret, forward),
                    };
                    caret.min(to)..caret.max(to)
                };
                self.replace(Some(range), "");
            }
            "a" if secondary => {
                self.selection = 0..end;
                self.reversed = false;
            }
            _ => return false,
        }
        true
    }
}

#[derive(Clone, Debug, PartialEq)]
struct FormatToolbar {
    /// What the selection last reported; kept while the toolbar fades out.
    selection: SelectionFormat,
    link: Option<LinkBar>,
    presence: Presence,
    /// Screen-space box of the toolbar as last laid out.
    rect: Option<FlowRect>,
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
struct BlockDrag {
    block_id: String,
    slot: Option<DropSlot>,
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
    /// The editor's finished, formattable text selection, for frames.
    pub selection: Option<&'a SelectionFormat>,
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

    fn world_to_screen(&self, rect: &FlowRect) -> FlowRect {
        rect.translated(self.geometry.column_x, TOPBAR_HEIGHT - self.scroll_y)
    }

    fn screen_to_world(&self, x: f32, y: f32) -> (f32, f32) {
        (
            x - self.geometry.column_x,
            y - TOPBAR_HEIGHT + self.scroll_y,
        )
    }
}

fn is_heading(kind: FlowKind) -> bool {
    matches!(
        kind,
        FlowKind::Paragraph(
            ParagraphType::H1
                | ParagraphType::H2
                | ParagraphType::H3
                | ParagraphType::H4
                | ParagraphType::H5
                | ParagraphType::H6
        )
    )
}

/// Parent of block `id` and the block's index among the parent's children.
fn find_parent<'a>(node: &'a BlockNode, id: &str) -> Option<(&'a BlockNode, usize)> {
    if let Some(index) = node.children.iter().position(|child| child.id == id) {
        return Some((node, index));
    }
    node.children
        .iter()
        .find_map(|child| find_parent(child, id))
}

fn block_text(node: &BlockNode) -> Option<&RichText> {
    match &node.content {
        BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => Some(text),
        _ => None,
    }
}

fn text_len(scene: &OverlayScene<'_>, block_id: &str) -> usize {
    scene
        .snapshot
        .block(block_id)
        .and_then(block_text)
        .map_or(0, |text| text.plain.encode_utf16().count())
}

/// The block whose row the pointer is on, if any. The title is not a block of the flow.
fn hover_block(scene: &OverlayScene<'_>, x: f32, y: f32) -> Option<String> {
    if y < TOPBAR_HEIGHT || x < 0.0 || x >= scene.window.0 {
        return None;
    }
    let (_, world_y) = scene.screen_to_world(x, y);
    let mut best: Option<(f32, &FlowBlock)> = None;
    for block in &scene.layout.blocks {
        if block.body.kind == FlowKind::Title {
            continue;
        }
        let rect = block.rect();
        let distance = if world_y < rect.y {
            rect.y - world_y
        } else if world_y >= rect.bottom() {
            world_y - rect.bottom()
        } else {
            0.0
        };
        if distance <= HOVER_SLACK && best.is_none_or(|(nearest, _)| distance < nearest) {
            best = Some((distance, block));
        }
    }
    best.map(|(_, block)| block.block_id.clone())
}

/// World-space caret box of a UTF-16 offset in a block; the block's top-left corner for a
/// block without text.
fn caret_world_rect(layout: &FlowLayout, block_id: &str, utf16_offset: usize) -> Option<FlowRect> {
    let block = layout.block(block_id)?;
    Some(match &block.body.text {
        Some(text) => {
            let (x, line) = text.layout.caret(utf16_offset);
            let line_height = text.layout.line_height();
            FlowRect::new(
                block.x + text.x + x,
                block.y + text.y + line as f32 * line_height,
                1.0,
                line_height,
            )
        }
        None => FlowRect::new(block.x, block.y, 1.0, block.body.height.min(24.0)),
    })
}

fn bounding_rect(rects: &[FlowRect]) -> Option<FlowRect> {
    let first = rects.first()?;
    let (mut left, mut top, mut right, mut bottom) =
        (first.x, first.y, first.right(), first.bottom());
    for rect in &rects[1..] {
        left = left.min(rect.x);
        top = top.min(rect.y);
        right = right.max(rect.right());
        bottom = bottom.max(rect.bottom());
    }
    Some(FlowRect::new(left, top, right - left, bottom - top))
}

/// The nearest slot among the dragged block's siblings for a pointer at `world_y`.
fn drop_slot(scene: &OverlayScene<'_>, block_id: &str, world_y: f32) -> Option<DropSlot> {
    let root = scene.snapshot.root.as_ref()?;
    let (parent, old_index) = find_parent(root, block_id)?;
    let blocks = &scene.layout.blocks;
    // One pass over the layout, so a parent with thousands of children is no slower to
    // drag in than a short one.
    let laid_out: HashMap<&str, usize> = blocks
        .iter()
        .enumerate()
        .map(|(at, block)| (block.block_id.as_str(), at))
        .collect();
    // Siblings that are laid out, as (index among the parent's children, index in layout).
    let siblings: Vec<(usize, usize)> = parent
        .children
        .iter()
        .enumerate()
        .filter_map(|(raw, child)| laid_out.get(child.id.as_str()).map(|at| (raw, *at)))
        .collect();
    let &(_, first_at) = siblings.first()?;
    let &(last_raw, last_at) = siblings.last()?;
    let x = blocks[first_at].x;

    let mut candidates: Vec<(usize, f32)> = siblings
        .iter()
        .map(|&(raw, at)| {
            let top = blocks[at].y;
            let above = match at.checked_sub(1) {
                Some(previous) => blocks[previous].rect().bottom(),
                None => top,
            };
            (raw, ((above + top) / 2.0).round())
        })
        .collect();
    // Below the last sibling and everything nested under it.
    let mut end = last_at;
    while end + 1 < blocks.len() && blocks[end + 1].x > blocks[last_at].x {
        end += 1;
    }
    let bottom = blocks[end].rect().bottom();
    let below = blocks.get(end + 1).map_or(bottom + 10.0, |block| block.y);
    candidates.push((last_raw + 1, ((bottom + below) / 2.0).round()));

    let (insert_index, indicator_world_y) = candidates
        .into_iter()
        .min_by(|a, b| (a.1 - world_y).abs().total_cmp(&(b.1 - world_y).abs()))?;
    Some(DropSlot {
        parent_id: parent.id.clone(),
        insert_index,
        old_index,
        indicator_world_y,
        indicator_world_x: x,
    })
}

/// Text a keystroke types, if it types any. `secondary` is the platform's command
/// modifier.
fn typed_text(keystroke: &Keystroke, secondary: bool) -> Option<String> {
    let modifiers = &keystroke.modifiers;
    if secondary || modifiers.function {
        return None;
    }
    if let Some(text) = keystroke
        .key_char
        .as_ref()
        .filter(|text| !text.is_empty() && !text.chars().any(char::is_control))
    {
        return Some(text.clone());
    }
    let mut chars = keystroke.key.chars();
    match (chars.next(), chars.next()) {
        (Some(ch), None) if !modifiers.alt => Some(if modifiers.shift {
            ch.to_uppercase().collect()
        } else {
            ch.to_string()
        }),
        _ => None,
    }
}

/// A URL as typed, with `https://` in front when it names no scheme.
fn normalize_url(input: &str) -> String {
    let url = input.trim();
    if url.is_empty() || url.contains("://") || url.starts_with("mailto:") || url.starts_with('/') {
        url.to_string()
    } else {
        format!("https://{url}")
    }
}

/// Marks and alignment of one editor selection at one document revision.
type FormatCache = (
    u64,
    DocumentSelection,
    Option<(MarkState, Option<BlockAlign>)>,
);

/// Overlay and block-control state of the Page view.
#[derive(Default)]
pub struct Overlays {
    hovered: Option<String>,
    /// Whether the pointer is on the hovered block's drag handle itself.
    handle_hot: bool,
    slash: Option<SlashMenu>,
    toolbar: Option<FormatToolbar>,
    drag: Option<BlockDrag>,
    /// Chevrons in flight by block id: `0.0` collapsed to `1.0` expanded.
    chevrons: HashMap<String, EaseOut>,
    /// Sideways scroll of unwrapped code blocks by block id.
    code_scroll: HashMap<String, f32>,
    /// Code block whose copy button reads `Copied`, with the generation of its timer.
    copied: Option<(String, u64)>,
    copied_generation: u64,
    format_cache: Option<FormatCache>,
}

impl Overlays {
    pub fn new() -> Self {
        Self::default()
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
    pub(crate) fn link_field(&self) -> Option<&LinkBar> {
        self.open_toolbar()?.link.as_ref()
    }

    pub(crate) fn link_field_mut(&mut self) -> Option<&mut LinkBar> {
        self.open_toolbar_mut()?.link.as_mut()
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

    /// Sideways scroll of a code block.
    pub fn code_scroll_x(&self, block_id: &str) -> f32 {
        self.code_scroll.get(block_id).copied().unwrap_or(0.0)
    }

    /// The code blocks of `layout` that are scrolled sideways.
    pub(crate) fn scrolled_code(&self, layout: &FlowLayout) -> Vec<ScrolledCode> {
        self.code_scroll
            .iter()
            .filter_map(|(block_id, scroll)| {
                ScrolledCode::of_block(layout.block(block_id)?, *scroll)
            })
            .collect()
    }

    /// Scroll a code block sideways so the caret at `caret_x` (relative to its code area,
    /// unscrolled) is in view.
    pub(crate) fn reveal_code_x(&mut self, block_id: &str, caret_x: f32, code: CodeScroll) {
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
    pub(crate) fn copied_expired(&mut self, generation: u64) -> bool {
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

    /// Drop every popover, hover and gesture at once, e.g. when the page is hidden or
    /// replaced.
    pub fn reset(&mut self) {
        self.hovered = None;
        self.handle_hot = false;
        self.slash = None;
        self.toolbar = None;
        self.drag = None;
        self.chevrons.clear();
        self.format_cache = None;
    }

    fn open_toolbar(&self) -> Option<&FormatToolbar> {
        self.toolbar
            .as_ref()
            .filter(|toolbar| !toolbar.presence.closing)
    }

    fn open_toolbar_mut(&mut self) -> Option<&mut FormatToolbar> {
        self.toolbar
            .as_mut()
            .filter(|toolbar| !toolbar.presence.closing)
    }

    fn open_slash_mut(&mut self) -> Option<&mut SlashMenu> {
        self.slash.as_mut().filter(|menu| !menu.presence.closing)
    }

    /// Dismiss the slash menu. Returns whether one was open.
    pub(crate) fn close_slash(&mut self, now_ms: f64) -> bool {
        match self.open_slash_mut() {
            Some(menu) => {
                menu.presence.close(now_ms);
                true
            }
            None => false,
        }
    }

    /// The primary button went down on the page: the slash menu, the link field and a
    /// block drag end.
    pub(crate) fn pointer_pressed(&mut self, now_ms: f64) {
        self.close_slash(now_ms);
        self.close_link_field();
        self.drag = None;
    }

    /// Close the toolbar's link field without applying it.
    pub(crate) fn close_link_field(&mut self) {
        if let Some(toolbar) = self.toolbar.as_mut() {
            toolbar.link = None;
        }
    }

    /// Put pasted text into the link field, over its selection. Returns whether the
    /// field is open.
    pub(crate) fn link_insert(&mut self, text: &str) -> bool {
        match self.link_field_mut() {
            Some(link) => {
                link.replace(None, text);
                true
            }
            None => false,
        }
    }

    /// Bring the toolbar in line with the editor's selection: open over a finished,
    /// formattable selection while no slash menu is up, closed otherwise.
    fn sync_toolbar(&mut self, selection: Option<&SelectionFormat>, now_ms: f64) {
        let wanted = selection.filter(|_| self.slash_menu().is_none());
        match (wanted, self.toolbar.as_mut()) {
            (Some(selection), Some(toolbar)) => {
                toolbar.selection = selection.clone();
                toolbar.presence = toolbar.presence.reopened(now_ms);
            }
            (Some(selection), None) => {
                self.toolbar = Some(FormatToolbar {
                    selection: selection.clone(),
                    link: None,
                    presence: Presence::opening(now_ms),
                    rect: None,
                });
            }
            (None, Some(toolbar)) => {
                toolbar.link = None;
                toolbar.presence.close(now_ms);
            }
            (None, None) => {}
        }
    }

    fn open_slash(
        &mut self,
        block_id: String,
        utf16_offset: usize,
        anchor_world: Option<FlowRect>,
        in_document: bool,
        now_ms: f64,
    ) {
        let presence = match self.slash.take() {
            Some(menu) => menu.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.slash = Some(SlashMenu {
            block_id,
            utf16_offset,
            query: String::new(),
            selected: 0,
            query_in_document: in_document,
            anchor_world,
            scroll: 0.0,
            reveal_selected: true,
            presence,
            rect: None,
        });
    }

    /// Open the slash menu at a `/` the editor just typed into a block; the text after it
    /// is the filter.
    pub(crate) fn open_typed_slash(&mut self, block_id: String, slash_offset: usize, now_ms: f64) {
        self.open_slash(block_id, slash_offset, None, true, now_ms);
    }

    /// The `/` of the open menu now sits at `slash_offset` of its block, with `query` typed
    /// after it.
    pub(crate) fn set_typed_slash(&mut self, slash_offset: usize, query: String) {
        if let Some(menu) = self.open_slash_mut() {
            menu.utf16_offset = slash_offset;
        }
        self.set_slash_query(query, true);
    }

    /// Replace the open menu's filter.
    pub(crate) fn set_slash_query(&mut self, query: String, in_document: bool) -> bool {
        match self.open_slash_mut() {
            Some(menu) => {
                if menu.query != query || menu.query_in_document != in_document {
                    menu.query = query;
                    menu.query_in_document = in_document;
                    menu.selected = 0;
                    menu.reveal_selected = true;
                }
                true
            }
            None => false,
        }
    }

    /// Handle one event. `scene` is absent while no page is laid out; events that need the
    /// page are then dropped.
    pub fn handle(
        &mut self,
        event: OverlayEvent,
        scene: Option<&OverlayScene<'_>>,
        now_ms: f64,
    ) -> OverlayEffects {
        let mut effects = OverlayEffects::default();
        match event {
            OverlayEvent::PointerMoved { x, y, pressed } => {
                let Some(scene) = scene else {
                    return effects;
                };
                // The button was released where no release event reached the page.
                if !pressed && self.drag.take().is_some() {
                    effects.redraw = true;
                }
                if let Some(drag) = self.drag.as_mut() {
                    let (_, world_y) = scene.screen_to_world(x, y);
                    let slot = drop_slot(scene, &drag.block_id, world_y);
                    if slot != drag.slot {
                        drag.slot = slot;
                        effects.redraw = true;
                    }
                } else {
                    // A pointer on an open popover does not reach the blocks under it.
                    let shielded = [
                        self.slash_menu().and_then(|menu| menu.rect),
                        self.open_toolbar().and_then(|toolbar| toolbar.rect),
                    ]
                    .into_iter()
                    .flatten()
                    .any(|rect| rect.contains(x, y));
                    let hovered = if shielded {
                        self.hovered.clone()
                    } else {
                        hover_block(scene, x, y)
                    };
                    let (world_x, world_y) = scene.screen_to_world(x, y);
                    let handle_hot = !shielded
                        && hovered
                            .as_deref()
                            .and_then(|block_id| scene.layout.block(block_id))
                            .and_then(|block| drag_handle_rect(block, scene.geometry.column_x))
                            .is_some_and(|handle| handle.contains(world_x, world_y));
                    if hovered != self.hovered || handle_hot != self.handle_hot {
                        self.hovered = hovered;
                        self.handle_hot = handle_hot;
                        effects.redraw = true;
                    }
                }
            }
            OverlayEvent::PointerUp => {
                if let Some(drag) = self.drag.take() {
                    if let Some(slot) = drag.slot
                        && let Some(new_index) = slot.reorder_index()
                    {
                        effects.edits.push(DocEdit::Reorder {
                            parent_id: slot.parent_id,
                            child_id: drag.block_id,
                            new_index,
                        });
                    }
                    effects.redraw = true;
                }
            }
            OverlayEvent::OpenSlashMenu {
                block_id,
                utf16_offset,
                anchor,
            } => {
                let Some(scene) = scene else {
                    return effects;
                };
                if scene.layout.block(&block_id).is_none() {
                    return effects;
                }
                let anchor_world = anchor.map(|anchor| {
                    let (x, y) = scene.screen_to_world(anchor.x, anchor.y);
                    FlowRect::new(x, y, anchor.w, anchor.h)
                });
                let utf16_offset = utf16_offset.min(text_len(scene, &block_id));
                self.open_slash(block_id, utf16_offset, anchor_world, false, now_ms);
                effects.redraw = true;
            }
            OverlayEvent::SetSlashQuery { query, in_document } => {
                effects.redraw = self.set_slash_query(query, in_document);
            }
            OverlayEvent::CloseSlashMenu => {
                effects.redraw = self.close_slash(now_ms);
            }
            OverlayEvent::SlashHover(index) => {
                if let Some(menu) = self.open_slash_mut()
                    && menu.selected != index
                {
                    menu.selected = index;
                    effects.redraw = true;
                }
            }
            OverlayEvent::SlashExecute(index) => {
                self.execute_slash(Some(index), now_ms, &mut effects);
            }
            OverlayEvent::SlashScroll(delta) => {
                if let Some(menu) = self.open_slash_mut() {
                    // Clamped to the list when the menu is laid out.
                    menu.scroll = (menu.scroll - delta).max(0.0);
                    effects.redraw = true;
                }
            }
            // The selection is the editor's; the view sets it there.
            OverlayEvent::SetSelection(_) => {}
            OverlayEvent::Format(action) => self.format(action, &mut effects),
            OverlayEvent::LinkApply => self.apply_link(false, &mut effects),
            OverlayEvent::LinkRemove => self.apply_link(true, &mut effects),
            OverlayEvent::Paste(text) => effects.redraw = self.link_insert(&text),
            OverlayEvent::ToggleChecked(block_id) => {
                if let Some(scene) = scene
                    && let Some(BlockContent::List { checked, .. }) =
                        scene.snapshot.block(&block_id).map(|node| &node.content)
                {
                    effects.edits.push(DocEdit::SetProp {
                        block_id,
                        key: "prop:checked",
                        value: if *checked { Any::False } else { Any::True },
                    });
                }
            }
            OverlayEvent::ToggleCollapsed(block_id) => {
                let Some(scene) = scene else {
                    return effects;
                };
                let Some(node) = scene.snapshot.block(&block_id) else {
                    return effects;
                };
                // A toggle without children shows no state to turn between.
                let (collapsed, animated) = match &node.content {
                    BlockContent::List { collapsed, .. } => (*collapsed, !node.children.is_empty()),
                    BlockContent::Paragraph { collapsed, .. } => (*collapsed, true),
                    _ => return effects,
                };
                if animated {
                    let rest = |collapsed: bool| if collapsed { 0.0 } else { 1.0 };
                    let from = self
                        .chevrons
                        .get(&block_id)
                        .map_or(rest(collapsed), |motion| motion.value_at(now_ms));
                    self.chevrons.insert(
                        block_id.clone(),
                        EaseOut::new(from, rest(!collapsed), now_ms),
                    );
                }
                effects.edits.push(DocEdit::SetProp {
                    block_id,
                    key: "prop:collapsed",
                    value: if collapsed { Any::False } else { Any::True },
                });
            }
            OverlayEvent::CopyCode(block_id) => {
                if let Some(scene) = scene
                    && let Some(BlockContent::Code { text, .. }) =
                        scene.snapshot.block(&block_id).map(|node| &node.content)
                {
                    self.copied_generation += 1;
                    self.copied = Some((block_id, self.copied_generation));
                    effects.clipboard = Some(text.clone());
                    effects.copied_timer = Some(self.copied_generation);
                    effects.redraw = true;
                }
            }
            OverlayEvent::DragStart(block_id) => {
                self.close_slash(now_ms);
                self.close_link_field();
                self.drag = Some(BlockDrag {
                    block_id,
                    slot: None,
                });
                effects.redraw = true;
            }
        }
        effects
    }

    /// A key went down in the editor. The link field, while open, takes every key but the
    /// ones that type text, which reach it through the input handler; the slash menu takes
    /// its navigation keys, and the filter keys as well when the filter is its own rather
    /// than text in the document. `secondary` is the platform's command modifier.
    pub fn key_down(
        &mut self,
        keystroke: &Keystroke,
        secondary: bool,
        now_ms: f64,
    ) -> OverlayEffects {
        let mut effects = OverlayEffects::default();
        let key = keystroke.key.as_str();
        let shift = keystroke.modifiers.shift;

        if let Some(link) = self.link_field_mut() {
            if link.composing() {
                // The input method owns the keys of a composition; `Escape` abandons it.
                if key == "escape" {
                    link.mark(None, "", None);
                    effects.handled = true;
                    effects.redraw = true;
                }
                return effects;
            }
            effects.handled = true;
            effects.redraw = true;
            match key {
                "enter" => self.apply_link(false, &mut effects),
                "escape" => self.close_link_field(),
                "v" if secondary => effects.paste = true,
                "c" | "x" if secondary => {
                    if !link.selection.is_empty() {
                        effects.clipboard = Some(link.selected_text().to_string());
                        if key == "x" {
                            link.replace(None, "");
                        }
                    }
                }
                _ => {
                    if !link.key(key, shift, secondary)
                        && typed_text(keystroke, secondary).is_some()
                    {
                        // Typed text arrives through the input handler.
                        effects.handled = false;
                        effects.redraw = false;
                    }
                }
            }
            return effects;
        }

        let Some(menu) = self.open_slash_mut() else {
            return effects;
        };
        let count = filter_slash_items(&menu.query).len();
        effects.handled = true;
        effects.redraw = true;
        match key {
            // `Tab` and `Shift+Tab` step through the items like the arrows, and never
            // reach the block; `Enter` without a match closes the menu and does not split
            // the block.
            "down" | "up" | "tab" if count > 0 => {
                let back = key == "up" || (key == "tab" && shift);
                menu.selected = (menu.selected + if back { count - 1 } else { 1 }) % count;
                menu.reveal_selected = true;
            }
            "tab" => {}
            "enter" if count > 0 => self.execute_slash(None, now_ms, &mut effects),
            "enter" | "escape" => {
                self.close_slash(now_ms);
            }
            // Text typed after the `/` in the document is the editor's to edit, and with
            // no match left the arrows are the document's again.
            _ if menu.query_in_document => {
                effects.handled = false;
                effects.redraw = false;
            }
            "down" | "up" => {}
            "backspace" => {
                if menu.query.pop().is_none() {
                    self.close_slash(now_ms);
                } else {
                    menu.selected = 0;
                    menu.reveal_selected = true;
                }
            }
            _ => match typed_text(keystroke, secondary) {
                Some(text) => {
                    menu.query.push_str(&text);
                    menu.selected = 0;
                    menu.reveal_selected = true;
                }
                None => {
                    effects.handled = false;
                    effects.redraw = false;
                }
            },
        }
        effects
    }

    fn execute_slash(&mut self, index: Option<usize>, now_ms: f64, effects: &mut OverlayEffects) {
        let Some(menu) = self.slash_menu() else {
            return;
        };
        let items = filter_slash_items(&menu.query);
        let Some(item) = items.get(index.unwrap_or(menu.selected)) else {
            return;
        };
        effects.edits.push(DocEdit::Slash {
            block_id: menu.block_id.clone(),
            command: item.command,
            typed: menu.query_in_document,
        });
        self.close_slash(now_ms);
        effects.redraw = true;
    }

    fn format(&mut self, action: FormatAction, effects: &mut OverlayEffects) {
        let Some(toolbar) = self.open_toolbar_mut() else {
            return;
        };
        effects.redraw = true;
        if action == FormatAction::Link {
            toolbar.link = match toolbar.link {
                Some(_) => None,
                None => Some(LinkBar::new(
                    toolbar.selection.marks.link.clone().unwrap_or_default(),
                )),
            };
        } else if let Some(align) = action.align() {
            effects.edits.push(DocEdit::Align(align));
        } else if let Some(key) = action.mark_key() {
            effects.edits.push(DocEdit::Mark(key));
        }
    }

    /// Write the link field to the selection (or clear the selection's link) and close the
    /// field.
    fn apply_link(&mut self, remove: bool, effects: &mut OverlayEffects) {
        let Some(toolbar) = self.open_toolbar_mut() else {
            return;
        };
        let Some(link) = toolbar.link.take() else {
            return;
        };
        effects.redraw = true;
        let url = normalize_url(link.url());
        if remove {
            effects.edits.push(DocEdit::Link(None));
        } else if !url.is_empty() {
            effects.edits.push(DocEdit::Link(Some(url)));
        }
    }

    /// Scroll the unwrapped code block under a screen-space point sideways. Returns whether
    /// the scroll belonged to a code block (and must not scroll the page).
    pub fn scroll_code(
        &mut self,
        scene: &OverlayScene<'_>,
        x: f32,
        y: f32,
        delta_x: f32,
        delta_y: f32,
    ) -> bool {
        if delta_x == 0.0 || delta_x.abs() < delta_y.abs() {
            return false;
        }
        let (world_x, world_y) = scene.screen_to_world(x, y);
        for block in &scene.layout.blocks {
            let Some(code) = block.body.code_scroll else {
                continue;
            };
            if !block.rect().contains(world_x, world_y) {
                continue;
            }
            let current = self.code_scroll_x(&block.block_id);
            let next = (current - delta_x).clamp(0.0, code.max_x).round();
            self.code_scroll.insert(block.block_id.clone(), next);
            return true;
        }
        false
    }

    /// Drop state that no longer matches the page, and finished transitions.
    fn reconcile(&mut self, scene: &OverlayScene<'_>, now_ms: f64) {
        let layout = scene.layout;
        self.chevrons.retain(|block_id, motion| {
            !motion.is_finished(now_ms) && layout.block(block_id).is_some()
        });
        self.code_scroll.retain(|block_id, scroll| {
            match layout
                .block(block_id)
                .and_then(|block| block.body.code_scroll)
            {
                Some(code) => {
                    *scroll = scroll.clamp(0.0, code.max_x);
                    *scroll > 0.0
                }
                None => false,
            }
        });
        if self
            .hovered
            .as_ref()
            .is_some_and(|block_id| layout.block(block_id).is_none())
        {
            self.hovered = None;
        }
        if self
            .drag
            .as_ref()
            .is_some_and(|drag| layout.block(&drag.block_id).is_none())
        {
            self.drag = None;
        }
        if self
            .copied
            .as_ref()
            .is_some_and(|(block_id, _)| layout.block(block_id).is_none())
        {
            self.copied = None;
        }
        if self.slash.as_ref().is_some_and(|menu| {
            menu.presence.gone(now_ms) || layout.block(&menu.block_id).is_none()
        }) {
            self.slash = None;
        }
        self.sync_toolbar(scene.selection, now_ms);
        if self
            .toolbar
            .as_ref()
            .is_some_and(|toolbar| toolbar.presence.gone(now_ms))
        {
            self.toolbar = None;
        }
    }

    fn in_flight(&self, now_ms: f64) -> bool {
        !self.chevrons.is_empty()
            || self
                .slash
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
            || self.toolbar.as_ref().is_some_and(|toolbar| {
                toolbar.presence.in_flight(now_ms) || toolbar.presence.closing
            })
    }

    /// Build what the overlays draw inside the page viewport, in the viewport element's
    /// coordinates and above every block: block controls, the drag handle and the drop
    /// indicator. Also returns the per-block paint state of the frame.
    pub fn page_layer(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<PlaygroundView>,
    ) -> (PagePaint, Vec<AnyElement>) {
        self.reconcile(scene, now_ms);
        if self.in_flight(now_ms) {
            window.request_animation_frame();
        }

        let mut paint = PagePaint::default();
        for (block_id, motion) in &self.chevrons {
            paint.blocks.entry(block_id.clone()).or_default().chevron =
                Some(motion.value_at(now_ms) as f32);
        }
        for (block_id, scroll) in &self.code_scroll {
            paint
                .blocks
                .entry(block_id.clone())
                .or_default()
                .code_scroll_x = *scroll;
        }

        let viewport = scene.page_viewport();
        let layout = scene.layout;
        let mut elements = Vec::new();

        // The block being dragged is tinted where it still sits.
        if let Some(block) = self
            .drag
            .as_ref()
            .and_then(|drag| layout.block(&drag.block_id))
        {
            let rect = block.rect();
            if viewport.intersects(&rect) {
                elements.push(
                    place(viewport.to_local(&rect))
                        .rounded(px(4.0))
                        .bg(palette.hover)
                        .into_any_element(),
                );
            }
        }

        let hover_filled = palette
            .theme
            .css_var("--affine-hover-color-filled")
            .unwrap_or(palette.background_secondary);
        for block in &layout.blocks {
            let rect = block.rect();
            if !viewport.intersects(&rect) {
                continue;
            }
            let hovered = self.hovered.as_deref() == Some(block.block_id.as_str());
            match block.body.kind {
                FlowKind::List(kind @ (ListType::Todo | ListType::Toggle)) => {
                    let Some(prefix) = block.body.prefix else {
                        continue;
                    };
                    let target = FlowRect::new(
                        rect.x,
                        rect.y + prefix.y + (prefix.h - CONTROL_HIT_SIZE) / 2.0,
                        CONTROL_HIT_SIZE,
                        CONTROL_HIT_SIZE,
                    );
                    let (suffix, event) = match kind {
                        ListType::Todo => (
                            "checkbox",
                            OverlayEvent::ToggleChecked(block.block_id.clone()),
                        ),
                        _ => (
                            "toggle",
                            OverlayEvent::ToggleCollapsed(block.block_id.clone()),
                        ),
                    };
                    let mut element = place(viewport.to_local(&target))
                        .id(SharedString::from(format!("{suffix}-{}", block.block_id)))
                        .cursor_pointer()
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    if viewport.fully_visible(&target) {
                        element = element.snapshot(
                            SharedString::from(format!("{}.{suffix}", block.snapshot_id)),
                            Some(PAGE_SURFACE_ID),
                        );
                    }
                    elements.push(element.into_any_element());
                }
                kind if is_heading(kind) => {
                    // A collapsed heading paints its own marker; an expanded one shows a
                    // chevron only while the pointer is on its row or while it turns.
                    let own_marker = block.body.chevron();
                    let turning = paint
                        .blocks
                        .get(&block.block_id)
                        .and_then(|state| state.chevron);
                    if own_marker.is_none() && !hovered && turning.is_none() {
                        continue;
                    }
                    let FlowKind::Paragraph(paragraph) = kind else {
                        continue;
                    };
                    let marker = heading_marker_rect(paragraph_spec(paragraph).line_height);
                    let target = FlowRect::new(
                        rect.x + marker.x + (marker.w - CONTROL_HIT_SIZE) / 2.0,
                        rect.y + marker.y + (marker.h - CONTROL_HIT_SIZE) / 2.0,
                        CONTROL_HIT_SIZE,
                        CONTROL_HIT_SIZE,
                    );
                    let event = OverlayEvent::ToggleCollapsed(block.block_id.clone());
                    let mut element = place(viewport.to_local(&target))
                        .id(SharedString::from(format!("collapse-{}", block.block_id)))
                        .cursor_pointer()
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    if viewport.fully_visible(&target) {
                        element = element.snapshot(
                            SharedString::from(format!("{}.collapse", block.snapshot_id)),
                            Some(PAGE_SURFACE_ID),
                        );
                    }
                    if own_marker.is_none() {
                        let progress = turning.unwrap_or(1.0);
                        let color = palette.icon;
                        let inset = (CONTROL_HIT_SIZE - marker.w) / 2.0;
                        element = element.child(
                            canvas(
                                |_, _, _| (),
                                move |bounds, _, window, cx| {
                                    let glyph = ui::Bounds::new(
                                        point(
                                            bounds.origin.x + px(inset),
                                            bounds.origin.y + px(inset),
                                        ),
                                        size(px(marker.w), px(marker.h)),
                                    );
                                    paint_chevron(glyph, progress, color, window, cx);
                                },
                            )
                            .size_full(),
                        );
                    }
                    elements.push(element.into_any_element());
                }
                FlowKind::Code => {
                    let copied = self.copied_block() == Some(block.block_id.as_str());
                    if !hovered && !copied {
                        continue;
                    }
                    let width = if copied {
                        COPIED_LABEL_WIDTH
                    } else {
                        COPY_BUTTON_SIZE
                    };
                    let target = FlowRect::new(
                        rect.right() - COPY_BUTTON_INSET - width,
                        rect.y + COPY_BUTTON_INSET,
                        width,
                        COPY_BUTTON_SIZE,
                    );
                    let event = OverlayEvent::CopyCode(block.block_id.clone());
                    let mut element = place(viewport.to_local(&target))
                        .id(SharedString::from(format!("copy-{}", block.block_id)))
                        .rounded(px(CODE_RADIUS - COPY_BUTTON_INSET))
                        .bg(palette.background)
                        .border_1()
                        .border_color(palette.border)
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .hover(move |style| style.bg(hover_filled))
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
                    if viewport.fully_visible(&target) {
                        element = element
                            .snapshot(
                                SharedString::from(format!("{}.copy", block.snapshot_id)),
                                Some(PAGE_SURFACE_ID),
                            )
                            .snapshot_focused(copied)
                            .snapshot_text(if copied { "Copied" } else { "Copy" });
                    }
                    let element = if copied {
                        element
                            .text_size(px(TYPOGRAPHY.font_xs_px))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(palette.text_secondary)
                            .child("Copied")
                    } else {
                        element.child(icon("CopyIcon", 16.0, palette.icon))
                    };
                    elements.push(element.into_any_element());
                }
                _ => {}
            }
        }

        // Gutter handle of the hovered block, or of the block being dragged.
        let dragging = self.drag.is_some();
        let handle_block = self
            .drag
            .as_ref()
            .map(|drag| drag.block_id.as_str())
            .or(self.hovered.as_deref())
            .and_then(|block_id| layout.block(block_id));
        if let Some(block) = handle_block
            && let Some(target) = drag_handle_rect(block, scene.geometry.column_x)
            && viewport.intersects(&target)
        {
            let block_id = block.block_id.clone();
            let mut element = place(viewport.to_local(&target))
                .id("drag-handle")
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |view, _: &MouseDownEvent, window, cx| {
                        view.dispatch_overlay(
                            OverlayEvent::DragStart(block_id.clone()),
                            window,
                            cx,
                        );
                        cx.stop_propagation();
                    }),
                );
            element = if dragging {
                element.cursor_grabbing()
            } else {
                element.cursor_grab()
            };
            if viewport.fully_visible(&target) {
                element = element
                    .snapshot("overlay.drag_handle", Some(PAGE_SURFACE_ID))
                    .snapshot_focused(dragging)
                    .snapshot_text(block.block_id.clone());
            }
            // BlockSuite's grabber: an upright bar while the pointer is on the block, and
            // two columns of dots on a pill once it is on the handle or drags it.
            let theme = palette.theme;
            let grip = if dragging || self.handle_hot {
                let dots = theme
                    .css_var("--affine-v2-icon-secondary")
                    .unwrap_or(palette.icon);
                div()
                    .flex_none()
                    .w(px(DRAG_DOTS_PILL_WIDTH))
                    .h(px(DRAG_HANDLE_SIZE))
                    .rounded(px(4.0))
                    .bg(theme
                        .css_var("--affine-v2-layer-background-hoverOverlay")
                        .unwrap_or(palette.hover))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        canvas(
                            |_, _, _| (),
                            move |bounds, _, window, _| {
                                for row in 0..3 {
                                    for column in 0..2 {
                                        let step = DRAG_DOT + DRAG_DOT_GAP;
                                        let dot = ui::Bounds::new(
                                            point(
                                                bounds.origin.x + px(column as f32 * step),
                                                bounds.origin.y + px(row as f32 * step),
                                            ),
                                            size(px(DRAG_DOT), px(DRAG_DOT)),
                                        );
                                        window.paint_quad(
                                            ui::fill(dot, dots).corner_radii(px(DRAG_DOT / 2.0)),
                                        );
                                    }
                                }
                            },
                        )
                        .flex_none()
                        .w(px(2.0 * DRAG_DOT + DRAG_DOT_GAP))
                        .h(px(3.0 * DRAG_DOT + 2.0 * DRAG_DOT_GAP)),
                    )
            } else {
                div()
                    .flex_none()
                    .w(px(DRAG_GRABBER_WIDTH))
                    .h(px(DRAG_GRABBER_HEIGHT))
                    .rounded(px(1.0))
                    .bg(palette.placeholder)
            };
            elements.push(element.child(grip).into_any_element());
        }

        if let Some(slot) = self.drop_slot() {
            let line = FlowRect::new(
                slot.indicator_world_x,
                slot.indicator_world_y - DROP_INDICATOR_THICKNESS / 2.0,
                (layout.width - slot.indicator_world_x).max(0.0),
                DROP_INDICATOR_THICKNESS,
            );
            if viewport.intersects(&line) {
                let mut element = place(viewport.to_local(&line))
                    .rounded(px(DROP_INDICATOR_THICKNESS / 2.0))
                    .bg(palette.brand);
                if viewport.fully_visible(&line) {
                    element = element.snapshot("overlay.drop_indicator", Some(PAGE_SURFACE_ID));
                }
                elements.push(element.into_any_element());
            }
        }

        (paint, elements)
    }

    /// Build the screen-space popovers, positioned in window coordinates: the slash menu
    /// and the formatting toolbar. Call after [`Overlays::page_layer`] in the same frame.
    pub fn popovers(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<PlaygroundView>,
    ) -> Vec<AnyElement> {
        let mut elements = Vec::new();
        elements.extend(self.render_toolbar(scene, palette, now_ms, window, cx));
        elements.extend(self.render_slash(scene, palette, now_ms, cx));
        elements
    }

    fn render_slash(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        cx: &mut Context<PlaygroundView>,
    ) -> Option<AnyElement> {
        let menu = self.slash.as_mut()?;
        menu.rect = None;
        let progress = menu.presence.progress(now_ms);
        if menu.presence.closing && progress <= 0.0 {
            return None;
        }
        let interactive = !menu.presence.closing;
        let progress = if interactive {
            progress.max(0.01)
        } else {
            progress
        };
        let anchor_world = menu
            .anchor_world
            .or_else(|| caret_world_rect(scene.layout, &menu.block_id, menu.utf16_offset))?;
        if !scene.page_viewport().intersects(&anchor_world) {
            return None;
        }
        let anchor = scene.world_to_screen(&anchor_world);
        let viewport = scene.popover_viewport();

        let items = filter_slash_items(&menu.query);
        menu.selected = menu.selected.min(items.len().saturating_sub(1));
        let (rows, content_height) = slash_rows(&items);
        let show_query = !menu.query_in_document;
        let chrome = 2.0 * SLASH_MENU_PADDING + if show_query { SLASH_QUERY_HEIGHT } else { 0.0 };

        // As tall as the content up to the cap; shorter when neither side has the room.
        let desired = chrome + content_height.min(SLASH_LIST_MAX_HEIGHT);
        let room = |edge: f32| (edge - POPOVER_GAP - POPOVER_EDGE_MARGIN).floor();
        let room_below = room(viewport.bottom() - anchor.bottom());
        let room_above = room(anchor.y - viewport.y);
        let height = if desired <= room_below || desired <= room_above {
            desired
        } else {
            desired
                .min(room_below.max(room_above))
                .max(chrome + SLASH_ITEM_HEIGHT)
        };
        let width = SLASH_MENU_WIDTH
            .min(viewport.w - 2.0 * POPOVER_EDGE_MARGIN)
            .max(0.0)
            .floor();
        let placed = place_popover(
            anchor,
            (width, height),
            viewport,
            Placement::BelowStart,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );

        menu.rect = Some(placed.rect);

        let list_width = width - 2.0 * SLASH_MENU_PADDING;
        let list_height = height - chrome;
        let max_scroll = (content_height - list_height).max(0.0);
        if std::mem::take(&mut menu.reveal_selected)
            && let Some((_, y, row_height)) = rows
                .iter()
                .find(|(row, _, _)| *row == SlashRow::Item(menu.selected))
        {
            if menu.selected == 0 {
                // The first item comes with its group header.
                menu.scroll = 0.0;
            } else if *y < menu.scroll {
                menu.scroll = *y;
            } else if y + row_height > menu.scroll + list_height {
                menu.scroll = y + row_height - list_height;
            }
        }
        menu.scroll = menu.scroll.clamp(0.0, max_scroll).round();
        let scroll = menu.scroll;
        let selected = menu.selected;

        // A scrolling list keeps a gutter at its right edge for the scroll thumb.
        let row_width = if max_scroll > 0.0 {
            list_width - SLASH_SCROLL_GUTTER
        } else {
            list_width
        };
        let mut list = div()
            .relative()
            .flex_none()
            .w(px(list_width))
            .h(px(list_height))
            .overflow_hidden();
        for (row, y, row_height) in rows {
            let top = y - scroll;
            if top + row_height <= 0.0 || top >= list_height {
                continue;
            }
            let fully_visible = top >= 0.0 && top + row_height <= list_height;
            let base = div()
                .absolute()
                .left(px(0.0))
                .top(px(top))
                .w(px(row_width))
                .h(px(row_height))
                .px(px(8.0))
                .flex()
                .items_center();
            match row {
                SlashRow::Header(group) => {
                    let mut header = base
                        .text_size(px(TYPOGRAPHY.font_xs_px))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(palette.text_secondary);
                    if fully_visible {
                        header = header
                            .snapshot(
                                SharedString::from(format!(
                                    "overlay.slash_menu.group.{}",
                                    group.to_lowercase()
                                )),
                                Some("overlay.slash_menu"),
                            )
                            .snapshot_text(group);
                    }
                    list = list.child(header.child(group));
                }
                SlashRow::Empty => {
                    let mut empty = base
                        .text_size(px(TYPOGRAPHY.font_sm_px))
                        .text_color(palette.text_secondary);
                    if fully_visible {
                        empty = empty
                            .snapshot("overlay.slash_menu.empty", Some("overlay.slash_menu"))
                            .snapshot_text("No results");
                    }
                    list = list.child(empty.child("No results"));
                }
                SlashRow::Item(index) => {
                    let item = items[index];
                    let active = index == selected;
                    let mut element = base
                        .id(SharedString::from(format!("slash-item-{}", item.id)))
                        .rounded(px(SLASH_MENU_RADIUS - SLASH_MENU_PADDING))
                        .gap(px(SLASH_ICON_GAP))
                        .text_size(px(TYPOGRAPHY.font_sm_px))
                        .text_color(palette.text_primary)
                        .when(active, |row| row.bg(palette.hover));
                    if interactive {
                        element = element
                            .cursor_pointer()
                            .on_mouse_move(emit(cx, move |_: &MouseMoveEvent| {
                                OverlayEvent::SlashHover(index)
                            }))
                            .on_click(emit(cx, move |_: &ClickEvent| {
                                OverlayEvent::SlashExecute(index)
                            }));
                    }
                    if fully_visible {
                        element = element
                            .snapshot(
                                SharedString::from(format!("overlay.slash_menu.item.{}", item.id)),
                                Some("overlay.slash_menu"),
                            )
                            .snapshot_focused(active)
                            .snapshot_text(item.title);
                    }
                    list = list.child(
                        element
                            .child(
                                div()
                                    .flex_none()
                                    .w(px(SLASH_ICON_BOX))
                                    .h(px(SLASH_ICON_BOX))
                                    .rounded(px(4.0))
                                    .bg(palette.panel)
                                    .border_1()
                                    .border_color(palette.border)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(icon(item.icon, 20.0, palette.icon)),
                            )
                            .child(item.title),
                    );
                }
            }
        }

        if max_scroll > 0.0 {
            // Scroll thumb: where the visible rows sit in the whole list.
            let thumb_height = (list_height * list_height / content_height)
                .max(24.0)
                .round();
            let thumb_top = ((list_height - thumb_height) * scroll / max_scroll).round();
            list = list.child(
                div()
                    .absolute()
                    .left(px(list_width - 4.0))
                    .top(px(thumb_top))
                    .w(px(3.0))
                    .h(px(thumb_height))
                    .rounded(px(1.5))
                    .bg(palette.text_secondary.opacity(0.35)),
            );
        }

        let mut root = place(placed.rect)
            .id("slash-menu")
            .flex()
            .flex_col()
            .p(px(SLASH_MENU_PADDING))
            .rounded(px(SLASH_MENU_RADIUS))
            .bg(palette.panel)
            .shadow(
                palette
                    .theme
                    .shadows("--affine-overlay-panel-shadow")
                    .into(),
            )
            .opacity(progress)
            .snapshot("overlay.slash_menu", Some("root.canvas"))
            .snapshot_focused(interactive)
            .snapshot_text(menu.query.clone());
        if interactive {
            root = root
                .occlude()
                .on_scroll(emit(cx, |event: &ScrollEvent| {
                    OverlayEvent::SlashScroll(f32::from(event.delta.pixel_delta(px(20.0)).y))
                }))
                .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| OverlayEvent::CloseSlashMenu));
        }
        if show_query {
            let (text, color) = if menu.query.is_empty() {
                ("Type to filter".to_string(), palette.placeholder)
            } else {
                (format!("/{}", menu.query), palette.text_primary)
            };
            root = root.child(
                div()
                    .flex_none()
                    .w(px(list_width))
                    .h(px(SLASH_QUERY_HEIGHT))
                    .px(px(8.0))
                    .flex()
                    .items_center()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_size(px(TYPOGRAPHY.font_xs_px))
                    .text_color(color)
                    .snapshot("overlay.slash_menu.query", Some("overlay.slash_menu"))
                    .snapshot_text(menu.query.clone())
                    .child(text),
            );
        }
        Some(root.child(list).into_any_element())
    }

    fn render_toolbar(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<PlaygroundView>,
    ) -> Option<AnyElement> {
        let toolbar = self.toolbar.as_mut()?;
        toolbar.rect = None;
        let progress = toolbar.presence.progress(now_ms);
        if toolbar.presence.closing && progress <= 0.0 {
            return None;
        }
        let interactive = !toolbar.presence.closing;
        let progress = if interactive {
            progress.max(0.01)
        } else {
            progress
        };
        if !scene
            .page_viewport()
            .intersects(&toolbar.selection.anchor_world)
        {
            return None;
        }
        let anchor = scene.world_to_screen(&toolbar.selection.anchor_world);
        let marks = toolbar.selection.marks.clone();
        let align = toolbar.selection.align;

        let buttons = FormatAction::ALL.len() as f32;
        let inner_width =
            buttons * TOOLBAR_BUTTON + buttons * TOOLBAR_GAP + 1.0 + 2.0 * TOOLBAR_SEPARATOR_MARGIN;
        let chrome = 2.0 * (TOOLBAR_PADDING + POPOVER_BORDER);
        let width = inner_width + chrome;
        let rows = if toolbar.link.is_some() { 2.0 } else { 1.0 };
        let height = rows * TOOLBAR_BUTTON + (rows - 1.0) * TOOLBAR_ROW_GAP + chrome;
        let placed = place_popover(
            anchor,
            (width, height),
            scene.popover_viewport(),
            Placement::Above,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );
        toolbar.rect = Some(placed.rect);
        // The link field sits in the second row, inset like the pills above it.
        let field_width =
            inner_width - TOOLBAR_GAP - LINK_APPLY_WIDTH - LINK_REMOVE_WIDTH - 2.0 * LINK_GAP;
        if let Some(link) = toolbar.link.as_mut() {
            let inset = POPOVER_BORDER + TOOLBAR_PADDING;
            link.bounds = Some(FlowRect::new(
                placed.rect.x + inset + TOOLBAR_GAP / 2.0,
                placed.rect.y + inset + TOOLBAR_BUTTON + TOOLBAR_ROW_GAP,
                field_width,
                TOOLBAR_BUTTON,
            ));
        }

        let radius = TOOLBAR_RADIUS - TOOLBAR_PADDING;
        let hover = palette.hover;
        let active_wash = palette.brand.opacity(0.12);
        // Buttons sit edge to edge so the pointer never falls between two of them; each
        // shows a pill one gap narrower than its hit target.
        let mut row = div()
            .flex_none()
            .w(px(inner_width))
            .h(px(TOOLBAR_BUTTON))
            .flex()
            .items_center();
        for action in FormatAction::ALL {
            if action == FormatAction::AlignLeft {
                row = row.child(
                    div()
                        .flex_none()
                        .w(px(1.0))
                        .h(px(16.0))
                        .mx(px(TOOLBAR_SEPARATOR_MARGIN))
                        .bg(palette.border),
                );
            }
            let active = match action {
                FormatAction::Link => marks.link.is_some() || toolbar.link.is_some(),
                _ => match (action.mark_key(), action.align()) {
                    (Some(key), _) => marks.has(key),
                    (_, Some(wanted)) => Some(wanted) == align,
                    _ => false,
                },
            };
            let ink = if active { palette.brand } else { palette.icon };
            let group = SharedString::from(format!("format-{}", action.id()));
            let mut pill = div()
                .flex_none()
                .w(px(TOOLBAR_BUTTON))
                .h(px(TOOLBAR_BUTTON))
                .rounded(px(radius))
                .flex()
                .items_center()
                .justify_center()
                .when(active, |pill| pill.bg(active_wash));
            let mut button = div()
                .id(action.id())
                .group(group.clone())
                .flex_none()
                .w(px(TOOLBAR_BUTTON + TOOLBAR_GAP))
                .h(px(TOOLBAR_BUTTON))
                .rounded(px(radius))
                .flex()
                .items_center()
                .justify_center()
                .snapshot(
                    SharedString::from(format!("overlay.format_toolbar.{}", action.id())),
                    Some("overlay.format_toolbar"),
                )
                .snapshot_focused(active)
                .snapshot_text(action.label());
            if interactive {
                pill = pill.group_hover(group, move |style| style.bg(hover));
                button = button
                    .cursor_pointer()
                    .on_click(emit(cx, move |_: &ClickEvent| OverlayEvent::Format(action)));
            }
            row = row.child(button.child(match (action.icon(), action.align()) {
                (Some(name), _) => pill.child(icon(name, 20.0, ink)),
                (None, align) => pill.child(align_glyph(align.unwrap_or(BlockAlign::Left), ink)),
            }));
        }

        let mut root = place(placed.rect)
            .id("format-toolbar")
            .flex()
            .flex_col()
            .gap(px(TOOLBAR_ROW_GAP))
            .p(px(TOOLBAR_PADDING))
            .rounded(px(TOOLBAR_RADIUS))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .shadow(palette.theme.shadows("--affine-toolbar-shadow").into())
            .opacity(progress)
            .snapshot("overlay.format_toolbar", Some("root.canvas"))
            .snapshot_focused(interactive)
            .child(row);
        if interactive {
            root = root.occlude();
        }

        if let Some(link) = &toolbar.link {
            // The field's inner box: its text, the selection or composition under it and
            // the caret, scrolled sideways just far enough to keep the caret in sight.
            let text_room = field_width - 2.0 * (8.0 + POPOVER_BORDER);
            let inner_height = TOOLBAR_BUTTON - 2.0 * POPOVER_BORDER;
            let caret_height = 16.0;
            let caret_top = (inner_height - caret_height) / 2.0;
            let text = link.text();
            let (selection, reversed) = link.shown_selection();
            let marked = link.marked_range();
            let mut font = ui::font(FONT_SANS);
            font.weight = FontWeight::NORMAL;
            let shown = SharedString::from(text.clone());
            let line = window.text_system().shape_line(
                shown.clone(),
                px(TYPOGRAPHY.font_xs_px),
                &[TextRun {
                    len: shown.len(),
                    font,
                    color: palette.text_primary,
                    background_color: None,
                    underline: None,
                    strikethrough: None,
                }],
                None,
            );
            let x_at = |offset: usize| f32::from(line.x_for_index(utf16_to_byte(&text, offset)));
            let text_width = f32::from(line.width());
            let caret_x = x_at(if reversed {
                selection.start
            } else {
                selection.end
            });
            let scroll = if text_width + 1.0 <= text_room {
                0.0
            } else {
                (caret_x + 1.0 - text_room)
                    .clamp(0.0, text_width + 1.0 - text_room)
                    .round()
            };
            let mut inner = div()
                .relative()
                .flex_none()
                .w(px(text_room))
                .h(px(inner_height))
                .overflow_hidden();
            let strip = |from: usize, to: usize, top: f32, height: f32, color: Hsla| {
                div()
                    .absolute()
                    .left(px((x_at(from) - scroll).round()))
                    .top(px(top))
                    .w(px((x_at(to) - x_at(from)).round().max(1.0)))
                    .h(px(height))
                    .bg(color)
            };
            if marked.is_none() && !selection.is_empty() {
                inner = inner.child(strip(
                    selection.start,
                    selection.end,
                    caret_top,
                    caret_height,
                    palette.brand.opacity(0.22),
                ));
            }
            let caption = |left: f32, color: Hsla, text: SharedString| {
                div()
                    .absolute()
                    .left(px(left))
                    .top(px(0.0))
                    .h(px(inner_height))
                    .flex()
                    .items_center()
                    .whitespace_nowrap()
                    .text_color(color)
                    .child(text)
            };
            inner = inner.child(if text.is_empty() {
                caption(1.0, palette.placeholder, "Paste or type a link".into())
            } else {
                caption(-scroll, palette.text_primary, shown)
            });
            if let Some(marked) = &marked {
                // A composition is underlined, like in the document.
                inner = inner.child(strip(
                    marked.start,
                    marked.end,
                    caret_top + caret_height - 1.0,
                    1.0,
                    palette.text_secondary,
                ));
            }
            inner = inner.child(
                div()
                    .absolute()
                    .left(px((caret_x - scroll).round()))
                    .top(px(caret_top))
                    .w(px(1.0))
                    .h(px(caret_height))
                    .bg(palette.text_primary),
            );
            let field = div()
                .flex_none()
                .w(px(field_width))
                .h(px(TOOLBAR_BUTTON))
                .px(px(8.0))
                .rounded(px(radius))
                .bg(palette.background)
                .border_1()
                .border_color(palette.brand)
                .flex()
                .items_center()
                .overflow_hidden()
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .snapshot(
                    "overlay.format_toolbar.link_input",
                    Some("overlay.format_toolbar"),
                )
                .snapshot_focused(true)
                .snapshot_text(text.clone())
                .child(inner);
            // `Remove` starts right where `Apply` ends, with its pill one gap further in.
            let label = |width: f32| {
                div()
                    .flex_none()
                    .w(px(width))
                    .h(px(TOOLBAR_BUTTON))
                    .rounded(px(radius))
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(TYPOGRAPHY.font_xs_px))
                    .font_weight(FontWeight::MEDIUM)
            };
            let mut apply = label(LINK_APPLY_WIDTH)
                .id("link_apply")
                .bg(palette.brand)
                .text_color(palette.on_accent)
                .snapshot(
                    "overlay.format_toolbar.link_apply",
                    Some("overlay.format_toolbar"),
                )
                .snapshot_text("Apply")
                .child("Apply");
            let mut remove_pill = label(LINK_REMOVE_WIDTH)
                .text_color(palette.text_secondary)
                .child("Remove");
            let mut remove = div()
                .id("link_remove")
                .group("link-remove")
                .flex_none()
                .w(px(LINK_REMOVE_WIDTH + LINK_GAP))
                .h(px(TOOLBAR_BUTTON))
                .pl(px(LINK_GAP))
                .rounded(px(radius))
                .snapshot(
                    "overlay.format_toolbar.link_remove",
                    Some("overlay.format_toolbar"),
                )
                .snapshot_text("Remove");
            if interactive {
                apply = apply
                    .cursor_pointer()
                    .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::LinkApply));
                remove_pill = remove_pill.group_hover("link-remove", move |style| style.bg(hover));
                remove = remove
                    .cursor_pointer()
                    .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::LinkRemove));
            }
            root = root.child(
                div()
                    .flex_none()
                    .w(px(inner_width))
                    .h(px(TOOLBAR_BUTTON))
                    .px(px(TOOLBAR_GAP / 2.0))
                    .flex()
                    .items_center()
                    .child(field.mr(px(LINK_GAP)))
                    .child(apply)
                    .child(remove.child(remove_pill)),
            );
        }
        Some(root.into_any_element())
    }
}

/// Hit target of a block's gutter handle in world space, `None` where the gutter has no
/// room for it. The handle hangs left of the block on its first line; a heading keeps the
/// place next to its text for its collapse chevron, so its handle sits one step further
/// out and is left away where the gutter is too narrow for both.
fn drag_handle_rect(block: &FlowBlock, column_x: f32) -> Option<FlowRect> {
    let body = &block.body;
    if body.kind == FlowKind::Title {
        return None;
    }
    let center_y = match &body.text {
        Some(text) if body.kind != FlowKind::Code => text.y + text.layout.line_height() / 2.0,
        _ => (body.height / 2.0).min(18.0),
    };
    let heading = is_heading(body.kind);
    let wanted = block.x - DRAG_HANDLE_SIZE - if heading { CONTROL_HIT_SIZE } else { 0.0 };
    // `DRAG_HANDLE_MIN_X` is a screen coordinate; the world starts at `column_x`.
    let min_x = DRAG_HANDLE_MIN_X - column_x;
    if heading && wanted < min_x {
        return None;
    }
    Some(FlowRect::new(
        wanted.max(min_x),
        (block.y + center_y - DRAG_HANDLE_SIZE / 2.0).round(),
        DRAG_HANDLE_SIZE,
        DRAG_HANDLE_SIZE,
    ))
}

/// An absolutely positioned box at `rect`.
fn place(rect: FlowRect) -> Div {
    div()
        .absolute()
        .left(px(rect.x))
        .top(px(rect.y))
        .w(px(rect.w))
        .h(px(rect.h))
}

/// A generated icon as a fixed-size element.
fn icon(name: &'static str, side: f32, color: Hsla) -> impl IntoElement {
    let icon = IconPaint::named(name);
    canvas(
        |_, _, _| (),
        move |bounds, _, window, cx| icon.paint(bounds, color, window, cx),
    )
    .flex_none()
    .w(px(side))
    .h(px(side))
}

/// Text alignment glyph: four bars, the short ones on the side the text aligns to.
fn align_glyph(align: BlockAlign, color: Hsla) -> impl IntoElement {
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            const LONG: f32 = 14.0;
            const SHORT: f32 = 8.0;
            for (index, width) in [LONG, SHORT, LONG, SHORT].into_iter().enumerate() {
                let x = 3.0
                    + match align {
                        BlockAlign::Left => 0.0,
                        BlockAlign::Center => (LONG - width) / 2.0,
                        BlockAlign::Right => LONG - width,
                    };
                let bar = ui::Bounds::new(
                    point(
                        bounds.origin.x + px(x),
                        bounds.origin.y + px(3.5 + index as f32 * 4.0),
                    ),
                    size(px(width), px(1.5)),
                );
                window.paint_quad(ui::fill(bar, color).corner_radii(px(0.75)));
            }
        },
    )
    .flex_none()
    .w(px(20.0))
    .h(px(20.0))
}

/// A listener that turns an input event into an [`OverlayEvent`] for the view.
fn emit<E: 'static>(
    cx: &Context<PlaygroundView>,
    event: impl Fn(&E) -> OverlayEvent + 'static,
) -> impl Fn(&E, &mut Window, &mut App) + 'static {
    cx.listener(move |view: &mut PlaygroundView, input: &E, window, cx| {
        view.dispatch_overlay(event(input), window, cx);
    })
}

/// The alignment the blocks `ids` under `node` share: `Some(None)` once two of them
/// differ. A block that sets none takes its nearest aligned ancestor's, like the renderer.
fn shared_alignment(
    node: &BlockNode,
    inherited: BlockAlign,
    ids: &[&str],
    shared: &mut Option<Option<BlockAlign>>,
) {
    let own = match &node.content {
        BlockContent::Paragraph { text_align, .. } | BlockContent::List { text_align, .. } => {
            text_align.unwrap_or(inherited)
        }
        _ => inherited,
    };
    if ids.contains(&node.id.as_str()) {
        *shared = Some(match *shared {
            None => Some(own),
            Some(all) => all.filter(|all| *all == own),
        });
    }
    for child in &node.children {
        shared_alignment(child, own, ids, shared);
    }
}

/// Glue between the overlays and the view: input in, edits out through the editor's
/// document session.
impl PlaygroundView {
    /// Popovers, hover and block-control state of the Page view.
    pub fn overlays(&self) -> &Overlays {
        &self.overlays
    }

    pub(crate) fn overlay_scene<'a>(
        &self,
        snapshot: &'a PageSnapshot,
        layout: &'a FlowLayout,
        selection: Option<&'a SelectionFormat>,
    ) -> OverlayScene<'a> {
        OverlayScene {
            snapshot,
            layout,
            geometry: crate::block_flow::page_geometry(self.window_size.0),
            window: self.window_size,
            scroll_y: self.scroll_y,
            selection,
        }
    }

    /// Feed one event to the overlays and carry out what it asks for: document edits
    /// (each one undo step, sent to the live room), the clipboard, timers. Pointer
    /// listeners route through here, and so do hosts and tests that open the slash menu
    /// or set the selection.
    pub fn dispatch_overlay(
        &mut self,
        event: OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let input = self.link_input_state();
        self.dispatch_overlay_event(event, window, cx);
        self.sync_link_input(input, window, cx);
    }

    /// What the platform's text input sees of the link field: nothing while it is closed.
    fn link_input_state(&self) -> Option<(String, Range<usize>, bool, Option<Range<usize>>)> {
        let link = self.overlays.link_field()?;
        let (selection, reversed) = link.shown_selection();
        Some((link.text(), selection, reversed, link.marked_range()))
    }

    /// Tell the platform's text input (AppKit, the browser's mirror element) that the
    /// link field opened, closed, or changed its text, selection or composition since
    /// `before`: the field and the document take turns being the view's text input.
    fn sync_link_input(
        &mut self,
        before: Option<(String, Range<usize>, bool, Option<Range<usize>>)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if before != self.link_input_state() {
            window.notify_text_input_changed(&self.editor_focus);
            window.notify_text_selection_changed(&self.editor_focus);
            cx.notify();
        }
    }

    fn dispatch_overlay_event(
        &mut self,
        event: OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match &event {
            OverlayEvent::SetSelection(selection) => {
                self.editor.dragging = false;
                self.overlays.close_link_field();
                match selection {
                    Some(selection) => self.select_document_range(
                        DocumentSelection {
                            anchor: DocPoint::new(
                                &selection.block_id,
                                selection.start_utf16 as u64,
                            ),
                            focus: DocPoint::new(&selection.block_id, selection.end_utf16 as u64),
                        },
                        window,
                        cx,
                    ),
                    None => {
                        // Peers stop showing the caret, and a typed slash menu has no
                        // caret left to filter by.
                        self.editor.selection = None;
                        self.announce_selection(cx);
                        self.sync_slash_trigger(cx);
                        window.notify_text_selection_changed(&self.editor_focus);
                        cx.notify();
                    }
                }
                return;
            }
            OverlayEvent::DragStart(_) => self.editor.dragging = false,
            _ => {}
        }
        let now_ms = self.now_ms(cx);
        let page = match self.mode {
            PlaygroundMode::Page => self.snapshot.clone().zip(self.flow_layout()),
            PlaygroundMode::Edgeless => None,
        };
        let effects = match &page {
            Some((snapshot, layout)) => {
                let scene = self.overlay_scene(snapshot, layout, None);
                self.overlays.handle(event, Some(&scene), now_ms)
            }
            None => self.overlays.handle(event, None, now_ms),
        };
        self.apply_overlay_effects(effects, window, cx);
    }

    /// Carry out the effects of an event or key. Returns whether a key was consumed.
    fn apply_overlay_effects(
        &mut self,
        effects: OverlayEffects,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        for edit in effects.edits {
            if let Err(error) = self.run_overlay_edit(edit, window, cx) {
                eprintln!("overlay edit: {error}");
            }
        }
        if let Some(text) = effects.clipboard {
            cx.write_to_clipboard(ClipboardItem::new_string(text));
        }
        if let Some(generation) = effects.copied_timer {
            self.copied_timer = Some(cx.spawn(async move |this, cx| {
                cx.background_executor()
                    .timer(Duration::from_millis(COPIED_MS))
                    .await;
                let _ = this.update(cx, |this, cx| {
                    if this.overlays.copied_expired(generation) {
                        cx.notify();
                    }
                });
            }));
        }
        let mut handled = effects.handled;
        if effects.paste {
            match cx.read_from_clipboard() {
                Some(item) => {
                    self.overlays.link_insert(&item.text().unwrap_or_default());
                }
                // A browser hands a paste over as an event of its own, and only when the
                // key keeps its default action; that event reaches the link field through
                // the input handler.
                None => handled = false,
            }
        }
        if self.overlays.slash_menu().is_none() {
            self.editor.slash_trigger = None;
        }
        if effects.redraw {
            cx.notify();
        }
        handled
    }

    /// The primary button went down on the page: popovers that a click elsewhere
    /// dismisses go away, and the editor places the caret or starts a selection.
    pub(crate) fn page_mouse_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let now_ms = self.now_ms(cx);
        let input = self.link_input_state();
        self.overlays.pointer_pressed(now_ms);
        self.sync_link_input(input, window, cx);
        self.editor.slash_trigger = None;
        self.editor_mouse_down(event, window, cx);
        // A double or triple click selects at once; only a plain press starts a drag the
        // formatting toolbar waits for.
        if event.click_count >= 2 {
            self.editor.dragging = false;
        }
        cx.notify();
    }

    pub(crate) fn root_mouse_move(
        &mut self,
        event: &MouseMoveEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.dispatch_overlay(
            OverlayEvent::PointerMoved {
                x: f32::from(event.position.x),
                y: f32::from(event.position.y),
                pressed: event.pressed_button == Some(MouseButton::Left),
            },
            window,
            cx,
        );
        if self.mode == PlaygroundMode::Page && self.overlays.dragged_block().is_none() {
            let selecting = self.editor.dragging;
            self.editor_mouse_move(event, window, cx);
            if selecting && !self.editor.dragging {
                cx.notify();
            }
        }
    }

    pub(crate) fn root_mouse_up(
        &mut self,
        _: &MouseUpEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        // The selection is finished: the formatting toolbar may open over it.
        if std::mem::take(&mut self.editor.dragging) {
            cx.notify();
        }
        self.dispatch_overlay(OverlayEvent::PointerUp, window, cx);
    }

    /// Offer a key to the open link field or slash menu before the document gets it.
    pub(crate) fn overlay_key_down(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let now_ms = self.now_ms(cx);
        let secondary = event.keystroke.modifiers.secondary(cx);
        let input = self.link_input_state();
        let effects = self.overlays.key_down(&event.keystroke, secondary, now_ms);
        let handled = self.apply_overlay_effects(effects, window, cx);
        self.sync_link_input(input, window, cx);
        handled
    }

    /// Run an input-handler call on the toolbar's link field, if that field is open: it
    /// is then the view's text input, and the document's text, selection and composition
    /// stay as they are.
    pub(crate) fn link_input<R>(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        call: impl FnOnce(&mut LinkBar) -> R,
    ) -> Option<R> {
        let input = self.link_input_state();
        let result = call(self.overlays.link_field_mut()?);
        self.sync_link_input(input, window, cx);
        Some(result)
    }

    /// The editor typed a `/` into paragraph or list text: open the slash menu on it.
    ///
    /// The `/` is remembered as a relative position naming that very character, so text
    /// a peer inserts before it moves the menu along instead of misplacing it.
    pub(crate) fn open_typed_slash_menu(
        &mut self,
        block_id: String,
        slash_offset: u64,
        cx: &mut Context<Self>,
    ) {
        if self.editor.slash_trigger.is_some() && self.overlays.slash_menu().is_some() {
            return;
        }
        let Some(position) = self.page().and_then(|page| {
            page.capture_selection_snapshot(&block_id, slash_offset, &block_id, slash_offset)
                .ok()
        }) else {
            return;
        };
        let now_ms = self.now_ms(cx);
        self.editor.slash_trigger = Some((block_id.clone(), position));
        self.overlays
            .open_typed_slash(block_id, slash_offset as usize, now_ms);
        cx.notify();
    }

    /// Where the `/` remembered as `position` is now, the caret behind it, and the filter
    /// typed between the two.
    ///
    /// `None` when the menu has nothing left to act on: the character at the position is
    /// not that `/` any more (deleted, or deleted and typed again by a peer, which is
    /// another character), the caret is not a caret in the same block behind it, or the
    /// text between them holds whitespace.
    fn typed_slash(
        &self,
        block_id: &str,
        position: &SelectionSnapshot,
    ) -> Option<(u64, u64, String)> {
        let page = self.page()?;
        let resolved = page.resolve_selection_snapshot(position).ok()??;
        let slash = resolved.anchor.1;
        if resolved.anchor.0 != block_id
            || resolved.focus.0 != block_id
            || resolved.focus.1 != slash
        {
            return None;
        }
        let units: Vec<u16> = page
            .read_editable_text(block_id)
            .ok()?
            .0
            .plain
            .encode_utf16()
            .collect();
        if units.get(slash as usize) != Some(&u16::from(b'/')) {
            return None;
        }
        // A position resolves to where a deleted character was; only the same character
        // gives the same position back.
        if page
            .capture_selection_snapshot(block_id, slash, block_id, slash)
            .ok()?
            != *position
        {
            return None;
        }
        let selection = self.editor.selection.as_ref()?;
        let caret = selection.focus.offset();
        if !selection.empty() || selection.focus.block_id != block_id || caret <= slash {
            return None;
        }
        let query = String::from_utf16(units.get(slash as usize + 1..caret as usize)?).ok()?;
        (!query.chars().any(char::is_whitespace)).then_some((slash, caret, query))
    }

    /// After a local or remote edit or a selection change: the text between the typed `/`
    /// and the caret is the slash menu's filter, and the menu follows the `/`. The menu
    /// closes once [`Self::typed_slash`] finds nothing to act on.
    pub(crate) fn sync_slash_trigger(&mut self, cx: &Context<Self>) {
        let Some(menu_block) = self
            .overlays
            .slash_menu()
            .filter(|menu| menu.query_in_document)
            .map(|menu| menu.block_id.clone())
        else {
            return;
        };
        let typed = self
            .editor
            .slash_trigger
            .as_ref()
            .filter(|(block_id, _)| *block_id == menu_block)
            .and_then(|(block_id, position)| self.typed_slash(block_id, position));
        match typed {
            Some((slash, _, query)) => self.overlays.set_typed_slash(slash as usize, query),
            None => {
                let now_ms = self.now_ms(cx);
                self.editor.slash_trigger = None;
                self.overlays.close_slash(now_ms);
            }
        }
    }

    /// Scroll a code block sideways so the caret at world x `caret_x` stays in view.
    pub(crate) fn reveal_code_caret(&mut self, block_id: &str, caret_x: f32) {
        let Some(layout) = self.flow_layout() else {
            return;
        };
        if let Some(block) = layout.block(block_id)
            && let Some(code) = block.body.code_scroll
        {
            self.overlays
                .reveal_code_x(block_id, caret_x - block.x - code.area.x, code);
        }
    }

    /// What the formatting toolbar shows for the editor's selection: `None` unless the
    /// selection is non-empty, no composition is running, and it covers paragraph or list
    /// text only. Marks and alignment are read once per selection and document revision.
    fn selection_format(&mut self, layout: &FlowLayout) -> Option<SelectionFormat> {
        let selection = self.editor.selection.clone()?;
        if selection.empty() || self.editor.composing() {
            return None;
        }
        let fresh = self
            .overlays
            .format_cache
            .as_ref()
            .is_some_and(|(rev, cached, _)| *rev == self.doc_rev && *cached == selection);
        if !fresh {
            let state = self.read_selection_format(&selection, layout);
            self.overlays.format_cache = Some((self.doc_rev, selection, state));
        }
        let (marks, align) = self.overlays.format_cache.as_ref()?.2.clone()?;
        Some(SelectionFormat {
            anchor_world: bounding_rect(&self.selection_rects(layout))?,
            marks,
            align,
        })
    }

    fn read_selection_format(
        &self,
        selection: &DocumentSelection,
        layout: &FlowLayout,
    ) -> Option<(MarkState, Option<BlockAlign>)> {
        let (start, end, a, b, _) = selection.ordered(layout)?;
        let page = self.page()?;
        let mut marks: Option<MarkState> = None;
        // Every paragraph and list block the selection touches is aligned, empty ones too.
        let mut ids: Vec<&str> = Vec::new();
        for block in &layout.blocks[a..=b] {
            let id = block.block_id.as_str();
            if matches!(block.body.kind, FlowKind::Paragraph(_) | FlowKind::List(_)) {
                ids.push(id);
            }
            let from = if id == start.block_id {
                start.offset()
            } else {
                0
            };
            let to = if id == end.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            if !block.editable() || to <= from {
                continue;
            }
            // The title and code carry no inline marks.
            if !matches!(block.body.kind, FlowKind::Paragraph(_) | FlowKind::List(_)) {
                return None;
            }
            let (text, _) = page.read_editable_text(id).ok()?;
            let slice = marks_in_range(&text, from as usize, to as usize);
            marks = Some(match marks {
                None => slice,
                Some(all) => MarkState {
                    bold: all.bold && slice.bold,
                    italic: all.italic && slice.italic,
                    underline: all.underline && slice.underline,
                    strike: all.strike && slice.strike,
                    code: all.code && slice.code,
                    link: all.link.filter(|link| Some(link) == slice.link.as_ref()),
                },
            });
        }
        let marks = marks?;
        let mut shared = None;
        shared_alignment(
            self.page_snapshot()?.root.as_ref()?,
            BlockAlign::Left,
            &ids,
            &mut shared,
        );
        Some((marks, shared.flatten()))
    }

    /// Build what the overlays draw inside the page viewport for this frame, and the
    /// per-block paint state.
    pub(crate) fn overlay_page_layer(
        &mut self,
        layout: &FlowLayout,
        palette: &Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> (PagePaint, Vec<AnyElement>) {
        let Some(snapshot) = self.snapshot.clone() else {
            return Default::default();
        };
        let now_ms = self.now_ms(cx);
        // The toolbar waits for the selection to be finished.
        let selection = self
            .selection_format(layout)
            .filter(|_| !self.editor.dragging);
        let scene = self.overlay_scene(&snapshot, layout, selection.as_ref());
        let input = self.link_input_state();
        let layer = self
            .overlays
            .page_layer(&scene, palette, now_ms, window, cx);
        // The toolbar, and its link field with it, goes when the selection does.
        if input != self.link_input_state() {
            window.notify_text_input_changed(&self.editor_focus);
            window.notify_text_selection_changed(&self.editor_focus);
        }
        if self.overlays.slash_menu().is_none() {
            self.editor.slash_trigger = None;
        }
        layer
    }

    /// Screen-space popovers of the Page view, drawn above the whole window.
    pub(crate) fn overlay_popovers(
        &mut self,
        palette: &Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Vec<AnyElement> {
        if self.mode != PlaygroundMode::Page {
            return Vec::new();
        }
        let Some((snapshot, layout)) = self.snapshot.clone().zip(self.flow_layout()) else {
            return Vec::new();
        };
        let now_ms = self.now_ms(cx);
        let scene = self.overlay_scene(&snapshot, &layout, None);
        self.overlays.popovers(&scene, palette, now_ms, window, cx)
    }

    /// Snapshot of the editor's selection for the undo entry an edit creates.
    fn selection_snapshot(&self) -> Option<SelectionSnapshot> {
        self.editor.selection.as_ref()?.snapshot(self.page()?).ok()
    }

    /// Carry out one overlay edit as a single undo step and publish it.
    fn run_overlay_edit(
        &mut self,
        edit: DocEdit,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let now = self.now_ms(cx) as u64;
        match edit {
            DocEdit::Mark(key) => self.format_mark(key, window, cx),
            DocEdit::Align(align) => self.format_selection(Some(align), None, window, cx),
            DocEdit::Link(url) => self.format_selection(None, Some(url), window, cx),
            DocEdit::Slash {
                block_id,
                command,
                typed,
            } => self.run_slash_command(&block_id, command, typed, window, cx),
            edit @ (DocEdit::SetProp { .. } | DocEdit::Reorder { .. }) => {
                let before = self.selection_snapshot();
                let page = self.page_mut()?;
                // A block control is its own undo step, never merged into typing.
                page.stop_capturing()?;
                let commit = match &edit {
                    DocEdit::SetProp {
                        block_id,
                        key,
                        value,
                    } => {
                        page.set_block_prop(block_id, *key, SessionValue::Any(value.clone()), now)?
                    }
                    DocEdit::Reorder {
                        parent_id,
                        child_id,
                        new_index,
                    } => page.reparent_block(child_id, parent_id, parent_id, *new_index, now)?,
                    _ => None,
                };
                if commit.is_some()
                    && let Some(before) = before
                {
                    page.set_undo_selection_snapshot(before)?;
                }
                page.stop_capturing()?;
                self.editor.last_typing = None;
                self.did_edit(commit, None, window, cx);
                // The page stays where it is; the caret may be far from the control.
                self.editor.reveal = false;
                Ok(())
            }
        }
    }

    /// Align the selected paragraph and list blocks, or set or clear the link of the
    /// selected text, in one undo step.
    fn format_selection(
        &mut self,
        align: Option<BlockAlign>,
        link: Option<Option<String>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(selection) = self.editor.selection.clone() else {
            return Ok(());
        };
        let Some(layout) = self.flow_layout() else {
            return Ok(());
        };
        let Some((start, end, a, b, _)) = selection.ordered(&layout) else {
            return Ok(());
        };
        // Alignment goes on every paragraph and list block the selection touches, empty
        // ones included; a link only where there is text to carry it.
        let mut blocks: Vec<&str> = Vec::new();
        let mut ranges: Vec<(&str, u64, u64)> = Vec::new();
        for block in &layout.blocks[a..=b] {
            if !matches!(block.body.kind, FlowKind::Paragraph(_) | FlowKind::List(_)) {
                continue;
            }
            let id = block.block_id.as_str();
            blocks.push(id);
            let from = if id == start.block_id {
                start.offset()
            } else {
                0
            };
            let to = if id == end.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            if to > from {
                ranges.push((id, from, to - from));
            }
        }
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let before = selection.snapshot(page)?;
        let commit = page.structural_edit(now, |page| {
            if let Some(align) = align {
                for id in &blocks {
                    page.set_block_prop(
                        id,
                        "prop:textAlign",
                        SessionValue::Any(Any::String(align.as_str().to_string())),
                        now,
                    )?;
                }
            }
            if let Some(url) = &link {
                for (id, from, len) in &ranges {
                    let value = url.clone().map_or(Any::Null, Any::String);
                    page.format_text(
                        id,
                        "prop:text",
                        *from,
                        *len,
                        TextAttributes::from([("link".to_string(), value)]),
                        now,
                    )?;
                }
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(before)?;
        }
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        Ok(())
    }

    /// Run a slash menu command on a block in one undo step, the way BlockSuite's menu
    /// does.
    ///
    /// A command typed into the block (`typed`) goes first: the `/` and the filter behind
    /// it are removed, and nothing at all happens when [`Self::typed_slash`] no longer
    /// finds them. A paragraph type, a list type or code then converts the block, with
    /// whatever text it has left, in place within a flavour and as a fresh block across
    /// flavours. A divider goes right below the block, followed by an empty paragraph to
    /// type in when the block was the last of its parent.
    fn run_slash_command(
        &mut self,
        block_id: &str,
        command: SlashCommand,
        typed: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let snapshot = self
            .snapshot
            .clone()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?;
        let (parent, slot) = snapshot
            .root
            .as_ref()
            .and_then(|root| find_parent(root, block_id))
            .ok_or_else(|| DocError::BlockNotFound(block_id.to_string()))?;
        let node = &parent.children[slot];
        let parent_id = parent.id.as_str();

        let trigger = self.editor.slash_trigger.take();
        let strip = if typed {
            let found = trigger
                .filter(|(trigger, _)| trigger == block_id)
                .and_then(|(_, position)| self.typed_slash(block_id, &position));
            // The typed command is gone or was changed under the menu: leave the text alone.
            let Some((slash, caret, _)) = found else {
                return Ok(());
            };
            Some((slash, caret - slash))
        } else {
            None
        };
        // Where the caret ends up in the block's text: where the `/` was, or where it is.
        let offset = strip.map(|(slash, _)| slash).unwrap_or_else(|| {
            self.editor
                .selection
                .as_ref()
                .filter(|selection| selection.focus.block_id == block_id)
                .map_or(0, |selection| selection.focus.offset())
        });

        let fresh = self.fresh_block_id();
        let trailing = self.fresh_block_id();
        let text_block =
            |node: &BlockNode| matches!(node.flavour.as_str(), "affine:paragraph" | "affine:list");
        let plan = if command == SlashCommand::Divider {
            match parent.children.get(slot + 1) {
                None => SlashPlan::Divider {
                    trailing: true,
                    caret: DocPoint::new(&trailing, 0),
                },
                Some(next) => SlashPlan::Divider {
                    trailing: false,
                    caret: if text_block(next) || next.flavour == "affine:code" {
                        DocPoint::new(&next.id, 0)
                    } else {
                        DocPoint::new(block_id, offset)
                    },
                },
            }
        } else if text_block(node) {
            let same = command.block_spec().flavour() == node.flavour;
            SlashPlan::Convert {
                caret: DocPoint::new(if same { block_id } else { &fresh }, offset),
            }
        } else {
            // A block without text to carry over keeps what it is; the new block goes
            // below it.
            SlashPlan::Insert {
                caret: DocPoint::new(&fresh, 0),
            }
        };
        let numbered = matches!(command, SlashCommand::List(ListType::Numbered));
        let before = self.selection_snapshot();
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let commit = page.structural_edit(now, |page| {
            if let Some((slash, len)) = strip {
                page.remove_text(block_id, "prop:text", slash, len, now)?;
            }
            match &plan {
                SlashPlan::Convert { .. } => {
                    page.convert_block_flavour(block_id, &fresh, command.block_spec(), now)?;
                }
                SlashPlan::Insert { .. } => {
                    page.add_block(
                        &fresh,
                        command.block_spec(),
                        Some(parent_id),
                        Some(slot as u64 + 1),
                        now,
                    )?;
                    if numbered {
                        page.correct_numbered_order_from(parent_id, slot + 1, 1)?;
                    }
                }
                SlashPlan::Divider { trailing: last, .. } => {
                    page.add_block(
                        &fresh,
                        BlockSpec::Divider,
                        Some(parent_id),
                        Some(slot as u64 + 1),
                        now,
                    )?;
                    if *last {
                        page.add_block(
                            &trailing,
                            SlashCommand::Paragraph(ParagraphType::Text).block_spec(),
                            Some(parent_id),
                            Some(slot as u64 + 2),
                            now,
                        )?;
                    }
                }
            }
            Ok(())
        })?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        let (SlashPlan::Convert { caret }
        | SlashPlan::Insert { caret }
        | SlashPlan::Divider { caret, .. }) = plan;
        self.editor.selection = Some(DocumentSelection::caret(caret));
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        Ok(())
    }
}

/// What a slash command does to the document, and where it leaves the caret.
#[derive(Clone)]
enum SlashPlan {
    /// Convert the block itself.
    Convert { caret: DocPoint },
    /// Add the new block below a block that cannot be converted.
    Insert { caret: DocPoint },
    /// Add a divider below the block, and an empty paragraph after it when `trailing`.
    Divider { trailing: bool, caret: DocPoint },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        HOME_PAGE_ID, PlaygroundOptions, PlaygroundTheme, block_flow::page_geometry,
        register_bundled_fonts,
    };
    use blocksuite_playground_doc::session::PageDocSession;
    use std::{cell::RefCell, rc::Rc};
    use ui::{
        Application, ApplicationHandle, Bounds, EntityInputHandler, FrameSnapshot,
        HeadlessPlatform, HeadlessWindow, Modifiers, PlatformInput, ScrollDelta, ScrollSource,
        SnapshotRect, TouchPhase, WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot,
    };

    struct Session {
        platform: Rc<HeadlessPlatform>,
        app: ApplicationHandle,
        window: WindowHandle<PlaygroundView>,
        headless: HeadlessWindow,
    }

    fn open(width: u32, height: u32, theme: PlaygroundTheme) -> Session {
        let platform = HeadlessPlatform::new(width, height, 1.0);
        let handle_cell: Rc<RefCell<Option<WindowHandle<PlaygroundView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();
        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_bundled_fonts(cx).expect("register bundled fonts");
            let options = PlaygroundOptions {
                theme,
                ..PlaygroundOptions::default()
            };
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
        let session = Session {
            platform,
            app,
            window,
            headless,
        };
        // The first frame lays the page out and hands the view the keyboard focus.
        session.frame();
        session.platform.run_until_parked();
        session
    }

    impl Session {
        fn frame(&self) -> FrameSnapshot {
            self.headless.request_frame();
            self.app.update(|cx| {
                self.window
                    .update(cx, |_, window, _| window.frame_snapshot().clone())
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

        fn update<R>(
            &self,
            f: impl FnOnce(&mut PlaygroundView, &mut Window, &mut Context<PlaygroundView>) -> R,
        ) -> R {
            self.app
                .update(|cx| self.window.update(cx, f).expect("update view"))
        }

        fn overlay(&self, event: OverlayEvent) {
            self.update(|view, window, cx| view.dispatch_overlay(event, window, cx));
        }

        /// Type text into the document through the platform input handler.
        fn insert(&self, text: &str) {
            for ch in text.chars() {
                self.update(|view, window, cx| {
                    view.replace_text_in_range(None, &ch.to_string(), window, cx);
                });
            }
            self.frame();
        }

        /// The platform's undo shortcut.
        fn undo(&self) {
            self.keystroke(Keystroke {
                modifiers: Modifiers {
                    platform: true,
                    control: true,
                    ..Modifiers::default()
                },
                key: "z".to_string(),
                key_char: None,
            });
            self.frame();
        }

        /// The editor's selection as `(anchor block, anchor, focus block, focus)`.
        fn selection(&self) -> Option<(String, u64, String, u64)> {
            self.view(|view, _| {
                view.document_selection().map(|selection| {
                    (
                        selection.anchor.block_id.clone(),
                        selection.anchor.offset(),
                        selection.focus.block_id.clone(),
                        selection.focus.offset(),
                    )
                })
            })
        }

        fn caret(&self) -> Option<(String, u64)> {
            self.selection()
                .filter(|(anchor, from, focus, to)| anchor == focus && from == to)
                .map(|(block, offset, _, _)| (block, offset))
        }

        /// Let every overlay transition finish, and return the frame after it.
        fn settle(&self) -> FrameSnapshot {
            self.frame();
            self.platform.run_until_parked();
            self.platform.advance_clock(Duration::from_millis(200));
            self.platform.run_until_parked();
            self.frame()
        }

        fn click(&self, snapshot: &FrameSnapshot, id: &str) {
            let bounds = element(snapshot, id).bounds;
            self.headless.simulate_click(point(
                px(bounds.x + bounds.width * 0.5),
                px(bounds.y + bounds.height * 0.5),
            ));
            self.platform.run_until_parked();
        }

        fn keystroke(&self, keystroke: Keystroke) {
            self.frame();
            self.platform.run_until_parked();
            self.headless
                .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
                    keystroke,
                    is_held: false,
                    prefer_character_input: false,
                }));
            self.platform.run_until_parked();
        }

        /// Press a named key (`enter`, `up`) or type a single character.
        fn key(&self, key: &str) {
            self.keystroke(Keystroke {
                modifiers: Modifiers::default(),
                key: key.to_string(),
                key_char: (key.chars().count() == 1).then(|| key.to_string()),
            });
        }

        /// Type text the way a keyboard does: each key goes to the key handlers first
        /// and, when none of them takes it, to the input handler as text.
        fn type_text(&self, text: &str) {
            for ch in text.chars() {
                self.frame();
                self.platform.run_until_parked();
                let keystroke = Keystroke {
                    modifiers: Modifiers::default(),
                    key: ch.to_string(),
                    key_char: Some(ch.to_string()),
                };
                self.app.update(|cx| {
                    ui::AnyWindowHandle::from(self.window)
                        .update(cx, |_, window, cx| window.dispatch_keystroke(keystroke, cx))
                        .expect("dispatch keystroke")
                });
                self.platform.run_until_parked();
            }
        }

        /// A key with the platform's command modifier.
        fn command(&self, key: &str) {
            self.keystroke(Keystroke {
                modifiers: Modifiers {
                    platform: true,
                    control: true,
                    ..Modifiers::default()
                },
                key: key.to_string(),
                key_char: None,
            });
        }

        /// A key with `Shift` held.
        fn shift(&self, key: &str) {
            self.keystroke(Keystroke {
                modifiers: Modifiers {
                    shift: true,
                    ..Modifiers::default()
                },
                key: key.to_string(),
                key_char: None,
            });
        }

        /// A second editor of the same page, holding everything this one has.
        fn peer(&self) -> PageDocSession {
            let mut peer = PageDocSession::new(HOME_PAGE_ID, 4242).expect("peer");
            self.send_to(&mut peer);
            peer
        }

        /// Bring `peer` up to date with this editor.
        fn send_to(&self, peer: &mut PageDocSession) {
            let update = self.view(|view, _| {
                view.document()
                    .workspace
                    .page(HOME_PAGE_ID)
                    .expect("page")
                    .encode_update_v1()
                    .expect("update")
            });
            peer.apply_remote_update_v1(&update).expect("peer applies");
        }

        /// Apply a peer's update the way the room hands it in.
        fn receive(&self, update: &[u8]) {
            self.view(|view, cx| {
                view.edit_document(cx, |state| {
                    state
                        .workspace
                        .page_mut(HOME_PAGE_ID)
                        .expect("page")
                        .apply_remote_update_v1(update)
                        .expect("apply remote update");
                });
            });
            self.frame();
        }

        /// State vector of the page: equal before and after means nothing was written.
        fn written(&self) -> Vec<u8> {
            self.view(|view, _| {
                view.document()
                    .workspace
                    .page(HOME_PAGE_ID)
                    .expect("page")
                    .encode_state_vector_v1()
                    .expect("state vector")
            })
        }

        /// What the platform's text input reads: the text, the selection and the range
        /// of a running composition.
        fn input(
            &self,
        ) -> (
            String,
            std::ops::Range<usize>,
            Option<std::ops::Range<usize>>,
        ) {
            self.update(|view, window, cx| {
                let mut covered = None;
                let text = view
                    .text_for_range(0..10_000, &mut covered, window, cx)
                    .expect("input text");
                let selection = view
                    .selected_text_range(false, window, cx)
                    .expect("input selection");
                (text, selection.range, view.marked_text_range(window, cx))
            })
        }

        fn compose(&self, text: &str) {
            self.update(|view, window, cx| {
                view.replace_and_mark_text_in_range(None, text, None, window, cx);
            });
        }

        fn pointer(&self, x: f32, y: f32, pressed: bool) {
            self.headless
                .dispatch_input(PlatformInput::MouseMove(MouseMoveEvent {
                    position: point(px(x), px(y)),
                    pressed_button: pressed.then_some(MouseButton::Left),
                    modifiers: Modifiers::default(),
                }));
            self.platform.run_until_parked();
        }

        fn press(&self, x: f32, y: f32, click_count: usize) {
            self.pointer(x, y, false);
            self.headless
                .dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
                    button: MouseButton::Left,
                    position: point(px(x), px(y)),
                    modifiers: Modifiers::default(),
                    click_count,
                    first_mouse: false,
                }));
            self.platform.run_until_parked();
        }

        fn release(&self, x: f32, y: f32) {
            self.headless
                .dispatch_input(PlatformInput::MouseUp(MouseUpEvent {
                    button: MouseButton::Left,
                    position: point(px(x), px(y)),
                    modifiers: Modifiers::default(),
                    click_count: 1,
                }));
            self.platform.run_until_parked();
        }

        fn scroll(&self, x: f32, y: f32, delta_x: f32, delta_y: f32) {
            self.pointer(x, y, false);
            self.headless
                .dispatch_input(PlatformInput::Scroll(ScrollEvent {
                    position: point(px(x), px(y)),
                    delta: ScrollDelta::Pixels(point(px(delta_x), px(delta_y))),
                    modifiers: Modifiers::default(),
                    touch_phase: TouchPhase::Moved,
                    source: ScrollSource::Pointer,
                }));
            self.platform.run_until_parked();
        }

        fn node(&self, block_id: &str) -> Option<BlockNode> {
            self.view(|view, _| {
                view.page_snapshot()
                    .and_then(|snapshot| snapshot.block(block_id))
                    .cloned()
            })
        }

        fn children(&self, parent_id: &str) -> Vec<String> {
            self.node(parent_id)
                .map(|node| node.children.into_iter().map(|child| child.id).collect())
                .unwrap_or_default()
        }

        fn text(&self, block_id: &str) -> RichText {
            self.node(block_id)
                .and_then(|node| block_text(&node).cloned())
                .unwrap_or_else(|| panic!("{block_id} has no text"))
        }

        /// Select the first occurrence of `needle` in a block; returns the UTF-16 range.
        fn select(&self, block_id: &str, needle: &str) -> (usize, usize) {
            let plain = self.text(block_id).plain;
            let at = plain.find(needle).expect("needle in block text");
            let start = plain[..at].encode_utf16().count();
            let end = start + needle.encode_utf16().count();
            self.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
                block_id: block_id.to_string(),
                start_utf16: start,
                end_utf16: end,
            })));
            (start, end)
        }

        fn edit(&self, edit: impl FnOnce(&mut PageDocSession)) {
            self.view(|view, cx| {
                view.edit_document(cx, |state| {
                    edit(
                        state
                            .workspace
                            .page_mut(HOME_PAGE_ID)
                            .expect("showcase page"),
                    );
                });
            });
            self.frame();
        }

        fn open_slash(&self, block_id: &str) -> FrameSnapshot {
            self.overlay(OverlayEvent::OpenSlashMenu {
                block_id: block_id.to_string(),
                utf16_offset: 0,
                anchor: None,
            });
            self.settle()
        }

        fn slash_query(&self) -> Option<String> {
            self.view(|view, _| view.overlays().slash_menu().map(|menu| menu.query.clone()))
        }
    }

    fn element<'a>(snapshot: &'a FrameSnapshot, id: &str) -> &'a ui::DebugElementSnapshot {
        snapshot
            .elements
            .get(id)
            .unwrap_or_else(|| panic!("{id} is not in the frame"))
    }

    fn center(rect: SnapshotRect) -> (f32, f32) {
        (rect.x + rect.width * 0.5, rect.y + rect.height * 0.5)
    }

    fn assert_no_violations(snapshot: &FrameSnapshot, context: &str) {
        let violations = audit_frame_snapshot(snapshot);
        assert!(violations.is_empty(), "{context}: {violations:#?}");
    }

    fn empty_paragraph(session: &Session, id: &str, index: u64) {
        session.edit(|page| {
            page.add_block(
                id,
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: String::new(),
                },
                Some("showcase-note"),
                Some(index),
                2_000_000,
            )
            .expect("add empty paragraph");
        });
    }

    #[test]
    fn popovers_flip_at_the_top_bar_and_the_bottom_edge_and_stay_inside_the_window() {
        let viewport = FlowRect::new(0.0, TOPBAR_HEIGHT, 1280.0, 800.0 - TOPBAR_HEIGHT);
        let place = |anchor: FlowRect, size: (f32, f32), preferred: Placement| {
            place_popover(anchor, size, viewport, preferred, 8.0, 8.0)
        };

        // Room on the preferred side: above and centered, below and left-aligned.
        let above = place(
            FlowRect::new(600.0, 400.0, 80.0, 24.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(above.side, PopoverSide::Above);
        assert!(!above.flipped);
        assert_eq!(above.rect, FlowRect::new(500.0, 356.0, 280.0, 36.0));
        let below = place(
            FlowRect::new(300.0, 200.0, 1.0, 24.0),
            (280.0, 390.0),
            Placement::BelowStart,
        );
        assert_eq!(below.side, PopoverSide::Below);
        assert!(!below.flipped);
        assert_eq!(below.rect, FlowRect::new(300.0, 232.0, 280.0, 390.0));

        // Too close to the top bar: the toolbar flips below the selection's last line.
        let flipped = place(
            FlowRect::new(600.0, 70.0, 80.0, 48.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(flipped.side, PopoverSide::Below);
        assert!(flipped.flipped);
        assert_eq!(flipped.rect.y, 70.0 + 48.0 + 8.0);
        // One pixel of room above the margin is enough to stay.
        let stays = place(
            FlowRect::new(600.0, TOPBAR_HEIGHT + 8.0 + 36.0 + 8.0, 80.0, 24.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(stays.side, PopoverSide::Above);
        assert_eq!(stays.rect.y, TOPBAR_HEIGHT + 8.0);

        // Too close to the bottom edge: the menu flips above its caret.
        let flipped = place(
            FlowRect::new(300.0, 700.0, 1.0, 24.0),
            (280.0, 390.0),
            Placement::BelowStart,
        );
        assert_eq!(flipped.side, PopoverSide::Above);
        assert!(flipped.flipped);
        assert_eq!(flipped.rect.bottom(), 700.0 - 8.0);
        assert_eq!(flipped.rect.x, 300.0);

        // Horizontal clamping at both edges.
        let left = place(
            FlowRect::new(4.0, 400.0, 20.0, 24.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(left.rect.x, 8.0);
        let right = place(
            FlowRect::new(1200.0, 400.0, 1.0, 24.0),
            (280.0, 100.0),
            Placement::BelowStart,
        );
        assert_eq!(right.rect.right(), 1280.0 - 8.0);

        // No room on either side: the roomier side, held inside the viewport.
        let squeezed = place(
            FlowRect::new(300.0, 300.0, 1.0, 24.0),
            (280.0, 600.0),
            Placement::BelowStart,
        );
        assert_eq!(squeezed.side, PopoverSide::Below);
        assert!(squeezed.rect.y >= TOPBAR_HEIGHT + 8.0);
        assert!(squeezed.rect.bottom() <= 800.0 - 8.0);

        // Fractional anchors land on the pixel grid.
        let snapped = place(
            FlowRect::new(301.3, 199.6, 0.7, 24.2),
            (280.0, 100.0),
            Placement::BelowStart,
        );
        assert_eq!(snapped.rect.x.fract(), 0.0);
        assert_eq!(snapped.rect.y.fract(), 0.0);

        // A narrow window keeps the popover inside its margins.
        let narrow = place_popover(
            FlowRect::new(200.0, 400.0, 60.0, 24.0),
            (287.0, 36.0),
            FlowRect::new(0.0, TOPBAR_HEIGHT, 320.0, 800.0 - TOPBAR_HEIGHT),
            Placement::Above,
            8.0,
            8.0,
        );
        assert_eq!(narrow.rect.x, 320.0 - 8.0 - 287.0);
        assert!(narrow.rect.x >= 8.0);
    }

    #[test]
    fn transitions_ease_out_and_end_exactly_on_their_target() {
        assert_eq!(ease_out_cubic(0.0), 0.0);
        assert_eq!(ease_out_cubic(1.0), 1.0);
        assert!(ease_out_cubic(0.5) > 0.5);
        let motion = EaseOut::new(0.3, 1.0, 100.0);
        assert_eq!(motion.value_at(100.0), 0.3);
        assert_eq!(motion.value_at(100.0 + OVERLAY_MOTION_MS), 1.0);
        assert_eq!(motion.value_at(10_000.0), 1.0);
        for fps in [60.0, 120.0, 24.0, 7.0] {
            let dt = 1000.0 / fps;
            let (mut now, mut last) = (100.0, motion.value_at(100.0));
            while now < 100.0 + OVERLAY_MOTION_MS {
                now += dt;
                let next = motion.value_at(now);
                assert!(next >= last);
                last = next;
            }
            assert_eq!(last, 1.0);
        }

        // A popover reopened mid fade-out carries on from where the fade got to.
        let mut presence = Presence::opening(0.0);
        assert_eq!(presence.progress(0.0), 0.0);
        assert_eq!(presence.progress(150.0), 1.0);
        presence.close(200.0);
        assert!(presence.progress(250.0) < 1.0 && presence.progress(250.0) > 0.0);
        assert!(!presence.gone(250.0));
        let reopened = presence.reopened(250.0);
        assert_eq!(reopened.progress(250.0), presence.progress(250.0));
        assert_eq!(reopened.progress(400.0), 1.0);
        assert!(presence.gone(350.0));
    }

    #[test]
    fn slash_items_filter_by_title_and_keyword_and_group_without_dangling_headers() {
        let ids = |query: &str| -> Vec<&str> {
            filter_slash_items(query)
                .into_iter()
                .map(|item| item.id)
                .collect()
        };
        assert_eq!(ids("").len(), SLASH_ITEMS.len());
        assert_eq!(ids("h1"), ["h1"]);
        assert_eq!(ids("todo"), ["todo"]);
        assert_eq!(ids("code"), ["code"]);
        assert_eq!(ids("quote"), ["quote"]);
        assert_eq!(ids("div"), ["divider"]);
        assert_eq!(ids("HEADING"), ["h1", "h2", "h3", "h4", "h5", "h6"]);
        assert_eq!(ids("heading 3"), ["h3"]);
        assert_eq!(ids("list"), ["bulleted", "numbered", "todo", "toggle"]);
        assert!(ids("zzz").is_empty());
        // Every generated icon exists.
        for item in &SLASH_ITEMS {
            assert!(
                crate::theme::icon_by_name(item.icon).is_some(),
                "{}",
                item.icon
            );
        }

        // Each group is headed once, a header is always followed by an item, and the list
        // neither starts nor ends on a gap.
        let (rows, height) = slash_rows(&filter_slash_items(""));
        let headers: Vec<&str> = rows
            .iter()
            .filter_map(|(row, _, _)| match row {
                SlashRow::Header(group) => Some(*group),
                _ => None,
            })
            .collect();
        assert_eq!(headers, ["Basic", "List"]);
        // BlockSuite's order: text, the headings, code, quote, divider, then the lists.
        assert_eq!(
            ids(""),
            [
                "text", "h1", "h2", "h3", "h4", "h5", "h6", "code", "quote", "divider", "bulleted",
                "numbered", "todo", "toggle"
            ]
        );
        assert_eq!(rows.first().map(|(_, y, _)| *y), Some(0.0));
        assert!(matches!(rows.last(), Some((SlashRow::Item(13), _, _))));
        let (_, last_y, last_height) = rows[rows.len() - 1];
        assert_eq!(last_y + last_height, height);
        for pair in rows.windows(2) {
            if let (SlashRow::Header(_), _, _) = pair[0] {
                assert!(matches!(pair[1].0, SlashRow::Item(_)));
            }
        }
        // Without results the list keeps one row.
        let (rows, height) = slash_rows(&[]);
        assert_eq!(rows, [(SlashRow::Empty, 0.0, SLASH_ITEM_HEIGHT)]);
        assert_eq!(height, SLASH_ITEM_HEIGHT);
    }

    #[test]
    fn marks_urls_and_drop_slots_follow_their_rules() {
        let insert = |text: &str, marks: &[(&str, Any)]| TextDeltaOp::Insert {
            insert: TextInsert::Text(text.to_string()),
            format: (!marks.is_empty()).then(|| {
                marks
                    .iter()
                    .map(|(key, value)| (key.to_string(), value.clone()))
                    .collect()
            }),
        };
        let link = Any::String("https://affine.pro".to_string());
        let text = RichText {
            plain: "plain bold both link".to_string(),
            delta: vec![
                insert("plain ", &[]),
                insert("bold ", &[("bold", Any::True)]),
                insert("both ", &[("bold", Any::True), ("italic", Any::True)]),
                insert("link", &[("link", link)]),
            ],
        };
        assert_eq!(marks_in_range(&text, 0, 5), MarkState::default());
        assert!(marks_in_range(&text, 6, 10).bold);
        // A mark counts only when the whole range carries it.
        assert!(!marks_in_range(&text, 3, 10).bold);
        let both = marks_in_range(&text, 6, 15);
        assert!(both.bold && !both.italic);
        assert!(marks_in_range(&text, 11, 15).italic);
        assert_eq!(
            marks_in_range(&text, 16, 20).link.as_deref(),
            Some("https://affine.pro")
        );
        assert_eq!(marks_in_range(&text, 12, 20).link, None);
        assert_eq!(marks_in_range(&text, 4, 4), MarkState::default());

        assert_eq!(normalize_url(" affine.pro "), "https://affine.pro");
        assert_eq!(normalize_url("http://a.b"), "http://a.b");
        assert_eq!(normalize_url("mailto:a@b.c"), "mailto:a@b.c");
        assert_eq!(normalize_url(""), "");

        let slot = |insert_index: usize| DropSlot {
            parent_id: "note".to_string(),
            insert_index,
            old_index: 2,
            indicator_world_y: 0.0,
            indicator_world_x: 0.0,
        };
        // Dropping right before or right after itself moves nothing.
        assert_eq!(slot(2).reorder_index(), None);
        assert_eq!(slot(3).reorder_index(), None);
        assert_eq!(slot(0).reorder_index(), Some(0));
        // Moving down, the index counts the block as already removed.
        assert_eq!(slot(5).reorder_index(), Some(4));
    }

    #[test]
    fn slash_menu_filters_navigates_and_converts_blocks() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        empty_paragraph(&session, "t-empty", 2);

        session.overlay(OverlayEvent::OpenSlashMenu {
            block_id: "t-empty".to_string(),
            utf16_offset: 0,
            anchor: None,
        });
        // Opening mounts on its first frame with live hitboxes and minimal non-zero opacity.
        let first = session.frame();
        let first_menu = element(&first, "overlay.slash_menu");
        assert!(first_menu.opacity > 0.0 && first_menu.opacity <= 0.02);
        assert!(first_menu.interactive);
        let opened = session.settle();
        assert_no_violations(&opened, "slash menu");
        let menu = element(&opened, "overlay.slash_menu");
        assert_eq!(menu.opacity, 1.0);
        assert!(menu.interactive);
        assert_eq!((menu.corner_radius, menu.padding), (8.0, 4.0));
        let block = element(&opened, "page.block.t-empty").bounds;
        // Below the caret of the empty paragraph, starting at its left edge.
        assert_eq!(menu.bounds.x, block.x);
        assert_eq!(menu.bounds.y, block.bottom() + POPOVER_GAP);
        assert_eq!(menu.bounds.width, SLASH_MENU_WIDTH);
        // The query row, the capped list, and the padding around them; no border.
        assert_eq!(menu.bounds.height, 28.0 + SLASH_LIST_MAX_HEIGHT + 8.0);
        let first_item = element(&opened, "overlay.slash_menu.item.text");
        assert!(first_item.focused && first_item.interactive);
        // Rows sit flush inside the padding and round concentrically with the menu.
        assert_eq!(first_item.bounds.x, menu.bounds.x + 4.0);
        assert_eq!(first_item.corner_radius, 4.0);
        assert_eq!(first_item.bounds.height, 32.0);
        assert_eq!(
            element(&opened, "overlay.slash_menu.group.basic").bounds.y,
            element(&opened, "overlay.slash_menu.query").bounds.bottom()
        );

        // Up wraps to the last item and scrolls it into view; Down wraps back.
        session.key("up");
        let wrapped = session.frame();
        assert_no_violations(&wrapped, "slash menu scrolled");
        assert!(element(&wrapped, "overlay.slash_menu.item.toggle").focused);
        assert!(
            !wrapped
                .elements
                .contains_key("overlay.slash_menu.item.text")
        );
        let menu_bounds = element(&wrapped, "overlay.slash_menu").bounds;
        assert!(
            element(&wrapped, "overlay.slash_menu.item.toggle")
                .bounds
                .bottom()
                <= menu_bounds.bottom()
        );
        session.key("down");
        assert!(element(&session.frame(), "overlay.slash_menu.item.text").focused);
        session.key("down");
        let second = session.frame();
        assert!(element(&second, "overlay.slash_menu.item.h1").focused);
        assert!(!element(&second, "overlay.slash_menu.item.text").focused);

        // A menu opened on its own keeps its filter to itself: typing filters, Backspace
        // widens, and the document is left alone.
        session.type_text("h2");
        assert_eq!(session.slash_query().as_deref(), Some("h2"));
        assert_eq!(session.text("t-empty").plain, "");
        let filtered = session.frame();
        assert_no_violations(&filtered, "slash menu filtered");
        assert!(element(&filtered, "overlay.slash_menu.item.h2").focused);
        assert!(!filtered.elements.contains_key("overlay.slash_menu.item.h1"));
        assert_eq!(
            element(&filtered, "overlay.slash_menu.query")
                .text
                .as_deref(),
            Some("h2")
        );
        session.key("backspace");
        let widened = session.frame();
        for id in ["h1", "h2", "h3", "h4", "h5", "h6"] {
            element(&widened, &format!("overlay.slash_menu.item.{id}"));
        }
        assert!(
            !widened
                .elements
                .contains_key("overlay.slash_menu.item.text")
        );

        // Enter turns the empty paragraph into the heading in place and closes the menu.
        session.type_text("2");
        session.key("enter");
        assert!(matches!(
            session.node("t-empty").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::H2,
                ..
            })
        ));
        assert_eq!(session.children("showcase-note")[2], "t-empty");
        assert_eq!(session.slash_query(), None);
        let closed = session.settle();
        assert!(!closed.elements.contains_key("overlay.slash_menu"));
        assert_no_violations(&closed, "slash menu closed");
        // The caret sits in the converted block.
        assert_eq!(session.caret(), Some(("t-empty".to_string(), 0)));
        element(&closed, "page.local_caret");
        let count = session.children("showcase-note").len();

        // A block with text is converted as well and keeps its text; across flavours it
        // becomes a fresh block in the same place.
        let quote_index = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "showcase-quote")
            .expect("quote");
        let quote_text = session.text("showcase-quote").plain;
        session.open_slash("showcase-quote");
        session.type_text("todo");
        let filtered = session.frame();
        session.click(&filtered, "overlay.slash_menu.item.todo");
        let children = session.children("showcase-note");
        assert_eq!(children.len(), count);
        let converted = children[quote_index].clone();
        assert_ne!(converted, "showcase-quote");
        assert!(session.node("showcase-quote").is_none());
        assert!(matches!(
            session.node(&converted).map(|node| node.content),
            Some(BlockContent::List {
                kind: ListType::Todo,
                checked: false,
                ..
            })
        ));
        assert_eq!(session.text(&converted).plain, quote_text);
        assert_eq!(session.slash_query(), None);
        assert_eq!(session.caret(), Some((converted.clone(), 0)));
        // One undo takes the whole command back.
        session.undo();
        assert_eq!(
            session.children("showcase-note")[quote_index],
            "showcase-quote"
        );
        assert!(session.node(&converted).is_none());
        assert_eq!(session.text("showcase-quote").plain, quote_text);

        // No results: one quiet row instead of a collapsed menu. `Tab` and the arrows do
        // nothing, and `Enter` closes the menu without touching the block.
        session.settle();
        session.open_slash("showcase-quote");
        session.type_text("zzz");
        let empty = session.frame();
        assert_no_violations(&empty, "slash menu without results");
        let row = element(&empty, "overlay.slash_menu.empty");
        assert_eq!(row.text.as_deref(), Some("No results"));
        assert_eq!(row.bounds.height, 32.0);
        assert!(element(&empty, "overlay.slash_menu").bounds.height >= 32.0 + 28.0);
        let written = session.written();
        session.key("down");
        session.key("tab");
        assert_eq!(session.slash_query().as_deref(), Some("zzz"));
        session.key("enter");
        assert_eq!(session.slash_query(), None);
        assert_eq!(session.written(), written);
        assert_eq!(session.children("showcase-note").len(), count);

        // Backspace on an empty filter and a click outside both dismiss the menu.
        session.settle();
        session.open_slash("showcase-quote");
        session.key("backspace");
        assert_eq!(session.slash_query(), None);
        session.settle();
        let opened = session.open_slash("showcase-quote");
        session.click(&opened, "page.title_block");
        assert_eq!(session.slash_query(), None);
        assert!(!session.settle().elements.contains_key("overlay.slash_menu"));
    }

    #[test]
    fn typing_a_slash_filters_in_the_document_and_runs_as_one_undo_step() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        empty_paragraph(&session, "t-empty", 2);
        let caret_in = |block: &str| {
            session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
                block, 0,
            ))));
            session.frame();
        };
        let heading = |id: &str| {
            matches!(
                session.node(id).map(|node| node.content),
                Some(BlockContent::Paragraph {
                    kind: ParagraphType::H2,
                    ..
                })
            )
        };

        // `/` typed into a paragraph opens the menu on that character; what follows is
        // both document text and the menu's filter, so the menu shows no query row.
        caret_in("t-empty");
        session.insert("/");
        let menu = session
            .view(|view, _| view.overlays().slash_menu().cloned())
            .expect("typed slash menu");
        assert!(menu.query_in_document);
        assert_eq!((menu.block_id.as_str(), menu.utf16_offset), ("t-empty", 0));
        session.insert("h2");
        assert_eq!(session.text("t-empty").plain, "/h2");
        assert_eq!(session.slash_query().as_deref(), Some("h2"));
        let typed = session.settle();
        assert_no_violations(&typed, "typed slash menu");
        assert!(!typed.elements.contains_key("overlay.slash_menu.query"));
        assert!(element(&typed, "overlay.slash_menu.item.h2").focused);
        let caret = element(&typed, "page.local_caret").bounds;
        let menu_bounds = element(&typed, "overlay.slash_menu").bounds;
        assert!(menu_bounds.x <= caret.x && menu_bounds.y >= caret.bottom());

        // Backspace edits the document, and the filter follows.
        session.key("backspace");
        assert_eq!(session.text("t-empty").plain, "/h");
        assert_eq!(session.slash_query().as_deref(), Some("h"));
        session.insert("2");

        // Enter removes the typed text and converts the paragraph in place.
        session.key("enter");
        assert!(heading("t-empty"));
        assert_eq!(session.text("t-empty").plain, "");
        assert_eq!(session.caret(), Some(("t-empty".to_string(), 0)));
        assert_eq!(session.slash_query(), None);
        // One undo restores the typed command in the original paragraph.
        session.undo();
        assert!(!heading("t-empty"));
        assert_eq!(session.text("t-empty").plain, "/h2");
        assert_eq!(session.caret(), Some(("t-empty".to_string(), 3)));
        assert_eq!(session.slash_query(), None);

        // A numbered list replaces the empty paragraph with a fresh block that a peer
        // receives; the following numbered item is renumbered after it.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
            block_id: "t-empty".to_string(),
            start_utf16: 0,
            end_utf16: 3,
        })));
        session.key("backspace");
        assert_eq!(session.text("t-empty").plain, "");
        let numbered_at = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "showcase-numbered-1")
            .expect("numbered item");
        session.edit(|page| {
            page.reparent_block(
                "t-empty",
                "showcase-note",
                "showcase-note",
                numbered_at as u64 - 1,
                2_000_100,
            )
            .expect("move the empty paragraph before the numbered list");
        });
        let slot = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "t-empty")
            .expect("empty paragraph");
        caret_in("t-empty");
        session.insert("/num");
        assert_eq!(session.slash_query().as_deref(), Some("num"));
        session.key("enter");
        assert!(session.node("t-empty").is_none());
        let fresh = session.children("showcase-note")[slot].clone();
        let order = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::List {
                kind: ListType::Numbered,
                order,
                ..
            }) => order,
            other => panic!("{id} is not a numbered item: {other:?}"),
        };
        assert_eq!(order(&fresh), Some(1));
        assert_eq!(order("showcase-numbered-1"), Some(2));
        assert_eq!(session.caret(), Some((fresh.clone(), 0)));
        let mut peer = PageDocSession::new(HOME_PAGE_ID, 4242).expect("peer");
        let update = session.view(|view, _| {
            view.document()
                .workspace
                .page(HOME_PAGE_ID)
                .expect("page")
                .encode_update_v1()
                .expect("update")
        });
        peer.apply_remote_update_v1(&update).expect("peer applies");
        assert_eq!(
            peer.read_unknown_block(&fresh)
                .expect("fresh block")
                .flavour,
            "affine:list"
        );
        session.undo();
        assert_eq!(session.text("t-empty").plain, "/num");
        assert!(session.node(&fresh).is_none());
        assert_eq!(order("showcase-numbered-1"), Some(1));

        // Escape closes the menu and leaves the typed text as text; whitespace after the
        // command closes it too, and so does moving the caret away.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-quote",
            0,
        ))));
        session.insert("/co");
        assert_eq!(session.slash_query().as_deref(), Some("co"));
        session.key("escape");
        assert_eq!(session.slash_query(), None);
        assert!(session.text("showcase-quote").plain.starts_with("/coEvery"));
        session.insert("/x");
        assert_eq!(session.slash_query().as_deref(), Some("x"));
        session.insert(" ");
        assert_eq!(session.slash_query(), None);
        session.insert("/");
        assert!(session.slash_query().is_some());
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-h1",
            0,
        ))));
        assert_eq!(session.slash_query(), None);

        // A divider goes right below the block. With a text block after it the caret
        // moves on to that block.
        empty_paragraph(&session, "t-rule", 0);
        caret_in("t-rule");
        session.insert("/div");
        session.key("enter");
        let children = session.children("showcase-note");
        assert_eq!(children[0], "t-rule");
        assert_eq!(session.text("t-rule").plain, "");
        assert!(matches!(
            session.node(&children[1]).map(|node| node.content),
            Some(BlockContent::Divider)
        ));
        assert_eq!(children[2], "showcase-h1");
        assert_eq!(session.caret(), Some(("showcase-h1".to_string(), 0)));
        session.undo();
        assert_eq!(session.text("t-rule").plain, "/div");
        assert_eq!(session.children("showcase-note")[1], "showcase-h1");

        // Before a block that holds no text the caret stays where the command was typed.
        let before_divider = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "showcase-divider")
            .expect("divider");
        empty_paragraph(&session, "t-stay", before_divider as u64);
        caret_in("t-stay");
        session.insert("/div");
        session.key("enter");
        let children = session.children("showcase-note");
        assert_eq!(children[before_divider], "t-stay");
        assert!(matches!(
            session
                .node(&children[before_divider + 1])
                .map(|node| node.content),
            Some(BlockContent::Divider)
        ));
        assert_eq!(children[before_divider + 2], "showcase-divider");
        assert_eq!(session.caret(), Some(("t-stay".to_string(), 0)));

        // After the last block of its parent the divider is followed by an empty
        // paragraph to go on typing in; one undo takes both back.
        let last = session.children("showcase-note").len();
        empty_paragraph(&session, "t-last", last as u64);
        caret_in("t-last");
        session.insert("/div");
        session.key("enter");
        let children = session.children("showcase-note");
        assert_eq!(children.len(), last + 3);
        assert_eq!(children[last], "t-last");
        assert!(matches!(
            session.node(&children[last + 1]).map(|node| node.content),
            Some(BlockContent::Divider)
        ));
        let trailing = children[last + 2].clone();
        assert!(matches!(
            session.node(&trailing).map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::Text,
                ..
            })
        ));
        assert_eq!(session.text(&trailing).plain, "");
        assert_eq!(session.caret(), Some((trailing, 0)));
        session.undo();
        assert_eq!(session.children("showcase-note").len(), last + 1);
        assert_eq!(session.text("t-last").plain, "/div");

        // A block with other text is converted with that text: `Buy milk/todo` becomes a
        // to-do item reading `Buy milk`, the caret where the command was typed, and one
        // undo restores the paragraph as typed.
        caret_in("t-rule");
        session.command("a");
        session.key("backspace");
        session.insert("Buy milk/todo");
        assert_eq!(session.slash_query().as_deref(), Some("todo"));
        session.key("enter");
        assert!(session.node("t-rule").is_none());
        let item = session.children("showcase-note")[0].clone();
        assert!(matches!(
            session.node(&item).map(|node| node.content),
            Some(BlockContent::List {
                kind: ListType::Todo,
                checked: false,
                ..
            })
        ));
        assert_eq!(session.text(&item).plain, "Buy milk");
        assert_eq!(session.caret(), Some((item.clone(), 8)));
        session.undo();
        assert!(session.node(&item).is_none());
        assert!(matches!(
            session.node("t-rule").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::Text,
                ..
            })
        ));
        assert_eq!(session.text("t-rule").plain, "Buy milk/todo");
        assert_eq!(session.caret(), Some(("t-rule".to_string(), 13)));

        // Code takes the text along too.
        session.command("a");
        session.key("backspace");
        session.insert("Intro /code");
        session.key("enter");
        let code = session.children("showcase-note")[0].clone();
        assert!(matches!(
            session.node(&code).map(|node| node.content),
            Some(BlockContent::Code { text, .. }) if text == "Intro "
        ));
        assert_eq!(session.caret(), Some((code, 6)));
        session.undo();
        assert_eq!(session.text("t-rule").plain, "Intro /code");

        // Inside a code block and in the title a `/` is just a character.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            0,
        ))));
        session.insert("/");
        assert_eq!(session.slash_query(), None);
        assert_no_violations(&session.settle(), "after typed slash commands");
    }

    #[test]
    fn format_toolbar_toggles_marks_alignment_and_links() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let block = "showcase-quote";
        let (start, end) = session.select(block, "Every block");
        let marks = || marks_in_range(&session.text(block), start, end);
        let frame = session.settle();
        assert_no_violations(&frame, "format toolbar");
        assert!(session.view(|view, _| view.overlays().format_toolbar_open()));

        let toolbar = element(&frame, "overlay.format_toolbar");
        assert_eq!(toolbar.opacity, 1.0);
        assert_eq!((toolbar.corner_radius, toolbar.padding), (8.0, 4.0));
        // Above the selection's first line with the popover gap, centered on it.
        let selection = element(&frame, "page.selection").bounds;
        assert_eq!(toolbar.bounds.bottom() + POPOVER_GAP, selection.y);
        assert!((center(toolbar.bounds).0 - center(selection).0).abs() <= 1.0);
        for action in FormatAction::ALL {
            let button = element(&frame, &format!("overlay.format_toolbar.{}", action.id()));
            assert!(button.interactive, "{action:?}");
            assert!(
                button.bounds.width >= 28.0 && button.bounds.height >= 28.0,
                "{action:?}"
            );
            assert_eq!(button.corner_radius, 4.0, "{action:?}");
            assert_eq!(
                button.focused,
                action == FormatAction::AlignLeft,
                "{action:?}"
            );
        }
        // Buttons sit edge to edge, so the pointer never falls between two of them.
        let bold = element(&frame, "overlay.format_toolbar.bold").bounds;
        let italic = element(&frame, "overlay.format_toolbar.italic").bounds;
        assert_eq!(bold.right(), italic.x);

        // Every mark toggles on, shows as active, and one undo takes it off again.
        for (action, read) in [
            (
                FormatAction::Bold,
                (|marks: &MarkState| marks.bold) as fn(&MarkState) -> bool,
            ),
            (FormatAction::Italic, |marks| marks.italic),
            (FormatAction::Underline, |marks| marks.underline),
            (FormatAction::Strike, |marks| marks.strike),
            (FormatAction::Code, |marks| marks.code),
        ] {
            let id = format!("overlay.format_toolbar.{}", action.id());
            assert!(!read(&marks()), "{action:?}");
            session.click(&session.frame(), &id);
            assert!(read(&marks()), "{action:?} on");
            let active = session.frame();
            assert_no_violations(&active, "format toolbar active");
            assert!(element(&active, &id).focused, "{action:?}");
            session.undo();
            assert!(!read(&marks()), "{action:?} undone");
            assert!(!element(&session.frame(), &id).focused, "{action:?}");
            // A second click on an active mark clears it.
            session.click(&session.frame(), &id);
            session.click(&session.frame(), &id);
            assert!(!read(&marks()), "{action:?} off");
        }
        // The selection outlives the edits.
        assert_eq!(
            session.selection(),
            Some((
                block.to_string(),
                start as u64,
                block.to_string(),
                end as u64
            ))
        );

        // Alignment is a block property, undone in one step.
        let align = || match session.node(block).map(|node| node.content) {
            Some(BlockContent::Paragraph { text_align, .. }) => text_align,
            _ => None,
        };
        assert_eq!(align(), None);
        session.click(&session.frame(), "overlay.format_toolbar.align_center");
        assert_eq!(align(), Some(BlockAlign::Center));
        let centered = session.frame();
        assert!(element(&centered, "overlay.format_toolbar.align_center").focused);
        assert!(!element(&centered, "overlay.format_toolbar.align_left").focused);
        session.undo();
        assert_eq!(align(), None);
        session.click(&session.frame(), "overlay.format_toolbar.align_right");
        assert_eq!(align(), Some(BlockAlign::Right));
        session.click(&session.frame(), "overlay.format_toolbar.align_left");
        assert_eq!(align(), Some(BlockAlign::Left));

        // The link field opens attached to the toolbar and takes the keyboard.
        let before = session.frame();
        assert!(
            !before
                .elements
                .contains_key("overlay.format_toolbar.link_input")
        );
        session.click(&before, "overlay.format_toolbar.link");
        let linking = session.frame();
        assert_no_violations(&linking, "link field");
        let field = element(&linking, "overlay.format_toolbar.link_input");
        // The field's caret is the only one: the document keeps its selection wash.
        element(&before, "page.local_caret");
        element(&linking, "page.selection");
        assert!(!linking.elements.contains_key("page.local_caret"));
        let grown = element(&linking, "overlay.format_toolbar").bounds;
        let single = element(&before, "overlay.format_toolbar").bounds;
        assert_eq!(grown.height, single.height + 32.0);
        assert!(
            field.bounds.y
                >= element(&linking, "overlay.format_toolbar.bold")
                    .bounds
                    .bottom()
        );
        for id in ["link_apply", "link_remove"] {
            let button = element(&linking, &format!("overlay.format_toolbar.{id}"));
            assert!(button.interactive && button.bounds.height >= 28.0, "{id}");
        }
        let text_before = session.text(block).plain;
        // Typed keys reach the field as text through the input handler, like text from
        // an input method, and none of it reaches the document.
        session.type_text("affine.pro/x");
        session.key("backspace");
        session.key("backspace");
        session.insert("/d");
        assert_eq!(
            session.view(|view, _| view.overlays().link_url().map(str::to_string)),
            Some("affine.pro/d".to_string())
        );
        assert_eq!(session.text(block).plain, text_before);
        assert_eq!(session.slash_query(), None);
        session.key("enter");
        assert_eq!(marks().link.as_deref(), Some("https://affine.pro/d"));
        let linked = session.frame();
        assert!(
            !linked
                .elements
                .contains_key("overlay.format_toolbar.link_input")
        );
        assert!(element(&linked, "overlay.format_toolbar.link").focused);
        session.undo();
        assert_eq!(marks().link, None);

        // Opened over a link the field shows it; Apply rewrites it and Remove clears it.
        session.click(&session.frame(), "overlay.format_toolbar.link");
        session.type_text("affine.pro");
        session.click(&session.frame(), "overlay.format_toolbar.link_apply");
        assert_eq!(marks().link.as_deref(), Some("https://affine.pro"));
        session.click(&session.frame(), "overlay.format_toolbar.link");
        assert_eq!(
            session.view(|view, _| view.overlays().link_url().map(str::to_string)),
            Some("https://affine.pro".to_string())
        );
        session.overlay(OverlayEvent::Paste("/docs".to_string()));
        session.click(&session.frame(), "overlay.format_toolbar.link_apply");
        assert_eq!(marks().link.as_deref(), Some("https://affine.pro/docs"));
        session.click(&session.frame(), "overlay.format_toolbar.link");
        session.click(&session.frame(), "overlay.format_toolbar.link_remove");
        assert_eq!(marks().link, None);

        // Without a selection the toolbar fades out without handlers and unmounts.
        session.overlay(OverlayEvent::SetSelection(None));
        session.frame();
        assert!(!session.view(|view, _| view.overlays().format_toolbar_open()));
        session.platform.advance_clock(Duration::from_millis(50));
        let fading = session.frame();
        assert_no_violations(&fading, "format toolbar fading");
        let toolbar = element(&fading, "overlay.format_toolbar");
        assert!(toolbar.opacity > 0.0 && toolbar.opacity < 1.0);
        assert!(!element(&fading, "overlay.format_toolbar.bold").interactive);
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
    }

    #[test]
    fn format_toolbar_spans_blocks_and_stays_away_from_code_and_the_title() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let select = |anchor: (&str, u64), focus: (&str, u64)| {
            session.update(|view, window, cx| {
                view.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new(anchor.0, anchor.1),
                        focus: DocPoint::new(focus.0, focus.1),
                    },
                    window,
                    cx,
                );
            });
            session.settle()
        };
        let bold =
            |id: &str, from: usize, to: usize| marks_in_range(&session.text(id), from, to).bold;

        // From the middle of one list item to the middle of the next.
        let frame = select(("showcase-numbered-1", 6), ("showcase-numbered-2", 6));
        assert_no_violations(&frame, "cross-block toolbar");
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        let first = element(&frame, "page.block.showcase-numbered-1").bounds;
        assert_eq!(toolbar.bottom() + POPOVER_GAP, first.y);
        session.click(&frame, "overlay.format_toolbar.bold");
        assert!(bold("showcase-numbered-1", 6, 10) && bold("showcase-numbered-2", 0, 6));
        assert!(!bold("showcase-numbered-1", 0, 6));
        assert!(element(&session.frame(), "overlay.format_toolbar.bold").focused);
        // Alignment reaches every selected block, and all of it is one undo step each.
        session.click(&session.frame(), "overlay.format_toolbar.align_right");
        let aligned = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::List { text_align, .. }) => text_align,
            _ => None,
        };
        assert_eq!(aligned("showcase-numbered-1"), Some(BlockAlign::Right));
        assert_eq!(aligned("showcase-numbered-2"), Some(BlockAlign::Right));
        session.undo();
        assert_eq!(aligned("showcase-numbered-1"), None);
        assert_eq!(aligned("showcase-numbered-2"), None);
        session.undo();
        assert!(!bold("showcase-numbered-1", 6, 10) && !bold("showcase-numbered-2", 0, 6));

        // Code and the title carry no inline marks: no toolbar over them.
        let frame = select(("showcase-code", 0), ("showcase-code", 7));
        assert!(!frame.elements.contains_key("overlay.format_toolbar"));
        let frame = select(("showcase-page", 0), ("showcase-page", 6));
        assert!(!frame.elements.contains_key("overlay.format_toolbar"));
        // A composition in progress keeps it away as well.
        select(("showcase-quote", 0), ("showcase-quote", 5));
        assert!(session.view(|view, _| view.overlays().format_toolbar_open()));
        session.update(|view, window, cx| {
            view.replace_and_mark_text_in_range(None, "ni", None, window, cx);
        });
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
    }

    #[test]
    fn format_toolbar_flips_below_a_selection_under_the_top_bar() {
        let session = open(1280, 800, PlaygroundTheme::Dark);
        let block_y = session.view(|view, _| {
            view.flow_layout()
                .and_then(|layout| layout.block("showcase-quote").map(|block| block.y))
                .expect("quote")
        });
        session.scroll(640.0, 400.0, 0.0, -block_y);
        session.select("showcase-quote", "block below");
        // Selecting brought the caret into view; put the line under the top bar again.
        session.frame();
        let scrolled = session.view(|view, _| view.scroll_offset());
        session.scroll(640.0, 400.0, 0.0, scrolled - block_y);
        let frame = session.settle();
        assert_no_violations(&frame, "flipped toolbar");
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        let selection = element(&frame, "page.selection").bounds;
        assert!(selection.y - TOPBAR_HEIGHT < toolbar.height + 2.0 * POPOVER_GAP);
        assert_eq!(toolbar.y, selection.bottom() + POPOVER_GAP);

        // Scrolled back, the same selection has room above again.
        session.scroll(640.0, 400.0, 0.0, block_y);
        let frame = session.settle();
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        let selection = element(&frame, "page.selection").bounds;
        assert_eq!(toolbar.bottom() + POPOVER_GAP, selection.y);
    }

    #[test]
    fn dragging_over_text_selects_it_and_opens_the_toolbar() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let frame = session.frame();
        let quote = element(&frame, "page.block.showcase-quote").bounds;
        let (x, y) = (quote.x + 18.0, quote.y + 23.0);

        // A click places the caret; the toolbar waits for a selection.
        session.press(x, y, 1);
        session.release(x, y);
        assert_eq!(session.caret(), Some(("showcase-quote".to_string(), 0)));
        let placed = session.settle();
        assert!(!placed.elements.contains_key("overlay.format_toolbar"));
        element(&placed, "page.local_caret");

        // Dragging extends the selection; the toolbar opens once the button is released.
        session.press(x, y, 1);
        session.pointer(x + 160.0, y, true);
        let (anchor, from, focus, to) = session.selection().expect("selection while dragging");
        assert_eq!(
            (anchor.as_str(), from, focus.as_str()),
            ("showcase-quote", 0, "showcase-quote")
        );
        assert!(to > 5);
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
        session.release(x + 160.0, y);
        let frame = session.settle();
        assert_no_violations(&frame, "mouse selection");
        assert!(session.view(|view, _| view.overlays().format_toolbar_open()));
        let wash = element(&frame, "page.selection").bounds;
        assert!(wash.x <= x && wash.right() >= x + 150.0 && wash.right() <= x + 175.0);
        // One caret and one wash: the editor paints the selection, the overlays do not.
        element(&frame, "page.local_caret");
        element(&frame, "overlay.format_toolbar");

        // Clicking a toolbar button keeps the selection and edits it; undo reverts it.
        session.click(&frame, "overlay.format_toolbar.bold");
        assert!(marks_in_range(&session.text("showcase-quote"), 0, to as usize).bold);
        assert_eq!(session.selection().map(|selection| selection.3), Some(to));
        session.undo();
        assert!(!marks_in_range(&session.text("showcase-quote"), 0, to as usize).bold);

        // A double click selects the word under the pointer and opens the toolbar at once.
        session.press(x + 22.0, y, 2);
        let (_, from, _, to) = session.selection().expect("word selection");
        let plain: Vec<u16> = session
            .text("showcase-quote")
            .plain
            .encode_utf16()
            .collect();
        let selected = String::from_utf16_lossy(&plain[from as usize..to as usize]);
        assert_eq!(selected, "Every");
        assert!(
            session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
        session.release(x + 22.0, y);

        // A click elsewhere collapses the selection and closes the toolbar.
        let heading = element(&session.frame(), "page.block.showcase-h1").bounds;
        let (away_x, away_y) = (heading.x + 300.0, heading.y + 18.0);
        session.press(away_x, away_y, 1);
        session.release(away_x, away_y);
        assert!(session.caret().is_some());
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
    }

    #[test]
    fn todo_toggle_heading_and_code_controls_edit_the_document() {
        let session = open(1280, 1700, PlaygroundTheme::Light);
        let frame = session.frame();
        assert_no_violations(&frame, "controls at rest");

        // To-do box: a 24px target over the box; clicking flips `prop:checked`.
        let checked = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::List { checked, .. }) => checked,
            _ => panic!("{id} is not a list item"),
        };
        let target = element(&frame, "page.block.showcase-todo-open.checkbox");
        assert!(target.interactive);
        assert_eq!((target.bounds.width, target.bounds.height), (24.0, 24.0));
        let row = element(&frame, "page.block.showcase-todo-open").bounds;
        assert_eq!(target.bounds.x, row.x);
        assert_eq!(center(target.bounds).1, row.y + 12.0);
        assert!(!checked("showcase-todo-open"));
        session.click(&frame, "page.block.showcase-todo-open.checkbox");
        assert!(checked("showcase-todo-open"));
        session.click(&frame, "page.block.showcase-todo-done.checkbox");
        assert!(!checked("showcase-todo-done"));
        // The click neither placed a caret nor moved the box.
        assert_eq!(session.selection(), None);
        let after = session.frame();
        assert_eq!(
            element(&after, "page.block.showcase-todo-open.checkbox").bounds,
            target.bounds
        );
        // Each click is its own undo step.
        session.undo();
        assert!(checked("showcase-todo-done") && checked("showcase-todo-open"));
        session.undo();
        assert!(!checked("showcase-todo-open"));

        // Toggle chevron: expanding lays the child out; the chevron turns for 150 ms.
        let collapsed = |id: &str| match session.node(id).map(|node| node.content) {
            Some(
                BlockContent::List { collapsed, .. } | BlockContent::Paragraph { collapsed, .. },
            ) => collapsed,
            _ => panic!("{id} cannot collapse"),
        };
        let laid_out = |id: &str| {
            session.view(|view, _| {
                view.flow_layout()
                    .is_some_and(|layout| layout.block(id).is_some())
            })
        };
        let turning = |id: &str| session.view(|view, _| view.overlays().chevron_turning(id));
        assert!(collapsed("showcase-toggle-closed"));
        assert!(!laid_out("showcase-toggle-closed-child"));
        session.click(&after, "page.block.showcase-toggle-closed.toggle");
        assert!(!collapsed("showcase-toggle-closed"));
        assert!(turning("showcase-toggle-closed"));
        session.platform.advance_clock(Duration::from_millis(60));
        let mid = session.frame();
        assert_no_violations(&mid, "chevron turning");
        assert!(laid_out("showcase-toggle-closed-child"));
        assert!(turning("showcase-toggle-closed"));
        let settled = session.settle();
        assert!(!turning("showcase-toggle-closed"));
        session.click(&settled, "page.block.showcase-toggle-closed.toggle");
        assert!(collapsed("showcase-toggle-closed"));
        session.settle();
        assert!(!laid_out("showcase-toggle-closed-child"));

        // Heading chevron: shown on the heading's row only, in the gutter beside it.
        let frame = session.frame();
        assert!(
            !frame
                .elements
                .contains_key("page.block.showcase-h2.collapse")
        );
        let heading = element(&frame, "page.block.showcase-h2").bounds;
        let (heading_x, heading_y) = center(heading);
        session.pointer(heading_x, heading_y, false);
        let hovered = session.frame();
        assert_no_violations(&hovered, "heading hovered");
        let chevron = element(&hovered, "page.block.showcase-h2.collapse");
        assert!(chevron.interactive);
        assert_eq!((chevron.bounds.width, chevron.bounds.height), (24.0, 24.0));
        assert_eq!(chevron.bounds.right(), heading.x);
        assert_eq!(center(chevron.bounds).1, heading_y);
        session.click(&hovered, "page.block.showcase-h2.collapse");
        assert!(collapsed("showcase-h2"));
        assert!(turning("showcase-h2"));
        session.settle();
        // The section under the heading is hidden up to the end of the page here.
        assert!(!laid_out("showcase-quote"));
        // Collapsed, the marker stays clickable without the pointer on the row.
        session.pointer(900.0, 60.0, false);
        let away = session.frame();
        assert_no_violations(&away, "heading collapsed");
        session.click(&away, "page.block.showcase-h2.collapse");
        assert!(!collapsed("showcase-h2"));
        session.settle();
        assert!(laid_out("showcase-quote"));

        // Code block: the copy button shows on hover, copies, and reads `Copied` for 1.5 s.
        let frame = session.frame();
        assert!(!frame.elements.contains_key("page.block.showcase-code.copy"));
        let code = element(&frame, "page.block.showcase-code").bounds;
        let (code_x, code_y) = center(code);
        session.pointer(code_x, code_y, false);
        let hovered = session.frame();
        assert_no_violations(&hovered, "code hovered");
        let copy = element(&hovered, "page.block.showcase-code.copy");
        assert_eq!(copy.text.as_deref(), Some("Copy"));
        assert!(copy.interactive);
        assert_eq!((copy.bounds.width, copy.bounds.height), (28.0, 28.0));
        assert_eq!(copy.bounds.right(), code.right() - 4.0);
        assert_eq!(copy.bounds.y, code.y + 4.0);
        session.click(&hovered, "page.block.showcase-code.copy");
        let clipboard = session
            .app
            .update(|cx| cx.read_from_clipboard().and_then(|item| item.text()));
        assert_eq!(
            clipboard.as_deref(),
            Some("fn main() {\n    println!(\"hello, blocks\");\n}")
        );
        let copied = session.frame();
        assert_no_violations(&copied, "code copied");
        let label = element(&copied, "page.block.showcase-code.copy");
        assert_eq!(label.text.as_deref(), Some("Copied"));
        assert_eq!(label.bounds.right(), code.right() - 4.0);
        // The label holds on the scheduler clock, also with the pointer gone.
        session.pointer(900.0, 60.0, false);
        session.platform.advance_clock(Duration::from_millis(1_400));
        session.platform.run_until_parked();
        assert_eq!(
            element(&session.frame(), "page.block.showcase-code.copy")
                .text
                .as_deref(),
            Some("Copied")
        );
        session.platform.advance_clock(Duration::from_millis(200));
        session.platform.run_until_parked();
        assert!(
            !session
                .frame()
                .elements
                .contains_key("page.block.showcase-code.copy")
        );
    }

    #[test]
    fn unwrapped_code_scrolls_sideways_within_its_lines() {
        let session = open(1280, 1700, PlaygroundTheme::Light);
        let long_line = format!("let long = \"{}\";\n", "x".repeat(200));
        session.edit(|page| {
            page.insert_text("showcase-code", "prop:text", 0, &long_line, 2_000_000)
                .expect("insert long line");
            page.set_block_prop(
                "showcase-code",
                "prop:wrap",
                SessionValue::Any(Any::False),
                2_000_001,
            )
            .expect("unwrap");
        });
        let frame = session.frame();
        assert_no_violations(&frame, "unwrapped code");
        let range = session.view(|view, _| {
            view.flow_layout()
                .and_then(|layout| {
                    layout
                        .block("showcase-code")
                        .and_then(|block| block.body.code_scroll)
                })
                .expect("the long line overflows the code area")
        });
        assert!(range.max_x > 100.0, "{range:?}");
        let scroll_x = || session.view(|view, _| view.overlays().code_scroll_x("showcase-code"));
        let code = element(&frame, "page.block.showcase-code").bounds;
        let (x, y) = center(code);

        session.scroll(x, y, -60.0, 0.0);
        assert_eq!(scroll_x(), 60.0);
        // The page did not move, and the block keeps its place.
        assert_eq!(
            element(&session.frame(), "page.block.showcase-code").bounds,
            code
        );
        // A mostly vertical scroll is the page's.
        session.scroll(x, y, -5.0, -40.0);
        assert_eq!(scroll_x(), 60.0);
        // Both ends clamp.
        session.scroll(x, y, -100_000.0, 0.0);
        assert_eq!(scroll_x(), range.max_x);
        session.scroll(x, y, 100_000.0, 0.0);
        assert_eq!(scroll_x(), 0.0);
        // Outside the code block nothing scrolls sideways.
        let title = center(element(&frame, "page.title_block").bounds);
        session.scroll(title.0, title.1, -60.0, 0.0);
        assert_eq!(scroll_x(), 0.0);

        // The caret takes the lines with it: at the end of the long line the block has
        // scrolled to its end and the caret sits inside the code area.
        let line_end = long_line.encode_utf16().count() - 1;
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            line_end,
        ))));
        let revealed = session.frame();
        assert_no_violations(&revealed, "caret in scrolled code");
        assert_eq!(scroll_x(), range.max_x);
        let caret = element(&revealed, "page.local_caret").bounds;
        assert!(caret.x > code.x + 52.0 && caret.right() <= code.right() - 18.0);
        // A click on the scrolled text lands on the character under the pointer.
        session.press(caret.x - 1.0, caret.y + 4.0, 1);
        session.release(caret.x - 1.0, caret.y + 4.0);
        let (_, clicked) = session.caret().expect("caret in code");
        assert!(clicked as usize + 1 >= line_end && clicked as usize <= line_end);
        // Back at the start of the line the block scrolls back.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            0,
        ))));
        session.frame();
        assert_eq!(scroll_x(), 0.0);

        // A wrapped code block has nothing to scroll.
        session.scroll(x, y, -60.0, 0.0);
        session.edit(|page| {
            page.set_block_prop(
                "showcase-code",
                "prop:wrap",
                SessionValue::Any(Any::True),
                2_000_002,
            )
            .expect("wrap");
        });
        assert_eq!(scroll_x(), 0.0);
        assert_no_violations(&session.frame(), "wrapped code");
    }

    #[test]
    fn drag_handle_reorders_a_block_among_its_siblings() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let frame = session.frame();
        assert!(!frame.elements.contains_key("overlay.drag_handle"));
        let geometry = page_geometry(1280.0);
        let quote = element(&frame, "page.block.showcase-quote").bounds;
        let (quote_x, quote_y) = center(quote);

        // The handle appears with the pointer, left of the block on its first line.
        session.pointer(quote_x, quote_y, false);
        let hovered = session.frame();
        assert_no_violations(&hovered, "drag handle");
        let handle = element(&hovered, "overlay.drag_handle");
        assert!(handle.interactive && handle.opacity == 1.0);
        assert_eq!((handle.bounds.width, handle.bounds.height), (24.0, 24.0));
        assert_eq!(handle.bounds.right(), geometry.column_x);
        assert_eq!(center(handle.bounds).1, quote.y + 10.0 + 13.0);
        assert_eq!(handle.text.as_deref(), Some("showcase-quote"));
        assert!(!hovered.elements.contains_key("overlay.drop_indicator"));
        // On the block's row the handle is a bar; with the pointer on the handle itself
        // it turns into its dots, and back when the pointer returns to the row.
        assert!(!session.view(|view, _| view.overlays().drag_handle_hot()));
        let on_handle = center(handle.bounds);
        session.pointer(on_handle.0, on_handle.1, false);
        assert!(session.view(|view, _| view.overlays().drag_handle_hot()));
        assert_no_violations(&session.frame(), "drag handle under the pointer");
        session.pointer(quote_x, quote_y, false);
        assert!(!session.view(|view, _| view.overlays().drag_handle_hot()));

        // Dragging shows the nearest slot among the block's siblings and selects no text.
        let (handle_x, handle_y) = center(handle.bounds);
        let first = element(&hovered, "page.block.showcase-numbered-1").bounds;
        let second = element(&hovered, "page.block.showcase-numbered-2").bounds;
        session.press(handle_x, handle_y, 1);
        assert_eq!(
            session.view(|view, _| view.overlays().dragged_block().map(str::to_string)),
            Some("showcase-quote".to_string())
        );
        session.pointer(handle_x, first.bottom() + 2.0, true);
        assert_eq!(session.selection(), None);
        let dragging = session.frame();
        assert_no_violations(&dragging, "drop indicator");
        let indicator = element(&dragging, "overlay.drop_indicator");
        assert!(!indicator.interactive);
        assert_eq!(indicator.bounds.height, DROP_INDICATOR_THICKNESS);
        assert_eq!(indicator.bounds.x, geometry.column_x);
        assert_eq!(indicator.bounds.width, geometry.column_width);
        assert!(indicator.bounds.y >= first.bottom() && indicator.bounds.bottom() <= second.y);
        assert!(element(&dragging, "overlay.drag_handle").focused);

        // Releasing moves the block there; one undo moves it back.
        let before = session.children("showcase-note");
        session.release(handle_x, first.bottom() + 2.0);
        let after = session.children("showcase-note");
        let position = |children: &[String], id: &str| {
            children
                .iter()
                .position(|child| child == id)
                .expect("child")
        };
        assert_eq!(after.len(), before.len());
        assert_eq!(
            position(&after, "showcase-quote"),
            position(&after, "showcase-numbered-1") + 1
        );
        assert_eq!(
            position(&after, "showcase-numbered-2"),
            position(&after, "showcase-quote") + 1
        );
        assert!(session.view(|view, _| view.overlays().dragged_block().is_none()));
        let dropped = session.frame();
        assert_no_violations(&dropped, "after drop");
        assert!(!dropped.elements.contains_key("overlay.drop_indicator"));
        let moved = element(&dropped, "page.block.showcase-quote").bounds;
        assert!(moved.y > element(&dropped, "page.block.showcase-numbered-1").bounds.y);
        session.undo();
        assert_eq!(session.children("showcase-note"), before);
        session.keystroke(Keystroke {
            modifiers: Modifiers {
                platform: true,
                control: true,
                shift: true,
                ..Modifiers::default()
            },
            key: "z".to_string(),
            key_char: None,
        });
        assert_eq!(session.children("showcase-note"), after);

        // Dropping a block into its own slot leaves the document alone.
        let dropped = session.frame();
        let moved = element(&dropped, "page.block.showcase-quote").bounds;
        let (x, y) = center(moved);
        session.pointer(x, y, false);
        let hovered = session.frame();
        let (handle_x, handle_y) = center(element(&hovered, "overlay.drag_handle").bounds);
        session.press(handle_x, handle_y, 1);
        session.pointer(handle_x, handle_y + 6.0, true);
        assert!(session.view(|view, _| view.overlays().drop_slot().is_some()));
        session.release(handle_x, handle_y + 6.0);
        assert_eq!(session.children("showcase-note"), after);

        // A nested block moves among its own siblings only.
        let frame = session.frame();
        let nested = center(element(&frame, "page.block.showcase-bullet-nested").bounds);
        session.pointer(nested.0, nested.1, false);
        let hovered = session.frame();
        let handle = element(&hovered, "overlay.drag_handle").bounds;
        assert_eq!(handle.right(), geometry.column_x + 24.0);
        session.press(center(handle).0, center(handle).1, 1);
        session.pointer(center(handle).0, 700.0, true);
        let slot = session
            .view(|view, _| view.overlays().drop_slot().cloned())
            .expect("slot");
        assert_eq!(slot.parent_id, "showcase-bullet");
        assert_eq!(slot.reorder_index(), None);
        session.release(center(handle).0, 700.0);
        assert_eq!(
            session.children("showcase-bullet"),
            ["showcase-bullet-nested"]
        );
    }

    #[test]
    fn narrow_windows_keep_the_handle_and_popovers_inside() {
        for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
            let session = open(320, 800, theme);
            let frame = session.frame();
            let intro = center(element(&frame, "page.block.showcase-intro").bounds);
            session.pointer(intro.0, intro.1, false);
            let hovered = session.frame();
            assert_no_violations(&hovered, "narrow handle");
            let handle = element(&hovered, "overlay.drag_handle").bounds;
            assert_eq!(handle.x, DRAG_HANDLE_MIN_X);
            assert_eq!(handle.width, 24.0);

            // A heading keeps the narrow gutter for its collapse chevron.
            let heading = center(element(&hovered, "page.block.showcase-h1").bounds);
            session.pointer(heading.0, heading.1, false);
            let hovered = session.frame();
            assert_no_violations(&hovered, "narrow heading");
            assert!(!hovered.elements.contains_key("overlay.drag_handle"));
            assert_eq!(
                element(&hovered, "page.block.showcase-h1.collapse")
                    .bounds
                    .x,
                0.0
            );

            // Popovers fit between the margins.
            session.select("showcase-intro", "y-octo document");
            let frame = session.settle();
            assert_no_violations(&frame, "narrow toolbar");
            let toolbar = element(&frame, "overlay.format_toolbar").bounds;
            assert!(toolbar.x >= POPOVER_EDGE_MARGIN);
            assert!(toolbar.right() <= 320.0 - POPOVER_EDGE_MARGIN);
            session.overlay(OverlayEvent::Format(FormatAction::Link));
            let frame = session.frame();
            assert_no_violations(&frame, "narrow link field");
            let field = element(&frame, "overlay.format_toolbar.link_input").bounds;
            assert!(field.width >= 100.0);

            let frame = session.open_slash("showcase-h1");
            assert_no_violations(&frame, "narrow slash menu");
            let menu = element(&frame, "overlay.slash_menu").bounds;
            assert_eq!(menu.width, SLASH_MENU_WIDTH);
            assert!(menu.x >= POPOVER_EDGE_MARGIN);
            assert!(menu.right() <= 320.0 - POPOVER_EDGE_MARGIN);
            // The toolbar gave way to the menu.
            assert!(!frame.elements.contains_key("overlay.format_toolbar"));
        }
    }

    #[test]
    fn link_field_edits_like_a_one_line_input() {
        let mut link = LinkBar::new("abc".to_string());
        assert_eq!((link.selection.clone(), link.reversed), (3..3, false));

        // A composition shows over the selection and leaves the URL alone until it
        // commits; abandoning it restores the selection.
        link.select(1..2);
        link.mark(None, "w", None);
        link.mark(None, "wen", Some(1..3));
        assert_eq!(link.text(), "awenc");
        assert_eq!(link.url(), "abc");
        assert_eq!(link.marked_range(), Some(1..4));
        assert_eq!(link.shown_selection(), (2..4, false));
        assert_eq!(link.text_for_range(1..4), ("wen".to_string(), 1..4));
        link.mark(None, "", None);
        assert_eq!(
            (link.text().as_str(), link.selection.clone()),
            ("abc", 1..2)
        );
        link.mark(None, "wen", None);
        link.replace(None, "文");
        assert_eq!((link.url(), link.selection.clone()), ("a文c", 2..2));
        assert!(!link.composing());
        link.mark(None, "x", None);
        link.unmark();
        assert_eq!(link.url(), "a文xc");

        // Control characters never get in: the field is one line.
        link.select(0..100);
        link.replace(None, "a\nb\tc");
        assert_eq!(link.url(), "abc");

        // Caret keys, with `Shift` extending and the command modifier jumping.
        assert!(link.key("home", false, false));
        assert_eq!(link.selection, 0..0);
        assert!(link.key("right", false, false));
        assert!(link.key("right", true, false));
        assert_eq!((link.selection.clone(), link.reversed), (1..2, false));
        assert!(link.key("left", true, false));
        assert!(link.key("left", true, false));
        assert_eq!((link.selection.clone(), link.reversed), (0..1, true));
        // An arrow collapses a selection to the side it points at.
        assert!(link.key("right", false, false));
        assert_eq!(link.selection, 1..1);
        assert!(link.key("end", true, false));
        assert_eq!(link.selection, 1..3);
        assert!(link.key("backspace", false, false));
        assert_eq!((link.url(), link.selection.clone()), ("a", 1..1));
        link.replace(None, "😀b");
        assert!(link.key("left", false, false));
        // A character outside the basic plane is two units and one step.
        assert!(link.key("left", false, false));
        assert_eq!(link.selection, 1..1);
        assert!(link.key("delete", false, false));
        assert_eq!(link.url(), "ab");
        assert!(link.key("a", false, true));
        assert_eq!(link.selection, 0..2);
        assert!(link.key("delete", false, false));
        assert_eq!(link.url(), "");
        // Anything else is not the field's key.
        assert!(!link.key("x", false, false));
        assert!(!link.key("a", false, false));
    }

    #[test]
    fn the_link_field_is_the_text_input_while_it_is_open() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let block = "showcase-quote";
        let (start, end) = session.select(block, "Every block");
        let frame = session.settle();
        let document_input = session.input();
        session.click(&frame, "overlay.format_toolbar.link");
        let written = session.written();
        let text = session.text(block).plain;
        let selection = session.selection();
        // The platform reads the field now, not the block.
        assert_eq!(session.input(), (String::new(), 0..0, None));

        session.insert("abc");
        assert_eq!(session.input(), ("abc".to_string(), 3..3, None));
        session.update(|view, window, cx| view.set_selected_text_range(1..2, window, cx));
        assert_eq!(session.input().1, 1..2);

        // Successive previews of a composition over the selected `b`: the field shows
        // them, the URL and the document stay as they are, and the toolbar stays up.
        for preview in ["w", "we", "wen"] {
            session.compose(preview);
        }
        assert_eq!(session.input(), ("awenc".to_string(), 4..4, Some(1..4)));
        assert_eq!(
            session.view(|view, _| view.overlays().link_url().map(str::to_string)),
            Some("abc".to_string())
        );
        assert!(!session.view(|view, _| view.editor.composing()));
        let composing = session.settle();
        assert_no_violations(&composing, "composition in the link field");
        assert_eq!(
            element(&composing, "overlay.format_toolbar.link_input")
                .text
                .as_deref(),
            Some("awenc")
        );
        // Candidates open at the field.
        let field = element(&composing, "overlay.format_toolbar.link_input").bounds;
        let bounds = session
            .update(|view, window, cx| view.bounds_for_range(1..4, Bounds::default(), window, cx))
            .expect("bounds of the composition");
        assert_eq!(
            (
                f32::from(bounds.origin.x),
                f32::from(bounds.origin.y),
                f32::from(bounds.size.width),
                f32::from(bounds.size.height)
            ),
            (field.x, field.y, field.width, field.height)
        );

        // The input method cancels: text and selection are back.
        session.compose("");
        assert_eq!(session.input(), ("abc".to_string(), 1..2, None));
        // `Escape` abandons a composition too, and keeps the field open.
        session.compose("wen");
        session.key("escape");
        assert_eq!(session.input(), ("abc".to_string(), 1..2, None));
        // Keys of a running composition are the input method's: `Enter` neither applies
        // the link nor splits the block.
        session.compose("wen");
        session.key("enter");
        assert_eq!(session.input().2, Some(1..4));
        // The commit lands once, over the selection.
        session.update(|view, window, cx| view.replace_text_in_range(None, "文", window, cx));
        assert_eq!(session.input(), ("a文c".to_string(), 2..2, None));

        // None of it wrote to the document or moved its selection.
        assert_eq!(session.written(), written);
        assert_eq!(session.text(block).plain, text);
        assert_eq!(session.selection(), selection);

        // Caret keys, typed keys and a keyboard paste all edit the field.
        session.command("a");
        session.type_text("x.io");
        session.key("home");
        session.key("delete");
        session.key("end");
        assert_eq!(session.input(), (".io".to_string(), 3..3, None));
        session.update(|_, _, cx| {
            cx.write_to_clipboard(ClipboardItem::new_string("/p\n".to_string()));
        });
        session.command("v");
        assert_eq!(session.input(), (".io/p".to_string(), 5..5, None));
        session.shift("left");
        session.command("x");
        assert_eq!(session.input(), (".io/".to_string(), 4..4, None));
        session.command("v");
        assert_eq!(session.input().0, ".io/p");
        assert_eq!(session.written(), written);
        assert_no_violations(&session.frame(), "edited link field");

        // `Enter` applies it as one edit, and the block is the text input again.
        session.key("enter");
        assert_ne!(session.written(), written);
        assert_eq!(
            marks_in_range(&session.text(block), start, end)
                .link
                .as_deref(),
            Some("https://.io/p")
        );
        assert_eq!(session.input(), document_input);

        // A press on the page closes the field unapplied.
        session.click(&session.frame(), "overlay.format_toolbar.link");
        session.insert("zzz");
        let heading = element(&session.frame(), "page.block.showcase-h1").bounds;
        session.press(heading.x + 40.0, heading.y + 18.0, 1);
        session.release(heading.x + 40.0, heading.y + 18.0);
        assert!(!session.view(|view, _| view.overlays().link_url().is_some()));
        assert_eq!(session.input().0, session.text("showcase-h1").plain);
    }

    #[test]
    fn a_typed_slash_follows_its_character_through_remote_edits() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let caret_in = |block: &str| {
            session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
                block, 0,
            ))));
            session.frame();
        };
        let menu = || {
            session.view(|view, _| {
                view.overlays()
                    .slash_menu()
                    .map(|menu| (menu.utf16_offset, menu.query.clone()))
            })
        };
        let insert = |peer: &mut PageDocSession, block: &str, at: u64, text: &str| {
            peer.insert_text(block, "prop:text", at, text, 3_000_000)
                .expect("peer inserts")
                .expect("commit")
                .update
        };
        let remove = |peer: &mut PageDocSession, block: &str, at: u64| {
            peer.remove_text(block, "prop:text", at, 1, 3_000_001)
                .expect("peer removes")
                .expect("commit")
                .update
        };

        // A peer types `X` in front of the `/` while `/h2` is being typed: the menu moves
        // along with its character, and running it removes `/h2` only.
        empty_paragraph(&session, "t-a", 2);
        caret_in("t-a");
        session.insert("/h2");
        assert_eq!(menu(), Some((0, "h2".to_string())));
        let mut peer = session.peer();
        session.receive(&insert(&mut peer, "t-a", 0, "X"));
        assert_eq!(session.text("t-a").plain, "X/h2");
        assert_eq!(menu(), Some((1, "h2".to_string())));
        assert_eq!(session.caret(), Some(("t-a".to_string(), 4)));
        let following = session.settle();
        assert_no_violations(&following, "slash menu after a remote edit");
        let caret = element(&following, "page.local_caret").bounds;
        assert!(element(&following, "overlay.slash_menu").bounds.x < caret.x);
        session.key("enter");
        assert!(matches!(
            session.node("t-a").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::H2,
                ..
            })
        ));
        assert_eq!(session.text("t-a").plain, "X");
        assert_eq!(session.caret(), Some(("t-a".to_string(), 1)));
        // Undo restores the typed command and keeps the peer's text.
        session.undo();
        assert!(matches!(
            session.node("t-a").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::Text,
                ..
            })
        ));
        assert_eq!(session.text("t-a").plain, "X/h2");

        // A peer deletes the `/`: the menu goes, and `Enter` is the document's again.
        empty_paragraph(&session, "t-b", 2);
        caret_in("t-b");
        session.insert("/h");
        assert_eq!(menu(), Some((0, "h".to_string())));
        session.send_to(&mut peer);
        session.receive(&remove(&mut peer, "t-b", 0));
        assert_eq!(session.text("t-b").plain, "h");
        assert_eq!(menu(), None);
        assert!(session.view(|view, _| view.editor.slash_trigger.is_none()));

        // A peer replaces the `/` by one of its own: the text reads the same, but it is
        // another character, and the menu does not run on it.
        empty_paragraph(&session, "t-c", 2);
        caret_in("t-c");
        session.insert("/h");
        session.send_to(&mut peer);
        let removed = remove(&mut peer, "t-c", 0);
        let typed = insert(&mut peer, "t-c", 0, "/");
        // Both arrive before the editor looks again, as one batch from the room.
        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                page.apply_remote_update_v1(&removed).expect("removal");
                page.apply_remote_update_v1(&typed).expect("insertion");
            });
        });
        session.frame();
        assert_eq!(session.text("t-c").plain, "/h");
        assert_eq!(menu(), None);
        let written = session.written();
        session.overlay(OverlayEvent::SlashExecute(0));
        assert_eq!(session.written(), written);
        assert_eq!(session.text("t-c").plain, "/h");
    }

    #[test]
    fn slash_menu_keys_never_reach_the_block() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        // A paragraph with a sibling before it, which `Tab` would indent it under.
        empty_paragraph(&session, "t-keys", 2);
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "t-keys", 0,
        ))));
        session.frame();
        let selected =
            || session.view(|view, _| view.overlays().slash_menu().map(|menu| menu.selected));
        let parent = |session: &Session| {
            session.view(|view, _| {
                let snapshot = view.page_snapshot().expect("page");
                find_parent(snapshot.root.as_ref().expect("root"), "t-keys")
                    .map(|(parent, index)| (parent.id.clone(), index))
            })
        };
        session.insert("/");
        let written = session.written();
        let place = parent(&session);

        // `Tab` and `Shift+Tab` step through the items.
        assert_eq!(selected(), Some(0));
        session.key("tab");
        session.key("tab");
        assert_eq!(selected(), Some(2));
        session.shift("tab");
        assert_eq!(selected(), Some(1));
        session.shift("tab");
        session.shift("tab");
        assert_eq!(selected(), Some(SLASH_ITEMS.len() - 1));
        assert_eq!(session.written(), written);
        assert_eq!(parent(&session), place);

        // Without a match they do nothing, and `Enter` closes the menu instead of
        // splitting the block.
        session.insert("zzz");
        let written = session.written();
        let count = session.children("showcase-note").len();
        session.key("tab");
        session.shift("tab");
        assert_eq!(session.slash_query().as_deref(), Some("zzz"));
        session.key("enter");
        assert_eq!(session.slash_query(), None);
        assert_eq!(session.written(), written);
        assert_eq!(parent(&session), place);
        assert_eq!(session.children("showcase-note").len(), count);
        assert_eq!(session.text("t-keys").plain, "/zzz");
        assert_eq!(session.caret(), Some(("t-keys".to_string(), 4)));
    }

    #[test]
    fn alignment_covers_empty_blocks_and_reads_what_children_inherit() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let paragraph = |id: &str, text: &str, parent: &str, index: u64| {
            let (id, text, parent) = (id.to_string(), text.to_string(), parent.to_string());
            session.edit(move |page| {
                page.add_block(
                    &id,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text,
                    },
                    Some(&parent),
                    Some(index),
                    2_000_000,
                )
                .expect("add paragraph");
            });
        };
        let select = |anchor: (&str, u64), focus: (&str, u64)| {
            session.update(|view, window, cx| {
                view.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new(anchor.0, anchor.1),
                        focus: DocPoint::new(focus.0, focus.1),
                    },
                    window,
                    cx,
                );
            });
            session.settle()
        };
        let aligned = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::Paragraph { text_align, .. }) => text_align,
            _ => None,
        };

        // `A`, an empty paragraph, `B`: aligning the selection reaches all three as one
        // undo step.
        paragraph("t-a", "A", "showcase-note", 0);
        paragraph("t-empty", "", "showcase-note", 1);
        paragraph("t-b", "B", "showcase-note", 2);
        let frame = select(("t-a", 0), ("t-b", 1));
        assert_no_violations(&frame, "toolbar over an empty block");
        assert!(element(&frame, "overlay.format_toolbar.align_left").focused);
        session.click(&frame, "overlay.format_toolbar.align_center");
        for id in ["t-a", "t-empty", "t-b"] {
            assert_eq!(aligned(id), Some(BlockAlign::Center), "{id}");
        }
        assert!(element(&session.frame(), "overlay.format_toolbar.align_center").focused);
        session.undo();
        for id in ["t-a", "t-empty", "t-b"] {
            assert_eq!(aligned(id), None, "{id}");
        }
        // With the empty block aligned on its own the three no longer agree.
        session.edit(|page| {
            page.set_block_prop(
                "t-empty",
                "prop:textAlign",
                SessionValue::Any(Any::String("right".to_string())),
                2_000_010,
            )
            .expect("align the empty paragraph");
        });
        let frame = select(("t-a", 0), ("t-b", 1));
        for id in ["align_left", "align_center", "align_right"] {
            assert!(!element(&frame, &format!("overlay.format_toolbar.{id}")).focused);
        }

        // A child that sets no alignment shows its parent's, as it is drawn.
        paragraph("t-child", "Child", "t-b", 0);
        session.edit(|page| {
            page.set_block_prop(
                "t-b",
                "prop:textAlign",
                SessionValue::Any(Any::String("right".to_string())),
                2_000_020,
            )
            .expect("align the parent");
        });
        assert_eq!(aligned("t-child"), None);
        let frame = select(("t-child", 0), ("t-child", 5));
        assert!(element(&frame, "overlay.format_toolbar.align_right").focused);
        assert!(!element(&frame, "overlay.format_toolbar.align_left").focused);
    }

    #[test]
    fn popovers_shield_the_blocks_under_them_from_the_pointer() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let hovered =
            || session.view(|view, _| view.overlays().hovered_block().map(str::to_string));
        session.select("showcase-quote", "Every block");
        let frame = session.settle();
        let quote = center(element(&frame, "page.block.showcase-quote").bounds);
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        // Near its top edge the toolbar lies over what is above the quote.
        let (x, y) = (center(toolbar).0, toolbar.y + 4.0);
        session.pointer(toolbar.right() + 40.0, y, false);
        assert_ne!(hovered().as_deref(), Some("showcase-quote"));

        session.pointer(quote.0, quote.1, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
        // Onto the toolbar: the block under it does not take the hover.
        session.pointer(x, y, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
        assert!(!session.view(|view, _| view.overlays().drag_handle_hot()));

        // The slash menu shields what it covers as well.
        let frame = session.open_slash("showcase-h1");
        let menu = element(&frame, "overlay.slash_menu").bounds;
        session.pointer(menu.x - 20.0, menu.y + 60.0, false);
        let beside = hovered();
        assert!(beside.is_some() && beside.as_deref() != Some("showcase-quote"));
        session.pointer(quote.0, quote.1, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
        session.pointer(menu.x + 40.0, menu.y + 60.0, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
    }

    #[test]
    fn carets_and_selections_follow_a_sideways_scrolled_code_block() {
        use blocksuite_playground_doc::awareness::{
            AwarenessPayload, RoomAwareness, TextSelectionState,
        };
        let session = open(1280, 1700, PlaygroundTheme::Light);
        let long_line = format!("let long = \"{}\";\n", "x".repeat(200));
        session.edit(|page| {
            page.insert_text("showcase-code", "prop:text", 0, &long_line, 2_000_000)
                .expect("insert long line");
            page.set_block_prop(
                "showcase-code",
                "prop:wrap",
                SessionValue::Any(Any::False),
                2_000_001,
            )
            .expect("unwrap");
        });
        // A collaborator's caret in the long line, and the local caret further along.
        let client = 0x5c01_u64;
        let caret_id = format!("page.presence.{client}.caret");
        let label_id = format!("page.presence.{client}.label");
        let mut peer = RoomAwareness::new(client).expect("peer awareness");
        let mut announce = |offset: u64| {
            let mut payload = AwarenessPayload::new("Kim", "var(--affine-multi-players-green)");
            payload
                .set_text_selection(
                    HOME_PAGE_ID,
                    TextSelectionState::caret("showcase-code", offset),
                )
                .expect("selection");
            let update = peer.set_local_payload(&payload, 0).expect("payload");
            session.view(|view, cx| {
                view.edit_document(cx, |state| {
                    state
                        .awareness
                        .apply_update(&update, 0)
                        .expect("apply awareness");
                });
            });
        };
        announce(30);
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            40,
        ))));
        let unscrolled = session.frame();
        let code = element(&unscrolled, "page.block.showcase-code").bounds;
        let remote = element(&unscrolled, &caret_id).bounds;
        let label = element(&unscrolled, &label_id).bounds;
        let local = element(&unscrolled, "page.local_caret").bounds;
        let ime = |range: std::ops::Range<usize>| {
            session.update(|view, window, cx| {
                view.bounds_for_range(range, Bounds::default(), window, cx)
            })
        };
        // World and screen space round differently in the last bit.
        let close = |a: f32, b: f32| (a - b).abs() < 0.01;
        let at_caret = ime(40..40).expect("bounds at the caret");
        assert!(close(f32::from(at_caret.origin.x), local.x));
        assert!(close(f32::from(at_caret.origin.y), local.y));
        let span = ime(36..40).expect("bounds of a range");

        // Scrolled by 60 px, everything laid out on the lines moves left by as much: the
        // collaborator's caret and name tag, the local caret, and what the input method
        // is told about a caret and a range.
        let (x, y) = center(code);
        session.scroll(x, y, -60.0, 0.0);
        assert_eq!(
            session.view(|view, _| view.overlays().code_scroll_x("showcase-code")),
            60.0
        );
        let scrolled = session.frame();
        assert_no_violations(&scrolled, "presence in scrolled code");
        assert_eq!(element(&scrolled, &caret_id).bounds.x, remote.x - 60.0);
        assert_eq!(element(&scrolled, &caret_id).bounds.y, remote.y);
        assert_eq!(element(&scrolled, &label_id).bounds.x, label.x - 60.0);
        assert_eq!(
            element(&scrolled, "page.local_caret").bounds.x,
            local.x - 60.0
        );
        let moved = ime(40..40).expect("bounds at the scrolled caret");
        assert!(close(
            f32::from(moved.origin.x),
            f32::from(at_caret.origin.x) - 60.0
        ));
        let moved_span = ime(36..40).expect("bounds of the scrolled range");
        assert!(close(
            f32::from(moved_span.origin.x),
            f32::from(span.origin.x) - 60.0
        ));
        assert!(close(
            f32::from(moved_span.size.width),
            f32::from(span.size.width)
        ));

        // What scrolled out past the left edge of the code area is not shown at all, and
        // a range cut by that edge is cut for the input method too.
        announce(2);
        let hidden = session.frame();
        assert_no_violations(&hidden, "presence scrolled out of code");
        assert!(!hidden.elements.contains_key(&caret_id));
        assert!(!hidden.elements.contains_key(&label_id));
        assert_eq!(ime(0..3), None);
        let cut = ime(0..40).expect("bounds of a range cut by the code area");
        assert!(f32::from(cut.origin.x) > code.x);
        assert!(close(
            f32::from(cut.origin.x) + f32::from(cut.size.width),
            f32::from(moved.origin.x)
        ));
    }
}
