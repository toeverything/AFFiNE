//! Unified pure UTF-16 + IME text buffer shared by Edgeless label editing,
//! in-place table cell editing, the link bar, and the equation editor.

use std::ops::Range;

use y_octo::RelativePosition;

/// Result of a text-mutating operation on [`Utf16ImeBuffer`]: `(utf16_start, utf16_delete_len, insert)`.
pub type TextSplice = (usize, usize, String);

/// Normalize inserted text: when `multiline` is true, map `\t` to `' '` (never silently
/// gluing words), normalize `\r\n` / `\r` to `\n`, and strip other control characters;
/// in single-line mode (`multiline == false`), strip all control characters including
/// `\t`, `\r`, and `\n`.
pub fn sanitize_input(text: &str, multiline: bool) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '\t' => {
                if multiline {
                    out.push(' ');
                }
            }
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                if multiline {
                    out.push('\n');
                }
            }
            '\n' => {
                if multiline {
                    out.push('\n');
                }
            }
            c if !c.is_control() => out.push(c),
            _ => {}
        }
    }
    out
}

/// Count of UTF-16 code units in `text`.
pub fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// Byte index of a UTF-16 offset in `text`, clamped to `text.len()` and never inside a character.
pub fn utf16_to_byte(text: &str, offset: usize) -> usize {
    let mut units = 0;
    for (byte, ch) in text.char_indices() {
        if units + ch.len_utf16() > offset {
            return byte;
        }
        units += ch.len_utf16();
    }
    text.len()
}

/// Active input-method composition over a UTF-16 range of a [`Utf16ImeBuffer`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Utf16Preedit {
    /// Range of the committed text replaced when the composition commits.
    pub replacement: Range<usize>,
    pub text: String,
    /// Selected range inside `text` (UTF-16 offsets relative to `text`).
    pub selected: Range<usize>,
}

/// Pure UTF-16 text buffer with directional selection and IME preedit state.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Utf16ImeBuffer {
    pub text: String,
    /// Selected UTF-16 range of `text`, empty at the caret.
    pub selection: Range<usize>,
    /// Whether the caret sits at `selection.start` rather than `selection.end`.
    pub reversed: bool,
    pub preedit: Option<Utf16Preedit>,
    /// Whether `\n` is preserved on insert and `up`/`down` do not jump to line ends.
    pub multiline: bool,
}

impl Utf16ImeBuffer {
    pub fn new(text: String, multiline: bool) -> Self {
        let end = utf16_len(&text);
        Self {
            text,
            selection: end..end,
            reversed: false,
            preedit: None,
            multiline,
        }
    }

    /// Committed text without any active composition.
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Displayed text with any active composition spliced in.
    pub fn display_text(&self) -> String {
        let Some(pre) = &self.preedit else {
            return self.text.clone();
        };
        let start = utf16_to_byte(&self.text, pre.replacement.start);
        let end = utf16_to_byte(&self.text, pre.replacement.end);
        let mut out = String::with_capacity(self.text.len() + pre.text.len());
        out.push_str(&self.text[..start]);
        out.push_str(&pre.text);
        out.push_str(&self.text[end..]);
        out
    }

    /// Displayed selection range and whether the caret is at its start.
    pub fn shown_selection(&self) -> (Range<usize>, bool) {
        if let Some(pre) = &self.preedit {
            let base = pre.replacement.start;
            return (base + pre.selected.start..base + pre.selected.end, false);
        }
        (self.selection.clone(), self.reversed)
    }

    /// UTF-16 range of the displayed text covered by a running composition.
    pub fn marked_range(&self) -> Option<Range<usize>> {
        let pre = self.preedit.as_ref()?;
        let start = pre.replacement.start;
        Some(start..start + utf16_len(&pre.text))
    }

    pub fn composing(&self) -> bool {
        self.preedit.is_some()
    }

    /// Slice of displayed text covering `range` and the exact UTF-16 range returned.
    pub fn text_for_range(&self, range: Range<usize>) -> (String, Range<usize>) {
        let text = self.display_text();
        let start = utf16_to_byte(&text, range.start);
        let end = utf16_to_byte(&text, range.end).max(start);
        let covered = utf16_len(&text[..start])..utf16_len(&text[..end]);
        (text[start..end].to_string(), covered)
    }

    pub fn selected_text(&self) -> &str {
        let s = utf16_to_byte(&self.text, self.selection.start);
        let e = utf16_to_byte(&self.text, self.selection.end);
        &self.text[s..e]
    }

    fn clamped(&self, range: Range<usize>) -> Range<usize> {
        let at = |offset: usize| utf16_len(&self.text[..utf16_to_byte(&self.text, offset)]);
        let a = at(range.start.min(range.end));
        let b = at(range.start.max(range.end));
        a..b
    }

    pub fn cancel_preedit(&mut self) {
        self.preedit = None;
    }

    /// Replace an active composition, `range`, or the current selection with `text`.
    /// Returns the UTF-16 splice applied to committed text, or `None` for a no-op / cancel.
    pub fn replace(&mut self, range: Option<Range<usize>>, text: &str) -> Option<TextSplice> {
        if self.preedit.is_some() && text.is_empty() {
            self.cancel_preedit();
            return None;
        }
        let target = match self.preedit.take() {
            Some(pre) => pre.replacement,
            None => range.map_or(self.selection.clone(), |r| self.clamped(r)),
        };
        let cleaned = sanitize_input(text, self.multiline);
        let start = utf16_to_byte(&self.text, target.start);
        let end = utf16_to_byte(&self.text, target.end);
        self.text.replace_range(start..end, &cleaned);
        let caret = target.start + utf16_len(&cleaned);
        self.selection = caret..caret;
        self.reversed = false;
        let del_len = target.end.saturating_sub(target.start);
        if del_len == 0 && cleaned.is_empty() {
            None
        } else {
            Some((target.start, del_len, cleaned))
        }
    }

    /// Show `text` as an uncommitted IME preedit over `range` (or selection).
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
            Some(pre) => pre.replacement.clone(),
            None => range.map_or(self.selection.clone(), |r| self.clamped(r)),
        };
        let cleaned = sanitize_input(text, false);
        let len = utf16_len(&cleaned);
        let selected = selected.unwrap_or(len..len);
        self.preedit = Some(Utf16Preedit {
            replacement,
            text: cleaned,
            selected: selected.start.min(len)..selected.end.min(len),
        });
    }

    /// Commit any running composition into the buffer.
    pub fn unmark(&mut self) -> Option<TextSplice> {
        if let Some(pre) = &self.preedit {
            let text = pre.text.clone();
            self.replace(None, &text)
        } else {
            None
        }
    }

    /// Commit any running composition and return the final text.
    pub fn into_committed_text(mut self) -> String {
        self.unmark();
        self.text
    }

    pub fn select(&mut self, range: Range<usize>) {
        self.preedit = None;
        self.selection = self.clamped(range);
        self.reversed = false;
    }

    pub fn select_all(&mut self) {
        self.preedit = None;
        let len = utf16_len(&self.text);
        self.selection = 0..len;
        self.reversed = false;
    }

    pub fn focus(&self) -> usize {
        if self.reversed {
            self.selection.start
        } else {
            self.selection.end
        }
    }

    pub fn move_caret(&mut self, to: usize, extend: bool) {
        self.preedit = None;
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

    fn step(&self, from: usize, forward: bool) -> usize {
        let byte = utf16_to_byte(&self.text, from);
        let next = if forward {
            self.text[byte..]
                .chars()
                .next()
                .map_or(byte, |ch| byte + ch.len_utf8())
        } else {
            self.text[..byte]
                .chars()
                .next_back()
                .map_or(byte, |ch| byte - ch.len_utf8())
        };
        utf16_len(&self.text[..next])
    }

    pub fn step_caret(&mut self, left: bool, extend: bool) {
        let to = self.step(self.focus(), !left);
        self.move_caret(to, extend);
    }

    pub fn delete_backward(&mut self) -> Option<TextSplice> {
        self.preedit = None;
        if !self.selection.is_empty() {
            return self.replace(None, "");
        }
        let pos = self.selection.start;
        if pos == 0 {
            return None;
        }
        let prev = self.step(pos, false);
        self.replace(Some(prev..pos), "")
    }

    pub fn delete_forward(&mut self) -> Option<TextSplice> {
        self.preedit = None;
        if !self.selection.is_empty() {
            return self.replace(None, "");
        }
        let pos = self.selection.start;
        let next = self.step(pos, true);
        if next == pos {
            return None;
        }
        self.replace(Some(pos..next), "")
    }

    /// Handle an editing or caret-movement key (`left`/`right`/`home`/`end`/`up`/`down`,
    /// `backspace`/`delete`, `Cmd+Arrow`, `Cmd+Backspace`, `Cmd+A`).
    ///
    /// Returns `None` when `key` is not handled by the buffer, `Some(None)` when handled
    /// without mutating text, or `Some(Some(splice))` when text was mutated.
    pub fn key(&mut self, key: &str, shift: bool, secondary: bool) -> Option<Option<TextSplice>> {
        let end = utf16_len(&self.text);
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
                Some(None)
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
                Some(self.replace(Some(range), ""))
            }
            "a" if secondary => {
                self.select_all();
                Some(None)
            }
            _ => None,
        }
    }
}

/// [`Utf16ImeBuffer`] paired with CRDT `RelativePosition` anchors for both selection and
/// active IME preedit replacement range. Shared by `EdgelessLabelEditor` and `InlineTableCell`.
#[derive(Clone, Debug)]
pub struct AnchoredInlineInput {
    pub input: Utf16ImeBuffer,
    pub anchors: Option<(RelativePosition, RelativePosition)>,
    pub preedit_anchors: Option<(RelativePosition, RelativePosition)>,
}

impl AnchoredInlineInput {
    pub fn new(initial: String, multiline: bool) -> Self {
        Self {
            input: Utf16ImeBuffer::new(initial, multiline),
            anchors: None,
            preedit_anchors: None,
        }
    }

    pub fn clear_preedit_anchors(&mut self) {
        self.preedit_anchors = None;
    }

    /// Re-encode selection and active preedit replacement anchors via `encode`.
    pub fn update_anchors(&mut self, encode: impl Fn(usize) -> Option<RelativePosition>) {
        let sel = self.input.selection.clone();
        self.anchors = encode(sel.start).zip(encode(sel.end));
        self.preedit_anchors = self
            .input
            .preedit
            .as_ref()
            .and_then(|p| encode(p.replacement.start).zip(encode(p.replacement.end)));
    }

    /// Reconcile committed text, selection, and active preedit replacement range after a
    /// remote update or Undo/Redo using `resolve`, then clamp to UTF-16 length.
    pub fn reconcile_from_text(
        &mut self,
        latest: String,
        resolve: impl Fn(&RelativePosition) -> Option<usize>,
    ) {
        let resolve_pair = |pair: &Option<(RelativePosition, RelativePosition)>| {
            let (a, b) = pair.as_ref()?;
            let s = resolve(a)?;
            let e = resolve(b)?;
            Some(s.min(e)..s.max(e))
        };
        let resolved_sel = resolve_pair(&self.anchors);
        let resolved_pre = resolve_pair(&self.preedit_anchors);
        self.input.text = latest;
        let len = utf16_len(&self.input.text);
        self.input.selection = match resolved_sel {
            Some(r) => r.start.min(len)..r.end.min(len),
            None => self.input.selection.start.min(len)..self.input.selection.end.min(len),
        };
        if let Some(pre) = &mut self.input.preedit {
            pre.replacement = match resolved_pre {
                Some(r) => r.start.min(len)..r.end.min(len),
                None => pre.replacement.start.min(len)..pre.replacement.end.min(len),
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ime_preedit_cancel_commit_and_keys() {
        let mut buf = Utf16ImeBuffer::new("hello".into(), false);
        buf.select(1..4);
        assert_eq!(buf.selected_text(), "ell");
        buf.mark(None, "nihao", None);
        assert!(buf.composing());
        assert_eq!(buf.display_text(), "hnihaoo");
        assert_eq!(buf.replace(None, ""), None);
        assert!(!buf.composing());
        assert_eq!(buf.display_text(), "hello");
        assert_eq!(buf.selected_text(), "ell");

        buf.mark(None, "你好", None);
        assert_eq!(buf.unmark(), Some((1, 3, "你好".into())));
        assert_eq!(buf.text(), "h你好o");

        // Home / End / Cmd+Backspace / Cmd+A
        assert_eq!(buf.key("end", false, false), Some(None));
        assert_eq!(buf.selection, 4..4);
        assert_eq!(buf.key("home", true, false), Some(None));
        assert_eq!(buf.selection, 0..4);
        assert!(buf.reversed);
        assert_eq!(buf.key("right", false, false), Some(None));
        assert_eq!(buf.selection, 4..4);
        assert_eq!(
            buf.key("backspace", false, true),
            Some(Some((0, 4, String::new())))
        );
        assert_eq!(buf.text(), "");
    }
}
