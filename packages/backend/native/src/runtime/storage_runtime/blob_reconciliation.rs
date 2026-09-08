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

async fn reconcile_blob_metadata(
  pool: &PgPool,
  workspace_id: &str,
  key: &str,
  metadata: RuntimeObjectMetadata,
) -> RuntimeResult<i64> {
  let size = i32::try_from(metadata.content_length)
    .map_err(|_| RuntimeError::invalid_input("blob metadata content length exceeds i32::MAX"))?;
  let changed = sqlx::query_scalar::<_, i64>(
    r#"
    WITH changed AS (
      INSERT INTO blobs (workspace_id,key,size,mime,status)
      VALUES ($1,$2,$3,$4,'completed')
      ON CONFLICT (workspace_id,key) DO UPDATE
        SET deleted_at=clock_timestamp()
      WHERE blobs.status='completed' AND blobs.deleted_at IS NULL
        AND (blobs.size<>EXCLUDED.size OR blobs.mime<>EXCLUDED.mime)
      RETURNING 1
    )
    SELECT COUNT(*) FROM changed
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .bind(size)
  .bind(metadata.content_type)
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("Blob metadata reconciliation failed", err))?;

  Ok(changed)
}

fn split_workspace_blob_key(full_key: &str) -> Option<(&str, &str)> {
  let (workspace_id, key) = full_key.split_once('/')?;
  if workspace_id.is_empty() || key.is_empty() || key.contains('/') {
    return None;
  }
  Some((workspace_id, key))
}

fn is_blob_reservation_key(full_key: &str) -> bool {
  let segments = full_key.split('/').collect::<Vec<_>>();
  matches!(segments.as_slice(), [workspace_id, ".reservations", reservation_id, key]
    if !workspace_id.is_empty() && !reservation_id.is_empty() && !key.is_empty())
}

fn checkpoint_scope(workspace_id: Option<&str>) -> String {
  workspace_id.unwrap_or("__all__").to_string()
}

#[derive(FromRow)]
struct BackfillCheckpoint {
  status: String,
  last_key: Option<String>,
  cursor: serde_json::Value,
}

impl BackfillCheckpoint {
  fn continuation_token(&self) -> Option<String> {
    if self.status == "completed" {
      return None;
    }
    self
      .cursor
      .get("continuationToken")
      .and_then(|value| value.as_str())
      .map(ToString::to_string)
  }

  fn last_key(&self) -> Option<String> {
    (self.status != "completed").then(|| self.last_key.clone()).flatten()
  }
}

async fn load_checkpoint(pool: &PgPool, scope: &str) -> RuntimeResult<Option<BackfillCheckpoint>> {
  sqlx::query_as::<_, BackfillCheckpoint>(
    "SELECT status, last_key, cursor FROM storage_reconciliation_checkpoints WHERE kind = 'blob_metadata_backfill' \
     AND scope = $1",
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
  failed: bool,
) -> RuntimeResult<()> {
  let status = if failed {
    "failed"
  } else if completed {
    "completed"
  } else {
    "running"
  };
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints
      (kind, scope, status, cursor, last_key, completed_at, metadata)
    VALUES ('blob_metadata_backfill', $1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END, $6)
    ON CONFLICT (kind, scope) DO UPDATE
      SET status = EXCLUDED.status,
          cursor = EXCLUDED.cursor,
          last_key = COALESCE(EXCLUDED.last_key, storage_reconciliation_checkpoints.last_key),
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
  use sqlx::postgres::PgPoolOptions;
  use uuid::Uuid;

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
    assert!(is_blob_reservation_key("workspace/.reservations/reservation/blob-key"));
    assert!(!is_blob_reservation_key("workspace/nested/blob-key"));
  }

  #[test]
  fn blob_metadata_backfill_checkpoint_scope_is_explicit() {
    assert_eq!(checkpoint_scope(Some("workspace")), "workspace");
    assert_eq!(checkpoint_scope(None), "__all__");
    let completed = BackfillCheckpoint {
      status: "completed".to_string(),
      last_key: Some("z-last".to_string()),
      cursor: serde_json::json!({ "continuationToken": "stale-token" }),
    };
    assert_eq!(completed.continuation_token(), None);
    assert_eq!(completed.last_key(), None);
  }

  #[tokio::test]
  async fn metadata_reconciliation_inserts_missing_and_denies_mismatch() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let pool = PgPoolOptions::new()
      .max_connections(1)
      .connect(&database_url)
      .await
      .unwrap();
    let workspace_id = format!("blob-metadata-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO workspaces(id,created_at) VALUES($1,CURRENT_TIMESTAMP)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();

    let metadata = RuntimeObjectMetadata {
      content_type: "image/png".to_string(),
      content_length: 42,
      last_modified_ms: 1,
      checksum_crc32: None,
    };
    assert_eq!(
      reconcile_blob_metadata(&pool, &workspace_id, "asset", metadata)
        .await
        .unwrap(),
      1
    );
    let inserted: (i32, String, String, bool) = sqlx::query_as(
      "SELECT size,mime,status::text,deleted_at IS NULL FROM blobs WHERE workspace_id=$1 AND key='asset'",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(inserted, (42, "image/png".to_string(), "completed".to_string(), true));

    assert_eq!(
      reconcile_blob_metadata(
        &pool,
        &workspace_id,
        "asset",
        RuntimeObjectMetadata {
          content_type: "image/jpeg".to_string(),
          content_length: 43,
          last_modified_ms: 2,
          checksum_crc32: None,
        },
      )
      .await
      .unwrap(),
      1
    );
    let readable: bool = sqlx::query_scalar(
      "SELECT status='completed' AND deleted_at IS NULL FROM blobs WHERE workspace_id=$1 AND key='asset'",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!readable);

    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(workspace_id)
      .execute(&pool)
      .await
      .unwrap();
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
        crate::runtime::object_storage::types::StorageScope::Blob,
        prefix,
        checkpoint.as_ref().and_then(BackfillCheckpoint::continuation_token),
        checkpoint.as_ref().and_then(BackfillCheckpoint::last_key),
        None,
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
      if is_blob_reservation_key(&object.key) {
        result.skipped_existing += 1;
        continue;
      }
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
      result.headed_objects += 1;
      let Some(metadata) = self.object_storage_head(object.key.clone()).await? else {
        result.skipped_existing += 1;
        continue;
      };
      let affected = match reconcile_blob_metadata(&pool, object_workspace_id, key, metadata).await {
        Ok(affected) => affected,
        Err(RuntimeError::InvalidInput(_)) => {
          result.failed += 1;
          continue;
        }
        Err(error) => return Err(error.into()),
      };
      if affected > 0 {
        result.upserted_metadata += affected;
        push_workspace_once(&mut result.workspace_ids, object_workspace_id);
      } else {
        result.skipped_existing += 1;
      }
    }
    if has_more && result.failed == 0 {
      result.next_cursor = last_scanned_key.clone();
    }
    let checkpoint_last_key = if result.failed == 0 {
      last_scanned_key.as_deref()
    } else {
      checkpoint.as_ref().and_then(|checkpoint| {
        (checkpoint.status != "completed")
          .then_some(checkpoint.last_key.as_deref())
          .flatten()
      })
    };
    let previous_continuation = checkpoint.as_ref().and_then(BackfillCheckpoint::continuation_token);
    let checkpoint_token = if result.failed == 0 {
      page.next_continuation_token.as_deref()
    } else {
      previous_continuation.as_deref()
    };
    upsert_checkpoint(
      &pool,
      &scope,
      checkpoint_last_key,
      checkpoint_token,
      !has_more && result.failed == 0,
      result.failed > 0,
    )
    .await?;

    Ok(result)
  }
}
