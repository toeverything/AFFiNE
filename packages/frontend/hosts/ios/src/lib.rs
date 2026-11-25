#![deny(unsafe_code)]

//! Thin iOS C-ABI host crate (`affine-ios-host`).
//!
//! Owns the authoritative UTF-16 text editing state (surrogate-pair safe),
//! clamped selection/marked ranges, safe-area and IME insets, frame tick
//! accounting, in-place 0.27.5 SQLite WAL co-storage, Keychain 2001-epoch
//! token compatibility, and zero-IDB `capacitor://localhost` upgrade/rollback
//! bridges behind `include/affine_mobile_host.h`.

pub mod auth;
pub mod ffi;
pub mod legacy_storage;
pub mod workspace_store;

/// C-ABI window insets matching `AffineWindowInsets` in `include/affine_mobile_host.h`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AffineWindowInsets {
    pub safe_top: f32,
    pub safe_right: f32,
    pub safe_bottom: f32,
    pub safe_left: f32,
    /// Absolute keyboard overlap height from the window bottom edge in logical points.
    /// Does not subtract `safe_bottom`; `ui::WindowInsets::effective()` takes the max.
    pub ime_bottom: f32,
}

/// C-ABI UTF-16 range matching `AffineUtf16Range` in `include/affine_mobile_host.h`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AffineUtf16Range {
    pub location: u32,
    pub length: u32,
}

/// Pure safe-Rust state backing an `AffineIosHost` handle.
#[derive(Debug, Clone, Default)]
pub struct IosHostState {
    width_pt: f32,
    height_pt: f32,
    scale_factor: f32,
    insets: AffineWindowInsets,
    frame_count: u64,
    last_frame_timestamp_sec: f64,
    dirty: bool,
    utf16_text: Vec<u16>,
    selected_range: AffineUtf16Range,
    marked_range: Option<AffineUtf16Range>,
}

impl IosHostState {
    pub fn new(width_pt: f32, height_pt: f32, scale_factor: f32) -> Self {
        Self {
            width_pt: width_pt.max(0.0),
            height_pt: height_pt.max(0.0),
            scale_factor: if scale_factor.is_finite() && scale_factor > 0.0 {
                scale_factor
            } else {
                1.0
            },
            dirty: true,
            ..Self::default()
        }
    }

    pub fn resize(&mut self, width_pt: f32, height_pt: f32, scale_factor: f32) {
        self.width_pt = width_pt.max(0.0);
        self.height_pt = height_pt.max(0.0);
        if scale_factor.is_finite() && scale_factor > 0.0 {
            self.scale_factor = scale_factor;
        }
        self.dirty = true;
    }

    pub fn set_insets(&mut self, insets: AffineWindowInsets) {
        let next = AffineWindowInsets {
            safe_top: insets.safe_top.max(0.0),
            safe_right: insets.safe_right.max(0.0),
            safe_bottom: insets.safe_bottom.max(0.0),
            safe_left: insets.safe_left.max(0.0),
            ime_bottom: insets.ime_bottom.max(0.0),
        };
        if next != self.insets {
            self.insets = next;
            self.dirty = true;
        }
    }

    pub fn insets(&self) -> AffineWindowInsets {
        self.insets
    }

    pub const DEFAULT_CLEAR_COLOR_RGBA: u32 = 0x1414_14FF;

    /// Mark the host surface dirty so the next `render_frame` tick draws.
    pub fn request_frame(&mut self) {
        self.dirty = true;
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    pub fn render_frame(&mut self, timestamp_sec: f64) -> u32 {
        if !self.dirty {
            return 0;
        }
        self.dirty = false;
        self.frame_count = self.frame_count.saturating_add(1);
        if timestamp_sec.is_finite() {
            self.last_frame_timestamp_sec = timestamp_sec;
        }
        Self::DEFAULT_CLEAR_COLOR_RGBA
    }

    pub fn frame_count(&self) -> u64 {
        self.frame_count
    }

    pub fn utf16_text(&self) -> &[u16] {
        &self.utf16_text
    }

    pub fn selected_range(&self) -> AffineUtf16Range {
        self.clamp_range(self.selected_range)
    }

    pub fn marked_range(&self) -> AffineUtf16Range {
        self.marked_range
            .map(|r| self.clamp_range(r))
            .unwrap_or(AffineUtf16Range {
                location: u32::MAX,
                length: 0,
            })
    }

    pub fn insert_text(&mut self, utf16: &[u16]) {
        let target = self.clamp_range(self.marked_range.unwrap_or(self.selected_range));
        let start = target.location as usize;
        let end = start + target.length as usize;
        self.utf16_text.splice(start..end, utf16.iter().copied());
        let new_loc = (start + utf16.len()).min(u32::MAX as usize) as u32;
        self.selected_range = AffineUtf16Range {
            location: new_loc,
            length: 0,
        };
        self.marked_range = None;
        self.dirty = true;
    }

    /// Deletes the active selection, or one full UTF-16 scalar (including
    /// surrogate pairs such as Emoji) before the caret.
    pub fn delete_backward(&mut self) {
        let sel = self.clamp_range(self.selected_range);
        if sel.length > 0 {
            let start = sel.location as usize;
            let end = start + sel.length as usize;
            self.utf16_text.drain(start..end);
            self.selected_range = AffineUtf16Range {
                location: sel.location,
                length: 0,
            };
            self.shrink_marked_range(start, end);
            self.dirty = true;
            return;
        }
        if sel.location == 0 {
            return;
        }
        let end = sel.location as usize;
        let mut start = end - 1;
        if start > 0 {
            let prev = self.utf16_text[start];
            let before = self.utf16_text[start - 1];
            if (0xDC00..=0xDFFF).contains(&prev) && (0xD800..=0xDBFF).contains(&before) {
                start -= 1;
            }
        }
        self.utf16_text.drain(start..end);
        self.selected_range = AffineUtf16Range {
            location: start as u32,
            length: 0,
        };
        self.shrink_marked_range(start, end);
        self.dirty = true;
    }

    /// Deletes an explicit UTF-16 range (for grapheme clusters such as multi-codepoint
    /// ZWJ Emoji computed by UIKit `rangeOfComposedCharacterSequence`) and places the
    /// caret at the start of the deleted range.
    pub fn delete_range(&mut self, range: AffineUtf16Range) {
        let clamped = self.clamp_range(range);
        if clamped.length == 0 {
            return;
        }
        let start = clamped.location as usize;
        let end = start + clamped.length as usize;
        self.utf16_text.drain(start..end);
        self.selected_range = AffineUtf16Range {
            location: clamped.location,
            length: 0,
        };
        self.shrink_marked_range(start, end);
        self.dirty = true;
    }

    /// Updates the active UTF-16 selection range (clamped to current buffer bounds).
    pub fn set_selected_range(&mut self, range: AffineUtf16Range) {
        let next = self.clamp_range(range);
        if next != self.selected_range {
            self.selected_range = next;
            self.dirty = true;
        }
    }

    /// Replaces an explicit UTF-16 range with `utf16`, moves the caret to the end
    /// of the replacement, and clears any active marked range.
    pub fn replace_range(&mut self, range: AffineUtf16Range, utf16: &[u16]) {
        let clamped = self.clamp_range(range);
        let start = clamped.location as usize;
        let end = start + clamped.length as usize;
        self.utf16_text.splice(start..end, utf16.iter().copied());
        let new_loc = start.saturating_add(utf16.len()).min(u32::MAX as usize) as u32;
        self.selected_range = AffineUtf16Range {
            location: new_loc,
            length: 0,
        };
        self.marked_range = None;
        self.dirty = true;
    }

    pub fn set_marked_text(&mut self, utf16: &[u16], selected_in_marked: AffineUtf16Range) {
        let target = self.clamp_range(self.marked_range.unwrap_or(self.selected_range));
        let start = target.location as usize;
        let end = start + target.length as usize;
        self.utf16_text.splice(start..end, utf16.iter().copied());
        if utf16.is_empty() {
            self.marked_range = None;
            self.selected_range = AffineUtf16Range {
                location: target.location,
                length: 0,
            };
        } else {
            let marked_len = utf16.len().min(u32::MAX as usize) as u32;
            self.marked_range = Some(AffineUtf16Range {
                location: target.location,
                length: marked_len,
            });
            let rel_loc = selected_in_marked.location.min(marked_len);
            let rel_len = selected_in_marked.length.min(marked_len - rel_loc);
            self.selected_range = AffineUtf16Range {
                location: target.location.saturating_add(rel_loc),
                length: rel_len,
            };
        }
        self.dirty = true;
    }

    pub fn unmark_text(&mut self) {
        if self.marked_range.take().is_some() {
            self.dirty = true;
        }
    }

    fn clamp_range(&self, range: AffineUtf16Range) -> AffineUtf16Range {
        let max_len = self.utf16_text.len().min(u32::MAX as usize) as u32;
        let loc = range.location.min(max_len);
        let len = range.length.min(max_len - loc);
        AffineUtf16Range {
            location: loc,
            length: len,
        }
    }

    fn shrink_marked_range(&mut self, del_start: usize, del_end: usize) {
        let Some(marked) = self.marked_range else {
            return;
        };
        let m_start = marked.location as usize;
        let m_end = m_start + marked.length as usize;
        let del_len = del_end - del_start;
        if del_end <= m_start {
            self.marked_range = Some(AffineUtf16Range {
                location: (m_start - del_len) as u32,
                length: marked.length,
            });
        } else if del_start < m_end {
            let overlap = m_end.min(del_end).saturating_sub(m_start.max(del_start));
            let remaining = (marked.length as usize).saturating_sub(overlap);
            if remaining == 0 {
                self.marked_range = None;
            } else {
                self.marked_range = Some(AffineUtf16Range {
                    location: m_start.min(del_start) as u32,
                    length: remaining as u32,
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ios_host_state_handles_emoji_surrogate_delete_and_marked_text() {
        let mut state = IosHostState::new(390.0, 844.0, 3.0);
        let emoji: Vec<u16> = "A😀".encode_utf16().collect();
        assert_eq!(emoji.len(), 3);
        state.insert_text(&emoji);
        assert_eq!(
            state.selected_range(),
            AffineUtf16Range {
                location: 3,
                length: 0
            }
        );

        state.delete_backward();
        assert_eq!(String::from_utf16(state.utf16_text()).unwrap(), "A");
        assert_eq!(
            state.selected_range(),
            AffineUtf16Range {
                location: 1,
                length: 0
            }
        );

        let marked: Vec<u16> = "ni".encode_utf16().collect();
        state.set_marked_text(
            &marked,
            AffineUtf16Range {
                location: 2,
                length: 0,
            },
        );
        assert_eq!(
            state.marked_range(),
            AffineUtf16Range {
                location: 1,
                length: 2
            }
        );
        state.delete_backward();
        assert_eq!(
            state.marked_range(),
            AffineUtf16Range {
                location: 1,
                length: 1
            }
        );
        state.unmark_text();
        assert_eq!(state.marked_range().location, u32::MAX);

        let zwj_family: Vec<u16> = "👨‍👩‍👧‍👦".encode_utf16().collect();
        assert_eq!(zwj_family.len(), 11);
        state.insert_text(&zwj_family);
        assert_eq!(state.utf16_text().len(), 13);
        state.delete_range(AffineUtf16Range {
            location: 2,
            length: 11,
        });
        assert_eq!(String::from_utf16(state.utf16_text()).unwrap(), "An");
        assert_eq!(
            state.selected_range(),
            AffineUtf16Range {
                location: 2,
                length: 0
            }
        );
    }

    #[test]
    fn ios_host_insets_and_frame_counter_clamp_negatives() {
        let mut state = IosHostState::new(390.0, 844.0, 3.0);
        state.set_insets(AffineWindowInsets {
            safe_top: 59.0,
            safe_right: 0.0,
            safe_bottom: 34.0,
            safe_left: 0.0,
            ime_bottom: -5.0,
        });
        assert_eq!(state.insets().ime_bottom, 0.0);
        state.set_insets(AffineWindowInsets {
            safe_top: 59.0,
            safe_right: 0.0,
            safe_bottom: 34.0,
            safe_left: 0.0,
            ime_bottom: 302.0,
        });
        assert_eq!(state.insets().safe_bottom, 34.0);
        assert_eq!(state.insets().ime_bottom, 302.0);
        let color = state.render_frame(1.25);
        assert_eq!(color, IosHostState::DEFAULT_CLEAR_COLOR_RGBA);
        assert_eq!(state.frame_count(), 1);
        // Idle frame returns 0 and skips GPU submission until dirty again.
        assert_eq!(state.render_frame(1.266), 0);
        assert_eq!(state.frame_count(), 1);
        state.request_frame();
        assert_eq!(
            state.render_frame(1.283),
            IosHostState::DEFAULT_CLEAR_COLOR_RGBA
        );
        assert_eq!(state.frame_count(), 2);
    }

    #[test]
    fn ios_host_replace_range_and_set_selected_range_match_uikit_autocorrect() {
        let mut state = IosHostState::new(390.0, 844.0, 3.0);
        let ab: Vec<u16> = "AB".encode_utf16().collect();
        state.insert_text(&ab);
        assert_eq!(state.selected_range().location, 2);

        let x: Vec<u16> = "X".encode_utf16().collect();
        state.replace_range(
            AffineUtf16Range {
                location: 0,
                length: 1,
            },
            &x,
        );
        assert_eq!(String::from_utf16(state.utf16_text()).unwrap(), "XB");
        assert_eq!(
            state.selected_range(),
            AffineUtf16Range {
                location: 1,
                length: 0
            }
        );

        let mut spell = IosHostState::new(390.0, 844.0, 3.0);
        let teh_cat: Vec<u16> = "teh cat".encode_utf16().collect();
        spell.insert_text(&teh_cat);
        assert_eq!(spell.selected_range().location, 7);
        let the: Vec<u16> = "the".encode_utf16().collect();
        spell.replace_range(
            AffineUtf16Range {
                location: 0,
                length: 3,
            },
            &the,
        );
        assert_eq!(String::from_utf16(spell.utf16_text()).unwrap(), "the cat");
        assert_eq!(
            spell.selected_range(),
            AffineUtf16Range {
                location: 3,
                length: 0
            }
        );

        spell.set_selected_range(AffineUtf16Range {
            location: 4,
            length: 3,
        });
        assert_eq!(
            spell.selected_range(),
            AffineUtf16Range {
                location: 4,
                length: 3
            }
        );
    }
}
