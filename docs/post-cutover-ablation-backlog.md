# Post-Cutover Ablation Backlog

This list tracks code that exists only while `v0.27.5` and the native server run side by side.
It also tracks code for data and clients from before the cutover.
Each entry names one `// compat(<kind>): <slug> -- <reason>` marker in `packages/backend/`.
`scripts/ci/check-l0-tier-a.mjs` checks that markers and entries match one to one.

These files are permanent external wire API contracts and are not part of this backlog:

- `packages/backend/server-http/src/legacy_compat/errors.rs`
- `packages/backend/server-http/src/legacy_compat/quota.rs`
- `packages/backend/server-sync/src/legacy_compat/errors.rs`

Kinds:

- `coexist`: needed while `v0.27.5` instances share the database or Redis.
- `client`: needed while older clients stay supported.
- `data`: needed while rows or objects from before the cutover remain.
- `parity`: keeps a `v0.27.5` behavior that clients can observe.

### auth-dual-session-tables

- Kind: `coexist`.

- Code: `packages/backend/server-db/src/phase_a_compat/sessions.rs`.

- Reason: `v0.27.5` reads `user_sessions`, so the native server writes each session to both table sets.

- Exit check: No `v0.27.5` instance runs, and `SELECT count(*) FROM user_sessions WHERE expires_at IS NULL OR expires_at > now()` returns `0`. `v0.27.5` treats a session with a `NULL` `expires_at` as valid.

- Removal: Read and write only the native session tables. Then make sure that the native tables hold all active sessions. Also make sure that no foreign key refers to the legacy tables. Then drop the legacy session tables.

### blob-storage-operation-session-lock

- Kind: `coexist`.

- Code: `packages/backend/server-blob/src/lib.rs`.

- Reason: `v0.27.5` orders blob lifecycle work with the same `storage-workspace` and `storage-object` session locks.

- Exit check: No `v0.27.5` instance serves blob uploads, deletes, or storage cleanup.

- Removal: Replace `StorageObjectLock` with transaction-scoped advisory locks.

### comment-attachment-legacy-bucket-fallback

- Kind: `data`.

- Code: `packages/backend/server-http/src/rest/blobs.rs`.

- Reason: Comment attachments from before the cutover live in the separate `comment-attachments` bucket.

- Exit check: A copy job moved every object of that bucket to `comment-attachments/` keys in the blob bucket. The old bucket holds no objects.

- Removal: Delete the fallback read in `load_comment_attachment` and the `comment_attachments` storage.

### db-0275-cutover-prerequisite-checks

- Kind: `coexist`.

- Code: `packages/backend/server-db/src/phase_a_compat/bootstrap.rs`.

- Reason: An existing database must show the `v0.27.5` data migrations and cutover markers before the native server starts.

- Exit check: Every production database completed the cutover, and `SELECT count(*) FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle_activation' AND status <> 'active'` returns `0`.

- Removal: Delete the prerequisite checks and the fresh database markers.

### oauth-bare-state-token-fallback

- Kind: `coexist`.

- Code: `packages/backend/server-domain/src/auth/oauth.rs`.

- Reason: `v0.27.5` sends the OAuth `state` parameter as a bare token instead of a JSON envelope.

- Exit check: No `v0.27.5` instance starts OAuth flows, and one OAuth state lifetime passed after the last one stopped.

- Removal: Accept only the JSON state envelope in `parse_state_parameter`.

### oauth-legacy-null-provider-namespace-backfill

- Kind: `data`.

- Code: `packages/backend/server-domain/src/auth/oauth.rs`.

- Reason: Accounts that users linked before `0.27.5` have no `provider_namespace`.

- Exit check: `SELECT count(*) FROM user_connected_accounts WHERE provider_namespace IS NULL` returns `0`.

- Removal: Delete the legacy account lookup and its backfill update.

### prisma-dual-migration-baseline

- Kind: `coexist`.

- Code: `packages/backend/server-db/src/phase_a_compat/prisma_baseline.rs`.

- Reason: `v0.27.5` instances read `_prisma_migrations`, so the native server replays the bundled `v0.27.5` migrations on a fresh database.

- Exit check: No `v0.27.5` instance runs, and `SELECT count(*) FROM storage_reconciliation_checkpoints WHERE kind = 'schema_baseline_0275' AND status <> 'completed'` returns `0`.

- Removal: Delete the module and let `schema.rs` apply only the native component migrations.

### search-highlight-raw-tags

- Kind: `parity`.

- Code: `packages/backend/server-http/src/graphql/search.rs`.

- Reason: `searchDocs` emits raw text with highlight tags like `v0.27.5`. The client `@` mention menu does not escape highlight HTML yet.

- Exit check: The frontend `@` mention menu escapes untrusted highlight text before rendering.

- Removal: Keep or tighten highlight output after the client escaping fix lands.

### sync-lazy-root-doc-lifecycle-migration

- Kind: `data`.

- Code: `packages/backend/server-sync/src/legacy_compat/root_lifecycle_migration.rs`.

- Reason: Workspaces from before the cutover keep page trash flags in the root doc `meta.pages` array.

- Exit check: `SELECT count(*) FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM storage_reconciliation_checkpoints c WHERE c.kind = 'workspace_doc_lifecycle' AND c.scope = w.id AND c.status = 'completed')` returns `0`.

- Removal: Delete the migration and the checkpoint reads in `ensure_workspace_lifecycle`.

### sync-legacy-updates-seq-compat

- Kind: `coexist`.

- Code: `packages/backend/server-db/src/phase_a_compat/updates.rs`.

- Reason: `v0.27.5` keys `updates` rows by millisecond `created_at`, so inserts keep that layout and order.

- Exit check: No `v0.27.5` instance writes to `updates`.

- Removal: Insert update rows with the native key layout only.

### sync-userspace-session-redis-lock

- Kind: `coexist`.

- Code: `packages/backend/server-sync/src/legacy_compat/userspace_redis_bridge.rs`.

- Reason: `v0.27.5` and the native server order userspace doc writes on `MutexLock:userspace:<uid>:<doc>`.

- Exit check: No `v0.27.5` instance serves document sync.

- Removal: Delete the Redis lease and keep the PostgreSQL transaction lock for userspace doc writes.

### transcript-upload-slice-limits

- Kind: `client`.

- Code: `packages/backend/server-spi/src/transcript.rs`.

- Reason: Current clients send at most 32 audio slices of up to 50 MiB each, as `v0.27.5` accepts. One submission can write up to 1.6 GiB (32 x 50 MiB) of slices. The coexistence period does not delete them.

- Exit check: The minimum supported client version uses a new upload contract with its own limits.

- Removal: Set the slice limits from the new upload contract.

### version-guard-npm-node-semver-quirks

- Kind: `parity`.

- Code: `packages/backend/server-http/src/rest/version_guard/npm_semver_compat.rs`.

- Reason: `client.versionControl.requiredVersion` values follow `node-semver` rules, including its whitespace and loose range forms.

- Exit check: Every value of `SELECT value FROM app_configs WHERE id = 'client.versionControl.requiredVersion'` parses with a strict semver range parser.

- Removal: Replace the module with a strict semver range parser.

### workspace-invite-0275-preflight-order

- Kind: `parity`.

- Code: `packages/backend/server-domain/src/workspaces.rs`.

- Reason: Clients expect the `v0.27.5` error for each kind of invalid batch invite.

- Exit check: The product owner accepts a new error order for batch invites.

- Removal: Merge the preflight read into the invite transaction.
