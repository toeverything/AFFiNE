//! Pure-Rust Socket.IO v4 / Engine.IO v4 sync gateway backed by PostgreSQL,
//! `y-octo` CRDT merging/diffing, and Redis `affine:eventbus:v1` cross-node
//! and cross-generation (`v0.27.5` × `server-sync`) fan-out.

pub mod auth;
pub mod engine_io;
pub mod error;
pub mod eventbus;
pub mod gateway;
pub mod legacy_compat;
pub mod permissions;
pub mod protocol;
pub mod storage;

use std::sync::Arc;

use axum::Router;
use server_db::ServerDb;
use server_spi::{CommunityQuotaGate, QuotaGate};
use tokio::task::JoinHandle;

use crate::{
  auth::{PgCookieSessionAuthenticator, SyncSessionAuthenticator},
  engine_io::{EngineIoState, build_socketio_router},
  eventbus::RedisSyncBridge,
  gateway::SpaceSyncGateway,
  storage::SyncStorage,
};

#[derive(Clone, Debug)]
pub struct SyncConfig {
  pub redis_url: Option<String>,
  pub session_redis_url: Option<String>,
  pub origin_channel: String,
  pub origin_id: Option<String>,
  pub deployment_prefix: String,
  /// Allowed browser `Origin` values (scheme + host + optional port) for
  /// `/socket.io/` CORS / WebSocket handshake validation.
  pub allowed_origins: Vec<String>,
  /// Whether `http(s)://(localhost|127.0.0.1|[::1])[:port]` origins are
  /// permitted in addition to `allowed_origins` and the 6 native client
  /// origins (enabled in dev/test channels, disabled in production/stable).
  pub allow_dev_loopback: bool,
}

impl SyncConfig {
  /// Builds the default cross-gen `originChannel` (`v2:<channel>`) so frozen
  /// `v0.27.5` instances on `<channel>` recognize `server-sync` as a distinct
  /// cluster peer and fan out `space:broadcast-doc-invalidation` to `sync-027`.
  pub fn for_deployment_channel(channel: &str) -> Self {
    let allow_dev_loopback = matches!(
      channel.trim().to_ascii_lowercase().as_str(),
      "dev" | "development" | "test" | "testing"
    );
    Self {
      redis_url: None,
      session_redis_url: None,
      origin_channel: format!("v2:{channel}"),
      origin_id: None,
      deployment_prefix: "selfhosted".to_owned(),
      allowed_origins: Vec::new(),
      allow_dev_loopback,
    }
  }
}

impl Default for SyncConfig {
  fn default() -> Self {
    Self::for_deployment_channel("production")
  }
}

/// Self-contained Socket.IO sync server handle that mounts onto any
/// `axum::Router` at `/socket.io/`.
pub struct SyncServer {
  engine: Arc<EngineIoState>,
  gateway: Arc<SpaceSyncGateway>,
  eventbus: Arc<RedisSyncBridge>,
  fanout_task: JoinHandle<()>,
  reaper_task: JoinHandle<()>,
  presence_task: JoinHandle<()>,
}

impl SyncServer {
  /// Starts a `SyncServer` using the default PostgreSQL cookie session
  /// authenticator (`affine_session` + optional `affine_user_id`) and
  /// [`CommunityQuotaGate`].
  pub async fn start(db: ServerDb, config: SyncConfig) -> Self {
    let auth = Arc::new(PgCookieSessionAuthenticator::new(db.clone()));
    Self::start_with_dependencies(db, auth, Arc::new(CommunityQuotaGate::new()), config).await
  }

  /// Starts a `SyncServer` with a custom [`SyncSessionAuthenticator`] and
  /// default [`CommunityQuotaGate`].
  pub async fn start_with_authenticator(
    db: ServerDb,
    authenticator: Arc<dyn SyncSessionAuthenticator>,
    config: SyncConfig,
  ) -> Self {
    Self::start_with_dependencies(db, authenticator, Arc::new(CommunityQuotaGate::new()), config).await
  }

  /// Starts a `SyncServer` with custom [`SyncSessionAuthenticator`] and
  /// [`QuotaGate`] SPI implementations.
  pub async fn start_with_dependencies(
    db: ServerDb,
    authenticator: Arc<dyn SyncSessionAuthenticator>,
    quota_gate: Arc<dyn QuotaGate>,
    config: SyncConfig,
  ) -> Self {
    let storage = match config.session_redis_url.as_deref() {
      Some(url) => {
        match SyncStorage::with_quota_gate(db.clone(), Arc::clone(&quota_gate)).with_session_redis_url(url) {
          Ok(s) => s,
          Err(err) => {
            tracing::error!(error = %err, "invalid session_redis_url for server-sync; userspace writes fail closed");
            SyncStorage::with_quota_gate(db, quota_gate).with_invalid_session_redis_config(err.to_string())
          }
        }
      }
      None => SyncStorage::with_quota_gate(db, quota_gate),
    };
    let eventbus = match config.origin_id {
      Some(origin_id) => {
        RedisSyncBridge::start_with_origin_id(config.redis_url.as_deref(), config.origin_channel, origin_id).await
      }
      None => RedisSyncBridge::start(config.redis_url.as_deref(), config.origin_channel).await,
    };
    let gateway = SpaceSyncGateway::new(storage, Arc::clone(&eventbus), config.deployment_prefix);
    let engine = EngineIoState::with_origin_policy(
      authenticator,
      Arc::clone(&gateway),
      config.allowed_origins,
      config.allow_dev_loopback,
    );
    let fanout_task = gateway.spawn_cluster_fanout(Arc::clone(&engine));
    let reaper_task = engine.spawn_session_reaper();
    let presence_task = gateway.spawn_presence_worker();

    Self {
      engine,
      gateway,
      eventbus,
      fanout_task,
      reaper_task,
      presence_task,
    }
  }

  /// Returns an `axum::Router` serving `/socket.io/` (HTTP polling + WS upgrade).
  pub fn router(&self) -> Router {
    build_socketio_router(Arc::clone(&self.engine))
  }

  pub fn engine(&self) -> &Arc<EngineIoState> {
    &self.engine
  }

  pub fn gateway(&self) -> &Arc<SpaceSyncGateway> {
    &self.gateway
  }

  pub fn eventbus(&self) -> &Arc<RedisSyncBridge> {
    &self.eventbus
  }

  pub async fn shutdown(self) {
    self.engine.close_all_sessions().await;
    self.presence_task.abort();
    let _ = self.presence_task.await;
    self.reaper_task.abort();
    let _ = self.reaper_task.await;
    self.fanout_task.abort();
    let _ = self.fanout_task.await;
    self.eventbus.stop().await;
  }
}
