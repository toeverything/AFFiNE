# Rollout and Coexistence

This document specifies coexistence rules when `affine-server` shares PostgreSQL and Redis with AFFiNE `v0.27.5`.

## 1. Schema Baseline

1. Upgrade every existing database to the `v0.27.5` Prisma migration baseline before you start `affine-server`.
2. Do not modify rows in `_prisma_migrations` during coexistence.
3. Record native component schema versions in `native_schema_migrations`.

## 2. Forward-Compatible Native Migrations

1. Frozen `v0.27.5` (`@affine/server-native`) checks `native_schema_migrations` checksums for versions `1..=5` and ignores higher versions such as `v6`.
2. A database migrated to `v6` can roll back directly to `v0.27.5`.

Older development builds of `affine-server` before this change do not skip higher versions.
Upgrade `affine-server` to a build with prefix verification before you apply `v6`, and target `v0.27.5` for rollback.
Never edit an existing SQL migration file. Add a new versioned file instead.

## 3. Session and Lock Compatibility

1. Share `SessionRedis` (`base_db + 2`) with `MutexLock:<resource>` keys and atomic Lua scripts.
2. Prefix new worker-only Redis keys with `v2:` to avoid collisions.
3. Drain active workers before you release tracked leases on shutdown.
4. Set `AFFINE_CHANNEL=canary` on `affine-server` wherever `v0.27.5` uses `AFFINE_ENV=dev` for the canary date client version window.
5. `affine-server` hashes spoofed request-tracker headers longer than 256 bytes to `sha256:<hex>`; normal session IDs, IPs, and `CF-Ray` values (`<= 256` bytes) share exact `throttler:<tracker>;<tier>` Redis keys with `v0.27.5`.

## 4. Document Lifecycle Coexistence

1. Startup on an existing `v0.27.5` database accepts a missing global `workspace_doc_lifecycle_activation` checkpoint (default `v1` sync protocol) or a checkpoint with `status = 'active'`.
2. Startup rejects any other `workspace_doc_lifecycle_activation` checkpoint status without modifying the database.
3. While the checkpoint is absent, search and sync read the legacy workspace root document inventory.

## 5. Blob and Storage Coexistence

1. Serialize blob writes and deletes with per-object advisory locks outside the pooled connection.
2. Keep local and S3 object key layouts identical to `v0.27.5`.
3. Keep `v0.27.5` workspace storage reconciliation active during mixed rollout until `affine-server` owns orphan object sweeps.
4. `provider: "assetpack"` enables `config.precomp2 = true` by default (writing `PCF2 v2` recipes while decoding `v0.27.5` `PCF2 v1`, `PCF2 v2`, and raw FastCDC chunks). Set `config.precomp2 = false` during mixed rollout with `v0.27.5` or while keeping a rollback window to `v0.27.5` so newly written objects remain readable by `v0.27.5`.
5. `AssetpackBlobStorage` bounds total decoded transform output per read to `512 MiB` (`DECODE_MAX_TOTAL_OUTPUT_BYTES`, 4x the `128 MiB` `FileTransformConfig::fast()` write transform cap). Legacy `v0.27.5` `PCF2 v1` PNG objects whose uncompressed pixel stream exceeds `512 MiB` (for example RGB images above roughly `13,000 x 13,000` or RGBA images above roughly `11,500 x 11,500`) remain intact on disk, and reading them returns a `decode output exceeds budget` error instead of allocating unbounded memory.

## 6. Search Projection v6 and Dual-Mode Lock Fence

1. Run only one search maintainer against a database at a time.
2. Keep `indexer.enabled=false` on all `v0.27.5` nodes before you set `AFFINE_INDEXER_ENABLED=true`.
3. `affine-server` reads search settings from environment variables and CLI flags only, not from admin `indexer.*` config.
4. To roll back to `v0.27.5` search, stop or disable all `affine-server` search workers.
5. Wait 90 seconds until `search_projection.lockless_v2_active()` returns `false`, then run `SELECT pg_current_xact_id()` in a transaction to commit a marker XID.
6. Wait until `pg_snapshot_xmin(pg_current_snapshot())` exceeds that marker XID so steady-state writers drain, then enable `v0.27.5` search.

Lock transition rules:

1. `search_projection_v6.sql` runs `CREATE OR REPLACE FUNCTION` statements only and takes no table locks.
2. The `server-search` worker renews `search_projection_lockless_v2` every 15 seconds with a 90 second expiry in `metadata.lease_expires_at`.
3. When more than 30 seconds remain on the lease, triggers take only `search-projection-ws:<workspace_id>`.
4. During the final 30 second bridge window, triggers take both `search-projection-generation` and `search-projection-ws:<workspace_id>`.

Trigger and fence rules:

1. Per-workspace orphan GC stops when 30 seconds or less remain on the lease.
2. Multi-workspace permission updates lock workspace keys in `LEAST` then `GREATEST` order to prevent deadlocks.
3. The two-step `fenceXid` discovery fence requires writers to use `READ COMMITTED` isolation.
4. In steady state, ordinary document snapshot writes skip redundant updates to `search_projection.workspace_states`.
5. Generation creation and activation take only `search-projection-lifecycle`.

Orphan GC takes only `search-projection-ws:<workspace_id>` with a `source_version <= H` bound.
If all `server-search` workers stop, triggers revert to the global shared lock after 90 seconds.
Set `idle_in_transaction_session_timeout` to `>= 60s` on the legacy database role.
`v0.27.5` lazy compaction can wait up to 60 seconds for a Redis lock.
This timeout still bounds idle transactions that stall `pg_snapshot_xmin`.
