# Working in `packages/ui/tokens/` (for agents)

`packages/ui/tokens/` defines the zero-dependency `ui-tokens` crate inside the client workspace at `packages/frontend/Cargo.toml`.

## Invariants

- Keep `ui-tokens` free of internal and external crate dependencies (`ALLOWED_DEPS["packages/ui/tokens"] = set()`).
- Keep `#![forbid(unsafe_code)]` in `src/lib.rs`.
- Keep `extract-tokens.mjs`, `tokens.rs`, `icons.rs`, and `fonts.lock` at the crate root so `node ../ui/tokens/extract-tokens.mjs --check` and standalone `rustc --edition 2024 --test` gates continue to pass.
- Export the five tracked repository font payloads through `bundled_font_bytes()` so downstream crates never use cross-tree `include_bytes!` paths.
