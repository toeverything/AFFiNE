# Working in `blocksuite/crates/editor/` (for agents)

`blocksuite/crates/editor/` defines the reusable BlockSuite editor crate (`blocksuite-editor`) inside the client workspace at `packages/frontend/Cargo.toml`.

## Invariants

- Depend only on `blocksuite-playground-doc`, `blocksuite-preview`, `ui-kit`, `ui`, `ui-tokens`, and general utility crates.
- Never depend on `affine-store` and never leak `db$*`, `userdata$*`, legacy subdoc GUIDs, or network ACK concepts into this crate.
- Use `WorkspaceDocDirectory` as the narrow host port for linked-document queries, page title updates, and linked-document creation.
- Load design tokens, icons, and bundled font bytes exclusively from `ui-tokens`. Never add cross-tree `include_bytes!` paths.
- Accept `direction: ui::Direction` explicitly in `FlowInput`, `OverlayScene`, and `EdgelessRenderInput` instead of reading `Window::layout_direction()` inside the editor, so mobile hosts can keep editor roots LTR under RTL locales while preserving LTR and RTL logical start/end placement.
- Keep zero `is_headless` branches and zero inline `#[cfg(any(test, feature = "harness"))]` branches in shipping modules, zero wall-clock calls, and each `.rs` file at or below 800 non-test lines.
