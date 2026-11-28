#![allow(unsafe_code)]

//! C-ABI exports for pure read-only full-document `UITextPosition` queries,
//! document bounds, cross-block stepping, word boundaries, caret rects, and selection rects.

use std::ffi::CString;

use super::{
    editor_doc_positions::AffineDocPosition, ffi::AffineIosHost,
    ffi_selection::AffineDocumentSelectionRect, selection::AffineRect,
};

fn to_affine_rect(r: playground::SelectionRectGeometry) -> AffineRect {
    AffineRect {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    }
}

/// Layout index (`0..`) of the currently focused block.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_focused_block_order(host: *const AffineIosHost) -> i32 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    host.editor
        .borrow_mut()
        .as_mut()
        .map_or(0, |e| e.focused_block_order())
}

/// Query full-document addressable bounds `(beginningOfDocument, endOfDocument)` across all
/// editable blocks in layout order.
///
/// # Safety
/// `host` must be null or a live pointer; `out_start` and `out_end` may be null or writable pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_document_bounds(
    host: *const AffineIosHost,
    out_start: *mut AffineDocPosition,
    out_end: *mut AffineDocPosition,
) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    let Some((s, e)) = host
        .editor
        .borrow_mut()
        .as_mut()
        .and_then(|ed| ed.doc_document_bounds())
    else {
        return false;
    };
    if !out_start.is_null() {
        unsafe { *out_start = s };
    }
    if !out_end.is_null() {
        unsafe { *out_end = e };
    }
    true
}

/// Query ordered `(start, end)` `AffineDocPosition`s for the active selection (collapsed or range).
///
/// # Safety
/// `host` must be null or a live pointer; `out_start` and `out_end` may be null or writable pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_positions(
    host: *const AffineIosHost,
    out_start: *mut AffineDocPosition,
    out_end: *mut AffineDocPosition,
) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    let Some((s, e)) = host
        .editor
        .borrow_mut()
        .as_mut()
        .and_then(|ed| ed.current_selection_doc_positions())
    else {
        return false;
    };
    if !out_start.is_null() {
        unsafe { *out_start = s };
    }
    if !out_end.is_null() {
        unsafe { *out_end = e };
    }
    true
}

/// Pure read-only viewport hit-test returning `AffineDocPosition` (`valid = false` when no text hit).
/// Never mutates `editor.selection` or focused block state.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_hit_position(
    host: *const AffineIosHost,
    x: f32,
    y: f32,
) -> AffineDocPosition {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineDocPosition::default();
    };
    host.editor
        .borrow_mut()
        .as_mut()
        .and_then(|ed| ed.doc_hit_position(x, y))
        .unwrap_or_default()
}

/// Pure read-only viewport caret rectangle for an interned `endpoint_token`.
///
/// # Safety
/// `host` must be null or a live pointer; `out_rect` may be null or a writable pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_caret_rect_for_token(
    host: *const AffineIosHost,
    endpoint_token: u64,
    out_rect: *mut AffineRect,
) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    let Some(rect) = host
        .editor
        .borrow_mut()
        .as_mut()
        .and_then(|ed| ed.doc_caret_rect_for_token(endpoint_token))
    else {
        return false;
    };
    if !out_rect.is_null() {
        unsafe { *out_rect = rect };
    }
    true
}

/// Pure read-only selection rectangles between two interned endpoint tokens.
///
/// # Safety
/// `host` must be null or a live pointer; `out_rects` must be valid for `capacity` writes when non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_rects_between_tokens(
    host: *const AffineIosHost,
    start_endpoint_token: u64,
    end_endpoint_token: u64,
    out_rects: *mut AffineDocumentSelectionRect,
    capacity: usize,
) -> usize {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    let raw = host
        .editor
        .borrow_mut()
        .as_mut()
        .map(|ed| ed.doc_selection_rects_between_tokens(start_endpoint_token, end_endpoint_token))
        .unwrap_or_default();
    let mapped: Vec<AffineDocumentSelectionRect> = raw
        .into_iter()
        .map(|r| AffineDocumentSelectionRect {
            rect: to_affine_rect(r),
            is_rtl: r.is_rtl,
            contains_start: r.contains_start,
            contains_end: r.contains_end,
        })
        .collect();
    if !out_rects.is_null() && capacity > 0 && !mapped.is_empty() {
        let count = mapped.len().min(capacity);
        unsafe {
            core::ptr::copy_nonoverlapping(mapped.as_ptr(), out_rects, count);
        }
    }
    mapped.len()
}

/// Step `delta` UTF-16 code units from `endpoint_token` across addressable document blocks.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_step_position(
    host: *const AffineIosHost,
    endpoint_token: u64,
    delta: isize,
) -> AffineDocPosition {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineDocPosition::default();
    };
    host.editor
        .borrow_mut()
        .as_mut()
        .and_then(|ed| ed.doc_step_position(endpoint_token, delta))
        .unwrap_or_default()
}

/// Resolve authoritative ICU word boundaries `(out_start, out_end)` around `endpoint_token`.
///
/// # Safety
/// `host` must be null or a live pointer; `out_start` and `out_end` may be null or writable pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_word_range(
    host: *const AffineIosHost,
    endpoint_token: u64,
    out_start: *mut AffineDocPosition,
    out_end: *mut AffineDocPosition,
) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    let Some((s, e)) = host
        .editor
        .borrow_mut()
        .as_mut()
        .and_then(|ed| ed.doc_word_range(endpoint_token))
    else {
        return false;
    };
    if !out_start.is_null() {
        unsafe { *out_start = s };
    }
    if !out_end.is_null() {
        unsafe { *out_end = e };
    }
    true
}

/// Signed UTF-16 offset distance from `from_token` to `to_token` across document blocks.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_offset_between_tokens(
    host: *const AffineIosHost,
    from_token: u64,
    to_token: u64,
) -> i32 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    host.editor
        .borrow_mut()
        .as_mut()
        .map_or(0, |ed| ed.doc_offset_between_tokens(from_token, to_token))
}

/// Newly allocated UTF-8 C string of plain text between two interned endpoint tokens
/// (caller frees via `affine_ios_string_free`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_text_between_tokens(
    host: *const AffineIosHost,
    start_endpoint_token: u64,
    end_endpoint_token: u64,
) -> *mut core::ffi::c_char {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return core::ptr::null_mut();
    };
    let s = host
        .editor
        .borrow_mut()
        .as_mut()
        .map(|ed| ed.doc_text_between_tokens(start_endpoint_token, end_endpoint_token))
        .unwrap_or_default();
    CString::new(s)
        .map(CString::into_raw)
        .unwrap_or(core::ptr::null_mut())
}
