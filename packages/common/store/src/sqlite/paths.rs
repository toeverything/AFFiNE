use std::path::{Path, PathBuf};

use crate::error::{StoreError, StoreResult};

const FORBIDDEN_PEER_CHARS: &[char] = &[
    '/', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '+', '~', '`', '"', '\'', ':', ';', ',',
    '?', '<', '>', '|',
];

/// Sanitize a peer name identically to the iOS (`NBStorePlugin.swift`) and Android
/// (`NbStorePlugin.kt`) 0.27.4 / 0.27.5 clients:
///
/// 1. Replace every character in `[/!@#$%^&*()+~`"':;,?<>|]` with `_`.
/// 2. Collapse consecutive `_` runs into a single `_`.
/// 3. Trim trailing `_` characters.
pub fn sanitize_peer_name(peer: &str) -> String {
    let mut out = String::with_capacity(peer.len());
    let mut prev_underscore = false;

    for ch in peer.chars() {
        let mapped = if FORBIDDEN_PEER_CHARS.contains(&ch) {
            '_'
        } else {
            ch
        };
        if mapped == '_' {
            if !prev_underscore {
                out.push('_');
                prev_underscore = true;
            }
        } else {
            out.push(mapped);
            prev_underscore = false;
        }
    }

    while out.ends_with('_') {
        out.pop();
    }

    out
}

fn validate_path_segment(label: &str, value: &str) -> StoreResult<()> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains('/')
        || value.contains('\\')
        || value.contains('\0')
    {
        return Err(StoreError::InvalidPath(format!(
            "invalid {label} segment: {value:?}"
        )));
    }
    Ok(())
}

/// Resolve the in-place SQLite database path for a single explicitly known workspace:
/// `<base_dir>/workspaces/<space_type>/<sanitized_peer>/<space_id>.db`.
///
/// Safety invariant (F1): mobile deletion removes workspace IDs from client state
/// without deleting `.db` files on disk. Callers must only open workspace IDs from
/// an explicit allowlist and must never scan directories for `*.db` files.
pub fn resolve_workspace_db_path(
    base_dir: &Path,
    space_type: &str,
    peer: &str,
    space_id: &str,
) -> StoreResult<PathBuf> {
    validate_path_segment("space_type", space_type)?;
    validate_path_segment("space_id", space_id)?;
    let sanitized_peer = sanitize_peer_name(peer);
    validate_path_segment("peer", &sanitized_peer)?;

    Ok(base_dir
        .join("workspaces")
        .join(space_type)
        .join(sanitized_peer)
        .join(format!("{space_id}.db")))
}

/// Resolve paths for an explicit allowlist of workspace IDs without touching the filesystem.
///
/// This API intentionally does not scan disk directories for `*.db` files so that
/// previously deleted workspaces are never resurrected.
pub fn resolve_allowlisted_workspace_paths(
    base_dir: &Path,
    space_type: &str,
    peer: &str,
    allowlisted_space_ids: &[&str],
) -> StoreResult<Vec<(String, PathBuf)>> {
    let mut resolved = Vec::with_capacity(allowlisted_space_ids.len());
    for space_id in allowlisted_space_ids {
        let path = resolve_workspace_db_path(base_dir, space_type, peer, space_id)?;
        resolved.push(((*space_id).to_string(), path));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_peer_name_matches_ios_and_android_rules() {
        let cases = [
            ("local", "local"),
            ("https://app.affine.pro", "https_app.affine.pro"),
            (
                "https://self-host.example.com:3010/",
                "https_self-host.example.com_3010",
            ),
            (
                "http://127.0.0.1:8080/api?a=1&b=2",
                "http_127.0.0.1_8080_api_a=1_b=2",
            ),
            ("a///b___c!!!", "a_b_c"),
            ("peer@host#1+2", "peer_host_1_2"),
            ("plain_name___", "plain_name"),
            ("_leading_preserved", "_leading_preserved"),
        ];

        for (raw, expected) in cases {
            assert_eq!(sanitize_peer_name(raw), expected, "peer={raw}");
        }
    }

    #[test]
    fn resolve_workspace_db_path_enforces_layout_and_rejects_traversal() {
        let base = Path::new("/data/affine");
        let path = resolve_workspace_db_path(base, "workspace", "https://app.affine.pro", "ws-123")
            .unwrap();
        assert_eq!(
            path,
            PathBuf::from("/data/affine/workspaces/workspace/https_app.affine.pro/ws-123.db")
        );

        let allowlisted =
            resolve_allowlisted_workspace_paths(base, "workspace", "local", &["ws-1", "ws-2"])
                .unwrap();
        assert_eq!(allowlisted.len(), 2);
        assert_eq!(
            allowlisted[0].1,
            PathBuf::from("/data/affine/workspaces/workspace/local/ws-1.db")
        );

        assert!(resolve_workspace_db_path(base, "workspace", "local", "../escape").is_err());
        assert!(resolve_workspace_db_path(base, "../bad", "local", "ws-1").is_err());
        assert!(resolve_workspace_db_path(base, "workspace", "///", "ws-1").is_err());
    }
}
