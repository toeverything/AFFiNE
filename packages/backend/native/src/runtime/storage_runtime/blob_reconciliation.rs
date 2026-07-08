use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};

use super::{
  RuntimeBlobMetadataBackfillResult, RuntimeError, RuntimeObjectMetadata, RuntimeResult, StorageRuntime, napi_error,
};

async fn workspace_exists(pool: &PgPool, workspace_id: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
    .bind(workspace_id)
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("Blob metadata backfill workspace check failed", err))
}

async fn blob_exists(pool: &PgPool, workspace_id: &str, key: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id = $1 AND key = $2)")
    .bind(workspace_id)
    .bind(key)
    .fetch_one(pool)
    .await
    .map_err(|err| RuntimeError::database("Blob metadata backfill blob check failed", err))
}

async fn upsert_blob_metadata(
  pool: &PgPool,
  workspace_id: &str,
  key: &str,
  metadata: RuntimeObjectMetadata,
) -> RuntimeResult<i64> {
  let last_modified = DateTime::<Utc>::from_timestamp_millis(metadata.last_modified_ms)
    .ok_or_else(|| RuntimeError::invalid_state("Blob metadata backfill object last modified is invalid"))?;
  let result = sqlx::query(
    r#"
    INSERT INTO blobs (workspace_id, key, size, mime, status, upload_id, created_at, deleted_at)
    VALUES ($1, $2, $3, $4, 'completed', NULL, $5, NULL)
    ON CONFLICT (workspace_id, key) DO UPDATE
      SET size = EXCLUDED.size,
          mime = EXCLUDED.mime,
          status = 'completed',
          upload_id = NULL,
          deleted_at = NULL
      WHERE blobs.deleted_at IS NULL
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .bind(metadata.content_length as i32)
  .bind(metadata.content_type)
  .bind(last_modified)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob metadata backfill upsert failed", err))?;

  Ok(result.rows_affected() as i64)
}

fn split_workspace_blob_key(full_key: &str) -> Option<(&str, &str)> {
  let (workspace_id, key) = full_key.split_once('/')?;
  if workspace_id.is_empty() || key.is_empty() || key.contains('/') {
    return None;
  }
  Some((workspace_id, key))
}

fn checkpoint_scope(workspace_id: Option<&str>) -> String {
  workspace_id.unwrap_or("__all__").to_string()
}

#[derive(FromRow)]
struct BackfillCheckpoint {
  last_key: Option<String>,
  cursor: serde_json::Value,
}

impl BackfillCheckpoint {
  fn continuation_token(&self) -> Option<String> {
    self
      .cursor
      .get("continuationToken")
      .and_then(|value| value.as_str())
      .map(ToString::to_string)
  }
}

async fn load_checkpoint(pool: &PgPool, scope: &str) -> RuntimeResult<Option<BackfillCheckpoint>> {
  sqlx::query_as::<_, BackfillCheckpoint>(
    "SELECT last_key, cursor FROM blob_reconciliation_checkpoints WHERE kind = 'blob_metadata_backfill' AND scope = $1",
  )
  .bind(scope)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob metadata backfill checkpoint load failed", err))
}

async fn upsert_checkpoint(
  pool: &PgPool,
  scope: &str,
  last_key: Option<&str>,
  continuation_token: Option<&str>,
  completed: bool,
) -> RuntimeResult<()> {
  let status = if completed { "completed" } else { "running" };
  sqlx::query(
    r#"
    INSERT INTO blob_reconciliation_checkpoints
      (kind, scope, status, cursor, last_key, completed_at, metadata)
    VALUES ('blob_metadata_backfill', $1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END, $6)
    ON CONFLICT (kind, scope) DO UPDATE
      SET status = EXCLUDED.status,
          cursor = EXCLUDED.cursor,
          last_key = COALESCE(EXCLUDED.last_key, blob_reconciliation_checkpoints.last_key),
          completed_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP,
          metadata = EXCLUDED.metadata
    "#,
  )
  .bind(scope)
  .bind(status)
  .bind(serde_json::json!({
    "lastKey": last_key,
    "continuationToken": continuation_token,
  }))
  .bind(last_key)
  .bind(completed)
  .bind(serde_json::json!({
    "quotaReportingReconciliationRequired": true,
  }))
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob metadata backfill checkpoint write failed", err))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn blob_metadata_backfill_splits_workspace_blob_keys() {
    assert_eq!(
      split_workspace_blob_key("workspace/blob-key"),
      Some(("workspace", "blob-key"))
    );
    assert_eq!(split_workspace_blob_key("workspace/nested/blob-key"), None);
    assert_eq!(split_workspace_blob_key("workspace/"), None);
    assert_eq!(split_workspace_blob_key("blob-key"), None);
  }

  #[test]
  fn blob_metadata_backfill_checkpoint_scope_is_explicit() {
    assert_eq!(checkpoint_scope(Some("workspace")), "workspace");
    assert_eq!(checkpoint_scope(None), "__all__");
  }
}

fn push_workspace_once(workspace_ids: &mut Vec<String>, workspace_id: &str) {
  if !workspace_ids.iter().any(|id| id == workspace_id) {
    workspace_ids.push(workspace_id.to_string());
  }
}

fn checked_list_page_limit(limit: i64) -> RuntimeResult<i32> {
  i32::try_from(limit).map_err(|_| RuntimeError::invalid_input("blob metadata backfill limit exceeds i32::MAX"))
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn backfill_missing_blob_metadata(
    &self,
    workspace_id: Option<String>,
    limit: i64,
  ) -> napi::Result<RuntimeBlobMetadataBackfillResult> {
    if limit <= 0 {
      return Err(napi_error("blob metadata backfill limit must be positive"));
    }
    let page_limit = checked_list_page_limit(limit)?;

    let pool = self.pool().await?;
    let prefix = workspace_id.as_ref().map(|id| format!("{id}/"));
    let scope = checkpoint_scope(workspace_id.as_deref());
    let checkpoint = load_checkpoint(&pool, &scope).await?;
    let page = self
      .object_storage_list_page(
        prefix,
        checkpoint.as_ref().and_then(BackfillCheckpoint::continuation_token),
        checkpoint.as_ref().and_then(|checkpoint| checkpoint.last_key.clone()),
        page_limit,
      )
      .await?;
    let has_more = page.next_continuation_token.is_some();

    let mut result = RuntimeBlobMetadataBackfillResult {
      scanned_objects: 0,
      headed_objects: 0,
      upserted_metadata: 0,
      skipped_existing: 0,
      skipped_workspace_missing: 0,
      failed: 0,
      next_cursor: None,
      workspace_ids: Vec::new(),
    };

    let mut last_scanned_key = None;
    for object in &page.entries {
      result.scanned_objects += 1;
      last_scanned_key = Some(object.key.clone());
      let Some((object_workspace_id, key)) = split_workspace_blob_key(&object.key) else {
        result.failed += 1;
        continue;
      };
      if workspace_id.as_deref().is_some_and(|id| id != object_workspace_id) {
        result.failed += 1;
        continue;
      }
      if !workspace_exists(&pool, object_workspace_id).await? {
        result.skipped_workspace_missing += 1;
        continue;
      }
      if blob_exists(&pool, object_workspace_id, key).await? {
        result.skipped_existing += 1;
        continue;
      }
      result.headed_objects += 1;
      let Some(metadata) = self.object_storage_head(object.key.clone()).await? else {
        result.failed += 1;
        continue;
      };
      let affected = upsert_blob_metadata(&pool, object_workspace_id, key, metadata).await?;
      if affected > 0 {
        result.upserted_metadata += affected;
        push_workspace_once(&mut result.workspace_ids, object_workspace_id);
      }
    }
    if has_more {
      result.next_cursor = last_scanned_key.clone();
    }
    upsert_checkpoint(
      &pool,
      &scope,
      last_scanned_key.as_deref(),
      page.next_continuation_token.as_deref(),
      !has_more,
    )
    .await?;

    sqlx::query(
      r#"
      INSERT INTO blob_reconciliation_runs
        (kind, mode, status, workspace_id, finished_at, scanned, changed, failed, metadata)
      VALUES ('blob_metadata_backfill', 'execute', 'finished', $1, CURRENT_TIMESTAMP, $2, $3, $4, $5)
      "#,
    )
    .bind(workspace_id)
    .bind(result.scanned_objects as i32)
    .bind(result.upserted_metadata as i32)
    .bind(result.failed as i32)
    .bind(serde_json::json!({
      "headedObjects": result.headed_objects,
      "skippedExisting": result.skipped_existing,
      "skippedWorkspaceMissing": result.skipped_workspace_missing,
      "checkpointScope": scope,
      "nextCursor": result.next_cursor,
      "quotaReportingReconciliationRequired": true,
    }))
    .execute(&pool)
    .await
    .map_err(|err| RuntimeError::database("Blob metadata backfill run record failed", err))?;

    Ok(result)
  }
}
