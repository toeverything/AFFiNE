use llm_adapter::capability::provider_default_capability_upper_bound;
use sqlx::{FromRow, PgPool, Row};

use super::super::{LocalLeasePayload, RuntimeError, RuntimeResult, token_hash};
use crate::{
  llm::{
    CopilotAccessProjection,
    byok::{ByokEndpoint, ByokModelDeclaration, ByokProfileDefinition, local_aad, server_aad},
    route::{self, AuthorizedProfileRef, CatalogSlot, CredentialRef, ProfileSource},
  },
  runtime::{CopilotManagedProfileConfig, CopilotRuntimeConfig},
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
  config: &CopilotRuntimeConfig,
  input: ProfileLoadInput<'_>,
) -> RuntimeResult<Vec<AuthorizedProfileRef>> {
  let mut profiles = Vec::new();
  if let Some(workspace_id) = input.workspace_id
    && input.access.server_byok
  {
    profiles.extend(load_server_profiles(pool, workspace_id).await?);
  }
  if let (Some(workspace_id), Some(user_id), Some(lease_id)) = (input.workspace_id, input.user_id, input.local_lease_id)
    && input.access.local_byok
  {
    profiles.extend(load_local_profiles(pool, workspace_id, user_id, lease_id).await?);
  }
  profiles.extend(load_managed_profiles(
    config,
    input.slot,
    input.built_in_route_id,
    input.access.managed_tier,
    input.managed_target_id,
  )?);
  Ok(profiles)
}

async fn load_server_profiles(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<AuthorizedProfileRef>> {
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
      let definition: ByokProfileDefinition = serde_json::from_value(row.definition)
        .map_err(|error| RuntimeError::json("invalid stored BYOK definition", error))?;
      let aad = server_aad(
        &row.workspace_id,
        &row.id,
        &row.provider,
        definition.endpoint_identity(),
      );
      Ok(AuthorizedProfileRef {
        profile_id: row.id,
        source: ProfileSource::Server,
        provider: row.provider,
        definition,
        sort_order: row.sort_order,
        credential_ref: CredentialRef::Envelope {
          encrypted: row.encrypted_api_key,
          aad,
        },
      })
    })
    .collect()
}

async fn load_local_profiles(
  pool: &PgPool,
  workspace_id: &str,
  user_id: &str,
  lease_id: &str,
) -> RuntimeResult<Vec<AuthorizedProfileRef>> {
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
  if payload.version != 1 || payload.workspace_id != workspace_id || payload.user_id != user_id {
    return Ok(Vec::new());
  }
  Ok(
    payload
      .providers
      .into_iter()
      .enumerate()
      .filter(|(_, provider)| provider.enabled)
      .map(|(index, provider)| {
        let aad = local_aad(
          workspace_id,
          user_id,
          lease_id,
          index,
          &provider.provider,
          provider.definition.endpoint_identity(),
        );
        AuthorizedProfileRef {
          profile_id: format!("{lease_id}:{index}"),
          source: ProfileSource::Local,
          provider: provider.provider,
          definition: provider.definition,
          sort_order: index as i32,
          credential_ref: CredentialRef::Envelope {
            encrypted: provider.encrypted_credential,
            aad,
          },
        }
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
) -> RuntimeResult<Vec<AuthorizedProfileRef>> {
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
      let [profile] = matches.as_slice() else {
        return Err(RuntimeError::invalid_state(if matches.is_empty() {
          "built-in managed route model is unavailable"
        } else {
          "built-in managed route model matches multiple profiles"
        }));
      };
      let capabilities = provider_default_capability_upper_bound(&profile.provider, model_id)
        .ok_or_else(|| RuntimeError::invalid_state("built-in managed route model is incompatible with its profile"))?;
      Ok(AuthorizedProfileRef {
        profile_id: profile.id.clone(),
        source: ProfileSource::Managed,
        provider: profile.provider.clone(),
        definition: ByokProfileDefinition {
          version: 1,
          endpoint: managed_endpoint(profile)?,
          models: vec![ByokModelDeclaration {
            model_id: model_id.clone(),
            enabled: true,
            capabilities,
          }],
        },
        sort_order: index as i32,
        credential_ref: CredentialRef::Managed {
          profile_id: profile.id.clone(),
        },
      })
    })
    .collect()
}

fn managed_endpoint(profile: &CopilotManagedProfileConfig) -> RuntimeResult<ByokEndpoint> {
  if let Some(base_url) = profile.config.get("baseURL").and_then(serde_json::Value::as_str) {
    return Ok(ByokEndpoint::Custom {
      url: llm_adapter::target::canonicalize_endpoint(base_url)
        .map_err(|error| RuntimeError::invalid_state(error.to_string()))?,
    });
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
      format!(
        "https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/{publisher}"
      )
    }
    "cloudflareWorkersAi" => format!(
      "https://api.cloudflare.com/client/v4/accounts/{}/ai",
      required_config_text(profile, "accountId")?
    ),
    _ => return Ok(ByokEndpoint::ProviderDefault),
  };
  Ok(ByokEndpoint::Custom { url: endpoint })
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
