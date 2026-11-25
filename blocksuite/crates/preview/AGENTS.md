# Working in `blocksuite/crates/preview` (for agents)

This crate implements the pure-Rust offline block preview kernel (`blocksuite-preview`).

## Scope and isolation

- Keep `blocksuite-preview` free of GUI, network, and OS blocking I/O dependencies. `math`, `mermaid`, and `pdf` stay pure safe Rust with zero `cc` build scripts; on native targets only, `typst` pulls `stacker -> psm` (a small stack-probe assembly stub via `cc`, unused on `wasm32-unknown-unknown`).
- Keep `#![forbid(unsafe_code)]` enabled in `src/lib.rs`.
- Never call `load_system_fonts()`, `Instant::now()`, `SystemTime::now()`, or local wall-clock APIs in crate code.
- Pass calendar dates and timezone offsets through explicit parameters (`PreviewDate` and `timezone_offset_minutes`).
- Keep `mermaid`, `math`, `typst`, `pdf`, and `wasm-worker` Cargo features independently buildable for native and `wasm32-unknown-unknown`.

## Module layout and limits

- Keep every `.rs` file at or below 800 non-test lines.
- Do not use `super::super::` outside `#[cfg(test)] mod tests`.
- Do not keep `<name>.rs` beside a `<name>/` directory.
- Declare every `.rs` file under `src/` with a `mod` statement so no orphan file exists.
- Keep unit tests table-driven and deterministic without host system fonts.

## Verification commands

Always clear inherited root rustflags before running Cargo commands:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo fmt --all -- --check
CARGO_ENCODED_RUSTFLAGS="" cargo clippy --locked --all-targets --all-features -- -D warnings
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked --all-features
CARGO_ENCODED_RUSTFLAGS="" cargo build --locked --target wasm32-unknown-unknown --release --no-default-features --features mermaid,wasm-worker
CARGO_ENCODED_RUSTFLAGS="" cargo build --locked --target wasm32-unknown-unknown --release --no-default-features --features math,wasm-worker
CARGO_ENCODED_RUSTFLAGS="" cargo build --locked --target wasm32-unknown-unknown --release --no-default-features --features typst,wasm-worker
CARGO_ENCODED_RUSTFLAGS="" cargo build --locked --target wasm32-unknown-unknown --release --no-default-features --features pdf,wasm-worker
```
