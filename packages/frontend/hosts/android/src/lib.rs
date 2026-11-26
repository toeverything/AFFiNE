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
pub mod autofill;
pub mod datastore;
mod ime;
pub mod pdf;
pub mod selection;
pub mod storage;
pub mod surface;
pub mod text_layout;

#[cfg(any(target_os = "android", test, feature = "host-jni"))]
pub mod jni_bridge;
#[cfg(any(target_os = "android", test, feature = "host-jni"))]
pub mod jni_interaction;
#[cfg(any(target_os = "android", test, feature = "host-jni"))]
pub mod jni_storage;

pub use autofill::{
    AutofillEvent, AutofillFieldKind, AutofillFieldNode, AutofillRect, AutofillState,
};
pub use pdf::{
    MAX_PDF_RENDER_DIM_PX, MAX_PDF_RENDER_PIXELS, PdfRenderError, argb8888_i32_to_rgba8,
    argb8888_to_rgba8, pdf_page_cache_key, validate_pdf_page_request,
};
pub use selection::{
    HandleGeometry, MagnifierState, RectF, SelectionHandleKind, SelectionOverlayState,
    TeardropOrientation, TextDirection,
};
pub use storage::{
    AndroidSqliteBridge, AndroidWorkspaceCatalog, LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
};
pub use surface::{
    AndroidRenderBackend, DEFAULT_CLEAR_COLOR_ARGB, SurfaceLifecycleState, SurfacePresentError,
};

/// Legacy Capacitor Android WebView origin used for one-shot `localStorage` probing.
pub const LEGACY_ANDROID_ORIGIN: &str = "https://localhost";

/// Returns `true` when `key` matches the single authoritative `affine-legacy-import`
/// `localStorage` allowlist (including cloud/self-hosted workspace caches and bare `*-auth`).
pub fn is_allowed_legacy_local_storage_key(key: &str) -> bool {
    affine_legacy_import::is_permitted_sentinel_entry_key(key)
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

impl LogicalWindowInsets {
    /// Returns keyboard height strictly above the bottom navigation bar in logical `dp`,
    /// preventing double-deduction when combining `safe_bottom` and `ime_bottom`.
    pub fn effective_ime_above_nav_bar(&self) -> f32 {
        (self.ime_bottom - self.safe_bottom).max(0.0)
    }
}

/// Android back navigation dispatch strategy by API level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub enum BackDispatchMode {
    /// API 24-32: legacy `Activity.onBackPressed()` single-step commit.
    LegacyOnBackPressed = 0,
    /// API 33: `OnBackInvokedCallback` single-step commit.
    OnBackInvoked = 1,
    /// API 34+: `OnBackAnimationCallback` four-phase predictive back.
    OnBackAnimation = 2,
}

/// Selects the Android back dispatch strategy for `sdk_int`.
pub const fn back_dispatch_mode(sdk_int: u32) -> BackDispatchMode {
    if sdk_int >= 34 {
        BackDispatchMode::OnBackAnimation
    } else if sdk_int >= 33 {
        BackDispatchMode::OnBackInvoked
    } else {
        BackDispatchMode::LegacyOnBackPressed
    }
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

pub use storage::filter_legacy_local_storage_probe_json;

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
    parse_legacy_local_storage_probe_with_flag(payload_json, allowed_keys).map(|(snap, _)| snap)
}

fn parse_legacy_local_storage_probe_with_flag(
    payload_json: &str,
    allowed_keys: &[&str],
) -> Result<(LegacyLocalStorageSnapshot, bool), LegacyProbeError> {
    let trimmed = payload_json.trim();
    let unwrapped_owned: String;
    let effective_json = if trimmed.starts_with('"') {
        unwrapped_owned = serde_json::from_str::<String>(trimmed)
            .map_err(|err| LegacyProbeError::InvalidJson(err.to_string()))?;
        unwrapped_owned.as_str()
    } else {
        trimmed
    };
    let mut raw: LegacyLocalStorageSnapshot = serde_json::from_str(effective_json)
        .map_err(|err| LegacyProbeError::InvalidJson(err.to_string()))?;

    if raw.idb_touch_count > 0 {
        return Err(LegacyProbeError::IndexedDbTouched(raw.idb_touch_count));
    }

    if allowed_keys.is_empty() {
        use affine_legacy_import::sentinel::{
            SentinelEvaluation, SentinelFailureReason, WebViewStorageSentinel, evaluate_sentinel,
        };
        let sentinel = WebViewStorageSentinel {
            origin: raw.origin.clone(),
            length: raw.length,
            keys: raw.keys.clone(),
            entries: raw.entries.clone(),
        };
        match evaluate_sentinel(&sentinel, &[LEGACY_ANDROID_ORIGIN]) {
            eval @ (SentinelEvaluation::ValidEmpty | SentinelEvaluation::ValidPopulated { .. }) => {
                let has_allowlisted_keys = matches!(
                    eval,
                    SentinelEvaluation::ValidPopulated {
                        has_allowlisted_keys: true
                    }
                );
                raw.keys.sort();
                raw.idb_touch_count = 0;
                return Ok((raw, has_allowlisted_keys));
            }
            SentinelEvaluation::UnreadyOrMismatch(reason) => {
                return Err(match reason {
                    SentinelFailureReason::EmptyOrigin => {
                        LegacyProbeError::UnexpectedOrigin(raw.origin)
                    }
                    SentinelFailureReason::OriginMismatch { actual } => {
                        LegacyProbeError::UnexpectedOrigin(actual)
                    }
                    SentinelFailureReason::LengthMismatch {
                        reported_length,
                        observed_keys,
                    } => LegacyProbeError::InconsistentSentinel(format!(
                        "keys.len() ({observed_keys}) != localStorage.length ({reported_length})"
                    )),
                    SentinelFailureReason::DuplicateKeys => {
                        LegacyProbeError::InconsistentSentinel("duplicate key in sentinel".into())
                    }
                    SentinelFailureReason::EntryKeyMissingFromKeyList { key } => {
                        LegacyProbeError::InconsistentSentinel(format!(
                            "entry key {key:?} missing from sentinel keys"
                        ))
                    }
                    SentinelFailureReason::DisallowedEntryKey { key } => {
                        LegacyProbeError::InconsistentSentinel(format!(
                            "non-allowlisted key in sentinel entries: {key:?}"
                        ))
                    }
                    SentinelFailureReason::MissingAllowlistedEntry { key } => {
                        LegacyProbeError::InconsistentSentinel(format!(
                            "allowlisted key {key:?} present in keys but missing from entries"
                        ))
                    }
                });
            }
        }
    }

    if raw.origin != LEGACY_ANDROID_ORIGIN {
        return Err(LegacyProbeError::UnexpectedOrigin(raw.origin));
    }
    if raw.keys.len() != raw.length {
        return Err(LegacyProbeError::InconsistentSentinel(format!(
            "keys.len() ({}) != localStorage.length ({})",
            raw.keys.len(),
            raw.length
        )));
    }

    let custom_allow: BTreeSet<&str> = allowed_keys.iter().copied().collect();
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
        if !custom_allow.contains(k.as_str()) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "non-allowlisted key in sentinel entries: {k:?}"
            )));
        }
        entries.insert(k, v);
    }

    for k in &seen_keys {
        if custom_allow.contains(*k) && !entries.contains_key(*k) {
            return Err(LegacyProbeError::InconsistentSentinel(format!(
                "allowlisted key {k:?} present in keys but missing from entries"
            )));
        }
    }

    let mut keys: Vec<String> = seen_keys.into_iter().map(str::to_string).collect();
    keys.sort();

    let has_allowlisted_keys = !entries.is_empty();
    Ok((
        LegacyLocalStorageSnapshot {
            origin: raw.origin,
            length: raw.length,
            keys,
            entries,
            removed_keys: raw.removed_keys,
            idb_touch_count: 0,
        },
        has_allowlisted_keys,
    ))
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

/// Default root destination route for the Android host navigation stack.
pub const DEFAULT_ROOT_DESTINATION: &str = "workspace/home";

/// Destination route stack driving Android back navigation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackNavigationState {
    destinations: Vec<String>,
}

impl Default for BackNavigationState {
    fn default() -> Self {
        Self::new()
    }
}

impl BackNavigationState {
    /// Creates a navigation stack seeded with the root destination (`depth == 0`).
    pub fn new() -> Self {
        Self {
            destinations: vec![DEFAULT_ROOT_DESTINATION.to_string()],
        }
    }

    /// Returns the currently active destination route.
    pub fn current_destination(&self) -> Option<&str> {
        self.destinations.last().map(String::as_str)
    }

    /// Pushes a non-empty destination route onto the navigation stack.
    pub fn push_destination(&mut self, route: impl Into<String>) -> bool {
        let route = route.into();
        if route.is_empty() {
            return false;
        }
        if self.destinations.is_empty() {
            self.destinations.push(DEFAULT_ROOT_DESTINATION.to_string());
        }
        self.destinations.push(route);
        true
    }

    /// Pops the top non-root destination, returning `None` when already at root.
    pub fn pop_destination(&mut self) -> Option<String> {
        if self.destinations.len() > 1 {
            self.destinations.pop()
        } else {
            None
        }
    }

    /// Returns the number of poppable non-root destinations.
    pub fn depth(&self) -> u32 {
        self.destinations.len().saturating_sub(1) as u32
    }

    /// Rebuilds synthetic stack entries to match an explicit poppable depth.
    pub fn set_depth(&mut self, depth: u32) {
        self.destinations.clear();
        self.destinations.push(DEFAULT_ROOT_DESTINATION.to_string());
        for level in 1..=depth {
            self.destinations.push(format!("route/{level}"));
        }
    }
}

/// Pure safe-Rust state held behind an Android JNI host handle.
#[derive(Debug)]
pub struct AndroidHostState {
    pub back_gesture: BackGestureMachine,
    pub back_navigation: BackNavigationState,
    pub insets: LogicalWindowInsets,
    pub surface: SurfaceLifecycleState,
    pub selection: SelectionOverlayState,
    pub text_layout: text_layout::TextLayoutMetrics,
    pub selection_drag_anchor_utf16: Option<usize>,
    pub selection_drag_initial_handle: SelectionHandleKind,
    pub autofill: AutofillState,
    pub upgrade_import: LegacyUpgradeImportState,
    pub workspace_catalog: AndroidWorkspaceCatalog,
    /// Parsed `affine-legacy-import` snapshot holding canonical `preserved_raw_entries`
    /// (single source of truth for untouched malformed `affine-local-workspace` write-back).
    pub legacy_snapshot: Option<affine_legacy_import::LegacyLocalStorageSnapshot>,
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
            back_navigation: BackNavigationState::new(),
            insets: LogicalWindowInsets::default(),
            surface: SurfaceLifecycleState::new(),
            selection: SelectionOverlayState::new(),
            text_layout: text_layout::TextLayoutMetrics::default(),
            selection_drag_anchor_utf16: None,
            selection_drag_initial_handle: SelectionHandleKind::None,
            autofill: AutofillState::default(),
            upgrade_import: LegacyUpgradeImportState::Pending,
            workspace_catalog: AndroidWorkspaceCatalog::default(),
            legacy_snapshot: None,
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

    /// Pushes a destination route onto the host navigation stack.
    pub fn push_back_destination(&mut self, route: impl Into<String>) -> bool {
        self.back_navigation.push_destination(route)
    }

    /// Returns the currently active destination route.
    pub fn current_back_destination(&self) -> Option<&str> {
        self.back_navigation.current_destination()
    }

    /// Sets the number of poppable navigation entries on the back stack.
    pub fn set_back_stack_depth(&mut self, depth: u32) {
        self.back_navigation.set_depth(depth);
    }

    /// Returns the remaining number of poppable navigation entries.
    pub fn back_stack_depth(&self) -> u32 {
        self.back_navigation.depth()
    }

    /// Sets whether at least one back destination exists (`0` or `1` stack depth).
    pub fn set_has_back_destination(&mut self, has_destination: bool) {
        self.back_navigation.set_depth(u32::from(has_destination));
    }

    /// Returns `true` when at least one back destination can be popped.
    pub fn has_back_destination(&self) -> bool {
        self.back_navigation.depth() > 0
    }

    /// Handles a back gesture phase; returns `true` only when the host consumed
    /// the event. Each `Commit` atomically pops the top destination from
    /// `back_navigation` and returns `false` at the root so Android delegates to
    /// system exit. `Cancel` leaves the active destination unchanged.
    pub fn handle_back_phase(&mut self, phase: BackGesturePhase, progress: f32) -> bool {
        if phase == BackGesturePhase::Commit {
            let _ = self.back_gesture.transition(phase, progress);
            return self.back_navigation.pop_destination().is_some();
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
        match parse_legacy_local_storage_probe_with_flag(payload_json, allowed_keys) {
            Ok((snapshot, has_allowlisted_keys)) => {
                let parsed_legacy =
                    affine_legacy_import::parse_allowlisted_entries(&snapshot.entries);
                self.workspace_catalog =
                    AndroidWorkspaceCatalog::from_ids(parsed_legacy.local_workspace_ids.clone());
                self.legacy_snapshot = Some(parsed_legacy);
                let _ = self
                    .sqlite
                    .evict_unlisted_local_workspaces(&self.workspace_catalog);
                self.failed_local_workspace_mounts
                    .retain(|id| self.workspace_catalog.contains(id));

                if !has_allowlisted_keys {
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

    /// Returns the preserved raw `affine-local-workspace` string (if malformed/non-array)
    /// from `affine-legacy-import`'s `preserved_raw_entries`.
    pub fn preserved_local_workspace_raw(&self) -> Option<&str> {
        self.legacy_snapshot
            .as_ref()
            .and_then(|s| {
                s.preserved_raw_entries
                    .get(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY)
            })
            .map(String::as_str)
    }

    /// Plans a rollback `localStorage` write-back JSON payload (`setEntries` +
    /// `removeKeys`). Returns `None` while upgrade import is incomplete or any
    /// allowlisted local workspace has an unresolved mount failure.
    pub fn plan_legacy_local_storage_writeback(&self) -> Option<String> {
        if !self.is_local_workspace_import_ready() || self.has_unresolved_local_workspace_mounts() {
            return None;
        }
        let mut set_entries = BTreeMap::new();
        if let Some(snapshot) = &self.legacy_snapshot {
            for (k, v) in &snapshot.preserved_raw_entries {
                set_entries.insert(k.clone(), v.clone());
            }
        }
        if !self.workspace_catalog.ids().is_empty() {
            set_entries.insert(
                LOCAL_WORKSPACE_LOCAL_STORAGE_KEY.to_string(),
                serde_json::to_string(self.workspace_catalog.ids()).ok()?,
            );
        } else if let Some(raw) = self.preserved_local_workspace_raw() {
            set_entries.insert(
                LOCAL_WORKSPACE_LOCAL_STORAGE_KEY.to_string(),
                raw.to_string(),
            );
        } else if matches!(self.upgrade_import, LegacyUpgradeImportState::Imported(_)) {
            set_entries.insert(
                LOCAL_WORKSPACE_LOCAL_STORAGE_KEY.to_string(),
                "[]".to_string(),
            );
        }
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
    fn back_dispatch_mode_and_effective_ime_insets_follow_api_and_nav_bar_rules() {
        let mode_cases = [
            (24_u32, BackDispatchMode::LegacyOnBackPressed),
            (25, BackDispatchMode::LegacyOnBackPressed),
            (32, BackDispatchMode::LegacyOnBackPressed),
            (33, BackDispatchMode::OnBackInvoked),
            (34, BackDispatchMode::OnBackAnimation),
            (35, BackDispatchMode::OnBackAnimation),
        ];
        for (sdk_int, expected) in mode_cases {
            assert_eq!(back_dispatch_mode(sdk_int), expected);
        }

        let inset_cases = [
            // Keyboard taller than navigation bar -> deducts safe_bottom to avoid double subtraction.
            ((72, 900, 3.0_f32), 276.0_f32),
            // Keyboard hidden (ime_bottom == 0) -> clamps to 0.
            ((72, 0, 3.0_f32), 0.0_f32),
            // Keyboard inset smaller than nav bar -> clamps to 0.
            ((72, 48, 3.0_f32), 0.0_f32),
        ];
        for ((nav_px, ime_px, density), expected_effective) in inset_cases {
            let insets = physical_insets_to_logical_dp(0, 0, nav_px, 0, ime_px, density);
            assert_eq!(insets.effective_ime_above_nav_bar(), expected_effective);
        }

        // Real destination navigation stack pops route-by-route, preserves route on Cancel,
        // and returns false at root destination.
        let mut host = AndroidHostState::new();
        assert_eq!(
            host.current_back_destination(),
            Some(DEFAULT_ROOT_DESTINATION)
        );
        assert!(host.push_back_destination("doc/welcome"));
        assert!(host.push_back_destination("doc/settings"));
        assert_eq!(host.back_stack_depth(), 2);
        assert_eq!(host.current_back_destination(), Some("doc/settings"));
        assert!(host.handle_back_phase(BackGesturePhase::Start, 0.0));
        assert!(host.handle_back_phase(BackGesturePhase::Progress, 0.4));
        assert!(host.handle_back_phase(BackGesturePhase::Cancel, 0.0));
        assert_eq!(host.current_back_destination(), Some("doc/settings"));
        assert_eq!(host.back_stack_depth(), 2);
        assert!(host.handle_back_phase(BackGesturePhase::Commit, 1.0));
        assert_eq!(host.current_back_destination(), Some("doc/welcome"));
        assert_eq!(host.back_stack_depth(), 1);
        assert!(host.handle_back_phase(BackGesturePhase::Start, 0.0));
        assert!(host.handle_back_phase(BackGesturePhase::Progress, 0.6));
        assert!(host.handle_back_phase(BackGesturePhase::Commit, 1.0));
        assert_eq!(
            host.current_back_destination(),
            Some(DEFAULT_ROOT_DESTINATION)
        );
        assert_eq!(host.back_stack_depth(), 0);
        assert!(!host.handle_back_phase(BackGesturePhase::Commit, 1.0));
        assert_eq!(
            host.current_back_destination(),
            Some(DEFAULT_ROOT_DESTINATION)
        );
    }

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
        assert_eq!(host.preserved_local_workspace_raw(), Some("{broken"));
        let corrupt_plan = host
            .plan_legacy_local_storage_writeback()
            .expect("corrupt list rollback plan");
        assert!(corrupt_plan.contains(r#""affine-local-workspace":"{broken""#));

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

    #[test]
    fn single_line_vertical_drag_beyond_half_line_never_flips_handle_or_loupe() {
        let mut host = AndroidHostState::new();
        host.text_layout = crate::text_layout::TextLayoutMetrics::for_viewport(1080.0, 3.0);
        host.selection.set_viewport(1080.0, 2400.0, 3.0);
        let text: Vec<u16> = "Hello world".encode_utf16().collect();
        host.commit_text_utf16(&text, 1);
        host.set_selection(6, 11);

        let initial_end_x = host.selection.end_handle.tip_x;
        let end_cx = host.selection.end_handle.center_x;
        let end_cy = host.selection.end_handle.center_y;
        assert_eq!(
            host.begin_selection_handle_drag(end_cx, end_cy),
            SelectionHandleKind::End
        );

        for dy in [-43.0_f32, -60.0, -120.0, 0.0, 43.0, 120.0, 0.0] {
            assert!(host.update_selection_handle_drag(end_cx, end_cy + dy));
            assert_eq!(
                host.selection_range(),
                (6, 11),
                "selection must remain [6, 11) at dy={dy}"
            );
            assert_eq!(
                host.selection.active_drag,
                SelectionHandleKind::End,
                "active_drag must remain End at dy={dy}"
            );
            assert!(
                (host.selection.magnifier.anchor_x - initial_end_x).abs() < 0.01,
                "magnifier anchor_x ({}) must stay at right end ({initial_end_x}) at dy={dy}",
                host.selection.magnifier.anchor_x
            );
        }
    }

    #[test]
    fn delegated_sentinel_handles_filtered_noise_upgrade_rollback_and_fresh_install() {
        // 1. Filtered upgrade payload: affine-local-workspace=["ws-a"] + __cap_noise__ stripped from entries.
        let upgrade_json = r#"{"origin":"https://localhost","length":2,"keys":["__cap_noise__","affine-local-workspace"],"entries":{"affine-local-workspace":"[\"ws-a\"]"},"idbTouchCount":0}"#;
        let mut host = AndroidHostState::new();
        let snap = host
            .import_legacy_local_storage_probe(upgrade_json, &[])
            .expect("filtered mixed upgrade sentinel must succeed");
        assert_eq!(snap.keys, vec!["__cap_noise__", "affine-local-workspace"]);
        assert!(!host.upgrade_import.can_create_default_workspace());
        assert!(host.workspace_catalog.contains("ws-a"));

        // Rollback read-back with the same unrelated noise key stripped from entries passes.
        let mut expected_set = BTreeMap::new();
        expected_set.insert(
            LOCAL_WORKSPACE_LOCAL_STORAGE_KEY.to_string(),
            r#"["ws-a"]"#.to_string(),
        );
        verify_legacy_writeback_result(&expected_set, &[], upgrade_json)
            .expect("rollback readback with noise key in keys only must pass");

        // 2. Fresh install with only __cap_noise__ stripped from entries allows default workspace.
        let fresh_json = r#"{"origin":"https://localhost","length":1,"keys":["__cap_noise__"],"entries":{},"idbTouchCount":0}"#;
        let mut fresh_host = AndroidHostState::new();
        fresh_host
            .import_legacy_local_storage_probe(fresh_json, &[])
            .expect("filtered fresh install with noise key must succeed");
        assert!(fresh_host.upgrade_import.can_create_default_workspace());

        // 3. Unfiltered noise key still present in entries is rejected by affine-legacy-import sentinel.
        let unfiltered_json = r#"{"origin":"https://localhost","length":1,"keys":["__cap_noise__"],"entries":{"__cap_noise__":"junk"},"idbTouchCount":0}"#;
        let err = parse_legacy_local_storage_probe(unfiltered_json, &[]).unwrap_err();
        assert!(matches!(err, LegacyProbeError::InconsistentSentinel(_)));

        // 4. Bare legacy `<id>-auth` single key ("local-auth": "\"tok\"") classifies as FreshInstall
        // (matching iOS has_allowlisted_keys == false), mounts 0 workspaces, and preserves the raw
        // entry verbatim in rollback writeback without deleting it.
        let bare_auth_json = r#"{"origin":"https://localhost","length":1,"keys":["local-auth"],"entries":{"local-auth":"\"tok\""},"idbTouchCount":0}"#;
        let mut bare_host = AndroidHostState::new();
        bare_host
            .import_legacy_local_storage_probe(bare_auth_json, &[])
            .expect("bare local-auth sentinel must succeed");
        assert!(matches!(
            bare_host.upgrade_import,
            LegacyUpgradeImportState::FreshInstall
        ));
        assert!(bare_host.upgrade_import.can_create_default_workspace());
        assert!(bare_host.workspace_catalog.ids().is_empty());
        let bare_plan_raw = bare_host
            .plan_legacy_local_storage_writeback()
            .expect("FreshInstall writeback plan must be available");
        let bare_plan: serde_json::Value = serde_json::from_str(&bare_plan_raw).unwrap();
        assert_eq!(bare_plan["setEntries"]["local-auth"], "\"tok\"");
        assert_eq!(bare_plan["removeKeys"], serde_json::json!([]));
    }
}
