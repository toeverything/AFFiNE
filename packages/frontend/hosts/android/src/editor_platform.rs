//! Embedded GPUI platform and window bridge for the Android thin host.
//!
//! Runs the shipping `PlaygroundView` directly on Android (`ANativeWindow` +
//! `ui::WgpuRenderer` + `ui::CosmicTextSystem`) and on JVM/Linux/macOS parity
//! hosts via `editor_fallback`.

use std::{
    cell::RefCell,
    ffi::OsString,
    path::{Path, PathBuf},
    rc::Rc,
    sync::Arc,
    time::Duration,
};

use anyhow::Result;
use futures::channel::oneshot;
use raw_window_handle::{
    DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, WindowHandle,
};
#[cfg(target_os = "android")]
use ui::DevicePixels;
use ui::{
    Action, ActivityGuard, AnyWindowHandle, BackgroundExecutor, Bounds, Capslock, ClipboardItem,
    CursorStyle, DispatchEventResult, DisplayId, DummyKeyboardMapper, ForegroundExecutor, GpuSpecs,
    Keymap, Menu, MenuItem, Modifiers, OperatingSystem, PathPromptOptions, Pixels, Platform,
    PlatformAtlas, PlatformDispatcher, PlatformDisplay, PlatformInfo, PlatformInput,
    PlatformInputHandler, PlatformKeyboardLayout, PlatformKeyboardMapper, PlatformTarget,
    PlatformTextSystem, PlatformWindow, Point, PromptButton, PromptLevel, RequestFrameOptions,
    Scene, Size, Task, TextInputConfiguration, TextInputStateChange, ThermalState,
    WindowAppearance, WindowBackgroundAppearance, WindowBounds, WindowControlArea, WindowInsets,
    WindowParams, WindowVisibility, point, px, size,
};
use uuid::Uuid;

pub(crate) use crate::editor_fallback::AndroidDispatcher;
#[cfg(not(target_os = "android"))]
use crate::editor_fallback::FallbackTextSystem;
use crate::editor_fallback::{FallbackAtlas, SwappableAtlas};

struct AndroidKeyboardLayout;

impl PlatformKeyboardLayout for AndroidKeyboardLayout {
    fn id(&self) -> &str {
        "android.editor"
    }

    fn name(&self) -> &str {
        "Android"
    }
}

#[derive(Debug)]
struct AndroidDisplay {
    bounds: Bounds<Pixels>,
}

impl PlatformDisplay for AndroidDisplay {
    fn id(&self) -> DisplayId {
        DisplayId::new(0)
    }

    fn uuid(&self) -> Result<Uuid> {
        Ok(Uuid::nil())
    }

    fn bounds(&self) -> Bounds<Pixels> {
        self.bounds
    }

    fn refresh_interval(&self) -> Option<Duration> {
        Some(Duration::from_secs(1) / 60)
    }
}

pub(crate) struct AndroidWindowState {
    pub(crate) bounds: Bounds<Pixels>,
    pub(crate) scale_factor: f32,
    pub(crate) insets: WindowInsets,
    pub(crate) input_handler: Option<PlatformInputHandler>,
    pub(crate) request_frame: Option<Box<dyn FnMut(RequestFrameOptions)>>,
    pub(crate) input: Option<Box<dyn FnMut(PlatformInput) -> DispatchEventResult>>,
    pub(crate) resize: Option<Box<dyn FnMut(Size<Pixels>, f32)>>,
    pub(crate) visual_viewport_changed: Option<Box<dyn FnMut()>>,
    pub(crate) appearance_changed: Option<Box<dyn FnMut()>>,
    pub(crate) active_status_change: Option<Box<dyn FnMut(bool)>>,
    pub(crate) visibility_change: Option<Box<dyn FnMut(WindowVisibility)>>,
    pub(crate) close: Option<Box<dyn FnOnce()>>,
    pub(crate) mouse_position: Point<Pixels>,
    pub(crate) modifiers: Modifiers,
    pub(crate) ime_position: Option<Bounds<Pixels>>,
    pub(crate) dirty: bool,
    pub(crate) text_input_change_seq: u64,
    pub(crate) last_text_input_change: Option<TextInputStateChange>,
    pub(crate) last_scene_quads: usize,
}

#[derive(Clone)]
pub(crate) struct AndroidEditorWindow {
    atlas: Arc<SwappableAtlas>,
    #[cfg(target_os = "android")]
    gpu_context: ui::GpuContext,
    #[cfg(target_os = "android")]
    renderer: Rc<RefCell<Option<ui::WgpuRenderer>>>,
    display: Rc<dyn PlatformDisplay>,
    pub(crate) state: Rc<RefCell<AndroidWindowState>>,
}

impl AndroidEditorWindow {
    fn new(
        bounds: Bounds<Pixels>,
        scale_factor: f32,
        #[cfg(target_os = "android")] gpu_context: ui::GpuContext,
    ) -> Self {
        let safe_scale = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            2.0
        };
        let display: Rc<dyn PlatformDisplay> = Rc::new(AndroidDisplay { bounds });
        #[allow(clippy::arc_with_non_send_sync)]
        let atlas = Arc::new(SwappableAtlas::new(Arc::new(FallbackAtlas)));
        Self {
            atlas,
            #[cfg(target_os = "android")]
            gpu_context,
            #[cfg(target_os = "android")]
            renderer: Rc::new(RefCell::new(None)),
            display,
            state: Rc::new(RefCell::new(AndroidWindowState {
                bounds,
                scale_factor: safe_scale,
                insets: WindowInsets::default(),
                input_handler: None,
                request_frame: None,
                input: None,
                resize: None,
                visual_viewport_changed: None,
                appearance_changed: None,
                active_status_change: None,
                visibility_change: None,
                close: None,
                mouse_position: Point::default(),
                modifiers: Modifiers::default(),
                ime_position: None,
                dirty: true,
                text_input_change_seq: 0,
                last_text_input_change: None,
                last_scene_quads: 0,
            })),
        }
    }

    #[cfg(target_os = "android")]
    pub(crate) fn attach_native_window(
        &self,
        native_window: *mut core::ffi::c_void,
        width_px: u32,
        height_px: u32,
    ) -> bool {
        if native_window.is_null() || width_px == 0 || height_px == 0 {
            return false;
        }
        let mut slot = self.renderer.borrow_mut();
        if let Some(renderer) = slot.as_mut() {
            renderer.update_drawable_size(size(
                DevicePixels(width_px as i32),
                DevicePixels(height_px as i32),
            ));
            self.state.borrow_mut().dirty = true;
            return true;
        }
        match crate::android_window::create_wgpu_renderer(
            Rc::clone(&self.gpu_context),
            native_window,
            width_px,
            height_px,
        ) {
            Ok(renderer) => {
                self.atlas.swap(renderer.sprite_atlas().clone());
                *slot = Some(renderer);
                self.state.borrow_mut().dirty = true;
                true
            }
            Err(_) => false,
        }
    }

    #[cfg(target_os = "android")]
    pub(crate) fn detach_native_window(&self) {
        self.atlas.swap(Arc::new(FallbackAtlas));
        let _ = self.renderer.borrow_mut().take();
    }

    #[cfg(target_os = "android")]
    pub(crate) fn has_gpu_renderer(&self) -> bool {
        self.renderer.borrow().is_some()
    }

    #[cfg(not(target_os = "android"))]
    pub(crate) fn has_gpu_renderer(&self) -> bool {
        false
    }

    pub(crate) fn request_frame_now(&self) {
        let cb = self.state.borrow_mut().request_frame.take();
        if let Some(mut f) = cb {
            f(RequestFrameOptions {
                require_presentation: true,
                ..RequestFrameOptions::default()
            });
            self.state.borrow_mut().request_frame = Some(f);
        }
        self.state.borrow_mut().dirty = false;
    }

    pub(crate) fn dispatch_input(&self, event: PlatformInput) -> DispatchEventResult {
        let cb = {
            let mut st = self.state.borrow_mut();
            match &event {
                PlatformInput::MouseDown(e) => st.mouse_position = e.position,
                PlatformInput::MouseUp(e) => st.mouse_position = e.position,
                PlatformInput::MouseMove(e) => st.mouse_position = e.position,
                PlatformInput::Touch(e) => st.mouse_position = e.position,
                _ => {}
            }
            st.dirty = true;
            st.input.take()
        };
        let Some(mut f) = cb else {
            return DispatchEventResult::default();
        };
        let res = f(event);
        self.state.borrow_mut().input = Some(f);
        res
    }

    pub(crate) fn set_viewport(&self, width_dp: f32, height_dp: f32, density: f32) {
        let w = width_dp.max(1.0);
        let h = height_dp.max(1.0);
        let scale = if density.is_finite() && density > 0.0 {
            density
        } else {
            self.state.borrow().scale_factor
        };
        let cb = {
            let mut st = self.state.borrow_mut();
            st.bounds.size = size(px(w), px(h));
            st.scale_factor = scale;
            st.dirty = true;
            st.resize.take()
        };
        if let Some(mut f) = cb {
            f(size(px(w), px(h)), scale);
            self.state.borrow_mut().resize = Some(f);
        }
    }

    pub(crate) fn set_insets(&self, insets: WindowInsets) {
        let cb = {
            let mut st = self.state.borrow_mut();
            if st.insets == insets {
                return;
            }
            st.insets = insets;
            st.dirty = true;
            st.visual_viewport_changed.take()
        };
        if let Some(mut f) = cb {
            f();
            self.state.borrow_mut().visual_viewport_changed = Some(f);
        }
    }

    pub(crate) fn with_input_handler<R>(
        &self,
        f: impl FnOnce(&mut PlatformInputHandler) -> R,
    ) -> Option<R> {
        let mut handler = self.state.borrow_mut().input_handler.take()?;
        let out = f(&mut handler);
        self.state.borrow_mut().input_handler = Some(handler);
        Some(out)
    }
}

impl HasWindowHandle for AndroidEditorWindow {
    fn window_handle(&self) -> std::result::Result<WindowHandle<'_>, HandleError> {
        Err(HandleError::Unavailable)
    }
}

impl HasDisplayHandle for AndroidEditorWindow {
    fn display_handle(&self) -> std::result::Result<DisplayHandle<'_>, HandleError> {
        Err(HandleError::Unavailable)
    }
}

impl PlatformWindow for AndroidEditorWindow {
    fn bounds(&self) -> Bounds<Pixels> {
        self.state.borrow().bounds
    }

    fn is_maximized(&self) -> bool {
        true
    }

    fn window_bounds(&self) -> WindowBounds {
        WindowBounds::Windowed(self.state.borrow().bounds)
    }

    fn content_size(&self) -> Size<Pixels> {
        self.state.borrow().bounds.size
    }

    fn resize(&mut self, size: Size<Pixels>) {
        let scale = self.state.borrow().scale_factor;
        self.set_viewport(f32::from(size.width), f32::from(size.height), scale);
    }

    fn scale_factor(&self) -> f32 {
        self.state.borrow().scale_factor
    }

    fn appearance(&self) -> WindowAppearance {
        WindowAppearance::Light
    }

    fn display(&self) -> Option<Rc<dyn PlatformDisplay>> {
        Some(Rc::clone(&self.display))
    }

    fn mouse_position(&self) -> Point<Pixels> {
        self.state.borrow().mouse_position
    }

    fn modifiers(&self) -> Modifiers {
        self.state.borrow().modifiers
    }

    fn capslock(&self) -> Capslock {
        Capslock::default()
    }

    fn set_input_handler(&mut self, input_handler: PlatformInputHandler) {
        self.state.borrow_mut().input_handler = Some(input_handler);
    }

    fn take_input_handler(&mut self) -> Option<PlatformInputHandler> {
        self.state.borrow_mut().input_handler.take()
    }

    fn set_text_input_configuration(&mut self, _configuration: TextInputConfiguration) {}

    fn prompt(
        &self,
        _level: PromptLevel,
        _msg: &str,
        _detail: Option<&str>,
        _answers: &[PromptButton],
    ) -> Option<oneshot::Receiver<usize>> {
        None
    }

    fn activate(&self) {}
    fn is_active(&self) -> bool {
        true
    }
    fn visibility(&self) -> WindowVisibility {
        WindowVisibility::Visible
    }
    fn is_hovered(&self) -> bool {
        false
    }
    fn background_appearance(&self) -> WindowBackgroundAppearance {
        WindowBackgroundAppearance::Opaque
    }
    fn set_title(&mut self, _title: &str) {}
    fn set_background_appearance(&self, _background_appearance: WindowBackgroundAppearance) {}
    fn minimize(&self) {}
    fn zoom(&self) {}
    fn toggle_fullscreen(&self) {}
    fn is_fullscreen(&self) -> bool {
        true
    }

    fn on_request_frame(&self, callback: Box<dyn FnMut(RequestFrameOptions)>) {
        self.state.borrow_mut().request_frame = Some(callback);
    }

    fn on_input(&self, callback: Box<dyn FnMut(PlatformInput) -> DispatchEventResult>) {
        self.state.borrow_mut().input = Some(callback);
    }

    fn on_active_status_change(&self, callback: Box<dyn FnMut(bool)>) {
        self.state.borrow_mut().active_status_change = Some(callback);
    }

    fn on_visibility_change(&self, callback: Box<dyn FnMut(WindowVisibility)>) {
        self.state.borrow_mut().visibility_change = Some(callback);
    }

    fn on_hover_status_change(&self, _callback: Box<dyn FnMut(bool)>) {}

    fn on_resize(&self, callback: Box<dyn FnMut(Size<Pixels>, f32)>) {
        self.state.borrow_mut().resize = Some(callback);
    }

    fn on_moved(&self, _callback: Box<dyn FnMut()>) {}
    fn on_display_changed(&self, _callback: Box<dyn FnMut()>) {}
    fn on_should_close(&self, _callback: Box<dyn FnMut() -> bool>) {}

    fn on_close(&self, callback: Box<dyn FnOnce()>) {
        self.state.borrow_mut().close = Some(callback);
    }

    fn on_hit_test_window_control(&self, _callback: Box<dyn FnMut() -> Option<WindowControlArea>>) {
    }

    fn on_appearance_changed(&self, callback: Box<dyn FnMut()>) {
        self.state.borrow_mut().appearance_changed = Some(callback);
    }

    fn on_visual_viewport_changed(&self, callback: Box<dyn FnMut()>) {
        self.state.borrow_mut().visual_viewport_changed = Some(callback);
    }

    fn insets(&self) -> WindowInsets {
        self.state.borrow().insets.clone()
    }

    fn draw(&self, scene: &Scene) {
        self.state.borrow_mut().last_scene_quads = scene.quads.len();
        #[cfg(target_os = "android")]
        if let Some(renderer) = self.renderer.borrow_mut().as_mut() {
            renderer.draw(scene);
        }
    }

    fn sprite_atlas(&self) -> Arc<dyn PlatformAtlas> {
        Arc::clone(&self.atlas) as Arc<dyn PlatformAtlas>
    }

    fn is_subpixel_rendering_supported(&self) -> bool {
        false
    }

    fn gpu_specs(&self) -> Option<GpuSpecs> {
        #[cfg(target_os = "android")]
        if let Some(renderer) = self.renderer.borrow().as_ref() {
            return renderer.gpu_specs();
        }
        None
    }

    fn update_ime_position(&self, bounds: Bounds<Pixels>) {
        self.state.borrow_mut().ime_position = Some(bounds);
    }

    fn text_input_state_changed(&self, change: TextInputStateChange) {
        let mut st = self.state.borrow_mut();
        st.text_input_change_seq = st.text_input_change_seq.saturating_add(1);
        st.last_text_input_change = Some(change);
        st.dirty = true;
    }
}

pub(crate) struct AndroidEditorPlatform {
    dispatcher: Arc<AndroidDispatcher>,
    background_executor: BackgroundExecutor,
    foreground_executor: ForegroundExecutor,
    text_system: Arc<dyn PlatformTextSystem>,
    #[cfg(target_os = "android")]
    gpu_context: ui::GpuContext,
    initial_bounds: Bounds<Pixels>,
    initial_scale: f32,
    opened_window: RefCell<Option<AndroidEditorWindow>>,
    clipboard: RefCell<Option<ClipboardItem>>,
}

impl AndroidEditorPlatform {
    pub(crate) fn new(width_dp: f32, height_dp: f32, density: f32) -> Self {
        let bounds = Bounds::new(
            point(px(0.0), px(0.0)),
            size(px(width_dp.max(1.0)), px(height_dp.max(1.0))),
        );
        let dispatcher = Arc::new(AndroidDispatcher::new());
        let dyn_dispatcher: Arc<dyn PlatformDispatcher> = dispatcher.clone();
        let background_executor = BackgroundExecutor::new(dyn_dispatcher.clone());
        let foreground_executor = ForegroundExecutor::new(dyn_dispatcher);
        #[cfg(target_os = "android")]
        let text_system: Arc<dyn PlatformTextSystem> =
            Arc::new(ui::CosmicTextSystem::new("Roboto"));
        #[cfg(not(target_os = "android"))]
        let text_system: Arc<dyn PlatformTextSystem> = Arc::new(FallbackTextSystem);
        Self {
            dispatcher,
            background_executor,
            foreground_executor,
            text_system,
            #[cfg(target_os = "android")]
            gpu_context: Rc::new(RefCell::new(None)),
            initial_bounds: bounds,
            initial_scale: if density.is_finite() && density > 0.0 {
                density
            } else {
                2.0
            },
            opened_window: RefCell::new(None),
            clipboard: RefCell::new(None),
        }
    }

    pub(crate) fn dispatcher(&self) -> Arc<AndroidDispatcher> {
        Arc::clone(&self.dispatcher)
    }

    pub(crate) fn opened_window(&self) -> Option<AndroidEditorWindow> {
        self.opened_window.borrow().clone()
    }
}

impl Platform for AndroidEditorPlatform {
    fn platform_info(&self) -> PlatformInfo {
        PlatformInfo {
            os: OperatingSystem::Android,
            target: PlatformTarget::Native,
        }
    }

    fn background_executor(&self) -> BackgroundExecutor {
        self.background_executor.clone()
    }

    fn foreground_executor(&self) -> ForegroundExecutor {
        self.foreground_executor.clone()
    }

    fn text_system(&self) -> Arc<dyn PlatformTextSystem> {
        self.text_system.clone()
    }

    fn run(&self, on_finish_launching: Box<dyn 'static + FnOnce()>) {
        on_finish_launching();
    }

    fn quit(&self) {}
    fn restart(&self, _binary_path: Option<PathBuf>, _arguments: Vec<OsString>) {}
    fn activate(&self, _ignoring_other_apps: bool) {}
    fn hide(&self) {}
    fn hide_other_apps(&self) {}
    fn unhide_other_apps(&self) {}

    fn displays(&self) -> Vec<Rc<dyn PlatformDisplay>> {
        vec![Rc::new(AndroidDisplay {
            bounds: self.initial_bounds,
        })]
    }

    fn primary_display(&self) -> Option<Rc<dyn PlatformDisplay>> {
        self.displays().into_iter().next()
    }

    fn on_displays_changed(&self, _callback: Box<dyn FnMut()>) {}
    fn active_window(&self) -> Option<AnyWindowHandle> {
        None
    }

    fn open_window(
        &self,
        _handle: AnyWindowHandle,
        options: WindowParams,
    ) -> Result<Box<dyn PlatformWindow>> {
        let window = AndroidEditorWindow::new(
            options.bounds,
            self.initial_scale,
            #[cfg(target_os = "android")]
            Rc::clone(&self.gpu_context),
        );
        *self.opened_window.borrow_mut() = Some(window.clone());
        Ok(Box::new(window))
    }

    fn window_appearance(&self) -> WindowAppearance {
        WindowAppearance::Light
    }

    fn open_url(&self, _url: &str) {}
    fn on_open_urls(&self, _callback: Box<dyn FnMut(Vec<String>)>) {}
    fn register_url_scheme(&self, _url: &str) -> Task<Result<()>> {
        Task::ready(Ok(()))
    }

    fn prompt_for_paths(
        &self,
        _options: PathPromptOptions,
    ) -> oneshot::Receiver<Result<Option<Vec<PathBuf>>>> {
        let (tx, rx) = oneshot::channel();
        let _ = tx.send(Ok(None));
        rx
    }

    fn prompt_for_new_path(
        &self,
        _directory: &Path,
        _suggested_name: Option<&str>,
    ) -> oneshot::Receiver<Result<Option<PathBuf>>> {
        let (tx, rx) = oneshot::channel();
        let _ = tx.send(Ok(None));
        rx
    }

    fn can_select_mixed_files_and_dirs(&self) -> bool {
        false
    }

    fn reveal_path(&self, _path: &Path) {}
    fn open_with_system(&self, _path: &Path) {}
    fn on_quit(&self, _callback: Box<dyn FnMut() -> bool>) {}
    fn on_reopen(&self, _callback: Box<dyn FnMut()>) {}
    fn on_system_sleep(&self, _callback: Box<dyn FnMut()>) {}
    fn on_system_wake(&self, _callback: Box<dyn FnMut()>) {}
    fn set_menus(&self, _menus: Vec<Menu>, _keymap: &Keymap) {}
    fn set_dock_menu(&self, _menu: Vec<MenuItem>, _keymap: &Keymap) {}
    fn on_app_menu_action(&self, _callback: Box<dyn FnMut(&dyn Action)>) {}
    fn on_will_open_app_menu(&self, _callback: Box<dyn FnMut()>) {}
    fn on_validate_app_menu_command(&self, _callback: Box<dyn FnMut(&dyn Action) -> bool>) {}

    fn thermal_state(&self) -> ThermalState {
        ThermalState::Nominal
    }

    fn on_thermal_state_change(&self, _callback: Box<dyn FnMut()>) {}

    fn prevent_idle_sleep(&self, _reason: &str) -> Task<Result<ActivityGuard>> {
        Task::ready(Ok(ActivityGuard::noop()))
    }

    fn app_path(&self) -> Result<PathBuf> {
        Ok(PathBuf::from("AffineAndroidHost"))
    }

    fn path_for_auxiliary_executable(&self, name: &str) -> Result<PathBuf> {
        Ok(PathBuf::from(name))
    }

    fn set_cursor_style(&self, _style: CursorStyle) {}
    fn hide_cursor_until_mouse_moves(&self) {}
    fn is_cursor_visible(&self) -> bool {
        false
    }
    fn should_auto_hide_scrollbars(&self) -> bool {
        true
    }

    fn read_from_clipboard(&self) -> Option<ClipboardItem> {
        self.clipboard.borrow().clone()
    }

    fn write_to_clipboard(&self, item: ClipboardItem) {
        *self.clipboard.borrow_mut() = Some(item);
    }

    #[cfg(target_os = "linux")]
    fn read_from_primary(&self) -> Option<ClipboardItem> {
        None
    }

    #[cfg(target_os = "linux")]
    fn write_to_primary(&self, _item: ClipboardItem) {}

    #[cfg(target_os = "macos")]
    fn read_from_find_pasteboard(&self) -> Option<ClipboardItem> {
        None
    }

    #[cfg(target_os = "macos")]
    fn write_to_find_pasteboard(&self, _item: ClipboardItem) {}

    fn write_credentials(&self, _url: &str, _username: &str, _password: &[u8]) -> Task<Result<()>> {
        Task::ready(Ok(()))
    }

    fn read_credentials(&self, _url: &str) -> Task<Result<Option<(String, Vec<u8>)>>> {
        Task::ready(Ok(None))
    }

    fn delete_credentials(&self, _url: &str) -> Task<Result<()>> {
        Task::ready(Ok(()))
    }

    fn keyboard_layout(&self) -> Box<dyn PlatformKeyboardLayout> {
        Box::new(AndroidKeyboardLayout)
    }

    fn keyboard_mapper(&self) -> Rc<dyn PlatformKeyboardMapper> {
        Rc::new(DummyKeyboardMapper)
    }

    fn on_keyboard_layout_change(&self, _callback: Box<dyn FnMut()>) {}
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    #[test]
    fn android_dispatcher_drains_immediate_and_delayed_tasks_deterministically() {
        let dispatcher = Arc::new(AndroidDispatcher::new());
        let fg_executor = ForegroundExecutor::new(dispatcher.clone());
        let bg_executor = BackgroundExecutor::new(dispatcher.clone());
        let immediate_hits = Arc::new(AtomicUsize::new(0));
        let delayed_hits = Arc::new(AtomicUsize::new(0));

        let imm_clone = Arc::clone(&immediate_hits);
        let imm_task = fg_executor.spawn(async move {
            imm_clone.fetch_add(1, Ordering::SeqCst);
        });
        let del_clone = Arc::clone(&delayed_hits);
        let del_bg = bg_executor.clone();
        let del_task = fg_executor.spawn(async move {
            del_bg.timer(Duration::from_millis(500)).await;
            del_clone.fetch_add(1, Ordering::SeqCst);
        });

        let pending = dispatcher.drain_ready();
        assert_eq!(immediate_hits.load(Ordering::SeqCst), 1);
        assert_eq!(delayed_hits.load(Ordering::SeqCst), 0);
        assert!(pending.is_some(), "timer must report remaining delay");

        dispatcher.advance_test_clock(Duration::from_millis(501));
        let remaining = dispatcher.drain_ready();
        assert_eq!(delayed_hits.load(Ordering::SeqCst), 1);
        assert!(remaining.is_none());
        drop((imm_task, del_task));
    }
}
