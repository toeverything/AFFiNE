#![allow(unsafe_code)]

//! C-ABI entry points for the live GPU `PlaygroundView` mounted inside `AffineIosHost`.

use std::ffi::{CStr, c_char, c_void};

use playground::{FormFactor, PlaygroundMode};

use super::{AffineUtf16Range, editor_runtime::IosEditorRuntime, ffi::AffineIosHost};

/// Callback fired when the editor mutates text or selection (`H-S2`).
pub type AffineTextInputChangedCallback = extern "C" fn(u8, *mut c_void);

/// Flushes queued `TextInputStateChange` notifications after `host.editor` borrow has ended
/// so UIKit `UITextInputDelegate` callbacks can safely re-enter FFI queries without panicking.
pub(crate) fn flush_text_input_changes(host: &AffineIosHost) {
    let window = host
        .editor
        .borrow()
        .as_ref()
        .map(IosEditorRuntime::window_handle);
    if let Some(window) = window {
        window.flush_text_input_changes();
    }
}

unsafe fn c_str_opt<'a>(ptr: *const c_char) -> Option<&'a str> {
    if ptr.is_null() {
        return None;
    }
    // SAFETY: Caller guarantees `ptr` is a valid NUL-terminated C string.
    unsafe { CStr::from_ptr(ptr) }.to_str().ok()
}

/// Returns the `CAMetalLayer *` owned by `MetalRenderer` on iOS, or null on non-iOS hosts.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_metal_layer(host: *const AffineIosHost) -> *mut c_void {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return core::ptr::null_mut();
    };
    host.editor
        .borrow()
        .as_ref()
        .map(IosEditorRuntime::metal_layer_ptr)
        .unwrap_or(core::ptr::null_mut())
}

/// Returns the authoritative UTF-16 length of the currently focused editor block (`H-S1`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_utf16_len(host: *const AffineIosHost) -> usize {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        return editor.utf16_len();
    }
    host.state.utf16_text().len()
}

/// Copies the authoritative UTF-16 code units of the currently focused editor block into
/// `out_ptr` (up to `capacity` units) and returns the total UTF-16 length (`H-S1`).
///
/// # Safety
/// `host` must be null or a live pointer; `out_ptr` must be valid for `capacity` writes when non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_copy_utf16(
    host: *const AffineIosHost,
    out_ptr: *mut u16,
    capacity: usize,
) -> usize {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    let units = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.utf16_text()
    } else {
        host.state.utf16_text().to_vec()
    };
    if !out_ptr.is_null() && capacity > 0 && !units.is_empty() {
        let count = units.len().min(capacity);
        // SAFETY: Caller guarantees `out_ptr` points to `capacity` writable `u16` elements.
        unsafe {
            core::ptr::copy_nonoverlapping(units.as_ptr(), out_ptr, count);
        }
    }
    units.len()
}

/// Dispatches a UIKit touch event (`0=Started, 1=Moved, 2=Ended, 3=Cancelled`) into the GPU editor.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_touch_event(
    host: *mut AffineIosHost,
    touch_id: u64,
    phase: u8,
    x: f32,
    y: f32,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.dispatch_touch(touch_id, phase, x, y);
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// Dispatches a hardware keyboard or editor key event (`enter`, `backspace`, `left`, `right`,
/// `up`, `down`, `escape`, `tab`, etc.) into the GPU editor.
///
/// # Safety
/// `host` must be null or a live pointer; `key` and `key_char` must be null or valid C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_key_down(
    host: *mut AffineIosHost,
    key: *const c_char,
    key_char: *const c_char,
    shift: bool,
    cmd: bool,
    ctrl: bool,
    alt: bool,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let Some(key_str) = (unsafe { c_str_opt(key) }) else {
        return;
    };
    let char_str = unsafe { c_str_opt(key_char) };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.dispatch_key_down(key_str, char_str, shift, cmd, ctrl, alt);
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// Updates the host form factor (`0=Phone, 1=Tablet, 2=Desktop`) and applies Stage-1 defaults.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_form_factor(
    host: *mut AffineIosHost,
    form_factor: u8,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let ff = match form_factor {
        1 => FormFactor::Tablet,
        2 => FormFactor::Desktop,
        _ => FormFactor::Phone,
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.set_form_factor(ff);
    }
}

/// Returns `true` when Edgeless authoring is gated read-only (`T1` Stage 1 on touch hosts).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_edgeless_readonly(host: *const AffineIosHost) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return true;
    };
    host.editor
        .borrow()
        .as_ref()
        .map(IosEditorRuntime::edgeless_readonly)
        .unwrap_or(true)
}

/// Returns `true` when Database mutations are gated read-only (`T1` Stage 1 on touch hosts).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_database_readonly(host: *const AffineIosHost) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return true;
    };
    host.editor
        .borrow()
        .as_ref()
        .map(IosEditorRuntime::database_readonly)
        .unwrap_or(true)
}

/// Switches the mounted editor between Page (`0`) and Edgeless (`1`) modes.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_mode(host: *mut AffineIosHost, mode: u8) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let next = if mode == 1 {
        PlaygroundMode::Edgeless
    } else {
        PlaygroundMode::Page
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.set_mode(next);
    }
}

/// Registers an observer invoked when the editor changes text or selection (`H-S2`).
///
/// # Safety
/// `host` must be null or a live pointer; `user_data` must outlive the registration.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_text_input_callback(
    host: *mut AffineIosHost,
    cb: Option<AffineTextInputChangedCallback>,
    user_data: *mut c_void,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let ud_addr = user_data as usize;
    if let Some(editor) = host.editor.borrow().as_ref() {
        let observer = cb.map(|func| {
            Box::new(move |change| {
                func(
                    IosEditorRuntime::change_kind_code(change),
                    ud_addr as *mut c_void,
                );
            }) as super::editor_platform::TextInputObserver
        });
        editor.set_text_input_observer(observer);
    }
}

/// Monotonic counter incremented on every editor `TextInputStateChange` notification (`H-S2`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_text_input_change_seq(host: *const AffineIosHost) -> u64 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    host.editor
        .borrow()
        .as_ref()
        .map(IosEditorRuntime::text_input_change_seq)
        .unwrap_or(0)
}

/// Whether the mounted editor currently wants the system software keyboard shown.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_wants_software_keyboard(
    host: *const AffineIosHost,
) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    host.editor
        .borrow()
        .as_ref()
        .map(IosEditorRuntime::wants_software_keyboard)
        .unwrap_or(false)
}

/// Replaces the mounted document with an empty single-paragraph page and focuses it.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_reset_empty_doc(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.reset_empty_document();
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// Reloads the built-in BlockSuite showcase document into the mounted GPU editor.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_load_showcase_doc(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.load_showcase_document();
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// # Safety
/// `host` must be null or a live pointer; `utf16_ptr` must be valid for `utf16_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_insert_text(
    host: *mut AffineIosHost,
    utf16_ptr: *const u16,
    utf16_len: usize,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let slice = if utf16_len == 0 || utf16_ptr.is_null() {
        &[]
    } else {
        // SAFETY: Caller guarantees `utf16_ptr` points to `utf16_len` initialized `u16`s.
        unsafe { core::slice::from_raw_parts(utf16_ptr, utf16_len) }
    };
    let handled = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.insert_text(slice);
        true
    } else {
        false
    };
    if handled {
        flush_text_input_changes(host);
        host.state.selection_overlay_mut().clear();
        host.state.request_frame();
        return;
    }
    host.state.insert_text(slice);
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_delete_backward(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let handled = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.delete_backward();
        true
    } else {
        false
    };
    if handled {
        flush_text_input_changes(host);
        host.state.selection_overlay_mut().clear();
        host.state.request_frame();
        return;
    }
    host.state.delete_backward();
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_delete_range(
    host: *mut AffineIosHost,
    range: AffineUtf16Range,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let handled = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.delete_range(range);
        true
    } else {
        false
    };
    if handled {
        flush_text_input_changes(host);
        host.state.selection_overlay_mut().clear();
        host.state.request_frame();
        return;
    }
    host.state.delete_range(range);
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_selected_range(
    host: *mut AffineIosHost,
    range: AffineUtf16Range,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let handled = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.set_selected_range(range);
        true
    } else {
        false
    };
    if handled {
        flush_text_input_changes(host);
        if range.length == 0
            && host.state.selection_overlay().active_drag_handle()
                == super::selection::AffineSelectionHandleKind::None
        {
            host.state.selection_overlay_mut().clear();
        }
        host.state.request_frame();
        return;
    }
    host.state.set_selected_range(range);
}

/// # Safety
/// `host` must be null or a live pointer; `utf16_ptr` must be valid for `utf16_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_replace_range(
    host: *mut AffineIosHost,
    range: AffineUtf16Range,
    utf16_ptr: *const u16,
    utf16_len: usize,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let slice = if utf16_len == 0 || utf16_ptr.is_null() {
        &[]
    } else {
        // SAFETY: Caller guarantees `utf16_ptr` points to `utf16_len` initialized `u16`s.
        unsafe { core::slice::from_raw_parts(utf16_ptr, utf16_len) }
    };
    let handled = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.replace_range(range, slice);
        true
    } else {
        false
    };
    if handled {
        flush_text_input_changes(host);
        host.state.selection_overlay_mut().clear();
        host.state.request_frame();
        return;
    }
    host.state.replace_range(range, slice);
}

/// # Safety
/// `host` must be null or a live pointer; `utf16_ptr` must be valid for `utf16_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_marked_text(
    host: *mut AffineIosHost,
    utf16_ptr: *const u16,
    utf16_len: usize,
    selected_range: AffineUtf16Range,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let slice = if utf16_len == 0 || utf16_ptr.is_null() {
        &[]
    } else {
        // SAFETY: Caller guarantees `utf16_ptr` points to `utf16_len` initialized `u16`s.
        unsafe { core::slice::from_raw_parts(utf16_ptr, utf16_len) }
    };
    let handled = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.set_marked_text(slice, selected_range);
        true
    } else {
        false
    };
    if handled {
        flush_text_input_changes(host);
        host.state.request_frame();
        return;
    }
    host.state.set_marked_text(slice, selected_range);
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_unmark_text(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    let handled = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.unmark_text();
        true
    } else {
        false
    };
    if handled {
        flush_text_input_changes(host);
        host.state.request_frame();
        return;
    }
    host.state.unmark_text();
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selected_range(
    host: *const AffineIosHost,
) -> AffineUtf16Range {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineUtf16Range::default();
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        return editor.selected_range();
    }
    host.state.selected_range()
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_marked_range(
    host: *const AffineIosHost,
) -> AffineUtf16Range {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineUtf16Range {
            location: u32::MAX,
            length: 0,
        };
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        return editor.marked_range();
    }
    host.state.marked_range()
}
