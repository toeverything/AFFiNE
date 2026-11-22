//! Phase A `v0.27.5` co-existence SQL helpers.
//!
//! Kept isolated under `phase_a_compat` so canonical domain crates never depend
//! on transition-era checkpoint tables or cutover checks.

use crate::DbError;

pub const FRESH_BOOTSTRAP_ORIGIN: &str = "server_db_fresh_0275";

/// Returns `true` if `storage_reconciliation_checkpoints` exists and contains
/// the completed `schema_baseline_0275` global marker.
pub async fn has_schema_baseline_0275_checkpoint(conn: &mut sqlx::PgConnection) -> Result<bool, DbError> {
  let table_exists: bool =
    sqlx::query_scalar("SELECT to_regclass('public.storage_reconciliation_checkpoints') IS NOT NULL")
      .fetch_one(&mut *conn)
      .await?;
  if !table_exists {
    return Ok(false);
  }
  let matched: bool = sqlx::query_scalar(
    "SELECT EXISTS (
       SELECT 1
       FROM storage_reconciliation_checkpoints
       WHERE kind = 'schema_baseline_0275'
         AND scope = 'global'
         AND status = 'completed'
     )",
  )
  .fetch_one(&mut *conn)
  .await?;
  Ok(matched)
}

/// Returns `true` if a fresh-DB `schema_baseline_0275` initialization created
/// by `server-db` is currently in progress (`status = 'initializing'` with
/// `metadata->>'bootstrapOrigin' = 'server_db_fresh_0275'`).
pub async fn is_schema_baseline_0275_initializing(conn: &mut sqlx::PgConnection) -> Result<bool, DbError> {
  let has_metadata_col: bool = sqlx::query_scalar(
    "SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'storage_reconciliation_checkpoints'
         AND column_name = 'metadata'
     )",
  )
  .fetch_one(&mut *conn)
  .await?;
  if !has_metadata_col {
    return Ok(false);
  }
  let matched: bool = sqlx::query_scalar(
    "SELECT EXISTS (
       SELECT 1
       FROM storage_reconciliation_checkpoints
       WHERE kind = 'schema_baseline_0275'
         AND scope = 'global'
         AND status = 'initializing'
         AND metadata->>'bootstrapOrigin' = $1
     )",
  )
  .bind(FRESH_BOOTSTRAP_ORIGIN)
  .fetch_one(&mut *conn)
  .await?;
  Ok(matched)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CutoverInvariantCounts {
  pub ownerless_workspaces: i32,
  pub active_unsigned_selfhost_entitlements: i32,
}

/// Evaluates the exact `v0.27.5` `CutoverCommand` validation query against the
/// database, returning invariant violation counts (both must be `0`).
pub async fn check_cutover_invariants(
  conn: &mut sqlx::PgConnection,
  selfhosted: bool,
) -> Result<CutoverInvariantCounts, DbError> {
  let deployment = if selfhosted { "selfhosted" } else { "cloud" };
  let (ownerless_workspaces, active_unsigned_selfhost_entitlements): (i32, i32) = sqlx::query_as(
    "SELECT
       (
         SELECT count(*)::int
         FROM workspaces workspace
         WHERE NOT EXISTS (
           SELECT 1
           FROM workspace_members member
           WHERE member.workspace_id = workspace.id
             AND member.role = 'owner'
             AND member.state = 'active'
         )
       ),
       (
         SELECT count(*)::int
         FROM entitlements
         WHERE $1 = 'selfhosted'
           AND source = 'selfhost_license'
           AND signed_payload IS NULL
           AND status IN ('active', 'grace')
       )",
  )
  .bind(deployment)
  .fetch_one(&mut *conn)
  .await?;

  Ok(CutoverInvariantCounts {
    ownerless_workspaces,
    active_unsigned_selfhost_entitlements,
  })
}
