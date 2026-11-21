# Working on AFFiNE Native Playground (for agents)

These rules apply at repository root on the `darksky/native-playground` branch and topic branches under `darksky/np/**`. Subdirectory `AGENTS.md` files (notably `blocksuite/native-playground/AGENTS.md`) state narrower rules beside the code they govern.

## Branch & CI workflow

- **Never merge to `canary`.** Integration lands on `darksky/native-playground` only.
- **PR-less CI on push:** Push topic branches matching `darksky/np/**` (or `darksky/native-playground`) to trigger `.github/workflows/native-playground.yml` directly. `.github/workflows/build-test.yml` ignores `darksky/native-playground` pull requests so unrelated legacy jobs stay silent.
- **Review council gate:** Every topic branch requires at least **3 of 4** review council approvals before squash-landing onto `darksky/native-playground`.
- **Performance regression gate:** Any CI benchmark metric regressing by **more than 10%** against the rolling `N-3` baseline is routed to the dedicated performance guardian before landing.
- **Cargo rustflags isolation:** Root `.cargo/config.toml` injects NAPI linker flags (`-all_load`, `-undefined dynamic_lookup`, `-z nodelete`) that Cargo concatenates into nested workspaces. Always build and test `blocksuite/native-playground` with `CARGO_ENCODED_RUSTFLAGS=""` in the environment.

## Keeping rules true

- When a change makes any statement, path, command, or invariant in an `AGENTS.md` file inaccurate, update that `AGENTS.md` in the same commit.
- A new directory with rules of its own gets an `AGENTS.md` and a one-line `CLAUDE.md` containing `@AGENTS.md`.
- Keep code, comments, workflows, `AGENTS.md`, and commit messages free of internal process-journal jargon.
