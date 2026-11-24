use std::time::Duration;

use sqlx::PgPool;

use crate::error::{SearchError, SearchResult};

pub const LOCKLESS_V2_CHECKPOINT_KIND: &str = "search_projection_lockless_v2";
pub const LOCKLESS_V2_CHECKPOINT_SCOPE: &str = "global";
pub const LOCKLESS_V2_LEASE_TTL_SECONDS: i64 = 90;
pub const LOCKLESS_V2_BRIDGE_WINDOW_SECONDS: i64 = 30;
pub const LOCKLESS_V2_RENEW_INTERVAL: Duration = Duration::from_secs(15);

/// Renews the global `search_projection_lockless_v2` lease in
/// `storage_reconciliation_checkpoints` for 90 seconds so `search_projection_v6`
/// triggers stay in per-workspace lock mode.
pub async fn renew_lockless_v2_lease(pool: &PgPool) -> SearchResult<()> {
  renew_lockless_v2_lease_for(pool, LOCKLESS_V2_LEASE_TTL_SECONDS).await
}

/// Renews the global `search_projection_lockless_v2` lease for `ttl_seconds`
/// without ever taking the legacy `search-projection-generation` global lock.
///
/// 1. Steady fast path (`fenced = true` and more than 30 seconds remaining):
///    single lockless `UPDATE`.
/// 2. Staged draining path (`fenced = false`, `fence_xid` recorded, more than
///    30 seconds remaining): single non-blocking `UPDATE` that flips `fenced`
///    to `true` once `pg_snapshot_xmin(pg_current_snapshot()) > fence_xid`.
/// 3. Cold-enable or re-enable path: beat 1 commits `active` + `fenced = false`
///    so all subsequent writers see the active lease; beat 2 allocates and
///    commits a fresh `fence_xid = pg_current_xact_id()` strictly above all
///    previously assigned XIDs; beat 3 immediately flips `fenced = true` if
///    `pg_snapshot_xmin(pg_current_snapshot()) > fence_xid`.
pub async fn renew_lockless_v2_lease_for(pool: &PgPool, ttl_seconds: i64) -> SearchResult<()> {
  let steady = sqlx::query(
    r#"UPDATE storage_reconciliation_checkpoints
       SET status = 'active',
           metadata = jsonb_set(
             jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{lease_expires_at}',
               to_jsonb(clock_timestamp() + make_interval(secs => $3)),
               true
             ),
             '{fenced}',
             'true'::jsonb,
             true
           ),
           updated_at = clock_timestamp()
       WHERE kind = $1
         AND scope = $2
         AND status = 'active'
         AND metadata->>'fenced' = 'true'
         AND (metadata->>'lease_expires_at')::timestamptz > clock_timestamp() + interval '30 seconds'"#,
  )
  .bind(LOCKLESS_V2_CHECKPOINT_KIND)
  .bind(LOCKLESS_V2_CHECKPOINT_SCOPE)
  .bind(ttl_seconds)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("renew steady search_projection_lockless_v2 lease", error))?;

  if steady.rows_affected() > 0 {
    return Ok(());
  }

  let draining = sqlx::query(
    r#"UPDATE storage_reconciliation_checkpoints
       SET status = 'active',
           metadata = jsonb_set(
             jsonb_set(
               metadata,
               '{lease_expires_at}',
               to_jsonb(clock_timestamp() + make_interval(secs => $3)),
               true
             ),
             '{fenced}',
             to_jsonb(pg_snapshot_xmin(pg_current_snapshot()) > (metadata->>'fence_xid')::xid8),
             true
           ),
           updated_at = clock_timestamp()
       WHERE kind = $1
         AND scope = $2
         AND status = 'active'
         AND metadata->>'fenced' = 'false'
         AND metadata ? 'fence_xid'
         AND (metadata->>'lease_expires_at')::timestamptz > clock_timestamp() + interval '30 seconds'"#,
  )
  .bind(LOCKLESS_V2_CHECKPOINT_KIND)
  .bind(LOCKLESS_V2_CHECKPOINT_SCOPE)
  .bind(ttl_seconds)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("advance search_projection_lockless_v2 drain fence", error))?;

  if draining.rows_affected() > 0 {
    return Ok(());
  }

  // Cold-enable or re-enable: Beat 1 commits `active` + `fenced = false` with
  // deadline `E`; Beat 2 records `fence_xid = pg_current_xact_id()` while
  // preserving Beat 1's committed `E`. After Beat 2 commits, verify `E` is
  // still in the future so no writer between Beat 1 and Beat 2's commit could
  // have observed an expired lease; if `E` expired in the meantime, repeat
  // Beat 1 and allocate a fresh `fence_xid` in a subsequent transaction.
  for _ in 0..3 {
    sqlx::query(
      r#"INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, metadata, updated_at)
         VALUES (
           $1,
           $2,
           'active',
           jsonb_build_object(
             'lease_expires_at', clock_timestamp() + make_interval(secs => $3),
             'fenced', false
           ),
           clock_timestamp()
         )
         ON CONFLICT (kind, scope) DO UPDATE
         SET status = 'active',
             metadata = jsonb_build_object(
               'lease_expires_at', clock_timestamp() + make_interval(secs => $3),
               'fenced', false
             ),
             updated_at = clock_timestamp()"#,
    )
    .bind(LOCKLESS_V2_CHECKPOINT_KIND)
    .bind(LOCKLESS_V2_CHECKPOINT_SCOPE)
    .bind(ttl_seconds)
    .execute(pool)
    .await
    .map_err(|error| SearchError::database("stage search_projection_lockless_v2 lease", error))?;

    let marked = sqlx::query(
      r#"UPDATE storage_reconciliation_checkpoints
         SET metadata = jsonb_set(
               metadata,
               '{fence_xid}',
               to_jsonb(pg_current_xact_id()::text),
               true
             ),
             updated_at = clock_timestamp()
         WHERE kind = $1
           AND scope = $2
           AND status = 'active'
           AND metadata->>'fenced' = 'false'
           AND NOT (metadata ? 'fence_xid')
           AND (metadata->>'lease_expires_at')::timestamptz > clock_timestamp()"#,
    )
    .bind(LOCKLESS_V2_CHECKPOINT_KIND)
    .bind(LOCKLESS_V2_CHECKPOINT_SCOPE)
    .execute(pool)
    .await
    .map_err(|error| SearchError::database("record search_projection_lockless_v2 fence_xid", error))?;

    if marked.rows_affected() > 0 {
      let still_live: Option<bool> = sqlx::query_scalar(
        r#"SELECT status = 'active'
             AND metadata ? 'fence_xid'
             AND (metadata->>'lease_expires_at')::timestamptz > clock_timestamp()
           FROM storage_reconciliation_checkpoints
           WHERE kind = $1 AND scope = $2"#,
      )
      .bind(LOCKLESS_V2_CHECKPOINT_KIND)
      .bind(LOCKLESS_V2_CHECKPOINT_SCOPE)
      .fetch_optional(pool)
      .await
      .map_err(|error| SearchError::database("verify search_projection_lockless_v2 staged expiry", error))?;

      if still_live == Some(true) {
        break;
      }
    }
  }

  // Beat 3: Now that `fence_xid` has committed (`latestCompletedXid >= fence_xid`),
  // immediately flip `fenced = true` if the lease is still unexpired and no earlier
  // write transactions remain open (`pg_snapshot_xmin > fence_xid`).
  sqlx::query(
    r#"UPDATE storage_reconciliation_checkpoints
       SET metadata = jsonb_set(
             metadata,
             '{fenced}',
             to_jsonb(pg_snapshot_xmin(pg_current_snapshot()) > (metadata->>'fence_xid')::xid8),
             true
           ),
           updated_at = clock_timestamp()
       WHERE kind = $1
         AND scope = $2
         AND status = 'active'
         AND metadata->>'fenced' = 'false'
         AND metadata ? 'fence_xid'
         AND (metadata->>'lease_expires_at')::timestamptz > clock_timestamp()"#,
  )
  .bind(LOCKLESS_V2_CHECKPOINT_KIND)
  .bind(LOCKLESS_V2_CHECKPOINT_SCOPE)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("check search_projection_lockless_v2 fence_xid drain", error))?;
  Ok(())
}

/// Marks the global `search_projection_lockless_v2` lease as expired immediately.
pub async fn expire_lockless_v2_lease(pool: &PgPool) -> SearchResult<()> {
  sqlx::query(
    r#"INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, metadata, updated_at)
       VALUES (
         $1,
         $2,
         'active',
         jsonb_build_object(
           'lease_expires_at', clock_timestamp() - interval '1 second',
           'fenced', false
         ),
         clock_timestamp()
       )
       ON CONFLICT (kind, scope) DO UPDATE
       SET metadata = jsonb_build_object(
             'lease_expires_at', clock_timestamp() - interval '1 second',
             'fenced', false
           ),
           updated_at = clock_timestamp()"#,
  )
  .bind(LOCKLESS_V2_CHECKPOINT_KIND)
  .bind(LOCKLESS_V2_CHECKPOINT_SCOPE)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("expire search_projection_lockless_v2 lease", error))?;
  Ok(())
}

/// Returns whether `search_projection.lockless_v2_active()` is currently true.
pub async fn is_lockless_v2_active(pool: &PgPool) -> SearchResult<bool> {
  sqlx::query_scalar("SELECT search_projection.lockless_v2_active()")
    .fetch_one(pool)
    .await
    .map_err(|error| SearchError::database("check search_projection.lockless_v2_active", error))
}
