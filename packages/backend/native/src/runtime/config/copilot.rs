mod routes;
use llm_adapter::{
  backend::{BackendProvider, backend_providers_config_schema},
  target::{BackendOperation, EgressPolicy},
};
pub(crate) use routes::ManagedRouteBinding;
use serde::Deserialize;

use super::{RuntimeError, RuntimeResult};
use crate::llm::route::{self, ManagedTarget, ResolvedManagedTarget};

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) byok: CopilotByokRuntimeConfig,
  pub(crate) providers: CopilotProvidersRuntimeConfig,
  #[serde(skip)]
  pub(crate) managed_routes: Vec<ManagedRouteBinding>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotByokRuntimeConfig {
  pub(crate) enabled: bool,
  #[serde(default = "default_allowed_providers")]
  pub(crate) allowed_providers: Vec<String>,
  pub(crate) allow_custom_endpoint: bool,
  pub(crate) allow_private_endpoint: bool,
}

impl Default for CopilotByokRuntimeConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      allowed_providers: default_allowed_providers(),
      allow_custom_endpoint: false,
      allow_private_endpoint: false,
    }
  }
}

pub(in crate::runtime) const SUPPORTED_BYOK_PROVIDERS: [&str; 4] = ["openai", "anthropic", "gemini", "fal"];

fn default_allowed_providers() -> Vec<String> {
  SUPPORTED_BYOK_PROVIDERS.into_iter().map(str::to_string).collect()
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotProvidersRuntimeConfig {
  pub(crate) profiles: Vec<CopilotManagedProfileConfig>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CopilotManagedProfileConfig {
  pub(crate) id: String,
  #[serde(rename = "type")]
  pub(crate) provider: BackendProvider,
  #[serde(default = "enabled_by_default")]
  pub(crate) enabled: bool,
  #[serde(default)]
  pub(crate) models: Vec<String>,
  pub(crate) config: serde_json::Value,
}

fn enabled_by_default() -> bool {
  true
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfigFile {
  pub(in crate::runtime) enabled: bool,
  pub(in crate::runtime) byok: CopilotByokRuntimeConfig,
  pub(in crate::runtime) providers: CopilotProvidersRuntimeConfigFile,
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(in crate::runtime) struct CopilotProvidersRuntimeConfigFile {
  pub(in crate::runtime) profiles: Vec<CopilotManagedProfileConfigFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(transform = managed_profile_schema)]
pub(crate) struct CopilotManagedProfileConfigFile {
  id: String,
  #[serde(rename = "type")]
  provider: BackendProvider,
  #[serde(default = "enabled_by_default")]
  enabled: bool,
  #[serde(default)]
  models: Vec<String>,
  config: serde_json::Map<String, serde_json::Value>,
}

fn managed_profile_schema(schema: &mut schemars::Schema) {
  schema.insert(
    "allOf".into(),
    serde_json::json!([{
      "if": { "properties": { "enabled": { "const": false } }, "required": ["enabled"] },
      "else": backend_providers_config_schema()
    }]),
  );
}

impl TryFrom<CopilotRuntimeConfigFile> for CopilotRuntimeConfig {
  type Error = RuntimeError;

  fn try_from(value: CopilotRuntimeConfigFile) -> Result<Self, Self::Error> {
    Ok(Self {
      enabled: value.enabled,
      byok: value.byok,
      managed_routes: Vec::new(),
      providers: CopilotProvidersRuntimeConfig {
        profiles: value
          .providers
          .profiles
          .into_iter()
          .map(TryInto::try_into)
          .collect::<RuntimeResult<_>>()?,
      },
    })
  }
}

impl TryFrom<CopilotManagedProfileConfigFile> for CopilotManagedProfileConfig {
  type Error = RuntimeError;

  fn try_from(value: CopilotManagedProfileConfigFile) -> Result<Self, Self::Error> {
    if value.id.is_empty()
      || !value
        .id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile id must contain only letters, numbers, hyphens, and underscores",
      ));
    }
    Ok(Self {
      id: value.id,
      provider: value.provider,
      enabled: value.enabled,
      models: value.models,
      config: serde_json::Value::Object(value.config),
    })
  }
}

pub(in crate::runtime) fn validate_copilot_config(config: &CopilotRuntimeConfig) -> RuntimeResult<()> {
  let mut allowed_providers = std::collections::HashSet::new();
  for provider in &config.byok.allowed_providers {
    if !SUPPORTED_BYOK_PROVIDERS.contains(&provider.as_str()) || !allowed_providers.insert(provider.as_str()) {
      return Err(RuntimeError::invalid_state(
        "copilot BYOK allowed providers must be supported and unique",
      ));
    }
  }
  let mut profile_ids = std::collections::HashSet::new();
  for profile in &config.providers.profiles {
    if profile.id.trim().is_empty() || !profile_ids.insert(profile.id.as_str()) {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile ids must be non-empty and unique",
      ));
    }
    if profile.enabled {
      llm_adapter::backend::validate_backend_config(profile.provider, &profile.config)
        .map_err(|error| RuntimeError::invalid_state(error.to_string()))?;
    }
  }
  Ok(())
}
