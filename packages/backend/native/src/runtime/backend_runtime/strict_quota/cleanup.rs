use napi::Result;
use sqlx::Row;

use super::{
  super::{BackendRuntime, RuntimeError, napi_error},
  invalidate_storage_usage,
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
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start storage reservation cleanup", error))?;
    let blobs = sqlx::query(
      r#"UPDATE blobs SET deleted_at=COALESCE(deleted_at,clock_timestamp())
        WHERE ctid IN (SELECT ctid FROM blobs WHERE
          (status='pending' AND reservation_expires_at <= clock_timestamp()) OR deleted_at IS NOT NULL
          ORDER BY COALESCE(reservation_expires_at,deleted_at) LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING workspace_id,key,reservation_id,status::text AS status"#,
    )
    .bind(limit)
    .fetch_all(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("cleanup expired blob reservations", error))?;
    let remaining = limit.saturating_sub(i64::try_from(blobs.len()).unwrap_or(limit));
    let attachments = if remaining > 0 {
      sqlx::query(
        r#"UPDATE comment_attachments SET deleted_at=COALESCE(deleted_at,clock_timestamp())
          WHERE ctid IN (SELECT ctid FROM comment_attachments WHERE
            (status='pending' AND reservation_expires_at <= clock_timestamp()) OR deleted_at IS NOT NULL
            ORDER BY COALESCE(reservation_expires_at,deleted_at) LIMIT $1 FOR UPDATE SKIP LOCKED)
          RETURNING workspace_id,doc_id,key,reservation_id,status::text AS status"#,
      )
      .bind(remaining)
      .fetch_all(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("cleanup expired attachment reservations", error))?
    } else {
      Vec::new()
    };
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit storage reservation cleanup", error))?;

    let storage = self.object_storage()?;
    let mut cleaned = 0_i64;
    let mut delete_failure = None;
    for row in &blobs {
      let workspace_id: String = row.get("workspace_id");
      let key: String = row.get("key");
      let reservation_id = row.get("reservation_id");
      let locators = if row.get::<String, _>("status") == "pending" {
        vec![
          temporary_storage_locator("blob", &workspace_id, None, &key, reservation_id)?,
          final_storage_locator("blob", &workspace_id, None, &key)?,
        ]
      } else {
        vec![final_storage_locator("blob", &workspace_id, None, &key)?]
      };
      let mut objects_deleted = true;
      for locator in locators {
        if let Err(error) = storage.delete(&locator).await {
          objects_deleted = false;
          delete_failure = Some(error.to_string());
        }
      }
      if objects_deleted {
        let result = sqlx::query(
          "DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND reservation_id=$3 AND deleted_at IS NOT NULL",
        )
        .bind(&workspace_id)
        .bind(&key)
        .bind(reservation_id)
        .execute(&pool)
        .await
        .map_err(|error| RuntimeError::database("delete cleaned blob reservation ledger", error))?;
        cleaned = cleaned.saturating_add(i64::try_from(result.rows_affected()).unwrap_or(i64::MAX));
      }
    }
    for row in &attachments {
      let workspace_id: String = row.get("workspace_id");
      let doc_id: String = row.get("doc_id");
      let key: String = row.get("key");
      let reservation_id = row.get("reservation_id");
      let locators = if row.get::<String, _>("status") == "pending" {
        vec![
          temporary_storage_locator("comment_attachment", &workspace_id, Some(&doc_id), &key, reservation_id)?,
          final_storage_locator("comment_attachment", &workspace_id, Some(&doc_id), &key)?,
        ]
      } else {
        vec![final_storage_locator(
          "comment_attachment",
          &workspace_id,
          Some(&doc_id),
          &key,
        )?]
      };
      let mut objects_deleted = true;
      for locator in locators {
        if let Err(error) = storage.delete(&locator).await {
          objects_deleted = false;
          delete_failure = Some(error.to_string());
        }
      }
      if objects_deleted {
        let result = sqlx::query(
          "DELETE FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key=$3 AND reservation_id=$4 AND \
           deleted_at IS NOT NULL",
        )
        .bind(&workspace_id)
        .bind(&doc_id)
        .bind(&key)
        .bind(reservation_id)
        .execute(&pool)
        .await
        .map_err(|error| RuntimeError::database("delete cleaned attachment reservation ledger", error))?;
        cleaned = cleaned.saturating_add(i64::try_from(result.rows_affected()).unwrap_or(i64::MAX));
      }
    }
    let workspaces = blobs
      .iter()
      .chain(&attachments)
      .map(|row| row.get::<String, _>("workspace_id"))
      .collect::<std::collections::BTreeSet<_>>();
    for workspace_id in &workspaces {
      if let Some(owner_id) = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
      )
      .bind(&*workspace_id)
      .fetch_optional(&pool)
      .await
      .map_err(|error| RuntimeError::database("load cleanup quota owner", error))?
      {
        invalidate_storage_usage(self, workspace_id, &owner_id).await;
      }
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
