use napi::bindgen_prelude::Buffer;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};

use super::{SCHEMA_FINGERPRINT, store::SearchTable};
use crate::{
  runtime::{RuntimeError, RuntimeResult},
  search_index::EmbeddedSearchIndex,
};

const DIRTY_CHANGE_THRESHOLD: i64 = 1_000;
const RETAINED_CHANGES: i64 = 10_000;
const MAX_CHECKPOINT_AGE_SECONDS: i64 = 300;

pub(super) async fn restore(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  table: SearchTable,
) -> RuntimeResult<Option<i64>> {
  let row = sqlx::query(
    "SELECT source_cursor, checkpoint_blob, checksum FROM search_runtime_checkpoints WHERE table_key=$1 AND \
     schema_fingerprint=$2",
  )
  .bind(table.as_str())
  .bind(SCHEMA_FINGERPRINT)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load embedded search checkpoint", error))?;
  let Some(row) = row else { return Ok(None) };
  let cursor: i64 = row
    .try_get("source_cursor")
    .map_err(|error| RuntimeError::database("decode search checkpoint cursor", error))?;
  let bytes: Vec<u8> = row
    .try_get("checkpoint_blob")
    .map_err(|error| RuntimeError::database("decode search checkpoint blob", error))?;
  let checksum: String = row
    .try_get("checksum")
    .map_err(|error| RuntimeError::database("decode search checkpoint checksum", error))?;
  if digest(&bytes) != checksum {
    return Ok(None);
  }
  if embedded
    .restore(table.as_str().to_string(), Buffer::from(bytes))
    .await
    .is_err()
  {
    return Ok(None);
  }
  Ok(Some(cursor))
}

pub(super) async fn persist(pool: &PgPool, embedded: &EmbeddedSearchIndex, cursors: [i64; 2]) -> RuntimeResult<()> {
  for table in SearchTable::ORDERED {
    let cursor = cursors[table.cursor_index()];
    let persisted: Option<(i64, bool)> = sqlx::query_as(
      "SELECT source_cursor, updated_at < now() - make_interval(secs => $2) AS expired FROM \
       search_runtime_checkpoints WHERE table_key=$1",
    )
    .bind(table.as_str())
    .bind(MAX_CHECKPOINT_AGE_SECONDS as f64)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load persisted checkpoint cursor", error))?;
    let (persisted_cursor, expired) = persisted.unwrap_or((0, true));
    if cursor <= persisted_cursor || (cursor - persisted_cursor < DIRTY_CHANGE_THRESHOLD && !expired) {
      continue;
    }
    let mut transaction = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin embedded checkpoint", error))?;
    sqlx::query("SET LOCAL synchronous_commit = off")
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("configure embedded checkpoint commit", error))?;
    let leader: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("search-checkpoint/{}", table.as_str()))
      .fetch_one(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("acquire embedded checkpoint lease", error))?;
    if !leader {
      continue;
    }
    let persisted: Option<(i64, bool)> = sqlx::query_as(
      "SELECT source_cursor, updated_at < now() - make_interval(secs => $2) AS expired FROM \
       search_runtime_checkpoints WHERE table_key=$1",
    )
    .bind(table.as_str())
    .bind(MAX_CHECKPOINT_AGE_SECONDS as f64)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("reload persisted checkpoint cursor", error))?;
    let (persisted_cursor, expired) = persisted.unwrap_or((0, true));
    if cursor <= persisted_cursor || (cursor - persisted_cursor < DIRTY_CHANGE_THRESHOLD && !expired) {
      continue;
    }
    embedded.optimize(table.as_str().to_string()).await?;
    let checkpoint = embedded.checkpoint(table.as_str().to_string()).await?;
    let bytes = checkpoint.data.to_vec();
    let saved = sqlx::query(
      r#"INSERT INTO search_runtime_checkpoints
         (table_key,schema_fingerprint,source_cursor,checkpoint_sequence,checkpoint_blob,checksum,blob_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (table_key) DO UPDATE SET schema_fingerprint=EXCLUDED.schema_fingerprint,
         source_cursor=EXCLUDED.source_cursor,checkpoint_sequence=EXCLUDED.checkpoint_sequence,
         checkpoint_blob=EXCLUDED.checkpoint_blob,checksum=EXCLUDED.checksum,blob_size=EXCLUDED.blob_size,updated_at=now()
         WHERE search_runtime_checkpoints.source_cursor < EXCLUDED.source_cursor"#,
    )
    .bind(table.as_str())
    .bind(SCHEMA_FINGERPRINT)
    .bind(cursor)
    .bind(checkpoint.sequence)
    .bind(&bytes)
    .bind(digest(&bytes))
    .bind(bytes.len() as i64)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("persist embedded search checkpoint", error))?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit embedded search checkpoint", error))?;
    if saved.rows_affected() == 1 {
      embedded
        .mark_checkpoint_persisted(table.as_str().to_string(), checkpoint.sequence)
        .await?;
    }
  }
  gc(pool).await
}

pub(super) async fn gc(pool: &PgPool) -> RuntimeResult<()> {
  for table in SearchTable::ORDERED {
    let minimum: Option<i64> = sqlx::query_scalar(
      r#"SELECT COALESCE(MIN(watermark),0) FROM (
           SELECT c.source_cursor AS watermark FROM search_runtime_provider_cursors c
             JOIN search_runtime_generations g USING(generation_id)
             WHERE c.table_key=$1 AND g.provider<>'embedded' AND g.state IN ('active','pending')
           UNION ALL
           SELECT checkpoint.source_cursor FROM search_runtime_checkpoints checkpoint
             WHERE checkpoint.table_key=$1 AND EXISTS (
               SELECT 1 FROM search_runtime_generations generation
               WHERE generation.provider='embedded' AND generation.state IN ('active','pending')
             )
         ) retained"#,
    )
    .bind(table.as_str())
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("compute search retention watermark", error))?;
    let retained_from = minimum.unwrap_or(0).saturating_sub(RETAINED_CHANGES);
    let mut transaction = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin search change gc", error))?;
    sqlx::query("DELETE FROM search_runtime_changes WHERE table_key=$1 AND stream_sequence <= $2")
      .bind(table.as_str())
      .bind(retained_from)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("gc search changes", error))?;
    sqlx::query("UPDATE search_runtime_streams SET retained_from=GREATEST(retained_from,$2) WHERE table_key=$1")
      .bind(table.as_str())
      .bind(retained_from)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("advance search retention watermark", error))?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit search change gc", error))?;
  }
  sqlx::query(
    r#"DELETE FROM workspace_permission_changes permission_change
       USING workspace_permission_revisions head
       WHERE permission_change.workspace_id=head.workspace_id
         AND permission_change.revision <= (
           SELECT COALESCE(MIN(cursor.permission_revision),head.revision)
           FROM search_runtime_permission_cursors cursor
           JOIN search_runtime_generations generation USING(generation_id)
           WHERE cursor.workspace_id=permission_change.workspace_id AND generation.state IN ('active','pending')
         ) - $1"#,
  )
  .bind(RETAINED_CHANGES)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("gc search permission changes", error))?;
  Ok(())
}

fn digest(bytes: &[u8]) -> String {
  Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}
