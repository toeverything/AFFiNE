//! Runtime `appConfig` assembly and database override persistence matching
//! `v0.27.5` `appConfig` GraphQL output 1:1 (with all secret keys redacted).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use server_db::{ServerDb, WorkloadTier};
use server_types::DomainError;
use sqlx::Row;

use crate::events::EventBusPublisher;

/// Secret configuration keys that must never appear in the public/admin
/// `appConfig` view (union of TS `NODE_SECRET_CONFIG_KEYS`, internal auth
/// signing keys, and native `is_secret_native_app_config_key`).
///
/// Matching is prefix-aware: both exact matches and any subpath starting with
/// `<secret_key>.` are treated as secret.
pub const SECRET_CONFIG_KEYS: &[&str] = &[
  "auth.session.signingKeys",
  "calendar.google",
  "captcha.config",
  "copilot.exa",
  "copilot.providers.profiles",
  "copilot.storage",
  "copilot.unsplash",
  "crypto.privateKey",
  "db.datasourceUrl",
  "indexer.provider.apiKey",
  "indexer.provider.password",
  "mailer.SMTP.password",
  "mailer.fallbackSMTP.password",
  "oauth.providers.apple",
  "oauth.providers.github",
  "oauth.providers.google",
  "oauth.providers.oidc",
  "payment.revenuecat",
  "payment.stripe",
  "redis.ioredis",
  "redis.password",
  "storages.avatar.storage",
  "storages.blob.storage",
  "telemetry.ga4.apiSecret",
];

/// Known top-level `v0.27.5` `appConfig` root modules permitted when merging
/// database overrides into the effective config view.
pub const ALLOWED_CONFIG_ROOTS: &[&str] = &[
  "auth",
  "calendar",
  "captcha",
  "client",
  "copilot",
  "crypto",
  "db",
  "doc",
  "flags",
  "graphql",
  "indexer",
  "mailer",
  "metrics",
  "oauth",
  "payment",
  "redis",
  "server",
  "storages",
  "telemetry",
  "throttle",
  "websocket",
  "worker",
];

const INTERNAL_LOCKED_CONFIG_PREFIX: &str = "auth.session.signingKeys";

/// Boot-only configuration keys that cannot be mutated at runtime via `updateAppConfig`.
pub const BOOT_ONLY_CONFIG_KEYS: &[&str] = &["db.datasourceUrl", "server.listenAddr", "server.port"];

/// Exact allowlist for native-managed roots (`copilot`, `oauth`, `payment`, `storages`),
/// mirroring `packages/backend/native/src/runtime/config/store.rs:NATIVE_APP_CONFIG_KEYS`.
pub const NATIVE_MANAGED_CONFIG_ROOTS: &[&str] = &["copilot", "oauth", "payment", "storages"];

pub const NATIVE_MANAGED_CONFIG_KEYS: &[&str] = &[
  "copilot.byok.allowCustomEndpoint",
  "copilot.byok.allowedProviders",
  "copilot.byok.allowPrivateEndpoint",
  "copilot.byok.enabled",
  "copilot.enabled",
  "copilot.providers.profiles",
  "copilot.storage",
  "oauth.providers.apple",
  "oauth.providers.github",
  "oauth.providers.google",
  "oauth.providers.oidc",
  "payment.enabled",
  "payment.revenuecat",
  "payment.stripe",
  "storages.avatar.storage",
  "storages.blob.storage",
];

pub fn is_boot_only_config_key(key: &str) -> bool {
  key == "redis"
    || key.starts_with("redis.")
    || BOOT_ONLY_CONFIG_KEYS.iter().any(|boot| {
      key == *boot || (key.len() > boot.len() && key.starts_with(boot) && key.as_bytes()[boot.len()] == b'.')
    })
}

pub fn validate_mutable_config_key(key: &str) -> Result<(), DomainError> {
  if key == INTERNAL_LOCKED_CONFIG_PREFIX
    || (key.len() > INTERNAL_LOCKED_CONFIG_PREFIX.len()
      && key.starts_with(INTERNAL_LOCKED_CONFIG_PREFIX)
      && key.as_bytes()[INTERNAL_LOCKED_CONFIG_PREFIX.len()] == b'.')
  {
    return Err(DomainError::Forbidden(format!(
      "{INTERNAL_LOCKED_CONFIG_PREFIX} cannot be modified via app config"
    )));
  }
  if !is_allowed_config_key(key) {
    return Err(DomainError::Validation(format!("invalid app config key: {key:?}")));
  }
  if is_boot_only_config_key(key) {
    return Err(DomainError::Validation(format!(
      "boot-only app config key cannot be modified at runtime: {key:?}"
    )));
  }
  let root = key.split('.').next().unwrap_or("");
  if NATIVE_MANAGED_CONFIG_ROOTS.contains(&root) && !NATIVE_MANAGED_CONFIG_KEYS.contains(&key) {
    return Err(DomainError::Validation(format!(
      "unknown native-managed app config key: {key:?}"
    )));
  }
  Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SmtpRuntimeConfig {
  pub host: String,
  pub port: u16,
  pub name: String,
  pub sender: String,
  pub username: String,
  pub ignore_tls: bool,
}

impl Default for SmtpRuntimeConfig {
  fn default() -> Self {
    Self {
      host: String::new(),
      port: 465,
      name: String::new(),
      sender: String::new(),
      username: String::new(),
      ignore_tls: false,
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RedisRuntimeConfig {
  pub host: String,
  pub port: u16,
  pub db: u32,
  pub username: String,
}

impl Default for RedisRuntimeConfig {
  fn default() -> Self {
    Self {
      host: "127.0.0.1".to_owned(),
      port: 6379,
      db: 0,
      username: String::new(),
    }
  }
}

impl RedisRuntimeConfig {
  pub fn from_redis_url(redis_url: &str) -> Result<Self, DomainError> {
    let parsed = url::Url::parse(redis_url).map_err(|e| DomainError::Validation(format!("invalid redis URL: {e}")))?;
    let host = parsed.host_str().unwrap_or("127.0.0.1").to_owned();
    let port = parsed.port().unwrap_or(6379);
    let db = parsed.path().trim_start_matches('/').parse::<u32>().unwrap_or(0);
    let username = parsed.username().to_owned();
    Ok(Self {
      host,
      port,
      db,
      username,
    })
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServerRuntimeConfig {
  pub name: String,
  pub external_url: String,
  pub host: String,
  pub hosts: Vec<String>,
  pub https: bool,
  pub listen_addr: String,
  pub path: String,
  pub port: u16,
}

impl Default for ServerRuntimeConfig {
  fn default() -> Self {
    Self {
      name: "AFFiNE".to_owned(),
      external_url: "http://localhost:3010".to_owned(),
      host: "localhost".to_owned(),
      hosts: Vec::new(),
      https: false,
      listen_addr: "127.0.0.1".to_owned(),
      path: String::new(),
      port: 3010,
    }
  }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RuntimeAppConfigBaseline {
  pub server: ServerRuntimeConfig,
  pub redis: RedisRuntimeConfig,
  pub smtp: SmtpRuntimeConfig,
  pub fallback_smtp: SmtpRuntimeConfig,
}

#[derive(Clone, Debug)]
pub struct AppConfigUpdate {
  pub key: String,
  pub value: Option<Value>,
}

const APP_CONFIG_CACHE_TTL: Duration = Duration::from_secs(2);

type CachedAppConfig = Option<(Instant, Arc<Value>)>;

#[derive(Clone)]
pub struct AppConfigService {
  db: ServerDb,
  baseline: RuntimeAppConfigBaseline,
  event_bus: Arc<dyn EventBusPublisher>,
  cache: Arc<RwLock<CachedAppConfig>>,
  generation: Arc<AtomicU64>,
}

impl AppConfigService {
  pub fn new(db: ServerDb, baseline: RuntimeAppConfigBaseline, event_bus: Arc<dyn EventBusPublisher>) -> Self {
    Self {
      db,
      baseline,
      event_bus,
      cache: Arc::new(RwLock::new(None)),
      generation: Arc::new(AtomicU64::new(0)),
    }
  }

  /// Clears the in-memory `appConfig` snapshot cache and advances the cache
  /// generation so in-flight stale reads cannot overwrite newer commits.
  pub fn invalidate_cache(&self) {
    self.generation.fetch_add(1, Ordering::AcqRel);
    if let Ok(mut guard) = self.cache.write() {
      *guard = None;
    }
  }

  fn store_snapshot_if_generation_matches(&self, gen_before: u64, snapshot: &Arc<Value>) -> bool {
    if let Ok(mut guard) = self.cache.write()
      && self.generation.load(Ordering::Acquire) == gen_before
    {
      *guard = Some((Instant::now(), Arc::clone(snapshot)));
      return true;
    }
    false
  }

  async fn load_effective_app_config_uncached(&self) -> Result<Arc<Value>, DomainError> {
    let mut config = default_app_config_json(&self.baseline);

    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire app_configs read: {e}")))?;
    let rows = sqlx::query("SELECT id, value FROM app_configs ORDER BY id ASC")
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load app_configs: {e}")))?;

    for row in rows {
      let key: String = row.get("id");
      if !is_allowed_config_key(&key) || is_secret_config_key(&key) {
        continue;
      }
      let value: Value = row.get("value");
      set_nested_path(&mut config, &key, value);
    }

    redact_secret_keys(&mut config);
    Ok(Arc::new(config))
  }

  async fn get_cached_effective_app_config(&self) -> Result<Arc<Value>, DomainError> {
    if let Ok(guard) = self.cache.read()
      && let Some((cached_at, ref snapshot)) = *guard
      && cached_at.elapsed() < APP_CONFIG_CACHE_TTL
    {
      return Ok(Arc::clone(snapshot));
    }

    let gen_before = self.generation.load(Ordering::Acquire);
    let snapshot = self.load_effective_app_config_uncached().await?;
    self.store_snapshot_if_generation_matches(gen_before, &snapshot);
    Ok(snapshot)
  }

  /// Builds the exact `v0.27.5` `appConfig` JSON object by combining runtime
  /// defaults/env baseline with `public.app_configs` overrides and redacting
  /// all secret keys.
  pub async fn get_effective_app_config(&self) -> Result<Value, DomainError> {
    let snapshot = self.get_cached_effective_app_config().await?;
    Ok((*snapshot).clone())
  }

  /// Reads `(client.versionControl.enabled, client.versionControl.requiredVersion)`
  /// directly from the cached `appConfig` snapshot without cloning the full JSON tree.
  pub async fn get_client_version_control(&self) -> Result<(bool, String), DomainError> {
    let snapshot = self.get_cached_effective_app_config().await?;
    let vc = snapshot.get("client").and_then(|c| c.get("versionControl"));
    let enabled = vc
      .and_then(|v| v.get("enabled"))
      .and_then(Value::as_bool)
      .unwrap_or(false);
    let required_version = vc
      .and_then(|v| v.get("requiredVersion"))
      .and_then(Value::as_str)
      .unwrap_or(">=0.25.0")
      .to_owned();
    Ok((enabled, required_version))
  }

  /// Persists one or more `app_configs` overrides (or clears them when
  /// `value` is `None`) inside a single atomic transaction and broadcasts
  /// `config.changed.broadcast` on `affine:eventbus:v1`. Any invalid key or
  /// value schema rolls back the entire batch with zero partial writes.
  pub async fn update_app_config(
    &self,
    actor_user_id: Option<&str>,
    updates: &[AppConfigUpdate],
  ) -> Result<Value, DomainError> {
    if updates.is_empty() {
      return self.get_effective_app_config().await;
    }

    let defaults = default_app_config_json(&self.baseline);
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin app_configs update: {e}")))?;

    let mut keys = Vec::with_capacity(updates.len());
    for update in updates {
      let key = update.key.trim();
      validate_mutable_config_key(key)?;
      if let Some(value) = &update.value {
        validate_config_value(key, value, &defaults)?;
      }
      keys.push(key.to_owned());
      match &update.value {
        Some(value) => {
          sqlx::query(
            r#"INSERT INTO app_configs (id, value, last_updated_by, created_at, updated_at)
               VALUES ($1, $2, $3, clock_timestamp(), clock_timestamp())
               ON CONFLICT (id) DO UPDATE SET
                 value = EXCLUDED.value,
                 last_updated_by = EXCLUDED.last_updated_by,
                 updated_at = clock_timestamp()"#,
          )
          .bind(key)
          .bind(value)
          .bind(actor_user_id)
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("upsert app_config {key}: {e}")))?;
        }
        None => {
          sqlx::query("DELETE FROM app_configs WHERE id = $1")
            .bind(key)
            .execute(&mut **tx.tx_mut())
            .await
            .map_err(|e| DomainError::Internal(format!("delete app_config {key}: {e}")))?;
        }
      }
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit app_configs update: {e}")))?;

    self.invalidate_cache();

    let _ = self
      .event_bus
      .publish_event("config.changed.broadcast", json!({ "keys": keys }), None)
      .await;

    let gen_before = self.generation.load(Ordering::Acquire);
    let snapshot = self.load_effective_app_config_uncached().await?;
    self.store_snapshot_if_generation_matches(gen_before, &snapshot);
    Ok((*snapshot).clone())
  }
}

fn lookup_nested_path<'a>(root: &'a Value, dotted_path: &str) -> Option<&'a Value> {
  let mut cursor = root;
  for segment in dotted_path.split('.') {
    cursor = cursor.as_object()?.get(segment)?;
  }
  Some(cursor)
}

fn validate_http_url_field(key: &str, raw: &str) -> Result<(), DomainError> {
  if raw.is_empty() {
    return Ok(());
  }
  let parsed = url::Url::parse(raw)
    .map_err(|_| DomainError::Validation(format!("invalid app config URL for `{key}`: expected http(s) URL")))?;
  if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
    return Err(DomainError::Validation(format!(
      "invalid app config URL for `{key}`: expected http(s) URL"
    )));
  }
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(dead_code)]
struct S3CredentialsConfig {
  #[serde(default)]
  access_key_id: Option<String>,
  #[serde(default)]
  secret_access_key: Option<String>,
  #[serde(default)]
  session_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(dead_code)]
struct S3PresignConfig {
  #[serde(default)]
  expires_in_seconds: Option<u64>,
  #[serde(default)]
  sign_content_type_for_put: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoragePresignedUrlConfig {
  enabled: bool,
  #[serde(default)]
  #[allow(dead_code)]
  url_prefix: Option<String>,
  #[serde(default)]
  #[allow(dead_code)]
  sign_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
enum R2Jurisdiction {
  Default,
  Eu,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FsStorageProviderConfig {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct S3StorageProviderConfig {
  #[serde(default)]
  #[allow(dead_code)]
  endpoint: Option<String>,
  region: String,
  #[serde(default)]
  #[allow(dead_code)]
  credentials: Option<S3CredentialsConfig>,
  #[serde(default)]
  #[allow(dead_code)]
  force_path_style: Option<bool>,
  #[serde(default)]
  #[allow(dead_code)]
  request_timeout_ms: Option<u64>,
  #[serde(default)]
  #[allow(dead_code)]
  min_part_size: Option<u64>,
  #[serde(default)]
  #[allow(dead_code)]
  presign: Option<S3PresignConfig>,
  #[serde(default, rename = "usePresignedURL")]
  use_presigned_url: Option<StoragePresignedUrlConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct R2StorageProviderConfig {
  account_id: String,
  #[serde(default)]
  #[allow(dead_code)]
  jurisdiction: Option<R2Jurisdiction>,
  #[serde(default)]
  #[allow(dead_code)]
  region: Option<String>,
  #[serde(default)]
  #[allow(dead_code)]
  credentials: Option<S3CredentialsConfig>,
  #[serde(default)]
  #[allow(dead_code)]
  request_timeout_ms: Option<u64>,
  #[serde(default)]
  #[allow(dead_code)]
  min_part_size: Option<u64>,
  #[serde(default)]
  #[allow(dead_code)]
  presign: Option<S3PresignConfig>,
  #[serde(default, rename = "usePresignedURL")]
  use_presigned_url: Option<StoragePresignedUrlConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StorageObjectConfigEnvelope {
  provider: String,
  bucket: String,
  config: Value,
}

fn validate_storage_object_config(key: &str, value: &Value) -> Result<(), DomainError> {
  let parsed: StorageObjectConfigEnvelope = serde_json::from_value(value.clone()).map_err(|err| {
    DomainError::Validation(format!(
      "invalid app config value for `{key}`: invalid storage config ({err})"
    ))
  })?;
  if parsed.bucket.trim().is_empty() {
    return Err(DomainError::Validation(format!(
      "invalid app config value for `{key}`: bucket must be a non-empty string"
    )));
  }
  match parsed.provider.as_str() {
    "fs" | "assetpack" => {
      let cfg: FsStorageProviderConfig = serde_json::from_value(parsed.config).map_err(|err| {
        DomainError::Validation(format!(
          "invalid app config value for `{key}`: invalid {} config ({err})",
          parsed.provider
        ))
      })?;
      if cfg.path.trim().is_empty() {
        return Err(DomainError::Validation(format!(
          "invalid app config value for `{key}`: config.path must be a non-empty string"
        )));
      }
    }
    "aws-s3" => {
      let cfg: S3StorageProviderConfig = serde_json::from_value(parsed.config).map_err(|err| {
        DomainError::Validation(format!(
          "invalid app config value for `{key}`: invalid aws-s3 config ({err})"
        ))
      })?;
      if cfg.region.trim().is_empty() {
        return Err(DomainError::Validation(format!(
          "invalid app config value for `{key}`: config.region must be a non-empty string"
        )));
      }
      let _ = cfg.use_presigned_url.as_ref().map(|u| u.enabled);
    }
    "cloudflare-r2" => {
      let cfg: R2StorageProviderConfig = serde_json::from_value(parsed.config).map_err(|err| {
        DomainError::Validation(format!(
          "invalid app config value for `{key}`: invalid cloudflare-r2 config ({err})"
        ))
      })?;
      if cfg.account_id.trim().is_empty() {
        return Err(DomainError::Validation(format!(
          "invalid app config value for `{key}`: config.accountId must be a non-empty string"
        )));
      }
      let _ = cfg.use_presigned_url.as_ref().map(|u| u.enabled);
    }
    other => {
      return Err(DomainError::Validation(format!(
        "invalid app config value for `{key}`: unsupported storage provider `{other}`"
      )));
    }
  }
  Ok(())
}

/// Validates a configuration value's JSON type and structural constraints
/// against the default configuration tree and known native-managed schemas.
pub fn validate_config_value(key: &str, value: &Value, defaults: &Value) -> Result<(), DomainError> {
  let leaf = key.rsplit('.').next().unwrap_or(key);

  if matches!(
    key,
    "storages.avatar.storage" | "storages.blob.storage" | "copilot.storage"
  ) {
    return validate_storage_object_config(key, value);
  }

  if key == "oauth.providers.oidc" {
    let Some(obj) = value.as_object() else {
      return Err(DomainError::Validation(format!(
        "invalid app config value for `{key}`: expected object"
      )));
    };
    if let Some(issuer) = obj.get("issuer") {
      let Some(s) = issuer.as_str() else {
        return Err(DomainError::Validation(format!(
          "invalid app config value for `{key}.issuer`: expected string"
        )));
      };
      validate_http_url_field("oauth.providers.oidc.issuer", s.trim())?;
    }
    return Ok(());
  }

  if matches!(
    key,
    "oauth.providers.apple"
      | "oauth.providers.github"
      | "oauth.providers.google"
      | "payment.stripe"
      | "payment.revenuecat"
  ) {
    if !value.is_object() {
      return Err(DomainError::Validation(format!(
        "invalid app config value for `{key}`: expected object"
      )));
    }
    return Ok(());
  }

  if key == "copilot.providers.profiles" {
    if !value.is_object() && !value.is_array() {
      return Err(DomainError::Validation(format!(
        "invalid app config value for `{key}`: expected object or array"
      )));
    }
    return Ok(());
  }

  if let Some(default_val) = lookup_nested_path(defaults, key) {
    match default_val {
      Value::Bool(_) => {
        if !value.is_boolean() {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: expected boolean"
          )));
        }
      }
      Value::Number(_) => {
        let Some(n) = value.as_i64() else {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: expected integer"
          )));
        };
        if n < 0 {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: expected non-negative integer"
          )));
        }
        if leaf.eq_ignore_ascii_case("port") && !(1..=65535).contains(&n) {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: port must be between 1 and 65535"
          )));
        }
      }
      Value::String(_) => {
        let Some(s) = value.as_str() else {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: expected string"
          )));
        };
        if matches!(key, "server.externalUrl" | "indexer.provider.endpoint") {
          validate_http_url_field(key, s.trim())?;
        }
      }
      Value::Array(default_arr) => {
        let Some(arr) = value.as_array() else {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: expected array"
          )));
        };
        if default_arr.first().is_some_and(Value::is_string) && !arr.iter().all(Value::is_string) {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: expected array of strings"
          )));
        }
      }
      Value::Object(_) => {
        if !value.is_object() {
          return Err(DomainError::Validation(format!(
            "invalid app config value for `{key}`: expected object"
          )));
        }
      }
      Value::Null => {}
    }
    return Ok(());
  }

  // Fallback rules for known boolean leaf names outside the default JSON tree.
  let is_bool_leaf = matches!(
    leaf,
    "enabled" | "requireEmailDomainVerification" | "trustedCloudflareHeaders" | "ignoreTLS" | "https" | "introspection"
  ) || leaf.starts_with("allow");
  if is_bool_leaf && !value.is_boolean() {
    return Err(DomainError::Validation(format!(
      "invalid app config value for `{key}`: expected boolean"
    )));
  }
  Ok(())
}

pub fn is_secret_config_key(key: &str) -> bool {
  SECRET_CONFIG_KEYS.iter().any(|secret| {
    key == *secret || (key.len() > secret.len() && key.starts_with(secret) && key.as_bytes()[secret.len()] == b'.')
  })
}

pub fn is_allowed_config_key(key: &str) -> bool {
  let mut parts = key.split('.');
  let Some(root) = parts.next() else {
    return false;
  };
  let mut has_child = false;
  for seg in parts {
    if seg.is_empty() {
      return false;
    }
    has_child = true;
  }
  has_child && ALLOWED_CONFIG_ROOTS.contains(&root)
}

pub fn default_app_config_json(baseline: &RuntimeAppConfigBaseline) -> Value {
  json!({
    "auth": {
      "allowSignup": true,
      "allowSignupForOauth": true,
      "newAccountActionDelay": 86400,
      "passwordRequirements": {
        "max": 32,
        "min": 8
      },
      "requireEmailDomainVerification": false,
      "session": {
        "ttl": 1296000,
        "ttr": 604800
      },
      "signInRateLimit": {
        "emailLimit": 5,
        "ipLimit": 20,
        "ttl": 60000
      },
      "token": {
        "accessTokenTtl": 900,
        "refreshAbsoluteTtl": 15552000,
        "refreshGracePeriod": 30,
        "refreshIdleTtl": 2592000,
        "refreshRetention": 2592000
      },
      "trustedCloudflareHeaders": false
    },
    "calendar": {
      "caldav": {
        "allowCustomProvider": false,
        "allowInsecureHttp": false,
        "allowedHosts": [],
        "blockPrivateNetwork": true,
        "enabled": false,
        "maxRedirects": 5,
        "providers": [],
        "requestTimeoutMs": 10000
      }
    },
    "captcha": {
      "enabled": false
    },
    "client": {
      "versionControl": {
        "enabled": false,
        "requiredVersion": ">=0.25.0"
      }
    },
    "copilot": {
      "byok": {
        "allowCustomEndpoint": false,
        "allowPrivateEndpoint": false,
        "allowedProviders": ["openai", "anthropic", "gemini", "fal"],
        "enabled": true
      },
      "enabled": false
    },
    "crypto": {},
    "db": {
      "prisma": {}
    },
    "doc": {
      "history": {
        "interval": 600000
      }
    },
    "flags": {
      "allowGuestDemoWorkspace": true
    },
    "graphql": {
      "apolloDriverConfig": {
        "introspection": true
      }
    },
    "indexer": {
      "enabled": false,
      "provider": {
        "endpoint": "",
        "type": "embedded",
        "username": ""
      }
    },
    "mailer": {
      "SMTP": {
        "host": baseline.smtp.host,
        "ignoreTLS": baseline.smtp.ignore_tls,
        "name": baseline.smtp.name,
        "port": baseline.smtp.port,
        "sender": baseline.smtp.sender,
        "username": baseline.smtp.username
      },
      "deliveryWorker": {
        "batchSize": 50,
        "leaseMs": 120000,
        "retentionDays": 30
      },
      "fallbackDomains": [],
      "fallbackSMTP": {
        "host": baseline.fallback_smtp.host,
        "ignoreTLS": baseline.fallback_smtp.ignore_tls,
        "name": baseline.fallback_smtp.name,
        "port": baseline.fallback_smtp.port,
        "sender": baseline.fallback_smtp.sender,
        "username": baseline.fallback_smtp.username
      }
    },
    "metrics": {
      "enabled": false
    },
    "oauth": {},
    "payment": {
      "enabled": false,
      "showLifetimePrice": true
    },
    "redis": {
      "db": baseline.redis.db,
      "host": baseline.redis.host,
      "port": baseline.redis.port,
      "username": baseline.redis.username
    },
    "server": {
      "externalUrl": baseline.server.external_url,
      "host": baseline.server.host,
      "hosts": baseline.server.hosts,
      "https": baseline.server.https,
      "listenAddr": baseline.server.listen_addr,
      "name": baseline.server.name,
      "path": baseline.server.path,
      "port": baseline.server.port
    },
    "storages": {
      "avatar": {
        "publicPath": "/api/avatars/"
      }
    },
    "telemetry": {
      "allowedOrigin": ["localhost", "127.0.0.1"],
      "batch": {
        "maxEvents": 25
      },
      "dedupe": {
        "maxEntries": 100000,
        "ttlHours": 24
      },
      "ga4": {
        "measurementId": ""
      }
    },
    "throttle": {
      "enabled": true,
      "throttlers": {
        "default": {
          "limit": 120,
          "ttl": 60000
        },
        "strict": {
          "limit": 20,
          "ttl": 60000
        }
      }
    },
    "websocket": {
      "maxHttpBufferSize": 100000000,
      "transports": ["websocket", "polling"]
    },
    "worker": {
      "allowedOrigin": ["localhost", "127.0.0.1"]
    }
  })
}

fn set_nested_path(root: &mut Value, dotted_path: &str, value: Value) {
  let segments: Vec<&str> = dotted_path.split('.').collect();
  if segments.is_empty() {
    return;
  }
  let mut cursor = root;
  for segment in &segments[..segments.len() - 1] {
    if !cursor.is_object() {
      *cursor = Value::Object(Map::new());
    }
    let map = cursor.as_object_mut().expect("object just ensured");
    cursor = map
      .entry((*segment).to_owned())
      .or_insert_with(|| Value::Object(Map::new()));
  }
  if let Some(map) = cursor.as_object_mut() {
    map.insert(segments[segments.len() - 1].to_owned(), value);
  }
}

fn unset_nested_path(root: &mut Value, dotted_path: &str) {
  let segments: Vec<&str> = dotted_path.split('.').collect();
  if segments.is_empty() {
    return;
  }
  let mut cursor = root;
  for segment in &segments[..segments.len() - 1] {
    let Some(next) = cursor.as_object_mut().and_then(|m| m.get_mut(*segment)) else {
      return;
    };
    cursor = next;
  }
  if let Some(map) = cursor.as_object_mut() {
    map.remove(segments[segments.len() - 1]);
  }
}

fn redact_secret_keys(root: &mut Value) {
  for key in SECRET_CONFIG_KEYS {
    unset_nested_path(root, key);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn default_app_config_matches_v0275_recorded_keys_and_redacts_secrets() {
    let mut cfg = default_app_config_json(&RuntimeAppConfigBaseline {
      server: ServerRuntimeConfig {
        name: "AFFiNE Parity".to_owned(),
        external_url: "http://affine.parity.test".to_owned(),
        host: "localhost".to_owned(),
        hosts: vec![],
        https: false,
        listen_addr: "127.0.0.1".to_owned(),
        path: String::new(),
        port: 40243,
      },
      redis: RedisRuntimeConfig {
        host: "127.0.0.1".to_owned(),
        port: 34365,
        db: 0,
        username: String::new(),
      },
      smtp: SmtpRuntimeConfig {
        host: "127.0.0.1".to_owned(),
        port: 36523,
        name: "parity.affine.test".to_owned(),
        sender: "AFFiNE Parity <noreply@affine.test>".to_owned(),
        username: String::new(),
        ignore_tls: false,
      },
      fallback_smtp: SmtpRuntimeConfig::default(),
    });
    set_nested_path(&mut cfg, "mailer.SMTP.password", Value::String("secret".to_owned()));
    set_nested_path(&mut cfg, "redis.password", Value::String("secret".to_owned()));
    redact_secret_keys(&mut cfg);

    assert!(cfg.pointer("/mailer/SMTP/password").is_none());
    assert!(cfg.pointer("/redis/password").is_none());
    assert_eq!(cfg.pointer("/auth/session/ttl"), Some(&json!(1296000)));
    assert_eq!(cfg.pointer("/server/name"), Some(&json!("AFFiNE Parity")));
    assert_eq!(
      cfg.pointer("/mailer/SMTP/sender"),
      Some(&json!("AFFiNE Parity <noreply@affine.test>"))
    );

    // Prefix-aware secret matching and root allowlist validation.
    for key in [
      "oauth.providers.github",
      "oauth.providers.github.clientSecret",
      "db.datasourceUrl",
      "payment.stripe",
      "payment.stripe.keys",
      "storages.blob.storage",
      "storages.blob.storage.config",
      "copilot.providers.profiles",
      "auth.session.signingKeys",
    ] {
      assert!(is_secret_config_key(key), "expected {key} to be classified as secret");
    }
    assert!(!is_secret_config_key("flags.allowGuestDemoWorkspace"));
    assert!(is_allowed_config_key("flags.allowGuestDemoWorkspace"));
    assert!(!is_allowed_config_key("unknown.key"));
    assert!(!is_allowed_config_key("flags..empty"));
    assert!(!is_allowed_config_key("flags."));

    // Boot-only keys and unknown native-managed keys must be rejected.
    for rejected in [
      "db.datasourceUrl",
      "redis.host",
      "redis.port",
      "redis.password",
      "server.listenAddr",
      "server.port",
      "copilot.unknownKey",
      "oauth.providers.unknown",
      "payment.unknownKey",
      "storages.unknown.storage",
      "unknown.key",
    ] {
      assert!(
        matches!(validate_mutable_config_key(rejected), Err(DomainError::Validation(_))),
        "expected Validation error for {rejected}"
      );
    }
    assert!(matches!(
      validate_mutable_config_key("auth.session.signingKeys"),
      Err(DomainError::Forbidden(_))
    ));
    for allowed in [
      "flags.allowGuestDemoWorkspace",
      "copilot.enabled",
      "oauth.providers.github",
      "payment.enabled",
      "storages.blob.storage",
      "server.name",
    ] {
      assert!(
        validate_mutable_config_key(allowed).is_ok(),
        "expected {allowed} to be mutable"
      );
    }

    // Value schema validation: booleans, integers, URLs, and storage objects.
    let defaults = default_app_config_json(&RuntimeAppConfigBaseline::default());
    assert!(validate_config_value("flags.allowGuestDemoWorkspace", &json!(false), &defaults).is_ok());
    assert!(validate_config_value("flags.allowGuestDemoWorkspace", &json!("nope"), &defaults).is_err());
    assert!(validate_config_value("auth.trustedCloudflareHeaders", &json!(true), &defaults).is_ok());
    assert!(validate_config_value("auth.trustedCloudflareHeaders", &json!(1), &defaults).is_err());
    assert!(validate_config_value("mailer.SMTP.port", &json!(587), &defaults).is_ok());
    assert!(validate_config_value("mailer.SMTP.port", &json!(0), &defaults).is_err());
    assert!(validate_config_value("mailer.SMTP.port", &json!("587"), &defaults).is_err());
    assert!(validate_config_value("server.externalUrl", &json!("https://app.affine.pro"), &defaults).is_ok());
    assert!(validate_config_value("server.externalUrl", &json!("ftp://bad.example"), &defaults).is_err());
    assert!(
      validate_config_value(
        "storages.blob.storage",
        &json!({ "provider": "fs", "bucket": "blobs", "config": { "path": "/var/lib/affine/blobs" } }),
        &defaults
      )
      .is_ok()
    );
    assert!(
      validate_config_value(
        "storages.blob.storage",
        &json!({
          "provider": "cloudflare-r2",
          "bucket": "blobs",
          "config": {
            "accountId": "acct-1",
            "jurisdiction": "eu",
            "requestTimeoutMs": 30000,
            "minPartSize": 5242880,
            "presign": { "expiresInSeconds": 300, "signContentTypeForPut": true },
            "credentials": { "accessKeyId": "ak", "secretAccessKey": "sk" },
            "usePresignedURL": { "enabled": true, "signKey": "k1" }
          }
        }),
        &defaults
      )
      .is_ok()
    );
    assert!(
      validate_config_value(
        "storages.blob.storage",
        &json!({
          "provider": "aws-s3",
          "bucket": "blobs",
          "config": {
            "region": "us-east-1",
            "endpoint": "https://s3.example.test",
            "forcePathStyle": true,
            "requestTimeoutMs": 15000,
            "minPartSize": 5242880,
            "presign": { "expiresInSeconds": 600 },
            "credentials": { "accessKeyId": "ak", "secretAccessKey": "sk", "sessionToken": "tok" },
            "usePresignedURL": { "enabled": false, "urlPrefix": "https://cdn.example.test" }
          }
        }),
        &defaults
      )
      .is_ok()
    );
    assert!(validate_config_value("storages.blob.storage", &json!({ "provider": "fs" }), &defaults).is_err());
    assert!(
      validate_config_value(
        "storages.blob.storage",
        &json!({ "provider": "fs", "bucket": "blobs", "config": {} }),
        &defaults
      )
      .is_err()
    );
    assert!(
      validate_config_value(
        "storages.blob.storage",
        &json!({
          "provider": "cloudflare-r2",
          "bucket": "blobs",
          "config": { "accountId": "x", "usePresignedURL": { "enabled": "yes" } }
        }),
        &defaults
      )
      .is_err()
    );
    assert!(
      validate_config_value(
        "storages.blob.storage",
        &json!({
          "provider": "aws-s3",
          "bucket": "blobs",
          "config": { "region": "us-east-1", "credentials": "bad" }
        }),
        &defaults
      )
      .is_err()
    );
  }

  #[test]
  fn stale_read_generation_cannot_overwrite_newer_invalidation() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations = test_db_harness::migrations::MigrationSet {
      migrations: vec![],
      digest: "5e20000000000003".into(),
    };
    let template = cluster.ensure_template(&migrations).expect("ensure empty template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let db_url = lease.url().to_owned();
    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .expect("build tokio runtime");
    rt.block_on(async move {
      let db = ServerDb::connect(server_db::DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 2,
        statement_timeout_ms: 5_000,
        tier_permits: [4, 2, 2, 1],
      })
      .await
      .expect("connect test db");
      sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS app_configs (
             id TEXT PRIMARY KEY,
             value JSONB NOT NULL,
             last_updated_by TEXT,
             created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
             updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )"#,
      )
      .execute(db.pool())
      .await
      .expect("create app_configs");

      let svc = AppConfigService::new(
        db.clone(),
        RuntimeAppConfigBaseline::default(),
        Arc::new(crate::events::NoopEventPublisher::default()),
      );

      // 1. Reader captures generation before a concurrent write commits.
      let stale_gen = svc.generation.load(Ordering::Acquire);
      let stale_snapshot = svc.load_effective_app_config_uncached().await.expect("stale read");
      assert_eq!(
        stale_snapshot.pointer("/client/versionControl/enabled"),
        Some(&json!(false))
      );

      // 2. Concurrent write commits enabled = true and advances generation.
      svc
        .update_app_config(
          None,
          &[
            AppConfigUpdate {
              key: "client.versionControl.enabled".into(),
              value: Some(json!(true)),
            },
            AppConfigUpdate {
              key: "client.versionControl.requiredVersion".into(),
              value: Some(json!(">=0.27.0")),
            },
          ],
        )
        .await
        .expect("update_app_config");

      // 3. Stale reader finishes late and attempts to populate the cache -> rejected.
      assert!(
        !svc.store_snapshot_if_generation_matches(stale_gen, &stale_snapshot),
        "stale generation must not overwrite newer cache entry"
      );

      // 4. Subsequent read immediately sees the committed values.
      let (enabled, required) = svc.get_client_version_control().await.expect("read versionControl");
      assert!(enabled);
      assert_eq!(required, ">=0.27.0");

      db.pool().close().await;
    });
  }
}
