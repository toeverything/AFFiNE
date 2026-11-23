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
  if let Ok(ws_ids) = sqlx::query_scalar::<_, String>(
    "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND state = 'active' ORDER BY workspace_id ASC",
  )
  .bind(&updated.id)
  .fetch_all(state.db.pool())
  .await
  {
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
  }
  if let Ok(doc_rows) = sqlx::query_as::<_, (String, String)>(
    "SELECT workspace_id, doc_id FROM doc_grants WHERE principal_type = 'user' AND principal_id = $1 ORDER BY workspace_id ASC, doc_id ASC",
  )
  .bind(&updated.id)
  .fetch_all(state.db.pool())
  .await
  {
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
}
