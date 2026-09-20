mod context;
mod dispatch;
mod stream;

use std::{
  collections::HashMap,
  sync::{Arc, RwLock},
  time::Duration,
};

pub(in crate::runtime::backend_runtime) use dispatch::{protocol as executable_protocol, provider as backend_provider};
use gcp_auth::TokenProvider;
use sha2::{Digest, Sha256};
use tokio::sync::OnceCell;
use zeroize::Zeroizing;

use super::{BackendRuntime, RuntimeError, RuntimeResult, to_napi_error};
use crate::{
  llm::{
    CopilotExecuteInput, CopilotRouteCheckInput,
    route::{self, AuthorizedProviderProfile, AuthorizedTargetRef, CredentialRef},
  },
  runtime::{BackendRuntimeConfig, CopilotManagedProfileConfig},
};

pub(super) type ManagedTokenProviderCache = RwLock<HashMap<String, Arc<OnceCell<Arc<dyn TokenProvider>>>>>;
pub(super) const COPILOT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30 * 60);

struct AuthorizedCopilotRoute {
  config: std::sync::Arc<BackendRuntimeConfig>,
  slot: route::CatalogSlot,
  profiles: Vec<route::AuthorizedProviderProfile>,
  candidates: Vec<route::AuthorizedTargetRef>,
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
        slot: &slot,
        built_in_route_id: None,
        workspace_id: Some(workspace_id),
        user_id: None,
        local_lease_id: None,
        access: &access,
        managed_target_id: None,
      },
    )
    .await?;
    let candidates = match route::decide(route::RoutePolicyInput {
      slot: &slot,
      deployment: config.deployment,
      byok_enabled: config.copilot.byok.enabled,
      access_available: true,
      profiles: &profiles,
      target_override: None,
      target_override_managed: false,
    }) {
      route::RouteDecision::Ready(mut candidates) => {
        candidates.truncate(1);
        candidates
      }
      route::RouteDecision::Denied(reason) => return Err(RuntimeError::invalid_input(reason_name(reason))),
      route::RouteDecision::NoRoute(reason) => return Err(RuntimeError::invalid_state(reason_name(reason))),
    };
    Ok(AuthorizedCopilotRoute {
      config,
      slot,
      profiles,
      candidates,
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
    let managed_credentials = resolve_managed_credentials(
      &authorized.config,
      &authorized.profiles,
      &authorized.candidates,
      &self.managed_token_providers,
    )
    .await?;
    let request = llm_adapter::router::ExecutableRequest::Embedding(llm_adapter::core::EmbeddingRequest {
      model: target.model_id,
      inputs,
      dimensions: Some(1024),
      task_type: Some(task_type.to_string()),
    });
    let config = authorized.config;
    let slot = authorized.slot;
    let profiles = authorized.profiles;
    let candidates = authorized.candidates;
    tokio::task::spawn_blocking(move || {
      dispatch::execute_embeddings(config, slot, request, profiles, candidates, managed_credentials)
    })
    .await
    .map_err(|error| RuntimeError::invalid_state(format!("embedding execution task failed: {error}")))?
  }
}

fn target_from_route(authorized: &AuthorizedCopilotRoute) -> RuntimeResult<EmbeddingTarget> {
  let candidate = authorized
    .candidates
    .first()
    .ok_or_else(|| RuntimeError::invalid_state("embedding_route_unavailable"))?;
  let profile = authorized
    .profiles
    .get(candidate.profile_index)
    .ok_or_else(|| RuntimeError::invalid_state("invalid embedding route profile"))?;
  let model = profile
    .models
    .get(candidate.model_index)
    .ok_or_else(|| RuntimeError::invalid_state("invalid embedding route model"))?;
  let route_source = match profile.source {
    route::ProfileSource::Server => "byok",
    route::ProfileSource::Managed => "managed",
    route::ProfileSource::Local => return Err(RuntimeError::invalid_state("embedding_route_unavailable")),
  };
  let endpoint_fingerprint = hex::encode(Sha256::digest(format!("{:?}", profile.endpoint).as_bytes()));
  let identity = format!(
    "{route_source}|{}|{endpoint_fingerprint}|{}|1024|cosine|1",
    profile.provider, model.model_id
  );
  Ok(EmbeddingTarget {
    fingerprint: hex::encode(Sha256::digest(identity.as_bytes())),
    route_source,
    provider: profile.provider.clone(),
    model_id: model.model_id.clone(),
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
    let managed_credentials = self
      .resolve_managed_credentials(&authorized.config, &authorized.profiles, &authorized.candidates)
      .await?;
    Ok((
      authorized.config,
      authorized.slot,
      request,
      authorized.profiles,
      authorized.candidates,
      managed_credentials,
    ))
  }

  async fn resolve_managed_credentials(
    &self,
    config: &BackendRuntimeConfig,
    profiles: &[AuthorizedProviderProfile],
    candidates: &[AuthorizedTargetRef],
  ) -> RuntimeResult<HashMap<String, Zeroizing<String>>> {
    resolve_managed_credentials(config, profiles, candidates, &self.managed_token_providers).await
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
            && profile.models.iter().any(|model| model.model_id == model_id)
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
      deployment: config.deployment,
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

async fn resolve_managed_credentials(
  config: &BackendRuntimeConfig,
  profiles: &[AuthorizedProviderProfile],
  candidates: &[AuthorizedTargetRef],
  cache: &ManagedTokenProviderCache,
) -> RuntimeResult<HashMap<String, Zeroizing<String>>> {
  let mut credentials = HashMap::new();
  for candidate in candidates {
    let profile = profiles
      .get(candidate.profile_index)
      .ok_or_else(|| RuntimeError::invalid_state("invalid authorized route profile"))?;
    let CredentialRef::Managed { profile_id } = &profile.credential_ref else {
      continue;
    };
    if credentials.contains_key(profile_id) {
      continue;
    }
    let managed = context::managed_profile(&config.copilot, profile_id)?;
    let token_provider = if matches!(managed.provider.as_str(), "geminiVertex" | "anthropicVertex") {
      Some(managed_token_provider(managed, cache).await?)
    } else {
      None
    };
    credentials.insert(
      profile_id.clone(),
      Zeroizing::new(dispatch::managed_credential(managed, token_provider).await?),
    );
  }
  Ok(credentials)
}

async fn managed_token_provider(
  profile: &CopilotManagedProfileConfig,
  cache: &ManagedTokenProviderCache,
) -> RuntimeResult<Arc<dyn TokenProvider>> {
  let config = serde_json::to_vec(&profile.config)
    .map_err(|error| RuntimeError::json("serialize managed Vertex profile failed", error))?;
  let cache_key = format!(
    "{}:{}:{}",
    profile.id,
    profile.provider,
    hex::encode(Sha256::digest(config))
  );
  let cell = {
    let mut providers = cache
      .write()
      .map_err(|_| RuntimeError::invalid_state("managed token provider cache lock poisoned"))?;
    Arc::clone(providers.entry(cache_key).or_insert_with(|| Arc::new(OnceCell::new())))
  };
  cell
    .get_or_try_init(|| dispatch::create_vertex_token_provider(profile))
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
