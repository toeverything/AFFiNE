//! Workspace blob GraphQL mutations and quota invalidation helpers.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{Context, Enum, Result, SimpleObject, Upload};
use chrono::{DateTime, Utc};
use server_blob::PutBlobOutcome;
use server_domain::events::InvalidationHintV1;
use server_types::{DeploymentMode, DomainError};

use super::{JsonObjectScalar, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ListedBlob")]
pub struct ListedBlob {
  pub key: String,
  pub size: i32,
  pub mime: String,
  pub created_at: String,
}

#[derive(Enum, Copy, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "BlobUploadMethod")]
pub enum BlobUploadMethod {
  Graphql,
  Multipart,
  Presigned,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "BlobUploadedPart")]
pub struct BlobUploadedPart {
  pub etag: String,
  pub part_number: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "BlobUploadInit")]
pub struct BlobUploadInit {
  pub already_uploaded: Option<bool>,
  pub blob_key: String,
  pub expires_at: Option<DateTime<Utc>>,
  pub headers: Option<JsonObjectScalar>,
  pub method: BlobUploadMethod,
  pub part_size: Option<i32>,
  pub upload_id: Option<String>,
  pub upload_url: Option<String>,
  pub uploaded_parts: Option<Vec<BlobUploadedPart>>,
}

async fn publish_quota_storage_invalidation(state: &AppState, workspace_id: &str) {
  let owner_id: Option<String> = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(state.db.pool())
  .await
  .ok()
  .flatten();

  let _ = state
    .invalidation
    .publish_invalidation(&InvalidationHintV1::QuotaStorageUsage {
      subject: format!("workspace:{workspace_id}"),
    })
    .await;
  if let Some(ref owner) = owner_id {
    let _ = state
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaStorageUsage {
        subject: format!("user:{owner}"),
      })
      .await;
  }

  let prefix = match state.config.load().deployment_mode {
    DeploymentMode::Selfhosted => "selfhosted",
    DeploymentMode::Cloud => "cloud",
  };
  let req1 = format!("{prefix}:event:{}", uuid::Uuid::new_v4());
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "event": { "changed": true, "reason": "runtime-invalidation" },
        "input": { "workspaceId": workspace_id },
        "room": format!("workspace:{workspace_id}:quota-state"),
        "topic": "workspace.quota-state.changed",
      }),
      Some(&req1),
    )
    .await;
  let req2 = format!("{prefix}:event:{}", uuid::Uuid::new_v4());
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "event": { "changed": true, "reason": "quota-state-changed" },
        "input": { "workspaceId": workspace_id },
        "room": format!("workspace:{workspace_id}:access"),
        "topic": "workspace.access.changed",
      }),
      Some(&req2),
    )
    .await;
  if let Some(ref owner) = owner_id {
    let req3 = format!("{prefix}:event:{}", uuid::Uuid::new_v4());
    let _ = state
      .event_bus
      .publish_event(
        "realtime.topic.changed",
        serde_json::json!({
          "event": { "changed": true, "reason": "runtime-invalidation" },
          "input": {},
          "room": format!("user:{owner}:quota-state"),
          "topic": "user.quota-state.changed",
        }),
        Some(&req3),
      )
      .await;
  }
}

pub(crate) async fn mutate_create_blob_upload(
  ctx: &Context<'_>,
  workspace_id: String,
  key: String,
  size: i32,
  _mime: String,
) -> Result<BlobUploadInit> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .require_active_member_role(&workspace_id, &user.id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if size < 0 {
    return Err(domain_error_to_graphql(&DomainError::Validation(
      "blob size must be non-negative".into(),
    )));
  }
  let existing = state
    .blobs
    .get_blob(&workspace_id, &key)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if let Some((record, _)) = existing {
    if record.size != i64::from(size) {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "Blob size mismatch".into(),
      )));
    }
    return Ok(BlobUploadInit {
      already_uploaded: Some(true),
      blob_key: key,
      expires_at: None,
      headers: None,
      method: BlobUploadMethod::Graphql,
      part_size: None,
      upload_id: None,
      upload_url: None,
      uploaded_parts: None,
    });
  }
  Ok(BlobUploadInit {
    already_uploaded: Some(false),
    blob_key: key,
    expires_at: None,
    headers: None,
    method: BlobUploadMethod::Graphql,
    part_size: None,
    upload_id: None,
    upload_url: None,
    uploaded_parts: None,
  })
}

pub(crate) async fn mutate_set_blob(ctx: &Context<'_>, workspace_id: String, blob: Upload) -> Result<String> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .require_active_member_role(&workspace_id, &user.id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let mut upload = blob
    .value(ctx)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid blob upload: {e}"))))?;
  let filename = upload.filename.clone();
  let mime = upload
    .content_type
    .clone()
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "application/octet-stream".to_owned());
  let mut bytes = Vec::new();
  upload
    .content
    .read_to_end(&mut bytes)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read blob upload: {e}"))))?;
  let outcome = state
    .blobs
    .put_blob(&workspace_id, &filename, &mime, bytes)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if matches!(outcome, PutBlobOutcome::Created(_)) {
    publish_quota_storage_invalidation(state, &workspace_id).await;
  }
  Ok(filename)
}

pub(crate) async fn mutate_delete_blob(
  ctx: &Context<'_>,
  workspace_id: String,
  key: Option<String>,
  hash: Option<String>,
  permanently: bool,
) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let Some(blob_key) = key.or(hash).filter(|k| !k.is_empty()) else {
    state
      .blobs
      .check_blobs_manage(&user.id, &workspace_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    return Ok(false);
  };
  let deleted = state
    .blobs
    .delete_blob_authorized(&user.id, &workspace_id, &blob_key, permanently)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if deleted {
    publish_quota_storage_invalidation(state, &workspace_id).await;
  }
  Ok(deleted)
}

pub(crate) async fn mutate_release_deleted_blobs(ctx: &Context<'_>, workspace_id: String) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let released = state
    .blobs
    .release_deleted_blobs_authorized(&user.id, &workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if released > 0 {
    publish_quota_storage_invalidation(state, &workspace_id).await;
  }
  Ok(true)
}
