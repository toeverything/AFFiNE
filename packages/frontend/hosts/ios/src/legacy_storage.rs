use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Exact origin used by Capacitor 0.27.5 on iOS.
pub const LEGACY_CAPACITOR_ORIGIN: &str = "capacitor://localhost";

pub const LOCAL_WORKSPACE_KEY: &str = "affine-local-workspace";
pub const SERVER_LIST_KEY: &str = "global-state:serverList";
pub const SERVER_CONFIG_PREFIX: &str = "global-state:serverConfig:";
pub const GLOBAL_STATE_PREFIX: &str = "global-state:";
pub const AUTH_KEY_SUFFIX: &str = "-auth";
pub const FLAG_PREFIX: &str = "affine-flag:";
pub const GLOBAL_STATE_FLAG_PREFIX: &str = "global-state:affine-flag:";
pub const I18N_KEY: &str = "global-cache:i18n_lng";
pub const LAST_WORKSPACE_ID_KEY: &str = "last_workspace_id";
pub const LAST_WORKSPACE_FLAVOUR_KEY: &str = "last_workspace_flavour";
pub const AFFINE_SETTINGS_KEY: &str = "affine-settings";
pub const THEME_KEY: &str = "theme";

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
///
/// `length` is `window.localStorage.length`, `keys` contains every key in
/// `window.localStorage` (sorted, `keys.len() == length`), and `entries` contains
/// strictly the whitelisted key-value pairs.
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

/// Structured state imported from whitelisted `capacitor://localhost` `localStorage` keys.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedLegacyState {
    /// Ordered, deduplicated local workspace IDs from `affine-local-workspace` (invariant F1).
    pub local_workspace_ids: Vec<String>,
    pub servers: Vec<serde_json::Value>,
    pub server_configs: BTreeMap<String, serde_json::Value>,
    /// Preserved `<serverId>-auth` / `global-state:<serverId>-auth` entries keyed by storage key.
    pub auth_caches: BTreeMap<String, serde_json::Value>,
    /// Preserved `affine-flag:*` / `global-state:affine-flag:*` entries keyed by storage key.
    pub feature_flags: BTreeMap<String, serde_json::Value>,
    pub i18n_lng: Option<String>,
    pub last_workspace_id: Option<String>,
    pub last_workspace_flavour: Option<String>,
    pub affine_settings: Option<serde_json::Value>,
    pub theme: Option<String>,
    /// Raw string values for whitelisted keys that could not be parsed as expected JSON,
    /// preserved verbatim on write-back so rollback never drops unrecognized data.
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

/// Deterministic mutation plan written back to `capacitor://localhost` `localStorage`
/// so downgrading back to 0.27.5 sees workspaces, servers, and preferences consistently.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyWriteBackPlan {
    pub set: BTreeMap<String, String>,
    pub remove: Vec<String>,
}

/// Return true if `key` belongs to the 0.27.5 synchronous `localStorage` import whitelist.
pub fn is_whitelisted_legacy_key(key: &str) -> bool {
    if matches!(
        key,
        LOCAL_WORKSPACE_KEY
            | SERVER_LIST_KEY
            | I18N_KEY
            | LAST_WORKSPACE_ID_KEY
            | LAST_WORKSPACE_FLAVOUR_KEY
            | AFFINE_SETTINGS_KEY
            | THEME_KEY
    ) {
        return true;
    }
    if let Some(server_id) = key.strip_prefix(SERVER_CONFIG_PREFIX) {
        return !server_id.is_empty();
    }
    if let Some(flag) = key.strip_prefix(FLAG_PREFIX) {
        return !flag.is_empty();
    }
    if let Some(flag) = key.strip_prefix(GLOBAL_STATE_FLAG_PREFIX) {
        return !flag.is_empty();
    }
    if let Some(prefix) = key.strip_suffix(AUTH_KEY_SUFFIX) {
        let server_id = prefix.strip_prefix(GLOBAL_STATE_PREFIX).unwrap_or(prefix);
        return !server_id.is_empty();
    }
    false
}

/// Normalize and deduplicate workspace IDs identically to `workspace-id-utils.ts`
/// (`Array.isArray`, filter strings, preserve first-seen order).
pub fn normalize_and_dedupe_workspace_ids(raw: &str) -> Vec<String> {
    let Ok(serde_json::Value::Array(items)) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Vec::new();
    };
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for item in items {
        if let serde_json::Value::String(id) = item {
            if seen.insert(id.clone()) {
                out.push(id);
            }
        }
    }
    out
}

fn decode_json_string_or_raw(raw: &str) -> String {
    serde_json::from_str::<String>(raw).unwrap_or_else(|_| raw.to_string())
}

/// Validate the unified `WebViewStorageSentinel` and parse whitelisted `localStorage` entries.
///
/// Enforces:
/// 1. `origin == "capacitor://localhost"`
/// 2. `idb_access_count == 0`
/// 3. `keys.len() == length` with zero duplicate keys
/// 4. Every key in `entries` exists in `keys` and satisfies `is_whitelisted_legacy_key`
/// 5. Every whitelisted key in `keys` is present in `entries`
///
/// Classifies as `FreshInstall` iff `entries.is_empty()` (even when unrelated non-whitelisted
/// keys exist in `keys`), otherwise `ExistingUser`.
pub fn parse_legacy_snapshot(
    snapshot: &LegacyLocalStorageSnapshot,
) -> Result<LegacyUpgradeDisposition, LegacyStorageError> {
    if snapshot.origin != LEGACY_CAPACITOR_ORIGIN {
        return Err(LegacyStorageError::WrongOrigin(snapshot.origin.clone()));
    }
    if snapshot.idb_access_count != 0 {
        return Err(LegacyStorageError::IndexedDbTouched(
            snapshot.idb_access_count,
        ));
    }
    if snapshot.keys.len() != snapshot.length {
        return Err(LegacyStorageError::InvalidSentinel(format!(
            "keys length ({}) does not match localStorage length ({})",
            snapshot.keys.len(),
            snapshot.length
        )));
    }
    let mut key_set = BTreeSet::new();
    for key in &snapshot.keys {
        if !key_set.insert(key.as_str()) {
            return Err(LegacyStorageError::InvalidSentinel(format!(
                "duplicate key in sentinel keys: {key:?}"
            )));
        }
    }
    for key in snapshot.entries.keys() {
        if !key_set.contains(key.as_str()) {
            return Err(LegacyStorageError::InvalidSentinel(format!(
                "entry key missing from sentinel keys: {key:?}"
            )));
        }
        if !is_whitelisted_legacy_key(key) {
            return Err(LegacyStorageError::InvalidSentinel(format!(
                "non-whitelisted key in sentinel entries: {key:?}"
            )));
        }
    }
    for key in &snapshot.keys {
        if is_whitelisted_legacy_key(key) && !snapshot.entries.contains_key(key) {
            return Err(LegacyStorageError::InvalidSentinel(format!(
                "whitelisted key in sentinel keys missing from entries: {key:?}"
            )));
        }
    }

    let mut state = ImportedLegacyState::default();
    for (key, value) in &snapshot.entries {
        if key == LOCAL_WORKSPACE_KEY {
            if matches!(
                serde_json::from_str::<serde_json::Value>(value),
                Ok(serde_json::Value::Array(_))
            ) {
                state.local_workspace_ids = normalize_and_dedupe_workspace_ids(value);
            } else {
                // Corrupt `affine-local-workspace`: fail-closed on mount (empty list)
                // while preserving the exact raw string so rollback never overwrites it with "[]".
                state
                    .raw_unparsed_entries
                    .insert(key.clone(), value.clone());
            }
        } else if key == SERVER_LIST_KEY {
            if let Ok(serde_json::Value::Array(list)) = serde_json::from_str(value) {
                state.servers = list;
            } else {
                state
                    .raw_unparsed_entries
                    .insert(key.clone(), value.clone());
            }
        } else if let Some(server_id) = key.strip_prefix(SERVER_CONFIG_PREFIX) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(value) {
                state.server_configs.insert(server_id.to_string(), parsed);
            } else {
                state
                    .raw_unparsed_entries
                    .insert(key.clone(), value.clone());
            }
        } else if key.starts_with(FLAG_PREFIX) || key.starts_with(GLOBAL_STATE_FLAG_PREFIX) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(value) {
                state.feature_flags.insert(key.clone(), parsed);
            } else {
                state
                    .raw_unparsed_entries
                    .insert(key.clone(), value.clone());
            }
        } else if key.ends_with(AUTH_KEY_SUFFIX) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(value) {
                state.auth_caches.insert(key.clone(), parsed);
            } else {
                state
                    .raw_unparsed_entries
                    .insert(key.clone(), value.clone());
            }
        } else if key == I18N_KEY {
            state.i18n_lng = Some(decode_json_string_or_raw(value));
        } else if key == LAST_WORKSPACE_ID_KEY {
            state.last_workspace_id = Some(value.clone());
        } else if key == LAST_WORKSPACE_FLAVOUR_KEY {
            state.last_workspace_flavour = Some(value.clone());
        } else if key == AFFINE_SETTINGS_KEY {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(value) {
                state.affine_settings = Some(parsed);
            } else {
                state
                    .raw_unparsed_entries
                    .insert(key.clone(), value.clone());
            }
        } else if key == THEME_KEY {
            state.theme = Some(value.clone());
        }
    }

    if snapshot.entries.is_empty() {
        Ok(LegacyUpgradeDisposition::FreshInstall { state })
    } else {
        Ok(LegacyUpgradeDisposition::ExistingUser { state })
    }
}

impl ImportedLegacyState {
    /// Append a local workspace ID while preserving order and uniqueness.
    pub fn add_local_workspace(&mut self, workspace_id: &str) {
        if !workspace_id.is_empty()
            && !self
                .local_workspace_ids
                .iter()
                .any(|existing| existing == workspace_id)
        {
            self.raw_unparsed_entries.remove(LOCAL_WORKSPACE_KEY);
            self.local_workspace_ids.push(workspace_id.to_string());
        }
    }

    /// Remove a local workspace ID from the allowlist (never resurrects `.db` files).
    pub fn remove_local_workspace(&mut self, workspace_id: &str) {
        self.raw_unparsed_entries.remove(LOCAL_WORKSPACE_KEY);
        self.local_workspace_ids
            .retain(|existing| existing != workspace_id);
        if self.last_workspace_id.as_deref() == Some(workspace_id) {
            self.last_workspace_id = None;
            self.last_workspace_flavour = None;
        }
    }

    /// Add or replace a self-hosted server entry and optional cached config.
    pub fn upsert_server(
        &mut self,
        server_id: &str,
        metadata: serde_json::Value,
        config: Option<serde_json::Value>,
    ) {
        self.servers
            .retain(|item| item.get("id").and_then(|v| v.as_str()) != Some(server_id));
        self.servers.push(metadata);
        if let Some(cfg) = config {
            self.server_configs.insert(server_id.to_string(), cfg);
            self.raw_unparsed_entries
                .remove(&format!("{SERVER_CONFIG_PREFIX}{server_id}"));
        }
    }

    /// Remove a self-hosted server entry and its cached config/auth keys.
    pub fn remove_server(&mut self, server_id: &str) {
        self.servers
            .retain(|item| item.get("id").and_then(|v| v.as_str()) != Some(server_id));
        self.server_configs.remove(server_id);
        self.raw_unparsed_entries
            .remove(&format!("{SERVER_CONFIG_PREFIX}{server_id}"));
        self.auth_caches.remove(&format!(
            "{GLOBAL_STATE_PREFIX}{server_id}{AUTH_KEY_SUFFIX}"
        ));
        self.auth_caches
            .remove(&format!("{server_id}{AUTH_KEY_SUFFIX}"));
        self.raw_unparsed_entries.remove(&format!(
            "{GLOBAL_STATE_PREFIX}{server_id}{AUTH_KEY_SUFFIX}"
        ));
        self.raw_unparsed_entries
            .remove(&format!("{server_id}{AUTH_KEY_SUFFIX}"));
    }

    /// Build a rollback write-back plan for `capacitor://localhost` `localStorage`.
    ///
    /// Strictly restricts both `set` and `remove` to whitelisted keys, never removes
    /// `affine-local-workspace`, and preserves any raw unparsed whitelisted strings verbatim.
    pub fn to_write_back_plan(&self, previous_keys: &[String]) -> LegacyWriteBackPlan {
        let mut set = BTreeMap::new();

        for (key, raw) in &self.raw_unparsed_entries {
            if is_whitelisted_legacy_key(key) {
                set.insert(key.clone(), raw.clone());
            }
        }

        if !self.raw_unparsed_entries.contains_key(LOCAL_WORKSPACE_KEY) {
            set.insert(
                LOCAL_WORKSPACE_KEY.to_string(),
                serde_json::to_string(&self.local_workspace_ids)
                    .unwrap_or_else(|_| "[]".to_string()),
            );
        }
        if !self.servers.is_empty()
            || (previous_keys.iter().any(|k| k == SERVER_LIST_KEY)
                && !set.contains_key(SERVER_LIST_KEY))
        {
            set.insert(
                SERVER_LIST_KEY.to_string(),
                serde_json::to_string(&self.servers).unwrap_or_else(|_| "[]".to_string()),
            );
        }
        for (server_id, cfg) in &self.server_configs {
            if let Ok(encoded) = serde_json::to_string(cfg) {
                set.insert(format!("{SERVER_CONFIG_PREFIX}{server_id}"), encoded);
            }
        }
        for (key, value) in &self.auth_caches {
            if is_whitelisted_legacy_key(key)
                && let Ok(encoded) = serde_json::to_string(value)
            {
                set.insert(key.clone(), encoded);
            }
        }
        for (key, value) in &self.feature_flags {
            if is_whitelisted_legacy_key(key)
                && let Ok(encoded) = serde_json::to_string(value)
            {
                set.insert(key.clone(), encoded);
            }
        }
        if let Some(lng) = &self.i18n_lng {
            if let Ok(encoded) = serde_json::to_string(lng) {
                set.insert(I18N_KEY.to_string(), encoded);
            }
        }
        if let Some(last_id) = &self.last_workspace_id {
            set.insert(LAST_WORKSPACE_ID_KEY.to_string(), last_id.clone());
        }
        if let Some(flavour) = &self.last_workspace_flavour {
            set.insert(LAST_WORKSPACE_FLAVOUR_KEY.to_string(), flavour.clone());
        }
        if let Some(settings) = &self.affine_settings {
            if let Ok(encoded) = serde_json::to_string(settings) {
                set.insert(AFFINE_SETTINGS_KEY.to_string(), encoded);
            }
        }
        if let Some(theme) = &self.theme {
            set.insert(THEME_KEY.to_string(), theme.clone());
        }

        let mut remove = Vec::new();
        for prev in previous_keys {
            if is_whitelisted_legacy_key(prev)
                && prev != LOCAL_WORKSPACE_KEY
                && !set.contains_key(prev)
            {
                remove.push(prev.clone());
            }
        }
        remove.sort();
        remove.dedup();

        LegacyWriteBackPlan { set, remove }
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
    fn whitelist_matches_exact_prefix_and_auth_keys() {
        let allowed = [
            "affine-local-workspace",
            "global-state:serverList",
            "global-state:serverConfig:self-host-1",
            "global-state:affine-cloud-auth",
            "self-host-1-auth",
            "affine-flag:enable_disk_sync",
            "global-state:affine-flag:enable_ai",
            "global-cache:i18n_lng",
            "last_workspace_id",
            "last_workspace_flavour",
            "affine-settings",
            "theme",
        ];
        for key in allowed {
            assert!(is_whitelisted_legacy_key(key), "expected allowed: {key}");
        }

        let denied = [
            "global-state:serverConfig:",
            "affine-flag:",
            "global-state:affine-flag:",
            "-auth",
            "global-state:-auth",
            "unrelated-key",
            "global-state:other",
        ];
        for key in denied {
            assert!(!is_whitelisted_legacy_key(key), "expected denied: {key}");
        }
    }

    #[test]
    fn sentinel_distinguishes_fresh_install_existing_user_wrong_origin_and_idb_violation() {
        let fresh = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 0,
            keys: vec![],
            entries: BTreeMap::new(),
            idb_access_count: 0,
        };
        assert!(matches!(
            parse_legacy_snapshot(&fresh).unwrap(),
            LegacyUpgradeDisposition::FreshInstall { .. }
        ));

        // Fresh install with unrelated non-AFFiNE key in localStorage must still classify as FreshInstall.
        let fresh_with_noise = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 1,
            keys: vec!["__cap_init__".into()],
            entries: BTreeMap::new(),
            idb_access_count: 0,
        };
        assert!(matches!(
            parse_legacy_snapshot(&fresh_with_noise).unwrap(),
            LegacyUpgradeDisposition::FreshInstall { .. }
        ));

        // Existing user who deleted every local workspace retains "affine-local-workspace": "[]".
        let empty_existing = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 1,
            keys: vec![LOCAL_WORKSPACE_KEY.into()],
            entries: BTreeMap::from([(LOCAL_WORKSPACE_KEY.into(), "[]".into())]),
            idb_access_count: 0,
        };
        assert!(matches!(
            parse_legacy_snapshot(&empty_existing).unwrap(),
            LegacyUpgradeDisposition::ExistingUser { state } if state.local_workspace_ids.is_empty()
        ));

        // Mixed whitelisted + unrelated noise key classifies as ExistingUser and ignores noise.
        let mixed_existing = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 2,
            keys: vec![LOCAL_WORKSPACE_KEY.into(), "unrelated.pref".into()],
            entries: BTreeMap::from([(LOCAL_WORKSPACE_KEY.into(), r#"["ws-1"]"#.into())]),
            idb_access_count: 0,
        };
        assert!(matches!(
            parse_legacy_snapshot(&mixed_existing).unwrap(),
            LegacyUpgradeDisposition::ExistingUser { state } if state.local_workspace_ids == vec!["ws-1"]
        ));

        let wrong_origin = LegacyLocalStorageSnapshot {
            origin: "about:blank".into(),
            ..fresh.clone()
        };
        assert_eq!(
            parse_legacy_snapshot(&wrong_origin),
            Err(LegacyStorageError::WrongOrigin("about:blank".into()))
        );

        let idb_touched = LegacyLocalStorageSnapshot {
            idb_access_count: 1,
            ..fresh
        };
        assert_eq!(
            parse_legacy_snapshot(&idb_touched),
            Err(LegacyStorageError::IndexedDbTouched(1))
        );

        let invalid_sentinels = [
            // keys.len() != length
            LegacyLocalStorageSnapshot {
                origin: LEGACY_CAPACITOR_ORIGIN.into(),
                length: 2,
                keys: vec![THEME_KEY.into()],
                entries: BTreeMap::from([(THEME_KEY.into(), "dark".into())]),
                idb_access_count: 0,
            },
            // duplicate key in keys
            LegacyLocalStorageSnapshot {
                origin: LEGACY_CAPACITOR_ORIGIN.into(),
                length: 2,
                keys: vec![THEME_KEY.into(), THEME_KEY.into()],
                entries: BTreeMap::from([(THEME_KEY.into(), "dark".into())]),
                idb_access_count: 0,
            },
            // non-whitelisted key leaked into entries
            LegacyLocalStorageSnapshot {
                origin: LEGACY_CAPACITOR_ORIGIN.into(),
                length: 1,
                keys: vec!["unrelated-key".into()],
                entries: BTreeMap::from([("unrelated-key".into(), "1".into())]),
                idb_access_count: 0,
            },
            // entry key missing from keys
            LegacyLocalStorageSnapshot {
                origin: LEGACY_CAPACITOR_ORIGIN.into(),
                length: 1,
                keys: vec!["unrelated-key".into()],
                entries: BTreeMap::from([(THEME_KEY.into(), "dark".into())]),
                idb_access_count: 0,
            },
            // whitelisted key in keys missing from entries
            LegacyLocalStorageSnapshot {
                origin: LEGACY_CAPACITOR_ORIGIN.into(),
                length: 1,
                keys: vec![THEME_KEY.into()],
                entries: BTreeMap::new(),
                idb_access_count: 0,
            },
        ];
        for bad in invalid_sentinels {
            assert!(
                matches!(
                    parse_legacy_snapshot(&bad),
                    Err(LegacyStorageError::InvalidSentinel(_))
                ),
                "expected InvalidSentinel for {bad:?}"
            );
        }
    }

    #[test]
    fn import_mutate_write_back_preserves_unparsed_values_and_ignores_unrelated_keys() {
        let mut entries = BTreeMap::new();
        entries.insert(
            LOCAL_WORKSPACE_KEY.into(),
            r#"["ws-1","ws-2","ws-1",42]"#.into(),
        );
        entries.insert(
            SERVER_LIST_KEY.into(),
            r#"[{"id":"srv-1","baseUrl":"https://self.example.com"}]"#.into(),
        );
        entries.insert(
            "global-state:serverConfig:srv-1".into(),
            r#"{"serverName":"Self","type":"selfhosted"}"#.into(),
        );
        entries.insert(
            "global-state:srv-1-auth".into(),
            r#"{"account":{"id":"u-1"}}"#.into(),
        );
        entries.insert("global-state:affine-flag:enable_ai".into(), "true".into());
        entries.insert(I18N_KEY.into(), r#""zh-Hans""#.into());
        entries.insert(LAST_WORKSPACE_ID_KEY.into(), "ws-1".into());
        entries.insert(LAST_WORKSPACE_FLAVOUR_KEY.into(), "local".into());
        // Intentionally non-JSON whitelisted value to ensure verbatim preservation.
        entries.insert(AFFINE_SETTINGS_KEY.into(), "raw-legacy-settings".into());
        entries.insert(THEME_KEY.into(), "dark".into());

        let mut all_keys: Vec<String> = entries.keys().cloned().collect();
        all_keys.push("unrelated.preference".into());
        all_keys.sort();

        let snapshot = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: all_keys.len(),
            keys: all_keys.clone(),
            entries: entries.clone(),
            idb_access_count: 0,
        };

        let LegacyUpgradeDisposition::ExistingUser { mut state } =
            parse_legacy_snapshot(&snapshot).unwrap()
        else {
            panic!("expected existing user");
        };
        assert_eq!(state.local_workspace_ids, vec!["ws-1", "ws-2"]);
        assert_eq!(state.i18n_lng.as_deref(), Some("zh-Hans"));
        assert_eq!(state.theme.as_deref(), Some("dark"));
        assert_eq!(
            state
                .raw_unparsed_entries
                .get(AFFINE_SETTINGS_KEY)
                .map(String::as_str),
            Some("raw-legacy-settings")
        );

        state.remove_local_workspace("ws-1");
        state.add_local_workspace("ws-3");
        state.remove_server("srv-1");
        state.theme = Some("light".into());

        let plan = state.to_write_back_plan(&all_keys);
        assert_eq!(
            plan.set.get(LOCAL_WORKSPACE_KEY).map(String::as_str),
            Some(r#"["ws-2","ws-3"]"#)
        );
        assert_eq!(plan.set.get(THEME_KEY).map(String::as_str), Some("light"));
        assert_eq!(
            plan.set.get(AFFINE_SETTINGS_KEY).map(String::as_str),
            Some("raw-legacy-settings")
        );
        assert!(
            plan.remove
                .contains(&"global-state:serverConfig:srv-1".to_string())
        );
        assert!(plan.remove.contains(&"global-state:srv-1-auth".to_string()));
        assert!(plan.remove.contains(&LAST_WORKSPACE_ID_KEY.to_string()));
        assert!(!plan.remove.contains(&"unrelated.preference".to_string()));
        assert!(!plan.remove.contains(&LOCAL_WORKSPACE_KEY.to_string()));

        let mut simulated = snapshot.entries.clone();
        for (k, v) in &plan.set {
            simulated.insert(k.clone(), v.clone());
        }
        for k in &plan.remove {
            simulated.remove(k);
        }
        let mut readback_keys: Vec<String> = simulated.keys().cloned().collect();
        readback_keys.push("unrelated.preference".into());
        readback_keys.sort();
        let readback = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: readback_keys.len(),
            keys: readback_keys,
            entries: simulated,
            idb_access_count: 0,
        };
        verify_write_back_readback(&plan, &readback).unwrap();
    }

    #[test]
    fn corrupt_local_workspace_fails_closed_on_mount_and_preserves_raw_string_on_write_back() {
        let corrupt_snapshot = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 2,
            keys: vec![LOCAL_WORKSPACE_KEY.into(), THEME_KEY.into()],
            entries: BTreeMap::from([
                (LOCAL_WORKSPACE_KEY.into(), "{broken".into()),
                (THEME_KEY.into(), "dark".into()),
            ]),
            idb_access_count: 0,
        };
        let LegacyUpgradeDisposition::ExistingUser { state } =
            parse_legacy_snapshot(&corrupt_snapshot).unwrap()
        else {
            panic!("expected existing user for corrupt affine-local-workspace");
        };
        assert!(state.local_workspace_ids.is_empty());
        assert_eq!(
            state
                .raw_unparsed_entries
                .get(LOCAL_WORKSPACE_KEY)
                .map(String::as_str),
            Some("{broken")
        );

        let plan = state.to_write_back_plan(&corrupt_snapshot.keys);
        assert_eq!(
            plan.set.get(LOCAL_WORKSPACE_KEY).map(String::as_str),
            Some("{broken")
        );
        assert_eq!(plan.set.get(THEME_KEY).map(String::as_str), Some("dark"));
        assert!(plan.remove.is_empty());

        // Valid empty array "[]" mounts zero workspaces and writes back "[]".
        let valid_empty = LegacyLocalStorageSnapshot {
            origin: LEGACY_CAPACITOR_ORIGIN.into(),
            length: 1,
            keys: vec![LOCAL_WORKSPACE_KEY.into()],
            entries: BTreeMap::from([(LOCAL_WORKSPACE_KEY.into(), "[]".into())]),
            idb_access_count: 0,
        };
        let LegacyUpgradeDisposition::ExistingUser { state: empty_state } =
            parse_legacy_snapshot(&valid_empty).unwrap()
        else {
            panic!("expected existing user for valid empty affine-local-workspace");
        };
        assert!(empty_state.local_workspace_ids.is_empty());
        assert!(empty_state.raw_unparsed_entries.is_empty());
        let empty_plan = empty_state.to_write_back_plan(&valid_empty.keys);
        assert_eq!(
            empty_plan.set.get(LOCAL_WORKSPACE_KEY).map(String::as_str),
            Some("[]")
        );
    }
}
