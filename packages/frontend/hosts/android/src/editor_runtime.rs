//! Live pure-Rust BlockSuite editor runtime for the Android thin host.

use std::{cell::RefCell, collections::BTreeMap, rc::Rc, sync::Arc, time::Duration};

use playground::{FormFactor, PlaygroundMode, PlaygroundOptions, PlaygroundView};
use ui::{
    AppContext, Application, ApplicationHandle, Bounds, Edges, KeyDownEvent, Keystroke, Modifiers,
    PlatformInput, ScrollDelta, ScrollEvent, ScrollSource, TouchEvent, TouchId, TouchPhase,
    WindowBounds, WindowInsets, WindowOptions, point, px, size,
};

use crate::{
    LogicalWindowInsets,
    editor_platform::{AndroidDispatcher, AndroidEditorPlatform, AndroidEditorWindow},
};

pub const KEYCODE_DPAD_UP: i32 = 19;
pub const KEYCODE_DPAD_DOWN: i32 = 20;
pub const KEYCODE_DPAD_LEFT: i32 = 21;
pub const KEYCODE_DPAD_RIGHT: i32 = 22;
pub const KEYCODE_TAB: i32 = 61;
pub const KEYCODE_ENTER: i32 = 66;
pub const KEYCODE_DEL: i32 = 67;
pub const KEYCODE_ESCAPE: i32 = 111;
pub const KEYCODE_FORWARD_DEL: i32 = 112;
pub const KEYCODE_NUMPAD_ENTER: i32 = 160;

pub(crate) struct AndroidEditorRuntime {
    pub(crate) app: ApplicationHandle,
    pub(crate) platform: Rc<AndroidEditorPlatform>,
    dispatcher: Arc<AndroidDispatcher>,
    pub(crate) window: AndroidEditorWindow,
    pub(crate) view: ui::WindowHandle<PlaygroundView>,
    form_factor: FormFactor,
    /// Preserved selection when `setComposingRegion` marks a span outside the current caret
    /// (matches AOSP `BaseInputConnection.setComposingRegion`, which must not alter selection).
    preserved_selection_during_composing_region: Option<(usize, usize)>,
}

thread_local! {
    static ANDROID_EDITORS: RefCell<BTreeMap<i64, AndroidEditorRuntime>> =
        const { RefCell::new(BTreeMap::new()) };
}

pub(crate) fn attach_editor(handle: i64, width_dp: f32, height_dp: f32, density: f32) {
    if let Some(rt) =
        AndroidEditorRuntime::new(width_dp, height_dp, density, FormFactor::Phone, false)
    {
        ANDROID_EDITORS.with(|map| {
            map.borrow_mut().insert(handle, rt);
        });
    }
}

pub(crate) fn detach_editor(handle: i64) {
    ANDROID_EDITORS.with(|map| {
        map.borrow_mut().remove(&handle);
    });
}

pub(crate) fn with_editor_mut<R>(
    handle: i64,
    f: impl FnOnce(&mut AndroidEditorRuntime) -> R,
) -> Option<R> {
    ANDROID_EDITORS.with(|map| map.borrow_mut().get_mut(&handle).map(f))
}

impl AndroidEditorRuntime {
    pub(crate) fn new(
        width_dp: f32,
        height_dp: f32,
        density: f32,
        form_factor: FormFactor,
        load_showcase: bool,
    ) -> Option<Self> {
        let w = if width_dp.is_finite() && width_dp > 1.0 {
            width_dp
        } else {
            412.0
        };
        let h = if height_dp.is_finite() && height_dp > 1.0 {
            height_dp
        } else {
            915.0
        };
        let d = if density.is_finite() && density > 0.0 {
            density
        } else {
            2.625
        };

        let platform = Rc::new(AndroidEditorPlatform::new(w, h, d));
        let platform_ref = Rc::clone(&platform);
        let view_slot: Rc<RefCell<Option<ui::WindowHandle<PlaygroundView>>>> =
            Rc::new(RefCell::new(None));
        let view_slot_init = Rc::clone(&view_slot);

        let mut options = PlaygroundOptions::for_form_factor(form_factor);
        options.native_selection_ui = true;
        let bounds = Bounds::new(point(px(0.0), px(0.0)), size(px(w), px(h)));

        let app = Application::with_platform(platform).run_embedded(move |cx| {
            let _ = affine_mobile::register_mobile_fonts(cx);
            let _ = playground::register_bundled_fonts(cx);
            if let Ok(handle) = cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..WindowOptions::default()
                },
                move |window, cx| {
                    window.set_touch_gestures_enabled(true);
                    let entity = cx.new(|cx| PlaygroundView::with_options(options, cx));
                    entity.update(cx, |view, cx| {
                        if load_showcase {
                            view.focus_first_text_block(window, cx);
                        } else {
                            view.load_empty_page_document(window, cx);
                        }
                    });
                    entity
                },
            ) {
                *view_slot_init.borrow_mut() = Some(handle);
            }
        });

        let dispatcher = platform_ref.dispatcher();
        let window = platform_ref.opened_window()?;
        let view = view_slot.borrow_mut().take()?;
        let rt = Self {
            app,
            platform: platform_ref,
            dispatcher,
            window,
            view,
            form_factor,
            preserved_selection_during_composing_region: None,
        };
        let _ = rt.dispatcher.drain_ready();
        rt.window.request_frame_now();
        Some(rt)
    }

    #[cfg(target_os = "android")]
    pub(crate) fn attach_surface(
        &mut self,
        native_window: *mut core::ffi::c_void,
        width_px: u32,
        height_px: u32,
        density: f32,
    ) -> bool {
        let ok = self
            .window
            .attach_native_window(native_window, width_px, height_px);
        self.resize_px(width_px, height_px, density);
        ok
    }

    #[cfg(target_os = "android")]
    pub(crate) fn detach_surface(&mut self) {
        self.window.detach_native_window();
    }

    pub(crate) fn has_gpu_renderer(&self) -> bool {
        self.window.has_gpu_renderer()
    }

    pub(crate) fn drain_tasks(&self) -> Option<Duration> {
        self.dispatcher.drain_ready()
    }

    pub(crate) fn resize_px(&mut self, width_px: u32, height_px: u32, density: f32) {
        let d = if density.is_finite() && density > 0.0 {
            density
        } else {
            1.0
        };
        let w = (width_px as f32 / d).max(1.0);
        let h = (height_px as f32 / d).max(1.0);
        self.window.set_viewport(w, h, d);
        let _ = self.dispatcher.drain_ready();
        self.window.request_frame_now();
    }

    pub(crate) fn set_insets(&mut self, insets: LogicalWindowInsets) {
        let ui_insets = WindowInsets {
            safe_area: Edges {
                top: px(insets.safe_top.max(0.0)),
                right: px(insets.safe_right.max(0.0)),
                bottom: px(insets.safe_bottom.max(0.0)),
                left: px(insets.safe_left.max(0.0)),
            },
            ime: Edges {
                top: px(0.0),
                right: px(0.0),
                bottom: px(insets.ime_bottom.max(0.0)),
                left: px(0.0),
            },
            ..WindowInsets::default()
        };
        self.window.set_insets(ui_insets);
    }

    pub(crate) fn is_dirty(&self) -> bool {
        self.window.state.borrow().dirty
    }

    pub(crate) fn mark_dirty(&mut self) {
        self.window.state.borrow_mut().dirty = true;
    }

    pub(crate) fn set_waker(&self, waker: Option<Arc<dyn Fn() + Send + Sync>>) {
        self.dispatcher.set_waker(waker);
    }

    pub(crate) fn has_pending_main_tasks(&self) -> bool {
        self.dispatcher.has_pending_main_tasks()
    }

    pub(crate) fn is_dark_theme(&self) -> bool {
        self.app
            .update(|cx| {
                self.view.read_with(cx, |view, _| {
                    view.theme() == playground::PlaygroundTheme::Dark
                })
            })
            .unwrap_or(false)
    }

    pub(crate) fn render_frame(&mut self) -> bool {
        let _ = self.dispatcher.drain_ready();
        if !self.is_dirty() {
            return false;
        }
        self.window.request_frame_now();
        true
    }

    pub(crate) fn set_form_factor_from_smallest_width_dp(&mut self, smallest_width_dp: i32) {
        let ff = FormFactor::from_android_smallest_width_dp(smallest_width_dp);
        self.set_form_factor(ff);
    }

    pub(crate) fn set_form_factor(&mut self, form_factor: FormFactor) {
        self.form_factor = form_factor;
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |view, window, cx| {
                view.set_form_factor(form_factor, window, cx);
            });
        });
        self.window.request_frame_now();
    }

    pub(crate) fn wants_software_keyboard(&self) -> bool {
        self.app
            .update(|cx| {
                self.view
                    .read_with(cx, |view, _| view.wants_software_keyboard())
            })
            .unwrap_or(false)
    }

    pub(crate) fn edgeless_readonly(&self) -> bool {
        self.app
            .update(|cx| self.view.read_with(cx, |view, _| view.edgeless_readonly()))
            .unwrap_or(true)
    }

    pub(crate) fn database_readonly(&self) -> bool {
        self.app
            .update(|cx| self.view.read_with(cx, |view, _| view.database_readonly()))
            .unwrap_or(true)
    }

    pub(crate) fn set_mode(&mut self, mode: PlaygroundMode) {
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |v, w, cx| v.set_mode(mode, w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn load_showcase_document(&mut self) {
        self.preserved_selection_during_composing_region = None;
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |v, w, cx| v.load_showcase_document(w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn reset_empty_document(&mut self) {
        self.preserved_selection_during_composing_region = None;
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |v, w, cx| v.load_empty_page_document(w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn dispatch_touch(&mut self, pointer_id: u64, phase: u8, x_dp: f32, y_dp: f32) {
        self.preserved_selection_during_composing_region = None;
        let touch_phase = match phase {
            0 => TouchPhase::Started,
            1 => TouchPhase::Moved,
            2 => TouchPhase::Ended,
            _ => TouchPhase::Cancelled,
        };
        let event = TouchEvent {
            id: TouchId(pointer_id),
            phase: touch_phase,
            position: point(px(x_dp), px(y_dp)),
            predicted_position: None,
            force: None,
        };
        let _ = self.window.dispatch_input(PlatformInput::Touch(event));
        self.window.request_frame_now();
    }

    pub(crate) fn dispatch_scroll_wheel(&mut self, x: f32, y: f32, dx: f32, dy: f32) {
        let _ = self
            .window
            .dispatch_input(PlatformInput::Scroll(ScrollEvent {
                position: point(px(x), px(y)),
                delta: ScrollDelta::Pixels(point(px(dx), px(dy))),
                modifiers: Modifiers::default(),
                touch_phase: TouchPhase::Moved,
                source: ScrollSource::Pointer,
            }));
        self.window.request_frame_now();
    }

    pub(crate) fn handle_back(&mut self) -> bool {
        let handled = self.app.update(|cx| {
            self.view
                .update(cx, |v, w, cx| v.handle_back(w, cx))
                .unwrap_or(false)
        });
        if handled {
            self.window.request_frame_now();
        }
        handled
    }

    pub(crate) fn dispatch_key_code(
        &mut self,
        key_code: i32,
        shift: bool,
        ctrl: bool,
        alt: bool,
    ) -> bool {
        let key_name = match key_code {
            KEYCODE_DEL => "backspace",
            KEYCODE_FORWARD_DEL => "delete",
            KEYCODE_ENTER | KEYCODE_NUMPAD_ENTER => "enter",
            KEYCODE_DPAD_LEFT => "left",
            KEYCODE_DPAD_RIGHT => "right",
            KEYCODE_DPAD_UP => "up",
            KEYCODE_DPAD_DOWN => "down",
            KEYCODE_ESCAPE => "escape",
            KEYCODE_TAB => "tab",
            _ => return false,
        };
        self.preserved_selection_during_composing_region = None;
        if self.composing_range().is_some()
            && matches!(key_code, KEYCODE_ENTER | KEYCODE_NUMPAD_ENTER)
        {
            self.finish_composing_text();
        }
        let event = KeyDownEvent {
            keystroke: Keystroke {
                modifiers: Modifiers {
                    control: ctrl,
                    alt,
                    shift,
                    platform: false,
                    function: false,
                },
                key: key_name.to_string(),
                key_char: None,
            },
            is_held: false,
            prefer_character_input: false,
        };
        let _ = self.window.dispatch_input(PlatformInput::KeyDown(event));
        self.window.request_frame_now();
        true
    }

    pub(crate) fn text_input_change_seq(&self) -> u64 {
        self.window.state.borrow().text_input_change_seq
    }

    pub(crate) fn focused_block_hash(&self) -> u64 {
        self.app
            .update(|cx| {
                self.view.read_with(cx, |view, _| {
                    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
                    if let Some(sel) = view.document_selection() {
                        for b in sel.focus.block_id.as_bytes() {
                            h ^= u64::from(*b);
                            h = h.wrapping_mul(0x0100_0000_01b3);
                        }
                    }
                    h
                })
            })
            .unwrap_or(0)
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn android_editor_runtime_gboard_composing_region_and_stage_one_readonly() {
        let mut rt =
            AndroidEditorRuntime::new(412.0, 915.0, 2.625, FormFactor::Phone, false).expect("rt");
        assert!(rt.edgeless_readonly());
        assert!(rt.database_readonly());

        // H-A1: Gboard backspace-into-word: " hello" -> setComposingRegion(1, 6) -> setComposingText("hellos")
        let hello: Vec<u16> = " hello".encode_utf16().collect();
        rt.commit_text_utf16(&hello, 1);
        assert_eq!(String::from_utf16_lossy(&rt.utf16_text()), " hello");

        rt.set_composing_region(1, 6);
        assert_eq!(rt.composing_range(), Some((1, 6)));

        let hellos: Vec<u16> = "hellos".encode_utf16().collect();
        rt.set_composing_text_utf16(&hellos, 1);
        assert_eq!(
            String::from_utf16_lossy(&rt.utf16_text()),
            " hellos",
            "Gboard composing region replacement must not duplicate 'hello'"
        );

        // KeyEvent ENTER splits block, KEYCODE_DEL at block start merges back.
        assert!(rt.dispatch_key_code(KEYCODE_ENTER, false, false, false));
        assert_eq!(String::from_utf16_lossy(&rt.utf16_text()), "");
        assert!(rt.dispatch_key_code(KEYCODE_DEL, false, false, false));
        assert_eq!(String::from_utf16_lossy(&rt.utf16_text()), " hellos");

        // H-A1 surrogate pair alignment: "a😀b" has '😀' at UTF-16 [1..3).
        // Passing an interior surrogate index (1..2) must align to the full scalar range [1..3).
        rt.reset_empty_document();
        let emoji: Vec<u16> = "a😀b".encode_utf16().collect();
        rt.commit_text_utf16(&emoji, 1);
        rt.set_composing_region(1, 2);
        let replacement: Vec<u16> = "🎉".encode_utf16().collect();
        rt.set_composing_text_utf16(&replacement, 1);
        assert_eq!(
            String::from_utf16_lossy(&rt.utf16_text()),
            "a🎉b",
            "surrogate-pair composing region must align cleanly without splitting or duplicating"
        );

        // FormFactor Phone/Tablet read-only vs Desktop unlocked.
        rt.set_form_factor_from_smallest_width_dp(720);
        assert!(rt.edgeless_readonly());
        assert!(rt.database_readonly());
        rt.set_form_factor(FormFactor::Desktop);
        assert!(!rt.edgeless_readonly());
        assert!(!rt.database_readonly());
    }

    #[test]
    fn android_editor_runtime_frame_dirty_lifecycle_and_block_start_delete_surrounding() {
        let mut rt =
            AndroidEditorRuntime::new(412.0, 915.0, 2.625, FormFactor::Phone, false).expect("rt");
        // Initial frame clears dirty to false when idle.
        let _ = rt.render_frame();
        assert!(
            !rt.is_dirty(),
            "idle frame must leave is_dirty() == false for 0-fps idle"
        );
        assert!(
            !rt.render_frame(),
            "second idle render_frame() must skip GPU draw"
        );

        // 1. Delayed timer triggering cx.notify() must mark dirty == true and render on next tick.
        let (wake_tx, wake_rx) = std::sync::mpsc::channel();
        rt.set_waker(Some(Arc::new(move || {
            let _ = wake_tx.send(());
        })));
        let view = rt.view;
        rt.app.update(|cx| {
            let bg = cx.background_executor().clone();
            cx.spawn(async move |cx| {
                bg.timer(Duration::from_millis(50)).await;
                let _ = cx.update(|cx| {
                    let _ = view.update(cx, |_, _, cx| cx.notify());
                });
            })
            .detach();
        });
        let _ = rt.drain_tasks();
        assert!(!rt.is_dirty());
        while wake_rx.try_recv().is_ok() {}
        rt.dispatcher.advance_test_clock(Duration::from_millis(60));
        let _ = rt.drain_tasks();
        while !rt.is_dirty() {
            wake_rx
                .recv_timeout(Duration::from_secs(1))
                .expect("timer wakeup");
            let _ = rt.drain_tasks();
        }
        rt.set_waker(None);
        assert!(
            rt.is_dirty(),
            "timer-driven cx.notify() must set is_dirty() == true via frame_waker"
        );
        assert!(rt.render_frame(), "dirty frame must execute render_frame()");
        assert!(
            !rt.is_dirty(),
            "after idle draw, is_dirty() returns to false"
        );

        // 2. Requesting an animation frame *during* render_frame() must keep is_dirty() == true
        // immediately after render_frame() returns (continuous animation liveness).
        rt.set_mode(PlaygroundMode::Edgeless);
        assert!(rt.is_dirty(), "mode switch must mark dirty");
        assert!(
            rt.render_frame(),
            "first animation frame after mode switch must execute"
        );
        assert!(
            rt.is_dirty(),
            "request_animation_frame() called inside render_frame() must preserve is_dirty() == true"
        );
        rt.set_mode(PlaygroundMode::Page);
        let _ = rt.render_frame();

        // 3. Block-start deleteSurroundingText(1, 0) bridges to structural Backspace (merges blocks).
        let first: Vec<u16> = "Alpha".encode_utf16().collect();
        rt.commit_text_utf16(&first, 1);
        assert!(rt.dispatch_key_code(KEYCODE_ENTER, false, false, false));
        assert_eq!(String::from_utf16_lossy(&rt.utf16_text()), "");
        rt.delete_surrounding_text(1, 0);
        assert_eq!(
            String::from_utf16_lossy(&rt.utf16_text()),
            "Alpha",
            "deleteSurroundingText(1, 0) at block start must bridge to structural Backspace"
        );
    }
}
