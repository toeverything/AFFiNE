//! User notifications GraphQL types and resolvers.

use std::sync::Arc;

use async_graphql::{ComplexObject, Context, Enum, ID, InputObject, Result, SimpleObject, Union};
use chrono::{DateTime, Utc};
use server_domain::notifications::MentionDocInput as DomainMentionDocInput;

use super::doc::{DocMode, PageInfo, PaginationInput, decode_cursor, encode_cursor};
use super::user::PublicUserType;
use super::{JsonObjectScalar, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "NotificationLevel")]
pub enum NotificationLevel {
  #[graphql(name = "Default")]
  Default,
  #[graphql(name = "High")]
  High,
  #[graphql(name = "Low")]
  Low,
  #[graphql(name = "Min")]
  Min,
  #[graphql(name = "None")]
  None,
}

impl NotificationLevel {
  fn parse(s: &str) -> Self {
    match s {
      "High" => Self::High,
      "Low" => Self::Low,
      "Min" => Self::Min,
      "None" => Self::None,
      _ => Self::Default,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "NotificationType")]
pub enum NotificationType {
  #[graphql(name = "Comment")]
  Comment,
  #[graphql(name = "CommentMention")]
  CommentMention,
  #[graphql(name = "Invitation")]
  Invitation,
  #[graphql(name = "InvitationAccepted")]
  InvitationAccepted,
  #[graphql(name = "InvitationBlocked")]
  InvitationBlocked,
  #[graphql(name = "InvitationRejected")]
  InvitationRejected,
  #[graphql(name = "InvitationReviewApproved")]
  InvitationReviewApproved,
  #[graphql(name = "InvitationReviewDeclined")]
  InvitationReviewDeclined,
  #[graphql(name = "InvitationReviewRequest")]
  InvitationReviewRequest,
  #[graphql(name = "Mention")]
  Mention,
}

impl NotificationType {
  fn parse(s: &str) -> Self {
    match s {
      "Comment" => Self::Comment,
      "CommentMention" => Self::CommentMention,
      "Invitation" => Self::Invitation,
      "InvitationAccepted" => Self::InvitationAccepted,
      "InvitationBlocked" => Self::InvitationBlocked,
      "InvitationRejected" => Self::InvitationRejected,
      "InvitationReviewApproved" => Self::InvitationReviewApproved,
      "InvitationReviewDeclined" => Self::InvitationReviewDeclined,
      "InvitationReviewRequest" => Self::InvitationReviewRequest,
      _ => Self::Mention,
    }
  }
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "NotificationWorkspaceType")]
pub struct NotificationWorkspaceType {
  pub avatar_url: Option<String>,
  pub id: ID,
  pub name: String,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "MentionDocType")]
pub struct MentionDocType {
  pub block_id: Option<String>,
  pub element_id: Option<String>,
  pub id: String,
  pub mode: DocMode,
  pub title: String,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "InvitationAcceptedNotificationBodyType")]
pub struct InvitationAcceptedNotificationBodyType {
  pub created_by_user: Option<PublicUserType>,
  pub invite_id: ID,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub workspace: Option<NotificationWorkspaceType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "InvitationBlockedNotificationBodyType")]
pub struct InvitationBlockedNotificationBodyType {
  pub created_by_user: Option<PublicUserType>,
  pub invite_id: ID,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub workspace: Option<NotificationWorkspaceType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "InvitationNotificationBodyType")]
pub struct InvitationNotificationBodyType {
  pub created_by_user: Option<PublicUserType>,
  pub invite_id: ID,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub workspace: Option<NotificationWorkspaceType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "InvitationReviewApprovedNotificationBodyType")]
pub struct InvitationReviewApprovedNotificationBodyType {
  pub created_by_user: Option<PublicUserType>,
  pub invite_id: ID,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub workspace: Option<NotificationWorkspaceType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "InvitationReviewDeclinedNotificationBodyType")]
pub struct InvitationReviewDeclinedNotificationBodyType {
  pub created_by_user: Option<PublicUserType>,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub workspace: Option<NotificationWorkspaceType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "InvitationReviewRequestNotificationBodyType")]
pub struct InvitationReviewRequestNotificationBodyType {
  pub created_by_user: Option<PublicUserType>,
  pub invite_id: ID,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub workspace: Option<NotificationWorkspaceType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "MentionNotificationBodyType")]
pub struct MentionNotificationBodyType {
  pub created_by_user: Option<PublicUserType>,
  pub doc: MentionDocType,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub workspace: Option<NotificationWorkspaceType>,
}

#[derive(Union, Clone, Debug)]
#[graphql(name = "UnionNotificationBodyType")]
pub enum UnionNotificationBodyType {
  InvitationAccepted(InvitationAcceptedNotificationBodyType),
  InvitationBlocked(InvitationBlockedNotificationBodyType),
  Invitation(InvitationNotificationBodyType),
  InvitationReviewApproved(InvitationReviewApprovedNotificationBodyType),
  InvitationReviewDeclined(InvitationReviewDeclinedNotificationBodyType),
  InvitationReviewRequest(InvitationReviewRequestNotificationBodyType),
  Mention(MentionNotificationBodyType),
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "NotificationObjectType", complex)]
pub struct NotificationObjectType {
  pub id: ID,
  pub level: NotificationLevel,
  #[graphql(name = "type")]
  pub notification_type: NotificationType,
  pub read: bool,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub body: JsonObjectScalar,
}

#[ComplexObject]
impl NotificationObjectType {
  #[graphql(name = "_placeholderForUnionNotificationBodyType")]
  async fn placeholder_for_union_notification_body_type(&self) -> Result<UnionNotificationBodyType> {
    Err(async_graphql::Error::new(
      "placeholder field to export UnionNotificationBodyType; use body instead",
    ))
  }
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "NotificationObjectTypeEdge")]
pub struct NotificationObjectTypeEdge {
  pub cursor: String,
  pub node: NotificationObjectType,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "PaginatedNotificationObjectType")]
pub struct PaginatedNotificationObjectType {
  pub total_count: i32,
  pub edges: Vec<NotificationObjectTypeEdge>,
  pub page_info: PageInfo,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "MentionDocInput")]
pub struct MentionDocInput {
  pub id: String,
  pub title: String,
  pub mode: DocMode,
  pub block_id: Option<String>,
  pub element_id: Option<String>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "MentionInput")]
pub struct MentionInput {
  pub user_id: String,
  pub workspace_id: String,
  pub doc: MentionDocInput,
}

pub(crate) async fn resolve_user_notifications(
  ctx: &Context<'_>,
  pagination: PaginationInput,
) -> Result<PaginatedNotificationObjectType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let look = ctx.look_ahead();
  let includes_list = look.field("edges").exists() || look.field("pageInfo").exists();

  let total = state
    .notifications
    .count_by_user(&user.id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  let offset = pagination.resolved_offset();
  if !includes_list {
    return Ok(PaginatedNotificationObjectType {
      total_count: i32::try_from(total).unwrap_or(i32::MAX),
      edges: Vec::new(),
      page_info: PageInfo {
        start_cursor: None,
        end_cursor: None,
        has_next_page: false,
        has_previous_page: pagination.after.is_some() || offset > 0,
      },
    });
  }

  let first = pagination.resolved_first(20);
  let after = pagination
    .after
    .as_deref()
    .and_then(decode_cursor)
    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
    .map(|dt| dt.with_timezone(&Utc));

  let rows = state
    .notifications
    .list_by_user(&user.id, i64::from(first), i64::from(offset), after)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  let edges: Vec<NotificationObjectTypeEdge> = rows
    .into_iter()
    .map(|n| NotificationObjectTypeEdge {
      cursor: encode_cursor(&n.created_at.to_rfc3339()),
      node: NotificationObjectType {
        id: ID(n.id),
        level: NotificationLevel::parse(&n.level),
        notification_type: NotificationType::parse(&n.notification_type),
        read: n.read,
        created_at: n.created_at,
        updated_at: n.updated_at,
        body: JsonObjectScalar(n.body),
      },
    })
    .collect();

  let has_next_page = edges.len() >= usize::try_from(first).unwrap_or(10);
  let has_previous_page = pagination.after.is_some() || offset > 0;
  let start_cursor = edges.first().map(|e| e.cursor.clone());
  let end_cursor = edges.last().map(|e| e.cursor.clone());

  Ok(PaginatedNotificationObjectType {
    total_count: i32::try_from(total).unwrap_or(i32::MAX),
    edges,
    page_info: PageInfo {
      start_cursor,
      end_cursor,
      has_next_page,
      has_previous_page,
    },
  })
}

pub(crate) async fn mutate_mention_user(ctx: &Context<'_>, input: MentionInput) -> Result<ID> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let id = state
    .notifications
    .mention_user(
      &user.id,
      &input.user_id,
      &input.workspace_id,
      DomainMentionDocInput {
        id: input.doc.id,
        title: input.doc.title,
        mode: input.doc.mode.as_str().to_owned(),
        block_id: input.doc.block_id,
        element_id: input.doc.element_id,
      },
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(ID(id))
}

pub(crate) async fn mutate_read_notification(ctx: &Context<'_>, id: String) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .notifications
    .mark_as_read(&user.id, &id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_read_all_notifications(ctx: &Context<'_>) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .notifications
    .mark_all_as_read(&user.id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

#[derive(Default)]
pub struct NotificationMutation;

#[async_graphql::Object]
impl NotificationMutation {
  async fn mention_user(&self, ctx: &Context<'_>, input: MentionInput) -> Result<async_graphql::ID> {
    mutate_mention_user(ctx, input).await
  }

  async fn read_notification(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
    mutate_read_notification(ctx, id).await
  }

  async fn read_all_notifications(&self, ctx: &Context<'_>) -> Result<bool> {
    mutate_read_all_notifications(ctx).await
  }
}
