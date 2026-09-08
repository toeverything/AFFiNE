use chrono::{DateTime, Duration, Utc};
use sqlx::{FromRow, PgConnection, PgPool};
use uuid::Uuid;

use super::{
  RuntimeBlobCleanupResult, RuntimeError, RuntimeResult, StorageOperation, StorageRuntime,
  doc_blob_refs::PARSER_VERSION, load_workspace_canonical_doc_ids, napi_error,
};

#[derive(FromRow)]
struct BlobRow {
  workspace_id: String,
  key: String,
  size: i32,
  reservation_id: Option<Uuid>,
  deleted_at: Option<DateTime<Utc>>,
}

async fn checkpoint_completed(pool: &PgPool, kind: &str, scope: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind = $1 AND scope = $2 AND status = \
     'completed')",
  )
  .bind(kind)
  .bind(scope)
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup checkpoint check failed", error))
}

async fn projection_is_stale(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<bool> {
  let completed_at = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
    r#"
    SELECT MIN(completed_at)
    FROM storage_reconciliation_checkpoints
    WHERE scope = $1
      AND kind IN ('document_cleanup', 'doc_blob_refs')
      AND status = 'completed'
    HAVING COUNT(*) = 2
    "#,
  )
  .bind(workspace_id)
  .fetch_optional(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup retention checkpoint load failed", error))?
  .flatten();
  let Some(completed_at) = completed_at else {
    return Ok(true);
  };
  let activity_after_checkpoint = sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(
      SELECT 1 FROM snapshots WHERE workspace_id = $1 AND updated_at > $2
      UNION ALL SELECT 1 FROM updates WHERE workspace_id = $1 AND created_at > $2
      UNION ALL SELECT 1 FROM snapshot_histories WHERE workspace_id = $1 AND timestamp > $2
    )
    "#,
  )
  .bind(workspace_id)
  .bind(completed_at)
  .fetch_one(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup retention activity check failed", error))?;
  if sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM updates WHERE workspace_id = $1)")
    .bind(workspace_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| RuntimeError::database("Blob cleanup pending update check failed", error))?
  {
    return Ok(true);
  }

  let mut current_doc_ids = match load_workspace_canonical_doc_ids(&mut *connection, workspace_id).await {
    Ok(ids) => ids,
    Err(_) => return Ok(true),
  };
  current_doc_ids.push(workspace_id.to_string());
  current_doc_ids.extend(
    sqlx::query_scalar::<_, String>(
      "SELECT doc_id FROM document_cleanup_candidates WHERE workspace_id = $1 AND status IN ('marked', 'failed')",
    )
    .bind(workspace_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| RuntimeError::database("Blob cleanup retained document load failed", error))?,
  );
  current_doc_ids.sort();
  current_doc_ids.dedup();
  let projection_invalid = sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(
      SELECT 1
      FROM unnest($2::text[]) AS ids(doc_id)
      LEFT JOIN snapshots s ON s.workspace_id = $1 AND s.guid = ids.doc_id
      LEFT JOIN doc_blob_ref_projections p ON p.workspace_id = $1 AND p.doc_id = ids.doc_id
      WHERE s.guid IS NULL
         OR p.doc_id IS NULL
         OR p.status <> 'fresh'
         OR p.parser_version <> $3
         OR p.source_revision IS DISTINCT FROM s.updated_at
    )
    OR EXISTS(
      SELECT 1 FROM doc_blob_ref_projections
      WHERE workspace_id = $1 AND status <> 'fresh'
    )
    OR EXISTS(
      SELECT 1
      FROM doc_blob_refs r
      LEFT JOIN doc_blob_ref_projections p
        ON p.workspace_id = r.workspace_id AND p.doc_id = r.doc_id
      WHERE r.workspace_id = $1
        AND (
          p.doc_id IS NULL
          OR p.status <> 'fresh'
          OR r.parser_version <> p.parser_version
          OR r.snapshot_updated_at IS DISTINCT FROM p.source_revision
        )
    )
    "#,
  )
  .bind(workspace_id)
  .bind(&current_doc_ids)
  .bind(PARSER_VERSION)
  .fetch_one(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup projection state check failed", error))?;
  let stale_refs = sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM doc_blob_refs WHERE workspace_id = $1 AND status <> 'fresh')",
  )
  .bind(workspace_id)
  .fetch_one(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup projection freshness check failed", error))?;
  Ok(activity_after_checkpoint || projection_invalid || stale_refs)
}

async fn has_doc_ref<'a>(
  executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
  workspace_id: &str,
  key: &str,
) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(
      SELECT 1
      FROM doc_blob_refs r
      JOIN doc_blob_ref_projections p
        ON p.workspace_id = r.workspace_id AND p.doc_id = r.doc_id
      WHERE r.workspace_id = $1
        AND r.blob_key = $2
        AND r.status = 'fresh'
        AND p.status = 'fresh'
        AND p.parser_version = $3
        AND r.parser_version = p.parser_version
        AND r.snapshot_updated_at = p.source_revision
    )
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .bind(PARSER_VERSION)
  .fetch_one(executor)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup doc ref check failed", error))
}

async fn has_other_ref<'a>(
  executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
  workspace_id: &str,
  key: &str,
) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1 AND avatar_key = $2)
      OR EXISTS(SELECT 1 FROM ai_transcript_tasks WHERE workspace_id = $1 AND blob_id = $2)
      OR EXISTS(SELECT 1 FROM ai_jobs WHERE workspace_id = $1 AND blob_id = $2)
      OR EXISTS(
        SELECT 1 FROM workspace_artifacts
        WHERE workspace_id = $1
          AND storage_scope = 'blob'
          AND storage_key = concat($1, '/', $2)
          AND status IN ('reserving', 'ready')
      )
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .fetch_one(executor)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup protected ref check failed", error))
}

async fn load_cursor(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Option<String>> {
  let row = sqlx::query_as::<_, (String, serde_json::Value)>(
    "SELECT status, cursor FROM storage_reconciliation_checkpoints WHERE kind = 'blob_cleanup' AND scope = $1",
  )
  .bind(workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup checkpoint load failed", error))?;
  let Some((status, cursor)) = row else {
    return Ok(None);
  };
  if status == "completed" {
    return Ok(None);
  }
  Ok(
    cursor
      .get("lastBlobKey")
      .and_then(|value| value.as_str())
      .map(str::to_string),
  )
}

async fn save_cursor(
  pool: &PgPool,
  workspace_id: &str,
  last_blob_key: Option<&str>,
  completed: bool,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints
      (kind, scope, status, cursor, last_key, completed_at)
    VALUES ('blob_cleanup', $1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT (kind, scope) DO UPDATE SET
      status = EXCLUDED.status,
      cursor = EXCLUDED.cursor,
      last_key = EXCLUDED.last_key,
      completed_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
    "#,
  )
  .bind(workspace_id)
  .bind(if completed { "completed" } else { "running" })
  .bind(serde_json::json!({ "lastBlobKey": last_blob_key }))
  .bind(last_blob_key)
  .bind(completed)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup checkpoint write failed", error))?;
  Ok(())
}

async fn load_denied(pool: &PgPool, workspace_id: &str, limit: i64) -> RuntimeResult<Vec<BlobRow>> {
  sqlx::query_as::<_, BlobRow>(
    r#"
    SELECT workspace_id, key, size, reservation_id, deleted_at
    FROM blobs
    WHERE workspace_id = $1 AND status = 'completed' AND deleted_at IS NOT NULL
    ORDER BY deleted_at, key
    LIMIT $2
    "#,
  )
  .bind(workspace_id)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup denied row load failed", error))
}

async fn load_live(
  pool: &PgPool,
  workspace_id: &str,
  after_key: Option<&str>,
  limit: i64,
) -> RuntimeResult<Vec<BlobRow>> {
  sqlx::query_as::<_, BlobRow>(
    r#"
    SELECT workspace_id, key, size, reservation_id, deleted_at
    FROM blobs
    WHERE workspace_id = $1
      AND status = 'completed'
      AND deleted_at IS NULL
      AND ($2::text IS NULL OR key > $2)
    ORDER BY key
    LIMIT $3
    "#,
  )
  .bind(workspace_id)
  .bind(after_key)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup live row load failed", error))
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn cleanup_unreferenced_workspace_blobs(
    &self,
    workspace_id: String,
    grace_period_days: i64,
    limit: i64,
  ) -> napi::Result<RuntimeBlobCleanupResult> {
    if limit <= 0 {
      return Err(napi_error("blob cleanup limit must be positive"));
    }
    if grace_period_days < 0 {
      return Err(napi_error("blob cleanup grace period must be non-negative"));
    }
    let pool = self.pool().await?;
    let mut result = RuntimeBlobCleanupResult {
      scanned_blobs: 0,
      deleted_objects: 0,
      deleted_metadata: 0,
      protected_by_doc_refs: 0,
      protected_by_metadata: 0,
      protected_by_other_refs: 0,
      failed: 0,
      next_cursor: None,
      workspace_ids: Vec::new(),
    };
    let cursor = load_cursor(&pool, &workspace_id).await?;
    if !checkpoint_completed(&pool, "blob_metadata_backfill", &workspace_id).await?
      || projection_is_stale(
        &mut *pool
          .acquire()
          .await
          .map_err(|error| RuntimeError::database("acquire retention projection connection", error))?,
        &workspace_id,
      )
      .await?
    {
      result.protected_by_metadata = load_live(&pool, &workspace_id, cursor.as_deref(), limit).await?.len() as i64;
      return Ok(result);
    }

    let denied = load_denied(&pool, &workspace_id, limit).await?;
    let recovering = !denied.is_empty();
    let rows = if recovering {
      denied
    } else {
      load_live(&pool, &workspace_id, cursor.as_deref(), limit).await?
    };
    result.scanned_blobs = rows.len() as i64;
    let has_more = recovering || rows.len() == limit as usize;
    let last_key = rows.last().map(|row| row.key.clone());
    let minimum_modified = Utc::now() - Duration::days(grace_period_days);
    for row in rows {
      if self
        .cleanup_blob_row(&pool, &row, minimum_modified, &mut result)
        .await
        .is_err()
      {
        result.failed += 1;
      }
    }
    if recovering {
      result.next_cursor = cursor;
    } else {
      result.next_cursor = has_more.then_some(last_key.clone()).flatten();
      save_cursor(&pool, &workspace_id, last_key.as_deref(), !has_more).await?;
    }
    Ok(result)
  }
}

impl StorageRuntime {
  async fn cleanup_blob_row(
    &self,
    pool: &PgPool,
    row: &BlobRow,
    minimum_modified: DateTime<Utc>,
    result: &mut RuntimeBlobCleanupResult,
  ) -> RuntimeResult<()> {
    let object_key = format!("{}/{}", row.workspace_id, row.key);
    let mut operation = StorageOperation::acquire(pool, &row.workspace_id, None).await?;
    let outcome = async {
      if projection_is_stale(operation.connection(), &row.workspace_id).await? {
        result.protected_by_metadata += 1;
        return Ok(());
      }
      let doc_ref = has_doc_ref(operation.connection(), &row.workspace_id, &row.key).await?;
      let other_ref = has_other_ref(operation.connection(), &row.workspace_id, &row.key).await?;
      let metadata = self.object_storage_head(object_key.clone()).await?;
      if doc_ref || other_ref {
        if row.deleted_at.is_some() && metadata.is_some() {
          sqlx::query(
            "UPDATE blobs SET deleted_at = NULL WHERE workspace_id = $1 AND key = $2 AND reservation_id IS NOT \
             DISTINCT FROM $3 AND deleted_at IS NOT NULL",
          )
          .bind(&row.workspace_id)
          .bind(&row.key)
          .bind(row.reservation_id)
          .execute(operation.connection())
          .await
          .map_err(|error| RuntimeError::database("restore referenced blob cleanup row", error))?;
        }
        if doc_ref {
          result.protected_by_doc_refs += 1;
        }
        if other_ref {
          result.protected_by_other_refs += 1;
        }
        return Ok(());
      }
      if row.deleted_at.is_none() {
        let Some(metadata) = metadata.as_ref() else {
          result.protected_by_metadata += 1;
          return Ok(());
        };
        let modified = DateTime::<Utc>::from_timestamp_millis(metadata.last_modified_ms)
          .ok_or_else(|| RuntimeError::invalid_state("blob cleanup object last modified is invalid"))?;
        if metadata.content_length != i64::from(row.size) || modified > minimum_modified {
          result.protected_by_metadata += 1;
          return Ok(());
        }
        let denied = sqlx::query_scalar::<_, bool>(
          "UPDATE blobs SET deleted_at = clock_timestamp(), reservation_expires_at = NULL WHERE workspace_id = $1 AND \
           key = $2 AND status = 'completed' AND deleted_at IS NULL AND reservation_id IS NOT DISTINCT FROM $3 \
           RETURNING true",
        )
        .bind(&row.workspace_id)
        .bind(&row.key)
        .bind(row.reservation_id)
        .fetch_optional(operation.connection())
        .await
        .map_err(|error| RuntimeError::database("deny unreferenced blob", error))?
        .unwrap_or(false);
        if !denied {
          return Ok(());
        }
      }
      if metadata.is_some() {
        let locator = super::ObjectLocator::new(super::StorageScope::Blob, super::ObjectKey::new(object_key)?);
        self.object_storage()?.delete(&locator).await?;
        result.deleted_objects += 1;
      }
      let deleted = sqlx::query(
        "DELETE FROM blobs WHERE workspace_id = $1 AND key = $2 AND status = 'completed' AND deleted_at IS NOT NULL \
         AND reservation_id IS NOT DISTINCT FROM $3",
      )
      .bind(&row.workspace_id)
      .bind(&row.key)
      .bind(row.reservation_id)
      .execute(operation.connection())
      .await
      .map_err(|error| RuntimeError::database("delete unreferenced blob ledger", error))?
      .rows_affected() as i64;
      result.deleted_metadata += deleted;
      if deleted > 0 && !result.workspace_ids.iter().any(|id| id == &row.workspace_id) {
        result.workspace_ids.push(row.workspace_id.clone());
      }
      Ok(())
    }
    .await;
    let released = operation.release().await;
    outcome.and(released)
  }
}

#[cfg(test)]
mod tests {
  use uuid::Uuid;

  use super::*;

  #[tokio::test]
  async fn artifact_blob_alias_is_a_cleanup_reference_until_deleting() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = crate::runtime::migrations::EMBEDDING_TEST_LOCK.lock().await;
    let pool = PgPool::connect(&database_url).await.unwrap();
    let suffix = Uuid::new_v4().simple().to_string();
    let workspace_id = format!("blob-cleanup-ws-{suffix}");
    let blob_key = format!("blob-{suffix}");
    let artifact_id = Uuid::new_v4();

    sqlx::query("INSERT INTO workspaces (id, created_at) VALUES ($1, CURRENT_TIMESTAMP)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"
      INSERT INTO workspace_artifacts (
        id, workspace_id, content_hash, canonical_media_type, size_bytes,
        storage_scope, storage_key, status, ready_at
      )
      VALUES ($1, $2, $3, 'application/octet-stream', 1, 'blob', $4, 'reserving', NULL)
      "#,
    )
    .bind(artifact_id)
    .bind(&workspace_id)
    .bind(format!("sha256-{suffix}"))
    .bind(format!("{workspace_id}/{blob_key}"))
    .execute(&pool)
    .await
    .unwrap();

    assert!(has_other_ref(&pool, &workspace_id, &blob_key).await.unwrap());
    sqlx::query("UPDATE workspace_artifacts SET status = 'ready', ready_at = CURRENT_TIMESTAMP WHERE id = $1")
      .bind(artifact_id)
      .execute(&pool)
      .await
      .unwrap();
    assert!(has_other_ref(&pool, &workspace_id, &blob_key).await.unwrap());
    sqlx::query("UPDATE workspace_artifacts SET status = 'deleting' WHERE id = $1")
      .bind(artifact_id)
      .execute(&pool)
      .await
      .unwrap();
    assert!(!has_other_ref(&pool, &workspace_id, &blob_key).await.unwrap());

    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
