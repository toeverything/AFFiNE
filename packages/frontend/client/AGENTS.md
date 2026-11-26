# Working in `packages/frontend/client/` (for agents)

`packages/frontend/client/` (`affine-client`) is the L3 device-neutral client domain crate shared by Mobile, Desktop, and Web hosts.
This crate belongs to the client Cargo workspace rooted at `packages/frontend/Cargo.toml`.

## Domain boundaries and invariants

- Keep `#![forbid(unsafe_code)]` at the crate root.
- Remain strictly device-neutral: never import `ui::Window`, view elements, or mobile-only shell concepts.
- Enforce `F3`: only `HostKind::Native` allows adding cross-origin self-hosted servers; `HostKind::Web` rejects self-hosted server addition.
- Keep `StoreBackedDocDirectory` (`WorkspaceDocDirectory` implementation) aligned with the root-registration and anti-resurrection invariants (`F1`): persist `root_registered` immediately upon root write success, support in-session `intent_id` idempotent replay, and return `Err(DirectoryError::NotFound)` on replaying deleted intents.
- Keep `PlatformAccessibility` active in production (non-`harness`) builds so Web, iOS, and Android hosts can consume a stable first-frame semantic root.
- Keep every `.rs` file at or below 800 non-test lines, zero `super::super::`, and zero system wall-clock calls.
