#![allow(unsafe_code)]

use core::ffi::c_void;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};

use crate::{
    AndroidHostState, BackGesturePhase, physical_insets_to_logical_dp, should_expose_autofill,
};

pub type JniEnvPtr = *mut c_void;
pub type JClass = *mut c_void;
pub type JObject = *mut c_void;
pub type JString = *mut c_void;
pub type JBoolean = u8;
pub type JInt = i32;
pub type JFloat = f32;
pub type JLong = i64;
pub type JSize = i32;
pub type JChar = u16;

// Standard JNI `JNINativeInterface` function table indices (JNI 1.1+ spec).
const JNI_GET_STRING_LENGTH_INDEX: usize = 164;
const JNI_GET_STRING_CHARS_INDEX: usize = 165;
const JNI_RELEASE_STRING_CHARS_INDEX: usize = 166;

type GetStringLengthFn = unsafe extern "C" fn(JniEnvPtr, JString) -> JSize;
type GetStringCharsFn = unsafe extern "C" fn(JniEnvPtr, JString, *mut JBoolean) -> *const JChar;
type ReleaseStringCharsFn = unsafe extern "C" fn(JniEnvPtr, JString, *const JChar);

static HOST_REGISTRY: OnceLock<Mutex<BTreeMap<i64, AndroidHostState>>> = OnceLock::new();
static NEXT_HOST_HANDLE: AtomicI64 = AtomicI64::new(1);

pub(crate) fn registry() -> &'static Mutex<BTreeMap<i64, AndroidHostState>> {
    HOST_REGISTRY.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn with_host_mut<R>(handle: JLong, f: impl FnOnce(&mut AndroidHostState) -> R) -> Option<R> {
    if handle == 0 {
        return None;
    }
    let mut map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    map.get_mut(&handle).map(f)
}

fn with_host_ref<R>(handle: JLong, f: impl FnOnce(&AndroidHostState) -> R) -> Option<R> {
    if handle == 0 {
        return None;
    }
    let map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    map.get(&handle).map(f)
}

fn normalize_jint_range(start: JInt, end: JInt) -> (usize, usize) {
    let (lo, hi) = if start <= end {
        (start, end)
    } else {
        (end, start)
    };
    (lo.max(0) as usize, hi.max(0) as usize)
}

/// Reads UTF-16 code units from a JNI `jstring` using `GetStringLength`,
/// `GetStringChars`, and `ReleaseStringChars`.
///
/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `jstr` must be null or a valid `jstring`.
unsafe fn read_jstring_utf16(env: JniEnvPtr, jstr: JString) -> Option<Vec<u16>> {
    if env.is_null() || jstr.is_null() {
        return None;
    }
    // SAFETY: `JNIEnv*` points to a pointer to the `JNINativeInterface` vtable.
    let vtable = unsafe { *(env as *const *const *const c_void) };
    if vtable.is_null() {
        return None;
    }
    // SAFETY: Standard JNI vtable slots 164, 165, 166.
    let get_len_ptr = unsafe { *vtable.add(JNI_GET_STRING_LENGTH_INDEX) };
    let get_chars_ptr = unsafe { *vtable.add(JNI_GET_STRING_CHARS_INDEX) };
    let rel_chars_ptr = unsafe { *vtable.add(JNI_RELEASE_STRING_CHARS_INDEX) };
    if get_len_ptr.is_null() || get_chars_ptr.is_null() || rel_chars_ptr.is_null() {
        return None;
    }
    // SAFETY: Function pointer signatures match the JNI specification.
    let get_len: GetStringLengthFn = unsafe { core::mem::transmute(get_len_ptr) };
    let get_chars: GetStringCharsFn = unsafe { core::mem::transmute(get_chars_ptr) };
    let rel_chars: ReleaseStringCharsFn = unsafe { core::mem::transmute(rel_chars_ptr) };

    let len = unsafe { get_len(env, jstr) };
    if len <= 0 {
        return Some(Vec::new());
    }
    let chars_ptr = unsafe { get_chars(env, jstr, core::ptr::null_mut()) };
    if chars_ptr.is_null() {
        return None;
    }
    let out = unsafe { core::slice::from_raw_parts(chars_ptr, len as usize) }.to_vec();
    unsafe { rel_chars(env, jstr, chars_ptr) };
    Some(out)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeShouldExposeAutofill(
    _env: JniEnvPtr,
    _class: JClass,
    sdk_int: JInt,
) -> JBoolean {
    let sdk = u32::try_from(sdk_int).unwrap_or(0);
    u8::from(should_expose_autofill(sdk))
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeCreateHost(
    _env: JniEnvPtr,
    _class: JClass,
) -> JLong {
    let mut map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    loop {
        let candidate = NEXT_HOST_HANDLE.fetch_add(1, Ordering::Relaxed);
        if candidate != 0 && !map.contains_key(&candidate) {
            map.insert(candidate, AndroidHostState::new());
            return candidate;
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDestroyHost(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    if handle == 0 {
        return;
    }
    let mut map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let _ = map.remove(&handle);
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetHasBackDestination(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    has_destination: JBoolean,
) {
    let _ = with_host_mut(handle, |host| {
        host.has_back_destination = has_destination != 0;
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceCreated(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    surface: JObject,
) {
    let _ = with_host_mut(handle, |host| {
        host.surface_active = true;
        host.surface_bound = !surface.is_null();
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceChanged(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    width_px: JInt,
    height_px: JInt,
) {
    let _ = with_host_mut(handle, |host| {
        host.surface_width_px = u32::try_from(width_px).unwrap_or(0);
        host.surface_height_px = u32::try_from(height_px).unwrap_or(0);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceDestroyed(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_host_mut(handle, |host| {
        host.surface_active = false;
        host.surface_bound = false;
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceInsetsPx(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    safe_top_px: JInt,
    safe_right_px: JInt,
    safe_bottom_px: JInt,
    safe_left_px: JInt,
    ime_bottom_px: JInt,
    density: JFloat,
) {
    let _ = with_host_mut(handle, |host| {
        host.insets = physical_insets_to_logical_dp(
            safe_top_px,
            safe_right_px,
            safe_bottom_px,
            safe_left_px,
            ime_bottom_px,
            density,
        );
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    frame_time_nanos: JLong,
) -> JInt {
    with_host_mut(handle, |host| {
        host.frame_count = host.frame_count.saturating_add(1);
        host.last_frame_nanos = frame_time_nanos;
        host.clear_color_argb as JInt
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnBackGesturePhase(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    phase_code: JInt,
    progress: JFloat,
) -> JBoolean {
    let Some(phase) = BackGesturePhase::from_code(phase_code) else {
        return 0;
    };
    with_host_mut(handle, |host| {
        u8::from(host.handle_back_phase(phase, progress))
    })
    .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `text` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    text: JString,
    new_cursor_position: JInt,
) {
    let Some(utf16) = (unsafe { read_jstring_utf16(env, text) }) else {
        return;
    };
    let _ = with_host_mut(handle, |host| {
        host.commit_text_utf16(&utf16, new_cursor_position);
    });
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `text` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingText(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    text: JString,
    new_cursor_position: JInt,
) {
    let Some(utf16) = (unsafe { read_jstring_utf16(env, text) }) else {
        return;
    };
    let _ = with_host_mut(handle, |host| {
        host.set_composing_text_utf16(&utf16, new_cursor_position);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingRegion(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    start: JInt,
    end: JInt,
) {
    let (a, b) = normalize_jint_range(start, end);
    let _ = with_host_mut(handle, |host| {
        host.set_composing_region(a, b);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnFinishComposingText(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_host_mut(handle, |host| {
        host.finish_composing_text();
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnSetSelection(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    start: JInt,
    end: JInt,
) {
    let (a, b) = normalize_jint_range(start, end);
    let _ = with_host_mut(handle, |host| {
        host.set_selection(a, b);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingText(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    before_len: JInt,
    after_len: JInt,
) {
    if before_len < 0 || after_len < 0 {
        return;
    }
    let before = before_len as usize;
    let after = after_len as usize;
    let _ = with_host_mut(handle, |host| {
        host.delete_surrounding_text(before, after);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingTextInCodePoints(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    before_len: JInt,
    after_len: JInt,
) -> JBoolean {
    if before_len < 0 || after_len < 0 {
        return 0;
    }
    let before = before_len as usize;
    let after = after_len as usize;
    with_host_mut(handle, |host| {
        u8::from(host.delete_surrounding_text_in_code_points(before, after))
    })
    .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `text` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnReplaceText(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    start: JInt,
    end: JInt,
    text: JString,
    new_cursor_position: JInt,
) -> JBoolean {
    if start < 0 || end < 0 {
        return 0;
    }
    let Some(utf16) = (unsafe { read_jstring_utf16(env, text) }) else {
        return 0;
    };
    with_host_mut(handle, |host| {
        host.replace_text_utf16(start as usize, end as usize, &utf16, new_cursor_position);
        1
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetUtf16Length(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| {
        host.utf16_len().min(i32::MAX as usize) as JInt
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetUtf16Unit(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    index: JInt,
) -> JInt {
    let Ok(idx) = usize::try_from(index) else {
        return 0;
    };
    with_host_ref(handle, |host| i32::from(host.utf16_unit(idx).unwrap_or(0))).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetSelectionStart(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| host.selection_range().0 as JInt).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetSelectionEnd(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| host.selection_range().1 as JInt).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetComposingStart(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| {
        host.composing_range()
            .map_or(-1, |(start, _)| start as JInt)
    })
    .unwrap_or(-1)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetComposingEnd(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| {
        host.composing_range().map_or(-1, |(_, end)| end as JInt)
    })
    .unwrap_or(-1)
}

#[cfg(test)]
pub(crate) fn insert_test_host(handle: JLong, state: AndroidHostState) {
    let mut map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    map.insert(handle, state);
}

#[cfg(test)]
pub(crate) fn snapshot_text(handle: JLong) -> Option<String> {
    let map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    map.get(&handle).map(AndroidHostState::text_string)
}

#[cfg(test)]
pub(crate) fn snapshot_selection(handle: JLong) -> Option<(usize, usize)> {
    let map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    map.get(&handle).map(AndroidHostState::selection_range)
}

#[cfg(test)]
pub(crate) fn snapshot_composing(handle: JLong) -> Option<Option<(usize, usize)>> {
    let map = registry()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    map.get(&handle).map(AndroidHostState::composing_range)
}
