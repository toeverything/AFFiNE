//! Whether the pointer is in the window, for hit testing.
//!
//! `MouseExited` carries the exit position, which lies on the window edge and
//! so is still inside hitboxes flush with that edge (such as maximized title
//! bar buttons on X11). Hit testing ignores the last position from the exit
//! until the next pointer event, so those hitboxes stop showing as hovered.

use crate::{FileDropEvent, Frame, HitTest, PlatformInput, Window};

/// Records whether `event` moves the pointer out of the window or back in.
pub(crate) fn note_input(window: &mut Window, event: &PlatformInput) {
    match event {
        PlatformInput::MouseExited(_) => window.fast_pointer_outside = true,
        PlatformInput::KeyDown(_)
        | PlatformInput::KeyUp(_)
        | PlatformInput::ModifiersChanged(_)
        | PlatformInput::MousePressure(_)
        | PlatformInput::FileDrop(FileDropEvent::Exited | FileDropEvent::Ended) => {}
        _ => window.fast_pointer_outside = false,
    }
}

/// Hit tests `frame` at the pointer, or nothing while the pointer is outside.
pub(crate) fn hit_test(window: &Window, frame: &Frame) -> HitTest {
    if window.fast_pointer_outside {
        HitTest::default()
    } else {
        frame.hit_test(window.mouse_position)
    }
}
