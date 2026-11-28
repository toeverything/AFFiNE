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

mod ime;

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

    fn read_bool(&self, f: impl FnOnce(&PlaygroundView) -> bool, default: bool) -> bool {
        self.app
            .update(|cx| self.view.read_with(cx, |v, _| f(v)))
            .unwrap_or(default)
    }

    pub(crate) fn wants_software_keyboard(&self) -> bool {
        self.read_bool(PlaygroundView::wants_software_keyboard, false)
    }

    pub(crate) fn wants_code_input(&self) -> bool {
        self.read_bool(PlaygroundView::wants_code_input_mode, false)
    }

    pub(crate) fn edgeless_readonly(&self) -> bool {
        self.read_bool(PlaygroundView::edgeless_readonly, true)
    }

    pub(crate) fn database_readonly(&self) -> bool {
        self.read_bool(PlaygroundView::database_readonly, true)
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
