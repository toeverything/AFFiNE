# Working in `packages/common/store/` (for agents)

`packages/common/store/` (`affine-store`) holds the client storage and sans-I/O sync domain crate.
This directory belongs to the client Cargo workspace rooted at `packages/frontend/Cargo.toml`.

## Domain boundaries and invariants

- Keep `#![forbid(unsafe_code)]` at the crate root.
  Never depend on `ui`, `wgpu`, `objc2`, or `web-sys` rendering types.

- Keep `rust-toolchain.toml` (`1.98.1` with `wasm32-unknown-unknown`) and `rustfmt.toml` (`edition = "2024"`) byte-identical to `packages/frontend/`.

- Do not add `package.json` or a standalone `Cargo.lock` to this directory.

- Do not enable `sqlx` `macros`.
  Do not depend on `packages/frontend/native/schema` across workspaces.

- This crate is the sole writer for AFFiNE root workspace metadata (`meta.pages` and `spaces[pageId]`) and workspace SQLite/IndexedDB tables.
  It exposes `WorkspaceDirectory` as a store-domain query and mutation service, and does not define editor port traits.
  When recovering an existing workspace via `WorkspaceDb::from_root_update_v1`, load `db$docProperties` via `load_db_table` or confirm its absence via `mark_db_table_absent` before calling non-`Page` `WorkspaceDirectory::create_doc` (which otherwise returns `StoreError::DbTableNotResolved` so retry intent survives restarts; explicit non-`Page` crash replays restore their client-local journal via `import_explicit_create_journal` so legacy `0.27.5` pages without `DocProperties` rows stay `Page`).

- Keep SQLite schema migrations frozen at the `0.27.5` five-step contract and share `<spaceId>.db` in place with legacy clients.
  Keep all five migration SQL strings byte-identical to `packages/frontend/native/schema/src/lib.rs`.

- Never scan a workspace directory for `*.db` files to discover local workspaces.
  Open only explicit allowlisted workspace identifiers.

- Never call system wall clocks (`SystemTime::now`, `Instant::now`, `Zoned::now`, `Timestamp::now`).
  Pass explicit timestamps or a `Clock` implementation.

- Keep every `.rs` file at or below 800 non-test lines and follow the module rules in `blocksuite/crates/AGENTS.md`.
  Keep both native and `wasm32-unknown-unknown` builds clean.

## Verification

Run commands inside `packages/frontend/` with root NAPI flags cleared:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo fmt --all -- --check
CARGO_ENCODED_RUSTFLAGS="" cargo clippy --locked --workspace --all-targets --features harness -- -D warnings
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-store --no-default-features --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked -p affine-store
./scripts/check-invariants.sh
```
