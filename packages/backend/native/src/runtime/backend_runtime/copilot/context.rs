use llm_adapter::{
  capability::provider_default_capability_upper_bound,
  target::{BackendEndpoint, OpenAiDialect},
};
use sqlx::{FromRow, PgPool, Row};

use super::super::{LocalLeasePayload, RuntimeError, RuntimeResult, token_hash};
use crate::{
  llm::{
    CopilotAccessProjection,
    byok::{ByokEndpoint, ByokPolicy, ByokProfileDefinition, local_aad, server_aad},
    route::{self, AuthorizedProviderProfile, CatalogSlot, CredentialRef, ProfileSource},
  },
  runtime::{BackendRuntimeConfig, CopilotManagedProfileConfig, CopilotRuntimeConfig},
};

#[derive(FromRow)]
struct ServerProfileRow {
  id: String,
  workspace_id: String,
  provider: String,
  encrypted_api_key: String,
  definition: serde_json::Value,
  sort_order: i32,
}

pub(super) struct ProfileLoadInput<'a> {
  pub(super) slot: &'a CatalogSlot,
  pub(super) built_in_route_id: Option<&'a str>,
  pub(super) workspace_id: Option<&'a str>,
  pub(super) user_id: Option<&'a str>,
  pub(super) local_lease_id: Option<&'a str>,
  pub(super) access: &'a CopilotAccessProjection,
  pub(super) managed_target_id: Option<&'a str>,
}

pub(super) async fn load_profiles(
  pool: &PgPool,
  config: &BackendRuntimeConfig,
  input: ProfileLoadInput<'_>,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let mut profiles = Vec::new();
  let policy = config.byok_policy();
  if let Some(workspace_id) = input.workspace_id
    && input.access.server_byok
  {
    profiles.extend(load_server_profiles(pool, workspace_id, &policy).await?);
  }
  if let (Some(workspace_id), Some(user_id), Some(lease_id)) = (input.workspace_id, input.user_id, input.local_lease_id)
    && input.access.local_byok
  {
    profiles.extend(load_local_profiles(pool, workspace_id, user_id, lease_id, &policy).await?);
  }
  profiles.extend(load_managed_profiles(
    &config.copilot,
    input.slot,
    input.built_in_route_id,
    input.access.managed_tier,
    input.managed_target_id,
  )?);
  Ok(profiles)
}

async fn load_server_profiles(
  pool: &PgPool,
  workspace_id: &str,
  policy: &ByokPolicy,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let rows = sqlx::query_as::<_, ServerProfileRow>(
    r#"
    SELECT id, workspace_id, provider, encrypted_api_key, definition, sort_order
    FROM ai_workspace_byok_configs
    WHERE workspace_id = $1 AND enabled = TRUE
    ORDER BY sort_order ASC, created_at ASC
    "#,
  )
  .bind(workspace_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load authorized BYOK profiles failed", error))?;
  rows
    .into_iter()
    .map(|row| {
      let definition = serde_json::from_value::<ByokProfileDefinition>(row.definition)
        .map_err(|error| RuntimeError::json("invalid stored BYOK definition", error))?;
      if !policy.allows(&row.provider, &definition.endpoint) {
        return Ok(None);
      }
      let aad = server_aad(
        &row.workspace_id,
        &row.id,
        &row.provider,
        definition.endpoint_identity(),
      );
      Ok(Some(authorized_byok_profile(
        row.id,
        ProfileSource::Server,
        row.provider,
        definition,
        policy,
        row.sort_order,
        CredentialRef::Envelope {
          encrypted: row.encrypted_api_key,
          aad,
        },
      )))
    })
    .collect::<RuntimeResult<Vec<_>>>()
    .map(|profiles| profiles.into_iter().flatten().collect())
}

async fn load_local_profiles(
  pool: &PgPool,
  workspace_id: &str,
  user_id: &str,
  lease_id: &str,
  policy: &ByokPolicy,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let payload = sqlx::query(
    r#"
    SELECT payload
    FROM runtime_states
    WHERE purpose = 'copilot_byok_local_lease' AND token_hash = $1
      AND consumed_at IS NULL AND expires_at > clock_timestamp()
    "#,
  )
  .bind(token_hash(lease_id))
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load BYOK local lease failed", error))?
  .map(|row| row.get::<serde_json::Value, _>("payload"));
  let Some(payload) = payload else {
    return Ok(Vec::new());
  };
  let payload: LocalLeasePayload =
    serde_json::from_value(payload).map_err(|error| RuntimeError::json("invalid BYOK local lease", error))?;
  if payload.workspace_id != workspace_id || payload.user_id != user_id {
    return Ok(Vec::new());
  }
  Ok(
    payload
      .providers
      .into_iter()
      .enumerate()
      .filter(|(_, provider)| provider.enabled && policy.allows(&provider.provider, &provider.definition.endpoint))
      .map(|(index, provider)| {
        let aad = local_aad(
          workspace_id,
          user_id,
          lease_id,
          index,
          &provider.provider,
          provider.definition.endpoint_identity(),
        );
        authorized_byok_profile(
          format!("{lease_id}:{index}"),
          ProfileSource::Local,
          provider.provider,
          provider.definition,
          policy,
          index as i32,
          CredentialRef::Envelope {
            encrypted: provider.encrypted_credential,
            aad,
          },
        )
      })
      .collect(),
  )
}

fn load_managed_profiles(
  config: &CopilotRuntimeConfig,
  slot: &CatalogSlot,
  built_in_route_id: Option<&str>,
  managed_tier: route::CopilotManagedTier,
  managed_target_id: Option<&str>,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let targets = if let Some(target_id) = managed_target_id {
    vec![
      route::managed_selected_target(built_in_route_id, target_id, managed_tier)
        .ok_or_else(|| RuntimeError::invalid_input("managed_target_unavailable"))?,
    ]
  } else if let Some(targets) = route::managed_targets(slot, built_in_route_id, managed_tier) {
    targets
  } else {
    return Ok(Vec::new());
  };
  targets
    .iter()
    .enumerate()
    .map(|(index, model_id)| {
      let matches = config
        .providers
        .profiles
        .iter()
        .filter(|profile| profile.enabled && profile.models.iter().any(|model| model == model_id))
        .collect::<Vec<_>>();
      let Some(profile) = matches.first() else {
        return Ok(None);
      };
      if matches.len() > 1 {
        return Err(RuntimeError::invalid_state(
          "built-in managed route model matches multiple profiles",
        ));
      }
      let capabilities = provider_default_capability_upper_bound(&profile.provider, model_id)
        .ok_or_else(|| RuntimeError::invalid_state("built-in managed route model is incompatible with its profile"))?;
      let endpoint = managed_endpoint(profile)?;
      Ok(Some(AuthorizedProviderProfile {
        profile_id: profile.id.clone(),
        source: ProfileSource::Managed,
        provider: profile.provider.clone(),
        endpoint,
        openai_dialect: (profile.provider == "openai").then_some(OpenAiDialect::Responses),
        egress_policy: llm_adapter::target::EgressPolicy::PublicOnly,
        models: vec![crate::llm::byok::ByokModelDeclaration {
          model_id: model_id.clone(),
          enabled: true,
          capabilities,
        }],
        sort_order: index as i32,
        credential_ref: CredentialRef::Managed {
          profile_id: profile.id.clone(),
        },
      }))
    })
    .filter_map(|profile| profile.transpose())
    .collect()
}

fn managed_endpoint(profile: &CopilotManagedProfileConfig) -> RuntimeResult<BackendEndpoint> {
  if let Some(base_url) = profile.config.get("baseURL").and_then(serde_json::Value::as_str) {
    return llm_adapter::target::canonicalize_endpoint(base_url)
      .map(BackendEndpoint::Custom)
      .map_err(|error| RuntimeError::invalid_state(error.to_string()));
  }
  let endpoint = match profile.provider.as_str() {
    "geminiVertex" | "anthropicVertex" => {
      let location = required_config_text(profile, "location")?;
      let project = required_config_text(profile, "project")?;
      let publisher = if profile.provider == "geminiVertex" {
        "google"
      } else {
        "anthropic"
      };
      let host = if location == "global" {
        "aiplatform.googleapis.com".to_string()
      } else {
        format!("{location}-aiplatform.googleapis.com")
      };
      format!("https://{host}/v1/projects/{project}/locations/{location}/publishers/{publisher}")
    }
    "cloudflareWorkersAi" => format!(
      "https://api.cloudflare.com/client/v4/accounts/{}/ai",
      required_config_text(profile, "accountId")?
    ),
    _ => return Ok(BackendEndpoint::ProviderDefault),
  };
  Ok(BackendEndpoint::Custom(endpoint))
}

fn authorized_byok_profile(
  profile_id: String,
  source: ProfileSource,
  provider: String,
  definition: ByokProfileDefinition,
  policy: &ByokPolicy,
  sort_order: i32,
  credential_ref: CredentialRef,
) -> AuthorizedProviderProfile {
  let egress_policy = policy.egress_policy(&definition.endpoint);
  let (endpoint, openai_dialect) = match definition.endpoint {
    ByokEndpoint::ProviderDefault => (BackendEndpoint::ProviderDefault, None),
    ByokEndpoint::OpenAiCompatible { url, dialect } => (BackendEndpoint::Custom(url), Some(dialect)),
  };
  AuthorizedProviderProfile {
    profile_id,
    source,
    provider,
    endpoint,
    openai_dialect,
    egress_policy,
    models: definition.models,
    sort_order,
    credential_ref,
  }
}

pub(super) fn managed_profile<'a>(
  config: &'a CopilotRuntimeConfig,
  profile_id: &str,
) -> RuntimeResult<&'a CopilotManagedProfileConfig> {
  config
    .providers
    .profiles
    .iter()
    .find(|profile| profile.id == profile_id && profile.enabled)
    .ok_or_else(|| RuntimeError::invalid_state("managed copilot credential unavailable"))
}

pub(super) fn required_config_text<'a>(
  profile: &'a CopilotManagedProfileConfig,
  field: &'static str,
) -> RuntimeResult<&'a str> {
  profile
    .config
    .get(field)
    .and_then(serde_json::Value::as_str)
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| RuntimeError::invalid_state(format!("managed copilot profile requires {field}")))
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{BackendEndpoint, CopilotManagedProfileConfig, managed_endpoint};

  fn vertex_profile(location: &str) -> CopilotManagedProfileConfig {
    CopilotManagedProfileConfig {
      id: "vertex".to_string(),
      provider: "geminiVertex".to_string(),
      enabled: true,
      models: vec!["gemini-3.7-flash".to_string()],
      config: json!({ "project": "affine-us", "location": location }),
    }
  }

  #[test]
  fn managed_vertex_endpoint_uses_global_host() {
    assert_eq!(
      managed_endpoint(&vertex_profile("global")).unwrap(),
      BackendEndpoint::Custom(
        "https://aiplatform.googleapis.com/v1/projects/affine-us/locations/global/publishers/google".to_string()
      )
    );
  }

  #[test]
  fn managed_vertex_endpoint_uses_regional_host() {
    assert_eq!(
      managed_endpoint(&vertex_profile("us-central1")).unwrap(),
      BackendEndpoint::Custom(
        "https://us-central1-aiplatform.googleapis.com/v1/projects/affine-us/locations/us-central1/publishers/google"
          .to_string()
      )
    );
  }
}
