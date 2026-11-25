#![allow(unsafe_code)]

use std::{
    ffi::{CStr, CString, c_char, c_void},
    path::Path,
};

use super::{
    AffineUtf16Range, AffineWindowInsets, IosHostState,
    auth::{
        AuthTokenResponse, StoredAuthTokenPair, auth_error_permanently_invalidates_session,
        canonical_endpoint, resolve_installation_id,
    },
    legacy_storage::{
        ImportedLegacyState, LegacyLocalStorageSnapshot, LegacyWriteBackPlan,
        parse_legacy_snapshot, verify_write_back_readback,
    },
    workspace_store::{IosWorkspaceHandle, resolve_ios_space_db_path},
};

/// Opaque C-ABI handle matching `typedef struct AffineIosHost AffineIosHost`.
pub struct AffineIosHost {
    state: IosHostState,
    _metal_layer: *mut c_void,
}

/// Opaque C-ABI handle matching `typedef struct AffineIosWorkspace AffineIosWorkspace`.
pub struct AffineIosWorkspace {
    handle: IosWorkspaceHandle,
}

/// Owned byte buffer returned across the C ABI. Free with `affine_ios_bytes_free`.
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct AffineIosByteBuffer {
    pub ptr: *mut u8,
    pub len: usize,
}

impl AffineIosByteBuffer {
    fn empty() -> Self {
        Self {
            ptr: core::ptr::null_mut(),
            len: 0,
        }
    }

    fn from_vec(bytes: Vec<u8>) -> Self {
        if bytes.is_empty() {
            return Self::empty();
        }
        let boxed = bytes.into_boxed_slice();
        let len = boxed.len();
        let ptr = Box::into_raw(boxed) as *mut u8;
        Self { ptr, len }
    }
}

unsafe fn c_str_opt<'a>(ptr: *const c_char) -> Option<&'a str> {
    if ptr.is_null() {
        return None;
    }
    // SAFETY: Caller guarantees `ptr` is a valid NUL-terminated C string.
    unsafe { CStr::from_ptr(ptr) }.to_str().ok()
}

fn into_c_string(value: String) -> *mut c_char {
    CString::new(value)
        .map(CString::into_raw)
        .unwrap_or(core::ptr::null_mut())
}

/// # Safety
/// `ptr` must be null or returned once by an `affine_ios_*` function returning `char *`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_string_free(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    // SAFETY: Ownership transfers back to Rust exactly once.
    let _ = unsafe { CString::from_raw(ptr) };
}

/// # Safety
/// `buf` must be empty or returned once by an `affine_ios_*` function returning `AffineIosByteBuffer`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_bytes_free(buf: AffineIosByteBuffer) {
    if buf.ptr.is_null() || buf.len == 0 {
        return;
    }
    // SAFETY: `buf.ptr` and `buf.len` came from `Box::<[u8]>::into_raw`.
    let slice = core::ptr::slice_from_raw_parts_mut(buf.ptr, buf.len);
    let _ = unsafe { Box::from_raw(slice) };
}

#[unsafe(no_mangle)]
pub extern "C" fn affine_ios_host_create(
    metal_layer: *mut c_void,
    width_pt: f32,
    height_pt: f32,
    scale_factor: f32,
) -> *mut AffineIosHost {
    let host = Box::new(AffineIosHost {
        state: IosHostState::new(width_pt, height_pt, scale_factor),
        _metal_layer: metal_layer,
    });
    Box::into_raw(host)
}

/// # Safety
/// `host` must be null or a pointer returned once by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_destroy(host: *mut AffineIosHost) {
    if host.is_null() {
        return;
    }
    // SAFETY: Caller transfers ownership back to Rust exactly once.
    let _ = unsafe { Box::from_raw(host) };
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_resize(
    host: *mut AffineIosHost,
    width_pt: f32,
    height_pt: f32,
    scale_factor: f32,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    host.state.resize(width_pt, height_pt, scale_factor);
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_set_insets(
    host: *mut AffineIosHost,
    insets: AffineWindowInsets,
) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
    host.state.set_insets(insets);
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_render_frame(
    host: *mut AffineIosHost,
    frame_timestamp_sec: f64,
) -> u32 {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return 0;
    };
    host.state.render_frame(frame_timestamp_sec)
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_is_dirty(host: *const AffineIosHost) -> bool {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return false;
    };
    host.state.is_dirty()
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_request_frame(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
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
    host.state.insert_text(slice);
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_delete_backward(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
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
    host.state.set_marked_text(slice, selected_range);
}

/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_host_unmark_text(host: *mut AffineIosHost) {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return;
    };
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
    host.state.marked_range()
}

/// # Safety
/// `endpoint` must be null or a valid NUL-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_auth_canonical_endpoint(
    endpoint: *const c_char,
) -> *mut c_char {
    let Some(ep) = (unsafe { c_str_opt(endpoint) }) else {
        return core::ptr::null_mut();
    };
    into_c_string(canonical_endpoint(ep))
}

/// Parse a 0.27.5 Keychain JSON payload (2001-epoch `accessExpiresAt`) and check validity.
/// Returns normalized Keychain JSON (still 2001-epoch) or null if invalid.
///
/// # Safety
/// `json` must be a valid NUL-terminated UTF-8 string; output pointers may be null or writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_auth_parse_keychain_json(
    json: *const c_char,
    now_unix_secs: f64,
    min_validity_secs: f64,
    out_is_valid: *mut bool,
    out_access_expires_unix_secs: *mut f64,
) -> *mut c_char {
    let Some(raw) = (unsafe { c_str_opt(json) }) else {
        return core::ptr::null_mut();
    };
    let Ok(pair) = StoredAuthTokenPair::from_json(raw) else {
        return core::ptr::null_mut();
    };
    if let Some(valid_slot) = unsafe { out_is_valid.as_mut() } {
        *valid_slot = pair.is_access_token_valid(now_unix_secs, min_validity_secs);
    }
    if let Some(exp_slot) = unsafe { out_access_expires_unix_secs.as_mut() } {
        *exp_slot = pair.access_expires_at_unix_secs();
    }
    pair.to_json()
        .map(into_c_string)
        .unwrap_or(core::ptr::null_mut())
}

/// Convert a server `/api/auth/session/{exchange,refresh}` JSON response into 0.27.5-compatible
/// Keychain JSON with 2001-epoch `f64` `accessExpiresAt`.
///
/// # Safety
/// `response_json` must be null or a valid NUL-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_auth_encode_token_response_json(
    response_json: *const c_char,
    now_unix_ms: i64,
) -> *mut c_char {
    let Some(raw) = (unsafe { c_str_opt(response_json) }) else {
        return core::ptr::null_mut();
    };
    let Ok(resp) = serde_json::from_str::<AuthTokenResponse>(raw) else {
        return core::ptr::null_mut();
    };
    let Ok(pair) = StoredAuthTokenPair::from_token_response(&resp, now_unix_ms) else {
        return core::ptr::null_mut();
    };
    pair.to_json()
        .map(into_c_string)
        .unwrap_or(core::ptr::null_mut())
}

/// Reuse an existing persisted `app.affine.pro.auth-installation-id` or generate a lowercase
/// UUID v4 on fresh install.
///
/// # Safety
/// `existing` may be null or a valid NUL-terminated UTF-8 string; `out_created` may be null or writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_auth_resolve_installation_id(
    existing: *const c_char,
    out_created: *mut bool,
) -> *mut c_char {
    let existing_opt = unsafe { c_str_opt(existing) };
    let (id, created) = resolve_installation_id(existing_opt);
    if let Some(slot) = unsafe { out_created.as_mut() } {
        *slot = created;
    }
    into_c_string(id)
}

/// Return true when an auth error response JSON permanently invalidates the stored
/// Keychain session (`AuthPlugin.swift:44-52`).
///
/// # Safety
/// `error_json` may be null or a valid NUL-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_auth_error_permanently_invalidates_session(
    error_json: *const c_char,
) -> bool {
    let Some(raw) = (unsafe { c_str_opt(error_json) }) else {
        return false;
    };
    auth_error_permanently_invalidates_session(raw)
}

/// Validate a positive sentinel `LegacyLocalStorageSnapshot` JSON (requiring `capacitor://localhost`
/// and `idbAccessCount == 0`) and return the `LegacyUpgradeDisposition` JSON, or null on error.
///
/// # Safety
/// `snapshot_json` must be null or a valid NUL-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_legacy_storage_parse_snapshot_json(
    snapshot_json: *const c_char,
) -> *mut c_char {
    let Some(raw) = (unsafe { c_str_opt(snapshot_json) }) else {
        return core::ptr::null_mut();
    };
    let Ok(snapshot) = serde_json::from_str::<LegacyLocalStorageSnapshot>(raw) else {
        return core::ptr::null_mut();
    };
    let Ok(disposition) = parse_legacy_snapshot(&snapshot) else {
        return core::ptr::null_mut();
    };
    serde_json::to_string(&disposition)
        .map(into_c_string)
        .unwrap_or(core::ptr::null_mut())
}

/// Build a rollback write-back plan JSON from `ImportedLegacyState` JSON and previously seen keys.
///
/// # Safety
/// Both pointers must be null or valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_legacy_storage_plan_write_back_json(
    state_json: *const c_char,
    previous_keys_json: *const c_char,
) -> *mut c_char {
    let Some(state_raw) = (unsafe { c_str_opt(state_json) }) else {
        return core::ptr::null_mut();
    };
    let Ok(state) = serde_json::from_str::<ImportedLegacyState>(state_raw) else {
        return core::ptr::null_mut();
    };
    let prev_keys: Vec<String> = unsafe { c_str_opt(previous_keys_json) }
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let plan = state.to_write_back_plan(&prev_keys);
    serde_json::to_string(&plan)
        .map(into_c_string)
        .unwrap_or(core::ptr::null_mut())
}

/// Verify a write-back readback snapshot JSON against its plan JSON (enforcing zero IDB access).
///
/// # Safety
/// Both pointers must be null or valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_legacy_storage_verify_write_back_json(
    plan_json: *const c_char,
    readback_snapshot_json: *const c_char,
) -> bool {
    let (Some(plan_raw), Some(readback_raw)) = (unsafe { c_str_opt(plan_json) }, unsafe {
        c_str_opt(readback_snapshot_json)
    }) else {
        return false;
    };
    let (Ok(plan), Ok(readback)) = (
        serde_json::from_str::<LegacyWriteBackPlan>(plan_raw),
        serde_json::from_str::<LegacyLocalStorageSnapshot>(readback_raw),
    ) else {
        return false;
    };
    verify_write_back_readback(&plan, &readback).is_ok()
}

/// Resolve the 0.27.5-compatible in-place SQLite WAL path for a space.
///
/// # Safety
/// All pointers must be null or valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_resolve_path(
    documents_dir: *const c_char,
    space_type: *const c_char,
    peer: *const c_char,
    space_id: *const c_char,
) -> *mut c_char {
    let (Some(docs), Some(st), Some(p), Some(sid)) = (
        unsafe { c_str_opt(documents_dir) },
        unsafe { c_str_opt(space_type) },
        unsafe { c_str_opt(peer) },
        unsafe { c_str_opt(space_id) },
    ) else {
        return core::ptr::null_mut();
    };
    resolve_ios_space_db_path(Path::new(docs), st, p, sid)
        .map(|path| into_c_string(path.to_string_lossy().into_owned()))
        .unwrap_or(core::ptr::null_mut())
}

/// Open an in-place SQLite WAL workspace or userspace database.
///
/// Fail-closed: if `allowlist_json_or_null` is non-null but contains invalid UTF-8 or
/// malformed JSON, returns null immediately without touching disk.
///
/// # Safety
/// String pointers must be null or valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_open(
    documents_dir: *const c_char,
    space_type: *const c_char,
    peer: *const c_char,
    space_id: *const c_char,
    allowlist_json_or_null: *const c_char,
) -> *mut AffineIosWorkspace {
    let (Some(docs), Some(st), Some(p), Some(sid)) = (
        unsafe { c_str_opt(documents_dir) },
        unsafe { c_str_opt(space_type) },
        unsafe { c_str_opt(peer) },
        unsafe { c_str_opt(space_id) },
    ) else {
        return core::ptr::null_mut();
    };
    let allowlist: Option<Vec<String>> = if allowlist_json_or_null.is_null() {
        None
    } else {
        let Some(raw) = (unsafe { c_str_opt(allowlist_json_or_null) }) else {
            return core::ptr::null_mut();
        };
        let Ok(parsed) = serde_json::from_str::<Vec<String>>(raw) else {
            return core::ptr::null_mut();
        };
        Some(parsed)
    };
    match IosWorkspaceHandle::open(Path::new(docs), st, p, sid, allowlist.as_deref()) {
        Ok(handle) => Box::into_raw(Box::new(AffineIosWorkspace { handle })),
        Err(_) => core::ptr::null_mut(),
    }
}

/// # Safety
/// `ws` must be null or a pointer returned once by `affine_ios_workspace_open`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_close(ws: *mut AffineIosWorkspace) {
    if ws.is_null() {
        return;
    }
    // SAFETY: Ownership transfers back to Rust exactly once.
    let boxed = unsafe { Box::from_raw(ws) };
    boxed.handle.close();
}

/// # Safety
/// `ws` must be a live workspace handle; `doc_id` must be a valid NUL-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_read_doc(
    ws: *const AffineIosWorkspace,
    doc_id: *const c_char,
) -> AffineIosByteBuffer {
    let (Some(ws), Some(doc_id)) = (unsafe { ws.as_ref() }, unsafe { c_str_opt(doc_id) }) else {
        return AffineIosByteBuffer::empty();
    };
    ws.handle
        .read_doc_binary(doc_id)
        .ok()
        .flatten()
        .map(AffineIosByteBuffer::from_vec)
        .unwrap_or_else(AffineIosByteBuffer::empty)
}

/// # Safety
/// `ws` must be a live workspace handle; `doc_id` must be a valid NUL-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_read_page_snapshot_json(
    ws: *const AffineIosWorkspace,
    doc_id: *const c_char,
    client_id: u64,
) -> *mut c_char {
    let (Some(ws), Some(doc_id)) = (unsafe { ws.as_ref() }, unsafe { c_str_opt(doc_id) }) else {
        return core::ptr::null_mut();
    };
    ws.handle
        .read_page_snapshot_json(doc_id, client_id)
        .ok()
        .flatten()
        .map(into_c_string)
        .unwrap_or(core::ptr::null_mut())
}

/// # Safety
/// `ws` must be a live workspace handle; string pointers must be valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_edit_paragraph_text(
    ws: *const AffineIosWorkspace,
    doc_id: *const c_char,
    block_id: *const c_char,
    utf16_index: u64,
    delete_len: u64,
    insert_text: *const c_char,
    client_id: u64,
    now_ms: i64,
) -> AffineIosByteBuffer {
    let (Some(ws), Some(doc_id), Some(block_id)) = (
        unsafe { ws.as_ref() },
        unsafe { c_str_opt(doc_id) },
        unsafe { c_str_opt(block_id) },
    ) else {
        return AffineIosByteBuffer::empty();
    };
    let text = unsafe { c_str_opt(insert_text) }.unwrap_or("");
    ws.handle
        .edit_paragraph_text(
            doc_id,
            block_id,
            utf16_index,
            delete_len,
            text,
            client_id,
            now_ms,
        )
        .map(|res| AffineIosByteBuffer::from_vec(res.update_bytes))
        .unwrap_or_else(|_| AffineIosByteBuffer::empty())
}

/// # Safety
/// `ws` must be a live workspace handle; `remote_sv_ptr` must be valid for `remote_sv_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_export_doc_diff(
    ws: *const AffineIosWorkspace,
    doc_id: *const c_char,
    remote_sv_ptr: *const u8,
    remote_sv_len: usize,
) -> AffineIosByteBuffer {
    let (Some(ws), Some(doc_id)) = (unsafe { ws.as_ref() }, unsafe { c_str_opt(doc_id) }) else {
        return AffineIosByteBuffer::empty();
    };
    let remote_sv = if remote_sv_ptr.is_null() || remote_sv_len == 0 {
        None
    } else {
        // SAFETY: Caller guarantees `remote_sv_ptr` points to `remote_sv_len` bytes.
        Some(unsafe { core::slice::from_raw_parts(remote_sv_ptr, remote_sv_len) })
    };
    ws.handle
        .export_pending_diff(doc_id, remote_sv)
        .ok()
        .flatten()
        .map(|diff| AffineIosByteBuffer::from_vec(diff.missing))
        .unwrap_or_else(AffineIosByteBuffer::empty)
}

/// # Safety
/// `ws` must be a live workspace handle; `update_ptr` must be valid for `update_len` reads when non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_apply_remote_update(
    ws: *const AffineIosWorkspace,
    doc_id: *const c_char,
    update_ptr: *const u8,
    update_len: usize,
    peer: *const c_char,
    remote_clock_ms: i64,
    local_now_ms: i64,
) -> AffineIosByteBuffer {
    let (Some(ws), Some(doc_id), Some(peer)) = (
        unsafe { ws.as_ref() },
        unsafe { c_str_opt(doc_id) },
        unsafe { c_str_opt(peer) },
    ) else {
        return AffineIosByteBuffer::empty();
    };
    let update = if update_ptr.is_null() || update_len == 0 {
        &[]
    } else {
        // SAFETY: Caller guarantees `update_ptr` points to `update_len` bytes.
        unsafe { core::slice::from_raw_parts(update_ptr, update_len) }
    };
    ws.handle
        .apply_remote_update(doc_id, update, peer, remote_clock_ms, local_now_ms)
        .map(AffineIosByteBuffer::from_vec)
        .unwrap_or_else(|_| AffineIosByteBuffer::empty())
}

/// # Safety
/// `ws` must be null or a live pointer returned by `affine_ios_workspace_open`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_checkpoint_passive(
    ws: *const AffineIosWorkspace,
) -> bool {
    let Some(ws) = (unsafe { ws.as_ref() }) else {
        return false;
    };
    ws.handle.checkpoint_passive().is_ok()
}

/// # Safety
/// `ws` must be null or a live pointer returned by `affine_ios_workspace_open`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_checkpoint(ws: *const AffineIosWorkspace) -> bool {
    let Some(ws) = (unsafe { ws.as_ref() }) else {
        return false;
    };
    ws.handle.checkpoint().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::{
        schema::{BlockSpec, ParagraphType},
        session::PageDocSession,
    };

    unsafe fn take_c_string(ptr: *mut c_char) -> String {
        assert!(!ptr.is_null(), "expected non-null C string");
        let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        unsafe { affine_ios_string_free(ptr) };
        s
    }

    #[test]
    fn c_abi_auth_legacy_storage_and_workspace_roundtrip() {
        let ep = CString::new("https://APP.AFFINE.PRO:443/graphql").unwrap();
        let canonical = unsafe { take_c_string(affine_ios_auth_canonical_endpoint(ep.as_ptr())) };
        assert_eq!(canonical, "https://app.affine.pro");

        let mut created = false;
        let fresh_id = unsafe {
            take_c_string(affine_ios_auth_resolve_installation_id(
                core::ptr::null(),
                &mut created,
            ))
        };
        assert!(created);
        assert_eq!(fresh_id, fresh_id.to_ascii_lowercase());

        let resp_json = CString::new(
            r#"{"tokenType":"Bearer","accessToken":"tok-1","expiresIn":600,"refreshToken":"ref-1","refreshExpiresAt":"2026-12-25T00:00:00Z","session":{"id":"s-1","absoluteExpiresAt":"2027-01-25T00:00:00Z"}}"#,
        )
        .unwrap();
        let encoded_kc = unsafe {
            take_c_string(affine_ios_auth_encode_token_response_json(
                resp_json.as_ptr(),
                1_795_600_000_000,
            ))
        };
        let encoded_c = CString::new(encoded_kc).unwrap();
        let mut is_valid = false;
        let mut exp_unix = 0.0;
        let parsed_kc = unsafe {
            take_c_string(affine_ios_auth_parse_keychain_json(
                encoded_c.as_ptr(),
                1_795_600_100.0,
                120.0,
                &mut is_valid,
                &mut exp_unix,
            ))
        };
        assert!(is_valid);
        assert_eq!(exp_unix, 1_795_600_600.0);
        assert!(parsed_kc.contains("tok-1"));

        let perm_err = CString::new(r#"{"code":"REFRESH_TOKEN_REUSED"}"#).unwrap();
        assert!(unsafe {
            affine_ios_auth_error_permanently_invalidates_session(perm_err.as_ptr())
        });
        let temp_err = CString::new(r#"{"code":"INTERNAL_SERVER_ERROR"}"#).unwrap();
        assert!(!unsafe {
            affine_ios_auth_error_permanently_invalidates_session(temp_err.as_ptr())
        });

        // Legacy storage C-ABI: zero-IDB positive sentinel + write-back verification.
        let snap = CString::new(
            r#"{"origin":"capacitor://localhost","length":1,"keys":["affine-local-workspace"],"entries":{"affine-local-workspace":"[\"ws-c\"]"},"idbAccessCount":0}"#,
        )
        .unwrap();
        let disp =
            unsafe { take_c_string(affine_ios_legacy_storage_parse_snapshot_json(snap.as_ptr())) };
        assert!(disp.contains("existing_user"));

        let bad_idb = CString::new(
            r#"{"origin":"capacitor://localhost","length":0,"keys":[],"entries":{},"idbAccessCount":1}"#,
        )
        .unwrap();
        assert!(
            unsafe { affine_ios_legacy_storage_parse_snapshot_json(bad_idb.as_ptr()) }.is_null()
        );

        // Workspace C-ABI: open allowlisted DB, seed doc, edit paragraph offline, checkpoint, close.
        let temp_dir = std::env::temp_dir().join(format!(
            "affine-ios-ffi-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let docs_c = CString::new(temp_dir.to_string_lossy().as_ref()).unwrap();
        let st_c = CString::new("workspace").unwrap();
        let peer_c = CString::new("local").unwrap();
        let space_c = CString::new("ws-c").unwrap();
        let allow_c = CString::new(r#"["ws-c"]"#).unwrap();

        let bad_allow_c = CString::new("{not-json").unwrap();
        assert!(
            unsafe {
                affine_ios_workspace_open(
                    docs_c.as_ptr(),
                    st_c.as_ptr(),
                    peer_c.as_ptr(),
                    space_c.as_ptr(),
                    core::ptr::null(),
                )
            }
            .is_null()
        );
        assert!(
            unsafe {
                affine_ios_workspace_open(
                    docs_c.as_ptr(),
                    st_c.as_ptr(),
                    peer_c.as_ptr(),
                    space_c.as_ptr(),
                    bad_allow_c.as_ptr(),
                )
            }
            .is_null()
        );

        let ws = unsafe {
            affine_ios_workspace_open(
                docs_c.as_ptr(),
                st_c.as_ptr(),
                peer_c.as_ptr(),
                space_c.as_ptr(),
                allow_c.as_ptr(),
            )
        };
        assert!(!ws.is_null());

        let mut doc = PageDocSession::new("doc-c", 7).unwrap();
        doc.add_block(
            "p1",
            BlockSpec::Page {
                title: "FFI".into(),
            },
            None,
            None,
            1_000,
        )
        .unwrap();
        doc.add_block(
            "n1",
            BlockSpec::Note {
                xywh: Some("[0,0,600,400]".into()),
            },
            Some("p1"),
            None,
            1_001,
        )
        .unwrap();
        doc.add_block(
            "b1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Hi".into(),
            },
            Some("n1"),
            None,
            1_002,
        )
        .unwrap();
        let seed_bytes = doc.encode_update_v1().unwrap();
        let doc_id_c = CString::new("doc-c").unwrap();
        let block_id_c = CString::new("b1").unwrap();
        let remote_peer_c = CString::new("cloud").unwrap();
        let insert_c = CString::new("!").unwrap();

        let merged = unsafe {
            affine_ios_workspace_apply_remote_update(
                ws,
                doc_id_c.as_ptr(),
                seed_bytes.as_ptr(),
                seed_bytes.len(),
                remote_peer_c.as_ptr(),
                1_900,
                2_000,
            )
        };
        assert!(merged.len > 0);
        unsafe { affine_ios_bytes_free(merged) };

        let delta = unsafe {
            affine_ios_workspace_edit_paragraph_text(
                ws,
                doc_id_c.as_ptr(),
                block_id_c.as_ptr(),
                2,
                0,
                insert_c.as_ptr(),
                8,
                3_000,
            )
        };
        assert!(delta.len > 0);
        unsafe { affine_ios_bytes_free(delta) };

        let diff = unsafe {
            affine_ios_workspace_export_doc_diff(ws, doc_id_c.as_ptr(), core::ptr::null(), 0)
        };
        assert!(diff.len > 0);
        unsafe { affine_ios_bytes_free(diff) };

        let snapshot = unsafe {
            take_c_string(affine_ios_workspace_read_page_snapshot_json(
                ws,
                doc_id_c.as_ptr(),
                9,
            ))
        };
        assert!(snapshot.contains("Hi!"), "snapshot={snapshot}");
        assert!(unsafe { affine_ios_workspace_checkpoint_passive(ws) });
        assert!(unsafe { affine_ios_workspace_checkpoint(ws) });
        unsafe { affine_ios_workspace_close(ws) };
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
