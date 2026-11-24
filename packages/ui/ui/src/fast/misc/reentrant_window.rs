//! Window callbacks that arrive while the app is borrowed.
//!
//! Upstream runs the resize, move, display-change, input and window-control
//! hit-test callbacks straight from the platform with a mutable `App` borrow.
//! On Windows the window procedure is re-entered while a handler still holds
//! that borrow: a nested message loop during a draw (a COM call, a modal
//! loop, a cross-thread `SendMessage`), or direct-manipulation input drained
//! from inside `draw_window`. The second borrow then fails, logs "RefCell
//! already borrowed" for every event of a drag, and `on_display_changed`,
//! which uses `AsyncApp::update`, panics.
//!
//! The frame request already skips re-entrant draws (`draw_in_progress`);
//! this covers the other callbacks, each the way its work allows:
//!
//! - a frame request outside a draw (`ShowWindow` called from a window
//!   update sends `WM_SHOWWINDOW`, whose handler draws at once) is skipped,
//!   and the window is refreshed once the app is free, so the frame it
//!   asked for is drawn ([`defer_frame_request`]);
//! - resize, move and display change are coalesced: only the latest state
//!   matters, and `bounds_changed` / `display_changed` read it from the
//!   platform window when they run, so one deferred run replaces any number;
//! - input is queued in arrival order and dispatched on a later main-thread
//!   turn; the platform gets the default result, as it did when the borrow
//!   failed;
//! - the window-control hit test must answer synchronously and only reads
//!   last frame's hitboxes, so it answers `None` (client area) for that one
//!   message; the next mouse message asks again.

use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    rc::Rc,
};

use crate::{
    AnyWindowHandle, App, AppContext as _, AsyncApp, DispatchEventResult, PlatformInput,
    PlatformWindow, Window, WindowControlArea,
};

thread_local! {
    /// The windows whose skipped frame request waits for the app to be free.
    static FRAMES_WAITING: RefCell<Vec<AnyWindowHandle>> = const { RefCell::new(Vec::new()) };
}

/// Whether the frame request of window `handle` must be skipped: a draw is
/// on the stack (upstream's check: the platform asks again once it unwinds),
/// or the app is borrowed outside a draw, and the window is then refreshed
/// on a later main-thread turn, once the app is free. A released app counts
/// as free, so the request runs and reports that the app is gone, as
/// upstream does.
pub(crate) fn defer_frame_request(handle: AnyWindowHandle, cx: &AsyncApp) -> bool {
    if crate::window::draw_in_progress() {
        return true;
    }
    if app_is_free(cx) {
        return false;
    }
    log::debug!(
        "deferring frame request for window {:?} made while the app is borrowed",
        handle.window_id()
    );
    let waiting = FRAMES_WAITING.with_borrow_mut(|frames| {
        let waiting = frames.contains(&handle);
        if !waiting {
            frames.push(handle);
        }
        waiting
    });
    if !waiting {
        refresh_when_free(handle, cx.clone());
    }
    true
}

/// Refreshes window `handle` on the next main-thread turn, retrying each
/// turn while a nested message loop keeps the outer borrow alive.
fn refresh_when_free(handle: AnyWindowHandle, cx: AsyncApp) {
    cx.foreground_executor()
        .clone()
        .spawn(async move {
            if cx.app.strong_count() != 0 && !app_is_free(&cx) {
                refresh_when_free(handle, cx);
                return;
            }
            FRAMES_WAITING.with_borrow_mut(|frames| frames.retain(|waiting| *waiting != handle));
            if cx.app.strong_count() != 0 {
                // A window closed meanwhile has no frame to draw.
                let _ = cx
                    .clone()
                    .update_window(handle, |_, window, _| window.refresh());
            }
        })
        .detach();
}

/// Whether the app can be borrowed now. A released app counts as free.
fn app_is_free(cx: &AsyncApp) -> bool {
    cx.app
        .upgrade()
        .is_none_or(|app| app.try_borrow_mut().is_ok())
}

#[derive(Default)]
struct Pending {
    bounds_changed: bool,
    display_changed: bool,
    input: VecDeque<PlatformInput>,
}

impl Pending {
    fn is_empty(&self) -> bool {
        !self.bounds_changed && !self.display_changed && self.input.is_empty()
    }
}

/// Deferred window callbacks of one window, shared by its platform callbacks
/// so work deferred by one is delivered before work another runs later.
struct ReentrantWindowCallbacks {
    handle: AnyWindowHandle,
    cx: AsyncApp,
    pending: RefCell<Pending>,
    retry_scheduled: Cell<bool>,
}

/// Registers the window's resize, move, display-change, input and
/// window-control hit-test callbacks, in place of upstream's.
pub(crate) fn register(
    platform_window: &dyn PlatformWindow,
    handle: AnyWindowHandle,
    cx: AsyncApp,
) {
    let this = Rc::new(ReentrantWindowCallbacks {
        handle,
        cx,
        pending: RefCell::default(),
        retry_scheduled: Cell::new(false),
    });
    platform_window.on_resize(Box::new({
        let this = this.clone();
        move |_, _| ReentrantWindowCallbacks::bounds_changed(&this)
    }));
    platform_window.on_moved(Box::new({
        let this = this.clone();
        move || ReentrantWindowCallbacks::bounds_changed(&this)
    }));
    platform_window.on_display_changed(Box::new({
        let this = this.clone();
        move || ReentrantWindowCallbacks::display_changed(&this)
    }));
    platform_window.on_input(Box::new({
        let this = this.clone();
        move |event| ReentrantWindowCallbacks::input(&this, event)
    }));
    platform_window.on_hit_test_window_control(Box::new(move || {
        ReentrantWindowCallbacks::hit_test_window_control(&this)
    }));
}

impl ReentrantWindowCallbacks {
    /// Whether the app can be borrowed now. A released app counts as free so
    /// the callback runs and reports that the app is gone, as upstream does.
    fn app_is_free(&self) -> bool {
        app_is_free(&self.cx)
    }

    /// The `on_resize` and `on_moved` callbacks.
    fn bounds_changed(this: &Rc<Self>) {
        if this.defer(|pending| pending.bounds_changed = true) {
            return;
        }
        this.update_window("handling bounds change", |window, cx| {
            window.bounds_changed(cx)
        });
    }

    /// The `on_display_changed` callback.
    fn display_changed(this: &Rc<Self>) {
        if this.defer(|pending| pending.display_changed = true) {
            return;
        }
        this.run_display_changed();
    }

    /// The `on_input` callback.
    fn input(this: &Rc<Self>, event: PlatformInput) -> DispatchEventResult {
        let mut event = Some(event);
        if this.defer(|pending| pending.input.extend(event.take())) {
            log::debug!(
                "deferring input for window {:?} dispatched while the app is borrowed",
                this.handle.window_id()
            );
            return DispatchEventResult::default();
        }
        let event = event.expect("event is only taken when deferred");
        this.update_window("dispatching input", |window, cx| {
            window.dispatch_event(event, cx)
        })
        .unwrap_or_default()
    }

    /// The `on_hit_test_window_control` callback.
    fn hit_test_window_control(this: &Rc<Self>) -> Option<WindowControlArea> {
        if !this.app_is_free() {
            return None;
        }
        this.update_window("hit-testing window controls", |window, _| {
            window
                .rendered_frame
                .window_control_hitboxes
                .iter()
                .find(|(_, hitbox)| window.mouse_hit_test.ids.contains(&hitbox.id))
                .map(|(area, _)| *area)
        })
        .flatten()
    }

    /// Records the work in `pending` and returns true when it must wait:
    /// the app is borrowed, or earlier work is still queued (which is then
    /// delivered now, this work included, in order).
    fn defer(self: &Rc<Self>, record: impl FnOnce(&mut Pending)) -> bool {
        if !self.app_is_free() {
            record(&mut self.pending.borrow_mut());
            self.schedule_retry();
            return true;
        }
        if self.pending.borrow().is_empty() {
            return false;
        }
        record(&mut self.pending.borrow_mut());
        self.deliver_pending();
        true
    }

    /// Runs the queued work: the coalesced bounds and display changes first,
    /// then the input in arrival order. Stops when a handler leaves the app
    /// borrowed, which a nested message loop inside it can do, and retries.
    fn deliver_pending(self: &Rc<Self>) {
        loop {
            if !self.app_is_free() {
                self.schedule_retry();
                return;
            }
            let mut pending = self.pending.borrow_mut();
            if std::mem::take(&mut pending.bounds_changed) {
                drop(pending);
                self.update_window("handling bounds change", |window, cx| {
                    window.bounds_changed(cx)
                });
            } else if std::mem::take(&mut pending.display_changed) {
                drop(pending);
                self.run_display_changed();
            } else if let Some(event) = pending.input.pop_front() {
                drop(pending);
                self.update_window("dispatching input", |window, cx| {
                    window.dispatch_event(event, cx);
                });
            } else {
                return;
            }
        }
    }

    /// Delivers the queued work on the next main-thread turn, retrying each
    /// turn while a nested message loop keeps the outer borrow alive.
    fn schedule_retry(self: &Rc<Self>) {
        if self.retry_scheduled.replace(true) {
            return;
        }
        let this = self.clone();
        self.cx
            .foreground_executor()
            .spawn(async move {
                this.retry_scheduled.set(false);
                if this.cx.app.strong_count() == 0 {
                    return;
                }
                this.deliver_pending();
            })
            .detach();
    }

    fn run_display_changed(&self) {
        if self.cx.app.strong_count() == 0 {
            return;
        }
        let handle = self.handle;
        self.cx
            .update(|cx: &mut App| Window::display_changed(handle, cx));
    }

    fn update_window<R>(
        &self,
        what: &str,
        update: impl FnOnce(&mut Window, &mut App) -> R,
    ) -> Option<R> {
        let mut cx = self.cx.clone();
        let result = cx.update_window(self.handle, |_, window, cx| update(window, cx));
        if let Err(error) = &result {
            log::error!("{what} for window {:?}: {error:#}", self.handle.window_id());
        }
        result.ok()
    }
}
