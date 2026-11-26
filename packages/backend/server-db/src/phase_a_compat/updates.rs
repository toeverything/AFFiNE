// compat(coexist): sync-legacy-updates-seq-compat -- preserves v0.27.5 updates sequence and row layout assumptions
//! Monotonic millisecond timestamp insertion helper for `public.updates`
//! (primary key `(workspace_id, guid, created_at)` at `TIMESTAMPTZ(3)`).

use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};

use crate::DbError;

/// Computes the next strictly increasing millisecond timestamp for a document
/// across both `snapshots` and `updates` (matching `v0.27.5` `doc_writer.rs`).
pub async fn next_monotonic_update_timestamp(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> Result<DateTime<Utc>, DbError> {
  let ts: DateTime<Utc> = sqlx::query_scalar(
    "SELECT GREATEST(
       date_trunc('milliseconds', clock_timestamp()),
       COALESCE(max(timestamp) + interval '1 millisecond', 'epoch'::timestamptz)
     )
     FROM (
       SELECT updated_at AS timestamp FROM snapshots WHERE workspace_id = $1 AND guid = $2
       UNION ALL
       SELECT created_at AS timestamp FROM updates WHERE workspace_id = $1 AND guid = $2
     ) source",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut **tx)
  .await?;
  Ok(ts)
}

/// Inserts a single CRDT update row into `public.updates` with a strictly
/// monotonic millisecond `created_at` timestamp, returning the assigned timestamp.
pub async fn insert_monotonic_doc_update(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  blob: &[u8],
  created_by: Option<&str>,
) -> Result<DateTime<Utc>, DbError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("workspace-doc-update:{workspace_id}/{doc_id}"))
    .execute(&mut **tx)
    .await?;

  let created_at = next_monotonic_update_timestamp(tx, workspace_id, doc_id).await?;
  sqlx::query(
    r#"INSERT INTO updates (workspace_id, guid, blob, created_at, created_by)
       VALUES ($1, $2, $3, $4, $5)"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(blob)
  .bind(created_at)
  .bind(created_by)
  .execute(&mut **tx)
  .await?;

  Ok(created_at)
}
