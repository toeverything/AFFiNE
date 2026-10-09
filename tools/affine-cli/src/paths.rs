//! Filesystem layout + pool-key resolution for the local AFFiNE store.
//!
//! VERIFIED against packages/frontend/apps/electron/src/helper/workspace/meta.ts and
//! packages/common/nbstore/src/utils/universal-id.ts.
//!
//! The app sets `sessionData` to `<appData>/<productName>` (electron `main/index.ts`), so the
//! base is `~/Library/Application Support/AFFiNE` on macOS, `~/.config/AFFiNE` (or
//! `$XDG_CONFIG_HOME/AFFiNE`) on Linux, and `%APPDATA%\AFFiNE` on Windows. A local workspace's
//! DB lives at `<base>/workspaces/local/<id>/storage.db`. The universal_id (opaque pool key on
//! the Rust side, but load-bearing for app interop) is `@peer(local);@type(workspace);@id(<id>);`
//! with a REQUIRED trailing semicolon.

use std::path::PathBuf;

use crate::error::CliError;

/// Resolve the AFFiNE data base directory.
///
/// Precedence:
///   1. explicit `--affine-dir` override (used verbatim as the base),
///   2. `dirs::config_dir()/<product>`, which is Electron's `appData` on every platform:
///      `~/Library/Application Support` (macOS), `$XDG_CONFIG_HOME` or `~/.config` (Linux),
///      `%APPDATA%` (Windows). `dirs::data_dir()` would diverge on Linux (`~/.local/share`).
pub fn base_dir(affine_dir: Option<&str>, product: &str) -> Result<PathBuf, CliError> {
    if let Some(dir) = affine_dir {
        return Ok(PathBuf::from(dir));
    }
    let data = dirs::config_dir()
        .ok_or_else(|| CliError::config("could not resolve a platform config directory; pass --affine-dir"))?;
    Ok(data.join(product))
}

/// Reject a `peer` or workspace id that is not a single normal path component.
///
/// Both come from the command line and are joined under `<base>/workspaces`. `Path::join` replaces
/// the whole prefix when the component is absolute, and `..` escapes the base, so either would let
/// a crafted id point the SQLite connection at an arbitrary file.
pub fn path_component<'a>(value: &'a str, what: &str) -> Result<&'a str, CliError> {
    let mut components = std::path::Path::new(value).components();
    let single_normal = matches!(
        (components.next(), components.next()),
        (Some(std::path::Component::Normal(_)), None)
    );
    // `Component::Normal` still admits an embedded separator on Windows verbatim paths and any
    // platform-specific prefix quirks, so also refuse separators and control characters outright.
    let clean = !value.is_empty() && !value.contains(['/', '\\', '\0']) && !value.chars().any(char::is_control);
    if single_normal && clean {
        Ok(value)
    } else {
        Err(CliError::config(format!(
            "{what} must be a single path segment (no separators, `.`, `..`, or drive prefixes): {value:?}"
        )))
    }
}

/// `<base>/workspaces/<peer>/<id>/storage.db`.
pub fn workspace_db_path(base: &std::path::Path, peer: &str, id: &str) -> Result<PathBuf, CliError> {
    Ok(workspace_dir(base, peer, id)?.join("storage.db"))
}

/// `<base>/workspaces/<peer>/<id>/affine-cli.client`: the CLI's persisted y-octo client id for
/// this workspace, also the file mutating commands lock (see `crate::lease`).
pub fn client_id_path(base: &std::path::Path, peer: &str, id: &str) -> Result<PathBuf, CliError> {
    Ok(workspace_dir(base, peer, id)?.join(crate::lease::CLIENT_FILE))
}

/// `<base>/workspaces/<peer>` - used by the `workspace list` scan.
pub fn workspaces_dir(base: &std::path::Path, peer: &str) -> Result<PathBuf, CliError> {
    Ok(base.join("workspaces").join(path_component(peer, "--peer")?))
}

fn workspace_dir(base: &std::path::Path, peer: &str, id: &str) -> Result<PathBuf, CliError> {
    Ok(workspaces_dir(base, peer)?.join(path_component(id, "workspace id")?))
}

/// `@peer(<peer>);@type(workspace);@id(<id>);` - trailing semicolon is part of the format.
pub fn universal_id(peer: &str, id: &str) -> String {
    format!("@peer({peer});@type(workspace);@id({id});")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_component_accepts_plain_ids() {
        for ok in ["local", "abc123", "V1StGXR8_Z5jdHi6B-myT", "with.dot", "a b"] {
            assert_eq!(path_component(ok, "id").unwrap(), ok);
        }
    }

    #[test]
    fn path_component_rejects_traversal_and_absolute_segments() {
        for bad in [
            "",
            ".",
            "..",
            "../x",
            "a/b",
            "a\\b",
            "/etc/passwd",
            "C:\\x",
            "a\0b",
            "\\\\server\\share",
        ] {
            let err = path_component(bad, "id").expect_err(bad);
            assert_eq!(err.code(), "config", "{bad}");
        }
    }

    #[test]
    fn workspace_paths_stay_under_base() {
        let base = std::path::Path::new("/base");
        let db = workspace_db_path(base, "local", "ws").unwrap();
        assert_eq!(db, base.join("workspaces/local/ws/storage.db"));
        assert!(workspace_db_path(base, "local", "../../etc").is_err());
        assert!(workspace_db_path(base, "/abs", "ws").is_err());
        assert!(client_id_path(base, "local", "..").is_err());
        assert!(workspaces_dir(base, "x/y").is_err());
    }
}
