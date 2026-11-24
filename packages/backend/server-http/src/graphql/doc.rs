//! Document sharing, per-document role grants, history, and metadata GraphQL types and resolvers.

use std::sync::Arc;

use async_graphql::{Context, Enum, InputObject, Object, Result, SimpleObject};
use base64::Engine as _;
use chrono::{DateTime, Utc};
use server_domain::acl::DocRole as DomainDocRole;
use server_domain::doc_sharing::DocInfoView;
use server_types::DomainError;

use super::{
  DocPermissions, PublicUserType, WorkspaceUserType, current_authenticated_user, require_authenticated_user,
};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "PublicDocMode")]
pub enum PublicDocMode {
  #[graphql(name = "Page")]
  Page,
  #[graphql(name = "Edgeless")]
  Edgeless,
}

impl PublicDocMode {
  pub const fn to_i16(self) -> i16 {
    match self {
      Self::Page => 0,
      Self::Edgeless => 1,
    }
  }

  pub const fn from_i16(mode: i16) -> Self {
    if mode == 1 { Self::Edgeless } else { Self::Page }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "DocMode")]
pub enum DocMode {
  #[graphql(name = "page")]
  Page,
  #[graphql(name = "edgeless")]
  Edgeless,
}

impl DocMode {
  pub const fn as_str(self) -> &'static str {
    match self {
      Self::Page => "page",
      Self::Edgeless => "edgeless",
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "DocRole")]
pub enum DocRole {
  #[graphql(name = "None")]
  None,
  #[graphql(name = "External")]
  External,
  #[graphql(name = "Reader")]
  Reader,
  #[graphql(name = "Commenter")]
  Commenter,
  #[graphql(name = "Editor")]
  Editor,
  #[graphql(name = "Manager")]
  Manager,
  #[graphql(name = "Owner")]
  Owner,
}

impl From<DomainDocRole> for DocRole {
  fn from(r: DomainDocRole) -> Self {
    match r {
      DomainDocRole::None => Self::None,
      DomainDocRole::External => Self::External,
      DomainDocRole::Reader => Self::Reader,
      DomainDocRole::Commenter => Self::Commenter,
      DomainDocRole::Editor => Self::Editor,
      DomainDocRole::Manager => Self::Manager,
      DomainDocRole::Owner => Self::Owner,
    }
  }
}

impl From<DocRole> for DomainDocRole {
  fn from(r: DocRole) -> Self {
    match r {
      DocRole::None => Self::None,
      DocRole::External => Self::External,
      DocRole::Reader => Self::Reader,
      DocRole::Commenter => Self::Commenter,
      DocRole::Editor => Self::Editor,
      DocRole::Manager => Self::Manager,
      DocRole::Owner => Self::Owner,
    }
  }
}

#[derive(InputObject, Clone, Debug, Default)]
#[graphql(name = "PaginationInput")]
pub struct PaginationInput {
  pub first: Option<i32>,
  pub offset: Option<i32>,
  pub after: Option<String>,
}

impl PaginationInput {
  pub fn resolved_first(&self, default: i32) -> i32 {
    self.first.unwrap_or(default).clamp(1, 100)
  }

  pub fn resolved_offset(&self) -> i32 {
    self.offset.unwrap_or(0).max(0)
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PageInfo")]
pub struct PageInfo {
  pub start_cursor: Option<String>,
  pub end_cursor: Option<String>,
  pub has_next_page: bool,
  pub has_previous_page: bool,
}

pub(crate) fn encode_cursor(raw: &str) -> String {
  base64::engine::general_purpose::STANDARD.encode(raw.as_bytes())
}

pub(crate) fn decode_cursor(encoded: &str) -> Option<String> {
  let bytes = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
  String::from_utf8(bytes).ok()
}

pub(crate) fn encode_json_cursor(val: &serde_json::Value) -> String {
  let s = serde_json::to_string(val).unwrap_or_else(|_| "null".to_owned());
  encode_cursor(&s)
}

pub(crate) fn decode_json_cursor(encoded: &str) -> Option<serde_json::Value> {
  let raw = decode_cursor(encoded)?;
  serde_json::from_str(&raw).ok()
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "EditorType")]
pub struct EditorType {
  pub name: String,
  pub avatar_url: Option<String>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "WorkspaceDocMeta")]
pub struct WorkspaceDocMeta {
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub created_by: Option<EditorType>,
  pub updated_by: Option<EditorType>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "DocHistoryType")]
pub struct DocHistoryType {
  pub workspace_id: String,
  pub id: String,
  pub timestamp: DateTime<Utc>,
  pub editor: Option<EditorType>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "GrantedDocUserType")]
pub struct GrantedDocUserType {
  pub role: DocRole,
  pub user: WorkspaceUserType,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "GrantedDocUserTypeEdge")]
pub struct GrantedDocUserTypeEdge {
  pub cursor: String,
  pub node: GrantedDocUserType,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PaginatedGrantedDocUserType")]
pub struct PaginatedGrantedDocUserType {
  pub total_count: i32,
  pub edges: Vec<GrantedDocUserTypeEdge>,
  pub page_info: PageInfo,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "DocTypeEdge")]
pub struct DocTypeEdge {
  pub cursor: String,
  pub node: DocType,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "PaginatedDocType")]
pub struct PaginatedDocType {
  pub total_count: i32,
  pub edges: Vec<DocTypeEdge>,
  pub page_info: PageInfo,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "GrantDocUserRolesInput")]
pub struct GrantDocUserRolesInput {
  pub doc_id: String,
  pub workspace_id: String,
  pub role: DocRole,
  pub user_ids: Vec<String>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateDocUserRoleInput")]
pub struct UpdateDocUserRoleInput {
  pub doc_id: String,
  pub workspace_id: String,
  pub user_id: String,
  pub role: DocRole,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "RevokeDocUserRoleInput")]
pub struct RevokeDocUserRoleInput {
  pub doc_id: String,
  pub workspace_id: String,
  pub user_id: String,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateDocDefaultRoleInput")]
pub struct UpdateDocDefaultRoleInput {
  pub doc_id: String,
  pub workspace_id: String,
  pub role: DocRole,
}

#[derive(Clone, Debug)]
pub struct DocType {
  pub info: DocInfoView,
}

impl DocType {
  pub fn from_info(info: DocInfoView) -> Self {
    Self { info }
  }
}

pub(crate) fn doc_permissions_from_view(p: server_domain::acl::DocPermissionsView) -> DocPermissions {
  DocPermissions {
    doc_analytics_read: p.doc_analytics_read,
    doc_analytics_viewers_read: p.doc_analytics_viewers_read,
    doc_comments_create: p.doc_comments_create,
    doc_comments_moderate: p.doc_comments_moderate,
    doc_comments_read: p.doc_comments_read,
    doc_copy: p.doc_copy,
    doc_delete: p.doc_delete,
    doc_duplicate: p.doc_duplicate,
    doc_history_read: p.doc_history_read,
    doc_preview: p.doc_preview,
    doc_properties_read: p.doc_properties_read,
    doc_properties_update: p.doc_properties_update,
    doc_publish: p.doc_publish,
    doc_read: p.doc_read,
    doc_restore: p.doc_restore,
    doc_transfer_owner: p.doc_transfer_owner,
    doc_trash: p.doc_trash,
    doc_unpublish: p.doc_unpublish,
    doc_update: p.doc_update,
    doc_users_manage: p.doc_users_manage,
    doc_users_read: p.doc_users_read,
  }
}

#[Object(name = "DocType")]
impl DocType {
  async fn id(&self) -> &str {
    &self.info.doc_id
  }

  async fn workspace_id(&self) -> &str {
    &self.info.workspace_id
  }

  async fn public(&self) -> bool {
    self.info.public
  }

  async fn mode(&self) -> PublicDocMode {
    PublicDocMode::from_i16(self.info.mode)
  }

  async fn default_role(&self) -> DocRole {
    self.info.default_role.into()
  }

  async fn created_at(&self) -> Option<DateTime<Utc>> {
    self.info.created_at
  }

  async fn updated_at(&self) -> Option<DateTime<Utc>> {
    self.info.updated_at
  }

  async fn creator_id(&self) -> Option<&str> {
    self.info.creator_id.as_deref()
  }

  async fn last_updater_id(&self) -> Option<&str> {
    self.info.last_updater_id.as_deref()
  }

  async fn title(&self) -> Option<&str> {
    self.info.title.as_deref()
  }

  async fn summary(&self) -> Option<&str> {
    self.info.summary.as_deref()
  }

  async fn permissions(&self) -> DocPermissions {
    doc_permissions_from_view(self.info.permissions)
  }

  async fn created_by(&self, ctx: &Context<'_>) -> Result<Option<PublicUserType>> {
    let Some(uid) = self.info.creator_id.as_deref() else {
      return Ok(None);
    };
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let u = state
      .users
      .get_public_user(uid)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(u.map(|v| PublicUserType {
      id: v.id,
      name: v.name,
      avatar_url: v.avatar_url,
    }))
  }

  async fn last_updated_by(&self, ctx: &Context<'_>) -> Result<Option<PublicUserType>> {
    let Some(uid) = self.info.last_updater_id.as_deref() else {
      return Ok(None);
    };
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let u = state
      .users
      .get_public_user(uid)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(u.map(|v| PublicUserType {
      id: v.id,
      name: v.name,
      avatar_url: v.avatar_url,
    }))
  }

  async fn meta(&self, ctx: &Context<'_>) -> Result<WorkspaceDocMeta> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let meta = state
      .doc_sharing
      .get_doc_meta(&self.info.workspace_id, &user.id, &self.info.doc_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(WorkspaceDocMeta {
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      created_by: meta.created_by.map(|u| EditorType {
        name: u.name,
        avatar_url: u.avatar_url,
      }),
      updated_by: meta.updated_by.map(|u| EditorType {
        name: u.name,
        avatar_url: u.avatar_url,
      }),
    })
  }

  async fn granted_users_list(
    &self,
    ctx: &Context<'_>,
    pagination: PaginationInput,
  ) -> Result<PaginatedGrantedDocUserType> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let first = pagination.resolved_first(20);
    let offset = pagination.resolved_offset();
    let decoded_after = pagination.after.as_deref().and_then(decode_cursor);
    let (total, items, has_next_page) = state
      .doc_sharing
      .paginate_granted_users(
        &self.info.workspace_id,
        &self.info.doc_id,
        &user.id,
        i64::from(first),
        i64::from(offset),
        decoded_after.as_deref(),
      )
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let edges: Vec<GrantedDocUserTypeEdge> = items
      .into_iter()
      .map(|item| GrantedDocUserTypeEdge {
        cursor: encode_cursor(&format!("{}|{}", item.created_at.to_rfc3339(), item.user_id)),
        node: GrantedDocUserType {
          role: item.role.into(),
          user: WorkspaceUserType {
            id: item.user_id,
            name: item.name,
            email: item.email,
            avatar_url: item.avatar_url,
          },
        },
      })
      .collect();
    let has_previous_page = pagination.after.is_some() || offset > 0;
    let start_cursor = edges.first().map(|e| e.cursor.clone());
    let end_cursor = edges.last().map(|e| e.cursor.clone());
    Ok(PaginatedGrantedDocUserType {
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
}

pub(crate) async fn mutate_publish_doc(
  ctx: &Context<'_>,
  workspace_id: String,
  doc_id: String,
  mode: PublicDocMode,
) -> Result<DocType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let info = state
    .doc_sharing
    .publish_doc(&user.id, &workspace_id, &doc_id, mode.to_i16())
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(DocType::from_info(info))
}

pub(crate) async fn mutate_revoke_public_doc(
  ctx: &Context<'_>,
  workspace_id: String,
  doc_id: String,
) -> Result<DocType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let info = state
    .doc_sharing
    .unpublish_doc(&user.id, &workspace_id, &doc_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(DocType::from_info(info))
}

pub(crate) async fn mutate_grant_doc_user_roles(ctx: &Context<'_>, input: GrantDocUserRolesInput) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .doc_sharing
    .grant_doc_roles(
      &user.id,
      &input.workspace_id,
      &input.doc_id,
      input.user_ids,
      input.role.into(),
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_revoke_doc_user_roles(ctx: &Context<'_>, input: RevokeDocUserRoleInput) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .doc_sharing
    .transition_doc_role(&user.id, &input.workspace_id, &input.doc_id, &input.user_id, None)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_update_doc_user_role(ctx: &Context<'_>, input: UpdateDocUserRoleInput) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .doc_sharing
    .transition_doc_role(
      &user.id,
      &input.workspace_id,
      &input.doc_id,
      &input.user_id,
      Some(input.role.into()),
    )
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_update_doc_default_role(
  ctx: &Context<'_>,
  input: UpdateDocDefaultRoleInput,
) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .doc_sharing
    .set_doc_default_role(&user.id, &input.workspace_id, &input.doc_id, input.role.into())
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(true)
}

pub(crate) async fn mutate_recover_doc(
  ctx: &Context<'_>,
  workspace_id: String,
  guid: String,
  timestamp: DateTime<Utc>,
) -> Result<DateTime<Utc>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  state
    .histories
    .recover_doc(&user.id, &workspace_id, &guid, timestamp)
    .await
    .map_err(|e| domain_error_to_graphql(&e))
}

pub(crate) async fn resolve_workspace_doc(ctx: &Context<'_>, workspace_id: &str, doc_id: &str) -> Result<DocType> {
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let actor_user_id = current_authenticated_user(ctx).map(|a| a.user_id);
  let info = state
    .doc_sharing
    .get_doc_info(workspace_id, actor_user_id.as_deref(), doc_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?
    .ok_or_else(|| domain_error_to_graphql(&DomainError::NotFound(format!("doc_not_found:{workspace_id}:{doc_id}"))))?;
  Ok(DocType::from_info(info))
}

#[derive(Default)]
pub struct DocMutation;

#[async_graphql::Object]
impl DocMutation {
  async fn publish_doc(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    doc_id: String,
    #[graphql(default_with = "PublicDocMode::Page")] mode: PublicDocMode,
  ) -> Result<DocType> {
    mutate_publish_doc(ctx, workspace_id, doc_id, mode).await
  }

  async fn revoke_public_doc(&self, ctx: &Context<'_>, workspace_id: String, doc_id: String) -> Result<DocType> {
    mutate_revoke_public_doc(ctx, workspace_id, doc_id).await
  }

  async fn grant_doc_user_roles(&self, ctx: &Context<'_>, input: GrantDocUserRolesInput) -> Result<bool> {
    mutate_grant_doc_user_roles(ctx, input).await
  }

  async fn revoke_doc_user_roles(&self, ctx: &Context<'_>, input: RevokeDocUserRoleInput) -> Result<bool> {
    mutate_revoke_doc_user_roles(ctx, input).await
  }

  async fn update_doc_user_role(&self, ctx: &Context<'_>, input: UpdateDocUserRoleInput) -> Result<bool> {
    mutate_update_doc_user_role(ctx, input).await
  }

  async fn update_doc_default_role(&self, ctx: &Context<'_>, input: UpdateDocDefaultRoleInput) -> Result<bool> {
    mutate_update_doc_default_role(ctx, input).await
  }

  async fn recover_doc(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    guid: String,
    timestamp: chrono::DateTime<chrono::Utc>,
  ) -> Result<chrono::DateTime<chrono::Utc>> {
    mutate_recover_doc(ctx, workspace_id, guid, timestamp).await
  }
}
