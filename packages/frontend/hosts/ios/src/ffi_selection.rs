#![allow(unsafe_code)]

//! C-ABI exports for document-level selection geometry, cross-block handle drag,
//! live drag preview, authoritative selection actions, keyboard-focus restoration,
//! and multi-MIME `UIPasteboard` bridging.

use std::ffi::CString;

use super::{
    clipboard::AffineClipboardProvider, editor_runtime::IosEditorRuntime, ffi::AffineIosHost,
    ffi_editor::flush_text_input_changes, selection::AffineRect,
};

/// C-ABI document-level selection geometry and capabilities snapshot.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct AffineDocumentSelectionSnapshot {
    pub has_selection: bool,
    pub is_collapsed: bool,
    pub is_reversed: bool,
    pub start_is_rtl: bool,
    pub end_is_rtl: bool,
    pub start_visible: bool,
    pub end_visible: bool,
    pub menu_anchor_visible: bool,
    pub menu_suppressed_for_motion: bool,
    pub start_caret: AffineRect,
    pub end_caret: AffineRect,
    pub menu_anchor_rect: AffineRect,
    pub action_mask: u32,
    pub menu_request_seq: u64,
    pub rect_count: usize,
}

/// C-ABI per-line/per-block document selection rect with writing direction.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct AffineDocumentSelectionRect {
    pub rect: AffineRect,
    pub is_rtl: bool,
    pub contains_start: bool,
    pub contains_end: bool,
}

fn to_affine_rect(r: playground::SelectionRectGeometry) -> AffineRect {
    AffineRect {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    }
}

/// Register the Swift `UIPasteboard.general` multi-MIME clipboard provider on `host`.
///
/// # Safety
/// `host` must be null or a live pointer; callbacks and `user_data` must outlive registration.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_clipboard_provider(
    host: *mut AffineIosHost,
    provider: AffineClipboardProvider,
) {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return;
    };
    let opt = if provider.write_json.is_none() && provider.read_json.is_none() {
        None
    } else {
        Some(provider)
    };
    if let Some(editor) = host.editor.borrow().as_ref() {
        editor.set_clipboard_provider(opt);
    }
}

/// Toggle Page-mode read-only gating on the mounted editor.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_page_readonly(
    host: *mut AffineIosHost,
    readonly: bool,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.set_page_readonly(readonly);
    }
}

/// Returns `true` when the active editor surface is read-only (Page readonly or Edgeless readonly).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_is_surface_readonly(host: *const AffineIosHost) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return true;
    };
    host.editor
        .borrow()
        .as_ref()
        .map_or(true, IosEditorRuntime::is_surface_readonly)
}

/// Re-enable software keyboard requests before `becomeFirstResponder` on an editable focus.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_restore_software_keyboard(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.restore_software_keyboard();
    }
}

/// Query document-level selection geometry, visibility, action mask, and menu request seq.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_document_selection_snapshot(
    host: *const AffineIosHost,
) -> AffineDocumentSelectionSnapshot {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return AffineDocumentSelectionSnapshot::default();
    };
    let Some(geom) = host
        .editor
        .borrow_mut()
        .as_mut()
        .map(IosEditorRuntime::document_selection_geometry)
    else {
        return AffineDocumentSelectionSnapshot::default();
    };
    AffineDocumentSelectionSnapshot {
        has_selection: geom.has_selection,
        is_collapsed: geom.is_collapsed,
        is_reversed: geom.is_reversed,
        start_is_rtl: geom.start_caret.is_rtl,
        end_is_rtl: geom.end_caret.is_rtl,
        start_visible: geom.start_visible,
        end_visible: geom.end_visible,
        menu_anchor_visible: geom.menu_anchor_visible,
        menu_suppressed_for_motion: geom.menu_suppressed_for_motion,
        start_caret: to_affine_rect(geom.start_caret),
        end_caret: to_affine_rect(geom.end_caret),
        menu_anchor_rect: to_affine_rect(geom.menu_anchor_rect),
        action_mask: geom.action_mask,
        menu_request_seq: geom.menu_request_seq,
        rect_count: geom.selection_rects.len(),
    }
}

/// Intern and return `(start_token, end_token)` for the current ordered non-collapsed selection.
///
/// # Safety
/// `host` must be null or a live pointer; `out_start` and `out_end` may be null or writable pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_endpoint_tokens(
    host: *const AffineIosHost,
    out_start: *mut u64,
    out_end: *mut u64,
) {
    let (mut s, mut e) = (0u64, 0u64);
    if let Some(host) = unsafe { host.as_ref() }
        && let Some(editor) = host.editor.borrow_mut().as_mut()
    {
        (s, e) = editor.current_selection_endpoint_tokens();
    }
    if !out_start.is_null() {
        unsafe { *out_start = s };
    }
    if !out_end.is_null() {
        unsafe { *out_end = e };
    }
}

/// Copy per-line/per-block document selection rects into `out_rects` (up to `capacity`).
///
/// # Safety
/// `host` must be null or a live pointer; `out_rects` must be valid for `capacity` writes when non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_document_selection_rects(
    host: *const AffineIosHost,
    out_rects: *mut AffineDocumentSelectionRect,
    capacity: usize,
) -> usize {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    let Some(geom) = host
        .editor
        .borrow_mut()
        .as_mut()
        .map(IosEditorRuntime::document_selection_geometry)
    else {
        return 0;
    };
    let mapped: Vec<AffineDocumentSelectionRect> = geom
        .selection_rects
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

/// Preview document selection rects from `fixed_endpoint_token` to viewport `(fx, fy)` without mutating selection.
///
/// # Safety
/// `host` must be null or a live pointer; `out_rects` must be valid for `capacity` writes when non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_preview_rects(
    host: *const AffineIosHost,
    fixed_endpoint_token: u64,
    fx: f32,
    fy: f32,
    out_rects: *mut AffineDocumentSelectionRect,
    capacity: usize,
) -> usize {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return 0;
    };
    let mut editor_ref = host.editor.borrow_mut();
    let Some(editor) = editor_ref.as_mut() else {
        return 0;
    };
    let Some(fixed) = editor.lookup_endpoint_token(fixed_endpoint_token) else {
        return 0;
    };
    let view = editor.view;
    let raw = editor
        .app
        .update(|cx| {
            view.update(cx, |v, w, _| {
                v.preview_selection_rects_for_drag(fixed, fx, fy, w)
            })
        })
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

/// Query document-level caret rect at viewport point `(x, y)`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_caret_rect_at_point(
    host: *const AffineIosHost,
    x: f32,
    y: f32,
    out_rect: *mut AffineRect,
) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    let mut editor_ref = host.editor.borrow_mut();
    let Some(editor) = editor_ref.as_mut() else {
        return false;
    };
    let view = editor.view;
    let Some(r) = editor
        .app
        .update(|cx| view.update(cx, |v, w, _| v.caret_rect_at_viewport_point(x, y, w)))
        .ok()
        .flatten()
    else {
        return false;
    };
    if !out_rect.is_null() {
        unsafe { *out_rect = to_affine_rect(r) };
    }
    true
}

/// Return newly allocated UTF-8 C string of the active single-block or cross-block selected text
/// (caller frees via `affine_ios_string_free`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selected_plain_text(
    host: *const AffineIosHost,
) -> *mut core::ffi::c_char {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return core::ptr::null_mut();
    };
    let mut editor_ref = host.editor.borrow_mut();
    let Some(editor) = editor_ref.as_mut() else {
        return core::ptr::null_mut();
    };
    let view = editor.view;
    let s = editor
        .app
        .update(|cx| view.read_with(cx, |v, _| v.selected_plain_text()))
        .unwrap_or_default();
    CString::new(s)
        .map(CString::into_raw)
        .unwrap_or(core::ptr::null_mut())
}

/// Returns `true` when an iOS touch starting at `(x, y)` hits chrome, overlays, Edgeless, or
/// non-text interactive widgets and should bypass `UITextInteraction` tap buffering.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_should_forward_touch_immediately(
    host: *const AffineIosHost,
    x: f32,
    y: f32,
) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    let mut editor_ref = host.editor.borrow_mut();
    let Some(editor) = editor_ref.as_mut() else {
        return false;
    };
    let view = editor.view;
    editor
        .app
        .update(|cx| {
            view.update(cx, |v, w, _| {
                v.should_forward_ios_touch_immediately(x, y, w)
            })
        })
        .unwrap_or(false)
}

/// Select the word at `(x, y)` and bump `menu_request_seq` (used on read-only stationary long-press).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_select_word_at_point(
    host: *mut AffineIosHost,
    x: f32,
    y: f32,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let ok = if let Some(editor) = host.editor.borrow_mut().as_mut() {
        let view = editor.view;
        let selected = editor
            .app
            .update(|cx| view.update(cx, |v, w, cx| v.select_word_at_viewport_point(x, y, w, cx)))
            .unwrap_or(false);
        if selected {
            editor.window.request_frame_now();
        }
        selected
    } else {
        false
    };
    if ok {
        flush_text_input_changes(host);
        host.state.request_frame();
    }
    ok
}

/// Increment `selection_menu_request_seq` when UIKit finishes a selection gesture.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_bump_selection_menu_request_seq(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        let view = editor.view;
        let _ = editor.app.update(|cx| {
            let _ = view.update(cx, |v, w, _| {
                if v.document_selection_geometry(w).action_mask != 0 {
                    v.bump_selection_menu_request_seq();
                }
            });
        });
    }
    host.state.request_frame();
}

/// Begin dragging a document-level selection handle (`1 = Start`, `2 = End`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_begin_drag(
    host: *mut AffineIosHost,
    handle: u8,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    host.editor
        .borrow_mut()
        .as_mut()
        .is_some_and(|e| e.begin_document_selection_drag(handle))
}

/// Update an active document-level selection handle drag to viewport point `(x, y)`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_update_drag(
    host: *mut AffineIosHost,
    x: f32,
    y: f32,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let ok = host
        .editor
        .borrow_mut()
        .as_mut()
        .is_some_and(|e| e.update_document_selection_drag(x, y));
    if ok {
        flush_text_input_changes(host);
        host.state.request_frame();
    }
    ok
}

/// Finish an active document-level selection handle drag.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_end_drag(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.end_document_selection_drag();
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// Update document-level selection from an interned endpoint token to viewport point `(fx, fy)`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_select_from_endpoint_token(
    host: *mut AffineIosHost,
    fixed_endpoint_token: u64,
    fx: f32,
    fy: f32,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let ok = host
        .editor
        .borrow_mut()
        .as_mut()
        .is_some_and(|e| e.select_from_endpoint_token(fixed_endpoint_token, fx, fy));
    if ok {
        flush_text_input_changes(host);
        host.state.request_frame();
    }
    ok
}

/// Update document-level selection directly between two viewport points `(ax, ay)` and `(fx, fy)`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_select_between_points(
    host: *mut AffineIosHost,
    ax: f32,
    ay: f32,
    fx: f32,
    fy: f32,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let ok = host
        .editor
        .borrow_mut()
        .as_mut()
        .is_some_and(|e| e.select_between_viewport_points(ax, ay, fx, fy));
    if ok {
        flush_text_input_changes(host);
        host.state.request_frame();
    }
    ok
}

/// Update document-level selection directly between two interned endpoint tokens.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_doc_selection_select_between_endpoint_tokens(
    host: *mut AffineIosHost,
    start_endpoint_token: u64,
    end_endpoint_token: u64,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let ok = host.editor.borrow_mut().as_mut().is_some_and(|e| {
        e.select_between_endpoint_tokens(start_endpoint_token, end_endpoint_token)
    });
    if ok {
        flush_text_input_changes(host);
        host.state.request_frame();
    }
    ok
}

/// Execute editor-authoritative `Copy` (writes rich multi-MIME slice to `UIPasteboard`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_action_copy(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.selection_copy();
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// Execute editor-authoritative `Cut` (blocked in read-only modes).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_action_cut(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.selection_cut();
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// Execute editor-authoritative `Paste` (reads multi-MIME `UIPasteboard`, blocked in read-only modes).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_action_paste(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.selection_paste();
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}

/// Execute editor-authoritative `Select All`.
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_selection_action_select_all(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    if let Some(editor) = host.editor.borrow_mut().as_mut() {
        editor.selection_select_all();
    }
    flush_text_input_changes(host);
    host.state.request_frame();
}
