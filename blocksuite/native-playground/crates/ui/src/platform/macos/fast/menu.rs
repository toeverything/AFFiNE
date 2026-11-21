//! The app delegate's menu entry points: `handleGPUIMenuItem:` (and the
//! `cut:`/`copy:`/... aliases), `validateMenuItem:` and `menuWillOpen:`.
//!
//! Each of them takes a callback out of the platform state, runs it with the
//! platform lock released (the callback re-enters the platform), and puts it
//! back afterwards unless the callback installed a replacement meanwhile.
//! Upstream looked the item's action up while still holding the lock and only
//! released it when the lookup succeeded, so an item that is not in GPUI's
//! action table (an AppKit-installed menu item, whose tag defaults to 0)
//! re-locked the held, non-reentrant mutex and hung the main thread
//! (longbridge/gpui-kit#3938). macOS 26+ validates menu items on its own, via
//! `-[NSMenu _simulateOpening:]`, so this happened with the app idle.
//!
//! Here the lock is only ever held for one field access at a time: an unknown
//! item is ignored (and validates as disabled) without the callback being
//! taken at all.

use crate::Action;
use objc2::{msg_send, runtime::AnyObject};
use objc2_foundation::NSInteger;
use parking_lot::Mutex;

use crate::platform::macos::platform::MacPlatformState;

/// The menu fields of the platform state, so that tests can drive the entry
/// points with a state of their own.
pub(crate) trait MenuState {
    fn menu_actions(&self) -> &[Box<dyn Action>];
    fn menu_command(&mut self) -> &mut Option<Box<dyn FnMut(&dyn Action)>>;
    fn validate_menu_command(&mut self) -> &mut Option<Box<dyn FnMut(&dyn Action) -> bool>>;
    fn will_open_menu(&mut self) -> &mut Option<Box<dyn FnMut()>>;
}

impl MenuState for MacPlatformState {
    fn menu_actions(&self) -> &[Box<dyn Action>] {
        &self.menu_actions
    }

    fn menu_command(&mut self) -> &mut Option<Box<dyn FnMut(&dyn Action)>> {
        &mut self.menu_command
    }

    fn validate_menu_command(&mut self) -> &mut Option<Box<dyn FnMut(&dyn Action) -> bool>> {
        &mut self.validate_menu_command
    }

    fn will_open_menu(&mut self) -> &mut Option<Box<dyn FnMut()>> {
        &mut self.will_open_menu
    }
}

/// `handleGPUIMenuItem:`: dispatches the item's action, if it has one.
///
/// # Safety
///
/// `item` is null or a valid object that responds to `tag`.
pub(crate) unsafe fn handle_menu_item<S: MenuState>(state: &Mutex<S>, item: *mut AnyObject) {
    if let Some(action) = unsafe { menu_action(state, item) } {
        with_callback(state, S::menu_command, |callback| callback(action.as_ref()));
    }
}

/// `validateMenuItem:`: whether the item's action is enabled. Items without a
/// GPUI action are disabled.
///
/// # Safety
///
/// `item` is null or a valid object that responds to `tag`.
pub(crate) unsafe fn validate_menu_item<S: MenuState>(
    state: &Mutex<S>,
    item: *mut AnyObject,
) -> bool {
    unsafe { menu_action(state, item) }.is_some_and(|action| {
        with_callback(state, S::validate_menu_command, |callback| {
            callback(action.as_ref())
        })
        .unwrap_or(false)
    })
}

/// `menuWillOpen:`.
pub(crate) fn menu_will_open<S: MenuState>(state: &Mutex<S>) {
    with_callback(state, S::will_open_menu, |callback| callback());
}

/// The action GPUI registered under the item's tag, cloned out of the lock.
unsafe fn menu_action<S: MenuState>(
    state: &Mutex<S>,
    item: *mut AnyObject,
) -> Option<Box<dyn Action>> {
    let tag: NSInteger = if item.is_null() {
        0
    } else {
        unsafe { msg_send![item, tag] }
    };
    let index = usize::try_from(tag).ok()?;
    state
        .lock()
        .menu_actions()
        .get(index)
        .map(|action| action.boxed_clone())
}

/// Runs the callback in `slot` without holding the lock, then restores it
/// unless the callback installed a new one. `None` when there is no callback,
/// including while it is already running further up the stack.
fn with_callback<S, C: ?Sized, R>(
    state: &Mutex<S>,
    slot: fn(&mut S) -> &mut Option<Box<C>>,
    run: impl FnOnce(&mut Box<C>) -> R,
) -> Option<R> {
    let mut callback = slot(&mut state.lock()).take()?;
    let result = run(&mut callback);
    slot(&mut state.lock()).get_or_insert(callback);
    Some(result)
}
