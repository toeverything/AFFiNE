# Working in `packages/backend/` (for agents)

`packages/backend/` is the standalone server-side Rust workspace.
It uses `packages/backend/Cargo.toml`, `resolver = "3"`, edition 2024, and its own `Cargo.lock` and `rust-toolchain.toml`.
It excludes `native/` and `server/` and does not join the root `Cargo.toml` workspace.

## Crates

- `tools/frame-audit`: shared frame snapshot schema (`FrameSnapshot`, `DebugElementSnapshot`) and audit engine (`audit_frame_snapshot`, `rules::ALL`).
  It depends on `serde` only.
  `blocksuite/native-playground/crates/ui` depends on it by path and re-exports it.
  Keep both workspaces' tests green when you change it.

- `test-db-harness` (library `test_db_harness`, binary `affine-test-env`): PostgreSQL and Redis harness for server tests.

  - PostgreSQL: `AFFINE_TEST_PG_URL` works only when database `postgres` carries the comment `affine-test-cluster`.
    Otherwise the harness reuses or starts `affine-test-env-postgres-<digest>` on a random loopback port with tmpfs storage.
    `PgCluster::start_docker` starts a private container and removes it on drop.

  - Templates: the harness builds `affine_tpl_<digest>` once per migration digest under an advisory lock and marks it read-only.
    Each test leases `test_<run>_<seq>` via `CREATE DATABASE ... TEMPLATE`.

  - Leases: every clone stores a row in `postgres.public.test_db_leases` with a secret owner token.
    Cloning, heartbeat, release, and reaping serialize per database on an advisory lock.
    The reaper checks expiry and `pg_stat_activity` before it drops a database without `FORCE`.

  - Redis: tests use `AFFINE_TEST_REDIS_URL` with a `test:<run>:` prefix, or start a private `redis:7-alpine` container.

  - Containers carry `affine.test.env=true` and `affine.test.shared=true|false`, plus `affine.test.owner=<run id>` on private containers.
    `Container::remove_owned(id, owner)` removes only a private container that matches that owner and full 64-hex id.
    `AFFINE_TEST_CONTAINER_CLI` selects a Docker-compatible CLI such as `podman`.

  - `run.json`: `affine-test-env run-json` writes `{ run_id, sha, lane, selected_targets, skipped_targets_with_reason, timings_ms, status }`.

- `server-types` (library `server_types`): canonical domain types (`DeploymentMode`, `ServerRole`, `LicenseTier`, `Limits`, `Rights`, `AccessGrant`, `DomainError`).
  It also holds `license` (`LicenseEnvelopeV2` P-256 verification, `Keyring`, bundled `default-selfhost-10s-100g.license.json`, and `default_selfhost_access_grant()`).

- `server-db` (library `server_db`): single `PgPool` with `min_connections = 0`, `statement_timeout`, `idle_in_transaction_session_timeout = '10s'`, and `application_name = "affine:<channel>:<role>:v2"`.
  It exports `WorkloadTier` admission, `with_long_query_timeout`, `dedicated_session_conn`, `with_query_scope`, `ensure_schema_ready`, `SessionRepository`, and `phase_a_compat::sessions::PhaseASessionRepository`.

- `server-spi` (library `server_spi`): SPI traits (`QuotaGate`, `SessionPolicyHook`, `CopilotPolicySpi`, `ServerExtension`) and `CommunityExtension`.

- `server-domain` (library `server_domain`): pure domain services (`AuthService`, `UserService`, `WorkspaceService`, `AppConfigService`) plus `EventBusPublisher`, `InvalidationPublisher`, and `InvalidationHintV1`.
  It has no `legacy_compat`, `phase_a_compat`, `axum`, or `async-graphql` dependencies.

- `server-mail` (library `server_mail`): 30 compiled `v0.27.5` HTML email templates, `SmtpMailer` (`lettre` + `rustls`), and `process_ready_mail_deliveries`.
  The worker filters direct-render rows, releases unsupported leases cleanly, reaps expired rows, redacts PII in errors, and anonymizes terminal rows.

- `server-blob` (library `server_blob`): `BlobStorageBackend` (`LocalFsBlobStorage`, `S3BlobStorage`) and `BlobService` over `public.blobs`.
  Writes and deletes hold `StorageOperation` session advisory locks outside the `PgPool`.
  `list_blobs_authorized`, `delete_blob_authorized`, and `release_deleted_blobs_authorized` require `Owner` or commercial-grant `Admin` plus `!users.disabled` in one transaction.
  `put_blob` reserves under `workspaces ... FOR UPDATE`, checks `QuotaGate::resolve_workspace_grant`, writes the object, and completes its reservation.
  Storage failures surface only as `Unavailable("blob storage unavailable")`.

- `server-sync` (library `server_sync`): pure-Rust Engine.IO v4 / Socket.IO v4 sync gateway mounted at `/socket.io/`.
  It handles `y-octo` CRDT validation, merge, and diff over PostgreSQL, isolated `legacy_compat::errors`, and Redis `affine:eventbus:v1` / invalidation bridging.

- `server-http` (library `server_http`): `axum 0.8` and `async-graphql 7` transport layer with `/healthz`, `/readyz`, `/info`, auth REST routes, and `/graphql`.
  Blob management mutations require `Owner` or commercial-grant `Admin`.
  `legacy_compat::{quota, errors}` isolates external GraphQL quota labels and Apollo error extensions.

- `server-worker` (library `server_worker`): `SessionRedis`-compatible mutex (`MutexLock:<key>` via `SET NX EX` and Lua renew/release), `v2:` keyspace helper, `CancellationToken`, and `WorkerSupervisor`.

- `affine-server`: single-binary multi-role CLI (`--role front|graphql|worker|script|allinone`, `SERVER_FLAVOR`, `--port 0`, `ensure_schema_ready()`, `spawn_mail_delivery_worker`, `/socket.io/`).
  It exports `build_server`, `serve_with_extension`, and `build_app_and_serve` for any `Arc<dyn ServerExtension>`.

Pin both test images to multi-arch index digests in `test-db-harness/src/pg.rs`, `test-db-harness/src/redis.rs`, `.github/workflows/native-playground.yml`, and `scripts/ci/check-l0-tier-a.mjs`.
Change all four places together.

## Rules

- Server-domain crates (`packages/backend/server-domain*`) never depend on `legacy_compat`, `phase_a_compat`, `axum`, or `async-graphql`.
  Nothing in `packages/backend/` carries private keys, prompt assets, or private-edition table references (`scripts/ci/check-l0-tier-a.mjs`).

- Tests use real services.
  `cargo test` requires Docker (or `AFFINE_TEST_CONTAINER_CLI`) or both `AFFINE_TEST_*_URL` variables, and never skips silently.
  Tests share one cluster and run in parallel, so each asserts on its own databases only.

## Verification

Run inside `packages/backend/` with the root NAPI link flags cleared:

```sh
export CARGO_ENCODED_RUSTFLAGS=""
node ../../scripts/ci/check-l0-tier-a.mjs
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

After you change `tools/frame-audit`, also run `cargo test --locked -p ui --features harness` in `blocksuite/native-playground`.
