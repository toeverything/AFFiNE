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
///
/// Note: `default_app_config_json` overlays registered non-secret fields from
/// the file config onto the defaults. Any newly registered config descriptor
/// that holds credentials or secrets MUST also be added to `SECRET_CONFIG_KEYS`
/// so it is never echoed in the admin `appConfig` view.
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
  "payment.showLifetimePrice",
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

fn decode_uri_component(raw: &str) -> Result<String, DomainError> {
  let b = raw.as_bytes();
  let mut out = Vec::with_capacity(b.len());
  let mut i = 0;
  while i < b.len() {
    if b[i] == b'%' {
      if i + 2 >= b.len() {
        return Err(DomainError::Validation(
          "invalid percent-encoding in Redis username".into(),
        ));
      }
      let (Some(hi), Some(lo)) = ((b[i + 1] as char).to_digit(16), (b[i + 2] as char).to_digit(16)) else {
        return Err(DomainError::Validation(
          "invalid percent-encoding in Redis username".into(),
        ));
      };
      out.push(((hi << 4) | lo) as u8);
      i += 3;
    } else {
      out.push(b[i]);
      i += 1;
    }
  }
  String::from_utf8(out).map_err(|_| DomainError::Validation("invalid UTF-8 in Redis username".into()))
}

impl RedisRuntimeConfig {
  pub fn from_redis_url(redis_url: &str) -> Result<Self, DomainError> {
    let parsed = url::Url::parse(redis_url).map_err(|_| DomainError::Validation("invalid redis URL".into()))?;
    let host = parsed.host_str().unwrap_or("127.0.0.1").to_owned();
    let port = parsed.port().unwrap_or(6379);
    let db = parsed.path().trim_start_matches('/').parse::<u32>().unwrap_or(0);
    let username = decode_uri_component(parsed.username())?;
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

#[derive(Clone, Default)]
pub struct RuntimeAppConfigBaseline {
  pub server: ServerRuntimeConfig,
  pub redis: RedisRuntimeConfig,
  pub smtp: SmtpRuntimeConfig,
  pub fallback_smtp: SmtpRuntimeConfig,
  pub file_json: Value,
  /// `copilot.storage` read from the nested `copilot.storage` path of the raw config file.
  pub file_copilot_storage: Option<Value>,
  pub env_keys: std::collections::BTreeSet<String>,
  pub redis_configured: bool,
  pub redis_url_env_set: bool,
  pub redis_url_has_password: bool,
}

impl RuntimeAppConfigBaseline {
  pub fn lookup_file_config_value(&self, key: &str) -> Option<&Value> {
    match key {
      "storages.blob.storage" => return self.file_storage_config("blob"),
      "storages.avatar.storage" => return self.file_storage_config("avatar"),
      _ => {}
    }
    let (module, mut rest) = key.split_once('.')?;
    let mut cur = self.file_json.get(module)?;
    loop {
      if let Some(v) = cur.get(rest) {
        return Some(v);
      }
      let (head, tail) = rest.split_once('.')?;
      cur = cur.get(head)?;
      rest = tail;
    }
  }
  pub fn file_storage_config(&self, name: &str) -> Option<&Value> {
    let s = self.file_json.get("storages")?;
    s.get(format!("{name}.storage"))
      .or_else(|| s.get(name)?.get("storage"))
      .filter(|v| !v.is_null())
  }
  pub fn file_copilot_storage_config(&self) -> Option<&Value> {
    self.file_copilot_storage.as_ref().filter(|v| !v.is_null())
  }
}

impl std::fmt::Debug for RuntimeAppConfigBaseline {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("RuntimeAppConfigBaseline")
      .field("server", &self.server)
      .field("redis", &self.redis)
      .field("smtp", &self.smtp)
      .field("fallback_smtp", &self.fallback_smtp)
      .field("file_json", &"<redacted>")
      .field("file_copilot_storage", &"<redacted>")
      .field("env_keys", &self.env_keys)
      .field("redis_configured", &self.redis_configured)
      .field("redis_url_env_set", &self.redis_url_env_set)
      .field("redis_url_has_password", &self.redis_url_has_password)
      .finish()
  }
}

#[derive(Clone, Debug)]
pub struct AppConfigUpdate {
  pub key: String,
  pub value: Option<Value>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppConfigValidationItem {
  pub module: String,
  pub key: String,
  pub value: Option<Value>,
  pub valid: bool,
  pub error: Option<String>,
}

pub fn is_env_only_config_key(key: &str) -> bool {
  is_boot_only_config_key(key) || key == "indexer" || key.starts_with("indexer.")
}

const APP_CONFIG_CACHE_TTL: Duration = Duration::from_secs(2);
const OIDC_DISCOVERY_CACHE_TTL: Duration = Duration::from_secs(60);
const OIDC_DISCOVERY_CACHE_MAX_ENTRIES: usize = 64;

type CachedAppConfig = Option<(Instant, Arc<Value>)>;
type CachedPrivateKey = Option<(u64, Instant, Option<String>)>;
type OidcDiscoveryCache = std::collections::HashMap<(String, bool), (Instant, bool)>;

#[derive(Clone)]
pub struct AppConfigService {
  db: ServerDb,
  baseline: RuntimeAppConfigBaseline,
  event_bus: Arc<dyn EventBusPublisher>,
  cache: Arc<RwLock<CachedAppConfig>>,
  private_key_cache: Arc<RwLock<CachedPrivateKey>>,
  generation: Arc<AtomicU64>,
  oidc_discovery_cache: Arc<RwLock<OidcDiscoveryCache>>,
}

async fn load_named_storage_cfg<'e, E>(
  exec: E,
  baseline: &RuntimeAppConfigBaseline,
  name: &str,
) -> Result<Value, DomainError>
where
  E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
  let prefix = format!("storages.{name}%");
  let rows: Vec<(String, Value)> =
    sqlx::query_as("SELECT id, value FROM app_configs WHERE id = 'storages' OR id LIKE $1 ORDER BY id ASC")
      .bind(prefix)
      .fetch_all(exec)
      .await
      .map_err(|e| DomainError::Internal(format!("load {name} storage app_config: {e}")))?;
  let mut cfg = Value::Object(Map::new());
  if let Some(raw) = baseline.file_storage_config(name) {
    set_nested_path(&mut cfg, &format!("storages.{name}.storage"), raw.clone());
  }
  for (k, v) in rows {
    set_nested_path(&mut cfg, &k, v);
  }
  Ok(cfg)
}

async fn load_blob_storage_cfg<'e, E>(exec: E, baseline: &RuntimeAppConfigBaseline) -> Result<Value, DomainError>
where
  E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
  load_named_storage_cfg(exec, baseline, "blob").await
}

impl AppConfigService {
  pub fn new(db: ServerDb, baseline: RuntimeAppConfigBaseline, event_bus: Arc<dyn EventBusPublisher>) -> Self {
    Self {
      db,
      baseline,
      event_bus,
      cache: Arc::new(RwLock::new(None)),
      private_key_cache: Arc::new(RwLock::new(None)),
      generation: Arc::new(AtomicU64::new(0)),
      oidc_discovery_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
    }
  }

  /// Clears the in-memory `appConfig` snapshot cache and advances the cache
  /// generation so in-flight stale reads cannot overwrite newer commits.
  pub fn invalidate_cache(&self) {
    self.generation.fetch_add(1, Ordering::AcqRel);
    if let Ok(mut guard) = self.cache.write() {
      *guard = None;
    }
    if let Ok(mut guard) = self.private_key_cache.write() {
      *guard = None;
    }
  }

  /// Returns the current monotonic cache generation counter.
  pub fn current_generation(&self) -> u64 {
    self.generation.load(Ordering::Acquire)
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

  /// Returns the cached redacted `appConfig` snapshot as an `Arc<Value>`
  /// without deep-cloning the JSON tree on read-only hot paths.
  pub async fn get_effective_app_config_arc(&self) -> Result<Arc<Value>, DomainError> {
    self.get_cached_effective_app_config().await
  }

  /// Internal backend-only lookup for unredacted `crypto.privateKey`,
  /// preserving exact raw bytes (never `.trim()`). Precedence: non-blank DB
  /// `app_configs` row -> non-blank `config.json` `/crypto/privateKey` -> `None`.
  /// Cached with `self.generation` and `APP_CONFIG_CACHE_TTL`; never exposed over HTTP/GraphQL.
  pub async fn get_internal_private_key(&self) -> Result<Option<String>, DomainError> {
    let gen_before = self.generation.load(Ordering::Acquire);
    if let Ok(guard) = self.private_key_cache.read()
      && let Some((cached_gen, cached_at, ref key)) = *guard
      && cached_gen == gen_before
      && cached_at.elapsed() < APP_CONFIG_CACHE_TTL
    {
      return Ok(key.clone());
    }

    let db_val = self.get_raw_config_value("crypto.privateKey").await?;
    let resolved = db_val
      .as_ref()
      .and_then(Value::as_str)
      .filter(|s| !s.trim().is_empty())
      .map(str::to_owned)
      .or_else(|| {
        self
          .baseline
          .file_json
          .pointer("/crypto/privateKey")
          .and_then(Value::as_str)
          .filter(|s| !s.trim().is_empty())
          .map(str::to_owned)
      });
    if let Ok(mut guard) = self.private_key_cache.write()
      && self.generation.load(Ordering::Acquire) == gen_before
    {
      *guard = Some((gen_before, Instant::now(), resolved.clone()));
    }
    Ok(resolved)
  }

  /// Internal-only reader for the effective `mailer` configuration, merging the
  /// startup baseline with all `app_configs` rows matching `mailer` or
  /// `mailer.%` without secret redaction. Never expose over HTTP or GraphQL.
  pub async fn get_internal_mailer_config(&self) -> Result<Value, DomainError> {
    let baseline = default_app_config_json(&self.baseline);
    let mut root = json!({
      "mailer": baseline.get("mailer").cloned().unwrap_or_else(|| json!({})),
    });
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire app_configs mailer read: {e}")))?;
    let rows =
      sqlx::query("SELECT id, value FROM app_configs WHERE id = 'mailer' OR id LIKE 'mailer.%' ORDER BY id ASC")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("load internal mailer app_configs: {e}")))?;
    for row in rows {
      let key: String = row.get("id");
      let value: Value = row.get("value");
      set_nested_path(&mut root, &key, value);
    }
    Ok(root.get("mailer").cloned().unwrap_or_else(|| json!({})))
  }

  /// Internal-only reader for the startup file baseline `redis.ioredis.keyPrefix`
  /// (falling back to `redis.keyPrefix`), bypassing `SECRET_CONFIG_KEYS` redaction
  /// on `redis.ioredis` and ignoring any legacy `app_configs` `redis.*` rows.
  pub async fn get_internal_redis_key_prefix(&self) -> Result<String, DomainError> {
    let resolved = self
      .baseline
      .lookup_file_config_value("redis.ioredis")
      .and_then(|v| v.get("keyPrefix").and_then(Value::as_str))
      .filter(|s| !s.is_empty())
      .or_else(|| {
        self
          .baseline
          .lookup_file_config_value("redis.keyPrefix")
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
      })
      .unwrap_or("")
      .to_owned();
    Ok(resolved)
  }

  /// Builds the exact `v0.27.5` `appConfig` JSON object by combining runtime
  /// defaults/env baseline with `public.app_configs` overrides and redacting
  /// all secret keys.
  pub async fn get_effective_app_config(&self) -> Result<Value, DomainError> {
    let snapshot = self.get_cached_effective_app_config().await?;
    Ok((*snapshot).clone())
  }

  /// Reads fresh effective `appConfig` from PostgreSQL without preemptively
  /// invalidating the in-memory cache; updates the cached snapshot only if the
  /// query succeeds and no newer invalidation occurred concurrently.
  pub async fn refresh_effective_app_config(&self) -> Result<Value, DomainError> {
    let gen_before = self.generation.load(Ordering::Acquire);
    let snapshot = self.load_effective_app_config_uncached().await?;
    self.store_snapshot_if_generation_matches(gen_before, &snapshot);
    Ok((*snapshot).clone())
  }

  pub fn cache_generation(&self) -> u64 {
    self.generation.load(Ordering::Acquire)
  }
  /// Internal backend-only lookup for a single `app_configs` key (including
  /// secret keys such as `storages.blob.storage` or `telemetry.ga4.apiSecret`).
  /// Never expose the returned value over GraphQL or HTTP responses.
  pub async fn get_raw_config_value(&self, key: &str) -> Result<Option<Value>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire app_configs raw read: {e}")))?;
    let row: Option<Value> = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = $1")
      .bind(key)
      .fetch_optional(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load raw app_config `{key}`: {e}")))?;
    if row.is_some() {
      return Ok(row);
    }
    let baseline = default_app_config_json(&self.baseline);
    let mut cursor = &baseline;
    for seg in key.split('.') {
      let Some(next) = cursor.get(seg) else {
        return Ok(None);
      };
      cursor = next;
    }
    Ok(Some(cursor.clone()))
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
    self
      .update_app_config_with_blob_guard(actor_user_id, updates, false)
      .await
  }
  pub async fn load_effective_blob_storage_config_uncached(&self) -> Result<Option<Value>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire blob storage config read: {e}")))?;
    let cfg = load_blob_storage_cfg(&mut *conn, &self.baseline).await?;
    Ok(cfg.pointer("/storages/blob/storage").filter(|v| !v.is_null()).cloned())
  }
  pub async fn load_effective_avatar_storage_config_uncached(&self) -> Result<Option<Value>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire avatar storage config read: {e}")))?;
    let cfg = load_named_storage_cfg(&mut *conn, &self.baseline, "avatar").await?;
    Ok(
      cfg
        .pointer("/storages/avatar/storage")
        .filter(|v| !v.is_null())
        .cloned(),
    )
  }
  pub async fn load_effective_copilot_storage_config_uncached(&self) -> Result<Option<Value>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire copilot storage config read: {e}")))?;
    let row: Option<Value> = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = 'copilot.storage'")
      .fetch_optional(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load copilot storage app_config: {e}")))?;
    let Some(val) = row
      .filter(|v| !v.is_null())
      .or_else(|| self.baseline.file_copilot_storage_config().cloned())
      .filter(|v| !v.is_null())
    else {
      return Ok(None);
    };
    validate_storage_object_config("copilot.storage", &val)?;
    Ok(Some(val))
  }
  /// Reports whether `app_configs` is absent (`42P01`), as in an empty
  /// database that starts without schema checks.
  pub async fn app_configs_table_missing(&self) -> Result<bool, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire app_configs probe: {e}")))?;
    match sqlx::query("SELECT 1 FROM app_configs LIMIT 0")
      .execute(&mut *conn)
      .await
    {
      Ok(_) => Ok(false),
      Err(sqlx::Error::Database(e)) if e.code().as_deref() == Some("42P01") => Ok(true),
      Err(e) => Err(DomainError::Internal(format!("probe app_configs: {e}"))),
    }
  }
  pub async fn update_app_config_with_blob_guard(
    &self,
    actor_user_id: Option<&str>,
    updates: &[AppConfigUpdate],
    guard_blob_switch: bool,
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
    if guard_blob_switch {
      sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('storages.blob.storage:reload', 0))")
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock blob storage reload: {e}")))?;
    }

    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('app-config-paths', 0))")
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock app-config-paths: {e}")))?;
    let before_blob_cfg = if guard_blob_switch {
      Some(load_blob_storage_cfg(&mut **tx.tx_mut(), &self.baseline).await?)
    } else {
      None
    };
    let mut seen_keys: Vec<String> = Vec::with_capacity(updates.len());
    for update in updates {
      let key = update.key.trim();
      if seen_keys.iter().any(|existing| existing == key) {
        let _ = tx.rollback().await;
        return Err(DomainError::Validation(format!(
          "duplicate app config key in batch: {key:?}"
        )));
      }
      if seen_keys.iter().any(|existing| paths_overlap(existing, key)) {
        let _ = tx.rollback().await;
        return Err(DomainError::Validation(format!(
          "conflicting parent/child app config path in batch: {key:?}"
        )));
      }
      seen_keys.push(key.to_owned());
    }
    let existing_db_keys: Vec<String> = sqlx::query_scalar("SELECT id FROM app_configs")
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load existing app_config keys: {e}")))?;
    let clearing_keys: std::collections::HashSet<&str> = updates
      .iter()
      .filter(|u| u.value.is_none())
      .map(|u| u.key.trim())
      .collect();
    let mut keys = Vec::with_capacity(updates.len());
    for update in updates {
      let key = update.key.trim();
      if update.value.is_some() {
        if is_env_only_config_key(key) {
          let _ = tx.rollback().await;
          return Err(DomainError::Validation(format!(
            "This setting is read at startup and cannot be saved as a database override: {key:?}"
          )));
        }
        validate_mutable_config_key(key)?;
        if existing_db_keys
          .iter()
          .any(|ex| ex != key && !clearing_keys.contains(ex.as_str()) && paths_overlap(ex, key))
        {
          let _ = tx.rollback().await;
          return Err(DomainError::Validation(format!(
            "conflicting parent/child app config path with existing override: {key:?}"
          )));
        }
      } else if key != "indexer" && !key.starts_with("indexer.") {
        validate_mutable_config_key(key)?;
      }
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

    if let Some(before_cfg) = before_blob_cfg {
      let after_cfg = load_blob_storage_cfg(&mut **tx.tx_mut(), &self.baseline).await?;
      let target_key = |v: Option<&Value>| -> Option<(String, String, String, String)> {
        let obj = v?.as_object()?;
        fn raw_s<'a>(o: Option<&'a Map<String, Value>>, k: &str) -> Option<&'a str> {
          o?.get(k)?.as_str()
        }
        let s = |o: Option<&Map<String, Value>>, k: &str| raw_s(o, k).unwrap_or("").trim().to_owned();
        let (prov, cfg) = (
          s(Some(obj), "provider").to_ascii_lowercase(),
          obj.get("config").and_then(Value::as_object),
        );
        if prov.is_empty() {
          return None;
        }
        let bkt = raw_s(Some(obj), "bucket")
          .or_else(|| raw_s(cfg, "bucket"))
          .filter(|x| !x.is_empty())
          .unwrap_or("blobs")
          .to_owned();
        let ep = match prov.as_str() {
          "fs" | "local" | "assetpack" => {
            let root = [s(cfg, "path"), s(cfg, "root")]
              .into_iter()
              .find(|x| !x.is_empty())
              .unwrap_or_else(|| "~/.affine/storage".into());
            match root.strip_prefix("~/") {
              Some(rest) => std::env::var_os("HOME")
                .map(|h| std::path::PathBuf::from(h).join(rest).to_string_lossy().into_owned())
                .unwrap_or(root),
              None => root,
            }
          }
          "cloudflare-r2" | "r2" if s(cfg, "endpoint").is_empty() => {
            let eu = if s(cfg, "jurisdiction") == "eu" { ".eu" } else { "" };
            format!("https://{}{eu}.r2.cloudflarestorage.com", s(cfg, "accountId"))
          }
          _ => s(cfg, "endpoint"),
        };
        Some((prov, bkt, ep, s(cfg, "region")))
      };
      if target_key(before_cfg.pointer("/storages/blob/storage"))
        != target_key(after_cfg.pointer("/storages/blob/storage"))
      {
        let active: bool = sqlx::query_scalar(
          "SELECT EXISTS(SELECT 1 FROM blobs WHERE status = 'pending' AND deleted_at IS NULL \
           AND upload_id IS NOT NULL AND reservation_expires_at > clock_timestamp())",
        )
        .fetch_one(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("check active multipart uploads: {e}")))?;
        if active {
          let _ = tx.rollback().await;
          return Err(DomainError::Conflict(
            "cannot switch storage backend while multipart upload is active".into(),
          ));
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
  pub fn file_metrics_port(&self) -> Option<u16> {
    self
      .baseline
      .lookup_file_config_value("metrics.port")
      .and_then(Value::as_u64)
      .and_then(|p| u16::try_from(p).ok())
  }

  /// Returns nested metadata `{ source, settable, configured? }` for every known
  /// configuration key without ever echoing secret values.
  pub async fn get_app_config_metadata(&self) -> Result<Value, DomainError> {
    let schema_defaults = schema_default_app_config_json(&self.baseline);
    let baseline_defaults = default_app_config_json(&self.baseline);
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire app_configs metadata read: {e}")))?;
    let rows = sqlx::query("SELECT id, value FROM app_configs ORDER BY id ASC")
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load app_configs metadata: {e}")))?;
    drop(conn);
    let mut db_map: std::collections::BTreeMap<String, Value> = std::collections::BTreeMap::new();
    for row in rows {
      let id: String = row.get("id");
      let value: Value = row.get("value");
      db_map.insert(id, value);
    }
    let mut all_keys: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    collect_leaf_paths(&schema_defaults, "", &mut all_keys);
    for &k in SECRET_CONFIG_KEYS {
      all_keys.insert(k.to_owned());
    }
    for &k in NATIVE_MANAGED_CONFIG_KEYS {
      all_keys.insert(k.to_owned());
    }
    for k in db_map.keys() {
      if is_allowed_config_key(k) {
        all_keys.insert(k.clone());
      }
    }
    let env_redis_url_val = std::env::var("REDIS_URL")
      .ok()
      .filter(|v| !v.trim().is_empty())
      .or_else(|| std::env::var("REDIS_SERVER_URL").ok().filter(|v| !v.trim().is_empty()));
    let env_redis_url = self.baseline.redis_url_env_set || env_redis_url_val.is_some();
    let env_redis_url_has_pw = self.baseline.redis_url_has_password
      || env_redis_url_val
        .as_deref()
        .and_then(|u| url::Url::parse(u).ok())
        .and_then(|u| u.password().map(|p| !p.is_empty()))
        .unwrap_or(false);
    let env_non_empty = |var: &str| std::env::var(var).is_ok_and(|v| !v.trim().is_empty());
    let env_private_key = env_non_empty("AFFINE_PRIVATE_KEY");
    let env_db = env_non_empty("DATABASE_URL");
    let mut metadata = Value::Object(Map::new());
    for key in all_keys {
      let is_redis_env =
        key.starts_with("redis.") && key != "redis.ioredis" && is_redis_key_from_env(&self.baseline, &key);
      let is_other_env = self.baseline.env_keys.contains(&key)
        || (env_private_key && key == "crypto.privateKey")
        || (env_db && key == "db.datasourceUrl");
      let in_db = db_map.contains_key(&key);
      let file_entry = self.baseline.lookup_file_config_value(&key);
      let file_val = file_entry.or_else(|| lookup_nested_path(&baseline_defaults, &key));
      let from_file = file_entry.is_some();
      let file_configured = file_entry.is_some_and(is_value_configured);
      let (source, secret_configured) = if is_redis_env {
        let cfg = if key == "redis.password" {
          if env_redis_url {
            env_redis_url_has_pw
          } else {
            self.baseline.env_keys.contains("redis.password") || env_non_empty("REDIS_SERVER_PASSWORD")
          }
        } else {
          true
        };
        ("environment", cfg)
      } else if in_db {
        ("database", db_map.get(&key).is_some_and(is_value_configured))
      } else if key == "crypto.privateKey" {
        if file_configured {
          ("file", true)
        } else if is_other_env {
          ("environment", true)
        } else if from_file {
          ("file", false)
        } else {
          ("default", false)
        }
      } else if from_file {
        ("file", file_val.is_some_and(is_value_configured))
      } else if is_other_env {
        ("environment", true)
      } else {
        ("default", file_val.is_some_and(is_value_configured))
      };
      let settable = !is_env_only_config_key(&key)
        && key != INTERNAL_LOCKED_CONFIG_PREFIX
        && !key.starts_with(&format!("{INTERNAL_LOCKED_CONFIG_PREFIX}."));
      let mut entry = Map::new();
      entry.insert("source".to_owned(), Value::String(source.to_owned()));
      entry.insert("settable".to_owned(), Value::Bool(settable));
      if is_secret_config_key(&key) {
        entry.insert("configured".to_owned(), Value::Bool(secret_configured));
      }
      set_nested_path(&mut metadata, &key, Value::Object(entry));
    }
    Ok(metadata)
  }
  /// Dry-run validation for a batch of app config updates. Performs zero DB writes,
  /// rejects environment-only (`indexer.*`, boot-only) keys, and redacts secret
  /// values and secret error hints.
  pub fn validate_app_config(&self, updates: &[(String, String, Option<Value>, bool)]) -> Vec<AppConfigValidationItem> {
    let defaults = schema_default_app_config_json(&self.baseline);
    let mut known_keys: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    collect_leaf_paths(&defaults, "", &mut known_keys);
    for &k in SECRET_CONFIG_KEYS {
      known_keys.insert(k.to_owned());
    }
    for &k in NATIVE_MANAGED_CONFIG_KEYS {
      known_keys.insert(k.to_owned());
    }
    updates
      .iter()
      .map(|(module, key, value, clear)| {
        let m = module.trim();
        let k = key.trim();
        let full_key = format!("{m}.{k}");
        let is_secret = is_secret_config_key(&full_key);
        let returned_value = if is_secret { None } else { value.clone() };
        let is_known = known_keys.contains(&full_key)
          || lookup_nested_path(&defaults, &full_key).is_some()
          || is_secret
          || NATIVE_MANAGED_CONFIG_KEYS.contains(&full_key.as_str());
        let validation_err = if !is_known {
          Some(format!("Unknown config [{full_key}]"))
        } else if !clear && is_env_only_config_key(&full_key) {
          Some("This setting is read at startup and cannot be saved as a database override".to_owned())
        } else if !clear && value.is_none() {
          Some("A value is required when setting config".to_owned())
        } else if let Err(err) = validate_mutable_config_key(&full_key) {
          Some(err.to_string())
        } else if !clear {
          match value {
            Some(v) => validate_config_value(&full_key, v, &defaults)
              .err()
              .map(|e| e.to_string()),
            None => Some("A value is required when setting config".to_owned()),
          }
        } else {
          None
        };
        let error = validation_err.map(|msg| if is_secret { "Invalid value".to_owned() } else { msg });
        AppConfigValidationItem {
          module: module.clone(),
          key: key.clone(),
          value: returned_value,
          valid: error.is_none(),
          error,
        }
      })
      .collect()
  }
  async fn probe_oidc_discovery(&self, issuer: &str, allow_private_network: bool) -> bool {
    let normalized = issuer.trim().trim_end_matches('/').to_owned();
    let cache_key = (normalized.clone(), allow_private_network);
    if let Ok(guard) = self.oidc_discovery_cache.read()
      && let Some((ts, ok)) = guard.get(&cache_key)
      && ts.elapsed() < OIDC_DISCOVERY_CACHE_TTL
    {
      return *ok;
    }
    let discovery_url = format!("{normalized}/.well-known/openid-configuration");
    let allow_private_origins = allow_private_network
      .then(|| url::Url::parse(&normalized).ok().map(|u| u.origin()))
      .flatten()
      .into_iter()
      .collect();
    let policy = crate::safe_fetch::SafeFetchPolicy {
      allow_http: allow_private_network,
      allow_private_origins,
      timeout: Duration::from_secs(3),
      connect_timeout: Duration::from_secs(3),
      max_redirects: 2,
      max_response_bytes: 64 * 1024,
      ..crate::safe_fetch::SafeFetchPolicy::default()
    };
    let req = crate::safe_fetch::SafeFetchRequest::get(discovery_url).with_policy(policy);
    let is_valid_endpoint = |v: &Value, f: &str| {
      v.get(f)
        .and_then(Value::as_str)
        .map(str::trim)
        .is_some_and(|s| !s.is_empty() && validate_http_url_field(f, s).is_ok())
    };
    let ok = match crate::safe_fetch::safe_fetch(req).await {
      Ok(resp) if resp.status.is_success() => serde_json::from_slice::<Value>(&resp.body).ok().is_some_and(|v| {
        v.get("issuer")
          .and_then(Value::as_str)
          .map(|s| s.trim().trim_end_matches('/'))
          == Some(normalized.as_str())
          && is_valid_endpoint(&v, "authorization_endpoint")
          && is_valid_endpoint(&v, "token_endpoint")
          && is_valid_endpoint(&v, "jwks_uri")
          && is_valid_endpoint(&v, "userinfo_endpoint")
      }),
      _ => false,
    };
    if let Ok(mut guard) = self.oidc_discovery_cache.write() {
      guard.retain(|_, (ts, _)| ts.elapsed() < OIDC_DISCOVERY_CACHE_TTL);
      while guard.len() >= OIDC_DISCOVERY_CACHE_MAX_ENTRIES {
        let Some(oldest) = guard.iter().min_by_key(|(_, (ts, _))| *ts).map(|(k, _)| k.clone()) else {
          break;
        };
        guard.remove(&oldest);
      }
      guard.insert(cache_key, (Instant::now(), ok));
    }
    ok
  }
  /// Reads raw OAuth provider and Turnstile captcha flags from `app_configs`
  /// (falling back to `RuntimeAppConfigBaseline` defaults) without exposing secrets.
  pub async fn get_configured_auth_capabilities(&self) -> Result<ConfiguredAuthCapabilities, DomainError> {
    const KEYS: &[&str] = &[
      "oauth.providers.google",
      "oauth.providers.github",
      "oauth.providers.apple",
      "oauth.providers.oidc",
      "captcha.enabled",
      "captcha.config",
    ];
    let baseline_defaults = default_app_config_json(&self.baseline);
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire app_configs auth capabilities read: {e}")))?;
    let rows = sqlx::query("SELECT id, value FROM app_configs WHERE id = ANY($1)")
      .bind(KEYS)
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load app_configs auth capabilities: {e}")))?;
    drop(conn);
    let mut db_map: std::collections::BTreeMap<String, Value> = std::collections::BTreeMap::new();
    for row in rows {
      let id: String = row.get("id");
      let value: Value = row.get("value");
      db_map.insert(id, value);
    }
    let get_val = |k: &str| {
      db_map
        .get(k)
        .or_else(|| self.baseline.lookup_file_config_value(k))
        .or_else(|| lookup_nested_path(&baseline_defaults, k))
    };
    let mut caps = ConfiguredAuthCapabilities::default();
    if let Some(value) = get_val("oauth.providers.google") {
      caps.oauth_google = has_non_empty_str(value.get("clientId")) && has_non_empty_str(value.get("clientSecret"));
    }
    if let Some(value) = get_val("oauth.providers.github") {
      caps.oauth_github = has_non_empty_str(value.get("clientId")) && has_non_empty_str(value.get("clientSecret"));
    }
    if let Some(value) = get_val("oauth.providers.apple") {
      let has_client = has_non_empty_str(value.get("clientId"));
      let has_secret = has_non_empty_str(value.get("clientSecret"));
      let has_private_key =
        has_non_empty_str(value.pointer("/args/privateKey")) || has_non_empty_str(value.get("applePrivateKey"));
      let has_key_id = has_non_empty_str(value.pointer("/args/keyId")) || has_non_empty_str(value.get("appleKeyId"));
      let has_team_id = has_non_empty_str(value.pointer("/args/teamId")) || has_non_empty_str(value.get("appleTeamId"));
      caps.oauth_apple = has_client && (has_secret || (has_private_key && has_key_id && has_team_id));
    }
    if let Some(value) = get_val("oauth.providers.oidc") {
      let has_client = has_non_empty_str(value.get("clientId"));
      let has_secret = has_non_empty_str(value.get("clientSecret"));
      let allow_private_network = value
        .get("allowPrivateNetwork")
        .and_then(Value::as_bool)
        .unwrap_or(false);
      let issuer = value
        .get("issuer")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|iss| !iss.is_empty() && validate_http_url_field("oauth.providers.oidc.issuer", iss).is_ok());
      if has_client
        && has_secret
        && let Some(iss) = issuer
      {
        caps.oauth_oidc = self.probe_oidc_discovery(iss, allow_private_network).await;
      }
    }
    let captcha_flag = get_val("captcha.enabled").and_then(Value::as_bool).unwrap_or(false);
    let turnstile_configured = get_val("captcha.config").is_some_and(|value| {
      has_non_empty_str(value.pointer("/turnstile/secret")) && has_non_empty_str(value.pointer("/turnstile/siteKey"))
    });
    caps.captcha_enabled = captcha_flag && turnstile_configured;
    Ok(caps)
  }
}

fn paths_overlap(a: &str, b: &str) -> bool {
  a == b
    || (a.len() > b.len() && a.starts_with(b) && a.as_bytes()[b.len()] == b'.')
    || (b.len() > a.len() && b.starts_with(a) && b.as_bytes()[a.len()] == b'.')
}

/// Non-secret auth capabilities derived from `app_configs`.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ConfiguredAuthCapabilities {
  pub oauth_google: bool,
  pub oauth_github: bool,
  pub oauth_apple: bool,
  pub oauth_oidc: bool,
  pub captcha_enabled: bool,
}

fn has_non_empty_str(val: Option<&Value>) -> bool {
  val.and_then(Value::as_str).is_some_and(|s| !s.trim().is_empty())
}

fn collect_leaf_paths(val: &Value, prefix: &str, out: &mut std::collections::BTreeSet<String>) {
  if let Some(obj) = val.as_object() {
    if obj.is_empty() && !prefix.is_empty() {
      out.insert(prefix.to_owned());
      return;
    }
    for (k, v) in obj {
      let next = if prefix.is_empty() {
        k.clone()
      } else {
        format!("{prefix}.{k}")
      };
      collect_leaf_paths(v, &next, out);
    }
  } else if !prefix.is_empty() {
    out.insert(prefix.to_owned());
  }
}

fn is_value_configured(val: &Value) -> bool {
  match val {
    Value::Null => false,
    Value::String(s) => !s.is_empty(),
    Value::Array(arr) => !arr.is_empty(),
    Value::Object(map) => map.values().any(is_value_configured),
    Value::Bool(_) | Value::Number(_) => true,
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
struct AssetpackStorageProviderConfig {
  path: String,
  #[serde(default)]
  precomp2: Option<bool>,
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

pub fn validate_storage_object_config(key: &str, value: &Value) -> Result<(), DomainError> {
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
    "fs" => {
      let cfg: FsStorageProviderConfig = serde_json::from_value(parsed.config).map_err(|err| {
        DomainError::Validation(format!(
          "invalid app config value for `{key}`: invalid fs config ({err})"
        ))
      })?;
      if cfg.path.trim().is_empty() {
        return Err(DomainError::Validation(format!(
          "invalid app config value for `{key}`: config.path must be a non-empty string"
        )));
      }
    }
    "assetpack" => {
      let cfg: AssetpackStorageProviderConfig = serde_json::from_value(parsed.config).map_err(|err| {
        DomainError::Validation(format!(
          "invalid app config value for `{key}`: invalid assetpack config ({err})"
        ))
      })?;
      if cfg.path.trim().is_empty() {
        return Err(DomainError::Validation(format!(
          "invalid app config value for `{key}`: config.path must be a non-empty string"
        )));
      }
      let _ = cfg.precomp2;
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

fn schema_default_app_config_json(baseline: &RuntimeAppConfigBaseline) -> Value {
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

fn is_redis_key_from_env(baseline: &RuntimeAppConfigBaseline, key: &str) -> bool {
  let env_non_empty = |var: &str| std::env::var(var).is_ok_and(|v| !v.trim().is_empty());
  if baseline.redis_url_env_set
    || baseline.env_keys.contains(key)
    || env_non_empty("REDIS_URL")
    || env_non_empty("REDIS_SERVER_URL")
  {
    return true;
  }
  match key {
    "redis.host" => env_non_empty("REDIS_SERVER_HOST"),
    "redis.port" => env_non_empty("REDIS_SERVER_PORT"),
    "redis.username" => env_non_empty("REDIS_SERVER_USERNAME") || env_non_empty("REDIS_SERVER_USER"),
    "redis.password" => env_non_empty("REDIS_SERVER_PASSWORD"),
    "redis.db" => env_non_empty("REDIS_SERVER_DATABASE"),
    _ => false,
  }
}

pub fn default_app_config_json(baseline: &RuntimeAppConfigBaseline) -> Value {
  let mut tree = schema_default_app_config_json(baseline);
  let mut registered = std::collections::BTreeSet::new();
  collect_leaf_paths(&tree, "", &mut registered);
  for key in registered {
    let redis_env = key.starts_with("redis.") && key != "redis.ioredis" && is_redis_key_from_env(baseline, &key);
    if key.contains('.')
      && !redis_env
      && !is_secret_config_key(&key)
      && !matches!(
        key.as_str(),
        "storages.blob.storage" | "storages.avatar.storage" | "storages.comment-attachments.storage"
      )
      && let Some(val) = baseline.lookup_file_config_value(&key)
    {
      set_nested_path(&mut tree, &key, val.clone());
    }
  }
  if baseline.redis_configured {
    set_nested_path(&mut tree, "redis.host", Value::String(baseline.redis.host.clone()));
    set_nested_path(&mut tree, "redis.port", Value::from(baseline.redis.port));
    set_nested_path(&mut tree, "redis.db", Value::from(baseline.redis.db));
    set_nested_path(
      &mut tree,
      "redis.username",
      Value::String(baseline.redis.username.clone()),
    );
  }
  tree
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
      ..Default::default()
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
    for (cfg, valid) in [
      (
        json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": "/var/lib/affine/blobs" } }),
        true,
      ),
      (
        json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": "/var/lib/affine/blobs", "precomp2": true } }),
        true,
      ),
      (
        json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": "/var/lib/affine/blobs", "precomp2": false } }),
        true,
      ),
      (
        json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": "/var/lib/affine/blobs", "precomp2": "false" } }),
        false,
      ),
      (
        json!({ "provider": "assetpack", "bucket": "blobs", "config": { "path": "/var/lib/affine/blobs", "precomp2": 1 } }),
        false,
      ),
      (
        json!({ "provider": "fs", "bucket": "blobs", "config": { "path": "/var/lib/affine/blobs", "precomp2": false } }),
        false,
      ),
    ] {
      assert_eq!(
        validate_config_value("storages.blob.storage", &cfg, &defaults).is_ok(),
        valid,
        "unexpected validation result for {cfg}"
      );
    }
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
