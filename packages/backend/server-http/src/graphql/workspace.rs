//! Workspace, member, permission, ownership transfer, and invite link GraphQL resolvers.

use std::sync::Arc;

use async_graphql::{Context, Enum, ID, InputObject, Object, Result, SimpleObject, Upload};
use chrono::{DateTime, Utc};
use server_domain::workspaces::{
  EffectiveWorkspaceRole, UpdateWorkspaceInput as DomainUpdateWorkspaceInput, WorkspaceRecord, WorkspaceRole,
};
use server_types::DomainError;

use super::{
  AuthenticatedUser, AuthorizedWorkspaceUsage, JsonObjectScalar, ListedBlob, UserType, WorkspaceUserType,
  require_authenticated_user,
};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::legacy_compat::quota::{WorkspaceQuotaType, workspace_quota_from_grant};

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "Permission")]
pub enum Permission {
  #[graphql(name = "Admin")]
  Admin,
  #[graphql(name = "Collaborator")]
  Collaborator,
  #[graphql(name = "External")]
  External,
  #[graphql(name = "Owner")]
  Owner,
}

impl From<EffectiveWorkspaceRole> for Permission {
  fn from(r: EffectiveWorkspaceRole) -> Self {
    match r {
      EffectiveWorkspaceRole::Owner => Self::Owner,
      EffectiveWorkspaceRole::Admin => Self::Admin,
      EffectiveWorkspaceRole::Collaborator => Self::Collaborator,
      EffectiveWorkspaceRole::External => Self::External,
    }
  }
}

impl From<WorkspaceRole> for Permission {
  fn from(r: WorkspaceRole) -> Self {
    match r {
      WorkspaceRole::Owner => Self::Owner,
      WorkspaceRole::Admin => Self::Admin,
      WorkspaceRole::Member => Self::Collaborator,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "WorkspaceMemberStatus")]
pub enum WorkspaceMemberStatus {
  #[graphql(name = "Accepted")]
  Accepted,
  #[graphql(name = "AllocatingSeat")]
  AllocatingSeat,
  #[graphql(name = "NeedMoreSeat")]
  NeedMoreSeat,
  #[graphql(name = "NeedMoreSeatAndReview")]
  NeedMoreSeatAndReview,
  #[graphql(name = "Pending")]
  Pending,
  #[graphql(name = "UnderReview")]
  UnderReview,
}

impl WorkspaceMemberStatus {
  fn parse(s: &str) -> Self {
    match s {
      "Accepted" => Self::Accepted,
      "UnderReview" => Self::UnderReview,
      "NeedMoreSeat" => Self::NeedMoreSeat,
      "NeedMoreSeatAndReview" => Self::NeedMoreSeatAndReview,
      "AllocatingSeat" => Self::AllocatingSeat,
      _ => Self::Pending,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "WorkspaceInviteLinkExpireTime")]
pub enum WorkspaceInviteLinkExpireTime {
  #[graphql(name = "OneDay")]
  OneDay,
  #[graphql(name = "ThreeDays")]
  ThreeDays,
  #[graphql(name = "OneWeek")]
  OneWeek,
  #[graphql(name = "OneMonth")]
  OneMonth,
}

impl WorkspaceInviteLinkExpireTime {
  fn as_millis(self) -> i64 {
    const DAY_MS: i64 = 24 * 60 * 60 * 1000;
    match self {
      Self::OneDay => DAY_MS,
      Self::ThreeDays => 3 * DAY_MS,
      Self::OneWeek => 7 * DAY_MS,
      Self::OneMonth => 30 * DAY_MS,
    }
  }
}

#[derive(SimpleObject, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "DocPermissions")]
pub struct DocPermissions {
  #[graphql(name = "Doc_Analytics_Read")]
  pub doc_analytics_read: bool,
  #[graphql(name = "Doc_Analytics_Viewers_Read")]
  pub doc_analytics_viewers_read: bool,
  #[graphql(name = "Doc_Comments_Create")]
  pub doc_comments_create: bool,
  #[graphql(name = "Doc_Comments_Moderate")]
  pub doc_comments_moderate: bool,
  #[graphql(name = "Doc_Comments_Read")]
  pub doc_comments_read: bool,
  #[graphql(name = "Doc_Copy")]
  pub doc_copy: bool,
  #[graphql(name = "Doc_Delete")]
  pub doc_delete: bool,
  #[graphql(name = "Doc_Duplicate")]
  pub doc_duplicate: bool,
  #[graphql(name = "Doc_History_Read")]
  pub doc_history_read: bool,
  #[graphql(name = "Doc_Preview")]
  pub doc_preview: bool,
  #[graphql(name = "Doc_Properties_Read")]
  pub doc_properties_read: bool,
  #[graphql(name = "Doc_Properties_Update")]
  pub doc_properties_update: bool,
  #[graphql(name = "Doc_Publish")]
  pub doc_publish: bool,
  #[graphql(name = "Doc_Read")]
  pub doc_read: bool,
  #[graphql(name = "Doc_Restore")]
  pub doc_restore: bool,
  #[graphql(name = "Doc_TransferOwner")]
  pub doc_transfer_owner: bool,
  #[graphql(name = "Doc_Trash")]
  pub doc_trash: bool,
  #[graphql(name = "Doc_Unpublish")]
  pub doc_unpublish: bool,
  #[graphql(name = "Doc_Update")]
  pub doc_update: bool,
  #[graphql(name = "Doc_Users_Manage")]
  pub doc_users_manage: bool,
  #[graphql(name = "Doc_Users_Read")]
  pub doc_users_read: bool,
}

#[derive(SimpleObject, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "WorkspacePermissions")]
pub struct WorkspacePermissions {
  #[graphql(name = "Workspace_Administrators_Manage")]
  pub workspace_administrators_manage: bool,
  #[graphql(name = "Workspace_Blobs_Manage")]
  pub workspace_blobs_manage: bool,
  #[graphql(name = "Workspace_Blobs_Upload")]
  pub workspace_blobs_upload: bool,
  #[graphql(name = "Workspace_Copilot")]
  pub workspace_copilot: bool,
  #[graphql(name = "Workspace_CreateDoc")]
  pub workspace_create_doc: bool,
  #[graphql(name = "Workspace_Delete")]
  pub workspace_delete: bool,
  #[graphql(name = "Workspace_Organize_Read")]
  pub workspace_organize_read: bool,
  #[graphql(name = "Workspace_Payment_Manage")]
  pub workspace_payment_manage: bool,
  #[graphql(name = "Workspace_Preview")]
  pub workspace_preview: bool,
  #[graphql(name = "Workspace_Properties_Create")]
  pub workspace_properties_create: bool,
  #[graphql(name = "Workspace_Properties_Delete")]
  pub workspace_properties_delete: bool,
  #[graphql(name = "Workspace_Properties_Read")]
  pub workspace_properties_read: bool,
  #[graphql(name = "Workspace_Properties_Update")]
  pub workspace_properties_update: bool,
  #[graphql(name = "Workspace_Read")]
  pub workspace_read: bool,
  #[graphql(name = "Workspace_Settings_Read")]
  pub workspace_settings_read: bool,
  #[graphql(name = "Workspace_Settings_Update")]
  pub workspace_settings_update: bool,
  #[graphql(name = "Workspace_Sync")]
  pub workspace_sync: bool,
  #[graphql(name = "Workspace_TransferOwner")]
  pub workspace_transfer_owner: bool,
  #[graphql(name = "Workspace_Users_Manage")]
  pub workspace_users_manage: bool,
  #[graphql(name = "Workspace_Users_Read")]
  pub workspace_users_read: bool,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "InviteUserType")]
pub struct InviteUserType {
  pub id: ID,
  pub name: Option<String>,
  pub email: Option<String>,
  pub avatar_url: Option<String>,
  pub email_verified: Option<bool>,
  pub disabled: Option<bool>,
  pub permission: Permission,
  pub role: Permission,
  pub invite_id: String,
  pub status: WorkspaceMemberStatus,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "InviteResult")]
pub struct InviteResult {
  pub email: String,
  pub invite_id: Option<String>,
  pub error: Option<JsonObjectScalar>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "InviteLink")]
pub struct InviteLink {
  pub link: String,
  pub expire_time: DateTime<Utc>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "InvitationWorkspaceType")]
pub struct InvitationWorkspaceType {
  pub id: ID,
  pub name: String,
  pub avatar: String,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "InvitationType")]
pub struct InvitationType {
  pub workspace: InvitationWorkspaceType,
  pub user: WorkspaceUserType,
  pub invitee: WorkspaceUserType,
  pub status: Option<WorkspaceMemberStatus>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateWorkspaceInput")]
pub struct UpdateWorkspaceInput {
  pub id: ID,
  pub public: Option<bool>,
  pub enable_ai: Option<bool>,
  pub enable_sharing: Option<bool>,
  pub enable_url_preview: Option<bool>,
  pub enable_doc_embedding: Option<bool>,
}

pub struct WorkspaceType {
  pub(crate) record: WorkspaceRecord,
  pub(crate) used_storage_quota: i64,
  pub(crate) member_count: i32,
}

#[Object(name = "WorkspaceType")]
impl WorkspaceType {
  async fn id(&self) -> ID {
    ID(self.record.id.clone())
  }

  async fn public(&self) -> bool {
    self.record.public
  }

  async fn enable_ai(&self) -> bool {
    self.record.enable_ai
  }

  async fn enable_doc_embedding(&self) -> bool {
    self.record.enable_doc_embedding
  }

  async fn enable_sharing(&self) -> bool {
    self.record.enable_sharing
  }

  async fn enable_url_preview(&self) -> bool {
    self.record.enable_url_preview
  }

  async fn created_at(&self) -> DateTime<Utc> {
    self.record.created_at
  }

  async fn initialized(&self, ctx: &Context<'_>) -> Result<bool> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .workspaces
      .is_workspace_initialized(&self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn team(&self, ctx: &Context<'_>) -> Result<bool> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .workspaces
      .is_team_workspace(&self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn owner(&self, ctx: &Context<'_>) -> Result<UserType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let view = state
      .workspaces
      .get_workspace_owner(&self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(UserType { view })
  }

  async fn member_count(&self) -> i32 {
    self.member_count
  }

  async fn role(&self, ctx: &Context<'_>) -> Result<Permission> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let perms = state
      .workspaces
      .resolve_workspace_permissions(&user.id, &self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(perms.role.into())
  }

  async fn permissions(&self, ctx: &Context<'_>) -> Result<WorkspacePermissions> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let p = state
      .workspaces
      .resolve_workspace_permissions(&user.id, &self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(WorkspacePermissions {
      workspace_administrators_manage: p.administrators_manage,
      workspace_blobs_manage: p.blobs_manage,
      workspace_blobs_upload: p.blobs_upload,
      workspace_copilot: p.copilot,
      workspace_create_doc: p.create_doc,
      workspace_delete: p.delete,
      workspace_organize_read: p.organize_read,
      workspace_payment_manage: p.payment_manage,
      workspace_preview: p.preview,
      workspace_properties_create: p.properties_create,
      workspace_properties_delete: p.properties_delete,
      workspace_properties_read: p.properties_read,
      workspace_properties_update: p.properties_update,
      workspace_read: p.read,
      workspace_settings_read: p.settings_read,
      workspace_settings_update: p.settings_update,
      workspace_sync: p.sync,
      workspace_transfer_owner: p.transfer_owner,
      workspace_users_manage: p.users_manage,
      workspace_users_read: p.users_read,
    })
  }

  async fn members(
    &self,
    ctx: &Context<'_>,
    skip: Option<i32>,
    take: Option<i32>,
    query: Option<String>,
  ) -> Result<Vec<InviteUserType>> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let list = state
      .workspaces
      .list_workspace_members(
        &user.id,
        &self.record.id,
        i64::from(skip.unwrap_or(0)),
        i64::from(take.unwrap_or(8)),
        query.as_deref(),
      )
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(
      list
        .into_iter()
        .map(|m| {
          let perm: Permission = m.role.into();
          InviteUserType {
            id: ID(m.id),
            name: Some(m.name),
            email: Some(m.email),
            avatar_url: m.avatar_url,
            email_verified: Some(m.email_verified),
            disabled: Some(m.disabled),
            permission: perm,
            role: perm,
            invite_id: m.invite_id,
            status: WorkspaceMemberStatus::parse(&m.status),
          }
        })
        .collect(),
    )
  }

  async fn invite_link(&self, ctx: &Context<'_>) -> Result<Option<InviteLink>> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let link = state
      .workspaces
      .get_invite_link(&user.id, &self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let base = state.config.load().external_url.trim_end_matches('/').to_owned();
    Ok(link.map(|l| InviteLink {
      link: format!("{base}/invite/{}", l.invite_id),
      expire_time: l.expire_time,
    }))
  }

  async fn quota(&self, ctx: &Context<'_>) -> Result<WorkspaceQuotaType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let mut tx = state
      .db
      .begin_tiered(server_db::WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Unavailable(e.to_string())))?;
    let grant = state
      .extension
      .quota_gate()
      .resolve_workspace_grant(tx.tx_mut(), &self.record.id, Utc::now())
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let _ = tx.rollback().await;
    Ok(workspace_quota_from_grant(
      &grant,
      self.used_storage_quota,
      self.member_count,
    ))
  }

  async fn blobs(
    &self,
    ctx: &Context<'_>,
    after: Option<String>,
    #[graphql(default = 1000)] first: i32,
  ) -> Result<Vec<ListedBlob>> {
    let user = require_authenticated_user(ctx).await?;
    if !(1..=1000).contains(&first) {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "Blob page size must be between 1 and 1000".into(),
      )));
    }
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let all = state
      .blobs
      .list_blobs_authorized(&user.id, &self.record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let limit = usize::try_from(first).unwrap_or(0);
    Ok(
      all
        .into_iter()
        .filter(|b| after.as_deref().is_none_or(|cursor| b.key.as_str() > cursor))
        .take(limit)
        .map(|b| ListedBlob {
          key: b.key,
          size: i32::try_from(b.size).unwrap_or(i32::MAX),
          mime: b.mime,
          created_at: b.created_at.to_rfc3339(),
        })
        .collect(),
    )
  }

  async fn doc(&self, ctx: &Context<'_>, doc_id: String) -> Result<super::doc::DocType> {
    super::doc::resolve_workspace_doc(ctx, &self.record.id, &doc_id).await
  }

  async fn public_docs(&self, ctx: &Context<'_>) -> Result<Vec<super::doc::DocType>> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let actor = ctx.data_opt::<AuthenticatedUser>().map(|a| a.user_id.as_str());
    let docs = state
      .doc_sharing
      .list_public_docs(&self.record.id, actor)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(docs.into_iter().map(super::doc::DocType::from_info).collect())
  }

  async fn docs(
    &self,
    ctx: &Context<'_>,
    pagination: super::doc::PaginationInput,
  ) -> Result<super::doc::PaginatedDocType> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let first = pagination.resolved_first(20);
    let offset = pagination.resolved_offset();
    let after_doc = pagination.after.as_deref().and_then(super::doc::decode_cursor);
    let (total, docs, has_next_page) = state
      .doc_sharing
      .list_docs(
        &self.record.id,
        &user.id,
        i64::from(first),
        i64::from(offset),
        after_doc.as_deref(),
        true,
      )
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let edges: Vec<super::doc::DocTypeEdge> = docs
      .into_iter()
      .map(|info| {
        let cursor = super::doc::encode_cursor(&info.doc_id);
        super::doc::DocTypeEdge {
          cursor,
          node: super::doc::DocType::from_info(info),
        }
      })
      .collect();
    let has_previous_page = pagination.after.is_some() || offset > 0;
    let start_cursor = edges.first().map(|e| e.cursor.clone());
    let end_cursor = edges.last().map(|e| e.cursor.clone());
    Ok(super::doc::PaginatedDocType {
      total_count: i32::try_from(total).unwrap_or(i32::MAX),
      edges,
      page_info: super::doc::PageInfo {
        start_cursor,
        end_cursor,
        has_next_page,
        has_previous_page,
      },
    })
  }

  async fn recently_updated_docs(
    &self,
    ctx: &Context<'_>,
    pagination: super::doc::PaginationInput,
  ) -> Result<super::doc::PaginatedDocType> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let first = pagination.resolved_first(20);
    let offset = pagination.resolved_offset();
    let after_doc = pagination.after.as_deref().and_then(super::doc::decode_cursor);
    let (total, docs, has_next_page) = state
      .doc_sharing
      .list_docs(
        &self.record.id,
        &user.id,
        i64::from(first),
        i64::from(offset),
        after_doc.as_deref(),
        false,
      )
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let edges: Vec<super::doc::DocTypeEdge> = docs
      .into_iter()
      .map(|info| {
        let cursor = super::doc::encode_cursor(&info.doc_id);
        super::doc::DocTypeEdge {
          cursor,
          node: super::doc::DocType::from_info(info),
        }
      })
      .collect();
    let has_previous_page = pagination.after.is_some() || offset > 0;
    let start_cursor = edges.first().map(|e| e.cursor.clone());
    let end_cursor = edges.last().map(|e| e.cursor.clone());
    Ok(super::doc::PaginatedDocType {
      total_count: i32::try_from(total).unwrap_or(i32::MAX),
      edges,
      page_info: super::doc::PageInfo {
        start_cursor,
        end_cursor,
        has_next_page,
        has_previous_page,
      },
    })
  }

  async fn page_meta(&self, ctx: &Context<'_>, page_id: String) -> Result<super::doc::WorkspaceDocMeta> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let meta = state
      .doc_sharing
      .get_doc_meta(&self.record.id, &user.id, &page_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(super::doc::WorkspaceDocMeta {
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      created_by: meta.created_by.map(|u| super::doc::EditorType {
        name: u.name,
        avatar_url: u.avatar_url,
      }),
      updated_by: meta.updated_by.map(|u| super::doc::EditorType {
        name: u.name,
        avatar_url: u.avatar_url,
      }),
    })
  }

  async fn histories(
    &self,
    ctx: &Context<'_>,
    guid: String,
    before: Option<DateTime<Utc>>,
    take: Option<i32>,
  ) -> Result<Vec<super::doc::DocHistoryType>> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let rows = state
      .histories
      .list_histories(&user.id, &self.record.id, &guid, before.unwrap_or_else(Utc::now), take)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(
      rows
        .into_iter()
        .map(|h| super::doc::DocHistoryType {
          workspace_id: h.workspace_id,
          id: h.id,
          timestamp: h.timestamp,
          editor: h.editor_name.map(|name| super::doc::EditorType {
            name,
            avatar_url: h.editor_avatar_url,
          }),
        })
        .collect(),
    )
  }

  async fn comments(
    &self,
    ctx: &Context<'_>,
    doc_id: String,
    pagination: Option<super::doc::PaginationInput>,
  ) -> Result<super::comment::PaginatedCommentObjectType> {
    super::comment::resolve_workspace_comments(ctx, &self.record.id, &doc_id, pagination).await
  }

  async fn comment_changes(
    &self,
    ctx: &Context<'_>,
    doc_id: String,
    pagination: super::doc::PaginationInput,
  ) -> Result<super::comment::PaginatedCommentChangeObjectType> {
    super::comment::resolve_workspace_comment_changes(ctx, &self.record.id, &doc_id, pagination).await
  }

  async fn license(&self, ctx: &Context<'_>) -> Result<Option<super::license::License>> {
    super::license::resolve_workspace_license(ctx, &self.record.id).await
  }
}

pub(crate) async fn resolve_workspaces(ctx: &Context<'_>) -> Result<Vec<WorkspaceType>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let records = state
    .workspaces
    .list_user_workspaces(&user.id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let mut out = Vec::with_capacity(records.len());
  for record in records {
    let usage = state
      .workspaces
      .load_workspace_usage(&record.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    out.push(WorkspaceType {
      record,
      used_storage_quota: usage.used_storage_quota,
      member_count: usage.member_count,
    });
  }
  Ok(out)
}

pub(crate) async fn resolve_workspace(ctx: &Context<'_>, id: String) -> Result<WorkspaceType> {
  let Some(auth) = ctx.data_opt::<AuthenticatedUser>() else {
    return Err(domain_error_to_graphql(&DomainError::Unauthorized(
      "Authentication required".into(),
    )));
  };

  if let Some(usage) = ctx.data_opt::<AuthorizedWorkspaceUsage>() {
    if usage.workspace_id != id {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Workspace access denied".into(),
      )));
    }
    return Ok(WorkspaceType {
      record: WorkspaceRecord {
        id,
        sid: 0,
        name: None,
        avatar_key: None,
        public: false,
        enable_ai: true,
        enable_doc_embedding: true,
        enable_sharing: true,
        enable_url_preview: false,
        indexed: false,
        created_at: Utc::now(),
        last_check_embeddings: DateTime::<Utc>::UNIX_EPOCH,
      },
      used_storage_quota: usage.used_storage_quota,
      member_count: usage.member_count,
    });
  }

  if auth.user.is_none() {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "Workspace access denied".into(),
    )));
  }

  let state = ctx.data_unchecked::<Arc<AppState>>();
  let record = state
    .workspaces
    .get_workspace_for_user(&id, Some(&auth.user_id))
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let usage = state
    .workspaces
    .load_workspace_usage(&id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(WorkspaceType {
    record,
    used_storage_quota: usage.used_storage_quota,
    member_count: usage.member_count,
  })
}

pub(crate) async fn resolve_get_invite_info(ctx: &Context<'_>, invite_id: String) -> Result<InvitationType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let info = state
    .workspaces
    .get_invite_info(&user.id, &invite_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(InvitationType {
    workspace: InvitationWorkspaceType {
      id: ID(info.workspace_id),
      name: info.workspace_name,
      avatar: String::new(),
    },
    user: WorkspaceUserType {
      id: info.owner.id,
      name: info.owner.name,
      email: info.owner.email,
      avatar_url: info.owner.avatar_url,
    },
    invitee: WorkspaceUserType {
      id: info.invitee.id,
      name: info.invitee.name,
      email: info.invitee.email,
      avatar_url: info.invitee.avatar_url,
    },
    status: info.status.as_deref().map(WorkspaceMemberStatus::parse),
  })
}

pub(crate) async fn mutate_create_workspace(ctx: &Context<'_>, init: Option<Upload>) -> Result<WorkspaceType> {
  use std::io::Read as _;

  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let init_bytes = if let Some(upload) = init {
    let mut val = upload
      .value(ctx)
      .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid workspace init upload: {e}"))))?;
    let mut bytes = Vec::new();
    val
      .content
      .by_ref()
      .take((server_blob::refs::MAX_SOURCE_BINARY_BYTES + 1) as u64)
      .read_to_end(&mut bytes)
      .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read workspace init: {e}"))))?;
    if !bytes.is_empty() { Some(bytes) } else { None }
  } else {
    None
  };
  let record = state
    .workspaces
    .create_workspace_with_init(&user.id, None, init_bytes.as_deref())
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(WorkspaceType {
    record,
    used_storage_quota: 0,
    member_count: 1,
  })
}

pub(crate) async fn mutate_update_workspace(ctx: &Context<'_>, input: UpdateWorkspaceInput) -> Result<WorkspaceType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let ws_id = input.id.to_string();
  let record = state
    .workspaces
    .update_workspace(
      &user.id,
      &ws_id,
      DomainUpdateWorkspaceInput {
        name: None,
        avatar_key: None,
        public: input.public,
        enable_ai: input.enable_ai,
        enable_doc_embedding: input.enable_doc_embedding,
        enable_sharing: input.enable_sharing,
        enable_url_preview: input.enable_url_preview,
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
        "topic": "workspace.config.changed",
        "room": format!("workspace:{ws_id}:config"),
        "input": { "workspaceId": ws_id },
        "event": { "changed": true, "reason": "workspace-updated" },
      }),
      Some(req_id.as_str()),
    )
    .await;
  let _ = state
    .event_bus
    .publish_event(
      "sync.permissions.changed",
      serde_json::json!({
        "spaceType": "workspace",
        "spaceId": ws_id,
      }),
      Some(req_id.as_str()),
    )
    .await;
  if input.public.is_some() || input.enable_sharing.is_some() {
    let _ = state
      .event_bus
      .publish_event(
        "realtime.topic.changed",
        serde_json::json!({
          "topic": "workspace.access.changed",
          "room": format!("workspace:{ws_id}:access"),
          "input": { "workspaceId": ws_id },
          "event": { "changed": true, "reason": "workspace-updated" },
        }),
        Some(req_id.as_str()),
      )
      .await;
  }
  let usage = state
    .workspaces
    .load_workspace_usage(&ws_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(WorkspaceType {
    record,
    used_storage_quota: usage.used_storage_quota,
    member_count: usage.member_count,
  })
}

pub(crate) async fn mutate_delete_workspace(ctx: &Context<'_>, id: String) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .delete_workspace(&user.id, &id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_leave_workspace(
  ctx: &Context<'_>,
  workspace_id: String,
  _send_leave_mail: Option<bool>,
  _workspace_name: Option<String>,
) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .leave_workspace(&user.id, &workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_grant_member(
  ctx: &Context<'_>,
  workspace_id: String,
  user_id: String,
  permission: Permission,
) -> Result<bool> {
  let actor = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  match permission {
    Permission::External => {
      state
        .workspaces
        .revoke_member(&actor.id, &workspace_id, &user_id)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
    }
    Permission::Owner => {
      state
        .workspaces
        .transfer_workspace_ownership(&actor.id, &workspace_id, &user_id)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
    }
    Permission::Admin => {
      state
        .workspaces
        .update_member_role(&actor.id, &workspace_id, &user_id, WorkspaceRole::Admin)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
    }
    Permission::Collaborator => {
      state
        .workspaces
        .update_member_role(&actor.id, &workspace_id, &user_id, WorkspaceRole::Member)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;
    }
  }
  let req_id = super::graphql_request_id(state);
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "topic": "workspace.access.changed",
        "room": format!("workspace:{workspace_id}:access"),
        "input": { "workspaceId": workspace_id },
        "event": { "changed": true, "reason": "member-updated" },
      }),
      Some(req_id.as_str()),
    )
    .await;
  Ok(true)
}

pub(crate) async fn mutate_approve_member(ctx: &Context<'_>, workspace_id: String, user_id: String) -> Result<bool> {
  let actor = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .approve_member(&actor.id, &workspace_id, &user_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_invite_members(
  ctx: &Context<'_>,
  workspace_id: String,
  emails: Vec<String>,
) -> Result<Vec<InviteResult>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let resolved_source = if let Some(headers) = ctx.data_opt::<axum::http::HeaderMap>() {
    let app_cfg = state
      .app_config
      .get_effective_app_config()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let trusted_cf = app_cfg
      .pointer("/auth/trustedCloudflareHeaders")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    Some(crate::rest::extract_request_source(headers, trusted_cf))
  } else {
    ctx.data_opt::<server_spi::RequestSource>().cloned()
  };
  let batch = state
    .workspaces
    .invite_members_with_source(
      &user.id,
      &workspace_id,
      &emails,
      WorkspaceRole::Member,
      resolved_source.as_ref(),
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(
    batch
      .into_iter()
      .map(|(email, outcome)| match outcome {
        Ok(inv) => InviteResult {
          email,
          invite_id: Some(inv.id),
          error: None,
        },
        Err(err) => {
          let env = crate::legacy_compat::errors::domain_error_to_envelope(&err);
          InviteResult {
            email,
            invite_id: None,
            error: Some(JsonObjectScalar(serde_json::to_value(env).unwrap_or_default())),
          }
        }
      })
      .collect(),
  )
}

pub(crate) async fn mutate_revoke_member(ctx: &Context<'_>, workspace_id: String, user_id: String) -> Result<bool> {
  let actor = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .revoke_member(&actor.id, &workspace_id, &user_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_accept_invite_by_id(
  ctx: &Context<'_>,
  invite_id: String,
  _send_accept_mail: Option<bool>,
  _workspace_id: Option<String>,
) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .accept_invitation(&user.id, &invite_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_create_invite_link(
  ctx: &Context<'_>,
  workspace_id: String,
  expire_time: WorkspaceInviteLinkExpireTime,
) -> Result<InviteLink> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let source = if let Some(headers) = ctx.data_opt::<axum::http::HeaderMap>() {
    let app_cfg = state
      .app_config
      .get_effective_app_config()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let trusted_cf = app_cfg
      .pointer("/auth/trustedCloudflareHeaders")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    Some(crate::rest::extract_request_source(headers, trusted_cf))
  } else {
    ctx.data_opt::<server_spi::RequestSource>().cloned()
  };
  let created = state
    .workspaces
    .create_invite_link(&user.id, &workspace_id, expire_time.as_millis(), source.as_ref())
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let req_id = super::graphql_request_id(state);
  let _ = state
    .event_bus
    .publish_event(
      "realtime.topic.changed",
      serde_json::json!({
        "topic": "workspace.invite-link.changed",
        "room": format!("workspace:{workspace_id}:invite-link"),
        "input": { "workspaceId": workspace_id },
        "event": { "changed": true, "reason": "invite-link-created" },
      }),
      Some(req_id.as_str()),
    )
    .await;
  let base = state.config.load().external_url.trim_end_matches('/').to_owned();
  Ok(InviteLink {
    link: format!("{base}/invite/{}", created.invite_id),
    expire_time: created.expire_time,
  })
}

pub(crate) async fn mutate_revoke_invite_link(ctx: &Context<'_>, workspace_id: String) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .workspaces
    .revoke_invite_link(&user.id, &workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))
}
