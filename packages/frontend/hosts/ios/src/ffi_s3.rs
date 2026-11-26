#![allow(unsafe_code)]

use std::ffi::c_void;

use super::{
    AffineUtf16Range, AffineWindowInsets,
    ffi::{AffineIosByteBuffer, AffineIosHost},
    haptics::AffineHapticPattern,
    keyboard_insets::{AffineKeyboardAvoidanceMetrics, compute_keyboard_avoidance},
    pdf::{
        AffinePdfErrorCode, AffinePdfPageSize, AffinePdfRenderPlan, plan_pdf_page_render,
        validate_pdf_bytes,
    },
    selection::{
        AffinePoint, AffineRect, AffineSelectionHandleKind, AffineSelectionOverlayState,
        AffineWritingDirection,
    },
};

/// C-ABI callback invoked by Rust when a haptic pattern is triggered.
pub type AffineHapticsCallback = extern "C" fn(u8, *mut c_void);

/// C-ABI callback opening an in-memory PDF into an explicit native document handle (`0` on error).
pub type AffinePdfOpenDocFn = extern "C" fn(*const u8, usize, *mut c_void) -> u64;

/// C-ABI callback closing an explicit native PDF document handle.
pub type AffinePdfCloseDocFn = extern "C" fn(u64, *mut c_void);

/// C-ABI callback querying total page count of an open native PDF document handle.
pub type AffinePdfDocPageCountFn = extern "C" fn(u64, *mut c_void) -> u32;

/// C-ABI callback querying displayed point size of one page on an open PDF handle.
pub type AffinePdfDocPageSizeFn =
    extern "C" fn(u64, u32, *mut AffinePdfPageSize, *mut c_void) -> bool;

/// C-ABI callback rasterizing one page on an open PDF handle into a caller RGBA8 buffer.
pub type AffinePdfDocRenderRgba8Fn =
    extern "C" fn(u64, u32, u32, u32, *mut u8, usize, *mut c_void) -> bool;

/// Native PDFKit provider table registered by Swift `PdfRendererBridge`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AffinePdfProvider {
    pub open_doc: Option<AffinePdfOpenDocFn>,
    pub close_doc: Option<AffinePdfCloseDocFn>,
    pub doc_page_count: Option<AffinePdfDocPageCountFn>,
    pub doc_page_size: Option<AffinePdfDocPageSizeFn>,
    pub doc_render_rgba8: Option<AffinePdfDocRenderRgba8Fn>,
    pub user_data: *mut c_void,
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_insets(host: *const AffineIosHost) -> AffineWindowInsets {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineWindowInsets::default();
    };
    host.state.insets()
}

/// Query keyboard height strictly above `safe_bottom` (`max(0, ime_bottom - safe_bottom)`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_ime_above_safe_bottom(host: *const AffineIosHost) -> f32 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0.0;
    };
    host.state.ime_above_safe_bottom()
}

/// Compute keyboard avoidance metrics from window bounds and keyboard frame.
#[unsafe(no_mangle)]
pub extern "C" fn affine_ios_keyboard_compute_avoidance(
    window_bounds: AffineRect,
    keyboard_frame_in_window: AffineRect,
    safe_bottom: f32,
    is_hidden: bool,
) -> AffineKeyboardAvoidanceMetrics {
    compute_keyboard_avoidance(
        window_bounds,
        keyboard_frame_in_window,
        safe_bottom,
        is_hidden,
    )
}

/// Begin a per-frame eased keyboard avoidance transition on `host`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_begin_keyboard_transition(
    host: *mut AffineIosHost,
    target_ime_bottom_pt: f32,
    start_timestamp_sec: f64,
    duration_sec: f64,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    host.state
        .begin_keyboard_transition(target_ime_bottom_pt, start_timestamp_sec, duration_sec);
}

/// Sample the active keyboard transition at `frame_timestamp_sec` and sync `AffineWindowInsets`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_sample_keyboard_frame(
    host: *mut AffineIosHost,
    safe_top: f32,
    safe_right: f32,
    safe_bottom: f32,
    safe_left: f32,
    frame_timestamp_sec: f64,
) -> AffineWindowInsets {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return AffineWindowInsets::default();
    };
    host.state.sample_keyboard_frame(
        safe_top,
        safe_right,
        safe_bottom,
        safe_left,
        frame_timestamp_sec,
    )
}

/// Update selection caret geometry, UTF-16 range, and writing direction on `host`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_set(
    host: *mut AffineIosHost,
    start_caret: AffineRect,
    end_caret: AffineRect,
    range: AffineUtf16Range,
    writing_direction: u8,
) -> AffineSelectionOverlayState {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return AffineSelectionOverlayState::default();
    };
    host.state.selection_overlay_mut().set_selection(
        start_caret,
        end_caret,
        range,
        AffineWritingDirection::from_u8(writing_direction),
    );
    host.state.selection_overlay_state()
}

/// Clear active selection overlay state on `host`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_clear(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    host.state.selection_overlay_mut().clear();
}

/// Query the current computed selection overlay state (teardrop handles, loupe, menu anchor).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_state(
    host: *const AffineIosHost,
) -> AffineSelectionOverlayState {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineSelectionOverlayState::default();
    };
    host.state.selection_overlay_state()
}

/// Hit-test teardrop selection handles at `point` (`0 = none, 1 = start, 2 = end`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_hit_test(
    host: *const AffineIosHost,
    point: AffinePoint,
    hit_radius_pt: f32,
) -> u8 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineSelectionHandleKind::None as u8;
    };
    let (vw, vh) = host.state.viewport_size_pt();
    let insets = host.state.insets();
    host.state
        .selection_overlay()
        .hit_test_handle(point, hit_radius_pt, vw, vh, insets) as u8
}

/// Begin dragging a teardrop selection handle and activate the magnifier loupe.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_begin_drag(
    host: *mut AffineIosHost,
    handle_kind: u8,
    touch_point: AffinePoint,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    host.state
        .selection_overlay_mut()
        .begin_drag(AffineSelectionHandleKind::from_u8(handle_kind), touch_point)
}

/// Compute the caret-aligned probe point (`touch + grab_offset`) for an active drag.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_drag_probe(
    host: *const AffineIosHost,
    touch_point: AffinePoint,
) -> AffinePoint {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return touch_point;
    };
    host.state
        .selection_overlay()
        .drag_probe_point_for(touch_point)
}

/// Query the fixed UTF-16 anchor offset of an active handle drag (`u32::MAX` when idle).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_drag_anchor(host: *const AffineIosHost) -> u32 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return u32::MAX;
    };
    host.state
        .selection_overlay()
        .drag_anchor_utf16()
        .unwrap_or(u32::MAX)
}

/// Update an in-progress drag from authoritative UTF-16 target offset and shaped start/end carets.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_apply_drag_endpoints(
    host: *mut AffineIosHost,
    touch_point: AffinePoint,
    target_offset: u32,
    start_caret: AffineRect,
    end_caret: AffineRect,
) -> AffineSelectionOverlayState {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return AffineSelectionOverlayState::default();
    };
    let _ = host
        .state
        .selection_overlay_mut()
        .apply_text_drag_endpoints(touch_point, target_offset, start_caret, end_caret);
    host.state.selection_overlay_state()
}

/// Finish an active handle drag, hiding the loupe and exposing `menu_anchor_rect`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_end_drag(
    host: *mut AffineIosHost,
) -> AffineSelectionOverlayState {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return AffineSelectionOverlayState::default();
    };
    let _ = host.state.selection_overlay_mut().end_drag();
    host.state.selection_overlay_state()
}

/// Validate raw PDF bytes (`0 = ok`, otherwise `AffinePdfErrorCode`).
///
/// # Safety
/// `pdf_ptr` must be valid for `pdf_len` reads when `pdf_len > 0`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_pdf_validate_bytes(pdf_ptr: *const u8, pdf_len: usize) -> u32 {
    let slice = if pdf_len == 0 || pdf_ptr.is_null() {
        &[]
    } else {
        // SAFETY: Caller guarantees `pdf_ptr` points to `pdf_len` initialized bytes.
        unsafe { core::slice::from_raw_parts(pdf_ptr, pdf_len) }
    };
    match validate_pdf_bytes(slice) {
        Ok(()) => AffinePdfErrorCode::Ok as u32,
        Err(code) => code as u32,
    }
}

/// Validate page index and target pixel dimensions and compute the RGBA8 byte budget.
#[unsafe(no_mangle)]
pub extern "C" fn affine_ios_pdf_plan_render(
    page_index: u32,
    page_count: u32,
    target_width_px: u32,
    target_height_px: u32,
) -> AffinePdfRenderPlan {
    plan_pdf_page_render(page_index, page_count, target_width_px, target_height_px)
}

/// Register the Swift `PDFKit` provider callback table on `host`.
///
/// # Safety
/// `host` must be null or a live pointer; callbacks and `user_data` must outlive registration.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_pdf_provider(
    host: *mut AffineIosHost,
    provider: AffinePdfProvider,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if provider.open_doc.is_none()
        && provider.close_doc.is_none()
        && provider.doc_page_count.is_none()
        && provider.doc_page_size.is_none()
        && provider.doc_render_rgba8.is_none()
    {
        host.pdf_provider = None;
    } else {
        host.pdf_provider = Some(provider);
    }
}

fn write_pdf_err(out_error: *mut u32, code: AffinePdfErrorCode) {
    if let Some(slot) = unsafe { out_error.as_mut() } {
        *slot = code as u32;
    }
}

/// Open an in-memory PDF into an explicit native document handle (`0` on error).
///
/// # Safety
/// `host` must be a live pointer; `pdf_ptr` must be valid for `pdf_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_pdf_open(
    host: *const AffineIosHost,
    pdf_ptr: *const u8,
    pdf_len: usize,
    out_error: *mut u32,
) -> u64 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidArgument);
        return 0;
    };
    let slice = if pdf_len == 0 || pdf_ptr.is_null() {
        &[]
    } else {
        // SAFETY: Caller guarantees `pdf_ptr` points to `pdf_len` bytes.
        unsafe { core::slice::from_raw_parts(pdf_ptr, pdf_len) }
    };
    if let Err(code) = validate_pdf_bytes(slice) {
        write_pdf_err(out_error, code);
        return 0;
    }
    let Some(provider) = host.pdf_provider else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return 0;
    };
    let Some(open_fn) = provider.open_doc else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return 0;
    };
    let doc_id = open_fn(slice.as_ptr(), slice.len(), provider.user_data);
    if doc_id == 0 {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidOrEncryptedPdf);
    } else {
        write_pdf_err(out_error, AffinePdfErrorCode::Ok);
    }
    doc_id
}

/// Close an explicit native PDF document handle, releasing its `PDFDocument` immediately.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_pdf_close(host: *const AffineIosHost, doc_id: u64) {
    if doc_id == 0 {
        return;
    }
    let Some(host) = (unsafe { host.as_ref() }) else {
        return;
    };
    if let Some(provider) = host.pdf_provider
        && let Some(close_fn) = provider.close_doc
    {
        close_fn(doc_id, provider.user_data);
    }
}

/// Query page count on an open PDF handle (`O(1)` lookup, zero hashing).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_pdf_doc_page_count(
    host: *const AffineIosHost,
    doc_id: u64,
    out_error: *mut u32,
) -> u32 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidArgument);
        return 0;
    };
    if doc_id == 0 {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidArgument);
        return 0;
    }
    let Some(provider) = host.pdf_provider else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return 0;
    };
    let Some(count_fn) = provider.doc_page_count else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return 0;
    };
    let count = count_fn(doc_id, provider.user_data);
    if count == 0 {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidArgument);
    } else {
        write_pdf_err(out_error, AffinePdfErrorCode::Ok);
    }
    count
}

/// Query displayed page point size on an open PDF handle.
///
/// # Safety
/// `host` must be null or a live pointer; `out_size` must be writable when non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_pdf_doc_page_size(
    host: *const AffineIosHost,
    doc_id: u64,
    page_index: u32,
    out_size: *mut AffinePdfPageSize,
    out_error: *mut u32,
) -> bool {
    let Some(host_ref) = (unsafe { host.as_ref() }) else {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidArgument);
        return false;
    };
    if doc_id == 0 || out_size.is_null() {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidArgument);
        return false;
    }
    let mut count_err = AffinePdfErrorCode::Ok as u32;
    let count = unsafe { affine_ios_host_pdf_doc_page_count(host, doc_id, &mut count_err) };
    if count_err != AffinePdfErrorCode::Ok as u32 {
        if let Some(slot) = unsafe { out_error.as_mut() } {
            *slot = count_err;
        }
        return false;
    }
    if page_index >= count {
        write_pdf_err(out_error, AffinePdfErrorCode::PageOutOfRange);
        return false;
    }
    let Some(provider) = host_ref.pdf_provider else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return false;
    };
    let Some(size_fn) = provider.doc_page_size else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return false;
    };
    let ok = size_fn(doc_id, page_index, out_size, provider.user_data);
    write_pdf_err(
        out_error,
        if ok {
            AffinePdfErrorCode::Ok
        } else {
            AffinePdfErrorCode::RenderFailed
        },
    );
    ok
}

/// Rasterize one page on an open PDF handle to RGBA8 with bounds/OOM checks.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_pdf_doc_render_page_rgba8(
    host: *const AffineIosHost,
    doc_id: u64,
    page_index: u32,
    target_width_px: u32,
    target_height_px: u32,
    out_error: *mut u32,
) -> AffineIosByteBuffer {
    let Some(host_ref) = (unsafe { host.as_ref() }) else {
        write_pdf_err(out_error, AffinePdfErrorCode::InvalidArgument);
        return AffineIosByteBuffer::empty();
    };
    let mut count_err = AffinePdfErrorCode::Ok as u32;
    let page_count = unsafe { affine_ios_host_pdf_doc_page_count(host, doc_id, &mut count_err) };
    if count_err != AffinePdfErrorCode::Ok as u32 {
        if let Some(slot) = unsafe { out_error.as_mut() } {
            *slot = count_err;
        }
        return AffineIosByteBuffer::empty();
    }
    let plan = plan_pdf_page_render(page_index, page_count, target_width_px, target_height_px);
    if plan.error != AffinePdfErrorCode::Ok as u32 {
        if let Some(slot) = unsafe { out_error.as_mut() } {
            *slot = plan.error;
        }
        return AffineIosByteBuffer::empty();
    }
    let Some(provider) = host_ref.pdf_provider else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return AffineIosByteBuffer::empty();
    };
    let Some(render_fn) = provider.doc_render_rgba8 else {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return AffineIosByteBuffer::empty();
    };
    let mut rgba = vec![0u8; plan.byte_len];
    let ok = render_fn(
        doc_id,
        page_index,
        plan.target_width_px,
        plan.target_height_px,
        rgba.as_mut_ptr(),
        rgba.len(),
        provider.user_data,
    );
    if !ok {
        write_pdf_err(out_error, AffinePdfErrorCode::RenderFailed);
        return AffineIosByteBuffer::empty();
    }
    write_pdf_err(out_error, AffinePdfErrorCode::Ok);
    AffineIosByteBuffer::from_vec(rgba)
}

/// Stateless convenience wrapper: opens, queries page count, and immediately closes the PDF handle.
///
/// # Safety
/// `host` must be a live pointer; `pdf_ptr` must be valid for `pdf_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_pdf_page_count(
    host: *const AffineIosHost,
    pdf_ptr: *const u8,
    pdf_len: usize,
    out_error: *mut u32,
) -> u32 {
    let mut open_err = AffinePdfErrorCode::Ok as u32;
    let doc_id = unsafe { affine_ios_host_pdf_open(host, pdf_ptr, pdf_len, &mut open_err) };
    if doc_id == 0 {
        if let Some(slot) = unsafe { out_error.as_mut() } {
            *slot = open_err;
        }
        return 0;
    }
    let count = unsafe { affine_ios_host_pdf_doc_page_count(host, doc_id, out_error) };
    unsafe { affine_ios_host_pdf_close(host, doc_id) };
    count
}

/// Stateless convenience wrapper: opens, rasterizes one page, and immediately closes the PDF handle.
///
/// # Safety
/// `host` must be a live pointer; `pdf_ptr` must be valid for `pdf_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_pdf_render_page_rgba8(
    host: *const AffineIosHost,
    pdf_ptr: *const u8,
    pdf_len: usize,
    page_index: u32,
    target_width_px: u32,
    target_height_px: u32,
    out_error: *mut u32,
) -> AffineIosByteBuffer {
    let mut open_err = AffinePdfErrorCode::Ok as u32;
    let doc_id = unsafe { affine_ios_host_pdf_open(host, pdf_ptr, pdf_len, &mut open_err) };
    if doc_id == 0 {
        if let Some(slot) = unsafe { out_error.as_mut() } {
            *slot = open_err;
        }
        return AffineIosByteBuffer::empty();
    }
    let buf = unsafe {
        affine_ios_host_pdf_doc_render_page_rgba8(
            host,
            doc_id,
            page_index,
            target_width_px,
            target_height_px,
            out_error,
        )
    };
    unsafe { affine_ios_host_pdf_close(host, doc_id) };
    buf
}

/// Register the Swift `HapticsBridge` callback on `host`.
///
/// # Safety
/// `host` must be null or a live pointer; `user_data` must outlive the registration.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_haptics_callback(
    host: *mut AffineIosHost,
    callback: Option<AffineHapticsCallback>,
    user_data: *mut c_void,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    host.haptics_callback = callback;
    host.haptics_user_data = user_data;
}

/// Trigger one haptic pattern (`0..=6`), increment counters, and invoke any registered callback.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_trigger_haptic(
    host: *mut AffineIosHost,
    pattern: u8,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let Some(parsed) = AffineHapticPattern::from_u8(pattern) else {
        return false;
    };
    host.state.record_haptic(parsed);
    if let Some(cb) = host.haptics_callback {
        cb(pattern, host.haptics_user_data);
    }
    true
}

/// Query dispatch count for a single haptic pattern (`0..=6`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_haptic_count(
    host: *const AffineIosHost,
    pattern: u8,
) -> u64 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    let Some(parsed) = AffineHapticPattern::from_u8(pattern) else {
        return 0;
    };
    host.state.haptics().count_for(parsed)
}

/// Query total haptic dispatch count across all patterns.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_haptic_total_count(host: *const AffineIosHost) -> u64 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    host.state.haptics().total_count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::{affine_ios_bytes_free, affine_ios_host_create, affine_ios_host_destroy};

    extern "C" fn test_haptic_cb(pattern: u8, user_data: *mut c_void) {
        let log = unsafe { &mut *(user_data as *mut Vec<u8>) };
        log.push(pattern);
    }

    extern "C" fn test_pdf_open(_ptr: *const u8, _len: usize, _ud: *mut c_void) -> u64 {
        42
    }

    extern "C" fn test_pdf_close(_doc_id: u64, _ud: *mut c_void) {}

    extern "C" fn test_pdf_doc_count(doc_id: u64, _ud: *mut c_void) -> u32 {
        if doc_id == 42 { 2 } else { 0 }
    }

    extern "C" fn test_pdf_doc_size(
        doc_id: u64,
        _page_index: u32,
        out_size: *mut AffinePdfPageSize,
        _ud: *mut c_void,
    ) -> bool {
        if doc_id != 42 || out_size.is_null() {
            return false;
        }
        unsafe {
            *out_size = AffinePdfPageSize {
                width_pt: 200.0,
                height_pt: 300.0,
            };
        }
        true
    }

    extern "C" fn test_pdf_doc_render(
        doc_id: u64,
        page_index: u32,
        w: u32,
        h: u32,
        out_ptr: *mut u8,
        out_len: usize,
        _ud: *mut c_void,
    ) -> bool {
        let expected = (w as usize) * (h as usize) * 4;
        if doc_id != 42 || out_ptr.is_null() || out_len != expected {
            return false;
        }
        let buf = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_len) };
        buf.fill(if page_index == 0 { 0x22 } else { 0x88 });
        true
    }

    #[test]
    fn c_abi_s3_selection_keyboard_pdf_and_haptics_roundtrip() {
        let host = affine_ios_host_create(core::ptr::null_mut(), 390.0, 844.0, 3.0);
        assert!(!host.is_null());

        // Keyboard avoidance + per-frame transition.
        let metrics = affine_ios_keyboard_compute_avoidance(
            AffineRect {
                x: 0.0,
                y: 0.0,
                width: 390.0,
                height: 844.0,
            },
            AffineRect {
                x: 0.0,
                y: 542.0,
                width: 390.0,
                height: 302.0,
            },
            34.0,
            false,
        );
        assert_eq!(metrics.ime_bottom_pt, 302.0);
        assert_eq!(metrics.ime_above_safe_bottom_pt, 268.0);
        assert_eq!(metrics.effective_bottom_pt, 302.0);

        unsafe {
            affine_ios_host_begin_keyboard_transition(host, metrics.ime_bottom_pt, 1.0, 0.25);
            let mid = affine_ios_host_sample_keyboard_frame(host, 59.0, 0.0, 34.0, 0.0, 1.125);
            assert!(mid.ime_bottom > 150.0 && mid.ime_bottom < 302.0);
            let end = affine_ios_host_sample_keyboard_frame(host, 59.0, 0.0, 34.0, 0.0, 1.25);
            assert_eq!(end.ime_bottom, 302.0);
            assert_eq!(affine_ios_host_insets(host), end);
            assert_eq!(affine_ios_host_ime_above_safe_bottom(host), 268.0);
        }

        // Selection teardrop + loupe drag lifecycle.
        let sel = unsafe {
            affine_ios_host_selection_set(
                host,
                AffineRect {
                    x: 60.0,
                    y: 160.0,
                    width: 2.0,
                    height: 20.0,
                },
                AffineRect {
                    x: 180.0,
                    y: 160.0,
                    width: 2.0,
                    height: 20.0,
                },
                AffineUtf16Range {
                    location: 0,
                    length: 8,
                },
                0,
            )
        };
        assert!(sel.start_handle.visible && sel.end_handle.visible && sel.show_floating_menu);
        let hit = unsafe {
            affine_ios_host_selection_hit_test(host, AffinePoint { x: 183.0, y: 186.0 }, 22.0)
        };
        assert_eq!(hit, AffineSelectionHandleKind::End as u8);
        assert!(unsafe {
            affine_ios_host_selection_begin_drag(host, hit, AffinePoint { x: 183.0, y: 186.0 })
        });
        let dragged = unsafe {
            affine_ios_host_selection_apply_drag_endpoints(
                host,
                AffinePoint { x: 220.0, y: 186.0 },
                12,
                AffineRect {
                    x: 40.0,
                    y: 160.0,
                    width: 2.0,
                    height: 20.0,
                },
                AffineRect {
                    x: 220.0,
                    y: 160.0,
                    width: 2.0,
                    height: 20.0,
                },
            )
        };
        assert!(dragged.loupe.visible && !dragged.show_floating_menu);
        let ended = unsafe { affine_ios_host_selection_end_drag(host) };
        assert!(!ended.loupe.visible && ended.show_floating_menu);

        // Explicit PDF handle lifecycle + stateless convenience wrapper.
        unsafe {
            affine_ios_host_set_pdf_provider(
                host,
                AffinePdfProvider {
                    open_doc: Some(test_pdf_open),
                    close_doc: Some(test_pdf_close),
                    doc_page_count: Some(test_pdf_doc_count),
                    doc_page_size: Some(test_pdf_doc_size),
                    doc_render_rgba8: Some(test_pdf_doc_render),
                    user_data: core::ptr::null_mut(),
                },
            );
            let sample_pdf = b"%PDF-1.4\n%%EOF\n";
            let mut err = 99u32;
            let doc_id =
                affine_ios_host_pdf_open(host, sample_pdf.as_ptr(), sample_pdf.len(), &mut err);
            assert_eq!(err, AffinePdfErrorCode::Ok as u32);
            assert_eq!(doc_id, 42);

            let mut size = AffinePdfPageSize::default();
            assert!(affine_ios_host_pdf_doc_page_size(
                host, doc_id, 0, &mut size, &mut err
            ));
            assert_eq!(size.width_pt, 200.0);
            assert_eq!(size.height_pt, 300.0);

            let buf = affine_ios_host_pdf_doc_render_page_rgba8(host, doc_id, 0, 4, 4, &mut err);
            assert_eq!(err, AffinePdfErrorCode::Ok as u32);
            assert_eq!(buf.len, 64);
            let bytes = core::slice::from_raw_parts(buf.ptr, buf.len);
            assert_eq!(bytes[0], 0x22);
            affine_ios_bytes_free(buf);

            // Out-of-range page rejected before calling provider.
            let bad = affine_ios_host_pdf_doc_render_page_rgba8(host, doc_id, 2, 4, 4, &mut err);
            assert_eq!(err, AffinePdfErrorCode::PageOutOfRange as u32);
            assert_eq!(bad.len, 0);
            affine_ios_host_pdf_close(host, doc_id);
        }

        // Haptics callback + counters.
        let mut received = Vec::<u8>::new();
        unsafe {
            affine_ios_host_set_haptics_callback(
                host,
                Some(test_haptic_cb),
                (&mut received as *mut Vec<u8>).cast(),
            );
            assert!(affine_ios_host_trigger_haptic(host, 0));
            assert!(affine_ios_host_trigger_haptic(host, 4));
            assert!(!affine_ios_host_trigger_haptic(host, 99));
            assert_eq!(affine_ios_host_haptic_count(host, 0), 1);
            assert_eq!(affine_ios_host_haptic_count(host, 4), 1);
            assert_eq!(affine_ios_host_haptic_total_count(host), 2);
            affine_ios_host_destroy(host);
        }
        assert_eq!(received, vec![0, 4]);
    }
}
