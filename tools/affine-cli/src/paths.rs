//! Filesystem layout + pool-key resolution for the local AFFiNE store.
//!
//! VERIFIED against packages/frontend/apps/electron/src/helper/workspace/meta.ts and
//! packages/common/nbstore/src/utils/universal-id.ts.
//!
//! On macOS (stable build) the base is `~/Library/Application Support/AFFiNE`
//! (Electron `sessionData`, productName == "AFFiNE"). A local workspace's DB lives at
//! `<base>/workspaces/local/<id>/storage.db`. The universal_id (opaque pool key on the
//! Rust side, but load-bearing for app interop) is `@peer(local);@type(workspace);@id(<id>);`
//! with a REQUIRED trailing semicolon.

use std::path::PathBuf;

use crate::error::CliError;

/// Resolve the AFFiNE data base directory.
///
/// Precedence:
///   1. explicit `--affine-dir` override (used verbatim as the base),
///   2. macOS default `dirs::data_dir()/AFFiNE` (== ~/Library/Application Support/AFFiNE).
pub fn base_dir(affine_dir: Option<&str>, product: &str) -> Result<PathBuf, CliError> {
    if let Some(dir) = affine_dir {
        return Ok(PathBuf::from(dir));
    }
    let data = dirs::data_dir()
        .ok_or_else(|| CliError::config("could not resolve a platform data directory; pass --affine-dir"))?;
    Ok(data.join(product))
}

/// `<base>/workspaces/<peer>/<id>/storage.db`.
pub fn workspace_db_path(base: &std::path::Path, peer: &str, id: &str) -> PathBuf {
    base.join("workspaces").join(peer).join(id).join("storage.db")
}

/// `<base>/workspaces/<peer>` — used by the `workspace list` scan.
pub fn workspaces_dir(base: &std::path::Path, peer: &str) -> PathBuf {
    base.join("workspaces").join(peer)
}

/// `@peer(<peer>);@type(workspace);@id(<id>);` — trailing semicolon is part of the format.
pub fn universal_id(peer: &str, id: &str) -> String {
    format!("@peer({peer});@type(workspace);@id({id});")
}
