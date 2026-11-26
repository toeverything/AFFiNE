#![allow(unsafe_code)]

//! Thin JNI exports for Android in-place SQLite WAL co-storage, Jetpack
//! Preferences DataStore (`auth-sessions`), and legacy `https://localhost`
//! `localStorage` import / rollback write-back verification.

use std::collections::BTreeMap;
use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

use crate::datastore::{
    AuthSessionRecord, V1EncryptedEnvelope, auth_datastore_path, auth_token_key,
    canonical_endpoint, delete_file_key, get_or_create_file_string, is_permanent_auth_error_code,
    keystore_alias, read_file_string, update_file_string,
};
use crate::jni_bridge::{
    JBoolean, JClass, JInt, JLong, JString, JniEnvPtr, new_jstring, read_jstring_utf8,
    with_host_mut, with_host_ref,
};
use crate::{
    filter_legacy_local_storage_probe_json, is_allowed_legacy_local_storage_key,
    verify_legacy_writeback_result,
};

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `key` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeIsAllowedLegacyLocalStorageKey(
    env: JniEnvPtr,
    _class: JClass,
    key: JString,
) -> JBoolean {
    let Some(raw) = (unsafe { read_jstring_utf8(env, key) }) else {
        return 0;
    };
    u8::from(is_allowed_legacy_local_storage_key(&raw))
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `raw_json` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeFilterLegacyLocalStorageProbe(
    env: JniEnvPtr,
    _class: JClass,
    raw_json: JString,
) -> JString {
    let Some(raw) = (unsafe { read_jstring_utf8(env, raw_json) }) else {
        return core::ptr::null_mut();
    };
    match filter_legacy_local_storage_probe_json(&raw) {
        Some(filtered) => unsafe { new_jstring(env, &filtered) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeImportLegacyLocalStorageProbe(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    payload_json: JString,
    allowed_keys_csv: JString,
) -> JBoolean {
    let Some(payload) = (unsafe { read_jstring_utf8(env, payload_json) }) else {
        return 0;
    };
    let custom_keys_owned = unsafe { read_jstring_utf8(env, allowed_keys_csv) };
    let custom_keys: Vec<&str> = custom_keys_owned
        .as_deref()
        .map(|csv| {
            csv.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    with_host_mut(handle, |host| {
        u8::from(
            host.import_legacy_local_storage_probe(&payload, &custom_keys)
                .is_ok(),
        )
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeCanCreateDefaultWorkspace(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    with_host_ref(handle, |host| {
        u8::from(host.upgrade_import.can_create_default_workspace())
    })
    .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetAllowlistedWorkspaceIdsJson(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let json = with_host_ref(handle, |host| {
        serde_json::to_string(host.workspace_catalog.ids()).unwrap_or_else(|_| "[]".to_string())
    })
    .unwrap_or_else(|| "[]".to_string());
    unsafe { new_jstring(env, &json) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetPreservedLocalWorkspaceRaw(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let raw = with_host_ref(handle, |host| {
        host.preserved_local_workspace_raw().map(str::to_string)
    })
    .flatten();
    match raw {
        Some(value) => unsafe { new_jstring(env, &value) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeVerifyLegacyWriteBack(
    env: JniEnvPtr,
    _class: JClass,
    expected_set_json: JString,
    expected_remove_json: JString,
    readback_json: JString,
) -> JBoolean {
    let Some(expected_set_raw) = (unsafe { read_jstring_utf8(env, expected_set_json) }) else {
        return 0;
    };
    let expected_remove_raw =
        unsafe { read_jstring_utf8(env, expected_remove_json) }.unwrap_or_else(|| "[]".to_string());
    let Some(readback_raw) = (unsafe { read_jstring_utf8(env, readback_json) }) else {
        return 0;
    };
    let Ok(expected_set) = serde_json::from_str::<BTreeMap<String, String>>(&expected_set_raw)
    else {
        return 0;
    };
    let Ok(expected_remove) = serde_json::from_str::<Vec<String>>(&expected_remove_raw) else {
        return 0;
    };
    u8::from(verify_legacy_writeback_result(&expected_set, &expected_remove, &readback_raw).is_ok())
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeConnectWorkspace(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    files_dir: JString,
    peer: JString,
    space_id: JString,
) -> JString {
    let (Some(dir), Some(peer_s), Some(space_s)) = (
        unsafe { read_jstring_utf8(env, files_dir) },
        unsafe { read_jstring_utf8(env, peer) },
        unsafe { read_jstring_utf8(env, space_id) },
    ) else {
        return core::ptr::null_mut();
    };
    let connected = with_host_mut(handle, |host| {
        let local_ready = host.is_local_workspace_import_ready();
        let catalog = host.workspace_catalog.clone();
        let res = host.sqlite.connect_workspace(
            Path::new(&dir),
            &peer_s,
            &space_s,
            &catalog,
            local_ready,
        );
        if peer_s == "local" {
            host.record_local_workspace_mount_outcome(&space_s, res.is_ok());
        }
        res.ok()
    })
    .flatten();
    match connected {
        Some(key) => unsafe { new_jstring(env, &key) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOpenUserspace(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    files_dir: JString,
    peer: JString,
    user_id: JString,
) -> JString {
    let (Some(dir), Some(peer_s), Some(user_s)) = (
        unsafe { read_jstring_utf8(env, files_dir) },
        unsafe { read_jstring_utf8(env, peer) },
        unsafe { read_jstring_utf8(env, user_id) },
    ) else {
        return core::ptr::null_mut();
    };
    let connected = with_host_mut(handle, |host| {
        host.sqlite
            .open_userspace(Path::new(&dir), &peer_s, &user_s)
            .ok()
    })
    .flatten();
    match connected {
        Some(key) => unsafe { new_jstring(env, &key) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeStoragePushUpdateB64(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    connection_key: JString,
    doc_id: JString,
    update_b64: JString,
    now_ms: JLong,
) -> JLong {
    let (Some(key), Some(doc), Some(b64)) = (
        unsafe { read_jstring_utf8(env, connection_key) },
        unsafe { read_jstring_utf8(env, doc_id) },
        unsafe { read_jstring_utf8(env, update_b64) },
    ) else {
        return -1;
    };
    let Ok(bytes) = STANDARD.decode(b64) else {
        return -1;
    };
    with_host_mut(handle, |host| {
        host.sqlite
            .push_update(&key, &doc, &bytes, now_ms)
            .unwrap_or(-1)
    })
    .unwrap_or(-1)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeStorageGetDocB64(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    connection_key: JString,
    doc_id: JString,
) -> JString {
    let (Some(key), Some(doc)) = (unsafe { read_jstring_utf8(env, connection_key) }, unsafe {
        read_jstring_utf8(env, doc_id)
    }) else {
        return core::ptr::null_mut();
    };
    let data = with_host_mut(handle, |host| {
        host.sqlite.get_doc(&key, &doc).ok().flatten()
    })
    .flatten();
    match data {
        Some(bin) => unsafe { new_jstring(env, &STANDARD.encode(bin)) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeStorageCheckpoint(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    connection_key: JString,
) -> JBoolean {
    let Some(key) = (unsafe { read_jstring_utf8(env, connection_key) }) else {
        return 0;
    };
    with_host_mut(handle, |host| {
        u8::from(host.sqlite.checkpoint(&key).is_ok())
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeStorageCheckpointAllPassive(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_mut(handle, |host| {
        host.sqlite.checkpoint_all_passive().min(i32::MAX as usize) as JInt
    })
    .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeStorageClose(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    connection_key: JString,
) -> JBoolean {
    let Some(key) = (unsafe { read_jstring_utf8(env, connection_key) }) else {
        return 0;
    };
    with_host_mut(handle, |host| u8::from(host.sqlite.close(&key))).unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `endpoint` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeCanonicalEndpoint(
    env: JniEnvPtr,
    _class: JClass,
    endpoint: JString,
) -> JString {
    let Some(raw) = (unsafe { read_jstring_utf8(env, endpoint) }) else {
        return core::ptr::null_mut();
    };
    unsafe { new_jstring(env, &canonical_endpoint(&raw)) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `endpoint` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeAuthTokenKey(
    env: JniEnvPtr,
    _class: JClass,
    endpoint: JString,
) -> JString {
    let Some(raw) = (unsafe { read_jstring_utf8(env, endpoint) }) else {
        return core::ptr::null_mut();
    };
    unsafe { new_jstring(env, &auth_token_key(&raw)) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `endpoint` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeKeystoreAlias(
    env: JniEnvPtr,
    _class: JClass,
    endpoint: JString,
) -> JString {
    let Some(raw) = (unsafe { read_jstring_utf8(env, endpoint) }) else {
        return core::ptr::null_mut();
    };
    unsafe { new_jstring(env, &keystore_alias(&raw)) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
///
/// Returns tagged status distinguishing missing keys from read/decode errors:
/// - `"OK:<value>"` when key exists
/// - `"MISSING"` when file or key does not exist
/// - `"ERROR:<reason>"` when file exists but I/O or protobuf decoding failed
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDataStoreReadResult(
    env: JniEnvPtr,
    _class: JClass,
    files_dir: JString,
    key: JString,
) -> JString {
    let (Some(dir), Some(k)) = (unsafe { read_jstring_utf8(env, files_dir) }, unsafe {
        read_jstring_utf8(env, key)
    }) else {
        return unsafe { new_jstring(env, "ERROR:null jni argument") };
    };
    let path = auth_datastore_path(Path::new(&dir));
    let tagged = match read_file_string(&path, &k) {
        Ok(Some(val)) => format!("OK:{val}"),
        Ok(None) => "MISSING".to_string(),
        Err(err) => format!("ERROR:{err}"),
    };
    unsafe { new_jstring(env, &tagged) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDataStoreGetString(
    env: JniEnvPtr,
    _class: JClass,
    files_dir: JString,
    key: JString,
) -> JString {
    let (Some(dir), Some(k)) = (unsafe { read_jstring_utf8(env, files_dir) }, unsafe {
        read_jstring_utf8(env, key)
    }) else {
        return core::ptr::null_mut();
    };
    let path = auth_datastore_path(Path::new(&dir));
    match read_file_string(&path, &k) {
        Ok(Some(val)) => unsafe { new_jstring(env, &val) },
        _ => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDataStoreSetString(
    env: JniEnvPtr,
    _class: JClass,
    files_dir: JString,
    key: JString,
    value: JString,
) -> JBoolean {
    let (Some(dir), Some(k), Some(v)) = (
        unsafe { read_jstring_utf8(env, files_dir) },
        unsafe { read_jstring_utf8(env, key) },
        unsafe { read_jstring_utf8(env, value) },
    ) else {
        return 0;
    };
    let path = auth_datastore_path(Path::new(&dir));
    u8::from(update_file_string(&path, &k, &v).is_ok())
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDataStoreDeleteKey(
    env: JniEnvPtr,
    _class: JClass,
    files_dir: JString,
    key: JString,
) -> JBoolean {
    let (Some(dir), Some(k)) = (unsafe { read_jstring_utf8(env, files_dir) }, unsafe {
        read_jstring_utf8(env, key)
    }) else {
        return 0;
    };
    let path = auth_datastore_path(Path::new(&dir));
    u8::from(delete_file_key(&path, &k).is_ok())
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `response_json` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativePrepareAuthSessionJson(
    env: JniEnvPtr,
    _class: JClass,
    response_json: JString,
    now_ms: JLong,
) -> JString {
    let Some(raw) = (unsafe { read_jstring_utf8(env, response_json) }) else {
        return core::ptr::null_mut();
    };
    let Ok(record) = AuthSessionRecord::from_server_response(&raw, now_ms) else {
        return core::ptr::null_mut();
    };
    let Ok(stored) = record.to_stored_json() else {
        return core::ptr::null_mut();
    };
    unsafe { new_jstring(env, &stored) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `stored_json` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeValidateAuthSessionJson(
    env: JniEnvPtr,
    _class: JClass,
    stored_json: JString,
) -> JBoolean {
    let Some(raw) = (unsafe { read_jstring_utf8(env, stored_json) }) else {
        return 0;
    };
    u8::from(AuthSessionRecord::from_stored_json(&raw).is_ok())
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `encoded` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeValidateV1Ciphertext(
    env: JniEnvPtr,
    _class: JClass,
    encoded: JString,
) -> JBoolean {
    let Some(raw) = (unsafe { read_jstring_utf8(env, encoded) }) else {
        return 0;
    };
    u8::from(V1EncryptedEnvelope::parse(&raw).is_ok())
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
///
/// Atomically reads a non-empty string preference or persists `candidate_value`
/// inside a single per-file lock critical section.
/// Returns `"OK:<persisted>"` or `"ERROR:<reason>"`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDataStoreGetOrCreateString(
    env: JniEnvPtr,
    _class: JClass,
    files_dir: JString,
    key: JString,
    candidate_value: JString,
) -> JString {
    let (Some(dir), Some(k), Some(candidate)) = (
        unsafe { read_jstring_utf8(env, files_dir) },
        unsafe { read_jstring_utf8(env, key) },
        unsafe { read_jstring_utf8(env, candidate_value) },
    ) else {
        return unsafe { new_jstring(env, "ERROR:null jni argument") };
    };
    let path = auth_datastore_path(Path::new(&dir));
    let tagged = match get_or_create_file_string(&path, &k, &candidate) {
        Ok(persisted) => format!("OK:{persisted}"),
        Err(err) => format!("ERROR:{err}"),
    };
    unsafe { new_jstring(env, &tagged) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeExtractJsonStringField(
    env: JniEnvPtr,
    _class: JClass,
    json: JString,
    field: JString,
) -> JString {
    let (Some(raw), Some(key)) = (unsafe { read_jstring_utf8(env, json) }, unsafe {
        read_jstring_utf8(env, field)
    }) else {
        return core::ptr::null_mut();
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return core::ptr::null_mut();
    };
    match val.get(&key).and_then(serde_json::Value::as_str) {
        Some(text) => unsafe { new_jstring(env, text) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `json` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeJsonStringArrayLen(
    env: JniEnvPtr,
    _class: JClass,
    json: JString,
) -> JInt {
    let Some(raw) = (unsafe { read_jstring_utf8(env, json) }) else {
        return 0;
    };
    serde_json::from_str::<Vec<String>>(&raw)
        .map(|items| items.len().min(i32::MAX as usize) as JInt)
        .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `json` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeJsonStringArrayGet(
    env: JniEnvPtr,
    _class: JClass,
    json: JString,
    index: JInt,
) -> JString {
    let (Some(raw), Ok(idx)) = (
        unsafe { read_jstring_utf8(env, json) },
        usize::try_from(index),
    ) else {
        return core::ptr::null_mut();
    };
    let Ok(items) = serde_json::from_str::<Vec<String>>(&raw) else {
        return core::ptr::null_mut();
    };
    match items.get(idx) {
        Some(item) => unsafe { new_jstring(env, item) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
///
/// Plans a rollback `localStorage` write-back JSON payload. Returns `null`
/// while upgrade import is incomplete or any allowlisted local workspace has
/// an unresolved mount failure.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativePlanLegacyLocalStorageWriteBack(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let plan = with_host_ref(handle, |host| host.plan_legacy_local_storage_writeback()).flatten();
    match plan {
        Some(json) => unsafe { new_jstring(env, &json) },
        None => core::ptr::null_mut(),
    }
}

fn legacy_app_datastore_path(files_dir: &Path) -> std::path::PathBuf {
    files_dir.join("datastore").join("affine.preferences_pb")
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string args must be null or valid `jstring`s.
///
/// Deletes a key from the `0.27.5` general app DataStore (`datastore/affine.preferences_pb`)
/// under its per-file lock. Succeeds without creating an empty file when absent.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeLegacyAppDataStoreDeleteKey(
    env: JniEnvPtr,
    _class: JClass,
    files_dir: JString,
    key: JString,
) -> JBoolean {
    let (Some(dir), Some(k)) = (unsafe { read_jstring_utf8(env, files_dir) }, unsafe {
        read_jstring_utf8(env, key)
    }) else {
        return 0;
    };
    let path = legacy_app_datastore_path(Path::new(&dir));
    u8::from(delete_file_key(&path, &k).is_ok())
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `code` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeIsPermanentAuthErrorCode(
    env: JniEnvPtr,
    _class: JClass,
    code: JString,
) -> JBoolean {
    let Some(raw) = (unsafe { read_jstring_utf8(env, code) }) else {
        return 0;
    };
    u8::from(is_permanent_auth_error_code(&raw))
}
