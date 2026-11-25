//! Copilot BYOK GraphQL workspace fields and mutations aligned 1:1 with `v0.27.5` `schema.gql`.

mod convert;
mod types;

use std::sync::Arc;

use async_graphql::{Context, ID, MaybeUndefined, Object, Result};
use chrono::{DateTime, Utc};
use server_spi::{
  ByokProbeCheckSpiInput, ByokProfileOrderSpiInput, CreateByokLocalLeaseProviderSpiInput, CreateByokLocalLeaseSpiInput,
  CreateByokProfileSpiInput, ProbeByokDraftSpiInput, ProbeByokProfileSpiInput, ReorderByokProfilesSpiInput,
  ReplaceByokProfileSpiInput, RotateByokCredentialSpiInput,
};
use server_types::DomainError;

use self::convert::{
  definition_to_dto, local_lease_from_dto, probe_result_from_dto, profile_from_dto, settings_from_dto, usage_from_dto,
};
pub use self::types::*;
use super::{enforce_strict_throttle_graphql, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

fn split_description(value: MaybeUndefined<String>) -> (Option<String>, bool) {
  let omitted = matches!(value, MaybeUndefined::Undefined);
  (value.take(), omitted)
}

async fn assert_byok_copilot_enabled(state: &AppState) -> Result<()> {
  if !state.extension.byok_spi().is_enabled() {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "Copilot is disabled.".to_owned(),
    )));
  }
  let cfg = state
    .app_config
    .get_effective_app_config()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if cfg.pointer("/copilot/enabled").and_then(serde_json::Value::as_bool) == Some(false) {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "Copilot is disabled.".to_owned(),
    )));
  }
  Ok(())
}

pub(crate) async fn resolve_workspace_byok_settings(
  ctx: &Context<'_>,
  workspace_id: &str,
) -> Result<WorkspaceByokSettingsType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  assert_byok_copilot_enabled(state).await?;
  let dto = state
    .extension
    .byok_spi()
    .get_settings(&user.id, workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  settings_from_dto(dto).map_err(|e| domain_error_to_graphql(&e))
}

pub(crate) async fn resolve_workspace_byok_usage(
  ctx: &Context<'_>,
  workspace_id: &str,
  from: DateTime<Utc>,
  to: DateTime<Utc>,
) -> Result<Vec<WorkspaceByokUsagePointType>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  assert_byok_copilot_enabled(state).await?;
  let points = state
    .extension
    .byok_spi()
    .get_usage(&user.id, workspace_id, from, to)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(points.into_iter().map(usage_from_dto).collect())
}

#[derive(Default)]
pub struct ByokMutation;

#[Object]
impl ByokMutation {
  async fn create_workspace_byok_profile(
    &self,
    ctx: &Context<'_>,
    input: CreateWorkspaceByokProfileInput,
  ) -> Result<WorkspaceByokProfileType> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    let (description, description_omitted) = split_description(input.description);
    let dto = state
      .extension
      .byok_spi()
      .create_profile(CreateByokProfileSpiInput {
        workspace_id: input.workspace_id,
        provider: input.provider.as_str().to_owned(),
        name: input.name,
        description,
        description_omitted,
        credential: input.credential,
        definition: definition_to_dto(input.definition),
        enabled: input.enabled,
        actor_user_id: user.id,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    profile_from_dto(dto).map_err(|e| domain_error_to_graphql(&e))
  }

  async fn replace_workspace_byok_profile(
    &self,
    ctx: &Context<'_>,
    input: ReplaceWorkspaceByokProfileInput,
  ) -> Result<WorkspaceByokProfileType> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    let (description, description_omitted) = split_description(input.description);
    let dto = state
      .extension
      .byok_spi()
      .replace_profile(ReplaceByokProfileSpiInput {
        workspace_id: input.workspace_id,
        profile_id: input.profile_id.to_string(),
        expected_revision: input.expected_revision.0,
        name: input.name,
        description,
        description_omitted,
        definition: definition_to_dto(input.definition),
        credential: input.credential,
        enabled: input.enabled,
        actor_user_id: user.id,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    profile_from_dto(dto).map_err(|e| domain_error_to_graphql(&e))
  }

  async fn rotate_workspace_byok_credential(
    &self,
    ctx: &Context<'_>,
    input: RotateWorkspaceByokCredentialInput,
  ) -> Result<WorkspaceByokProfileType> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    let dto = state
      .extension
      .byok_spi()
      .rotate_credential(RotateByokCredentialSpiInput {
        workspace_id: input.workspace_id,
        profile_id: input.profile_id.to_string(),
        expected_revision: input.expected_revision.0,
        credential: input.credential,
        actor_user_id: user.id,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    profile_from_dto(dto).map_err(|e| domain_error_to_graphql(&e))
  }

  async fn delete_workspace_byok_profile(
    &self,
    ctx: &Context<'_>,
    profile_id: ID,
    workspace_id: String,
  ) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    state
      .extension
      .byok_spi()
      .delete_profile(&user.id, &workspace_id, profile_id.as_ref())
      .await
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn reorder_workspace_byok_profiles(
    &self,
    ctx: &Context<'_>,
    input: ReorderWorkspaceByokProfilesInput,
  ) -> Result<Vec<WorkspaceByokProfileType>> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    let list = state
      .extension
      .byok_spi()
      .reorder_profiles(ReorderByokProfilesSpiInput {
        workspace_id: input.workspace_id,
        profiles: input
          .profiles
          .into_iter()
          .map(|p| ByokProfileOrderSpiInput {
            profile_id: p.profile_id.to_string(),
            expected_revision: p.expected_revision.0,
          })
          .collect(),
        actor_user_id: user.id,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    list
      .into_iter()
      .map(profile_from_dto)
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| domain_error_to_graphql(&e))
  }

  async fn probe_workspace_byok_profile(
    &self,
    ctx: &Context<'_>,
    input: ProbeWorkspaceByokProfileInput,
  ) -> Result<WorkspaceByokProbeResultType> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    let dto = state
      .extension
      .byok_spi()
      .probe_profile(
        &user.id,
        ProbeByokProfileSpiInput {
          workspace_id: input.workspace_id,
          profile_id: input.profile_id.to_string(),
          checks: input
            .checks
            .into_iter()
            .map(|c| ByokProbeCheckSpiInput {
              model_id: c.model_id,
              operation: c.operation.as_str().to_owned(),
            })
            .collect(),
        },
      )
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    probe_result_from_dto(dto).map_err(|e| domain_error_to_graphql(&e))
  }

  async fn probe_workspace_byok_draft(
    &self,
    ctx: &Context<'_>,
    input: ProbeWorkspaceByokDraftInput,
  ) -> Result<WorkspaceByokProbeResultType> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    let dto = state
      .extension
      .byok_spi()
      .probe_draft(
        &user.id,
        ProbeByokDraftSpiInput {
          workspace_id: input.workspace_id,
          provider: input.provider.as_str().to_owned(),
          credential: input.credential,
          profile_id: input.profile_id.map(|id| id.to_string()),
          expected_revision: input.expected_revision.map(|r| r.0),
          definition: definition_to_dto(input.definition),
          checks: input
            .checks
            .into_iter()
            .map(|c| ByokProbeCheckSpiInput {
              model_id: c.model_id,
              operation: c.operation.as_str().to_owned(),
            })
            .collect(),
        },
      )
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    probe_result_from_dto(dto).map_err(|e| domain_error_to_graphql(&e))
  }

  async fn create_workspace_byok_local_lease(
    &self,
    ctx: &Context<'_>,
    input: CreateWorkspaceByokLocalLeaseInput,
  ) -> Result<CreateWorkspaceByokLocalLeaseResultType> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_byok_copilot_enabled(state).await?;
    let providers = input
      .providers
      .into_iter()
      .map(|p| {
        let (description, description_omitted) = split_description(p.description);
        CreateByokLocalLeaseProviderSpiInput {
          provider: p.provider.as_str().to_owned(),
          name: p.name,
          description,
          description_omitted,
          credential: p.credential,
          definition: definition_to_dto(p.definition),
          enabled: p.enabled,
        }
      })
      .collect();
    let dto = state
      .extension
      .byok_spi()
      .create_local_lease(CreateByokLocalLeaseSpiInput {
        workspace_id: input.workspace_id,
        user_id: user.id,
        providers,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(local_lease_from_dto(dto))
  }
}
