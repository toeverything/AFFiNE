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

Scenarios require at least one step. Each side has its own Cookie jar and extracted
variables; `/body/value/...` addresses HTTP JSON values. HTTP bodies retain encoding
labels, including empty, JSON, invalid JSON, text and binary. SSE data and Redis
payloads also retain explicit JSON/raw encodings. Transport headers are
selected explicitly. Cookie attributes are parsed without empty trailing segments.

`http`, `graphql`, `sse` and generic `websocket` requests are native Rust. `socketio`
requests use the real Node SDK over JSON-lines, with polling upgrades, heartbeats,
ACK correlation, push subscriptions and recursive `$b64` binary values. Business
connect_error rejections are structured protocol observations; network failures
and timeouts remain driver errors. Do not add fixed-sleep driver actions. Do not
implement Engine.IO/Socket.IO framing by hand in the generic WebSocket driver.

`dynamic` rules select JSON-pointer regexes with `kind` id, token or ts. ID/token
mappings are bijections across protocol, database and effects. Text normalization
uses tagged literal/symbol segments; literal placeholder text cannot impersonate
an identifier. Timestamps validate scalar type, nullability and RFC3339/nonnegative
numeric format, independently of equality across separate process clocks.

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
