#![deny(unsafe_code)]

//! Thin Android host bridge for AFFiNE (`affine-android-host`).
//!
//! Provides cross-platform testable host state machines (four-phase predictive
//! and legacy single-commit back gesture handling, API 26+ Autofill gating,
//! physical-px to logical-dp inset conversion, `SurfaceHolder.Callback`
//! lifecycle, in-place SQLite WAL co-storage, Jetpack Preferences DataStore
//! `v1:` AES-GCM credential contract, and legacy `https://localhost`
//! `localStorage` whitelist import/rollback with zero IndexedDB access)
//! alongside hand-written thin JNI exports.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

#[cfg(target_os = "android")]
mod android_window;
pub mod datastore;
mod ime;
pub mod storage;
pub mod surface;

#[cfg(any(target_os = "android", test, feature = "host-jni"))]
pub mod jni_bridge;
#[cfg(any(target_os = "android", test, feature = "host-jni"))]
pub mod jni_storage;

pub use storage::{
    AndroidSqliteBridge, AndroidWorkspaceCatalog, LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
};
pub use surface::{
    AndroidRenderBackend, DEFAULT_CLEAR_COLOR_ARGB, SurfaceLifecycleState, SurfacePresentError,
};

/// Legacy Capacitor Android WebView origin used for one-shot `localStorage` probing.
pub const LEGACY_ANDROID_ORIGIN: &str = "https://localhost";

/// Exact allowlisted `localStorage` keys imported on upgrade from `0.27.5`
/// (`local.ts:58`, `storage.ts:83,91`, `auth.ts:59`).
pub const LEGACY_EXACT_ALLOWED_KEYS: &[&str] = &[
    LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
    "global-state:serverList",
    "global-cache:i18n_lng",
    "last_workspace_id",
    "last_workspace_flavour",
    "affine-settings",
    "theme",
];

/// Returns `true` when `key` matches the `0.27.5` Capacitor Android WebView
/// `localStorage` allowlist (exact keys + dynamic server/auth/flag keys).
pub fn is_allowed_legacy_local_storage_key(key: &str) -> bool {
    if LEGACY_EXACT_ALLOWED_KEYS.contains(&key) {
        return true;
    }
    if let Some(id) = key.strip_prefix("global-state:serverConfig:") {
        return !id.is_empty();
    }
    if let Some(rest) = key.strip_prefix("global-state:affine-flag:") {
        return !rest.is_empty();
    }
    if let Some(rest) = key.strip_prefix("affine-flag:") {
        return !rest.is_empty();
    }
    if let Some(rest) = key.strip_prefix("global-state:")
        && let Some(server_id) = rest.strip_suffix("-auth")
    {
        return !server_id.is_empty();
    }
    if let Some(server_id) = key.strip_suffix("-auth") {
        return !server_id.is_empty() && !server_id.contains(':');
    }
    false
}

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

/// Positive sentinel payload parsed from the legacy Android `https://localhost`
/// `localStorage` probe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LegacyLocalStorageSnapshot {
    pub origin: String,
    pub length: usize,
    pub keys: Vec<String>,
    pub entries: BTreeMap<String, String>,
    #[serde(default, rename = "removedKeys")]
    pub removed_keys: Vec<String>,
    #[serde(default, rename = "idbTouchCount")]
    pub idb_touch_count: u32,
}

/// Error returned while validating a legacy `localStorage` sentinel payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LegacyProbeError {
    InvalidJson(String),
    UnexpectedOrigin(String),
    IndexedDbTouched(u32),
    InconsistentSentinel(String),
}

/// Upgrade import gate distinguishing genuine fresh installs from probe failures.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum LegacyUpgradeImportState {
    #[default]
    Pending,
    FreshInstall,
    Imported(LegacyLocalStorageSnapshot),
    Failed(LegacyProbeError),
}

impl LegacyUpgradeImportState {
    /// Returns `true` only when the probe positively confirmed zero allowlisted
    /// AFFiNE keys on `https://localhost` with zero IndexedDB touches.
    pub const fn can_create_default_workspace(&self) -> bool {
        matches!(self, Self::FreshInstall)
    }
}

/// Parses and validates a legacy `https://localhost` `localStorage` probe JSON
/// payload matching the cross-slice `WebViewStorageSentinel` contract:
/// 1. `origin == "https://localhost"`
/// 2. `idbTouchCount == 0` (Iron Rule F12)
/// 3. `keys.len() == length` (`keys` holds every key name in `localStorage`)
/// 4. `keys` has no duplicates
/// 5. every key in `entries` is present in `keys` and satisfies the allowlist
/// 6. every key in `keys` that satisfies the allowlist is present in `entries`
///
/// Pass an empty `allowed_keys` slice to apply the full `0.27.5` allowlist rules
/// (`is_allowed_legacy_local_storage_key`), or a non-empty slice for an explicit subset.
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
    if raw.idb_touch_count > 0 {
        return Err(LegacyProbeError::IndexedDbTouched(raw.idb_touch_count));
    }
    if raw.keys.len() != raw.length {
        return Err(LegacyProbeError::InconsistentSentinel(format!(
            "keys.len() ({}) != localStorage.length ({})",
            raw.keys.len(),
            raw.length
        )));
    }

    let custom_allow: Option<BTreeSet<&str>> = if allowed_keys.is_empty() {
        None
    } else {
        Some(allowed_keys.iter().copied().collect())
    };
    let is_allowed = |k: &str| match &custom_allow {
        Some(set) => set.contains(k),
        None => is_allowed_legacy_local_storage_key(k),
    };

    let mut seen_keys = BTreeSet::new();
    for k in &raw.keys {
        if !seen_keys.insert(k.as_str()) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "duplicate key in sentinel: {k:?}"
            )));
        }
    }

    let mut entries = BTreeMap::new();
    for (k, v) in raw.entries {
        if !seen_keys.contains(k.as_str()) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "entry key {k:?} missing from sentinel keys"
            )));
        }
        if !is_allowed(&k) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "non-allowlisted key in sentinel entries: {k:?}"
            )));
        }
        entries.insert(k, v);
    }

    for k in &seen_keys {
        if is_allowed(k) && !entries.contains_key(*k) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "allowlisted key {k:?} present in keys but missing from entries"
            )));
        }
    }

    let mut keys: Vec<String> = seen_keys.into_iter().map(str::to_string).collect();
    keys.sort();

    Ok(LegacyLocalStorageSnapshot {
        origin: raw.origin,
        length: raw.length,
        keys,
        entries,
        removed_keys: raw.removed_keys,
        idb_touch_count: 0,
    })
}

/// Verifies a rollback `writeBackLegacyLocalStorage` read-back sentinel against
/// expected `set_entries` and `remove_keys`, ensuring zero IndexedDB touches.
///
/// Rejects removing `affine-local-workspace` (per `local.ts:126-129`, empty
/// local workspace lists must be written as `"[]"` rather than removed).
pub fn verify_legacy_writeback_result(
    expected_set: &BTreeMap<String, String>,
    expected_remove: &[String],
    readback_json: &str,
) -> Result<(), LegacyProbeError> {
    if expected_remove
        .iter()
        .any(|k| k == LOCAL_WORKSPACE_LOCAL_STORAGE_KEY)
    {
        return Err(LegacyProbeError::InconsistentSentinel(
            "affine-local-workspace must be written as \"[]\", never removed".into(),
        ));
    }
    let snapshot = parse_legacy_local_storage_probe(readback_json, &[])?;
    for (key, expected_val) in expected_set {
        if !is_allowed_legacy_local_storage_key(key) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "expected set key {key:?} is not allowlisted"
            )));
        }
        if snapshot.entries.get(key) != Some(expected_val) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "write-back readback mismatch for key {key:?}"
            )));
        }
    }
    for key in expected_remove {
        if !is_allowed_legacy_local_storage_key(key) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "expected remove key {key:?} is not allowlisted"
            )));
        }
        if snapshot.entries.contains_key(key) || snapshot.keys.iter().any(|k| k == key) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "removed key {key:?} still present in readback"
            )));
        }
        if !snapshot.removed_keys.iter().any(|k| k == key) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "removed key {key:?} not confirmed in removedKeys"
            )));
        }
    }
    Ok(())
}

/// Pure safe-Rust state held behind an Android JNI host handle.
#[derive(Debug)]
pub struct AndroidHostState {
    pub back_gesture: BackGestureMachine,
    pub has_back_destination: bool,
    pub insets: LogicalWindowInsets,
    pub surface: SurfaceLifecycleState,
    pub upgrade_import: LegacyUpgradeImportState,
    pub workspace_catalog: AndroidWorkspaceCatalog,
    /// Losslessly preserves the raw `affine-local-workspace` value read on upgrade
    /// (including malformed JSON like `"{broken"`) so untouched rollback write-back
    /// never silently overwrites it with `"[]"`.
    pub raw_local_workspace_value: Option<String>,
    /// Local workspace IDs that failed `connect_workspace` during bootstrap or retry.
    pub failed_local_workspace_mounts: BTreeSet<String>,
    pub sqlite: AndroidSqliteBridge,
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
            surface: SurfaceLifecycleState::new(),
            upgrade_import: LegacyUpgradeImportState::Pending,
            workspace_catalog: AndroidWorkspaceCatalog::default(),
            raw_local_workspace_value: None,
            failed_local_workspace_mounts: BTreeSet::new(),
            sqlite: AndroidSqliteBridge::new(),
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

    /// Returns `true` once the legacy `localStorage` probe has completed
    /// (either `Imported` or `FreshInstall`), guarding local workspace opens.
    pub const fn is_local_workspace_import_ready(&self) -> bool {
        matches!(
            self.upgrade_import,
            LegacyUpgradeImportState::Imported(_) | LegacyUpgradeImportState::FreshInstall
        )
    }

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

    /// Imports a legacy `https://localhost` `localStorage` probe result, updating
    /// the upgrade gate and allowlisted workspace catalog (never scanning disk).
    pub fn import_legacy_local_storage_probe(
        &mut self,
        payload_json: &str,
        allowed_keys: &[&str],
    ) -> Result<&LegacyLocalStorageSnapshot, LegacyProbeError> {
        match parse_legacy_local_storage_probe(payload_json, allowed_keys) {
            Ok(snapshot) => {
                if let Some(raw_ids) = snapshot.entries.get(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) {
                    self.raw_local_workspace_value = Some(raw_ids.clone());
                    self.workspace_catalog =
                        AndroidWorkspaceCatalog::from_local_storage_json(raw_ids);
                } else {
                    self.raw_local_workspace_value = None;
                    self.workspace_catalog = AndroidWorkspaceCatalog::default();
                }
                let _ = self
                    .sqlite
                    .evict_unlisted_local_workspaces(&self.workspace_catalog);
                self.failed_local_workspace_mounts
                    .retain(|id| self.workspace_catalog.contains(id));

                if snapshot.entries.is_empty() {
                    self.upgrade_import = LegacyUpgradeImportState::FreshInstall;
                } else {
                    self.upgrade_import = LegacyUpgradeImportState::Imported(snapshot);
                }
                match &self.upgrade_import {
                    LegacyUpgradeImportState::Imported(snap) => Ok(snap),
                    LegacyUpgradeImportState::FreshInstall => {
                        static EMPTY: std::sync::OnceLock<LegacyLocalStorageSnapshot> =
                            std::sync::OnceLock::new();
                        Ok(EMPTY.get_or_init(|| LegacyLocalStorageSnapshot {
                            origin: LEGACY_ANDROID_ORIGIN.to_string(),
                            length: 0,
                            keys: Vec::new(),
                            entries: BTreeMap::new(),
                            removed_keys: Vec::new(),
                            idb_touch_count: 0,
                        }))
                    }
                    _ => unreachable!(),
                }
            }
            Err(err) => {
                self.upgrade_import = LegacyUpgradeImportState::Failed(err.clone());
                Err(err)
            }
        }
    }

    /// Records the mount outcome for an allowlisted local workspace ID.
    pub fn record_local_workspace_mount_outcome(&mut self, space_id: &str, connected: bool) {
        if connected {
            self.failed_local_workspace_mounts.remove(space_id);
        } else if self.workspace_catalog.contains(space_id) {
            self.failed_local_workspace_mounts
                .insert(space_id.to_string());
        }
    }

    /// Returns `true` when any allowlisted local workspace failed to mount or has
    /// not yet been connected.
    pub fn has_unresolved_local_workspace_mounts(&self) -> bool {
        if !self.failed_local_workspace_mounts.is_empty() {
            return true;
        }
        if !self.is_local_workspace_import_ready() {
            return false;
        }
        self.workspace_catalog
            .ids()
            .iter()
            .any(|id| !self.sqlite.is_local_workspace_connected(id))
    }

    /// Plans a rollback `localStorage` write-back JSON payload (`setEntries` +
    /// `removeKeys`). Returns `None` while upgrade import is incomplete or any
    /// allowlisted local workspace has an unresolved mount failure.
    pub fn plan_legacy_local_storage_writeback(&self) -> Option<String> {
        if !self.is_local_workspace_import_ready() || self.has_unresolved_local_workspace_mounts() {
            return None;
        }
        let local_ws_value = if !self.workspace_catalog.ids().is_empty() {
            serde_json::to_string(self.workspace_catalog.ids()).ok()?
        } else if let Some(raw) = &self.raw_local_workspace_value {
            raw.clone()
        } else {
            "[]".to_string()
        };
        let mut set_entries = BTreeMap::new();
        set_entries.insert(
            LOCAL_WORKSPACE_LOCAL_STORAGE_KEY.to_string(),
            local_ws_value,
        );
        let plan = serde_json::json!({
            "setEntries": set_entries,
            "removeKeys": Vec::<String>::new(),
        });
        Some(plan.to_string())
    }
}

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
        assert_eq!(
            machine.transition(BackGesturePhase::Commit, 1.0),
            Ok(BackGestureState::Committed)
        );
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
    fn legacy_local_storage_probe_distinguishes_fresh_install_failure_and_idb_violation() {
        // Real 0.27.5 allowlist rules (exact + dynamic keys) and rejection of fictional keys.
        for allowed in [
            "affine-local-workspace",
            "global-state:serverList",
            "global-cache:i18n_lng",
            "last_workspace_id",
            "last_workspace_flavour",
            "affine-settings",
            "theme",
            "global-state:serverConfig:self-host-1",
            "global-state:cloud-auth",
            "cloud-auth",
            "affine-flag:enable_ai",
            "global-state:affine-flag:enable_ai",
        ] {
            assert!(
                is_allowed_legacy_local_storage_key(allowed),
                "expected allowed key: {allowed}"
            );
        }
        for rejected in [
            "affine_theme",
            "affine_server_url",
            "secret_token",
            "global-state:serverConfig:",
            "global-state:-auth",
            "-auth",
            "affine-flag:",
            "global-state:affine-flag:",
        ] {
            assert!(
                !is_allowed_legacy_local_storage_key(rejected),
                "expected rejected key: {rejected}"
            );
        }

        let mut host = AndroidHostState::new();
        assert!(!host.upgrade_import.can_create_default_workspace());

        // Probe failure blocks default workspace creation.
        assert!(host.import_legacy_local_storage_probe("null", &[]).is_err());
        assert!(!host.upgrade_import.can_create_default_workspace());

        // Sentinel consistency failures: keys.len() != length, duplicate keys, non-allowlisted entry,
        // entry not in keys, and allowlisted key in keys missing from entries.
        let bad_payloads = [
            r#"{"origin":"https://localhost","length":0,"keys":["theme"],"entries":{"theme":"dark"},"idbTouchCount":0}"#,
            r#"{"origin":"https://localhost","length":2,"keys":["theme"],"entries":{"theme":"dark"},"idbTouchCount":0}"#,
            r#"{"origin":"https://localhost","length":2,"keys":["theme","theme"],"entries":{"theme":"dark"},"idbTouchCount":0}"#,
            r#"{"origin":"https://localhost","length":1,"keys":["affine_theme"],"entries":{"affine_theme":"dark"},"idbTouchCount":0}"#,
            r#"{"origin":"https://localhost","length":0,"keys":[],"entries":{"theme":"dark"},"idbTouchCount":0}"#,
            r#"{"origin":"https://localhost","length":1,"keys":["affine-local-workspace"],"entries":{},"idbTouchCount":0}"#,
        ];
        for bad in bad_payloads {
            assert!(
                matches!(
                    host.import_legacy_local_storage_probe(bad, &[]),
                    Err(LegacyProbeError::InconsistentSentinel(_))
                ),
                "expected InconsistentSentinel for {bad}"
            );
            assert!(!host.upgrade_import.can_create_default_workspace());
        }

        // Any IndexedDB touch is rejected.
        let idb_payload = r#"{
            "origin": "https://localhost",
            "length": 1,
            "keys": ["affine-local-workspace"],
            "entries": { "affine-local-workspace": "[\"ws-1\"]" },
            "idbTouchCount": 1
        }"#;
        assert_eq!(
            host.import_legacy_local_storage_probe(idb_payload, &[]),
            Err(LegacyProbeError::IndexedDbTouched(1))
        );
        assert!(!host.upgrade_import.can_create_default_workspace());

        // Genuine fresh install with an unrelated non-allowlisted third-party key (length == 1, keys == ["__cap_noise__"], entries == {}).
        let fresh_with_noise = r#"{
            "origin": "https://localhost",
            "length": 1,
            "keys": ["__cap_noise__"],
            "entries": {},
            "idbTouchCount": 0
        }"#;
        host.import_legacy_local_storage_probe(fresh_with_noise, &[])
            .unwrap();
        assert!(host.upgrade_import.can_create_default_workspace());

        // Existing user who deleted all local workspaces still has "affine-local-workspace": "[]" -> Imported, NOT FreshInstall.
        let deleted_all_payload = r#"{
            "origin": "https://localhost",
            "length": 1,
            "keys": ["affine-local-workspace"],
            "entries": { "affine-local-workspace": "[]" },
            "idbTouchCount": 0
        }"#;
        host.import_legacy_local_storage_probe(deleted_all_payload, &[])
            .unwrap();
        assert!(!host.upgrade_import.can_create_default_workspace());
        assert!(host.workspace_catalog.ids().is_empty());

        // Malformed affine-local-workspace JSON ("{broken") mounts zero workspaces
        // while losslessly preserving the raw string for untouched rollback write-back.
        let corrupt_ws_payload = r#"{
            "origin": "https://localhost",
            "length": 1,
            "keys": ["affine-local-workspace"],
            "entries": { "affine-local-workspace": "{broken" },
            "idbTouchCount": 0
        }"#;
        host.import_legacy_local_storage_probe(corrupt_ws_payload, &[])
            .unwrap();
        assert!(!host.upgrade_import.can_create_default_workspace());
        assert!(host.workspace_catalog.ids().is_empty());
        assert_eq!(host.raw_local_workspace_value.as_deref(), Some("{broken"));

        // Upgrade with allowlisted workspaces + dynamic keys + 1 unrelated noise key (length == 4, keys.len() == 4).
        let upgrade_payload = r#"{
            "origin": "https://localhost",
            "length": 4,
            "keys": ["__cap_noise__", "affine-local-workspace", "global-state:serverConfig:self-host", "theme"],
            "entries": {
                "affine-local-workspace": "[\"ws-b\",\"ws-a\"]",
                "global-state:serverConfig:self-host": "{\"url\":\"https://self.example\"}",
                "theme": "dark"
            },
            "removedKeys": ["last_workspace_id"],
            "idbTouchCount": 0
        }"#;
        let snap = host
            .import_legacy_local_storage_probe(upgrade_payload, &[])
            .unwrap();
        assert_eq!(
            snap.keys,
            vec![
                "__cap_noise__",
                "affine-local-workspace",
                "global-state:serverConfig:self-host",
                "theme"
            ]
        );
        assert!(!snap.entries.contains_key("__cap_noise__"));
        assert!(!host.upgrade_import.can_create_default_workspace());
        assert_eq!(
            host.workspace_catalog.ids(),
            &["ws-b".to_string(), "ws-a".to_string()]
        );

        // Rollback write-back verification checks setEntries + removeKeys and forbids removing affine-local-workspace.
        let mut expected_set = BTreeMap::new();
        expected_set.insert(
            LOCAL_WORKSPACE_LOCAL_STORAGE_KEY.to_string(),
            r#"["ws-b","ws-a"]"#.to_string(),
        );
        expected_set.insert("theme".to_string(), "dark".to_string());
        let expected_remove = vec!["last_workspace_id".to_string()];
        assert!(
            verify_legacy_writeback_result(&expected_set, &expected_remove, upgrade_payload)
                .is_ok()
        );
        assert!(
            verify_legacy_writeback_result(
                &expected_set,
                &[LOCAL_WORKSPACE_LOCAL_STORAGE_KEY.to_string()],
                upgrade_payload
            )
            .is_err()
        );
        assert!(
            verify_legacy_writeback_result(&expected_set, &["theme".to_string()], upgrade_payload)
                .is_err()
        );
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

        assert_eq!(
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(env, null, 0, 1),
            0
        );

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
                env, null, handle, 1, 1080, 2400,
            );
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeIsSurfaceReady(
                    env, null, handle
                ),
                1
            );
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceInsetsPx(
                env, null, handle, 96, 0, 48, 0, 648, 3.0,
            );
            let clear_argb = jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(
                env, null, handle, 16_666_667,
            );
            assert_eq!(clear_argb as u32, DEFAULT_CLEAR_COLOR_ARGB);

            // Surface destroyed -> ticks return 0 and pending frame stays queued.
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceDestroyed(
                env, null, handle,
            );
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(
                    env, null, handle, 33_333_334
                ),
                0
            );
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeHasPendingFrame(
                    env, null, handle
                ),
                1
            );

            // Recreate surface -> generation increments to 2 and frame resumes.
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceCreated(
                env,
                null,
                handle,
                fake_surface,
            );
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnSurfaceChanged(
                env, null, handle, 1, 1080, 2400,
            );
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeGetSurfaceGeneration(
                    env, null, handle
                ),
                2
            );
            assert_eq!(
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnFrameTick(
                    env, null, handle, 50_000_000
                ) as u32,
                DEFAULT_CLEAR_COLOR_ARGB
            );

            // Back gesture root check.
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

            // Real UTF-16 JNI string decoding + surrogate-pair safe deletion.
            let mut zhong = FakeJString {
                units: "中".encode_utf16().collect(),
            };
            let mut wen_emoji = FakeJString {
                units: "文😀".encode_utf16().collect(),
            };
            unsafe {
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                    env,
                    null,
                    handle,
                    (&mut zhong as *mut FakeJString).cast(),
                    1,
                );
                jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnCommitText(
                    env,
                    null,
                    handle,
                    (&mut wen_emoji as *mut FakeJString).cast(),
                    1,
                );
                assert_eq!(jni_bridge::snapshot_text(handle).as_deref(), Some("中文😀"));
            }
            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeOnDeleteSurroundingText(
                env, null, handle, 1, 0,
            );
            assert_eq!(jni_bridge::snapshot_text(handle).as_deref(), Some("中文"));

            jni_bridge::Java_app_affine_pro_host_NativeBridge_nativeDestroyHost(env, null, handle);
            assert_eq!(jni_bridge::snapshot_text(handle), None);
        }
    }
}
