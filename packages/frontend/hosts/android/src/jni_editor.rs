#![allow(unsafe_code)]

//! Hand-written `extern "C"` JNI exports for the live pure-Rust BlockSuite GPU
//! editor mounted inside `affine-android-host`.

use playground::PlaygroundMode;

use crate::{
    editor_runtime::{self, with_editor_mut},
    jni_bridge::{
        JBoolean, JClass, JFloat, JInt, JLong, JObject, JString, JniEnvPtr, new_jstring,
        read_jstring_utf8, with_host_mut, with_host_ref,
    },
    jni_interaction::{JFloatArray, fill_jfloat_array},
};

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeLoadShowcaseDocument(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_editor_mut(handle, |ed| ed.load_showcase_document());
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeResetEmptyDocument(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_editor_mut(handle, |ed| ed.reset_empty_document());
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetFormFactor(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    smallest_width_dp: JInt,
) {
    let _ = with_editor_mut(handle, |ed| {
        ed.set_form_factor_from_smallest_width_dp(smallest_width_dp);
    });
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeIsEdgelessReadonly(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    u8::from(with_editor_mut(handle, |ed| ed.edgeless_readonly()).unwrap_or(true))
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeIsDatabaseReadonly(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    u8::from(with_editor_mut(handle, |ed| ed.database_readonly()).unwrap_or(true))
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeWantsCodeInput(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    u8::from(with_editor_mut(handle, |ed| ed.wants_code_input()).unwrap_or(false))
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetEditorMode(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    mode_code: JInt,
) {
    let mode = if mode_code == 1 {
        PlaygroundMode::Edgeless
    } else {
        PlaygroundMode::Page
    };
    let _ = with_editor_mut(handle, |ed| ed.set_mode(mode));
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnTouchEvent(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    pointer_id: JLong,
    phase: JInt,
    x_dp: JFloat,
    y_dp: JFloat,
) {
    let _ = with_editor_mut(handle, |ed| {
        ed.dispatch_touch(pointer_id as u64, phase.clamp(0, 3) as u8, x_dp, y_dp);
    });
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnScrollWheel(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    x_dp: JFloat,
    y_dp: JFloat,
    delta_x: JFloat,
    delta_y: JFloat,
) {
    let _ = with_editor_mut(handle, |ed| {
        ed.dispatch_scroll_wheel(x_dp, y_dp, delta_x, delta_y);
    });
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeHandleBack(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    let handled = with_editor_mut(handle, |ed| ed.handle_back()).unwrap_or(false);
    if handled {
        let _ = with_host_mut(handle, |host| host.surface.request_frame());
    }
    u8::from(handled)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeOnKeyEvent(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    key_code: JInt,
    shift: JBoolean,
    ctrl: JBoolean,
    alt: JBoolean,
) -> JBoolean {
    let handled = with_editor_mut(handle, |ed| {
        ed.dispatch_key_code(key_code, shift != 0, ctrl != 0, alt != 0)
    })
    .unwrap_or(false);
    if handled {
        let _ = with_host_mut(handle, |host| host.surface.request_frame());
    }
    u8::from(handled)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetTextInputChangeSeq(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JLong {
    with_editor_mut(handle, |ed| ed.text_input_change_seq() as JLong).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetFocusedBlockHash(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JLong {
    with_editor_mut(handle, |ed| ed.focused_block_hash() as JLong).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeWantsSoftwareKeyboard(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    u8::from(with_editor_mut(handle, |ed| ed.wants_software_keyboard()).unwrap_or(false))
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetCaretRectDpX(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JFloat {
    with_editor_mut(handle, |ed| ed.caret_rect_dp().map(|r| r[0]).unwrap_or(0.0)).unwrap_or(0.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetCaretRectDpY(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JFloat {
    with_editor_mut(handle, |ed| ed.caret_rect_dp().map(|r| r[1]).unwrap_or(0.0)).unwrap_or(0.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetCaretRectDpHeight(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JFloat {
    with_editor_mut(handle, |ed| {
        ed.caret_rect_dp().map(|r| r[3]).unwrap_or(20.0)
    })
    .unwrap_or(20.0)
}

/// Bulk UTF-16 read of the focused editor block in a single JNI call (`H-S1`).
///
/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetUtf16Text(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let text = if let Some(units) = with_editor_mut(handle, |ed| ed.utf16_text()) {
        String::from_utf16_lossy(&units)
    } else {
        with_host_ref(handle, |host| host.text_string()).unwrap_or_default()
    };
    unsafe { new_jstring(env, &text) }
}

/// Returns `true` when the Android editor dispatcher still has pending delayed timers.
#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeHasPendingTimer(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    let pending = with_editor_mut(handle, |ed| ed.drain_tasks().is_some()).unwrap_or(false);
    u8::from(pending)
}

/// Drains due timers on the UI thread, marks the surface dirty if any due timer invalidated
/// the view, and returns milliseconds until the next pending timer (`-1` when none).
#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeNextTimerDelayMs(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JLong {
    let (next_ms, dirty) = with_editor_mut(handle, |ed| {
        let next = ed.drain_tasks();
        let dirty = ed.is_dirty() || ed.has_pending_main_tasks();
        let ms = if ed.has_pending_main_tasks() {
            0
        } else {
            next.map(|d| d.as_millis().min(i64::MAX as u128) as i64)
                .unwrap_or(-1)
        };
        (ms, dirty)
    })
    .unwrap_or((-1, false));
    if dirty {
        let _ = with_host_mut(handle, |host| host.surface.request_frame());
    }
    next_ms
}

/// Returns `true` when the live editor view is currently in `PlaygroundTheme::Dark`.
#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeIsDarkTheme(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    u8::from(with_editor_mut(handle, |ed| ed.is_dark_theme()).unwrap_or(false))
}

/// Fills a 24-float JNI buffer with document-level selection geometry (dp), visibility flags,
/// authoritative `SelectionActionMask`, and motion suppression flag.
///
/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `out_buffer` must be a `float[>=24]`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeFillDocumentSelectionGeometry(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    out_buffer: JFloatArray,
) -> JBoolean {
    let Some(packed) = with_editor_mut(handle, |ed| ed.pack_document_selection_floats()) else {
        return 0;
    };
    u8::from(unsafe { fill_jfloat_array(env, out_buffer, &packed) })
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetSelectionMenuRequestSeq(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JLong {
    with_editor_mut(handle, |ed| ed.selection_menu_request_seq() as JLong).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDocSelectionBeginDrag(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    handle_kind: JInt,
) -> JBoolean {
    u8::from(
        with_editor_mut(handle, |ed| {
            ed.begin_document_selection_drag(handle_kind.clamp(0, 2) as u8)
        })
        .unwrap_or(false),
    )
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDocSelectionUpdateDrag(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    x_dp: JFloat,
    y_dp: JFloat,
) -> JBoolean {
    let ok = with_editor_mut(handle, |ed| ed.update_document_selection_drag(x_dp, y_dp))
        .unwrap_or(false);
    if ok {
        let _ = with_host_mut(handle, |host| host.surface.request_frame());
    }
    u8::from(ok)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDocSelectionEndDrag(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_editor_mut(handle, |ed| ed.end_document_selection_drag());
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeDocSelectionCancelDrag(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_editor_mut(handle, |ed| ed.cancel_document_selection_drag());
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectionActionCopy(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_editor_mut(handle, |ed| ed.selection_copy());
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectionActionCut(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_editor_mut(handle, |ed| ed.selection_cut());
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; string arguments may be null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectionActionPaste(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    plain: JString,
    html: JString,
    markdown: JString,
    snapshot: JString,
) {
    let plain_s = unsafe { read_jstring_utf8(env, plain) };
    let html_s = unsafe { read_jstring_utf8(env, html) };
    let md_s = unsafe { read_jstring_utf8(env, markdown) };
    let snap_s = unsafe { read_jstring_utf8(env, snapshot) };
    let _ = with_editor_mut(handle, |ed| {
        ed.selection_paste(plain_s, html_s, md_s, snap_s)
    });
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectionActionSelectAll(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_editor_mut(handle, |ed| ed.selection_select_all());
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

/// Returns and clears any pending multi-MIME JSON clipboard payload written by the editor.
///
/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeTakePendingClipboardJson(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let Some(json) = with_editor_mut(handle, |ed| ed.take_pending_clipboard_json()).flatten()
    else {
        return core::ptr::null_mut();
    };
    unsafe { new_jstring(env, &json) }
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetPageReadonly(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    readonly: JBoolean,
) {
    let _ = with_editor_mut(handle, |ed| ed.set_page_readonly(readonly != 0));
    let _ = with_host_mut(handle, |host| host.surface.request_frame());
}

// Standard JNI vtable slots used for cross-thread Looper wakeup (`NativeBridge.onNativeWakeup`).
const JNI_FIND_CLASS_INDEX: usize = 6;
const JNI_EXCEPTION_CLEAR_INDEX: usize = 17;
const JNI_NEW_GLOBAL_REF_INDEX: usize = 21;
const JNI_GET_STATIC_METHOD_ID_INDEX: usize = 113;
const JNI_CALL_STATIC_VOID_METHOD_A_INDEX: usize = 143;
const JNI_GET_JAVA_VM_INDEX: usize = 219;
const JNI_INVOKE_ATTACH_INDEX: usize = 4;
const JNI_INVOKE_DETACH_INDEX: usize = 5;
const JNI_INVOKE_GET_ENV_INDEX: usize = 6;
const JNI_VERSION_1_6: JInt = 0x0001_0006;
const JNI_OK: JInt = 0;
const JNI_EDETACHED: JInt = -2;

type FindClassFn = unsafe extern "C" fn(JniEnvPtr, *const i8) -> JClass;
type ExceptionClearFn = unsafe extern "C" fn(JniEnvPtr);
type NewGlobalRefFn = unsafe extern "C" fn(JniEnvPtr, JObject) -> JObject;
type GetStaticMethodIdFn =
    unsafe extern "C" fn(JniEnvPtr, JClass, *const i8, *const i8) -> *mut core::ffi::c_void;
type CallStaticVoidMethodAFn =
    unsafe extern "C" fn(JniEnvPtr, JClass, *mut core::ffi::c_void, *const i64);
type GetJavaVmFn = unsafe extern "C" fn(JniEnvPtr, *mut *mut core::ffi::c_void) -> JInt;
type AttachThreadFn =
    unsafe extern "C" fn(*mut core::ffi::c_void, *mut JniEnvPtr, *mut core::ffi::c_void) -> JInt;
type DetachThreadFn = unsafe extern "C" fn(*mut core::ffi::c_void) -> JInt;
type GetEnvFn = unsafe extern "C" fn(*mut core::ffi::c_void, *mut JniEnvPtr, JInt) -> JInt;

/// Process-lifetime cached JNI references for `NativeBridge.onNativeWakeup(long)`.
/// `NativeBridge` lives for the entire process lifetime and is never unloaded, so the
/// single `jclass` global reference is cached once and never deleted on host detach.
#[derive(Clone, Copy)]
struct JniWakeupBridge {
    vm: usize,
    bridge_class_global: usize,
    method_id: usize,
}

static WAKEUP_BRIDGE: std::sync::OnceLock<JniWakeupBridge> = std::sync::OnceLock::new();
static WAKEUP_HANDLES: std::sync::OnceLock<std::sync::RwLock<std::collections::BTreeSet<i64>>> =
    std::sync::OnceLock::new();

fn wakeup_handles() -> &'static std::sync::RwLock<std::collections::BTreeSet<i64>> {
    WAKEUP_HANDLES.get_or_init(|| std::sync::RwLock::new(std::collections::BTreeSet::new()))
}

unsafe fn build_jni_wakeup(env: JniEnvPtr, class: JClass) -> Option<JniWakeupBridge> {
    if env.is_null() || class.is_null() {
        return None;
    }
    let vtable = unsafe { *(env as *const *const *const core::ffi::c_void) };
    if vtable.is_null() {
        return None;
    }
    let find_class: FindClassFn =
        unsafe { core::mem::transmute(*vtable.add(JNI_FIND_CLASS_INDEX)) };
    let get_vm: GetJavaVmFn = unsafe { core::mem::transmute(*vtable.add(JNI_GET_JAVA_VM_INDEX)) };
    let new_gref: NewGlobalRefFn =
        unsafe { core::mem::transmute(*vtable.add(JNI_NEW_GLOBAL_REF_INDEX)) };
    let get_mid: GetStaticMethodIdFn =
        unsafe { core::mem::transmute(*vtable.add(JNI_GET_STATIC_METHOD_ID_INDEX)) };
    let exc_clear: ExceptionClearFn =
        unsafe { core::mem::transmute(*vtable.add(JNI_EXCEPTION_CLEAR_INDEX)) };
    let mut vm: *mut core::ffi::c_void = core::ptr::null_mut();
    if unsafe { get_vm(env, &mut vm) } != JNI_OK || vm.is_null() {
        return None;
    }
    // Kotlin `object NativeBridge` passes `NativeBridge.INSTANCE` (`jobject`, not `jclass`) as the
    // 2nd JNI argument to non-`@JvmStatic` external methods; look up the true `jclass` via FindClass.
    let bridge_class =
        unsafe { find_class(env, c"app/affine/pro/host/NativeBridge".as_ptr().cast()) };
    if bridge_class.is_null() {
        unsafe { exc_clear(env) };
        return None;
    }
    let mid = unsafe {
        get_mid(
            env,
            bridge_class,
            c"onNativeWakeup".as_ptr().cast(),
            c"(J)V".as_ptr().cast(),
        )
    };
    if mid.is_null() {
        unsafe { exc_clear(env) };
        return None;
    }
    let gref = unsafe { new_gref(env, bridge_class) };
    if gref.is_null() {
        unsafe { exc_clear(env) };
        return None;
    }
    Some(JniWakeupBridge {
        vm: vm as usize,
        bridge_class_global: gref as usize,
        method_id: mid as usize,
    })
}

fn invoke_jni_wakeup(handle: JLong) {
    let Some(bridge) = WAKEUP_BRIDGE.get().copied() else {
        return;
    };
    let handles = wakeup_handles().read().unwrap_or_else(|e| e.into_inner());
    if !handles.contains(&handle) {
        return;
    }
    let vm = bridge.vm as *mut core::ffi::c_void;
    let class_addr = bridge.bridge_class_global;
    let mid_addr = bridge.method_id;
    if vm.is_null() || class_addr == 0 || mid_addr == 0 {
        return;
    }
    unsafe {
        let ivtable = *(vm as *const *const *const core::ffi::c_void);
        if ivtable.is_null() {
            return;
        }
        let get_env: GetEnvFn = core::mem::transmute(*ivtable.add(JNI_INVOKE_GET_ENV_INDEX));
        let attach: AttachThreadFn = core::mem::transmute(*ivtable.add(JNI_INVOKE_ATTACH_INDEX));
        let detach: DetachThreadFn = core::mem::transmute(*ivtable.add(JNI_INVOKE_DETACH_INDEX));
        let mut env: JniEnvPtr = core::ptr::null_mut();
        let mut attached = false;
        let status = get_env(vm, &mut env, JNI_VERSION_1_6);
        if status == JNI_EDETACHED {
            if attach(vm, &mut env, core::ptr::null_mut()) != JNI_OK || env.is_null() {
                return;
            }
            attached = true;
        } else if status != JNI_OK || env.is_null() {
            return;
        }
        let vtable = *(env as *const *const *const core::ffi::c_void);
        if !vtable.is_null() {
            let call_void: CallStaticVoidMethodAFn =
                core::mem::transmute(*vtable.add(JNI_CALL_STATIC_VOID_METHOD_A_INDEX));
            let exc_clear: ExceptionClearFn =
                core::mem::transmute(*vtable.add(JNI_EXCEPTION_CLEAR_INDEX));
            let args: [i64; 1] = [handle];
            call_void(
                env,
                class_addr as JClass,
                mid_addr as *mut core::ffi::c_void,
                args.as_ptr(),
            );
            exc_clear(env);
        }
        drop(handles);
        if attached {
            let _ = detach(vm);
        }
    }
}

pub(crate) fn attach_for_host(env: JniEnvPtr, class: JClass, handle: JLong) {
    editor_runtime::attach_editor(handle, 412.0, 915.0, 2.625);
    let ready = WAKEUP_BRIDGE.get().is_some()
        || unsafe { build_jni_wakeup(env, class) }.is_some_and(|bridge| {
            WAKEUP_BRIDGE.set(bridge).is_ok() || WAKEUP_BRIDGE.get().is_some()
        });
    if ready {
        wakeup_handles()
            .write()
            .unwrap_or_else(|e| e.into_inner())
            .insert(handle);
        let _ = with_editor_mut(handle, |ed| {
            ed.set_waker(Some(std::sync::Arc::new(move || {
                invoke_jni_wakeup(handle);
            })));
        });
    }
}

pub(crate) fn detach_for_host(_env: JniEnvPtr, handle: JLong) {
    let _ = with_editor_mut(handle, |ed| {
        ed.set_waker(None);
    });
    wakeup_handles()
        .write()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&handle);
    editor_runtime::detach_editor(handle);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    use super::*;

    #[test]
    fn detach_waits_for_inflight_wakeup_read_guard_and_disarms_handle() {
        let handle: JLong = 9_900_001;
        wakeup_handles()
            .write()
            .unwrap_or_else(|e| e.into_inner())
            .insert(handle);

        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let inflight_alive = Arc::new(AtomicBool::new(false));
        let inflight_alive_bg = Arc::clone(&inflight_alive);

        let bg = std::thread::spawn(move || {
            let guards = wakeup_handles().read().unwrap_or_else(|e| e.into_inner());
            assert!(guards.contains(&handle));
            inflight_alive_bg.store(true, Ordering::SeqCst);
            entered_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(2)).unwrap();
            inflight_alive_bg.store(false, Ordering::SeqCst);
            drop(guards);
        });

        entered_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let detached_observed_inflight = Arc::new(AtomicBool::new(false));
        let detached_flag = Arc::clone(&detached_observed_inflight);
        let inflight_check = Arc::clone(&inflight_alive);
        let detacher = std::thread::spawn(move || {
            detach_for_host(core::ptr::null_mut(), handle);
            detached_flag.store(inflight_check.load(Ordering::SeqCst), Ordering::SeqCst);
        });

        std::thread::yield_now();
        release_tx.send(()).unwrap();
        bg.join().unwrap();
        detacher.join().unwrap();

        assert!(
            !detached_observed_inflight.load(Ordering::SeqCst),
            "detach_for_host must block on write() until all in-flight wakeup readers exit"
        );
        assert!(
            !wakeup_handles()
                .read()
                .unwrap_or_else(|e| e.into_inner())
                .contains(&handle),
            "detached handle must be removed so subsequent wakeups become no-ops"
        );
        invoke_jni_wakeup(handle);
    }
}
