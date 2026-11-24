//! Deterministic headless platform and window backed by `TestScheduler`,
//! `AppleTextSystem` + `MetalHeadlessRenderer` (macOS), and
//! `CosmicTextSystem` + `WgpuHeadlessRenderer` (Linux).

use crate::scheduler::{Clock, Instant, Scheduler, SessionId, TestScheduler, TestSchedulerConfig};
use crate::{
    Action, ActivityGuard, AnyWindowHandle, BackgroundExecutor, Bounds, Capslock, ClipboardItem,
    CursorStyle, DevicePixels, DispatchEventResult, DisplayId, DummyKeyboardMapper,
    ForegroundExecutor, GpuSpecs, Keymap, Menu, MenuItem, Modifiers, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, OperatingSystem, PathPromptOptions, Pixels, Platform,
    PlatformAtlas, PlatformDispatcher, PlatformDisplay, PlatformHeadlessRenderer, PlatformInfo,
    PlatformInput, PlatformInputHandler, PlatformKeyboardLayout, PlatformKeyboardMapper,
    PlatformTarget, PlatformTextSystem, PlatformWindow, Point, Priority, PromptButton, PromptLevel,
    RequestFrameOptions, RunnableVariant, Scene, Size, Task, ThermalState, WindowAppearance,
    WindowBackgroundAppearance, WindowBounds, WindowControlArea, WindowParams, WindowVisibility,
    point, px, size,
};
use anyhow::{Context as _, Result};
use futures::channel::oneshot;
use image::RgbaImage;
use parking_lot::Mutex;
use raw_window_handle::{HasDisplayHandle, HasWindowHandle};
use std::{
    cell::RefCell,
    ffi::OsString,
    path::{Path, PathBuf},
    rc::{Rc, Weak},
    sync::Arc,
    time::Duration,
};
use uuid::Uuid;

/// Deterministic dispatcher backed directly by `TestScheduler`.
pub struct HeadlessDispatcher {
    session_id: SessionId,
    scheduler: Arc<TestScheduler>,
}

impl HeadlessDispatcher {
    pub fn new(scheduler: Arc<TestScheduler>) -> Self {
        Self {
            session_id: scheduler.allocate_session_id(),
            scheduler,
        }
    }

    pub fn scheduler(&self) -> &Arc<TestScheduler> {
        &self.scheduler
    }

    pub fn session_id(&self) -> SessionId {
        self.session_id
    }
}

impl PlatformDispatcher for HeadlessDispatcher {
    fn is_main_thread(&self) -> bool {
        self.scheduler.is_main_thread()
    }

    fn now(&self) -> Instant {
        self.scheduler.clock().now()
    }

    fn dispatch(&self, runnable: RunnableVariant, priority: Priority) {
        self.scheduler
            .schedule_background_with_priority(runnable, priority);
    }

    fn dispatch_on_main_thread(&self, runnable: RunnableVariant, _priority: Priority) {
        self.scheduler.schedule_local(self.session_id, runnable);
    }

    fn dispatch_after(&self, _duration: Duration, runnable: RunnableVariant) {
        self.scheduler
            .schedule_background_with_priority(runnable, Priority::default());
    }

    fn spawn_realtime(&self, f: Box<dyn FnOnce() + Send>) {
        std::thread::spawn(f);
    }
}

#[derive(Debug, Clone)]
struct HeadlessDisplay {
    id: DisplayId,
    uuid: Uuid,
    bounds: Bounds<Pixels>,
}

impl HeadlessDisplay {
    fn new(width: f32, height: f32) -> Self {
        Self {
            id: DisplayId(1),
            uuid: Uuid::from_u128(1),
            bounds: Bounds::new(point(px(0.0), px(0.0)), size(px(width), px(height))),
        }
    }
}

impl PlatformDisplay for HeadlessDisplay {
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
        Some(Duration::from_secs(1) / 60)
    }
}

struct HeadlessKeyboardLayout;

impl PlatformKeyboardLayout for HeadlessKeyboardLayout {
    fn id(&self) -> &str {
        "headless.us"
    }

    fn name(&self) -> &str {
        "Headless US"
    }
}

struct HeadlessWindowState {
    handle: AnyWindowHandle,
    bounds: Bounds<Pixels>,
    scale_factor: f32,
    display: Rc<dyn PlatformDisplay>,
    platform: Weak<HeadlessPlatform>,
    sprite_atlas: Arc<dyn PlatformAtlas>,
    renderer: Box<dyn PlatformHeadlessRenderer>,
    input_handler: Option<PlatformInputHandler>,
    input_callback: Option<Box<dyn FnMut(PlatformInput) -> DispatchEventResult>>,
    request_frame_callback: Option<Box<dyn FnMut(RequestFrameOptions)>>,
    resize_callback: Option<Box<dyn FnMut(Size<Pixels>, f32)>>,
    close_callback: Option<Box<dyn FnOnce()>>,
    should_close_handler: Option<Box<dyn FnMut() -> bool>>,
    active_status_change_callback: Option<Box<dyn FnMut(bool)>>,
    mouse_position: Point<Pixels>,
    title: Option<String>,
}

/// Offscreen `PlatformWindow` backed by a real GPU headless renderer (`MetalHeadlessRenderer`
/// on macOS, `WgpuHeadlessRenderer` on Linux).
#[derive(Clone)]
pub struct HeadlessWindow(Rc<Mutex<HeadlessWindowState>>);

impl HasWindowHandle for HeadlessWindow {
    fn window_handle(
        &self,
    ) -> std::result::Result<raw_window_handle::WindowHandle<'_>, raw_window_handle::HandleError>
    {
        Err(raw_window_handle::HandleError::NotSupported)
    }
}

impl HasDisplayHandle for HeadlessWindow {
    fn display_handle(
        &self,
    ) -> std::result::Result<raw_window_handle::DisplayHandle<'_>, raw_window_handle::HandleError>
    {
        Err(raw_window_handle::HandleError::NotSupported)
    }
}

impl HeadlessWindow {
    fn new(
        handle: AnyWindowHandle,
        bounds: Bounds<Pixels>,
        scale_factor: f32,
        platform: Weak<HeadlessPlatform>,
        display: Rc<dyn PlatformDisplay>,
        renderer: Box<dyn PlatformHeadlessRenderer>,
    ) -> Self {
        let sprite_atlas = renderer.sprite_atlas();
        Self(Rc::new(Mutex::new(HeadlessWindowState {
            handle,
            bounds,
            scale_factor,
            display,
            platform,
            sprite_atlas,
            renderer,
            input_handler: None,
            input_callback: None,
            request_frame_callback: None,
            resize_callback: None,
            close_callback: None,
            should_close_handler: None,
            active_status_change_callback: None,
            mouse_position: Point::default(),
            title: None,
        })))
    }

    /// Triggers a full GPUI frame request (`Window::draw` + `Window::present`).
    pub fn request_frame(&self) {
        let callback = self.0.lock().request_frame_callback.take();
        if let Some(mut callback) = callback {
            callback(RequestFrameOptions {
                require_presentation: true,
                ..RequestFrameOptions::default()
            });
            self.0.lock().request_frame_callback = Some(callback);
        }
    }

    /// Dispatches a `PlatformInput` event into GPUI's normal event/hit-test pipeline.
    pub fn dispatch_input(&self, event: PlatformInput) -> DispatchEventResult {
        let callback = {
            let mut lock = self.0.lock();
            match &event {
                PlatformInput::MouseDown(e) => lock.mouse_position = e.position,
                PlatformInput::MouseUp(e) => lock.mouse_position = e.position,
                PlatformInput::MouseMove(e) => lock.mouse_position = e.position,
                _ => {}
            }
            lock.input_callback.take()
        };
        let Some(mut callback) = callback else {
            return DispatchEventResult::default();
        };
        let res = callback(event);
        self.0.lock().input_callback = Some(callback);
        res
    }

    /// Dispatches a full left-button mouse move + down + up click at logical `position`.
    pub fn simulate_click(&self, position: Point<Pixels>) {
        self.dispatch_input(PlatformInput::MouseMove(MouseMoveEvent {
            position,
            pressed_button: None,
            modifiers: Modifiers::default(),
        }));
        self.dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
            button: MouseButton::Left,
            position,
            modifiers: Modifiers::default(),
            click_count: 1,
            first_mouse: false,
        }));
        self.dispatch_input(PlatformInput::MouseUp(MouseUpEvent {
            button: MouseButton::Left,
            position,
            modifiers: Modifiers::default(),
            click_count: 1,
        }));
    }
}

impl PlatformWindow for HeadlessWindow {
    fn bounds(&self) -> Bounds<Pixels> {
        self.0.lock().bounds
    }

    fn is_maximized(&self) -> bool {
        false
    }

    fn window_bounds(&self) -> WindowBounds {
        WindowBounds::Windowed(self.bounds())
    }

    fn content_size(&self) -> Size<Pixels> {
        self.bounds().size
    }

    fn resize(&mut self, size: Size<Pixels>) {
        let (scale, cb) = {
            let mut lock = self.0.lock();
            lock.bounds.size = size;
            (lock.scale_factor, lock.resize_callback.take())
        };
        if let Some(mut cb) = cb {
            cb(size, scale);
            self.0.lock().resize_callback = Some(cb);
        }
    }

    fn scale_factor(&self) -> f32 {
        self.0.lock().scale_factor
    }

    fn appearance(&self) -> WindowAppearance {
        WindowAppearance::Light
    }

    fn display(&self) -> Option<Rc<dyn PlatformDisplay>> {
        Some(self.0.lock().display.clone())
    }

    fn mouse_position(&self) -> Point<Pixels> {
        self.0.lock().mouse_position
    }

    fn modifiers(&self) -> Modifiers {
        Modifiers::default()
    }

    fn capslock(&self) -> Capslock {
        Capslock::default()
    }

    fn set_input_handler(&mut self, input_handler: PlatformInputHandler) {
        self.0.lock().input_handler = Some(input_handler);
    }

    fn take_input_handler(&mut self) -> Option<PlatformInputHandler> {
        self.0.lock().input_handler.take()
    }

    fn prompt(
        &self,
        _level: PromptLevel,
        _msg: &str,
        _detail: Option<&str>,
        _answers: &[PromptButton],
    ) -> Option<oneshot::Receiver<usize>> {
        None
    }

    fn activate(&self) {
        let (platform, handle, cb) = {
            let mut lock = self.0.lock();
            (
                lock.platform.upgrade(),
                lock.handle,
                lock.active_status_change_callback.take(),
            )
        };
        if let Some(platform) = platform {
            *platform.active_window.borrow_mut() = Some(handle);
        }
        if let Some(mut cb) = cb {
            cb(true);
            self.0.lock().active_status_change_callback = Some(cb);
        }
    }

    fn is_active(&self) -> bool {
        true
    }

    fn visibility(&self) -> WindowVisibility {
        WindowVisibility::Visible
    }

    fn is_hovered(&self) -> bool {
        true
    }

    fn background_appearance(&self) -> WindowBackgroundAppearance {
        WindowBackgroundAppearance::Opaque
    }

    fn set_title(&mut self, title: &str) {
        self.0.lock().title = Some(title.to_owned());
    }

    fn set_background_appearance(&self, _background_appearance: WindowBackgroundAppearance) {}

    fn minimize(&self) {}
    fn zoom(&self) {}
    fn toggle_fullscreen(&self) {}

    fn is_fullscreen(&self) -> bool {
        false
    }

    fn on_request_frame(&self, callback: Box<dyn FnMut(RequestFrameOptions)>) {
        self.0.lock().request_frame_callback = Some(callback);
    }

    fn on_input(&self, callback: Box<dyn FnMut(PlatformInput) -> DispatchEventResult>) {
        self.0.lock().input_callback = Some(callback);
    }

    fn on_active_status_change(&self, callback: Box<dyn FnMut(bool)>) {
        self.0.lock().active_status_change_callback = Some(callback);
    }

    fn on_visibility_change(&self, _callback: Box<dyn FnMut(WindowVisibility)>) {}
    fn on_hover_status_change(&self, _callback: Box<dyn FnMut(bool)>) {}

    fn on_resize(&self, callback: Box<dyn FnMut(Size<Pixels>, f32)>) {
        self.0.lock().resize_callback = Some(callback);
    }

    fn on_moved(&self, _callback: Box<dyn FnMut()>) {}
    fn on_display_changed(&self, _callback: Box<dyn FnMut()>) {}
    fn on_appearance_changed(&self, _callback: Box<dyn FnMut()>) {}

    fn on_should_close(&self, callback: Box<dyn FnMut() -> bool>) {
        self.0.lock().should_close_handler = Some(callback);
    }

    fn on_close(&self, callback: Box<dyn FnOnce()>) {
        self.0.lock().close_callback = Some(callback);
    }

    fn on_hit_test_window_control(&self, _callback: Box<dyn FnMut() -> Option<WindowControlArea>>) {
    }

    fn draw(&self, _scene: &Scene) {}

    fn sprite_atlas(&self) -> Arc<dyn PlatformAtlas> {
        self.0.lock().sprite_atlas.clone()
    }

    fn render_to_image(&self, scene: &Scene) -> Result<RgbaImage> {
        let mut state = self.0.lock();
        let device_size: Size<DevicePixels> =
            state.bounds.size.to_device_pixels(state.scale_factor);
        state.renderer.render_scene_to_image(scene, device_size)
    }

    fn is_subpixel_rendering_supported(&self) -> bool {
        false
    }

    fn gpu_specs(&self) -> Option<GpuSpecs> {
        None
    }

    fn update_ime_position(&self, _bounds: Bounds<Pixels>) {}
}

/// Deterministic headless `Platform` backed by `TestScheduler`, real text shaping
/// (`AppleTextSystem` / `CosmicTextSystem`), and a real offscreen GPU renderer.
pub struct HeadlessPlatform {
    scheduler: Arc<TestScheduler>,
    background_executor: BackgroundExecutor,
    foreground_executor: ForegroundExecutor,
    text_system: Arc<dyn PlatformTextSystem>,
    display: Rc<HeadlessDisplay>,
    scale_factor: f32,
    active_window: RefCell<Option<AnyWindowHandle>>,
    windows: RefCell<Vec<HeadlessWindow>>,
    clipboard: Mutex<Option<ClipboardItem>>,
    weak: Weak<Self>,
}

fn create_headless_renderer() -> Result<Box<dyn PlatformHeadlessRenderer>> {
    #[cfg(target_os = "macos")]
    {
        let renderer =
            crate::MetalHeadlessRenderer::new().context("creating MetalHeadlessRenderer")?;
        Ok(Box::new(renderer))
    }
    #[cfg(target_os = "linux")]
    {
        let renderer =
            crate::WgpuHeadlessRenderer::new().context("creating WgpuHeadlessRenderer")?;
        Ok(Box::new(renderer))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        anyhow::bail!("headless GPU renderer is only supported on macOS and Linux")
    }
}

fn create_headless_text_system() -> Arc<dyn PlatformTextSystem> {
    #[cfg(target_os = "macos")]
    {
        Arc::new(crate::AppleTextSystem::new())
    }
    #[cfg(target_os = "linux")]
    {
        Arc::new(crate::CosmicTextSystem::new_without_system_fonts("Inter"))
    }
}

impl HeadlessPlatform {
    /// Creates a deterministic headless platform with a `TestScheduler` clock and
    /// an offscreen display of `width x height` logical pixels at `scale_factor`.
    pub fn new(width: u32, height: u32, scale_factor: f32) -> Rc<Self> {
        let scheduler = Arc::new(TestScheduler::new(TestSchedulerConfig {
            seed: 0,
            randomize_order: false,
            allow_parking: false,
            capture_pending_traces: false,
            timeout_ticks: 0..=1000,
        }));
        let dispatcher = Arc::new(HeadlessDispatcher::new(scheduler.clone()));
        let sched_dyn: Arc<dyn Scheduler> = scheduler.clone();
        let disp_dyn: Arc<dyn PlatformDispatcher> = dispatcher.clone();
        let background_executor =
            BackgroundExecutor::from_scheduler(sched_dyn.clone(), disp_dyn.clone());
        let foreground_executor =
            ForegroundExecutor::from_scheduler(dispatcher.session_id(), sched_dyn, disp_dyn);
        let text_system = create_headless_text_system();
        let display = Rc::new(HeadlessDisplay::new(width as f32, height as f32));

        Rc::new_cyclic(|weak| Self {
            scheduler,
            background_executor,
            foreground_executor,
            text_system,
            display,
            scale_factor,
            active_window: RefCell::new(None),
            windows: RefCell::new(Vec::new()),
            clipboard: Mutex::new(None),
            weak: weak.clone(),
        })
    }

    pub fn scheduler(&self) -> &Arc<TestScheduler> {
        &self.scheduler
    }

    pub fn advance_clock(&self, delta: Duration) {
        self.scheduler.advance_clock(delta);
    }

    pub fn run_until_parked(&self) {
        while self.scheduler.tick() {}
    }

    pub fn windows(&self) -> Vec<HeadlessWindow> {
        self.windows.borrow().clone()
    }
}

impl Platform for HeadlessPlatform {
    fn platform_info(&self) -> PlatformInfo {
        PlatformInfo {
            os: if cfg!(target_os = "macos") {
                OperatingSystem::Mac
            } else {
                OperatingSystem::Linux
            },
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
        self.run_until_parked();
    }

    fn quit(&self) {}
    fn restart(&self, _binary_path: Option<PathBuf>, _arguments: Vec<OsString>) {}
    fn activate(&self, _ignoring_other_apps: bool) {}
    fn hide(&self) {}
    fn hide_other_apps(&self) {}
    fn unhide_other_apps(&self) {}

    fn displays(&self) -> Vec<Rc<dyn PlatformDisplay>> {
        vec![self.display.clone()]
    }

    fn primary_display(&self) -> Option<Rc<dyn PlatformDisplay>> {
        Some(self.display.clone())
    }

    fn on_displays_changed(&self, _callback: Box<dyn FnMut()>) {}

    fn active_window(&self) -> Option<AnyWindowHandle> {
        *self.active_window.borrow()
    }

    fn open_window(
        &self,
        handle: AnyWindowHandle,
        options: WindowParams,
    ) -> Result<Box<dyn PlatformWindow>> {
        let renderer = create_headless_renderer()?;
        let bounds = Bounds::new(point(px(0.0), px(0.0)), options.bounds.size);
        let window = HeadlessWindow::new(
            handle,
            bounds,
            self.scale_factor,
            self.weak.clone(),
            self.display.clone(),
            renderer,
        );
        self.windows.borrow_mut().push(window.clone());
        *self.active_window.borrow_mut() = Some(handle);
        Ok(Box::new(window))
    }

    fn window_appearance(&self) -> WindowAppearance {
        WindowAppearance::Light
    }

    fn open_url(&self, _url: &str) {}

    fn register_url_scheme(&self, _url: &str) -> Task<Result<()>> {
        Task::ready(Ok(()))
    }

    fn prompt_for_paths(
        &self,
        _options: PathPromptOptions,
    ) -> oneshot::Receiver<Result<Option<Vec<PathBuf>>>> {
        oneshot::channel().1
    }

    fn prompt_for_new_path(
        &self,
        _directory: &Path,
        _suggested_name: Option<&str>,
    ) -> oneshot::Receiver<Result<Option<PathBuf>>> {
        oneshot::channel().1
    }

    fn can_select_mixed_files_and_dirs(&self) -> bool {
        false
    }

    fn reveal_path(&self, _path: &Path) {}
    fn open_with_system(&self, _path: &Path) {}
    fn on_quit(&self, _callback: Box<dyn FnMut() -> bool>) {}
    fn on_open_urls(&self, _callback: Box<dyn FnMut(Vec<String>)>) {}
    fn on_reopen(&self, _callback: Box<dyn FnMut()>) {}
    fn on_system_sleep(&self, _callback: Box<dyn FnMut()>) {}
    fn on_system_wake(&self, _callback: Box<dyn FnMut()>) {}
    fn set_menus(&self, _menus: Vec<Menu>, _keymap: &Keymap) {}
    fn set_dock_menu(&self, _menu: Vec<MenuItem>, _keymap: &Keymap) {}
    fn on_app_menu_action(&self, _callback: Box<dyn FnMut(&dyn Action)>) {}
    fn on_will_open_app_menu(&self, _callback: Box<dyn FnMut()>) {}
    fn on_validate_app_menu_command(&self, _callback: Box<dyn FnMut(&dyn Action) -> bool>) {}
    fn on_thermal_state_change(&self, _callback: Box<dyn FnMut()>) {}
    fn on_keyboard_layout_change(&self, _callback: Box<dyn FnMut()>) {}

    fn thermal_state(&self) -> ThermalState {
        ThermalState::Nominal
    }

    fn prevent_idle_sleep(&self, _reason: &str) -> Task<Result<ActivityGuard>> {
        Task::ready(Ok(ActivityGuard::noop()))
    }

    fn app_path(&self) -> Result<PathBuf> {
        std::env::current_exe().map_err(Into::into)
    }

    fn path_for_auxiliary_executable(&self, _name: &str) -> Result<PathBuf> {
        anyhow::bail!("no auxiliary executable in headless mode")
    }

    fn set_cursor_style(&self, _style: CursorStyle) {}
    fn hide_cursor_until_mouse_moves(&self) {}

    fn is_cursor_visible(&self) -> bool {
        true
    }

    fn should_auto_hide_scrollbars(&self) -> bool {
        false
    }

    fn read_from_clipboard(&self) -> Option<ClipboardItem> {
        self.clipboard.lock().clone()
    }

    fn write_to_clipboard(&self, item: ClipboardItem) {
        *self.clipboard.lock() = Some(item);
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
        Box::new(HeadlessKeyboardLayout)
    }

    fn keyboard_mapper(&self) -> Rc<dyn PlatformKeyboardMapper> {
        Rc::new(DummyKeyboardMapper)
    }
}
