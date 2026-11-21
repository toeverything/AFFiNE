//! Keys that belong to the IME rather than to the application.
//!
//! Upstream dispatched every keydown to GPUI first and only then checked for
//! a composition, so the key an IME consumes reached the application too: the
//! Enter that commits a CJK candidate also pressed a single-line field's
//! Enter, submitting a form or confirming a dialog with the text half typed.

use std::rc::Rc;

use crate::platform::web::window::WebWindowInner;

/// The keyCode browsers report for a keydown an IME processed.
const IME_PROCESSED_KEY_CODE: u32 = 229;

/// Whether `event` is the IME's, in which case it has been handled and must
/// not reach GPUI.
///
/// A keydown during a composition is the IME's. So is one reported with
/// keyCode 229 after it: Safari ends the composition (`compositionend`)
/// before the keydown of the Enter that committed it, with `isComposing`
/// false, so neither the composition flags nor the key's name tell that key
/// apart from a plain Enter; its keyCode does.
pub(crate) fn belongs_to_ime(inner: &Rc<WebWindowInner>, event: &web_sys::KeyboardEvent) -> bool {
    let composing = inner.is_composing.get() || event.is_composing();
    if composing {
        // As upstream did after dispatching the key: the composition goes on
        // in the IME mirror, not in the page.
        event.prevent_default();
        return true;
    }
    if event.key_code() == IME_PROCESSED_KEY_CODE {
        // The composition has ended and the browser applies its commit to
        // the mirror; bring the mirror back in step with the document after.
        inner.schedule_ime_mirror_sync();
        return true;
    }
    false
}
