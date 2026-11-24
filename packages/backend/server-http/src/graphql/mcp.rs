//! Workspace MCP credential GraphQL queries and mutations.

use std::sync::Arc;

use async_graphql::{Context, Enum, ID, InputObject, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use server_domain::mcp::{
  CreateMcpCredentialParams, McpAccessMode as DomainMcpAccessMode, McpCredentialStatus as DomainMcpCredentialStatus,
  McpCredentialView, RevealedMcpCredential,
};
use server_types::DomainError;

use super::require_authenticated_user;
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "McpAccessMode", rename_items = "SCREAMING_SNAKE_CASE")]
pub enum McpAccessMode {
  ReadOnly,
  ReadWrite,
}
impl From<DomainMcpAccessMode> for McpAccessMode {
  fn from(v: DomainMcpAccessMode) -> Self {
    match v {
      DomainMcpAccessMode::ReadOnly => Self::ReadOnly,
      DomainMcpAccessMode::ReadWrite => Self::ReadWrite,
    }
  }
}
impl From<McpAccessMode> for DomainMcpAccessMode {
  fn from(v: McpAccessMode) -> Self {
    match v {
      McpAccessMode::ReadOnly => Self::ReadOnly,
      McpAccessMode::ReadWrite => Self::ReadWrite,
    }
  }
}
#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "McpCredentialStatus", rename_items = "SCREAMING_SNAKE_CASE")]
pub enum McpCredentialStatus {
  Active,
  Expired,
  Expiring,
  Revoked,
  Rotating,
}
impl From<DomainMcpCredentialStatus> for McpCredentialStatus {
  fn from(v: DomainMcpCredentialStatus) -> Self {
    match v {
      DomainMcpCredentialStatus::Active => Self::Active,
      DomainMcpCredentialStatus::Expired => Self::Expired,
      DomainMcpCredentialStatus::Expiring => Self::Expiring,
      DomainMcpCredentialStatus::Revoked => Self::Revoked,
      DomainMcpCredentialStatus::Rotating => Self::Rotating,
    }
  }
}
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "McpCredentialType")]
pub struct McpCredentialType {
  pub id: ID,
  pub name: String,
  pub workspace_id: String,
  pub access_mode: McpAccessMode,
  pub fingerprint: String,
  pub created_at: DateTime<Utc>,
  pub expires_at: DateTime<Utc>,
  pub last_used_at: Option<DateTime<Utc>>,
  pub revoked_at: Option<DateTime<Utc>>,
  pub grace_ends_at: Option<DateTime<Utc>>,
  pub status: McpCredentialStatus,
}
impl From<McpCredentialView> for McpCredentialType {
  fn from(v: McpCredentialView) -> Self {
    Self {
      id: ID(v.id),
      name: v.name,
      workspace_id: v.workspace_id,
      access_mode: v.access_mode.into(),
      fingerprint: v.fingerprint,
      created_at: v.created_at,
      expires_at: v.expires_at,
      last_used_at: v.last_used_at,
      revoked_at: v.revoked_at,
      grace_ends_at: v.grace_ends_at,
      status: v.status.into(),
    }
  }
}
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "RevealedMcpCredentialType")]
pub struct RevealedMcpCredentialType {
  pub credential: McpCredentialType,
  pub token: String,
}
impl From<RevealedMcpCredential> for RevealedMcpCredentialType {
  fn from(v: RevealedMcpCredential) -> Self {
    Self {
      credential: v.credential.into(),
      token: v.token,
    }
  }
}
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CreateMcpCredentialInput")]
pub struct CreateMcpCredentialInput {
  pub workspace_id: String,
  pub name: String,
  #[graphql(default_with = "McpAccessMode::ReadOnly")]
  pub access_mode: McpAccessMode,
  #[graphql(default = 90)]
  pub expiration_days: i32,
}
pub(crate) fn mcp_read_write_available(state: &AppState) -> bool {
  let cfg = state.config.load();
  cfg.dev_mode || cfg.channel == "canary"
}
/// Checks `@CopilotEnabled()` strictly through [`server_spi::CopilotRuntimeSpi`].
pub(crate) fn assert_copilot_enabled(state: &AppState) -> std::result::Result<(), DomainError> {
  if state.extension.copilot_runtime().is_enabled() {
    Ok(())
  } else {
    Err(DomainError::Forbidden("Copilot is disabled.".to_owned()))
  }
}
fn gql_err(e: DomainError) -> async_graphql::Error {
  domain_error_to_graphql(&e)
}
async fn auth_copilot_workspace(ctx: &Context<'_>, workspace_id: &str) -> Result<(String, Arc<AppState>)> {
  let user = require_authenticated_user(ctx).await?;
  let state = Arc::clone(ctx.data_unchecked::<Arc<AppState>>());
  assert_copilot_enabled(&state).map_err(gql_err)?;
  let perms = state
    .workspaces
    .resolve_workspace_permissions(&user.id, workspace_id)
    .await
    .map_err(gql_err)?;
  if !perms.read {
    return Err(gql_err(DomainError::Forbidden(
      "Workspace.Read permission required".to_owned(),
    )));
  }
  Ok((user.id, state))
}
#[derive(Default)]
pub struct McpQuery;
#[Object]
impl McpQuery {
  async fn mcp_credentials(&self, ctx: &Context<'_>, workspace_id: String) -> Result<Vec<McpCredentialType>> {
    let (user_id, state) = auth_copilot_workspace(ctx, &workspace_id).await?;
    Ok(
      state
        .mcp
        .list(&user_id, &workspace_id)
        .await
        .map_err(gql_err)?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }
  async fn mcp_credential_read_write_available(&self, ctx: &Context<'_>) -> Result<bool> {
    let _user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_copilot_enabled(state).map_err(gql_err)?;
    Ok(mcp_read_write_available(state))
  }
}
#[derive(Default)]
pub struct McpMutation;
#[Object]
impl McpMutation {
  async fn create_mcp_credential(
    &self,
    ctx: &Context<'_>,
    input: CreateMcpCredentialInput,
  ) -> Result<RevealedMcpCredentialType> {
    let (user_id, state) = auth_copilot_workspace(ctx, &input.workspace_id).await?;
    if input.access_mode == McpAccessMode::ReadWrite && !mcp_read_write_available(&state) {
      return Err(gql_err(DomainError::Validation(
        "MCP write tools are not available".to_owned(),
      )));
    }
    state
      .mcp
      .create(CreateMcpCredentialParams {
        user_id,
        workspace_id: input.workspace_id,
        name: input.name,
        access_mode: input.access_mode.into(),
        expiration_days: input.expiration_days,
      })
      .await
      .map(Into::into)
      .map_err(gql_err)
  }
  async fn rotate_mcp_credential(
    &self,
    ctx: &Context<'_>,
    id: ID,
    workspace_id: String,
    #[graphql(default = 90)] expiration_days: i32,
  ) -> Result<RevealedMcpCredentialType> {
    let (user_id, state) = auth_copilot_workspace(ctx, &workspace_id).await?;
    state
      .mcp
      .rotate(id.as_str(), &user_id, &workspace_id, expiration_days)
      .await
      .map(Into::into)
      .map_err(gql_err)
  }
  async fn revoke_mcp_credential(&self, ctx: &Context<'_>, id: ID, workspace_id: String) -> Result<bool> {
    let (user_id, state) = auth_copilot_workspace(ctx, &workspace_id).await?;
    state
      .mcp
      .revoke(id.as_str(), &user_id, &workspace_id)
      .await
      .map_err(gql_err)
  }
}
