# Server differential replay harness

This directory is an independent Rust workspace. Keep all code and tests here;
do not change the repository Cargo workspace or server implementation for tests.
Use the root immutable Yarn installation for the real `socket.io-client@4.8.3`
bridge and reference server. `AFFINE_NODE_MODULES_ROOT` may name that checkout.

```sh
CARGO_ENCODED_RUSTFLAGS='' cargo fmt --manifest-path tools/parity-harness/Cargo.toml --all -- --check
CARGO_ENCODED_RUSTFLAGS='' cargo clippy --manifest-path tools/parity-harness/Cargo.toml --workspace --all-targets -- -D warnings
CARGO_ENCODED_RUSTFLAGS='' cargo test --manifest-path tools/parity-harness/Cargo.toml --workspace -- --nocapture
```

`parity-harness SCENARIO [REPORT]` replays against live targets;
`parity-harness compare SCENARIO RECORDED [REPORT]` re-compares the `left` and
`right` sides of a written report offline with the same rules and order.

Scenarios require at least one step. Each side has its own Cookie jar and extracted
variables; `/body/value/...` addresses HTTP JSON values. HTTP bodies retain encoding
labels, including empty, JSON, invalid JSON, text and binary. SSE data and Redis
payloads also retain explicit JSON/raw encodings. Transport headers are
selected explicitly. Cookie attributes are parsed without empty trailing segments.

`http`, `graphql`, `sse` and generic `websocket` requests are native Rust. `socketio`
requests use the real Node SDK over JSON-lines, with polling upgrades, heartbeats,
ACK correlation, push subscriptions (`record_events` limits which pushed events
are reported; `wait_event` sees all) and recursive `$b64` binary values. Business
connect_error rejections are structured protocol observations; network failures
and timeouts remain driver errors. Do not add fixed-sleep driver actions. Do not
implement Engine.IO/Socket.IO framing by hand in the generic WebSocket driver.

`dynamic` rules select JSON-pointer regexes with `kind` id, token or ts. ID/token
mappings are bijections across protocol, database and effects. Text normalization
uses tagged literal/symbol segments; literal placeholder text cannot impersonate
an identifier. Timestamps validate scalar type, nullability and RFC 3339, RFC 2822
(HTTP date) or nonnegative numeric format, the same format on both sides,
independently of equality across separate process clocks.

Snapshot every user table, including empty tables, in a read-only repeatable-read
transaction. `ignore_tables` defaults to `_prisma_migrations` and
`native_schema_migrations`; explicit qualified names are supported. Row pairing
sorts with non-dynamic business fields and known symbols; unknown dynamic values
become placeholders only for sorting and are bijectively compared afterward.
Tests may inject `SnapshotSource` in memory; never add HTTP test-export endpoints
or configuration fields to target services.

Use isolated disposable targets/databases, separate Redis server endpoints and
plaintext local test SMTP/PG transports. SMTP records canonical envelope addresses,
Subject and both HTML/plain MIME parts. `expected_smtp_count` bounds the wait for
asynchronous mail; in-flight accepted connections must finish before snapshot.
Redis subscribes before replay and fences its stream on a private marker, storing
an immutable snapshot at that marker. The fence follows the final ordered scenario step. Asynchronous producers must
expose completion through a scenario operation or an expected mail count; do not
replace protocol completion with a guessed sleep. Transport latency must never
silently drop already published messages. Capture failures are errors, never empty-success fallbacks.

## Requirements

`require` lists checks each side must pass on its own (`equals`, `length`,
`contains` a JSON subset) at a pointer into that side's observations
(`/protocol/<index>/...`, `/database/<schema.table>`, `/effects/smtp`,
`/effects/redis`). An unmet one is a difference at `/require/<side><pointer>`,
so two sides failing the same way are never green. Live runs and `compare`
apply them alike; `compare` also rejects scenarios without steps.

## Real v0.27.5 self-parity

`scripts/run-v0275-self-parity.mjs` boots two `@affine/server` instances of the
checkout named by `--server-root` (default this one; the frozen baseline is
`darksky/before-stable-fix`), which needs `yarn install`, a built
`server-native.node` and `prisma generate`; `affine-test-env` and the harness
always come from this checkout. Docker or `AFFINE_TEST_CONTAINER_CLI=podman`.
Each run gets its own directory under `--out` (default
`.artifacts/v0275-self-parity`); each side gets a leased clone of the
migration template, its own Redis container, SMTP capture port and HOME, with
one shared signing key and external URL. It runs the data migrations,
`validate-cutover` and `activate-workspace-lifecycle`, replays
`scenarios/v0275-self-parity.json` (`/info`, GraphQL setup/auth/workspace/
quota, Socket.IO doc join/push/load with acks only, since its invalidation
pushes race cluster echoes of background work, a real test mail) and requires 0
differences and every `require` check (doc accepted and stored,
`schema_baseline_0275` checkpoint, one mail, invalidation and event bus Redis
messages), then a tampered right database row and a tampered recorded GraphQL
field each reported at exactly their paths. Cleanup failures fail the run.
Only a passing run writes `--record FILE` (atomically): the server SHA (from
git, or `--server-sha`) and both sides.
`tests/fixtures/v0275-self-parity.recorded.json` is such a recording of the
frozen baseline; `tests/v0275_self_parity.rs` replays it offline, injects one
change per dimension and checks that both sides losing the same results fail
their requirements. Re-record it when the scenario or the baseline changes.
Dynamic rules in the scenario cover only per-process values: identifiers,
timestamps, cookie and session tokens, salted password hashes, generated
signing secrets and the instances' own ports.
