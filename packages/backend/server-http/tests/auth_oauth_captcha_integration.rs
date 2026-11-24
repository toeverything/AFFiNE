//! Real PostgreSQL integration tests for OAuth/OIDC, PostgreSQL-backed
//! Hashcash and Turnstile Captcha, and `max_connections = 1` outbound HTTP
//! deadlock freedom.

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::Router;
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode, header};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use p256::ecdsa::{SigningKey, signature::Signer as _};
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_domain::auth::CreateAdminUserInput;
use server_domain::auth::captcha::{
  CAPTCHA_PURPOSE, CaptchaPluginConfig, CaptchaVerificationRequest, HashcashRuntimeConfig, HashcashStamp,
  TurnstileRuntimeConfig, verify_captcha_with_turnstile_endpoint,
};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::CommunityExtension;
use server_types::ServerRole;
use tokio::net::TcpListener;
use tower::ServiceExt as _;

fn lease_test_db() -> test_db_harness::pg::DbLease {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = test_db_harness::migrations::MigrationSet {
    migrations: vec![],
    digest: "5e20000000000011".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test database")
}

async fn connect_and_init_db(db_url: &str, max_connections: u32) -> ServerDb {
  let db = ServerDb::connect(DbConfig {
    database_url: db_url.to_owned(),
    channel: "canary".into(),
    role: ServerRole::Allinone,
    selfhosted: true,
    max_connections,
    statement_timeout_ms: 10_000,
    tier_permits: [4, 2, 2, 1],
  })
  .await
  .expect("connect test db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset schema");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

fn run_async<F: std::future::Future<Output = ()>>(fut: F) {
  tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime")
    .block_on(fut);
}

async fn send_json(
  router: &Router,
  method: &str,
  uri: &str,
  headers: &[(&str, &str)],
  body: Option<Value>,
) -> (StatusCode, Value, axum::http::HeaderMap) {
  let mut req_builder = Request::builder().method(method).uri(uri);
  for &(k, v) in headers {
    req_builder = req_builder.header(k, v);
  }
  let body = match body {
    Some(v) => {
      req_builder = req_builder.header(header::CONTENT_TYPE, "application/json");
      Body::from(serde_json::to_vec(&v).unwrap())
    }
    None => Body::empty(),
  };
  let resp = router.clone().oneshot(req_builder.body(body).unwrap()).await.unwrap();
  let status = resp.status();
  let resp_headers = resp.headers().clone();
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
  let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
  (status, json, resp_headers)
}

#[derive(Clone)]
struct MockOidcState {
  issuer: String,
  signing_key: SigningKey,
  redirect_token_endpoint: bool,
  token_hits: Arc<AtomicUsize>,
  expected_nonce: Arc<tokio::sync::RwLock<String>>,
  sub: String,
  email: String,
  db_probe: Option<ServerDb>,
}

async fn start_mock_oidc_server(
  redirect_token_endpoint: bool,
  sub: &str,
  email: &str,
  db_probe: Option<ServerDb>,
) -> (String, Arc<tokio::sync::RwLock<String>>, Arc<AtomicUsize>) {
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let addr = listener.local_addr().unwrap();
  let issuer = format!("http://{addr}");
  let expected_nonce = Arc::new(tokio::sync::RwLock::new(String::new()));
  let token_hits = Arc::new(AtomicUsize::new(0));
  let state = MockOidcState {
    issuer: issuer.clone(),
    signing_key: SigningKey::from_slice(&[9_u8; 32]).unwrap(),
    redirect_token_endpoint,
    token_hits: Arc::clone(&token_hits),
    expected_nonce: Arc::clone(&expected_nonce),
    sub: sub.to_owned(),
    email: email.to_owned(),
    db_probe,
  };

  let app = Router::new()
    .route(
      "/.well-known/openid-configuration",
      get(|State(st): State<MockOidcState>| async move {
        axum::Json(json!({
          "issuer": st.issuer,
          "authorization_endpoint": format!("{}/authorize", st.issuer),
          "token_endpoint": format!("{}/token", st.issuer),
          "userinfo_endpoint": format!("{}/userinfo", st.issuer),
          "jwks_uri": format!("{}/jwks", st.issuer),
        }))
      }),
    )
    .route(
      "/token",
      post(|State(st): State<MockOidcState>| async move {
        st.token_hits.fetch_add(1, Ordering::SeqCst);
        if let Some(db) = &st.db_probe {
          let one: i32 = sqlx::query_scalar("SELECT 1")
            .fetch_one(db.pool())
            .await
            .expect("DB pool must remain available during outbound OIDC HTTP call");
          assert_eq!(one, 1);
        }
        if st.redirect_token_endpoint {
          let mut resp = StatusCode::FOUND.into_response();
          resp
            .headers_mut()
            .insert(header::LOCATION, axum::http::HeaderValue::from_static("/elsewhere"));
          return resp;
        }
        let nonce = st.expected_nonce.read().await.clone();
        let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"ES256","kid":"oidc-k1"}"#);
        let exp = Utc::now().timestamp() + 300;
        let claims = URL_SAFE_NO_PAD.encode(
          serde_json::to_vec(&json!({
            "iss": st.issuer,
            "aud": "oidc-client",
            "sub": st.sub,
            "email": st.email,
            "email_verified": true,
            "nonce": nonce,
            "exp": exp,
          }))
          .unwrap(),
        );
        let input = format!("{header}.{claims}");
        let sig: p256::ecdsa::Signature = st.signing_key.sign(input.as_bytes());
        let id_token = format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()));
        axum::Json(json!({
          "access_token": "mock-access-token",
          "id_token": id_token,
        }))
        .into_response()
      }),
    )
    .route(
      "/jwks",
      get(|State(st): State<MockOidcState>| async move {
        let pt = st.signing_key.verifying_key().to_encoded_point(false);
        axum::Json(json!({
          "keys": [{
            "kty": "EC",
            "crv": "P-256",
            "kid": "oidc-k1",
            "x": URL_SAFE_NO_PAD.encode(pt.x().unwrap()),
            "y": URL_SAFE_NO_PAD.encode(pt.y().unwrap()),
          }]
        }))
      }),
    )
    .route(
      "/userinfo",
      get(|State(st): State<MockOidcState>| async move {
        axum::Json(json!({
          "sub": st.sub,
          "email": st.email,
          "email_verified": true,
          "name": "OIDC User",
        }))
      }),
    )
    .with_state(state);

  tokio::spawn(async move {
    axum::serve(listener, app).await.unwrap();
  });

  (issuer, expected_nonce, token_hits)
}

#[test]
fn oauth_preflight_version_guard_concurrent_callback_and_redirect_blocking() {
  let lease = lease_test_db();
  let db_url = lease.url().to_owned();
  run_async(async move {
    let db = connect_and_init_db(&db_url, 4).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        external_url: "http://localhost:3010".into(),
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let router = build_router(Arc::clone(&state));

    let (issuer, expected_nonce, token_hits) =
      start_mock_oidc_server(false, "oidc-sub-1", "oidc@example.test", None).await;
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at)
         VALUES
           ('oauth.providers.oidc', $1, clock_timestamp(), clock_timestamp()),
           ('client.versionControl.enabled', 'true'::jsonb, clock_timestamp(), clock_timestamp()),
           ('client.versionControl.requiredVersion', '">=0.27.0"'::jsonb, clock_timestamp(), clock_timestamp())"#,
    )
    .bind(json!({
      "clientId": "oidc-client",
      "clientSecret": "oidc-secret",
      "issuer": issuer,
      "allowPrivateNetwork": true,
    }))
    .execute(db.pool())
    .await
    .unwrap();
    state.app_config.invalidate_cache();

    // 1. Preflight MUST enforce @UseNamedGuard('version')
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": "OIDC", "client": "web", "client_nonce": "nonce-1" })),
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    assert_eq!(body["name"], "UNSUPPORTED_CLIENT_VERSION");

    // 2. Preflight with valid client version succeeds and emits PKCE S256
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[("x-affine-version", "0.27.5")],
      Some(json!({ "provider": "OIDC", "client": "web", "client_nonce": "nonce-1", "redirect_uri": "/workspace" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "preflight failed: {body}");
    let auth_url = url::Url::parse(body["url"].as_str().unwrap()).unwrap();
    let params: std::collections::HashMap<String, String> = auth_url.query_pairs().into_owned().collect();
    assert_eq!(params.get("code_challenge_method").map(String::as_str), Some("S256"));
    let raw_state = params.get("state").unwrap().clone();
    let state_json: Value = serde_json::from_str(&raw_state).unwrap();
    *expected_nonce.write().await = state_json["state"].as_str().unwrap().to_owned();

    // 3. Concurrent double callback WITHOUT x-affine-version (callback must NOT enforce version guard)
    let (r1, r2) = tokio::join!(
      send_json(
        &router,
        "POST",
        "/api/oauth/callback",
        &[],
        Some(json!({ "code": "code-1", "state": raw_state.clone(), "client_nonce": "nonce-1" })),
      ),
      send_json(
        &router,
        "POST",
        "/api/oauth/callback",
        &[],
        Some(json!({ "code": "code-1", "state": raw_state.clone(), "client_nonce": "nonce-1" })),
      ),
    );
    let ok_count = usize::from(r1.0 == StatusCode::OK) + usize::from(r2.0 == StatusCode::OK);
    assert_eq!(ok_count, 1, "expected exactly 1 success: r1={:?}, r2={:?}", r1.1, r2.1);
    assert_eq!(
      token_hits.load(Ordering::SeqCst),
      1,
      "token endpoint must be called once"
    );
    let failed = if r1.0 == StatusCode::OK { &r2.1 } else { &r1.1 };
    assert_eq!(failed["name"], "OAUTH_STATE_EXPIRED");

    // 4. Token endpoint 302 redirect MUST be blocked (max_redirects = 0)
    let (redir_issuer, redir_nonce, _) =
      start_mock_oidc_server(true, "oidc-sub-2", "oidc-redir@example.test", None).await;
    sqlx::query("UPDATE app_configs SET value = $1 WHERE id = 'oauth.providers.oidc'")
      .bind(json!({
        "clientId": "oidc-client",
        "clientSecret": "oidc-secret",
        "issuer": redir_issuer,
        "allowPrivateNetwork": true,
      }))
      .execute(db.pool())
      .await
      .unwrap();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[("x-affine-version", "0.27.5")],
      Some(json!({ "provider": "OIDC", "client": "web", "client_nonce": "nonce-redir" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let auth_url = url::Url::parse(body["url"].as_str().unwrap()).unwrap();
    let redir_state = auth_url
      .query_pairs()
      .find(|(k, _)| k == "state")
      .unwrap()
      .1
      .into_owned();
    let parsed_redir: Value = serde_json::from_str(&redir_state).unwrap();
    *redir_nonce.write().await = parsed_redir["state"].as_str().unwrap().to_owned();

    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/callback",
      &[],
      Some(json!({ "code": "code-redir", "state": redir_state, "client_nonce": "nonce-redir" })),
    )
    .await;
    assert_eq!(
      st,
      StatusCode::SERVICE_UNAVAILABLE,
      "302 redirect must be rejected: {body}"
    );

    db.pool().close().await;
  });
}

#[test]
fn captcha_pg_runtime_states_turnstile_and_max_connections_one_deadlock_freedom() {
  let lease = lease_test_db();
  let db_url = lease.url().to_owned();
  run_async(async move {
    let db = connect_and_init_db(&db_url, 1).await;

    // Mock Turnstile server that probes the single-connection DB pool while handling HTTP
    let turnstile_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let turnstile_url = format!("http://{}/siteverify", turnstile_listener.local_addr().unwrap());
    let db_for_turnstile = db.clone();
    tokio::spawn(async move {
      let app = Router::new().route(
        "/siteverify",
        post(move || {
          let db = db_for_turnstile.clone();
          async move {
            let one: i32 = sqlx::query_scalar("SELECT 1")
              .fetch_one(db.pool())
              .await
              .expect("DB pool must not be held during outbound Turnstile HTTP call");
            assert_eq!(one, 1);
            axum::Json(json!({
              "success": true,
              "hostname": "localhost",
              "action": "auth-sign-in",
            }))
          }
        }),
      );
      axum::serve(turnstile_listener, app).await.unwrap();
    });

    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        external_url: "http://localhost:3010".into(),
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let router = build_router(Arc::clone(&state));

    let _ = state
      .auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("CapAdmin".into()),
        email: "cap@example.test".into(),
        password: "Password123!".into(),
        client_version: None,
      })
      .await
      .unwrap();

    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at)
         VALUES
           ('captcha.enabled', 'true'::jsonb, clock_timestamp(), clock_timestamp()),
           ('captcha.config', $1, clock_timestamp(), clock_timestamp())"#,
    )
    .bind(json!({
      "turnstile": {
        "secret": "ts-secret",
        "siteKey": "ts-site-key",
        "action": "auth-sign-in",
        "verifyUrl": turnstile_url,
      },
      "challenge": { "bits": 8 },
    }))
    .execute(db.pool())
    .await
    .unwrap();

    // 1. GET /api/auth/captcha returns no-store + hashcash stored in PG runtime_states
    let (st, native_cap, hdrs) = send_json(
      &router,
      "GET",
      "/api/auth/captcha",
      &[("x-affine-client-kind", "native")],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(hdrs.get(header::CACHE_CONTROL).unwrap(), "no-store");
    assert_eq!(native_cap["provider"], "hashcash");
    let challenge = native_cap["challenge"].as_str().unwrap().to_owned();
    let resource = native_cap["resource"].as_str().unwrap().to_owned();

    // Verify exact v0.27.5 PG runtime_states row shape
    let (stored_token_hash, stored_payload): (String, Value) =
      sqlx::query_as("SELECT token_hash, payload FROM runtime_states WHERE purpose = $1 AND lookup_key = $2")
        .bind(CAPTCHA_PURPOSE)
        .bind(&challenge)
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(stored_token_hash.len(), 64);
    assert_eq!(stored_payload["resource"], resource);

    let (st, web_cap, _) = send_json(&router, "GET", "/api/auth/captcha", &[], None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(web_cap["provider"], "turnstile");
    assert_eq!(web_cap["siteKey"], "ts-site-key");

    // 2. Missing headers or bad stamp rejected; bad stamp MUST NOT consume the challenge
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/sign-in",
      &[],
      Some(json!({ "email": "cap@example.test", "password": "Password123!" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "CAPTCHA_VERIFICATION_FAILED");

    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/sign-in",
      &[
        ("x-captcha-provider", "hashcash"),
        ("x-captcha-challenge", &challenge),
        ("x-captcha-token", "1:8:20260101000000:wrong::rand:0"),
      ],
      Some(json!({ "email": "cap@example.test", "password": "Password123!" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "CAPTCHA_VERIFICATION_FAILED");

    // 3. Valid Hashcash still passes on the unconsumed challenge, then replay fails
    let stamp = HashcashStamp::mint(&resource, 8).format();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/sign-in",
      &[
        ("x-captcha-provider", "hashcash"),
        ("x-captcha-challenge", &challenge),
        ("x-captcha-token", &stamp),
      ],
      Some(json!({ "email": "cap@example.test", "password": "Password123!" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "hashcash sign-in failed: {body}");

    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/sign-in",
      &[
        ("x-captcha-provider", "hashcash"),
        ("x-captcha-challenge", &challenge),
        ("x-captcha-token", &stamp),
      ],
      Some(json!({ "email": "cap@example.test", "password": "Password123!" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "CAPTCHA_VERIFICATION_FAILED");

    // 4. Turnstile verification via internal test endpoint override passes under max_connections = 1
    let turnstile_ok = verify_captcha_with_turnstile_endpoint(
      &db,
      &CaptchaPluginConfig {
        turnstile: TurnstileRuntimeConfig {
          secret: "ts-secret".into(),
          site_key: "ts-site-key".into(),
          action: "auth-sign-in".into(),
        },
        challenge: HashcashRuntimeConfig { bits: 8 },
      },
      &CaptchaVerificationRequest {
        provider: "turnstile".into(),
        token: "turnstile-ok".into(),
        challenge: None,
        ip: Some("127.0.0.1".into()),
        allowed_hosts: vec!["localhost".into()],
        dev_mode: false,
      },
      Some(&turnstile_url),
    )
    .await
    .unwrap();
    assert!(turnstile_ok);

    // 5. OIDC callback under max_connections = 1 completes without DB pool deadlock
    let (issuer, expected_nonce, _) =
      start_mock_oidc_server(false, "oidc-pool1", "pool1@example.test", Some(db.clone())).await;
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('oauth.providers.oidc', $1, clock_timestamp(), clock_timestamp())",
    )
    .bind(json!({
      "clientId": "oidc-client",
      "clientSecret": "oidc-secret",
      "issuer": issuer,
      "allowPrivateNetwork": true,
    }))
    .execute(db.pool())
    .await
    .unwrap();

    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": "OIDC", "client": "web", "client_nonce": "nonce-pool1" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let auth_url = url::Url::parse(body["url"].as_str().unwrap()).unwrap();
    let raw_state = auth_url
      .query_pairs()
      .find(|(k, _)| k == "state")
      .unwrap()
      .1
      .into_owned();
    let parsed: Value = serde_json::from_str(&raw_state).unwrap();
    *expected_nonce.write().await = parsed["state"].as_str().unwrap().to_owned();

    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/callback",
      &[],
      Some(json!({ "code": "code-pool1", "state": raw_state, "client_nonce": "nonce-pool1" })),
    )
    .await;
    assert_eq!(
      st,
      StatusCode::OK,
      "OIDC callback under max_connections=1 failed: {body}"
    );

    db.pool().close().await;
  });
}

#[test]
fn oauth_apple_signup_matrix_state_ttl_role_and_strict_throttle_adversarial() {
  let lease = lease_test_db();
  let db_url = lease.url().to_owned();
  run_async(async move {
    let db = connect_and_init_db(&db_url, 4).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        external_url: "http://localhost:3010".into(),
        role: ServerRole::Graphql,
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let router = build_router(Arc::clone(&state));

    // Disable strict throttle during setup/matrix checks, then explicitly test it at the end.
    let admin = state
      .auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("RoleAdmin".into()),
        email: "role-admin@example.test".into(),
        password: "Password123!".into(),
        client_version: None,
      })
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('throttle.enabled', 'false'::jsonb, clock_timestamp(), clock_timestamp())",
    )
    .execute(db.pool())
    .await
    .unwrap();
    state.app_config.invalidate_cache();

    // 1. Apple args.{privateKey, keyId, teamId} normalization: zero secret leakage in auth URL
    let apple_key = p256::ecdsa::SigningKey::from_slice(&[5_u8; 32]).unwrap();
    let apple_pem = p256::pkcs8::EncodePrivateKey::to_pkcs8_pem(&apple_key, p256::pkcs8::LineEnding::LF)
      .unwrap()
      .to_string();
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('oauth.providers.apple', $1, clock_timestamp(), clock_timestamp())",
    )
    .bind(json!({
      "clientId": "apple-service-id",
      "args": {
        "privateKey": apple_pem,
        "keyId": "KID1234567",
        "teamId": "TEAM123456",
        "prompt": "consent",
      }
    }))
    .execute(db.pool())
    .await
    .unwrap();

    // Lowercase provider and unknown fields MUST be rejected
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": "apple", "client": "web", "client_nonce": "n1" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "UNKNOWN_OAUTH_PROVIDER");

    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": "Apple", "client": "web", "client_nonce": "n1", "extra": 1 })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "MISSING_OAUTH_QUERY_PARAMETER");
    assert_eq!(body["data"]["name"], "provider");

    // Non-object JSON body and top-level `flow` must both return MissingOauthQueryParameter("provider")
    let (st, body, _) = send_json(&router, "POST", "/api/oauth/preflight", &[], Some(json!([1, 2]))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "MISSING_OAUTH_QUERY_PARAMETER");
    assert_eq!(body["data"]["name"], "provider");

    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": "Apple", "client": "web", "client_nonce": "apple-nonce", "flow": "popup" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "MISSING_OAUTH_QUERY_PARAMETER");
    assert_eq!(body["data"]["name"], "provider");

    // Non-string provider formatted via JS String(...) (object -> "[object Object]", [null, "Google"] -> ",Google")
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": { "bad": 1 }, "client": "web", "client_nonce": "n1" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "UNKNOWN_OAUTH_PROVIDER");
    assert_eq!(body["data"]["name"], "[object Object]");
    assert_eq!(body["message"], "Unknown authentication provider [object Object].");
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": [null, "Google"], "client": "web", "client_nonce": "n1" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "UNKNOWN_OAUTH_PROVIDER");
    assert_eq!(body["data"]["name"], ",Google");
    for (raw_num, expected_str) in [
      (json!(9007199254740993_u64), "9007199254740992"),
      (json!(1000000000000000128_u64), "1000000000000000100"),
      (json!(1e21_f64), "1e+21"),
      (json!(1e-7_f64), "1e-7"),
    ] {
      let (st, body, _) = send_json(
        &router,
        "POST",
        "/api/oauth/preflight",
        &[],
        Some(json!({ "provider": raw_num, "client": "web", "client_nonce": "n1" })),
      )
      .await;
      assert_eq!(st, StatusCode::BAD_REQUEST);
      assert_eq!(body["name"], "UNKNOWN_OAUTH_PROVIDER");
      assert_eq!(body["data"]["name"], expected_str);
      assert_eq!(
        body["message"],
        format!("Unknown authentication provider {expected_str}.")
      );
    }

    // Malformed pkce in OAuth state envelope rejected before PG lookup; valid UUID + valid pkce reaches PG and returns OAUTH_STATE_EXPIRED
    let probe_uuid = uuid::Uuid::new_v4().to_string();
    for bad_state in [
      json!({ "state": &probe_uuid, "provider": "OIDC", "client": "web", "pkce": 123 }).to_string(),
      json!({ "state": &probe_uuid, "provider": "OIDC", "client": "web", "pkce": { "codeChallenge": "x" } })
        .to_string(),
    ] {
      let (st, body, _) = send_json(
        &router,
        "POST",
        "/api/oauth/callback",
        &[],
        Some(json!({ "code": "c1", "state": bad_state })),
      )
      .await;
      assert_eq!(st, StatusCode::BAD_REQUEST);
      assert_eq!(body["name"], "INVALID_OAUTH_CALLBACK_STATE");
    }
    let valid_pkce_state = json!({
      "state": &probe_uuid,
      "provider": "OIDC",
      "client": "web",
      "pkce": { "codeChallenge": "abc", "codeChallengeMethod": "S256" }
    })
    .to_string();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/callback",
      &[],
      Some(json!({ "code": "c1", "state": valid_pkce_state })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "OAUTH_STATE_EXPIRED");

    // Callback Zod validation priority: bad `code` -> "code"; user: null / user > 16384 / empty client_nonce / unknown key -> "state"
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/callback",
      &[],
      Some(json!({ "code": "", "state": "s1" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["data"]["name"], "code");
    for bad_cb in [
      json!({ "code": "c1", "state": "s1", "user": null }),
      json!({ "code": "c1", "state": "s1", "user": "x".repeat(16_385) }),
      json!({ "code": "c1", "state": "s1", "client_nonce": "" }),
      json!({ "code": "c1", "state": "s1", "extra": "nope" }),
    ] {
      let (st, body, _) = send_json(&router, "POST", "/api/oauth/callback", &[], Some(bad_cb)).await;
      assert_eq!(st, StatusCode::BAD_REQUEST);
      assert_eq!(body["name"], "MISSING_OAUTH_QUERY_PARAMETER");
      assert_eq!(body["data"]["name"], "state");
    }

    // Valid Apple preflight (no top-level `flow`) must strip privateKey/keyId/teamId from authorization URL
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": "Apple", "client": "web", "client_nonce": "apple-nonce" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "apple preflight failed: {body}");
    let url_str = body["url"].as_str().unwrap();
    assert!(!url_str.contains("privateKey"));
    assert!(!url_str.contains("keyId"));
    assert!(!url_str.contains("teamId"));
    assert!(!url_str.contains("KID1234567"));
    assert!(!url_str.contains("TEAM123456"));
    assert!(url_str.contains("prompt=consent"));

    // Verify OAuth state TTL is 3 hours (10,800s > 2h)
    let ttl_secs: f64 = sqlx::query_scalar(
      "SELECT EXTRACT(EPOCH FROM (expires_at - created_at))::float8 FROM runtime_states WHERE purpose = 'auth_challenge:oauth_state' ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert!((10_790.0..=10_810.0).contains(&ttl_secs), "unexpected TTL: {ttl_secs}");

    // 2. Removing provider after preflight: first callback consumes state -> UNKNOWN_OAUTH_PROVIDER; replay -> OAUTH_STATE_EXPIRED
    let apple_auth_url = url::Url::parse(url_str).unwrap();
    let apple_raw_state = apple_auth_url
      .query_pairs()
      .find(|(k, _)| k == "state")
      .unwrap()
      .1
      .into_owned();
    sqlx::query("DELETE FROM app_configs WHERE id = 'oauth.providers.apple'")
      .execute(db.pool())
      .await
      .unwrap();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/callback",
      &[],
      Some(json!({ "code": "c1", "state": apple_raw_state.clone() })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "UNKNOWN_OAUTH_PROVIDER");
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/oauth/callback",
      &[],
      Some(json!({ "code": "c1", "state": apple_raw_state })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "OAUTH_STATE_EXPIRED");

    // 3. allowSignup vs allowSignupForOauth orthogonal matrix + disabled user preflight + Native callback cookie clear
    let (issuer, expected_nonce, _) =
      start_mock_oidc_server(false, "oidc-matrix-1", "matrix-new@example.test", None).await;
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at) VALUES
         ('oauth.providers.oidc', $1, clock_timestamp(), clock_timestamp()),
         ('auth.allowSignup', 'false'::jsonb, clock_timestamp(), clock_timestamp()),
         ('auth.allowSignupForOauth', 'true'::jsonb, clock_timestamp(), clock_timestamp())"#,
    )
    .bind(json!({
      "clientId": "oidc-client",
      "clientSecret": "oidc-secret",
      "issuer": issuer,
      "allowPrivateNetwork": true,
    }))
    .execute(db.pool())
    .await
    .unwrap();

    // allowSignup=false, allowSignupForOauth=true -> new email has magic_link=false, oauth=true
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/preflight",
      &[],
      Some(json!({ "email": "matrix-new@example.test" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["registered"], false);
    assert_eq!(body["methods"]["magicLink"]["available"], false);
    assert_eq!(body["methods"]["oauth"]["available"], true);

    // Native OIDC callback creates user even though allowSignup=false, and clears auth cookies
    let (st, pre, _) = send_json(
      &router,
      "POST",
      "/api/oauth/preflight",
      &[],
      Some(json!({ "provider": "OIDC", "client": "affine", "client_nonce": "native-nonce" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let raw_state = url::Url::parse(pre["url"].as_str().unwrap())
      .unwrap()
      .query_pairs()
      .find(|(k, _)| k == "state")
      .unwrap()
      .1
      .into_owned();
    let mut parsed_state: Value = serde_json::from_str(&raw_state).unwrap();
    *expected_nonce.write().await = parsed_state["state"].as_str().unwrap().to_owned();
    // `flow` inside the state envelope JSON must be accepted by callback
    parsed_state["flow"] = json!("popup");
    let raw_state_with_flow = serde_json::to_string(&parsed_state).unwrap();
    let (st, cb_body, cb_headers) = send_json(
      &router,
      "POST",
      "/api/oauth/callback",
      &[("x-affine-client-kind", "native")],
      Some(json!({ "code": "c-native", "state": raw_state_with_flow, "client_nonce": "native-nonce" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "native OIDC callback failed: {cb_body}");
    assert!(cb_body["exchangeCode"].as_str().is_some());
    let set_cookies: Vec<String> = cb_headers
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok().map(str::to_owned))
      .collect();
    assert!(
      set_cookies
        .iter()
        .any(|c| c.starts_with("affine_session=;") && c.contains("1970")),
      "native callback must clear auth cookies: {set_cookies:?}"
    );

    // Invited placeholder user (registered = false, disabled = false) must return registered=false, magicLink=true
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, disabled, auth_epoch, created_at) VALUES ('invited-placeholder-1', 'Invited', 'invited-placeholder@example.test', false, false, 0, clock_timestamp())",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/preflight",
      &[],
      Some(json!({ "email": "invited-placeholder@example.test" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["registered"], false);
    assert_eq!(body["methods"]["magicLink"]["available"], true);

    // Disabled user preflight must return all false
    sqlx::query("UPDATE users SET disabled = true WHERE email = 'matrix-new@example.test'")
      .execute(db.pool())
      .await
      .unwrap();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/preflight",
      &[],
      Some(json!({ "email": "matrix-new@example.test" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["registered"], false);
    assert_eq!(body["methods"]["password"]["available"], false);
    assert_eq!(body["methods"]["magicLink"]["available"], false);
    assert_eq!(body["methods"]["oauth"]["available"], false);

    // allowSignup=true, allowSignupForOauth=false -> new email has magic_link=true, oauth=false
    sqlx::query("UPDATE app_configs SET value = 'true'::jsonb WHERE id = 'auth.allowSignup'")
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("UPDATE app_configs SET value = 'false'::jsonb WHERE id = 'auth.allowSignupForOauth'")
      .execute(db.pool())
      .await
      .unwrap();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/preflight",
      &[],
      Some(json!({ "email": "brand-new@example.test" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["methods"]["magicLink"]["available"], true);
    assert_eq!(body["methods"]["oauth"]["available"], false);

    // 4. Front role skips captcha on /api/auth/sign-in; Graphql role enforces it
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('captcha.enabled', 'true'::jsonb, clock_timestamp(), clock_timestamp())",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let (st, body, _) = send_json(
      &router,
      "POST",
      "/api/auth/sign-in",
      &[],
      Some(json!({ "email": "role-admin@example.test", "password": "Password123!" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(body["name"], "CAPTCHA_VERIFICATION_FAILED");

    let front_state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        external_url: "http://localhost:3010".into(),
        role: ServerRole::Front,
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let front_router = build_router(front_state);
    let (st, _, _) = send_json(
      &front_router,
      "POST",
      "/api/auth/sign-in",
      &[],
      Some(json!({ "email": "role-admin@example.test", "password": "Password123!" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // 5. GET /api/auth/captcha rejects low-version Bearer without writing a challenge row
    let exchange_code = state
      .auth
      .issue_exchange_code(&admin.user.id, Some("0.20.0"))
      .await
      .unwrap();
    let exchanged = state
      .auth
      .exchange_auth_session(&exchange_code, "inst-1", "macos", Some("test"), Some("0.20.0"))
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at) VALUES
         ('client.versionControl.enabled', 'true'::jsonb, clock_timestamp(), clock_timestamp()),
         ('client.versionControl.requiredVersion', '">=0.27.0"'::jsonb, clock_timestamp(), clock_timestamp())"#,
    )
    .execute(db.pool())
    .await
    .unwrap();
    state.app_config.invalidate_cache();
    let before_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_states WHERE purpose = $1")
      .bind(CAPTCHA_PURPOSE)
      .fetch_one(db.pool())
      .await
      .unwrap();
    let (st, body, _) = send_json(
      &router,
      "GET",
      "/api/auth/captcha",
      &[
        ("x-affine-client-kind", "native"),
        ("authorization", &format!("Bearer {}", exchanged.access_token)),
        ("x-affine-version", "0.20.0"),
      ],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    assert_eq!(body["name"], "UNSUPPORTED_CLIENT_VERSION");
    let after_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_states WHERE purpose = $1")
      .bind(CAPTCHA_PURPOSE)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(before_count, after_count);

    // 6. @Throttle('strict') 429 boundary with Retry-After and zero DB side effect
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at) VALUES
         ('throttle.throttlers.strict.limit', '3'::jsonb, clock_timestamp(), clock_timestamp()),
         ('throttle.throttlers.strict.ttl', '60000'::jsonb, clock_timestamp(), clock_timestamp())
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value"#,
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("UPDATE app_configs SET value = 'true'::jsonb WHERE id = 'throttle.enabled'")
      .execute(db.pool())
      .await
      .unwrap();
    state.app_config.invalidate_cache();

    // Anonymous POST /api/auth/sign-out returns 401 before strict throttle (both with remaining quota and when exhausted)
    let (st_so1, body_so1, hdrs_so1) = send_json(
      &router,
      "POST",
      "/api/auth/sign-out",
      &[("x-real-ip", "198.51.100.10")],
      None,
    )
    .await;
    assert_eq!(st_so1, StatusCode::UNAUTHORIZED);
    assert_eq!(body_so1["name"], "AUTHENTICATION_REQUIRED");
    assert!(hdrs_so1.get("x-ratelimit-limit").is_none());
    assert!(hdrs_so1.get(header::RETRY_AFTER).is_none());

    for expected_remaining in ["2", "1", "0"] {
      let (st, _, hdrs) = send_json(
        &router,
        "GET",
        "/api/auth/captcha",
        &[("x-affine-client-kind", "native"), ("x-real-ip", "198.51.100.10")],
        None,
      )
      .await;
      assert_eq!(st, StatusCode::OK);
      assert_eq!(hdrs.get("x-ratelimit-limit").unwrap(), "3");
      assert_eq!(hdrs.get("x-ratelimit-remaining").unwrap(), expected_remaining);
    }
    let count_before_429: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_states WHERE purpose = $1")
      .bind(CAPTCHA_PURPOSE)
      .fetch_one(db.pool())
      .await
      .unwrap();
    let (st, body, hdrs) = send_json(
      &router,
      "GET",
      "/api/auth/captcha",
      &[("x-affine-client-kind", "native"), ("x-real-ip", "198.51.100.10")],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(body["type"], "TOO_MANY_REQUESTS");
    assert_eq!(body["name"], "TOO_MANY_REQUEST");
    assert!(hdrs.get(header::RETRY_AFTER).is_some());
    assert!(hdrs.get("x-ratelimit-limit").is_none());
    assert!(hdrs.get("x-ratelimit-remaining").is_none());
    assert!(hdrs.get("x-ratelimit-reset").is_none());
    let (st_so2, body_so2, hdrs_so2) = send_json(
      &router,
      "POST",
      "/api/auth/sign-out",
      &[("x-real-ip", "198.51.100.10")],
      None,
    )
    .await;
    assert_eq!(st_so2, StatusCode::UNAUTHORIZED);
    assert_eq!(body_so2["name"], "AUTHENTICATION_REQUIRED");
    assert!(hdrs_so2.get("x-ratelimit-limit").is_none());
    assert!(hdrs_so2.get(header::RETRY_AFTER).is_none());
    // Oversized tracker (> 256 bytes) is hashed as sha256:<hex>; <= 256 bytes stays raw; distinct SocketAddr peers do not collide
    let mut exact_hdrs = axum::http::HeaderMap::new();
    exact_hdrs.insert("cf-ray", "r".repeat(256).parse().unwrap());
    assert_eq!(
      server_http::rest::throttle::resolve_throttle_tracker(Some(&exact_hdrs), None, None).len(),
      256
    );
    let mut big_hdrs = axum::http::HeaderMap::new();
    big_hdrs.insert("cf-ray", "r".repeat(257).parse().unwrap());
    let hashed_tracker = server_http::rest::throttle::resolve_throttle_tracker(Some(&big_hdrs), None, None);
    assert!(hashed_tracker.starts_with("sha256:") && hashed_tracker.len() == 71);
    let peer_a: std::net::SocketAddr = "10.0.0.1:40000".parse().unwrap();
    let peer_b: std::net::SocketAddr = "10.0.0.2:40001".parse().unwrap();
    assert_ne!(
      server_http::rest::throttle::resolve_throttle_tracker(None, Some(peer_a), None),
      server_http::rest::throttle::resolve_throttle_tracker(None, Some(peer_b), None),
    );
    // Signed-in cookie session in renewal window: POST /api/auth/sign-out without CSRF returns 403 WITH renewed
    // session + CSRF Set-Cookie headers, then succeeds (200) and clears cookies once the matching CSRF header is sent
    let renew_session_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
      .bind(&renew_session_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at) VALUES ($1, $2, $3, now() + interval '1 day', clock_timestamp())")
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&renew_session_id)
      .bind(&admin.user.id)
      .execute(db.pool())
      .await
      .unwrap();
    let renew_cookie = format!("affine_session={renew_session_id}; affine_csrf_token=old-csrf");
    let (st_csrf, body_csrf, hdrs_csrf) = send_json(
      &router,
      "POST",
      "/api/auth/sign-out",
      &[("cookie", &renew_cookie), ("x-affine-version", "0.27.5")],
      None,
    )
    .await;
    assert_eq!(st_csrf, StatusCode::FORBIDDEN);
    assert_eq!(body_csrf["name"], "ACTION_FORBIDDEN");
    let set_cookies: Vec<&str> = hdrs_csrf
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok())
      .collect();
    let new_session = set_cookies
      .iter()
      .find_map(|c| {
        c.strip_prefix("affine_session=")
          .and_then(|rest| rest.split(';').next())
      })
      .filter(|s| !s.is_empty())
      .expect("expected renewed affine_session Set-Cookie on 403");
    let new_csrf = set_cookies
      .iter()
      .find_map(|c| {
        c.strip_prefix("affine_csrf_token=")
          .and_then(|rest| rest.split(';').next())
      })
      .filter(|s| !s.is_empty())
      .expect("expected renewed affine_csrf_token Set-Cookie on 403");
    let updated_cookie = format!("affine_session={new_session}; affine_csrf_token={new_csrf}");
    let (st_ok_so, _, hdrs_ok_so) = send_json(
      &router,
      "POST",
      "/api/auth/sign-out",
      &[
        ("cookie", &updated_cookie),
        ("x-affine-csrf-token", new_csrf),
        ("x-affine-version", "0.27.5"),
      ],
      None,
    )
    .await;
    assert_eq!(st_ok_so, StatusCode::OK);
    let clear_cookies: Vec<&str> = hdrs_ok_so
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok())
      .collect();
    assert!(
      clear_cookies
        .iter()
        .any(|c| c.starts_with("affine_session=;") && (c.contains("Max-Age=0") || c.contains("1970"))),
      "expected cleared affine_session cookie on 200: {clear_cookies:?}"
    );

    // Multi-account cookie session in renewal window: signing out user 1 emits renewed session + CSRF + user 2 cookies,
    // then signing out user 2 clears cookies
    let user2_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email, registered, disabled, created_at) VALUES ($1, 'MultiUser2', 'multi2@example.test', true, false, clock_timestamp())")
      .bind(&user2_id)
      .execute(db.pool())
      .await
      .unwrap();
    let multi_session_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
      .bind(&multi_session_id)
      .execute(db.pool())
      .await
      .unwrap();
    for uid in [&admin.user.id, &user2_id] {
      sqlx::query("INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at) VALUES ($1, $2, $3, now() + interval '1 day', clock_timestamp())")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&multi_session_id)
        .bind(uid)
        .execute(db.pool())
        .await
        .unwrap();
    }
    let multi_cookie = format!("affine_session={multi_session_id}; affine_csrf_token=m-csrf");
    let (st_m1, _, hdrs_m1) = send_json(
      &router,
      "POST",
      &format!("/api/auth/sign-out?user_id={}", admin.user.id),
      &[
        ("cookie", &multi_cookie),
        ("x-affine-csrf-token", "m-csrf"),
        ("x-affine-version", "0.27.5"),
      ],
      None,
    )
    .await;
    assert_eq!(st_m1, StatusCode::OK);
    let m1_cookies: Vec<&str> = hdrs_m1
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok())
      .collect();
    let m1_sess = m1_cookies
      .iter()
      .find_map(|c| c.strip_prefix("affine_session=").and_then(|r| r.split(';').next()))
      .filter(|s| !s.is_empty())
      .expect("expected renewed affine_session on partial multi-account sign-out");
    let m1_csrf = m1_cookies
      .iter()
      .find_map(|c| c.strip_prefix("affine_csrf_token=").and_then(|r| r.split(';').next()))
      .filter(|s| !s.is_empty())
      .expect("expected renewed affine_csrf_token on partial multi-account sign-out");
    assert!(
      m1_cookies
        .iter()
        .any(|c| c.starts_with(&format!("affine_user_id={user2_id};"))),
      "expected remaining user2 affine_user_id cookie: {m1_cookies:?}"
    );
    let m2_cookie = format!("affine_session={m1_sess}; affine_csrf_token={m1_csrf}");
    let (st_m2, _, hdrs_m2) = send_json(
      &router,
      "POST",
      &format!("/api/auth/sign-out?user_id={user2_id}"),
      &[
        ("cookie", &m2_cookie),
        ("x-affine-csrf-token", m1_csrf),
        ("x-affine-version", "0.27.5"),
      ],
      None,
    )
    .await;
    assert_eq!(st_m2, StatusCode::OK);
    let m2_cookies: Vec<&str> = hdrs_m2
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok())
      .collect();
    assert!(
      m2_cookies
        .iter()
        .any(|c| c.starts_with("affine_session=;") && (c.contains("Max-Age=0") || c.contains("1970"))),
      "expected cleared affine_session cookie on final sign-out: {m2_cookies:?}"
    );

    // AuthController handler-level throttle coverage: non-Public 401 before throttle, GET /api/auth/session uses 1200 default override
    let (st_unauth, _, hdrs_unauth) = send_json(&router, "GET", "/api/auth/sessions", &[], None).await;
    assert_eq!(st_unauth, StatusCode::UNAUTHORIZED);
    assert!(hdrs_unauth.get("x-ratelimit-limit").is_none());
    let (st_sess, _, hdrs_sess) = send_json(
      &router,
      "GET",
      "/api/auth/session",
      &[("x-affine-version", "0.27.5"), ("x-real-ip", "198.51.100.77")],
      None,
    )
    .await;
    assert_eq!(st_sess, StatusCode::OK);
    assert_eq!(hdrs_sess.get("x-ratelimit-limit").unwrap(), "1200");
    let count_after_429: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_states WHERE purpose = $1")
      .bind(CAPTCHA_PURPOSE)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(count_before_429, count_after_429);

    // A different anonymous client (distinct CF-Connecting-IP / X-Real-IP) has an independent bucket
    let (st, _, hdrs) = send_json(
      &router,
      "GET",
      "/api/auth/captcha",
      &[("x-affine-client-kind", "native"), ("cf-connecting-ip", "203.0.113.42")],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(hdrs.get("x-ratelimit-remaining").unwrap(), "2");

    // Redis Hash `blockedUntil` test: overflowing near end of window sets full blockDuration Retry-After
    let redis_env = test_db_harness::redis::TestRedis::from_env_or_docker().expect("test redis");
    let redis_client = redis::Client::open(redis_env.url()).expect("redis client");
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at) VALUES
         ('throttle.throttlers.strict.limit', '2'::jsonb, clock_timestamp(), clock_timestamp()),
         ('throttle.throttlers.strict.ttl', '4000'::jsonb, clock_timestamp(), clock_timestamp())
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value"#,
    )
    .execute(db.pool())
    .await
    .unwrap();
    let redis_state = AppState::new(
      db.clone(),
      Some(redis_client.clone()),
      RuntimeConfig {
        external_url: "http://localhost:3010".into(),
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let redis_router = build_router(redis_state);
    let ip_key = format!("198.51.100.{}", (Utc::now().timestamp_subsec_millis() % 200) + 20);
    for _ in 0..2 {
      let (st, _, _) = send_json(
        &redis_router,
        "GET",
        "/api/auth/captcha",
        &[("x-affine-client-kind", "native"), ("x-real-ip", &ip_key)],
        None,
      )
      .await;
      assert_eq!(st, StatusCode::OK);
    }
    let mut rconn = redis_client.get_multiplexed_async_connection().await.unwrap();
    let _: bool = redis::cmd("PEXPIRE")
      .arg(format!("throttler:{ip_key};strict"))
      .arg(1500_i64)
      .query_async(&mut rconn)
      .await
      .unwrap();
    let (st, _, hdrs) = send_json(
      &redis_router,
      "GET",
      "/api/auth/captcha",
      &[("x-affine-client-kind", "native"), ("x-real-ip", &ip_key)],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::TOO_MANY_REQUESTS);
    let retry_after: u64 = hdrs
      .get(header::RETRY_AFTER)
      .unwrap()
      .to_str()
      .unwrap()
      .parse()
      .unwrap();
    assert!(
      retry_after >= 4,
      "expected full blockDuration >= 4s, got {retry_after}s"
    );
    let blocked_until: Option<i64> = redis::cmd("HGET")
      .arg(format!("throttler:{ip_key};strict"))
      .arg("blockedUntil")
      .query_async(&mut rconn)
      .await
      .unwrap();
    assert!(blocked_until.is_some_and(|v| v > 0), "expected Redis Hash blockedUntil");

    // 7. evaluate_local_redirect restricts Apple web 302 targets to same-origin + base path and falls back to full baseUrl
    assert_eq!(
      server_http::rest::evaluate_local_redirect("/workspace/123", "https://app.affine.pro"),
      "https://app.affine.pro/workspace/123"
    );
    assert_eq!(
      server_http::rest::evaluate_local_redirect("/", "https://app.affine.pro"),
      "https://app.affine.pro/"
    );
    assert_eq!(
      server_http::rest::evaluate_local_redirect("https://github.com/toeverything", "https://app.affine.pro"),
      "https://app.affine.pro"
    );
    assert_eq!(
      server_http::rest::evaluate_local_redirect("https://app.affine.pro/sub/ok", "https://app.affine.pro/sub"),
      "https://app.affine.pro/sub/ok"
    );
    assert_eq!(
      server_http::rest::evaluate_local_redirect("https://app.affine.pro/other", "https://app.affine.pro/sub"),
      "https://app.affine.pro/sub"
    );
    assert_eq!(
      server_http::rest::evaluate_local_redirect("/", "https://app.affine.pro/sub/"),
      "https://app.affine.pro/sub"
    );

    db.pool().close().await;
  });
}
