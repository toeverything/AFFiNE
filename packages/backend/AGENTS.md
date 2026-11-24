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

- `server-types` (library `server_types`): canonical domain types (`DeploymentMode`, `ServerRole`, `LicenseTier`, `BillingSubject`, `Limits`, `Rights`, `AccessGrant`, `DomainError`).
  It also holds `license` (`LicenseEnvelopeV2` P-256 verification, `Keyring`, bundled `default-selfhost-10s-100g.license.json`, and `default_selfhost_access_grant()`).

- `server-db` (library `server_db`): single `PgPool` with `min_connections = 0`, `statement_timeout`, `idle_in_transaction_session_timeout = '10s'`, and `application_name = "affine:<channel>:<role>:v2"`.
  It exports `WorkloadTier` admission, `with_long_query_timeout`, `dedicated_session_conn`, `with_query_scope`, `ensure_schema_ready`, `SessionRepository`, and `phase_a_compat::sessions::PhaseASessionRepository`.

- `server-spi` (library `server_spi`): SPI traits (`QuotaGate`, `SessionPolicyHook`, `CopilotPolicySpi`, `RateLimitPolicy`, `BillingSpi`, `ServerExtension`), `RequestSource`, `CommunityRateLimitPolicy`, `CommunityBillingSpi`, and `CommunityExtension`.

- `server-domain` (library `server_domain`): pure domain services (`AuthService`, `UserService`, `WorkspaceService`, `DocSharingService`, `DocHistoryService`, `CommentService`, `NotificationService`, `SelfhostLicenseService`, `AppConfigService`, and `acl`) plus `EventBusPublisher`, `InvalidationPublisher`, and `InvalidationHintV1`.
  `AuthService` handles HS256 access tokens, `aff_rt_v1` refresh rotation, recovery, grace, preflight, and session cleanup.
  `acl` defines workspace and document permissions and classifies reserved documents.
  `server-domain` has no `legacy_compat`, `phase_a_compat`, `axum`, or `async-graphql` dependencies.

- `server-mail` (library `server_mail`): 30 compiled `v0.27.5` HTML email templates, `SmtpMailer` (`lettre` + `rustls`), and `process_ready_mail_deliveries`.
  The worker filters direct-render rows, releases unsupported leases cleanly, reaps expired rows, redacts PII in errors, and anonymizes terminal rows.

- `server-blob` (library `server_blob`): `BlobStorageBackend` (`LocalFsBlobStorage`, `S3BlobStorage`), `BlobService` over `public.blobs`, and `refs` (`y-octo` source-scoped blob reference extraction and cursor-paginated readable manifests).
  Writes and deletes hold `StorageObjectLock` session advisory locks outside the `PgPool`.
  `list_blobs_authorized`, `delete_blob_authorized`, and `release_deleted_blobs_authorized` require `Owner` or commercial-grant `Admin` plus `!users.disabled` in one transaction.
  `put_blob` reserves under `workspaces ... FOR UPDATE`, checks `QuotaGate::resolve_workspace_grant`, writes the object, and completes its reservation.
  Storage failures surface only as `Unavailable("blob storage unavailable")`.

- `server-sync` (library `server_sync`): pure-Rust Engine.IO v4 / Socket.IO v4 sync gateway mounted at `/socket.io/`.
  It validates, merges, and diffs `y-octo` CRDTs over PostgreSQL under `pg_advisory_xact_lock`, delegates reserved-doc classification and doc-role resolution to `server_domain::acl`, and serves realtime rooms (`workspace.access`, `workspace.config`, `doc.share-state`, `doc.grants`, `comment.changed`, `comment.changes`, `user.settings`, `notification.count`).
  With `SessionRedis` active, userspace writes hold `MutexLock:userspace:<user_id>:<doc_id>` across the PostgreSQL transaction and release it via Lua.
  Empty-table creates use `ON CONFLICT DO NOTHING` with a merge fallback, and commits check the `SessionRedis` lease fence.
  Unmodified `v0.27.5` instances skip pre-commit lock checks after a 60s stall, so patch `canary` separately for legacy fencing.
  It isolates `legacy_compat::errors` and bridges Redis `affine:eventbus:v1` and invalidation events.

- `server-http` (library `server_http`): `axum 0.8` and `async-graphql 7` transport layer with `/healthz`, `/readyz`, `/info`, and `/graphql`.
  Auth REST routes cover cookie/bearer sign-in, Open-App (`/api/auth/open-app/sign-in-code`, `/api/auth/open-app/sign-in`), and native sessions (`/api/auth/session/exchange`, `/api/auth/session/refresh`, `/api/auth/session/revoke`, `/api/auth/sessions`, `/api/auth/sessions/revoke-all`, `/api/auth/sessions/:id`).
  Storage REST routes cover avatars (`/api/avatars/:id`), public docs (`/api/workspaces/:id/public-docs/:docId`, `/root-doc`), doc histories (`/api/workspaces/:id/docs/:guid/histories/:timestamp`), comment attachments (`/api/workspaces/:id/docs/:docId/comment-attachments/:key`), and source-scoped blobs (`/api/workspaces/:id/blobs/v1/:name`, `blob-manifest/v1`, `readable-blob-manifest/v1`, doc snapshot read).
  Blob management mutations require `Owner` or commercial-grant `Admin`.
  `legacy_compat::{quota, errors}` isolates external GraphQL quota labels and Apollo error extensions.

- `server-worker` (library `server_worker`): `SessionRedis`-compatible mutex (`MutexLock:<key>` with atomic Lua lock, renew, fence, and release using millisecond `PX` TTL), `v2:` keyspace helper, `CancellationToken`, `run_with_distributed_lock`, `spawn_locked_periodic_task`, and `WorkerSupervisor`.

- `affine-server`: single-binary multi-role CLI (`--role front|graphql|worker|script|allinone`, `SERVER_FLAVOR`, `--port 0`, `ensure_schema_ready()`, `spawn_mail_delivery_worker`, expired-session cleanup worker, avatar storage, `/socket.io/`).
  It exports `build_server`, `serve_with_extension`, `serve_with_extension_and_init`, and `build_app_and_serve` for any `Arc<dyn ServerExtension>`.

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
