#![allow(unsafe_code)]

//! C-ABI narrow-bridge exports for iOS `S6-NativeIslands`
//! (Atomic SQLite `ShareExtension`, `AffinePaywall`, `Onboarding + NativeSignIn`).

use std::ffi::{CStr, CString, c_char};

use super::{
    ffi::{AffineIosByteBuffer, AffineIosHost, AffineIosWorkspace},
    native_islands::PaywallProduct,
    share_ingest::ShareIngestRequest,
};

unsafe fn c_str_opt<'a>(ptr: *const c_char) -> Option<&'a str> {
    if ptr.is_null() {
        return None;
    }
    unsafe { CStr::from_ptr(ptr) }.to_str().ok()
}

fn into_c_string(value: String) -> *mut c_char {
    CString::new(value)
        .map(CString::into_raw)
        .unwrap_or(core::ptr::null_mut())
}

/// Atomically ingest one ShareExtension item (`blobs` + `updates` + `clocks` +
/// `share_ingest_receipts`) inside a single SQLite `BEGIN IMMEDIATE ... COMMIT` transaction.
///
/// Returns a JSON-encoded `ShareIngestOutcome` (caller frees via `affine_ios_string_free`),
/// or NULL on validation/database failure.
///
/// # Safety
/// `ws` must be a live workspace handle; `request_json` must be a valid NUL-terminated UTF-8 string;
/// `blob_bytes_ptr` must be valid for `blob_bytes_len` reads when `blob_bytes_len > 0`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_ingest_share_item(
    ws: *const AffineIosWorkspace,
    request_json: *const c_char,
    blob_bytes_ptr: *const u8,
    blob_bytes_len: usize,
) -> *mut c_char {
    let (Some(ws), Some(raw_json)) = (unsafe { ws.as_ref() }, unsafe { c_str_opt(request_json) })
    else {
        return core::ptr::null_mut();
    };
    let Ok(req) = serde_json::from_str::<ShareIngestRequest>(raw_json) else {
        return core::ptr::null_mut();
    };
    let blob_bytes: &[u8] = if blob_bytes_ptr.is_null() || blob_bytes_len == 0 {
        &[]
    } else {
        // SAFETY: Caller guarantees `blob_bytes_ptr` points to `blob_bytes_len` readable bytes.
        unsafe { core::slice::from_raw_parts(blob_bytes_ptr, blob_bytes_len) }
    };
    match ws.handle.ingest_share_item(&req, blob_bytes) {
        Ok(outcome) => serde_json::to_string(&outcome)
            .map(into_c_string)
            .unwrap_or(core::ptr::null_mut()),
        Err(_) => core::ptr::null_mut(),
    }
}

/// Read a non-deleted blob from the workspace SQLite `blobs` table.
///
/// # Safety
/// `ws` must be a live workspace handle; `blob_key` must be a valid NUL-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_workspace_read_blob(
    ws: *const AffineIosWorkspace,
    blob_key: *const c_char,
) -> AffineIosByteBuffer {
    let (Some(ws), Some(key)) = (unsafe { ws.as_ref() }, unsafe { c_str_opt(blob_key) }) else {
        return AffineIosByteBuffer::empty();
    };
    ws.handle
        .read_blob(key)
        .ok()
        .flatten()
        .map(AffineIosByteBuffer::from_vec)
        .unwrap_or_else(AffineIosByteBuffer::empty)
}

/// Register StoreKit 2 products JSON array (`[{product_id, display_name, display_price}]`).
///
/// # Safety
/// `host` must be null or a live pointer; `products_json` must be null or a valid C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_paywall_set_products_json(
    host: *mut AffineIosHost,
    products_json: *const c_char,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let Some(raw) = (unsafe { c_str_opt(products_json) }) else {
        return false;
    };
    let Ok(products) = serde_json::from_str::<Vec<PaywallProduct>>(raw) else {
        return false;
    };
    host.islands.paywall.begin_load_products();
    host.islands.paywall.set_products(products).is_ok()
}

/// Transition StoreKit 2 paywall into `Purchasing` for an allowlisted `product_id`.
///
/// # Safety
/// `host` must be null or a live pointer; `product_id` must be null or a valid C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_paywall_begin_purchase(
    host: *mut AffineIosHost,
    product_id: *const c_char,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let Some(pid) = (unsafe { c_str_opt(product_id) }) else {
        return false;
    };
    host.islands.paywall.begin_purchase(pid).is_ok()
}

/// Complete a verified StoreKit 2 purchase with its `transaction_id` and compact JWS string.
///
/// # Safety
/// `host` and string pointers must be null or valid C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_paywall_complete_jws(
    host: *mut AffineIosHost,
    transaction_id: *const c_char,
    jws_representation: *const c_char,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let (Some(tx_id), Some(jws)) = (unsafe { c_str_opt(transaction_id) }, unsafe {
        c_str_opt(jws_representation)
    }) else {
        return false;
    };
    host.islands
        .paywall
        .complete_verified_transaction(tx_id, jws)
        .is_ok()
}

/// Clear all active StoreKit 2 entitlements (on expiration, refund, or revocation).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_paywall_clear_entitlements(
    host: *mut AffineIosHost,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    host.islands.paywall.clear_entitlement();
    true
}

/// Serialize current `PaywallStateMachine` as JSON (caller frees via `affine_ios_string_free`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_paywall_state_json(
    host: *const AffineIosHost,
) -> *mut c_char {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return core::ptr::null_mut();
    };
    let json = serde_json::to_string(&host.islands.paywall).unwrap_or_else(|_| "{}".to_string());
    into_c_string(json)
}

/// Begin OAuth sign-in during onboarding with an expected CSRF `state` token.
///
/// # Safety
/// `host` must be null or a live pointer; `csrf_state` must be null or a valid C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_onboarding_begin_oauth(
    host: *mut AffineIosHost,
    csrf_state: *const c_char,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let Some(state) = (unsafe { c_str_opt(csrf_state) }) else {
        return false;
    };
    host.islands.onboarding.advance_to_sign_in();
    host.islands.onboarding.begin_oauth(state).is_ok()
}

/// Complete Sign in with Apple (`ASAuthorizationAppleIDCredential`) with user ID + identity token JWS.
///
/// # Safety
/// `host` and string pointers must be null or valid C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_onboarding_complete_apple(
    host: *mut AffineIosHost,
    user_identifier: *const c_char,
    identity_token_jws: *const c_char,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let (Some(uid), Some(jws)) = (unsafe { c_str_opt(user_identifier) }, unsafe {
        c_str_opt(identity_token_jws)
    }) else {
        return false;
    };
    host.islands
        .onboarding
        .complete_apple_sign_in(uid, jws)
        .is_ok()
}

/// Complete OAuth callback (`affine://auth/callback?code=...&state=...`) with CSRF check.
///
/// # Safety
/// `host` and string pointers must be null or valid C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_onboarding_complete_oauth(
    host: *mut AffineIosHost,
    code: *const c_char,
    state: *const c_char,
) -> bool {
    let Some(host) = (unsafe { host.as_mut() }) else {
        return false;
    };
    let (Some(code), Some(state)) = (unsafe { c_str_opt(code) }, unsafe { c_str_opt(state) })
    else {
        return false;
    };
    host.islands
        .onboarding
        .complete_oauth_callback(code, state)
        .is_ok()
}

/// Serialize current `OnboardingSignInState` as JSON (caller frees via `affine_ios_string_free`).
///
/// # Safety
/// `host` must be null or a live pointer returned by `affine_ios_host_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn affine_ios_island_onboarding_state_json(
    host: *const AffineIosHost,
) -> *mut c_char {
    let Some(host) = (unsafe { host.as_ref() }) else {
        return core::ptr::null_mut();
    };
    let json = serde_json::to_string(&host.islands.onboarding).unwrap_or_else(|_| "{}".to_string());
    into_c_string(json)
}
