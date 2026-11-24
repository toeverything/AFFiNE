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
use server_http::{AppServices, AppState, RuntimeConfig, build_router};
use server_mail::{MailWorkerError, SmtpConfig, SmtpMailer, process_ready_mail_deliveries};
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
      .finish()
  }
}

#[derive(Debug, Default, serde::Deserialize)]
struct AffineConfigFile {
  #[serde(default)]
  server: Option<AffineConfigFileServer>,
  #[serde(default)]
  deployment: Option<AffineConfigFileDeployment>,
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

fn load_home_config_file() -> AffineConfigFile {
  let Some(home) = std::env::var_os("HOME") else {
    return AffineConfigFile::default();
  };
  let path = PathBuf::from(home).join(".affine/config/config.json");
  let Ok(raw) = std::fs::read_to_string(&path) else {
    return AffineConfigFile::default();
  };
  serde_json::from_str(&raw).unwrap_or_default()
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

impl ServerCli {
  /// Effective listen IP (`LISTEN_ADDR` overrides `AFFINE_SERVER_HOST`).
  pub fn effective_host(&self) -> IpAddr {
    self.listen_addr.unwrap_or(self.host)
  }

  /// Effective deployment channel (`AFFINE_CHANNEL`, else `"production"` when
  /// `NODE_ENV=production`, else `"canary"`).
  pub fn effective_channel(&self) -> String {
    if let Some(ch) = self.channel.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
      return ch.to_owned();
    }
    if std::env::var("NODE_ENV")
      .ok()
      .is_some_and(|v| v.trim().eq_ignore_ascii_case("production"))
    {
      return "production".to_owned();
    }
    "canary".to_owned()
  }

  /// Effective Redis URL, preferring `REDIS_URL` and falling back to
  /// `REDIS_SERVER_HOST` / `REDIS_SERVER_PORT` / `REDIS_SERVER_DATABASE` /
  /// `REDIS_SERVER_USERNAME` / `REDIS_SERVER_PASSWORD`.
  pub fn effective_redis_url(&self) -> Option<String> {
    if let Some(url) = self.redis_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
      return Some(url.to_owned());
    }
    let host = self
      .redis_server_host
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())?;
    let port = self.redis_server_port.unwrap_or(6379);
    let db = self.redis_server_database.unwrap_or(0);
    let user = self
      .redis_server_username
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty());
    let pass = self
      .redis_server_password
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty());
    let auth = match (user, pass) {
      (Some(u), Some(p)) => format!("{u}:{p}@"),
      (Some(u), None) => format!("{u}@"),
      (None, Some(p)) => format!(":{p}@"),
      (None, None) => String::new(),
    };
    Some(format!("redis://{auth}{host}:{port}/{db}"))
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

/// Socket.IO handshake authenticator backed by [`AuthService::resolve_cookie_principal`]
/// so revoked `auth_sessions` and disabled users are rejected identically on HTTP and WS.
struct AuthServiceSyncAuthenticator {
  auth: AuthService,
}

#[async_trait::async_trait]
impl SyncSessionAuthenticator for AuthServiceSyncAuthenticator {
  async fn authenticate(&self, headers: &http::HeaderMap) -> Result<SyncUser, server_sync::error::SyncError> {
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

    Ok(SyncUser {
      id: principal.user.id,
      email: principal.user.email,
      name: principal.user.name,
      session_id: principal.session_id,
    })
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

  // Fail-fast on explicitly blank AFFINE_PRIVATE_KEY for HTTP-serving roles.
  let private_key = match cli.private_key.as_deref() {
    Some(raw) if raw.trim().is_empty() => {
      if matches!(role, ServerRole::Allinone | ServerRole::Front | ServerRole::Graphql) {
        return Err(ServerError::InvalidConfig(
          "AFFINE_PRIVATE_KEY must not be empty or whitespace".into(),
        ));
      }
      String::new()
    }
    Some(raw) => raw.to_owned(),
    None => generate_ephemeral_private_key(),
  };

  let file_cfg = load_home_config_file();
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

  let effective_redis_url = cli.effective_redis_url();
  let (redis_client, redis_db_index, session_redis_url_str, session_redis_db_index, session_mutex, redis_runtime_cfg) =
    match effective_redis_url.as_deref() {
      Some(url) => {
        let base_db = parse_redis_db_index(url)?;
        let (session_url, session_db) = session_redis_url(url)?;
        let client = redis::Client::open(url)?;
        let mutex = RedisMutex::new(&session_url, cli.redis_key_prefix.clone())?;
        let runtime_cfg = RedisRuntimeConfig::from_redis_url(url)?;
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
  };

  let config = RuntimeConfig {
    server_version: cli.server_version.clone(),
    server_name: server_name.clone(),
    external_url: external_url.clone(),
    https,
    deployment_mode,
    role,
    redis_db_index,
    session_redis_db_index,
    graphql_playground: cli.graphql_playground,
    refresh_retention_secs: server_domain::auth::DEFAULT_REFRESH_RETENTION_SECS,
    smtp_password: cli.mailer_password.clone().unwrap_or_default(),
    app_config_baseline: app_config_baseline.clone(),
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

  let auth_cfg = AuthConfig {
    server_name,
    private_key,
    ..AuthConfig::default()
  };
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
    .with_rate_limit_policy(ext.rate_limit_policy())
    .with_billing_spi(effective_billing)
    .with_redis(redis_client.clone());
  let doc_sharing = DocSharingService::new(
    db.clone(),
    ext.quota_gate(),
    Arc::clone(&invalidation),
    Arc::clone(&event_bus),
  );
  let histories = DocHistoryService::new(db.clone(), ext.quota_gate(), doc_sharing.clone());
  let comments = CommentService::new(
    db.clone(),
    ext.quota_gate(),
    doc_sharing.clone(),
    Arc::clone(&event_bus),
  )
  .with_invalidation(Arc::clone(&invalidation));
  let notifications = NotificationService::new(
    db.clone(),
    ext.quota_gate(),
    doc_sharing.clone(),
    Arc::clone(&event_bus),
  );
  let app_config = AppConfigService::new(db.clone(), app_config_baseline, Arc::clone(&event_bus));
  let blob_root = std::env::var_os("HOME")
    .map(PathBuf::from)
    .unwrap_or_else(std::env::temp_dir)
    .join(".affine/storage");
  let blob_root_str = blob_root.to_string_lossy();
  let storage = LocalFsBlobStorage::new(&blob_root_str, "blobs")
    .map_err(|e| ServerError::InvalidConfig(format!("invalid blob storage config: {e}")))?;
  let avatars: Arc<dyn server_blob::BlobStorageBackend> = Arc::new(
    LocalFsBlobStorage::new(&blob_root_str, "avatars")
      .map_err(|e| ServerError::InvalidConfig(format!("invalid avatar storage config: {e}")))?,
  );
  let comment_attachments: Arc<dyn server_blob::BlobStorageBackend> = Arc::new(
    LocalFsBlobStorage::new(&blob_root_str, "comment-attachments")
      .map_err(|e| ServerError::InvalidConfig(format!("invalid comment-attachments storage config: {e}")))?,
  );
  let blobs = BlobService::new(db.clone(), Arc::new(storage), ext.quota_gate());

  let state = AppState::with_services(
    db.clone(),
    redis_client,
    config,
    Arc::clone(&ext),
    AppServices {
      auth: auth.clone(),
      users,
      workspaces,
      doc_sharing,
      histories,
      comments,
      notifications,
      licenses,
      app_config,
      blobs,
      avatars,
      comment_attachments,
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
    sync_cfg.allowed_origins = allowed_origins;
    let authenticator = Arc::new(AuthServiceSyncAuthenticator { auth });
    let server = SyncServer::start_with_dependencies(db, authenticator, ext.quota_gate(), sync_cfg).await;
    router = router.merge(server.router());
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

/// Deterministically drains ready `public.mail_deliveries` rows once using the
/// given [`SmtpMailer`], suitable for worker ticks and zero-sleep E2E tests.
pub async fn drain_mail_deliveries_once(db: &ServerDb, mailer: &SmtpMailer) -> Result<usize, ServerError> {
  let worker_id = format!("mail-delivery-{}-{}", std::process::id(), uuid::Uuid::new_v4());
  Ok(process_ready_mail_deliveries(db.pool(), mailer, &worker_id, 50, 120_000).await?)
}

async fn spawn_mail_delivery_worker(supervisor: &WorkerSupervisor, db: ServerDb, mailer: SmtpMailer) {
  let worker_id = format!("mail-delivery-{}-{}", std::process::id(), uuid::Uuid::new_v4());
  supervisor
    .spawn(move |shutdown| async move {
      loop {
        // Align with v0.27.5 `@Cron(EVERY_MINUTE)`: sleep until the next whole minute boundary.
        let now_ms = std::time::SystemTime::now()
          .duration_since(std::time::UNIX_EPOCH)
          .unwrap_or_default()
          .as_millis() as u64;
        let delay_ms = 60_000 - (now_ms % 60_000);
        tokio::select! {
          () = shutdown.cancelled() => break,
          () = tokio::time::sleep(Duration::from_millis(delay_ms)) => {
            if let Err(err) = process_ready_mail_deliveries(db.pool(), &mailer, &worker_id, 50, 120_000).await {
              tracing::warn!(error = %err, "mail delivery worker tick failed");
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
    built.state.db.ensure_schema_ready().await?;
    if matches!(
      built.role,
      ServerRole::Allinone | ServerRole::Front | ServerRole::Graphql
    ) {
      built.state.auth.ensure_signing_keys().await?;
    }
  }

  before_serve(&built).await?;

  if matches!(built.role, ServerRole::Allinone | ServerRole::Worker) {
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
        async move {
          if let Err(err) =
            server_domain::histories::compact_pending_docs_batch(&db, quota.as_ref(), 100, 500, 600_000, || {
              lease_cancel.is_cancelled()
            })
            .await
          {
            tracing::warn!(error = %err, "doc compaction tick failed");
          }
        }
      },
    )
    .await;

    let hk_db = built.state.db.clone();
    server_worker::spawn_locked_periodic_task(
      &built.supervisor,
      built.session_mutex.clone(),
      "housekeeping:expired-records",
      "housekeeping",
      Duration::from_secs(1800),
      300,
      move |lease_cancel| {
        let db = hk_db.clone();
        async move {
          if !lease_cancel.is_cancelled()
            && let Err(err) = server_domain::histories::cleanup_expired_snapshot_histories(&db, 1_000).await
          {
            tracing::warn!(error = %err, "expired snapshot_histories cleanup failed");
          }
          if !lease_cancel.is_cancelled()
            && let Err(err) = server_domain::histories::cleanup_expired_runtime_states(&db, 1_000).await
          {
            tracing::warn!(error = %err, "expired runtime_states cleanup failed");
          }
          if !lease_cancel.is_cancelled()
            && let Err(err) = server_domain::histories::cleanup_expired_blob_reservations(&db, 1_000).await
          {
            tracing::warn!(error = %err, "expired blob reservation cleanup failed");
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

  if matches!(built.role, ServerRole::Allinone | ServerRole::Worker)
    && let Some(host) = cli.mailer_host.as_deref().map(str::trim).filter(|s| !s.is_empty())
  {
    let smtp_cfg = SmtpConfig {
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
    };
    match SmtpMailer::new(&smtp_cfg) {
      Ok(mailer) => spawn_mail_delivery_worker(&built.supervisor, built.state.db.clone(), mailer).await,
      Err(err) => {
        tracing::warn!(error = %err, "mail delivery worker disabled due to invalid SMTP config");
      }
    }
  }

  tracing::info!(
    addr = %local_addr,
    role = ?built.role,
    edition = built.state.extension.edition_name(),
    "affine-server listening"
  );

  let state_ret = Arc::clone(&built.state);
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
    tracing::info!(released_locks = released, "affine-server drained");
    serve_res.map_err(ServerError::Io)
  });

  Ok(RunningServer {
    addr: local_addr,
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
}
