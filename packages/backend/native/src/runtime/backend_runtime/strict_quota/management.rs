use affine_core::access_control::WorkspaceAction;
use napi::Result;
use sqlx::{Connection, Row};

use super::{
  super::{BackendRuntime, RuntimeError, napi_error, permission::PermissionAuthorizer},
  StorageOperation, invalidate_storage_usage,
};
use crate::runtime::{
  object_storage::types::{ObjectKey, ObjectLocator, StorageScope},
  types::{RuntimeBlobManagementInput, RuntimeManagedBlob},
};

const MAX_MANAGED_BLOB_INVENTORY: i64 = 1_000;

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn list_managed_workspace_blobs_v1(
    &self,
    actor_user_id: String,
    workspace_id: String,
  ) -> Result<Vec<RuntimeManagedBlob>> {
    let pool = self.pool().await?;
    let deployment = self.config()?.deployment;
    let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, self.permission_telemetry.clone());
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start managed blob inventory", error))?;
    assert_manage_allowed(&mut tx, &authorizer, &workspace_id, &actor_user_id, false).await?;
    let rows = sqlx::query(
      "SELECT key,mime,size,created_at FROM blobs WHERE workspace_id=$1 AND status='completed' AND deleted_at IS NULL \
       ORDER BY key LIMIT $2",
    )
    .bind(&workspace_id)
    .bind(MAX_MANAGED_BLOB_INVENTORY + 1)
    .fetch_all(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("list managed workspace blobs", error))?;
    if rows.len() > usize::try_from(MAX_MANAGED_BLOB_INVENTORY).expect("managed blob cap fits usize") {
      return Err(RuntimeError::invalid_state("managed_blob_inventory_too_large").into());
    }
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit managed blob inventory", error))?;
    Ok(
      rows
        .into_iter()
        .map(|row| RuntimeManagedBlob {
          key: row.get("key"),
          mime: row.get("mime"),
          size: row.get("size"),
          created_at: row.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
        })
        .collect(),
    )
  }

  #[napi]
  pub async fn manage_workspace_blob_v1(&self, input: RuntimeBlobManagementInput) -> Result<bool> {
    let pool = self.pool().await?;
    let deployment = self.config()?.deployment;
    let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, self.permission_telemetry.clone());
    let locator = ObjectLocator::new(
      StorageScope::Blob,
      ObjectKey::new(format!("{}/{}", input.workspace_id, input.key))?,
    );
    let mut operation = StorageOperation::acquire(&pool, &input.workspace_id, Some(locator.key.as_str())).await?;
    let mut tx = operation
      .connection()
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start managed blob delete", error))?;
    assert_manage_allowed(&mut tx, &authorizer, &input.workspace_id, &input.actor_user_id, true).await?;
    let result = sqlx::query(
      "UPDATE blobs SET deleted_at=COALESCE(deleted_at,clock_timestamp()),reservation_expires_at=NULL WHERE \
       workspace_id=$1 AND key=$2 AND status='completed'",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("deny managed workspace blob", error))?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit managed blob delete", error))?;
    if result.rows_affected() == 1 {
      let owner_id = workspace_owner(operation.connection(), &input.workspace_id).await?;
      invalidate_storage_usage(self, &input.workspace_id, owner_id.as_deref()).await;
    }
    if result.rows_affected() == 1 && input.permanently {
      self.object_storage()?.delete(&locator).await?;
      sqlx::query("DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND deleted_at IS NOT NULL")
        .bind(&input.workspace_id)
        .bind(&input.key)
        .execute(operation.connection())
        .await
        .map_err(|error| RuntimeError::database("release permanently deleted managed blob", error))?;
    }
    operation.release().await?;
    Ok(result.rows_affected() == 1)
  }

  #[napi]
  pub async fn release_managed_workspace_blobs_v1(
    &self,
    actor_user_id: String,
    workspace_id: String,
    limit: i64,
  ) -> Result<i64> {
    if limit <= 0 {
      return Err(napi_error("managed blob release limit must be positive"));
    }
    let pool = self.pool().await?;
    let deployment = self.config()?.deployment;
    let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, self.permission_telemetry.clone());
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start managed blob release", error))?;
    assert_manage_allowed(&mut tx, &authorizer, &workspace_id, &actor_user_id, true).await?;
    let rows = sqlx::query(
      "SELECT key FROM blobs WHERE workspace_id=$1 AND deleted_at IS NOT NULL ORDER BY deleted_at,key LIMIT $2 FOR \
       UPDATE",
    )
    .bind(&workspace_id)
    .bind(limit)
    .fetch_all(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("select managed blobs for release", error))?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit managed blob release selection", error))?;

    let storage = self.object_storage()?;
    let mut released = 0;
    for row in rows {
      let key: String = row.get("key");
      let locator = ObjectLocator::new(StorageScope::Blob, ObjectKey::new(format!("{workspace_id}/{key}"))?);
      let mut operation = StorageOperation::acquire(&pool, &workspace_id, Some(locator.key.as_str())).await?;
      let deleted = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id=$1 AND key=$2 AND deleted_at IS NOT NULL)",
      )
      .bind(&workspace_id)
      .bind(&key)
      .fetch_one(operation.connection())
      .await
      .map_err(|error| RuntimeError::database("recheck managed blob release", error))?;
      if !deleted {
        operation.release().await?;
        continue;
      }
      storage.delete(&locator).await?;
      let deleted = sqlx::query("DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND deleted_at IS NOT NULL")
        .bind(&workspace_id)
        .bind(&key)
        .execute(operation.connection())
        .await
        .map_err(|error| RuntimeError::database("release managed blob ledger", error))?;
      operation.release().await?;
      released += i64::try_from(deleted.rows_affected()).unwrap_or(i64::MAX);
    }
    if released > 0 {
      let owner_id = workspace_owner(&pool, &workspace_id).await?;
      invalidate_storage_usage(self, &workspace_id, owner_id.as_deref()).await;
    }
    Ok(released)
  }
}

async fn workspace_owner<'a>(
  executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
  workspace_id: &str,
) -> Result<Option<String>> {
  sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(executor)
  .await
  .map_err(|error| RuntimeError::database("load managed blob owner", error).into())
}

async fn assert_manage_allowed(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  authorizer: &PermissionAuthorizer,
  workspace_id: &str,
  actor_user_id: &str,
  lock: bool,
) -> Result<()> {
  if lock {
    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("locate managed blob owner", error))?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
      .bind(owner_id)
      .fetch_one(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("lock managed blob owner", error))?;
    sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_one(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("lock managed blob workspace", error))?;
  }
  let decision = authorizer
    .authorize_workspace_action_in(tx, workspace_id, Some(actor_user_id), WorkspaceAction::BlobsManage)
    .await?;
  if !decision.allowed {
    return Err(napi_error("workspace_blobs_manage_forbidden"));
  }
  Ok(())
}
