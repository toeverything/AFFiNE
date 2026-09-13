use serde_json::json;
use sqlx::{PgConnection, PgPool, Row};

use super::{RuntimeError, RuntimeWorkspaceStorageReconcileResult, StorageOperation};

pub(super) async fn load_integer_cursor(pool: &PgPool, kind: &str, scope: &str) -> napi::Result<i32> {
  let row = sqlx::query("SELECT status, cursor FROM storage_reconciliation_checkpoints WHERE kind = $1 AND scope = $2")
    .bind(kind)
    .bind(scope)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load workspace reconciliation cursor", error))?;
  let Some(row) = row else {
    return Ok(0);
  };
  if row.try_get::<String, _>("status").unwrap_or_default() == "completed" {
    return Ok(0);
  }
  Ok(
    row
      .try_get::<serde_json::Value, _>("cursor")
      .ok()
      .and_then(|cursor| cursor.get("lastSid").and_then(serde_json::Value::as_i64))
      .and_then(|sid| i32::try_from(sid).ok())
      .unwrap_or(0),
  )
}

pub(super) async fn save_integer_cursor(
  pool: &PgPool,
  kind: &str,
  scope: &str,
  last_sid: i32,
  completed: bool,
) -> napi::Result<()> {
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, completed_at)
    VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT (kind, scope) DO UPDATE SET
      status = EXCLUDED.status, cursor = EXCLUDED.cursor,
      completed_at = EXCLUDED.completed_at, updated_at = CURRENT_TIMESTAMP
    "#,
  )
  .bind(kind)
  .bind(scope)
  .bind(if completed { "completed" } else { "running" })
  .bind(json!({ "lastSid": last_sid }))
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("save workspace reconciliation cursor", error))?;
  Ok(())
}

pub(super) async fn load_object_cursor(pool: &PgPool, scope: &str) -> napi::Result<Option<String>> {
  let row = sqlx::query(
    "SELECT status, cursor FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_storage_namespace' AND \
     scope = $1",
  )
  .bind(scope)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load namespace reconciliation cursor", error))?;
  let Some(row) = row else {
    return Ok(None);
  };
  if row.try_get::<String, _>("status").unwrap_or_default() == "completed" {
    return Ok(None);
  }
  Ok(row.try_get::<serde_json::Value, _>("cursor").ok().and_then(|cursor| {
    cursor
      .get("continuationToken")
      .and_then(serde_json::Value::as_str)
      .map(str::to_string)
  }))
}

pub(super) async fn save_object_cursor(pool: &PgPool, scope: &str, token: Option<&str>) -> napi::Result<()> {
  let completed = token.is_none();
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, completed_at)
    VALUES ('workspace_storage_namespace', $1, $2, $3, CASE WHEN $2 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT (kind, scope) DO UPDATE SET
      status = EXCLUDED.status, cursor = EXCLUDED.cursor,
      completed_at = EXCLUDED.completed_at, updated_at = CURRENT_TIMESTAMP
    "#,
  )
  .bind(scope)
  .bind(if completed { "completed" } else { "running" })
  .bind(json!({ "continuationToken": token }))
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("save namespace reconciliation cursor", error))?;
  Ok(())
}

pub(super) async fn mark_checkpoint_failed(pool: &PgPool, kind: &str, scope: &str) -> napi::Result<()> {
  sqlx::query(
    "UPDATE storage_reconciliation_checkpoints SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE kind = $1 \
     AND scope = $2",
  )
  .bind(kind)
  .bind(scope)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("mark namespace reconciliation failed", error))?;
  Ok(())
}

pub(super) async fn reconcile_orphan_storage_rows(
  pool: &PgPool,
  limit: i32,
  result: &mut RuntimeWorkspaceStorageReconcileResult,
) -> napi::Result<()> {
  let last_id = load_string_cursor(pool, "workspace_storage_orphan_rows", "storage").await?;
  let ids = sqlx::query_scalar::<_, String>(
    r#"
    WITH storage_workspace_ids AS (
      SELECT workspace_id FROM doc_blob_refs
      UNION SELECT workspace_id FROM doc_blob_ref_projections
      UNION SELECT workspace_id FROM document_cleanup_candidates
      UNION SELECT workspace_id FROM snapshots
      UNION SELECT workspace_id FROM updates
      UNION SELECT workspace_id FROM snapshot_histories
    )
    SELECT storage.workspace_id
    FROM storage_workspace_ids storage
    WHERE storage.workspace_id > $1
      AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = storage.workspace_id)
    ORDER BY storage.workspace_id
    LIMIT $2
    "#,
  )
  .bind(&last_id)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("list orphan storage rows", error))?;
  for workspace_id in &ids {
    let mut operation = StorageOperation::acquire(pool, workspace_id, None).await?;
    result.deleted_orphan_rows = result
      .deleted_orphan_rows
      .saturating_add(delete_orphan_storage_rows(operation.connection(), workspace_id).await?);
    operation.release().await?;
  }
  let completed = ids.len() < limit as usize;
  save_string_cursor(
    pool,
    "workspace_storage_orphan_rows",
    "storage",
    if completed {
      ""
    } else {
      ids.last().map(String::as_str).unwrap_or("")
    },
    completed,
  )
  .await?;
  Ok(())
}

pub(super) async fn delete_orphan_storage_rows(connection: &mut PgConnection, workspace_id: &str) -> napi::Result<i64> {
  let mut deleted = 0_i64;
  for table in [
    "snapshots",
    "updates",
    "snapshot_histories",
    "doc_blob_refs",
    "doc_blob_ref_projections",
    "document_cleanup_candidates",
  ] {
    let outcome = sqlx::query(&format!("DELETE FROM {table} WHERE workspace_id = $1"))
      .bind(workspace_id)
      .execute(&mut *connection)
      .await
      .map_err(|error| RuntimeError::database("delete orphan storage rows", error))?;
    deleted = deleted.saturating_add(i64::try_from(outcome.rows_affected()).unwrap_or(i64::MAX));
  }
  let checkpoints = sqlx::query(
    "DELETE FROM storage_reconciliation_checkpoints WHERE scope = $1 AND kind IN ('doc_blob_refs', \
     'document_cleanup', 'blob_cleanup', 'blob_metadata_backfill')",
  )
  .bind(workspace_id)
  .execute(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("delete orphan storage checkpoints", error))?;
  deleted = deleted.saturating_add(i64::try_from(checkpoints.rows_affected()).unwrap_or(i64::MAX));
  Ok(deleted)
}

async fn load_string_cursor(pool: &PgPool, kind: &str, scope: &str) -> napi::Result<String> {
  let row = sqlx::query("SELECT status, cursor FROM storage_reconciliation_checkpoints WHERE kind = $1 AND scope = $2")
    .bind(kind)
    .bind(scope)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load storage orphan cursor", error))?;
  let Some(row) = row else {
    return Ok(String::new());
  };
  if row.try_get::<String, _>("status").unwrap_or_default() == "completed" {
    return Ok(String::new());
  }
  Ok(
    row
      .try_get::<serde_json::Value, _>("cursor")
      .ok()
      .and_then(|cursor| {
        cursor
          .get("lastWorkspaceId")
          .and_then(serde_json::Value::as_str)
          .map(str::to_string)
      })
      .unwrap_or_default(),
  )
}

async fn save_string_cursor(
  pool: &PgPool,
  kind: &str,
  scope: &str,
  last_id: &str,
  completed: bool,
) -> napi::Result<()> {
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, completed_at)
    VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT (kind, scope) DO UPDATE SET
      status = EXCLUDED.status, cursor = EXCLUDED.cursor,
      completed_at = EXCLUDED.completed_at, updated_at = CURRENT_TIMESTAMP
    "#,
  )
  .bind(kind)
  .bind(scope)
  .bind(if completed { "completed" } else { "running" })
  .bind(json!({ "lastWorkspaceId": last_id }))
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("save storage orphan cursor", error))?;
  Ok(())
}
