#![allow(unsafe_code)]

//! Thin hand-written JNI exports for Android selection overlays, surface
//! recreation/fallback recovery, API 26+ autofill, predictive back navigation,
//! and zero-heap streaming `PdfRenderer` pixel conversion with per-call
//! `ExceptionCheck`.

use core::ffi::c_void;

use crate::autofill::{AutofillFieldKind, AutofillRect};
use crate::back_dispatch_mode;
use crate::jni_bridge::{
    JBoolean, JClass, JFloat, JInt, JLong, JObject, JSize, JString, JniEnvPtr, new_jstring,
    read_jstring_utf8, with_host_mut, with_host_ref,
};
use crate::pdf::{
    convert_argb8888_i32_chunk_to_rgba8_slice, pdf_page_cache_key, validate_pdf_dimensions,
    validate_pdf_page_request,
};
use crate::selection::{SelectionHandleKind, TextDirection};

pub type JIntArray = JObject;
pub type JByteArray = JObject;
pub type JFloatArray = JObject;

// Standard JNI 1.2+ `JNINativeInterface` vtable indices.
const JNI_GET_ARRAY_LENGTH_INDEX: usize = 171;
const JNI_NEW_BYTE_ARRAY_INDEX: usize = 176;
const JNI_NEW_FLOAT_ARRAY_INDEX: usize = 181;
const JNI_GET_INT_ARRAY_REGION_INDEX: usize = 203;
const JNI_SET_BYTE_ARRAY_REGION_INDEX: usize = 208;
const JNI_SET_FLOAT_ARRAY_REGION_INDEX: usize = 213;
const JNI_EXCEPTION_CHECK_INDEX: usize = 228;
const PDF_STREAM_CHUNK_PIXELS: usize = 4096;

type GetArrayLengthFn = unsafe extern "C" fn(JniEnvPtr, JObject) -> JSize;
type NewByteArrayFn = unsafe extern "C" fn(JniEnvPtr, JSize) -> JByteArray;
type NewFloatArrayFn = unsafe extern "C" fn(JniEnvPtr, JSize) -> JFloatArray;
type GetIntArrayRegionFn = unsafe extern "C" fn(JniEnvPtr, JIntArray, JSize, JSize, *mut JInt);
type SetByteArrayRegionFn = unsafe extern "C" fn(JniEnvPtr, JByteArray, JSize, JSize, *const i8);
type SetFloatArrayRegionFn = unsafe extern "C" fn(JniEnvPtr, JFloatArray, JSize, JSize, *const f32);
type ExceptionCheckFn = unsafe extern "C" fn(JniEnvPtr) -> JBoolean;

unsafe fn new_jfloat_array(env: JniEnvPtr, values: &[f32]) -> JFloatArray {
    if env.is_null() {
        return core::ptr::null_mut();
    }
    let Ok(len) = JSize::try_from(values.len()) else {
        return core::ptr::null_mut();
    };
    let vtable = unsafe { *(env as *const *const *const c_void) };
    if vtable.is_null() {
        return core::ptr::null_mut();
    }
    let new_arr_ptr = unsafe { *vtable.add(JNI_NEW_FLOAT_ARRAY_INDEX) };
    let set_region_ptr = unsafe { *vtable.add(JNI_SET_FLOAT_ARRAY_REGION_INDEX) };
    let exc_check_ptr = unsafe { *vtable.add(JNI_EXCEPTION_CHECK_INDEX) };
    if new_arr_ptr.is_null() || set_region_ptr.is_null() || exc_check_ptr.is_null() {
        return core::ptr::null_mut();
    }
    let new_arr: NewFloatArrayFn = unsafe { core::mem::transmute(new_arr_ptr) };
    let set_region: SetFloatArrayRegionFn = unsafe { core::mem::transmute(set_region_ptr) };
    let exc_check: ExceptionCheckFn = unsafe { core::mem::transmute(exc_check_ptr) };

    if unsafe { exc_check(env) } != 0 {
        return core::ptr::null_mut();
    }
    let arr = unsafe { new_arr(env, len) };
    if arr.is_null() || unsafe { exc_check(env) } != 0 {
        return core::ptr::null_mut();
    }
    if len > 0 {
        unsafe { set_region(env, arr, 0, len, values.as_ptr()) };
        if unsafe { exc_check(env) } != 0 {
            return core::ptr::null_mut();
        }
    }
    arr
}

unsafe fn fill_jfloat_array(env: JniEnvPtr, arr: JFloatArray, values: &[f32]) -> bool {
    if env.is_null() || arr.is_null() {
        return false;
    }
    let Ok(len) = JSize::try_from(values.len()) else {
        return false;
    };
    let vtable = unsafe { *(env as *const *const *const c_void) };
    if vtable.is_null() {
        return false;
    }
    let get_len_ptr = unsafe { *vtable.add(JNI_GET_ARRAY_LENGTH_INDEX) };
    let set_region_ptr = unsafe { *vtable.add(JNI_SET_FLOAT_ARRAY_REGION_INDEX) };
    let exc_check_ptr = unsafe { *vtable.add(JNI_EXCEPTION_CHECK_INDEX) };
    if get_len_ptr.is_null() || set_region_ptr.is_null() || exc_check_ptr.is_null() {
        return false;
    }
    let get_len: GetArrayLengthFn = unsafe { core::mem::transmute(get_len_ptr) };
    let set_region: SetFloatArrayRegionFn = unsafe { core::mem::transmute(set_region_ptr) };
    let exc_check: ExceptionCheckFn = unsafe { core::mem::transmute(exc_check_ptr) };

    if unsafe { exc_check(env) } != 0 {
        return false;
    }
    let actual_len = unsafe { get_len(env, arr) };
    if unsafe { exc_check(env) } != 0 || actual_len < len {
        return false;
    }
    if len > 0 {
        unsafe { set_region(env, arr, 0, len, values.as_ptr()) };
        if unsafe { exc_check(env) } != 0 {
            return false;
        }
    }
    true
}

// --- Selection Handles & IME-Integrated Drag ---

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetSelectionViewport(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    width: JFloat,
    height: JFloat,
    density: JFloat,
) {
    let _ = with_host_mut(handle, |host| {
        host.text_layout.update_viewport(width, density);
        host.selection.set_viewport(width, height, density);
        if host.selected_len > 0 {
            host.sync_selection_overlay_from_ime();
        }
    });
}

#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeUpdateSelectionOverlay(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    start_x: JFloat,
    start_y: JFloat,
    end_x: JFloat,
    end_y: JFloat,
    line_height: JFloat,
    direction_code: JInt,
    has_selection: JBoolean,
) {
    let direction = TextDirection::from_code(direction_code);
    let _ = with_host_mut(handle, |host| {
        host.selection.update_selection(
            start_x,
            start_y,
            end_x,
            end_y,
            line_height,
            direction,
            has_selection != 0,
        );
    });
}

#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeApplyTextDragEndpoints(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    start_x: JFloat,
    start_y: JFloat,
    end_x: JFloat,
    end_y: JFloat,
    line_height: JFloat,
    direction_code: JInt,
    active_handle_code: JInt,
) {
    let direction = TextDirection::from_code(direction_code);
    let active_handle = SelectionHandleKind::from_code(active_handle_code);
    let _ = with_host_mut(handle, |host| {
        host.selection.apply_text_drag_endpoints(
            start_x,
            start_y,
            end_x,
            end_y,
            line_height,
            direction,
            active_handle,
        );
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectionBeginDrag(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    touch_x: JFloat,
    touch_y: JFloat,
) -> JInt {
    with_host_mut(handle, |host| {
        host.begin_selection_handle_drag(touch_x, touch_y) as JInt
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectionEndDrag(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    with_host_mut(handle, |host| u8::from(host.end_selection_handle_drag())).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectionCancelDrag(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_host_mut(handle, |host| {
        host.cancel_selection_handle_drag();
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeClearSelectionOverlay(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_host_mut(handle, |host| {
        host.selection_drag_anchor_utf16 = None;
        host.selection_drag_initial_handle = SelectionHandleKind::None;
        host.selection.clear();
    });
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetSelectionOverlayJson(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let json = with_host_ref(handle, |host| host.selection.to_json()).unwrap_or_default();
    unsafe { new_jstring(env, &json) }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetSelectionOverlayGeometry(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JFloatArray {
    let packed =
        with_host_ref(handle, |host| host.selection.pack_overlay_floats()).unwrap_or([0.0; 24]);
    unsafe { new_jfloat_array(env, &packed) }
}

/// Fills a caller-owned `FloatArray` (length >= 24) with packed overlay geometry
/// without per-frame JNI array allocation.
///
/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `out` must be null or a valid `jfloatArray`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeFillSelectionOverlayGeometry(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    out: JFloatArray,
) -> JBoolean {
    let Some(packed) = with_host_ref(handle, |host| host.selection.pack_overlay_floats()) else {
        return 0;
    };
    u8::from(unsafe { fill_jfloat_array(env, out, &packed) })
}

// --- Surface Recreation, Scroll/DPI State Preservation & Vulkan -> GLES3 Recovery ---

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetSurfaceScrollOffset(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    scroll_x: JFloat,
    scroll_y: JFloat,
) {
    let _ = with_host_mut(handle, |host| {
        host.surface.set_scroll_offset(scroll_x, scroll_y);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetSurfaceScrollY(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JFloat {
    with_host_ref(handle, |host| host.surface.scroll_offset_y).unwrap_or(0.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetSurfaceDensity(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JFloat {
    with_host_ref(handle, |host| host.surface.density).unwrap_or(1.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetTextureGeneration(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JLong {
    with_host_ref(handle, |host| host.surface.texture_generation as JLong).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetEffectiveImeBottomDp(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JFloat {
    with_host_ref(handle, |host| host.insets.effective_ime_above_nav_bar()).unwrap_or(0.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSelectRenderBackend(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    vulkan_available: JBoolean,
    gles3_available: JBoolean,
) -> JInt {
    with_host_mut(handle, |host| {
        host.surface
            .select_backend(vulkan_available != 0, gles3_available != 0) as JInt
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeReportVulkanDeviceLost(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_mut(handle, |host| {
        host.surface.report_vulkan_device_lost() as JInt
    })
    .unwrap_or(0)
}

// --- API 26+ AutofillManager Virtual Structure Bridge ---

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeConfigureAutofillSdk(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    sdk_int: JInt,
) -> JBoolean {
    let sdk = u32::try_from(sdk_int).unwrap_or(0);
    with_host_mut(handle, |host| u8::from(host.autofill.set_sdk_int(sdk))).unwrap_or(0)
}

#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeUpsertAutofillField(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    autofill_id: JInt,
    kind_code: JInt,
    left: JInt,
    top: JInt,
    right: JInt,
    bottom: JInt,
    masked: JBoolean,
    value_len: JInt,
) -> JBoolean {
    let Some(kind) = AutofillFieldKind::from_code(kind_code) else {
        return 0;
    };
    let len = usize::try_from(value_len).unwrap_or(0);
    let bounds = AutofillRect::normalized(left, top, right, bottom);
    with_host_mut(handle, |host| {
        u8::from(
            host.autofill
                .upsert_field(autofill_id, kind, bounds, masked != 0, len),
        )
    })
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeFocusAutofillField(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    autofill_id: JInt,
) -> JInt {
    let next = if autofill_id > 0 {
        Some(autofill_id)
    } else {
        None
    };
    with_host_mut(handle, |host| host.autofill.focus_field(next).len() as JInt).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetFocusedAutofillFieldId(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| host.autofill.focused_id().unwrap_or(0)).unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `text` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetAutofillFieldText(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    autofill_id: JInt,
    text: JString,
) -> JBoolean {
    let Some(val) = (unsafe { read_jstring_utf8(env, text) }) else {
        return 0;
    };
    with_host_mut(handle, |host| {
        u8::from(host.autofill.set_field_text(autofill_id, &val))
    })
    .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `value` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeApplyAutofillValue(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    autofill_id: JInt,
    value: JString,
) -> JBoolean {
    let Some(text) = (unsafe { read_jstring_utf8(env, value) }) else {
        return 0;
    };
    with_host_mut(handle, |host| {
        u8::from(host.autofill.apply_autofill_value(autofill_id, &text))
    })
    .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetAutofillValue(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    autofill_id: JInt,
) -> JString {
    let value = with_host_ref(handle, |host| {
        host.autofill.filled_value(autofill_id).map(str::to_string)
    })
    .flatten();
    match value {
        Some(v) => unsafe { new_jstring(env, &v) },
        None => core::ptr::null_mut(),
    }
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetAutofillValueByKind(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    kind_code: JInt,
) -> JString {
    let Some(kind) = AutofillFieldKind::from_code(kind_code) else {
        return core::ptr::null_mut();
    };
    let value = with_host_ref(handle, |host| {
        host.autofill.filled_value_by_kind(kind).map(str::to_string)
    })
    .flatten();
    match value {
        Some(v) => unsafe { new_jstring(env, &v) },
        None => core::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeCommitAutofill(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    with_host_mut(handle, |host| u8::from(host.autofill.commit())).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeCancelAutofill(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JBoolean {
    with_host_mut(handle, |host| u8::from(host.autofill.cancel())).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeClearAutofillFields(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) {
    let _ = with_host_mut(handle, |host| {
        host.autofill.clear_fields();
    });
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetAutofillStructureJson(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let json =
        with_host_ref(handle, |host| host.autofill.virtual_structure_json()).unwrap_or_default();
    unsafe { new_jstring(env, &json) }
}

// --- Predictive Back API-Level Dispatch & Destination Navigation Stack ---

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeBackDispatchMode(
    _env: JniEnvPtr,
    _class: JClass,
    sdk_int: JInt,
) -> JInt {
    let sdk = u32::try_from(sdk_int).unwrap_or(0);
    back_dispatch_mode(sdk) as JInt
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `route` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativePushDestination(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    route: JString,
) -> JBoolean {
    let Some(route_str) = (unsafe { read_jstring_utf8(env, route) }) else {
        return 0;
    };
    with_host_mut(handle, |host| {
        u8::from(host.push_back_destination(route_str))
    })
    .unwrap_or(0)
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetCurrentDestination(
    env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JString {
    let dest = with_host_ref(handle, |host| {
        host.current_back_destination().map(str::to_string)
    })
    .flatten();
    match dest {
        Some(route) => unsafe { new_jstring(env, &route) },
        None => core::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeSetBackStackDepth(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
    depth: JInt,
) {
    let safe_depth = u32::try_from(depth).unwrap_or(0);
    let _ = with_host_mut(handle, |host| {
        host.set_back_stack_depth(safe_depth);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeGetBackStackDepth(
    _env: JniEnvPtr,
    _class: JClass,
    handle: JLong,
) -> JInt {
    with_host_ref(handle, |host| {
        host.back_stack_depth().min(i32::MAX as u32) as JInt
    })
    .unwrap_or(0)
}

// --- Native PdfRenderer Validation, Cache Key & Zero-Heap Streaming ARGB_8888 -> RGBA8 ---

#[unsafe(no_mangle)]
pub extern "C" fn Java_app_affine_pro_host_NativeBridge_nativeValidatePdfPageRequest(
    _env: JniEnvPtr,
    _class: JClass,
    page_index: JInt,
    page_count: JInt,
    width_px: JInt,
    height_px: JInt,
) -> JBoolean {
    let (Ok(idx), Ok(count), Ok(w), Ok(h)) = (
        u32::try_from(page_index),
        u32::try_from(page_count),
        u32::try_from(width_px),
        u32::try_from(height_px),
    ) else {
        return 0;
    };
    u8::from(validate_pdf_page_request(idx, count, w, h).is_ok())
}

/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `doc_id` must be null or a valid `jstring`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativePdfPageCacheKey(
    env: JniEnvPtr,
    _class: JClass,
    doc_id: JString,
    page_index: JInt,
    width_px: JInt,
    height_px: JInt,
    dpi_bucket: JInt,
) -> JString {
    let doc = unsafe { read_jstring_utf8(env, doc_id) }.unwrap_or_default();
    let idx = page_index.max(0) as u32;
    let w = width_px.max(0) as u32;
    let h = height_px.max(0) as u32;
    let dpi = dpi_bucket.max(72) as u32;
    let key = pdf_page_cache_key(&doc, idx, w, h, dpi);
    unsafe { new_jstring(env, &key) }
}

/// Converts a JNI `jintArray` (`ARGB_8888`) directly into a freshly allocated
/// Java `jbyteArray` (`RGBA8`) using stack-only 4096-pixel chunk buffers (0 B
/// Rust heap allocation) and checking `ExceptionCheck` after every JNI call.
///
/// # Safety
/// `env` must be null or a valid `JNIEnv*`; `argb_pixels` must be null or a valid `jintArray`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Java_app_affine_pro_host_NativeBridge_nativePdfConvertArgbToRgba(
    env: JniEnvPtr,
    _class: JClass,
    argb_pixels: JIntArray,
    width_px: JInt,
    height_px: JInt,
) -> JByteArray {
    if env.is_null() || argb_pixels.is_null() {
        return core::ptr::null_mut();
    }
    let (Ok(w), Ok(h)) = (u32::try_from(width_px), u32::try_from(height_px)) else {
        return core::ptr::null_mut();
    };
    let Ok(expected_pixels) = validate_pdf_dimensions(w, h) else {
        return core::ptr::null_mut();
    };
    let Ok(expected_jlen) = JSize::try_from(expected_pixels) else {
        return core::ptr::null_mut();
    };
    let Some(total_rgba_bytes_usize) = expected_pixels.checked_mul(4) else {
        return core::ptr::null_mut();
    };
    let Ok(total_rgba_bytes) = JSize::try_from(total_rgba_bytes_usize) else {
        return core::ptr::null_mut();
    };

    let vtable = unsafe { *(env as *const *const *const c_void) };
    if vtable.is_null() {
        return core::ptr::null_mut();
    }
    let get_len_ptr = unsafe { *vtable.add(JNI_GET_ARRAY_LENGTH_INDEX) };
    let new_arr_ptr = unsafe { *vtable.add(JNI_NEW_BYTE_ARRAY_INDEX) };
    let get_region_ptr = unsafe { *vtable.add(JNI_GET_INT_ARRAY_REGION_INDEX) };
    let set_region_ptr = unsafe { *vtable.add(JNI_SET_BYTE_ARRAY_REGION_INDEX) };
    let exc_check_ptr = unsafe { *vtable.add(JNI_EXCEPTION_CHECK_INDEX) };
    if get_len_ptr.is_null()
        || new_arr_ptr.is_null()
        || get_region_ptr.is_null()
        || set_region_ptr.is_null()
        || exc_check_ptr.is_null()
    {
        return core::ptr::null_mut();
    }
    let get_len: GetArrayLengthFn = unsafe { core::mem::transmute(get_len_ptr) };
    let new_arr: NewByteArrayFn = unsafe { core::mem::transmute(new_arr_ptr) };
    let get_region: GetIntArrayRegionFn = unsafe { core::mem::transmute(get_region_ptr) };
    let set_region: SetByteArrayRegionFn = unsafe { core::mem::transmute(set_region_ptr) };
    let exc_check: ExceptionCheckFn = unsafe { core::mem::transmute(exc_check_ptr) };

    if unsafe { exc_check(env) } != 0 {
        return core::ptr::null_mut();
    }
    let actual_len = unsafe { get_len(env, argb_pixels) };
    if unsafe { exc_check(env) } != 0 || actual_len != expected_jlen {
        return core::ptr::null_mut();
    }

    let out_arr = unsafe { new_arr(env, total_rgba_bytes) };
    if out_arr.is_null() || unsafe { exc_check(env) } != 0 {
        return core::ptr::null_mut();
    }

    let mut argb_chunk = [0_i32; PDF_STREAM_CHUNK_PIXELS];
    let mut rgba_chunk = [0_u8; PDF_STREAM_CHUNK_PIXELS * 4];
    let mut offset = 0usize;
    while offset < expected_pixels {
        let count = (expected_pixels - offset).min(PDF_STREAM_CHUNK_PIXELS);
        unsafe {
            get_region(
                env,
                argb_pixels,
                offset as JSize,
                count as JSize,
                argb_chunk.as_mut_ptr(),
            );
        }
        if unsafe { exc_check(env) } != 0 {
            return core::ptr::null_mut();
        }
        convert_argb8888_i32_chunk_to_rgba8_slice(
            &argb_chunk[..count],
            &mut rgba_chunk[..count * 4],
        );
        unsafe {
            set_region(
                env,
                out_arr,
                (offset * 4) as JSize,
                (count * 4) as JSize,
                rgba_chunk.as_ptr() as *const i8,
            );
        }
        if unsafe { exc_check(env) } != 0 {
            return core::ptr::null_mut();
        }
        offset += count;
    }
    out_arr
}

#[cfg(test)]
mod tests {
    use super::*;

    #[repr(C)]
    struct MockJniEnv {
        vtable: *const *const c_void,
        input_pixels: Vec<i32>,
        output_bytes: Vec<u8>,
        pending_exception: bool,
        fail_get_region_on_call: Option<usize>,
        fail_set_region_on_call: Option<usize>,
        get_region_calls: usize,
        set_region_calls: usize,
    }

    unsafe extern "C" fn mock_get_array_len(env: JniEnvPtr, _arr: JObject) -> JSize {
        let state = unsafe { &*(env as *const MockJniEnv) };
        state.input_pixels.len() as JSize
    }

    unsafe extern "C" fn mock_new_byte_array(env: JniEnvPtr, len: JSize) -> JByteArray {
        let state = unsafe { &mut *(env as *mut MockJniEnv) };
        state.output_bytes = vec![0u8; len as usize];
        (&raw mut state.output_bytes) as JByteArray
    }

    unsafe extern "C" fn mock_get_int_region(
        env: JniEnvPtr,
        _arr: JIntArray,
        start: JSize,
        len: JSize,
        buf: *mut JInt,
    ) {
        let state = unsafe { &mut *(env as *mut MockJniEnv) };
        assert!(
            !state.pending_exception,
            "must never call GetIntArrayRegion with pending exception"
        );
        let call_idx = state.get_region_calls;
        state.get_region_calls += 1;
        if state.fail_get_region_on_call == Some(call_idx) {
            state.pending_exception = true;
            return;
        }
        let s = start as usize;
        let n = len as usize;
        let dst = unsafe { core::slice::from_raw_parts_mut(buf, n) };
        dst.copy_from_slice(&state.input_pixels[s..s + n]);
    }

    unsafe extern "C" fn mock_set_byte_region(
        env: JniEnvPtr,
        _arr: JByteArray,
        start: JSize,
        len: JSize,
        buf: *const i8,
    ) {
        let state = unsafe { &mut *(env as *mut MockJniEnv) };
        assert!(
            !state.pending_exception,
            "must never call SetByteArrayRegion with pending exception"
        );
        let call_idx = state.set_region_calls;
        state.set_region_calls += 1;
        if state.fail_set_region_on_call == Some(call_idx) {
            state.pending_exception = true;
            return;
        }
        let s = start as usize;
        let n = len as usize;
        let src = unsafe { core::slice::from_raw_parts(buf as *const u8, n) };
        state.output_bytes[s..s + n].copy_from_slice(src);
    }

    unsafe extern "C" fn mock_exception_check(env: JniEnvPtr) -> JBoolean {
        let state = unsafe { &*(env as *const MockJniEnv) };
        u8::from(state.pending_exception)
    }

    fn build_mock_vtable() -> [*const c_void; 232] {
        let mut table = [core::ptr::null(); 232];
        table[JNI_GET_ARRAY_LENGTH_INDEX] = mock_get_array_len as *const c_void;
        table[JNI_NEW_BYTE_ARRAY_INDEX] = mock_new_byte_array as *const c_void;
        table[JNI_GET_INT_ARRAY_REGION_INDEX] = mock_get_int_region as *const c_void;
        table[JNI_SET_BYTE_ARRAY_REGION_INDEX] = mock_set_byte_region as *const c_void;
        table[JNI_EXCEPTION_CHECK_INDEX] = mock_exception_check as *const c_void;
        table
    }

    #[test]
    fn pdf_jni_streaming_aborts_immediately_on_exception_and_streams_multi_chunk() {
        let vtable = build_mock_vtable();
        let fake_arr = 0x1000usize as JIntArray;

        // 1. Multi-chunk success (5000 pixels > 4096 chunk size -> 2 Get + 2 Set calls).
        let mut env = MockJniEnv {
            vtable: vtable.as_ptr(),
            input_pixels: vec![0xFF11_2233_u32 as i32; 5000],
            output_bytes: Vec::new(),
            pending_exception: false,
            fail_get_region_on_call: None,
            fail_set_region_on_call: None,
            get_region_calls: 0,
            set_region_calls: 0,
        };
        let out = unsafe {
            Java_app_affine_pro_host_NativeBridge_nativePdfConvertArgbToRgba(
                (&raw mut env) as JniEnvPtr,
                core::ptr::null_mut(),
                fake_arr,
                100,
                50,
            )
        };
        assert!(!out.is_null());
        assert_eq!(env.get_region_calls, 2);
        assert_eq!(env.set_region_calls, 2);
        assert_eq!(&env.output_bytes[0..4], &[0x11, 0x22, 0x33, 0xFF]);
        assert_eq!(
            &env.output_bytes[4999 * 4..5000 * 4],
            &[0x11, 0x22, 0x33, 0xFF]
        );

        // 2. Pending exception raised during chunk 1 GetIntArrayRegion -> aborts before SetByteArrayRegion #1.
        let mut env_fail_get = MockJniEnv {
            vtable: vtable.as_ptr(),
            input_pixels: vec![0xFF11_2233_u32 as i32; 5000],
            output_bytes: Vec::new(),
            pending_exception: false,
            fail_get_region_on_call: Some(1),
            fail_set_region_on_call: None,
            get_region_calls: 0,
            set_region_calls: 0,
        };
        let out_fail_get = unsafe {
            Java_app_affine_pro_host_NativeBridge_nativePdfConvertArgbToRgba(
                (&raw mut env_fail_get) as JniEnvPtr,
                core::ptr::null_mut(),
                fake_arr,
                100,
                50,
            )
        };
        assert!(out_fail_get.is_null());
        assert_eq!(env_fail_get.get_region_calls, 2);
        assert_eq!(env_fail_get.set_region_calls, 1);

        // 3. Pending exception raised during chunk 0 SetByteArrayRegion -> aborts before chunk 1 GetIntArrayRegion.
        let mut env_fail_set = MockJniEnv {
            vtable: vtable.as_ptr(),
            input_pixels: vec![0xFF11_2233_u32 as i32; 5000],
            output_bytes: Vec::new(),
            pending_exception: false,
            fail_get_region_on_call: None,
            fail_set_region_on_call: Some(0),
            get_region_calls: 0,
            set_region_calls: 0,
        };
        let out_fail_set = unsafe {
            Java_app_affine_pro_host_NativeBridge_nativePdfConvertArgbToRgba(
                (&raw mut env_fail_set) as JniEnvPtr,
                core::ptr::null_mut(),
                fake_arr,
                100,
                50,
            )
        };
        assert!(out_fail_set.is_null());
        assert_eq!(env_fail_set.get_region_calls, 1);
        assert_eq!(env_fail_set.set_region_calls, 1);
    }
}
