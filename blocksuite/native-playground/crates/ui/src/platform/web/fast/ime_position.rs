//! Where the browser opens its IME candidate panel.
//!
//! A browser anchors the panel of a composition (the candidate list of a CJK
//! input method, the accent picker) to the caret of the focused editable
//! element. For GPUI that element is the hidden `<textarea>` of
//! `ime_mirror`, which sits in the page's top left corner, so every panel
//! opened there rather than at the text being composed.
//!
//! So when a composition starts, and as it goes on, the web platform asks the
//! window's input handler where the composed text is and moves the element
//! there, before the browser places the panel. That is what Windows does on
//! `WM_IME_STARTCOMPOSITION`, and it needs nothing from the application: an
//! input does not have to call `Window::invalidate_character_coordinates`,
//! which costs a frame. `PlatformWindow::update_ime_position`, the push an
//! editor makes with that call, moves the element too.

use wasm_bindgen::JsCast;

use crate::{Bounds, Pixels};

use crate::platform::web::window::WebWindowInner;

/// Moves the IME mirror to where the input handler places the IME panel: the
/// caret, or once text is being composed, the start of its line.
///
/// Called from the mirror's `compositionstart` and `compositionupdate`
/// listeners, in a browser event, where the handler is queried as every other
/// listener queries it. During an update it runs before the update is applied,
/// so it reads the text GPUI has laid out and painted.
pub(crate) fn follow_input(inner: &WebWindowInner) {
    let bounds = inner
        .with_input_handler(|handler| handler.ime_candidate_bounds())
        .flatten();
    if let Some(bounds) = bounds {
        move_to_caret(inner, bounds);
    }
}

/// Moves the IME mirror to the caret at `bounds`, in window coordinates.
///
/// Only the element's style is written. A write to its value or selection
/// restarts the IME's input connection (see `ime_mirror`), a style write
/// does not, so this is safe in the middle of a composition.
pub(crate) fn move_to_caret(inner: &WebWindowInner, bounds: Bounds<Pixels>) {
    let Some(element) = inner
        .ime_mirror
        .event_target()
        .dyn_ref::<web_sys::HtmlElement>()
    else {
        return;
    };
    // Window coordinates are the canvas's, and the mirror is positioned
    // against the viewport: a page may place the canvas anywhere. The mirror's
    // corner goes under the caret's bottom left corner, so the panel, which
    // the browser opens below the mirror's caret, opens just under the
    // composed text, where a native text field opens it.
    let canvas = inner.canvas.get_bounding_client_rect();
    let left = canvas.left() + f64::from(f32::from(bounds.left()));
    let top = canvas.top() + f64::from(f32::from(bounds.bottom()));
    let style = element.style();
    style.set_property("left", &format!("{left}px")).ok();
    style.set_property("top", &format!("{top}px")).ok();
    // Over the canvas, the element must not take the clicks meant for the
    // text under it, and its caret, which the panel is placed against, must
    // not be inset from its corner by a textarea's default padding and border.
    style.set_property("pointer-events", "none").ok();
    style.set_property("padding", "0").ok();
    style.set_property("border", "0").ok();
}
