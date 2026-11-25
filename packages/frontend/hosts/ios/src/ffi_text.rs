#![allow(unsafe_code)]

use std::ffi::c_void;

use super::{
    AffineUtf16Range, AffineWindowInsets,
    ffi::{AffineIosByteBuffer, AffineIosHost},
    selection::{AffinePoint, AffineRect, AffineWritingDirection},
    text_layout::{
        AffineSelectionRect, caret_rect_for_offset, closest_offset_for_point, render_loupe_rgba8,
        selection_rects_for_range,
    },
};

/// C-ABI callback computing the shaped visual caret rect via native CoreText `CTLine`.
pub type AffineTextCaretRectFn =
    extern "C" fn(*const u16, usize, u32, f32, AffineWindowInsets, *mut c_void) -> AffineRect;

/// C-ABI callback hit-testing the closest grapheme-aligned UTF-16 offset via native CoreText,
/// disambiguating BiDi direction boundaries using `preferred_offset` (`u32::MAX` = none).
pub type AffineTextClosestOffsetFn =
    extern "C" fn(*const u16, usize, AffinePoint, u32, f32, AffineWindowInsets, *mut c_void) -> u32;

/// C-ABI callback computing BiDi-aware per-line selection rects via native CoreText `CTLine`.
pub type AffineTextSelectionRectsFn = extern "C" fn(
    *const u16,
    usize,
    AffineUtf16Range,
    f32,
    AffineWindowInsets,
    *mut AffineSelectionRect,
    usize,
    *mut c_void,
) -> usize;

/// C-ABI callback computing affinity-aware start/end caret rects for a selection range.
pub type AffineTextSelectionEndpointCaretsFn = extern "C" fn(
    *const u16,
    usize,
    AffineUtf16Range,
    f32,
    AffineWindowInsets,
    *mut AffineRect,
    *mut AffineRect,
    *mut c_void,
) -> bool;

/// C-ABI callback rasterizing the magnifier loupe via whole-line CoreText `CTLineDraw`.
pub type AffineTextRenderLoupeRgba8Fn = extern "C" fn(
    *const u16,
    usize,
    AffineUtf16Range,
    f32,
    AffineWindowInsets,
    f32,
    f32,
    u32,
    f32,
    *mut u8,
    usize,
    *mut c_void,
) -> bool;

/// Native CoreText `CTTypesetter`/`CTLine` text geometry and vector loupe provider.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AffineTextProvider {
    pub caret_rect: Option<AffineTextCaretRectFn>,
    pub closest_offset: Option<AffineTextClosestOffsetFn>,
    pub selection_rects: Option<AffineTextSelectionRectsFn>,
    pub selection_endpoint_carets: Option<AffineTextSelectionEndpointCaretsFn>,
    pub render_loupe_rgba8: Option<AffineTextRenderLoupeRgba8Fn>,
    pub user_data: *mut c_void,
}

/// Register the native CoreText `CTTypesetter`/`CTLine` provider on `host`.
///
/// # Safety
/// `host` must be null or a live pointer; callbacks and `user_data` must outlive registration.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_text_provider(
    host: *mut AffineIosHost,
    provider: AffineTextProvider,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if provider.caret_rect.is_none()
        && provider.closest_offset.is_none()
        && provider.selection_rects.is_none()
        && provider.selection_endpoint_carets.is_none()
        && provider.render_loupe_rgba8.is_none()
    {
        host.text_provider = None;
    } else {
        host.text_provider = Some(provider);
    }
}

/// Query detected base writing direction of the host text buffer (`0 = LTR, 1 = RTL`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_text_writing_direction(host: *const AffineIosHost) -> u8 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineWritingDirection::Ltr as u8;
    };
    host.state.text_writing_direction() as u8
}

/// Compute visual caret rect for `utf16_offset` via CoreText `CTLine` (or headless fallback).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_text_caret_rect(
    host: *const AffineIosHost,
    utf16_offset: u32,
) -> AffineRect {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineRect::default();
    };
    let (vw, _) = host.state.viewport_size_pt();
    let insets = host.state.insets();
    let utf16 = host.state.utf16_text();
    if let Some(p) = host.text_provider
        && let Some(f) = p.caret_rect
    {
        return f(
            utf16.as_ptr(),
            utf16.len(),
            utf16_offset,
            vw,
            insets,
            p.user_data,
        );
    }
    caret_rect_for_offset(utf16, utf16_offset, vw, insets)
}

/// Compute BiDi-aware per-line selection rectangles across soft-wrapped visual lines.
/// Returns total rectangle count; writes up to `capacity` items into `out_rects` when non-null.
///
/// # Safety
/// `host` must be null or a live pointer; `out_rects` must be valid for `capacity` writes when non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_text_selection_rects(
    host: *const AffineIosHost,
    range: AffineUtf16Range,
    out_rects: *mut AffineSelectionRect,
    capacity: usize,
) -> usize {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    let (vw, _) = host.state.viewport_size_pt();
    let insets = host.state.insets();
    let utf16 = host.state.utf16_text();
    if let Some(p) = host.text_provider
        && let Some(f) = p.selection_rects
    {
        return f(
            utf16.as_ptr(),
            utf16.len(),
            range,
            vw,
            insets,
            out_rects,
            capacity,
            p.user_data,
        );
    }
    let rects = selection_rects_for_range(utf16, range, vw, insets);
    if !out_rects.is_null() && capacity > 0 {
        let count = rects.len().min(capacity);
        // SAFETY: Caller guarantees `out_rects` points to `capacity` writable elements.
        unsafe {
            core::ptr::copy_nonoverlapping(rects.as_ptr(), out_rects, count);
        }
    }
    rects.len()
}

/// Compute affinity-aware start and end caret rects for `range` so handles align with
/// the visual leading/trailing edges of the first/last selected glyphs across BiDi boundaries.
///
/// # Safety
/// `host`, `out_start`, and `out_end` must be valid pointers (or null for safe no-op).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_text_selection_endpoint_carets(
    host: *const AffineIosHost,
    range: AffineUtf16Range,
    out_start: *mut AffineRect,
    out_end: *mut AffineRect,
) -> bool {
    let (Some(host), Some(start_slot), Some(end_slot)) = (
        unsafe { host.as_ref() },
        unsafe { out_start.as_mut() },
        unsafe { out_end.as_mut() },
    ) else {
        return false;
    };
    let (vw, _) = host.state.viewport_size_pt();
    let insets = host.state.insets();
    let utf16 = host.state.utf16_text();
    if let Some(p) = host.text_provider
        && let Some(f) = p.selection_endpoint_carets
        && f(
            utf16.as_ptr(),
            utf16.len(),
            range,
            vw,
            insets,
            start_slot,
            end_slot,
            p.user_data,
        )
    {
        return true;
    }
    *start_slot = caret_rect_for_offset(utf16, range.location, vw, insets);
    *end_slot = caret_rect_for_offset(
        utf16,
        range.location.saturating_add(range.length),
        vw,
        insets,
    );
    true
}

/// Hit-test closest grapheme-safe UTF-16 offset for `point` in host coordinates.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_text_closest_offset(
    host: *const AffineIosHost,
    point: AffinePoint,
) -> u32 {
    unsafe { affine_ios_host_text_closest_offset_preferred(host, point, u32::MAX) }
}

/// Hit-test closest grapheme-safe UTF-16 offset for `point`, preferring `preferred_offset`
/// (`u32::MAX` = none) when `point` sits on a BiDi direction boundary shared by two offsets.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_text_closest_offset_preferred(
    host: *const AffineIosHost,
    point: AffinePoint,
    preferred_offset: u32,
) -> u32 {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    let (vw, _) = host.state.viewport_size_pt();
    let insets = host.state.insets();
    let utf16 = host.state.utf16_text();
    if let Some(p) = host.text_provider
        && let Some(f) = p.closest_offset
    {
        return f(
            utf16.as_ptr(),
            utf16.len(),
            point,
            preferred_offset,
            vw,
            insets,
            p.user_data,
        );
    }
    closest_offset_for_point(utf16, point, vw, insets)
}

/// Rasterize the magnifier loupe around `(focus_x, focus_y)` as RGBA8 via whole-line `CTLineDraw`
/// (or software fallback in headless environments). Free with `affine_ios_bytes_free`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_render_loupe_rgba8(
    host: *const AffineIosHost,
    focus_x: f32,
    focus_y: f32,
    diameter_px: u32,
    zoom_scale: f32,
) -> AffineIosByteBuffer {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineIosByteBuffer::empty();
    };
    let dim = diameter_px.clamp(16, 512) as usize;
    let zoom = if zoom_scale.is_finite() && zoom_scale > 0.25 {
        zoom_scale.min(12.0)
    } else {
        1.75
    };
    let (vw, _) = host.state.viewport_size_pt();
    let insets = host.state.insets();
    let utf16 = host.state.utf16_text();
    let selected = host.state.selected_range();

    if let Some(p) = host.text_provider
        && let Some(render_fn) = p.render_loupe_rgba8
    {
        let mut rgba = vec![0u8; dim * dim * 4];
        let ok = render_fn(
            utf16.as_ptr(),
            utf16.len(),
            selected,
            vw,
            insets,
            focus_x,
            focus_y,
            dim as u32,
            zoom,
            rgba.as_mut_ptr(),
            rgba.len(),
            p.user_data,
        );
        if ok {
            return AffineIosByteBuffer::from_vec(rgba);
        }
    }

    let rgba = render_loupe_rgba8(
        utf16, selected, vw, insets, focus_x, focus_y, dim as u32, zoom,
    );
    AffineIosByteBuffer::from_vec(rgba)
}
