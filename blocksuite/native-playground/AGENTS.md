# Working in `blocksuite/native-playground` (for agents)

This document records the active engineering invariants enforced in CI today alongside the planned contracts for upcoming crates and editor features.

## Active Invariants (enforced now)

### Workspace boundaries
- `crates/ui`: Single fused internal GPU UI library (vendored once without upstream sync hooks, zero internal `proc-macro = true` crates, zero external UI-kit dependencies). It knows **nothing** about BlockSuite or AFFiNE (`scripts/check-invariants.sh` rejects `blocksuite` and `affine` inside `crates/ui`) and embeds zero fonts (fonts are registered by the application via `cx.text_system().add_fonts(...)`).
- `crates/doc` (`blocksuite-playground-doc`) & `bs-relay`: Pure CRDT document engine and binary room sync relay (`#![forbid(unsafe_code)]`, zero GUI/platform dependencies — `scripts/check-invariants.sh` rejects `ui`, `wgpu`, `objc2`, and `web-sys` in `crates/doc/Cargo.toml`) built on `y-octo 0.3.0`. Preserves 53-bit `clientId` (`1..=2^53 - 1`), complete flavour schema defaults (0 JS writeback updates on initial load), top-level Awareness `color` alongside `user` and `selectionV2`, deterministic `now_ms`-driven undo/awareness clocks, WebSocket-only `seed-claim` / `seed-claim-result` single-winner arbitration (keyed by `seed:<docId>`), `?ws=` relay origin forwarding with permissive blob CORS headers, and `wasm32-unknown-unknown` compatibility under `--no-default-features`.
- `crates/playground`: Application layer owning the shipping `PlaygroundView`, the tracked repository `Inter` base font registration, the native macOS desktop entry (`native-playground`), the WebAssembly canvas entry (`wasm_main`), and the deterministic headless verification CLI (`bs-harness`).
- `unexpected_cfgs = "deny"` is enforced workspace-wide in `Cargo.toml`; dead upstream feature gates are forbidden.

### Platform matrix
`crates/ui` compiles cleanly across three targets from one crate:
- **macOS (`target_os = "macos"`)**: AppKit + Metal + CoreText, including windowless `MetalHeadlessRenderer` readback, full mip-0 `MetalAtlas` zero-init, and offscreen `MacWindow` frame/scale fallbacks.
- **Linux Headless (`target_os = "linux"`)**: `wgpu` + `cosmic-text` via `WgpuHeadlessRenderer` on Mesa `lavapipe` for deterministic software rasterization in CI.
- **Web (`target_family = "wasm"`)**: Single-threaded `wasm32-unknown-unknown` + WebGPU/WebGL2 + `CanvasFontFallback` + block-scoped `ImeMirror` (no `wasm_thread`, no `http_client`), verified in headless Chromium via `scripts/web-smoke.mjs`.

### Determinism, single clock, and zero tester branches
- **Single UI execution path**: Headless rendering (`bs-harness`), desktop (`main.rs`), and Web (`wasm_main`) all instantiate and render the exact same shipping `PlaygroundView` through `Application::with_platform(...)` and `Window::draw()`.
- **No wall clock outside `crates/ui/src/platform/`**: `Instant::now()` and `SystemTime::now()` are forbidden anywhere outside `crates/ui/src/platform/` (`scripts/check-invariants.sh`). Host thread-park deadlines read monotonic time in `crates/ui/src/platform/clock.rs`; animations and transitions read the scheduler clock (`cx.background_executor().now()`, backed by `TestScheduler` in headless/test runs and the platform scheduler in desktop/web).
- **Motion is pure data**: Transitions are declared once as `(from, to, curve, start_ms, duration_ms)` and evaluated as a pure function of scheduler time. Never write frame-by-frame recurrence loops or `sleep` waits.
- **Zero tester branches**: Application and layout logic never inspect `is_headless` or inline `#[cfg(any(test, feature = "harness"))]` to alter behavior (`scripts/check-invariants.sh`).
- **Four-rate replay invariance**: Stepped `PlaygroundView` transitions must progress monotonically with in-flight frames and produce byte-identical terminal `FrameSnapshot` JSON at `60`, `120`, `24`, and `7` fps (`bs-harness fps-check`).
- **Callsite tracing**: Under the `harness` feature, `InteractiveElement::snapshot(...)` records post-layout bounds, `content_mask`, interactivity, focus, and `#[track_caller]` `file:line` origins into `Window::frame_snapshot()` for `sources_at(x, y)` and `bs-harness audit`. Non-harness release builds compile to no-op stubs.
- **Locked builds & rustflags isolation**: `Cargo.lock` is committed and CI runs with `--locked` and `CARGO_ENCODED_RUSTFLAGS=""` (`scripts/check-invariants.sh` verifies fresh `cargo rustc --print link-args` contains zero leaked root NAPI flags).

### Performance guardrail and theme/style oracle
- **`perf/` (`schema.json`, `accepted.json`, `compare-n3.mjs`, `compare-n3.test.mjs`)**: Zero-dependency rolling `N-3` CI comparator with strict schema validation and rerun history anchoring (`--run-id` `created_at` cutoff + pagination). Deterministic byte sizes (`artifacts_bytes.*`) and work counters (non-`_ms` `benchmarks.*`) are hard-gated at strictly `> 10%` (`--fail-on-regression` exits `1`); shared-runner wall-clock timings (`benchmarks.*_ms` at `> 10%`, `ci_wall_ms.*` at `> 10%` and `> 15_000 ms`) are report-only `ADVISORY_SLOWDOWN`. Intentional increases are acknowledged via `{ metric, accepted_value, reason }` ceiling entries in `perf/accepted.json` (with report-only `stale_acceptances` once the rolling baseline catches up). Unmeasured sub-keys are omitted or `null` (never padded with synthetic `0`s) so newly introduced metrics transition through `BOOTSTRAP`.
- **`tokens/` (`extract-tokens.mjs`, `tokens.rs`, `icons.rs`, `fonts.lock`, `extract-style-oracle.spec.ts`, `style-oracle.json`)**: `extract-tokens.mjs` deterministically generates Rust-`Ord`-sorted `tokens.rs`, `icons.rs` (preserving inherited `<svg fill>` and stroke attributes), and `fonts.lock` (SHA-256 font asset manifest + `CommunityCanvasTextFonts` descriptors), with `--check` and `rustc --edition 2024 --test` enforced on every push in CI. `style-oracle.json` is regenerated via Vitest Browser (`extract-style-oracle.spec.ts`, `isolate: false` reusable iframe) whenever BlockSuite styles or themes change (until its browser CI job lands).

## Planned Contracts (upcoming crates & features)

- **Editor & whiteboard rendering**: `BlockFlow`, `RichParagraph`, `EditorSession`, and world-space content transforms/masks (implemented end-to-end in the GPU shaders) separating world-space document/whiteboard geometry from screen-space GPUI chrome.
- **Variable-font slant axis**: OpenType `'slnt'` (`FontStyle::Italic`) variation-axis shaping and rasterization will be wired alongside rich inline marks.

## Build & verification commands

Always clear inherited root rustflags:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo fmt --all -- --check
CARGO_ENCODED_RUSTFLAGS="" cargo clippy --locked --workspace --all-targets --features harness -- -D warnings
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p ui -p playground --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p blocksuite-playground-doc --no-default-features --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked --workspace
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked --workspace --features harness
./scripts/check-invariants.sh
node --test perf/compare-n3.test.mjs
node tokens/extract-tokens.mjs --check
rustc --edition 2024 --test -D warnings tokens/tokens.rs -o /tmp/tokens_test && /tmp/tokens_test
rustc --edition 2024 --test -D warnings tokens/icons.rs -o /tmp/icons_test && /tmp/icons_test
rm -f /tmp/tokens_test /tmp/icons_test
```
