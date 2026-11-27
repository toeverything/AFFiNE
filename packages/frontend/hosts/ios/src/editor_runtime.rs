//! Live pure-Rust BlockSuite GPU editor runtime hosted inside `AffineIosHost`.
//!
//! Owns the embedded GPUI [`ui::ApplicationHandle`], [`IosEditorWindow`], and
//! [`playground::PlaygroundView`] so `UITextInput`, touch gestures, hardware keys,
//! and Metal frame rendering all talk to one authoritative `PlatformInputHandler`
//! and CRDT document (zero host text copy).

use std::{ffi::c_void, rc::Rc};

use playground::{FormFactor, PlaygroundMode, PlaygroundOptions, PlaygroundView};
use ui::{
    AppContext, Application, ApplicationHandle, Bounds, Edges, KeyDownEvent, Keystroke, Modifiers,
    PlatformInput, TextInputStateChange, TouchEvent, TouchId, TouchPhase, WindowBounds,
    WindowInsets, WindowOptions, point, px, size,
};

use super::{
    AffineUtf16Range, AffineWindowInsets, IosHostState,
    editor_platform::{IosEditorPlatform, IosEditorWindow, TextInputObserver},
    selection::{AffinePoint, AffineRect, AffineWritingDirection},
    text_layout::{AffineSelectionRect, detect_paragraph_writing_direction},
};

/// Live GPU editor runtime embedded in `AffineIosHost`.
pub(crate) struct IosEditorRuntime {
    app: ApplicationHandle,
    window: IosEditorWindow,
    view: ui::WindowHandle<PlaygroundView>,
    form_factor: FormFactor,
    frame_count: u64,
    last_frame_timestamp_sec: f64,
}

impl IosEditorRuntime {
    pub(crate) fn new(
        width_pt: f32,
        height_pt: f32,
        scale_factor: f32,
        form_factor: FormFactor,
        load_showcase: bool,
    ) -> Option<Self> {
        let w = if width_pt.is_finite() && width_pt > 1.0 {
            width_pt
        } else {
            390.0
        };
        let h = if height_pt.is_finite() && height_pt > 1.0 {
            height_pt
        } else {
            844.0
        };
        let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            2.0
        };

        let platform = Rc::new(IosEditorPlatform::new(w, h, scale));
        let platform_ref = Rc::clone(&platform);
        let view_slot: Rc<std::cell::RefCell<Option<ui::WindowHandle<PlaygroundView>>>> =
            Rc::new(std::cell::RefCell::new(None));
        let view_slot_init = Rc::clone(&view_slot);

        let options = PlaygroundOptions::for_form_factor(form_factor);
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
                        if !load_showcase {
                            view.load_empty_page_document(window, cx);
                        } else {
                            view.focus_first_text_block(window, cx);
                        }
                    });
                    entity
                },
            ) {
                *view_slot_init.borrow_mut() = Some(handle);
            }
        });

        let window = platform_ref.opened_window()?;
        let view = view_slot.borrow_mut().take()?;
        let runtime = Self {
            app,
            window,
            view,
            form_factor,
            frame_count: 0,
            last_frame_timestamp_sec: 0.0,
        };
        // Render initial frame so layout and `PlatformInputHandler` are live immediately.
        runtime.window.request_frame_now();
        Some(runtime)
    }

    pub(crate) fn metal_layer_ptr(&self) -> *mut c_void {
        self.window.metal_layer_ptr()
    }

    pub(crate) fn window_handle(&self) -> IosEditorWindow {
        self.window.clone()
    }

    pub(crate) fn resize(&mut self, width_pt: f32, height_pt: f32, scale_factor: f32) {
        self.window.set_viewport(width_pt, height_pt, scale_factor);
        self.window.request_frame_now();
    }

    pub(crate) fn set_insets(&mut self, insets: AffineWindowInsets) {
        // `KeyboardAvoidanceCoordinator` computes `insets.ime_bottom` relative to
        // `hostView` (which is already framed inside `view.safeAreaInsets`), so
        // `insets.ime_bottom` is already the non-double-counted keyboard overlap
        // above the bottom safe area.
        let ime_above_safe = insets.ime_bottom.max(0.0);
        let ui_insets = WindowInsets {
            safe_area: Edges::default(),
            ime: Edges {
                top: px(0.0),
                right: px(0.0),
                bottom: px(ime_above_safe),
                left: px(0.0),
            },
            ..WindowInsets::default()
        };
        self.window.set_insets(ui_insets);
    }

    pub(crate) fn request_frame(&mut self) {
        self.window.state.borrow_mut().dirty = true;
    }

    pub(crate) fn is_dirty(&self) -> bool {
        self.window.state.borrow().dirty
    }

    pub(crate) fn render_frame(&mut self, timestamp_sec: f64) -> u32 {
        if !self.is_dirty() {
            return 0;
        }
        self.window.request_frame_now();
        self.frame_count = self.frame_count.saturating_add(1);
        if timestamp_sec.is_finite() {
            self.last_frame_timestamp_sec = timestamp_sec;
        }
        IosHostState::DEFAULT_CLEAR_COLOR_RGBA
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

    #[cfg(test)]
    pub(crate) fn form_factor(&self) -> FormFactor {
        self.form_factor
    }

    pub(crate) fn edgeless_readonly(&self) -> bool {
        self.app
            .update(|cx| self.view.read_with(cx, |view, _| view.edgeless_readonly()))
            .unwrap_or(true)
    }

    pub(crate) fn wants_software_keyboard(&self) -> bool {
        self.app
            .update(|cx| {
                self.view
                    .read_with(cx, |view, _| view.wants_software_keyboard())
            })
            .unwrap_or(false)
    }

    pub(crate) fn database_readonly(&self) -> bool {
        self.app
            .update(|cx| self.view.read_with(cx, |view, _| view.database_readonly()))
            .unwrap_or(true)
    }

    pub(crate) fn set_mode(&mut self, mode: PlaygroundMode) {
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |view, window, cx| {
                view.set_mode(mode, window, cx);
            });
        });
        self.window.request_frame_now();
    }

    pub(crate) fn reset_empty_document(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |view, window, cx| {
                view.load_empty_page_document(window, cx);
            });
        });
        self.window.request_frame_now();
    }

    pub(crate) fn load_showcase_document(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |view, window, cx| {
                view.load_showcase_document(window, cx);
            });
        });
        self.window.request_frame_now();
    }

    pub(crate) fn dispatch_touch(&mut self, touch_id: u64, phase: u8, x: f32, y: f32) {
        let touch_phase = match phase {
            0 => TouchPhase::Started,
            1 => TouchPhase::Moved,
            2 => TouchPhase::Ended,
            _ => TouchPhase::Cancelled,
        };
        let event = TouchEvent {
            id: TouchId(touch_id),
            phase: touch_phase,
            position: point(px(x), px(y)),
            predicted_position: None,
            force: None,
        };
        let _ = self.window.dispatch_input(PlatformInput::Touch(event));
        self.window.request_frame_now();
    }

    pub(crate) fn dispatch_key_down(
        &mut self,
        key: &str,
        key_char: Option<&str>,
        shift: bool,
        cmd: bool,
        ctrl: bool,
        alt: bool,
    ) {
        let event = KeyDownEvent {
            keystroke: Keystroke {
                modifiers: Modifiers {
                    control: ctrl,
                    alt,
                    shift,
                    platform: cmd,
                    function: false,
                },
                key: key.to_string(),
                key_char: key_char.map(str::to_string),
            },
            is_held: false,
            prefer_character_input: false,
        };
        let _ = self.window.dispatch_input(PlatformInput::KeyDown(event));
        self.window.request_frame_now();
    }

    pub(crate) fn set_text_input_observer(&self, observer: Option<TextInputObserver>) {
        self.window.set_text_input_observer(observer);
    }

    pub(crate) fn text_input_change_seq(&self) -> u64 {
        self.window.text_input_change_seq()
    }

    fn ensure_input_handler(&mut self) {
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
        let text = self
            .window
            .with_input_handler(|h| h.text_for_range(0..len, &mut adjusted))
            .flatten()
            .unwrap_or_default();
        text.encode_utf16().collect()
    }

    pub(crate) fn selected_range(&mut self) -> AffineUtf16Range {
        self.ensure_input_handler();
        self.window
            .with_input_handler(|h| h.selected_text_range(true))
            .flatten()
            .map(|sel| AffineUtf16Range {
                location: sel.range.start.min(u32::MAX as usize) as u32,
                length: sel.range.len().min(u32::MAX as usize) as u32,
            })
            .unwrap_or(AffineUtf16Range {
                location: 0,
                length: 0,
            })
    }

    pub(crate) fn marked_range(&mut self) -> AffineUtf16Range {
        self.ensure_input_handler();
        self.window
            .with_input_handler(|h| h.marked_text_range())
            .flatten()
            .map(|r| AffineUtf16Range {
                location: r.start.min(u32::MAX as usize) as u32,
                length: r.len().min(u32::MAX as usize) as u32,
            })
            .unwrap_or(AffineUtf16Range {
                location: u32::MAX,
                length: 0,
            })
    }

    pub(crate) fn insert_text(&mut self, utf16: &[u16]) {
        self.ensure_input_handler();
        let text = String::from_utf16_lossy(utf16);
        if text == "\n" || text == "\r" {
            self.dispatch_key_down("enter", None, false, false, false, false);
            return;
        }
        let _ = self
            .window
            .with_input_handler(|h| h.replace_text_in_range(None, &text));
        self.window.request_frame_now();
    }

    pub(crate) fn delete_backward(&mut self) {
        self.ensure_input_handler();
        // Dispatch through editor key handler so block-start Backspace merges with previous block
        // and non-collapsed selections delete across blocks cleanly.
        self.dispatch_key_down("backspace", None, false, false, false, false);
    }

    pub(crate) fn delete_range(&mut self, range: AffineUtf16Range) {
        self.ensure_input_handler();
        if range.length == 0 {
            return;
        }
        let start = range.location as usize;
        let end = start.saturating_add(range.length as usize);
        let _ = self
            .window
            .with_input_handler(|h| h.replace_text_in_range(Some(start..end), ""));
        self.window.request_frame_now();
    }

    pub(crate) fn replace_range(&mut self, range: AffineUtf16Range, utf16: &[u16]) {
        self.ensure_input_handler();
        let text = String::from_utf16_lossy(utf16);
        let start = range.location as usize;
        let end = start.saturating_add(range.length as usize);
        let _ = self
            .window
            .with_input_handler(|h| h.replace_text_in_range(Some(start..end), &text));
        self.window.request_frame_now();
    }

    pub(crate) fn set_selected_range(&mut self, range: AffineUtf16Range) {
        self.ensure_input_handler();
        let start = range.location as usize;
        let end = start.saturating_add(range.length as usize);
        let _ = self
            .window
            .with_input_handler(|h| h.set_selected_text_range(start..end));
        self.window.request_frame_now();
    }

    pub(crate) fn set_marked_text(&mut self, utf16: &[u16], selected_in_marked: AffineUtf16Range) {
        self.ensure_input_handler();
        let text = String::from_utf16_lossy(utf16);
        let sel_start = selected_in_marked.location as usize;
        let sel_end = sel_start.saturating_add(selected_in_marked.length as usize);
        let _ = self.window.with_input_handler(|h| {
            h.replace_and_mark_text_in_range(None, &text, Some(sel_start..sel_end))
        });
        self.window.request_frame_now();
    }

    pub(crate) fn unmark_text(&mut self) {
        self.ensure_input_handler();
        let _ = self.window.with_input_handler(|h| h.unmark_text());
        self.window.request_frame_now();
    }

    pub(crate) fn writing_direction(&mut self) -> AffineWritingDirection {
        let units = self.utf16_text();
        let sel = self.selected_range();
        detect_paragraph_writing_direction(&units, sel.location as usize)
    }

    pub(crate) fn caret_rect(&mut self, utf16_offset: u32) -> Option<AffineRect> {
        self.ensure_input_handler();
        let off = utf16_offset as usize;
        let bounds = self
            .window
            .with_input_handler(|h| h.bounds_for_range(off..off))
            .flatten()?;
        Some(AffineRect {
            x: f32::from(bounds.origin.x),
            y: f32::from(bounds.origin.y),
            width: f32::from(bounds.size.width).max(2.0),
            height: f32::from(bounds.size.height).max(20.0),
        })
    }

    pub(crate) fn selection_rects(&mut self, range: AffineUtf16Range) -> Vec<AffineSelectionRect> {
        self.ensure_input_handler();
        let start = range.location as usize;
        let end = start.saturating_add(range.length as usize);
        let bounds_list = self
            .window
            .with_input_handler(|h| h.selection_bounds_for_range(start..end))
            .unwrap_or_default();
        let count = bounds_list.len();
        bounds_list
            .into_iter()
            .enumerate()
            .map(|(idx, b)| AffineSelectionRect {
                rect: AffineRect {
                    x: f32::from(b.origin.x),
                    y: f32::from(b.origin.y),
                    width: f32::from(b.size.width).max(2.0),
                    height: f32::from(b.size.height).max(20.0),
                },
                contains_start: idx == 0,
                contains_end: idx + 1 == count,
            })
            .collect()
    }

    pub(crate) fn closest_offset(&mut self, pt: AffinePoint) -> Option<u32> {
        self.ensure_input_handler();
        let off = self
            .window
            .with_input_handler(|h| h.character_index_for_point(point(px(pt.x), px(pt.y))))
            .flatten()?;
        Some(off.min(u32::MAX as usize) as u32)
    }

    pub(crate) fn change_kind_code(change: TextInputStateChange) -> u8 {
        match change {
            TextInputStateChange::FocusGained => 1,
            TextInputStateChange::FocusLost => 2,
            TextInputStateChange::SelectionChanged => 3,
            TextInputStateChange::ContentChanged => 4,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ios_editor_runtime_authoritative_ime_markdown_and_stage_one_readonly() {
        let mut rt =
            IosEditorRuntime::new(390.0, 844.0, 3.0, FormFactor::Phone, false).expect("runtime");
        assert!(rt.edgeless_readonly());
        assert!(rt.database_readonly());
        assert_eq!(rt.form_factor(), FormFactor::Phone);

        // H-S1 + H-S2: typing "# " converts paragraph into heading and clears "# " from focused block text.
        let seq_before = rt.text_input_change_seq();
        let prefix: Vec<u16> = "# Hello".encode_utf16().collect();
        rt.insert_text(&prefix);
        assert!(rt.text_input_change_seq() > seq_before);
        let text = String::from_utf16_lossy(&rt.utf16_text());
        assert!(
            text.contains("Hello"),
            "focused block text should contain Hello, got {text:?}"
        );

        // Block split on newline + block-start deleteBackward merge.
        let nl: Vec<u16> = "\n".encode_utf16().collect();
        rt.insert_text(&nl);
        let after_split = String::from_utf16_lossy(&rt.utf16_text());
        assert_eq!(after_split, "");
        rt.delete_backward();
        let after_merge = String::from_utf16_lossy(&rt.utf16_text());
        assert!(
            after_merge.contains("Hello"),
            "deleteBackward at block start should merge back into previous block, got {after_merge:?}"
        );

        // Tablet stays touch read-only; Desktop unlocks Edgeless authoring.
        rt.set_form_factor(FormFactor::Tablet);
        assert!(rt.edgeless_readonly());
        assert!(rt.database_readonly());
        rt.set_form_factor(FormFactor::Desktop);
        assert!(!rt.edgeless_readonly());
        assert!(!rt.database_readonly());

        // Explicit page_readonly=true blocks Enter, Backspace, and text insertion,
        // and is preserved across set_form_factor transitions.
        let _ = rt.app.update(|cx| {
            let _ = rt.view.update(cx, |view, _window, cx| {
                view.set_page_readonly(true, cx);
            });
        });
        rt.set_form_factor(FormFactor::Phone);
        let before_ro = String::from_utf16_lossy(&rt.utf16_text());
        let extra: Vec<u16> = "MUTATED".encode_utf16().collect();
        rt.insert_text(&extra);
        rt.dispatch_key_down("enter", None, false, false, false, false);
        rt.delete_backward();
        let after_ro = String::from_utf16_lossy(&rt.utf16_text());
        assert_eq!(
            after_ro, before_ro,
            "page_readonly=true must suppress text insertion, Enter, and Backspace"
        );
    }
}
