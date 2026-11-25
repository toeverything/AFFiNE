//! Positive sentinel validation state machine for Capacitor WebView `localStorage`.
//!
//! Enforces bidirectional integrity between `keys` and `entries`:
//! - `length == keys.len()` with zero duplicates
//! - Every key in `entries` exists in `keys` and is a permitted entry key
//! - Every core allowlisted key present in `keys` MUST exist in `entries` (`MissingAllowlistedEntry`)
//! - Optional cloud workspace cache keys and legacy bare `<id>-auth` keys stay cross-slice compatible
//!   with `S2-iOS` and `S2-Android` probes.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{is_allowlisted_key, is_core_sentinel_required_key, is_permitted_sentinel_entry_key};

/// Positive sentinel payload captured atomically inside the legacy WebView context.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct WebViewStorageSentinel {
    pub origin: String,
    pub length: usize,
    pub keys: Vec<String>,
    pub entries: BTreeMap<String, String>,
}

/// Specific reason why a WebView sentinel read was rejected.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum SentinelFailureReason {
    EmptyOrigin,
    OriginMismatch {
        actual: String,
    },
    LengthMismatch {
        reported_length: usize,
        observed_keys: usize,
    },
    DuplicateKeys,
    EntryKeyMissingFromKeyList {
        key: String,
    },
    DisallowedEntryKey {
        key: String,
    },
    MissingAllowlistedEntry {
        key: String,
    },
}

/// Result of evaluating a [`WebViewStorageSentinel`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SentinelEvaluation {
    /// Verified allowlisted origin with zero stored keys (genuine fresh install).
    ValidEmpty,
    /// Verified allowlisted origin with consistent key list and entry map.
    /// `has_allowlisted_keys` is `false` when only unrelated third-party keys exist.
    ValidPopulated { has_allowlisted_keys: bool },
    /// WebView was unready, returned an unexpected origin, or yielded inconsistent storage data.
    /// Callers MUST NOT clear state, create a default workspace, or scan `*.db` files.
    UnreadyOrMismatch(SentinelFailureReason),
}

impl SentinelEvaluation {
    /// Return `true` only when the WebView is verified healthy and contains zero allowlisted AFFiNE keys.
    pub fn should_initialize_fresh_workspace(&self) -> bool {
        matches!(
            self,
            Self::ValidEmpty
                | Self::ValidPopulated {
                    has_allowlisted_keys: false
                }
        )
    }

    pub fn is_safe_to_import(&self) -> bool {
        matches!(self, Self::ValidEmpty | Self::ValidPopulated { .. })
    }
}

/// Validate `{ origin, length, keys, entries }` against `allowed_origins`.
pub fn evaluate_sentinel(
    sentinel: &WebViewStorageSentinel,
    allowed_origins: &[&str],
) -> SentinelEvaluation {
    let origin = sentinel.origin.trim();
    if origin.is_empty() || origin == "null" || origin == "about:blank" {
        return SentinelEvaluation::UnreadyOrMismatch(SentinelFailureReason::EmptyOrigin);
    }

    if !allowed_origins
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(origin))
    {
        return SentinelEvaluation::UnreadyOrMismatch(SentinelFailureReason::OriginMismatch {
            actual: origin.to_string(),
        });
    }

    if sentinel.length != sentinel.keys.len() {
        return SentinelEvaluation::UnreadyOrMismatch(SentinelFailureReason::LengthMismatch {
            reported_length: sentinel.length,
            observed_keys: sentinel.keys.len(),
        });
    }

    let mut unique_keys = BTreeSet::new();
    for key in &sentinel.keys {
        if !unique_keys.insert(key.as_str()) {
            return SentinelEvaluation::UnreadyOrMismatch(SentinelFailureReason::DuplicateKeys);
        }
    }

    for entry_key in sentinel.entries.keys() {
        if !unique_keys.contains(entry_key.as_str()) {
            return SentinelEvaluation::UnreadyOrMismatch(
                SentinelFailureReason::EntryKeyMissingFromKeyList {
                    key: entry_key.clone(),
                },
            );
        }
        if !is_permitted_sentinel_entry_key(entry_key) {
            return SentinelEvaluation::UnreadyOrMismatch(
                SentinelFailureReason::DisallowedEntryKey {
                    key: entry_key.clone(),
                },
            );
        }
    }

    // Reverse completeness check: every core allowlisted key reported in `keys` MUST be present in `entries`.
    for key in &sentinel.keys {
        if is_core_sentinel_required_key(key) && !sentinel.entries.contains_key(key) {
            return SentinelEvaluation::UnreadyOrMismatch(
                SentinelFailureReason::MissingAllowlistedEntry { key: key.clone() },
            );
        }
    }

    if sentinel.length == 0 {
        SentinelEvaluation::ValidEmpty
    } else {
        let has_allowlisted_keys = sentinel.keys.iter().any(|k| is_allowlisted_key(k));
        SentinelEvaluation::ValidPopulated {
            has_allowlisted_keys,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import_from_sentinel;

    #[test]
    fn sentinel_enforces_reverse_completeness_and_cross_slice_noise_compatibility() {
        let allowed = ["capacitor://localhost", "https://localhost"];

        // 1. Mixed 1 allowlisted key + 1 non-allowlisted noise key (noise excluded from `entries`).
        let mixed = WebViewStorageSentinel {
            origin: "capacitor://localhost".into(),
            length: 2,
            keys: vec!["__cap_noise__".into(), "affine-local-workspace".into()],
            entries: BTreeMap::from([("affine-local-workspace".into(), r#"["ws-1"]"#.into())]),
        };
        let (eval, snap) = import_from_sentinel(&mixed, &allowed).unwrap();
        assert_eq!(
            eval,
            SentinelEvaluation::ValidPopulated {
                has_allowlisted_keys: true
            }
        );
        assert_eq!(snap.local_workspace_ids, vec!["ws-1"]);

        // 2. Missing allowlisted entry in `entries` MUST fail with MissingAllowlistedEntry.
        let missing = WebViewStorageSentinel {
            origin: "capacitor://localhost".into(),
            length: 1,
            keys: vec!["affine-local-workspace".into()],
            entries: BTreeMap::new(),
        };
        assert_eq!(
            evaluate_sentinel(&missing, &allowed),
            SentinelEvaluation::UnreadyOrMismatch(SentinelFailureReason::MissingAllowlistedEntry {
                key: "affine-local-workspace".into()
            })
        );

        // 3. Bare third-party `foo-auth` does NOT block fresh-install initialization.
        let third_party_auth = WebViewStorageSentinel {
            origin: "capacitor://localhost".into(),
            length: 1,
            keys: vec!["foo-auth".into()],
            entries: BTreeMap::from([("foo-auth".into(), "opaque".into())]),
        };
        let eval_tp = evaluate_sentinel(&third_party_auth, &allowed);
        assert_eq!(
            eval_tp,
            SentinelEvaluation::ValidPopulated {
                has_allowlisted_keys: false
            }
        );
        assert!(eval_tp.should_initialize_fresh_workspace());

        // 4. Optional cloud cache key in `keys` only (older probe) does NOT trigger MissingAllowlistedEntry.
        let cloud_key_only = WebViewStorageSentinel {
            origin: "capacitor://localhost".into(),
            length: 1,
            keys: vec!["global-state:cloud-workspace:acct-1".into()],
            entries: BTreeMap::new(),
        };
        assert_eq!(
            evaluate_sentinel(&cloud_key_only, &allowed),
            SentinelEvaluation::ValidPopulated {
                has_allowlisted_keys: true
            }
        );
    }
}
