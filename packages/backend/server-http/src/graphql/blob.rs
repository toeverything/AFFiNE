//! Workspace blob GraphQL mutations, multipart upload helpers, and quota invalidation.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{Context, Enum, InputObject, Result, SimpleObject, Upload};
use chrono::{DateTime, Utc};
use server_blob::{PutBlobOutcome, UploadInitMethod, UploadedPart};
use server_domain::events::InvalidationHintV1;
use server_types::{DeploymentMode, DomainError};

use super::{JsonObjectScalar, require_authenticated_user};
use crate::AppState;
use crate::graphql_multipart::MAX_GRAPHQL_MULTIPART_FILE_BYTES;
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
#[graphql(name = "BlobUploadPart")]
pub struct BlobUploadPart {
  pub expires_at: Option<DateTime<Utc>>,
  pub headers: Option<JsonObjectScalar>,
  pub upload_url: String,
}
#[derive(InputObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "BlobUploadPartInput")]
pub struct BlobUploadPartInput {
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
fn headers_to_json_scalar(headers: Option<std::collections::BTreeMap<String, String>>) -> Option<JsonObjectScalar> {
  headers.map(|m| {
    JsonObjectScalar(serde_json::Value::Object(
      m.into_iter().map(|(k, v)| (k, v.into())).collect(),
    ))
  })
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
  for subject in
    std::iter::once(format!("workspace:{workspace_id}")).chain(owner_id.as_ref().map(|o| format!("user:{o}")))
  {
    let _ = state
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaStorageUsage { subject })
      .await;
  }

  let prefix = match state.config.load().deployment_mode {
    DeploymentMode::Selfhosted => "selfhosted",
    DeploymentMode::Cloud => "cloud",
  };
  let mut topics = vec![
    (
      "runtime-invalidation",
      serde_json::json!({ "workspaceId": workspace_id }),
      format!("workspace:{workspace_id}:quota-state"),
      "workspace.quota-state.changed",
    ),
    (
      "quota-state-changed",
      serde_json::json!({ "workspaceId": workspace_id }),
      format!("workspace:{workspace_id}:access"),
      "workspace.access.changed",
    ),
  ];
  if let Some(ref owner) = owner_id {
    topics.push((
      "runtime-invalidation",
      serde_json::json!({}),
      format!("user:{owner}:quota-state"),
      "user.quota-state.changed",
    ));
  }
  for (reason, input, room, topic) in topics {
    let req = format!("{prefix}:event:{}", uuid::Uuid::new_v4());
    let payload = serde_json::json!({
      "event": { "changed": true, "reason": reason }, "input": input, "room": room, "topic": topic,
    });
    let _ = state
      .event_bus
      .publish_event("realtime.topic.changed", payload, Some(&req))
      .await;
  }
}

async fn require_member_state<'a>(ctx: &'a Context<'_>, workspace_id: &str) -> Result<&'a Arc<AppState>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .require_active_member_role(workspace_id, &user.id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(state)
}

pub(crate) async fn resolve_blob_upload_part_url(
  ctx: &Context<'_>,
  workspace_id: &str,
  key: String,
  upload_id: String,
  part_number: i32,
) -> Result<BlobUploadPart> {
  let state = require_member_state(ctx, workspace_id).await?;
  let cfg = state.config.load();
  let plan = state
    .blobs
    .get_blob_upload_part_url(
      workspace_id,
      &key,
      &upload_id,
      part_number,
      &cfg.external_url,
      cfg.multipart_part_size,
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(BlobUploadPart {
    expires_at: plan.expires_at,
    headers: headers_to_json_scalar(plan.headers),
    upload_url: plan.upload_url,
  })
}
pub(crate) async fn mutate_create_blob_upload(
  ctx: &Context<'_>,
  workspace_id: String,
  key: String,
  size: i32,
  mime: String,
) -> Result<BlobUploadInit> {
  let state = require_member_state(ctx, &workspace_id).await?;
  let cfg = state.config.load();
  let plan = state
    .blobs
    .init_blob_upload(
      &workspace_id,
      &key,
      i64::from(size),
      &mime,
      &cfg.external_url,
      cfg.multipart_threshold,
      cfg.multipart_part_size,
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let method = match plan.method {
    UploadInitMethod::Graphql => BlobUploadMethod::Graphql,
    UploadInitMethod::Multipart => BlobUploadMethod::Multipart,
    UploadInitMethod::Presigned => BlobUploadMethod::Presigned,
  };
  Ok(BlobUploadInit {
    already_uploaded: plan.already_uploaded.then_some(true),
    blob_key: plan.blob_key,
    expires_at: plan.expires_at,
    headers: headers_to_json_scalar(plan.headers),
    method,
    part_size: plan.part_size,
    upload_id: plan.upload_id,
    upload_url: plan.upload_url,
    uploaded_parts: plan.uploaded_parts.map(|parts| {
      parts
        .into_iter()
        .map(|p| BlobUploadedPart {
          etag: p.etag,
          part_number: p.part_number,
        })
        .collect()
    }),
  })
}

pub(crate) async fn mutate_complete_blob_upload(
  ctx: &Context<'_>,
  workspace_id: String,
  key: String,
  upload_id: Option<String>,
  parts: Option<Vec<BlobUploadPartInput>>,
) -> Result<String> {
  let state = require_member_state(ctx, &workspace_id).await?;
  let mapped: Option<Vec<UploadedPart>> = parts.map(|list| {
    list
      .into_iter()
      .map(|p| UploadedPart {
        part_number: p.part_number,
        etag: p.etag,
      })
      .collect()
  });
  let completed_key = state
    .blobs
    .complete_blob_upload(&workspace_id, &key, upload_id.as_deref(), mapped.as_deref())
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  publish_quota_storage_invalidation(state, &workspace_id).await;
  Ok(completed_key)
}
pub(crate) async fn mutate_abort_blob_upload(
  ctx: &Context<'_>,
  workspace_id: String,
  key: String,
  upload_id: String,
) -> Result<bool> {
  let state = require_member_state(ctx, &workspace_id).await?;
  state
    .blobs
    .abort_blob_upload(&workspace_id, &key, &upload_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))
}
pub(crate) async fn mutate_set_blob(ctx: &Context<'_>, workspace_id: String, blob: Upload) -> Result<String> {
  let state = require_member_state(ctx, &workspace_id).await?;
  let mut upload = blob
    .value(ctx)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid blob upload: {e}"))))?;
  let filename = upload.filename.clone();
  let mime = upload
    .content_type
    .as_deref()
    .filter(|s| !s.trim().is_empty())
    .unwrap_or("application/octet-stream");
  let mut bytes = Vec::new();
  upload
    .content
    .by_ref()
    .take((MAX_GRAPHQL_MULTIPART_FILE_BYTES + 1) as u64)
    .read_to_end(&mut bytes)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read blob upload: {e}"))))?;
  if bytes.len() > MAX_GRAPHQL_MULTIPART_FILE_BYTES {
    return Err(domain_error_to_graphql(&DomainError::QuotaExceeded {
      kind: "blob_limit",
      message: "You have exceeded your blob size quota.".to_owned(),
    }));
  }
  let outcome = state
    .blobs
    .put_blob(&workspace_id, &filename, mime, bytes)
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
#[derive(Default)]
pub struct BlobMutation;
#[async_graphql::Object]
impl BlobMutation {
  async fn create_blob_upload(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    key: String,
    size: i32,
    mime: String,
  ) -> Result<BlobUploadInit> {
    mutate_create_blob_upload(ctx, workspace_id, key, size, mime).await
  }
  async fn complete_blob_upload(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    key: String,
    upload_id: Option<String>,
    parts: Option<Vec<BlobUploadPartInput>>,
  ) -> Result<String> {
    mutate_complete_blob_upload(ctx, workspace_id, key, upload_id, parts).await
  }
  async fn abort_blob_upload(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    key: String,
    upload_id: String,
  ) -> Result<bool> {
    mutate_abort_blob_upload(ctx, workspace_id, key, upload_id).await
  }
  async fn set_blob(&self, ctx: &Context<'_>, workspace_id: String, blob: async_graphql::Upload) -> Result<String> {
    mutate_set_blob(ctx, workspace_id, blob).await
  }
  async fn delete_blob(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    key: Option<String>,
    #[graphql(deprecation = "use parameter [key]")] hash: Option<String>,
    #[graphql(default = false)] permanently: bool,
  ) -> Result<bool> {
    mutate_delete_blob(ctx, workspace_id, key, hash, permanently).await
  }
  async fn release_deleted_blobs(&self, ctx: &Context<'_>, workspace_id: String) -> Result<bool> {
    mutate_release_deleted_blobs(ctx, workspace_id).await
  }
}
