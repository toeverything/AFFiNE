//! IME and UTF-16 InputConnection editing methods for [`AndroidEditorRuntime`].

use super::{AndroidEditorRuntime, KEYCODE_DEL, KEYCODE_ENTER};

impl AndroidEditorRuntime {
    pub(crate) fn ensure_input_handler(&mut self) {
        if self.window.state.borrow().input_handler.is_none() {
            self.window.request_frame_now();
        }
    }

    pub(crate) fn utf16_len(&mut self) -> usize {
        self.ensure_input_handler();
        self.window
            .with_input_handler(|h| h.text_length_utf16())
            .flatten()
            .unwrap_or(0)
    }

    pub(crate) fn utf16_text(&mut self) -> Vec<u16> {
        self.ensure_input_handler();
        let len = self.utf16_len();
        if len == 0 {
            return Vec::new();
        }
        let mut adjusted = None;
        self.window
            .with_input_handler(|h| h.text_for_range(0..len, &mut adjusted))
            .flatten()
            .unwrap_or_default()
            .encode_utf16()
            .collect()
    }

    pub(crate) fn utf16_unit(&mut self, index: usize) -> Option<u16> {
        self.utf16_text().get(index).copied()
    }

    pub(crate) fn selection_range(&mut self) -> (usize, usize) {
        if let Some(preserved) = self.preserved_selection_during_composing_region {
            let len = self.utf16_len();
            let s = preserved.0.min(len);
            let e = preserved.1.min(len).max(s);
            return (s, e);
        }
        self.ensure_input_handler();
        self.window
            .with_input_handler(|h| h.selected_text_range(true))
            .flatten()
            .map(|sel| (sel.range.start, sel.range.end))
            .unwrap_or((0, 0))
    }

    pub(crate) fn composing_range(&mut self) -> Option<(usize, usize)> {
        self.ensure_input_handler();
        self.window
            .with_input_handler(|h| h.marked_text_range())
            .flatten()
            .map(|r| (r.start, r.end))
    }

    fn cursor_after_edit(
        start: usize,
        inserted_len: usize,
        new_cursor_pos: i32,
        max_len: usize,
    ) -> usize {
        if new_cursor_pos > 0 {
            start
                .saturating_add(inserted_len)
                .saturating_add((new_cursor_pos - 1) as usize)
                .min(max_len)
        } else {
            let back = new_cursor_pos.unsigned_abs() as usize;
            start.saturating_sub(back).min(max_len)
        }
    }

    pub(crate) fn commit_text_utf16(&mut self, utf16: &[u16], new_cursor_pos: i32) {
        self.ensure_input_handler();
        self.preserved_selection_during_composing_region = None;
        let text = String::from_utf16_lossy(utf16);
        let replace_start = self
            .composing_range()
            .map(|(s, _)| s)
            .unwrap_or_else(|| self.selection_range().0);
        if text == "\n" || text == "\r" {
            self.dispatch_key_code(KEYCODE_ENTER, false, false, false);
            return;
        }
        let _ = self
            .window
            .with_input_handler(|h| h.replace_text_in_range(None, &text));
        if new_cursor_pos != 1 {
            let max_len = self.utf16_len();
            let pos = Self::cursor_after_edit(replace_start, utf16.len(), new_cursor_pos, max_len);
            let _ = self
                .window
                .with_input_handler(|h| h.set_selected_text_range(pos..pos));
        }
        self.window.request_frame_now();
    }

    pub(crate) fn set_composing_text_utf16(&mut self, utf16: &[u16], new_cursor_pos: i32) {
        self.ensure_input_handler();
        self.preserved_selection_during_composing_region = None;
        let text = String::from_utf16_lossy(utf16);
        let inserted_len = utf16.len();
        let rel_cursor = if new_cursor_pos > 0 {
            inserted_len
                .saturating_add((new_cursor_pos - 1) as usize)
                .min(inserted_len)
        } else {
            0
        };
        let _ = self.window.with_input_handler(|h| {
            h.replace_and_mark_text_in_range(None, &text, Some(rel_cursor..rel_cursor))
        });
        self.window.request_frame_now();
    }

    /// H-A1: Marks `[start, end)` with the exact authoritative UTF-16 slice so subsequent
    /// `setComposingText` replaces `[start, end)` instead of duplicating text.
    pub(crate) fn set_composing_region(&mut self, start: usize, end: usize) {
        self.ensure_input_handler();
        let prev_sel = self.selection_range();
        let len = self.utf16_len();
        let a = start.min(len);
        let b = end.min(len);
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        if lo == hi {
            self.preserved_selection_during_composing_region = None;
            let _ = self.window.with_input_handler(|h| h.unmark_text());
            let _ = self
                .window
                .with_input_handler(|h| h.set_selected_text_range(prev_sel.0..prev_sel.1));
            self.window.request_frame_now();
            return;
        }
        // Commit any previous composing span first so `lo..hi` addresses current document text.
        if self.composing_range().is_some() {
            let _ = self.window.with_input_handler(|h| h.unmark_text());
        }
        // Align interior UTF-16 surrogate-pair indices to full scalar boundaries so
        // `text_for_range` and `replace_and_mark_text_in_range` never split an emoji.
        let units = self.utf16_text();
        let is_low_surrogate = |u: u16| (0xDC00..=0xDFFF).contains(&u);
        let mut lo = lo.min(units.len());
        let mut hi = hi.min(units.len());
        if lo > 0 && lo < units.len() && is_low_surrogate(units[lo]) {
            lo -= 1;
        }
        if hi > 0 && hi < units.len() && is_low_surrogate(units[hi]) {
            hi += 1;
        }
        let mut adjusted = None;
        let existing = self
            .window
            .with_input_handler(|h| h.text_for_range(lo..hi, &mut adjusted))
            .flatten()
            .unwrap_or_default();
        let effective = adjusted.unwrap_or(lo..hi);
        let sel_in_region = if prev_sel.0 >= effective.start && prev_sel.1 <= effective.end {
            self.preserved_selection_during_composing_region = None;
            Some((prev_sel.0 - effective.start)..(prev_sel.1 - effective.start))
        } else {
            self.preserved_selection_during_composing_region = Some(prev_sel);
            Some(existing.encode_utf16().count()..existing.encode_utf16().count())
        };
        let _ = self.window.with_input_handler(|h| {
            h.replace_and_mark_text_in_range(Some(effective), &existing, sel_in_region)
        });
        let _ = self.dispatcher.drain_ready();
        self.window.request_frame_now();
    }

    pub(crate) fn finish_composing_text(&mut self) {
        self.ensure_input_handler();
        let preserved = self.preserved_selection_during_composing_region.take();
        let _ = self.window.with_input_handler(|h| h.unmark_text());
        if let Some((s, e)) = preserved {
            let _ = self
                .window
                .with_input_handler(|h| h.set_selected_text_range(s..e));
        }
        self.window.request_frame_now();
    }

    pub(crate) fn set_selection(&mut self, start: usize, end: usize) {
        self.ensure_input_handler();
        self.preserved_selection_during_composing_region = None;
        let len = self.utf16_len();
        let a = start.min(len);
        let b = end.min(len);
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        let _ = self
            .window
            .with_input_handler(|h| h.set_selected_text_range(lo..hi));
        self.window.request_frame_now();
    }

    pub(crate) fn replace_text_utf16(
        &mut self,
        start: usize,
        end: usize,
        utf16: &[u16],
        new_cursor_pos: i32,
    ) {
        self.ensure_input_handler();
        self.preserved_selection_during_composing_region = None;
        if self.composing_range().is_some() {
            let _ = self.window.with_input_handler(|h| h.unmark_text());
        }
        let len = self.utf16_len();
        let a = start.min(len);
        let b = end.min(len);
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        let text = String::from_utf16_lossy(utf16);
        let _ = self
            .window
            .with_input_handler(|h| h.replace_text_in_range(Some(lo..hi), &text));
        let max_len = self.utf16_len();
        let pos = Self::cursor_after_edit(lo, utf16.len(), new_cursor_pos, max_len);
        let _ = self
            .window
            .with_input_handler(|h| h.set_selected_text_range(pos..pos));
        self.window.request_frame_now();
    }

    fn is_high_surrogate(u: u16) -> bool {
        (0xD800..=0xDBFF).contains(&u)
    }

    fn is_low_surrogate(u: u16) -> bool {
        (0xDC00..=0xDFFF).contains(&u)
    }

    pub(crate) fn delete_surrounding_text(&mut self, before_len: usize, after_len: usize) {
        self.ensure_input_handler();
        let units = self.utf16_text();
        let len = units.len();
        let (sel_start, sel_end) = self.selection_range();
        let composing = self.composing_range();

        // AOSP BaseInputConnection: delete outside composing span when composing is active.
        let (anchor_before, anchor_after) = if let Some((cs, ce)) = composing {
            (sel_start.min(cs), sel_end.max(ce))
        } else {
            (sel_start, sel_end)
        };

        let mut del_before_start = anchor_before.saturating_sub(before_len);
        if del_before_start > 0
            && del_before_start < len
            && Self::is_low_surrogate(units[del_before_start])
            && Self::is_high_surrogate(units[del_before_start - 1])
        {
            del_before_start -= 1;
        }
        let mut del_after_end = anchor_after.saturating_add(after_len).min(len);
        if del_after_end > 0
            && del_after_end < len
            && Self::is_high_surrogate(units[del_after_end - 1])
            && Self::is_low_surrogate(units[del_after_end])
        {
            del_after_end += 1;
        }

        let removed_before = anchor_before - del_before_start;
        let removed_after = del_after_end - anchor_after;
        if removed_before == 0 && removed_after == 0 {
            // When Gboard issues `deleteSurroundingText(1, 0)` at the very start of a block
            // (collapsed caret at offset 0 with no active composing span), bridge it to a
            // structural Backspace so adjacent non-mergeable block selection and cross-block
            // merging behave identically to hardware/software KEYCODE_DEL.
            if composing.is_none()
                && sel_start == 0
                && sel_end == 0
                && before_len >= 1
                && after_len == 0
            {
                let _ = self.dispatch_key_code(KEYCODE_DEL, false, false, false);
            }
            return;
        }

        if let Some((cs, ce)) = composing {
            let comp_text = String::from_utf16_lossy(&units[cs..ce]);
            let _ = self.window.with_input_handler(|h| h.unmark_text());
            if removed_after > 0 {
                let _ = self.window.with_input_handler(|h| {
                    h.replace_text_in_range(Some(anchor_after..del_after_end), "")
                });
            }
            if removed_before > 0 {
                let _ = self.window.with_input_handler(|h| {
                    h.replace_text_in_range(Some(del_before_start..anchor_before), "")
                });
            }
            let new_cs = cs.saturating_sub(removed_before);
            let new_ce = ce.saturating_sub(removed_before);
            let new_sel_s = sel_start.saturating_sub(removed_before);
            let new_sel_e = sel_end.saturating_sub(removed_before);
            let rel = if new_sel_s >= new_cs && new_sel_e <= new_ce {
                Some((new_sel_s - new_cs)..(new_sel_e - new_cs))
            } else {
                Some(comp_text.encode_utf16().count()..comp_text.encode_utf16().count())
            };
            let _ = self.window.with_input_handler(|h| {
                h.replace_and_mark_text_in_range(Some(new_cs..new_ce), &comp_text, rel)
            });
        } else {
            if removed_after > 0 {
                let _ = self.window.with_input_handler(|h| {
                    h.replace_text_in_range(Some(anchor_after..del_after_end), "")
                });
            }
            if removed_before > 0 {
                let _ = self.window.with_input_handler(|h| {
                    h.replace_text_in_range(Some(del_before_start..anchor_before), "")
                });
            }
            let new_start = sel_start.saturating_sub(removed_before);
            let new_end = sel_end.saturating_sub(removed_before);
            let _ = self
                .window
                .with_input_handler(|h| h.set_selected_text_range(new_start..new_end));
        }
        self.window.request_frame_now();
    }

    pub(crate) fn delete_surrounding_text_in_code_points(
        &mut self,
        before_code_points: usize,
        after_code_points: usize,
    ) -> bool {
        self.ensure_input_handler();
        let units = self.utf16_text();
        let (sel_start, sel_end) = self.selection_range();
        let (anchor_before, anchor_after) = if let Some((cs, ce)) = self.composing_range() {
            (sel_start.min(cs), sel_end.max(ce))
        } else {
            (sel_start, sel_end)
        };

        let mut b_idx = anchor_before;
        for _ in 0..before_code_points {
            if b_idx == 0 {
                break;
            }
            b_idx -= 1;
            if Self::is_low_surrogate(units[b_idx]) {
                if b_idx == 0 || !Self::is_high_surrogate(units[b_idx - 1]) {
                    return false;
                }
                b_idx -= 1;
            } else if Self::is_high_surrogate(units[b_idx]) {
                return false;
            }
        }
        let mut a_idx = anchor_after;
        for _ in 0..after_code_points {
            if a_idx >= units.len() {
                break;
            }
            if Self::is_high_surrogate(units[a_idx]) {
                if a_idx + 1 >= units.len() || !Self::is_low_surrogate(units[a_idx + 1]) {
                    return false;
                }
                a_idx += 2;
            } else if Self::is_low_surrogate(units[a_idx]) {
                return false;
            } else {
                a_idx += 1;
            }
        }
        self.delete_surrounding_text(anchor_before - b_idx, a_idx - anchor_after);
        true
    }
}
