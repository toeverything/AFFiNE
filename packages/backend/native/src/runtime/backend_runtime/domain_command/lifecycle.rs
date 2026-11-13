use affine_core::access_control::{DocLifecycleCommand, DomainCommand};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use napi::bindgen_prelude::Buffer;
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};

use super::{
  DocLifecycle, append_updates_in, authorize_domain_after_storage_lock, invalidate_workspace_inventory_in,
  is_ordinary_workspace_doc, lock_permission_generation, lock_workspace_doc_update, lock_workspace_storage_shared,
  validate_doc_updates,
};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

pub(super) async fn apply(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  lifecycle: DocLifecycle,
  embedding_schema_ready: bool,
) -> RuntimeResult<Value> {
  if !is_ordinary_workspace_doc(&workspace_id, &doc_id) {
    return Err(RuntimeError::invalid_input("domain_permission_denied"));
  }
  lock_workspace_storage_shared(transaction, &workspace_id).await?;
  lock_workspace_doc_update(transaction, &workspace_id, &doc_id).await?;
  let command = DomainCommand::ApplyDocLifecycle {
    doc_id: doc_id.clone(),
    lifecycle: match lifecycle {
      DocLifecycle::Trash => DocLifecycleCommand::Trash,
      DocLifecycle::Restore => DocLifecycleCommand::Restore,
      DocLifecycle::Delete => DocLifecycleCommand::Delete,
    },
  };
  authorize_domain_after_storage_lock(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;
  let exists: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=$2) OR EXISTS(SELECT 1 FROM updates WHERE \
     workspace_id=$1 AND guid=$2)",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load lifecycle document", error))?;
  if !exists {
    return Err(RuntimeError::invalid_input("doc_not_found"));
  }
  if matches!(lifecycle, DocLifecycle::Delete) {
    delete_doc_rows(transaction, &workspace_id, &doc_id).await?;
  }
  let state = match lifecycle {
    DocLifecycle::Trash => Some("trashed"),
    DocLifecycle::Restore => None,
    DocLifecycle::Delete => Some("deleted"),
  };
  let timestamp: DateTime<Utc> = sqlx::query_scalar(
    "INSERT INTO workspace_pages(workspace_id,page_id,lifecycle_state,lifecycle_changed_at) \
     VALUES($1,$2,$3::\"DocLifecycleState\",date_trunc('milliseconds',clock_timestamp())) ON \
     CONFLICT(workspace_id,page_id) DO UPDATE SET \
     lifecycle_state=EXCLUDED.lifecycle_state,lifecycle_changed_at=GREATEST(EXCLUDED.lifecycle_changed_at,\
     workspace_pages.lifecycle_changed_at+interval '1 millisecond') RETURNING lifecycle_changed_at",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(state)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("set document lifecycle", error))?;
  if embedding_schema_ready {
    sqlx::query(
      "UPDATE embedding_sources SET deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 \
       AND source_kind='document' AND source_key=$2",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("invalidate deleted document embedding", error))?;
  }
  invalidate_workspace_inventory_in(transaction, &workspace_id).await?;
  Ok(json!({"workspaceId": workspace_id, "docId": doc_id, "timestamp": timestamp.timestamp_millis()}))
}

pub(super) async fn append_root_update(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  encoded_update: String,
  expected_permission_generation: Option<i64>,
  embedding_schema_ready: bool,
) -> RuntimeResult<Value> {
  let update = BASE64
    .decode(encoded_update)
    .map_err(|_| RuntimeError::invalid_input("doc_update_invalid"))?;
  let updates = vec![Buffer::from(update)];
  validate_doc_updates(&updates, true).await?;
  lock_workspace_storage_shared(transaction, &workspace_id).await?;
  lock_workspace_doc_update(transaction, &workspace_id, &workspace_id).await?;
  authorize_domain_after_storage_lock(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&workspace_id),
    &DomainCommand::AppendRootUpdate {
      doc_id: workspace_id.clone(),
    },
  )
  .await?;
  lock_permission_generation(transaction, &workspace_id, expected_permission_generation).await?;
  let timestamp = append_updates_in(
    transaction,
    embedding_schema_ready,
    &workspace_id,
    &workspace_id,
    updates,
    Some(&actor_user_id),
  )
  .await?;
  Ok(json!({"timestamp": timestamp}))
}

async fn delete_doc_rows(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<()> {
  for (table, column) in [
    ("replies", "doc_id"),
    ("comment_attachments", "doc_id"),
    ("comments", "doc_id"),
    ("doc_blob_refs", "doc_id"),
    ("doc_blob_ref_projections", "doc_id"),
    ("ai_workspace_ignored_docs", "doc_id"),
    ("workspace_doc_view_daily", "doc_id"),
    ("doc_grants", "doc_id"),
    ("doc_access_policies", "doc_id"),
    ("updates", "guid"),
    ("snapshot_histories", "guid"),
    ("snapshots", "guid"),
    ("workspace_pages", "page_id"),
  ] {
    sqlx::query(&format!("DELETE FROM {table} WHERE workspace_id=$1 AND {column}=$2"))
      .bind(workspace_id)
      .bind(doc_id)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database(format!("delete document {table}"), error))?;
  }
  for (table, column) in [
    ("workspace_member_last_access", "last_doc_id"),
    ("ai_sessions_metadata", "doc_id"),
    ("ai_action_runs", "doc_id"),
  ] {
    sqlx::query(&format!(
      "UPDATE {table} SET {column}=NULL WHERE workspace_id=$1 AND {column}=$2"
    ))
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database(format!("unlink document {table}"), error))?;
  }

  Ok(())
}
