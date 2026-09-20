use sqlx::{Connection, PgConnection};
use uuid::Uuid;

use super::{
  super::{BackendRuntime, RuntimeError, RuntimeResult, permission::PermissionAuthorizer},
  StorageOperation, invalidate_storage_usage,
  promotion::{final_storage_locator, promote_storage_object, temporary_storage_locator},
  storage::{lock_subject, storage_resource},
};
use crate::runtime::types::RuntimeStorageReservationMutation;

pub(in crate::runtime::backend_runtime) async fn finalize_reservation(
  runtime: &BackendRuntime,
  input: RuntimeStorageReservationMutation,
  reservation_id: Uuid,
) -> RuntimeResult<bool> {
  let pool = runtime.pool().await?;
  let final_locator = final_storage_locator(&input.kind, &input.workspace_id, input.doc_id.as_deref(), &input.key)?;
  let mut operation = StorageOperation::acquire(&pool, &input.workspace_id, Some(final_locator.key.as_str())).await?;
  let deployment = runtime.config()?.deployment;
  let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, runtime.permission_telemetry.clone());
  let resource = storage_resource(&input.kind)?;
  let mut tx = operation
    .connection()
    .begin()
    .await
    .map_err(|error| RuntimeError::database("start storage promotion validation", error))?;
  let (_, now, authorization) = lock_subject(
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
  let matches = reservation_matches(&mut tx, &input, reservation_id, now).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit storage promotion validation", error))?;
  if !matches {
    operation.release().await?;
    return Ok(false);
  }

  let outcome = async {
    let metadata = promote_storage_object(runtime, &input, reservation_id).await?;
    let mut tx = operation
      .connection()
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start storage promotion commit", error))?;
    let (subject, now, authorization) = lock_subject(
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
        "UPDATE blobs SET status='completed'::\"BlobStatus\",reservation_expires_at=NULL WHERE workspace_id=$1 AND \
         key=$2 AND reservation_id=$3 AND status='pending' AND deleted_at IS NULL AND reservation_expires_at>$4",
      )
      .bind(&input.workspace_id)
      .bind(&input.key)
      .bind(reservation_id)
      .bind(now)
      .execute(&mut *tx)
      .await
    } else {
      sqlx::query(
        "UPDATE comment_attachments SET status='completed'::\"BlobStatus\",reservation_expires_at=NULL WHERE \
         workspace_id=$1 AND doc_id=$2 AND key=$3 AND reservation_id=$4 AND status='pending' AND deleted_at IS NULL \
         AND reservation_expires_at>$5",
      )
      .bind(&input.workspace_id)
      .bind(input.doc_id.as_deref())
      .bind(&input.key)
      .bind(reservation_id)
      .bind(now)
      .execute(&mut *tx)
      .await
    }
    .map_err(|error| RuntimeError::database("complete promoted storage reservation", error))?;
    let changed = result.rows_affected() == 1;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit storage promotion", error))?;
    Ok((changed, subject.owner_id, metadata.1))
  }
  .await;

  match outcome {
    Ok((true, owner_id, temporary)) => {
      // The ledger is committed; a temporary-object cleanup failure must not
      // revoke the upload.
      if runtime.object_storage()?.delete(&temporary).await.is_err() {
        runtime
          .permission_telemetry
          .quota_guard("storage", "cleanup", "error", "temporary_object");
      }
      operation.release().await?;
      invalidate_storage_usage(runtime, &input.workspace_id, Some(&owner_id)).await;
      Ok(true)
    }
    result => {
      deny_failed_promotion(runtime, operation.connection(), &input, reservation_id).await?;
      operation.release().await?;
      invalidate_storage_usage(runtime, &input.workspace_id, None).await;
      result.map(|(changed, _, _)| changed)
    }
  }
}

async fn reservation_matches(
  connection: &mut PgConnection,
  input: &RuntimeStorageReservationMutation,
  reservation_id: Uuid,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<bool> {
  let result = if input.kind == "blob" {
    sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id=$1 AND key=$2 AND reservation_id=$3 AND status='pending' \
       AND deleted_at IS NULL AND size=$4 AND mime=$5 AND reservation_expires_at>$6)",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .bind(reservation_id)
    .bind(input.size.and_then(|size| i32::try_from(size).ok()))
    .bind(input.mime.as_deref())
    .bind(now)
    .fetch_one(connection)
    .await
  } else {
    sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key=$3 AND \
       reservation_id=$4 AND status='pending' AND deleted_at IS NULL AND created_by=$5 AND size=$6 AND mime=$7 AND \
       reservation_expires_at>$8)",
    )
    .bind(&input.workspace_id)
    .bind(input.doc_id.as_deref())
    .bind(&input.key)
    .bind(reservation_id)
    .bind(&input.user_id)
    .bind(input.size.and_then(|size| i32::try_from(size).ok()))
    .bind(input.mime.as_deref())
    .bind(now)
    .fetch_one(connection)
    .await
  };
  result.map_err(|error| RuntimeError::database("validate storage reservation fence", error))
}

async fn deny_failed_promotion(
  runtime: &BackendRuntime,
  connection: &mut PgConnection,
  input: &RuntimeStorageReservationMutation,
  reservation_id: Uuid,
) -> RuntimeResult<()> {
  let denied = if input.kind == "blob" {
    sqlx::query(
      "UPDATE blobs SET deleted_at=clock_timestamp() WHERE workspace_id=$1 AND key=$2 AND reservation_id=$3 AND \
       status='pending'",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .bind(reservation_id)
    .execute(&mut *connection)
    .await
  } else {
    sqlx::query(
      "UPDATE comment_attachments SET deleted_at=clock_timestamp() WHERE workspace_id=$1 AND doc_id=$2 AND key=$3 AND \
       reservation_id=$4 AND status='pending'",
    )
    .bind(&input.workspace_id)
    .bind(input.doc_id.as_deref())
    .bind(&input.key)
    .bind(reservation_id)
    .execute(&mut *connection)
    .await
  }
  .map_err(|error| RuntimeError::database("deny failed storage promotion", error))?;
  if denied.rows_affected() == 0 {
    return Ok(());
  }
  let storage = runtime.object_storage()?;
  storage
    .delete(&temporary_storage_locator(
      &input.kind,
      &input.workspace_id,
      input.doc_id.as_deref(),
      &input.key,
      reservation_id,
    )?)
    .await?;
  storage
    .delete(&final_storage_locator(
      &input.kind,
      &input.workspace_id,
      input.doc_id.as_deref(),
      &input.key,
    )?)
    .await?;
  Ok(())
}
