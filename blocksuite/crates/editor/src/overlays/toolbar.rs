use std::ops::Range;

use blocksuite_playground_doc::read::{RichText, TextAlign as BlockAlign};
use y_octo::{Any, TextDeltaOp, TextInsert};

use crate::block_flow::FlowRect;

use super::*;

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

    pub(super) fn icon(self) -> Option<&'static str> {
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
    pub(super) fn mark_key(self) -> Option<&'static str> {
        match self {
            Self::Bold => Some("bold"),
            Self::Italic => Some("italic"),
            Self::Underline => Some("underline"),
            Self::Strike => Some("strike"),
            Self::Code => Some("code"),
            _ => None,
        }
    }

    pub(super) fn align(self) -> Option<BlockAlign> {
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
    pub(super) fn has(&self, key: &str) -> bool {
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

pub(super) use crate::inline_input::{Utf16ImeBuffer, utf16_to_byte};

/// URL / single-line field attached to the formatting toolbar or equation editor.
/// Delegates all UTF-16 and IME editing state to the shared [`Utf16ImeBuffer`].
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LinkBar {
    pub input: Utf16ImeBuffer,
    /// Screen-space box of the field as last laid out.
    pub(super) bounds: Option<FlowRect>,
}

impl LinkBar {
    pub fn new(url: String) -> Self {
        Self {
            input: Utf16ImeBuffer::new(url, false),
            bounds: None,
        }
    }

    /// The text as committed so far, without a running composition.
    pub fn url(&self) -> &str {
        self.input.text()
    }

    /// The field's text as shown: committed text with a running composition in place.
    pub fn text(&self) -> String {
        self.input.display_text()
    }

    /// The selection as shown, and whether its caret is at its start.
    pub fn shown_selection(&self) -> (Range<usize>, bool) {
        self.input.shown_selection()
    }

    /// Range of the shown text a running composition covers.
    pub fn marked_range(&self) -> Option<Range<usize>> {
        self.input.marked_range()
    }

    pub fn composing(&self) -> bool {
        self.input.composing()
    }

    /// Screen-space box of the field as last laid out.
    pub fn bounds(&self) -> Option<FlowRect> {
        self.bounds
    }

    /// A slice of the shown text and the range it really covers.
    pub fn text_for_range(&self, range: Range<usize>) -> (String, Range<usize>) {
        self.input.text_for_range(range)
    }

    /// Abandon any running composition, restoring the original text and selection.
    pub fn cancel_preedit(&mut self) {
        self.input.cancel_preedit();
    }

    /// Put `text` in place of a running composition, else of `range`, else of the
    /// selection, and leave the caret behind it.
    pub fn replace(&mut self, range: Option<Range<usize>>, text: &str) {
        let _ = self.input.replace(range, text);
    }

    /// Show `text` as a composition over `range` (the selection when absent).
    pub fn mark(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
    ) {
        self.input.mark(range, text, selected);
    }

    /// Commit a running composition as it stands.
    pub fn unmark(&mut self) {
        let _ = self.input.unmark();
    }

    /// Commit any running IME composition into the field and return the final text.
    pub fn into_committed_text(self) -> String {
        self.input.into_committed_text()
    }

    /// Select `range` of the text; a running composition is abandoned.
    pub fn select(&mut self, range: Range<usize>) {
        self.input.select(range);
    }

    pub fn selected_text(&self) -> &str {
        self.input.selected_text()
    }

    /// An editing key of the field: caret movement (with `shift` extending the
    /// selection), deletion and select-all. Returns whether the key was one.
    pub fn key(&mut self, key: &str, shift: bool, secondary: bool) -> bool {
        self.input.key(key, shift, secondary).is_some()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct FormatToolbar {
    /// What the selection last reported; kept while the toolbar fades out.
    pub(super) selection: SelectionFormat,
    pub(super) link: Option<LinkBar>,
    pub(super) presence: Presence,
    /// Screen-space box of the toolbar as last laid out.
    pub(super) rect: Option<FlowRect>,
}
