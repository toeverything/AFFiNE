use chrono::{DateTime, Duration, Utc};
use napi::bindgen_prelude::Buffer;
use sqlx::{PgPool, Row};

use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error, types::RuntimeDocHistoryInput};

fn is_empty_doc(bin: &[u8]) -> bool {
  bin.is_empty() || (bin.len() == 1 && bin[0] == 0) || (bin.len() == 2 && bin[0] == 0 && bin[1] == 0)
}

async fn latest_history_timestamp(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<DateTime<Utc>>> {
  sqlx::query(
    r#"
    SELECT timestamp
    FROM snapshot_histories
    WHERE workspace_id = $1 AND guid = $2
    ORDER BY timestamp DESC
    LIMIT 1
    "#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(pool)
  .await
  .map(|row| row.map(|row| row.get("timestamp")))
  .map_err(|err| RuntimeError::database("DocStorage load latest history failed", err))
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn upsert_doc_snapshot(
    &self,
    workspace_id: String,
    doc_id: String,
    blob: Buffer,
    timestamp_ms: i64,
    editor_id: Option<String>,
  ) -> napi::Result<bool> {
    if is_empty_doc(blob.as_ref()) {
      return Ok(false);
    }

    let timestamp = DateTime::<Utc>::from_timestamp_millis(timestamp_ms)
      .ok_or_else(|| RuntimeError::invalid_input(format!("Invalid doc snapshot timestamp: {timestamp_ms}")))?;
    let pool = self.pool().await?;
    let row = sqlx::query(
      r#"
      INSERT INTO snapshots
        (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by)
      VALUES
        ($1, $2, $3, $4, $5, $5, $6, $6)
      ON CONFLICT (workspace_id, guid)
      DO UPDATE SET
        blob = $3,
        size = $4,
        updated_at = $5,
        updated_by = $6
      WHERE snapshots.workspace_id = $1
        AND snapshots.guid = $2
        AND snapshots.updated_at <= $5
      RETURNING updated_at
      "#,
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(blob.as_ref())
    .bind(blob.len() as i64)
    .bind(timestamp)
    .bind(editor_id.as_deref())
    .fetch_optional(&pool)
    .await
    .map_err(|err| RuntimeError::database("DocStorage upsert snapshot failed", err))?;

    Ok(row.is_some())
  }

  #[napi]
  pub async fn create_doc_history(&self, input: RuntimeDocHistoryInput) -> napi::Result<bool> {
    if input.history_min_interval_ms < 0 {
      return Err(napi_error("doc history interval must be non-negative"));
    }
    if input.history_max_age_ms <= 0 || is_empty_doc(input.blob.as_ref()) {
      return Ok(false);
    }

    let timestamp = DateTime::<Utc>::from_timestamp_millis(input.timestamp_ms)
      .ok_or_else(|| RuntimeError::invalid_input(format!("Invalid doc history timestamp: {}", input.timestamp_ms)))?;
    let pool = self.pool().await?;
    let should_create = match latest_history_timestamp(&pool, &input.workspace_id, &input.doc_id).await? {
      None => true,
      Some(last_timestamp) if last_timestamp == timestamp => false,
      Some(last_timestamp) => {
        input.force || last_timestamp < timestamp - Duration::milliseconds(input.history_min_interval_ms)
      }
    };

    if !should_create {
      return Ok(false);
    }

    let expired_at = Utc::now() + Duration::milliseconds(input.history_max_age_ms);
    sqlx::query(
      r#"
      INSERT INTO snapshot_histories
        (workspace_id, guid, timestamp, blob, expired_at, created_by)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (workspace_id, guid, timestamp)
      DO UPDATE SET expired_at = EXCLUDED.expired_at
      "#,
    )
    .bind(&input.workspace_id)
    .bind(&input.doc_id)
    .bind(timestamp)
    .bind(input.blob.as_ref())
    .bind(expired_at)
    .bind(input.editor_id.as_deref())
    .execute(&pool)
    .await
    .map_err(|err| RuntimeError::database("DocStorage create history failed", err))?;

    Ok(true)
  }

  #[napi]
  pub async fn delete_doc_storage(&self, workspace_id: String, doc_id: String) -> napi::Result<()> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("DocStorage delete begin transaction failed", err))?;

    sqlx::query("DELETE FROM snapshots WHERE workspace_id = $1 AND guid = $2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("DocStorage delete snapshot failed", err))?;
    sqlx::query("DELETE FROM updates WHERE workspace_id = $1 AND guid = $2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("DocStorage delete updates failed", err))?;
    sqlx::query("DELETE FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("DocStorage delete histories failed", err))?;

    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("DocStorage delete commit failed", err))?;
    Ok(())
  }
}
