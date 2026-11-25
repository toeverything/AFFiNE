use crate::AndroidHostState;

impl AndroidHostState {
    pub fn text_string(&self) -> String {
        String::from_utf16_lossy(&self.utf16_text)
    }

    pub fn utf16_len(&self) -> usize {
        self.utf16_text.len()
    }

    pub fn utf16_unit(&self, index: usize) -> Option<u16> {
        self.utf16_text.get(index).copied()
    }

    pub fn selection_range(&self) -> (usize, usize) {
        let len = self.utf16_text.len();
        let start = self.selected_start.min(len);
        let end = start.saturating_add(self.selected_len).min(len);
        (start, end)
    }

    pub fn composing_range(&self) -> Option<(usize, usize)> {
        let len = self.utf16_text.len();
        self.composing_start.map(|cs| {
            let start = cs.min(len);
            let end = start.saturating_add(self.composing_len).min(len);
            (start, end)
        })
    }

    /// Clears the active composing span without altering text or selection.
    pub fn finish_composing_text(&mut self) {
        self.composing_start = None;
        self.composing_len = 0;
    }

    /// Updates the UTF-16 selection range from `InputConnection.setSelection`.
    pub fn set_selection(&mut self, start: usize, end: usize) {
        let len = self.utf16_text.len();
        let a = start.min(len);
        let b = end.min(len);
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        self.selected_start = lo;
        self.selected_len = hi - lo;
    }

    fn active_replace_span(&self) -> (usize, usize) {
        let len = self.utf16_text.len();
        if let Some(comp_start) = self.composing_start {
            let start = comp_start.min(len);
            let end = start.saturating_add(self.composing_len).min(len);
            (start, end)
        } else {
            let start = self.selected_start.min(len);
            let end = start.saturating_add(self.selected_len).min(len);
            (start, end)
        }
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

    /// Commits UTF-16 text from `InputConnection.commitText`, replacing the
    /// active composing span (or selection) and clearing composing state.
    pub fn commit_text_utf16(&mut self, utf16: &[u16], new_cursor_pos: i32) {
        let (start, end) = self.active_replace_span();
        self.utf16_text.splice(start..end, utf16.iter().copied());
        self.composing_start = None;
        self.composing_len = 0;
        self.selected_start =
            Self::cursor_after_edit(start, utf16.len(), new_cursor_pos, self.utf16_text.len());
        self.selected_len = 0;
    }

    /// Updates the composing text from `InputConnection.setComposingText`.
    pub fn set_composing_text_utf16(&mut self, utf16: &[u16], new_cursor_pos: i32) {
        let (start, end) = self.active_replace_span();
        self.utf16_text.splice(start..end, utf16.iter().copied());
        if utf16.is_empty() {
            self.composing_start = None;
            self.composing_len = 0;
        } else {
            self.composing_start = Some(start);
            self.composing_len = utf16.len();
        }
        self.selected_start =
            Self::cursor_after_edit(start, utf16.len(), new_cursor_pos, self.utf16_text.len());
        self.selected_len = 0;
    }

    /// Sets or clears the composing span without altering text or selection,
    /// matching AOSP `BaseInputConnection.setComposingRegion`.
    pub fn set_composing_region(&mut self, start: usize, end: usize) {
        let len = self.utf16_text.len();
        let a = start.min(len);
        let b = end.min(len);
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        if lo == hi {
            self.composing_start = None;
            self.composing_len = 0;
        } else {
            self.composing_start = Some(lo);
            self.composing_len = hi - lo;
        }
    }

    /// Replaces UTF-16 range `[start, end)` with `utf16`, clears composing
    /// state, and collapses selection per AOSP `BaseInputConnection.replaceText`.
    pub fn replace_text_utf16(
        &mut self,
        start: usize,
        end: usize,
        utf16: &[u16],
        new_cursor_pos: i32,
    ) {
        let len = self.utf16_text.len();
        let a = start.min(len);
        let b = end.min(len);
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        self.composing_start = None;
        self.composing_len = 0;
        self.utf16_text.splice(lo..hi, utf16.iter().copied());
        self.selected_start =
            Self::cursor_after_edit(lo, utf16.len(), new_cursor_pos, self.utf16_text.len());
        self.selected_len = 0;
    }

    fn is_high_surrogate(u: u16) -> bool {
        (0xD800..=0xDBFF).contains(&u)
    }

    fn is_low_surrogate(u: u16) -> bool {
        (0xDC00..=0xDFFF).contains(&u)
    }

    fn find_index_backward_utf16(units: &[u16], from: usize, code_points: usize) -> Option<usize> {
        let mut idx = from.min(units.len());
        let mut remaining = code_points;
        let mut waiting_high = false;
        while remaining > 0 {
            if idx == 0 {
                return if waiting_high { None } else { Some(0) };
            }
            idx -= 1;
            let u = units[idx];
            if waiting_high {
                if Self::is_high_surrogate(u) {
                    waiting_high = false;
                    remaining -= 1;
                } else {
                    return None;
                }
            } else if Self::is_low_surrogate(u) {
                waiting_high = true;
            } else if Self::is_high_surrogate(u) {
                return None;
            } else {
                remaining -= 1;
            }
        }
        Some(idx)
    }

    fn find_index_forward_utf16(units: &[u16], from: usize, code_points: usize) -> Option<usize> {
        let len = units.len();
        let mut idx = from.min(len);
        let mut remaining = code_points;
        let mut waiting_low = false;
        while remaining > 0 {
            if idx >= len {
                return if waiting_low { None } else { Some(len) };
            }
            let u = units[idx];
            idx += 1;
            if waiting_low {
                if Self::is_low_surrogate(u) {
                    waiting_low = false;
                    remaining -= 1;
                } else {
                    return None;
                }
            } else if Self::is_high_surrogate(u) {
                waiting_low = true;
            } else if Self::is_low_surrogate(u) {
                return None;
            } else {
                remaining -= 1;
            }
        }
        Some(idx)
    }

    /// Deletes `before_code_points` Unicode code points before `min(sel_start, comp_start)`
    /// and `after_code_points` code points after `max(sel_end, comp_end)`, matching AOSP
    /// `BaseInputConnection.deleteSurroundingTextInCodePoints`. Returns `false` with zero
    /// state mutation if an unpaired surrogate is encountered in either scan range.
    pub fn delete_surrounding_text_in_code_points(
        &mut self,
        before_code_points: usize,
        after_code_points: usize,
    ) -> bool {
        let (mut a, mut b) = self.selection_range();
        if let Some((cs, ce)) = self.composing_range() {
            a = a.min(cs);
            b = b.max(ce);
        }
        let Some(start) = Self::find_index_backward_utf16(&self.utf16_text, a, before_code_points)
        else {
            return false;
        };
        let Some(end) = Self::find_index_forward_utf16(&self.utf16_text, b, after_code_points)
        else {
            return false;
        };
        if end > b {
            self.utf16_text.drain(b..end);
        }
        if start < a {
            let removed = a - start;
            self.utf16_text.drain(start..a);
            self.selected_start = self.selected_start.saturating_sub(removed);
            if let Some(cs) = self.composing_start {
                self.composing_start = Some(cs.saturating_sub(removed));
            }
        }
        true
    }

    /// Deletes `before_len` UTF-16 units before `min(sel_start, comp_start)` and
    /// `after_len` units after `max(sel_end, comp_end)` without splitting surrogate
    /// pairs, matching AOSP `BaseInputConnection.deleteSurroundingText` ("Ignore
    /// the composing text"). Full IME integration on physical Android devices is
    /// verified in S2.
    pub fn delete_surrounding_text(&mut self, before_len: usize, after_len: usize) {
        let (mut a, mut b) = self.selection_range();
        if let Some((cs, ce)) = self.composing_range() {
            a = a.min(cs);
            b = b.max(ce);
        }

        // 1. Delete `after_len` UTF-16 units after `b` (surrogate-pair safe).
        //    Because `b >= sel_end` and `b >= comp_end`, neither selection nor composing shifts.
        if after_len > 0 && b < self.utf16_text.len() {
            let mut del_end = b.saturating_add(after_len).min(self.utf16_text.len());
            if del_end > b
                && del_end < self.utf16_text.len()
                && (0xD800..=0xDBFF).contains(&self.utf16_text[del_end - 1])
                && (0xDC00..=0xDFFF).contains(&self.utf16_text[del_end])
            {
                del_end += 1;
            }
            self.utf16_text.drain(b..del_end);
        }

        // 2. Delete `before_len` UTF-16 units before `a` (surrogate-pair safe).
        //    Both `selected_start` and `composing_start` are >= `a`, so both shift left by `removed`.
        if before_len > 0 && a > 0 {
            let mut del_start = a.saturating_sub(before_len);
            if del_start > 0
                && del_start < a
                && (0xD800..=0xDBFF).contains(&self.utf16_text[del_start - 1])
                && (0xDC00..=0xDFFF).contains(&self.utf16_text[del_start])
            {
                del_start -= 1;
            }
            let removed = a - del_start;
            self.utf16_text.drain(del_start..a);
            self.selected_start = self.selected_start.saturating_sub(removed);
            if let Some(cs) = self.composing_start {
                self.composing_start = Some(cs.saturating_sub(removed));
            }
        }
    }
}
