# Working in `blocksuite/native-playground` (for agents)

This document records the active engineering invariants enforced in CI today alongside the planned contracts for upcoming crates and editor features.

## Active Invariants (enforced now)

### Workspace boundaries
- `crates/ui`: Single fused internal GPU UI library (vendored once without upstream sync hooks, zero internal `proc-macro = true` crates, zero external UI-kit dependencies). It knows **nothing** about BlockSuite or AFFiNE (`scripts/check-invariants.sh` rejects `blocksuite` and `affine` inside `crates/ui`) and embeds zero fonts (fonts are registered by the application via `cx.text_system().add_fonts(...)`).
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

## Planned Contracts (upcoming crates & features)

- **`crates/doc` & `bs-relay`**: Pure CRDT document model (`#![forbid(unsafe_code)]`, zero GUI dependencies) built on `y-octo`, preserving 53-bit `clientId` (`1..=2^53 - 1`), complete flavour schema defaults (0 JS writeback updates on initial load), and top-level Awareness `color` alongside `user` and `selectionV2`.
- **Editor & whiteboard rendering**: `BlockFlow`, `RichParagraph`, `EditorSession`, and world-space content transforms/masks (implemented end-to-end in the GPU shaders) separating world-space document/whiteboard geometry from screen-space GPUI chrome.
- **Variable-font slant axis**: OpenType `'slnt'` (`FontStyle::Italic`) variation-axis shaping and rasterization will be wired alongside rich inline marks.

## Build & verification commands

Always clear inherited root rustflags:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo fmt --all -- --check
CARGO_ENCODED_RUSTFLAGS="" cargo clippy --workspace --all-targets --features harness -- -D warnings
CARGO_ENCODED_RUSTFLAGS="" cargo check -p ui -p playground --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo test --workspace
CARGO_ENCODED_RUSTFLAGS="" cargo test --workspace --features harness
./scripts/check-invariants.sh
```
