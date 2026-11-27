//! Integration regression tests for HTTP, CORS, GraphQL, Auth, and REST parity.

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use http::{HeaderValue, Method, Request, StatusCode, header};
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::CommunityExtension;
use server_types::{DeploymentMode, ServerRole};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster},
};
use tower::ServiceExt as _;

fn lease_db() -> DbLease {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database")
}

async fn setup_app(database_url: &str) -> (Arc<AppState>, axum::Router) {
  let db = ServerDb::connect(DbConfig {
    database_url: database_url.to_owned(),
    channel: "production".into(),
    role: ServerRole::Allinone,
    selfhosted: true,
    max_connections: 4,
    statement_timeout_ms: 5_000,
    tier_permits: [8, 4, 4, 2],
  })
  .await
  .expect("connect db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset schema");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  let cfg = RuntimeConfig {
    deployment_mode: DeploymentMode::Selfhosted,
    role: ServerRole::Allinone,
    external_url: "http://127.0.0.1:3010".to_owned(),
    ..RuntimeConfig::default()
  };
  let app = AppState::new(db, None, cfg, Arc::new(CommunityExtension::new()));
  let router = build_router(Arc::clone(&app));
  (app, router)
}

async fn send(router: &axum::Router, req: Request<Body>) -> (StatusCode, http::HeaderMap, Value, String) {
  let resp = router.clone().oneshot(req).await.expect("oneshot");
  let status = resp.status();
  let headers = resp.headers().clone();
  let bytes = axum::body::to_bytes(resp.into_body(), 10 * 1024 * 1024)
    .await
    .expect("read body");
  let text = String::from_utf8_lossy(&bytes).into_owned();
  let json = serde_json::from_slice::<Value>(&bytes).unwrap_or(Value::Null);
  (status, headers, json, text)
}

#[test]
fn http_auth_graphql_and_rest_parity() {
  let _lease = lease_db();
  let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
  rt.block_on(async {
    let (app, router) = setup_app(_lease.url()).await;

    // Global CORS preflight and POST origin allowlist; never emit ACAO: null with credentials.
    let (st, hdrs, _, _) = send(
      &router,
      Request::builder()
        .method(Method::OPTIONS)
        .uri("/graphql")
        .header(header::ORIGIN, "assets://.")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
        .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "content-type, x-affine-version")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    assert_eq!(hdrs.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(), "assets://.");
    assert_eq!(hdrs.get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS).unwrap(), "true");

    let (st, hdrs, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::ORIGIN, "capacitor://localhost")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"query":"{ __typename }"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
      hdrs.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(),
      "capacitor://localhost"
    );
    assert_eq!(hdrs.get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS).unwrap(), "true");

    let (_, hdrs_evil, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::ORIGIN, "https://evil.example")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"query":"{ __typename }"}"#))
        .unwrap(),
    )
    .await;
    assert!(hdrs_evil.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());
    assert!(hdrs_evil.get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS).is_none());

    let (_, hdrs_null, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::ORIGIN, "null")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"query":"{ __typename }"}"#))
        .unwrap(),
    )
    .await;
    assert!(hdrs_null.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());
    assert!(hdrs_null.get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS).is_none());

    // Production mode (dev_mode=false) must not allow plain http://localhost by default.
    let (_, hdrs_local_http, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::ORIGIN, "http://localhost")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"query":"{ __typename }"}"#))
        .unwrap(),
    )
    .await;
    assert!(hdrs_local_http.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());

    // Worker proxy allows desktop origin `assets://.` (not 400 Invalid header).
    let (st, _, _, text) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/api/worker/image-proxy")
        .header(header::ORIGIN, "assets://.")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert!(
      !text.contains("Invalid header"),
      "desktop origin must not be rejected: {text}"
    );

    // GraphQL entry protection: reject missing Content-Type, text/plain, >100 KiB queries,
    // GET without preflight (including safelisted Content-Type: text/plain), and non-query GET operations.
    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .body(Body::from(r#"{"query":"{ __typename }"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from(r#"{"query":"{ __typename }"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let big_query = format!("{{ __typename {} }}", " ".repeat(101 * 1024));
    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_vec(&json!({ "query": big_query })).unwrap()))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=%7B__typename%7D")
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, _, json_get, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=%7B__typename%7D")
        .header("apollo-require-preflight", "true")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(json_get["data"]["__typename"], "Query");

    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=mutation%7BcreateWorkspace%7Bid%7D%7D")
        .header("apollo-require-preflight", "true")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::METHOD_NOT_ALLOWED);

    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=subscription%7B__typename%7D")
        .header("apollo-require-preflight", "true")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::METHOD_NOT_ALLOWED);

    // Multi-operation GET document checks only the selected operationName.
    let (st, _, multi_q, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=query%20Q%7B__typename%7D%20mutation%20M%7BcreateWorkspace%7Bid%7D%7D&operationName=Q")
        .header("apollo-require-preflight", "true")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(multi_q["data"]["__typename"], "Query");

    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=query%20Q%7B__typename%7D%20mutation%20M%7BcreateWorkspace%7Bid%7D%7D&operationName=M")
        .header("apollo-require-preflight", "true")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::METHOD_NOT_ALLOWED);

    // Multi-op GET without operationName returns 400 (not 405), and nonexistent operationName on mutation-only returns 400 without executing.
    let (st, _, multi_missing_op, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=query%20Q%7B__typename%7D%20mutation%20M%7BcreateWorkspace%7Bid%7D%7D")
        .header("apollo-require-preflight", "true")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(multi_missing_op["errors"][0]["extensions"]["code"], "Bad Request");
    assert_eq!(multi_missing_op["errors"][0]["extensions"]["name"], "GRAPHQL_BAD_REQUEST");

    let (st, _, nonexistent_op, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/graphql?query=mutation%20M%7BcreateWorkspace%7Bid%7D%7D&operationName=nonexistent")
        .header("apollo-require-preflight", "true")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(nonexistent_op["errors"][0]["extensions"]["code"], "Bad Request");
    assert_eq!(nonexistent_op["errors"][0]["extensions"]["name"], "GRAPHQL_BAD_REQUEST");

    // GraphQL parse error returns HTTP 400 with UserFriendlyError extensions envelope.
    let (st, _, parse_err, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"query":"{ __typename"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(parse_err["errors"][0]["extensions"]["code"], "Bad Request");
    assert_eq!(parse_err["errors"][0]["extensions"]["name"], "GRAPHQL_BAD_REQUEST");
    assert_eq!(
      parse_err["errors"][0]["extensions"]["data"]["code"],
      "GRAPHQL_PARSE_FAILED"
    );

    // GraphQL validation error returns HTTP 400 with UserFriendlyError extensions envelope.
    let (st, _, val_err, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"query":"{ doesNotExistField123 }"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(val_err["errors"][0]["extensions"]["code"], "Bad Request");
    assert_eq!(val_err["errors"][0]["extensions"]["name"], "GRAPHQL_BAD_REQUEST");
    assert_eq!(
      val_err["errors"][0]["extensions"]["data"]["code"],
      "GRAPHQL_VALIDATION_FAILED"
    );

    // Invalid Bearer JWT on GraphQL returns HTTP 200 GraphQL envelope.
    let (st, _, jwt_err, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .header(
          header::AUTHORIZATION,
          "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalidsig",
        )
        .body(Body::from(r#"{"query":"{ currentUser { id } }"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(jwt_err["errors"][0]["extensions"]["name"], "ACCESS_TOKEN_INVALID");
    assert_eq!(jwt_err["errors"][0]["message"], "The access token is invalid.");

    // MCP Bearer token on /api/auth/session returns 200 with null user.
    let (st, _, mcp_sess, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/api/auth/session")
        .header(header::AUTHORIZATION, "Bearer aff_mcp_v1.abc123.def456")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert!(mcp_sess.get("user").is_none() || mcp_sess["user"].is_null());

    // Setup admin user returns HTTP 200 OK.
    let (st, hdrs, setup_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/api/setup/create-admin-user")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
          r#"{"email":"admin@example.com","password":"Password123!","name":"Admin"}"#,
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let admin_id = setup_json["id"].as_str().unwrap().to_owned();
    let admin_cookie: String = hdrs
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok())
      .map(|c| c.split(';').next().unwrap().trim().to_owned())
      .collect::<Vec<_>>()
      .join("; ");

    // Native sign-in issues exchangeCode only, clears cookies, and inserts zero cookie sessions.
    let before_sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_sessions WHERE user_id = $1")
      .bind(&admin_id)
      .fetch_one(app.db.pool())
      .await
      .unwrap();
    let (st, hdrs, native_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/api/auth/sign-in")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-affine-client-kind", "native")
        .body(Body::from(
          r#"{"email":"admin@example.com","password":"Password123!"}"#,
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert!(native_json["exchangeCode"].as_str().is_some_and(|s| !s.is_empty()));
    let after_sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_sessions WHERE user_id = $1")
      .bind(&admin_id)
      .fetch_one(app.db.pool())
      .await
      .unwrap();
    assert_eq!(
      before_sessions, after_sessions,
      "native sign-in must not insert cookie sessions"
    );
    let set_cookies: Vec<&str> = hdrs
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok())
      .collect();
    assert!(
      set_cookies
        .iter()
        .any(|c| c.starts_with("affine_session=;") && c.contains("HttpOnly") && c.contains("SameSite=Lax"))
    );

    // Invalid exchange code returns 400 INVALID_AUTH_STATE.
    let (st, _, bad_ex, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/api/auth/session/exchange")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-affine-client-kind", "native")
        .body(Body::from(
          r#"{"code":"missing-code","installationId":"00000000-0000-4000-8000-000000000001","platform":"electron"}"#,
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(bad_ex["name"], "INVALID_AUTH_STATE");

    // Per-email sign-in rate limit (5/60s): 6th attempt returns 429 TOO_MANY_REQUEST.
    let mut statuses = Vec::new();
    for _ in 0..6 {
      let (s, _, _, _) = send(
        &router,
        Request::builder()
          .method(Method::POST)
          .uri("/api/auth/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"email":"ratelimit-test@example.com","password":"WrongPassword!"}"#,
          ))
          .unwrap(),
      )
      .await;
      statuses.push(s);
    }
    assert_eq!(statuses[5], StatusCode::TOO_MANY_REQUESTS);

    // GraphQL Multipart single 110B file mapped to 2 variables reads full 110B on both.
    let (st, _, ws_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &admin_cookie)
        .body(Body::from(r#"{"query":"mutation { createWorkspace { id } }"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let ws_id = ws_json["data"]["createWorkspace"]["id"].as_str().unwrap().to_owned();

    let boundary = "----MultipartBoundaryTest";
    let ops = json!({
      "query": "mutation($a:Upload!,$b:Upload!,$w:String!){ m1:setBlob(workspaceId:$w,blob:$a) m2:setBlob(workspaceId:$w,blob:$b) }",
      "variables": { "a": Value::Null, "b": Value::Null, "w": ws_id }
    })
    .to_string();
    let map_json = r#"{"0":["variables.a","variables.b"]}"#;
    let content = "HELLO_WORLD_100_BYTES_".repeat(5);
    let mp_body = format!(
      "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{ops}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{map_json}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"a.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n{content}\r\n\
       --{boundary}--\r\n"
    );
    let (st, _, mp_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .header(header::COOKIE, &admin_cookie)
        .header("apollo-require-preflight", "true")
        .body(Body::from(mp_body))
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert!(mp_json.get("errors").is_none(), "unexpected multipart errors: {mp_json}");
    assert_eq!(mp_json["data"]["m1"], mp_json["data"]["m2"]);

    // Cookie-authenticated GraphQL multipart requires preflight or trusted Origin/Referer.
    let simple_mp = format!(
      "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{{\"query\":\"{{ currentUser {{ id }} }}\"}}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{{}}\r\n\
       --{boundary}--\r\n"
    );
    let (st_csrf_missing, _, csrf_missing_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .header(header::COOKIE, &admin_cookie)
        .body(Body::from(simple_mp.clone()))
        .unwrap(),
    )
    .await;
    assert_eq!(st_csrf_missing, StatusCode::BAD_REQUEST);
    assert_eq!(csrf_missing_json["errors"][0]["extensions"]["code"], "Bad Request");
    assert_eq!(
      csrf_missing_json["errors"][0]["extensions"]["name"],
      "GRAPHQL_BAD_REQUEST"
    );

    let (st_csrf_trusted_origin, _, trusted_origin_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .header(header::COOKIE, &admin_cookie)
        .header(header::ORIGIN, "http://127.0.0.1:3010")
        .body(Body::from(simple_mp.clone()))
        .unwrap(),
    )
    .await;
    assert_eq!(st_csrf_trusted_origin, StatusCode::OK);
    assert!(trusted_origin_json.get("errors").is_none());

    let (st_csrf_preflight, _, preflight_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .header(header::COOKIE, &admin_cookie)
        .header("x-apollo-operation-name", "currentUserOp")
        .body(Body::from(simple_mp.clone()))
        .unwrap(),
    )
    .await;
    assert_eq!(st_csrf_preflight, StatusCode::OK);
    assert!(preflight_json.get("errors").is_none());

    let (st_csrf_origin, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .header(header::COOKIE, &admin_cookie)
        .header(header::ORIGIN, "https://evil.example")
        .body(Body::from(simple_mp.clone()))
        .unwrap(),
    )
    .await;
    assert_eq!(st_csrf_origin, StatusCode::BAD_REQUEST);

    let (st_csrf_sfs, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .header(header::COOKIE, &admin_cookie)
        .header("sec-fetch-site", "cross-site")
        .body(Body::from(simple_mp.clone()))
        .unwrap(),
    )
    .await;
    assert_eq!(st_csrf_sfs, StatusCode::BAD_REQUEST);

    let (st_csrf_same_site, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .header(header::COOKIE, &admin_cookie)
        .header("sec-fetch-site", "same-site")
        .body(Body::from(simple_mp))
        .unwrap(),
    )
    .await;
    assert_eq!(st_csrf_same_site, StatusCode::BAD_REQUEST);

    // 20 concurrent cookie-authenticated session requests complete without InteractiveRead semaphore deadlock.
    let concurrent_futs = (0..20).map(|_| {
      let r = router.clone();
      let cookie = admin_cookie.clone();
      async move {
        let (s, _, _, _) = send(
          &r,
          Request::builder()
            .method(Method::GET)
            .uri("/api/auth/session")
            .header(header::COOKIE, cookie)
            .body(Body::empty())
            .unwrap(),
        )
        .await;
        s
      }
    });
    let concurrent_statuses = tokio::time::timeout(
      std::time::Duration::from_secs(5),
      futures_util::future::join_all(concurrent_futs),
    )
    .await
    .expect("20 concurrent affine_session requests must not deadlock");
    assert!(concurrent_statuses.iter().all(|s| *s == StatusCode::OK));

    // Custom app_configs auth.signInRateLimit (ms TTL) increments both email and IP buckets simultaneously.
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, last_updated_by, created_at, updated_at)
         VALUES ('auth.signInRateLimit', '{"ttl":30000,"emailLimit":2,"ipLimit":3}'::jsonb, NULL, now(), now())
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();
    app.app_config.invalidate_cache();
    let test_ip = "203.0.113.42";
    for email in ["dual-a@example.com", "dual-a@example.com", "dual-b@example.com"] {
      let (s, _, _, _) = send(
        &router,
        Request::builder()
          .method(Method::POST)
          .uri("/api/auth/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .header("x-forwarded-for", test_ip)
          .body(Body::from(
            json!({ "email": email, "password": "WrongPassword!" }).to_string(),
          ))
          .unwrap(),
      )
      .await;
      assert_ne!(s, StatusCode::TOO_MANY_REQUESTS);
    }
    let (st_ip_rl, hdrs_ip_rl, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/api/auth/sign-in")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", test_ip)
        .body(Body::from(
          r#"{"email":"dual-c@example.com","password":"WrongPassword!"}"#,
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(st_ip_rl, StatusCode::TOO_MANY_REQUESTS);
    let retry_secs: u64 = hdrs_ip_rl
      .get(header::RETRY_AFTER)
      .and_then(|v| v.to_str().ok())
      .and_then(|s| s.parse().ok())
      .expect("Retry-After header on 429");
    assert!((1..=30).contains(&retry_secs), "expected Retry-After in 1..=30s, got {retry_secs}");

    // UserType.{settings, quota, quotaUsage} reject cross-user access with 403 ACCESS_DENIED even for Admin.
    let (st_u2, _, u2_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &admin_cookie)
        .body(Body::from(
          r#"{"query":"mutation { createUser(input: { email: \"other-user@example.com\", name: \"Other User\" }) { id } }"}"#,
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(st_u2, StatusCode::OK, "createUser failed: {u2_json}");
    assert!(u2_json.get("errors").is_none(), "createUser errors: {u2_json}");
    let other_id = u2_json["data"]["createUser"]["id"].as_str().expect("other user id");
    let (st_cross, _, cross_json, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &admin_cookie)
        .body(Body::from(
          json!({
            "query": format!("{{ userById(id: \"{other_id}\") {{ id settings {{ receiveInvitationEmail }} quota {{ name }} quotaUsage {{ storageQuota }} }} }}")
          })
          .to_string(),
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(st_cross, StatusCode::OK);
    let cross_errs = cross_json["errors"]
      .as_array()
      .unwrap_or_else(|| panic!("expected cross-user errors, got {cross_json}"));
    assert!(
      cross_errs
        .iter()
        .any(|e| e["extensions"]["status"] == 403 && e["extensions"]["name"] == "ACCESS_DENIED"),
      "expected 403 ACCESS_DENIED on cross-user UserType.settings/quota/quotaUsage, got {cross_json}"
    );

    // readable-blob-manifest?limit=abc defaults to 25 (HTTP 200); anonymous -> 403 ACCESS_DENIED.
    let (st, _, manifest_json, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri(format!("/api/workspaces/{ws_id}/readable-blob-manifest/v1?limit=abc"))
        .header(header::COOKIE, &admin_cookie)
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(manifest_json["version"], 1);

    let (st, _, anon_manifest, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri(format!("/api/workspaces/{ws_id}/readable-blob-manifest/v1"))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    assert_eq!(anon_manifest["name"], "ACCESS_DENIED");

    // PUT /api/storage/upload missing params returns 400 BLOB_INVALID with type=INVALID_INPUT.
    let (st, _, r2_err, _) = send(
      &router,
      Request::builder()
        .method(Method::PUT)
        .uri("/api/storage/upload")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(r2_err["name"], "BLOB_INVALID");
    assert_eq!(r2_err["type"], "INVALID_INPUT");

    // Avatar Last-Modified is IMF-fixdate, omits no-store, and honors If-Modified-Since with 304.
    app
      .avatars
      .put("av1", b"png-bytes".to_vec(), "image/png")
      .await
      .expect("put avatar");
    let (st, hdrs, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/api/avatars/av1")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let last_mod = hdrs
      .get(header::LAST_MODIFIED)
      .and_then(|v| v.to_str().ok())
      .expect("avatar Last-Modified")
      .to_owned();
    assert!(last_mod.ends_with(" GMT"), "expected IMF-fixdate, got {last_mod}");
    assert!(
      !hdrs
        .get(header::CACHE_CONTROL)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .contains("no-store")
    );
    let (st_304, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/api/avatars/av1")
        .header(header::IF_MODIFIED_SINCE, HeaderValue::from_str(&last_mod).unwrap())
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st_304, StatusCode::NOT_MODIFIED);
  });
}

#[test]
fn setup_middleware_exact_admin_setup_path() {
  let _lease = lease_db();
  let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig {
      database_url: _lease.url().to_owned(),
      channel: "production".into(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 4, 2],
    })
    .await
    .expect("connect db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema");
    db.ensure_schema_ready().await.expect("ensure schema ready");

    let static_dir = std::env::temp_dir().join(format!("affine-setup-mw-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(static_dir.join("admin")).expect("create temp static dir");
    std::fs::write(
      static_dir.join("selfhost.html"),
      "<!doctype html><html><body>selfhost-app-marker</body></html>",
    )
    .expect("write selfhost.html");
    std::fs::write(
      static_dir.join("admin").join("selfhost.html"),
      "<!doctype html><html><body>selfhost-app-marker</body></html>",
    )
    .expect("write admin/selfhost.html");

    let cfg = RuntimeConfig {
      deployment_mode: DeploymentMode::Selfhosted,
      role: ServerRole::Allinone,
      external_url: "http://127.0.0.1:3010".to_owned(),
      static_dir: Some(static_dir.clone()),
      ..RuntimeConfig::default()
    };
    let app = AppState::new(db, None, cfg, Arc::new(CommunityExtension::new()));
    let router = build_router(Arc::clone(&app));

    // 1. Uninitialized: /admin/setup/x is NOT exact /admin/setup, so redirects 302 -> /admin/setup.
    let (st, hdrs, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/admin/setup/x")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st, StatusCode::FOUND);
    assert_eq!(hdrs.get(header::LOCATION).unwrap(), "/admin/setup");

    // Create admin user so instance becomes initialized.
    let (st_su, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/api/setup/create-admin-user")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
          r#"{"name":"Setup Admin","email":"setup-mw@example.com","password":"StrongPassword123!"}"#,
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(st_su, StatusCode::OK);

    // 2. Initialized: exact /admin/setup redirects 302 -> /admin.
    let (st_init_setup, hdrs_init_setup, _, _) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/admin/setup")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st_init_setup, StatusCode::FOUND);
    assert_eq!(hdrs_init_setup.get(header::LOCATION).unwrap(), "/admin");

    // 3. Initialized: /admin/setup/x is NOT exact /admin/setup, so serves selfhost.html (200).
    let (st_init_sub, _, _, body_sub) = send(
      &router,
      Request::builder()
        .method(Method::GET)
        .uri("/admin/setup/x")
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(st_init_sub, StatusCode::OK);
    assert!(
      body_sub.contains("selfhost-app-marker"),
      "expected selfhost.html body, got: {body_sub}"
    );

    let _ = std::fs::remove_dir_all(&static_dir);
  });
}

#[test]
fn sign_in_rate_limit_honors_ioredis_key_prefix_and_ms_pttl() {
  let _lease = lease_db();
  let redis_guard = test_db_harness::redis::TestRedis::from_env_or_docker().expect("test redis");
  let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig {
      database_url: _lease.url().to_owned(),
      channel: "production".into(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 4, 2],
    })
    .await
    .expect("connect db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema");
    db.ensure_schema_ready().await.expect("ensure schema ready");

    let redis_client = redis::Client::open(redis_guard.url()).expect("open redis client");
    let prefix = format!("pfx_{}:", uuid::Uuid::new_v4().simple());
    let baseline = server_domain::app_config::RuntimeAppConfigBaseline {
      file_json: json!({
        "redis": {
          "ioredis": { "keyPrefix": prefix }
        }
      }),
      ..Default::default()
    };
    let cfg = RuntimeConfig {
      deployment_mode: DeploymentMode::Selfhosted,
      role: ServerRole::Allinone,
      external_url: "http://127.0.0.1:3010".to_owned(),
      app_config_baseline: baseline,
      ..RuntimeConfig::default()
    };
    let app = AppState::new(db, Some(redis_client.clone()), cfg, Arc::new(CommunityExtension::new()));
    let router = build_router(Arc::clone(&app));

    let email = "ioredis-prefix-test@example.com";
    let (st, _, _, _) = send(
      &router,
      Request::builder()
        .method(Method::POST)
        .uri("/api/auth/sign-in")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
          json!({ "email": email, "password": "WrongPassword!" }).to_string(),
        ))
        .unwrap(),
    )
    .await;
    assert_ne!(st, StatusCode::TOO_MANY_REQUESTS);

    use sha2::{Digest as _, Sha256};
    let mut conn = redis_client
      .get_multiplexed_async_connection()
      .await
      .expect("redis conn");
    let email_hash = hex::encode(Sha256::digest(email.to_ascii_lowercase().as_bytes()));
    let expected_key = format!("{prefix}auth:sign-in-rate:email:{email_hash}");
    let count: Option<i64> = redis::cmd("GET")
      .arg(&expected_key)
      .query_async(&mut conn)
      .await
      .expect("redis GET");
    assert_eq!(count, Some(1), "expected key {expected_key} to have count=1");
    let pttl: i64 = redis::cmd("PTTL")
      .arg(&expected_key)
      .query_async(&mut conn)
      .await
      .expect("redis PTTL");
    assert!(
      pttl > 0 && pttl <= 60_000,
      "expected millisecond PTTL in (0, 60000], got {pttl}"
    );
  });
}
