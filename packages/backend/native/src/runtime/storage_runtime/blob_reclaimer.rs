use chrono::{DateTime, Utc};
use napi::Result;
use sqlx::{FromRow, PgPool};

use super::{RuntimeBlobCleanupResult, RuntimeError, RuntimeResult, StorageRuntime, napi_error};

#[derive(FromRow)]
struct BlobRow {
  workspace_id: String,
  key: String,
  upload_id: Option<String>,
}

struct BlobReclaimerStore {
  pool: PgPool,
}

impl BlobReclaimerStore {
  fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  async fn load_expired_pending(&self, cutoff: DateTime<Utc>, limit: i64) -> RuntimeResult<Vec<BlobRow>> {
    sqlx::query_as::<_, BlobRow>(
      r#"
      SELECT workspace_id, key, upload_id
      FROM blobs
      WHERE status = 'pending'
        AND deleted_at IS NULL
        AND created_at < $1
      ORDER BY created_at ASC
      LIMIT $2
      "#,
    )
    .bind(cutoff)
    .bind(limit)
    .fetch_all(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("BlobReclaimer load pending blobs failed", err))
  }

  async fn load_deleted(&self, workspace_id: &str, limit: i64) -> RuntimeResult<Vec<BlobRow>> {
    sqlx::query_as::<_, BlobRow>(
      r#"
      SELECT workspace_id, key, upload_id
      FROM blobs
      WHERE workspace_id = $1
        AND deleted_at IS NOT NULL
      ORDER BY deleted_at ASC
      LIMIT $2
      "#,
    )
    .bind(workspace_id)
    .bind(limit)
    .fetch_all(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("BlobReclaimer load deleted blobs failed", err))
  }

  async fn delete_pending_metadata(&self, workspace_id: &str, key: &str) -> RuntimeResult<i64> {
    let result = sqlx::query(
      r#"
      DELETE FROM blobs
      WHERE workspace_id = $1 AND key = $2
        AND status = 'pending'
        AND deleted_at IS NULL
      "#,
    )
    .bind(workspace_id)
    .bind(key)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("BlobReclaimer delete pending blob metadata failed", err))?;
    Ok(result.rows_affected() as i64)
  }

  async fn delete_released_metadata(&self, workspace_id: &str, key: &str) -> RuntimeResult<i64> {
    let result = sqlx::query(
      r#"
      DELETE FROM blobs
      WHERE workspace_id = $1 AND key = $2
        AND deleted_at IS NOT NULL
      "#,
    )
    .bind(workspace_id)
    .bind(key)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("BlobReclaimer delete blob metadata failed", err))?;
    Ok(result.rows_affected() as i64)
  }
}

async fn delete_object_idempotent(runtime: &StorageRuntime, key: &str) -> RuntimeResult<()> {
  match runtime.object_storage_delete_object(key).await {
    Ok(()) => Ok(()),
    Err(err) if err.is_object_missing() => Ok(()),
    Err(err) => Err(err),
  }
}

async fn abort_upload_idempotent(runtime: &StorageRuntime, key: &str, upload_id: &str) -> RuntimeResult<()> {
  match runtime.object_storage_abort_upload(key, upload_id).await {
    Ok(()) => Ok(()),
    Err(err) if err.is_object_missing() => Ok(()),
    Err(err) => Err(err),
  }
}

fn push_workspace_once(workspace_ids: &mut Vec<String>, workspace_id: &str) {
  if !workspace_ids.iter().any(|id| id == workspace_id) {
    workspace_ids.push(workspace_id.to_string());
  }
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn cleanup_expired_pending_blobs(&self, cutoff_ms: i64, limit: i64) -> Result<RuntimeBlobCleanupResult> {
    if limit <= 0 {
      return Err(napi_error("pending blob cleanup limit must be positive"));
    }

    let cutoff = DateTime::<Utc>::from_timestamp_millis(cutoff_ms)
      .ok_or_else(|| RuntimeError::invalid_input("pending blob cleanup cutoff is invalid"))?;
    let store = BlobReclaimerStore::new(self.pool().await?);
    let rows = store.load_expired_pending(cutoff, limit).await?;

    let mut deleted = 0;
    let mut aborted_multipart = 0;
    let mut workspace_ids = Vec::new();
    for row in &rows {
      let object_key = format!("{}/{}", row.workspace_id, row.key);
      if let Some(upload_id) = row.upload_id.as_deref() {
        abort_upload_idempotent(self, &object_key, upload_id).await?;
        aborted_multipart += 1;
      }
      delete_object_idempotent(self, &object_key).await?;
      let affected = store.delete_pending_metadata(&row.workspace_id, &row.key).await?;
      if affected > 0 {
        deleted += affected;
        push_workspace_once(&mut workspace_ids, &row.workspace_id);
      }
    }

    Ok(RuntimeBlobCleanupResult {
      scanned: rows.len() as i64,
      deleted,
      aborted_multipart,
      workspace_ids,
    })
  }

  #[napi]
  pub async fn release_deleted_blobs(&self, workspace_id: String, limit: i64) -> Result<RuntimeBlobCleanupResult> {
    if limit <= 0 {
      return Err(napi_error("deleted blob release limit must be positive"));
    }

    let store = BlobReclaimerStore::new(self.pool().await?);
    let rows = store.load_deleted(&workspace_id, limit).await?;

    let mut deleted = 0;
    let mut workspace_ids = Vec::new();
    for row in &rows {
      let object_key = format!("{}/{}", row.workspace_id, row.key);
      delete_object_idempotent(self, &object_key).await?;
      let affected = store.delete_released_metadata(&row.workspace_id, &row.key).await?;
      if affected > 0 {
        deleted += affected;
        push_workspace_once(&mut workspace_ids, &row.workspace_id);
      }
    }

    Ok(RuntimeBlobCleanupResult {
      scanned: rows.len() as i64,
      deleted,
      aborted_multipart: 0,
      workspace_ids,
    })
  }
}
