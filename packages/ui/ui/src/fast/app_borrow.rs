//! Tracks whether the app's [`AppCell`] is currently borrowed, so platform
//! code that can run re-entrantly from a nested message pump can defer its
//! work instead of panicking on a second `borrow_mut`.
//!
//! On Windows, creating a WebView2 pumps the thread's message queue
//! synchronously (`webview2_com::wait_with_pump`). If GPUI has already
//! dispatched a task message — a foreground task, a timer — that nested
//! dispatch runs `AsyncApp::update`, which calls `AppCell::borrow_mut` while
//! the outer operation (e.g. `Window::draw`) still holds the borrow, and the
//! process panics with `RefCell already borrowed`.

use std::cell::RefCell;
use std::rc::{Rc, Weak};

use crate::AppCell;

thread_local! {
    /// The [`AppCell`] of the app running on this thread.
    static APP_CELL: RefCell<Option<Weak<AppCell>>> = const { RefCell::new(None) };
}

/// Records the app's [`AppCell`] for this thread. Called once from the
/// platform launch callback in `Application::run`/`run_embedded`.
pub(crate) fn track_app(cell: &Rc<AppCell>) {
    APP_CELL.with(|slot| *slot.borrow_mut() = Some(Rc::downgrade(cell)));
}

/// Whether the app on this thread currently holds any borrow of its
/// [`AppCell`]. A shared borrow counts: `borrow_mut` fails on both.
///
/// Platform message handlers that can run re-entrantly while the app is
/// borrowed must check this before touching the app and defer their work
/// (e.g. by queueing the message) rather than calling `borrow_mut`.
#[doc(hidden)]
pub fn app_is_borrowed() -> bool {
    APP_CELL.with(|cell| {
        cell.borrow()
            .as_ref()
            .and_then(Weak::upgrade)
            .is_some_and(|app| app.app.try_borrow_mut().is_err())
    })
}
