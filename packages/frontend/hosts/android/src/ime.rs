use crate::AndroidHostState;
use crate::selection::SelectionHandleKind;
use crate::text_layout::{
    caret_position_for_offset, closest_offset_for_position, detect_direction_at_offset,
};

impl AndroidHostState {
    /// Synchronizes native selection handles with the current UTF-16 selection.
    ///
    /// Preserves active drag state when passing through zero-length coincidence points.
    pub fn sync_selection_overlay_from_ime(&mut self) {
        let (start, end) = self.selection_range();
        let utf16 = self.utf16_text.clone();
        self.sync_selection_overlay_for_snapshot(&utf16, start, end);
    }

    /// Synchronizes native selection handles from an authoritative editor UTF-16 snapshot
    /// without storing a duplicate host text copy (`H-S1`).
    pub fn sync_selection_overlay_for_snapshot(&mut self, utf16: &[u16], start: usize, end: usize) {
        if self.selection.active_drag != SelectionHandleKind::None {
            return;
        }
        if start == end {
            self.selection.clear();
            return;
        }
        let (sx, sy) = caret_position_for_offset(utf16, start, &self.text_layout);
        let (ex, ey) = caret_position_for_offset(utf16, end, &self.text_layout);
        let dir = detect_direction_at_offset(utf16, start, &self.text_layout);
        self.selection
            .update_selection(sx, sy, ex, ey, self.text_layout.line_height, dir, true);
    }

    /// Starts dragging a selection handle and locks the opposite UTF-16 anchor so
    /// slow drags across zero-length coincidence points smoothly invert selection.
    pub fn begin_selection_handle_drag(
        &mut self,
        touch_x: f32,
        touch_y: f32,
    ) -> SelectionHandleKind {
        let hit = self.selection.begin_drag(touch_x, touch_y);
        let (sel_start, sel_end) = self.selection_range();
        self.selection_drag_initial_handle = hit;
        self.selection_drag_anchor_utf16 = match hit {
            SelectionHandleKind::Start => Some(sel_end),
            SelectionHandleKind::End => Some(sel_start),
            SelectionHandleKind::None => None,
        };
        hit
    }

    /// Continues dragging the active selection handle, using UTF-16 offset comparison
    /// against the locked anchor as the single authority for handle ownership and
    /// magnifier placement.
    pub fn update_selection_handle_drag(&mut self, touch_x: f32, touch_y: f32) -> bool {
        if let Some(anchor) = self.selection_drag_anchor_utf16 {
            let Some((probe_x, probe_y)) = self.selection.probe_drag_position(touch_x, touch_y)
            else {
                return false;
            };
            let offset =
                closest_offset_for_position(&self.utf16_text, probe_x, probe_y, &self.text_layout);
            let (lo, hi, active_handle) = if offset < anchor {
                (offset, anchor, SelectionHandleKind::Start)
            } else if offset > anchor {
                (anchor, offset, SelectionHandleKind::End)
            } else {
                (anchor, anchor, self.selection_drag_initial_handle)
            };
            self.selected_start = lo;
            self.selected_len = hi - lo;
            let (sx, sy) = caret_position_for_offset(&self.utf16_text, lo, &self.text_layout);
            let (ex, ey) = caret_position_for_offset(&self.utf16_text, hi, &self.text_layout);
            let dir = detect_direction_at_offset(&self.utf16_text, lo, &self.text_layout);
            self.selection.apply_text_drag_endpoints(
                sx,
                sy,
                ex,
                ey,
                self.text_layout.line_height,
                dir,
                active_handle,
            );
            return true;
        }
        false
    }

    /// Finishes dragging a selection handle and snaps handles to the final UTF-16 range.
    pub fn end_selection_handle_drag(&mut self) -> bool {
        self.selection_drag_anchor_utf16 = None;
        self.selection_drag_initial_handle = SelectionHandleKind::None;
        let has_menu = self.selection.end_drag().is_some();
        if self.selected_len == 0 && self.selection.has_selection {
            // Keep handles only if text selection is non-empty when synced with text.
            if !self.utf16_text.is_empty() {
                self.selection.clear();
                return false;
            }
        } else if self.selected_len > 0 {
            self.sync_selection_overlay_from_ime();
        }
        has_menu
    }

    /// Cancels an active handle drag (`ACTION_CANCEL`), hiding the magnifier.
    pub fn cancel_selection_handle_drag(&mut self) {
        self.selection_drag_anchor_utf16 = None;
        self.selection_drag_initial_handle = SelectionHandleKind::None;
        let _ = self.selection.end_drag();
        if !self.utf16_text.is_empty() {
            self.sync_selection_overlay_from_ime();
        }
    }

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
        self.sync_selection_overlay_from_ime();
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
        self.sync_selection_overlay_from_ime();
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
        self.sync_selection_overlay_from_ime();
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
        self.sync_selection_overlay_from_ime();
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
