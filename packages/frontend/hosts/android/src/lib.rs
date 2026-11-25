#![deny(unsafe_code)]

//! Thin Android host bridge for AFFiNE (`affine-android-host`).
//!
//! Provides cross-platform testable host state machines (four-phase predictive
//! and legacy single-commit back gesture handling, API 26+ Autofill gating,
//! physical-px to logical-dp inset conversion, and legacy `https://localhost`
//! `localStorage` whitelist sentinel parsing) alongside hand-written thin JNI
//! exports compiled on Android and unit tests.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

mod ime;

/// Legacy Capacitor Android WebView origin used for one-shot `localStorage` probing.
pub const LEGACY_ANDROID_ORIGIN: &str = "https://localhost";

/// Minimum Android API level that provides `android.view.autofill.AutofillManager`.
pub const AUTOFILL_MIN_SDK_INT: u32 = 26;

/// Returns `true` when Android `AutofillManager` APIs exist (`sdk_int >= 26`).
pub const fn should_expose_autofill(sdk_int: u32) -> bool {
    sdk_int >= AUTOFILL_MIN_SDK_INT
}

/// Logical-dp window insets forwarded across the Android JNI boundary.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct LogicalWindowInsets {
    pub safe_top: f32,
    pub safe_right: f32,
    pub safe_bottom: f32,
    pub safe_left: f32,
    /// Absolute keyboard overlap height from the window bottom edge in logical `dp`.
    /// Does not subtract `safe_bottom`; `ui::WindowInsets::effective()` takes the max.
    pub ime_bottom: f32,
}

/// Converts Android `WindowInsets` physical pixel measurements into logical `dp`.
///
/// Supports any positive finite density (including `0.75` `ldpi`) and preserves
/// `ime_bottom_px` as an absolute bottom overlap height so Rust
/// `ui::WindowInsets::effective()` can merge `safe_area.bottom.max(ime.bottom)`.
pub fn physical_insets_to_logical_dp(
    safe_top_px: i32,
    safe_right_px: i32,
    safe_bottom_px: i32,
    safe_left_px: i32,
    ime_bottom_px: i32,
    density: f32,
) -> LogicalWindowInsets {
    let safe_density = if density.is_finite() && density > 0.0 {
        density
    } else {
        1.0
    };
    let top = safe_top_px.max(0);
    let right = safe_right_px.max(0);
    let bottom = safe_bottom_px.max(0);
    let left = safe_left_px.max(0);
    let ime = ime_bottom_px.max(0);
    LogicalWindowInsets {
        safe_top: top as f32 / safe_density,
        safe_right: right as f32 / safe_density,
        safe_bottom: bottom as f32 / safe_density,
        safe_left: left as f32 / safe_density,
        ime_bottom: ime as f32 / safe_density,
    }
}

/// Four-phase predictive back gesture protocol (plus legacy single-shot `Commit`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub enum BackGesturePhase {
    Start = 0,
    Progress = 1,
    Cancel = 2,
    Commit = 3,
}

impl BackGesturePhase {
    /// Converts a raw JNI integer code into a [`BackGesturePhase`].
    pub const fn from_code(code: i32) -> Option<Self> {
        match code {
            0 => Some(Self::Start),
            1 => Some(Self::Progress),
            2 => Some(Self::Cancel),
            3 => Some(Self::Commit),
            _ => None,
        }
    }
}

/// Lifecycle state emitted by [`BackGestureMachine`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BackGestureState {
    Idle,
    Active { progress: f32 },
    Committed,
    Cancelled,
}

/// Error returned when a back transition violates the four-phase contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackGestureError {
    AlreadyActive,
    NotActive,
    InvalidProgress,
}

/// Deterministic four-phase state machine for Android back navigation.
///
/// Supports both Android 14+ predictive gestures (`Start -> Progress* -> Commit|Cancel`)
/// and legacy/hardware single-shot back key commits (`Idle|Committed|Cancelled -> Commit`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BackGestureMachine {
    state: BackGestureState,
}

impl Default for BackGestureMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl BackGestureMachine {
    /// Creates a new idle back gesture state machine.
    pub const fn new() -> Self {
        Self {
            state: BackGestureState::Idle,
        }
    }

    /// Returns the current gesture state.
    pub const fn state(&self) -> BackGestureState {
        self.state
    }

    /// Applies one back event and returns the updated state.
    pub fn transition(
        &mut self,
        phase: BackGesturePhase,
        progress: f32,
    ) -> Result<BackGestureState, BackGestureError> {
        if !progress.is_finite() {
            return Err(BackGestureError::InvalidProgress);
        }
        let clamped = progress.clamp(0.0, 1.0);
        match (self.state, phase) {
            (
                BackGestureState::Idle | BackGestureState::Committed | BackGestureState::Cancelled,
                BackGesturePhase::Start,
            ) => {
                self.state = BackGestureState::Active { progress: clamped };
                Ok(self.state)
            }
            (BackGestureState::Active { .. }, BackGesturePhase::Start) => {
                Err(BackGestureError::AlreadyActive)
            }
            (BackGestureState::Active { .. }, BackGesturePhase::Progress) => {
                self.state = BackGestureState::Active { progress: clamped };
                Ok(self.state)
            }
            (BackGestureState::Active { .. }, BackGesturePhase::Cancel) => {
                self.state = BackGestureState::Cancelled;
                Ok(self.state)
            }
            (_, BackGesturePhase::Commit) => {
                self.state = BackGestureState::Committed;
                Ok(self.state)
            }
            (
                BackGestureState::Idle | BackGestureState::Committed | BackGestureState::Cancelled,
                BackGesturePhase::Progress | BackGesturePhase::Cancel,
            ) => Err(BackGestureError::NotActive),
        }
    }
}

/// Default observable first-frame clear color (opaque `#141414` ARGB).
pub const DEFAULT_CLEAR_COLOR_ARGB: u32 = 0xFF14_1414;

/// Pure safe-Rust state held behind an Android JNI host handle.
#[derive(Debug, Clone)]
pub struct AndroidHostState {
    pub back_gesture: BackGestureMachine,
    pub has_back_destination: bool,
    pub insets: LogicalWindowInsets,
    pub surface_active: bool,
    pub surface_bound: bool,
    pub surface_width_px: u32,
    pub surface_height_px: u32,
    pub frame_count: u64,
    pub last_frame_nanos: i64,
    pub clear_color_argb: u32,
    pub utf16_text: Vec<u16>,
    pub selected_start: usize,
    pub selected_len: usize,
    pub composing_start: Option<usize>,
    pub composing_len: usize,
}

impl Default for AndroidHostState {
    fn default() -> Self {
        Self {
            back_gesture: BackGestureMachine::new(),
            has_back_destination: false,
            insets: LogicalWindowInsets::default(),
            surface_active: false,
            surface_bound: false,
            surface_width_px: 0,
            surface_height_px: 0,
            frame_count: 0,
            last_frame_nanos: 0,
            clear_color_argb: DEFAULT_CLEAR_COLOR_ARGB,
            utf16_text: Vec::new(),
            selected_start: 0,
            selected_len: 0,
            composing_start: None,
            composing_len: 0,
        }
    }
}

impl AndroidHostState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Decodes the authoritative UTF-16 buffer into a Rust `String`.
    /// Handles a back gesture phase; returns `true` only when the host consumed
    /// the event (an unconsumed `Commit` at the navigation root returns `false`
    /// so Android delegates to the system back action).
    pub fn handle_back_phase(&mut self, phase: BackGesturePhase, progress: f32) -> bool {
        if phase == BackGesturePhase::Commit && !self.has_back_destination {
            let _ = self.back_gesture.transition(phase, progress);
            return false;
        }
        self.back_gesture.transition(phase, progress).is_ok()
    }
}

/// Positive sentinel payload parsed from the legacy Android `https://localhost`
/// `localStorage` probe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LegacyLocalStorageSnapshot {
    pub origin: String,
    pub length: usize,
    pub keys: Vec<String>,
    pub entries: BTreeMap<String, String>,
}

/// Error returned while validating a legacy `localStorage` sentinel payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LegacyProbeError {
    InvalidJson(String),
    UnexpectedOrigin(String),
}

/// Parses and validates a legacy `https://localhost` `localStorage` probe JSON
/// payload, retaining only explicitly whitelisted keys in deterministic order.
///
/// Accepts both direct JSON objects (from `WebView.evaluateJavascript` returning
/// a JS object) and JSON-encoded JSON strings (double-encoded `JSON.stringify`
/// results from `WebView.evaluateJavascript`).
pub fn parse_legacy_local_storage_probe(
    payload_json: &str,
    allowed_keys: &[&str],
) -> Result<LegacyLocalStorageSnapshot, LegacyProbeError> {
    let trimmed = payload_json.trim();
    let unwrapped_owned: String;
    let effective_json = if trimmed.starts_with('"') {
        unwrapped_owned = serde_json::from_str::<String>(trimmed)
            .map_err(|err| LegacyProbeError::InvalidJson(err.to_string()))?;
        unwrapped_owned.as_str()
    } else {
        trimmed
    };
    let raw: LegacyLocalStorageSnapshot = serde_json::from_str(effective_json)
        .map_err(|err| LegacyProbeError::InvalidJson(err.to_string()))?;

    if raw.origin != LEGACY_ANDROID_ORIGIN {
        return Err(LegacyProbeError::UnexpectedOrigin(raw.origin));
    }

    let allow_set: BTreeSet<&str> = allowed_keys.iter().copied().collect();
    let mut entries = BTreeMap::new();
    for (k, v) in raw.entries {
        if allow_set.contains(k.as_str()) {
            entries.insert(k, v);
        }
    }
    let keys: Vec<String> = entries.keys().cloned().collect();

    Ok(LegacyLocalStorageSnapshot {
        origin: raw.origin,
        length: raw.length,
        keys,
        entries,
    })
}

#[cfg(any(target_os = "android", test, feature = "host-jni"))]
pub mod jni_bridge;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn autofill_gate_enforces_api_26_floor() {
        let cases = [
            (21, false),
            (24, false),
            (25, false),
            (26, true),
            (33, true),
            (35, true),
        ];
        for (sdk_int, expected) in cases {
            assert_eq!(should_expose_autofill(sdk_int), expected);
        }
    }

    #[test]
    fn back_gesture_supports_four_phase_predictive_and_legacy_single_commit() {
        let mut machine = BackGestureMachine::new();
        assert_eq!(machine.state(), BackGestureState::Idle);
        assert_eq!(
            machine.transition(BackGesturePhase::Progress, 0.2),
            Err(BackGestureError::NotActive)
        );
        assert_eq!(
            machine.transition(BackGesturePhase::Cancel, 0.0),
            Err(BackGestureError::NotActive)
        );
        // Non-predictive / hardware back key commits directly from Idle.
        assert_eq!(
            machine.transition(BackGesturePhase::Commit, 1.0),
            Ok(BackGestureState::Committed)
        );

        // Predictive 4-phase flow.
        assert_eq!(
            machine.transition(BackGesturePhase::Start, 0.0),
            Ok(BackGestureState::Active { progress: 0.0 })
        );
        assert_eq!(
            machine.transition(BackGesturePhase::Start, 0.1),
            Err(BackGestureError::AlreadyActive)
        );
        assert_eq!(
            machine.transition(BackGesturePhase::Progress, 1.5),
            Ok(BackGestureState::Active { progress: 1.0 })
        );
        assert_eq!(
            machine.transition(BackGesturePhase::Cancel, 0.0),
            Ok(BackGestureState::Cancelled)
        );
        // Legacy single-shot Commit after Cancel also succeeds.
        assert_eq!(
            machine.transition(BackGesturePhase::Commit, 1.0),
            Ok(BackGestureState::Committed)
        );
    }

    #[test]
    fn physical_insets_convert_to_logical_dp_including_ldpi_density() {
        let cases = [
            (
                (120, 0, 72, 0, 900, 3.0_f32),
                LogicalWindowInsets {
                    safe_top: 40.0,
                    safe_right: 0.0,
                    safe_bottom: 24.0,
                    safe_left: 0.0,
                    ime_bottom: 300.0,
                },
            ),
            (
                (18, 0, 12, 0, 162, 0.75_f32),
                LogicalWindowInsets {
                    safe_top: 24.0,
                    safe_right: 0.0,
                    safe_bottom: 16.0,
                    safe_left: 0.0,
                    ime_bottom: 216.0,
                },
            ),
            (
                (-10, 0, 20, 40, 10, 0.0_f32),
                LogicalWindowInsets {
                    safe_top: 0.0,
                    safe_right: 0.0,
                    safe_bottom: 20.0,
                    safe_left: 40.0,
                    ime_bottom: 10.0,
                },
            ),
        ];

        for ((top, right, bottom, left, ime, density), expected) in cases {
            assert_eq!(
                physical_insets_to_logical_dp(top, right, bottom, left, ime, density),
                expected
            );
        }
    }

    #[test]
    fn legacy_local_storage_probe_validates_origin_and_filters_allowlist() {
        let payload = r#"{
            "origin": "https://localhost",
            "length": 3,
            "keys": ["affine_theme", "secret_token", "affine_server_url"],
            "entries": {
                "affine_theme": "dark",
                "secret_token": "must-not-pass",
                "affine_server_url": "https://app.affine.pro"
            }
        }"#;

        let snapshot =
            parse_legacy_local_storage_probe(payload, &["affine_theme", "affine_server_url"])
                .expect("valid https://localhost probe should parse");

        assert_eq!(snapshot.origin, "https://localhost");
        assert_eq!(snapshot.length, 3);
        assert_eq!(
            snapshot.keys,
            vec!["affine_server_url".to_string(), "affine_theme".to_string()]
        );
        assert!(!snapshot.entries.contains_key("secret_token"));

        assert_eq!(
            parse_legacy_local_storage_probe(
                r#"{"origin":"https://evil.example","length":1,"keys":[],"entries":{}}"#,
                &["affine_theme"]
            ),
            Err(LegacyProbeError::UnexpectedOrigin(
                "https://evil.example".to_string()
            ))
        );

        // WebView.evaluateJavascript double-encoded string literal and "null".
        let double_encoded = serde_json::to_string(payload).unwrap();
        let snapshot2 = parse_legacy_local_storage_probe(&double_encoded, &["affine_theme"])
            .expect("double-encoded evaluateJavascript payload should unwrap and parse");
        assert_eq!(snapshot2.keys, vec!["affine_theme".to_string()]);
        assert_eq!(
            snapshot2.entries.get("affine_theme").map(String::as_str),
            Some("dark")
        );
        assert!(matches!(
            parse_legacy_local_storage_probe("null", &["affine_theme"]),
            Err(LegacyProbeError::InvalidJson(_))
        ));
    }

    #[test]
    #[allow(unsafe_code)]
    fn jni_bridge_lifecycle_negative_tbi_handle_and_utf16_ime_contract() {
        use core::ffi::c_void;

        const GET_STRING_LENGTH_INDEX: usize = 164;
        const GET_STRING_CHARS_INDEX: usize = 165;
        const RELEASE_STRING_CHARS_INDEX: usize = 166;

        struct FakeJString {
            units: Vec<u16>,
        }

        unsafe extern "C" fn fake_get_string_length(
            _env: jni_bridge::JniEnvPtr,
            string: jni_bridge::JString,
        ) -> jni_bridge::JInt {
            if string.is_null() {
                return 0;
            }
            let s = unsafe { &*(string as *const FakeJString) };
            s.units.len() as jni_bridge::JInt
        }

        unsafe extern "C" fn fake_get_string_chars(
            _env: jni_bridge::JniEnvPtr,
            string: jni_bridge::JString,
            is_copy: *mut jni_bridge::JBoolean,
        ) -> *const u16 {
            if !is_copy.is_null() {
                unsafe { *is_copy = 0 };
            }
            if string.is_null() {
                return core::ptr::null();
            }
            let s = unsafe { &*(string as *const FakeJString) };
            s.units.as_ptr()
        }

        unsafe extern "C" fn fake_release_string_chars(
            _env: jni_bridge::JniEnvPtr,
            _string: jni_bridge::JString,
            _chars: *const u16,
        ) {
        }

        let mut vtable = [core::ptr::null::<c_void>(); 170];
        vtable[GET_STRING_LENGTH_INDEX] = fake_get_string_length as *const () as *const c_void;
        vtable[GET_STRING_CHARS_INDEX] = fake_get_string_chars as *const () as *const c_void;
        vtable[RELEASE_STRING_CHARS_INDEX] =
            fake_release_string_chars as *const () as *const c_void;
        let mut env_ptr: *const *const c_void = vtable.as_ptr();
        let env: jni_bridge::JniEnvPtr = (&mut env_ptr as *mut *const *const c_void).cast();

        let null = core::ptr::null_mut();
        assert_eq!(
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeShouldExposeAutofill(
                env, null, 25
            ),
            0
        );
        assert_eq!(
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeShouldExposeAutofill(
                env, null, 26
            ),
            1
        );

        // Zero handle is a safe no-op.
        assert_eq!(
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(env, null, 0, 1),
            0
        );
        assert_eq!(
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnBackGesturePhase(
                env, null, 0, 3, 1.0
            ),
            0
        );

        // Exercise both a normal positive handle and an ARM64 TBI negative handle.
        let pos_handle =
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeCreateHost(env, null);
        assert_ne!(pos_handle, 0);

        let neg_tbi_handle: i64 = -0x4bff_ff85_0000_1000_i64;
        assert!(neg_tbi_handle < 0);
        jni_bridge::insert_test_host(neg_tbi_handle, AndroidHostState::new());

        let mut fake_surface_tag: u8 = 1;
        let fake_surface = (&mut fake_surface_tag as *mut u8).cast::<c_void>();

        for handle in [pos_handle, neg_tbi_handle] {
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceCreated(
                env,
                null,
                handle,
                fake_surface,
            );
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceChanged(
                env, null, handle, 1080, 2400,
            );
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceInsetsPx(
                env, null, handle, 96, 0, 48, 0, 648, 3.0,
            );
            let clear_argb = jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(
                env, null, handle, 16_666_667,
            );
            assert_eq!(clear_argb as u32, DEFAULT_CLEAR_COLOR_ARGB);

            // At root (has_back_destination = false), Commit returns 0 so system handles back.
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnBackGesturePhase(
                    env, null, handle, 3, 1.0
                ),
                0
            );
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeSetHasBackDestination(
                env, null, handle, 1,
            );
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnBackGesturePhase(
                    env, null, handle, 3, 1.0
                ),
                1
            );

            // Real UTF-16 JNI string decoding: distinguish "中" vs "文" and preserve Emoji surrogate pairs.
            let mut zhong = FakeJString {
                units: "中".encode_utf16().collect(),
            };
            let mut wen_emoji = FakeJString {
                units: "文😀".encode_utf16().collect(),
            };
            let mut composing = FakeJString {
                units: "ni".encode_utf16().collect(),
            };
            unsafe {
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                    env,
                    null,
                    handle,
                    (&mut zhong as *mut FakeJString).cast(),
                    1,
                );
                assert_eq!(jni_bridge::snapshot_text(handle).as_deref(), Some("中"));
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                    env,
                    null,
                    handle,
                    (&mut wen_emoji as *mut FakeJString).cast(),
                    1,
                );
                assert_eq!(jni_bridge::snapshot_text(handle).as_deref(), Some("中文😀"));
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingText(
                    env,
                    null,
                    handle,
                    (&mut composing as *mut FakeJString).cast(),
                    1,
                );
                assert_eq!(
                    jni_bridge::snapshot_text(handle).as_deref(),
                    Some("中文😀ni")
                );
                // Commit replaces active composing span.
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                    env,
                    null,
                    handle,
                    (&mut zhong as *mut FakeJString).cast(),
                    1,
                );
                assert_eq!(
                    jni_bridge::snapshot_text(handle).as_deref(),
                    Some("中文😀中")
                );
            }

            // Delete 1 char before caret ("中"), then delete 1 UTF-16 unit before caret which
            // expands to the entire surrogate pair ("😀") so no lone surrogate remains.
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingText(
                env, null, handle, 1, 0,
            );
            assert_eq!(jni_bridge::snapshot_text(handle).as_deref(), Some("中文😀"));
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingText(
                env, null, handle, 1, 0,
            );
            assert_eq!(jni_bridge::snapshot_text(handle).as_deref(), Some("中文"));

            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceDestroyed(
                env, null, handle,
            );
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeDestroyHost(env, null, handle);

            // Post-destroy dangling handle is a safe no-op (never dereferences freed memory).
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(
                    env, null, handle, 33_333_334
                ),
                0
            );
            assert_eq!(jni_bridge::snapshot_text(handle), None);
        }
    }

    #[test]
    #[allow(unsafe_code)]
    fn android_ime_jni_bridge_matches_host_ime_model() {
        use core::ffi::c_void;

        const GET_STRING_LENGTH_INDEX: usize = 164;
        const GET_STRING_CHARS_INDEX: usize = 165;
        const RELEASE_STRING_CHARS_INDEX: usize = 166;

        struct FakeJString {
            units: Vec<u16>,
        }

        unsafe extern "C" fn fake_len(
            _env: jni_bridge::JniEnvPtr,
            s: jni_bridge::JString,
        ) -> jni_bridge::JInt {
            if s.is_null() {
                0
            } else {
                unsafe { &*(s as *const FakeJString) }.units.len() as jni_bridge::JInt
            }
        }
        unsafe extern "C" fn fake_chars(
            _env: jni_bridge::JniEnvPtr,
            s: jni_bridge::JString,
            is_copy: *mut jni_bridge::JBoolean,
        ) -> *const u16 {
            if !is_copy.is_null() {
                unsafe { *is_copy = 0 };
            }
            if s.is_null() {
                core::ptr::null()
            } else {
                unsafe { &*(s as *const FakeJString) }.units.as_ptr()
            }
        }
        unsafe extern "C" fn fake_release(
            _env: jni_bridge::JniEnvPtr,
            _s: jni_bridge::JString,
            _c: *const u16,
        ) {
        }

        /// Mirror of AOSP `BaseInputConnection` (`Editable` + `Selection` + `ComposingText`)
        /// that drives both platform `Editable` state and `jni_bridge` in lockstep.
        struct TestInputConnection {
            editable: Vec<u16>,
            sel_start: usize,
            sel_end: usize,
            composing: Option<(usize, usize)>,
            handle: jni_bridge::JLong,
            vtable: [*const c_void; 170],
        }

        impl TestInputConnection {
            fn new() -> Self {
                let mut vtable = [core::ptr::null::<c_void>(); 170];
                vtable[GET_STRING_LENGTH_INDEX] = fake_len as *const () as *const c_void;
                vtable[GET_STRING_CHARS_INDEX] = fake_chars as *const () as *const c_void;
                vtable[RELEASE_STRING_CHARS_INDEX] = fake_release as *const () as *const c_void;
                let null = core::ptr::null_mut();
                let handle =
                    jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeCreateHost(null, null);
                Self {
                    editable: Vec::new(),
                    sel_start: 0,
                    sel_end: 0,
                    composing: None,
                    handle,
                    vtable,
                }
            }

            fn env_ptr(&self) -> *const *const c_void {
                self.vtable.as_ptr()
            }

            fn assert_lockstep(&self) {
                let aosp_text = String::from_utf16_lossy(&self.editable);
                assert_eq!(jni_bridge::snapshot_text(self.handle), Some(aosp_text));
                assert_eq!(
                    jni_bridge::snapshot_selection(self.handle),
                    Some((self.sel_start, self.sel_end))
                );
                assert_eq!(
                    jni_bridge::snapshot_composing(self.handle),
                    Some(self.composing)
                );
            }

            fn replace_aosp(&mut self, text: &str, new_cursor_pos: i32, composing: bool) {
                let units: Vec<u16> = text.encode_utf16().collect();
                let (a, b) = self.composing.unwrap_or((self.sel_start, self.sel_end));
                self.editable.splice(a..b, units.iter().copied());
                self.composing = if composing && !units.is_empty() {
                    Some((a, a + units.len()))
                } else {
                    None
                };
                let cursor = if new_cursor_pos > 0 {
                    a.saturating_add(units.len())
                        .saturating_add((new_cursor_pos - 1) as usize)
                        .min(self.editable.len())
                } else {
                    a.saturating_sub(new_cursor_pos.unsigned_abs() as usize)
                        .min(self.editable.len())
                };
                self.sel_start = cursor;
                self.sel_end = cursor;
            }

            fn commit_text(&mut self, text: &str, new_cursor_pos: i32) {
                let mut env_p = self.env_ptr();
                let env: jni_bridge::JniEnvPtr = (&mut env_p as *mut *const *const c_void).cast();
                let mut js = FakeJString {
                    units: text.encode_utf16().collect(),
                };
                unsafe {
                    jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                        env,
                        core::ptr::null_mut(),
                        self.handle,
                        (&mut js as *mut FakeJString).cast(),
                        new_cursor_pos,
                    );
                }
                self.replace_aosp(text, new_cursor_pos, false);
                self.assert_lockstep();
            }

            fn set_composing_text(&mut self, text: &str, new_cursor_pos: i32) {
                let mut env_p = self.env_ptr();
                let env: jni_bridge::JniEnvPtr = (&mut env_p as *mut *const *const c_void).cast();
                let mut js = FakeJString {
                    units: text.encode_utf16().collect(),
                };
                unsafe {
                    jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingText(
                        env,
                        core::ptr::null_mut(),
                        self.handle,
                        (&mut js as *mut FakeJString).cast(),
                        new_cursor_pos,
                    );
                }
                self.replace_aosp(text, new_cursor_pos, true);
                self.assert_lockstep();
            }

            fn finish_composing_text(&mut self) {
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFinishComposingText(
                    core::ptr::null_mut(),
                    core::ptr::null_mut(),
                    self.handle,
                );
                self.composing = None;
                self.assert_lockstep();
            }

            fn set_selection(&mut self, start: i32, end: i32) {
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetSelection(
                    core::ptr::null_mut(),
                    core::ptr::null_mut(),
                    self.handle,
                    start,
                    end,
                );
                let len = self.editable.len();
                let a = usize::try_from(start).unwrap_or(0).min(len);
                let b = usize::try_from(end).unwrap_or(0).min(len);
                self.sel_start = a.min(b);
                self.sel_end = a.max(b);
                self.assert_lockstep();
            }

            fn delete_surrounding_text(&mut self, before_len: i32, after_len: i32) -> bool {
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingText(
                    core::ptr::null_mut(),
                    core::ptr::null_mut(),
                    self.handle,
                    before_len,
                    after_len,
                );
                if before_len < 0 || after_len < 0 {
                    self.assert_lockstep();
                    return false;
                }
                let (mut a, mut b) = (self.sel_start, self.sel_end);
                if let Some((cs, ce)) = self.composing {
                    a = a.min(cs);
                    b = b.max(ce);
                }
                let after = after_len as usize;
                if after > 0 && b < self.editable.len() {
                    let mut end = b.saturating_add(after).min(self.editable.len());
                    if end > b
                        && end < self.editable.len()
                        && (0xD800..=0xDBFF).contains(&self.editable[end - 1])
                        && (0xDC00..=0xDFFF).contains(&self.editable[end])
                    {
                        end += 1;
                    }
                    self.editable.drain(b..end);
                }
                let before = before_len as usize;
                if before > 0 && a > 0 {
                    let mut start = a.saturating_sub(before);
                    if start > 0
                        && start < a
                        && (0xD800..=0xDBFF).contains(&self.editable[start - 1])
                        && (0xDC00..=0xDFFF).contains(&self.editable[start])
                    {
                        start -= 1;
                    }
                    let removed = a - start;
                    self.editable.drain(start..a);
                    self.sel_start -= removed;
                    self.sel_end -= removed;
                    if let Some((cs, ce)) = self.composing {
                        self.composing = Some((cs - removed, ce - removed));
                    }
                }
                self.assert_lockstep();
                true
            }
        }

        impl Drop for TestInputConnection {
            fn drop(&mut self) {
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeDestroyHost(
                    core::ptr::null_mut(),
                    core::ptr::null_mut(),
                    self.handle,
                );
            }
        }

        // 1. Empty editor: setComposingText("ab", 1) -> deleteSurroundingText(1, 0) keeps "ab" & composing (0, 2).
        let mut ic1 = TestInputConnection::new();
        ic1.set_composing_text("ab", 1);
        assert!(ic1.delete_surrounding_text(1, 0));
        assert_eq!(jni_bridge::snapshot_text(ic1.handle).as_deref(), Some("ab"));
        assert_eq!(jni_bridge::snapshot_selection(ic1.handle), Some((2, 2)));
        assert_eq!(
            jni_bridge::snapshot_composing(ic1.handle),
            Some(Some((0, 2)))
        );

        // 2. "x" + composing "ab" -> deleteSurroundingText(1, 0) removes "x" before composing, commit "中" => "中".
        let mut ic2 = TestInputConnection::new();
        ic2.commit_text("x", 1);
        ic2.set_composing_text("ab", 1);
        assert!(ic2.delete_surrounding_text(1, 0));
        assert_eq!(jni_bridge::snapshot_text(ic2.handle).as_deref(), Some("ab"));
        assert_eq!(jni_bridge::snapshot_selection(ic2.handle), Some((2, 2)));
        assert_eq!(
            jni_bridge::snapshot_composing(ic2.handle),
            Some(Some((0, 2)))
        );
        ic2.commit_text("中", 1);
        assert_eq!(jni_bridge::snapshot_text(ic2.handle).as_deref(), Some("中"));
        assert_eq!(jni_bridge::snapshot_selection(ic2.handle), Some((1, 1)));
        assert_eq!(jni_bridge::snapshot_composing(ic2.handle), Some(None));

        // 3. setComposingText("中", 1) -> finishComposingText() -> commitText("文", 1) => "中文".
        let mut ic3 = TestInputConnection::new();
        ic3.set_composing_text("中", 1);
        ic3.finish_composing_text();
        ic3.commit_text("文", 1);
        assert_eq!(
            jni_bridge::snapshot_text(ic3.handle).as_deref(),
            Some("中文")
        );
        assert_eq!(jni_bridge::snapshot_selection(ic3.handle), Some((2, 2)));

        // 4. commitText("AB", 1) -> setSelection(0, 1) -> commitText("X", 1) => "XB".
        let mut ic4 = TestInputConnection::new();
        ic4.commit_text("AB", 1);
        ic4.set_selection(0, 1);
        ic4.commit_text("X", 1);
        assert_eq!(jni_bridge::snapshot_text(ic4.handle).as_deref(), Some("XB"));
        assert_eq!(jni_bridge::snapshot_selection(ic4.handle), Some((1, 1)));

        // 5. Emoji surrogate-pair boundary + negative deleteSurroundingText(-1, 1) rejected with zero side effects.
        let mut ic5 = TestInputConnection::new();
        ic5.commit_text("a😀b", 1);
        assert!(!ic5.delete_surrounding_text(-1, 1));
        assert_eq!(
            jni_bridge::snapshot_text(ic5.handle).as_deref(),
            Some("a😀b")
        );
        ic5.set_selection(3, 3); // Right after "😀" (UTF-16 indices 1..3)
        assert!(ic5.delete_surrounding_text(1, 0));
        assert_eq!(jni_bridge::snapshot_text(ic5.handle).as_deref(), Some("ab"));
        assert_eq!(jni_bridge::snapshot_selection(ic5.handle), Some((1, 1)));
    }

    #[test]
    #[allow(unsafe_code)]
    fn ime_composing_region_code_points_and_replace_text_jni_contract() {
        use core::ffi::c_void;

        const GET_STRING_LENGTH_INDEX: usize = 164;
        const GET_STRING_CHARS_INDEX: usize = 165;
        const RELEASE_STRING_CHARS_INDEX: usize = 166;

        struct FakeJString {
            units: Vec<u16>,
        }

        unsafe extern "C" fn fake_len(
            _env: jni_bridge::JniEnvPtr,
            s: jni_bridge::JString,
        ) -> jni_bridge::JInt {
            if s.is_null() {
                0
            } else {
                unsafe { &*(s as *const FakeJString) }.units.len() as jni_bridge::JInt
            }
        }
        unsafe extern "C" fn fake_chars(
            _env: jni_bridge::JniEnvPtr,
            s: jni_bridge::JString,
            is_copy: *mut jni_bridge::JBoolean,
        ) -> *const u16 {
            if !is_copy.is_null() {
                unsafe { *is_copy = 0 };
            }
            if s.is_null() {
                core::ptr::null()
            } else {
                unsafe { &*(s as *const FakeJString) }.units.as_ptr()
            }
        }
        unsafe extern "C" fn fake_release(
            _env: jni_bridge::JniEnvPtr,
            _s: jni_bridge::JString,
            _c: *const u16,
        ) {
        }

        let mut vtable = [core::ptr::null::<c_void>(); 170];
        vtable[GET_STRING_LENGTH_INDEX] = fake_len as *const () as *const c_void;
        vtable[GET_STRING_CHARS_INDEX] = fake_chars as *const () as *const c_void;
        vtable[RELEASE_STRING_CHARS_INDEX] = fake_release as *const () as *const c_void;
        let mut env_ptr: *const *const c_void = vtable.as_ptr();
        let env: jni_bridge::JniEnvPtr = (&mut env_ptr as *mut *const *const c_void).cast();
        let null = core::ptr::null_mut();

        // 1. setComposingRegion: normal, commit over region, reversed, empty clear, negative clamping.
        let h1 = jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeCreateHost(env, null);
        let mut ab = FakeJString {
            units: "AB".encode_utf16().collect(),
        };
        let mut x = FakeJString {
            units: "X".encode_utf16().collect(),
        };
        unsafe {
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                env,
                null,
                h1,
                (&mut ab as *mut FakeJString).cast(),
                1,
            );
        }
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingRegion(
            env, null, h1, 0, 1,
        );
        assert_eq!(jni_bridge::snapshot_composing(h1), Some(Some((0, 1))));
        assert_eq!(jni_bridge::snapshot_selection(h1), Some((2, 2)));
        unsafe {
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                env,
                null,
                h1,
                (&mut x as *mut FakeJString).cast(),
                1,
            );
        }
        assert_eq!(jni_bridge::snapshot_text(h1).as_deref(), Some("XB"));
        assert_eq!(jni_bridge::snapshot_selection(h1), Some((1, 1)));
        assert_eq!(jni_bridge::snapshot_composing(h1), Some(None));
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingRegion(
            env, null, h1, 2, -3,
        );
        assert_eq!(jni_bridge::snapshot_composing(h1), Some(Some((0, 2))));
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingRegion(
            env, null, h1, 1, 1,
        );
        assert_eq!(jni_bridge::snapshot_composing(h1), Some(None));
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeDestroyHost(env, null, h1);

        // 2. deleteSurroundingTextInCodePoints: valid emoji backward/forward + negative rejection.
        let h2 = jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeCreateHost(env, null);
        let mut emoji = FakeJString {
            units: "a😀b".encode_utf16().collect(),
        };
        unsafe {
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                env,
                null,
                h2,
                (&mut emoji as *mut FakeJString).cast(),
                1,
            );
        }
        assert_eq!(
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingTextInCodePoints(
                env, null, h2, -1, 0,
            ),
            0
        );
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetSelection(env, null, h2, 3, 3);
        assert_eq!(
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingTextInCodePoints(
                env, null, h2, 1, 0,
            ),
            1
        );
        assert_eq!(jni_bridge::snapshot_text(h2).as_deref(), Some("ab"));
        assert_eq!(jni_bridge::snapshot_selection(h2), Some((1, 1)));
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeDestroyHost(env, null, h2);

        // 3. Unpaired surrogate in delete_surrounding_text_in_code_points returns false with zero mutation.
        let mut lone_high = AndroidHostState::new();
        lone_high.utf16_text = vec!['a' as u16, 0xD83D, 'b' as u16];
        lone_high.selected_start = 2;
        lone_high.selected_len = 0;
        let orig_units = lone_high.utf16_text.clone();
        assert!(!lone_high.delete_surrounding_text_in_code_points(1, 0));
        assert_eq!(lone_high.utf16_text, orig_units);
        assert_eq!(lone_high.selection_range(), (2, 2));

        let mut lone_low = AndroidHostState::new();
        lone_low.utf16_text = vec!['a' as u16, 0xDE00, 'b' as u16];
        lone_low.selected_start = 1;
        lone_low.selected_len = 0;
        let orig_low = lone_low.utf16_text.clone();
        assert!(!lone_low.delete_surrounding_text_in_code_points(0, 1));
        assert_eq!(lone_low.utf16_text, orig_low);
        assert_eq!(lone_low.selection_range(), (1, 1));

        // 4. replaceText clears composing, updates text/cursor, and rejects negative indices.
        let h3 = jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeCreateHost(env, null);
        let mut hello = FakeJString {
            units: "hello".encode_utf16().collect(),
        };
        let mut rep = FakeJString {
            units: "i".encode_utf16().collect(),
        };
        unsafe {
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                env,
                null,
                h3,
                (&mut hello as *mut FakeJString).cast(),
                1,
            );
        }
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSetComposingRegion(
            env, null, h3, 0, 2,
        );
        unsafe {
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnReplaceText(
                    env,
                    null,
                    h3,
                    -1,
                    2,
                    (&mut rep as *mut FakeJString).cast(),
                    1,
                ),
                0
            );
            assert_eq!(jni_bridge::snapshot_text(h3).as_deref(), Some("hello"));
            assert_eq!(jni_bridge::snapshot_composing(h3), Some(Some((0, 2))));

            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnReplaceText(
                    env,
                    null,
                    h3,
                    1,
                    4,
                    (&mut rep as *mut FakeJString).cast(),
                    1,
                ),
                1
            );
        }
        assert_eq!(jni_bridge::snapshot_text(h3).as_deref(), Some("hio"));
        assert_eq!(jni_bridge::snapshot_composing(h3), Some(None));
        assert_eq!(jni_bridge::snapshot_selection(h3), Some((2, 2)));
        jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeDestroyHost(env, null, h3);
    }
}
