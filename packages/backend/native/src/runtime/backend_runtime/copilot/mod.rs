mod context;
mod dispatch;
mod stream;

pub(in crate::runtime::backend_runtime) use dispatch::{
  endpoint as byok_endpoint, protocol as executable_protocol, provider as backend_provider,
};

use super::{BackendRuntime, RuntimeError, RuntimeResult, to_napi_error};
use crate::{
  llm::{CopilotExecuteInput, CopilotRouteCheckInput, route},
  runtime::BackendRuntimeConfig,
};

struct AuthorizedCopilotRoute {
  config: std::sync::Arc<BackendRuntimeConfig>,
  slot: route::CatalogSlot,
  profiles: Vec<route::AuthorizedProfileRef>,
  candidates: Vec<route::AuthorizedTargetRef>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn execute_copilot(&self, input: CopilotExecuteInput) -> napi::Result<String> {
    self.execute_copilot_inner(input).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn assert_copilot_route(&self, input: CopilotRouteCheckInput) -> napi::Result<()> {
    let slot = route::slot(&input.slot).ok_or_else(|| RuntimeError::invalid_input("unknown copilot route slot"));
    self
      .authorize_copilot_route(input, slot.map_err(to_napi_error)?)
      .await
      .map(|_| ())
      .map_err(to_napi_error)
  }
}

impl BackendRuntime {
  async fn execute_copilot_inner(&self, input: CopilotExecuteInput) -> RuntimeResult<String> {
    let (config, slot, request, profiles, candidates, managed_credentials) = self.prepare_copilot(input).await?;
    let output = tokio::task::spawn_blocking(move || {
      dispatch::execute(config, slot, request, profiles, candidates, managed_credentials)
    })
    .await
    .map_err(|error| RuntimeError::invalid_state(format!("copilot execution task failed: {error}")))??;
    serde_json::to_string(&output).map_err(|error| RuntimeError::json("serialize copilot execution failed", error))
  }

  pub(super) async fn prepare_copilot(
    &self,
    input: CopilotExecuteInput,
  ) -> RuntimeResult<stream::PreparedCopilotExecution> {
    let CopilotExecuteInput {
      slot,
      built_in_route_id,
      workspace_id,
      user_id,
      local_lease_id,
      access,
      managed_target_id,
      target_override,
      request,
    } = input;
    let base_slot = route::slot(&slot).ok_or_else(|| RuntimeError::invalid_input("unknown copilot route slot"))?;
    let (slot, request) = dispatch::request_and_slot(base_slot, request)?;
    let authorized = self
      .authorize_copilot_route(
        CopilotRouteCheckInput {
          slot: slot.id.to_string(),
          built_in_route_id,
          workspace_id,
          user_id,
          local_lease_id,
          access,
          managed_target_id,
          target_override,
        },
        slot,
      )
      .await?;
    let managed_credentials =
      dispatch::resolve_managed_credentials(&authorized.config, &authorized.profiles, &authorized.candidates).await?;
    Ok((
      authorized.config,
      authorized.slot,
      request,
      authorized.profiles,
      authorized.candidates,
      managed_credentials,
    ))
  }

  async fn authorize_copilot_route(
    &self,
    input: CopilotRouteCheckInput,
    slot: route::CatalogSlot,
  ) -> RuntimeResult<AuthorizedCopilotRoute> {
    let config = self.config()?;
    if !config.copilot.enabled {
      return Err(RuntimeError::invalid_state("copilot_disabled"));
    }
    let deployment = if std::env::var("DEPLOYMENT_TYPE").as_deref() == Ok("selfhosted") {
      route::Deployment::SelfHosted
    } else {
      route::Deployment::Cloud
    };
    let profiles = context::load_profiles(
      &self.pool().await?,
      &config.copilot,
      context::ProfileLoadInput {
        slot: &slot,
        built_in_route_id: input.built_in_route_id.as_deref(),
        workspace_id: input.workspace_id.as_deref(),
        user_id: input.user_id.as_deref(),
        local_lease_id: input.local_lease_id.as_deref(),
        access: &input.access,
        managed_target_id: input.managed_target_id.as_deref(),
      },
    )
    .await?;
    if input.managed_target_id.is_some() && input.target_override.is_some() {
      return Err(RuntimeError::invalid_input("multiple_target_selections"));
    }
    let target_override = if let Some(target_id) = input.managed_target_id.as_deref() {
      let model_id =
        route::managed_selected_target(input.built_in_route_id.as_deref(), target_id, input.access.managed_tier)
          .ok_or_else(|| RuntimeError::invalid_input("managed_target_unavailable"))?;
      let profile = profiles
        .iter()
        .find(|profile| {
          profile.source == route::ProfileSource::Managed
            && profile.definition.models.iter().any(|model| model.model_id == model_id)
        })
        .ok_or_else(|| RuntimeError::invalid_state("managed_target_unavailable"))?;
      Some(route::TargetOverride {
        profile_id: profile.profile_id.clone(),
        model_id,
      })
    } else {
      input.target_override.map(|target| route::TargetOverride {
        profile_id: target.profile_id,
        model_id: target.model_id,
      })
    };
    let candidates = match route::decide(route::RoutePolicyInput {
      slot: &slot,
      deployment,
      byok_enabled: config.copilot.byok.enabled,
      access_available: input.access.route_allowed
        || route::quota_policy(&slot, input.built_in_route_id.as_deref()) != route::QuotaPolicy::Metered,
      profiles: &profiles,
      target_override: target_override.as_ref(),
      target_override_managed: input.managed_target_id.is_some(),
    }) {
      route::RouteDecision::Ready(candidates) => candidates,
      route::RouteDecision::Denied(reason) => {
        return Err(RuntimeError::invalid_input(reason_name(reason)));
      }
      route::RouteDecision::NoRoute(reason) => {
        return Err(RuntimeError::invalid_state(reason_name(reason)));
      }
    };
    Ok(AuthorizedCopilotRoute {
      config,
      slot,
      profiles,
      candidates,
    })
  }
}

fn reason_name(reason: route::RouteDecisionReason) -> &'static str {
  match reason {
    route::RouteDecisionReason::ByokDisabled => "byok_disabled",
    route::RouteDecisionReason::AccessUnavailable => "access_unavailable",
    route::RouteDecisionReason::ExplicitTargetUnavailable => "explicit_target_unavailable",
    route::RouteDecisionReason::NoCompatibleTarget => "no_compatible_target",
    route::RouteDecisionReason::ManagedPresetUnavailable => "managed_preset_unavailable",
  }
}
