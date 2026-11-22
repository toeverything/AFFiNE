# Working on AFFiNE Native Playground (for agents)

These rules apply at repository root on the `darksky/native-playground` branch and topic branches under `darksky/np/**`. Subdirectory `AGENTS.md` files (notably `blocksuite/native-playground/AGENTS.md`) state narrower rules beside the code they govern.

## Branch & CI workflow

- **Never merge to `canary`.** Integration lands on `darksky/native-playground` only.
- **PR-less CI on push:** Push topic branches matching `darksky/np/**` (or `darksky/native-playground`) to trigger `.github/workflows/native-playground.yml` directly. `.github/workflows/build-test.yml` ignores `darksky/native-playground` pull requests so unrelated legacy jobs stay silent.
- **Review council gate:** Every topic branch requires at least **3 of 4** review council approvals before squash-landing onto `darksky/native-playground`.
- **Performance regression gate:** Any CI benchmark metric regressing by **more than 10%** against the rolling `N-3` baseline is routed to the dedicated performance guardian before landing.
- **Cargo rustflags isolation:** Root `.cargo/config.toml` injects NAPI linker flags (`-all_load`, `-undefined dynamic_lookup`, `-z nodelete`) that Cargo concatenates into nested workspaces. Always build and test `blocksuite/native-playground` and the standalone `crates/` workspace with `CARGO_ENCODED_RUSTFLAGS=""` in the environment.
- **Static gates and fast lanes:** `node scripts/ci/check-l0-tier-a.mjs` (no dependencies, under a second) guards `crates/` layering and hygiene, the `waitForTimeout` / `.skip` ratchet in `scripts/ci/l0-ratchet.json` (counts may only go down; lower the ceiling with `--update-baseline`), and workflow references. `native-playground.yml` always runs it with the frozen server contract checks (`scripts/oracle`), the `crates/` checks and the `tools/parity-harness` checks, and calls `np-web-fast.yml` (lint, typecheck, Node-only Vitest projects) only when web sources change and `np-web-build.yml` (production bundles of `@affine/web`, `@affine/mobile` and `@affine/admin`, no Electron/Playwright downloads, eight minutes per bundle) only when frontend sources change.

## Engineering & testing principles

- **Global optimum over band-aid patches**: Favor clean structural refactoring and bold deletion over minimal-diff workarounds, defensive clutter, or over-abstraction. Delete obsolete helpers, structs, and files outright, and fold single-caller one-way fragments back into their caller when they add indirection without clarity.
- **Test names match actual scope**: Every test file and test function name must accurately reflect everything it asserts — never append unrelated assertions to a narrowly named test without renaming it to match.
- **Table-driven tests**: Group related scenarios (geometry/hit-testing, parsers, key sequences, IME cases) into concise table-driven loops rather than proliferating near-identical `#[test]` functions.

## Keeping rules true

- When a change makes any statement, path, command, or invariant in an `AGENTS.md` file inaccurate, update that `AGENTS.md` in the same commit.
- A new directory with rules of its own gets an `AGENTS.md` and a one-line `CLAUDE.md` containing `@AGENTS.md`.
- Keep code, comments, workflows, `AGENTS.md`, and commit messages free of internal process-journal jargon.
