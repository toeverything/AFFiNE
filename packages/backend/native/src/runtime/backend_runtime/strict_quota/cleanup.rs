use napi::Result;
use sqlx::Row;
use uuid::Uuid;

use super::{
  super::{BackendRuntime, RuntimeError, napi_error},
  StorageOperation, invalidate_storage_usage,
  promotion::{final_storage_locator, temporary_storage_locator},
};

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn cleanup_expired_storage_reservations_v1(&self, limit: i64) -> Result<i64> {
    if limit <= 0 {
      return Err(napi_error("cleanup limit must be positive"));
    }
    let pool = self.pool().await?;
    let candidates = sqlx::query(
      "SELECT 'blob' AS kind,workspace_id,NULL::varchar AS doc_id,key FROM blobs WHERE deleted_at IS NOT NULL OR \
       (status='pending' AND reservation_expires_at<=clock_timestamp()) UNION ALL SELECT 'comment_attachment' AS \
       kind,workspace_id,doc_id,key FROM comment_attachments WHERE deleted_at IS NOT NULL OR (status='pending' AND \
       reservation_expires_at<=clock_timestamp()) LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await
    .map_err(|error| RuntimeError::database("select expired storage reservations", error))?;
    let storage = self.object_storage()?;
    let mut cleaned = 0_i64;
    let mut delete_failure = None;
    let mut workspaces = std::collections::BTreeSet::new();
    for candidate in candidates {
      let kind: String = candidate.get("kind");
      let workspace_id: String = candidate.get("workspace_id");
      let doc_id: Option<String> = candidate.get("doc_id");
      let key: String = candidate.get("key");
      let final_locator = final_storage_locator(&kind, &workspace_id, doc_id.as_deref(), &key)?;
      let mut operation = StorageOperation::acquire(&pool, &workspace_id, Some(final_locator.key.as_str())).await?;
      let row = if kind == "blob" {
        sqlx::query(
          "UPDATE blobs SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE workspace_id=$1 AND key=$2 AND \
           (deleted_at IS NOT NULL OR (status='pending' AND reservation_expires_at<=clock_timestamp())) RETURNING \
           reservation_id,status::text AS status",
        )
        .bind(&workspace_id)
        .bind(&key)
        .fetch_optional(operation.connection())
        .await
      } else {
        sqlx::query(
          "UPDATE comment_attachments SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE workspace_id=$1 AND \
           doc_id=$2 AND key=$3 AND (deleted_at IS NOT NULL OR (status='pending' AND \
           reservation_expires_at<=clock_timestamp())) RETURNING reservation_id,status::text AS status",
        )
        .bind(&workspace_id)
        .bind(doc_id.as_deref())
        .bind(&key)
        .fetch_optional(operation.connection())
        .await
      }
      .map_err(|error| RuntimeError::database("claim expired storage reservation", error))?;
      let Some(row) = row else {
        operation.release().await?;
        continue;
      };
      let reservation_id: Option<Uuid> = row.get("reservation_id");
      let mut locators = vec![final_locator];
      if row.get::<String, _>("status") == "pending"
        && let Some(id) = reservation_id
      {
        locators.push(temporary_storage_locator(
          &kind,
          &workspace_id,
          doc_id.as_deref(),
          &key,
          id,
        )?);
      }
      let mut objects_deleted = true;
      for locator in locators {
        if let Err(error) = storage.delete(&locator).await {
          objects_deleted = false;
          delete_failure = Some(error.to_string());
        }
      }
      if objects_deleted {
        let result = if kind == "blob" {
          sqlx::query(
            "DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND reservation_id IS NOT DISTINCT FROM $3 AND \
             deleted_at IS NOT NULL",
          )
          .bind(&workspace_id)
          .bind(&key)
          .bind(reservation_id)
          .execute(operation.connection())
          .await
        } else {
          sqlx::query(
            "DELETE FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key=$3 AND reservation_id IS NOT \
             DISTINCT FROM $4 AND deleted_at IS NOT NULL",
          )
          .bind(&workspace_id)
          .bind(doc_id.as_deref())
          .bind(&key)
          .bind(reservation_id)
          .execute(operation.connection())
          .await
        }
        .map_err(|error| RuntimeError::database("delete cleaned storage reservation ledger", error))?;
        cleaned += i64::try_from(result.rows_affected()).unwrap_or(0);
      }
      operation.release().await?;
      workspaces.insert(workspace_id);
    }
    for workspace_id in workspaces {
      let owner_id = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
      )
      .bind(&workspace_id)
      .fetch_optional(&pool)
      .await
      .map_err(|error| RuntimeError::database("load cleanup quota owner", error))?;
      invalidate_storage_usage(self, &workspace_id, owner_id.as_deref()).await;
    }
    self
      .permission_telemetry
      .quota_guard("storage", "cleanup", "allow", "expired_pending");
    if let Some(error) = delete_failure {
      return Err(RuntimeError::invalid_state(format!("storage object cleanup failed: {error}")).into());
    }
    Ok(cleaned)
  }
}
