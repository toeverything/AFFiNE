#![allow(unsafe_code)]

//! Hand-written `extern "C"` JNI exports for the live pure-Rust BlockSuite GPU
//! editor mounted inside `affine-android-host`.

use playground::PlaygroundMode;

use crate::{
    editor_runtime::{self, with_editor_mut},
    jni_bridge::{
        JBoolean, JClass, JFloat, JInt, JLong, JString, JniEnvPtr, new_jstring, with_host_mut,
        with_host_ref,
    },
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

/// Returns `true` when the Android editor dispatcher still has pending delayed timers
/// (caret blink, long-press, toast auto-dismiss) so Choreographer schedules another tick.
#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeHasPendingTimer(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    let pending = with_editor_mut(handle, |ed| ed.drain_tasks().is_some()).unwrap_or(false);
    u8::from(pending)
}

pub(crate) fn attach_for_host(handle: JLong) {
    editor_runtime::attach_editor(handle, 412.0, 915.0, 2.625);
}

pub(crate) fn detach_for_host(handle: JLong) {
    editor_runtime::detach_editor(handle);
}
