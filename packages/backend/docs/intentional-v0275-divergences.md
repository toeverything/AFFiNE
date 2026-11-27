# Intentional Divergences from Node v0.27.5

This document lists intentional improvements in the native Rust backend. Each entry differs from buggy or unsafe Node `v0.27.5` behavior.

## UserType Self-Access Enforcement

- Area: `packages/backend/server-http/src/graphql/user.rs` (`UserType.settings`, `UserType.quota`, `UserType.quotaUsage`).
- Node `v0.27.5` behavior: Resolvers ignored `@Parent()` and returned the active session user settings and quota.
- Native behavior: Resolvers read `self.view.id` and require `caller.id == self.view.id`. Other callers get `403` (`ACCESS_DENIED`).

- Test: `http_auth_graphql_and_rest_parity` in `packages/backend/server-http/tests/http_auth_sync_parity.rs`.

## GraphQL Body Limit and CSRF Protection

- Area: `packages/backend/server-http/src/lib.rs` (`handle_graphql_post`, `handle_graphql_get`, `execute_graphql_request`).
- Node `v0.27.5` behavior: Express JSON parser stopped at 100 KiB. `csrfPrevention` allowed weak header checks.
- Native behavior: JSON request bodies allow up to 16 MiB. Parsed `query` strings enforce a 100 KiB limit and a 64-level depth limit.

- `POST /graphql` rejects missing, empty, or non-JSON `Content-Type` headers.
- Cookie multipart requests without a preflight header require a trusted `Origin` or `Referer` header and reject `cross-site` and untrusted `same-site` requests.
- `GET /graphql?query=...` requires a non-`Content-Type` preflight header and allows read-only queries only.

- Test: `http_auth_graphql_and_rest_parity` in `packages/backend/server-http/tests/http_auth_sync_parity.rs`.

## S3 404 Error Classification

- Area: `packages/backend/server-blob/src/s3.rs` (`get`, `get_limited`).
- Node `v0.27.5` behavior: S3 `HEAD` 404 fell back to a full object `GET` probe.
- Native behavior: `HEAD` does not fall back to `GET`. `GET` 404 reads at most 64 KiB and propagates stream errors.

- Only `NoSuchKey` and `NotFound` map to missing objects. `NoSuchBucket` surfaces as a storage request error.

- Test: `s3_404_classification_distinguishes_missing_key_bucket_and_truncated_body` in `packages/backend/server-blob/src/s3.rs`.

## Avatar Last-Modified Format

- Area: `packages/backend/server-http/src/rest/blobs.rs` (`handle_get_avatar`).
- Node `v0.27.5` behavior: Emitted ISO-8601 timestamps in `Last-Modified`.
- Native behavior: Emits RFC 9110 IMF-fixdate timestamps. Evaluates `If-Modified-Since` at second precision for `200` and `304` responses.

- Test: `http_auth_graphql_and_rest_parity` in `packages/backend/server-http/tests/http_auth_sync_parity.rs`.

## Password Change and Security Challenge Guards

- Area: `packages/backend/server-domain/src/auth/security_challenge.rs` (`complete_password_challenge`, `send_verify_change_email`).
- Node `v0.27.5` behavior: `changePassword` skipped password length checks and disabled-user checks.
- Native behavior: Enforces dynamic `auth.passwordRequirements` and the 1024-byte ceiling. Blocks disabled users.

- Test: `http_auth_graphql_and_rest_parity` in `packages/backend/server-http/tests/http_auth_sync_parity.rs`.

## Calendar Webhook Verification Token Derivation

- Area: `packages/backend/server-domain/src/calendar/mod.rs` (`webhook_token_from_config`).
- Node `v0.27.5` behavior: Generated a random UUID per process without `webhookVerificationToken`. Multi-process webhook verification failed.
- Native behavior: Derives a deterministic HMAC-SHA256 token from the configured private key when `webhookVerificationToken` has no value.

- Database updates to `crypto.privateKey` take effect live without restarting the server.

- Test: `calendar_private_key_raw_bytes_and_db_override_interop` in `packages/backend/server-domain/src/calendar/mod.rs`.

## Link Preview, Telemetry, and Storage Robustness

- Area: `packages/backend/server-http/src/rest/worker_proxy.rs`, `packages/backend/server-http/src/rest/telemetry.rs`, `packages/backend/server-worker/src/mutex.rs`.
- Native behavior: Caps link-preview bodies at 16 KiB, uses `HEAD` for `head: true`, and caps telemetry bodies at 2 MiB.
- Also bounds HTML entity decoding, isolates `/favicon.ico` probe failures, and handles expired Redis mutex release cleanly.

- Test: `worker_proxy_doc_renderer_and_telemetry_contracts` in `packages/backend/server-http/tests/storage_static_telemetry_pg.rs`.

## Cloud Unmounts Worker Proxy Routes

- Area: `packages/backend/server-http/src/lib.rs` (`RouteMountMatrix::for_mode_and_role`).
- Node `v0.27.5` behavior: Cloud development mode mounted `/api/worker/*` proxy routes.
- Native behavior: Cloud mode never mounts `/api/worker/*` routes and returns `404` regardless of `dev_mode`. Only Selfhosted HTTP roles mount them.

- Test: `route_mount_matrix_truth_table_covers_all_mode_and_role_combinations` in `packages/backend/server-http/src/lib.rs`.
