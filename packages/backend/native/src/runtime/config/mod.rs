use std::{env, sync::Arc};

use serde::Deserialize;
use sqlx::PgPool;
use zeroize::Zeroizing;

use super::{RuntimeError, RuntimeResult};

mod admin;
mod auth;
mod copilot;
mod file;
mod napi;
mod payment;
use payment::PaymentRuntimeConfigFile;
mod store;
mod types;
pub use admin::{AppConfigDescriptor, app_config_descriptors, validate_app_config_value};
use auth::{AuthConfigFile, auth_limit};
pub(crate) use copilot::{CopilotByokRuntimeConfig, CopilotManagedProfileConfig, CopilotRuntimeConfig};
use copilot::{
  CopilotRuntimeConfigFile, MANAGED_PROFILE_REQUIREMENTS, SUPPORTED_BYOK_PROVIDERS, validate_copilot_config,
};
pub(crate) use file::ServerConfig;
#[cfg(test)]
use file::expand_module_config_paths;
pub use napi::ServerConfigHandle;
pub(crate) use store::{AppConfigChange, save_app_config_changes};
use store::{
  NATIVE_APP_CONFIG_KEYS, insert_flat_override, is_secret_native_app_config_key, is_static_app_config_key,
  load_app_config_overrides_from_db,
};
#[cfg(test)]
use store::{app_config_from_flat_overrides, app_config_value_from_flat_overrides};
pub(crate) use types::{
  AuthRuntimeConfig, BackendRuntimeConfig, Deployment, InviteQuotaConfig, OAuthProviderRuntimeConfig,
  PaymentProductConfig, PaymentRuntimeConfig, RedisRuntimeConfig, RevenueCatRuntimeConfig, SearchRuntimeConfig,
  StripeRuntimeConfig,
};

use crate::llm::byok::ByokPolicy;

impl BackendRuntimeConfig {
  pub(crate) fn byok_policy(&self) -> ByokPolicy {
    ByokPolicy::from(self.deployment, &self.copilot.byok)
  }

  pub(crate) fn from_server_config(private_key: Option<String>, config: &ServerConfig) -> RuntimeResult<Self> {
    Self::from_value(private_key, config.baseline().clone(), config.deployment())
  }

  fn from_value(
    private_key: Option<String>,
    app_config_value: serde_json::Value,
    deployment: Deployment,
  ) -> RuntimeResult<Self> {
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
          .or_else(|| {
            app_config
              .crypto
              .as_ref()
              .and_then(|crypto| non_empty_string(crypto.private_key.clone()))
          })
          .or_else(private_key_from_env)
          .unwrap_or_default(),
      )),
      deployment,
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

  pub(crate) async fn with_db_overrides_from_server_config(
    &self,
    pool: &PgPool,
    config: &ServerConfig,
  ) -> RuntimeResult<Self> {
    let db_overrides = load_app_config_overrides_from_db(pool).await?;
    self.apply_db_overrides(config.baseline().clone(), db_overrides)
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
    if self.search.provider != "embedded" && self.search.endpoint.is_empty() {
      return Err(RuntimeError::config("remote search provider requires an endpoint"));
    }
    if !valid_search_endpoint(&self.search.endpoint) {
      return Err(RuntimeError::config("invalid search provider endpoint"));
    }
    Ok(self)
  }
}

fn valid_search_endpoint(endpoint: &str) -> bool {
  if endpoint.is_empty() {
    return true;
  }
  url::Url::parse(endpoint)
    .map(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
    .unwrap_or(false)
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

#[derive(Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct RedisRuntimeConfigFile {
  host: String,
  port: u16,
  db: u8,
  username: String,
  password: String,
  ioredis: RedisIoRuntimeConfigFile,
}

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
struct RedisIoRuntimeConfigFile {
  tls: Option<serde_json::Value>,
}

impl Default for RedisRuntimeConfigFile {
  fn default() -> Self {
    Self {
      host: "localhost".to_string(),
      port: 6379,
      db: 0,
      username: String::new(),
      password: String::new(),
      ioredis: Default::default(),
    }
  }
}

impl RedisRuntimeConfigFile {
  fn validate(&self) -> RuntimeResult<()> {
    if self.port == 0 || self.db > 10 {
      return Err(RuntimeError::config(
        "redis.port must be positive and redis.db must be at most 10",
      ));
    }
    Ok(())
  }
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
      .or_else(|| env::var("REDIS_SERVER_USER").ok().and_then(non_empty_string))
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

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(default)]
pub(super) struct OAuthConfigFile {
  providers: std::collections::BTreeMap<String, OAuthProviderConfigFile>,
}

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct OAuthProviderConfigFile {
  client_id: String,
  client_secret: String,
  args: std::collections::BTreeMap<String, String>,
  issuer: String,
  allow_private_network: bool,
}

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
struct SearchRuntimeConfigFile {
  enabled: bool,
  provider: SearchProviderConfigFile,
}

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
struct SearchProviderConfigFile {
  #[serde(rename = "type")]
  provider: SearchProviderType,
  endpoint: String,
  api_key: String,
  username: String,
  password: String,
}

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
enum SearchProviderType {
  #[default]
  Embedded,
  Elasticsearch,
  Manticoresearch,
}

impl SearchProviderType {
  fn as_str(&self) -> &'static str {
    match self {
      Self::Embedded => "embedded",
      Self::Elasticsearch => "elasticsearch",
      Self::Manticoresearch => "manticoresearch",
    }
  }
}

impl From<SearchRuntimeConfigFile> for SearchRuntimeConfig {
  fn from(value: SearchRuntimeConfigFile) -> Self {
    Self {
      enabled: value.enabled,
      provider: value.provider.provider.as_str().to_string(),
      endpoint: value.provider.endpoint,
      api_key: value.provider.api_key,
      username: value.provider.username,
      password: value.provider.password,
    }
  }
}

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct CryptoConfigFile {
  private_key: String,
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
    self
      .auth
      .as_ref()
      .map(AuthConfigFile::invite_quota_config)
      .unwrap_or_default()
  }

  fn auth_runtime_config(&self) -> AuthRuntimeConfig {
    let mut config = self
      .auth
      .as_ref()
      .map(AuthConfigFile::runtime_config)
      .unwrap_or_default();
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
fn app_config_from_module_json(value: serde_json::Value) -> RuntimeResult<AppConfigFile> {
  deserialize_app_config(expand_module_config_paths(value))
}

fn deserialize_app_config(value: serde_json::Value) -> RuntimeResult<AppConfigFile> {
  let config: AppConfigFile =
    serde_json::from_value(value).map_err(|err| RuntimeError::json("failed to parse config file", err))?;
  if let Some(auth) = &config.auth {
    auth.validate()?;
  }
  if let Some(redis) = &config.redis {
    redis.validate()?;
  }
  if let Some(oauth) = &config.oauth {
    oauth.validate()?;
  }
  Ok(config)
}

impl OAuthConfigFile {
  fn validate(&self) -> RuntimeResult<()> {
    if let Some(oidc) = self.providers.get("oidc")
      && !oidc.issuer.is_empty()
      && !valid_search_endpoint(&oidc.issuer)
    {
      return Err(RuntimeError::config("invalid OIDC issuer URL"));
    }
    Ok(())
  }
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

#[cfg(test)]
mod tests;
