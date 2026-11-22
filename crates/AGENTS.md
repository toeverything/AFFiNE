# Working in `crates/` (for agents)

`crates/` is the standalone server-side Rust workspace (`crates/Cargo.toml`, `resolver = "3"`, edition 2024, its own `Cargo.lock` and `rust-toolchain.toml`). It never joins the root `Cargo.toml` workspace, so server and test infrastructure build without the desktop and N-API media dependencies.

## Crates

- `frame-audit`: the one frame snapshot schema (`FrameSnapshot` of `DebugElementSnapshot`s with bounds, `content_mask`, opacity, interactivity, radii, `#[track_caller]` callsites, and optional evidence: roles, cursors, text metrics, baseline groups, footer slots, renderer hit-test probes) and its audit engine (`audit_frame_snapshot`, rule ids in `rules::ALL`). Depends on `serde` only. `blocksuite/native-playground/crates/ui` depends on it by path and re-exports it, so the native renderer, headless harnesses and server tooling share one schema; change it with both workspaces' tests green. Evidence rules run only on elements that opt in, and an opted-in element without the evidence its rule needs is a violation. Every rule keeps a failing case in the table in `src/tests.rs`, and snapshots without the evidence fields still load.
- `test-db-harness` (library `test_db_harness`, binary `affine-test-env`): PostgreSQL and Redis for server tests.
  - PostgreSQL: an explicit `AFFINE_TEST_PG_URL` is used only when database `postgres` carries the comment `affine-test-cluster`, and every maintenance connection re-checks it before doing anything. Otherwise the machine-wide container `affine-test-env-postgres-<digest>` is reused or started (loopback random port, tmpfs data, `fsync`/`synchronous_commit`/`full_page_writes` off) and marked; it outlives the process for later runs. `PgCluster::start_docker` gives a private container removed on drop.
  - Templates: `affine_tpl_<digest>` is built once per migration digest under an advisory lock, records the applied migrations in `_prisma_migrations`, and is left read-only (`IS_TEMPLATE`, `ALLOW_CONNECTIONS false`). Each test gets `test_<run>_<seq>` via `CREATE DATABASE ... TEMPLATE`.
  - Leases: every clone has a row in `postgres.public.test_db_leases` with a secret owner token; heartbeat and release need the token. Cloning, heartbeat, release and the reaper serialize per database on an advisory lock (the lease row, the clone and its TTL start are made under it), and the reaper re-checks expiry and `pg_stat_activity` under it before dropping (without `FORCE`), so a database being cloned, renewed or used is never dropped. `PgCluster` and `DbLease` alike reach the cluster only through a maintenance connection that re-checks the marker.
  - Redis: an explicit `AFFINE_TEST_REDIS_URL` isolated by the `test:<run>:` key prefix, or a private `redis:7-alpine` container.
  - Containers carry `affine.test.env=true` and `affine.test.shared=true|false`; private ones also `affine.test.owner=<run id>`. `Container::remove_owned(id, owner)` (used by drop, and by `affine-test-env down` with the `AFFINE_TEST_OWNER` that `up` wrote) removes only a container labeled `affine.test.shared=false` and owned by that non-empty run, named by its full 64-hex id; names, prefixes, unlabeled, foreign, unmarked and shared containers are refused. Concurrent `ensure_shared` callers converge on one container: losers of the name race wait (short backoff, 10 s from their own first lookup or start, so an image pull is not counted) until it runs; a stopped leftover of ours is removed without force and replaced, and a paused or unknown-state one is kept and reported. A Docker-compatible CLI such as `podman` can be named in `AFFINE_TEST_CONTAINER_CLI`.
  - `run.json`: `{ run_id, sha, lane, selected_targets, skipped_targets_with_reason, timings_ms, status }`, written by `affine-test-env run-json`.

Both images are fully qualified and pinned to multi-arch index digests in `src/pg.rs` / `src/redis.rs`, in `.github/workflows/native-playground.yml`, and in `scripts/ci/check-l0-tier-a.mjs`, which fails when they differ; change all three together.

## Rules

- Server-domain crates (`crates/server-domain*`) never depend on `legacy_compat`, `phase_a_compat`, `axum` or `async-graphql`, and nothing in `crates/` carries private keys, prompt assets or private-edition table references (`scripts/ci/check-l0-tier-a.mjs`).
- Tests use real services: `cargo test` needs Docker (or `AFFINE_TEST_CONTAINER_CLI`) or the two `AFFINE_TEST_*_URL` variables, and never skips silently. Tests share one cluster and run in parallel, so each asserts on its own databases only.

## Verification

Run inside `crates/` (its `rust-toolchain.toml` applies there) with the root NAPI link flags cleared:

```sh
export CARGO_ENCODED_RUSTFLAGS=""
node ../scripts/ci/check-l0-tier-a.mjs
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

After changing `frame-audit`, also run `cargo test --locked -p ui --features harness` in `blocksuite/native-playground`.
