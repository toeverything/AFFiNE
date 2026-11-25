//! Copilot GraphQL types, queries (`UserType.copilot`), and mutations.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{Context, Enum, ID, InputObject, MaybeUndefined, Object, Result, SimpleObject, Upload};
use chrono::{DateTime, Utc};
use server_spi::{
  CleanupCopilotSessionsSpiInput, CopilotChatMessageRecord, CopilotHistoryOrder, CopilotHistoryRecord,
  CopilotRouteOptionsRecord, CopilotSessionSummaryRecord, CopilotStreamObjectRecord, CreateCopilotMessageSpiInput,
  CreateCopilotSessionSpiInput, ForkCopilotSessionSpiInput, ListCopilotChatsSpiInput, ListCopilotHistoriesSpiInput,
  ListCopilotSessionsSpiInput, UpdateCopilotSessionSpiInput, UploadedCopilotFile,
};
use server_types::DomainError;

use super::doc::{PageInfo, PaginationInput, encode_cursor};
use super::{JsonScalar, enforce_default_throttle_graphql, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::legacy_compat::quota::SafeInt;

const MAX_COPILOT_UPLOAD_BYTES: usize = 20 * 1024 * 1024;

pub(crate) async fn is_app_config_copilot_enabled(state: &AppState) -> std::result::Result<bool, DomainError> {
  let effective_cfg = state.app_config.get_effective_app_config().await?;
  Ok(
    effective_cfg
      .pointer("/copilot/enabled")
      .and_then(|v| v.as_bool())
      .unwrap_or(true),
  )
}

pub(crate) async fn enforce_copilot_enabled(state: &AppState) -> std::result::Result<(), DomainError> {
  let cfg_enabled = is_app_config_copilot_enabled(state).await?;
  state.extension.copilot_runtime().assert_enabled(cfg_enabled).await
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ChatHistoryOrder")]
pub enum ChatHistoryOrder {
  #[graphql(name = "asc")]
  Asc,
  #[graphql(name = "desc")]
  Desc,
}

impl From<ChatHistoryOrder> for CopilotHistoryOrder {
  fn from(order: ChatHistoryOrder) -> Self {
    match order {
      ChatHistoryOrder::Asc => Self::Asc,
      ChatHistoryOrder::Desc => Self::Desc,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "StreamObject")]
pub struct StreamObject {
  pub args: Option<JsonScalar>,
  pub result: Option<JsonScalar>,
  pub text_delta: Option<String>,
  pub tool_call_id: Option<String>,
  pub tool_name: Option<String>,
  #[graphql(name = "type")]
  pub kind: String,
}

impl From<CopilotStreamObjectRecord> for StreamObject {
  fn from(r: CopilotStreamObjectRecord) -> Self {
    Self {
      args: r.args.map(JsonScalar),
      result: r.result.map(JsonScalar),
      text_delta: r.text_delta,
      tool_call_id: r.tool_call_id,
      tool_name: r.tool_name,
      kind: r.kind,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ChatMessage")]
pub struct ChatMessage {
  pub attachments: Option<Vec<String>>,
  pub content: String,
  pub created_at: DateTime<Utc>,
  pub id: Option<ID>,
  pub params: Option<JsonScalar>,
  pub role: String,
  pub scope_snapshot: Option<JsonScalar>,
  pub stream_objects: Option<Vec<StreamObject>>,
}

impl From<CopilotChatMessageRecord> for ChatMessage {
  fn from(r: CopilotChatMessageRecord) -> Self {
    Self {
      attachments: r.attachments,
      content: r.content,
      created_at: r.created_at,
      id: r.id.map(ID),
      params: r.params.map(JsonScalar),
      role: r.role,
      scope_snapshot: r.scope_snapshot.map(JsonScalar),
      stream_objects: r.stream_objects.map(|v| v.into_iter().map(Into::into).collect()),
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotHistories")]
pub struct CopilotHistories {
  pub action: Option<String>,
  pub created_at: DateTime<Utc>,
  pub doc_id: Option<String>,
  pub messages: Vec<ChatMessage>,
  pub parent_session_id: Option<String>,
  pub pinned: bool,
  pub prompt_name: String,
  pub session_id: String,
  pub title: Option<String>,
  pub updated_at: DateTime<Utc>,
  pub workspace_id: String,
}

impl From<CopilotHistoryRecord> for CopilotHistories {
  fn from(r: CopilotHistoryRecord) -> Self {
    Self {
      action: r.action,
      created_at: r.created_at,
      doc_id: r.doc_id,
      messages: r.messages.into_iter().map(Into::into).collect(),
      parent_session_id: r.parent_session_id,
      pinned: r.pinned,
      prompt_name: r.prompt_name,
      session_id: r.session_id,
      title: r.title,
      updated_at: r.updated_at,
      workspace_id: r.workspace_id,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotHistoriesTypeEdge")]
pub struct CopilotHistoriesTypeEdge {
  pub cursor: String,
  pub node: CopilotHistories,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PaginatedCopilotHistoriesType")]
pub struct PaginatedCopilotHistoriesType {
  pub edges: Vec<CopilotHistoriesTypeEdge>,
  pub page_info: PageInfo,
  pub total_count: i32,
}

#[derive(SimpleObject, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotQuota")]
pub struct CopilotQuota {
  pub limit: Option<SafeInt>,
  pub used: SafeInt,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotRouteTarget")]
pub struct CopilotRouteTarget {
  pub available: bool,
  pub display_name: String,
  pub id: String,
  pub minimum_tier: String,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotRouteOptions")]
pub struct CopilotRouteOptions {
  pub choices: Vec<CopilotRouteTarget>,
  pub default_target_id: Option<String>,
  pub route_id: String,
}

impl From<CopilotRouteOptionsRecord> for CopilotRouteOptions {
  fn from(r: CopilotRouteOptionsRecord) -> Self {
    Self {
      choices: r
        .choices
        .into_iter()
        .map(|c| CopilotRouteTarget {
          available: c.available,
          display_name: c.display_name,
          id: c.id,
          minimum_tier: c.minimum_tier,
        })
        .collect(),
      default_target_id: r.default_target_id,
      route_id: r.route_id,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CopilotSessionType")]
pub struct CopilotSessionType {
  pub doc_id: Option<String>,
  pub id: ID,
  pub parent_session_id: Option<ID>,
  pub pinned: bool,
  pub prompt_name: String,
  pub title: Option<String>,
}

impl From<CopilotSessionSummaryRecord> for CopilotSessionType {
  fn from(r: CopilotSessionSummaryRecord) -> Self {
    Self {
      doc_id: r.doc_id,
      id: ID(r.id),
      parent_session_id: r.parent_session_id.map(ID),
      pinned: r.pinned,
      prompt_name: r.prompt_name,
      title: r.title,
    }
  }
}

#[derive(InputObject, Clone, Debug, Default)]
#[graphql(name = "QueryChatSessionsInput")]
pub struct QueryChatSessionsInput {
  pub action: Option<bool>,
  pub fork: Option<bool>,
  pub limit: Option<i32>,
  pub pinned: Option<bool>,
  pub skip: Option<i32>,
}

#[derive(InputObject, Clone, Debug, Default)]
#[graphql(name = "QueryChatHistoriesInput")]
pub struct QueryChatHistoriesInput {
  pub action: Option<bool>,
  pub fork: Option<bool>,
  pub limit: Option<i32>,
  pub message_order: Option<ChatHistoryOrder>,
  pub pinned: Option<bool>,
  pub session_id: Option<String>,
  pub session_order: Option<ChatHistoryOrder>,
  pub skip: Option<i32>,
  pub with_messages: Option<bool>,
  pub with_prompt: Option<bool>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CreateChatSessionInput")]
pub struct CreateChatSessionInput {
  pub doc_id: Option<String>,
  pub pinned: Option<bool>,
  pub prompt_name: String,
  pub reuse_latest_chat: Option<bool>,
  pub workspace_id: String,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateChatSessionInput")]
pub struct UpdateChatSessionInput {
  pub doc_id: MaybeUndefined<String>,
  pub pinned: Option<bool>,
  pub prompt_name: Option<String>,
  pub session_id: String,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "ForkChatSessionInput")]
pub struct ForkChatSessionInput {
  pub doc_id: String,
  pub latest_message_id: Option<String>,
  pub session_id: String,
  pub workspace_id: String,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "DeleteSessionInput")]
pub struct DeleteSessionInput {
  pub doc_id: Option<String>,
  pub session_ids: Vec<String>,
  pub workspace_id: String,
}

#[derive(InputObject)]
#[graphql(name = "CreateChatMessageInput")]
pub struct CreateChatMessageInput {
  #[graphql(deprecation = "use blobs")]
  pub attachments: Option<Vec<String>>,
  pub blob: Option<Upload>,
  pub blobs: Option<Vec<Upload>>,
  pub content: Option<String>,
  pub params: Option<JsonScalar>,
  pub session_id: String,
}

pub struct Copilot {
  pub workspace_id: Option<String>,
}

pub(crate) async fn resolve_user_copilot(ctx: &Context<'_>, workspace_id: Option<String>) -> Result<Copilot> {
  let caller = require_authenticated_user(ctx).await?;
  enforce_default_throttle_graphql(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  enforce_copilot_enabled(state)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if let Some(ws_id) = workspace_id.as_deref().filter(|s| !s.is_empty()) {
    state
      .extension
      .copilot_runtime()
      .validate_workspace_collection(&caller.id, ws_id, None, None)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    return Ok(Copilot {
      workspace_id: Some(ws_id.to_owned()),
    });
  }
  Ok(Copilot { workspace_id: None })
}

#[Object(name = "Copilot")]
impl Copilot {
  async fn workspace_id(&self) -> Option<ID> {
    self.workspace_id.as_ref().map(|id| ID(id.clone()))
  }

  async fn route_options(&self, ctx: &Context<'_>, prompt_name: String) -> Result<Option<CopilotRouteOptions>> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let cfg_enabled = is_app_config_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    state
      .extension
      .copilot_runtime()
      .assert_enabled(cfg_enabled)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let deployment = state.config.load().deployment_mode;
    let res = state
      .extension
      .copilot_runtime()
      .route_options(&caller.id, deployment, cfg_enabled, &prompt_name)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(res.map(Into::into))
  }

  async fn quota(&self, ctx: &Context<'_>) -> Result<CopilotQuota> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let quota = state
      .extension
      .copilot_runtime()
      .get_quota(&caller.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let limit = quota
      .limit
      .map(|v| {
        SafeInt::try_from_i64(v)
          .map_err(|_| domain_error_to_graphql(&DomainError::Internal("copilot quota limit overflow".into())))
      })
      .transpose()?;
    let used = SafeInt::try_from_i64(quota.used)
      .map_err(|_| domain_error_to_graphql(&DomainError::Internal("copilot quota used overflow".into())))?;
    Ok(CopilotQuota { limit, used })
  }

  async fn session(&self, ctx: &Context<'_>, session_id: String) -> Result<CopilotSessionType> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let session = state
      .extension
      .copilot_runtime()
      .get_session(&caller.id, self.workspace_id.as_deref(), &session_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(session.into())
  }

  #[graphql(deprecation = "use `chats` instead")]
  async fn sessions(
    &self,
    ctx: &Context<'_>,
    doc_id: MaybeUndefined<String>,
    options: Option<QueryChatSessionsInput>,
  ) -> Result<Vec<CopilotSessionType>> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let Some(workspace_id) = self.workspace_id.clone() else {
      return Ok(Vec::new());
    };
    let opts = options.unwrap_or_default();
    let sessions = state
      .extension
      .copilot_runtime()
      .list_sessions(ListCopilotSessionsSpiInput {
        user_id: caller.id,
        workspace_id,
        doc_id: maybe_doc_id(doc_id),
        action: opts.action,
        fork: opts.fork,
        pinned: opts.pinned,
        limit: opts.limit.map(i64::from),
        skip: opts.skip.map(i64::from),
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(sessions.into_iter().map(Into::into).collect())
  }

  #[graphql(deprecation = "use `chats` instead")]
  async fn histories(
    &self,
    ctx: &Context<'_>,
    doc_id: MaybeUndefined<String>,
    options: Option<QueryChatHistoriesInput>,
  ) -> Result<Vec<CopilotHistories>> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let Some(workspace_id) = self.workspace_id.clone() else {
      return Ok(Vec::new());
    };
    let opts = options.unwrap_or_default();
    let histories = state
      .extension
      .copilot_runtime()
      .list_histories(ListCopilotHistoriesSpiInput {
        user_id: caller.id,
        workspace_id,
        doc_id: maybe_doc_id(doc_id),
        session_id: opts.session_id,
        action: opts.action,
        fork: opts.fork,
        pinned: opts.pinned,
        limit: opts.limit.map(i64::from),
        skip: opts.skip.map(i64::from),
        session_order: opts.session_order.map(Into::into),
        message_order: opts.message_order.map(Into::into),
        with_messages: opts.with_messages.or(Some(true)),
        with_prompt: opts.with_prompt,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(histories.into_iter().map(Into::into).collect())
  }

  async fn chats(
    &self,
    ctx: &Context<'_>,
    pagination: PaginationInput,
    doc_id: MaybeUndefined<String>,
    options: Option<QueryChatHistoriesInput>,
  ) -> Result<PaginatedCopilotHistoriesType> {
    let caller = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let after_cursor = pagination.validate_and_resolve_after()?;
    let Some(workspace_id) = self.workspace_id.clone() else {
      return Ok(PaginatedCopilotHistoriesType {
        edges: Vec::new(),
        page_info: PageInfo {
          start_cursor: None,
          end_cursor: None,
          has_next_page: false,
          has_previous_page: false,
        },
        total_count: 0,
      });
    };
    let opts = options.unwrap_or_default();
    let first = i64::from(pagination.resolved_first(10));
    let offset = i64::from(pagination.resolved_offset());
    let page = state
      .extension
      .copilot_runtime()
      .list_chats_paginated(ListCopilotChatsSpiInput {
        query: ListCopilotHistoriesSpiInput {
          user_id: caller.id,
          workspace_id,
          doc_id: maybe_doc_id(doc_id),
          session_id: opts.session_id,
          action: opts.action,
          fork: opts.fork,
          pinned: opts.pinned,
          limit: Some(first),
          skip: Some(offset),
          session_order: opts.session_order.map(Into::into),
          message_order: opts.message_order.map(Into::into),
          with_messages: opts.with_messages,
          with_prompt: opts.with_prompt,
        },
        first,
        offset,
        after_cursor,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let edges: Vec<CopilotHistoriesTypeEdge> = page
      .items
      .into_iter()
      .map(|item| {
        let cursor = encode_cursor(&item.updated_at.to_rfc3339());
        CopilotHistoriesTypeEdge {
          cursor,
          node: item.into(),
        }
      })
      .collect();
    let start_cursor = edges.first().map(|e| e.cursor.clone());
    let end_cursor = edges.last().map(|e| e.cursor.clone());
    Ok(PaginatedCopilotHistoriesType {
      edges,
      page_info: PageInfo {
        start_cursor,
        end_cursor,
        has_next_page: page.has_next_page,
        has_previous_page: page.has_previous_page,
      },
      total_count: i32::try_from(page.total_count).unwrap_or(i32::MAX),
    })
  }
}

fn maybe_doc_id(doc_id: MaybeUndefined<String>) -> Option<Option<String>> {
  match doc_id {
    MaybeUndefined::Undefined => None,
    MaybeUndefined::Null => Some(None),
    MaybeUndefined::Value(s) => Some(Some(s)),
  }
}

fn read_bounded_upload(ctx: &Context<'_>, upload: Upload) -> Result<UploadedCopilotFile> {
  let mut val = upload
    .value(ctx)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("bad_request:Invalid upload: {e}"))))?;
  let mut bytes = Vec::new();
  val
    .content
    .by_ref()
    .take((MAX_COPILOT_UPLOAD_BYTES + 1) as u64)
    .read_to_end(&mut bytes)
    .map_err(|e| {
      domain_error_to_graphql(&DomainError::Validation(format!(
        "bad_request:Failed to read upload: {e}"
      )))
    })?;
  if bytes.len() > MAX_COPILOT_UPLOAD_BYTES {
    return Err(domain_error_to_graphql(&DomainError::QuotaExceeded {
      kind: "blob_limit",
      message: "Blob size exceeds the maximum allowed limit.".into(),
    }));
  }
  Ok(UploadedCopilotFile {
    filename: if val.filename.is_empty() {
      None
    } else {
      Some(val.filename)
    },
    content_type: val.content_type,
    bytes,
  })
}

#[derive(Default)]
pub struct CopilotMutation;

#[Object]
impl CopilotMutation {
  #[graphql(deprecation = "use `createCopilotSessionWithHistory` instead")]
  async fn create_copilot_session(&self, ctx: &Context<'_>, options: CreateChatSessionInput) -> Result<String> {
    let caller = require_authenticated_user(ctx).await?;
    enforce_default_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    state
      .extension
      .copilot_runtime()
      .create_session(CreateCopilotSessionSpiInput {
        user_id: caller.id,
        workspace_id: options.workspace_id,
        doc_id: options.doc_id,
        prompt_name: options.prompt_name,
        pinned: options.pinned.unwrap_or(false),
        reuse_latest_chat: options.reuse_latest_chat.unwrap_or(false),
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn create_copilot_session_with_history(
    &self,
    ctx: &Context<'_>,
    options: CreateChatSessionInput,
  ) -> Result<CopilotHistories> {
    let caller = require_authenticated_user(ctx).await?;
    enforce_default_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let record = state
      .extension
      .copilot_runtime()
      .create_session_with_history(CreateCopilotSessionSpiInput {
        user_id: caller.id,
        workspace_id: options.workspace_id,
        doc_id: options.doc_id,
        prompt_name: options.prompt_name,
        pinned: options.pinned.unwrap_or(false),
        reuse_latest_chat: options.reuse_latest_chat.unwrap_or(false),
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(record.into())
  }

  async fn update_copilot_session(&self, ctx: &Context<'_>, options: UpdateChatSessionInput) -> Result<String> {
    let caller = require_authenticated_user(ctx).await?;
    enforce_default_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let doc_id = match options.doc_id {
      MaybeUndefined::Undefined => None,
      MaybeUndefined::Null => Some(None),
      MaybeUndefined::Value(v) => Some(Some(v)),
    };
    state
      .extension
      .copilot_runtime()
      .update_session(UpdateCopilotSessionSpiInput {
        user_id: caller.id,
        session_id: options.session_id,
        doc_id,
        pinned: options.pinned,
        prompt_name: options.prompt_name,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn fork_copilot_session(&self, ctx: &Context<'_>, options: ForkChatSessionInput) -> Result<String> {
    let caller = require_authenticated_user(ctx).await?;
    enforce_default_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    state
      .extension
      .copilot_runtime()
      .fork_session(ForkCopilotSessionSpiInput {
        user_id: caller.id,
        workspace_id: options.workspace_id,
        doc_id: options.doc_id,
        session_id: options.session_id,
        latest_message_id: options.latest_message_id,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn cleanup_copilot_session(&self, ctx: &Context<'_>, options: DeleteSessionInput) -> Result<Vec<String>> {
    let caller = require_authenticated_user(ctx).await?;
    enforce_default_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    state
      .extension
      .copilot_runtime()
      .cleanup_sessions(CleanupCopilotSessionsSpiInput {
        user_id: caller.id,
        workspace_id: options.workspace_id,
        doc_id: options.doc_id,
        session_ids: options.session_ids,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn create_copilot_message(&self, ctx: &Context<'_>, options: CreateChatMessageInput) -> Result<String> {
    const MAX_COPILOT_CONTENT_BYTES: usize = 256 * 1024;
    const MAX_COPILOT_PARAMS_BYTES: usize = 256 * 1024;
    const MAX_COPILOT_BLOBS_COUNT: usize = 10;
    const MAX_COPILOT_BLOBS_TOTAL_BYTES: usize = 50 * 1024 * 1024;
    const MAX_COPILOT_ATTACHMENT_URL_BYTES: usize = 2048;

    let caller = require_authenticated_user(ctx).await?;
    enforce_default_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    enforce_copilot_enabled(state)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    if options
      .content
      .as_ref()
      .is_some_and(|c| c.len() > MAX_COPILOT_CONTENT_BYTES)
    {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "bad_request:Copilot message content exceeds maximum allowed length.".into(),
      )));
    }
    let attachments = options.attachments.unwrap_or_default();
    if attachments.len() > MAX_COPILOT_BLOBS_COUNT {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "bad_request:Too many attachments in a single copilot message.".into(),
      )));
    }
    for att in &attachments {
      if att.trim().is_empty() || att.len() > MAX_COPILOT_ATTACHMENT_URL_BYTES || att.chars().any(char::is_control) {
        return Err(domain_error_to_graphql(&DomainError::Validation(
          "bad_request:Invalid copilot attachment URL.".into(),
        )));
      }
    }
    let params = options.params.map(|p| p.0);
    if let Some(ref val) = params
      && serde_json::to_vec(val).is_ok_and(|b| b.len() > MAX_COPILOT_PARAMS_BYTES)
    {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "bad_request:Copilot message params exceed maximum allowed size.".into(),
      )));
    }
    let mut uploads = Vec::new();
    let mut total_upload_bytes: usize = 0;
    if let Some(blob) = options.blob {
      let file = read_bounded_upload(ctx, blob)?;
      total_upload_bytes = total_upload_bytes.saturating_add(file.bytes.len());
      uploads.push(file);
    }
    if let Some(blobs) = options.blobs {
      if attachments
        .len()
        .saturating_add(uploads.len())
        .saturating_add(blobs.len())
        > MAX_COPILOT_BLOBS_COUNT
      {
        return Err(domain_error_to_graphql(&DomainError::Validation(
          "bad_request:Too many blobs in a single copilot message.".into(),
        )));
      }
      for blob in blobs {
        let file = read_bounded_upload(ctx, blob)?;
        total_upload_bytes = total_upload_bytes.saturating_add(file.bytes.len());
        if total_upload_bytes > MAX_COPILOT_BLOBS_TOTAL_BYTES {
          return Err(domain_error_to_graphql(&DomainError::QuotaExceeded {
            kind: "blob_limit",
            message: "Blob size exceeds the maximum allowed limit.".into(),
          }));
        }
        uploads.push(file);
      }
    } else if attachments.len().saturating_add(uploads.len()) > MAX_COPILOT_BLOBS_COUNT {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "bad_request:Too many attachments in a single copilot message.".into(),
      )));
    }
    state
      .extension
      .copilot_runtime()
      .create_message(CreateCopilotMessageSpiInput {
        user_id: caller.id,
        session_id: options.session_id,
        content: options.content,
        attachments,
        uploads,
        params,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }
}
