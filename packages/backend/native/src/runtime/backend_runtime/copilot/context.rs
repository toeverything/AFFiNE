use sqlx::{FromRow, PgPool, Row};

use super::super::{LocalLeasePayload, RuntimeError, RuntimeResult, token_hash};
use crate::{
  llm::{
    CopilotAccessProjection,
    byok::{ByokPolicy, ByokProfileDefinition, local_aad, server_aad},
    route::{self, AuthorizedProviderProfile, CatalogSlot, CredentialRef, ProfileSource, ResolvedManagedTarget},
  },
  runtime::{BackendRuntimeConfig, CopilotRuntimeConfig},
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
  pub(super) workspace_id: Option<&'a str>,
  pub(super) user_id: Option<&'a str>,
  pub(super) local_lease_id: Option<&'a str>,
  pub(super) access: &'a CopilotAccessProjection,
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
        CredentialRef {
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
          CredentialRef {
            encrypted: provider.encrypted_credential,
            aad,
          },
        )
      })
      .collect(),
  )
}

pub(super) fn load_managed_target(
  config: &CopilotRuntimeConfig,
  slot: &CatalogSlot,
  built_in_route_id: Option<&str>,
  managed_tier: route::CopilotManagedTier,
  managed_target_id: Option<&str>,
) -> RuntimeResult<Option<ResolvedManagedTarget>> {
  let target = if let Some(target_id) = managed_target_id {
    route::managed_selected_target(built_in_route_id, target_id, managed_tier)
      .ok_or_else(|| RuntimeError::invalid_input("managed_target_unavailable"))?
  } else if let Some(target) =
    route::managed_targets(slot, built_in_route_id, managed_tier).and_then(|targets| targets.into_iter().next())
  {
    target
  } else {
    return Ok(None);
  };
  Ok(config.managed_binding(&target, slot.operation.into()).cloned())
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
  AuthorizedProviderProfile {
    profile_id,
    source,
    provider,
    endpoint: definition.endpoint,
    egress_policy,
    models: definition.models,
    sort_order,
    credential_ref,
  }
}

#[cfg(test)]
mod tests {
  use std::sync::Arc;

  use serde_json::json;
  use zeroize::Zeroizing;

  use super::*;
  use crate::runtime::Deployment;

  fn load(config: &CopilotRuntimeConfig, target: &str) -> ResolvedManagedTarget {
    load_managed_target(
      config,
      &route::slot("chat.default").unwrap(),
      Some("Chat With AFFiNE AI"),
      route::CopilotManagedTier::Premium,
      Some(target),
    )
    .unwrap()
    .unwrap()
  }

  #[test]
  fn managed_routes_bind_api_shapes_and_profile_preferences() {
    let mut copilot: CopilotRuntimeConfig = serde_json::from_value(json!({
      "enabled": true,
      "providers": { "profiles": [
        { "id": "gateway", "type": "openrouter", "config": { "apiKey": "gateway-key" } },
        { "id": "openai", "type": "openai", "models": ["stale-model"], "config": { "apiKey": "old-key" } },
        { "id": "google", "type": "gemini", "models": ["unknown-future-model"], "config": { "apiKey": "test" } },
        { "id": "official", "type": "anthropic", "models": ["claude-sonnet-4.6"], "config": { "apiKey": "test" } },
        { "id": "vertex", "type": "anthropicVertex", "config": { "project": "test", "location": "global" } }
      ] }
    }))
    .unwrap();
    copilot.initialize_managed_routes().unwrap();
    for (id, service, model) in [
      ("luna", "openrouter", "openai/gpt-6-luna"),
      ("terra", "openrouter", "openai/gpt-6.1-terra"),
      ("gemini", "gemini", "gemini-3.8-flash"),
      ("claude", "anthropicVertex", "claude-sonnet-4-6"),
    ] {
      let selected = load(&copilot, id);
      assert_eq!(selected.provider.as_str(), service);
      assert_eq!(selected.target.wire_model(), model);
    }
    for binding in &copilot.managed_routes {
      use llm_adapter::{capability::ModelOutput, target::BackendOperation};
      assert!(!binding.resolved.capabilities.is_empty());
      for capability in &binding.resolved.capabilities {
        assert!(capability.output.iter().all(|output| match binding.operation {
          BackendOperation::Chat => matches!(output, ModelOutput::Text | ModelOutput::Object),
          BackendOperation::Structured => *output == ModelOutput::Structured,
          BackendOperation::Embedding => *output == ModelOutput::Embedding,
          BackendOperation::Rerank => *output == ModelOutput::Rerank,
          BackendOperation::Image => *output == ModelOutput::Image,
        }));
        if !matches!(binding.operation, BackendOperation::Chat | BackendOperation::Structured) {
          assert!(capability.features.is_empty());
        }
      }
    }
    copilot.providers.profiles[1].config["openaiDialect"] = json!("chat_completions");
    copilot.providers.profiles.swap(0, 1);
    copilot.initialize_managed_routes().unwrap();
    assert_eq!(load(&copilot, "luna").profile_id, "gateway");
    copilot.providers.profiles.swap(0, 1);
    copilot.providers.profiles[1]
      .config
      .as_object_mut()
      .unwrap()
      .remove("openaiDialect");
    copilot.providers.profiles.push(
      serde_json::from_value(json!({
        "id": "vertex-alias", "type": "anthropicVertex", "models": ["claude-sonnet-4-6"],
        "config": { "project": "test", "location": "global" }
      }))
      .unwrap(),
    );
    copilot.initialize_managed_routes().unwrap();
    assert_eq!(load(&copilot, "claude").profile_id, "vertex-alias");
    copilot.providers.profiles.push(
      serde_json::from_value(json!({
        "id": "pinned", "type": "openai", "models": ["gpt-6-luna"], "config": { "apiKey": "pinned-key" }
      }))
      .unwrap(),
    );
    copilot.initialize_managed_routes().unwrap();
    assert_eq!(load(&copilot, "luna").profile_id, "pinned");
    copilot.providers.profiles[0].models.push("gpt-6-luna".into());
    copilot.initialize_managed_routes().unwrap();
    assert_eq!(load(&copilot, "luna").profile_id, "gateway");
    copilot.providers.profiles[0].enabled = false;
    copilot.providers.profiles[1].models.push("gpt-6-luna".into());
    copilot.initialize_managed_routes().unwrap();
    assert_eq!(load(&copilot, "luna").profile_id, "openai");
    let pinned = copilot.providers.profiles.len() - 1;
    copilot.providers.profiles.swap(1, pinned);
    copilot.initialize_managed_routes().unwrap();
    assert_eq!(load(&copilot, "luna").profile_id, "pinned");
    let frozen = load(&copilot, "luna");
    copilot.providers.profiles[1].config["apiKey"] = json!("new-key");
    assert_eq!(load(&copilot, "luna").credential_config["apiKey"], "pinned-key");
    copilot.initialize_managed_routes().unwrap();
    assert_eq!(load(&copilot, "luna").credential_config["apiKey"], "new-key");
    assert_eq!(frozen.credential_config["apiKey"], "pinned-key");
    copilot.providers.profiles[1].config["apiKey"] = json!("");
    assert!(copilot.initialize_managed_routes().is_err());
    assert_eq!(load(&copilot, "luna").credential_config["apiKey"], "new-key");
    copilot.providers.profiles.retain(|profile| profile.id == "openai");
    copilot.initialize_managed_routes().unwrap();
    let mut config = BackendRuntimeConfig {
      database_url: "postgresql://unused".into(),
      auth: Default::default(),
      invite_quota: Default::default(),
      private_key: Arc::new(Zeroizing::new(String::new())),
      deployment: Deployment::Cloud,
      copilot,
      search: Default::default(),
      redis: Default::default(),
      payment: Default::default(),
    };
    let options = super::super::options::route_options(&config, "Chat With AFFiNE AI").unwrap();
    assert_eq!(
      options
        .choices
        .iter()
        .map(|choice| choice.id.as_str())
        .collect::<Vec<_>>(),
      ["luna", "terra"]
    );
    assert_eq!(options.standard_default_target_id.as_deref(), Some("luna"));
    assert_eq!(options.premium_default_target_id.as_deref(), Some("luna"));
    config.copilot.providers.profiles[0].config["openaiDialect"] = json!("chat_completions");
    config.copilot.initialize_managed_routes().unwrap();
    assert!(
      load_managed_target(
        &config.copilot,
        &route::slot("chat.default").unwrap(),
        Some("Chat With AFFiNE AI"),
        route::CopilotManagedTier::Premium,
        Some("luna")
      )
      .unwrap()
      .is_none()
    );
    let frozen_options = super::super::options::route_options(&config, "Chat With AFFiNE AI").unwrap();
    config.copilot.providers.profiles.clear();
    assert_eq!(
      super::super::options::route_options(&config, "Chat With AFFiNE AI")
        .unwrap()
        .choices
        .len(),
      frozen_options.choices.len()
    );
    config.copilot.initialize_managed_routes().unwrap();
    let options = super::super::options::route_options(&config, "Chat With AFFiNE AI").unwrap();
    assert!(options.choices.is_empty());
    assert!(options.standard_default_target_id.is_none());
    assert!(options.premium_default_target_id.is_none());
    config.deployment = Deployment::SelfHosted;
    assert!(
      super::super::options::route_options(&config, "Chat With AFFiNE AI")
        .unwrap()
        .choices
        .is_empty()
    );
  }

  #[test]
  fn managed_embedding_endpoints_preserve_persisted_fingerprints() {
    for (provider, config, endpoint, fingerprint) in [
      (
        "gemini",
        json!({"apiKey": "test"}),
        "https://generativelanguage.googleapis.com/v1beta",
        "f8e2b5973b9bdb9430eb770bf13e08f759c9c4cbded97dbfea4c01050d32aef1",
      ),
      (
        "gemini",
        json!({"apiKey": "test", "baseURL": "https://custom.example/v1"}),
        "https://custom.example/v1",
        "47ab6847e37db8d443a5482402964bba977301e37f7ebbf065988f765c0327b6",
      ),
      (
        "geminiVertex",
        json!({"project": "affine-us", "location": "global"}),
        "https://aiplatform.googleapis.com/v1/projects/affine-us/locations/global/publishers/google",
        "f9a42da40743503700bd4806b2c337d1ebc5d4a3499b97db7956a2401e9c2fec",
      ),
      (
        "geminiVertex",
        json!({"project": "affine-us", "location": "us-central1"}),
        "https://us-central1-aiplatform.googleapis.com/v1/projects/affine-us/locations/us-central1/publishers/google",
        "0945a331a8d982aca94191af38496db3048920c0a0b7294883af103c92089da5",
      ),
    ] {
      let mut copilot: CopilotRuntimeConfig = serde_json::from_value(json!({
        "providers": { "profiles": [{ "id": "original", "type": provider, "config": config }] }
      }))
      .unwrap();
      for revision in 0..2 {
        copilot.providers.profiles[0].id = format!("profile-{revision}");
        if copilot.providers.profiles[0].config.get("apiKey").is_some() {
          copilot.providers.profiles[0].config["apiKey"] = json!(format!("key-{revision}"));
        }
        copilot.initialize_managed_routes().unwrap();
        let slot = route::slot("index.embedding").unwrap();
        let selected = load_managed_target(&copilot, &slot, None, route::CopilotManagedTier::Standard, None)
          .unwrap()
          .unwrap();
        assert_eq!(selected.target.endpoint(), endpoint);
        let authorized = super::super::AuthorizedCopilotRoute {
          config: Arc::new(BackendRuntimeConfig {
            database_url: "postgresql://unused".into(),
            auth: Default::default(),
            invite_quota: Default::default(),
            private_key: Arc::new(Zeroizing::new(String::new())),
            deployment: Deployment::Cloud,
            copilot: copilot.clone(),
            search: Default::default(),
            redis: Default::default(),
            payment: Default::default(),
          }),
          slot,
          profiles: vec![],
          targets: route::AuthorizedRouteTargets::Managed(selected),
        };
        assert_eq!(
          super::super::target_from_route(&authorized).unwrap().fingerprint,
          fingerprint
        );
      }
    }
  }
}
