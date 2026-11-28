#![allow(unsafe_code)]

//! Hand-written JNI exports for Android `S6-NativeIslands` (`ShareIntentBridge`).
//! Zero JNA, zero UniFFI, zero WebKit.

use crate::jni_bridge::{
    JBoolean, JClass, JInt, JLong, JString, JniEnvPtr, new_jstring, read_jstring_utf8,
    with_host_mut, with_host_ref,
};
use crate::native_islands::{AndroidShareItem, AndroidShareKind};

/// Enqueues an incoming Android `ACTION_SEND` payload (`0 = url`, `1 = text`, `2 = image`).
///
/// # Safety
/// Called by the JVM/ART runtime with valid JNI pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeShareEnqueue(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    id: JString,
    kind: JInt,
    title: JString,
    content: JString,
    mime_type: JString,
) -> JBoolean {
    let Some(id_str) = (unsafe { read_jstring_utf8(env, id) }) else {
        return 0;
    };
    let Some(content_str) = (unsafe { read_jstring_utf8(env, content) }) else {
        return 0;
    };
    let title_str = unsafe { read_jstring_utf8(env, title) }.unwrap_or_default();
    let mime_str =
        unsafe { read_jstring_utf8(env, mime_type) }.unwrap_or_else(|| "text/plain".to_string());
    let share_kind = match kind {
        0 => AndroidShareKind::Url,
        2 => AndroidShareKind::Image,
        _ => AndroidShareKind::Text,
    };
    let ok = with_host_mut(handle, |host| {
        host.islands
            .share_queue
            .enqueue(AndroidShareItem {
                id: id_str,
                kind: share_kind,
                title: title_str,
                content: content_str,
                mime_type: mime_str,
            })
            .is_ok()
    })
    .unwrap_or(false);
    u8::from(ok)
}

/// Returns the number of queued share items waiting to be drained.
///
/// # Safety
/// Called by the JVM/ART runtime with valid JNI pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSharePendingCount(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| {
        host.islands
            .share_queue
            .pending_count()
            .min(i32::MAX as usize) as JInt
    })
    .unwrap_or(0)
}

/// Atomically drains all queued Android share items as a JSON array.
///
/// # Safety
/// Called by the JVM/ART runtime with valid JNI pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeShareDrainJson(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let json = with_host_mut(handle, |host| {
        let items = host.islands.share_queue.drain_all();
        serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
    })
    .unwrap_or_else(|| "[]".to_string());
    unsafe { new_jstring(env, &json) }
}

/// Atomically drains queued Android share items and inserts them into the active editor document.
/// Returns the number of ingested items.
///
/// # Safety
/// Called by the JVM/ART runtime with valid JNI pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeIngestSharedItems(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    let Some((count, combined)) = with_host_mut(handle, |host| {
        let items = host.islands.share_queue.drain_all();
        if items.is_empty() {
            return (0, String::new());
        }
        let count = items.len().min(i32::MAX as usize) as JInt;
        let mut combined = String::new();
        for item in &items {
            let line = match item.kind {
                AndroidShareKind::Url => {
                    if item.title.trim().is_empty() {
                        item.content.trim().to_string()
                    } else {
                        format!("[{}]({})", item.title.trim(), item.content.trim())
                    }
                }
                AndroidShareKind::Image => {
                    let alt = if item.title.trim().is_empty() {
                        "shared-image"
                    } else {
                        item.title.trim()
                    };
                    format!("![{alt}]({})", item.content.trim())
                }
                AndroidShareKind::Text => item.content.trim().to_string(),
            };
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&line);
        }
        (count, combined)
    }) else {
        return 0;
    };
    if count == 0 {
        return 0;
    }
    let utf16: Vec<u16> = combined.encode_utf16().collect();
    if crate::editor_runtime::with_editor_mut(handle, |ed| {
        ed.commit_text_utf16(&utf16, 1);
    })
    .is_none()
    {
        let _ = with_host_mut(handle, |host| {
            host.commit_text_utf16(&utf16, 1);
        });
    }
    count
}
