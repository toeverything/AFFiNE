//! Rollback-window `localStorage` writeback serializer and readback verifier.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{
    KEY_AFFINE_SETTINGS, KEY_I18N_LNG, KEY_LAST_WORKSPACE_FLAVOUR, KEY_LAST_WORKSPACE_ID,
    KEY_LOCAL_WORKSPACE_LIST, KEY_SERVER_LIST, KEY_THEME, LegacyImportError,
    LegacyLocalStorageSnapshot, PREFIX_FEATURE_FLAG, PREFIX_GLOBAL_STATE,
    PREFIX_GLOBAL_STATE_FEATURE_FLAG, PREFIX_SERVER_CONFIG, SUFFIX_SERVER_AUTH,
    dedupe_preserve_order, is_allowlisted_key, is_cloud_workspace_cache_key,
    is_permitted_sentinel_entry_key,
};

/// Atomic `localStorage` mutation to apply during the rollback window.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum LocalStorageMutation {
    Set { key: String, value: String },
    Remove { key: String },
}

impl LocalStorageMutation {
    pub fn key(&self) -> &str {
        match self {
            Self::Set { key, .. } | Self::Remove { key } => key,
        }
    }
}

/// Verification report comparing expected writeback mutations against a readback map.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct WritebackReadbackReport {
    pub verified_keys: Vec<String>,
    pub mismatched_keys: Vec<String>,
}

impl WritebackReadbackReport {
    pub fn is_ok(&self) -> bool {
        self.mismatched_keys.is_empty()
    }
}

/// Serialize a [`LegacyLocalStorageSnapshot`] into canonical allowlisted `localStorage` key/value pairs.
pub fn serialize_snapshot_entries(
    snapshot: &LegacyLocalStorageSnapshot,
) -> Result<BTreeMap<String, String>, LegacyImportError> {
    let mut out = BTreeMap::new();

    // Preserve unparsed/opaque entries first so structured fields can supersede them if fixed.
    for (key, raw) in &snapshot.preserved_raw_entries {
        if !is_permitted_sentinel_entry_key(key) {
            return Err(LegacyImportError::DisallowedKey(key.clone()));
        }
        out.insert(key.clone(), raw.clone());
    }

    if !snapshot
        .preserved_raw_entries
        .contains_key(KEY_LOCAL_WORKSPACE_LIST)
        && (!snapshot.local_workspace_ids.is_empty() || snapshot.has_local_workspace_key)
    {
        let deduped = dedupe_preserve_order(snapshot.local_workspace_ids.clone());
        out.insert(
            KEY_LOCAL_WORKSPACE_LIST.to_string(),
            serde_json::to_string(&deduped).map_err(|err| LegacyImportError::MalformedJson {
                key: KEY_LOCAL_WORKSPACE_LIST.to_string(),
                message: err.to_string(),
            })?,
        );
    }

    if !snapshot.preserved_raw_entries.contains_key(KEY_SERVER_LIST)
        && (!snapshot.server_list.is_empty() || snapshot.has_server_list_key)
    {
        out.insert(
            KEY_SERVER_LIST.to_string(),
            serde_json::to_string(&snapshot.server_list).map_err(|err| {
                LegacyImportError::MalformedJson {
                    key: KEY_SERVER_LIST.to_string(),
                    message: err.to_string(),
                }
            })?,
        );
    }

    for (server_id, config) in &snapshot.server_configs {
        let key = format!("{PREFIX_SERVER_CONFIG}{server_id}");
        if !is_allowlisted_key(&key) {
            return Err(LegacyImportError::DisallowedKey(key));
        }
        out.insert(
            key.clone(),
            serde_json::to_string(config).map_err(|err| LegacyImportError::MalformedJson {
                key,
                message: err.to_string(),
            })?,
        );
    }

    for (server_id, auth) in &snapshot.server_auth_sessions {
        let key = format!("{PREFIX_GLOBAL_STATE}{server_id}{SUFFIX_SERVER_AUTH}");
        if !is_allowlisted_key(&key) {
            return Err(LegacyImportError::DisallowedKey(key));
        }
        out.insert(
            key.clone(),
            serde_json::to_string(auth).map_err(|err| LegacyImportError::MalformedJson {
                key,
                message: err.to_string(),
            })?,
        );
    }

    for (key, raw) in &snapshot.cloud_workspace_caches {
        if !is_cloud_workspace_cache_key(key) {
            return Err(LegacyImportError::DisallowedKey(key.clone()));
        }
        out.insert(key.clone(), raw.clone());
    }

    for (flag, val) in &snapshot.feature_flags {
        let key = if snapshot.global_state_flag_names.contains(flag) {
            format!("{PREFIX_GLOBAL_STATE_FEATURE_FLAG}{flag}")
        } else {
            format!("{PREFIX_FEATURE_FLAG}{flag}")
        };
        if !is_allowlisted_key(&key) {
            return Err(LegacyImportError::DisallowedKey(key));
        }
        out.insert(
            key.clone(),
            serde_json::to_string(val).map_err(|err| LegacyImportError::MalformedJson {
                key,
                message: err.to_string(),
            })?,
        );
    }

    if let Some(ref lng) = snapshot.i18n_lng {
        out.insert(
            KEY_I18N_LNG.to_string(),
            serde_json::to_string(lng).map_err(|err| LegacyImportError::MalformedJson {
                key: KEY_I18N_LNG.to_string(),
                message: err.to_string(),
            })?,
        );
    }

    if let Some(ref id) = snapshot.last_workspace_id {
        out.insert(KEY_LAST_WORKSPACE_ID.to_string(), id.clone());
    }

    if let Some(ref flavour) = snapshot.last_workspace_flavour {
        out.insert(KEY_LAST_WORKSPACE_FLAVOUR.to_string(), flavour.clone());
    }

    if let Some(ref settings) = snapshot.affine_settings {
        out.insert(
            KEY_AFFINE_SETTINGS.to_string(),
            serde_json::to_string(settings).map_err(|err| LegacyImportError::MalformedJson {
                key: KEY_AFFINE_SETTINGS.to_string(),
                message: err.to_string(),
            })?,
        );
    }

    if let Some(ref theme) = snapshot.theme {
        out.insert(KEY_THEME.to_string(), theme.clone());
    }

    Ok(out)
}

/// Compute the minimal deterministic `localStorage` changeset between `before` and `after`.
///
/// Mirrors `0.27.5` `setLocalWorkspaceIds([])` and `ServerListStore.removeServer`: clearing all
/// local workspaces or self-hosted servers writes `"[]"` rather than removing the key.
pub fn build_writeback_changeset(
    before: &LegacyLocalStorageSnapshot,
    after: &LegacyLocalStorageSnapshot,
) -> Result<Vec<LocalStorageMutation>, LegacyImportError> {
    let prev = serialize_snapshot_entries(before)?;
    let mut effective_after = after.clone();
    if prev.contains_key(KEY_LOCAL_WORKSPACE_LIST)
        && !effective_after
            .preserved_raw_entries
            .contains_key(KEY_LOCAL_WORKSPACE_LIST)
    {
        effective_after.has_local_workspace_key = true;
    }
    if prev.contains_key(KEY_SERVER_LIST)
        && !effective_after
            .preserved_raw_entries
            .contains_key(KEY_SERVER_LIST)
    {
        effective_after.has_server_list_key = true;
    }
    let next = serialize_snapshot_entries(&effective_after)?;

    let mut all_keys = BTreeSet::new();
    all_keys.extend(prev.keys().cloned());
    all_keys.extend(next.keys().cloned());

    let mut mutations = Vec::new();
    for key in all_keys {
        match (prev.get(&key), next.get(&key)) {
            (Some(old_val), Some(new_val)) if old_val == new_val => {}
            (_, Some(new_val)) => mutations.push(LocalStorageMutation::Set {
                key,
                value: new_val.clone(),
            }),
            (Some(_), None) => mutations.push(LocalStorageMutation::Remove { key }),
            (None, None) => {}
        }
    }
    Ok(mutations)
}

/// Verify that every mutation in `expected` matches the observed `readback` entries.
pub fn verify_writeback_readback(
    expected: &[LocalStorageMutation],
    readback: &BTreeMap<String, String>,
) -> WritebackReadbackReport {
    let mut report = WritebackReadbackReport::default();
    for mutation in expected {
        match mutation {
            LocalStorageMutation::Set { key, value } => {
                if readback.get(key) == Some(value) {
                    report.verified_keys.push(key.clone());
                } else {
                    report.mismatched_keys.push(key.clone());
                }
            }
            LocalStorageMutation::Remove { key } => {
                if !readback.contains_key(key) {
                    report.verified_keys.push(key.clone());
                } else {
                    report.mismatched_keys.push(key.clone());
                }
            }
        }
    }
    report
}
