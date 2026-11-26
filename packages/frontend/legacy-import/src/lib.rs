//! Pure-Rust Capacitor WebView `localStorage` import, positive sentinel validation,
//! and rollback-window writeback serializer.
//!
//! Zero legacy WebView IndexedDB dependencies and zero `*.db` directory scanning.

#![forbid(unsafe_code)]

pub mod sentinel;
pub mod writeback;

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub use sentinel::{
    SentinelEvaluation, SentinelFailureReason, WebViewStorageSentinel, evaluate_sentinel,
};
pub use writeback::{
    LocalStorageMutation, WritebackReadbackReport, build_writeback_changeset,
    verify_writeback_readback,
};

/// Exact `localStorage` key for the ordered local workspace allowlist.
pub const KEY_LOCAL_WORKSPACE_LIST: &str = "affine-local-workspace";
/// Prefix used by `LocalStorageGlobalState` in `0.27.5` (`packages/frontend/core/src/modules/storage/impls/storage.ts`).
pub const PREFIX_GLOBAL_STATE: &str = "global-state:";
/// Exact `localStorage` key for the self-hosted server list (`global-state:serverList`).
pub const KEY_SERVER_LIST: &str = "global-state:serverList";
/// Prefix for per-server cached configuration (`global-state:serverConfig:<id>`).
pub const PREFIX_SERVER_CONFIG: &str = "global-state:serverConfig:";
/// Suffix for per-server cached auth session (`global-state:<serverId>-auth`).
pub const SUFFIX_SERVER_AUTH: &str = "-auth";
/// Prefix for bare feature flags (`affine-flag:*`).
pub const PREFIX_FEATURE_FLAG: &str = "affine-flag:";
/// Prefix for `LocalStorageGlobalState`-prefixed feature flags (`global-state:affine-flag:*`).
pub const PREFIX_GLOBAL_STATE_FEATURE_FLAG: &str = "global-state:affine-flag:";
/// Prefix for official cloud workspace list cache (`global-state:cloud-workspace:<accountId>`).
pub const PREFIX_CLOUD_WORKSPACE_CACHE: &str = "global-state:cloud-workspace:";
/// Prefix for self-hosted workspace list cache (`global-state:selfhosted-workspace-<serverId>:<accountId>`).
pub const PREFIX_SELFHOSTED_WORKSPACE_CACHE: &str = "global-state:selfhosted-workspace-";
/// Exact `localStorage` key for persisted i18n language (`global-cache:i18n_lng`).
pub const KEY_I18N_LNG: &str = "global-cache:i18n_lng";
/// Exact `localStorage` key for last opened workspace ID.
pub const KEY_LAST_WORKSPACE_ID: &str = "last_workspace_id";
/// Exact `localStorage` key for last opened workspace flavour.
pub const KEY_LAST_WORKSPACE_FLAVOUR: &str = "last_workspace_flavour";
/// Exact `localStorage` key for serialized user settings.
pub const KEY_AFFINE_SETTINGS: &str = "affine-settings";
/// Exact `localStorage` key for active theme mode (`light` / `dark` / `system`).
pub const KEY_THEME: &str = "theme";

/// Error returned while parsing or verifying legacy WebView `localStorage` state.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum LegacyImportError {
    #[error("sentinel validation failed: {0:?}")]
    SentinelFailed(SentinelFailureReason),

    #[error("malformed JSON for key `{key}`: {message}")]
    MalformedJson { key: String, message: String },

    #[error("key `{0}` is outside the legacy localStorage allowlist")]
    DisallowedKey(String),
}

/// Server metadata entry stored in `global-state:serverList`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyServerMetadata {
    pub id: String,
    pub base_url: String,
}

/// Parsed snapshot of all allowlisted Capacitor WebView `localStorage` keys.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct LegacyLocalStorageSnapshot {
    /// Ordered, deduplicated local workspace IDs from `affine-local-workspace` (verbatim, never trimmed).
    pub local_workspace_ids: Vec<String>,
    /// `true` when `affine-local-workspace` existed in `localStorage` (including `"[]"`).
    #[serde(default)]
    pub has_local_workspace_key: bool,
    /// Self-hosted server entries from `global-state:serverList`.
    pub server_list: Vec<LegacyServerMetadata>,
    /// `true` when `global-state:serverList` existed in `localStorage` (including `"[]"`).
    #[serde(default)]
    pub has_server_list_key: bool,
    /// Per-server config blobs from `global-state:serverConfig:<id>`.
    pub server_configs: BTreeMap<String, Value>,
    /// Per-server cached auth session JSON from canonical `global-state:<serverId>-auth`.
    pub server_auth_sessions: BTreeMap<String, Value>,
    /// Cloud and self-hosted workspace offline list caches (`global-state:cloud-workspace:*`
    /// and `global-state:selfhosted-workspace-*`) preserved verbatim for offline cold start.
    #[serde(default)]
    pub cloud_workspace_caches: BTreeMap<String, String>,
    /// Feature flags from `affine-flag:<name>` or `global-state:affine-flag:<name>`.
    pub feature_flags: BTreeMap<String, Value>,
    /// Flag names originally stored under `global-state:affine-flag:<name>` for 1:1 writeback.
    #[serde(default)]
    pub global_state_flag_names: BTreeSet<String>,
    /// Active locale code from `global-cache:i18n_lng`.
    pub i18n_lng: Option<String>,
    /// Last opened workspace ID from `last_workspace_id`.
    pub last_workspace_id: Option<String>,
    /// Last opened workspace flavour from `last_workspace_flavour`.
    pub last_workspace_flavour: Option<String>,
    /// Raw settings JSON object from `affine-settings`.
    pub affine_settings: Option<Value>,
    /// Theme preference from `theme`.
    pub theme: Option<String>,
    /// Auxiliary keys whose JSON failed to parse (or legacy bare `<id>-auth` keys collected by
    /// mobile probes), preserved verbatim on writeback so no data is silently deleted.
    #[serde(default)]
    pub preserved_raw_entries: BTreeMap<String, String>,
}

impl LegacyLocalStorageSnapshot {
    /// Explicitly replace `server_list` and retire any corrupt raw preserved entry for
    /// `global-state:serverList`, marking the key present so empty lists serialize as `"[]"`.
    pub fn set_server_list(&mut self, servers: Vec<LegacyServerMetadata>) {
        self.preserved_raw_entries.remove(KEY_SERVER_LIST);
        self.server_list = servers;
        self.has_server_list_key = true;
    }
}

/// Parse a canonical `global-state:<serverId>-auth` key, returning `<serverId>`.
pub(crate) fn parse_canonical_server_auth_key(key: &str) -> Option<&str> {
    let rest = key.strip_prefix(PREFIX_GLOBAL_STATE)?;
    let server_id = rest.strip_suffix(SUFFIX_SERVER_AUTH)?;
    if !server_id.is_empty() && !server_id.contains(':') {
        Some(server_id)
    } else {
        None
    }
}

/// Return `true` for a bare `<id>-auth` key (without `:` or `global-state:` prefix) that mobile
/// probes may collect; accepted in `entries` as `preserved_raw_entries` without blocking fresh install.
pub(crate) fn is_legacy_bare_auth_key(key: &str) -> bool {
    key.strip_suffix(SUFFIX_SERVER_AUTH)
        .is_some_and(|id| !id.is_empty() && !id.contains(':'))
}

/// Parse a feature flag key, returning `(flag_name, is_global_state_prefixed)`.
pub(crate) fn parse_feature_flag_key(key: &str) -> Option<(&str, bool)> {
    if let Some(flag_name) = key.strip_prefix(PREFIX_GLOBAL_STATE_FEATURE_FLAG)
        && !flag_name.is_empty()
    {
        return Some((flag_name, true));
    }
    if let Some(flag_name) = key.strip_prefix(PREFIX_FEATURE_FLAG)
        && !flag_name.is_empty()
    {
        return Some((flag_name, false));
    }
    None
}

/// Return `true` for optional offline cloud/self-hosted workspace list cache keys.
pub fn is_cloud_workspace_cache_key(key: &str) -> bool {
    if let Some(account_id) = key.strip_prefix(PREFIX_CLOUD_WORKSPACE_CACHE) {
        return !account_id.is_empty();
    }
    if let Some(rest) = key.strip_prefix(PREFIX_SELFHOSTED_WORKSPACE_CACHE)
        && let Some((server_id, account_id)) = rest.split_once(':')
    {
        return !server_id.is_empty() && !account_id.is_empty();
    }
    false
}

/// Return `true` for the core allowlisted keys enforced by cross-slice sentinel reverse completeness.
pub fn is_core_sentinel_required_key(key: &str) -> bool {
    if matches!(
        key,
        KEY_LOCAL_WORKSPACE_LIST
            | KEY_SERVER_LIST
            | KEY_I18N_LNG
            | KEY_LAST_WORKSPACE_ID
            | KEY_LAST_WORKSPACE_FLAVOUR
            | KEY_AFFINE_SETTINGS
            | KEY_THEME
    ) {
        return true;
    }
    if let Some(rest) = key.strip_prefix(PREFIX_SERVER_CONFIG) {
        return !rest.is_empty();
    }
    parse_feature_flag_key(key).is_some() || parse_canonical_server_auth_key(key).is_some()
}

/// Return `true` if `key` belongs to the official AFFiNE `localStorage` allowlist
/// (core required keys + optional cloud/self-hosted workspace list cache keys).
pub fn is_allowlisted_key(key: &str) -> bool {
    is_core_sentinel_required_key(key) || is_cloud_workspace_cache_key(key)
}

/// Return `true` if `key` is permitted inside `WebViewStorageSentinel::entries` (official allowlist
/// plus bare `<id>-auth` keys that mobile probes may forward).
pub fn is_permitted_sentinel_entry_key(key: &str) -> bool {
    is_allowlisted_key(key) || is_legacy_bare_auth_key(key)
}

fn parse_local_workspace_ids_checked(raw_json: &str) -> Option<Vec<String>> {
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(raw_json) else {
        return None;
    };
    let ids: Vec<String> = items
        .into_iter()
        .filter_map(|v| match v {
            Value::String(id) if !id.is_empty() => Some(id),
            _ => None,
        })
        .collect();
    Some(dedupe_preserve_order(ids))
}

/// Parse `affine-local-workspace` JSON into an ordered, deduplicated list of workspace IDs
/// (returning an empty `Vec` on non-array or invalid JSON).
pub fn parse_local_workspace_ids(raw_json: &str) -> Vec<String> {
    parse_local_workspace_ids_checked(raw_json).unwrap_or_default()
}

/// Parse allowlisted entries from a validated positive sentinel.
///
/// Refuses to import and returns `Err(LegacyImportError::SentinelFailed(_))` if the sentinel
/// indicates an origin mismatch, missing required allowlisted entry, or unready WebView,
/// preventing accidental workspace reset or deleted-workspace resurrection (`F1`).
pub fn import_from_sentinel(
    sentinel: &WebViewStorageSentinel,
    allowed_origins: &[&str],
) -> Result<(SentinelEvaluation, LegacyLocalStorageSnapshot), LegacyImportError> {
    let evaluation = evaluate_sentinel(sentinel, allowed_origins);
    match &evaluation {
        SentinelEvaluation::UnreadyOrMismatch(reason) => {
            Err(LegacyImportError::SentinelFailed(reason.clone()))
        }
        SentinelEvaluation::ValidEmpty => Ok((evaluation, LegacyLocalStorageSnapshot::default())),
        SentinelEvaluation::ValidPopulated { .. } => {
            let snapshot = parse_allowlisted_entries(&sentinel.entries);
            Ok((evaluation, snapshot))
        }
    }
}

/// Parse allowlisted keys from a raw `localStorage` map with per-key fault tolerance.
///
/// Valid `affine-local-workspace` JSON arrays have non-string and empty elements filtered out
/// without trimming original IDs (matching `workspace-id-utils.ts`). Malformed or non-array
/// `affine-local-workspace` values and malformed auxiliary JSON keys are preserved verbatim in
/// `preserved_raw_entries` with `has_local_workspace_key = true` so upgrade classifies the user as
/// `ExistingUser`, blocks default workspace creation, and preserves the raw value on rollback.
pub fn parse_allowlisted_entries(entries: &BTreeMap<String, String>) -> LegacyLocalStorageSnapshot {
    let mut snapshot = LegacyLocalStorageSnapshot::default();

    if let Some(raw) = entries.get(KEY_LOCAL_WORKSPACE_LIST) {
        snapshot.has_local_workspace_key = true;
        if let Some(ids) = parse_local_workspace_ids_checked(raw) {
            snapshot.local_workspace_ids = ids;
        } else {
            snapshot
                .preserved_raw_entries
                .insert(KEY_LOCAL_WORKSPACE_LIST.to_string(), raw.clone());
        }
    }

    if let Some(raw) = entries.get(KEY_SERVER_LIST) {
        match serde_json::from_str::<Vec<LegacyServerMetadata>>(raw) {
            Ok(parsed) => {
                snapshot.server_list = parsed;
                snapshot.has_server_list_key = true;
            }
            Err(_) => {
                snapshot
                    .preserved_raw_entries
                    .insert(KEY_SERVER_LIST.to_string(), raw.clone());
            }
        }
    }

    if let Some(raw) = entries.get(KEY_I18N_LNG) {
        snapshot.i18n_lng = decode_optional_json_string(raw);
    }

    if let Some(raw) = entries.get(KEY_LAST_WORKSPACE_ID) {
        snapshot.last_workspace_id = non_empty_trimmed(raw);
    }

    if let Some(raw) = entries.get(KEY_LAST_WORKSPACE_FLAVOUR) {
        snapshot.last_workspace_flavour = non_empty_trimmed(raw);
    }

    if let Some(raw) = entries.get(KEY_AFFINE_SETTINGS) {
        match serde_json::from_str::<Value>(raw) {
            Ok(parsed) => snapshot.affine_settings = Some(parsed),
            Err(_) => {
                snapshot
                    .preserved_raw_entries
                    .insert(KEY_AFFINE_SETTINGS.to_string(), raw.clone());
            }
        }
    }

    if let Some(raw) = entries.get(KEY_THEME) {
        snapshot.theme = decode_optional_json_string(raw);
    }

    for (key, raw) in entries {
        if let Some(server_id) = key.strip_prefix(PREFIX_SERVER_CONFIG)
            && !server_id.is_empty()
        {
            match serde_json::from_str::<Value>(raw) {
                Ok(parsed) => {
                    snapshot
                        .server_configs
                        .insert(server_id.to_string(), parsed);
                }
                Err(_) => {
                    snapshot
                        .preserved_raw_entries
                        .insert(key.clone(), raw.clone());
                }
            }
        } else if is_cloud_workspace_cache_key(key) {
            snapshot
                .cloud_workspace_caches
                .insert(key.clone(), raw.clone());
        } else if let Some((flag_name, is_global_state)) = parse_feature_flag_key(key) {
            let parsed =
                serde_json::from_str::<Value>(raw).unwrap_or_else(|_| Value::String(raw.clone()));
            snapshot.feature_flags.insert(flag_name.to_string(), parsed);
            if is_global_state {
                snapshot
                    .global_state_flag_names
                    .insert(flag_name.to_string());
            } else {
                snapshot.global_state_flag_names.remove(flag_name);
            }
        } else if let Some(server_id) = parse_canonical_server_auth_key(key) {
            match serde_json::from_str::<Value>(raw) {
                Ok(parsed) => {
                    snapshot
                        .server_auth_sessions
                        .insert(server_id.to_string(), parsed);
                }
                Err(_) => {
                    snapshot
                        .preserved_raw_entries
                        .insert(key.clone(), raw.clone());
                }
            }
        } else if is_legacy_bare_auth_key(key) {
            snapshot
                .preserved_raw_entries
                .insert(key.clone(), raw.clone());
        }
    }

    snapshot
}

/// Deduplicate workspace IDs preserving order and exact original strings (zero `.trim()`).
pub(crate) fn dedupe_preserve_order(ids: Vec<String>) -> Vec<String> {
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if !id.is_empty() && !out.iter().any(|existing: &String| existing == &id) {
            out.push(id);
        }
    }
    out
}

fn decode_optional_json_string(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return None;
    }
    if let Ok(Value::String(s)) = serde_json::from_str::<Value>(trimmed) {
        return non_empty_trimmed(&s);
    }
    non_empty_trimmed(trimmed)
}

fn non_empty_trimmed(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn allowlist_fault_tolerant_parse_cloud_cache_and_writeback_roundtrip() {
        assert!(is_allowlisted_key("affine-local-workspace"));
        assert!(is_allowlisted_key("global-state:serverList"));
        assert!(is_allowlisted_key("global-state:serverConfig:self-1"));
        assert!(is_allowlisted_key("global-state:affine-cloud-auth"));
        assert!(is_allowlisted_key("global-state:cloud-workspace:acct-1"));
        assert!(is_allowlisted_key(
            "global-state:selfhosted-workspace-self-1:acct-2"
        ));
        assert!(is_allowlisted_key("affine-flag:enable_ai"));
        assert!(is_allowlisted_key("global-state:affine-flag:enable_ai"));
        // Bare `<id>-auth` is NOT an official allowlisted key (does not block fresh install).
        assert!(!is_allowlisted_key("foo-auth"));
        assert!(!is_allowlisted_key("random-third-party-key"));
        assert!(!is_allowlisted_key("global-state:bad:nested-auth"));

        // Mixed valid workspace IDs with null/number/duplicate + corrupt auxiliary settings +
        // cloud workspace cache + bare probe auth key.
        let entries = BTreeMap::from([
            (
                "affine-local-workspace".into(),
                r#"[" ws-raw ", null, 123, "", "ws-b", " ws-raw "]"#.into(),
            ),
            ("affine-settings".into(), "{corrupt-json".into()),
            (
                "global-state:affine-cloud-auth".into(),
                r#"{"account":{"id":"u1"}}"#.into(),
            ),
            (
                "global-state:cloud-workspace:acct-1".into(),
                r#"[{"id":"cloud-ws-1"}]"#.into(),
            ),
            ("foo-auth".into(), "not-even-json".into()),
            ("theme".into(), "dark".into()),
        ]);
        let keys: Vec<String> = entries
            .keys()
            .cloned()
            .chain(std::iter::once("__cap_noise__".into()))
            .collect();
        let sentinel = WebViewStorageSentinel {
            origin: "capacitor://localhost".into(),
            length: keys.len(),
            keys,
            entries: entries.clone(),
        };

        let (eval, snap) = import_from_sentinel(&sentinel, &["capacitor://localhost"]).unwrap();
        assert_eq!(
            eval,
            SentinelEvaluation::ValidPopulated {
                has_allowlisted_keys: true
            }
        );
        // Workspace IDs preserve exact strings without trimming and filter non-string/empty items.
        assert_eq!(snap.local_workspace_ids, vec![" ws-raw ", "ws-b"]);
        assert_eq!(
            snap.cloud_workspace_caches
                .get("global-state:cloud-workspace:acct-1")
                .map(String::as_str),
            Some(r#"[{"id":"cloud-ws-1"}]"#)
        );
        assert_eq!(
            snap.preserved_raw_entries
                .get("affine-settings")
                .map(String::as_str),
            Some("{corrupt-json")
        );
        assert_eq!(
            snap.preserved_raw_entries
                .get("foo-auth")
                .map(String::as_str),
            Some("not-even-json")
        );
        assert_eq!(
            snap.server_auth_sessions["affine-cloud"]["account"]["id"],
            json!("u1")
        );

        // Mutating theme preserves corrupt auxiliary keys and cloud caches verbatim on writeback.
        let mut next = snap.clone();
        next.theme = Some("light".into());
        next.local_workspace_ids.clear();
        let changes = build_writeback_changeset(&snap, &next).unwrap();
        assert!(changes.contains(&LocalStorageMutation::Set {
            key: KEY_LOCAL_WORKSPACE_LIST.into(),
            value: "[]".into(),
        }));
        assert!(!changes.iter().any(|m| m.key() == "affine-settings"));
        assert!(!changes.iter().any(|m| m.key() == "foo-auth"));
        assert!(
            !changes
                .iter()
                .any(|m| m.key() == "global-state:cloud-workspace:acct-1")
        );

        // Malformed or non-array `affine-local-workspace` ("{broken", "{}", "\"abc\"") is preserved
        // verbatim in `preserved_raw_entries` with `has_local_workspace_key = true` and empty
        // `local_workspace_ids`, stays verbatim when mutating other settings, and is replaced only
        // after retiring the preserved raw entry and updating `local_workspace_ids`.
        for raw_corrupt in ["{broken", "{}", "\"abc\""] {
            let entries = BTreeMap::from([
                (KEY_LOCAL_WORKSPACE_LIST.into(), raw_corrupt.into()),
                (KEY_THEME.into(), "dark".into()),
            ]);
            let sentinel = WebViewStorageSentinel {
                origin: "capacitor://localhost".into(),
                length: 2,
                keys: vec![KEY_LOCAL_WORKSPACE_LIST.into(), KEY_THEME.into()],
                entries: entries.clone(),
            };
            let (eval, parsed) =
                import_from_sentinel(&sentinel, &["capacitor://localhost"]).unwrap();
            assert_eq!(
                eval,
                SentinelEvaluation::ValidPopulated {
                    has_allowlisted_keys: true
                }
            );
            assert!(parsed.local_workspace_ids.is_empty());
            assert!(parsed.has_local_workspace_key);
            assert_eq!(
                parsed
                    .preserved_raw_entries
                    .get(KEY_LOCAL_WORKSPACE_LIST)
                    .map(String::as_str),
                Some(raw_corrupt)
            );
            // Mutating another setting writes back corrupt affine-local-workspace verbatim.
            let mut edited_other = parsed.clone();
            edited_other.i18n_lng = Some("zh-Hans".into());
            let serialized = writeback::serialize_snapshot_entries(&edited_other).unwrap();
            assert_eq!(
                serialized.get(KEY_LOCAL_WORKSPACE_LIST).map(String::as_str),
                Some(raw_corrupt)
            );
            assert_eq!(
                serialized.get(KEY_I18N_LNG).map(String::as_str),
                Some("\"zh-Hans\"")
            );
            // Retiring the preserved raw string and updating local_workspace_ids emits new JSON array.
            let mut replaced = parsed.clone();
            replaced
                .preserved_raw_entries
                .remove(KEY_LOCAL_WORKSPACE_LIST);
            replaced.local_workspace_ids = vec!["ws-new".into()];
            replaced.has_local_workspace_key = true;
            let serialized_replaced = writeback::serialize_snapshot_entries(&replaced).unwrap();
            assert_eq!(
                serialized_replaced
                    .get(KEY_LOCAL_WORKSPACE_LIST)
                    .map(String::as_str),
                Some(r#"["ws-new"]"#)
            );
        }

        // Corrupt `global-state:serverList` stays untouched (0 mutations) when unedited,
        // and writes `"[]"` only after explicit `set_server_list(vec![])`.
        let corrupt_srv = BTreeMap::from([
            ("affine-local-workspace".into(), r#"["ws-1"]"#.into()),
            ("global-state:serverList".into(), "{broken".into()),
        ]);
        let parsed_srv = parse_allowlisted_entries(&corrupt_srv);
        assert!(
            build_writeback_changeset(&parsed_srv, &parsed_srv)
                .unwrap()
                .is_empty()
        );
        let mut cleared_srv = parsed_srv.clone();
        cleared_srv.set_server_list(Vec::new());
        assert_eq!(
            build_writeback_changeset(&parsed_srv, &cleared_srv).unwrap(),
            vec![LocalStorageMutation::Set {
                key: KEY_SERVER_LIST.into(),
                value: "[]".into(),
            }]
        );
    }
}
