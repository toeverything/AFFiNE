# Server differential replay harness

This directory is an independent Rust workspace.
Keep all code and tests here.
Do not change the repository Cargo workspace or server code for tests.
Use the root immutable Yarn install for the real `socket.io-client@4.8.3` bridge and reference server.
`AFFINE_NODE_MODULES_ROOT` can name that checkout.

```sh
CARGO_ENCODED_RUSTFLAGS='' cargo fmt --manifest-path tools/parity-harness/Cargo.toml --all -- --check
CARGO_ENCODED_RUSTFLAGS='' cargo clippy --manifest-path tools/parity-harness/Cargo.toml --workspace --all-targets -- -D warnings
CARGO_ENCODED_RUSTFLAGS='' cargo test --manifest-path tools/parity-harness/Cargo.toml --workspace -- --nocapture
```

`parity-harness SCENARIO [REPORT]` replays against live targets.
`parity-harness compare SCENARIO RECORDED [REPORT]` re-compares the `left` and `right` sides of a written report offline with the same rules and order.

Scenarios require at least one step.
Each side keeps its own Cookie jar and extracted variables.
`/body/value/...` addresses HTTP JSON values.
HTTP bodies keep encoding labels, including empty, JSON, invalid JSON, text, and binary.
SSE data and Redis payloads also keep explicit JSON or raw encodings.
Select transport headers explicitly, and parse cookie attributes without empty trailing segments.

`http`, `graphql`, `sse`, and generic `websocket` requests run in native Rust.
`socketio` requests use the real Node SDK over JSON-lines with polling upgrades, heartbeats, ACK correlation, push subscriptions, and recursive `$b64` binary values.
`record_events` limits which pushed events appear in reports, and `wait_event` sees all pushed events.
Business `connect_error` rejections count as structured protocol observations, while network failures and timeouts stay driver errors.
Do not add fixed-sleep driver actions.
Do not write EngineIO or SocketIO framing by hand in the generic WebSocket driver.

`dynamic` rules select JSON-pointer regexes with `kind` `id`, `token`, or `ts`.
ID and token maps form bijections across protocol, database, and effects.
Text normalization uses tagged literal and symbol segments so literal placeholder text cannot impersonate an identifier.
Timestamps check scalar type, nullability, and RFC 3339, RFC 2822 (HTTP date), or nonnegative numeric format on both sides.
Timestamp format checks stay independent of clock equality across separate processes.

Snapshot every user table, including empty tables, in one read-only repeatable-read transaction.
`ignore_tables` defaults to `_prisma_migrations` and `native_schema_migrations`, and accepts explicit qualified names.
Row pairing sorts with non-dynamic business fields and known symbols, then maps unknown dynamic values bijectively afterward.
Tests can inject `SnapshotSource` in memory.
Never add HTTP test-export endpoints or config fields to target services.

Use isolated disposable targets, separate Redis servers, and plaintext local test SMTP and PG transports.
SMTP records canonical envelope addresses, Subject, and both HTML and plain MIME parts.
`expected_smtp_count` bounds the wait for asynchronous mail, and accepted connections must finish before snapshot.

Redis subscribes before replay and fences its stream on a private marker after the final ordered scenario step.
Asynchronous producers must expose completion through a scenario operation or an expected mail count.
Do not replace protocol completion with a guessed sleep.
Transport latency must never silently drop published messages, and capture failures return errors instead of empty-success fallbacks.

## Requirements

`require` lists checks (`equals`, `length`, `contains` a JSON subset) that each side must pass on its own.
Pointers target `/protocol/<index>/...`, `/database/<schema.table>`, `/effects/smtp`, or `/effects/redis`.
An unmet check reports a difference at `/require/<side><pointer>`, so two sides failing the same way never pass.
Live runs and `compare` apply these checks alike, and `compare` rejects scenarios without steps.

## Real v0.27.5 self-parity

`scripts/run-v0275-self-parity.mjs` boots two `@affine/server` instances from `--server-root` (default this checkout, frozen baseline `darksky/before-stable-fix`).
That checkout needs `yarn install`, a built `server-native.node`, and `prisma generate`.
`affine-test-env` and the harness always come from this checkout, using Docker or `AFFINE_TEST_CONTAINER_CLI=podman`.

Each run writes to `--out` (default `.artifacts/v0275-self-parity`).
Each side gets a leased migration template clone, Redis container, SMTP port, and `HOME`.
Both sides share one signing key and external URL.
The script runs data migrations, `validate-cutover`, and `activate-workspace-lifecycle`.

It replays `scenarios/v0275-self-parity.json` (`/info`, GraphQL setup, auth, workspace, quota, SocketIO doc join/push/load with acks only, and one real test mail).
It requires 0 differences and every `require` check (doc stored, `schema_baseline_0275` checkpoint, one mail, invalidation, and event bus Redis messages).
It then injects one tampered right database row and one tampered recorded GraphQL field and checks exact diff paths.
Cleanup failures fail the run.

Only a passing run writes `--record FILE` atomically with the server SHA (`--server-sha` or git) and both sides.
`tests/fixtures/v0275-self-parity.recorded.json` holds that recording of the frozen baseline.
`tests/v0275_self_parity.rs` replays it offline, injects one change per dimension, and checks that shared failures fail requirements.
Re-record it when the scenario or baseline changes.
Dynamic rules cover only per-process values.
These values include identifiers, timestamps, cookie and session tokens, salted password hashes, generated signing secrets, and instance ports.

## Live `v0.27.5` vs `affine-server` parity and coexistence

`scripts/run-v0275-vs-vnew-parity.mjs` checks the frozen `@affine/server` checkout (`--server-root`, default SHA `c2929acf2d24456c40c2df164e068d1d3d59d7fd`, clean git tree).
It writes the candidate `affine-server` SHA-256 and repo HEAD to `summary.json`.
It then runs three live checks against identical `v0.27.5` predeploy baselines (`run`, `validate-cutover`, `activate-workspace-lifecycle`):

- **Core HTTP, GraphQL, blob, mail, and sync replay**: replay `scenarios/v0275-vs-vnew-parity.json` (23 steps) and require 0 differences.
  The auth and profile steps cover `/info`, setup, `set-cookie`, CSRF sign-out negative and positive, password sign-in, `currentUser`, and `updateProfile`.
  The workspace and blob steps cover `createWorkspace`, `workspaces`, `updateWorkspace`, `createInviteLink`, `revokeInviteLink`, and multipart `setBlob`.
  They also check legacy `GET /api/workspaces/:id/blobs/:name` `403 UNSUPPORTED_CLIENT_VERSION`.
  The remaining steps cover storage quota, SocketIO `doc_sync`, `deleteBlob`, `releaseDeletedBlobs`, `appConfig`, and `sendTestEmail`.
  Adjacent-window `collapse_redis_invalidation_echoes` clears across non-echo boundaries like `sync.doc.updates.pushed`, and checks `originChannel` (`"production"` vs `"v2:production"`).

- **Magic-Link end-to-end delivery and database snapshot diff**: start dual-side local SMTP capture servers and call `POST /api/auth/sign-in` on both servers.
  Wait for both workers to send the Magic-Link email and finalize `mail_deliveries` to `sent` or `anonymized`.
  Extract the 6-digit OTP from each captured email body and assert identical subjects.
  Complete `POST /api/auth/magic-link`, `GET /api/auth/session`, and CSRF `POST /api/auth/sign-out`.
  Diff 97-table PostgreSQL snapshots with 0 differences, then run live DB row and recorded GraphQL fault injections.
  Exclude `_prisma_migrations`, `native_schema_migrations`, `runtime_rolling_quota_counters`, `storage_reconciliation_checkpoints`, and `sync_active_users_minutely` from the snapshot diff.

- **Shared-database and shared-Redis live coexistence**: boot both servers on one shared PostgreSQL 16 database and one shared Redis 7 instance.
  Verify bidirectional real-time SocketIO `space:broadcast-doc-updates`, `space:broadcast-doc-invalidation`, and `space:load-doc` convergence with distinct incremental Yjs updates and equal state vectors.
