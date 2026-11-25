# Working in `packages/frontend/` (for agents)

`packages/frontend/` holds the client Rust Cargo workspace (`Cargo.toml` and `Cargo.lock`) alongside legacy TypeScript frontend packages.
It uses `resolver = "3"`, edition 2024, and its own `rust-toolchain.toml` (`1.98.1` with `wasm32-unknown-unknown`) and `rustfmt.toml`.

## Workspace boundaries and four-domain guards

- `packages/frontend/Cargo.toml` lists every client member crate explicitly (`../ui/tokens`, `../ui/ui`, `../ui/kit`, `../common/store`, `../../blocksuite/crates/doc`, `../../blocksuite/crates/editor`, `../../blocksuite/crates/playground`, `../../blocksuite/crates/preview`, `hosts/android`, and `hosts/ios`).
  Never use directory wildcards that can scan asset directories.
- `packages/frontend/Cargo.toml` excludes `native` and `mobile-native`.
  Those legacy crates remain members of the root `Cargo.toml` workspace.
- Legacy directories (`native/`, `mobile-native/`, and `apps/`) carry a `1.97.1` `rust-toolchain.toml` file that matches the repository root byte-for-byte.
  `native/` and `mobile-native/` also carry a `rustfmt.toml` file that matches the repository root byte-for-byte.
- Client trees (`packages/frontend/`, `packages/ui/`, `blocksuite/crates/`, and `packages/common/store/`) share byte-identical `1.98.1` `rust-toolchain.toml` and client `rustfmt.toml` files.
- `scripts/check-invariants.sh` discovers client workspace members from `cargo metadata --locked --no-deps`, enforces four-domain acyclic dependencies (zero reverse edges), checks domain isolation, wall-clock isolation, zero tester branches, module structure, LOC ceilings, toolchain/rustfmt alignment, `workspace_root` resolution, `rustup show active-toolchain` for legacy (`1.97.1`) and client (`1.98.1`) directories, workflow YAML validity, and `CARGO_ENCODED_RUSTFLAGS=""` link-flag isolation.
- See `packages/ui/AGENTS.md`, `blocksuite/crates/AGENTS.md`, and `packages/common/store/AGENTS.md` for domain-specific invariants.

### Performance guardrail and theme/style oracle

- **`perf/` (`schema.json`, `accepted.json`, `compare-n3.mjs`, `compare-n3.test.mjs`)**: Zero-dependency rolling `N-3` CI comparator with strict schema validation and rerun history anchoring (`--run-id` `created_at` cutoff + pagination). Deterministic byte sizes (`artifacts_bytes.*`), work counters (non-`_ms` `benchmarks.*`), and unacknowledged `DROPPED` / `--require-n3` `BOOTSTRAP` metrics are hard-gated (`--fail-on-regression` exits `1`); shared-runner wall-clock timings (`benchmarks.*_ms` at `> 10%`, `ci_wall_ms.*` at `> 10%` and `> 15_000 ms`) are report-only `ADVISORY_SLOWDOWN`. Intentional changes are acknowledged in `packages/frontend/perf/accepted.json` via `action: "ceiling"` (`{ metric, accepted_value, reason }`), `action: "bootstrap"` (newly added metrics under `--require-n3`), or `action: "drop"` (retired metrics), with report-only `stale_acceptances` once the rolling `N-3` baseline catches up. Unmeasured sub-keys are omitted or `null` (never padded with synthetic `0`s).

## Build & verification commands

Always clear inherited root rustflags:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo fmt --all -- --check
CARGO_ENCODED_RUSTFLAGS="" cargo clippy --locked --workspace --all-targets --features harness -- -D warnings
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p ui-tokens -p ui -p ui-kit -p blocksuite-editor -p playground --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p blocksuite-playground-doc --no-default-features --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-store --no-default-features --target wasm32-unknown-unknown
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked --workspace
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked --workspace --features harness
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- render --theme dark --mode page --out frame.png --snapshot frame.json
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- probes
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- bench --json perf-metrics.json
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- render-surface-sample --theme light --out surface-light.png --snapshot surface-light.json
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- render-editor artifacts/editor
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- render --state slash_menu_open --out slash.png --snapshot slash.json
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- audit-states
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- fps-check
CARGO_ENCODED_RUSTFLAGS="" cargo run --locked --bin bs-harness --features harness -- record-demo artifacts/demo
./scripts/check-invariants.sh
node --test perf/compare-n3.test.mjs
node ../ui/tokens/extract-tokens.mjs --check
rustc --edition 2024 --test -D warnings ../ui/tokens/tokens.rs -o /tmp/tokens_test && /tmp/tokens_test
rustc --edition 2024 --test -D warnings ../ui/tokens/icons.rs -o /tmp/icons_test && /tmp/icons_test
rm -f /tmp/tokens_test /tmp/icons_test
```
