//! Multi-role AFFiNE server binary and reusable library entrypoint.
//!
//! Commercial editions (e.g. `affine-server-pro`) depend on this crate and pass
//! their own `Arc<dyn ServerExtension>` into [`build_app_and_serve`] or
//! [`serve_with_extension`].

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use clap::{Parser, ValueEnum};
use rand::RngCore as _;
use server_blob::{BlobService, LocalFsBlobStorage};
use server_db::phase_a_compat::sessions::PhaseASessionRepository;
use server_db::{DbConfig, DbError, ServerDb};
use server_domain::app_config::{
  AppConfigService, RedisRuntimeConfig, RuntimeAppConfigBaseline, ServerRuntimeConfig, SmtpRuntimeConfig,
};
use server_domain::auth::{AuthConfig, AuthService};
use server_domain::comments::CommentService;
use server_domain::doc_sharing::DocSharingService;
use server_domain::events::{EventBusPublisher, InvalidationPublisher, NoopEventPublisher, RedisEventPublisher};
use server_domain::histories::DocHistoryService;
use server_domain::notifications::NotificationService;
use server_domain::selfhost_license::SelfhostLicenseService;
use server_domain::users::UserService;
use server_domain::workspaces::WorkspaceService;
pub use server_http;
use server_http::{AppServices, AppState, RuntimeConfig, build_router};
use server_mail::{
  MailDeliveryOptions, MailWorkerError, SmtpConfig, SmtpMailer, process_ready_mail_deliveries,
  process_ready_mail_deliveries_with_options,
};
use server_search::{SearchConfig, SearchError, SearchRuntime};
use server_spi::ServerExtension;
use server_sync::auth::{SESSION_COOKIE_NAME, SyncSessionAuthenticator, SyncUser, USER_ID_COOKIE_NAME, parse_cookies};
use server_sync::{SyncConfig, SyncServer};
use server_types::{DeploymentMode, DomainError, ServerRole};
use server_worker::{
  CancellationToken, RedisMutex, WorkerError, WorkerSupervisor, parse_redis_db_index, session_redis_url,
};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum RoleArg {
  Front,
  Graphql,
  Worker,
  Script,
  Allinone,
}

impl From<RoleArg> for ServerRole {
  fn from(value: RoleArg) -> Self {
    match value {
      RoleArg::Front => ServerRole::Front,
      RoleArg::Graphql => ServerRole::Graphql,
      RoleArg::Worker => ServerRole::Worker,
      RoleArg::Script => ServerRole::Script,
      RoleArg::Allinone => ServerRole::Allinone,
    }
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum DeploymentModeArg {
  Selfhosted,
  Cloud,
}

impl From<DeploymentModeArg> for DeploymentMode {
  fn from(value: DeploymentModeArg) -> Self {
    match value {
      DeploymentModeArg::Selfhosted => DeploymentMode::Selfhosted,
      DeploymentModeArg::Cloud => DeploymentMode::Cloud,
    }
  }
}

#[derive(Clone, Parser)]
#[command(name = "affine-server", about = "AFFiNE native server")]
pub struct ServerCli {
  #[arg(long, value_enum, env = "AFFINE_SERVER_ROLE")]
  pub role: Option<RoleArg>,

  #[arg(long, env = "AFFINE_SERVER_HOST", default_value = "127.0.0.1")]
  pub host: IpAddr,

  #[arg(long, env = "LISTEN_ADDR")]
  pub listen_addr: Option<IpAddr>,

  #[arg(long, env = "AFFINE_SERVER_PORT", default_value_t = 3010)]
  pub port: u16,

  #[arg(long, env = "AFFINE_SERVER_EXTERNAL_URL")]
  pub external_url: Option<String>,

  #[arg(long, env = "DATABASE_URL", hide_env_values = true)]
  pub database_url: String,

  #[arg(long, env = "REDIS_URL", hide_env_values = true)]
  pub redis_url: Option<String>,

  #[arg(long, env = "REDIS_SERVER_HOST")]
  pub redis_server_host: Option<String>,

  #[arg(long, env = "REDIS_SERVER_PORT")]
  pub redis_server_port: Option<u16>,

  #[arg(long, env = "REDIS_SERVER_DATABASE")]
  pub redis_server_database: Option<u8>,

  #[arg(long, env = "REDIS_SERVER_USERNAME")]
  pub redis_server_username: Option<String>,

  #[arg(long, env = "REDIS_SERVER_PASSWORD", hide_env_values = true)]
  pub redis_server_password: Option<String>,

  #[arg(long, env = "AFFINE_PRIVATE_KEY", hide_env_values = true)]
  pub private_key: Option<String>,

  #[arg(long, env = "MAILER_HOST")]
  pub mailer_host: Option<String>,

  #[arg(long, env = "MAILER_PORT")]
  pub mailer_port: Option<u16>,

  #[arg(long, env = "MAILER_SERVERNAME")]
  pub mailer_servername: Option<String>,

  #[arg(long, env = "MAILER_SENDER")]
  pub mailer_sender: Option<String>,

  #[arg(long, env = "MAILER_USER")]
  pub mailer_user: Option<String>,

  #[arg(long, env = "MAILER_PASSWORD", hide_env_values = true)]
  pub mailer_password: Option<String>,

  #[arg(long, env = "MAILER_IGNORE_TLS", default_value_t = false)]
  pub mailer_ignore_tls: bool,

  #[arg(long, value_enum, env = "AFFINE_DEPLOYMENT_MODE", default_value_t = DeploymentModeArg::Selfhosted)]
  pub deployment_mode: DeploymentModeArg,

  #[arg(long, env = "AFFINE_CHANNEL")]
  pub channel: Option<String>,

  #[arg(long, env = "AFFINE_SERVER_VERSION", default_value = "0.27.5")]
  pub server_version: String,

  #[arg(long, env = "AFFINE_DB_MAX_CONNECTIONS", default_value_t = 20)]
  pub db_max_connections: u32,

  #[arg(long, env = "AFFINE_DB_STATEMENT_TIMEOUT_MS", default_value_t = 5_000)]
  pub db_statement_timeout_ms: u64,

  #[arg(long, env = "AFFINE_GRAPHQL_PLAYGROUND", default_value_t = false)]
  pub graphql_playground: bool,

  #[arg(long, env = "AFFINE_REDIS_KEY_PREFIX", default_value = "")]
  pub redis_key_prefix: String,

  #[arg(long, env = "AFFINE_SKIP_SCHEMA_CHECK", default_value_t = false)]
  pub skip_schema_check: bool,

  #[arg(
    long,
    env = "AFFINE_INDEXER_ENABLED",
    default_value_t = false,
    num_args = 0..=1,
    default_missing_value = "true",
    require_equals = true,
    action = clap::ArgAction::Set
  )]
  pub search_enabled: bool,

  #[arg(long, env = "AFFINE_INDEXER_PROVIDER", default_value = "embedded")]
  pub search_provider: String,

  #[arg(long, env = "AFFINE_INDEXER_ENDPOINT", default_value = "")]
  pub search_endpoint: String,

  #[arg(long, env = "AFFINE_INDEXER_API_KEY", default_value = "", hide_env_values = true)]
  pub search_api_key: String,

  #[arg(long, env = "AFFINE_INDEXER_USERNAME", default_value = "")]
  pub search_username: String,

  #[arg(long, env = "AFFINE_INDEXER_PASSWORD", default_value = "", hide_env_values = true)]
  pub search_password: String,
  #[arg(long, env = "AFFINE_CONFIG_PATH")]
  pub config_path: Option<PathBuf>,

  #[arg(long, env = "AFFINE_STATIC_DIR")]
  pub static_dir: Option<PathBuf>,

  #[arg(long, env = "OTEL_EXPORTER_PROMETHEUS_PORT")]
  pub metrics_port: Option<u16>,
}

impl Default for ServerCli {
  fn default() -> Self {
    Self {
      role: None,
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      listen_addr: None,
      port: 3010,
      external_url: None,
      database_url: String::new(),
      redis_url: None,
      redis_server_host: None,
      redis_server_port: None,
      redis_server_database: None,
      redis_server_username: None,
      redis_server_password: None,
      private_key: None,
      mailer_host: None,
      mailer_port: None,
      mailer_servername: None,
      mailer_sender: None,
      mailer_user: None,
      mailer_password: None,
      mailer_ignore_tls: false,
      deployment_mode: DeploymentModeArg::Selfhosted,
      channel: None,
      server_version: "0.27.5".to_owned(),
      db_max_connections: 20,
      db_statement_timeout_ms: 5_000,
      graphql_playground: false,
      redis_key_prefix: String::new(),
      skip_schema_check: false,
      search_enabled: false,
      search_provider: "embedded".to_owned(),
      search_endpoint: String::new(),
      search_api_key: String::new(),
      search_username: String::new(),
      search_password: String::new(),
      config_path: None,
      static_dir: None,
      metrics_port: None,
    }
  }
}

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
  #[error("invalid server configuration: {0}")]
  InvalidConfig(String),
  #[error("database error: {0}")]
  Db(#[from] DbError),
  #[error("domain error: {0}")]
  Domain(#[from] DomainError),
  #[error("worker/redis error: {0}")]
  Worker(#[from] WorkerError),
  #[error("mail worker error: {0}")]
  MailWorker(#[from] MailWorkerError),
  #[error("search error: {0}")]
  Search(#[from] SearchError),
  #[error("redis error: {0}")]
  Redis(#[from] redis::RedisError),
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
}

impl std::fmt::Debug for ServerCli {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("ServerCli")
      .field("role", &self.role)
      .field("host", &self.host)
      .field("listen_addr", &self.listen_addr)
      .field("port", &self.port)
      .field("external_url", &self.external_url)
      .field("database_url", &"[REDACTED]")
      .field("redis_url", &self.redis_url.as_ref().map(|_| "[REDACTED]"))
      .field("redis_server_host", &self.redis_server_host)
      .field("redis_server_port", &self.redis_server_port)
      .field(
        "redis_server_password",
        &self.redis_server_password.as_ref().map(|_| "[REDACTED]"),
      )
      .field("private_key", &self.private_key.as_ref().map(|_| "[REDACTED]"))
      .field("mailer_host", &self.mailer_host)
      .field("mailer_port", &self.mailer_port)
      .field("mailer_password", &self.mailer_password.as_ref().map(|_| "[REDACTED]"))
      .field("deployment_mode", &self.deployment_mode)
      .field("channel", &self.channel)
      .field("server_version", &self.server_version)
      .field("db_max_connections", &self.db_max_connections)
      .field("db_statement_timeout_ms", &self.db_statement_timeout_ms)
      .field("graphql_playground", &self.graphql_playground)
      .field("redis_key_prefix", &self.redis_key_prefix)
      .field("skip_schema_check", &self.skip_schema_check)
      .field("search_enabled", &self.search_enabled)
      .field("search_provider", &self.search_provider)
      .field("search_endpoint", &self.search_endpoint)
      .field(
        "search_api_key",
        &if self.search_api_key.is_empty() {
          ""
        } else {
          "[REDACTED]"
        },
      )
      .field("search_username", &self.search_username)
      .field(
        "search_password",
        &if self.search_password.is_empty() {
          ""
        } else {
          "[REDACTED]"
        },
      )
      .finish()
  }
}

#[derive(Default, serde::Deserialize)]
struct AffineConfigFile {
  #[serde(default)]
  server: Option<AffineConfigFileServer>,
  #[serde(default)]
  deployment: Option<AffineConfigFileDeployment>,
  #[serde(default)]
  auth: Option<serde_json::Value>,
  #[serde(default)]
  oauth: Option<serde_json::Value>,
}

#[derive(Debug, Default, serde::Deserialize)]
struct AffineConfigFileServer {
  #[serde(default)]
  name: Option<String>,
  #[serde(default)]
  hosts: Option<Vec<String>>,
}

#[derive(Debug, Default, serde::Deserialize)]
struct AffineConfigFileDeployment {
  #[serde(rename = "type", default)]
  deployment_type: Option<String>,
}

fn insert_dotted_path(target: &mut serde_json::Map<String, serde_json::Value>, path: &str, val: serde_json::Value) {
  if let Some((head, tail)) = path.split_once('.') {
    let entry = target
      .entry(head.to_owned())
      .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    if !entry.is_object() {
      *entry = serde_json::Value::Object(serde_json::Map::new());
    }
    if let Some(map) = entry.as_object_mut() {
      insert_dotted_path(map, tail, val);
    }
  } else {
    target.insert(path.to_owned(), val);
  }
}

pub fn expand_module_config_paths(mut value: serde_json::Value) -> serde_json::Value {
  if let Some(root) = value.as_object_mut() {
    for module in root.values_mut().filter_map(serde_json::Value::as_object_mut) {
      let entries = std::mem::take(module);
      for (path, val) in entries {
        insert_dotted_path(module, &path, val);
      }
    }
  }
  value
}

/// Config file contents: the typed view, the expanded JSON, and the nested
/// `copilot.storage` object of the raw file.
type HomeConfigFile = (AffineConfigFile, serde_json::Value, Option<serde_json::Value>);

fn load_home_config_file(override_path: Option<&std::path::Path>) -> Result<HomeConfigFile, ServerError> {
  let explicit = override_path.map(PathBuf::from).or_else(|| {
    std::env::var_os("AFFINE_CONFIG_PATH")
      .filter(|v| !v.is_empty())
      .map(PathBuf::from)
  });
  let (path, is_explicit) = match explicit {
    Some(p) => (p, true),
    None => match std::env::var_os("HOME") {
      Some(home) => (PathBuf::from(home).join(".affine/config/config.json"), false),
      None => return Ok((AffineConfigFile::default(), serde_json::Value::Null, None)),
    },
  };
  let raw = match std::fs::read_to_string(&path) {
    Ok(raw) => raw,
    Err(err) if !is_explicit && err.kind() == std::io::ErrorKind::NotFound => {
      return Ok((AffineConfigFile::default(), serde_json::Value::Null, None));
    }
    Err(err) => {
      return Err(ServerError::InvalidConfig(format!(
        "failed to read config file {}: {err}",
        path.display()
      )));
    }
  };
  let raw_val = serde_json::from_str::<serde_json::Value>(&raw)
    .map_err(|err| ServerError::InvalidConfig(format!("failed to parse config file {}: {err}", path.display())))?;
  if !raw_val.is_object() {
    return Err(ServerError::InvalidConfig(format!(
      "invalid config file {}: expected JSON object",
      path.display()
    )));
  }
  let invalid_module = |module: &str| {
    ServerError::InvalidConfig(format!(
      "invalid config file {}: {module} must be a JSON object",
      path.display()
    ))
  };
  if raw_val.get("storages").is_some_and(|v| !v.is_null() && !v.is_object()) {
    return Err(invalid_module("storages"));
  }
  let copilot_storage = match raw_val.get("copilot") {
    None | Some(serde_json::Value::Null) => None,
    Some(serde_json::Value::Object(copilot)) => match copilot.get("storage") {
      None | Some(serde_json::Value::Null) => None,
      Some(storage) => {
        let invalid =
          |e: server_types::DomainError| ServerError::InvalidConfig(format!("invalid copilot storage config: {e}"));
        server_domain::app_config::validate_storage_object_config("copilot.storage", storage).map_err(invalid)?;
        server_blob::StorageBackendSpec::from_app_config_json_scoped(storage, "copilot", "copilot")
          .map_err(invalid)?
          .ok_or_else(|| ServerError::InvalidConfig("invalid copilot storage config: missing provider".to_owned()))?;
        Some(storage.clone())
      }
    },
    Some(_) => return Err(invalid_module("copilot")),
  };
  let val = expand_module_config_paths(raw_val);
  Ok((
    serde_json::from_value(val.clone()).unwrap_or_default(),
    val,
    copilot_storage,
  ))
}

fn generate_ephemeral_private_key() -> String {
  let mut bytes = [0u8; 32];
  rand::rng().fill_bytes(&mut bytes);
  let mut hex = String::with_capacity(64);
  for b in bytes {
    use std::fmt::Write as _;
    let _ = write!(&mut hex, "{b:02x}");
  }
  hex
}

/// Returns `true` when `NODE_ENV` is `"development"` (matching `v0.27.5` `env.dev`).
pub fn is_dev_node_env(node_env: Option<&str>) -> bool {
  node_env.is_some_and(|v| v.trim().eq_ignore_ascii_case("development"))
}

/// Resolves the effective `server.path` sub-path. Explicit config file values
/// override the `AFFINE_SERVER_SUB_PATH` environment default.
pub fn resolve_server_sub_path(file_sub_path: Option<String>, env_sub_path: Option<String>) -> String {
  file_sub_path.or(env_sub_path).unwrap_or_default()
}

/// Resolves `(channel, dev_mode)` from `AFFINE_CHANNEL` and `NODE_ENV`.
pub fn effective_runtime_flags(channel_arg: Option<&str>, node_env: Option<&str>) -> (String, bool) {
  let channel = if let Some(ch) = channel_arg.map(str::trim).filter(|s| !s.is_empty()) {
    ch.to_owned()
  } else if node_env.is_some_and(|v| v.trim().eq_ignore_ascii_case("production")) {
    "production".to_owned()
  } else {
    "canary".to_owned()
  };
  let dev_mode = is_dev_node_env(node_env);
  (channel, dev_mode)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct RedisRuntimeConfigFile {
  host: String,
  port: u16,
  db: u8,
  username: String,
  password: String,
  ioredis: RedisIoRuntimeConfigFile,
}

#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct RedisIoRuntimeConfigFile {
  tls: Option<serde_json::Value>,
}

impl Default for RedisRuntimeConfigFile {
  fn default() -> Self {
    Self {
      host: "localhost".to_owned(),
      port: 6379,
      db: 0,
      username: String::new(),
      password: String::new(),
      ioredis: Default::default(),
    }
  }
}

impl RedisRuntimeConfigFile {
  fn validate(&self) -> Result<(), ServerError> {
    if self.port == 0 || self.db > 10 {
      return Err(ServerError::InvalidConfig(
        "redis.port must be positive and redis.db must be at most 10".into(),
      ));
    }
    Ok(())
  }
}

fn non_empty_str(s: &str) -> Option<&str> {
  if s.trim().is_empty() { None } else { Some(s) }
}

impl ServerCli {
  /// Effective listen IP (`LISTEN_ADDR` overrides `AFFINE_SERVER_HOST`).
  pub fn effective_host(&self) -> IpAddr {
    self.listen_addr.unwrap_or(self.host)
  }

  /// Effective deployment channel (`AFFINE_CHANNEL`, else `"production"` when
  /// `NODE_ENV=production`, else `"canary"`).
  pub fn effective_channel(&self) -> String {
    let node_env = std::env::var("NODE_ENV").ok();
    effective_runtime_flags(self.channel.as_deref(), node_env.as_deref()).0
  }

  /// Effective Redis URL, preferring `REDIS_URL` and falling back to
  /// `REDIS_SERVER_HOST` / `REDIS_SERVER_PORT` / `REDIS_SERVER_DATABASE` /
  /// `REDIS_SERVER_USERNAME` / `REDIS_SERVER_PASSWORD`.
  pub fn effective_redis_url(&self) -> Option<String> {
    self
      .effective_redis_url_with_file(&serde_json::Value::Null)
      .ok()
      .flatten()
  }

  /// Effective Redis URL combining CLI/env overrides with file config `redis.*`
  /// fallbacks (`REDIS_URL`/`REDIS_SERVER_URL` > `REDIS_SERVER_*` > file `redis.*`).
  pub fn effective_redis_url_with_file(&self, file_json: &serde_json::Value) -> Result<Option<String>, ServerError> {
    let file_cfg: Option<RedisRuntimeConfigFile> = match file_json.get("redis") {
      None | Some(serde_json::Value::Null) => None,
      Some(v) => {
        let parsed: RedisRuntimeConfigFile =
          serde_json::from_value(v.clone()).map_err(|_| ServerError::InvalidConfig("invalid Redis config".into()))?;
        parsed.validate()?;
        Some(parsed)
      }
    };
    if let Some(url) = self
      .redis_url
      .as_deref()
      .and_then(non_empty_str)
      .map(str::to_owned)
      .or_else(|| std::env::var("REDIS_SERVER_URL").ok().filter(|s| !s.trim().is_empty()))
    {
      let parsed = url::Url::parse(&url).map_err(|_| ServerError::InvalidConfig("invalid Redis URL".into()))?;
      if !matches!(parsed.scheme(), "redis" | "rediss") || parsed.host_str().is_none_or(str::is_empty) {
        return Err(ServerError::InvalidConfig("invalid Redis URL".into()));
      }
      return Ok(Some(parsed.to_string()));
    }
    let env_user_alt = std::env::var("REDIS_SERVER_USER").ok().filter(|s| !s.trim().is_empty());
    let has_cli_env = self.redis_server_host.as_deref().and_then(non_empty_str).is_some()
      || self.redis_server_port.is_some()
      || self.redis_server_database.is_some()
      || self.redis_server_username.as_deref().and_then(non_empty_str).is_some()
      || env_user_alt.is_some()
      || self.redis_server_password.as_deref().and_then(non_empty_str).is_some();
    if !has_cli_env && file_cfg.is_none() {
      return Ok(None);
    }
    let file = file_cfg.unwrap_or_default();
    let host = self
      .redis_server_host
      .as_deref()
      .and_then(non_empty_str)
      .or_else(|| non_empty_str(&file.host));
    let Some(host) = host else {
      return Ok(None);
    };
    let port = self.redis_server_port.unwrap_or(file.port);
    let db = self.redis_server_database.unwrap_or(file.db);
    let username = self
      .redis_server_username
      .as_deref()
      .and_then(non_empty_str)
      .map(str::to_owned)
      .or(env_user_alt)
      .unwrap_or(file.username);
    let password = self
      .redis_server_password
      .as_deref()
      .and_then(non_empty_str)
      .map(str::to_owned)
      .unwrap_or(file.password);
    let scheme = if file.ioredis.tls.is_some() { "rediss" } else { "redis" };
    if host
      .chars()
      .any(|c| c.is_whitespace() || matches!(c, '@' | '/' | '?' | '#'))
    {
      return Err(ServerError::InvalidConfig("invalid Redis host".into()));
    }
    let mut url = url::Url::parse(&format!("{scheme}://{host}:{port}/{db}"))
      .map_err(|_| ServerError::InvalidConfig("invalid Redis host".into()))?;
    if !username.is_empty() {
      let _ = url.set_username(&username);
    }
    if !password.is_empty() {
      let _ = url.set_password(Some(&password));
    }
    Ok(Some(url.to_string()))
  }

  /// Resolves the effective [`ServerRole`], preferring `--role` / `AFFINE_SERVER_ROLE`,
  /// falling back to `SERVER_FLAVOR` (for `v0.27.5` K8s compatibility), and defaulting
  /// to [`ServerRole::Allinone`].
  pub fn resolve_role(&self) -> Result<ServerRole, ServerError> {
    let env_flavor = std::env::var("SERVER_FLAVOR").ok();
    self.resolve_role_with_flavor(env_flavor.as_deref())
  }

  fn resolve_role_with_flavor(&self, server_flavor: Option<&str>) -> Result<ServerRole, ServerError> {
    if let Some(role) = self.role {
      return Ok(role.into());
    }
    match server_flavor.map(str::trim).filter(|s| !s.is_empty()) {
      None => Ok(ServerRole::Allinone),
      Some(raw) => match raw.to_ascii_lowercase().as_str() {
        "front" => Ok(ServerRole::Front),
        "graphql" => Ok(ServerRole::Graphql),
        "worker" => Ok(ServerRole::Worker),
        "script" => Ok(ServerRole::Script),
        "allinone" => Ok(ServerRole::Allinone),
        other => Err(ServerError::InvalidConfig(format!(
          "invalid SERVER_FLAVOR `{other}`: expected one of front, graphql, worker, script, allinone"
        ))),
      },
    }
  }
}

/// Socket.IO handshake authenticator supporting both native Bearer JWT
/// (`handshake.auth = { tokenType: "jwt", token }`) and cookie sessions
/// (`affine_session`), plus `client.versionControl` enforcement.
struct AuthServiceSyncAuthenticator {
  auth: AuthService,
  app_config: AppConfigService,
  channel: String,
}

#[async_trait::async_trait]
impl SyncSessionAuthenticator for AuthServiceSyncAuthenticator {
  async fn authenticate(&self, headers: &http::HeaderMap) -> Result<SyncUser, server_sync::error::SyncError> {
    let allow_canary = self.channel == "canary";
    let (vc_enabled, vc_required) = self.app_config.get_client_version_control().await.map_err(|e| {
      tracing::error!(error = %e, "socketio client.versionControl lookup failed");
      server_sync::error::SyncError::Internal("An internal error occurred.".into())
    })?;
    let vc_cfg = server_http::rest::version_guard::ClientVersionControlConfig {
      enabled: vc_enabled,
      required_version: vc_required,
    };

    let bearer_jwt = headers
      .get(http::header::AUTHORIZATION)
      .and_then(|v| v.to_str().ok())
      .and_then(|raw| {
        let mut parts = raw.split_whitespace();
        let scheme = parts.next()?;
        let token = parts.next()?;
        if parts.next().is_some() || !scheme.eq_ignore_ascii_case("bearer") {
          return None;
        }
        server_domain::auth::access_token::is_likely_jwt(token).then_some(token)
      });

    if let Some(token) = bearer_jwt {
      let principal = self
        .auth
        .resolve_bearer_principal(token)
        .await
        .map_err(|err| match err {
          server_domain::auth::BearerResolutionError::Token(code) => {
            server_sync::error::SyncError::AuthenticationRequired(format!("invalid bearer token ({})", code.as_code()))
          }
          server_domain::auth::BearerResolutionError::Domain(e) => {
            tracing::error!(error = %e, "socketio bearer authentication failed");
            server_sync::error::SyncError::Internal("An internal error occurred.".into())
          }
        })?;
      if vc_cfg.enabled
        && let Err(ver_err) = server_http::rest::version_guard::verify_session_client_version_now(
          headers,
          principal.refresh_client_version.as_deref(),
          principal.sign_in_client_version.as_deref(),
          &vc_cfg,
          allow_canary,
        )
      {
        let _ = self
          .auth
          .revoke_auth_session(
            &principal.auth_session_id,
            Some(&principal.user.id),
            "unsupported_client_version",
          )
          .await;
        let (client_version, required_version) = ver_err.into_parts();
        return Err(server_sync::error::SyncError::UnsupportedClientVersion {
          client_version,
          required_version,
        });
      }
      return Ok(SyncUser {
        id: principal.user.id,
        email: principal.user.email,
        name: principal.user.name,
        session_id: principal.session_id,
      });
    }

    let cookies = parse_cookies(headers);
    let session_id = cookies
      .iter()
      .find(|(k, _)| k == SESSION_COOKIE_NAME)
      .map(|(_, v)| v.as_str())
      .filter(|v| !v.is_empty())
      .ok_or_else(|| server_sync::error::SyncError::AuthenticationRequired("missing affine_session cookie".into()))?;
    let preferred_user_id = cookies
      .iter()
      .find(|(k, _)| k == USER_ID_COOKIE_NAME)
      .map(|(_, v)| v.as_str())
      .filter(|v| !v.is_empty());

    let principal = self
      .auth
      .resolve_cookie_principal(session_id, preferred_user_id, None, false)
      .await
      .map_err(|e| {
        tracing::error!(error = %e, "socketio cookie authentication failed");
        server_sync::error::SyncError::Internal("An internal error occurred.".into())
      })?
      .ok_or_else(|| server_sync::error::SyncError::AuthenticationRequired("invalid or expired session".into()))?;

    if vc_cfg.enabled
      && let Err(ver_err) = server_http::rest::version_guard::verify_session_client_version_now(
        headers,
        principal.refresh_client_version.as_deref(),
        principal.sign_in_client_version.as_deref(),
        &vc_cfg,
        allow_canary,
      )
    {
      let _ = self.auth.sign_out_cookie(&principal.session_id, None).await;
      let (client_version, required_version) = ver_err.into_parts();
      return Err(server_sync::error::SyncError::UnsupportedClientVersion {
        client_version,
        required_version,
      });
    }

    Ok(SyncUser {
      id: principal.user.id,
      email: principal.user.email,
      name: principal.user.name,
      session_id: principal.session_id,
    })
  }
}

struct CopilotRealtimeSpiAdapter(Arc<dyn server_spi::CopilotRealtimeSpi>);

fn map_copilot_realtime_err(err: server_types::DomainError) -> server_sync::error::SyncError {
  match err {
    server_types::DomainError::Forbidden(msg) if msg == "Copilot is disabled." => {
      server_sync::error::SyncError::CopilotDisabled
    }
    server_types::DomainError::Forbidden(msg) => server_sync::error::SyncError::AccessDenied(msg),
    server_types::DomainError::Unauthorized(msg) => server_sync::error::SyncError::AuthenticationRequired(msg),
    server_types::DomainError::Validation(msg)
    | server_types::DomainError::Conflict(msg)
    | server_types::DomainError::PreconditionFailed(msg) => server_sync::error::SyncError::BadRequest(msg),
    server_types::DomainError::NotFound(msg) => server_sync::error::SyncError::BadRequest(msg),
    server_types::DomainError::QuotaExceeded { message, .. } => server_sync::error::SyncError::QuotaExceeded(message),
    server_types::DomainError::RateLimited(msg) => server_sync::error::SyncError::BadRequest(msg),
    server_types::DomainError::Unavailable(msg) | server_types::DomainError::Internal(msg) => {
      server_sync::error::SyncError::Internal(msg)
    }
  }
}

#[async_trait::async_trait]
impl server_sync::storage::CopilotRealtimeHandler for CopilotRealtimeSpiAdapter {
  async fn get_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    blob_id: Option<&str>,
    task_id: Option<&str>,
  ) -> Result<serde_json::Value, server_sync::error::SyncError> {
    self
      .0
      .get_transcript_task(user_id, workspace_id, blob_id, task_id)
      .await
      .map_err(map_copilot_realtime_err)
  }

  async fn retry_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<serde_json::Value, server_sync::error::SyncError> {
    self
      .0
      .retry_transcript_task(user_id, workspace_id, task_id)
      .await
      .map_err(map_copilot_realtime_err)
  }

  async fn authorize_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<(), server_sync::error::SyncError> {
    self
      .0
      .authorize_transcript_task(user_id, workspace_id, task_id)
      .await
      .map_err(map_copilot_realtime_err)
  }

  async fn get_embedding_progress(
    &self,
    user_id: &str,
    workspace_id: &str,
  ) -> Result<serde_json::Value, server_sync::error::SyncError> {
    self
      .0
      .get_embedding_progress(user_id, workspace_id)
      .await
      .map_err(map_copilot_realtime_err)
  }

  async fn authorize_embedding_progress(
    &self,
    user_id: &str,
    workspace_id: &str,
  ) -> Result<(), server_sync::error::SyncError> {
    self
      .0
      .authorize_embedding_progress(user_id, workspace_id)
      .await
      .map_err(map_copilot_realtime_err)
  }

  async fn delegated_editor_upsert(
    &self,
    user_id: &str,
    connection_id: &str,
    input: serde_json::Value,
  ) -> Result<serde_json::Value, server_sync::error::SyncError> {
    self
      .0
      .delegated_editor_upsert(user_id, connection_id, input)
      .await
      .map_err(map_copilot_realtime_err)
  }

  async fn delegated_editor_release(
    &self,
    user_id: &str,
    input: serde_json::Value,
  ) -> Result<serde_json::Value, server_sync::error::SyncError> {
    self
      .0
      .delegated_editor_release(user_id, input)
      .await
      .map_err(map_copilot_realtime_err)
  }

  async fn delegated_tool_respond(
    &self,
    user_id: &str,
    input: serde_json::Value,
  ) -> Result<serde_json::Value, server_sync::error::SyncError> {
    self
      .0
      .delegated_tool_respond(user_id, input)
      .await
      .map_err(map_copilot_realtime_err)
  }
}

/// Fully wired server components ready to bind and serve.
pub struct BuiltServer {
  pub state: Arc<AppState>,
  pub router: Router,
  pub supervisor: WorkerSupervisor,
  pub session_mutex: Option<RedisMutex>,
  pub sync_server: Option<SyncServer>,
  pub role: ServerRole,
}

/// Handle to a running server instance started via [`serve_with_extension`].
pub struct RunningServer {
  pub addr: SocketAddr,
  pub metrics_addr: Option<SocketAddr>,
  pub state: Arc<AppState>,
  pub supervisor: WorkerSupervisor,
  pub session_mutex: Option<RedisMutex>,
  pub shutdown: CancellationToken,
  pub join_handle: JoinHandle<Result<(), ServerError>>,
}

/// Builds the lazy `ServerDb` pool, Redis clients, `Arc<AppState>`, `axum::Router`,
/// optional `SyncServer` (`/socket.io/`), and `WorkerSupervisor` without opening
/// eager DB connections (`min_connections = 0`).
pub async fn build_server(
  cli: &ServerCli,
  ext: Arc<dyn ServerExtension>,
  shutdown: CancellationToken,
) -> Result<BuiltServer, ServerError> {
  build_server_with_bound_port(cli, ext, shutdown, None).await
}

async fn build_server_with_bound_port(
  cli: &ServerCli,
  ext: Arc<dyn ServerExtension>,
  shutdown: CancellationToken,
  bound_port: Option<u16>,
) -> Result<BuiltServer, ServerError> {
  let role = cli.resolve_role()?;
  let channel = cli.effective_channel();
  let bind_host = cli.effective_host();
  let effective_port = bound_port.unwrap_or(cli.port);

  let (file_cfg, file_json, file_copilot_storage) = load_home_config_file(cli.config_path.as_deref())?;
  // Fail-fast on explicitly blank AFFINE_PRIVATE_KEY for HTTP-serving roles;
  // otherwise resolve private key with File > Env priority (below DB override).
  let env_private_key = match cli.private_key.as_deref() {
    Some(raw) if raw.trim().is_empty() => {
      if matches!(role, ServerRole::Allinone | ServerRole::Front | ServerRole::Graphql) {
        return Err(ServerError::InvalidConfig(
          "AFFINE_PRIVATE_KEY must not be empty or whitespace".into(),
        ));
      }
      Some(String::new())
    }
    Some(raw) => Some(raw.to_owned()),
    None => None,
  };
  let file_private_key = file_json
    .pointer("/crypto/privateKey")
    .and_then(|v| v.as_str())
    .filter(|s| !s.trim().is_empty())
    .map(str::to_owned);
  let private_key_from_env_or_file = file_private_key.or(env_private_key);
  let server_name = file_cfg
    .server
    .as_ref()
    .and_then(|s| s.name.clone())
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "AFFiNE".to_owned());
  let server_hosts = file_cfg
    .server
    .as_ref()
    .and_then(|s| s.hosts.clone())
    .unwrap_or_default();
  let deployment_mode = match file_cfg
    .deployment
    .as_ref()
    .and_then(|d| d.deployment_type.as_deref())
    .map(str::trim)
  {
    Some("affine") => DeploymentMode::Cloud,
    Some("selfhosted") => DeploymentMode::Selfhosted,
    _ => cli.deployment_mode.into(),
  };

  let external_url = cli
    .external_url
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.trim_end_matches('/').to_owned())
    .unwrap_or_else(|| format!("http://localhost:{effective_port}"));

  let (https, external_path, allowed_origins) = match url::Url::parse(&external_url) {
    Ok(parsed) => {
      let https = parsed.scheme().eq_ignore_ascii_case("https");
      let path = match parsed.path() {
        "/" | "" => String::new(),
        other => other.trim_end_matches('/').to_owned(),
      };
      let mut origins = vec![parsed.origin().ascii_serialization()];
      let scheme = if https { "https" } else { "http" };
      for host in &server_hosts {
        let host = host.trim().trim_end_matches('/');
        if host.is_empty() {
          continue;
        }
        if host.starts_with("http://") || host.starts_with("https://") {
          origins.push(host.to_owned());
        } else {
          origins.push(format!("{scheme}://{host}"));
        }
      }
      (https, path, origins)
    }
    Err(err) => {
      return Err(ServerError::InvalidConfig(format!(
        "invalid AFFINE_SERVER_EXTERNAL_URL `{external_url}`: {err}"
      )));
    }
  };
  let normalize_sub_path = |raw: &str| -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() || trimmed == "/" {
      None
    } else if trimmed.starts_with('/') {
      Some(trimmed.to_owned())
    } else {
      Some(format!("/{trimmed}"))
    }
  };
  let env_sub_path = std::env::var("AFFINE_SERVER_SUB_PATH")
    .ok()
    .and_then(|s| normalize_sub_path(&s));
  let file_sub_path = file_json
    .pointer("/server/path")
    .and_then(serde_json::Value::as_str)
    .and_then(normalize_sub_path);
  let _ = external_path;
  let external_path = resolve_server_sub_path(file_sub_path, env_sub_path);
  let mut file_json = file_json;
  if !external_path.is_empty() {
    if !file_json.is_object() {
      file_json = serde_json::json!({});
    }
    if let Some(root) = file_json.as_object_mut() {
      let server_obj = root.entry("server".to_owned()).or_insert_with(|| serde_json::json!({}));
      if let Some(s) = server_obj.as_object_mut() {
        s.insert("path".to_owned(), serde_json::Value::String(external_path.clone()));
      }
    }
  }

  let db = ServerDb::connect(DbConfig {
    database_url: cli.database_url.clone(),
    channel: channel.clone(),
    role,
    selfhosted: matches!(deployment_mode, DeploymentMode::Selfhosted),
    max_connections: cli.db_max_connections,
    statement_timeout_ms: cli.db_statement_timeout_ms,
    tier_permits: [16, 8, 4, 2],
  })
  .await?;
  if !cli.skip_schema_check {
    db.ensure_schema_ready().await?;
  }

  let effective_redis_url = cli.effective_redis_url_with_file(&file_json)?;
  let effective_redis_key_prefix = file_json
    .pointer("/redis/ioredis/keyPrefix")
    .or_else(|| file_json.pointer("/redis/keyPrefix"))
    .and_then(serde_json::Value::as_str)
    .filter(|s| !s.is_empty())
    .map(str::to_owned)
    .unwrap_or_else(|| cli.redis_key_prefix.clone());
  let (redis_client, redis_db_index, session_redis_url_str, session_redis_db_index, session_mutex, redis_runtime_cfg) =
    match effective_redis_url.as_deref() {
      Some(url) => {
        let runtime_cfg = RedisRuntimeConfig::from_redis_url(url)?;
        let base_db = parse_redis_db_index(url)?;
        let (session_url, session_db) = session_redis_url(url)?;
        let client = redis::Client::open(url)?;
        let mutex = RedisMutex::new(&session_url, effective_redis_key_prefix)?;
        (
          Some(client),
          base_db,
          Some(session_url),
          session_db,
          Some(mutex),
          runtime_cfg,
        )
      }
      None => (None, 0, None, 2, None, RedisRuntimeConfig::default()),
    };

  let smtp_runtime_cfg = SmtpRuntimeConfig {
    host: cli.mailer_host.clone().unwrap_or_default(),
    port: cli.mailer_port.unwrap_or(465),
    name: cli.mailer_servername.clone().unwrap_or_default(),
    sender: cli.mailer_sender.clone().unwrap_or_default(),
    username: cli.mailer_user.clone().unwrap_or_default(),
    ignore_tls: cli.mailer_ignore_tls,
  };

  let mut env_keys = std::collections::BTreeSet::new();
  let env_redis_url_raw = cli
    .redis_url
    .as_deref()
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(str::to_owned)
    .or_else(|| std::env::var("REDIS_URL").ok().filter(|v| !v.trim().is_empty()))
    .or_else(|| std::env::var("REDIS_SERVER_URL").ok().filter(|v| !v.trim().is_empty()));
  let redis_url_has_password = env_redis_url_raw
    .as_deref()
    .and_then(|u| url::Url::parse(u).ok())
    .and_then(|u| u.password().map(|p| !p.is_empty()))
    .unwrap_or(false);
  if env_redis_url_raw.is_some() {
    for k in [
      "redis.host",
      "redis.port",
      "redis.db",
      "redis.username",
      "redis.password",
    ] {
      env_keys.insert(k.to_owned());
    }
  } else {
    if cli.redis_server_host.as_deref().is_some_and(|s| !s.trim().is_empty()) {
      env_keys.insert("redis.host".to_owned());
    }
    if cli.redis_server_port.is_some() {
      env_keys.insert("redis.port".to_owned());
    }
    if cli.redis_server_database.is_some() {
      env_keys.insert("redis.db".to_owned());
    }
    if cli
      .redis_server_username
      .as_deref()
      .is_some_and(|s| !s.trim().is_empty())
      || std::env::var("REDIS_SERVER_USER").is_ok_and(|v| !v.trim().is_empty())
    {
      env_keys.insert("redis.username".to_owned());
    }
    if cli
      .redis_server_password
      .as_deref()
      .is_some_and(|s| !s.trim().is_empty())
    {
      env_keys.insert("redis.password".to_owned());
    }
  }
  if cli.external_url.as_deref().is_some_and(|s| !s.trim().is_empty()) {
    env_keys.insert("server.externalUrl".to_owned());
  }
  if cli.listen_addr.is_some() {
    env_keys.insert("server.listenAddr".to_owned());
  }
  if cli.mailer_host.as_deref().is_some_and(|s| !s.trim().is_empty()) {
    env_keys.insert("mailer.SMTP.host".to_owned());
  }
  if cli.mailer_port.is_some() {
    env_keys.insert("mailer.SMTP.port".to_owned());
  }
  if cli.mailer_servername.as_deref().is_some_and(|s| !s.trim().is_empty()) {
    env_keys.insert("mailer.SMTP.name".to_owned());
  }
  if cli.mailer_sender.as_deref().is_some_and(|s| !s.trim().is_empty()) {
    env_keys.insert("mailer.SMTP.sender".to_owned());
  }
  if cli.mailer_user.as_deref().is_some_and(|s| !s.trim().is_empty()) {
    env_keys.insert("mailer.SMTP.username".to_owned());
  }
  if cli.mailer_password.as_deref().is_some_and(|s| !s.trim().is_empty()) {
    env_keys.insert("mailer.SMTP.password".to_owned());
  }
  let app_config_baseline = RuntimeAppConfigBaseline {
    server: ServerRuntimeConfig {
      name: server_name.clone(),
      external_url: external_url.clone(),
      host: "localhost".to_owned(),
      hosts: server_hosts,
      https,
      listen_addr: bind_host.to_string(),
      path: external_path,
      port: effective_port,
    },
    redis: redis_runtime_cfg,
    smtp: smtp_runtime_cfg,
    fallback_smtp: SmtpRuntimeConfig::default(),
    file_json,
    file_copilot_storage,
    env_keys,
    redis_configured: effective_redis_url.is_some(),
    redis_url_env_set: env_redis_url_raw.is_some(),
    redis_url_has_password,
    redis_key_prefix: cli.redis_key_prefix.clone(),
  };

  let mut config = RuntimeConfig {
    server_version: cli.server_version.clone(),
    server_name: server_name.clone(),
    external_url: external_url.clone(),
    https,
    channel: channel.clone(),
    dev_mode: is_dev_node_env(std::env::var("NODE_ENV").ok().as_deref()),
    deployment_mode,
    role,
    redis_db_index,
    session_redis_db_index,
    graphql_playground: cli.graphql_playground,
    refresh_retention_secs: server_domain::auth::DEFAULT_REFRESH_RETENTION_SECS,
    smtp_password: cli.mailer_password.clone().unwrap_or_default(),
    app_config_baseline: app_config_baseline.clone(),
    static_dir: cli.static_dir.clone(),
    multipart_part_size: server_blob::MULTIPART_PART_SIZE,
    multipart_threshold: server_blob::MULTIPART_THRESHOLD,
    telemetry_allowed_origins: app_config_baseline
      .file_json
      .pointer("/telemetry/allowedOrigin")
      .and_then(|v| v.as_array())
      .map(|arr| arr.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect())
      .unwrap_or_default(),
    worker_proxy_allow_private_origins: Vec::new(),
    calendar_fallback_private_key: None,
  };

  let origin_channel = format!("v2:{channel}");
  let (invalidation, event_bus, process_origin_id): (
    Arc<dyn InvalidationPublisher>,
    Arc<dyn EventBusPublisher>,
    Option<String>,
  ) = match effective_redis_url.as_deref() {
    Some(url) => {
      let publisher = Arc::new(RedisEventPublisher::new(url, origin_channel)?);
      let origin_id = publisher.origin_id().to_owned();
      (publisher.clone(), publisher, Some(origin_id))
    }
    None => {
      let noop = Arc::new(NoopEventPublisher::default());
      (noop.clone(), noop, None)
    }
  };

  let fallback_private_key = private_key_from_env_or_file.unwrap_or_else(generate_ephemeral_private_key);
  config.calendar_fallback_private_key = Some(fallback_private_key.clone());

  let mut auth_cfg = AuthConfig {
    server_name,
    private_key: fallback_private_key.clone(),
    ..AuthConfig::default()
  };
  if let Some(a) = file_cfg.auth.as_ref() {
    if let Some(v) = a.get("allowSignup").and_then(serde_json::Value::as_bool) {
      auth_cfg.allow_signup = v;
    }
    if let Some(v) = a.get("allowSignupForOauth").and_then(serde_json::Value::as_bool) {
      auth_cfg.allow_signup_for_oauth = v;
    }
    if let Some(v) = a
      .get("requireEmailDomainVerification")
      .and_then(serde_json::Value::as_bool)
    {
      auth_cfg.require_email_domain_verification = v;
    }
    if let Some(v) = a
      .pointer("/passwordRequirements/min")
      .and_then(serde_json::Value::as_u64)
    {
      auth_cfg.password_min_length = v as usize;
    }
    if let Some(v) = a
      .pointer("/passwordRequirements/max")
      .and_then(serde_json::Value::as_u64)
    {
      auth_cfg.password_max_length = v as usize;
    }
    auth_cfg.session_ttl_seconds = server_domain::auth::parse_duration_secs_clamped(
      a.pointer("/session/ttl"),
      auth_cfg.session_ttl_seconds,
      60,
      365 * 86_400,
    );
    auth_cfg.session_ttr_seconds = server_domain::auth::parse_duration_secs_clamped(
      a.pointer("/session/ttr"),
      auth_cfg.session_ttr_seconds,
      0,
      365 * 86_400,
    );
    auth_cfg.access_token_ttl_secs = server_domain::auth::parse_duration_secs_clamped(
      a.pointer("/token/accessTokenTtl"),
      auth_cfg.access_token_ttl_secs,
      server_domain::auth::MIN_ACCESS_TOKEN_TTL_SECS,
      server_domain::auth::MAX_ACCESS_TOKEN_TTL_SECS,
    );
    auth_cfg.refresh_idle_ttl_secs = server_domain::auth::parse_duration_secs_clamped(
      a.pointer("/token/refreshIdleTtl"),
      auth_cfg.refresh_idle_ttl_secs,
      server_domain::auth::MIN_REFRESH_IDLE_TTL_SECS,
      server_domain::auth::MAX_REFRESH_IDLE_TTL_SECS,
    );
    auth_cfg.refresh_absolute_ttl_secs = server_domain::auth::parse_duration_secs_clamped(
      a.pointer("/token/refreshAbsoluteTtl"),
      auth_cfg.refresh_absolute_ttl_secs,
      server_domain::auth::MIN_REFRESH_ABSOLUTE_TTL_SECS,
      server_domain::auth::MAX_REFRESH_ABSOLUTE_TTL_SECS,
    );
    auth_cfg.refresh_grace_secs = server_domain::auth::parse_duration_secs_clamped(
      a.pointer("/token/refreshGracePeriod"),
      auth_cfg.refresh_grace_secs,
      server_domain::auth::MIN_REFRESH_GRACE_SECS,
      server_domain::auth::MAX_REFRESH_GRACE_SECS,
    );
  }
  if let Some(providers) = file_cfg
    .oauth
    .as_ref()
    .and_then(|o| o.get("providers"))
    .and_then(serde_json::Value::as_object)
  {
    for (raw_name, val) in providers {
      let key = raw_name.trim().to_ascii_lowercase();
      if let Ok(cfg) = serde_json::from_value::<server_domain::auth::oauth::OAuthProviderConfig>(val.clone())
        && let Some(norm) = server_domain::auth::oauth::normalize_oauth_provider_config(&key, cfg)
      {
        auth_cfg.oauth_providers.insert(key, norm);
      }
    }
  }
  let auth = AuthService::new(
    db.clone(),
    Arc::new(PhaseASessionRepository),
    ext.session_policy(),
    auth_cfg,
  )
  .with_rate_limit_policy(ext.rate_limit_policy());
  let users = UserService::new(db.clone());
  let licenses = SelfhostLicenseService::new(db.clone(), ext.quota_gate(), Arc::clone(&invalidation));
  let effective_billing: Arc<dyn server_spi::BillingSpi> =
    if deployment_mode == DeploymentMode::Selfhosted && ext.edition_name() == "community" {
      Arc::new(server_domain::selfhost_license::SelfhostLicenseBillingSpi::new(
        licenses.clone(),
      ))
    } else {
      ext.billing_spi()
    };
  let workspaces = WorkspaceService::new(db.clone(), ext.quota_gate(), Arc::clone(&invalidation))
    .with_event_bus(Arc::clone(&event_bus))
    .with_base_url(external_url.clone())
    .with_private_key(fallback_private_key.clone())
    .with_rate_limit_policy(ext.rate_limit_policy())
    .with_billing_spi(effective_billing)
    .with_redis(redis_client.clone());
  let doc_uv_redis_prefix = app_config_baseline
    .lookup_file_config_value("redis.ioredis")
    .and_then(|v| v.get("keyPrefix").and_then(serde_json::Value::as_str))
    .filter(|s| !s.is_empty())
    .or_else(|| {
      app_config_baseline
        .lookup_file_config_value("redis.keyPrefix")
        .and_then(serde_json::Value::as_str)
        .filter(|s| !s.is_empty())
    })
    .unwrap_or("")
    .to_owned();
  let doc_sharing = DocSharingService::new(
    db.clone(),
    ext.quota_gate(),
    Arc::clone(&invalidation),
    Arc::clone(&event_bus),
  )
  .with_redis(redis_client.clone(), doc_uv_redis_prefix);
  let histories = DocHistoryService::new(db.clone(), ext.quota_gate(), doc_sharing.clone());
  let comments = CommentService::new(
    db.clone(),
    ext.quota_gate(),
    doc_sharing.clone(),
    Arc::clone(&event_bus),
  )
  .with_invalidation(Arc::clone(&invalidation))
  .with_base_url(external_url.clone())
  .with_private_key(fallback_private_key.clone());
  let notifications = NotificationService::new(
    db.clone(),
    ext.quota_gate(),
    doc_sharing.clone(),
    Arc::clone(&event_bus),
  )
  .with_base_url(external_url.clone())
  .with_private_key(fallback_private_key.clone());
  let blob_root = std::env::var_os("HOME")
    .map(PathBuf::from)
    .unwrap_or_else(std::env::temp_dir)
    .join(".affine/storage");
  let blob_root_str = blob_root.to_string_lossy();
  let boot_storage = |name: &str, bucket: &str| -> Result<Arc<dyn server_blob::BlobStorageBackend>, ServerError> {
    let scope = if name == "avatar" { "avatar" } else { "blob" };
    if let Some(raw) = app_config_baseline.file_storage_config(name)
      && let Some(spec) = server_blob::StorageBackendSpec::from_app_config_json_scoped(raw, scope, bucket)?
    {
      return spec
        .build()
        .map_err(|e| ServerError::InvalidConfig(format!("invalid {name} storage config: {e}")));
    }
    Ok(Arc::new(LocalFsBlobStorage::new(&blob_root_str, bucket).map_err(
      |e| ServerError::InvalidConfig(format!("invalid {name} storage config: {e}")),
    )?))
  };
  let storage = boot_storage("blob", "blobs")?;
  let avatars = boot_storage("avatar", "avatars")?;
  let comment_attachments = boot_storage("comment-attachments", "comment-attachments")?;
  let copilot_storage: Arc<dyn server_blob::BlobStorageBackend> =
    if let Some(raw) = app_config_baseline.file_copilot_storage_config() {
      let spec = server_blob::StorageBackendSpec::from_app_config_json_scoped(raw, "copilot", "copilot")?
        .ok_or_else(|| ServerError::InvalidConfig("invalid copilot storage config: missing provider".to_owned()))?;
      spec
        .build()
        .map_err(|e| ServerError::InvalidConfig(format!("invalid copilot storage config: {e}")))?
    } else {
      Arc::new(
        LocalFsBlobStorage::new(&blob_root_str, "copilot")
          .map_err(|e| ServerError::InvalidConfig(format!("invalid copilot storage config: {e}")))?,
      )
    };
  let app_config = AppConfigService::new(db.clone(), app_config_baseline, Arc::clone(&event_bus));
  let blobs = BlobService::new(db.clone(), storage, ext.quota_gate());
  if cli.search_enabled && cli.search_provider == "embedded" && role != ServerRole::Allinone {
    return Err(ServerError::InvalidConfig(
      "embedded search provider is in-process and only supported with --role allinone; use elasticsearch/manticoresearch or --search-enabled=false for split roles".to_owned(),
    ));
  }
  let search_cfg = SearchConfig {
    enabled: cli.search_enabled,
    provider: cli.search_provider.clone(),
    endpoint: cli.search_endpoint.clone(),
    api_key: cli.search_api_key.clone(),
    username: cli.search_username.clone(),
    password: cli.search_password.clone(),
    ..SearchConfig::default()
  };
  let search = Arc::new(SearchRuntime::new(db.pool().clone(), ext.quota_gate(), search_cfg)?);

  let state = AppState::with_services(
    db.clone(),
    redis_client,
    config,
    Arc::clone(&ext),
    AppServices {
      auth: auth.clone().with_app_config(app_config.clone()),
      users,
      workspaces: workspaces.with_app_config(app_config.clone()),
      doc_sharing,
      histories,
      comments: comments.with_app_config(app_config.clone()),
      notifications: notifications.with_app_config(app_config.clone()),
      licenses,
      app_config,
      blobs,
      search,
      avatars,
      comment_attachments,
      copilot_storage,
      invalidation,
      event_bus,
    },
  );

  let mut router = build_router(Arc::clone(&state));
  let sync_server = if matches!(role, ServerRole::Allinone | ServerRole::Front) {
    let mut sync_cfg = SyncConfig::for_deployment_channel(&channel);
    sync_cfg.redis_url = effective_redis_url;
    sync_cfg.session_redis_url = session_redis_url_str;
    sync_cfg.origin_id = process_origin_id;
    sync_cfg.deployment_prefix = match deployment_mode {
      DeploymentMode::Selfhosted => "selfhosted".to_owned(),
      DeploymentMode::Cloud => "cloud".to_owned(),
    };
    sync_cfg.external_url = state.config.load().external_url.clone();
    sync_cfg.allowed_origins = allowed_origins;
    sync_cfg.allow_dev_loopback = state.config.load().dev_mode;
    sync_cfg.copilot_realtime = ext
      .copilot_realtime_spi()
      .map(|spi| Arc::new(CopilotRealtimeSpiAdapter(spi)) as Arc<dyn server_sync::storage::CopilotRealtimeHandler>);
    sync_cfg.available_user_features = ext.available_user_features();
    let authenticator = Arc::new(AuthServiceSyncAuthenticator {
      auth: state.auth.clone(),
      app_config: state.app_config.clone(),
      channel: channel.clone(),
    });
    let server = SyncServer::start_with_dependencies(db, authenticator, ext.quota_gate(), sync_cfg).await;
    let sync_router =
      mount_router_with_server_path(server.router(), &state.config.load().app_config_baseline.server.path);
    router = router.merge(sync_router);
    Some(server)
  } else {
    None
  };

  let supervisor = WorkerSupervisor::new(shutdown);

  Ok(BuiltServer {
    state,
    router,
    supervisor,
    session_mutex,
    sync_server,
    role,
  })
}

/// Nests `router` under `server_path` when a non-root subpath prefix (e.g. `"/affine"`) is configured.
fn mount_router_with_server_path(router: Router, server_path: &str) -> Router {
  let trimmed = server_path.trim().trim_end_matches('/');
  if trimmed.is_empty() || trimmed == "/" {
    router
  } else {
    let prefix = if trimmed.starts_with('/') {
      trimmed.to_owned()
    } else {
      format!("/{trimmed}")
    };
    Router::new().nest(&prefix, router)
  }
}

/// Deterministically drains ready `public.mail_deliveries` rows once using the
/// given [`SmtpMailer`], suitable for worker ticks and zero-sleep E2E tests.
pub async fn drain_mail_deliveries_once(db: &ServerDb, mailer: &SmtpMailer) -> Result<usize, ServerError> {
  let worker_id = format!("mail-delivery-{}-{}", std::process::id(), uuid::Uuid::new_v4());
  Ok(process_ready_mail_deliveries(db.pool(), mailer, &worker_id, 50, 120_000).await?)
}

struct AffineWorkspaceMailResolver {
  state: Arc<AppState>,
}

impl server_mail::WorkspaceMailMetaResolver for AffineWorkspaceMailResolver {
  fn resolve_workspace_meta<'a>(
    &'a self,
    workspace_id: &'a str,
  ) -> std::pin::Pin<
    Box<
      dyn std::future::Future<
          Output = Result<Option<server_mail::ResolvedWorkspaceMailMeta>, server_mail::MailWorkerError>,
        > + Send
        + 'a,
    >,
  > {
    Box::pin(async move {
      let meta = server_domain::workspaces::load_workspace_root_meta_from_pool(self.state.db.pool(), workspace_id)
        .await
        .map_err(|err| server_mail::MailWorkerError::Db(sqlx::Error::Protocol(err.to_string())))?;
      let Some((raw_name, avatar_key)) = meta else {
        return Ok(None);
      };
      let name = raw_name.unwrap_or_else(|| "Untitled".to_owned());
      let name_contains_domain = server_domain::content_policy::contains_url_or_domain(&name);
      let avatar = match avatar_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty() && server_blob::validate_blob_key(k).is_ok())
      {
        Some(key) => match self.state.blobs.get_blob(workspace_id, key).await {
          Ok(Some((record, bytes))) if !bytes.is_empty() => Some(server_mail::InlineAttachment {
            content_id: "workspaceAvatar".to_owned(),
            content_type: record.mime,
            data: bytes,
          }),
          _ => None,
        },
        None => None,
      };
      Ok(Some(server_mail::ResolvedWorkspaceMailMeta {
        name,
        avatar,
        name_contains_domain,
      }))
    })
  }
}

async fn load_dynamic_mailers(
  app_config: &AppConfigService,
  startup_smtp: Option<&SmtpConfig>,
) -> Result<Option<(SmtpMailer, Option<SmtpMailer>, Vec<String>)>, server_types::DomainError> {
  let mailer_cfg = app_config.get_internal_mailer_config().await?;
  let raw_smtp = mailer_cfg.get("SMTP");
  let mut cfg = startup_smtp.cloned().unwrap_or_else(|| SmtpConfig {
    port: 465,
    sender: "AFFiNE <noreply@affine.pro>".to_owned(),
    ..SmtpConfig::default()
  });
  if let Some(obj) = raw_smtp.and_then(|v| v.as_object()) {
    if let Some(v) = obj.get("host").and_then(|v| v.as_str()) {
      cfg.host = v.trim().to_owned();
    }
    if let Some(v) = obj
      .get("port")
      .and_then(|v| v.as_u64())
      .and_then(|n| u16::try_from(n).ok())
      .filter(|&p| p > 0)
    {
      cfg.port = v;
    }
    if let Some(v) = obj.get("name").and_then(|v| v.as_str()) {
      cfg.name = v.to_owned();
    }
    if let Some(v) = obj.get("username").and_then(|v| v.as_str()) {
      cfg.username = v.to_owned();
    }
    if let Some(v) = obj.get("password").and_then(|v| v.as_str()) {
      cfg.password = v.to_owned();
    }
    if let Some(v) = obj.get("ignoreTLS").and_then(|v| v.as_bool()) {
      cfg.ignore_tls = v;
    }
    if let Some(v) = obj
      .get("sender")
      .and_then(|v| v.as_str())
      .filter(|s| !s.trim().is_empty())
    {
      cfg.sender = v.to_owned();
    }
  }
  if cfg.host.trim().is_empty() {
    return Ok(None);
  }
  let primary = match SmtpMailer::new(&cfg) {
    Ok(mailer) => mailer,
    Err(err) => {
      tracing::warn!(error = %err, "invalid dynamic primary SMTP configuration");
      return Ok(None);
    }
  };
  let fallback = mailer_cfg
    .get("fallbackSMTP")
    .and_then(|v| serde_json::from_value::<SmtpConfig>(v.clone()).ok())
    .filter(|c| !c.host.trim().is_empty())
    .and_then(|mut c| {
      if c.port == 0 {
        c.port = 465;
      }
      if c.sender.trim().is_empty() {
        c.sender = cfg.sender.clone();
      }
      match SmtpMailer::new(&c) {
        Ok(mailer) => Some(mailer),
        Err(err) => {
          tracing::warn!(error = %err, "invalid dynamic fallback SMTP configuration");
          None
        }
      }
    });
  let fallback_domains = mailer_cfg
    .get("fallbackDomains")
    .and_then(|v| v.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|v| v.as_str().map(str::to_owned))
        .collect::<Vec<_>>()
    })
    .unwrap_or_default();
  Ok(Some((primary, fallback, fallback_domains)))
}

async fn spawn_dynamic_mail_delivery_worker(
  supervisor: &WorkerSupervisor,
  state: Arc<AppState>,
  base_url: String,
  startup_smtp: Option<SmtpConfig>,
) {
  let worker_id = format!("mail-delivery-{}-{}", std::process::id(), uuid::Uuid::new_v4());
  supervisor
    .spawn(move |shutdown| async move {
      // Align with v0.27.5 `@Cron(EVERY_MINUTE)` using a minute-boundary interval ticker.
      let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
      let delay_ms = (60_000 - (now_ms % 60_000)).max(1);
      let mut ticker = tokio::time::interval_at(
        tokio::time::Instant::now() + Duration::from_millis(delay_ms),
        Duration::from_secs(60),
      );
      ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
      let mut last_gen: Option<u64> = None;
      let mut cached_mailers: Option<(SmtpMailer, Option<SmtpMailer>, Vec<String>)> = None;
      let ws_resolver = AffineWorkspaceMailResolver {
        state: Arc::clone(&state),
      };
      loop {
        tokio::select! {
          () = shutdown.cancelled() => break,
          _ = ticker.tick() => {
            let current_gen = state.app_config.current_generation();
            if last_gen != Some(current_gen) {
              match load_dynamic_mailers(&state.app_config, startup_smtp.as_ref()).await {
                Ok(loaded) => {
                  cached_mailers = loaded;
                  last_gen = Some(current_gen);
                }
                Err(err) => {
                  tracing::warn!(error = %err, "failed to load dynamic mailer configuration; will retry on next tick");
                }
              }
            }
            if let Some((mailer, fallback, fallback_domains)) = cached_mailers.as_ref() {
              let opts = MailDeliveryOptions {
                base_url: &base_url,
                fallback_mailer: fallback.as_ref(),
                fallback_domains: fallback_domains.as_slice(),
                workspace_resolver: Some(&ws_resolver),
              };
              if let Err(err) =
                process_ready_mail_deliveries_with_options(state.db.pool(), mailer, &worker_id, 50, 120_000, &opts).await
              {
                tracing::warn!(error = %err, "mail delivery worker tick failed");
              }
            }
          }
        }
      }
    })
    .await;
}

/// Binds the TCP listener (supporting `--port 0`), runs startup schema & keyring
/// readiness checks, and serves until `shutdown` is cancelled, then shuts down
/// `SyncServer` and drains the [`WorkerSupervisor`].
pub async fn serve_with_extension(
  cli: ServerCli,
  ext: Arc<dyn ServerExtension>,
  shutdown: CancellationToken,
) -> Result<RunningServer, ServerError> {
  serve_with_extension_and_init(cli, ext, shutdown, |_| async { Ok(()) }).await
}

/// Like [`serve_with_extension`], but executes `before_serve(&built)` after
/// startup schema and signing-key readiness checks and before `axum::serve`
/// begins accepting requests.
pub async fn serve_with_extension_and_init<F, Fut>(
  cli: ServerCli,
  ext: Arc<dyn ServerExtension>,
  shutdown: CancellationToken,
  before_serve: F,
) -> Result<RunningServer, ServerError>
where
  F: FnOnce(&BuiltServer) -> Fut,
  Fut: std::future::Future<Output = Result<(), ServerError>>,
{
  let bind_addr = SocketAddr::new(cli.effective_host(), cli.port);
  let listener = TcpListener::bind(bind_addr).await?;
  let local_addr = listener.local_addr()?;

  let built = build_server_with_bound_port(&cli, ext, shutdown.clone(), Some(local_addr.port())).await?;
  if !cli.skip_schema_check {
    built
      .state
      .init_blob_storage_from_app_config()
      .await
      .map_err(|e| ServerError::InvalidConfig(format!("invalid blob storage app_config: {e}")))?;
    if matches!(
      built.role,
      ServerRole::Allinone | ServerRole::Front | ServerRole::Graphql
    ) {
      built.state.auth.ensure_signing_keys().await?;
    }
    if matches!(built.role, ServerRole::Allinone | ServerRole::Worker) {
      built.state.search.initialize().await?;
    }
  } else {
    built
      .state
      .init_blob_storage_from_app_config_for_boot(true)
      .await
      .map_err(|e| ServerError::InvalidConfig(format!("invalid blob storage app_config: {e}")))?;
  }

  if !cli.skip_schema_check
    && built.state.config.load().deployment_mode == DeploymentMode::Selfhosted
    && built.role != ServerRole::Script
  {
    built
      .state
      .licenses
      .admit_offline_licenses()
      .await
      .map_err(|err| ServerError::InvalidConfig(format!("startup offline license admission failed: {err}")))?;
  }

  before_serve(&built).await?;

  if built.state.redis.is_some() {
    let cfg_state = Arc::clone(&built.state);
    built
      .supervisor
      .spawn(move |shutdown| async move {
        let stop = Arc::new(tokio::sync::Notify::new());
        let stop_sub = Arc::clone(&stop);
        tokio::select! {
          () = shutdown.cancelled() => {
            stop.notify_waiters();
          }
          () = cfg_state.run_blob_storage_config_subscriber(stop_sub) => {}
        }
      })
      .await;
  }

  if matches!(built.role, ServerRole::Allinone | ServerRole::Worker) {
    built.state.search.spawn_worker_loop(&built.supervisor).await;
    let cleanup_auth = built.state.auth.clone();
    let cleanup_state = Arc::clone(&built.state);
    server_worker::spawn_locked_periodic_task(
      &built.supervisor,
      built.session_mutex.clone(),
      "auth:cleanup:expired-sessions",
      "session-cleanup",
      Duration::from_secs(3600),
      300,
      move |lease_cancel| {
        let auth = cleanup_auth.clone();
        let state = Arc::clone(&cleanup_state);
        async move {
          let fallback = state.config.load().refresh_retention_secs;
          let effective_cfg = match state.app_config.get_effective_app_config().await {
            Ok(cfg) => cfg,
            Err(err) => {
              tracing::warn!(
                error = %err,
                "skipping expired session cleanup tick: failed to load effective app config"
              );
              return;
            }
          };
          let retention_secs = server_domain::auth::parse_refresh_retention_secs(
            effective_cfg.pointer("/auth/token/refreshRetention"),
            fallback,
          );
          if let Err(err) = auth
            .cleanup_expired_sessions_cancellable(1_000, 100, retention_secs, || lease_cancel.is_cancelled())
            .await
          {
            tracing::warn!(error = %err, "expired session cleanup tick failed");
          }
        }
      },
    )
    .await;

    let compactor_db = built.state.db.clone();
    let compactor_quota = built.state.extension.quota_gate();
    let compactor_gauge = Arc::clone(&built.state.pending_doc_updates_gauge);
    server_worker::spawn_locked_periodic_task(
      &built.supervisor,
      built.session_mutex.clone(),
      "doc:compactor:pending-updates",
      "doc-compactor",
      Duration::from_secs(60),
      120,
      move |lease_cancel| {
        let db = compactor_db.clone();
        let quota = Arc::clone(&compactor_quota);
        let gauge = Arc::clone(&compactor_gauge);
        async move {
          if let Err(err) = server_worker::maintenance::record_pending_doc_updates_count(&db, &gauge).await {
            tracing::warn!(error = %err, "failed to record pending doc updates count");
          }
          if let Err(err) =
            server_domain::histories::compact_pending_docs_batch(&db, quota.as_ref(), 100, 500, 600_000, || {
              lease_cancel.is_cancelled()
            })
            .await
          {
            tracing::warn!(error = %err, "doc compaction tick failed");
          }
          if let Err(err) = server_worker::maintenance::record_pending_doc_updates_count(&db, &gauge).await {
            tracing::warn!(error = %err, "failed to record pending doc updates count");
          }
        }
      },
    )
    .await;

    let hk_state = Arc::clone(&built.state);
    server_worker::spawn_locked_periodic_task(
      &built.supervisor,
      built.session_mutex.clone(),
      "housekeeping:expired-records",
      "housekeeping",
      Duration::from_secs(1800),
      300,
      move |lease_cancel| {
        let state = Arc::clone(&hk_state);
        async move {
          if !lease_cancel.is_cancelled()
            && let Err(err) = server_domain::histories::cleanup_expired_snapshot_histories(&state.db, 1_000).await
          {
            tracing::warn!(error = %err, "expired snapshot_histories cleanup failed");
          }
          if !lease_cancel.is_cancelled()
            && let Err(err) =
              server_worker::maintenance::cleanup_expired_runtime_housekeeping(&state.db, 1_000, &lease_cancel).await
          {
            tracing::warn!(error = %err, "expired runtime housekeeping failed");
          }
        }
      },
    )
    .await;

    for (lock, name, every, ttl) in [
      ("doc:lifecycle-migrations", "doc-lifecycle", 30_u64, 120_u64),
      ("notification:housekeeping", "notification-housekeeping", 3600, 300),
      ("mail:housekeeping", "mail-housekeeping", 300, 180),
      ("workspace:stats:refresh-dirty", "workspace-stats-dirty", 60, 180),
      (
        "workspace:stats:recalibrate",
        "workspace-stats-recalibrate",
        86_400,
        600,
      ),
    ] {
      let state = Arc::clone(&built.state);
      let mtx = built.session_mutex.clone();
      server_worker::spawn_locked_periodic_task(
        &built.supervisor,
        mtx,
        lock,
        name,
        Duration::from_secs(every),
        ttl,
        move |c| {
          let state = Arc::clone(&state);
          async move {
            use server_worker::maintenance as m;
            let res: Result<(), server_types::DomainError> = match name {
              "doc-lifecycle" => {
                m::advance_workspace_lifecycle_migrations(&state.db, 100, Some(state.invalidation.as_ref()), &c)
                  .await
                  .map(|_| ())
              }
              "notification-housekeeping" => {
                m::cleanup_expired_notifications(&state.db, 365, 1_000, Some(state.event_bus.as_ref()), &c)
                  .await
                  .map(|_| ())
              }
              "mail-housekeeping" => {
                let raw = state
                  .app_config
                  .get_raw_config_value("mailer.deliveryWorker.retentionDays")
                  .await;
                let retention = raw
                  .ok()
                  .flatten()
                  .and_then(|v| i32::try_from(v.as_i64()?).ok())
                  .unwrap_or(30);
                m::cleanup_mail_deliveries_and_skip_disabled(&state.db, retention, 1_000, &c)
                  .await
                  .map(|_| ())
              }
              "workspace-stats-dirty" => m::refresh_dirty_workspace_stats(&state.db, 500, &c).await.map(|_| ()),
              "workspace-stats-recalibrate" => m::recalibrate_workspace_stats(&state.db, 1_000, &c).await.map(|_| ()),
              _ => Ok(()),
            };
            if let Err(err) = res {
              tracing::warn!(task = name, error = %err, "periodic maintenance task failed");
            }
          }
        },
      )
      .await;
    }

    let storage_state = Arc::clone(&built.state);
    server_worker::spawn_locked_periodic_task(
      &built.supervisor,
      built.session_mutex.clone(),
      "storage:orphan-reconcile",
      "storage-reconcile",
      Duration::from_secs(60),
      300,
      move |lease_cancel| {
        let state = Arc::clone(&storage_state);
        async move {
          let cancelled = || lease_cancel.is_cancelled();
          if !cancelled()
            && let Err(err) = state.blobs.cleanup_expired_reservations(1_000, &cancelled).await
          {
            tracing::warn!(error = %err, "expired storage reservation cleanup failed");
          }
          if !cancelled()
            && let Err(err) = state.blobs.reconcile_storage_orphans(250, &cancelled).await
          {
            tracing::warn!(error = %err, "storage orphan reconciliation failed");
          }
        }
      },
    )
    .await;

    let cal_svc = built.state.calendar.clone();
    server_worker::spawn_locked_periodic_task(
      &built.supervisor,
      built.session_mutex.clone(),
      "calendar:sync-poll",
      "calendar-sync",
      Duration::from_secs(60),
      120,
      move |lease_cancel| {
        let svc = cal_svc.clone();
        async move {
          if !lease_cancel.is_cancelled()
            && let Err(err) = server_domain::calendar::sync::poll_due_calendar_subscriptions(&svc).await
          {
            tracing::warn!(error = %err, "calendar sync poll tick failed");
          }
        }
      },
    )
    .await;

    if built.state.config.load().deployment_mode == DeploymentMode::Selfhosted {
      let startup_licenses = built.state.licenses.clone();
      built
        .supervisor
        .spawn(move |shutdown| async move {
          if shutdown.is_cancelled() {
            return;
          }
          if let Err(err) = startup_licenses.check_licenses().await {
            tracing::warn!(error = %err, "initial selfhost license health check failed");
          }
        })
        .await;
      let health_licenses = built.state.licenses.clone();
      server_worker::spawn_locked_periodic_task(
        &built.supervisor,
        built.session_mutex.clone(),
        "license:health-check",
        "license-health-check",
        Duration::from_secs(3600),
        300,
        move |lease_cancel| {
          let licenses = health_licenses.clone();
          async move {
            if !lease_cancel.is_cancelled()
              && let Err(err) = licenses.check_licenses().await
            {
              tracing::warn!(error = %err, "selfhost license health check tick failed");
            }
          }
        },
      )
      .await;
    }
  }

  if matches!(built.role, ServerRole::Allinone | ServerRole::Worker) {
    let startup_smtp = cli
      .mailer_host
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .map(|host| SmtpConfig {
        name: cli.mailer_servername.clone().unwrap_or_default(),
        host: host.to_owned(),
        port: cli.mailer_port.unwrap_or(465),
        username: cli.mailer_user.clone().unwrap_or_default(),
        password: cli.mailer_password.clone().unwrap_or_default(),
        ignore_tls: cli.mailer_ignore_tls,
        sender: cli
          .mailer_sender
          .clone()
          .filter(|s| !s.trim().is_empty())
          .unwrap_or_else(|| "AFFiNE <noreply@affine.pro>".to_owned()),
      });
    spawn_dynamic_mail_delivery_worker(
      &built.supervisor,
      Arc::clone(&built.state),
      built.state.config.load().external_url.clone(),
      startup_smtp,
    )
    .await;
  }

  built
    .state
    .configure_metrics_listener(cli.effective_host(), cli.metrics_port, built.role != ServerRole::Script);
  let metrics_addr = match built.state.reconcile_metrics_listener().await {
    Ok(a) => a,
    Err(e) if cli.skip_schema_check => {
      tracing::warn!(error = %e, "metrics reconcile skipped");
      None
    }
    Err(e) => return Err(e.into()),
  };

  tracing::info!(
    addr = %local_addr,
    role = ?built.role,
    edition = built.state.extension.edition_name(),
    "affine-server listening"
  );

  let state_ret = Arc::clone(&built.state);
  let state_shutdown = Arc::clone(&built.state);
  let supervisor_ret = built.supervisor.clone();
  let session_mutex_ret = built.session_mutex.clone();
  let shutdown_ret = shutdown.clone();

  let supervisor_task = built.supervisor;
  let sync_server = built.sync_server;
  let sync_engine = sync_server.as_ref().map(|s| Arc::clone(s.engine()));
  let router = built.router;

  let join_handle = tokio::spawn(async move {
    let serve_res = axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>())
      .with_graceful_shutdown(async move {
        shutdown.cancelled().await;
        if let Some(engine) = sync_engine {
          engine.close_all_sessions().await;
        }
      })
      .await;
    if let Some(sync) = sync_server {
      sync.shutdown().await;
    }
    let released = supervisor_task.drain(Duration::from_secs(5)).await;
    state_shutdown.stop_metrics_listener().await;
    tracing::info!(released_locks = released, "affine-server drained");
    serve_res.map_err(ServerError::Io)
  });

  Ok(RunningServer {
    addr: local_addr,
    metrics_addr,
    state: state_ret,
    supervisor: supervisor_ret,
    session_mutex: session_mutex_ret,
    shutdown: shutdown_ret,
    join_handle,
  })
}

/// Top-level CLI entrypoint used by `affine-server` and `affine-server-pro`.
pub async fn build_app_and_serve(cli: ServerCli, ext: Arc<dyn ServerExtension>) -> Result<(), ServerError> {
  let shutdown = CancellationToken::new();
  let running = serve_with_extension(cli, ext, shutdown.clone()).await?;
  println!("AFFINE_SERVER_LISTENING={}", running.addr);

  let signal_token = shutdown.clone();
  tokio::spawn(async move {
    wait_for_shutdown_signal().await;
    tracing::info!("shutdown signal received");
    signal_token.cancel();
  });

  match running.join_handle.await {
    Ok(res) => res,
    Err(err) => Err(ServerError::Io(std::io::Error::other(err.to_string()))),
  }
}

async fn wait_for_shutdown_signal() {
  let ctrl_c = async {
    let _ = tokio::signal::ctrl_c().await;
  };

  #[cfg(unix)]
  let terminate = async {
    if let Ok(mut sigterm) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
      sigterm.recv().await;
    } else {
      std::future::pending::<()>().await;
    }
  };

  #[cfg(not(unix))]
  let terminate = std::future::pending::<()>();

  tokio::select! {
    () = ctrl_c => {}
    () = terminate => {}
  }
}

#[cfg(test)]
mod tests {
  use std::net::Ipv4Addr;

  use super::*;

  fn cli_with_role(role: Option<RoleArg>) -> ServerCli {
    ServerCli {
      role,
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: "postgres://localhost/affine".into(),
      channel: Some("canary".into()),
      db_max_connections: 4,
      skip_schema_check: true,
      ..ServerCli::default()
    }
  }

  #[test]
  fn resolve_role_supports_explicit_flag_server_flavor_fallback_and_rejects_unknown() {
    // Explicit --role / AFFINE_SERVER_ROLE overrides SERVER_FLAVOR.
    assert_eq!(
      cli_with_role(Some(RoleArg::Graphql))
        .resolve_role_with_flavor(Some("worker"))
        .unwrap(),
      ServerRole::Graphql
    );

    // Fallback to SERVER_FLAVOR when --role is unset.
    for (raw, expected) in [
      (None, ServerRole::Allinone),
      (Some(""), ServerRole::Allinone),
      (Some("front"), ServerRole::Front),
      (Some("graphql"), ServerRole::Graphql),
      (Some("worker"), ServerRole::Worker),
      (Some("WORKER"), ServerRole::Worker),
      (Some("script"), ServerRole::Script),
      (Some("allinone"), ServerRole::Allinone),
    ] {
      assert_eq!(
        cli_with_role(None).resolve_role_with_flavor(raw).unwrap(),
        expected,
        "SERVER_FLAVOR={raw:?}"
      );
    }

    // Unknown SERVER_FLAVOR fails fast with InvalidConfig.
    let err = cli_with_role(None)
      .resolve_role_with_flavor(Some("bogus"))
      .expect_err("unknown SERVER_FLAVOR must fail");
    assert!(
      matches!(err, ServerError::InvalidConfig(ref msg) if msg.contains("bogus")),
      "unexpected error: {err}"
    );
  }

  #[test]
  fn server_cli_debug_redacts_secrets_and_composes_redis_url() {
    let mut cli = cli_with_role(Some(RoleArg::Allinone));
    cli.database_url = "postgres://admin:super_secret_pg_pw@db.internal:5432/affine".into();
    cli.redis_url = Some("redis://:super_secret_redis_pw@redis.internal:6379/0".into());
    cli.private_key = Some("super_secret_private_key".into());
    cli.mailer_password = Some("super_secret_smtp_pw".into());

    let rendered = format!("{cli:?}");
    for secret in [
      "super_secret_pg_pw",
      "super_secret_redis_pw",
      "super_secret_private_key",
      "super_secret_smtp_pw",
    ] {
      assert!(!rendered.contains(secret), "leaked secret `{secret}`: {rendered}");
    }
    assert!(rendered.contains("[REDACTED]"));

    let mut host_port_cli = cli_with_role(Some(RoleArg::Allinone));
    host_port_cli.redis_server_host = Some("127.0.0.1".into());
    host_port_cli.redis_server_port = Some(6389);
    assert_eq!(
      host_port_cli.effective_redis_url().as_deref(),
      Some("redis://127.0.0.1:6389/0")
    );
  }

  #[tokio::test]
  async fn blank_private_key_fails_fast_on_http_roles() {
    let mut cli = cli_with_role(Some(RoleArg::Allinone));
    cli.private_key = Some("   ".into());
    let err = match build_server(
      &cli,
      Arc::new(server_spi::CommunityExtension::new()),
      CancellationToken::new(),
    )
    .await
    {
      Ok(_) => panic!("expected InvalidConfig for blank AFFINE_PRIVATE_KEY"),
      Err(err) => err,
    };
    assert!(matches!(err, ServerError::InvalidConfig(_)), "got {err:?}");
  }

  #[test]
  fn effective_runtime_flags_uses_node_env_for_dev_mode_not_channel() {
    let (dev_channel, dev_mode) = effective_runtime_flags(None, Some("development"));
    assert_eq!(dev_channel, "canary");
    assert!(dev_mode);
    let dev_matrix =
      server_http::RouteMountMatrix::for_mode_and_role(DeploymentMode::Cloud, dev_mode, ServerRole::Allinone);
    assert!(!dev_matrix.worker_proxy);
    assert!(!dev_matrix.selfhost_setup);

    let selfhost_matrix =
      server_http::RouteMountMatrix::for_mode_and_role(DeploymentMode::Selfhosted, false, ServerRole::Allinone);
    assert!(selfhost_matrix.worker_proxy);
    assert!(selfhost_matrix.selfhost_setup);

    let (prod_channel, prod_dev_mode) = effective_runtime_flags(Some("dev"), Some("production"));
    assert_eq!(prod_channel, "dev");
    assert!(!prod_dev_mode);
    let prod_matrix =
      server_http::RouteMountMatrix::for_mode_and_role(DeploymentMode::Cloud, prod_dev_mode, ServerRole::Allinone);
    assert!(!prod_matrix.worker_proxy);
    assert!(!prod_matrix.selfhost_setup);
  }

  #[tokio::test]
  async fn sync_router_mounts_under_server_path_prefix() {
    use axum::routing::get;
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

    let fake_sync = Router::new().route("/socket.io/", get(|| async { "ok" }));
    let nested = mount_router_with_server_path(fake_sync, "/affine");

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
      let _ = axum::serve(listener, nested).await;
    });

    let get_status = |path: &str| {
      let req = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
      async move {
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut buf = String::new();
        stream.read_to_string(&mut buf).await.unwrap();
        buf.lines().next().unwrap_or("").to_owned()
      }
    };

    let prefixed_line = get_status("/affine/socket.io/?EIO=4&transport=polling").await;
    assert!(prefixed_line.contains(" 200 "), "got: {prefixed_line}");

    let root_line = get_status("/socket.io/?EIO=4&transport=polling").await;
    assert!(root_line.contains(" 404 "), "got: {root_line}");
    server.abort();
  }
}
