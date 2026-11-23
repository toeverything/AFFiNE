//! Multi-role AFFiNE server binary and reusable library entrypoint.
//!
//! Commercial editions (e.g. `affine-server-pro`) depend on this crate and pass
//! their own `Arc<dyn ServerExtension>` into [`build_app_and_serve`] or
//! [`serve_with_extension`].

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use clap::{Parser, ValueEnum};
use server_db::{DbConfig, DbError, ServerDb};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::ServerExtension;
use server_types::{DeploymentMode, ServerRole};
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

  #[arg(long, env = "AFFINE_SERVER_PORT", default_value_t = 3010)]
  pub port: u16,

  #[arg(long, env = "DATABASE_URL", hide_env_values = true)]
  pub database_url: String,

  #[arg(long, env = "REDIS_URL", hide_env_values = true)]
  pub redis_url: Option<String>,

  #[arg(long, value_enum, env = "AFFINE_DEPLOYMENT_MODE", default_value_t = DeploymentModeArg::Selfhosted)]
  pub deployment_mode: DeploymentModeArg,

  #[arg(long, env = "AFFINE_CHANNEL", default_value = "canary")]
  pub channel: String,

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

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
  #[error("invalid server configuration: {0}")]
  InvalidConfig(String),
  #[error("database error: {0}")]
  Db(#[from] DbError),
  #[error("worker/redis error: {0}")]
  Worker(#[from] WorkerError),
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
      .field("port", &self.port)
      .field("database_url", &"[REDACTED]")
      .field("redis_url", &self.redis_url.as_ref().map(|_| "[REDACTED]"))
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

impl ServerCli {
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

/// Fully wired server components ready to bind and serve.
pub struct BuiltServer {
  pub state: Arc<AppState>,
  pub router: Router,
  pub supervisor: WorkerSupervisor,
  pub session_mutex: Option<RedisMutex>,
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
/// and `WorkerSupervisor` without opening eager DB connections (`min_connections = 0`).
pub async fn build_server(
  cli: &ServerCli,
  ext: Arc<dyn ServerExtension>,
  shutdown: CancellationToken,
) -> Result<BuiltServer, ServerError> {
  let role = cli.resolve_role()?;
  let db = ServerDb::connect(DbConfig {
    database_url: cli.database_url.clone(),
    channel: cli.channel.clone(),
    role,
    max_connections: cli.db_max_connections,
    statement_timeout_ms: cli.db_statement_timeout_ms,
    tier_permits: [16, 8, 4, 2],
  })
  .await?;

  let (redis_client, redis_db_index, session_redis_db_index, session_mutex) = match cli.redis_url.as_deref() {
    Some(url) if !url.trim().is_empty() => {
      let base_db = parse_redis_db_index(url)?;
      let (session_url, session_db) = session_redis_url(url)?;
      let client = redis::Client::open(url)?;
      let mutex = RedisMutex::new(&session_url, cli.redis_key_prefix.clone())?;
      (Some(client), base_db, session_db, Some(mutex))
    }
    _ => (None, 0, 2, None),
  };

  let config = RuntimeConfig {
    server_version: cli.server_version.clone(),
    deployment_mode: cli.deployment_mode.into(),
    role,
    redis_db_index,
    session_redis_db_index,
    graphql_playground: cli.graphql_playground,
  };

  let state = AppState::new(db, redis_client, config, ext);
  let router = build_router(Arc::clone(&state));
  let supervisor = WorkerSupervisor::new(shutdown);

  Ok(BuiltServer {
    state,
    router,
    supervisor,
    session_mutex,
    role,
  })
}

/// Binds the TCP listener (supporting `--port 0`), immediately emits the bound
/// address for harness takeover, and serves until `shutdown` is cancelled, then
/// drains the [`WorkerSupervisor`] and releases all active Redis worker locks.
pub async fn serve_with_extension(
  cli: ServerCli,
  ext: Arc<dyn ServerExtension>,
  shutdown: CancellationToken,
) -> Result<RunningServer, ServerError> {
  let built = build_server(&cli, ext, shutdown.clone()).await?;
  if !cli.skip_schema_check {
    built.state.db.ensure_schema_ready().await?;
  }
  let bind_addr = SocketAddr::new(cli.host, cli.port);
  let listener = TcpListener::bind(bind_addr).await?;
  let local_addr = listener.local_addr()?;

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
  let router = built.router;

  let join_handle = tokio::spawn(async move {
    let serve_res = axum::serve(listener, router)
      .with_graceful_shutdown(async move {
        shutdown.cancelled().await;
      })
      .await;
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
      redis_url: None,
      deployment_mode: DeploymentModeArg::Selfhosted,
      channel: "canary".into(),
      server_version: "0.27.5".into(),
      db_max_connections: 4,
      db_statement_timeout_ms: 5_000,
      graphql_playground: false,
      redis_key_prefix: String::new(),
      skip_schema_check: true,
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
  fn server_cli_debug_redacts_database_and_redis_urls() {
    let mut cli = cli_with_role(Some(RoleArg::Allinone));
    cli.database_url = "postgres://admin:super_secret_pg_pw@db.internal:5432/affine".into();
    cli.redis_url = Some("redis://:super_secret_redis_pw@redis.internal:6379/0".into());

    let rendered = format!("{cli:?}");
    assert!(
      !rendered.contains("super_secret_pg_pw"),
      "leaked db password: {rendered}"
    );
    assert!(
      !rendered.contains("super_secret_redis_pw"),
      "leaked redis password: {rendered}"
    );
    assert!(rendered.contains("[REDACTED]"));
  }
}
