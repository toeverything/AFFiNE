use affine_core::access_control::{DocLifecycleCommand, DomainCommand, WorkspaceAction};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use napi::bindgen_prelude::Buffer;
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};

use super::{
  DocLifecycle, DocLifecycleInput, append_updates_in, authorize_domain_after_storage_lock, ensure_migration_active,
  invalidate_workspace_inventory_in, is_ordinary_workspace_doc, load_command_quota_in, lock_doc_permission_facts,
  lock_domain_workspace, lock_permission_facts, lock_permission_generation, lock_workspace_doc_update,
  lock_workspace_storage_shared, validate_doc_updates,
};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

pub(super) async fn apply(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  input: DocLifecycleInput,
  embedding_schema_ready: bool,
) -> RuntimeResult<Value> {
  let DocLifecycleInput {
    actor_user_id,
    workspace_id,
    doc_id,
    lifecycle,
    logical_doc_id,
    require_deleted,
  } = input;
  let deleting = matches!(lifecycle, DocLifecycle::Delete);
  if (logical_doc_id.is_some() || require_deleted) && !deleting {
    return Err(RuntimeError::invalid_input(
      "logical document identity is only valid for deletion",
    ));
  }
  let mut doc_ids = vec![doc_id.clone()];
  if let Some(logical_id) = logical_doc_id {
    doc_ids.push(logical_id);
  }
  doc_ids.sort();
  doc_ids.dedup();
  if doc_ids.iter().any(|id| !is_ordinary_workspace_doc(&workspace_id, id)) {
    return Err(RuntimeError::invalid_input("domain_permission_denied"));
  }
  lock_workspace_storage_shared(transaction, &workspace_id).await?;
  for id in &doc_ids {
    lock_workspace_doc_update(transaction, &workspace_id, id).await?;
  }
  if !deleting {
    ensure_migration_active(transaction).await?;
  }
  lock_domain_workspace(transaction, &workspace_id).await?;
  let quota = if matches!(lifecycle, DocLifecycle::Restore) {
    load_command_quota_in(transaction, authorizer.deployment, &workspace_id, true).await?
  } else {
    None
  };
  lock_permission_facts(transaction, &actor_user_id, &workspace_id, None).await?;
  let tombstones: Vec<(String, DateTime<Utc>)> = sqlx::query_as(
    "SELECT page_id,lifecycle_changed_at FROM workspace_pages WHERE workspace_id=$1 AND page_id=ANY($2) AND \
     lifecycle_state='deleted'",
  )
  .bind(&workspace_id)
  .bind(&doc_ids)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load lifecycle tombstones", error))?;
  if require_deleted && tombstones.len() != doc_ids.len() {
    return Err(RuntimeError::invalid_input("doc_not_found"));
  }
  if deleting && !tombstones.is_empty() {
    let decision = authorizer
      .authorize_workspace_action_in(transaction, &workspace_id, Some(&actor_user_id), WorkspaceAction::Sync)
      .await?;
    if !decision.allowed {
      return Err(RuntimeError::invalid_input("domain_permission_denied"));
    }
  }
  for id in &doc_ids {
    if deleting && tombstones.iter().any(|(deleted_id, _)| deleted_id == id) {
      continue;
    }
    lock_doc_permission_facts(transaction, &actor_user_id, &workspace_id, id).await?;
    let command = DomainCommand::ApplyDocLifecycle {
      doc_id: id.clone(),
      lifecycle: match lifecycle {
        DocLifecycle::Trash => DocLifecycleCommand::Trash,
        DocLifecycle::Restore => DocLifecycleCommand::Restore,
        DocLifecycle::Delete => DocLifecycleCommand::Delete,
      },
    };
    authorizer
      .authorize_command_in(
        transaction,
        &actor_user_id,
        &workspace_id,
        Some(id),
        &command,
        quota.as_ref().map(|quota| quota.facts()),
      )
      .await?;
    if !deleting {
      let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=$2) OR EXISTS(SELECT 1 FROM updates \
         WHERE workspace_id=$1 AND guid=$2)",
      )
      .bind(&workspace_id)
      .bind(id)
      .fetch_one(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("load lifecycle document", error))?;
      if !exists {
        return Err(RuntimeError::invalid_input("doc_not_found"));
      }
    }
  }
  let mut timestamps = tombstones.iter().map(|(_, timestamp)| *timestamp).collect::<Vec<_>>();
  for id in &doc_ids {
    if deleting && tombstones.iter().any(|(deleted_id, _)| deleted_id == id) {
      continue;
    }
    if deleting {
      delete_doc_rows(transaction, &workspace_id, id).await?;
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
    .bind(id)
    .bind(state)
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("set document lifecycle", error))?;
    timestamps.push(timestamp);
    if embedding_schema_ready {
      let statement = if deleting {
        "DELETE FROM embedding_sources WHERE workspace_id=$1 AND source_kind='document' AND source_key=$2"
      } else {
        "UPDATE embedding_sources SET deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 \
         AND source_kind='document' AND source_key=$2"
      };
      sqlx::query(statement)
        .bind(&workspace_id)
        .bind(id)
        .execute(&mut **transaction)
        .await
        .map_err(|error| RuntimeError::database("invalidate deleted document embedding", error))?;
    }
  }
  if !deleting || tombstones.len() != doc_ids.len() {
    invalidate_workspace_inventory_in(transaction, &workspace_id).await?;
  }
  let timestamp = timestamps
    .into_iter()
    .max()
    .expect("a lifecycle target has a timestamp");
  let mut result = json!({"workspaceId": workspace_id, "docId": doc_id, "timestamp": timestamp.timestamp_millis()});
  if deleting {
    result["deletedDocIds"] = json!(doc_ids);
  }
  Ok(result)
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
    ("runtime_doc_creators", "doc_id"),
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
