//! User profile, avatar, and user lookup GraphQL resolvers.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{Context, ID, InputObject, Object, Result, SimpleObject, Union, Upload};
use chrono::{DateTime, Utc};
use server_domain::users::{CurrentUserView, UpdateProfileInput};
use server_types::DomainError;

use super::{AuthenticatedUser, FeatureType, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::legacy_compat::quota::{UserQuotaType, user_quota_from_grant};

const MAX_AVATAR_BYTES: usize = 5 * 1024 * 1024;

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PublicUserType")]
pub struct PublicUserType {
  pub id: String,
  pub name: String,
  pub avatar_url: Option<String>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "WorkspaceUserType")]
pub struct WorkspaceUserType {
  pub id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "LimitedUserType")]
pub struct LimitedUserType {
  pub email: String,
  pub has_password: Option<bool>,
}

#[derive(Union)]
#[graphql(name = "UserOrLimitedUser")]
pub enum UserOrLimitedUser {
  Limited(LimitedUserType),
  User(Box<UserType>),
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "RemoveAvatar")]
pub struct RemoveAvatar {
  pub success: bool,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "DeleteAccount")]
pub struct DeleteAccount {
  pub success: bool,
}

#[derive(SimpleObject, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "UserSettingsType")]
pub struct UserSettingsType {
  pub receive_invitation_email: bool,
  pub receive_mention_email: bool,
  pub receive_comment_email: bool,
}

#[derive(InputObject, Clone, Copy, Debug)]
#[graphql(name = "UpdateUserSettingsInput")]
pub struct UpdateUserSettingsInput {
  pub receive_invitation_email: Option<bool>,
  pub receive_mention_email: Option<bool>,
  pub receive_comment_email: Option<bool>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateUserInput")]
pub struct UpdateUserInput {
  pub name: Option<String>,
}

pub struct UserType {
  pub(crate) view: CurrentUserView,
}

#[Object(name = "UserType")]
impl UserType {
  async fn id(&self) -> ID {
    ID(self.view.id.clone())
  }

  async fn name(&self) -> &str {
    &self.view.name
  }

  async fn email(&self) -> &str {
    &self.view.email
  }

  async fn avatar_url(&self) -> Option<&str> {
    self.view.avatar_url.as_deref()
  }

  async fn disabled(&self) -> bool {
    self.view.disabled
  }

  async fn email_verified(&self) -> bool {
    self.view.email_verified
  }

  async fn has_password(&self) -> Option<bool> {
    Some(self.view.has_password)
  }

  async fn features(&self) -> Vec<FeatureType> {
    if self.view.is_admin() {
      vec![FeatureType::Admin]
    } else {
      vec![]
    }
  }

  async fn quota(&self, ctx: &Context<'_>) -> Result<UserQuotaType> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let mut tx = state
      .db
      .begin_tiered(server_db::WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Unavailable(e.to_string())))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("load user quota clock: {e}"))))?;
    let grant = state
      .extension
      .quota_gate()
      .resolve_user_grant(tx.tx_mut(), &caller.id, now)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let owned_workspaces: Vec<String> = sqlx::query_scalar(
      "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND role = 'owner' AND state = 'active'",
    )
    .bind(&caller.id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("load owned workspaces: {e}"))))?;

    let mut personal_ws_ids = Vec::with_capacity(owned_workspaces.len());
    for ws_id in owned_workspaces {
      let ws_grant = state
        .extension
        .quota_gate()
        .resolve_workspace_grant(tx.tx_mut(), &ws_id, now)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
      if ws_grant.billing_subject == server_types::BillingSubject::Owner {
        personal_ws_ids.push(ws_id);
      }
    }

    let used_storage_quota: i64 = if personal_ws_ids.is_empty() {
      0
    } else {
      sqlx::query_scalar(
        r#"SELECT (
             COALESCE((
               SELECT SUM(b.size)::bigint
               FROM blobs b
               WHERE b.workspace_id = ANY($1)
                 AND b.deleted_at IS NULL
                 AND (b.status = 'completed' OR (b.status = 'pending' AND b.reservation_expires_at > $2))
             ), 0)
             + COALESCE((
               SELECT SUM(ca.size)::bigint
               FROM comment_attachments ca
               WHERE ca.workspace_id = ANY($1)
                 AND ca.deleted_at IS NULL
                 AND (ca.status = 'completed' OR (ca.status = 'pending' AND ca.reservation_expires_at > $2))
             ), 0)
           )::bigint"#,
      )
      .bind(&personal_ws_ids)
      .bind(now)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("load user storage usage: {e}"))))?
    };
    let _ = tx.rollback().await;
    Ok(user_quota_from_grant(&grant, used_storage_quota))
  }

  async fn settings(&self, ctx: &Context<'_>) -> Result<UserSettingsType> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let s = state
      .users
      .get_settings(&caller.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(UserSettingsType {
      receive_invitation_email: s.receive_invitation_email,
      receive_mention_email: s.receive_mention_email,
      receive_comment_email: s.receive_comment_email,
    })
  }

  async fn notifications(
    &self,
    ctx: &Context<'_>,
    pagination: super::doc::PaginationInput,
  ) -> Result<super::notification::PaginatedNotificationObjectType> {
    super::notification::resolve_user_notifications(ctx, pagination).await
  }
}

pub(crate) fn resolve_current_user(ctx: &Context<'_>) -> Option<UserType> {
  let auth = ctx.data_opt::<AuthenticatedUser>()?;
  if let Some(view) = &auth.user {
    return Some(UserType { view: view.clone() });
  }
  Some(UserType {
    view: CurrentUserView {
      id: auth.user_id.clone(),
      name: String::new(),
      email: String::new(),
      avatar_url: None,
      disabled: false,
      has_password: false,
      email_verified: false,
      features: Vec::new(),
    },
  })
}

pub(crate) async fn resolve_user_by_email(ctx: &Context<'_>, email: String) -> Result<Option<UserOrLimitedUser>> {
  let canonical = server_domain::auth::canonical_email(&email).map_err(|e| domain_error_to_graphql(&e))?;
  let Some(auth) = ctx.data_opt::<AuthenticatedUser>() else {
    return Ok(None);
  };
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let view = state
    .users
    .get_user_by_email_for_actor(&auth.user_id, &canonical)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(view.map(|v| UserOrLimitedUser::User(Box::new(UserType { view: v }))))
}

pub(crate) async fn resolve_public_user_by_id(ctx: &Context<'_>, id: String) -> Result<Option<PublicUserType>> {
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let view = state
    .users
    .get_public_user(&id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(view.map(|v| PublicUserType {
    id: v.id,
    name: v.name,
    avatar_url: v.avatar_url,
  }))
}

pub(crate) async fn mutate_update_profile(ctx: &Context<'_>, input: UpdateUserInput) -> Result<UserType> {
  let user = require_authenticated_user(ctx).await?;
  if input.name.is_none() {
    return Ok(UserType { view: user });
  }
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let updated = state
    .users
    .update_profile(
      &user.id,
      UpdateProfileInput {
        name: input.name,
        avatar_url: None,
      },
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let req_id = super::graphql_request_id(state);
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "topic": "user.profile.changed",
        "room": format!("user:{}:profile", updated.id),
        "input": {},
        "event": { "changed": true, "reason": "user-updated" },
      }),
      Some(req_id.as_str()),
    )
    .await;
  let ws_ids = match state.db.acquire_tiered(server_db::WorkloadTier::InteractiveRead).await {
    Ok(mut conn) => sqlx::query_scalar::<_, String>(
      "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND state = 'active' ORDER BY workspace_id ASC",
    )
    .bind(&updated.id)
    .fetch_all(&mut *conn)
    .await
    .unwrap_or_default(),
    Err(_) => Vec::new(),
  };
  for ws_id in ws_ids {
    let _ = state
      .event_bus
      .publish_event(
        "realtime.topic.changed",
        serde_json::json!({
          "topic": "workspace.members.changed",
          "room": format!("workspace:{ws_id}:members"),
          "input": { "workspaceId": ws_id },
          "event": { "changed": true, "reason": "user-updated" },
        }),
        Some(req_id.as_str()),
      )
      .await;
  }
  let doc_rows = match state.db.acquire_tiered(server_db::WorkloadTier::InteractiveRead).await {
    Ok(mut conn) => sqlx::query_as::<_, (String, String)>(
      "SELECT workspace_id, doc_id FROM doc_grants WHERE principal_type = 'user' AND principal_id = $1 ORDER BY workspace_id ASC, doc_id ASC",
    )
    .bind(&updated.id)
    .fetch_all(&mut *conn)
    .await
    .unwrap_or_default(),
    Err(_) => Vec::new(),
  };
  for (ws_id, doc_id) in doc_rows {
    let _ = state
      .event_bus
      .publish_event(
        "realtime.topic.changed",
        serde_json::json!({
          "topic": "doc.grants.changed",
          "room": format!("workspace:{ws_id}:doc:{doc_id}:grants"),
          "input": { "workspaceId": ws_id, "docId": doc_id },
          "event": { "changed": true, "reason": "user-updated" },
        }),
        Some(req_id.as_str()),
      )
      .await;
  }
  Ok(UserType { view: updated })
}

fn image_format_not_supported_error() -> async_graphql::Error {
  use async_graphql::ErrorExtensions as _;
  async_graphql::Error::new("Image format not supported.").extend_with(|_, ext| {
    ext.set("status", 400);
    ext.set("code", "Bad Request");
    ext.set("type", "INVALID_INPUT");
    ext.set("name", "IMAGE_FORMAT_NOT_SUPPORTED");
    ext.set("message", "Image format not supported.");
  })
}

fn transcode_avatar_to_webp(bytes: &[u8]) -> std::result::Result<Vec<u8>, async_graphql::Error> {
  use std::io::Cursor;

  use image::imageops::FilterType;
  use image::metadata::Orientation;
  use image::{GenericImageView as _, ImageDecoder as _, ImageFormat, ImageReader, Limits};

  const MAX_AVATAR_DIMENSION: u32 = 16_384;
  const MAX_AVATAR_PIXELS: u64 = 40_000_000;
  const MAX_AVATAR_DECODE_ALLOC: u64 = 192 * 1024 * 1024;

  let format = image::guess_format(bytes).map_err(|_| image_format_not_supported_error())?;
  let mut limits = Limits::default();
  limits.max_image_width = Some(MAX_AVATAR_DIMENSION);
  limits.max_image_height = Some(MAX_AVATAR_DIMENSION);
  limits.max_alloc = Some(MAX_AVATAR_DECODE_ALLOC);

  // Check dimensions before allocating pixel buffers.
  let mut dim_reader = ImageReader::with_format(Cursor::new(bytes), format);
  dim_reader.limits(limits.clone());
  let (width, height) = dim_reader
    .into_dimensions()
    .map_err(|_| image_format_not_supported_error())?;
  if width == 0
    || height == 0
    || width > MAX_AVATAR_DIMENSION
    || height > MAX_AVATAR_DIMENSION
    || u64::from(width) * u64::from(height) > MAX_AVATAR_PIXELS
  {
    return Err(image_format_not_supported_error());
  }

  let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
  reader.limits(limits);
  let mut decoder = reader.into_decoder().map_err(|_| image_format_not_supported_error())?;
  let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
  let mut img = image::DynamicImage::from_decoder(decoder).map_err(|_| image_format_not_supported_error())?;
  img.apply_orientation(orientation);

  let (w, h) = img.dimensions();
  let resized = if w > 512 || h > 512 {
    img.resize(512, 512, FilterType::Lanczos3)
  } else {
    img
  };

  let mut out = Cursor::new(Vec::new());
  resized
    .write_to(&mut out, ImageFormat::WebP)
    .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("encode webp avatar: {e}"))))?;
  Ok(out.into_inner())
}

fn is_owned_avatar_key(user_id: &str, key: &str) -> bool {
  key.starts_with(&format!("{user_id}-avatar-"))
    && !key.contains('/')
    && !key.contains('\\')
    && !key.contains("..")
    && !key.contains('\0')
}

pub(crate) async fn mutate_upload_avatar(ctx: &Context<'_>, avatar: Upload) -> Result<UserType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let mut upload = avatar
    .value(ctx)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid avatar upload: {e}"))))?;
  let mut bytes = Vec::new();
  upload
    .content
    .by_ref()
    .take((MAX_AVATAR_BYTES + 1) as u64)
    .read_to_end(&mut bytes)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read avatar: {e}"))))?;
  if bytes.is_empty() || bytes.len() > MAX_AVATAR_BYTES {
    return Err(domain_error_to_graphql(&DomainError::Validation(
      "avatar must be between 1 byte and 5 MB".into(),
    )));
  }

  let permit = state
    .avatar_transcode_sem
    .clone()
    .acquire_owned()
    .await
    .map_err(|_| domain_error_to_graphql(&DomainError::Internal("avatar transcoder unavailable".into())))?;
  let webp_bytes = tokio::task::spawn_blocking(move || {
    let _permit = permit;
    transcode_avatar_to_webp(&bytes)
  })
  .await
  .map_err(|e| domain_error_to_graphql(&DomainError::Internal(format!("avatar decode task failed: {e}"))))??;

  let short_uuid = &uuid::Uuid::new_v4().simple().to_string()[..8];
  let key = format!("{}-avatar-{}-{short_uuid}", user.id, Utc::now().timestamp_millis());
  state
    .avatars
    .put(&key, webp_bytes, "image/webp")
    .await
    .map_err(|e| domain_error_to_graphql(&DomainError::Unavailable(format!("store avatar failed: {e}"))))?;

  let base = state.config.load().external_url.trim_end_matches('/').to_owned();
  let avatar_url = format!("{base}/api/avatars/{key}");
  let updated = state
    .users
    .update_profile(
      &user.id,
      UpdateProfileInput {
        name: None,
        avatar_url: Some(Some(avatar_url)),
      },
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  if let Some(old_url) = user.avatar_url.as_deref()
    && let Some(old_key) = old_url.rsplit("/api/avatars/").next()
    && old_key != old_url
    && old_key != key
    && is_owned_avatar_key(&user.id, old_key)
  {
    let _ = state.avatars.delete(old_key).await;
  }

  Ok(UserType { view: updated })
}

pub(crate) async fn mutate_remove_avatar(ctx: &Context<'_>) -> Result<RemoveAvatar> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .users
    .update_profile(
      &user.id,
      UpdateProfileInput {
        name: None,
        avatar_url: Some(None),
      },
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(RemoveAvatar { success: true })
}

pub(crate) async fn mutate_update_settings(ctx: &Context<'_>, input: UpdateUserSettingsInput) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .users
    .update_settings(
      &user.id,
      server_domain::users::UpdateUserSettingsInput {
        receive_invitation_email: input.receive_invitation_email,
        receive_mention_email: input.receive_mention_email,
        receive_comment_email: input.receive_comment_email,
      },
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let req_id = super::graphql_request_id(state);
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "topic": "user.settings.changed",
        "room": format!("user:{}:settings", user.id),
        "input": {},
        "event": { "changed": true, "reason": "settings-updated" },
      }),
      Some(req_id.as_str()),
    )
    .await;
  Ok(true)
}

async fn cleanup_deleted_workspace_objects(
  state: &AppState,
  workspace_id: &str,
  blob_keys: &[String],
  comment_attachments: &[(String, String)],
) {
  if blob_keys.is_empty() && comment_attachments.is_empty() {
    return;
  }
  let Ok(mut conn) = state.db.dedicated_session_conn().await else {
    return;
  };
  let lock_key = format!("storage-workspace:{workspace_id}");
  if sqlx::query("SELECT pg_advisory_lock(hashtextextended($1, 0))")
    .bind(&lock_key)
    .execute(&mut conn)
    .await
    .is_err()
  {
    return;
  }

  let exists: Option<bool> = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
    .bind(workspace_id)
    .fetch_one(&mut conn)
    .await
    .ok();
  if exists == Some(false) {
    for key in blob_keys {
      let object_key = format!("{workspace_id}/{key}");
      let _ = state.blobs.storage().delete(&object_key).await;
    }
    for (doc_id, key) in comment_attachments {
      let object_key = format!("{workspace_id}/{doc_id}/{key}");
      let _ = state.comment_attachments.delete(&object_key).await;
    }
  }

  let _ = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1, 0))")
    .bind(&lock_key)
    .execute(&mut conn)
    .await;
}

#[derive(Default)]
struct WorkspaceCleanupItems {
  blob_keys: Vec<String>,
  attachments: Vec<(String, String)>,
}

async fn finish_deleted_user_cleanup(state: &AppState, cleanup: server_domain::users::DeletedUserCleanup) {
  let mut by_workspace: std::collections::BTreeMap<String, WorkspaceCleanupItems> = std::collections::BTreeMap::new();
  for ws_id in &cleanup.deleted_workspace_ids {
    by_workspace.entry(ws_id.clone()).or_default();
  }
  for (ws_id, key) in cleanup.blob_keys {
    by_workspace.entry(ws_id).or_default().blob_keys.push(key);
  }
  for (ws_id, doc_id, key) in cleanup.comment_attachment_keys {
    let items = by_workspace.entry(ws_id).or_default();
    items.attachments.push((doc_id, key));
  }

  for (ws_id, items) in by_workspace {
    let _ = state
      .invalidation
      .publish_invalidation(&server_domain::events::InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: ws_id.clone(),
        doc_id: None,
      })
      .await;
    cleanup_deleted_workspace_objects(state, &ws_id, &items.blob_keys, &items.attachments).await;
  }
  if let Some(avatar_url) = cleanup.avatar_url
    && let Some(key) = avatar_url.rsplit('/').next().filter(|k| !k.is_empty())
  {
    let _ = state.avatars.delete(key).await;
  }
}

pub(crate) async fn mutate_delete_account(ctx: &Context<'_>) -> Result<DeleteAccount> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let quota_gate = state.extension.quota_gate();
  let billing = state.extension.billing_spi();
  match state
    .users
    .delete_user(&user.id, quota_gate.as_ref(), billing.as_ref())
    .await
  {
    Ok(cleanup) => {
      finish_deleted_user_cleanup(state, cleanup).await;
      Ok(DeleteAccount { success: true })
    }
    Err(del_err) => {
      if !del_err.partial_cleanup.is_empty() {
        finish_deleted_user_cleanup(state, *del_err.partial_cleanup).await;
      }
      Err(domain_error_to_graphql(&del_err.error))
    }
  }
}

pub(crate) async fn mutate_delete_user(ctx: &Context<'_>, id: String) -> Result<DeleteAccount> {
  let admin = super::require_admin_user(ctx).await?;
  if admin.id == id {
    return Err(domain_error_to_graphql(&DomainError::Validation(
      "cannot_delete_own_account".into(),
    )));
  }
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let quota_gate = state.extension.quota_gate();
  let billing = state.extension.billing_spi();
  match state
    .users
    .delete_user(&id, quota_gate.as_ref(), billing.as_ref())
    .await
  {
    Ok(cleanup) => {
      finish_deleted_user_cleanup(state, cleanup).await;
      Ok(DeleteAccount { success: true })
    }
    Err(del_err) => {
      if !del_err.partial_cleanup.is_empty() {
        finish_deleted_user_cleanup(state, *del_err.partial_cleanup).await;
      }
      Err(domain_error_to_graphql(&del_err.error))
    }
  }
}

#[cfg(test)]
mod tests {
  use std::sync::{Arc, Barrier};

  #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
  async fn owned_avatar_permit_stays_held_in_spawn_blocking_after_outer_future_cancelled() {
    let sem = Arc::new(tokio::sync::Semaphore::new(4));
    let entered = Arc::new(Barrier::new(5));
    let release = Arc::new(Barrier::new(5));

    let mut handles = Vec::new();
    for _ in 0..4 {
      let sem = Arc::clone(&sem);
      let entered = Arc::clone(&entered);
      let release = Arc::clone(&release);
      handles.push(tokio::spawn(async move {
        let permit = sem.acquire_owned().await.unwrap();
        tokio::task::spawn_blocking(move || {
          let _permit = permit;
          entered.wait();
          release.wait();
        })
        .await
        .unwrap();
      }));
    }

    // Wait until all 4 permits are inside their blocking closures.
    tokio::task::spawn_blocking({
      let entered = Arc::clone(&entered);
      move || entered.wait()
    })
    .await
    .unwrap();

    // Abort one outer request future (simulating client disconnect).
    handles[0].abort();
    let _ = (&mut handles[0]).await;

    // The 5th acquisition must still fail because the blocking closure holds the permit.
    assert!(
      sem.try_acquire().is_err(),
      "5th permit must not be granted while blocking closure is still running"
    );

    // Release all 4 blocking closures and verify the 5th acquisition now succeeds.
    tokio::task::spawn_blocking(move || release.wait()).await.unwrap();
    for h in handles.into_iter().skip(1) {
      h.await.unwrap();
    }
    // Wait briefly for the aborted task's blocking thread to drop its permit.
    let permit = tokio::time::timeout(std::time::Duration::from_secs(2), sem.acquire())
      .await
      .expect("5th permit must become available after blocking closure exits")
      .expect("semaphore open");
    drop(permit);
  }

  #[test]
  fn deleted_workspace_object_cleanup_serializes_with_same_id_recreate_upload() {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, Ordering};

    use async_trait::async_trait;
    use server_blob::{BlobService, BlobStorageBackend, LocalFsBlobStorage, ObjectMetadata, StorageError};
    use server_db::phase_a_compat::sessions::PhaseASessionRepository;
    use server_db::{DbConfig, ServerDb};
    use server_domain::{
      app_config::AppConfigService,
      auth::{AuthConfig, AuthService},
      comments::CommentService,
      doc_sharing::DocSharingService,
      events::{EventBusPublisher, InvalidationPublisher, NoopEventPublisher},
      histories::DocHistoryService,
      notifications::NotificationService,
      selfhost_license::SelfhostLicenseService,
      users::{DeletedUserCleanup, UserService},
      workspaces::WorkspaceService,
    };
    use server_search::{SearchConfig, SearchRuntime};
    use server_spi::CommunityExtension;
    use server_types::ServerRole;
    use tokio::sync::oneshot;

    struct PauseDeleteStorage {
      inner: LocalFsBlobStorage,
      pause_next_delete: AtomicBool,
      entered_tx: Mutex<Option<oneshot::Sender<()>>>,
      release_rx: Mutex<Option<oneshot::Receiver<()>>>,
      pause_next_put: AtomicBool,
      put_entered_tx: Mutex<Option<oneshot::Sender<()>>>,
      put_release_rx: Mutex<Option<oneshot::Receiver<()>>>,
    }

    #[async_trait]
    impl BlobStorageBackend for PauseDeleteStorage {
      async fn put(
        &self,
        key: &str,
        data: Vec<u8>,
        content_type: &str,
      ) -> std::result::Result<ObjectMetadata, StorageError> {
        if self.pause_next_put.swap(false, Ordering::SeqCst) {
          let tx = self.put_entered_tx.lock().unwrap().take();
          if let Some(tx) = tx {
            let _ = tx.send(());
          }
          let rx = self.put_release_rx.lock().unwrap().take();
          if let Some(rx) = rx {
            let _ = rx.await;
          }
        }
        self.inner.put(key, data, content_type).await
      }
      async fn get(&self, key: &str) -> std::result::Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
        self.inner.get(key).await
      }
      async fn head(&self, key: &str) -> std::result::Result<Option<ObjectMetadata>, StorageError> {
        self.inner.head(key).await
      }
      async fn delete(&self, key: &str) -> std::result::Result<(), StorageError> {
        if self.pause_next_delete.swap(false, Ordering::SeqCst) {
          let tx = self.entered_tx.lock().unwrap().take();
          if let Some(tx) = tx {
            let _ = tx.send(());
          }
          let rx = self.release_rx.lock().unwrap().take();
          if let Some(rx) = rx {
            let _ = rx.await;
          }
        }
        self.inner.delete(key).await
      }
    }

    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test pg cluster");
    let migrations = test_db_harness::migrations::MigrationSet {
      migrations: vec![],
      digest: "5e20000000000099".to_owned(),
    };
    let template = cluster.ensure_template(&migrations).expect("ensure empty template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease db");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .worker_threads(2)
      .enable_all()
      .build()
      .expect("build runtime");

    rt.block_on(async move {
      let mut db_cfg = DbConfig::new(&db_url);
      db_cfg.role = ServerRole::Allinone;
      db_cfg.max_connections = 8;
      db_cfg.statement_timeout_ms = 10_000;
      let db = ServerDb::connect(db_cfg).await.expect("connect db");
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema");

      let root = std::env::temp_dir().join(format!("affine-ws-cleanup-lock-{}", uuid::Uuid::new_v4()));
      let root_str = root.to_string_lossy();
      let (entered_tx, entered_rx) = oneshot::channel();
      let (release_tx, release_rx) = oneshot::channel();
      let (put_entered_tx, put_entered_rx) = oneshot::channel();
      let (put_release_tx, put_release_rx) = oneshot::channel();
      let pause_storage = Arc::new(PauseDeleteStorage {
        inner: LocalFsBlobStorage::new(&root_str, "blobs").expect("blobs storage"),
        pause_next_delete: AtomicBool::new(true),
        entered_tx: Mutex::new(Some(entered_tx)),
        release_rx: Mutex::new(Some(release_rx)),
        pause_next_put: AtomicBool::new(false),
        put_entered_tx: Mutex::new(Some(put_entered_tx)),
        put_release_rx: Mutex::new(Some(put_release_rx)),
      });
      let extension: Arc<dyn server_spi::ServerExtension> = Arc::new(CommunityExtension::new());
      let noop = Arc::new(NoopEventPublisher::default());
      let invalidation: Arc<dyn InvalidationPublisher> = noop.clone();
      let event_bus: Arc<dyn EventBusPublisher> = noop;
      let config = crate::RuntimeConfig::default();
      let doc_sharing = DocSharingService::new(
        db.clone(),
        extension.quota_gate(),
        Arc::clone(&invalidation),
        Arc::clone(&event_bus),
      );
      let auth_cfg = AuthConfig {
        private_key: format!("ephemeral-test-key-{}", uuid::Uuid::new_v4()),
        ..AuthConfig::default()
      };
      let auth = AuthService::new(
        db.clone(),
        Arc::new(PhaseASessionRepository),
        extension.session_policy(),
        auth_cfg,
      );
      let users = UserService::new(db.clone());
      let workspaces = WorkspaceService::new(db.clone(), extension.quota_gate(), Arc::clone(&invalidation));
      let histories = DocHistoryService::new(db.clone(), extension.quota_gate(), doc_sharing.clone());
      let comments = CommentService::new(
        db.clone(),
        extension.quota_gate(),
        doc_sharing.clone(),
        Arc::clone(&event_bus),
      );
      let notifications = NotificationService::new(
        db.clone(),
        extension.quota_gate(),
        doc_sharing.clone(),
        Arc::clone(&event_bus),
      );
      let licenses = SelfhostLicenseService::new(db.clone(), extension.quota_gate(), Arc::clone(&invalidation));
      let app_config = AppConfigService::new(db.clone(), config.app_config_baseline.clone(), Arc::clone(&event_bus));
      let blobs = BlobService::new(db.clone(), pause_storage.clone(), extension.quota_gate());
      let search =
        Arc::new(SearchRuntime::new(db.pool().clone(), extension.quota_gate(), SearchConfig::default()).unwrap());
      let avatars = Arc::new(LocalFsBlobStorage::new(&root_str, "avatars").expect("avatars storage"));
      let comment_attachments =
        Arc::new(LocalFsBlobStorage::new(&root_str, "comment-attachments").expect("attachments storage"));
      let state = crate::AppState::with_services(
        db.clone(),
        None,
        config,
        extension,
        crate::AppServices {
          auth,
          users,
          workspaces,
          doc_sharing,
          histories,
          comments,
          notifications,
          licenses,
          app_config,
          blobs,
          search,
          avatars,
          comment_attachments,
          invalidation,
          event_bus,
        },
      );

      // 1. Seed old object for deleted workspace `ws_same`, start cleanup, and pause inside DELETE
      //    after `SELECT EXISTS(SELECT 1 FROM workspaces)` confirmed absence.
      let ws_same = format!("ws-same-{}", uuid::Uuid::new_v4().simple());
      let object_key = format!("{ws_same}/k1");
      pause_storage
        .inner
        .put(&object_key, b"old-bytes".to_vec(), "application/octet-stream")
        .await
        .expect("seed old bytes");

      let cleanup_state = Arc::clone(&state);
      let cleanup_ws = ws_same.clone();
      let cleanup_handle = tokio::spawn(async move {
        super::finish_deleted_user_cleanup(
          &cleanup_state,
          DeletedUserCleanup {
            deleted_workspace_ids: vec![cleanup_ws.clone()],
            blob_keys: vec![(cleanup_ws, "k1".to_owned())],
            comment_attachment_keys: vec![],
            avatar_url: None,
          },
        )
        .await;
      });

      entered_rx.await.expect("cleanup entered delete");

      // While cleanup holds the exclusive `storage-workspace:<ws>` session lock, recreating the
      // same-ID workspace is fenced by `guard_workspace_storage_lifecycle_insert()` (SQLSTATE 40001).
      let recreate_while_locked = sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_same)
        .execute(db.pool())
        .await
        .expect_err("same-ID workspace insert must fail while cleanup holds exclusive lock");
      let db_err = recreate_while_locked.as_database_error().expect("pg database error");
      assert_eq!(db_err.code().as_deref(), Some("40001"));

      // Release old DELETE: old bytes are deleted and the exclusive session lock is released.
      let _ = release_tx.send(());
      cleanup_handle.await.unwrap();

      // 2. Recreate same-ID workspace and pause inside `put_blob` while holding the shared
      //    `storage-workspace:<ws>` lock; start a stale cleanup concurrently and verify it waits
      //    for the upload to finish and then skips deleting the recreated workspace's object.
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws_same)
        .execute(db.pool())
        .await
        .unwrap();

      pause_storage.pause_next_put.store(true, Ordering::SeqCst);
      let upload_state = Arc::clone(&state);
      let upload_ws = ws_same.clone();
      let upload_handle = tokio::spawn(async move {
        upload_state
          .blobs
          .put_blob(&upload_ws, "k1", "application/octet-stream", b"new-bytes".to_vec())
          .await
      });

      put_entered_rx.await.expect("upload entered put under shared lock");

      let stale_state = Arc::clone(&state);
      let stale_ws = ws_same.clone();
      let stale_cleanup = tokio::spawn(async move {
        super::finish_deleted_user_cleanup(
          &stale_state,
          DeletedUserCleanup {
            deleted_workspace_ids: vec![stale_ws.clone()],
            blob_keys: vec![(stale_ws, "k1".to_owned())],
            comment_attachment_keys: vec![],
            avatar_url: None,
          },
        )
        .await;
      });

      for _ in 0..8 {
        tokio::task::yield_now().await;
      }
      assert!(
        !stale_cleanup.is_finished(),
        "stale cleanup must wait on in-flight upload's shared storage-workspace lock"
      );

      let _ = put_release_tx.send(());
      upload_handle.await.unwrap().expect("same-key upload succeeds");
      stale_cleanup.await.unwrap();

      let (still_there, _) = pause_storage
        .get(&object_key)
        .await
        .unwrap()
        .expect("recreated workspace object must not be deleted by stale cleanup");
      assert_eq!(still_there, b"new-bytes");

      db.pool().close().await;
      let _ = std::fs::remove_dir_all(&root);
    });
  }
}
