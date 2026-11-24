//! Integration test verifying `affine-server` loads file-configured OAuth
//! providers from `AFFINE_CONFIG_PATH`, lets PG `app_configs` overrides take
//! precedence, and falls back to file config when the PG override is deleted.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use affine_server::{DeploymentModeArg, RoleArg, ServerCli, serve_with_extension};
use axum::Router;
use axum::extract::State;
use axum::routing::{get, post};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use p256::ecdsa::{SigningKey, signature::Signer as _};
use serde_json::{Value, json};
use server_spi::CommunityExtension;
use server_worker::CancellationToken;
use test_db_harness::migrations::MigrationSet;
use test_db_harness::pg::{DEFAULT_LEASE_TTL, PgCluster};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[derive(Clone)]
struct MockOidc {
  issuer: String,
  key: SigningKey,
  nonce: Arc<tokio::sync::RwLock<String>>,
}

async fn start_mock_oidc() -> (String, Arc<tokio::sync::RwLock<String>>) {
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let issuer = format!("http://{}", listener.local_addr().unwrap());
  let nonce = Arc::new(tokio::sync::RwLock::new(String::new()));
  let st = MockOidc {
    issuer: issuer.clone(),
    key: SigningKey::from_slice(&[7u8; 32]).unwrap(),
    nonce: nonce.clone(),
  };
  let app = Router::new()
    .route(
      "/.well-known/openid-configuration",
      get(|State(s): State<MockOidc>| async move {
        axum::Json(json!({
          "issuer": s.issuer,
          "authorization_endpoint": format!("{}/auth", s.issuer),
          "token_endpoint": format!("{}/token", s.issuer),
          "userinfo_endpoint": format!("{}/userinfo", s.issuer),
          "jwks_uri": format!("{}/jwks", s.issuer),
        }))
      }),
    )
    .route(
      "/jwks",
      get(|State(s): State<MockOidc>| async move {
        let ep = s.key.verifying_key().to_encoded_point(false);
        axum::Json(json!({ "keys": [{
          "kty": "EC", "crv": "P-256", "kid": "k1", "alg": "ES256", "use": "sig",
          "x": URL_SAFE_NO_PAD.encode(ep.x().unwrap()),
          "y": URL_SAFE_NO_PAD.encode(ep.y().unwrap()),
        }]}))
      }),
    )
    .route(
      "/token",
      post(|State(s): State<MockOidc>| async move {
        let hdr = URL_SAFE_NO_PAD.encode(r#"{"alg":"ES256","kid":"k1","typ":"JWT"}"#);
        let now = Utc::now().timestamp();
        let n = s.nonce.read().await.clone();
        let claims = json!({
          "iss": s.issuer, "aud": "file-oidc-id", "sub": "oidc-sub-1",
          "email": "brand-new-oidc@example.test", "email_verified": true,
          "nonce": n, "iat": now, "exp": now + 300,
        });
        let input = format!("{hdr}.{}", URL_SAFE_NO_PAD.encode(claims.to_string()));
        let sig: p256::ecdsa::Signature = s.key.sign(input.as_bytes());
        let id_token = format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()));
        axum::Json(json!({ "access_token": "tok-1", "id_token": id_token }))
      }),
    )
    .route(
      "/userinfo",
      get(|| async {
        axum::Json(json!({
          "sub": "oidc-sub-1", "email": "brand-new-oidc@example.test", "email_verified": true, "name": "New OIDC"
        }))
      }),
    )
    .with_state(st);
  tokio::spawn(async move {
    let _ = axum::serve(listener, app).await;
  });
  (issuer, nonce)
}

async fn http_post_json(addr: SocketAddr, path: &str, body: &Value) -> (u16, Value) {
  let mut stream = TcpStream::connect(addr).await.expect("connect server");
  let payload = serde_json::to_string(body).unwrap();
  let req = format!(
    "POST {path} HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
    payload.len()
  );
  stream.write_all(req.as_bytes()).await.expect("write req");
  let mut buf = Vec::new();
  stream.read_to_end(&mut buf).await.expect("read resp");
  let raw = String::from_utf8(buf).expect("utf8 resp");
  let (head, body_str) = raw.split_once("\r\n\r\n").expect("split");
  let status: u16 = head
    .lines()
    .next()
    .unwrap()
    .split_whitespace()
    .nth(1)
    .unwrap()
    .parse()
    .unwrap();
  (status, serde_json::from_str(body_str).unwrap_or(Value::Null))
}

#[test]
fn file_configured_oauth_provider_precedence_and_fallback() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = MigrationSet {
    migrations: vec![],
    digest: "5e20000000000014".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease db");

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");
  let tmp_path = std::env::temp_dir().join(format!("affine-oauth-cfg-{}.json", uuid::Uuid::new_v4()));
  let tmp_path_for_task = tmp_path.clone();
  let db_url = lease.url().to_owned();
  rt.block_on(async move {
    let (oidc_issuer, oidc_nonce) = start_mock_oidc().await;
    let cfg_json = json!({
      "auth": {
        "allowSignup": true,
        "allowSignupForOauth": false,
        "requireEmailDomainVerification": false,
        "passwordRequirements": { "min": 8, "max": 32 }
      },
      "oauth": {
        "providers": {
          "google": {
            "clientId": "file-google-client-id",
            "clientSecret": "file-google-secret"
          },
          "oidc": {
            "clientId": "file-oidc-id",
            "clientSecret": "file-oidc-secret",
            "issuer": oidc_issuer,
            "allowPrivateNetwork": true
          },
          "github": {
            "clientId": "incomplete-no-secret"
          }
        }
      }
    });
    std::fs::write(&tmp_path_for_task, serde_json::to_vec(&cfg_json).unwrap()).expect("write config file");

    let cli = ServerCli {
      role: Some(RoleArg::Allinone),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url,
      deployment_mode: DeploymentModeArg::Selfhosted,
      channel: Some("canary".into()),
      private_key: Some("test-file-oauth-key".into()),
      external_url: Some("http://127.0.0.1:3010".into()),
      db_max_connections: 8,
      config_path: Some(tmp_path_for_task),
      skip_schema_check: true,
      ..ServerCli::default()
    };

    let shutdown = CancellationToken::new();
    let running = serve_with_extension(cli, Arc::new(CommunityExtension::new()), shutdown.clone())
      .await
      .expect("serve_with_extension");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(running.state.db.pool())
      .await
      .expect("reset schema");
    running.state.db.ensure_schema_ready().await.expect("ensure schema");

    // 1. File config only -> google + oidc available (github skipped), allowSignupForOauth=false blocks preflight AND callback
    let providers = running.state.auth.available_oauth_providers().await.unwrap();
    assert_eq!(providers, vec!["google".to_owned(), "oidc".to_owned()]);
    let (st, preflight_file) = http_post_json(
      running.addr,
      "/api/auth/preflight",
      &json!({ "email": "brand-new-file-cfg@example.test" }),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(preflight_file["methods"]["oauth"]["available"], false);

    // Real OAuth callback with file-configured allowSignupForOauth=false returns 403 SIGN_UP_FORBIDDEN and creates 0 users
    let (st, oidc_pre) = http_post_json(
      running.addr,
      "/api/oauth/preflight",
      &json!({ "provider": "OIDC", "client": "web", "client_nonce": "file-oidc-n1" }),
    )
    .await;
    assert_eq!(st, 200, "oidc preflight failed: {oidc_pre}");
    let auth_url = url::Url::parse(oidc_pre["url"].as_str().unwrap()).unwrap();
    let state_raw = auth_url
      .query_pairs()
      .find(|(k, _)| k == "state")
      .map(|(_, v)| v.into_owned())
      .unwrap();
    let state_json: Value = serde_json::from_str(&state_raw).unwrap();
    *oidc_nonce.write().await = state_json["state"].as_str().unwrap().to_owned();
    let (st, cb_denied) = http_post_json(
      running.addr,
      "/api/oauth/callback",
      &json!({ "code": "mock-code", "state": state_raw, "client_nonce": "file-oidc-n1" }),
    )
    .await;
    assert_eq!(st, 403, "expected 403 SIGN_UP_FORBIDDEN: {cb_denied}");
    assert_eq!(cb_denied["name"], "SIGN_UP_FORBIDDEN");
    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
      .fetch_one(running.state.db.pool())
      .await
      .unwrap();
    assert_eq!(user_count, 0);

    // PG auth.allowSignupForOauth = true overrides file config, deleting it falls back to file false
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('auth.allowSignupForOauth', 'true'::jsonb, clock_timestamp(), clock_timestamp())",
    )
    .execute(running.state.db.pool())
    .await
    .unwrap();
    let (st, preflight_pg) = http_post_json(
      running.addr,
      "/api/auth/preflight",
      &json!({ "email": "brand-new-file-cfg@example.test" }),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(preflight_pg["methods"]["oauth"]["available"], true);
    sqlx::query("DELETE FROM app_configs WHERE id = 'auth.allowSignupForOauth'")
      .execute(running.state.db.pool())
      .await
      .unwrap();
    let (st, preflight_back) = http_post_json(
      running.addr,
      "/api/auth/preflight",
      &json!({ "email": "brand-new-file-cfg@example.test" }),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(preflight_back["methods"]["oauth"]["available"], false);
    let (st, body) = http_post_json(
      running.addr,
      "/api/oauth/preflight",
      &json!({ "provider": "Google", "client": "web", "client_nonce": "file-n1" }),
    )
    .await;
    assert_eq!(st, 200, "preflight failed: {body}");
    assert!(
      body["url"].as_str().unwrap().contains("client_id=file-google-client-id"),
      "expected file clientId: {body}"
    );

    // 2. PG app_configs override takes precedence
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('oauth.providers.google', $1, clock_timestamp(), clock_timestamp())",
    )
    .bind(json!({ "clientId": "pg-override-client-id", "clientSecret": "pg-secret" }))
    .execute(running.state.db.pool())
    .await
    .unwrap();
    let (st, body) = http_post_json(
      running.addr,
      "/api/oauth/preflight",
      &json!({ "provider": "Google", "client": "web", "client_nonce": "pg-n2" }),
    )
    .await;
    assert_eq!(st, 200, "pg override preflight failed: {body}");
    assert!(
      body["url"].as_str().unwrap().contains("client_id=pg-override-client-id"),
      "expected pg clientId: {body}"
    );

    // 3. Deleting PG override falls back to file config
    sqlx::query("DELETE FROM app_configs WHERE id = 'oauth.providers.google'")
      .execute(running.state.db.pool())
      .await
      .unwrap();
    let (st, body) = http_post_json(
      running.addr,
      "/api/oauth/preflight",
      &json!({ "provider": "Google", "client": "web", "client_nonce": "fallback-n3" }),
    )
    .await;
    assert_eq!(st, 200, "fallback preflight failed: {body}");
    assert!(
      body["url"].as_str().unwrap().contains("client_id=file-google-client-id"),
      "expected fallback file clientId: {body}"
    );

    shutdown.cancel();
    let _ = running.join_handle.await;
  });
  let _ = std::fs::remove_file(&tmp_path);
}
