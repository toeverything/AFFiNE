//! HTTP + GraphQL transport (`axum 0.8` + `async-graphql 7`).

pub mod graphql;
pub mod legacy_compat;
pub mod rest;

use std::sync::Arc;
use std::time::Duration;

use arc_swap::ArcSwap;
use async_graphql::http::GraphiQLSource;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use server_blob::{BlobService, BlobStorageBackend, LocalFsBlobStorage};
use server_db::ServerDb;
use server_db::phase_a_compat::sessions::PhaseASessionRepository;
use server_domain::app_config::{AppConfigService, RuntimeAppConfigBaseline};
use server_domain::auth::{AuthConfig, AuthService};
use server_domain::calendar::CalendarService;
use server_domain::calendar::oauth::CalendarOAuthStore;
use server_domain::comments::CommentService;
use server_domain::doc_sharing::DocSharingService;
use server_domain::events::{EventBusPublisher, InvalidationPublisher, NoopEventPublisher};
use server_domain::histories::DocHistoryService;
use server_domain::notifications::NotificationService;
use server_domain::selfhost_license::SelfhostLicenseService;
use server_domain::users::UserService;
use server_domain::workspaces::WorkspaceService;
use server_search::{SearchConfig, SearchRuntime};
use server_spi::ServerExtension;
use server_types::{DeploymentMode, ServerRole};
use tower_http::trace::TraceLayer;

use crate::graphql::{AppSchema, LazyGraphqlPrincipal, build_schema};
use crate::rest::json_utf8_response;

/// Lock-free runtime configuration snapshot stored inside [`AppState`].
#[derive(Clone)]
pub struct RuntimeConfig {
  pub server_version: String,
  pub server_name: String,
  pub external_url: String,
  pub https: bool,
  pub channel: String,
  pub dev_mode: bool,
  pub deployment_mode: DeploymentMode,
  pub role: ServerRole,
  pub redis_db_index: u8,
  pub session_redis_db_index: u8,
  pub graphql_playground: bool,
  pub refresh_retention_secs: i64,
  pub smtp_password: String,
  pub app_config_baseline: RuntimeAppConfigBaseline,
}

impl std::fmt::Debug for RuntimeConfig {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("RuntimeConfig")
      .field("server_version", &self.server_version)
      .field("server_name", &self.server_name)
      .field("external_url", &self.external_url)
      .field("https", &self.https)
      .field("channel", &self.channel)
      .field("dev_mode", &self.dev_mode)
      .field("deployment_mode", &self.deployment_mode)
      .field("role", &self.role)
      .field("redis_db_index", &self.redis_db_index)
      .field("session_redis_db_index", &self.session_redis_db_index)
      .field("graphql_playground", &self.graphql_playground)
      .field("refresh_retention_secs", &self.refresh_retention_secs)
      .field("smtp_password", &"[REDACTED]")
      .finish()
  }
}

impl Default for RuntimeConfig {
  fn default() -> Self {
    Self {
      server_version: "0.27.5".to_owned(),
      server_name: "AFFiNE".to_owned(),
      external_url: "http://localhost:3010".to_owned(),
      https: false,
      channel: "production".to_owned(),
      dev_mode: false,
      deployment_mode: DeploymentMode::Selfhosted,
      role: ServerRole::Allinone,
      redis_db_index: 0,
      session_redis_db_index: 2,
      graphql_playground: false,
      refresh_retention_secs: server_domain::auth::DEFAULT_REFRESH_RETENTION_SECS,
      smtp_password: String::new(),
      app_config_baseline: RuntimeAppConfigBaseline::default(),
    }
  }
}

/// Immutable shared application state held behind `Arc<AppState>`.
pub struct AppState {
  pub db: ServerDb,
  pub redis: Option<redis::Client>,
  pub config: ArcSwap<RuntimeConfig>,
  pub extension: Arc<dyn ServerExtension>,
  pub auth: AuthService,
  pub users: UserService,
  pub workspaces: WorkspaceService,
  pub admin: server_domain::admin::AdminService,
  pub doc_sharing: DocSharingService,
  pub histories: DocHistoryService,
  pub comments: CommentService,
  pub notifications: NotificationService,
  pub licenses: SelfhostLicenseService,
  pub app_config: AppConfigService,
  pub blobs: BlobService,
  pub search: Arc<SearchRuntime>,
  pub avatars: Arc<dyn BlobStorageBackend>,
  pub comment_attachments: Arc<dyn BlobStorageBackend>,
  pub invalidation: Arc<dyn InvalidationPublisher>,
  pub event_bus: Arc<dyn EventBusPublisher>,
  pub avatar_transcode_sem: Arc<tokio::sync::Semaphore>,
  pub strict_throttler: Arc<rest::throttle::StrictThrottler>,
  pub calendar_webhook_token: Arc<std::sync::Mutex<Option<String>>>,
  pub calendar: CalendarService,
  pub calendar_oauth: Option<CalendarOAuthStore>,
}

/// Pre-wired domain services passed into [`AppState::with_services`].
pub struct AppServices {
  pub auth: AuthService,
  pub users: UserService,
  pub workspaces: WorkspaceService,
  pub doc_sharing: DocSharingService,
  pub histories: DocHistoryService,
  pub comments: CommentService,
  pub notifications: NotificationService,
  pub licenses: SelfhostLicenseService,
  pub app_config: AppConfigService,
  pub blobs: BlobService,
  pub search: Arc<SearchRuntime>,
  pub avatars: Arc<dyn BlobStorageBackend>,
  pub comment_attachments: Arc<dyn BlobStorageBackend>,
  pub invalidation: Arc<dyn InvalidationPublisher>,
  pub event_bus: Arc<dyn EventBusPublisher>,
}

impl AppState {
  /// Constructs an [`AppState`] with default community services (suitable for
  /// tests and lightweight setups). Production entrypoints should prefer
  /// [`AppState::with_services`] to inject configured private keys, Redis
  /// event publishers, and persistent blob storage.
  pub fn new(
    db: ServerDb,
    redis: Option<redis::Client>,
    config: RuntimeConfig,
    extension: Arc<dyn ServerExtension>,
  ) -> Arc<Self> {
    let sessions = Arc::new(PhaseASessionRepository);
    let auth_cfg = AuthConfig {
      server_name: config.server_name.clone(),
      private_key: format!("ephemeral-test-key-{}", uuid::Uuid::new_v4()),
      ..AuthConfig::default()
    };
    let auth = AuthService::new(db.clone(), sessions, extension.session_policy(), auth_cfg)
      .with_rate_limit_policy(extension.rate_limit_policy());
    let users = UserService::new(db.clone());
    let noop = Arc::new(NoopEventPublisher::default());
    let invalidation: Arc<dyn InvalidationPublisher> = noop.clone();
    let event_bus: Arc<dyn EventBusPublisher> = noop;
    let workspaces = WorkspaceService::new(db.clone(), extension.quota_gate(), Arc::clone(&invalidation))
      .with_event_bus(Arc::clone(&event_bus))
      .with_base_url(config.external_url.clone())
      .with_rate_limit_policy(extension.rate_limit_policy())
      .with_billing_spi(extension.billing_spi())
      .with_redis(redis.clone());
    let doc_sharing = DocSharingService::new(
      db.clone(),
      extension.quota_gate(),
      Arc::clone(&invalidation),
      Arc::clone(&event_bus),
    );
    let histories = DocHistoryService::new(db.clone(), extension.quota_gate(), doc_sharing.clone());
    let comments = CommentService::new(
      db.clone(),
      extension.quota_gate(),
      doc_sharing.clone(),
      Arc::clone(&event_bus),
    )
    .with_invalidation(Arc::clone(&invalidation));
    let notifications = NotificationService::new(
      db.clone(),
      extension.quota_gate(),
      doc_sharing.clone(),
      Arc::clone(&event_bus),
    );
    let licenses = SelfhostLicenseService::new(db.clone(), extension.quota_gate(), Arc::clone(&invalidation));
    let app_config = AppConfigService::new(db.clone(), config.app_config_baseline.clone(), Arc::clone(&event_bus));
    let blob_root = std::env::temp_dir().join(format!("affine-server-blobs-{}", uuid::Uuid::new_v4()));
    let blob_root_str = blob_root.to_string_lossy();
    let storage = Arc::new(LocalFsBlobStorage::new(&blob_root_str, "blobs").expect("valid temp blob storage"));
    let avatars: Arc<dyn BlobStorageBackend> =
      Arc::new(LocalFsBlobStorage::new(&blob_root_str, "avatars").expect("valid temp avatar storage"));
    let comment_attachments: Arc<dyn BlobStorageBackend> = Arc::new(
      LocalFsBlobStorage::new(&blob_root_str, "comment-attachments").expect("valid temp comment-attachments storage"),
    );
    let blobs = BlobService::new(db.clone(), storage, extension.quota_gate());
    let search = Arc::new(
      SearchRuntime::new(db.pool().clone(), extension.quota_gate(), SearchConfig::default())
        .expect("default embedded search config must be valid"),
    );

    Self::with_services(
      db,
      redis,
      config,
      extension,
      AppServices {
        auth,
        users,
        workspaces,
        doc_sharing,
        histories,
        comments,
        notifications,
        licenses,
        app_config,
        blobs,
        search,
        avatars,
        comment_attachments,
        invalidation,
        event_bus,
      },
    )
  }

  pub fn with_services(
    db: ServerDb,
    redis: Option<redis::Client>,
    config: RuntimeConfig,
    extension: Arc<dyn ServerExtension>,
    services: AppServices,
  ) -> Arc<Self> {
    let admin = server_domain::admin::AdminService::new(db.clone());
    let calendar_webhook_token = Arc::new(std::sync::Mutex::new(None));
    let calendar = CalendarService::new(
      db.clone(),
      services.auth.config().private_key.clone(),
      config.external_url.clone(),
    )
    .with_shared_webhook_token(Arc::clone(&calendar_webhook_token));
    let calendar_oauth = CalendarOAuthStore::new(redis.clone(), config.session_redis_db_index).ok();
    Arc::new(Self {
      db,
      redis,
      config: ArcSwap::from_pointee(config),
      extension,
      auth: services.auth,
      users: services.users,
      workspaces: services.workspaces,
      admin,
      doc_sharing: services.doc_sharing,
      histories: services.histories,
      comments: services.comments,
      notifications: services.notifications,
      licenses: services.licenses,
      app_config: services.app_config,
      blobs: services.blobs,
      search: services.search,
      avatars: services.avatars,
      comment_attachments: services.comment_attachments,
      invalidation: services.invalidation,
      event_bus: services.event_bus,
      avatar_transcode_sem: Arc::new(tokio::sync::Semaphore::new(4)),
      strict_throttler: Arc::new(rest::throttle::StrictThrottler::new()),
      calendar_webhook_token,
      calendar,
      calendar_oauth,
    })
  }

  /// Atomically swaps the runtime configuration snapshot without locking readers.
  pub fn swap_config(&self, next: RuntimeConfig) {
    self.config.store(Arc::new(next));
  }
}

#[derive(Clone)]
pub(crate) struct RouterState {
  pub(crate) app: Arc<AppState>,
  pub(crate) schema: AppSchema,
}

/// Public `/info` JSON payload matching `packages/backend/server/src/app.controller.ts` 1:1.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ServerInfoResponse {
  pub compatibility: String,
  pub message: String,
  #[serde(rename = "type")]
  pub deployment_type: &'static str,
  pub flavor: &'static str,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
  pub status: &'static str,
  pub role: ServerRole,
  pub edition: &'static str,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PgProbeStatus {
  pub ok: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisProbeStatus {
  pub configured: bool,
  pub ok: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyResponse {
  pub status: &'static str,
  pub role: ServerRole,
  pub edition: &'static str,
  pub postgres: PgProbeStatus,
  pub redis: RedisProbeStatus,
}

#[derive(Debug, Deserialize)]
struct GraphqlGetQuery {
  sdl: Option<String>,
}

fn role_flavor_str(role: ServerRole) -> &'static str {
  match role {
    ServerRole::Front => "front",
    ServerRole::Graphql => "graphql",
    ServerRole::Worker => "worker",
    ServerRole::Script => "script",
    ServerRole::Allinone => "allinone",
  }
}

fn deployment_type_str(mode: DeploymentMode) -> &'static str {
  match mode {
    DeploymentMode::Selfhosted => "selfhosted",
    DeploymentMode::Cloud => "affine",
  }
}

async fn handle_info(State(state): State<RouterState>) -> Response {
  let cfg = state.app.config.load();
  json_utf8_response(
    StatusCode::OK,
    ServerInfoResponse {
      compatibility: cfg.server_version.clone(),
      message: format!("AFFiNE {} Server", cfg.server_version),
      deployment_type: deployment_type_str(cfg.deployment_mode),
      flavor: role_flavor_str(cfg.role),
    },
    false,
  )
}

async fn handle_healthz(State(state): State<RouterState>) -> Json<HealthResponse> {
  let cfg = state.app.config.load();
  Json(HealthResponse {
    status: "ok",
    role: cfg.role,
    edition: state.app.extension.edition_name(),
  })
}

const READYZ_PROBE_TIMEOUT: Duration = Duration::from_secs(2);

async fn handle_readyz(State(state): State<RouterState>) -> (StatusCode, Json<ReadyResponse>) {
  let cfg = state.app.config.load();
  let pg_ok = matches!(
    tokio::time::timeout(
      READYZ_PROBE_TIMEOUT,
      sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(state.app.db.pool()),
    )
    .await,
    Ok(Ok(_))
  );

  let (redis_configured, redis_ok) = match &state.app.redis {
    Some(client) => {
      let ok = matches!(
        tokio::time::timeout(READYZ_PROBE_TIMEOUT, async {
          let mut conn = client.get_multiplexed_async_connection().await?;
          redis::cmd("PING").query_async::<String>(&mut conn).await
        })
        .await,
        Ok(Ok(pong)) if pong == "PONG"
      );
      (true, ok)
    }
    None => (false, true),
  };

  let all_ok = pg_ok && redis_ok;
  let status_code = if all_ok {
    StatusCode::OK
  } else {
    StatusCode::SERVICE_UNAVAILABLE
  };

  (
    status_code,
    Json(ReadyResponse {
      status: if all_ok { "ok" } else { "degraded" },
      role: cfg.role,
      edition: state.app.extension.edition_name(),
      postgres: PgProbeStatus { ok: pg_ok },
      redis: RedisProbeStatus {
        configured: redis_configured,
        ok: redis_ok,
      },
    }),
  )
}

async fn handle_graphql_post(
  State(state): State<RouterState>,
  rest::throttle::PeerAddr(peer): rest::throttle::PeerAddr,
  headers: HeaderMap,
  req: GraphQLRequest,
) -> Response {
  let lazy = LazyGraphqlPrincipal::new(state.clone(), headers.clone(), peer);
  let gql_req = req.into_inner().data(lazy.clone()).data(headers);
  let gql_resp: GraphQLResponse = state.schema.execute(gql_req).await.into();
  if let Some(http_err) = lazy.take_http_error() {
    return http_err;
  }
  let mut resp = gql_resp.into_response();
  let h = resp.headers_mut();
  h.insert(
    header::CONTENT_TYPE,
    HeaderValue::from_static("application/json; charset=utf-8"),
  );
  h.insert(
    header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
    HeaderValue::from_static("true"),
  );
  h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
  lazy
    .cookie_action()
    .apply_to(resp.headers_mut(), state.app.config.load().https);
  let (allowed, retry_after) = lazy.throttle_headers();
  if let Some(th) = allowed {
    th.apply_to(resp.headers_mut());
  }
  if let Some(retry_after_secs) = retry_after
    && let Ok(v) = HeaderValue::from_str(&retry_after_secs.to_string())
  {
    resp.headers_mut().insert(header::RETRY_AFTER, v);
  }
  resp
}

async fn handle_graphql_get(State(state): State<RouterState>, Query(params): Query<GraphqlGetQuery>) -> Response {
  let cfg = state.app.config.load();
  if !cfg.graphql_playground {
    return StatusCode::METHOD_NOT_ALLOWED.into_response();
  }
  if params.sdl.is_some() {
    return (
      StatusCode::OK,
      [("content-type", "text/plain; charset=utf-8")],
      state.schema.sdl(),
    )
      .into_response();
  }
  Html(GraphiQLSource::build().endpoint("/graphql").finish()).into_response()
}

/// Explicit `(DeploymentMode, ServerRole)` HTTP route mount matrix aligned
/// 1:1 with `v0.27.5` `app.module.ts`, `core/workspaces/index.ts`, and `env.ts`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RouteMountMatrix {
  pub info: bool,
  pub graphql: bool,
  /// `UserModule`, `AuthModule`, `PermissionModule` (`app.module.ts:187` `!workerOnly`).
  pub auth_and_avatar_api: bool,
  /// `WorkspaceModule`, `StorageApiModule`, `OAuthModule`, `CaptchaModule`, `CalendarModule`, `MCP` (`app.module.ts:207-221` `flavors.graphql`).
  pub graphql_flavor_api: bool,
  pub selfhost_setup: bool,
  pub worker_proxy: bool,
  pub selfhost_static: bool,
  pub front_static: bool,
  pub doc_renderer: bool,
  pub telemetry: bool,
  pub extra_router: bool,
}

impl RouteMountMatrix {
  /// Computes the exact mount flags for `(deployment_mode, dev_mode, role)`.
  pub fn for_mode_and_role(deployment_mode: DeploymentMode, dev_mode: bool, role: ServerRole) -> Self {
    let is_http_role = matches!(role, ServerRole::Front | ServerRole::Graphql | ServerRole::Allinone);
    let is_selfhosted = deployment_mode == DeploymentMode::Selfhosted;
    let is_api_role = matches!(role, ServerRole::Graphql | ServerRole::Allinone);

    Self {
      info: matches!(
        role,
        ServerRole::Front | ServerRole::Graphql | ServerRole::Worker | ServerRole::Allinone
      ),
      graphql: is_api_role,
      auth_and_avatar_api: is_http_role,
      graphql_flavor_api: is_api_role,
      selfhost_setup: is_selfhosted && is_http_role,
      worker_proxy: (is_selfhosted || dev_mode) && is_http_role,
      selfhost_static: is_selfhosted && is_http_role,
      front_static: role == ServerRole::Front,
      doc_renderer: is_http_role,
      telemetry: is_http_role,
      extra_router: is_http_role,
    }
  }
}

/// Builds the role-isolated `axum::Router` for the configured [`AppState`] and
/// merges any edition-provided [`ServerExtension::extra_router`] on HTTP-serving
/// roles (`Allinone | Front | Graphql`).
pub fn build_router(app: Arc<AppState>) -> Router {
  let cfg = app.config.load();
  let matrix = RouteMountMatrix::for_mode_and_role(cfg.deployment_mode, cfg.dev_mode, cfg.role);
  let schema = build_schema(Arc::clone(&app));
  let extra = if matrix.extra_router {
    app.extension.extra_router()
  } else {
    None
  };
  let state = RouterState { app, schema };

  let mut router = Router::new()
    .route("/healthz", get(handle_healthz))
    .route("/readyz", get(handle_readyz));

  if matrix.info {
    router = router.route("/info", get(handle_info));
  }
  if matrix.selfhost_setup {
    router = router.route(
      "/api/setup/create-admin-user",
      post(rest::auth::handle_create_admin_user),
    );
  }
  if matrix.graphql {
    let graphql_route = Router::new()
      .route("/graphql", get(handle_graphql_get).post(handle_graphql_post))
      .layer(axum::extract::DefaultBodyLimit::max(105 * 1024 * 1024));
    router = router.merge(graphql_route);
  }
  if matrix.auth_and_avatar_api {
    router = router
      .route("/api/auth/session", get(rest::auth::handle_get_session))
      .route("/api/auth/session/exchange", post(rest::auth::handle_exchange_session))
      .route("/api/auth/session/refresh", post(rest::auth::handle_refresh_session))
      .route(
        "/api/auth/session/revoke",
        post(rest::auth::handle_revoke_current_session),
      )
      .route("/api/auth/sessions", get(rest::auth::handle_list_auth_sessions))
      .route(
        "/api/auth/sessions/revoke-all",
        post(rest::auth::handle_revoke_all_sessions),
      )
      .route(
        "/api/auth/sessions/{id}",
        delete(rest::auth::handle_revoke_auth_session_by_id),
      )
      .route("/api/auth/preflight", post(rest::auth::handle_preflight))
      .route("/api/auth/methods", get(rest::auth::handle_bound_methods))
      .route("/api/auth/sign-in", post(rest::auth::handle_sign_in))
      .route("/api/auth/sign-out", post(rest::auth::handle_sign_out))
      .route("/api/auth/magic-link", post(rest::auth::handle_complete_magic_link))
      .route(
        "/api/auth/open-app/sign-in-code",
        post(rest::auth::handle_open_app_sign_in_code),
      )
      .route("/api/auth/open-app/sign-in", post(rest::auth::handle_open_app_sign_in))
      .route("/api/avatars/{id}", get(rest::blobs::handle_get_avatar));
  }
  if matrix.graphql_flavor_api {
    router = router
      .route(
        "/api/workspaces/{workspace_id}/blobs/v1/{name}",
        get(rest::blobs::handle_get_blob_v1),
      )
      .route(
        "/api/workspaces/{workspace_id}/blob-manifest/v1",
        get(rest::blobs::handle_get_blob_manifest_v1),
      )
      .route(
        "/api/workspaces/{workspace_id}/readable-blob-manifest/v1",
        get(rest::blobs::handle_get_readable_blob_manifest_v1),
      )
      .route(
        "/api/workspaces/{workspace_id}/blobs/{name}",
        get(rest::blobs::handle_get_legacy_blob),
      )
      .route(
        "/api/workspaces/{workspace_id}/docs/{doc_id}",
        get(rest::blobs::handle_get_doc_snapshot),
      )
      .route(
        "/api/workspaces/{workspace_id}/public-docs/{doc_id}",
        get(rest::blobs::handle_get_public_doc).head(rest::blobs::handle_head_public_doc),
      )
      .route(
        "/api/workspaces/{workspace_id}/public-docs/{doc_id}/root-doc",
        get(rest::blobs::handle_get_public_root_doc),
      )
      .route(
        "/api/workspaces/{workspace_id}/docs/{guid}/histories/{timestamp}",
        get(rest::blobs::handle_get_doc_history),
      )
      .route(
        "/api/workspaces/{workspace_id}/docs/{doc_id}/comment-attachments/{key}",
        get(rest::blobs::handle_get_comment_attachment),
      )
      .merge(rest::oauth::router())
      .merge(rest::captcha::router())
      .merge(rest::r2_proxy::router())
      .merge(rest::calendar::router())
      .merge(rest::mcp::router());
  }
  if matrix.worker_proxy {
    router = router.merge(rest::worker_proxy::router());
  }
  if matrix.doc_renderer {
    router = router.merge(rest::doc_renderer::router());
  }
  if matrix.telemetry {
    router = router.merge(rest::telemetry::router());
  }
  if matrix.selfhost_static {
    router = router.merge(rest::static_files::selfhost_router());
  }
  if matrix.front_static {
    router = router.merge(rest::static_files::front_router());
  }

  let mut router = router.with_state(state);
  if let Some(ext_router) = extra {
    router = router.merge(ext_router);
  }
  router.layer(TraceLayer::new_for_http())
}

#[cfg(test)]
mod tests {
  use axum::body::Body;
  use http::Request;
  use server_db::DbConfig;
  use server_spi::{CommunityExtension, CopilotPolicySpi, QuotaGate, SessionPolicyHook};
  use tower::ServiceExt;

  use super::*;

  struct ExtraRouteExtension(CommunityExtension);

  impl ServerExtension for ExtraRouteExtension {
    fn edition_name(&self) -> &'static str {
      "test-extra"
    }

    fn quota_gate(&self) -> Arc<dyn QuotaGate> {
      self.0.quota_gate()
    }

    fn session_policy(&self) -> Arc<dyn SessionPolicyHook> {
      self.0.session_policy()
    }

    fn copilot_policy(&self) -> Arc<dyn CopilotPolicySpi> {
      self.0.copilot_policy()
    }

    fn extra_router(&self) -> Option<Router> {
      Some(Router::new().route("/_ext/ping", get(|| async { "pong" })))
    }
  }

  async fn test_db(database_url: &str, role: ServerRole) -> ServerDb {
    ServerDb::connect(DbConfig {
      database_url: database_url.to_owned(),
      channel: "canary".into(),
      role,
      selfhosted: true,
      max_connections: 2,
      statement_timeout_ms: 5_000,
      tier_permits: [4, 2, 2, 1],
    })
    .await
    .expect("connect test db")
  }

  fn with_test_db<F, Fut>(f: F)
  where
    F: FnOnce(String) -> Fut,
    Fut: std::future::Future<Output = ()>,
  {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations = test_db_harness::migrations::MigrationSet {
      migrations: vec![],
      digest: "5e20000000000001".into(),
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
    rt.block_on(f(db_url));
  }

  #[test]
  fn info_and_healthz_match_v0275_contract_without_leaking_internals() {
    with_test_db(|db_url| async move {
      let db = test_db(&db_url, ServerRole::Allinone).await;
      let state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig::default(),
        Arc::new(CommunityExtension::new()),
      );
      let app = build_router(state);

      let resp = app
        .clone()
        .oneshot(Request::builder().uri("/info").body(Body::empty()).unwrap())
        .await
        .expect("info response");
      assert_eq!(resp.status(), StatusCode::OK);
      assert_eq!(
        resp.headers().get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS),
        Some(&HeaderValue::from_static("true"))
      );
      assert_eq!(
        resp.headers().get(header::CONTENT_TYPE),
        Some(&HeaderValue::from_static("application/json; charset=utf-8"))
      );
      assert!(resp.headers().get(header::CACHE_CONTROL).is_none());
      let body = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
      let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
      assert_eq!(
        json,
        serde_json::json!({
          "compatibility": "0.27.5",
          "message": "AFFiNE 0.27.5 Server",
          "type": "selfhosted",
          "flavor": "allinone",
        })
      );

      let health = app
        .oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())
        .await
        .expect("healthz response");
      assert_eq!(health.status(), StatusCode::OK);

      db.pool().close().await;
    });
  }

  #[test]
  fn role_route_isolation_enforces_endpoint_boundaries() {
    with_test_db(|db_url| async move {
      let setup_db = test_db(&db_url, ServerRole::Allinone).await;
      sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS app_configs (
             id TEXT PRIMARY KEY,
             value JSONB NOT NULL,
             last_updated_by TEXT,
             created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
             updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )"#,
      )
      .execute(setup_db.pool())
      .await
      .expect("create app_configs table");
      setup_db.pool().close().await;

      let cases = [
        (ServerRole::Allinone, Some("allinone"), true, true),
        (ServerRole::Graphql, Some("graphql"), true, true),
        (ServerRole::Front, Some("front"), false, true),
        (ServerRole::Worker, Some("worker"), false, false),
        (ServerRole::Script, None, false, false),
      ];

      for (role, expect_info_flavor, expect_graphql, expect_extra) in cases {
        let db = test_db(&db_url, role).await;
        let cfg = RuntimeConfig {
          role,
          ..RuntimeConfig::default()
        };
        let state = AppState::new(
          db.clone(),
          None,
          cfg,
          Arc::new(ExtraRouteExtension(CommunityExtension::new())),
        );
        let app = build_router(state);

        let health = app
          .clone()
          .oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())
          .await
          .unwrap();
        assert_eq!(health.status(), StatusCode::OK, "role={role:?} /healthz");

        let info = app
          .clone()
          .oneshot(Request::builder().uri("/info").body(Body::empty()).unwrap())
          .await
          .unwrap();
        match expect_info_flavor {
          Some(expected_flavor) => {
            assert_eq!(info.status(), StatusCode::OK, "role={role:?} /info");
            let body = axum::body::to_bytes(info.into_body(), 64 * 1024).await.unwrap();
            let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(json["flavor"], expected_flavor, "role={role:?} /info flavor");
          }
          None => {
            assert_eq!(info.status(), StatusCode::NOT_FOUND, "role={role:?} /info");
          }
        }

        let gql_get = app
          .clone()
          .oneshot(Request::builder().uri("/graphql?sdl=1").body(Body::empty()).unwrap())
          .await
          .unwrap();
        assert_eq!(
          gql_get.status(),
          if expect_graphql {
            StatusCode::METHOD_NOT_ALLOWED
          } else {
            StatusCode::NOT_FOUND
          },
          "role={role:?} GET /graphql?sdl=1 with playground disabled"
        );

        let gql_post = app
          .clone()
          .oneshot(
            Request::builder()
              .method("POST")
              .uri("/graphql")
              .header("content-type", "application/json")
              .body(Body::from(r#"{"query":"{ currentUser { id } }"}"#))
              .unwrap(),
          )
          .await
          .unwrap();
        assert_eq!(
          gql_post.status(),
          if expect_graphql {
            StatusCode::OK
          } else {
            StatusCode::NOT_FOUND
          },
          "role={role:?} POST /graphql"
        );

        let auth_session = app
          .clone()
          .oneshot(Request::builder().uri("/api/auth/session").body(Body::empty()).unwrap())
          .await
          .unwrap();
        assert_eq!(
          auth_session.status(),
          if expect_extra {
            StatusCode::OK
          } else {
            StatusCode::NOT_FOUND
          },
          "role={role:?} GET /api/auth/session"
        );

        let ws_doc = app
          .clone()
          .oneshot(
            Request::builder()
              .uri("/api/workspaces/ws-1/public-docs/doc-1")
              .body(Body::empty())
              .unwrap(),
          )
          .await
          .unwrap();
        if !expect_graphql {
          assert_eq!(
            ws_doc.status(),
            StatusCode::NOT_FOUND,
            "role={role:?} GET /api/workspaces/... must be 404 off graphql flavor"
          );
        }

        let extra = app
          .oneshot(Request::builder().uri("/_ext/ping").body(Body::empty()).unwrap())
          .await
          .unwrap();
        assert_eq!(
          extra.status(),
          if expect_extra {
            StatusCode::OK
          } else {
            StatusCode::NOT_FOUND
          },
          "role={role:?} /_ext/ping"
        );

        db.pool().close().await;
      }
    });
  }

  #[test]
  fn route_mount_matrix_truth_table_covers_all_mode_and_role_combinations() {
    type MatrixCase = (
      DeploymentMode,
      bool,
      ServerRole,
      bool,
      bool,
      bool,
      bool,
      bool,
      bool,
      bool,
      bool,
      bool,
      bool,
      bool,
    );
    let cases: &[MatrixCase] = &[
      // (mode, dev_mode, role, info, graphql, auth_and_avatar_api, graphql_flavor_api, selfhost_setup, worker_proxy, selfhost_static, front_static, doc_renderer, telemetry, extra_router)
      (
        DeploymentMode::Selfhosted,
        false,
        ServerRole::Front,
        true,
        false,
        true,
        false,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ),
      (
        DeploymentMode::Selfhosted,
        false,
        ServerRole::Graphql,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        true,
        true,
      ),
      (
        DeploymentMode::Selfhosted,
        false,
        ServerRole::Worker,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ),
      (
        DeploymentMode::Selfhosted,
        false,
        ServerRole::Script,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ),
      (
        DeploymentMode::Selfhosted,
        false,
        ServerRole::Allinone,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        true,
        true,
      ),
      (
        DeploymentMode::Cloud,
        false,
        ServerRole::Front,
        true,
        false,
        true,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        true,
      ),
      (
        DeploymentMode::Cloud,
        false,
        ServerRole::Graphql,
        true,
        true,
        true,
        true,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
      ),
      (
        DeploymentMode::Cloud,
        false,
        ServerRole::Worker,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ),
      (
        DeploymentMode::Cloud,
        false,
        ServerRole::Script,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ),
      (
        DeploymentMode::Cloud,
        false,
        ServerRole::Allinone,
        true,
        true,
        true,
        true,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
      ),
      // Cloud + dev_mode=true mounts worker_proxy on HTTP roles while keeping selfhost_setup/selfhost_static off.
      (
        DeploymentMode::Cloud,
        true,
        ServerRole::Front,
        true,
        false,
        true,
        false,
        false,
        true,
        false,
        true,
        true,
        true,
        true,
      ),
      (
        DeploymentMode::Cloud,
        true,
        ServerRole::Graphql,
        true,
        true,
        true,
        true,
        false,
        true,
        false,
        false,
        true,
        true,
        true,
      ),
      (
        DeploymentMode::Cloud,
        true,
        ServerRole::Worker,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ),
      (
        DeploymentMode::Cloud,
        true,
        ServerRole::Allinone,
        true,
        true,
        true,
        true,
        false,
        true,
        false,
        false,
        true,
        true,
        true,
      ),
    ];

    for &(
      mode,
      dev_mode,
      role,
      info,
      graphql,
      auth_and_avatar_api,
      graphql_flavor_api,
      selfhost_setup,
      worker_proxy,
      selfhost_static,
      front_static,
      doc_renderer,
      telemetry,
      extra_router,
    ) in cases
    {
      let actual = RouteMountMatrix::for_mode_and_role(mode, dev_mode, role);
      let expected = RouteMountMatrix {
        info,
        graphql,
        auth_and_avatar_api,
        graphql_flavor_api,
        selfhost_setup,
        worker_proxy,
        selfhost_static,
        front_static,
        doc_renderer,
        telemetry,
        extra_router,
      };
      assert_eq!(actual, expected, "mode={mode:?} dev_mode={dev_mode} role={role:?}");
    }
  }

  #[test]
  fn create_admin_user_route_returns_404_in_cloud_and_201_then_403_in_selfhosted() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load prisma migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure migrated template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .expect("build tokio runtime");

    rt.block_on(async move {
      let db = test_db(&db_url, ServerRole::Allinone).await;
      let payload = r#"{"name":"Admin","email":"admin@affine.test","password":"StrongPassword123!"}"#;

      // Cloud mode does not mount /api/setup/create-admin-user -> 404.
      let cloud_state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          deployment_mode: DeploymentMode::Cloud,
          role: ServerRole::Allinone,
          ..RuntimeConfig::default()
        },
        Arc::new(CommunityExtension::new()),
      );
      let cloud_app = build_router(cloud_state);
      let cloud_resp = cloud_app
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/setup/create-admin-user")
            .header("content-type", "application/json")
            .body(Body::from(payload))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(cloud_resp.status(), StatusCode::NOT_FOUND);

      // Selfhosted mode mounts /api/setup/create-admin-user -> 201 on first call, 403 on second call.
      let selfhost_state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          deployment_mode: DeploymentMode::Selfhosted,
          role: ServerRole::Allinone,
          ..RuntimeConfig::default()
        },
        Arc::new(CommunityExtension::new()),
      );
      let selfhost_app = build_router(selfhost_state);
      let first = selfhost_app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/setup/create-admin-user")
            .header("content-type", "application/json")
            .body(Body::from(payload))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(first.status(), StatusCode::CREATED);

      let second = selfhost_app
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/setup/create-admin-user")
            .header("content-type", "application/json")
            .body(Body::from(payload))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(second.status(), StatusCode::FORBIDDEN);

      db.pool().close().await;
    });
  }

  #[test]
  fn session_client_version_control_enforces_bearer_cookie_fallback_and_ttr_refresh() {
    with_test_db(|db_url| async move {
      let db = test_db(&db_url, ServerRole::Allinone).await;
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema ready");
      let state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          deployment_mode: DeploymentMode::Selfhosted,
          role: ServerRole::Allinone,
          ..RuntimeConfig::default()
        },
        Arc::new(CommunityExtension::new()),
      );
      let app = build_router(Arc::clone(&state));

      // Create admin user with x-affine-version: 0.25.0 (verifies sign_in_client_version write path).
      let create_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/setup/create-admin-user")
            .header("content-type", "application/json")
            .header("x-affine-version", "0.25.0")
            .body(Body::from(
              r#"{"name":"Admin","email":"vc-admin@affine.test","password":"StrongPassword123!"}"#,
            ))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(create_resp.status(), StatusCode::CREATED);
      let admin_cookie = create_resp
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .filter_map(|s| s.split(';').next())
        .collect::<Vec<_>>()
        .join("; ");

      // Enable client.versionControl in app_configs and invalidate the snapshot cache.
      sqlx::query(
        r#"INSERT INTO app_configs (id, value, last_updated_by, created_at, updated_at)
           VALUES ('client.versionControl.enabled', 'true'::jsonb, NULL, now(), now()),
                  ('client.versionControl.requiredVersion', '">=0.25.0"'::jsonb, NULL, now(), now())
           ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()"#,
      )
      .execute(db.pool())
      .await
      .expect("enable client.versionControl");
      state.app_config.invalidate_cache();

      let set_cookie_joined = |resp: &Response| -> String {
        resp
          .headers()
          .get_all(header::SET_COOKIE)
          .iter()
          .filter_map(|v| v.to_str().ok())
          .collect::<Vec<_>>()
          .join("\n")
      };

      // Named version guard: anonymous POST /api/auth/preflight with missing or low version -> 403.
      for ver in [None, Some("0.24.0")] {
        let mut req = Request::builder()
          .method("POST")
          .uri("/api/auth/preflight")
          .header("content-type", "application/json");
        if let Some(v) = ver {
          req = req.header("x-affine-version", v);
        }
        let resp = app
          .clone()
          .oneshot(req.body(Body::from(r#"{"email":"vc-admin@affine.test"}"#)).unwrap())
          .await
          .unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN, "preflight ver={ver:?}");
        let body: serde_json::Value =
          serde_json::from_slice(&axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
        assert_eq!(body["name"], "UNSUPPORTED_CLIENT_VERSION");
      }

      // Named version guard: GET /api/auth/session on Allinone missing header -> 403.
      let named_session_missing = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/auth/session")
            .header(header::COOKIE, &admin_cookie)
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(named_session_missing.status(), StatusCode::FORBIDDEN);
      let body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(named_session_missing.into_body(), 64 * 1024)
          .await
          .unwrap(),
      )
      .unwrap();
      assert_eq!(body["name"], "UNSUPPORTED_CLIENT_VERSION");

      // Explicit empty header x-affine-version: "" must NOT fall back to sign_in_client_version -> 403.
      let empty_header_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/auth/sessions")
            .header(header::COOKIE, &admin_cookie)
            .header("x-affine-version", "")
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(empty_header_resp.status(), StatusCode::FORBIDDEN);
      let body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(empty_header_resp.into_body(), 64 * 1024)
          .await
          .unwrap(),
      )
      .unwrap();
      assert_eq!(body["name"], "UNSUPPORTED_CLIENT_VERSION");

      // Re-sign-in since the explicit empty header test cleared the cookie session.
      let sign_in_cookie = |ver: &'static str| {
        let app = app.clone();
        async move {
          let resp = app
            .oneshot(
              Request::builder()
                .method("POST")
                .uri("/api/auth/sign-in")
                .header("content-type", "application/json")
                .header("x-affine-version", ver)
                .body(Body::from(
                  r#"{"email":"vc-admin@affine.test","password":"StrongPassword123!"}"#,
                ))
                .unwrap(),
            )
            .await
            .unwrap();
          assert_eq!(resp.status(), StatusCode::OK);
          resp
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .filter_map(|s| s.split(';').next())
            .collect::<Vec<_>>()
            .join("; ")
        }
      };

      let admin_cookie = sign_in_cookie("0.25.0").await;

      // Missing x-affine-version header falls back to sign_in_client_version ("0.25.0") -> 200 on
      // /api/auth/sessions, POST /graphql, and GET /api/auth/session on ServerRole::Front.
      let fallback_sessions = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/auth/sessions")
            .header(header::COOKIE, &admin_cookie)
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(fallback_sessions.status(), StatusCode::OK);

      let fallback_gql = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/graphql")
            .header("content-type", "application/json")
            .header(header::COOKIE, &admin_cookie)
            .body(Body::from(r#"{"query":"{ currentUser { email } }"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(fallback_gql.status(), StatusCode::OK);
      let fallback_gql_body: serde_json::Value =
        serde_json::from_slice(&axum::body::to_bytes(fallback_gql.into_body(), 64 * 1024).await.unwrap()).unwrap();
      assert_eq!(
        fallback_gql_body["data"]["currentUser"]["email"],
        "vc-admin@affine.test"
      );

      let front_state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          deployment_mode: DeploymentMode::Selfhosted,
          role: ServerRole::Front,
          ..RuntimeConfig::default()
        },
        Arc::new(CommunityExtension::new()),
      );
      let front_app = build_router(Arc::clone(&front_state));
      let fallback_front = front_app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/auth/session")
            .header(header::COOKIE, &admin_cookie)
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(fallback_front.status(), StatusCode::OK);
      let fallback_body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(fallback_front.into_body(), 64 * 1024)
          .await
          .unwrap(),
      )
      .unwrap();
      assert_eq!(fallback_body["user"]["email"], "vc-admin@affine.test");

      // TTR refresh window records refresh_client_version and emits Set-Cookie.
      sqlx::query("UPDATE user_sessions SET expires_at = now() + interval '1 day'")
        .execute(db.pool())
        .await
        .expect("move cookie session into TTR window");
      let ttr_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/auth/session")
            .header(header::COOKIE, &admin_cookie)
            .header("x-affine-version", "0.26.0")
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(ttr_resp.status(), StatusCode::OK);
      let ttr_cookies = set_cookie_joined(&ttr_resp);
      assert!(
        ttr_cookies.contains("affine_session="),
        "missing refreshed session cookie: {ttr_cookies}"
      );
      assert!(
        ttr_cookies.contains("affine_csrf_token="),
        "missing refreshed csrf cookie: {ttr_cookies}"
      );
      let recorded_refresh_ver: Option<String> =
        sqlx::query_scalar("SELECT refresh_client_version FROM user_sessions LIMIT 1")
          .fetch_one(db.pool())
          .await
          .expect("query refresh_client_version");
      assert_eq!(recorded_refresh_ver.as_deref(), Some("0.26.0"));

      // Cookie low version on protected REST routes -> 403 + clear 3 cookies + session deleted.
      for uri in [
        "/api/auth/methods",
        "/api/workspaces/ws/docs/doc/histories/1700000000000",
        "/api/workspaces/ws/docs/doc/comment-attachments/k",
      ] {
        let prot_cookie = sign_in_cookie("0.25.0").await;
        let cookie_protected = app
          .clone()
          .oneshot(
            Request::builder()
              .uri(uri)
              .header(header::COOKIE, &prot_cookie)
              .header("x-affine-version", "0.24.0")
              .body(Body::empty())
              .unwrap(),
          )
          .await
          .unwrap();
        assert_eq!(cookie_protected.status(), StatusCode::FORBIDDEN, "uri={uri}");
        let cleared = set_cookie_joined(&cookie_protected);
        assert!(
          cleared.contains("affine_session=;"),
          "missing cleared session cookie on {uri}: {cleared}"
        );
        assert!(
          cleared.contains("affine_user_id=;"),
          "missing cleared user_id cookie on {uri}: {cleared}"
        );
        assert!(
          cleared.contains("affine_csrf_token=;"),
          "missing cleared csrf cookie on {uri}: {cleared}"
        );
        let body: serde_json::Value = serde_json::from_slice(
          &axum::body::to_bytes(cookie_protected.into_body(), 64 * 1024)
            .await
            .unwrap(),
        )
        .unwrap();
        assert_eq!(body["name"], "UNSUPPORTED_CLIENT_VERSION", "uri={uri}");
      }

      // Cookie low version on @Public() GET /api/auth/session:
      // - On Front (no named version guard): 200 anonymous + clear 3 cookies.
      // - On Allinone (named version guard active): 403 UNSUPPORTED_CLIENT_VERSION + clear 3 cookies.
      let pub_cookie = sign_in_cookie("0.25.0").await;
      let pub_front_resp = front_app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/auth/session")
            .header(header::COOKIE, &pub_cookie)
            .header("x-affine-version", "0.24.0")
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(pub_front_resp.status(), StatusCode::OK);
      let cleared = set_cookie_joined(&pub_front_resp);
      assert!(cleared.contains("affine_session=;"));
      assert!(cleared.contains("affine_user_id=;"));
      assert!(cleared.contains("affine_csrf_token=;"));
      let body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(pub_front_resp.into_body(), 64 * 1024)
          .await
          .unwrap(),
      )
      .unwrap();
      assert!(body.get("user").is_none() || body["user"].is_null());

      let pub_allinone_cookie = sign_in_cookie("0.25.0").await;
      let pub_allinone_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/auth/session")
            .header(header::COOKIE, &pub_allinone_cookie)
            .header("x-affine-version", "0.24.0")
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(pub_allinone_resp.status(), StatusCode::FORBIDDEN);
      let cleared = set_cookie_joined(&pub_allinone_resp);
      assert!(cleared.contains("affine_session=;"));
      assert!(cleared.contains("affine_user_id=;"));
      assert!(cleared.contains("affine_csrf_token=;"));

      // Cookie low version on GraphQL public query -> 200 { currentUser: null } + clear 3 cookies.
      let gql_pub_cookie = sign_in_cookie("0.25.0").await;
      let gql_pub = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/graphql")
            .header("content-type", "application/json")
            .header(header::COOKIE, &gql_pub_cookie)
            .header("x-affine-version", "0.24.0")
            .body(Body::from(r#"{"query":"{ currentUser { id } }"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(gql_pub.status(), StatusCode::OK);
      let cleared = set_cookie_joined(&gql_pub);
      assert!(cleared.contains("affine_session=;"));
      let body: serde_json::Value =
        serde_json::from_slice(&axum::body::to_bytes(gql_pub.into_body(), 64 * 1024).await.unwrap()).unwrap();
      assert_eq!(body["data"]["currentUser"], serde_json::Value::Null);
      assert!(body.get("errors").is_none() || body["errors"].as_array().is_some_and(Vec::is_empty));

      // Cookie low version on GraphQL protected query -> 200 GraphQL error 403 UNSUPPORTED_CLIENT_VERSION + clear 3 cookies.
      let gql_prot_cookie = sign_in_cookie("0.25.0").await;
      let gql_prot = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/graphql")
            .header("content-type", "application/json")
            .header(header::COOKIE, &gql_prot_cookie)
            .header("x-affine-version", "0.24.0")
            .body(Body::from(r#"{"query":"{ workspaces { id } }"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(gql_prot.status(), StatusCode::OK);
      let cleared = set_cookie_joined(&gql_prot);
      assert!(cleared.contains("affine_session=;"));
      let body: serde_json::Value =
        serde_json::from_slice(&axum::body::to_bytes(gql_prot.into_body(), 64 * 1024).await.unwrap()).unwrap();
      assert_eq!(body["errors"][0]["extensions"]["status"], 403);
      assert_eq!(body["errors"][0]["extensions"]["name"], "UNSUPPORTED_CLIENT_VERSION");

      // Bearer low version on REST (/api/auth/session, /api/auth/methods) -> HTTP 403 + revoked,
      // and on POST /graphql -> HTTP 200 GraphQL JSON errors[0].extensions.name == UNSUPPORTED_CLIENT_VERSION + revoked.
      let issue_bearer = || {
        let state = Arc::clone(&state);
        async move {
          let user_id: String = sqlx::query_scalar("SELECT id FROM users WHERE email = 'vc-admin@affine.test'")
            .fetch_one(state.db.pool())
            .await
            .unwrap();
          let code = state.auth.issue_exchange_code(&user_id, Some("0.25.0")).await.unwrap();
          let installation_id = uuid::Uuid::new_v4().to_string();
          let issued = state
            .auth
            .exchange_auth_session(&code, &installation_id, "desktop", Some("Test"), Some("0.25.0"))
            .await
            .unwrap();
          (issued.session.id, issued.access_token)
        }
      };

      for uri in ["/api/auth/session", "/api/auth/methods"] {
        let (auth_session_id, access_token) = issue_bearer().await;
        let resp = app
          .clone()
          .oneshot(
            Request::builder()
              .uri(uri)
              .header(header::AUTHORIZATION, format!("Bearer {access_token}"))
              .header("x-affine-version", "0.24.0")
              .body(Body::empty())
              .unwrap(),
          )
          .await
          .unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN, "uri={uri}");
        let body: serde_json::Value =
          serde_json::from_slice(&axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
        assert_eq!(body["name"], "UNSUPPORTED_CLIENT_VERSION", "uri={uri}");
        let revoke_reason: Option<String> =
          sqlx::query_scalar("SELECT revoke_reason FROM auth_sessions WHERE id = $1 AND revoked_at IS NOT NULL")
            .bind(&auth_session_id)
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(
          revoke_reason.as_deref(),
          Some("unsupported_client_version"),
          "uri={uri}"
        );
      }

      // Public avatar route with low-version Cookie -> 404 + clears all 3 cookies.
      let avatar_cookie = sign_in_cookie("0.25.0").await;
      let avatar_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/avatars/nonexistent")
            .header(header::COOKIE, &avatar_cookie)
            .header("x-affine-version", "0.24.0")
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(avatar_resp.status(), StatusCode::NOT_FOUND);
      let avatar_cleared = set_cookie_joined(&avatar_resp);
      assert!(avatar_cleared.contains("affine_session=;"));
      assert!(avatar_cleared.contains("affine_user_id=;"));
      assert!(avatar_cleared.contains("affine_csrf_token=;"));

      // Low-version Bearer on public POST /api/auth/preflight -> 403 + auth_session revoked.
      let (preflight_auth_id, preflight_token) = issue_bearer().await;
      let preflight_bearer_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/auth/preflight")
            .header("content-type", "application/json")
            .header(header::AUTHORIZATION, format!("Bearer {preflight_token}"))
            .header("x-affine-version", "0.24.0")
            .body(Body::from(r#"{"email":"vc-admin@affine.test"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(preflight_bearer_resp.status(), StatusCode::FORBIDDEN);
      let preflight_bearer_body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(preflight_bearer_resp.into_body(), 64 * 1024)
          .await
          .unwrap(),
      )
      .unwrap();
      assert_eq!(preflight_bearer_body["name"], "UNSUPPORTED_CLIENT_VERSION");
      let preflight_revoke_reason: Option<String> =
        sqlx::query_scalar("SELECT revoke_reason FROM auth_sessions WHERE id = $1 AND revoked_at IS NOT NULL")
          .bind(&preflight_auth_id)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert_eq!(preflight_revoke_reason.as_deref(), Some("unsupported_client_version"));

      // Lazy GraphQL auth: validation-error, @skip(if: true), and pure __typename queries
      // with a low-version Bearer must NOT revoke the auth_session in PostgreSQL.
      let (gql_auth_session_id, gql_access_token) = issue_bearer().await;
      for non_exec_query in [
        r#"{"query":"{ nonExistentRootField }"}"#,
        r#"{"query":"{ currentUser @skip(if: true) { id } }"}"#,
        r#"{"query":"{ __typename }"}"#,
      ] {
        let resp = app
          .clone()
          .oneshot(
            Request::builder()
              .method("POST")
              .uri("/graphql")
              .header("content-type", "application/json")
              .header(header::AUTHORIZATION, format!("Bearer {gql_access_token}"))
              .header("x-affine-version", "0.24.0")
              .body(Body::from(non_exec_query))
              .unwrap(),
          )
          .await
          .unwrap();
        assert_eq!(resp.status(), StatusCode::OK, "query={non_exec_query}");
        let revoked_count: i64 =
          sqlx::query_scalar("SELECT COUNT(*) FROM auth_sessions WHERE id = $1 AND revoked_at IS NOT NULL")
            .bind(&gql_auth_session_id)
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(revoked_count, 0, "query={non_exec_query} must not revoke session");
      }

      // Executing an aliased nullable root field (after an earlier @skip(if: true) field
      // sharing the same alias) triggers lazy auth, returns the exact 1-based AST location
      // of the executed field + path + full extensions, and revokes the auth_session.
      let gql_bearer_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/graphql")
            .header("content-type", "application/json")
            .header(header::AUTHORIZATION, format!("Bearer {gql_access_token}"))
            .header("x-affine-version", "0.24.0")
            .body(Body::from(
              serde_json::json!({
                "query": "query {\n  a: currentUser @skip(if: true) { id }\n  a: currentUser { id }\n}"
              })
              .to_string(),
            ))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(gql_bearer_resp.status(), StatusCode::OK);
      let gql_bearer_body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(gql_bearer_resp.into_body(), 64 * 1024)
          .await
          .unwrap(),
      )
      .unwrap();
      assert_eq!(gql_bearer_body["data"], serde_json::json!({ "a": null }));
      assert_eq!(gql_bearer_body["errors"][0]["path"], serde_json::json!(["a"]));
      assert_eq!(
        gql_bearer_body["errors"][0]["locations"],
        serde_json::json!([{ "line": 3, "column": 3 }])
      );
      assert_eq!(gql_bearer_body["errors"][0]["extensions"]["status"], 403);
      assert_eq!(gql_bearer_body["errors"][0]["extensions"]["code"], "Forbidden");
      assert_eq!(gql_bearer_body["errors"][0]["extensions"]["type"], "ACTION_FORBIDDEN");
      assert_eq!(
        gql_bearer_body["errors"][0]["extensions"]["name"],
        "UNSUPPORTED_CLIENT_VERSION"
      );
      assert!(gql_bearer_body["errors"][0]["extensions"]["message"].is_string());
      assert_eq!(
        gql_bearer_body["errors"][0]["extensions"]["data"]["clientVersion"],
        "0.24.0"
      );
      let gql_revoke_reason: Option<String> =
        sqlx::query_scalar("SELECT revoke_reason FROM auth_sessions WHERE id = $1 AND revoked_at IS NOT NULL")
          .bind(&gql_auth_session_id)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert_eq!(gql_revoke_reason.as_deref(), Some("unsupported_client_version"));

      // Low-version Bearer on GraphQL non-null field `{ workspaces { id } }` ->
      // HTTP 200, data: null, errors[0].path == ["workspaces"], UNSUPPORTED_CLIENT_VERSION, revoked.
      let (gql_ws_auth_id, gql_ws_token) = issue_bearer().await;
      let gql_ws_resp = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/graphql")
            .header("content-type", "application/json")
            .header(header::AUTHORIZATION, format!("Bearer {gql_ws_token}"))
            .header("x-affine-version", "0.24.0")
            .body(Body::from(r#"{"query":"{ workspaces { id } }"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(gql_ws_resp.status(), StatusCode::OK);
      let gql_ws_body: serde_json::Value =
        serde_json::from_slice(&axum::body::to_bytes(gql_ws_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
      assert_eq!(gql_ws_body["data"], serde_json::Value::Null);
      assert_eq!(gql_ws_body["errors"][0]["path"], serde_json::json!(["workspaces"]));
      assert_eq!(gql_ws_body["errors"][0]["extensions"]["status"], 403);
      assert_eq!(
        gql_ws_body["errors"][0]["extensions"]["name"],
        "UNSUPPORTED_CLIENT_VERSION"
      );
      let gql_ws_revoke_reason: Option<String> =
        sqlx::query_scalar("SELECT revoke_reason FROM auth_sessions WHERE id = $1 AND revoked_at IS NOT NULL")
          .bind(&gql_ws_auth_id)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert_eq!(gql_ws_revoke_reason.as_deref(), Some("unsupported_client_version"));

      db.pool().close().await;
    });
  }
}
