use std::sync::Arc;

use axum::body::Body;
use http::{Request, StatusCode, header};
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_domain::mcp::{CreateMcpCredentialParams, McpAccessMode, McpCredentialService};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::{
  CommunityExtension, CopilotPolicySpi, CopilotRuntimeSpi, QuotaGate, ServerExtension, SessionPolicyHook,
};
use server_types::{DeploymentMode, ServerRole};
use test_db_harness::{pg::PgCluster, redis::TestRedis};
use tower::ServiceExt as _;
use uuid::Uuid;

struct TestCopilotRuntime;
impl CopilotRuntimeSpi for TestCopilotRuntime {
  fn is_enabled(&self) -> bool {
    true
  }
}

struct TestCopilotExtension {
  inner: CommunityExtension,
}
impl ServerExtension for TestCopilotExtension {
  fn edition_name(&self) -> &'static str {
    "test-copilot"
  }
  fn quota_gate(&self) -> Arc<dyn QuotaGate> {
    self.inner.quota_gate()
  }
  fn session_policy(&self) -> Arc<dyn SessionPolicyHook> {
    self.inner.session_policy()
  }
  fn copilot_policy(&self) -> Arc<dyn CopilotPolicySpi> {
    self.inner.copilot_policy()
  }
  fn copilot_runtime(&self) -> Arc<dyn CopilotRuntimeSpi> {
    Arc::new(TestCopilotRuntime)
  }
}

fn test_runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .expect("build tokio runtime")
}

fn lease_test_db(cluster: &PgCluster) -> test_db_harness::pg::DbLease {
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load prisma migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure migrated template");
  cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test database")
}

async fn setup_http_state(
  db_url: &str,
  redis_url: &str,
  dev_mode: bool,
  copilot_enabled: bool,
) -> (Arc<AppState>, axum::Router) {
  let mut db_cfg = DbConfig::new(db_url);
  db_cfg.max_connections = 4;
  let db = ServerDb::connect(db_cfg).await.expect("connect db");
  let redis = redis::Client::open(redis_url).expect("open redis");
  let cfg = RuntimeConfig {
    deployment_mode: DeploymentMode::Selfhosted,
    role: ServerRole::Allinone,
    dev_mode,
    ..RuntimeConfig::default()
  };
  let ext: Arc<dyn ServerExtension> = if copilot_enabled {
    Arc::new(TestCopilotExtension {
      inner: CommunityExtension::new(),
    })
  } else {
    Arc::new(CommunityExtension::new())
  };
  let state = AppState::new(db, Some(redis), cfg, ext);
  let router = build_router(Arc::clone(&state));
  (state, router)
}

async fn insert_user_and_workspace(state: &AppState, email: &str) -> (String, String) {
  let user_id = Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO users (id, name, email, registered, disabled, email_verified, created_at)
       VALUES ($1, 'HTTP User', $2, true, false, clock_timestamp(), clock_timestamp())"#,
  )
  .bind(&user_id)
  .bind(email)
  .execute(state.db.pool())
  .await
  .expect("insert user");

  let ws_id = Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO workspaces (id, name, avatar_key, enable_ai, enable_doc_embedding, indexed, last_check_embeddings, created_at)
       VALUES ($1, 'MCP WS', NULL, true, true, false, to_timestamp(0), clock_timestamp())"#,
  )
  .bind(&ws_id)
  .execute(state.db.pool())
  .await
  .expect("insert workspace");

  sqlx::query(
    r#"INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at)
       VALUES ($1, $2, $3, 'owner', 'active', 'legacy', clock_timestamp(), clock_timestamp())"#,
  )
  .bind(Uuid::new_v4().to_string())
  .bind(&ws_id)
  .bind(&user_id)
  .execute(state.db.pool())
  .await
  .expect("insert owner member");

  (user_id, ws_id)
}

async fn read_json(resp: axum::response::Response) -> Value {
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
    .await
    .expect("read body");
  serde_json::from_slice(&bytes).expect("parse json")
}

#[test]
fn mcp_http_protocol_methods_batch_notifications_and_access_modes() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let redis_url = redis.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let (state, router) = setup_http_state(&db_url, &redis_url, true, true).await;
    let (user_id, ws_id) = insert_user_and_workspace(&state, "mcp-http@example.com").await;
    let (_other_user, other_ws) = insert_user_and_workspace(&state, "mcp-other@example.com").await;

    let mcp_svc = McpCredentialService::new(state.db.clone(), Arc::clone(&state.event_bus));
    let ro = mcp_svc
      .create(CreateMcpCredentialParams {
        user_id: user_id.clone(),
        workspace_id: ws_id.clone(),
        name: "RO".to_owned(),
        access_mode: McpAccessMode::ReadOnly,
        expiration_days: 90,
      })
      .await
      .expect("create ro cred");
    let rw = mcp_svc
      .create(CreateMcpCredentialParams {
        user_id: user_id.clone(),
        workspace_id: ws_id.clone(),
        name: "RW".to_owned(),
        access_mode: McpAccessMode::ReadWrite,
        expiration_days: 90,
      })
      .await
      .expect("create rw cred");

    let endpoint = format!("/api/workspaces/{ws_id}/mcp");

    for method in ["GET", "DELETE"] {
      let resp = router
        .clone()
        .oneshot(
          Request::builder()
            .method(method)
            .uri(&endpoint)
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);
      let body = read_json(resp).await;
      assert_eq!(body["jsonrpc"], "2.0");
      assert_eq!(body["error"]["code"], -32000);
      assert_eq!(body["error"]["message"], "Method not allowed.");
      assert_eq!(body["id"], Value::Null);
    }

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(&endpoint)
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    let body = read_json(resp).await;
    assert_eq!(body["error"]["code"], -32000);
    assert_eq!(body["error"]["message"], "Authentication failed");

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{other_ws}/mcp"))
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::AUTHORIZATION, format!("Bearer {}", ro.token))
          .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(&endpoint)
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::AUTHORIZATION, format!("Bearer {}", ro.token))
          .body(Body::from("[]"))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(read_json(resp).await["error"]["code"], -32600);

    let big_batch: Vec<Value> = (0..21)
      .map(|i| json!({"jsonrpc":"2.0","id":i,"method":"ping"}))
      .collect();
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(&endpoint)
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::AUTHORIZATION, format!("Bearer {}", ro.token))
          .body(Body::from(serde_json::to_string(&big_batch).unwrap()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(read_json(resp).await["error"]["code"], -32600);

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(&endpoint)
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::AUTHORIZATION, format!("Bearer {}", ro.token))
          .body(Body::from(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::ACCEPTED);
    let empty_bytes = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
    assert!(empty_bytes.is_empty());

    // Batch: initialize declares only tools capability, resources/read is -32601, READ_ONLY blocks create_document.
    let batch_req = json!([
      {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}},
      {"jsonrpc":"2.0","id":2,"method":"tools/list"},
      {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_document","arguments":{"title":"Blocked","content":"Body"}}},
      {"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"affine://workspaces/x/docs/y"}},
      {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"doc_search","arguments":{"query":"hello","limit":25}}}
    ]);
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(&endpoint)
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::AUTHORIZATION, format!("Bearer {}", ro.token))
          .body(Body::from(batch_req.to_string()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let arr = read_json(resp).await;
    assert_eq!(arr[0]["result"]["protocolVersion"], "2025-11-25");
    assert_eq!(arr[0]["result"]["capabilities"], json!({"tools": {}}));
    assert_eq!(arr[1]["result"]["tools"].as_array().unwrap().len(), 2);
    assert_eq!(arr[2]["error"]["code"], -32602);
    assert_eq!(arr[3]["error"]["code"], -32601);
    assert_eq!(arr[4]["result"]["isError"], true);

    let create_req = json!({
      "jsonrpc":"2.0",
      "id":"c1",
      "method":"tools/call",
      "params":{"name":"create_document","arguments":{"title":"Spec","content":"Initial body"}}
    });
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(&endpoint)
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::AUTHORIZATION, format!("Bearer {}", rw.token))
          .body(Body::from(create_req.to_string()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let create_body = read_json(resp).await;
    let payload: Value =
      serde_json::from_str(create_body["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(payload["success"], true);
    let doc_id = payload["docId"].as_str().unwrap().to_owned();

    let read_req = json!({
      "jsonrpc":"2.0",
      "id":"r1",
      "method":"tools/call",
      "params":{"name":"read_document","arguments":{"docId": doc_id}}
    });
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(&endpoint)
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::AUTHORIZATION, format!("Bearer {}", ro.token))
          .body(Body::from(read_req.to_string()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let read_body = read_json(resp).await;
    let md = read_body["result"]["content"][0]["text"].as_str().unwrap();
    assert!(md.contains("# Spec"));
    assert!(md.contains("Initial body"));

    state.db.pool().close().await;
  });
}

#[test]
fn mcp_copilot_disabled_rest_and_graphql_auth_guard_order() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let redis_url = redis.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let (state, router) = setup_http_state(&db_url, &redis_url, false, false).await;
    let (uid, ws_id) = insert_user_and_workspace(&state, "copilot-off@example.com").await;

    // Even if app_configs sets copilot.enabled = true, CommunityExtension strictly enforces CopilotRuntimeSpi.
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at)
         VALUES ('copilot.enabled', 'true'::jsonb, clock_timestamp(), clock_timestamp())
         ON CONFLICT (id) DO UPDATE SET value = 'true'::jsonb, updated_at = clock_timestamp()"#,
    )
    .execute(state.db.pool())
    .await
    .expect("seed copilot config");
    state.app_config.invalidate_cache();

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    let rest_err = read_json(resp).await;
    assert_eq!(rest_err["name"], "ACTION_FORBIDDEN");
    assert_eq!(rest_err["message"], "Copilot is disabled.");

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/graphql")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"query":"{ mcpCredentialReadWriteAvailable }"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    let gql_unauth = read_json(resp).await;
    assert_eq!(gql_unauth["errors"][0]["extensions"]["name"], "AUTHENTICATION_REQUIRED");

    let schema = server_http::graphql::build_schema(Arc::clone(&state));
    let gql_auth = schema
      .execute(async_graphql::Request::new("{ mcpCredentialReadWriteAvailable }").data(
        server_http::graphql::AuthenticatedUser {
          user_id: uid,
          user: None,
        },
      ))
      .await;
    assert_eq!(gql_auth.errors.len(), 1);
    let ext = gql_auth.errors[0].extensions.as_ref().expect("extensions");
    assert_eq!(
      ext.get("name"),
      Some(&async_graphql::Value::String("ACTION_FORBIDDEN".to_owned()))
    );

    state.db.pool().close().await;
  });
}

#[test]
fn mcp_default_throttle_enforces_429_and_rate_limit_headers() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let redis_url = redis.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let (state, router) = setup_http_state(&db_url, &redis_url, true, true).await;
    let (uid, ws_id) = insert_user_and_workspace(&state, "throttle@example.com").await;

    let created = state
      .mcp
      .create(CreateMcpCredentialParams {
        user_id: uid.clone(),
        workspace_id: ws_id.clone(),
        name: "Throttle Test".to_owned(),
        access_mode: McpAccessMode::ReadOnly,
        expiration_days: 90,
      })
      .await
      .expect("create credential");

    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at)
         VALUES
           ('throttle.throttlers.default.limit', '2'::jsonb, clock_timestamp(), clock_timestamp()),
           ('throttle.throttlers.default.ttl', '60000'::jsonb, clock_timestamp(), clock_timestamp())
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = clock_timestamp()"#,
    )
    .execute(state.db.pool())
    .await
    .expect("seed throttle config");
    state.app_config.invalidate_cache();

    // Client A (X-Real-IP: 198.51.100.10): 2 allowed, 3rd returns 429.
    for expected_remaining in ["1", "0"] {
      let resp = router
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri(format!("/api/workspaces/{ws_id}/mcp"))
            .header("x-real-ip", "198.51.100.10")
            .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::OK);
      assert_eq!(resp.headers().get("x-ratelimit-limit").unwrap(), "2");
      assert_eq!(resp.headers().get("x-ratelimit-remaining").unwrap(), expected_remaining);
      assert!(resp.headers().contains_key("x-ratelimit-reset"));
    }

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.10")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(!resp.headers().contains_key("x-ratelimit-limit"));
    assert!(!resp.headers().contains_key("x-ratelimit-remaining"));
    assert!(!resp.headers().contains_key("x-ratelimit-reset"));
    assert!(resp.headers().contains_key(header::RETRY_AFTER));
    let err_body = read_json(resp).await;
    assert_eq!(err_body["name"], "TOO_MANY_REQUEST");

    // Client B (X-Real-IP: 198.51.100.20) has an independent bucket and is not affected by Client A.
    let resp_b = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.20")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp_b.status(), StatusCode::OK);
    assert_eq!(resp_b.headers().get("x-ratelimit-remaining").unwrap(), "1");

    // Rotating forged unverified Bearer aff_mcp_v1.<rand>.x from the same source IP
    // must still share one throttle bucket and hit 429 on the 3rd request.
    for i in 0..2 {
      let resp = router
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri(format!("/api/workspaces/{ws_id}/mcp"))
            .header("x-real-ip", "198.51.100.30")
            .header(header::AUTHORIZATION, format!("Bearer aff_mcp_v1.forged{i}.secret"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
      assert_eq!(resp.headers().get("x-ratelimit-limit").unwrap(), "2");
    }
    let resp_forged_3 = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.30")
          .header(header::AUTHORIZATION, "Bearer aff_mcp_v1.forged2.secret")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp_forged_3.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(resp_forged_3.headers().contains_key(header::RETRY_AFTER));
    let forged_err = read_json(resp_forged_3).await;
    assert_eq!(forged_err["name"], "TOO_MANY_REQUEST");

    // Distinct ConnectInfo peers without proxy headers also get independent buckets.
    for peer_octet in [1u8, 2u8] {
      let mut req = Request::builder()
        .method("POST")
        .uri(format!("/api/workspaces/{ws_id}/mcp"))
        .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
        .unwrap();
      req
        .extensions_mut()
        .insert(axum::extract::ConnectInfo(std::net::SocketAddr::from((
          [203, 0, 113, peer_octet],
          40000,
        ))));
      let resp = router.clone().oneshot(req).await.unwrap();
      assert_eq!(resp.status(), StatusCode::OK);
      assert_eq!(resp.headers().get("x-ratelimit-remaining").unwrap(), "1");
    }

    // Overlong tracker header (> 256 bytes) is hashed and still throttled cleanly.
    let long_ip = "x".repeat(300);
    for _ in 0..2 {
      let resp = router
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri(format!("/api/workspaces/{ws_id}/mcp"))
            .header("x-real-ip", &long_ip)
            .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::OK);
    }
    let resp_long_3 = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", &long_ip)
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp_long_3.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(!resp_long_3.headers().contains_key("x-ratelimit-limit"));
    assert!(resp_long_3.headers().contains_key(header::RETRY_AFTER));

    // doc_search returns SEARCH_UNAVAILABLE without doc_ids when search is unavailable,
    // and falls back to retrieval_mode="scoped", degraded_reason="SEARCH_UNAVAILABLE" when doc_ids are provided.
    let scoped_doc_id = state
      .mcp
      .create_document(&ws_id, "Scoped Doc", "Fallback search body", &uid, None)
      .await
      .expect("create scoped doc");
    let search_unavail = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.40")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"doc_search","arguments":{"query":"hello"}}}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(search_unavail.status(), StatusCode::OK);
    let unavail_body = read_json(search_unavail).await;
    assert_eq!(unavail_body["result"]["isError"], true);
    assert_eq!(unavail_body["result"]["content"][0]["text"], "SEARCH_UNAVAILABLE");

    let search_scoped = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.41")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            json!({
              "jsonrpc": "2.0",
              "id": 8,
              "method": "tools/call",
              "params": {
                "name": "doc_search",
                "arguments": { "query": "hello", "doc_ids": [&scoped_doc_id] }
              }
            })
            .to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(search_scoped.status(), StatusCode::OK);
    let scoped_body = read_json(search_scoped).await;
    let payload: Value =
      serde_json::from_str(scoped_body["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(payload["retrieval_mode"], "scoped");
    assert_eq!(payload["degraded_reason"], "SEARCH_UNAVAILABLE");
    let scoped_hit = payload["hits"][0].as_object().expect("scoped hit object");
    let mut scoped_keys: Vec<&str> = scoped_hit.keys().map(String::as_str).collect();
    scoped_keys.sort_unstable();
    assert_eq!(scoped_keys, vec!["doc_id", "excerpt", "title", "visibility"]);
    assert_eq!(scoped_hit["doc_id"], scoped_doc_id);
    assert_eq!(scoped_hit["title"], "Scoped Doc");
    assert_eq!(scoped_hit["visibility"], "page");
    assert!(scoped_hit["excerpt"].as_str().unwrap().contains("Fallback search body"));

    // Explicit empty doc_ids: [] returns empty lexical hits even when search is disabled (v0.27.5 indexer/service.ts:105).
    let empty_unavail = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.43")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"doc_search","arguments":{"query":"hello","doc_ids":[]}}}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    let empty_unavail_body = read_json(empty_unavail).await;
    assert!(empty_unavail_body["result"].get("isError").is_none());
    let empty_unavail_payload: Value =
      serde_json::from_str(empty_unavail_body["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(empty_unavail_payload["retrieval_mode"], "lexical");
    assert_eq!(empty_unavail_payload["degraded_reason"], "VECTOR_UNAVAILABLE");
    assert_eq!(empty_unavail_payload["hits"], json!([]));

    state.db.pool().close().await;
  });
}

#[test]
fn mcp_doc_search_lexical_hits_real_search_runtime() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let redis_url = redis.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let (state, _router) = setup_http_state(&db_url, &redis_url, true, true).await;
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(state.db.pool())
      .await
      .expect("reset schema for fresh ensure_schema_ready");
    state.db.ensure_schema_ready().await.expect("ensure v2 search schema");
    let (uid, ws_id) = insert_user_and_workspace(&state, "lex-search@example.com").await;
    let created = state
      .mcp
      .create(CreateMcpCredentialParams {
        user_id: uid.clone(),
        workspace_id: ws_id.clone(),
        name: "Lex Search".to_owned(),
        access_mode: McpAccessMode::ReadOnly,
        expiration_days: 90,
      })
      .await
      .expect("create lex credential");

    // Real SearchRuntime lexical search: index a page block + canvas surface element + frame,
    // then verify doc_search returns retrieval_mode="lexical" with exact block_id/element_id/frame_id.
    let lex_doc_id = Uuid::new_v4().to_string();
    let lex_blob = {
      let d = y_octo::Doc::new();
      let mut bm = d.get_or_create_map("blocks").unwrap();
      let make_text = |d: &y_octo::Doc, s: &str| {
        let mut yt = d.create_text().unwrap();
        yt.insert(0, s).unwrap();
        yt
      };
      let mut pg = d.create_map().unwrap();
      pg.insert("sys:id".to_owned(), y_octo::Any::String("page:lex".to_owned())).unwrap();
      pg.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".to_owned())).unwrap();
      pg.insert("prop:title".to_owned(), make_text(&d, "Quantum Roadmap")).unwrap();
      let mut pc = d.create_array().unwrap();
      pc.insert(0, y_octo::Any::String("note:lex".to_owned())).unwrap();
      pc.insert(1, y_octo::Any::String("surf:lex".to_owned())).unwrap();
      pc.insert(2, y_octo::Any::String("frame:lex".to_owned())).unwrap();
      pg.insert("sys:children".to_owned(), pc).unwrap();
      bm.insert("page:lex".to_owned(), pg).unwrap();

      let mut para = d.create_map().unwrap();
      para.insert("sys:id".to_owned(), y_octo::Any::String("blk:lex-p1".to_owned())).unwrap();
      para.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      para.insert("prop:type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      para.insert("prop:text".to_owned(), make_text(&d, "Quantum entanglement page block")).unwrap();
      para.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("blk:lex-p1".to_owned(), para).unwrap();

      let mut note = d.create_map().unwrap();
      note.insert("sys:id".to_owned(), y_octo::Any::String("note:lex".to_owned())).unwrap();
      note.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".to_owned())).unwrap();
      let mut nc = d.create_array().unwrap();
      nc.insert(0, y_octo::Any::String("blk:lex-p1".to_owned())).unwrap();
      note.insert("sys:children".to_owned(), nc).unwrap();
      bm.insert("note:lex".to_owned(), note).unwrap();

      let mut surf = d.create_map().unwrap();
      surf.insert("sys:id".to_owned(), y_octo::Any::String("surf:lex".to_owned())).unwrap();
      surf.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:surface".to_owned())).unwrap();
      let mut elems = d.create_map().unwrap();
      let mut el = d.create_map().unwrap();
      el.insert("id".to_owned(), y_octo::Any::String("elem:q1".to_owned())).unwrap();
      el.insert("type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      el.insert("text".to_owned(), make_text(&d, "Quantum canvas sticky element")).unwrap();
      elems.insert("elem:q1".to_owned(), el).unwrap();
      surf.insert("prop:elements".to_owned(), elems).unwrap();
      surf.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("surf:lex".to_owned(), surf).unwrap();

      let mut frame = d.create_map().unwrap();
      frame.insert("sys:id".to_owned(), y_octo::Any::String("frame:lex".to_owned())).unwrap();
      frame.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:frame".to_owned())).unwrap();
      frame.insert("prop:title".to_owned(), make_text(&d, "Quantum frame title")).unwrap();
      frame.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("frame:lex".to_owned(), frame).unwrap();

      d.encode_update_v1().unwrap()
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp(), clock_timestamp(), $4, $4)",
    )
    .bind(&ws_id)
    .bind(&lex_doc_id)
    .bind(&lex_blob)
    .bind(&uid)
    .execute(state.db.pool())
    .await
    .expect("seed lexical doc");
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, mode, blocked, title) VALUES ($1, $2, 0, false, 'Quantum Roadmap') ON CONFLICT (workspace_id, page_id) DO UPDATE SET title = EXCLUDED.title",
    )
    .bind(&ws_id)
    .bind(&lex_doc_id)
    .execute(state.db.pool())
    .await
    .expect("seed lexical workspace_page");

    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints(kind, scope, status, completed_at) VALUES ('workspace_doc_lifecycle_activation', 'global', 'active', now()) ON CONFLICT (kind, scope) DO UPDATE SET status = 'active'",
    )
    .execute(state.db.pool())
    .await
    .expect("activate global lifecycle");
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints(kind, scope, status, completed_at) VALUES ('workspace_doc_lifecycle', $1, 'completed', now()) ON CONFLICT (kind, scope) DO UPDATE SET status = 'completed'",
    )
    .bind(&ws_id)
    .execute(state.db.pool())
    .await
    .expect("complete workspace lifecycle");

    let enabled_search = Arc::new(
      server_search::SearchRuntime::new(
        state.db.pool().clone(),
        state.extension.quota_gate(),
        server_search::SearchConfig {
          enabled: true,
          ..server_search::SearchConfig::default()
        },
      )
      .expect("build enabled search runtime"),
    );
    enabled_search.initialize().await.expect("init embedded search");
    for _ in 0..12 {
      enabled_search.reconcile_pending(50).await.expect("reconcile search");
    }
    let enabled_search_handle = Arc::clone(&enabled_search);
    let lex_state = AppState::with_services(
      state.db.clone(),
      Some(redis::Client::open(redis_url.as_str()).expect("open redis")),
      (**state.config.load()).clone(),
      Arc::clone(&state.extension),
      server_http::AppServices {
        auth: state.auth.clone(),
        users: state.users.clone(),
        workspaces: state.workspaces.clone(),
        doc_sharing: state.doc_sharing.clone(),
        histories: state.histories.clone(),
        comments: state.comments.clone(),
        notifications: state.notifications.clone(),
        licenses: state.licenses.clone(),
        app_config: state.app_config.clone(),
        blobs: server_blob::BlobService::new(
          state.db.clone(),
          Arc::clone(&state.avatars),
          state.extension.quota_gate(),
        ),
        search: enabled_search,
        avatars: Arc::clone(&state.avatars),
        comment_attachments: Arc::clone(&state.comment_attachments),
        invalidation: Arc::clone(&state.invalidation),
        event_bus: Arc::clone(&state.event_bus),
      },
    );
    let lex_router = build_router(lex_state);

    let search_lex = lex_router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.42")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            json!({
              "jsonrpc": "2.0",
              "id": 9,
              "method": "tools/call",
              "params": {
                "name": "doc_search",
                "arguments": { "query": "Quantum", "limit": 10 }
              }
            })
            .to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(search_lex.status(), StatusCode::OK);
    let lex_body = read_json(search_lex).await;
    let lex_payload: Value =
      serde_json::from_str(lex_body["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(lex_payload["retrieval_mode"], "lexical");
    assert_eq!(lex_payload["degraded_reason"], "VECTOR_UNAVAILABLE");
    let lex_hits = lex_payload["hits"].as_array().expect("lexical hits array");
    // Per-doc aggregation emits at most 1 lexical hit per doc_id even when 3 blocks match.
    assert_eq!(lex_hits.len(), 1, "expected 1 aggregated hit per doc, got {lex_hits:?}");
    let hit = lex_hits[0].as_object().expect("lexical hit object");
    assert_eq!(hit["doc_id"], lex_doc_id);
    assert_eq!(hit["title"], "Quantum Roadmap");
    assert_eq!(hit["block_id"], "page:lex", "1.5x affine:page boost must prioritize page title hit");
    assert!(!hit.contains_key("unit_id"), "unit_id must never leak externally");
    for opt_k in ["block_id", "element_id", "frame_id"] {
      assert!(hit.get(opt_k).is_none_or(|v| !v.is_null()), "{opt_k} must be omitted rather than null");
    }
    let excerpt = hit["excerpt"].as_str().expect("highlight excerpt string");
    assert!(excerpt.contains("<b>Quantum</b>"), "expected <b> highlight in excerpt, got: {excerpt}");

    // Explicit empty doc_ids: [] with SearchRuntime enabled returns empty lexical hits without scanning workspace.
    let empty_lex = lex_router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.44")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"doc_search","arguments":{"query":"Quantum","doc_ids":[]}}}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(empty_lex.status(), StatusCode::OK);
    let empty_lex_body = read_json(empty_lex).await;
    let empty_lex_payload: Value =
      serde_json::from_str(empty_lex_body["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(empty_lex_payload["retrieval_mode"], "lexical");
    assert_eq!(empty_lex_payload["degraded_reason"], "VECTOR_UNAVAILABLE");
    assert_eq!(empty_lex_payload["hits"], json!([]));

    // load_page_titles DB failure must trigger SEARCH_UNAVAILABLE (without doc_ids)
    // and scoped fallback (with doc_ids), never silently returning empty titles.
    sqlx::raw_sql("ALTER TABLE workspace_pages RENAME COLUMN title TO title_broken")
      .execute(state.db.pool())
      .await
      .expect("break workspace_pages.title");
    let title_fail_no_ids = lex_router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.45")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"doc_search","arguments":{"query":"entanglement"}}}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    let title_fail_no_ids_body = read_json(title_fail_no_ids).await;
    assert_eq!(title_fail_no_ids_body["result"]["isError"], true);
    assert_eq!(title_fail_no_ids_body["result"]["content"][0]["text"], "SEARCH_UNAVAILABLE");

    let title_fail_scoped = lex_router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.46")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            json!({
              "jsonrpc": "2.0",
              "id": 13,
              "method": "tools/call",
              "params": {
                "name": "doc_search",
                "arguments": { "query": "entanglement", "doc_ids": [&lex_doc_id] }
              }
            })
            .to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    let title_fail_scoped_body = read_json(title_fail_scoped).await;
    let title_fail_payload: Value =
      serde_json::from_str(title_fail_scoped_body["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(title_fail_payload["retrieval_mode"], "scoped");
    assert_eq!(title_fail_payload["degraded_reason"], "SEARCH_UNAVAILABLE");
    assert_eq!(title_fail_payload["hits"][0]["doc_id"], lex_doc_id);
    assert_eq!(title_fail_payload["hits"][0]["title"], "Quantum Roadmap");

    sqlx::raw_sql("ALTER TABLE workspace_pages RENAME COLUMN title_broken TO title")
      .execute(state.db.pool())
      .await
      .expect("restore workspace_pages.title");

    // Aggregate bucket only inspects nodes[0], UnsupportedQuery fallback deduplicates by doc_id
    // before checking projection metadata, numeric 0 is rejected while string "0" is JS-truthy,
    // and empty-content affine:page requires workspace_pages title backfill.
    let bad_no_hash = json!({
      "fields": { "doc_id": ["doc-a"], "unit_id": ["u1"], "projection_version": [1], "visibility": ["page"] }
    });
    let bad_zero_num = json!({
      "fields": { "doc_id": ["doc-z"], "unit_id": ["uz"], "projection_version": [0], "source_hash": ["h"], "visibility": ["page"] }
    });
    let zero_str_ok = json!({
      "fields": { "doc_id": ["doc-zs"], "unit_id": ["uzs"], "projection_version": ["0"], "source_hash": ["h"], "visibility": ["page"] }
    });
    let good_a = json!({
      "fields": { "doc_id": ["doc-a"], "unit_id": ["u2"], "projection_version": [1], "source_hash": ["h2"], "visibility": ["page"] }
    });
    let good_b = json!({
      "fields": { "doc_id": ["doc-b"], "unit_id": ["ub"], "projection_version": [1], "source_hash": ["hb"], "visibility": ["page"] }
    });
    let empty_page_node = json!({
      "fields": { "doc_id": ["doc-empty"], "flavour": ["affine:page"], "content": [""] }
    });
    let titled_page_node = json!({
      "fields": { "doc_id": ["doc-titled"], "flavour": ["affine:page"], "content": ["Has Title"] }
    });
    assert!(server_http::rest::mcp::inline_page_title(&empty_page_node).is_none());
    assert_eq!(
      server_http::rest::mcp::inline_page_title(&titled_page_node),
      Some("Has Title")
    );
    assert!(!server_http::rest::mcp::has_projection_metadata(&bad_no_hash));
    assert!(!server_http::rest::mcp::has_projection_metadata(&bad_zero_num));
    assert!(server_http::rest::mcp::has_projection_metadata(&zero_str_ok));
    assert!(server_http::rest::mcp::has_projection_metadata(&good_a));
    let agg_selected = server_http::rest::mcp::select_aggregate_bucket_nodes(&json!({
      "buckets": [
        { "hits": { "nodes": [&bad_no_hash, &good_a] } },
        { "hits": { "nodes": [&bad_zero_num, &good_b] } },
        { "hits": { "nodes": [&good_b] } }
      ]
    }));
    let agg_valid: Vec<_> = agg_selected
      .into_iter()
      .filter(server_http::rest::mcp::has_projection_metadata)
      .collect();
    assert_eq!(agg_valid.len(), 1);
    assert_eq!(agg_valid[0]["fields"]["doc_id"][0], "doc-b");
    let fb_selected = server_http::rest::mcp::select_fallback_search_nodes(
      &json!({ "nodes": [&bad_no_hash, &good_a, &bad_zero_num, &good_b] }),
      10,
    );
    let fb_valid: Vec<_> = fb_selected
      .into_iter()
      .filter(server_http::rest::mcp::has_projection_metadata)
      .collect();
    assert_eq!(fb_valid.len(), 1);
    assert_eq!(fb_valid[0]["fields"]["doc_id"][0], "doc-b");

    // Title backfill runs BEFORE truncate(limit): seed a 2nd doc whose paragraph (not page title)
    // matches "Quantum". With limit=1, rank #1 is lex_doc_id (affine:page with non-empty title),
    // yet candidate #2 triggers load_page_titles, so breaking workspace_pages.title returns SEARCH_UNAVAILABLE.
    let doc2_id = state
      .mcp
      .create_document(&ws_id, "Second Doc Title", "Quantum second candidate body", &uid, None)
      .await
      .expect("create second lexical doc");
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, mode, blocked, title) VALUES ($1, $2, 0, false, 'Second Doc Title') ON CONFLICT (workspace_id, page_id) DO UPDATE SET title = EXCLUDED.title",
    )
    .bind(&ws_id)
    .bind(&doc2_id)
    .execute(state.db.pool())
    .await
    .expect("seed second workspace_page");
    for _ in 0..12 {
      enabled_search_handle.reconcile_pending(50).await.expect("reconcile doc2");
    }
    let lim1_ok = lex_router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.47")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"doc_search","arguments":{"query":"Quantum","limit":1}}}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    let lim1_ok_body = read_json(lim1_ok).await;
    let lim1_ok_payload: Value =
      serde_json::from_str(lim1_ok_body["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(lim1_ok_payload["retrieval_mode"], "lexical");
    assert_eq!(lim1_ok_payload["hits"].as_array().unwrap().len(), 1);
    assert_eq!(lim1_ok_payload["hits"][0]["doc_id"], lex_doc_id);
    assert_eq!(lim1_ok_payload["hits"][0]["title"], "Quantum Roadmap");

    sqlx::raw_sql("ALTER TABLE workspace_pages RENAME COLUMN title TO title_broken")
      .execute(state.db.pool())
      .await
      .expect("break workspace_pages.title for pre-truncate check");
    let lim1_fail = lex_router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri(format!("/api/workspaces/{ws_id}/mcp"))
          .header("x-real-ip", "198.51.100.48")
          .header(header::AUTHORIZATION, format!("Bearer {}", created.token))
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"doc_search","arguments":{"query":"Quantum","limit":1}}}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    let lim1_fail_body = read_json(lim1_fail).await;
    assert_eq!(lim1_fail_body["result"]["isError"], true);
    assert_eq!(lim1_fail_body["result"]["content"][0]["text"], "SEARCH_UNAVAILABLE");
    sqlx::raw_sql("ALTER TABLE workspace_pages RENAME COLUMN title_broken TO title")
      .execute(state.db.pool())
      .await
      .expect("restore workspace_pages.title after pre-truncate check");

    state.db.pool().close().await;
  });
}
