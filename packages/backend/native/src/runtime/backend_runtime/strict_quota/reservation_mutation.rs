use napi::Result;
use sqlx::Connection;
use uuid::Uuid;

use super::{
  super::{BackendRuntime, RuntimeError, RuntimeResult, permission::PermissionAuthorizer},
  StorageOperation, finalize_reservation, invalidate_storage_usage,
  promotion::{final_storage_locator, temporary_storage_locator},
  storage::{lock_subject, storage_resource},
};
use crate::runtime::types::RuntimeStorageReservationMutation;

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn finalize_storage_reservation_v1(&self, input: RuntimeStorageReservationMutation) -> Result<bool> {
    mutate_reservation(self, input, true).await.map_err(Into::into)
  }

  #[napi]
  pub async fn abort_storage_reservation_v1(&self, input: RuntimeStorageReservationMutation) -> Result<bool> {
    mutate_reservation(self, input, false).await.map_err(Into::into)
  }
}

async fn mutate_reservation(
  runtime: &BackendRuntime,
  input: RuntimeStorageReservationMutation,
  completed: bool,
) -> RuntimeResult<bool> {
  let reservation_id =
    Uuid::parse_str(&input.reservation_id).map_err(|_| RuntimeError::invalid_input("invalid reservation id"))?;
  if completed {
    return finalize_reservation(runtime, input, reservation_id).await;
  }

  let pool = runtime.pool().await?;
  let deployment = runtime.config()?.deployment;
  let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, runtime.permission_telemetry.clone());
  let locator = final_storage_locator(&input.kind, &input.workspace_id, input.doc_id.as_deref(), &input.key)?;
  let mut operation = StorageOperation::acquire(&pool, &input.workspace_id, Some(locator.key.as_str())).await?;
  let mut tx = operation
    .connection()
    .begin()
    .await
    .map_err(|error| RuntimeError::database("start storage abort transaction", error))?;
  let resource = storage_resource(&input.kind)?;
  let (subject, _, authorization) = lock_subject(
    &mut tx,
    &input.workspace_id,
    &input.user_id,
    resource,
    input.doc_id.as_deref(),
    deployment,
    &authorizer,
  )
  .await?;
  if !authorization.allows_upload(resource) {
    return Err(RuntimeError::invalid_input("workspace_upload_forbidden"));
  }
  let result = if input.kind == "blob" {
    sqlx::query(
      "UPDATE blobs SET deleted_at=clock_timestamp(),reservation_expires_at=NULL WHERE workspace_id=$1 AND key=$2 AND \
       reservation_id=$3 AND status='pending'",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .bind(reservation_id)
    .execute(&mut *tx)
    .await
  } else if input.kind == "comment_attachment" {
    sqlx::query(
      "UPDATE comment_attachments SET deleted_at=clock_timestamp(),reservation_expires_at=NULL WHERE workspace_id=$1 \
       AND doc_id=$2 AND key=$3 AND reservation_id=$4 AND status='pending' AND created_by=$5",
    )
    .bind(&input.workspace_id)
    .bind(input.doc_id.as_deref())
    .bind(&input.key)
    .bind(reservation_id)
    .bind(&input.user_id)
    .execute(&mut *tx)
    .await
  } else {
    return Err(RuntimeError::invalid_input("invalid storage reservation kind"));
  }
  .map_err(|error| RuntimeError::database("abort storage reservation", error))?;
  let changed = result.rows_affected() == 1;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit storage abort", error))?;
  runtime
    .object_storage()?
    .delete(&temporary_storage_locator(
      &input.kind,
      &input.workspace_id,
      input.doc_id.as_deref(),
      &input.key,
      reservation_id,
    )?)
    .await?;
  operation.release().await?;
  if changed {
    invalidate_storage_usage(runtime, &input.workspace_id, Some(&subject.owner_id)).await;
  }
  runtime.permission_telemetry.quota_guard(
    "storage",
    "abort",
    if changed { "allow" } else { "mismatch" },
    if changed { "committed" } else { "reservation_fence" },
  );
  Ok(changed)
}
