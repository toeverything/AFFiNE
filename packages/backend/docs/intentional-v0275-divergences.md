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
- Cookie multipart requests require a preflight header. Requests without that header return `400` (`BAD_REQUEST`).
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

- Area: `packages/backend/server-domain/src/calendar/mod.rs` (`try_webhook_token_from_config`).
- Node `v0.27.5` behavior: Generated a random UUID per process without `webhookVerificationToken`. Multi-process webhook verification failed.
- Native behavior: Derives a deterministic HMAC-SHA256 token from the configured private key when `webhookVerificationToken` has no value.

- Database updates to `crypto.privateKey` take effect live without restarting the server.
- Rotating `crypto.privateKey` live invalidates existing calendar credentials and Google webhook tokens.

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

## Admin Role Protection and Self-Ban Guard

- Area: `packages/backend/server-domain/src/workspaces.rs` (`update_member_role`), `packages/backend/server-http/src/graphql/user.rs` (`mutate_admin_ban_user`).
- Node `v0.27.5` behavior: Commercial Admins could modify or demote another Admin. `banUser` did not block an admin from banning their own account.
- Native behavior: Only the workspace Owner can modify or demote another Admin. `banUser` rejects self-ban with `Forbidden`.

- Test: `grant_member_owner_and_divergence_guards_parity` and `workspace_doc_notification_config_and_error_parity` in `packages/backend/server-http/tests/workspace_mail_search_blob_parity.rs`.

## Granted Users List Disabled User Resilience

- Area: `packages/backend/server-domain/src/doc_sharing.rs` (`paginate_granted_users`).
- Node `v0.27.5` behavior: Querying `DocType.grantedUsersList` failed with `500` when a granted user had disabled status.
- Native behavior: Returns the granted user list cleanly without a `500` error for disabled accounts.

- Test: `grant_member_owner_and_divergence_guards_parity` in `packages/backend/server-http/tests/workspace_mail_search_blob_parity.rs`.

## Admin Dashboard Timezone and Sync Window

- Area: `packages/backend/server-domain/src/admin.rs` (`get_dashboard`).
- Node `v0.27.5` behavior: Ignored the `timezone` parameter when computing daily bucket boundaries and computed `syncHistoryHours` one hour short.
- Native behavior: Applies the requested IANA `timezone` to daily bucket boundaries (falling back to UTC when invalid) and spans the full `syncHistoryHours` window.

- Test: `grant_member_owner_and_divergence_guards_parity` in `packages/backend/server-http/tests/workspace_mail_search_blob_parity.rs`.

## Copilot Quota Limit Label for Zero

- Area: `packages/backend/server-http/src/legacy_compat/quota.rs` (`user_quota_from_grant`).
- Node `v0.27.5` behavior: Formatted `copilotActionLimit = 0` as `"Unlimited"`.
- Native behavior: Formats `0` as `"0 times"`, positive `n` as `"{n} times"`, and `None` as `"Unlimited"`.

- Test: `copilot_session_defaults_reuse_latest_chat_to_true_and_quota_labels` in `packages/backend/server-http/tests/workspace_mail_search_blob_parity.rs`.

## Invoice Pagination Bounds

- Area: `packages/backend/server-http/src/graphql/billing.rs` (`resolve_user_invoices`, `resolve_workspace_invoices`).
- Node `v0.27.5` behavior: Allowed negative `take` or `skip` values and unbounded `take` sizes on `invoices`.
- Native behavior: Defaults `take` to `8`, rejects negative `take` or `skip` with `400`, and clamps `take` to at most `100`.

- Test: `workspace_doc_notification_config_and_error_parity` in `packages/backend/server-http/tests/workspace_mail_search_blob_parity.rs`.

## Sign-In Memory Fallback Rate-Limit Cap

- Area: `packages/backend/server-http/src/rest/auth.rs` (`check_mem_rate_table`, `enforce_sign_in_rate_limit`).
- Node `v0.27.5` behavior: Relied on Redis throttling without a bounded in-process fallback table.
- Native behavior: Checks the IP bucket before the email bucket and sweeps expired entries every second. Full `65,536`-key tables return `429` in `O(1)` for new keys without evicting active buckets.

- Test: `mem_rate_table_fails_closed_at_cap_without_evicting_active_buckets` in `packages/backend/server-http/src/rest/auth.rs`.
