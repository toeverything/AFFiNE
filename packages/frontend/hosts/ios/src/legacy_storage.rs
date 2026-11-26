//! Thin iOS wrapper delegating `capacitor://localhost` `localStorage` sentinel validation,
//! parsing, and rollback write-back planning to `affine-legacy-import`.

use std::collections::{BTreeMap, BTreeSet};

use affine_legacy_import::{
    KEY_AFFINE_SETTINGS, KEY_I18N_LNG, KEY_LAST_WORKSPACE_FLAVOUR, KEY_LAST_WORKSPACE_ID,
    KEY_LOCAL_WORKSPACE_LIST, KEY_SERVER_LIST, KEY_THEME, LegacyImportError,
    LegacyLocalStorageSnapshot as CanonicalSnapshot, LegacyServerMetadata, PREFIX_FEATURE_FLAG,
    PREFIX_GLOBAL_STATE, PREFIX_GLOBAL_STATE_FEATURE_FLAG, PREFIX_SERVER_CONFIG,
    SUFFIX_SERVER_AUTH, SentinelEvaluation, SentinelFailureReason, WebViewStorageSentinel,
    import_from_sentinel, is_permitted_sentinel_entry_key, writeback::serialize_snapshot_entries,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Exact origin used by Capacitor 0.27.5 on iOS.
pub const LEGACY_CAPACITOR_ORIGIN: &str = "capacitor://localhost";

pub const LOCAL_WORKSPACE_KEY: &str = KEY_LOCAL_WORKSPACE_LIST;
pub const SERVER_LIST_KEY: &str = KEY_SERVER_LIST;
pub const SERVER_CONFIG_PREFIX: &str = PREFIX_SERVER_CONFIG;
pub const GLOBAL_STATE_PREFIX: &str = PREFIX_GLOBAL_STATE;
pub const AUTH_KEY_SUFFIX: &str = SUFFIX_SERVER_AUTH;
pub const FLAG_PREFIX: &str = PREFIX_FEATURE_FLAG;
pub const GLOBAL_STATE_FLAG_PREFIX: &str = PREFIX_GLOBAL_STATE_FEATURE_FLAG;
pub const I18N_KEY: &str = KEY_I18N_LNG;
pub const LAST_WORKSPACE_ID_KEY: &str = KEY_LAST_WORKSPACE_ID;
pub const LAST_WORKSPACE_FLAVOUR_KEY: &str = KEY_LAST_WORKSPACE_FLAVOUR;
pub const AFFINE_SETTINGS_KEY: &str = KEY_AFFINE_SETTINGS;
pub const THEME_KEY: &str = KEY_THEME;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum LegacyStorageError {
    #[error("invalid JSON payload: {0}")]
    InvalidJson(String),
    #[error("unexpected WebView origin: expected {LEGACY_CAPACITOR_ORIGIN}, got {0}")]
    WrongOrigin(String),
    #[error("forbidden IndexedDB access detected during legacy probe ({0} calls)")]
    IndexedDbTouched(u64),
    #[error("invalid legacy localStorage sentinel: {0}")]
    InvalidSentinel(String),
    #[error("write-back readback mismatch for key {key}: expected {expected:?}, got {actual:?}")]
    WriteBackMismatch {
        key: String,
        expected: Option<String>,
        actual: Option<String>,
    },
}

/// Unified `WebViewStorageSentinel` payload returned by `LegacyLocalStorageProbe.swift`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyLocalStorageSnapshot {
    pub origin: String,
    pub length: usize,
    pub keys: Vec<String>,
    pub entries: BTreeMap<String, String>,
    #[serde(default)]
    pub idb_access_count: u64,
}

/// Structured state imported from allowlisted `capacitor://localhost` `localStorage` keys
/// (camelCase wire DTO for `HostBootstrapCoordinator.swift`, backed by `affine-legacy-import`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedLegacyState {
    pub local_workspace_ids: Vec<String>,
    #[serde(default)]
    pub has_local_workspace_key: bool,
    pub servers: Vec<serde_json::Value>,
    #[serde(default)]
    pub has_server_list_key: bool,
    pub server_configs: BTreeMap<String, serde_json::Value>,
    pub auth_caches: BTreeMap<String, serde_json::Value>,
    #[serde(default)]
    pub cloud_workspace_caches: BTreeMap<String, String>,
    pub feature_flags: BTreeMap<String, serde_json::Value>,
    pub i18n_lng: Option<String>,
    pub last_workspace_id: Option<String>,
    pub last_workspace_flavour: Option<String>,
    pub affine_settings: Option<serde_json::Value>,
    pub theme: Option<String>,
    #[serde(default)]
    pub raw_unparsed_entries: BTreeMap<String, String>,
}

/// Result of classifying a positive sentinel snapshot before creating any default workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum LegacyUpgradeDisposition {
    FreshInstall { state: ImportedLegacyState },
    ExistingUser { state: ImportedLegacyState },
}

/// Deterministic mutation plan written back to `capacitor://localhost` `localStorage`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyWriteBackPlan {
    pub set: BTreeMap<String, String>,
    pub remove: Vec<String>,
}

/// Return true if `key` is permitted by `affine-legacy-import`'s single authoritative allowlist.
pub fn is_whitelisted_legacy_key(key: &str) -> bool {
    is_permitted_sentinel_entry_key(key)
}

fn from_canonical(snap: CanonicalSnapshot) -> ImportedLegacyState {
    let servers = snap
        .server_list
        .into_iter()
        .filter_map(|s| serde_json::to_value(s).ok())
        .collect();
    let auth_caches = snap
        .server_auth_sessions
        .into_iter()
        .map(|(sid, v)| (format!("{PREFIX_GLOBAL_STATE}{sid}{SUFFIX_SERVER_AUTH}"), v))
        .collect();
    let feature_flags = snap
        .feature_flags
        .into_iter()
        .map(|(name, v)| {
            let key = if snap.global_state_flag_names.contains(&name) {
                format!("{PREFIX_GLOBAL_STATE_FEATURE_FLAG}{name}")
            } else {
                format!("{PREFIX_FEATURE_FLAG}{name}")
            };
            (key, v)
        })
        .collect();
    ImportedLegacyState {
        local_workspace_ids: snap.local_workspace_ids,
        has_local_workspace_key: snap.has_local_workspace_key,
        servers,
        has_server_list_key: snap.has_server_list_key,
        server_configs: snap.server_configs,
        auth_caches,
        cloud_workspace_caches: snap.cloud_workspace_caches,
        feature_flags,
        i18n_lng: snap.i18n_lng,
        last_workspace_id: snap.last_workspace_id,
        last_workspace_flavour: snap.last_workspace_flavour,
        affine_settings: snap.affine_settings,
        theme: snap.theme,
        raw_unparsed_entries: snap.preserved_raw_entries,
    }
}

fn to_canonical(state: &ImportedLegacyState) -> CanonicalSnapshot {
    let server_list = state
        .servers
        .iter()
        .filter_map(|v| serde_json::from_value::<LegacyServerMetadata>(v.clone()).ok())
        .collect();
    let mut server_auth_sessions = BTreeMap::new();
    let mut preserved = state.raw_unparsed_entries.clone();
    for (key, value) in &state.auth_caches {
        if let Some(sid) = key
            .strip_prefix(PREFIX_GLOBAL_STATE)
            .and_then(|r| r.strip_suffix(SUFFIX_SERVER_AUTH))
            && !sid.is_empty()
            && !sid.contains(':')
        {
            server_auth_sessions.insert(sid.to_string(), value.clone());
        } else if is_permitted_sentinel_entry_key(key)
            && let Ok(encoded) = serde_json::to_string(value)
        {
            preserved.insert(key.clone(), encoded);
        }
    }
    let mut feature_flags = BTreeMap::new();
    let mut global_state_flag_names = BTreeSet::new();
    for (key, value) in &state.feature_flags {
        if let Some(name) = key.strip_prefix(PREFIX_GLOBAL_STATE_FEATURE_FLAG)
            && !name.is_empty()
        {
            feature_flags.insert(name.to_string(), value.clone());
            global_state_flag_names.insert(name.to_string());
        } else if let Some(name) = key.strip_prefix(PREFIX_FEATURE_FLAG)
            && !name.is_empty()
        {
            feature_flags.insert(name.to_string(), value.clone());
        }
    }
    CanonicalSnapshot {
        local_workspace_ids: state.local_workspace_ids.clone(),
        has_local_workspace_key: state.has_local_workspace_key,
        server_list,
        has_server_list_key: state.has_server_list_key,
        server_configs: state.server_configs.clone(),
        server_auth_sessions,
        cloud_workspace_caches: state.cloud_workspace_caches.clone(),
        feature_flags,
        global_state_flag_names,
        i18n_lng: state.i18n_lng.clone(),
        last_workspace_id: state.last_workspace_id.clone(),
        last_workspace_flavour: state.last_workspace_flavour.clone(),
        affine_settings: state.affine_settings.clone(),
        theme: state.theme.clone(),
        preserved_raw_entries: preserved,
    }
}

/// Validate the unified `WebViewStorageSentinel` and parse allowlisted `localStorage` entries
/// via `affine-legacy-import` (checking `idb_access_count == 0` first).
pub fn parse_legacy_snapshot(
    snapshot: &LegacyLocalStorageSnapshot,
) -> Result<LegacyUpgradeDisposition, LegacyStorageError> {
    if snapshot.idb_access_count != 0 {
        return Err(LegacyStorageError::IndexedDbTouched(
            snapshot.idb_access_count,
        ));
    }
    let sentinel = WebViewStorageSentinel {
        origin: snapshot.origin.clone(),
        length: snapshot.length,
        keys: snapshot.keys.clone(),
        entries: snapshot.entries.clone(),
    };
    let (eval, canonical) =
        import_from_sentinel(&sentinel, &[LEGACY_CAPACITOR_ORIGIN]).map_err(|err| match err {
            LegacyImportError::SentinelFailed(SentinelFailureReason::OriginMismatch { actual }) => {
                LegacyStorageError::WrongOrigin(actual)
            }
            LegacyImportError::SentinelFailed(SentinelFailureReason::EmptyOrigin) => {
                LegacyStorageError::WrongOrigin(snapshot.origin.clone())
            }
            LegacyImportError::SentinelFailed(reason) => {
                LegacyStorageError::InvalidSentinel(format!("{reason:?}"))
            }
            other => LegacyStorageError::InvalidSentinel(other.to_string()),
        })?;
    let state = from_canonical(canonical);
    match eval {
        SentinelEvaluation::ValidEmpty
        | SentinelEvaluation::ValidPopulated {
            has_allowlisted_keys: false,
        } => Ok(LegacyUpgradeDisposition::FreshInstall { state }),
        SentinelEvaluation::ValidPopulated {
            has_allowlisted_keys: true,
        } => Ok(LegacyUpgradeDisposition::ExistingUser { state }),
        SentinelEvaluation::UnreadyOrMismatch(reason) => {
            Err(LegacyStorageError::InvalidSentinel(format!("{reason:?}")))
        }
    }
}

impl ImportedLegacyState {
    /// Build a rollback write-back plan for `capacitor://localhost` `localStorage` using
    /// `affine-legacy-import`'s serializer, propagating serialization errors instead of
    /// silently emitting empty `set` / destructive `remove` plans.
    pub fn to_write_back_plan(
        &self,
        previous_keys: &[String],
    ) -> Result<LegacyWriteBackPlan, LegacyStorageError> {
        let mut canonical = to_canonical(self);
        if !canonical
            .preserved_raw_entries
            .contains_key(KEY_LOCAL_WORKSPACE_LIST)
        {
            canonical.has_local_workspace_key = true;
        }
        if previous_keys.iter().any(|k| k == KEY_SERVER_LIST)
            && !canonical
                .preserved_raw_entries
                .contains_key(KEY_SERVER_LIST)
        {
            canonical.has_server_list_key = true;
        }
        let set = serialize_snapshot_entries(&canonical).map_err(|err| match err {
            LegacyImportError::DisallowedKey(key) => LegacyStorageError::InvalidSentinel(key),
            LegacyImportError::MalformedJson { key, message } => {
                LegacyStorageError::InvalidJson(format!("{key}: {message}"))
            }
            LegacyImportError::SentinelFailed(reason) => {
                LegacyStorageError::InvalidSentinel(format!("{reason:?}"))
            }
        })?;
        let mut remove: Vec<String> = previous_keys
            .iter()
            .filter(|prev| {
                is_permitted_sentinel_entry_key(prev)
                    && prev.as_str() != KEY_LOCAL_WORKSPACE_LIST
                    && !set.contains_key(prev.as_str())
            })
            .cloned()
            .collect();
        remove.sort();
        remove.dedup();
        Ok(LegacyWriteBackPlan { set, remove })
    }
}

/// Verify that a post-write-back readback snapshot matches the plan with zero IDB access.
pub fn verify_write_back_readback(
    plan: &LegacyWriteBackPlan,
    readback: &LegacyLocalStorageSnapshot,
) -> Result<(), LegacyStorageError> {
    if readback.origin != LEGACY_CAPACITOR_ORIGIN {
        return Err(LegacyStorageError::WrongOrigin(readback.origin.clone()));
    }
    if readback.idb_access_count != 0 {
        return Err(LegacyStorageError::IndexedDbTouched(
            readback.idb_access_count,
        ));
    }
    for (key, expected) in &plan.set {
        let actual = readback.entries.get(key);
        if actual != Some(expected) {
            return Err(LegacyStorageError::WriteBackMismatch {
                key: key.clone(),
                expected: Some(expected.clone()),
                actual: actual.cloned(),
            });
        }
    }
    for key in &plan.remove {
        if let Some(actual) = readback.entries.get(key) {
            return Err(LegacyStorageError::WriteBackMismatch {
                key: key.clone(),
                expected: None,
                actual: Some(actual.clone()),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupt_workspace_preservation_writeback_roundtrip_and_disallowed_error() {
        assert!(is_whitelisted_legacy_key(
            "global-state:cloud-workspace:acct-1"
        ));
        assert!(is_whitelisted_legacy_key(
            "global-state:selfhosted-workspace-s1:acct-2"
        ));
        assert!(!is_whitelisted_legacy_key("unrelated-key"));

        let idb_touched = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 0,
            keys: vec![],
            entries: BTreeMap::new(),
            idb_access_count: 1,
        };
        assert_eq!(
            parse_legacy_snapshot(&idb_touched),
            Err(LegacyStorageError::IndexedDbTouched(1))
        );

        // 1. Corrupt affine-local-workspace -> ExistingUser with 0 local workspaces + verbatim write-back.
        for raw_corrupt in ["{broken", "{}", "\"abc\""] {
            let corrupt_ws = LegacyLocalStorageSnapshot {
                origin: LEGACY_CAPACITOR_ORIGIN.into(),
                length: 2,
                keys: vec![LOCAL_WORKSPACE_KEY.into(), THEME_KEY.into()],
                entries: BTreeMap::from([
                    (LOCAL_WORKSPACE_KEY.into(), raw_corrupt.into()),
                    (THEME_KEY.into(), "dark".into()),
                ]),
                idb_access_count: 0,
            };
            let LegacyUpgradeDisposition::ExistingUser { mut state } =
                parse_legacy_snapshot(&corrupt_ws).expect("corrupt list must preserve verbatim")
            else {
                panic!("corrupt affine-local-workspace must classify as ExistingUser");
            };
            assert!(state.local_workspace_ids.is_empty());
            assert!(state.has_local_workspace_key);
            state.theme = Some("light".into());
            let plan = state.to_write_back_plan(&corrupt_ws.keys).unwrap();
            assert_eq!(
                plan.set.get(LOCAL_WORKSPACE_KEY).map(String::as_str),
                Some(raw_corrupt),
                "untouched corrupt affine-local-workspace must write back verbatim"
            );
            assert_eq!(plan.set.get(THEME_KEY).map(String::as_str), Some("light"));
            assert!(plan.remove.is_empty());

            // Retiring the preserved raw entry and updating local_workspace_ids emits new JSON array.
            state.raw_unparsed_entries.remove(LOCAL_WORKSPACE_KEY);
            state.local_workspace_ids = vec!["ws-new".into()];
            state.has_local_workspace_key = true;
            let updated_plan = state.to_write_back_plan(&corrupt_ws.keys).unwrap();
            assert_eq!(
                updated_plan
                    .set
                    .get(LOCAL_WORKSPACE_KEY)
                    .map(String::as_str),
                Some(r#"["ws-new"]"#)
            );
        }

        // 2. import -> mutate -> to_write_back_plan -> verify_write_back_readback closed loop.
        let valid = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 3,
            keys: vec![
                "__cap_noise__".into(),
                LOCAL_WORKSPACE_KEY.into(),
                THEME_KEY.into(),
            ],
            entries: BTreeMap::from([
                (
                    LOCAL_WORKSPACE_KEY.into(),
                    r#"["ws-1","ws-2","ws-1"]"#.into(),
                ),
                (THEME_KEY.into(), "dark".into()),
            ]),
            idb_access_count: 0,
        };
        let LegacyUpgradeDisposition::ExistingUser { mut state } =
            parse_legacy_snapshot(&valid).unwrap()
        else {
            panic!("expected existing user");
        };
        assert_eq!(state.local_workspace_ids, vec!["ws-1", "ws-2"]);
        state.theme = Some("light".into());
        let plan = state.to_write_back_plan(&valid.keys).unwrap();
        assert_eq!(
            plan.set.get(LOCAL_WORKSPACE_KEY).map(String::as_str),
            Some(r#"["ws-1","ws-2"]"#)
        );
        assert_eq!(plan.set.get(THEME_KEY).map(String::as_str), Some("light"));
        assert!(plan.remove.is_empty());
        let readback = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 3,
            keys: valid.keys.clone(),
            entries: plan.set.clone(),
            idb_access_count: 0,
        };
        verify_write_back_readback(&plan, &readback).unwrap();

        // 3. Disallowed key in raw_unparsed_entries must return Err instead of wiping all keys.
        state
            .raw_unparsed_entries
            .insert("unrelated.preference".into(), "x".into());
        assert!(matches!(
            state.to_write_back_plan(&valid.keys),
            Err(LegacyStorageError::InvalidSentinel(_))
        ));
    }
}
