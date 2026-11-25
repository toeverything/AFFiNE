//! Document comments, replies, comment changes, and comment attachments GraphQL resolvers.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{Context, Enum, ID, InputObject, Result, SimpleObject, Upload};
use chrono::{DateTime, Utc};
use serde_json::json;
use server_domain::comments::{
  CommentChangeAction as DomainChangeAction, CommentNotificationContext, CommentRecord, MAX_COMMENT_ATTACHMENT_BYTES,
  ReplyRecord,
};
use server_types::DomainError;

use super::doc::{DocMode, PageInfo, PaginationInput, decode_json_cursor, encode_json_cursor};
use super::{JsonObjectScalar, PublicUserType, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "CommentChangeAction")]
pub enum CommentChangeAction {
  #[graphql(name = "update")]
  Update,
  #[graphql(name = "delete")]
  Delete,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "ReplyObjectType")]
pub struct ReplyObjectType {
  pub comment_id: ID,
  pub id: ID,
  pub content: JsonObjectScalar,
  pub user: PublicUserType,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

impl From<ReplyRecord> for ReplyObjectType {
  fn from(r: ReplyRecord) -> Self {
    Self {
      comment_id: ID(r.comment_id),
      id: ID(r.id),
      content: JsonObjectScalar(r.content),
      user: PublicUserType {
        id: r.user.id,
        name: r.user.name,
        avatar_url: r.user.avatar_url,
      },
      created_at: r.created_at,
      updated_at: r.updated_at,
    }
  }
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "CommentObjectType")]
pub struct CommentObjectType {
  pub id: ID,
  pub content: JsonObjectScalar,
  pub resolved: bool,
  pub user: PublicUserType,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub replies: Vec<ReplyObjectType>,
}

impl From<CommentRecord> for CommentObjectType {
  fn from(c: CommentRecord) -> Self {
    Self {
      id: ID(c.id),
      content: JsonObjectScalar(c.content),
      resolved: c.resolved,
      user: PublicUserType {
        id: c.user.id,
        name: c.user.name,
        avatar_url: c.user.avatar_url,
      },
      created_at: c.created_at,
      updated_at: c.updated_at,
      replies: c.replies.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "CommentObjectTypeEdge")]
pub struct CommentObjectTypeEdge {
  pub cursor: String,
  pub node: CommentObjectType,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "PaginatedCommentObjectType")]
pub struct PaginatedCommentObjectType {
  pub total_count: i32,
  pub edges: Vec<CommentObjectTypeEdge>,
  pub page_info: PageInfo,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "CommentChangeObjectType")]
pub struct CommentChangeObjectType {
  pub action: CommentChangeAction,
  pub id: ID,
  pub comment_id: Option<ID>,
  pub item: JsonObjectScalar,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "CommentChangeObjectTypeEdge")]
pub struct CommentChangeObjectTypeEdge {
  pub cursor: String,
  pub node: CommentChangeObjectType,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "PaginatedCommentChangeObjectType")]
pub struct PaginatedCommentChangeObjectType {
  pub total_count: i32,
  pub edges: Vec<CommentChangeObjectTypeEdge>,
  pub page_info: PageInfo,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CommentCreateInput")]
pub struct CommentCreateInput {
  pub workspace_id: ID,
  pub doc_id: ID,
  pub doc_title: String,
  pub doc_mode: DocMode,
  pub content: JsonObjectScalar,
  pub mentions: Option<Vec<String>>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CommentUpdateInput")]
pub struct CommentUpdateInput {
  pub id: ID,
  pub content: JsonObjectScalar,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CommentResolveInput")]
pub struct CommentResolveInput {
  pub id: ID,
  pub resolved: bool,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "ReplyCreateInput")]
pub struct ReplyCreateInput {
  pub comment_id: ID,
  pub content: JsonObjectScalar,
  pub doc_title: String,
  pub doc_mode: DocMode,
  pub mentions: Option<Vec<String>>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "ReplyUpdateInput")]
pub struct ReplyUpdateInput {
  pub id: ID,
  pub content: JsonObjectScalar,
}

pub(crate) async fn mutate_create_comment(ctx: &Context<'_>, input: CommentCreateInput) -> Result<CommentObjectType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let record = state
    .comments
    .create_comment(
      &user.id,
      input.workspace_id.as_str(),
      input.doc_id.as_str(),
      input.content.0,
      CommentNotificationContext {
        doc_title: input.doc_title,
        doc_mode: input.doc_mode.as_str().to_owned(),
        mentions: input.mentions.unwrap_or_default(),
      },
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(record.into())
}

pub(crate) async fn mutate_update_comment(ctx: &Context<'_>, input: CommentUpdateInput) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .comments
    .update_comment(&user.id, input.id.as_str(), input.content.0)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_resolve_comment(ctx: &Context<'_>, input: CommentResolveInput) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .comments
    .resolve_comment(&user.id, input.id.as_str(), input.resolved)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_delete_comment(ctx: &Context<'_>, id: String) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .comments
    .delete_comment(&user.id, &id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_create_reply(ctx: &Context<'_>, input: ReplyCreateInput) -> Result<ReplyObjectType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let record = state
    .comments
    .create_reply(
      &user.id,
      input.comment_id.as_str(),
      input.content.0,
      CommentNotificationContext {
        doc_title: input.doc_title,
        doc_mode: input.doc_mode.as_str().to_owned(),
        mentions: input.mentions.unwrap_or_default(),
      },
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(record.into())
}

pub(crate) async fn mutate_update_reply(ctx: &Context<'_>, input: ReplyUpdateInput) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .comments
    .update_reply(&user.id, input.id.as_str(), input.content.0)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_delete_reply(ctx: &Context<'_>, id: String) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .comments
    .delete_reply(&user.id, &id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_upload_comment_attachment(
  ctx: &Context<'_>,
  workspace_id: String,
  doc_id: String,
  attachment: Upload,
) -> Result<String> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let mut val = attachment
    .value(ctx)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid attachment upload: {e}"))))?;
  let filename = if val.filename.trim().is_empty() {
    "attachment".to_owned()
  } else {
    val.filename.clone()
  };
  let mime = val
    .content_type
    .clone()
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "application/octet-stream".to_owned());

  let mut bytes = Vec::new();
  val
    .content
    .by_ref()
    .take((MAX_COMMENT_ATTACHMENT_BYTES + 1) as u64)
    .read_to_end(&mut bytes)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read attachment: {e}"))))?;
  if bytes.len() > MAX_COMMENT_ATTACHMENT_BYTES {
    return Err(domain_error_to_graphql(&DomainError::QuotaExceeded {
      kind: "comment_attachment_quota_exceeded",
      message: "Comment attachment size exceeds 10 MB limit".into(),
    }));
  }

  let key = uuid::Uuid::new_v4().to_string();
  let reservation = state
    .comments
    .reserve_comment_attachment(server_domain::comments::ReserveCommentAttachmentInput {
      actor_user_id: &user.id,
      workspace_id: &workspace_id,
      raw_doc_id: &doc_id,
      key: &key,
      filename: &filename,
      mime: &mime,
      size: bytes.len(),
    })
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let object_key = format!(
    "comment-attachments/{workspace_id}/{}/{key}",
    reservation.storage_doc_id
  );
  if let Err(err) = state.blobs.storage().put(&object_key, bytes, &mime).await {
    state
      .comments
      .abort_comment_attachment(
        &workspace_id,
        &reservation.storage_doc_id,
        &key,
        &reservation.reservation_id,
      )
      .await;
    let _ = state.blobs.storage().delete(&object_key).await;
    return Err(domain_error_to_graphql(&DomainError::Unavailable(format!(
      "store comment attachment: {err}"
    ))));
  }
  if let Err(err) = state
    .comments
    .finalize_comment_attachment(
      &workspace_id,
      &reservation.storage_doc_id,
      &key,
      &reservation.reservation_id,
    )
    .await
  {
    state
      .comments
      .abort_comment_attachment(
        &workspace_id,
        &reservation.storage_doc_id,
        &key,
        &reservation.reservation_id,
      )
      .await;
    let _ = state.blobs.storage().delete(&object_key).await;
    return Err(domain_error_to_graphql(&err));
  }

  let base = state.config.load().external_url.trim_end_matches('/').to_owned();
  Ok(format!(
    "{base}/api/workspaces/{workspace_id}/docs/{}/comment-attachments/{key}",
    reservation.storage_doc_id
  ))
}

pub(crate) async fn resolve_workspace_comments(
  ctx: &Context<'_>,
  workspace_id: &str,
  doc_id: &str,
  pagination: Option<PaginationInput>,
) -> Result<PaginatedCommentObjectType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let cursor_val = pagination
    .as_ref()
    .and_then(|p| p.after.as_deref())
    .and_then(decode_json_cursor);
  let after_sid = cursor_val
    .as_ref()
    .and_then(|v| v.get("sid"))
    .and_then(|s| s.as_i64())
    .and_then(|n| i32::try_from(n).ok());
  let take = i64::from(pagination.as_ref().map(|p| p.resolved_first(100)).unwrap_or(100));

  let (total_count, comments) = state
    .comments
    .list_comments(&user.id, workspace_id, doc_id, after_sid, take)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  let mut start_cursor_obj = serde_json::Map::new();
  let mut end_cursor_obj = serde_json::Map::new();
  if let (Some(first_c), Some(last_c)) = (comments.first(), comments.last()) {
    end_cursor_obj.insert("sid".to_owned(), json!(last_c.sid));
    start_cursor_obj.insert("sid".to_owned(), json!(first_c.sid));
    start_cursor_obj.insert("commentUpdatedAt".to_owned(), json!(first_c.updated_at.to_rfc3339()));
    let mut latest_reply_at: Option<DateTime<Utc>> = None;
    for c in &comments {
      for r in &c.replies {
        if latest_reply_at.is_none_or(|cur| r.updated_at > cur) {
          latest_reply_at = Some(r.updated_at);
        }
      }
    }
    let reply_ts = latest_reply_at.unwrap_or(first_c.updated_at);
    start_cursor_obj.insert("replyUpdatedAt".to_owned(), json!(reply_ts.to_rfc3339()));
  }

  let has_next_page = !comments.is_empty();
  let edges: Vec<CommentObjectTypeEdge> = comments
    .into_iter()
    .map(|c| CommentObjectTypeEdge {
      cursor: String::new(),
      node: c.into(),
    })
    .collect();

  Ok(PaginatedCommentObjectType {
    total_count: i32::try_from(total_count).unwrap_or(i32::MAX),
    edges,
    page_info: PageInfo {
      start_cursor: Some(encode_json_cursor(&serde_json::Value::Object(start_cursor_obj))),
      end_cursor: Some(encode_json_cursor(&serde_json::Value::Object(end_cursor_obj))),
      has_next_page,
      has_previous_page: false,
    },
  })
}

pub(crate) async fn resolve_workspace_comment_changes(
  ctx: &Context<'_>,
  workspace_id: &str,
  doc_id: &str,
  pagination: PaginationInput,
) -> Result<PaginatedCommentChangeObjectType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let mut cursor_obj = pagination
    .after
    .as_deref()
    .and_then(decode_json_cursor)
    .and_then(|v| v.as_object().cloned())
    .unwrap_or_default();

  let comment_updated_at = cursor_obj
    .get("commentUpdatedAt")
    .and_then(|v| v.as_str())
    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
    .map(|dt| dt.with_timezone(&Utc));
  let reply_updated_at = cursor_obj
    .get("replyUpdatedAt")
    .and_then(|v| v.as_str())
    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
    .map(|dt| dt.with_timezone(&Utc));

  let changes = state
    .comments
    .list_comment_changes(
      &user.id,
      workspace_id,
      doc_id,
      comment_updated_at,
      reply_updated_at,
      i64::from(pagination.resolved_first(100)),
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  for c in &changes {
    if c.comment_id.is_some() {
      cursor_obj.insert("replyUpdatedAt".to_owned(), json!(c.updated_at.to_rfc3339()));
    } else {
      cursor_obj.insert("commentUpdatedAt".to_owned(), json!(c.updated_at.to_rfc3339()));
    }
  }

  let total = changes.len();
  let has_next_page = !changes.is_empty();
  let edges: Vec<CommentChangeObjectTypeEdge> = changes
    .into_iter()
    .map(|c| CommentChangeObjectTypeEdge {
      cursor: String::new(),
      node: CommentChangeObjectType {
        action: match c.action {
          DomainChangeAction::Update => CommentChangeAction::Update,
          DomainChangeAction::Delete => CommentChangeAction::Delete,
        },
        id: ID(c.id),
        comment_id: c.comment_id.map(ID),
        item: JsonObjectScalar(c.item),
      },
    })
    .collect();

  Ok(PaginatedCommentChangeObjectType {
    total_count: i32::try_from(total).unwrap_or(i32::MAX),
    edges,
    page_info: PageInfo {
      start_cursor: Some(encode_json_cursor(&serde_json::Value::Null)),
      end_cursor: Some(encode_json_cursor(&serde_json::Value::Object(cursor_obj))),
      has_next_page,
      has_previous_page: false,
    },
  })
}

#[derive(Default)]
pub struct CommentMutation;

#[async_graphql::Object]
impl CommentMutation {
  async fn create_comment(&self, ctx: &Context<'_>, input: CommentCreateInput) -> Result<CommentObjectType> {
    mutate_create_comment(ctx, input).await
  }

  async fn update_comment(&self, ctx: &Context<'_>, input: CommentUpdateInput) -> Result<bool> {
    mutate_update_comment(ctx, input).await
  }

  async fn resolve_comment(&self, ctx: &Context<'_>, input: CommentResolveInput) -> Result<bool> {
    mutate_resolve_comment(ctx, input).await
  }

  async fn delete_comment(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
    mutate_delete_comment(ctx, id).await
  }

  async fn create_reply(&self, ctx: &Context<'_>, input: ReplyCreateInput) -> Result<ReplyObjectType> {
    mutate_create_reply(ctx, input).await
  }

  async fn update_reply(&self, ctx: &Context<'_>, input: ReplyUpdateInput) -> Result<bool> {
    mutate_update_reply(ctx, input).await
  }

  async fn delete_reply(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
    mutate_delete_reply(ctx, id).await
  }

  async fn upload_comment_attachment(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    doc_id: String,
    attachment: async_graphql::Upload,
  ) -> Result<String> {
    mutate_upload_comment_attachment(ctx, workspace_id, doc_id, attachment).await
  }
}
