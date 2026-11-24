# Working in `packages/common/store/` (for agents)

`packages/common/store/` holds the client storage and sans-I/O sync domain crate.
This directory belongs to the client Cargo workspace rooted at `packages/frontend/Cargo.toml`.

## Domain boundaries and invariants

- `packages/common/store/` declares `#![forbid(unsafe_code)]` and has zero GUI or platform dependencies.
  Never depend on `ui`, `wgpu`, `objc2`, or `web-sys` rendering types.

- Keep `rust-toolchain.toml` (`1.98.1` with `wasm32-unknown-unknown`) and `rustfmt.toml` (`edition = "2024"`) byte-identical to `packages/frontend/`.

- This crate is the sole writer for AFFiNE root workspace metadata (`meta.pages` and `spaces[pageId]`) and workspace SQLite/IndexedDB tables.

- Keep SQLite schema migrations frozen at the `0.27.5` five-step contract and share `<spaceId>.db` in place with legacy clients.

- Keep every `.rs` file at or below 800 non-test lines and follow the module rules in `blocksuite/crates/AGENTS.md`.
