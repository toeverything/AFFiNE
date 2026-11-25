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

pub(super) fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// Byte index of a UTF-16 offset in `text`, clamped to the text and never inside a
/// character.
pub(super) fn utf16_to_byte(text: &str, offset: usize) -> usize {
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
pub(super) struct LinkPreedit {
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
pub struct LinkBar {
    pub(super) url: String,
    /// Selected range of `url`, empty at the caret.
    pub selection: Range<usize>,
    /// Whether the caret is at the start of the selection.
    pub reversed: bool,
    pub(super) preedit: Option<LinkPreedit>,
    /// Screen-space box of the field as last laid out.
    pub(super) bounds: Option<FlowRect>,
}

impl LinkBar {
    pub fn new(url: String) -> Self {
        let end = utf16_len(&url);
        Self {
            url,
            selection: end..end,
            ..Self::default()
        }
    }

    /// The URL as committed so far, without a running composition.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// The field's text as shown: the URL with a running composition in place.
    pub fn text(&self) -> String {
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
    pub fn shown_selection(&self) -> (Range<usize>, bool) {
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
    pub fn marked_range(&self) -> Option<Range<usize>> {
        let preedit = self.preedit.as_ref()?;
        Some(preedit.replacement.start..preedit.replacement.start + utf16_len(&preedit.text))
    }

    pub fn composing(&self) -> bool {
        self.preedit.is_some()
    }

    /// Screen-space box of the field as last laid out.
    pub fn bounds(&self) -> Option<FlowRect> {
        self.bounds
    }

    /// A slice of the shown text and the range it really covers.
    pub fn text_for_range(&self, range: Range<usize>) -> (String, Range<usize>) {
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

    /// Abandon any running composition, restoring the original URL and selection.
    pub fn cancel_preedit(&mut self) {
        self.preedit = None;
    }

    /// Put `text` in place of a running composition, else of `range`, else of the
    /// selection, and leave the caret behind it. Control characters are dropped: the
    /// field is one line.
    pub fn replace(&mut self, range: Option<Range<usize>>, text: &str) {
        if self.preedit.is_some() && text.is_empty() {
            self.cancel_preedit();
            return;
        }
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
    pub fn mark(
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
    pub fn unmark(&mut self) {
        if let Some(preedit) = &self.preedit {
            let text = preedit.text.clone();
            self.replace(None, &text);
        }
    }

    /// Commit any running IME composition into the field and return the final text.
    pub fn into_committed_text(mut self) -> String {
        self.unmark();
        self.url
    }

    /// Select `range` of the URL; a running composition is abandoned.
    pub fn select(&mut self, range: Range<usize>) {
        self.preedit = None;
        self.selection = self.clamped(range);
        self.reversed = false;
    }

    pub fn selected_text(&self) -> &str {
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
    pub fn key(&mut self, key: &str, shift: bool, secondary: bool) -> bool {
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
pub(super) struct FormatToolbar {
    /// What the selection last reported; kept while the toolbar fades out.
    pub(super) selection: SelectionFormat,
    pub(super) link: Option<LinkBar>,
    pub(super) presence: Presence,
    /// Screen-space box of the toolbar as last laid out.
    pub(super) rect: Option<FlowRect>,
}
