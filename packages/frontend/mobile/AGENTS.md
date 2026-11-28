# Working in `packages/frontend/mobile/` (for agents)

`packages/frontend/mobile/` (`affine-mobile`) is the L4 pure-Rust mobile product shell inside the client workspace rooted at `packages/frontend/Cargo.toml`.

## Scope and integration boundary

- `affine-mobile` owns the interactive 4-TabBar product shell (`Home`, `Explorer`, `Journals`, `Search`), 10-group `Settings`, `WorkspaceDrawer`, `Page` header (`Breadcrumb`, `DocActions` / `Location & Trail` sheets, independent `Backlinks` pill/sheet), embedded live `Entity<playground::PlaygroundView>` (`hide_chrome = true`, `WorkspaceDocDirectory` injection, `page_readonly` for trashed docs), `MobileBackCoordinator`, and frame-1 `AccessibilityTree` publication.
- Live `affine-store` / `affine-client` SQLite WAL persistence and `SpaceSync` bridge attach via `workspace_bridge.rs`; `showcase::seed_showcase_state` supplies deterministic in-memory workspaces for offline harness verification and preview galleries.

## Domain boundaries and invariants

- Keep `#![forbid(unsafe_code)]` at the crate root.
- Depend only on workspace crates allowed by `packages/frontend/scripts/check-invariants.sh` (`ui-tokens`, `ui`, `ui-kit`, `affine-store`, `affine-legacy-import`, `affine-client`, and `blocksuite/crates/*`). Never depend on `packages/frontend/hosts/*` or `packages/frontend/desktop`.
- Use logical inline geometry (`ui_kit::LogicalEdges`, `ui_kit::LogicalStyled`, `ui_kit::SafeArea`, `inline_start`, `inline_end`) instead of physical left/right layout helpers so `ar`/`fa`/`ur` locales mirror cleanly.
- Drive all transitions from closed-form scheduler time (`ui::Motion`, `ui_kit::Sheet`, `ui_kit::evaluate_micro_icon`). Never call system wall clocks (`Instant::now`, `SystemTime::now`, `Zoned::now`, `Timestamp::now`).
- Keep `Settings` aligned with the 10-section mobile contract and never expose `enable_editor_rtl` in Experimental settings.
- Keep `Backlinks` outside the `Navigation("Breadcrumb")` landmark and synchronize `AccessibilityTree` on frame 1 in production builds (without `harness` feature gates in shipping views).
- Keep every `.rs` file at or below 800 non-test lines, zero `super::super::`, and zero `is_headless` branches.

## Verification

Run inside `packages/frontend/` with root NAPI flags cleared:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-mobile --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked -p affine-mobile --all-targets
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked -p affine-mobile --features harness --bin mobile-harness -- audit-matrix
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked -p affine-mobile --features harness --bin mobile-harness -- fps-replay
./scripts/check-invariants.sh
```
