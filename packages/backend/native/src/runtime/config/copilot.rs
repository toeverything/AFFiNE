use llm_adapter::capability::provider_default_capability_upper_bound;
use serde::Deserialize;
use serde_json::Map;

use super::{RuntimeError, RuntimeResult};

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) byok: CopilotByokRuntimeConfig,
  pub(crate) providers: CopilotProvidersRuntimeConfig,
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

pub(super) const MANAGED_PROFILE_REQUIREMENTS: [(&str, &[&str]); 7] = [
  ("openai", &["apiKey"]),
  ("anthropic", &["apiKey"]),
  ("gemini", &["apiKey"]),
  ("fal", &["apiKey"]),
  ("cloudflareWorkersAi", &["apiToken", "accountId"]),
  ("geminiVertex", &["project", "location"]),
  ("anthropicVertex", &["project", "location"]),
];

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
  pub(crate) provider: String,
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
pub(crate) struct CopilotManagedProfileConfigFile {
  id: String,
  #[serde(rename = "type")]
  provider: CopilotManagedProvider,
  display_name: Option<String>,
  priority: Option<f64>,
  #[serde(default = "enabled_by_default")]
  enabled: bool,
  models: Vec<String>,
  middleware: Option<CopilotProviderMiddlewareConfigFile>,
  config: CopilotManagedProviderSettingsFile,
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CopilotManagedProviderSettingsFile {
  #[serde(skip_serializing_if = "Option::is_none")]
  api_key: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  api_token: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  account_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  project: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  location: Option<String>,
  #[serde(rename = "baseURL", skip_serializing_if = "Option::is_none")]
  base_url: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  google_auth_options: Option<CopilotGoogleAuthOptionsFile>,
  #[serde(flatten)]
  additional: Map<String, serde_json::Value>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CopilotGoogleAuthOptionsFile {
  #[serde(skip_serializing_if = "Option::is_none")]
  credentials: Option<CopilotGoogleCredentialsFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotGoogleCredentialsFile {
  client_email: String,
  private_key: String,
  #[serde(flatten)]
  additional: Map<String, serde_json::Value>,
}

#[derive(Clone, Copy, Deserialize, serde::Serialize, schemars::JsonSchema)]
enum CopilotManagedProvider {
  #[serde(rename = "anthropic")]
  Anthropic,
  #[serde(rename = "anthropicVertex")]
  AnthropicVertex,
  #[serde(rename = "cloudflareWorkersAi")]
  CloudflareWorkersAi,
  #[serde(rename = "fal")]
  Fal,
  #[serde(rename = "gemini")]
  Gemini,
  #[serde(rename = "geminiVertex")]
  GeminiVertex,
  #[serde(rename = "openai")]
  OpenAi,
}

impl CopilotManagedProvider {
  fn as_str(self) -> &'static str {
    match self {
      Self::Anthropic => "anthropic",
      Self::AnthropicVertex => "anthropicVertex",
      Self::CloudflareWorkersAi => "cloudflareWorkersAi",
      Self::Fal => "fal",
      Self::Gemini => "gemini",
      Self::GeminiVertex => "geminiVertex",
      Self::OpenAi => "openai",
    }
  }
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotProviderMiddlewareConfigFile {
  rust: Option<CopilotRustMiddlewareConfigFile>,
  node: Option<CopilotNodeMiddlewareConfigFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotRustMiddlewareConfigFile {
  request: Option<Vec<CopilotRustRequestMiddleware>>,
  stream: Option<Vec<CopilotRustStreamMiddleware>>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotNodeMiddlewareConfigFile {
  text: Option<Vec<CopilotNodeTextMiddleware>>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotRustRequestMiddleware {
  NormalizeMessages,
  ClampMaxTokens,
  ToolSchemaRewrite,
  OpenaiRequestCompat,
  OmitToolChoice,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotRustStreamMiddleware {
  StreamEventNormalize,
  CitationIndexing,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotNodeTextMiddleware {
  CitationFootnote,
  Callout,
  ThinkingFormat,
}

impl TryFrom<CopilotRuntimeConfigFile> for CopilotRuntimeConfig {
  type Error = RuntimeError;

  fn try_from(value: CopilotRuntimeConfigFile) -> Result<Self, Self::Error> {
    Ok(Self {
      enabled: value.enabled,
      byok: value.byok,
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
      provider: value.provider.as_str().to_string(),
      enabled: value.enabled,
      models: value.models,
      config: serde_json::to_value(value.config)
        .map_err(|error| RuntimeError::json("serialize managed copilot config failed", error))?,
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
  let mut managed_models = std::collections::HashMap::new();
  for profile in &config.providers.profiles {
    if profile.id.trim().is_empty() || !profile_ids.insert(profile.id.as_str()) {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile ids must be non-empty and unique",
      ));
    }
    if profile.provider.trim().is_empty() {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile provider is required",
      ));
    }
    if profile.models.is_empty() {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile models must be non-empty",
      ));
    }
    if profile.enabled {
      let required = MANAGED_PROFILE_REQUIREMENTS
        .iter()
        .find(|(provider, _)| *provider == profile.provider)
        .map(|(_, fields)| *fields)
        .ok_or_else(|| RuntimeError::invalid_state("unsupported managed copilot provider"))?;
      for field in required {
        if profile
          .config
          .get(*field)
          .and_then(serde_json::Value::as_str)
          .is_none_or(|value| value.trim().is_empty())
        {
          return Err(RuntimeError::invalid_state(format!(
            "managed copilot profile requires {field}"
          )));
        }
      }
      if let Some(base_url) = profile.config.get("baseURL").and_then(serde_json::Value::as_str) {
        llm_adapter::target::canonicalize_endpoint(base_url)
          .map_err(|error| RuntimeError::invalid_state(error.to_string()))?;
      }
      if let Some(credentials) = profile.config.pointer("/googleAuthOptions/credentials") {
        for field in ["client_email", "private_key"] {
          if credentials
            .get(field)
            .and_then(serde_json::Value::as_str)
            .is_none_or(|value| value.trim().is_empty())
          {
            return Err(RuntimeError::invalid_state(format!(
              "managed Vertex credentials require {field}"
            )));
          }
        }
      }
    }
    let mut models = std::collections::HashSet::new();
    for model in &profile.models {
      if model.trim().is_empty() || !models.insert(model.as_str()) {
        return Err(RuntimeError::invalid_state(
          "managed copilot profile models must be non-empty and unique",
        ));
      }
      provider_default_capability_upper_bound(&profile.provider, model)
        .ok_or_else(|| RuntimeError::invalid_state("managed copilot profile model is unsupported"))?;
      if profile.enabled
        && let Some(existing_profile) = managed_models.insert(model.as_str(), profile.id.as_str())
      {
        return Err(RuntimeError::invalid_state(format!(
          "managed copilot model {model} is assigned to both {existing_profile} and {}",
          profile.id
        )));
      }
    }
  }
  Ok(())
}
