use std::{
  env, fs,
  path::{Path, PathBuf},
  sync::Arc,
};

use llm_adapter::capability::provider_default_capability_upper_bound;
use serde::Deserialize;
use serde_json::Map;
use sqlx::{PgPool, Row};
use zeroize::Zeroizing;

use super::{RuntimeError, RuntimeResult};
use crate::llm::byok::ByokPolicy;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Deployment {
  Cloud,
  SelfHosted,
}

pub(crate) struct BackendRuntimeConfig {
  pub(crate) database_url: String,
  pub(crate) auth: AuthRuntimeConfig,
  pub(crate) invite_quota: InviteQuotaConfig,
  pub(crate) private_key: Arc<Zeroizing<String>>,
  pub(crate) deployment: Deployment,
  pub(crate) copilot: CopilotRuntimeConfig,
  pub(crate) search: SearchRuntimeConfig,
  pub(crate) redis: RedisRuntimeConfig,
  pub(crate) payment: PaymentRuntimeConfig,
}

#[derive(Clone)]
pub(crate) struct AuthRuntimeConfig {
  pub(crate) allow_signup: bool,
  pub(crate) allow_signup_for_oauth: bool,
  pub(crate) require_email_domain_verification: bool,
  pub(crate) session_ttl_seconds: i64,
  pub(crate) session_ttr_seconds: i64,
  pub(crate) access_token_ttl_seconds: i64,
  pub(crate) refresh_idle_ttl_seconds: i64,
  pub(crate) refresh_absolute_ttl_seconds: i64,
  pub(crate) refresh_grace_seconds: i64,
  pub(crate) refresh_retention_seconds: i64,
  pub(crate) oauth: OAuthRuntimeConfig,
}

impl Default for AuthRuntimeConfig {
  fn default() -> Self {
    Self {
      allow_signup: true,
      allow_signup_for_oauth: true,
      require_email_domain_verification: false,
      session_ttl_seconds: 15 * 24 * 60 * 60,
      session_ttr_seconds: 7 * 24 * 60 * 60,
      access_token_ttl_seconds: 15 * 60,
      refresh_idle_ttl_seconds: 30 * 24 * 60 * 60,
      refresh_absolute_ttl_seconds: 180 * 24 * 60 * 60,
      refresh_grace_seconds: 30,
      refresh_retention_seconds: 30 * 24 * 60 * 60,
      oauth: OAuthRuntimeConfig::default(),
    }
  }
}

#[derive(Clone, Default)]
pub(crate) struct OAuthRuntimeConfig {
  pub(crate) providers: std::collections::BTreeMap<String, OAuthProviderRuntimeConfig>,
}

#[derive(Clone)]
pub(crate) struct OAuthProviderRuntimeConfig {
  pub(crate) client_id: String,
  pub(crate) client_secret: Arc<Zeroizing<String>>,
  pub(crate) args: std::collections::BTreeMap<String, String>,
  pub(crate) issuer: Option<String>,
  pub(crate) allow_private_network: bool,
  pub(crate) apple_private_key: Option<Arc<Zeroizing<String>>>,
  pub(crate) apple_key_id: Option<String>,
  pub(crate) apple_team_id: Option<String>,
}

#[derive(Clone, Default)]
pub(crate) struct PaymentRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) stripe: Option<StripeRuntimeConfig>,
  pub(crate) revenuecat: Option<RevenueCatRuntimeConfig>,
}

#[derive(Clone)]
pub(crate) struct StripeRuntimeConfig {
  pub(crate) api_key: Arc<Zeroizing<String>>,
  pub(crate) webhook_key: Arc<Zeroizing<String>>,
  pub(crate) account_id: String,
  pub(crate) live: bool,
}

#[derive(Clone)]
pub(crate) struct RevenueCatRuntimeConfig {
  pub(crate) api_key: Arc<Zeroizing<String>>,
  pub(crate) webhook_auth: Arc<Zeroizing<String>>,
  pub(crate) project_id: String,
  pub(crate) production: bool,
  pub(crate) product_map: std::collections::BTreeMap<String, PaymentProductConfig>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaymentProductConfig {
  pub(crate) plan: String,
  pub(crate) recurring: String,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct RedisRuntimeConfig {
  pub(crate) url: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct SearchRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) provider: String,
  pub(crate) endpoint: String,
  pub(crate) api_key: String,
  pub(crate) username: String,
  pub(crate) password: String,
}

impl Default for SearchRuntimeConfig {
  fn default() -> Self {
    Self {
      enabled: false,
      provider: "embedded".to_string(),
      endpoint: String::new(),
      api_key: String::new(),
      username: String::new(),
      password: String::new(),
    }
  }
}

#[derive(Clone, Debug)]
pub(crate) struct ConfigSource {
  exact_paths: Option<Vec<PathBuf>>,
  override_path: Option<PathBuf>,
}

impl Default for ConfigSource {
  fn default() -> Self {
    Self::new(None)
  }
}

impl ConfigSource {
  pub(crate) fn new(exact_paths: Option<Vec<String>>) -> Self {
    let override_path = exact_paths
      .is_none()
      .then(|| env::var("AFFINE_BACKEND_RUNTIME_CONFIG_PATH").ok())
      .flatten()
      .and_then(non_empty_string)
      .map(PathBuf::from);
    Self {
      exact_paths: exact_paths.map(|paths| {
        dedupe_paths(
          paths
            .into_iter()
            .filter(|path| !path.trim().is_empty())
            .map(PathBuf::from)
            .collect(),
        )
      }),
      override_path,
    }
  }

  pub(crate) fn paths(&self) -> Vec<PathBuf> {
    if let Some(paths) = &self.exact_paths {
      return paths.clone();
    }
    let mut paths = config_json_paths();
    if let Some(path) = &self.override_path {
      paths.push(path.clone());
    }
    dedupe_paths(paths)
  }

  pub(crate) fn exact(&self) -> bool {
    self.exact_paths.is_some()
  }

  pub(crate) fn required(&self, path: &Path) -> bool {
    self.exact() || self.override_path.as_deref() == Some(path)
  }
}

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

pub(super) const SUPPORTED_BYOK_PROVIDERS: [&str; 4] = ["openai", "anthropic", "gemini", "fal"];

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
  pub(super) enabled: bool,
  pub(super) byok: CopilotByokRuntimeConfig,
  pub(super) providers: CopilotProvidersRuntimeConfigFile,
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct CopilotProvidersRuntimeConfigFile {
  pub(super) profiles: Vec<CopilotManagedProfileConfigFile>,
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
  config: Map<String, serde_json::Value>,
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
      config: serde_json::Value::Object(value.config),
    })
  }
}

#[derive(Clone, Debug)]
pub(crate) struct InviteQuotaConfig {
  pub(crate) new_account_action_delay_seconds: i64,
}

impl Default for InviteQuotaConfig {
  fn default() -> Self {
    Self {
      new_account_action_delay_seconds: 24 * 60 * 60,
    }
  }
}

impl BackendRuntimeConfig {
  pub(crate) fn byok_policy(&self) -> ByokPolicy {
    ByokPolicy::from(self.deployment, &self.copilot.byok)
  }

  pub(crate) fn from_config_source_with_inline(
    private_key: Option<String>,
    source: &ConfigSource,
    inline_config: Option<&serde_json::Value>,
  ) -> RuntimeResult<Self> {
    let mut app_config_value = app_config_value_from_config_source(source)?;
    if let Some(inline_config) = inline_config {
      merge_config_value(&mut app_config_value, inline_config.clone());
    }
    let mut app_config = deserialize_app_config(app_config_value)?;
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    Self {
      database_url,
      auth: app_config.auth_runtime_config(),
      invite_quota: app_config.invite_quota_config(),
      private_key: Arc::new(Zeroizing::new(
        private_key
          .filter(|key| !key.trim().is_empty())
          .or_else(|| app_config.crypto.as_ref().and_then(|crypto| crypto.private_key.clone()))
          .or_else(private_key_from_env)
          .unwrap_or_default(),
      )),
      deployment: deployment_from_env(),
      copilot: app_config
        .copilot
        .take()
        .map(TryInto::try_into)
        .transpose()?
        .unwrap_or_default(),
      search: app_config.indexer.map(Into::into).unwrap_or_default(),
      redis: RedisRuntimeConfig::from_sources(app_config.redis.take())?,
      payment: PaymentRuntimeConfig::from_file(app_config.payment.take()),
    }
    .validated()
  }

  pub(crate) async fn with_db_overrides(
    &self,
    pool: &PgPool,
    source: &ConfigSource,
    inline_config: Option<&serde_json::Value>,
  ) -> RuntimeResult<Self> {
    let mut app_config_value = app_config_value_from_config_source(source)?;
    if let Some(inline_config) = inline_config {
      merge_config_value(&mut app_config_value, inline_config.clone());
    }
    let db_overrides = load_app_config_overrides_from_db(pool).await?;
    self.apply_db_overrides(app_config_value, db_overrides)
  }

  fn apply_db_overrides(
    &self,
    mut app_config_value: serde_json::Value,
    db_overrides: serde_json::Value,
  ) -> RuntimeResult<Self> {
    let db_private_key = db_overrides
      .pointer("/crypto/privateKey")
      .and_then(serde_json::Value::as_str)
      .map(str::to_string)
      .and_then(non_empty_string);
    merge_config_value(&mut app_config_value, db_overrides);
    let mut app_config = deserialize_app_config(app_config_value)?;
    Self {
      // The DB override is loaded after this connection already exists, so it
      // must not rewrite the active datasource URL.
      database_url: self.database_url.clone(),
      auth: app_config.auth_runtime_config(),
      invite_quota: app_config.invite_quota_config(),
      private_key: db_private_key
        .map(|key| Arc::new(Zeroizing::new(key)))
        .unwrap_or_else(|| Arc::clone(&self.private_key)),
      deployment: self.deployment,
      copilot: app_config
        .copilot
        .take()
        .map(TryInto::try_into)
        .transpose()?
        .unwrap_or_else(|| self.copilot.clone()),
      search: app_config
        .indexer
        .map(Into::into)
        .unwrap_or_else(|| self.search.clone()),
      redis: RedisRuntimeConfig::from_sources(app_config.redis.take())?.or_else(|| self.redis.clone()),
      payment: app_config
        .payment
        .take()
        .map(PaymentRuntimeConfig::from_file_value)
        .unwrap_or_else(|| self.payment.clone()),
    }
    .validated()
  }

  fn validated(self) -> RuntimeResult<Self> {
    if self.copilot.enabled && self.copilot.byok.enabled && self.private_key.is_empty() {
      return Err(RuntimeError::invalid_state(
        "stable crypto.privateKey is required when persistent BYOK is enabled",
      ));
    }
    validate_copilot_config(&self.copilot)?;
    self.payment.validate()?;
    Ok(self)
  }
}

pub(super) fn validate_copilot_config(config: &CopilotRuntimeConfig) -> RuntimeResult<()> {
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

fn deployment_from_env() -> Deployment {
  if env::var("DEPLOYMENT_TYPE").as_deref() == Ok("selfhosted") {
    Deployment::SelfHosted
  } else {
    Deployment::Cloud
  }
}

#[derive(Default, Deserialize)]
struct AppConfigFile {
  auth: Option<AuthConfigFile>,
  oauth: Option<OAuthConfigFile>,
  db: Option<DbConfigFile>,
  crypto: Option<CryptoConfigFile>,
  copilot: Option<CopilotRuntimeConfigFile>,
  indexer: Option<SearchRuntimeConfigFile>,
  redis: Option<RedisRuntimeConfigFile>,
  payment: Option<PaymentRuntimeConfigFile>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct PaymentRuntimeConfigFile {
  enabled: bool,
  stripe: StripeRuntimeConfigFile,
  revenuecat: RevenueCatRuntimeConfigFile,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct StripeRuntimeConfigFile {
  api_key: String,
  webhook_key: String,
  account_id: String,
  environment: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct RevenueCatRuntimeConfigFile {
  enabled: bool,
  api_key: String,
  webhook_auth: String,
  project_id: String,
  environment: String,
  product_map: std::collections::BTreeMap<String, PaymentProductConfig>,
}

impl PaymentRuntimeConfig {
  fn from_file(file: Option<PaymentRuntimeConfigFile>) -> Self {
    file.map(Self::from_file_value).unwrap_or_default()
  }

  fn from_file_value(file: PaymentRuntimeConfigFile) -> Self {
    let stripe = non_empty_string(file.stripe.api_key).map(|api_key| StripeRuntimeConfig {
      api_key: Arc::new(Zeroizing::new(api_key)),
      webhook_key: Arc::new(Zeroizing::new(file.stripe.webhook_key)),
      account_id: file.stripe.account_id,
      live: file.stripe.environment == "live",
    });
    let revenuecat = (file.revenuecat.enabled || !file.revenuecat.api_key.trim().is_empty()).then(|| {
      let mut product_map = std::collections::BTreeMap::from([
        (
          "app.affine.pro.Monthly".to_string(),
          PaymentProductConfig {
            plan: "pro".to_string(),
            recurring: "monthly".to_string(),
          },
        ),
        (
          "app.affine.pro.Annual".to_string(),
          PaymentProductConfig {
            plan: "pro".to_string(),
            recurring: "yearly".to_string(),
          },
        ),
        (
          "app.affine.pro.ai.Annual".to_string(),
          PaymentProductConfig {
            plan: "ai".to_string(),
            recurring: "yearly".to_string(),
          },
        ),
      ]);
      product_map.extend(file.revenuecat.product_map);
      RevenueCatRuntimeConfig {
        api_key: Arc::new(Zeroizing::new(file.revenuecat.api_key)),
        webhook_auth: Arc::new(Zeroizing::new(file.revenuecat.webhook_auth)),
        project_id: file.revenuecat.project_id,
        production: file.revenuecat.environment == "production",
        product_map,
      }
    });
    Self {
      enabled: file.enabled,
      stripe,
      revenuecat,
    }
  }

  fn validate(&self) -> RuntimeResult<()> {
    if self.enabled {
      let stripe = self
        .stripe
        .as_ref()
        .ok_or_else(|| RuntimeError::config("payment.stripe.apiKey is required when payment is enabled"))?;
      if stripe.account_id.trim().is_empty() || stripe.account_id != stripe.account_id.trim() {
        return Err(RuntimeError::config(
          "payment.stripe.accountId is required when payment is enabled",
        ));
      }
      if stripe.webhook_key.trim().is_empty() {
        return Err(RuntimeError::config(
          "payment.stripe.webhookKey is required when payment is enabled",
        ));
      }
    }
    if let Some(stripe) = &self.stripe {
      let expected_prefixes = if stripe.live {
        ["sk_live_", "rk_live_"]
      } else {
        ["sk_test_", "rk_test_"]
      };
      if !expected_prefixes
        .iter()
        .any(|prefix| stripe.api_key.starts_with(prefix))
      {
        return Err(RuntimeError::config(
          "payment.stripe.environment does not match the API key",
        ));
      }
    }
    if let Some(revenuecat) = &self.revenuecat {
      if revenuecat.api_key.is_empty() || revenuecat.project_id.trim().is_empty() {
        return Err(RuntimeError::config(
          "payment.revenuecat apiKey and projectId are required when RevenueCat is enabled",
        ));
      }
      for mapping in revenuecat.product_map.values() {
        if affine_core::access_control::Plan::parse(&mapping.plan).is_none()
          || affine_core::payment::SubscriptionRecurring::parse(&mapping.recurring).is_none()
        {
          return Err(RuntimeError::config("invalid payment.revenuecat productMap"));
        }
      }
    }
    Ok(())
  }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct RedisRuntimeConfigFile {
  host: String,
  port: u16,
  db: u8,
  username: String,
  password: String,
  ioredis: RedisIoRuntimeConfigFile,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct RedisIoRuntimeConfigFile {
  tls: Option<serde_json::Value>,
}

impl RedisRuntimeConfig {
  fn from_sources(file: Option<RedisRuntimeConfigFile>) -> RuntimeResult<Self> {
    if let Some(url) = env::var("REDIS_SERVER_URL").ok().and_then(non_empty_string) {
      let url = url::Url::parse(&url).map_err(|_| RuntimeError::config("invalid Redis URL"))?;
      return Ok(Self {
        url: Some(url.to_string()),
      });
    }
    let file = file.unwrap_or_default();
    let host = env::var("REDIS_SERVER_HOST")
      .ok()
      .and_then(non_empty_string)
      .or_else(|| non_empty_string(file.host));
    let Some(host) = host else {
      return Ok(Self::default());
    };
    let port = env::var("REDIS_SERVER_PORT")
      .ok()
      .and_then(|value| value.parse().ok())
      .unwrap_or(if file.port == 0 { 6379 } else { file.port });
    let db = env::var("REDIS_SERVER_DATABASE")
      .ok()
      .and_then(|value| value.parse::<u8>().ok())
      .unwrap_or(file.db);
    let username = env::var("REDIS_SERVER_USERNAME")
      .ok()
      .and_then(non_empty_string)
      .unwrap_or(file.username);
    let password = env::var("REDIS_SERVER_PASSWORD")
      .ok()
      .and_then(non_empty_string)
      .unwrap_or(file.password);
    let scheme = if file.ioredis.tls.is_some() { "rediss" } else { "redis" };
    let mut url = url::Url::parse(&format!("{scheme}://{host}:{port}/{db}"))
      .map_err(|_| RuntimeError::config("invalid Redis host"))?;
    if !username.is_empty() {
      let _ = url.set_username(&username);
    }
    if !password.is_empty() {
      let _ = url.set_password(Some(&password));
    }
    Ok(Self {
      url: Some(url.to_string()),
    })
  }

  fn or_else(self, fallback: impl FnOnce() -> Self) -> Self {
    if self.url.is_some() { self } else { fallback() }
  }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct AuthConfigFile {
  new_account_action_delay: Option<i64>,
  allow_signup: Option<bool>,
  allow_signup_for_oauth: Option<bool>,
  require_email_domain_verification: Option<bool>,
  session: AuthSessionConfigFile,
  token: AuthTokenConfigFile,
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct AuthSessionConfigFile {
  ttl: Option<i64>,
  ttr: Option<i64>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct AuthTokenConfigFile {
  access_token_ttl: Option<i64>,
  refresh_idle_ttl: Option<i64>,
  refresh_absolute_ttl: Option<i64>,
  refresh_grace_period: Option<i64>,
  refresh_retention: Option<i64>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct OAuthConfigFile {
  providers: std::collections::BTreeMap<String, OAuthProviderConfigFile>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct OAuthProviderConfigFile {
  client_id: String,
  client_secret: String,
  args: std::collections::BTreeMap<String, String>,
  issuer: String,
  allow_private_network: bool,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SearchRuntimeConfigFile {
  enabled: bool,
  provider: SearchProviderConfigFile,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SearchProviderConfigFile {
  #[serde(rename = "type")]
  provider: String,
  endpoint: String,
  api_key: String,
  username: String,
  password: String,
}

impl From<SearchRuntimeConfigFile> for SearchRuntimeConfig {
  fn from(value: SearchRuntimeConfigFile) -> Self {
    Self {
      enabled: value.enabled,
      provider: if value.provider.provider.is_empty() {
        "embedded".to_string()
      } else {
        value.provider.provider
      },
      endpoint: value.provider.endpoint,
      api_key: value.provider.api_key,
      username: value.provider.username,
      password: value.provider.password,
    }
  }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CryptoConfigFile {
  private_key: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbConfigFile {
  datasource_url: Option<String>,
}

impl AppConfigFile {
  fn database_url(&self) -> Option<String> {
    self
      .db
      .as_ref()
      .and_then(|db| db.datasource_url.clone())
      .and_then(non_empty_string)
  }

  fn invite_quota_config(&self) -> InviteQuotaConfig {
    let mut config = InviteQuotaConfig::default();
    if let Some(delay) = self.auth.as_ref().and_then(|auth| auth.new_account_action_delay) {
      config.new_account_action_delay_seconds = delay.max(0);
    }
    config
  }

  fn auth_runtime_config(&self) -> AuthRuntimeConfig {
    let mut config = AuthRuntimeConfig::default();
    if let Some(auth) = &self.auth {
      config.allow_signup = auth.allow_signup.unwrap_or(config.allow_signup);
      config.allow_signup_for_oauth = auth.allow_signup_for_oauth.unwrap_or(config.allow_signup_for_oauth);
      config.require_email_domain_verification = auth
        .require_email_domain_verification
        .unwrap_or(config.require_email_domain_verification);
      config.session_ttl_seconds = auth.session.ttl.unwrap_or(config.session_ttl_seconds);
      config.session_ttr_seconds = auth.session.ttr.unwrap_or(config.session_ttr_seconds);
      config.access_token_ttl_seconds = auth.token.access_token_ttl.unwrap_or(config.access_token_ttl_seconds);
      config.refresh_idle_ttl_seconds = auth.token.refresh_idle_ttl.unwrap_or(config.refresh_idle_ttl_seconds);
      config.refresh_absolute_ttl_seconds = auth
        .token
        .refresh_absolute_ttl
        .unwrap_or(config.refresh_absolute_ttl_seconds);
      config.refresh_grace_seconds = auth.token.refresh_grace_period.unwrap_or(config.refresh_grace_seconds);
      config.refresh_retention_seconds = auth.token.refresh_retention.unwrap_or(config.refresh_retention_seconds);
    }
    if let Some(oauth) = &self.oauth {
      for (name, provider) in &oauth.providers {
        if provider.client_id.trim().is_empty() {
          continue;
        }
        let mut args = provider.args.clone();
        let apple_private_key = args.remove("privateKey").map(|value| Arc::new(Zeroizing::new(value)));
        let apple_key_id = args.remove("keyId");
        let apple_team_id = args.remove("teamId");
        if provider.client_secret.trim().is_empty()
          && (name != "apple"
            || apple_private_key.is_none()
            || apple_key_id.as_deref().is_none_or(str::is_empty)
            || apple_team_id.as_deref().is_none_or(str::is_empty))
        {
          continue;
        }
        config.oauth.providers.insert(
          name.clone(),
          OAuthProviderRuntimeConfig {
            client_id: provider.client_id.clone(),
            client_secret: Arc::new(Zeroizing::new(provider.client_secret.clone())),
            args,
            issuer: non_empty_string(provider.issuer.clone()),
            allow_private_network: provider.allow_private_network,
            apple_private_key,
            apple_key_id,
            apple_team_id,
          },
        );
      }
    }
    config
  }
}

fn database_url_from_env() -> Option<String> {
  env::var("DATABASE_URL").ok().and_then(non_empty_string)
}

fn private_key_from_env() -> Option<String> {
  env::var("AFFINE_PRIVATE_KEY").ok().and_then(non_empty_string)
}

fn non_empty_string(value: String) -> Option<String> {
  if value.trim().is_empty() { None } else { Some(value) }
}

#[cfg(test)]
fn app_config_from_config_source(source: &ConfigSource) -> RuntimeResult<AppConfigFile> {
  deserialize_app_config(app_config_value_from_config_source(source)?)
}

fn app_config_value_from_config_source(source: &ConfigSource) -> RuntimeResult<serde_json::Value> {
  let mut merged = serde_json::Value::Object(Map::new());
  for path in source.paths() {
    if !path.exists() {
      if source.required(&path) {
        return Err(RuntimeError::config(format!(
          "config file does not exist: {}",
          path.display()
        )));
      }
      continue;
    }
    let raw = fs::read_to_string(&path).map_err(|err| RuntimeError::io("failed to read config file", err))?;
    let value = serde_json::from_str(&raw).map_err(|err| RuntimeError::json("failed to parse config file", err))?;
    merge_config_value(&mut merged, expand_module_config_paths(value));
  }

  Ok(merged)
}

fn expand_module_config_paths(mut value: serde_json::Value) -> serde_json::Value {
  if let Some(root) = value.as_object_mut() {
    for module in root.values_mut().filter_map(serde_json::Value::as_object_mut) {
      let entries = std::mem::take(module);
      for (path, value) in entries {
        insert_flat_override(module, &path, value);
      }
    }
  }

  value
}

#[cfg(test)]
fn app_config_from_module_json(value: serde_json::Value) -> RuntimeResult<AppConfigFile> {
  deserialize_app_config(expand_module_config_paths(value))
}

fn deserialize_app_config(value: serde_json::Value) -> RuntimeResult<AppConfigFile> {
  serde_json::from_value(value).map_err(|err| RuntimeError::json("failed to parse config file", err))
}

fn merge_config_value(base: &mut serde_json::Value, overrides: serde_json::Value) {
  match (base, overrides) {
    (serde_json::Value::Object(base), serde_json::Value::Object(overrides)) => {
      for (key, value) in overrides {
        if let Some(existing) = base.get_mut(&key) {
          merge_config_value(existing, value);
        } else {
          base.insert(key, value);
        }
      }
    }
    (base, overrides) => *base = overrides,
  }
}

async fn load_app_config_overrides_from_db(pool: &PgPool) -> RuntimeResult<serde_json::Value> {
  let rows = match sqlx::query("SELECT id, value FROM app_configs ORDER BY id ASC")
    .fetch_all(pool)
    .await
  {
    Ok(rows) => rows,
    Err(sqlx::Error::Database(err)) if err.code().as_deref() == Some("42P01") => {
      return Ok(serde_json::Value::Object(Map::new()));
    }
    Err(err) => return Err(RuntimeError::database("failed to load app config overrides", err)),
  };

  Ok(app_config_value_from_flat_overrides(rows.into_iter().map(|row| {
    let id: String = row.get("id");
    let value: serde_json::Value = row.get("value");
    (id, value)
  })))
}

#[cfg(test)]
fn app_config_from_flat_overrides<I, S>(rows: I) -> RuntimeResult<AppConfigFile>
where
  I: IntoIterator<Item = (S, serde_json::Value)>,
  S: AsRef<str>,
{
  deserialize_app_config(app_config_value_from_flat_overrides(rows))
}

fn app_config_value_from_flat_overrides<I, S>(rows: I) -> serde_json::Value
where
  I: IntoIterator<Item = (S, serde_json::Value)>,
  S: AsRef<str>,
{
  let mut root = Map::new();
  let mut rows = rows.into_iter().collect::<Vec<_>>();
  rows.sort_by(|(left, _), (right, _)| left.as_ref().cmp(right.as_ref()));
  for (path, value) in rows {
    insert_flat_override(&mut root, path.as_ref(), value);
  }

  serde_json::Value::Object(root)
}

fn insert_flat_override(root: &mut Map<String, serde_json::Value>, path: &str, value: serde_json::Value) {
  let mut parts = path.split('.').peekable();
  let mut current = root;
  while let Some(part) = parts.next() {
    if parts.peek().is_none() {
      current.insert(part.to_string(), value);
      return;
    }
    let entry = current
      .entry(part.to_string())
      .or_insert_with(|| serde_json::Value::Object(Map::new()));
    if !entry.is_object() {
      *entry = serde_json::Value::Object(Map::new());
    }
    current = entry.as_object_mut().expect("override node must be an object");
  }
}

pub(in crate::runtime) fn config_json_paths() -> Vec<PathBuf> {
  let mut paths = Vec::new();
  if let Ok(exe) = env::current_exe()
    && let Some(dir) = exe.parent()
  {
    paths.push(config_in(dir));
  }
  if let Ok(cwd) = env::current_dir() {
    paths.push(config_in(&cwd));
  }
  dedupe_paths(paths)
}

fn config_in(dir: &Path) -> PathBuf {
  dir.join("config.json")
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
  let mut deduped = Vec::new();
  for path in paths {
    if !deduped.contains(&path) {
      deduped.push(path);
    }
  }
  deduped
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn config_paths_are_limited_to_executable_dir_and_cwd() {
    let paths = config_json_paths();
    assert!(!paths.is_empty());
    assert!(paths.len() <= 2);
    assert!(
      paths
        .iter()
        .all(|path| path.file_name().is_some_and(|name| name == "config.json"))
    );
    assert!(paths.iter().all(|path| !path.to_string_lossy().contains(".affine")));
    assert!(
      paths
        .iter()
        .all(|path| !path.to_string_lossy().contains("packages/backend/server"))
    );
    let exact_empty = ConfigSource::new(Some(Vec::new()));
    assert!(exact_empty.exact());
    assert!(exact_empty.paths().is_empty());
  }

  #[test]
  fn blank_database_urls_are_ignored() {
    assert_eq!(non_empty_string("".to_string()), None);
    assert_eq!(non_empty_string("   ".to_string()), None);
    assert_eq!(
      non_empty_string("postgresql://affine:affine@localhost:5432/affine".to_string()),
      Some("postgresql://affine:affine@localhost:5432/affine".to_string())
    );
  }

  #[test]
  fn ignores_storage_app_config_values() {
    let app_config = app_config_from_flat_overrides([
      (
        "storages.blob.storage",
        serde_json::json!({"provider": "cloudflare-r2"}),
      ),
      ("db.datasourceUrl", serde_json::json!("postgresql://example/runtime")),
    ])
    .unwrap();

    assert_eq!(
      app_config.database_url().as_deref(),
      Some("postgresql://example/runtime")
    );
  }

  #[test]
  fn expands_module_config_paths_from_json_files() {
    let app_config = app_config_from_module_json(serde_json::json!({
      "copilot": {
        "enabled": true,
        "byok.enabled": false,
        "providers.profiles": [{
          "id": "managed-openai",
          "type": "openai",
          "models": ["gpt-5.6-luna"],
          "config": { "apiKey": "test" }
        }]
      }
    }))
    .unwrap();
    let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();

    assert!(copilot.enabled);
    assert!(!copilot.byok.enabled);
    assert_eq!(copilot.providers.profiles.len(), 1);
    assert_eq!(copilot.providers.profiles[0].id, "managed-openai");

    let missing_models = app_config_from_flat_overrides([(
      "copilot.providers.profiles",
      serde_json::json!([{
        "id": "managed-openai",
        "type": "openai",
        "config": {}
      }]),
    )]);
    assert!(missing_models.is_err());

    let app_config = app_config_from_flat_overrides([(
      "copilot.providers.profiles",
      serde_json::json!([{
        "id": "managed-openai",
        "type": "openai",
        "models": [],
        "config": {}
      }]),
    )])
    .unwrap();
    let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();
    assert!(validate_copilot_config(&copilot).is_err());

    let app_config = app_config_from_flat_overrides([(
      "copilot.providers.profiles",
      serde_json::json!([
        {
          "id": "anthropic-direct",
          "type": "anthropic",
          "models": ["claude-sonnet-4-6"],
          "config": {}
        },
        {
          "id": "anthropic-vertex",
          "type": "anthropicVertex",
          "models": ["claude-sonnet-4-6"],
          "config": {}
        }
      ]),
    )])
    .unwrap();
    let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();
    assert!(validate_copilot_config(&copilot).is_err());

    let directory = tempfile::tempdir().unwrap();
    let base_path = directory.path().join("base.json");
    let override_path = directory.path().join("override.json");
    fs::write(
      &base_path,
      r#"{"copilot":{"enabled":true,"byok.enabled":true,"byok.allowCustomEndpoint":true}}"#,
    )
    .unwrap();
    fs::write(&override_path, r#"{"copilot":{"byok.enabled":false}}"#).unwrap();
    let source = ConfigSource::new(Some(vec![
      base_path.to_string_lossy().into_owned(),
      override_path.to_string_lossy().into_owned(),
    ]));
    let copilot: CopilotRuntimeConfig = app_config_from_config_source(&source)
      .unwrap()
      .copilot
      .unwrap()
      .try_into()
      .unwrap();
    assert!(!copilot.byok.enabled);
    assert!(copilot.byok.allow_custom_endpoint);
  }

  #[test]
  fn search_config_keeps_disabled_state_separate_from_embedded_provider() {
    let disabled = app_config_from_flat_overrides([
      ("indexer.enabled", serde_json::json!(false)),
      ("indexer.provider.type", serde_json::json!("embedded")),
    ])
    .unwrap();
    let disabled: SearchRuntimeConfig = disabled.indexer.unwrap().into();
    assert!(!disabled.enabled);
    assert_eq!(disabled.provider, "embedded");

    let enabled = app_config_from_flat_overrides([
      ("indexer.enabled", serde_json::json!(true)),
      ("indexer.provider.type", serde_json::json!("elasticsearch")),
    ])
    .unwrap();
    let enabled: SearchRuntimeConfig = enabled.indexer.unwrap().into();
    assert!(enabled.enabled);
    assert_eq!(enabled.provider, "elasticsearch");

    let enabled_without_provider = app_config_from_module_json(serde_json::json!({
      "indexer": { "enabled": true }
    }))
    .unwrap();
    let enabled_without_provider: SearchRuntimeConfig = enabled_without_provider.indexer.unwrap().into();
    assert!(enabled_without_provider.enabled);
    assert_eq!(enabled_without_provider.provider, "embedded");

    let manticore = app_config_from_flat_overrides([
      ("indexer.enabled", serde_json::json!(true)),
      ("indexer.provider.type", serde_json::json!("manticoresearch")),
      ("indexer.provider.endpoint", serde_json::json!("http://localhost:9308")),
    ])
    .unwrap();
    let manticore: SearchRuntimeConfig = manticore.indexer.unwrap().into();
    assert!(manticore.enabled);
    assert_eq!(manticore.provider, "manticoresearch");
  }

  #[test]
  fn partial_database_config_preserves_file_config_siblings() {
    let mut file_config = expand_module_config_paths(serde_json::json!({
      "copilot": {
        "enabled": true,
        "byok": { "enabled": true, "allowCustomEndpoint": true },
        "providers": {
          "profiles": [{
            "id": "managed-openai",
            "type": "openai",
            "models": ["gpt-5.6-luna"],
            "config": { "apiKey": "test" }
          }]
        }
      }
    }));
    let database_config = app_config_value_from_flat_overrides([("copilot.byok.enabled", serde_json::json!(false))]);

    merge_config_value(&mut file_config, database_config);
    let copilot: CopilotRuntimeConfig = deserialize_app_config(file_config)
      .unwrap()
      .copilot
      .unwrap()
      .try_into()
      .unwrap();

    assert!(copilot.enabled);
    assert!(!copilot.byok.enabled);
    assert!(copilot.byok.allow_custom_endpoint);
    assert_eq!(copilot.providers.profiles.len(), 1);
    assert_eq!(copilot.providers.profiles[0].id, "managed-openai");
  }

  #[test]
  fn nested_database_config_overrides_are_order_independent() {
    let app_config = app_config_from_flat_overrides([
      ("copilot.byok.enabled", serde_json::json!(false)),
      (
        "copilot.byok",
        serde_json::json!({ "enabled": true, "allowCustomEndpoint": true }),
      ),
    ])
    .unwrap();
    let byok = CopilotRuntimeConfig::try_from(app_config.copilot.unwrap())
      .unwrap()
      .byok;

    assert!(!byok.enabled);
    assert!(byok.allow_custom_endpoint);
  }

  #[test]
  fn database_config_only_replaces_an_active_private_key_explicitly() {
    let active = BackendRuntimeConfig {
      database_url: "postgresql://active".to_string(),
      auth: AuthRuntimeConfig::default(),
      invite_quota: InviteQuotaConfig::default(),
      private_key: Arc::new(Zeroizing::new("active-private-key".to_string())),
      deployment: Deployment::Cloud,
      copilot: CopilotRuntimeConfig::default(),
      search: SearchRuntimeConfig::default(),
      redis: RedisRuntimeConfig::default(),
      payment: PaymentRuntimeConfig::default(),
    };
    let empty = serde_json::Value::Object(Map::new());

    let unchanged = active.apply_db_overrides(empty.clone(), empty.clone()).unwrap();
    assert_eq!(unchanged.private_key.as_str(), "active-private-key");

    let overridden = active
      .apply_db_overrides(
        empty,
        app_config_value_from_flat_overrides([("crypto.privateKey", serde_json::json!("database-private-key"))]),
      )
      .unwrap();
    assert_eq!(overridden.private_key.as_str(), "database-private-key");
  }

  #[test]
  fn invite_abuse_policy_is_internal_while_action_delay_is_configurable() {
    let app_config = app_config_from_flat_overrides([
      ("auth.newAccountActionDelay", serde_json::json!(123)),
      ("auth.untrustedPolicyOverride", serde_json::json!("runtime-salt-v2")),
      ("auth.untrustedDomainList", serde_json::json!(["Example.COM."])),
    ])
    .unwrap();

    let config = app_config.invite_quota_config();
    assert_eq!(config.new_account_action_delay_seconds, 123);
  }
}
