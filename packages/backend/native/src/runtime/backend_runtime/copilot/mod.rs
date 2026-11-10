mod context;
mod dispatch;
mod options;
mod stream;

use std::{
  collections::HashMap,
  sync::{Arc, RwLock},
  time::Duration,
};

use gcp_auth::TokenProvider;
use sha2::{Digest, Sha256};
use tokio::sync::OnceCell;
use zeroize::Zeroizing;

use super::{BackendRuntime, RuntimeError, RuntimeResult, to_napi_error};
use crate::{
  llm::{
    CopilotExecuteInput, CopilotRouteCheckInput,
    route::{self, AuthorizedRouteTargets, ResolvedManagedTarget},
  },
  runtime::BackendRuntimeConfig,
};

pub(super) type ManagedTokenProviderCache = RwLock<HashMap<String, Arc<OnceCell<Arc<dyn TokenProvider>>>>>;
pub(super) const COPILOT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30 * 60);

struct AuthorizedCopilotRoute {
  config: std::sync::Arc<BackendRuntimeConfig>,
  slot: route::CatalogSlot,
  profiles: Vec<route::AuthorizedProviderProfile>,
  targets: AuthorizedRouteTargets,
}

pub(super) struct EmbeddingTarget {
  pub(super) fingerprint: String,
  pub(super) route_source: &'static str,
  pub(super) provider: String,
  pub(super) model_id: String,
  pub(super) endpoint_fingerprint: String,
}

#[derive(Clone)]
pub(super) struct BackgroundEmbeddingProvider {
  pool: sqlx::PgPool,
  config: Arc<RwLock<Arc<BackendRuntimeConfig>>>,
  managed_token_providers: Arc<ManagedTokenProviderCache>,
}

impl BackgroundEmbeddingProvider {
  pub(super) fn new(
    pool: sqlx::PgPool,
    config: Arc<RwLock<Arc<BackendRuntimeConfig>>>,
    managed_token_providers: Arc<ManagedTokenProviderCache>,
  ) -> Self {
    Self {
      pool,
      config,
      managed_token_providers,
    }
  }

  fn config(&self) -> RuntimeResult<Arc<BackendRuntimeConfig>> {
    self
      .config
      .read()
      .map(|config| Arc::clone(&config))
      .map_err(|_| RuntimeError::invalid_state("BackendRuntime config lock poisoned"))
  }

  async fn route(&self, workspace_id: &str) -> RuntimeResult<AuthorizedCopilotRoute> {
    let config = self.config()?;
    if !config.copilot.enabled {
      return Err(RuntimeError::invalid_state("copilot_disabled"));
    }
    let slot = route::slot("index.embedding").expect("embedding route slot must exist");
    let access = crate::llm::CopilotAccessProjection {
      route_allowed: true,
      managed_tier: route::CopilotManagedTier::Standard,
      server_byok: true,
      local_byok: false,
    };
    let profiles = context::load_profiles(
      &self.pool,
      &config,
      context::ProfileLoadInput {
        workspace_id: Some(workspace_id),
        user_id: None,
        local_lease_id: None,
        access: &access,
      },
    )
    .await?;
    let managed_target = context::load_managed_target(&config.copilot, &slot, None, access.managed_tier, None)?;
    let targets = match route::decide(route::RoutePolicyInput {
      slot: &slot,
      deployment: config.deployment,
      byok_enabled: config.copilot.byok.enabled,
      access_available: true,
      profiles: &profiles,
      managed_target: managed_target.as_ref(),
      target_override: None,
      target_override_managed: false,
    }) {
      route::RouteDecision::Ready(AuthorizedRouteTargets::Byok(mut candidates)) => {
        candidates.truncate(1);
        AuthorizedRouteTargets::Byok(candidates)
      }
      route::RouteDecision::Ready(targets) => targets,
      route::RouteDecision::Denied(reason) => return Err(RuntimeError::invalid_input(reason_name(reason))),
      route::RouteDecision::NoRoute(reason) => return Err(RuntimeError::invalid_state(reason_name(reason))),
    };
    Ok(AuthorizedCopilotRoute {
      config,
      slot,
      profiles,
      targets,
    })
  }

  pub(super) async fn target(&self, workspace_id: &str) -> RuntimeResult<EmbeddingTarget> {
    target_from_route(&self.route(workspace_id).await?)
  }

  pub(super) async fn embed(
    &self,
    workspace_id: &str,
    expected_fingerprint: &str,
    inputs: Vec<String>,
    task_type: &str,
  ) -> RuntimeResult<Vec<Vec<f32>>> {
    let authorized = self.route(workspace_id).await?;
    let target = target_from_route(&authorized)?;
    if target.fingerprint != expected_fingerprint {
      return Err(RuntimeError::invalid_state("embedding_space_changed"));
    }
    let managed_credential = resolve_managed_credential(&authorized.targets, &self.managed_token_providers).await?;
    let request = llm_adapter::router::ExecutableRequest::Embedding(llm_adapter::core::EmbeddingRequest {
      model: target.model_id,
      inputs,
      dimensions: Some(1024),
      task_type: Some(task_type.to_string()),
    });
    let config = authorized.config;
    let slot = authorized.slot;
    let profiles = authorized.profiles;
    let targets = authorized.targets;
    tokio::task::spawn_blocking(move || {
      dispatch::execute_embeddings(config, slot, request, profiles, targets, managed_credential)
    })
    .await
    .map_err(|error| RuntimeError::invalid_state(format!("embedding execution task failed: {error}")))?
  }
}

fn target_from_route(authorized: &AuthorizedCopilotRoute) -> RuntimeResult<EmbeddingTarget> {
  let (route_source, provider, model_id, endpoint_identity) = match &authorized.targets {
    AuthorizedRouteTargets::Managed(target) => (
      "managed",
      target.provider.as_str().to_string(),
      target.target.wire_model().to_string(),
      if target.provider.uses_default_endpoint(&target.credential_config) {
        "ProviderDefault".to_string()
      } else {
        format!("Custom({:?})", target.target.endpoint())
      },
    ),
    AuthorizedRouteTargets::Byok(candidates) => {
      let candidate = candidates
        .first()
        .ok_or_else(|| RuntimeError::invalid_state("embedding_route_unavailable"))?;
      let profile = authorized
        .profiles
        .get(candidate.profile_index)
        .ok_or_else(|| RuntimeError::invalid_state("invalid embedding route profile"))?;
      if profile.source == route::ProfileSource::Local {
        return Err(RuntimeError::invalid_state("embedding_route_unavailable"));
      }
      let model = profile
        .models
        .get(candidate.model_index)
        .ok_or_else(|| RuntimeError::invalid_state("invalid embedding route model"))?;
      (
        "byok",
        profile.provider.clone(),
        model.model_id.clone(),
        match &profile.endpoint {
          crate::llm::byok::ByokEndpoint::ProviderDefault => "ProviderDefault".to_string(),
          crate::llm::byok::ByokEndpoint::OpenAiCompatible { url, .. } => format!("Custom({url:?})"),
        },
      )
    }
  };
  let endpoint_fingerprint = hex::encode(Sha256::digest(endpoint_identity.as_bytes()));
  let identity = format!("{route_source}|{provider}|{endpoint_fingerprint}|{model_id}|1024|cosine|1");
  Ok(EmbeddingTarget {
    fingerprint: hex::encode(Sha256::digest(identity.as_bytes())),
    route_source,
    provider,
    model_id,
    endpoint_fingerprint,
  })
}

#[napi_derive::napi]
impl BackendRuntime {
  pub(super) async fn resolve_background_embedding_target(&self, workspace_id: &str) -> RuntimeResult<EmbeddingTarget> {
    BackgroundEmbeddingProvider::new(
      self.pool().await?,
      Arc::clone(&self.config),
      Arc::clone(&self.managed_token_providers),
    )
    .target(workspace_id)
    .await
  }

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
    let (config, slot, request, profiles, targets, managed_credential) = self.prepare_copilot(input).await?;
    let output = tokio::task::spawn_blocking(move || {
      dispatch::execute(config, slot, request, profiles, targets, managed_credential)
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
    let managed_credential = resolve_managed_credential(&authorized.targets, &self.managed_token_providers).await?;
    Ok((
      authorized.config,
      authorized.slot,
      request,
      authorized.profiles,
      authorized.targets,
      managed_credential,
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
    let profiles = context::load_profiles(
      &self.pool().await?,
      &config,
      context::ProfileLoadInput {
        workspace_id: input.workspace_id.as_deref(),
        user_id: input.user_id.as_deref(),
        local_lease_id: input.local_lease_id.as_deref(),
        access: &input.access,
      },
    )
    .await?;
    if input.managed_target_id.is_some() && input.target_override.is_some() {
      return Err(RuntimeError::invalid_input("multiple_target_selections"));
    }
    let managed_target = context::load_managed_target(
      &config.copilot,
      &slot,
      input.built_in_route_id.as_deref(),
      input.access.managed_tier,
      input.managed_target_id.as_deref(),
    )?;
    let target_override = input.target_override.map(|target| route::TargetOverride {
      profile_id: target.profile_id,
      model_id: target.model_id,
    });
    let targets = match route::decide(route::RoutePolicyInput {
      slot: &slot,
      deployment: config.deployment,
      byok_enabled: config.copilot.byok.enabled,
      access_available: input.access.route_allowed
        || route::quota_policy(&slot, input.built_in_route_id.as_deref()) != route::QuotaPolicy::Metered,
      profiles: &profiles,
      managed_target: managed_target.as_ref(),
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
      targets,
    })
  }
}

async fn resolve_managed_credential(
  targets: &AuthorizedRouteTargets,
  cache: &ManagedTokenProviderCache,
) -> RuntimeResult<Option<Zeroizing<String>>> {
  let AuthorizedRouteTargets::Managed(target) = targets else {
    return Ok(None);
  };
  let plan = target.credential_plan.as_ref();
  let token_provider = if matches!(plan, llm_adapter::backend::CredentialPlan::GoogleOAuth { .. }) {
    Some(managed_token_provider(target, cache).await?)
  } else {
    None
  };
  dispatch::managed_credential(plan, &target.credential_config, token_provider)
    .await
    .map(Zeroizing::new)
    .map(Some)
}

async fn managed_token_provider(
  target: &ResolvedManagedTarget,
  cache: &ManagedTokenProviderCache,
) -> RuntimeResult<Arc<dyn TokenProvider>> {
  let config = serde_json::to_vec(&target.credential_config)
    .map_err(|error| RuntimeError::json("serialize managed Google profile failed", error))?;
  let cache_key = format!(
    "{}:{:?}:{}",
    target.profile_id,
    target.provider,
    hex::encode(Sha256::digest(config))
  );
  let cell = {
    let mut providers = cache
      .write()
      .map_err(|_| RuntimeError::invalid_state("managed token provider cache lock poisoned"))?;
    Arc::clone(providers.entry(cache_key).or_insert_with(|| Arc::new(OnceCell::new())))
  };
  cell
    .get_or_try_init(|| dispatch::create_google_token_provider(&target.credential_plan))
    .await
    .map(Arc::clone)
}

fn reason_name(reason: route::RouteDecisionReason) -> &'static str {
  match reason {
    route::RouteDecisionReason::ByokDisabled => "byok_disabled",
    route::RouteDecisionReason::AccessUnavailable => "access_unavailable",
    route::RouteDecisionReason::ExplicitTargetUnavailable => "target_unavailable",
    route::RouteDecisionReason::NoCompatibleTarget => "no_compatible_target",
    route::RouteDecisionReason::ManagedPresetUnavailable => "managed_preset_unavailable",
  }
}
