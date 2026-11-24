//! iOS platform foundation sharing Apple CoreText, Metal, and GCD backends.
//!
//! Provides the `IosPlatform`, `IosDisplay`, and `IosWindow` stubs that bridge
//! UIKit/CAMetalLayer hosts into the shared `platform::apple` rendering and
//! dispatch pipeline.

use crate::platform::apple::{
    AppleDispatcher, AppleTextSystem,
    metal_renderer::{self, InstanceBufferPool, MetalRenderer},
};
use crate::{
    Action, ActivityGuard, AnyWindowHandle, BackgroundExecutor, Bounds, ClipboardItem, CursorStyle,
    DispatchEventResult, DisplayId, ForegroundExecutor, GpuSpecs, Keymap, Menu, MenuItem,
    OperatingSystem, Pixels, Platform, PlatformAtlas, PlatformDisplay, PlatformInfo, PlatformInput,
    PlatformInputHandler, PlatformKeyboardLayout, PlatformKeyboardMapper, PlatformTarget,
    PlatformTextSystem, PlatformWindow, Point, PromptButton, PromptLevel, RequestFrameOptions,
    Scene, Size, Task, TextInputConfiguration, TextInputStateChange, WindowAppearance,
    WindowBackgroundAppearance, WindowBounds, WindowControlArea, WindowInsets, WindowParams,
    WindowVisibility, point, px, size,
};
use anyhow::Result;
use futures::channel::oneshot;
use parking_lot::Mutex;
use raw_window_handle::{
    DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, RawDisplayHandle,
    UiKitDisplayHandle, WindowHandle,
};
use smallvec::SmallVec;
use std::{
    cell::RefCell,
    ffi::OsString,
    path::{Path, PathBuf},
    rc::Rc,
    sync::Arc,
    time::Duration,
};
use uuid::Uuid;

struct IosKeyboardLayout;

impl PlatformKeyboardLayout for IosKeyboardLayout {
    fn id(&self) -> &str {
        "ios.default"
    }

    fn name(&self) -> &str {
        "iOS"
    }
}

/// Minimal iOS display descriptor backed by host screen metrics.
#[derive(Debug)]
pub struct IosDisplay {
    id: DisplayId,
    uuid: Uuid,
    bounds: Bounds<Pixels>,
}

impl IosDisplay {
    pub fn new(width: Pixels, height: Pixels) -> Self {
        Self {
            id: DisplayId(0),
            uuid: Uuid::nil(),
            bounds: Bounds::new(point(px(0.0), px(0.0)), size(width, height)),
        }
    }
}

impl PlatformDisplay for IosDisplay {
    fn id(&self) -> DisplayId {
        self.id
    }

    fn uuid(&self) -> Result<Uuid> {
        Ok(self.uuid)
    }

    fn bounds(&self) -> Bounds<Pixels> {
        self.bounds
    }

    fn refresh_interval(&self) -> Option<Duration> {
        None
    }
}

struct IosWindowState {
    bounds: Bounds<Pixels>,
    scale_factor: f32,
    insets: WindowInsets,
    input_handler: Option<PlatformInputHandler>,
    request_frame: Option<Box<dyn FnMut(RequestFrameOptions)>>,
    input: Option<Box<dyn FnMut(PlatformInput) -> DispatchEventResult>>,
    resize: Option<Box<dyn FnMut(Size<Pixels>, f32)>>,
    visual_viewport_changed: Option<Box<dyn FnMut()>>,
    appearance_changed: Option<Box<dyn FnMut()>>,
    active_status_change: Option<Box<dyn FnMut(bool)>>,
    visibility_change: Option<Box<dyn FnMut(WindowVisibility)>>,
    close: Option<Box<dyn FnOnce()>>,
}

/// iOS platform window backed by [`MetalRenderer`] and host-driven `CAMetalLayer` / `CADisplayLink`.
pub struct IosWindow {
    renderer: RefCell<MetalRenderer>,
    display: Rc<dyn PlatformDisplay>,
    state: RefCell<IosWindowState>,
}

impl IosWindow {
    pub fn new(
        instance_buffer_pool: Arc<Mutex<InstanceBufferPool>>,
        bounds: Bounds<Pixels>,
        scale_factor: f32,
    ) -> Result<Self> {
        let renderer = metal_renderer::new_renderer(instance_buffer_pool, false, true)?;
        let display: Rc<dyn PlatformDisplay> =
            Rc::new(IosDisplay::new(bounds.size.width, bounds.size.height));
        Ok(Self {
            renderer: RefCell::new(renderer),
            display,
            state: RefCell::new(IosWindowState {
                bounds,
                scale_factor,
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
            }),
        })
    }

    /// Updates safe-area and IME insets reported by the UIKit host.
    pub fn set_insets(&self, insets: WindowInsets) {
        let mut state = self.state.borrow_mut();
        if state.insets != insets {
            state.insets = insets;
            if let Some(mut cb) = state.visual_viewport_changed.take() {
                drop(state);
                cb();
                self.state.borrow_mut().visual_viewport_changed = Some(cb);
            }
        }
    }
}

impl HasWindowHandle for IosWindow {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        Err(HandleError::Unavailable)
    }
}

impl HasDisplayHandle for IosWindow {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        // SAFETY: UiKitDisplayHandle has no lifetime-bound pointer.
        Ok(
            unsafe {
                DisplayHandle::borrow_raw(RawDisplayHandle::UiKit(UiKitDisplayHandle::new()))
            },
        )
    }
}

impl PlatformWindow for IosWindow {
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
        self.state.borrow_mut().bounds.size = size;
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
        Point::default()
    }

    fn modifiers(&self) -> crate::Modifiers {
        crate::Modifiers::default()
    }

    fn capslock(&self) -> crate::Capslock {
        crate::Capslock::default()
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
        self.renderer.borrow_mut().draw(scene);
    }

    fn sprite_atlas(&self) -> Arc<dyn PlatformAtlas> {
        self.renderer.borrow().sprite_atlas().clone()
    }

    fn is_subpixel_rendering_supported(&self) -> bool {
        false
    }

    fn gpu_specs(&self) -> Option<GpuSpecs> {
        None
    }

    fn update_ime_position(&self, _bounds: Bounds<Pixels>) {}

    fn text_input_state_changed(&self, _change: TextInputStateChange) {}
}

/// iOS platform implementation reusing `AppleDispatcher`, `AppleTextSystem`, and `MetalRenderer`.
pub struct IosPlatform {
    background_executor: BackgroundExecutor,
    foreground_executor: ForegroundExecutor,
    text_system: Arc<AppleTextSystem>,
    instance_buffer_pool: Arc<Mutex<InstanceBufferPool>>,
}

impl IosPlatform {
    pub fn new() -> Self {
        let dispatcher = Arc::new(AppleDispatcher::new());
        let background_executor = BackgroundExecutor::new(dispatcher.clone());
        let foreground_executor = ForegroundExecutor::new(dispatcher);
        let text_system = Arc::new(AppleTextSystem::new());
        let instance_buffer_pool = Arc::new(Mutex::new(InstanceBufferPool::default()));
        Self {
            background_executor,
            foreground_executor,
            text_system,
            instance_buffer_pool,
        }
    }
}

impl Default for IosPlatform {
    fn default() -> Self {
        Self::new()
    }
}

impl Platform for IosPlatform {
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
        vec![Rc::new(IosDisplay::new(px(390.0), px(844.0)))]
    }

    fn primary_display(&self) -> Option<Rc<dyn PlatformDisplay>> {
        Some(Rc::new(IosDisplay::new(px(390.0), px(844.0))))
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
        let window = IosWindow::new(self.instance_buffer_pool.clone(), options.bounds, 3.0)?;
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
        _options: crate::PathPromptOptions,
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

    fn write_to_clipboard(&self, _item: ClipboardItem) {}

    fn read_from_clipboard(&self) -> Option<ClipboardItem> {
        None
    }

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
        Box::new(IosKeyboardLayout)
    }

    fn keyboard_mapper(&self) -> Rc<dyn PlatformKeyboardMapper> {
        Rc::new(crate::DummyKeyboardMapper)
    }

    fn on_keyboard_layout_change(&self, _callback: Box<dyn FnMut()>) {}

    fn thermal_state(&self) -> crate::ThermalState {
        crate::ThermalState::Nominal
    }

    fn on_thermal_state_change(&self, _callback: Box<dyn FnMut()>) {}

    fn prevent_idle_sleep(&self, _reason: &str) -> Task<Result<ActivityGuard>> {
        Task::ready(Ok(ActivityGuard::noop()))
    }
}
