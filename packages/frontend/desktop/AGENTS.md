# Working in `packages/frontend/desktop/` (for agents)

`packages/frontend/desktop/` (`affine-desktop`) is the L4 pure-Rust Web Desktop and Electron desktop application shell inside the client workspace rooted at `packages/frontend/Cargo.toml`.

## Scope and architecture

- `affine-desktop` owns the multi-pane `Workbench`, collapsible and resizable `AppSidebar` (workspace switcher, Quick Search, New Page/Edgeless, All Docs, Favorites, Journals, Folders/Collections/Tags tree, Trash, and Settings), multi-tab Split View with live shared `affine-store` + `blocksuite-playground-doc` Page/Edgeless editing and per-pane `NavHistory`, `Cmd/Ctrl+K` `QuickSearch`, centered `PeekView`, physically isolated `ComposerDraftStore` with SHA-256 content-addressed attachments and one-way idempotent importers, `wasm32` Web Desktop mount entry (`wasm_desktop_main`), and the `desktop-harness` offscreen verification CLI.

## Domain boundaries and invariants

- Keep `#![forbid(unsafe_code)]` at the crate root.
- Depend only on workspace crates allowed by `packages/frontend/scripts/check-invariants.sh` (`ui-tokens`, `ui`, `ui-kit`, `blocksuite-playground-doc`, `blocksuite-preview`, `blocksuite-editor`, `playground`, `affine-store`, `affine-client`, `affine-legacy-import`). Never depend on `packages/frontend/mobile` or `packages/frontend/hosts/*`.
- Keep `ComposerDraftStore` physically isolated from collaborative `<spaceId>.db` workspace databases. Never store unpublished drafts inside `<spaceId>.db`.
- Drive all time-based logic from explicit timestamps or the scheduler clock. Never call system wall clocks (`Instant::now`, `SystemTime::now`, `Zoned::now`, `Timestamp::now`).
- Keep zero `is_headless` branches and zero inline `#[cfg(any(test, feature = "harness"))]` branches in shipping view modules.
- Keep every `.rs` file at or below 800 non-test lines, zero `super::super::`, and `wasm32-unknown-unknown` builds warning-free.

## Verification

Run inside `packages/frontend/` with root NAPI flags cleared:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-desktop --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked -p affine-desktop
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked -p affine-desktop --features harness --bin desktop-harness -- audit
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked -p affine-desktop --features harness --bin desktop-harness -- gallery --out evidence/desktop
./scripts/check-invariants.sh
```
