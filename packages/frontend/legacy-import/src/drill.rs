//! Deterministic `0.27.5` same-signature upgrade and exception-rollback writeback drill.
//!
//! Exercises realistic `0.27.5` Capacitor WebView persisted state for both iOS
//! (`capacitor://localhost`) and Android (`https://localhost`):
//! - Normal upgrade: positive sentinel -> allowlist-only workspace discovery (zero disk scan) ->
//!   mutation -> lossless rollback writeback + readback verification.
//! - Unready WebView / wrong origin: fail-closed (no default workspace created, no data wiped).
//! - Corrupt allowlist + noise keys: preserved verbatim on upgrade and rollback writeback.
//! - Downgrade re-import: written-back `localStorage` map re-parses cleanly in `0.27.5`.

use std::collections::BTreeMap;

use serde_json::json;

use super::{
    KEY_AFFINE_SETTINGS, KEY_I18N_LNG, KEY_LAST_WORKSPACE_FLAVOUR, KEY_LAST_WORKSPACE_ID,
    KEY_LOCAL_WORKSPACE_LIST, KEY_SERVER_LIST, KEY_THEME, LegacyImportError,
    LegacyLocalStorageSnapshot, LegacyServerMetadata, LocalStorageMutation, WebViewStorageSentinel,
    build_writeback_changeset, import_from_sentinel, verify_writeback_readback,
};

/// Result of one simulated `0.27.5` same-signature upgrade -> mutation -> rollback drill.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeRollbackDrillReport {
    pub imported_local_ids: Vec<String>,
    pub mutations: Vec<LocalStorageMutation>,
    pub readback_verified: bool,
    pub rolled_back_storage: BTreeMap<String, String>,
    pub downgraded_snapshot: LegacyLocalStorageSnapshot,
}

/// Applies `mutations` onto a simulated WebView `localStorage` map in place.
pub fn apply_mutations_to_storage(
    storage: &mut BTreeMap<String, String>,
    mutations: &[LocalStorageMutation],
) {
    for mutation in mutations {
        match mutation {
            LocalStorageMutation::Set { key, value } => {
                storage.insert(key.clone(), value.clone());
            }
            LocalStorageMutation::Remove { key } => {
                storage.remove(key);
            }
        }
    }
}

/// Runs a full deterministic `0.27.5` upgrade + mutation + rollback writeback + downgrade
/// re-parse drill against a simulated WebView `localStorage` map.
pub fn run_upgrade_rollback_drill<F>(
    origin: &str,
    allowed_origins: &[&str],
    initial_storage: &BTreeMap<String, String>,
    mutate_native: F,
) -> Result<UpgradeRollbackDrillReport, LegacyImportError>
where
    F: FnOnce(&mut LegacyLocalStorageSnapshot),
{
    let keys: Vec<String> = initial_storage.keys().cloned().collect();
    let entries: BTreeMap<String, String> = initial_storage
        .iter()
        .filter(|(k, _)| super::is_permitted_sentinel_entry_key(k))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let sentinel = WebViewStorageSentinel {
        origin: origin.to_string(),
        length: initial_storage.len(),
        keys,
        entries,
    };
    let (_eval, before_snapshot) = import_from_sentinel(&sentinel, allowed_origins)?;
    let imported_local_ids = before_snapshot.local_workspace_ids.clone();

    let mut after_snapshot = before_snapshot.clone();
    mutate_native(&mut after_snapshot);

    let mutations = build_writeback_changeset(&before_snapshot, &after_snapshot)?;
    let mut rolled_back_storage = initial_storage.clone();
    apply_mutations_to_storage(&mut rolled_back_storage, &mutations);

    let readback = verify_writeback_readback(&mutations, &rolled_back_storage);
    let post_keys: Vec<String> = rolled_back_storage.keys().cloned().collect();
    let post_entries: BTreeMap<String, String> = rolled_back_storage
        .iter()
        .filter(|(k, _)| super::is_permitted_sentinel_entry_key(k))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let post_sentinel = WebViewStorageSentinel {
        origin: origin.to_string(),
        length: rolled_back_storage.len(),
        keys: post_keys,
        entries: post_entries,
    };
    let (_post_eval, downgraded_snapshot) = import_from_sentinel(&post_sentinel, allowed_origins)?;

    Ok(UpgradeRollbackDrillReport {
        imported_local_ids,
        mutations,
        readback_verified: readback.is_ok(),
        rolled_back_storage,
        downgraded_snapshot,
    })
}

/// Builds a realistic `0.27.5` WebView `localStorage` fixture with local workspaces,
/// self-hosted server list/config/auth, cloud cache, feature flags, settings, and noise keys.
pub fn sample_0275_storage_fixture() -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    map.insert(
        KEY_LOCAL_WORKSPACE_LIST.to_string(),
        r#"["ws-local-01","ws-local-02"]"#.to_string(),
    );
    map.insert(
        KEY_SERVER_LIST.to_string(),
        serde_json::to_string(&vec![LegacyServerMetadata {
            id: "selfhost-1".to_string(),
            base_url: "https://affine.corp.example".to_string(),
        }])
        .unwrap(),
    );
    map.insert(
        "global-state:serverConfig:selfhost-1".to_string(),
        json!({"serverName": "Corp AFFiNE", "features": ["copilot"]}).to_string(),
    );
    map.insert(
        "global-state:selfhost-1-auth".to_string(),
        json!({"userId": "u-42", "email": "dev@corp.example"}).to_string(),
    );
    map.insert(
        "global-state:cloud-workspace:u-42".to_string(),
        r#"[{"id":"cloud-ws-1"}]"#.to_string(),
    );
    map.insert("affine-flag:enable_ai".to_string(), "true".to_string());
    map.insert(
        "global-state:affine-flag:mobile_v2".to_string(),
        "true".to_string(),
    );
    map.insert(KEY_I18N_LNG.to_string(), "en".to_string());
    map.insert(KEY_LAST_WORKSPACE_ID.to_string(), "ws-local-01".to_string());
    map.insert(KEY_LAST_WORKSPACE_FLAVOUR.to_string(), "local".to_string());
    map.insert(
        KEY_AFFINE_SETTINGS.to_string(),
        json!({"fontStyle": "Sans"}).to_string(),
    );
    map.insert(KEY_THEME.to_string(), "dark".to_string());
    // Unrelated Capacitor/third-party noise key that must remain untouched across rollback.
    map.insert("capacitor_device_hint".to_string(), "keep-me".to_string());
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SentinelFailureReason;

    #[test]
    fn ios_and_android_0275_same_signature_upgrade_and_rollback_drill() {
        for origin in ["capacitor://localhost", "https://localhost"] {
            let initial = sample_0275_storage_fixture();
            let report = run_upgrade_rollback_drill(origin, &[origin], &initial, |state| {
                state.local_workspace_ids.push("ws-native-03".to_string());
                state.theme = Some("light".to_string());
                state.last_workspace_id = Some("ws-native-03".to_string());
            })
            .expect("normal 0.27.5 upgrade drill must succeed");

            assert_eq!(
                report.imported_local_ids,
                vec!["ws-local-01", "ws-local-02"]
            );
            assert!(report.readback_verified);
            assert_eq!(
                report
                    .rolled_back_storage
                    .get("capacitor_device_hint")
                    .map(String::as_str),
                Some("keep-me"),
                "noise keys outside allowlist must never be deleted on rollback"
            );
            assert_eq!(
                report.downgraded_snapshot.local_workspace_ids,
                vec!["ws-local-01", "ws-local-02", "ws-native-03"]
            );
            assert_eq!(report.downgraded_snapshot.theme.as_deref(), Some("light"));
            assert_eq!(report.downgraded_snapshot.server_list[0].id, "selfhost-1");
            assert!(
                report
                    .downgraded_snapshot
                    .cloud_workspace_caches
                    .contains_key("global-state:cloud-workspace:u-42")
            );
        }
    }

    #[test]
    fn drill_fails_closed_on_wrong_origin_and_preserves_corrupt_allowlist_verbatim() {
        let initial = sample_0275_storage_fixture();
        // Wrong origin must fail closed without clearing or mutating state.
        let err = run_upgrade_rollback_drill(
            "https://evil.example",
            &["capacitor://localhost"],
            &initial,
            |_| {},
        )
        .expect_err("wrong origin must fail closed");
        assert!(matches!(
            err,
            LegacyImportError::SentinelFailed(SentinelFailureReason::OriginMismatch { .. })
        ));

        // Corrupt `affine-local-workspace` must not abort upgrade or trigger fresh install,
        // and must round-trip verbatim on rollback writeback.
        let mut corrupt = initial;
        corrupt.insert(
            KEY_LOCAL_WORKSPACE_LIST.to_string(),
            "{not-an-array".to_string(),
        );
        let report = run_upgrade_rollback_drill(
            "capacitor://localhost",
            &["capacitor://localhost"],
            &corrupt,
            |state| {
                assert!(state.has_local_workspace_key);
                assert!(state.local_workspace_ids.is_empty());
                state.theme = Some("system".to_string());
            },
        )
        .expect("corrupt allowlist must be preserved verbatim");
        assert!(report.readback_verified);
        assert_eq!(
            report
                .rolled_back_storage
                .get(KEY_LOCAL_WORKSPACE_LIST)
                .map(String::as_str),
            Some("{not-an-array")
        );
    }
}
