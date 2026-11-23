# Working in `packages/backend/` (for agents)

`packages/backend/` is the standalone server-side Rust workspace (`packages/backend/Cargo.toml`, `resolver = "3"`, edition 2024, with its own `Cargo.lock` and `rust-toolchain.toml`, excluding legacy `native/` and `server/`). It does not join the root `Cargo.toml` workspace, so server and test infrastructure build without desktop and N-API dependencies.

## Crates

- `tools/frame-audit`: shared frame snapshot schema (`FrameSnapshot` of `DebugElementSnapshot` with bounds, `content_mask`, opacity, interactivity, radii, `#[track_caller]` callsites, and optional evidence fields) and audit engine (`audit_frame_snapshot`, rule ids in `rules::ALL`). Depends on `serde` only. `blocksuite/native-playground/crates/ui` depends on it by path and re-exports it. Keep both workspaces' tests green when changing it.
- `test-db-harness` (library `test_db_harness`, binary `affine-test-env`): PostgreSQL and Redis harness for server tests.
  - PostgreSQL: an explicit `AFFINE_TEST_PG_URL` is used only when database `postgres` carries the comment `affine-test-cluster`, and maintenance connections verify that marker before running. Otherwise the shared container `affine-test-env-postgres-<digest>` is reused or started on a random loopback port with tmpfs storage and marked. `PgCluster::start_docker` starts a private container removed on drop.
  - Templates: `affine_tpl_<digest>` is built once per migration digest under an advisory lock, records applied migrations in `_prisma_migrations`, and is left read-only (`IS_TEMPLATE`, `ALLOW_CONNECTIONS false`). Each test gets `test_<run>_<seq>` via `CREATE DATABASE ... TEMPLATE`.
  - Leases: every clone has a row in `postgres.public.test_db_leases` with a secret owner token required for heartbeat and release. Cloning, heartbeat, release, and reaping serialize per database on an advisory lock, and the reaper verifies expiry and `pg_stat_activity` before dropping without `FORCE`.
  - Redis: uses `AFFINE_TEST_REDIS_URL` isolated by the `test:<run>:` key prefix, or a private `redis:7-alpine` container.
  - Containers carry `affine.test.env=true` and `affine.test.shared=true|false`. Private containers also carry `affine.test.owner=<run id>`. `Container::remove_owned(id, owner)` removes only a private container owned by that run by its full 64-hex id. Concurrent `ensure_shared` callers converge on one container. `AFFINE_TEST_CONTAINER_CLI` can select a Docker-compatible CLI such as `podman`.
  - `run.json`: `{ run_id, sha, lane, selected_targets, skipped_targets_with_reason, timings_ms, status }`, written by `affine-test-env run-json`.
- `server-types` (library `server_types`): canonical domain types (`DeploymentMode`, `ServerRole`, `LicenseTier`, `Limits`, `Rights`, `AccessGrant`, `DomainError`) and `license` (`LicenseEnvelopeV2` ECDSA P-256 verification, `Keyring` with `community-default-v1` and `pro-v1`, bundled `default-selfhost-10s-100g.license.json`, and fail-closed `OnceLock`-cached `default_selfhost_access_grant()`). No transport frameworks or legacy naming aliases.
- `server-db` (library `server_db`): single `PgPool` (`min_connections = 0`, `after_connect` setting `statement_timeout`, `idle_in_transaction_session_timeout = '10s'`, `application_name = "affine:<channel>:<role>:v2"`), 4-tier bounded `Semaphore` admission (`WorkloadTier`), `with_long_query_timeout`, `dedicated_session_conn`, task-local `with_query_scope` counters, `ensure_schema_ready` (fresh-DB bundled `v0.27.5` baseline seeding or existing-DB baseline verification without mutating `_prisma_migrations`), and isolated `phase_a_compat` compatibility storage adapters.
- `server-spi` (library `server_spi`): canonical SPI traits (`QuotaGate`, `SessionPolicyHook` borrowing `&mut sqlx::Transaction<'_, Postgres>`, `CopilotPolicySpi`, `ServerExtension`) and the default `CommunityExtension` (10-seat / 100 GiB bundled self-host grant, fail-closed on 0-seat readonly).
- `server-http` (library `server_http`): `axum 0.8` and `async-graphql 7` transport layer (`Arc<AppState>` and `ArcSwap<RuntimeConfig>`, role-isolated `/healthz`, `/readyz` with 2 s PG/Redis probe timeouts, `/info`, `/graphql` with `workspace(id)` -> `WorkspaceType`), plus `legacy_compat::{quota, errors}` isolating external GraphQL quota labels and Apollo error extensions at the edge.
- `server-worker` (library `server_worker`): `SessionRedis`-compatible distributed mutex (`MutexLock:<key>` via `SET NX EX` and atomic Lua renew/unlock), `v2:` private keyspace helper, `CancellationToken`, and `WorkerSupervisor` graceful lease drain.
- `affine-server`: single-binary multi-role CLI (`--role front|graphql|worker|script|allinone`, `--port 0`, default `ensure_schema_ready()` startup gate with `--skip-schema-check`) and reusable library entrypoints (`build_server`, `serve_with_extension`, `build_app_and_serve`) accepting any `Arc<dyn ServerExtension>`.

Both test images are pinned to multi-arch index digests in `test-db-harness/src/pg.rs` and `test-db-harness/src/redis.rs`, in `.github/workflows/native-playground.yml`, and in `scripts/ci/check-l0-tier-a.mjs`. Change all three together.

## Rules

- Server-domain crates (`packages/backend/server-domain*`) never depend on `legacy_compat`, `phase_a_compat`, `axum`, or `async-graphql`. Nothing in `packages/backend/` carries private keys, prompt assets, or private-edition table references (`scripts/ci/check-l0-tier-a.mjs`).
- Tests use real services. `cargo test` requires Docker (or `AFFINE_TEST_CONTAINER_CLI`) or both `AFFINE_TEST_*_URL` variables, and never skips silently. Tests share one cluster and run in parallel, so each asserts on its own databases only.

## Verification

Run inside `packages/backend/` (its `rust-toolchain.toml` applies there) with the root NAPI link flags cleared:

```sh
export CARGO_ENCODED_RUSTFLAGS=""
node ../../scripts/ci/check-l0-tier-a.mjs
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

After changing `tools/frame-audit`, also run `cargo test --locked -p ui --features harness` in `blocksuite/native-playground`.
