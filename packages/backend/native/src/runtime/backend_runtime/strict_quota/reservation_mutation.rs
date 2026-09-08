use napi::Result;
use uuid::Uuid;

use super::{
  super::{BackendRuntime, RuntimeError, RuntimeResult, permission::PermissionAuthorizer},
  invalidate_storage_usage,
  promotion::{final_storage_locator, promote_storage_object, temporary_storage_locator},
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
  let pool = runtime.pool().await?;
  let deployment = runtime.config()?.deployment;
  let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, runtime.permission_telemetry.clone());
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("start storage mutation transaction", error))?;
  let resource = storage_resource(&input.kind)?;
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
  if completed {
    let reservation_matches = if input.kind == "blob" {
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id=$1 AND key=$2 AND reservation_id=$3 AND \
         status='pending' AND size=$4 AND mime=$5 AND reservation_expires_at > $6)",
      )
      .bind(&input.workspace_id)
      .bind(&input.key)
      .bind(reservation_id)
      .bind(input.size.and_then(|size| i32::try_from(size).ok()))
      .bind(input.mime.as_deref())
      .bind(now)
      .fetch_one(&mut *tx)
      .await
    } else if input.kind == "comment_attachment" {
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key=$3 AND \
         reservation_id=$4 AND status='pending' AND size=$5 AND mime=$6 AND reservation_expires_at > $7 AND \
         created_by=$8)",
      )
      .bind(&input.workspace_id)
      .bind(input.doc_id.as_deref())
      .bind(&input.key)
      .bind(reservation_id)
      .bind(input.size.and_then(|size| i32::try_from(size).ok()))
      .bind(input.mime.as_deref())
      .bind(now)
      .bind(&input.user_id)
      .fetch_one(&mut *tx)
      .await
    } else {
      return Err(RuntimeError::invalid_input("invalid storage reservation kind"));
    }
    .map_err(|error| RuntimeError::database("verify storage reservation fence", error))?;
    if !reservation_matches {
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit storage reservation mismatch", error))?;
      runtime
        .permission_telemetry
        .quota_guard("storage", "finalize", "mismatch", "reservation_fence");
      return Ok(false);
    }
  }
  let metadata = if completed {
    match promote_storage_object(runtime, &input, reservation_id).await {
      Ok(metadata) => Some(metadata),
      Err(error) => {
        let result = if input.kind == "blob" {
          sqlx::query(
            "UPDATE blobs SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE workspace_id=$1 AND key=$2 AND \
             reservation_id=$3 AND status='pending'",
          )
          .bind(&input.workspace_id)
          .bind(&input.key)
          .bind(reservation_id)
          .execute(&mut *tx)
          .await
        } else {
          sqlx::query(
            "UPDATE comment_attachments SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE workspace_id=$1 \
             AND doc_id=$2 AND key=$3 AND reservation_id=$4 AND status='pending'",
          )
          .bind(&input.workspace_id)
          .bind(input.doc_id.as_deref())
          .bind(&input.key)
          .bind(reservation_id)
          .execute(&mut *tx)
          .await
        }
        .map_err(|db_error| RuntimeError::database("deny failed storage promotion", db_error))?;
        if result.rows_affected() != 1 {
          return Err(RuntimeError::invalid_state(
            "storage reservation changed during promotion",
          ));
        }
        tx.commit()
          .await
          .map_err(|db_error| RuntimeError::database("commit failed storage promotion denial", db_error))?;
        let temporary = temporary_storage_locator(
          &input.kind,
          &input.workspace_id,
          input.doc_id.as_deref(),
          &input.key,
          reservation_id,
        )?;
        let final_object =
          final_storage_locator(&input.kind, &input.workspace_id, input.doc_id.as_deref(), &input.key)?;
        runtime.object_storage()?.delete(&temporary).await?;
        runtime.object_storage()?.delete(&final_object).await?;
        return Err(error);
      }
    }
  } else {
    None
  };
  let temporary_locator = metadata
    .as_ref()
    .map(|(_, locator)| locator.clone())
    .unwrap_or(temporary_storage_locator(
      &input.kind,
      &input.workspace_id,
      input.doc_id.as_deref(),
      &input.key,
      reservation_id,
    )?);
  let result = if input.kind == "blob" {
    sqlx::query(
      "UPDATE blobs SET status=CASE WHEN $4 THEN 'completed'::\"BlobStatus\" ELSE status END,deleted_at=CASE WHEN $4 \
       THEN NULL ELSE clock_timestamp() END,reservation_expires_at=NULL WHERE workspace_id=$1 AND key=$2 AND \
       reservation_id=$3 AND status='pending' AND (NOT $4 OR (size=$5 AND mime=$6 AND reservation_expires_at > $7))",
    )
    .bind(&input.workspace_id)
    .bind(&input.key)
    .bind(reservation_id)
    .bind(completed)
    .bind(metadata.as_ref().map(|(value, _)| value.content_length as i32))
    .bind(metadata.as_ref().map(|(value, _)| value.content_type.as_str()))
    .bind(now)
    .execute(&mut *tx)
    .await
  } else if input.kind == "comment_attachment" {
    sqlx::query(
      "UPDATE comment_attachments SET status=CASE WHEN $5 THEN 'completed'::\"BlobStatus\" ELSE status \
       END,deleted_at=CASE WHEN $5 THEN NULL ELSE clock_timestamp() END,reservation_expires_at=NULL WHERE \
       workspace_id=$1 AND doc_id=$2 AND key=$3 AND reservation_id=$4 AND status='pending' AND created_by=$9 AND (NOT \
       $5 OR (size=$6 AND mime=$7 AND reservation_expires_at > $8))",
    )
    .bind(&input.workspace_id)
    .bind(input.doc_id.as_deref())
    .bind(&input.key)
    .bind(reservation_id)
    .bind(completed)
    .bind(metadata.as_ref().map(|(value, _)| value.content_length as i32))
    .bind(metadata.as_ref().map(|(value, _)| value.content_type.as_str()))
    .bind(now)
    .bind(&input.user_id)
    .execute(&mut *tx)
    .await
  } else {
    return Err(RuntimeError::invalid_input("invalid storage reservation kind"));
  }
  .map_err(|error| RuntimeError::database("mutate storage reservation", error))?;
  let changed = result.rows_affected() == 1;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit storage mutation", error))?;
  runtime.object_storage()?.delete(&temporary_locator).await?;
  if changed {
    invalidate_storage_usage(runtime, &input.workspace_id, &subject.owner_id).await;
  }
  runtime.permission_telemetry.quota_guard(
    "storage",
    if completed { "finalize" } else { "abort" },
    if changed { "allow" } else { "mismatch" },
    if changed { "committed" } else { "reservation_fence" },
  );
  Ok(changed)
}
