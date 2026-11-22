//! Pure UTF-16 + IME inline label editor state for Edgeless shapes, connectors, text, and frames.

use std::ops::Range;

use blocksuite_playground_doc::session::{PageDocSession, SelectionSnapshot};
use y_octo::{RelativePosition, SessionCommit};

use super::WorldRect;

/// Result of a text-mutating operation on [`EdgelessLabelEditor`]: `(utf16_start, utf16_delete_len, insert)`.
pub type LabelSplice = (usize, usize, String);

/// Target of an inline UTF-16 + IME label editor on the Edgeless canvas.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LabelTarget {
    Shape { surface_id: String, id: String },
    Connector { surface_id: String, id: String },
    SurfaceText { surface_id: String, id: String },
    FrameTitle { id: String },
}

impl LabelTarget {
    pub fn item_id(&self) -> &str {
        match self {
            Self::Shape { id, .. }
            | Self::Connector { id, .. }
            | Self::SurfaceText { id, .. }
            | Self::FrameTitle { id } => id,
        }
    }

    pub(super) fn splice(
        &self,
        page: &mut PageDocSession,
        (start, del_len, insert): LabelSplice,
        now_ms: u64,
    ) -> Option<SessionCommit<SelectionSnapshot>> {
        match self {
            Self::Shape { surface_id, id }
            | Self::Connector { surface_id, id }
            | Self::SurfaceText { surface_id, id } => page
                .splice_surface_element_text(
                    surface_id,
                    id,
                    "text",
                    start as u64,
                    del_len as u64,
                    &insert,
                    now_ms,
                )
                .ok()
                .flatten(),
            Self::FrameTitle { id } => page
                .splice_block_title_text(id, start as u64, del_len as u64, &insert, now_ms)
                .ok()
                .flatten(),
        }
    }

    pub(super) fn encode_pos(
        &self,
        page: &PageDocSession,
        offset: usize,
    ) -> Option<RelativePosition> {
        match self {
            Self::Shape { surface_id, id }
            | Self::Connector { surface_id, id }
            | Self::SurfaceText { surface_id, id } => page
                .encode_surface_text_relative_position(surface_id, id, "text", offset as u64)
                .ok()
                .flatten(),
            Self::FrameTitle { id } => page
                .encode_block_title_relative_position(id, offset as u64)
                .ok()
                .flatten(),
        }
    }

    pub(super) fn resolve_pos(
        &self,
        page: &PageDocSession,
        pos: &RelativePosition,
    ) -> Option<usize> {
        let off = match self {
            Self::Shape { surface_id, id }
            | Self::Connector { surface_id, id }
            | Self::SurfaceText { surface_id, id } => page
                .resolve_surface_text_relative_position(surface_id, id, "text", pos)
                .ok()
                .flatten()?,
            Self::FrameTitle { id } => page
                .resolve_block_title_relative_position(id, pos)
                .ok()
                .flatten()?,
        };
        Some(off as usize)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LabelPreedit {
    pub replacement: Range<usize>,
    pub text: String,
    pub selected: Range<usize>,
}

/// Inline UTF-16 + IME editor for Shape, Connector, SurfaceText, and Frame title labels.
#[derive(Clone, Debug)]
pub struct EdgelessLabelEditor {
    pub(super) target: LabelTarget,
    pub text: String,
    pub original_text: String,
    pub selection: Range<usize>,
    pub reversed: bool,
    pub(super) preedit: Option<LabelPreedit>,
    pub world_rect: WorldRect,
    pub rotate_deg: f32,
    pub multiline: bool,
    pub created_new_text: bool,
    pub dirty: bool,
    pub(super) anchors: Option<(RelativePosition, RelativePosition)>,
    pub(super) preedit_anchors: Option<(RelativePosition, RelativePosition)>,
}

pub(super) fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

pub(super) fn utf16_to_byte(s: &str, target: usize) -> usize {
    let mut u16_pos = 0;
    for (byte_idx, ch) in s.char_indices() {
        if u16_pos >= target {
            return byte_idx;
        }
        u16_pos += ch.len_utf16();
    }
    s.len()
}

impl EdgelessLabelEditor {
    pub fn new(
        target: LabelTarget,
        initial: String,
        world_rect: WorldRect,
        rotate_deg: f32,
        multiline: bool,
    ) -> Self {
        let len = utf16_len(&initial);
        Self {
            target,
            original_text: initial.clone(),
            text: initial,
            selection: len..len,
            reversed: false,
            preedit: None,
            world_rect,
            rotate_deg,
            multiline,
            created_new_text: false,
            dirty: false,
            anchors: None,
            preedit_anchors: None,
        }
    }

    pub fn composing(&self) -> bool {
        self.preedit.is_some()
    }

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

    pub fn shown_selection(&self) -> (Range<usize>, bool) {
        if let Some(pre) = &self.preedit {
            let base = pre.replacement.start;
            return (base + pre.selected.start..base + pre.selected.end, false);
        }
        (self.selection.clone(), self.reversed)
    }

    pub fn marked_range(&self) -> Option<Range<usize>> {
        let pre = self.preedit.as_ref()?;
        let start = pre.replacement.start;
        Some(start..start + utf16_len(&pre.text))
    }

    pub fn text_for_range(&self, range: Range<usize>) -> (String, Range<usize>) {
        let text = self.display_text();
        let start = utf16_to_byte(&text, range.start);
        let end = utf16_to_byte(&text, range.end).max(start);
        let covered = utf16_len(&text[..start])..utf16_len(&text[..end]);
        (text[start..end].to_string(), covered)
    }

    fn clamped(&self, range: Range<usize>) -> Range<usize> {
        let at = |offset: usize| utf16_len(&self.text[..utf16_to_byte(&self.text, offset)]);
        let a = at(range.start.min(range.end));
        let b = at(range.start.max(range.end));
        a..b
    }

    pub fn cancel_preedit(&mut self) {
        self.preedit = None;
        self.preedit_anchors = None;
    }

    pub fn replace(&mut self, range: Option<Range<usize>>, text: &str) -> Option<LabelSplice> {
        if self.preedit.is_some() && text.is_empty() {
            self.cancel_preedit();
            return None;
        }
        self.preedit_anchors = None;
        let target = match self.preedit.take() {
            Some(pre) => pre.replacement,
            None => range.map_or(self.selection.clone(), |r| self.clamped(r)),
        };
        let cleaned: String = if self.multiline {
            text.chars()
                .filter(|ch| !ch.is_control() || *ch == '\n')
                .collect()
        } else {
            text.chars().filter(|ch| !ch.is_control()).collect()
        };
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
            self.dirty = true;
            Some((target.start, del_len, cleaned))
        }
    }

    pub fn mark(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
    ) {
        if text.is_empty() {
            self.preedit = None;
            self.preedit_anchors = None;
            return;
        }
        let replacement = match &self.preedit {
            Some(pre) => pre.replacement.clone(),
            None => range.map_or(self.selection.clone(), |r| self.clamped(r)),
        };
        let cleaned: String = text.chars().filter(|ch| !ch.is_control()).collect();
        let len = utf16_len(&cleaned);
        let selected = selected.unwrap_or(len..len);
        self.preedit = Some(LabelPreedit {
            replacement,
            text: cleaned,
            selected: selected.start.min(len)..selected.end.min(len),
        });
    }

    pub fn unmark(&mut self) -> Option<LabelSplice> {
        if let Some(pre) = &self.preedit {
            let text = pre.text.clone();
            self.replace(None, &text)
        } else {
            None
        }
    }

    pub fn select(&mut self, range: Range<usize>) {
        self.preedit = None;
        self.preedit_anchors = None;
        self.selection = self.clamped(range);
        self.reversed = false;
    }

    pub fn delete_backward(&mut self) -> Option<LabelSplice> {
        self.preedit = None;
        self.preedit_anchors = None;
        if self.selection.start != self.selection.end {
            return self.replace(None, "");
        }
        let pos = self.selection.start;
        if pos == 0 {
            return None;
        }
        let byte_end = utf16_to_byte(&self.text, pos);
        let prev_char = self.text[..byte_end].chars().next_back();
        let byte_start = prev_char.map_or(0, |c| byte_end - c.len_utf8());
        let new_pos = utf16_len(&self.text[..byte_start]);
        let del_len = pos.saturating_sub(new_pos);
        self.text.replace_range(byte_start..byte_end, "");
        self.selection = new_pos..new_pos;
        self.reversed = false;
        self.dirty = true;
        Some((new_pos, del_len, String::new()))
    }

    pub fn delete_forward(&mut self) -> Option<LabelSplice> {
        self.preedit = None;
        self.preedit_anchors = None;
        if self.selection.start != self.selection.end {
            return self.replace(None, "");
        }
        let pos = self.selection.start;
        let byte_start = utf16_to_byte(&self.text, pos);
        if byte_start >= self.text.len() {
            return None;
        }
        let next_char = self.text[byte_start..].chars().next();
        let byte_end = next_char.map_or(self.text.len(), |c| byte_start + c.len_utf8());
        let del_len = next_char.map_or(0, char::len_utf16);
        self.text.replace_range(byte_start..byte_end, "");
        self.dirty = true;
        Some((pos, del_len, String::new()))
    }

    pub fn move_caret(&mut self, left: bool, extend: bool) {
        self.preedit = None;
        self.preedit_anchors = None;
        let focus = if self.reversed {
            self.selection.start
        } else {
            self.selection.end
        };
        let anchor = if self.reversed {
            self.selection.end
        } else {
            self.selection.start
        };
        let next = if left {
            let b = utf16_to_byte(&self.text, focus);
            let nb = self.text[..b]
                .chars()
                .next_back()
                .map_or(0, |c| b - c.len_utf8());
            utf16_len(&self.text[..nb])
        } else {
            let b = utf16_to_byte(&self.text, focus);
            let nb = self.text[b..]
                .chars()
                .next()
                .map_or(self.text.len(), |c| b + c.len_utf8());
            utf16_len(&self.text[..nb])
        };
        if extend {
            self.selection = anchor.min(next)..anchor.max(next);
            self.reversed = next < anchor;
        } else {
            self.selection = next..next;
            self.reversed = false;
        }
    }

    pub fn select_all(&mut self) {
        self.preedit = None;
        self.preedit_anchors = None;
        let len = utf16_len(&self.text);
        self.selection = 0..len;
        self.reversed = false;
    }

    pub fn selected_text(&self) -> &str {
        let s = utf16_to_byte(&self.text, self.selection.start);
        let e = utf16_to_byte(&self.text, self.selection.end);
        &self.text[s..e]
    }
}

/// Active inline editing session on the Edgeless canvas.
#[derive(Clone, Debug)]
pub enum EdgelessInlineEdit {
    /// Live rich-text `EditorSession` editing inside a Note or EdgelessText block.
    SpatialBlock { block_id: String, is_note: bool },
    /// Inline UTF-16 + IME editing on a Shape, Connector, SurfaceText, or Frame title.
    Label(EdgelessLabelEditor),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_editor_ime_preedit_cancel_and_commit() {
        let mut ed = EdgelessLabelEditor::new(
            LabelTarget::Shape {
                surface_id: "surf".into(),
                id: "s1".into(),
            },
            "hello".into(),
            WorldRect::new(0.0, 0.0, 160.0, 80.0),
            0.0,
            true,
        );
        ed.select(1..4);
        assert_eq!(ed.selected_text(), "ell");
        ed.mark(None, "nihao", None);
        assert!(ed.composing());
        assert_eq!(ed.display_text(), "hnihaoo");
        // Empty replace during preedit cancels and restores original selection.
        ed.replace(None, "");
        assert!(!ed.composing());
        assert_eq!(ed.display_text(), "hello");
        assert_eq!(ed.selected_text(), "ell");
        // Commit replaces selection.
        ed.mark(None, "你好", None);
        ed.unmark();
        assert!(!ed.composing());
        assert_eq!(ed.display_text(), "h你好o");
    }
}
