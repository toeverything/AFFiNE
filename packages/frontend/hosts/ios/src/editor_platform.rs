//! Platform and window bridge mounting the pure-Rust GPU `PlaygroundView`
//! inside the iOS thin host without modifying `packages/ui/ui/src/**`.
//!
//! On `target_os = "ios"`, `IosEditorPlatform` and `IosEditorWindow` reuse
//! `ui::platform::apple::{AppleDispatcher, AppleTextSystem, metal_renderer::MetalRenderer}`
//! and expose `MetalRenderer::layer_ptr()` (`CAMetalLayer`) directly to UIKit.
//! On non-iOS hosts (`cargo test -p affine-ios-host`), a deterministic in-process
//! platform drives the exact same `PlaygroundView` and `PlatformInputHandler`.

use std::{
    cell::RefCell,
    ffi::{OsString, c_void},
    path::{Path, PathBuf},
    rc::Rc,
    sync::Arc,
};

use anyhow::Result;
use futures::channel::oneshot;
#[cfg(target_os = "ios")]
use parking_lot::Mutex;
use raw_window_handle::{
    DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, RawDisplayHandle,
    UiKitDisplayHandle, WindowHandle,
};
use smallvec::SmallVec;
#[cfg(target_os = "ios")]
use ui::DevicePixels;
#[cfg(target_os = "ios")]
use ui::apple::{
    AppleDispatcher, AppleTextSystem,
    metal_renderer::{self, InstanceBufferPool, MetalRenderer},
};
use ui::{
    Action, ActivityGuard, AnyWindowHandle, BackgroundExecutor, Bounds, Capslock, ClipboardItem,
    CursorStyle, DispatchEventResult, DummyKeyboardMapper, ForegroundExecutor, GpuSpecs, Keymap,
    Menu, MenuItem, Modifiers, OperatingSystem, PathPromptOptions, Pixels, Platform, PlatformAtlas,
    PlatformDisplay, PlatformInfo, PlatformInput, PlatformInputHandler, PlatformKeyboardLayout,
    PlatformKeyboardMapper, PlatformTarget, PlatformTextSystem, PlatformWindow, Point,
    PromptButton, PromptLevel, RequestFrameOptions, Scene, Size, Task, TextInputConfiguration,
    TextInputStateChange, ThermalState, WindowAppearance, WindowBackgroundAppearance, WindowBounds,
    WindowControlArea, WindowInsets, WindowParams, WindowVisibility, point, px, size,
};

#[cfg(not(target_os = "ios"))]
use super::editor_fallback as fallback;
use super::editor_runtime::{IosEditorDisplay, IosEditorKeyboardLayout};

pub(crate) type TextInputObserver = Box<dyn Fn(TextInputStateChange)>;

pub(crate) struct IosEditorWindowState {
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
    pub(crate) pending_text_input_changes: Vec<TextInputStateChange>,
    pub(crate) text_input_observer: Option<TextInputObserver>,
    pub(crate) frame_wake_observer: Option<Rc<dyn Fn()>>,
}

/// Shared handle to the live GPUI `PlatformWindow` owned by `affine-ios-host`.
#[derive(Clone)]
pub(crate) struct IosEditorWindow {
    #[cfg(target_os = "ios")]
    renderer: Rc<RefCell<MetalRenderer>>,
    #[cfg(not(target_os = "ios"))]
    atlas: Arc<dyn PlatformAtlas>,
    display: Rc<dyn PlatformDisplay>,
    pub(crate) state: Rc<RefCell<IosEditorWindowState>>,
}

impl IosEditorWindow {
    fn new(
        #[cfg(target_os = "ios")] instance_buffer_pool: Arc<Mutex<InstanceBufferPool>>,
        bounds: Bounds<Pixels>,
        scale_factor: f32,
    ) -> Result<Self> {
        let safe_scale = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            2.0
        };
        #[cfg(target_os = "ios")]
        let renderer = {
            let mut r = metal_renderer::new_renderer(instance_buffer_pool, false, true)?;
            let dw = (f32::from(bounds.size.width) * safe_scale).round().max(1.0) as i32;
            let dh = (f32::from(bounds.size.height) * safe_scale)
                .round()
                .max(1.0) as i32;
            r.update_drawable_size(size(DevicePixels(dw), DevicePixels(dh)));
            Rc::new(RefCell::new(r))
        };
        let display: Rc<dyn PlatformDisplay> = Rc::new(IosEditorDisplay { bounds });
        Ok(Self {
            #[cfg(target_os = "ios")]
            renderer,
            #[cfg(not(target_os = "ios"))]
            atlas: Arc::new(fallback::FallbackAtlas),
            display,
            state: Rc::new(RefCell::new(IosEditorWindowState {
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
                pending_text_input_changes: Vec::new(),
                text_input_observer: None,
                frame_wake_observer: None,
            })),
        })
    }

    /// Returns the raw `CAMetalLayer *` owned by `MetalRenderer` on iOS, or null on non-iOS.
    pub(crate) fn metal_layer_ptr(&self) -> *mut c_void {
        #[cfg(target_os = "ios")]
        {
            self.renderer.borrow().layer_ptr().cast()
        }
        #[cfg(not(target_os = "ios"))]
        {
            core::ptr::null_mut()
        }
    }

    fn mark_dirty_and_wake(state: &Rc<RefCell<IosEditorWindowState>>) {
        let observer = {
            let mut st = state.borrow_mut();
            let was_dirty = st.dirty;
            st.dirty = true;
            (!was_dirty)
                .then(|| st.frame_wake_observer.clone())
                .flatten()
        };
        if let Some(cb) = observer {
            cb();
        }
    }

    pub(crate) fn request_frame_now(&self) {
        self.state.borrow_mut().dirty = false;
        let callback = self.state.borrow_mut().request_frame.take();
        if let Some(mut cb) = callback {
            cb(RequestFrameOptions {
                require_presentation: true,
                ..RequestFrameOptions::default()
            });
            self.state.borrow_mut().request_frame = Some(cb);
        }
    }

    /// Delivers queued `TextInputStateChange` notifications after any active GPUI `App`
    /// borrow has ended so UIKit `UITextInputDelegate` callbacks can safely query FFI.
    pub(crate) fn flush_text_input_changes(&self) {
        let (pending, observer) = {
            let mut st = self.state.borrow_mut();
            if st.pending_text_input_changes.is_empty() {
                return;
            }
            let pending = std::mem::take(&mut st.pending_text_input_changes);
            let observer = st.text_input_observer.take();
            (pending, observer)
        };
        if let Some(obs) = observer {
            for change in pending {
                obs(change);
            }
            let mut st = self.state.borrow_mut();
            if st.text_input_observer.is_none() {
                st.text_input_observer = Some(obs);
            }
        }
    }

    pub(crate) fn dispatch_input(&self, event: PlatformInput) -> DispatchEventResult {
        let callback = {
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
        let Some(mut cb) = callback else {
            return DispatchEventResult::default();
        };
        let res = cb(event);
        self.state.borrow_mut().input = Some(cb);
        res
    }

    pub(crate) fn set_viewport(&self, width_pt: f32, height_pt: f32, scale_factor: f32) {
        let w = width_pt.max(1.0);
        let h = height_pt.max(1.0);
        let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            self.state.borrow().scale_factor
        };
        #[cfg(target_os = "ios")]
        {
            let dw = (w * scale).round().max(1.0) as i32;
            let dh = (h * scale).round().max(1.0) as i32;
            self.renderer
                .borrow_mut()
                .update_drawable_size(size(DevicePixels(dw), DevicePixels(dh)));
        }
        let cb = {
            let mut st = self.state.borrow_mut();
            st.bounds.size = size(px(w), px(h));
            st.scale_factor = scale;
            st.dirty = true;
            st.resize.take()
        };
        if let Some(mut resize_cb) = cb {
            resize_cb(size(px(w), px(h)), scale);
            self.state.borrow_mut().resize = Some(resize_cb);
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
        if let Some(mut vvp_cb) = cb {
            vvp_cb();
            self.state.borrow_mut().visual_viewport_changed = Some(vvp_cb);
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

    pub(crate) fn set_text_input_observer(&self, observer: Option<TextInputObserver>) {
        self.state.borrow_mut().text_input_observer = observer;
    }

    pub(crate) fn text_input_change_seq(&self) -> u64 {
        self.state.borrow().text_input_change_seq
    }
}

impl HasWindowHandle for IosEditorWindow {
    fn window_handle(&self) -> std::result::Result<WindowHandle<'_>, HandleError> {
        Err(HandleError::Unavailable)
    }
}

impl HasDisplayHandle for IosEditorWindow {
    fn display_handle(&self) -> std::result::Result<DisplayHandle<'_>, HandleError> {
        #[allow(unsafe_code)]
        // SAFETY: UiKitDisplayHandle has no lifetime-bound pointer.
        Ok(
            unsafe {
                DisplayHandle::borrow_raw(RawDisplayHandle::UiKit(UiKitDisplayHandle::new()))
            },
        )
    }
}

impl PlatformWindow for IosEditorWindow {
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

    fn frame_waker(&self) -> Option<Rc<dyn Fn()>> {
        let weak = Rc::downgrade(&self.state);
        Some(Rc::new(move || {
            if let Some(state) = weak.upgrade() {
                Self::mark_dirty_and_wake(&state);
            }
        }))
    }

    fn schedule_frame(&self) {
        Self::mark_dirty_and_wake(&self.state);
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
        // Clear dirty at present time so pre-draw `App::flush_effects()` calls cannot leave
        // `dirty` stuck true, while post-draw `schedule_frame()` still re-arms `dirty = true`.
        self.state.borrow_mut().dirty = false;
        #[cfg(target_os = "ios")]
        self.renderer.borrow_mut().draw(scene);
        #[cfg(not(target_os = "ios"))]
        let _ = scene;
    }

    fn sprite_atlas(&self) -> Arc<dyn PlatformAtlas> {
        #[cfg(target_os = "ios")]
        return self.renderer.borrow().sprite_atlas().clone();
        #[cfg(not(target_os = "ios"))]
        Arc::clone(&self.atlas)
    }

    fn is_subpixel_rendering_supported(&self) -> bool {
        false
    }

    fn gpu_specs(&self) -> Option<GpuSpecs> {
        None
    }

    fn update_ime_position(&self, bounds: Bounds<Pixels>) {
        self.state.borrow_mut().ime_position = Some(bounds);
    }

    fn text_input_state_changed(&self, change: TextInputStateChange) {
        let mut st = self.state.borrow_mut();
        st.text_input_change_seq = st.text_input_change_seq.saturating_add(1);
        st.last_text_input_change = Some(change);
        st.pending_text_input_changes.push(change);
    }
}

pub(crate) type OpenUrlObserver = Box<dyn FnMut(&str)>;

pub(crate) struct IosEditorPlatform {
    background_executor: BackgroundExecutor,
    foreground_executor: ForegroundExecutor,
    #[cfg(not(target_os = "ios"))]
    fallback_dispatcher: Arc<fallback::SyncHostDispatcher>,
    text_system: Arc<dyn PlatformTextSystem>,
    #[cfg(target_os = "ios")]
    instance_buffer_pool: Arc<Mutex<InstanceBufferPool>>,
    initial_bounds: Bounds<Pixels>,
    initial_scale: f32,
    opened_window: RefCell<Option<IosEditorWindow>>,
    clipboard: RefCell<Option<ClipboardItem>>,
    open_url_observer: RefCell<Option<OpenUrlObserver>>,
}

impl IosEditorPlatform {
    pub(crate) fn new(width_pt: f32, height_pt: f32, scale_factor: f32) -> Self {
        let bounds = Bounds::new(
            point(px(0.0), px(0.0)),
            size(px(width_pt.max(1.0)), px(height_pt.max(1.0))),
        );
        #[cfg(target_os = "ios")]
        let (dispatcher, text_system): (
            Arc<dyn ui::PlatformDispatcher>,
            Arc<dyn PlatformTextSystem>,
        ) = (
            Arc::new(AppleDispatcher::new()),
            Arc::new(AppleTextSystem::new()),
        );
        #[cfg(not(target_os = "ios"))]
        let fallback_dispatcher = Arc::new(fallback::SyncHostDispatcher::new());
        #[cfg(not(target_os = "ios"))]
        let (dispatcher, text_system): (
            Arc<dyn ui::PlatformDispatcher>,
            Arc<dyn PlatformTextSystem>,
        ) = (
            Arc::clone(&fallback_dispatcher) as Arc<dyn ui::PlatformDispatcher>,
            Arc::new(fallback::FallbackTextSystem),
        );
        let background_executor = BackgroundExecutor::new(dispatcher.clone());
        let foreground_executor = ForegroundExecutor::new(dispatcher);
        Self {
            background_executor,
            foreground_executor,
            #[cfg(not(target_os = "ios"))]
            fallback_dispatcher,
            text_system,
            #[cfg(target_os = "ios")]
            instance_buffer_pool: Arc::new(Mutex::new(InstanceBufferPool::default())),
            initial_bounds: bounds,
            initial_scale: if scale_factor.is_finite() && scale_factor > 0.0 {
                scale_factor
            } else {
                2.0
            },
            opened_window: RefCell::new(None),
            clipboard: RefCell::new(None),
            open_url_observer: RefCell::new(None),
        }
    }

    #[cfg(not(target_os = "ios"))]
    pub(crate) fn fallback_dispatcher(&self) -> Arc<fallback::SyncHostDispatcher> {
        Arc::clone(&self.fallback_dispatcher)
    }

    pub(crate) fn opened_window(&self) -> Option<IosEditorWindow> {
        self.opened_window.borrow().clone()
    }

    pub(crate) fn set_open_url_observer(&self, observer: Option<OpenUrlObserver>) {
        *self.open_url_observer.borrow_mut() = observer;
    }
}

impl Platform for IosEditorPlatform {
    fn platform_info(&self) -> PlatformInfo {
        PlatformInfo {
            os: OperatingSystem::Ios,
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

    fn run(&self, on_finish_launching: Box<dyn FnOnce()>) {
        on_finish_launching();
    }

    fn quit(&self) {}
    fn restart(&self, _binary_path: Option<PathBuf>, _arguments: Vec<OsString>) {}
    fn activate(&self, _ignoring_other_apps: bool) {}
    fn hide(&self) {}
    fn hide_other_apps(&self) {}
    fn unhide_other_apps(&self) {}

    fn displays(&self) -> Vec<Rc<dyn PlatformDisplay>> {
        vec![Rc::new(IosEditorDisplay {
            bounds: self.initial_bounds,
        })]
    }

    fn primary_display(&self) -> Option<Rc<dyn PlatformDisplay>> {
        Some(Rc::new(IosEditorDisplay {
            bounds: self.initial_bounds,
        }))
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
        let bounds = if f32::from(options.bounds.size.width) > 0.0
            && f32::from(options.bounds.size.height) > 0.0
        {
            options.bounds
        } else {
            self.initial_bounds
        };
        let window = IosEditorWindow::new(
            #[cfg(target_os = "ios")]
            self.instance_buffer_pool.clone(),
            bounds,
            self.initial_scale,
        )?;
        *self.opened_window.borrow_mut() = Some(window.clone());
        Ok(Box::new(window))
    }

    fn window_appearance(&self) -> WindowAppearance {
        WindowAppearance::Light
    }

    fn open_url(&self, url: &str) {
        let clean = url.trim();
        if !url.chars().any(char::is_control)
            && (clean.starts_with("https://") || clean.starts_with("http://"))
            && let Some(observer) = self.open_url_observer.borrow_mut().as_mut()
        {
            observer(clean);
        }
    }
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

    fn update_jump_list(
        &self,
        _menus: Vec<MenuItem>,
        _entries: Vec<SmallVec<[PathBuf; 2]>>,
    ) -> Task<Vec<SmallVec<[PathBuf; 2]>>> {
        Task::ready(Vec::new())
    }

    fn on_app_menu_action(&self, _callback: Box<dyn FnMut(&dyn Action)>) {}
    fn on_will_open_app_menu(&self, _callback: Box<dyn FnMut()>) {}
    fn on_validate_app_menu_command(&self, _callback: Box<dyn FnMut(&dyn Action) -> bool>) {}

    fn app_path(&self) -> Result<PathBuf> {
        Ok(PathBuf::new())
    }

    fn path_for_auxiliary_executable(&self, _name: &str) -> Result<PathBuf> {
        Ok(PathBuf::new())
    }

    fn set_cursor_style(&self, _style: CursorStyle) {}
    fn hide_cursor_until_mouse_moves(&self) {}

    fn is_cursor_visible(&self) -> bool {
        false
    }

    fn should_auto_hide_scrollbars(&self) -> bool {
        true
    }

    fn write_to_clipboard(&self, item: ClipboardItem) {
        *self.clipboard.borrow_mut() = Some(item);
    }

    fn read_from_clipboard(&self) -> Option<ClipboardItem> {
        self.clipboard.borrow().clone()
    }

    #[cfg(target_os = "linux")]
    fn write_to_primary(&self, _item: ClipboardItem) {}

    #[cfg(target_os = "linux")]
    fn read_from_primary(&self) -> Option<ClipboardItem> {
        None
    }

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
        Box::new(IosEditorKeyboardLayout)
    }

    fn keyboard_mapper(&self) -> Rc<dyn PlatformKeyboardMapper> {
        Rc::new(DummyKeyboardMapper)
    }

    fn on_keyboard_layout_change(&self, _callback: Box<dyn FnMut()>) {}

    fn thermal_state(&self) -> ThermalState {
        ThermalState::Nominal
    }

    fn on_thermal_state_change(&self, _callback: Box<dyn FnMut()>) {}

    fn prevent_idle_sleep(&self, _reason: &str) -> Task<Result<ActivityGuard>> {
        Task::ready(Ok(ActivityGuard::noop()))
    }
}

#[cfg(test)]
mod open_url_tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    use ui::Platform;

    use super::*;

    #[test]
    fn ios_open_url_allows_only_http_and_https_and_invokes_observer() {
        let platform = IosEditorPlatform::new(390.0, 844.0, 3.0);
        let seen: Rc<RefCell<Vec<String>>> = Rc::new(RefCell::new(Vec::new()));
        let seen_cb = Rc::clone(&seen);
        platform.set_open_url_observer(Some(Box::new(move |url| {
            seen_cb.borrow_mut().push(url.to_string());
        })));
        for bad in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "intent://evil",
            "https://example.com/\nnewline",
        ] {
            platform.open_url(bad);
        }
        assert!(seen.borrow().is_empty());
        platform.open_url("  https://affine.pro/docs  ");
        assert_eq!(seen.borrow().as_slice(), &["https://affine.pro/docs"]);
    }
}
