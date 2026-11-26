# Working in `packages/frontend/legacy-import/` (for agents)

`packages/frontend/legacy-import/` (`affine-legacy-import`) is the pure-Rust upgrade compatibility layer between legacy `0.27.5` Capacitor WebView `localStorage` state and the native client core.
This crate belongs to the client Cargo workspace rooted at `packages/frontend/Cargo.toml`.

## Domain boundaries and invariants

- Keep `#![forbid(unsafe_code)]` at the crate root.
- Depend only on pure utility crates (`serde`, `serde_json`, `thiserror`) so this crate never pulls in `sqlx`, UI crates, host crates, or legacy WebView IndexedDB.
- Parse and write back only the explicit `localStorage` allowlist (`affine-local-workspace`, `global-state:serverList`, `global-state:serverConfig:<id>`, `global-state:<serverId>-auth`, `global-state:cloud-workspace:<accountId>`, `global-state:selfhosted-workspace-<serverId>:<accountId>`, `affine-flag:*`, `global-state:affine-flag:*`, `global-cache:i18n_lng`, `last_workspace_id`, `last_workspace_flavour`, `affine-settings`, `theme`).
- Validate the positive sentinel `{ origin, length, keys, entries }` including reverse completeness for core allowlisted keys before importing.
  Never clear state, initialize a default workspace, or scan `*.db` files when the sentinel reports an origin mismatch or unready WebView.
- Preserve malformed or non-array `affine-local-workspace` entries (with `has_local_workspace_key = true` and empty `local_workspace_ids`) as well as malformed auxiliary JSON entries verbatim in `preserved_raw_entries`, so a corrupt value never aborts upgrade or triggers fresh-install default workspace creation and is written back verbatim until explicitly replaced.
- Keep every `.rs` file at or below 800 non-test lines, zero `super::super::`, and zero system wall-clock calls.
