//! HTTP + GraphQL transport skeleton (`axum 0.8` + `async-graphql 7`).

pub mod graphql;
pub mod legacy_compat;

use std::sync::Arc;
use std::time::Duration;

use arc_swap::ArcSwap;
use async_graphql::http::GraphiQLSource;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use server_db::ServerDb;
use server_spi::ServerExtension;
use server_types::{DeploymentMode, ServerRole};
use tower_http::trace::TraceLayer;

use crate::graphql::{AppSchema, build_schema};

/// Lock-free runtime configuration snapshot stored inside [`AppState`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeConfig {
  pub server_version: String,
  pub deployment_mode: DeploymentMode,
  pub role: ServerRole,
  pub redis_db_index: u8,
  pub session_redis_db_index: u8,
  pub graphql_playground: bool,
}

impl Default for RuntimeConfig {
  fn default() -> Self {
    Self {
      server_version: "0.27.5".to_owned(),
      deployment_mode: DeploymentMode::Selfhosted,
      role: ServerRole::Allinone,
      redis_db_index: 0,
      session_redis_db_index: 2,
      graphql_playground: false,
    }
  }
}

/// Immutable shared application state held behind `Arc<AppState>`.
pub struct AppState {
  pub db: ServerDb,
  pub redis: Option<redis::Client>,
  pub config: ArcSwap<RuntimeConfig>,
  pub extension: Arc<dyn ServerExtension>,
}

impl AppState {
  pub fn new(
    db: ServerDb,
    redis: Option<redis::Client>,
    config: RuntimeConfig,
    extension: Arc<dyn ServerExtension>,
  ) -> Arc<Self> {
    Arc::new(Self {
      db,
      redis,
      config: ArcSwap::from_pointee(config),
      extension,
    })
  }

  /// Atomically swaps the runtime configuration snapshot without locking readers.
  pub fn swap_config(&self, next: RuntimeConfig) {
    self.config.store(Arc::new(next));
  }
}

#[derive(Clone)]
struct RouterState {
  app: Arc<AppState>,
  schema: AppSchema,
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

async fn handle_info(State(state): State<RouterState>) -> Json<ServerInfoResponse> {
  let cfg = state.app.config.load();
  Json(ServerInfoResponse {
    compatibility: cfg.server_version.clone(),
    message: format!("AFFiNE {} Server", cfg.server_version),
    deployment_type: deployment_type_str(cfg.deployment_mode),
    flavor: role_flavor_str(cfg.role),
  })
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

async fn handle_graphql_post(State(state): State<RouterState>, req: GraphQLRequest) -> GraphQLResponse {
  state.schema.execute(req.into_inner()).await.into()
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

/// Builds the role-isolated `axum::Router` for the configured [`AppState`] and
/// merges any edition-provided [`ServerExtension::extra_router`] on HTTP-serving
/// roles (`Allinone | Front | Graphql`).
pub fn build_router(app: Arc<AppState>) -> Router {
  let role = app.config.load().role;
  let schema = build_schema(Arc::clone(&app));
  let extra = match role {
    ServerRole::Allinone | ServerRole::Front | ServerRole::Graphql => app.extension.extra_router(),
    ServerRole::Worker | ServerRole::Script => None,
  };
  let state = RouterState { app, schema };

  let mut router = Router::new()
    .route("/healthz", get(handle_healthz))
    .route("/readyz", get(handle_readyz));

  if matches!(
    role,
    ServerRole::Front | ServerRole::Graphql | ServerRole::Worker | ServerRole::Allinone
  ) {
    router = router.route("/info", get(handle_info));
  }
  if matches!(role, ServerRole::Graphql | ServerRole::Allinone) {
    router = router.route("/graphql", get(handle_graphql_get).post(handle_graphql_post));
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
}
