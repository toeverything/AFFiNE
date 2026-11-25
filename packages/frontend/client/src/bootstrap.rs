//! Startup bootstrap gate consuming `affine_legacy_import::import_from_sentinel`.
//!
//! Ensures fresh-workspace initialization runs ONLY when the legacy WebView sentinel is verified
//! healthy with zero allowlisted AFFiNE keys, and blocks initialization when the WebView is
//! unready or reports an unexpected origin.

use affine_legacy_import::{
    LegacyImportError, LegacyLocalStorageSnapshot, SentinelEvaluation, SentinelFailureReason,
    WebViewStorageSentinel, import_from_sentinel,
};

/// Outcome of evaluating the legacy WebView sentinel at app startup.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BootstrapDecision {
    /// Verified fresh install (zero allowlisted AFFiNE keys): safe to initialize default workspace.
    InitializeFreshWorkspace,
    /// Verified existing user state imported from allowlisted keys (even if workspace list is `"[]"`).
    RestoreExisting(LegacyLocalStorageSnapshot),
    /// WebView was unready, origin mismatched, or critical workspace list was corrupt:
    /// MUST NOT initialize a default workspace or scan `*.db` files.
    BlockOnUnreadyWebView(String),
}

/// Startup bootstrap gate enforcing legacy upgrade safety invariants (`F1`).
#[derive(Clone, Debug)]
pub struct WorkspaceBootstrapGate {
    allowed_origins: Vec<String>,
}

impl WorkspaceBootstrapGate {
    pub fn new(allowed_origins: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self {
            allowed_origins: allowed_origins.into_iter().map(Into::into).collect(),
        }
    }

    /// Evaluate a captured [`WebViewStorageSentinel`] and decide whether to initialize a fresh
    /// workspace, restore imported legacy state, or block startup recovery.
    pub fn evaluate(&self, sentinel: &WebViewStorageSentinel) -> BootstrapDecision {
        let refs: Vec<&str> = self.allowed_origins.iter().map(String::as_str).collect();
        match import_from_sentinel(sentinel, &refs) {
            Ok((eval, snapshot)) => {
                if eval.should_initialize_fresh_workspace() {
                    BootstrapDecision::InitializeFreshWorkspace
                } else {
                    debug_assert!(matches!(
                        eval,
                        SentinelEvaluation::ValidPopulated {
                            has_allowlisted_keys: true
                        }
                    ));
                    BootstrapDecision::RestoreExisting(snapshot)
                }
            }
            Err(LegacyImportError::SentinelFailed(reason)) => {
                BootstrapDecision::BlockOnUnreadyWebView(format_reason(&reason))
            }
            Err(other) => BootstrapDecision::BlockOnUnreadyWebView(other.to_string()),
        }
    }
}

fn format_reason(reason: &SentinelFailureReason) -> String {
    format!("{reason:?}")
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    #[test]
    fn bootstrap_gate_routes_fresh_existing_empty_and_unready_sentinels() {
        let gate = WorkspaceBootstrapGate::new(["capacitor://localhost", "https://localhost"]);

        // 1. Fresh install -> InitializeFreshWorkspace.
        let fresh = WebViewStorageSentinel {
            origin: "capacitor://localhost".into(),
            length: 0,
            keys: vec![],
            entries: BTreeMap::new(),
        };
        assert_eq!(
            gate.evaluate(&fresh),
            BootstrapDecision::InitializeFreshWorkspace
        );

        // 2. Existing user with empty workspace list -> RestoreExisting (never re-init default).
        let deleted_all = WebViewStorageSentinel {
            origin: "capacitor://localhost".into(),
            length: 1,
            keys: vec!["affine-local-workspace".into()],
            entries: BTreeMap::from([("affine-local-workspace".into(), "[]".into())]),
        };
        match gate.evaluate(&deleted_all) {
            BootstrapDecision::RestoreExisting(snap) => {
                assert!(snap.has_local_workspace_key);
                assert!(snap.local_workspace_ids.is_empty());
            }
            other => panic!("expected RestoreExisting, got {other:?}"),
        }

        // 3. Unready WebView / wrong origin -> BlockOnUnreadyWebView.
        let unready = WebViewStorageSentinel {
            origin: "about:blank".into(),
            length: 0,
            keys: vec![],
            entries: BTreeMap::new(),
        };
        assert!(matches!(
            gate.evaluate(&unready),
            BootstrapDecision::BlockOnUnreadyWebView(_)
        ));
    }
}
