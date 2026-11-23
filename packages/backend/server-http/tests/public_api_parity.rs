//! Integration tests for Bearer JWT auth, user profile/avatar/blob v1,
//! workspace/member/ownership/invite-link GraphQL, and expired session cleanup.

use std::sync::Arc;

use axum::body::Body;
use http::{Request, StatusCode, header};
use serde_json::Value;
use server_db::{DbConfig, ServerDb};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::CommunityExtension;
use server_types::ServerRole;
use tower::ServiceExt as _;

fn with_migrated_db<F, Fut>(f: F)
where
  F: FnOnce(String) -> Fut,
  Fut: std::future::Future<Output = ()>,
{
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
  rt.block_on(f(db_url));
}

async fn connect_db(db_url: &str) -> ServerDb {
  let db = ServerDb::connect(DbConfig {
    database_url: db_url.to_owned(),
    channel: "canary".into(),
    role: ServerRole::Allinone,
    selfhosted: true,
    max_connections: 4,
    statement_timeout_ms: 5_000,
    tier_permits: [4, 2, 2, 1],
  })
  .await
  .expect("connect test db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset schema for fresh ensure_schema_ready");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

async fn post_json(app: &axum::Router, uri: &str, payload: Value) -> (StatusCode, Value) {
  let resp = app
    .clone()
    .oneshot(
      Request::builder()
        .method("POST")
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap(),
    )
    .await
    .expect("json response");
  let status = resp.status();
  let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
  (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn post_graphql(
  app: &axum::Router,
  auth_header: Option<(&str, &str)>,
  query: &str,
) -> (StatusCode, serde_json::Value) {
  let mut builder = Request::builder()
    .method("POST")
    .uri("/graphql")
    .header(header::CONTENT_TYPE, "application/json");
  if let Some((k, v)) = auth_header {
    builder = builder.header(k, v);
  }
  let body = serde_json::json!({ "query": query }).to_string();
  let resp = app
    .clone()
    .oneshot(builder.body(Body::from(body)).unwrap())
    .await
    .expect("graphql response");
  let status = resp.status();
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
  let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
  (status, json)
}

#[test]
fn bearer_jwt_auth_preflight_profile_avatar_and_session_cleanup() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig::default(),
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(Arc::clone(&state));

    // Create first admin user via REST.
    let create_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/setup/create-admin-user")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"name":"Alice","email":"alice@affine.test","password":"StrongPassword123"}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let set_cookies: Vec<String> = create_resp
      .headers()
      .get_all(header::SET_COOKIE)
      .iter()
      .map(|v| v.to_str().unwrap().to_owned())
      .collect();
    let session_cookie = set_cookies
      .iter()
      .find(|c| c.starts_with("affine_session="))
      .unwrap()
      .split(';')
      .next()
      .unwrap()
      .to_owned();
    let session_id = session_cookie.strip_prefix("affine_session=").unwrap().to_owned();
    let body_bytes = axum::body::to_bytes(create_resp.into_body(), 64 * 1024).await.unwrap();
    let created: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let user_id = created["id"].as_str().unwrap().to_owned();

    // 1. Preflight reports registered + password + magicLink available.
    let preflight_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/preflight")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(r#"{"email":"alice@affine.test"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(preflight_resp.status(), StatusCode::OK);
    let preflight: serde_json::Value = serde_json::from_slice(
      &axum::body::to_bytes(preflight_resp.into_body(), 64 * 1024)
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(preflight["registered"], true);
    assert_eq!(preflight["methods"]["password"]["available"], true);
    assert_eq!(preflight["methods"]["magicLink"]["available"], true);

    // 2. Passing raw cookie session_id as Bearer token MUST NOT authenticate.
    let (status, json) = post_graphql(
      &app,
      Some(("authorization", &format!("Bearer {session_id}"))),
      "{ currentUser { id } }",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["data"]["currentUser"].is_null());

    // 3. Native client sign-in -> exchange -> Bearer JWT -> refresh -> sessions list -> sign-out.
    let native_signin = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/sign-in")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-version", "0.27.5")
          .body(Body::from(
            serde_json::json!({ "email": "alice@affine.test", "password": "StrongPassword123" }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(native_signin.status(), StatusCode::OK);
    let signin_body: Value = serde_json::from_slice(
      &axum::body::to_bytes(native_signin.into_body(), 64 * 1024)
        .await
        .unwrap(),
    )
    .unwrap();
    let exchange_code = signin_body["exchangeCode"].as_str().expect("exchangeCode").to_owned();

    let install_uuid = uuid::Uuid::new_v4().to_string();
    // Non-native exchange must be rejected with 403.
    let non_native_ex = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/exchange")
          .header("content-type", "application/json")
          .header("x-affine-version", "0.27.5")
          .body(Body::from(
            serde_json::json!({
              "code": exchange_code,
              "installationId": install_uuid,
              "platform": "ios",
              "deviceName": "Test iPhone",
            })
            .to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(non_native_ex.status(), StatusCode::FORBIDDEN);

    let ex_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/exchange")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-version", "0.27.5")
          .body(Body::from(
            serde_json::json!({
              "code": exchange_code,
              "installationId": install_uuid,
              "platform": "ios",
              "deviceName": "Test iPhone",
            })
            .to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(ex_resp.status(), StatusCode::CREATED);
    assert_eq!(ex_resp.headers().get("cache-control").unwrap(), "no-store");
    assert_eq!(ex_resp.headers().get("pragma").unwrap(), "no-cache");
    let ex_body: Value =
      serde_json::from_slice(&axum::body::to_bytes(ex_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert!(
      ex_body.get("userId").is_none() && ex_body.get("isNewDevice").is_none() && ex_body.get("status").is_none(),
      "exchange response must omit userId/isNewDevice/status: {ex_body}"
    );
    // Verify default 180-day absoluteExpiresAt (~180d from now, > 170d).
    let abs_exp: chrono::DateTime<chrono::Utc> = ex_body["session"]["absoluteExpiresAt"]
      .as_str()
      .unwrap()
      .parse()
      .unwrap();
    assert!(
      (abs_exp - chrono::Utc::now()).num_days() >= 175,
      "default refreshAbsoluteTtl must be 180d, got {abs_exp}"
    );
    let jwt = ex_body["accessToken"].as_str().expect("accessToken").to_owned();
    let refresh_token = ex_body["refreshToken"].as_str().expect("refreshToken").to_owned();
    assert!(
      refresh_token.starts_with("aff_rt_v1."),
      "refreshToken must use 3-segment v0.27.5 aff_rt_v1 format: {refresh_token}"
    );
    assert!(server_domain::auth::parse_refresh_token(&refresh_token).is_some());

    let (status, json) = post_graphql(
      &app,
      Some(("authorization", &format!("Bearer {jwt}"))),
      "{ currentUser { id name email } }",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["data"]["currentUser"]["id"], user_id);
    assert_eq!(json["data"]["currentUser"]["name"], "Alice");

    // Non-UUID x-affine-refresh-attempt must be rejected with 400 VALIDATION_ERROR.
    let bad_attempt_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/refresh")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-refresh-attempt", "not-a-uuid")
          .body(Body::from(
            serde_json::json!({ "refreshToken": refresh_token }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(bad_attempt_resp.status(), StatusCode::BAD_REQUEST);
    let bad_attempt_json: Value = serde_json::from_slice(
      &axum::body::to_bytes(bad_attempt_resp.into_body(), 64 * 1024)
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(bad_attempt_json["name"], "VALIDATION_ERROR");

    // Refresh with UUID x-affine-refresh-attempt rotates refresh token and includes status: "rotated".
    let attempt_uuid = uuid::Uuid::new_v4().to_string();
    let ref_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/refresh")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-refresh-attempt", &attempt_uuid)
          .body(Body::from(
            serde_json::json!({ "refreshToken": refresh_token }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(ref_resp.status(), StatusCode::CREATED);
    let ref_body: Value =
      serde_json::from_slice(&axum::body::to_bytes(ref_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(ref_body["status"], "rotated");
    assert!(
      ref_body.get("userId").is_none() && ref_body.get("isNewDevice").is_none(),
      "refresh response must omit userId/isNewDevice: {ref_body}"
    );
    let jwt2 = ref_body["accessToken"]
      .as_str()
      .expect("rotated accessToken")
      .to_owned();
    let refresh_token2 = ref_body["refreshToken"]
      .as_str()
      .expect("rotated refreshToken")
      .to_owned();
    assert!(server_domain::auth::parse_refresh_token(&refresh_token2).is_some());

    // Same UUID x-affine-refresh-attempt retry recovers the identical successor token without revoking.
    let recover_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/refresh")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-refresh-attempt", &attempt_uuid)
          .body(Body::from(
            serde_json::json!({ "refreshToken": refresh_token }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(recover_resp.status(), StatusCode::CREATED);
    let recover_body: Value =
      serde_json::from_slice(&axum::body::to_bytes(recover_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(recover_body["status"], "rotated");
    assert_eq!(recover_body["refreshToken"], refresh_token2);

    // Exhausted per-token refresh rate limit (count = 30) returns 429 TOO_MANY_REQUEST without rotating.
    let (rt2_id, _) = server_domain::auth::parse_refresh_token(&refresh_token2).unwrap();
    let rl_scope = format!("auth:session_refresh:{rt2_id}");
    sqlx::query(
      "INSERT INTO runtime_rolling_quota_counters (scope_key, window_seconds, bucket_start, count, expires_at, updated_at)
       VALUES ($1, 60, date_trunc('minute', clock_timestamp()), 30, clock_timestamp() + interval '2 minutes', clock_timestamp())
       ON CONFLICT (scope_key, window_seconds, bucket_start) DO UPDATE SET count = 30",
    )
    .bind(&rl_scope)
    .execute(db.pool())
    .await
    .unwrap();
    let rl_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/refresh")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .body(Body::from(
            serde_json::json!({ "refreshToken": refresh_token2 }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(rl_resp.status(), StatusCode::TOO_MANY_REQUESTS);
    let rl_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(rl_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(rl_json["name"], "TOO_MANY_REQUEST");

    // Non-default app_configs auth.token.* overrides apply to exchange & refresh deadlines.
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at)
       VALUES ('auth.token.accessTokenTtl', '300'::jsonb, clock_timestamp(), clock_timestamp()),
              ('auth.token.refreshIdleTtl', '\"7d\"'::jsonb, clock_timestamp(), clock_timestamp()),
              ('auth.token.refreshAbsoluteTtl', '\"14d\"'::jsonb, clock_timestamp(), clock_timestamp()),
              ('auth.token.refreshGracePeriod', '0'::jsonb, clock_timestamp(), clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let custom_code = state.auth.issue_exchange_code(&user_id, Some("0.27.5")).await.unwrap();
    let custom_ex = state
      .auth
      .exchange_auth_session(
        &custom_code,
        &uuid::Uuid::new_v4().to_string(),
        "ios",
        None,
        Some("0.27.5"),
      )
      .await
      .unwrap();
    assert_eq!(custom_ex.expires_in, 300);
    assert!((custom_ex.session.absolute_expires_at - chrono::Utc::now()).num_days() <= 14);
    assert!((custom_ex.refresh_expires_at - chrono::Utc::now()).num_days() <= 7);
    sqlx::query("DELETE FROM app_configs WHERE id LIKE 'auth.token.%'")
      .execute(db.pool())
      .await
      .unwrap();

    // Cross-gen compatibility: insert a v0.27.5 golden-format refresh token row directly and refresh it,
    // then replay with a mismatched attempt to verify 401 REFRESH_TOKEN_REUSED + session revocation.
    let v0275_golden = "aff_rt_v1.AAECAwQFBgcICQoLDA0ODxAR.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
    let (golden_id, golden_hash) = server_domain::auth::parse_refresh_token(v0275_golden).unwrap();
    let cross_sid = uuid::Uuid::new_v4().to_string();
    let cross_usid = uuid::Uuid::new_v4().to_string();
    let cross_asid = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
      .bind(&cross_sid)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '30 days', clock_timestamp())",
    )
    .bind(&cross_usid)
    .bind(&cross_sid)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO auth_sessions (id, user_session_id, installation_id, platform, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, $3, 'ios', clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '30 days', clock_timestamp() + interval '180 days')",
    )
    .bind(&cross_asid)
    .bind(&cross_usid)
    .bind(uuid::Uuid::new_v4().to_string())
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO auth_refresh_tokens (id, auth_session_id, generation, secret_hash, created_at, expires_at)
       VALUES ($1, $2, 1, $3, clock_timestamp(), clock_timestamp() + interval '30 days')",
    )
    .bind(&golden_id)
    .bind(&cross_asid)
    .bind(&golden_hash)
    .execute(db.pool())
    .await
    .unwrap();

    let cg_attempt_1 = uuid::Uuid::new_v4().to_string();
    let cg_attempt_2 = uuid::Uuid::new_v4().to_string();
    let cg_ok = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/refresh")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-refresh-attempt", &cg_attempt_1)
          .body(Body::from(
            serde_json::json!({ "refreshToken": v0275_golden }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(cg_ok.status(), StatusCode::CREATED);

    let cg_replay = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/refresh")
          .header("content-type", "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-refresh-attempt", &cg_attempt_2)
          .body(Body::from(
            serde_json::json!({ "refreshToken": v0275_golden }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(cg_replay.status(), StatusCode::UNAUTHORIZED);
    let cg_replay_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(cg_replay.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(cg_replay_json["name"], "REFRESH_TOKEN_REUSED");
    let revoked_reason: Option<String> = sqlx::query_scalar("SELECT revoke_reason FROM auth_sessions WHERE id = $1")
      .bind(&cross_asid)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(revoked_reason.as_deref(), Some("refresh_token_reused"));

    // GET /api/auth/sessions lists the active native session with current: true.
    let list_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/api/auth/sessions")
          .header("authorization", format!("Bearer {jwt2}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let sessions: Value =
      serde_json::from_slice(&axum::body::to_bytes(list_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert!(
      sessions
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["current"] == true && s["installationId"] == install_uuid)
    );

    // 4. Bearer sign-out revokes auth_session + refresh tokens -> 401 AUTH_SESSION_REVOKED.
    let signout_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/sign-out")
          .header("authorization", format!("Bearer {jwt2}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(signout_resp.status(), StatusCode::OK);
    let (status, json) = post_graphql(
      &app,
      Some(("authorization", &format!("Bearer {jwt2}"))),
      "{ currentUser { id } }",
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["name"], "AUTH_SESSION_REVOKED");

    // 5. updateProfile updates name and persists.
    let (status, json) = post_graphql(
      &app,
      Some(("cookie", &session_cookie)),
      r#"mutation { updateProfile(input: { name: "Alice Updated" }) { id name } }"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["data"]["updateProfile"]["name"], "Alice Updated");

    // 6. Avatar GET serves stored avatar and removeAvatar clears it.
    let png_bytes: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
    state
      .avatars
      .put("test-avatar-1", png_bytes.to_vec(), "image/png")
      .await
      .unwrap();
    let av_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/api/avatars/test-avatar-1")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(av_resp.status(), StatusCode::OK);
    assert_eq!(av_resp.headers().get(header::CONTENT_TYPE).unwrap(), "image/png");
    assert_eq!(
      av_resp.headers().get(header::X_CONTENT_TYPE_OPTIONS).unwrap(),
      "nosniff"
    );

    let (status, json) = post_graphql(
      &app,
      Some(("cookie", &session_cookie)),
      "mutation { removeAvatar { success } }",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["data"]["removeAvatar"]["success"], true);

    // 7. Expired session cleanup removes expired user_sessions & orphan multiple_users_sessions.
    let expired_sid = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
      .bind(&expired_sid)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at)
       VALUES ($1, $2, $3, clock_timestamp() - INTERVAL '1 hour', clock_timestamp())",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&expired_sid)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .unwrap();

    let summary = state
      .auth
      .cleanup_expired_sessions(100, 10, server_domain::auth::DEFAULT_REFRESH_RETENTION_SECS)
      .await
      .expect("cleanup expired sessions");
    assert!(summary.deleted_user_sessions >= 1);

    db.pool().close().await;
  });
}

#[test]
fn workspace_members_permissions_transfer_invite_links_and_source_scoped_blobs() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig::default(),
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(Arc::clone(&state));

    // Create owner and member users directly in DB and sign in owner.
    let owner_res = state
      .auth
      .create_first_admin_user(server_domain::auth::CreateAdminUserInput {
        name: Some("Owner".into()),
        email: "owner@affine.test".into(),
        password: "OwnerPassword123".into(),
        client_version: None,
      })
      .await
      .unwrap();
    let owner_cookie = format!("affine_session={}", owner_res.session_id);

    let member_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, 'Bob', 'bob@affine.test', true, false)",
    )
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Create workspace.
    let (status, json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      "mutation { createWorkspace { id public role permissions { Workspace_Delete Workspace_Settings_Update } } }",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let ws_id = json["data"]["createWorkspace"]["id"].as_str().unwrap().to_owned();
    assert_eq!(json["data"]["createWorkspace"]["role"], "Owner");
    assert_eq!(json["data"]["createWorkspace"]["permissions"]["Workspace_Delete"], true);

    // Query workspaces list.
    let (_, json) = post_graphql(&app, Some(("cookie", &owner_cookie)), "{ workspaces { id public } }").await;
    assert_eq!(json["data"]["workspaces"].as_array().unwrap().len(), 1);

    // Update workspace settings.
    let (_, json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      &format!(
        r#"mutation {{ updateWorkspace(input: {{ id: "{ws_id}", public: true, enableUrlPreview: true }}) {{ id public enableUrlPreview }} }}"#
      ),
    )
    .await;
    assert_eq!(json["data"]["updateWorkspace"]["public"], true);
    assert_eq!(json["data"]["updateWorkspace"]["enableUrlPreview"], true);

    // Create invite link, inspect getInviteInfo, revoke invite link.
    let (_, json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      &format!(r#"mutation {{ createInviteLink(workspaceId: "{ws_id}", expireTime: OneDay) {{ link expireTime }} }}"#),
    )
    .await;
    let link = json["data"]["createInviteLink"]["link"].as_str().unwrap().to_owned();
    let invite_id = link.rsplit('/').next().unwrap().to_owned();
    let (_, info_json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      &format!(r#"query {{ getInviteInfo(inviteId: "{invite_id}") {{ workspace {{ id }} user {{ email }} }} }}"#),
    )
    .await;
    assert_eq!(info_json["data"]["getInviteInfo"]["workspace"]["id"], ws_id);

    let (_, revoke_json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      &format!(r#"mutation {{ revokeInviteLink(workspaceId: "{ws_id}") }}"#),
    )
    .await;
    assert_eq!(revoke_json["data"]["revokeInviteLink"], true);

    // Add active member, list members with query, transfer ownership, and check previous owner demotion.
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source)
       VALUES ($1, $2, $3, 'member', 'active', 'legacy')",
    )
    .bind(format!("perm_{}", uuid::Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (_, list_ws_json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      r#"query { workspaces { id initialized team owner { id } } }"#,
    )
    .await;
    let ws_list = list_ws_json["data"]["workspaces"].as_array().unwrap();
    assert_eq!(ws_list.len(), 1);
    assert_eq!(ws_list[0]["id"], ws_id);
    assert_eq!(ws_list[0]["initialized"], false);
    assert_eq!(ws_list[0]["team"], false);

    let (_, members_json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      &format!(
        r#"query {{ workspace(id: "{ws_id}") {{ members(skip: 0, take: 10, query: "bob") {{ id role status }} }} }}"#
      ),
    )
    .await;
    let members = members_json["data"]["workspace"]["members"].as_array().unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["id"], member_id);

    // Source-scoped blob read rejects unreferenced blobs, then succeeds once referenced in the Yjs root doc.
    state
      .blobs
      .put_blob(&ws_id, "logo.svg", "image/svg+xml", b"<svg/>".to_vec())
      .await
      .unwrap();
    let unreferenced_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!(
            "/api/workspaces/{ws_id}/blobs/v1/logo.svg?sourceType=currentDoc&docId={ws_id}"
          ))
          .header(header::COOKIE, &owner_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(unreferenced_resp.status(), StatusCode::NOT_FOUND);

    let owner_id = &owner_res.user.id;
    let root_doc_bytes = {
      let doc = y_octo::Doc::new();
      let mut meta = doc.get_or_create_map("meta").unwrap();
      meta.insert("avatar".to_owned(), "logo.svg".to_owned()).unwrap();
      doc.encode_update_v1().unwrap()
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, state, created_at, updated_at, created_by, updated_by)
       VALUES ($1, $2, $3, NULL, clock_timestamp(), clock_timestamp(), $4, $4)",
    )
    .bind(&ws_id)
    .bind(&ws_id)
    .bind(&root_doc_bytes)
    .bind(owner_id)
    .execute(db.pool())
    .await
    .unwrap();

    let blob_v1_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!(
            "/api/workspaces/{ws_id}/blobs/v1/logo.svg?sourceType=currentDoc&docId={ws_id}"
          ))
          .header(header::COOKIE, &owner_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(blob_v1_resp.status(), StatusCode::OK);
    assert_eq!(
      blob_v1_resp.headers().get(header::CONTENT_TYPE).unwrap(),
      "image/svg+xml"
    );
    assert!(
      blob_v1_resp
        .headers()
        .get(header::CONTENT_DISPOSITION)
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("attachment;")
    );

    // Cross-user avatar delete protection: Bob cannot delete Alice's avatar by pointing his avatarUrl at it.
    let alice_avatar_key = format!("{owner_id}-avatar-1234567890");
    state
      .avatars
      .put(
        &alice_avatar_key,
        vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A],
        "image/png",
      )
      .await
      .unwrap();
    let bob_sid = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
      .bind(&bob_sid)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '1 day', clock_timestamp())",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&bob_sid)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();
    let bob_cookie = format!("affine_session={bob_sid}");
    // Seed Bob's avatar_url directly in DB to point at Alice's avatar key, then verify removeAvatar/uploadAvatar
    // never deletes another user's avatar object.
    sqlx::query("UPDATE users SET avatar_url = $2 WHERE id = $1")
      .bind(&member_id)
      .bind(format!("http://localhost:3010/api/avatars/{alice_avatar_key}"))
      .execute(db.pool())
      .await
      .unwrap();
    let (_, rm_json) = post_graphql(
      &app,
      Some(("cookie", &bob_cookie)),
      r#"mutation { removeAvatar { success } }"#,
    )
    .await;
    assert_eq!(rm_json["data"]["removeAvatar"]["success"], true);
    let alice_avatar_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/avatars/{alice_avatar_key}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(alice_avatar_resp.status(), StatusCode::OK);

    let legacy_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/workspaces/{ws_id}/blobs/logo.svg"))
          .header("x-affine-version", "0.26.0")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(legacy_resp.status(), StatusCode::FORBIDDEN);

    // Transfer ownership to Bob -> previous owner (non-commercial) becomes Collaborator, then leaves.
    let (_, transfer_json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      &format!(r#"mutation {{ grantMember(workspaceId: "{ws_id}", userId: "{member_id}", permission: Owner) }}"#),
    )
    .await;
    assert_eq!(transfer_json["data"]["grantMember"], true);

    let (_, leave_json) = post_graphql(
      &app,
      Some(("cookie", &owner_cookie)),
      &format!(r#"mutation {{ leaveWorkspace(workspaceId: "{ws_id}") }}"#),
    )
    .await;
    assert_eq!(leave_json["data"]["leaveWorkspace"], true);

    db.pool().close().await;
  });
}

#[test]
fn per_doc_acl_invite_link_accept_and_avatar_webp_transcode() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig::default(),
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(Arc::clone(&state));

    // Seed Owner (Alice) + Member (Bob) + Outsider (Carol).
    let (status, _) = post_json(
      &app,
      "/api/setup/create-admin-user",
      serde_json::json!({
        "name": "Alice",
        "email": "alice-acl@affine.test",
        "password": "Password123!",
      }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    let alice_id: String = sqlx::query_scalar("SELECT id FROM users WHERE email = 'alice-acl@affine.test'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    let alice_sid: String = sqlx::query_scalar("SELECT session_id FROM user_sessions WHERE user_id = $1 LIMIT 1")
      .bind(&alice_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    let alice_cookie = format!("affine_session={alice_sid}");

    let bob_id = uuid::Uuid::new_v4().to_string();
    let bob_sid = uuid::Uuid::new_v4().to_string();
    let carol_id = uuid::Uuid::new_v4().to_string();
    let carol_sid = uuid::Uuid::new_v4().to_string();
    for (uid, sid, name, email) in [
      (&bob_id, &bob_sid, "Bob", "bob-acl@affine.test"),
      (&carol_id, &carol_sid, "Carol", "carol-acl@affine.test"),
    ] {
      sqlx::query("INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, $2, $3, true, false)")
        .bind(uid)
        .bind(name)
        .bind(email)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
        .bind(sid)
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at)
         VALUES ($1, $2, $3, clock_timestamp() + interval '1 day', clock_timestamp())",
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(sid)
      .bind(uid)
      .execute(db.pool())
      .await
      .unwrap();
    }
    let bob_cookie = format!("affine_session={bob_sid}");
    let carol_cookie = format!("affine_session={carol_sid}");

    // 1. Create private workspace & test invite link accept -> waiting_review -> approveMember.
    let (_, ws_json) = post_graphql(
      &app,
      Some(("cookie", &alice_cookie)),
      "mutation { createWorkspace { id } }",
    )
    .await;
    let ws_id = ws_json["data"]["createWorkspace"]["id"].as_str().unwrap().to_owned();

    let (_, link_json) = post_graphql(
      &app,
      Some(("cookie", &alice_cookie)),
      &format!(r#"mutation {{ createInviteLink(workspaceId: "{ws_id}", expireTime: OneDay) {{ link expireTime }} }}"#),
    )
    .await;
    let link_url = link_json["data"]["createInviteLink"]["link"].as_str().unwrap();
    let link_id = link_url.rsplit("/invite/").next().unwrap();
    assert_eq!(
      link_id.len(),
      21,
      "invite link ID must be 21-char nanoid, got {link_id}"
    );

    // Bob accepts invite link -> creates waiting_review invitation, then Alice approves Bob.
    let (_, acc_json) = post_graphql(
      &app,
      Some(("cookie", &bob_cookie)),
      &format!(r#"mutation {{ acceptInviteById(inviteId: "{link_id}") }}"#),
    )
    .await;
    assert_eq!(acc_json["data"]["acceptInviteById"], true);

    let (_, app_json) = post_graphql(
      &app,
      Some(("cookie", &alice_cookie)),
      &format!(r#"mutation {{ approveMember(workspaceId: "{ws_id}", userId: "{bob_id}") }}"#),
    )
    .await;
    assert_eq!(app_json["data"]["approveMember"], true);

    // 2. Per-doc ACL:
    // - Private workspace with a published public doc -> anonymous CAN read GET /api/workspaces/{ws}/docs/{doc}
    // - Restricted doc with member_default_role = 'none' -> active member Bob DENIED Doc.Read
    // - Foreign userdata$ doc -> Bob DENIED
    // - Workspace system doc `db$<ws>$folders` -> Bob ALLOWED
    let empty_doc = y_octo::Doc::with_client(1).encode_update_v1().unwrap();
    for doc_id in [
      "pub-doc",
      "restricted-doc",
      &format!("userdata${alice_id}${ws_id}$settings"),
      &format!("db${ws_id}$folders"),
    ] {
      sqlx::query(
        "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at)
         VALUES ($1, $2, $3, clock_timestamp(), clock_timestamp())",
      )
      .bind(&ws_id)
      .bind(doc_id)
      .bind(&empty_doc)
      .execute(db.pool())
      .await
      .unwrap();
    }
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, mode, published_at)
       VALUES ($1, 'pub-doc', 1, clock_timestamp())",
    )
    .bind(&ws_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, published_at, public_role)
       VALUES ($1, 'pub-doc', 'public', clock_timestamp(), 'external')",
    )
    .bind(&ws_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, member_default_role)
       VALUES ($1, 'restricted-doc', 'private', 'none')",
    )
    .bind(&ws_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Anonymous reads published public doc in private workspace -> 200 + publish-mode: edgeless.
    let pub_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/workspaces/{ws_id}/docs/pub-doc"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(pub_resp.status(), StatusCode::OK);
    assert_eq!(pub_resp.headers().get("publish-mode").unwrap(), "edgeless");

    // Active member Bob denied restricted-doc (`member_default_role = 'none'`).
    let denied_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/workspaces/{ws_id}/docs/restricted-doc"))
          .header("cookie", &bob_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(denied_resp.status(), StatusCode::FORBIDDEN);

    // Bob denied Alice's private userdata$ doc.
    let foreign_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!(
            "/api/workspaces/{ws_id}/docs/userdata${alice_id}${ws_id}$settings"
          ))
          .header("cookie", &bob_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(foreign_resp.status(), StatusCode::FORBIDDEN);

    // Bob allowed workspace shared system doc `db$<ws>$folders`.
    let sys_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/workspaces/{ws_id}/docs/db${ws_id}$folders"))
          .header("cookie", &bob_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(sys_resp.status(), StatusCode::OK);

    // 3. Unbound email invitation info rejects wrong account (Carol cannot peek at an invite sent to dave@affine.test).
    let inv_id = format!("inv_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
      "INSERT INTO workspace_invitations (id, workspace_id, invitee_user_id, normalized_email, inviter_user_id, requested_role, status, kind, created_at, updated_at)
       VALUES ($1, $2, NULL, 'dave@affine.test', $3, 'member', 'pending', 'email', clock_timestamp(), clock_timestamp())",
    )
    .bind(&inv_id)
    .bind(&ws_id)
    .bind(&alice_id)
    .execute(db.pool())
    .await
    .unwrap();
    let (_, peek_json) = post_graphql(
      &app,
      Some(("cookie", &carol_cookie)),
      &format!(r#"query {{ getInviteInfo(inviteId: "{inv_id}") {{ workspace {{ id name }} }} }}"#),
    )
    .await;
    assert!(!peek_json["errors"].as_array().unwrap().is_empty());

    // 4. Avatar upload: valid PNG -> WebP stored; invalid bytes -> IMAGE_FORMAT_NOT_SUPPORTED.
    let mut png_buf = std::io::Cursor::new(Vec::new());
    let img = image::RgbaImage::from_pixel(4, 4, image::Rgba([10, 20, 30, 255]));
    image::DynamicImage::ImageRgba8(img)
      .write_to(&mut png_buf, image::ImageFormat::Png)
      .unwrap();
    let png_bytes = png_buf.into_inner();

    let boundary = "----affineAvatarBoundary";
    let build_avatar_multipart = |file_bytes: &[u8]| {
      let mut body = Vec::new();
      body.extend_from_slice(
        format!(
          "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n\
           {{\"query\":\"mutation ($avatar: Upload!) {{ uploadAvatar(avatar: $avatar) {{ id avatarUrl }} }}\",\"variables\":{{\"avatar\":null}}}}\r\n\
           --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n\
           {{\"0\":[\"variables.avatar\"]}}\r\n\
           --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"avatar.png\"\r\nContent-Type: image/png\r\n\r\n"
        )
        .as_bytes(),
      );
      body.extend_from_slice(file_bytes);
      body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
      body
    };

    let ok_up = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/graphql")
          .header("cookie", &alice_cookie)
          .header("apollo-require-preflight", "true")
          .header("content-type", format!("multipart/form-data; boundary={boundary}"))
          .body(Body::from(build_avatar_multipart(&png_bytes)))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(ok_up.status(), StatusCode::OK);
    let up_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(ok_up.into_body(), 64 * 1024).await.unwrap()).unwrap();
    let av_url = up_json["data"]["uploadAvatar"]["avatarUrl"]
      .as_str()
      .expect("avatarUrl");
    let av_key = av_url.rsplit("/api/avatars/").next().unwrap();
    let get_av = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/avatars/{av_key}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(get_av.status(), StatusCode::OK);
    assert_eq!(get_av.headers().get(header::CONTENT_TYPE).unwrap(), "image/webp");

    // Corrupt image bytes -> IMAGE_FORMAT_NOT_SUPPORTED.
    let bad_up = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/graphql")
          .header("cookie", &alice_cookie)
          .header("apollo-require-preflight", "true")
          .header("content-type", format!("multipart/form-data; boundary={boundary}"))
          .body(Body::from(build_avatar_multipart(
            b"<svg><script>alert(1)</script></svg>",
          )))
          .unwrap(),
      )
      .await
      .unwrap();
    let bad_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(bad_up.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(
      bad_json["errors"][0]["extensions"]["name"],
      "IMAGE_FORMAT_NOT_SUPPORTED"
    );

    // Oversized dimensions PNG (20000x20000 IHDR, tiny file) must fail pre-decode with IMAGE_FORMAT_NOT_SUPPORTED.
    let mut big_png = Vec::new();
    big_png.extend_from_slice(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(b"IHDR");
    ihdr.extend_from_slice(&20_000_u32.to_be_bytes());
    ihdr.extend_from_slice(&20_000_u32.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    let ihdr_crc = crc32fast::hash(&ihdr);
    big_png.extend_from_slice(&13_u32.to_be_bytes());
    big_png.extend_from_slice(&ihdr);
    big_png.extend_from_slice(&ihdr_crc.to_be_bytes());
    let iend_crc = crc32fast::hash(b"IEND");
    big_png.extend_from_slice(&0_u32.to_be_bytes());
    big_png.extend_from_slice(b"IEND");
    big_png.extend_from_slice(&iend_crc.to_be_bytes());
    let big_up = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/graphql")
          .header("cookie", &alice_cookie)
          .header("apollo-require-preflight", "true")
          .header("content-type", format!("multipart/form-data; boundary={boundary}"))
          .body(Body::from(build_avatar_multipart(&big_png)))
          .unwrap(),
      )
      .await
      .unwrap();
    let big_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(big_up.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(
      big_json["errors"][0]["extensions"]["name"],
      "IMAGE_FORMAT_NOT_SUPPORTED"
    );

    // 5. Readable blob manifest SQL pagination (mixed-case keys, limit=1, no duplicates/gaps) +
    // unauthorized member denial + over-budget error propagation.
    let mixed_doc_bytes = {
      let doc = y_octo::Doc::with_client(2);
      let mut blocks = doc.get_or_create_map("blocks").unwrap();
      let mut page_block = doc.create_map().unwrap();
      page_block.insert("sys:id".to_owned(), "page-root".to_owned()).unwrap();
      page_block
        .insert("sys:flavour".to_owned(), "affine:page".to_owned())
        .unwrap();
      let mut children = doc.create_array().unwrap();
      children.push("img-1".to_owned()).unwrap();
      children.push("img-2".to_owned()).unwrap();
      children.push("img-3".to_owned()).unwrap();
      page_block.insert("sys:children".to_owned(), children).unwrap();
      blocks.insert("page-root".to_owned(), page_block).unwrap();
      for (bid, blob_key) in [("img-1", "B_blob"), ("img-2", "a_blob"), ("img-3", "c_blob")] {
        let mut img_block = doc.create_map().unwrap();
        img_block.insert("sys:id".to_owned(), bid.to_owned()).unwrap();
        img_block
          .insert("sys:flavour".to_owned(), "affine:image".to_owned())
          .unwrap();
        img_block
          .insert("prop:sourceId".to_owned(), blob_key.to_owned())
          .unwrap();
        blocks.insert(bid.to_owned(), img_block).unwrap();
      }
      doc.encode_update_v1().unwrap()
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at)
       VALUES ($1, 'mixed-case-doc', $2, clock_timestamp(), clock_timestamp())",
    )
    .bind(&ws_id)
    .bind(&mixed_doc_bytes)
    .execute(db.pool())
    .await
    .unwrap();
    for key in ["B_blob", "a_blob", "c_blob"] {
      state
        .blobs
        .put_blob(&ws_id, key, "application/octet-stream", b"x".to_vec())
        .await
        .unwrap();
    }
    let mut collected = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..5 {
      let uri = match &cursor {
        Some(c) => format!("/api/workspaces/{ws_id}/readable-blob-manifest/v1?limit=1&cursor={c}"),
        None => format!("/api/workspaces/{ws_id}/readable-blob-manifest/v1?limit=1"),
      };
      let resp = app
        .clone()
        .oneshot(
          Request::builder()
            .uri(&uri)
            .header("cookie", &alice_cookie)
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::OK);
      let page: Value =
        serde_json::from_slice(&axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
      for item in page["entries"].as_array().unwrap() {
        collected.push(item["key"].as_str().unwrap().to_owned());
      }
      cursor = page["nextCursor"].as_str().map(str::to_owned);
      if cursor.is_none() {
        break;
      }
    }
    let mut sorted_collected = collected.clone();
    sorted_collected.sort();
    sorted_collected.dedup();
    assert_eq!(
      collected.len(),
      3,
      "expected 3 unique keys without duplicates/gaps: {collected:?}"
    );
    assert_eq!(sorted_collected, vec!["B_blob", "a_blob", "c_blob"]);

    // Unauthorized outsider Carol is denied readable-blob-manifest/v1.
    let carol_manifest = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/workspaces/{ws_id}/readable-blob-manifest/v1"))
          .header("cookie", &carol_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(carol_manifest.status(), StatusCode::FORBIDDEN);

    // Restricted doc Doc.Read enforcement across all 3 blob routes for active member Bob:
    // put an attachment in `restricted-doc` (where Bob has member_default_role = 'none').
    let restricted_doc_bytes = {
      let doc = y_octo::Doc::with_client(3);
      let mut blocks = doc.get_or_create_map("blocks").unwrap();
      let mut page_block = doc.create_map().unwrap();
      page_block.insert("sys:id".to_owned(), "r-page".to_owned()).unwrap();
      page_block
        .insert("sys:flavour".to_owned(), "affine:page".to_owned())
        .unwrap();
      let mut children = doc.create_array().unwrap();
      children.push("r-img".to_owned()).unwrap();
      page_block.insert("sys:children".to_owned(), children).unwrap();
      blocks.insert("r-page".to_owned(), page_block).unwrap();
      let mut img_block = doc.create_map().unwrap();
      img_block.insert("sys:id".to_owned(), "r-img".to_owned()).unwrap();
      img_block
        .insert("sys:flavour".to_owned(), "affine:image".to_owned())
        .unwrap();
      img_block
        .insert("prop:sourceId".to_owned(), "secret_blob".to_owned())
        .unwrap();
      blocks.insert("r-img".to_owned(), img_block).unwrap();
      doc.encode_update_v1().unwrap()
    };
    sqlx::query("UPDATE snapshots SET blob = $3 WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws_id)
      .bind("restricted-doc")
      .bind(&restricted_doc_bytes)
      .execute(db.pool())
      .await
      .unwrap();
    state
      .blobs
      .put_blob(&ws_id, "secret_blob", "application/octet-stream", b"secret".to_vec())
      .await
      .unwrap();

    let bob_blob = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!(
            "/api/workspaces/{ws_id}/blobs/v1/secret_blob?sourceType=currentDoc&docId=restricted-doc"
          ))
          .header("cookie", &bob_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(bob_blob.status(), StatusCode::FORBIDDEN);

    let bob_doc_manifest = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!(
            "/api/workspaces/{ws_id}/blob-manifest/v1?sourceType=currentDoc&docId=restricted-doc"
          ))
          .header("cookie", &bob_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(bob_doc_manifest.status(), StatusCode::FORBIDDEN);

    let bob_ws_manifest = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/workspaces/{ws_id}/readable-blob-manifest/v1?limit=100"))
          .header("cookie", &bob_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(bob_ws_manifest.status(), StatusCode::OK);
    let bob_ws_json: Value = serde_json::from_slice(
      &axum::body::to_bytes(bob_ws_manifest.into_body(), 64 * 1024)
        .await
        .unwrap(),
    )
    .unwrap();
    let bob_keys: Vec<&str> = bob_ws_json["entries"]
      .as_array()
      .unwrap()
      .iter()
      .map(|e| e["key"].as_str().unwrap())
      .collect();
    assert!(
      !bob_keys.contains(&"secret_blob"),
      "restricted-doc blob must be excluded from Bob's readable-blob-manifest: {bob_keys:?}"
    );
    assert!(bob_keys.contains(&"a_blob"));

    // Over-budget doc (>16 MiB snapshot): both single-doc blob-manifest/v1 and
    // workspace-level readable-blob-manifest/v1 propagate 500 INTERNAL_SERVER_ERROR
    // (matching v0.27.5 blob_access invalid_state contract; never silently skip).
    let huge_blob = vec![0u8; 16 * 1024 * 1024 + 1];
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at)
       VALUES ($1, 'zzz-over-budget-doc', $2, clock_timestamp(), clock_timestamp())",
    )
    .bind(&ws_id)
    .bind(&huge_blob)
    .execute(db.pool())
    .await
    .unwrap();
    let single_doc_err = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!(
            "/api/workspaces/{ws_id}/blob-manifest/v1?sourceType=currentDoc&docId=zzz-over-budget-doc"
          ))
          .header("cookie", &alice_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(single_doc_err.status(), StatusCode::INTERNAL_SERVER_ERROR);

    let ws_manifest_err = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/workspaces/{ws_id}/readable-blob-manifest/v1?limit=100"))
          .header("cookie", &alice_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(ws_manifest_err.status(), StatusCode::INTERNAL_SERVER_ERROR);

    db.pool().close().await;
  });
}

#[test]
fn native_session_exchange_single_connection_pool_and_zod_validation() {
  with_migrated_db(|db_url| async move {
    // First migrate schema, then reconnect with max_connections = 1 to verify
    // zero nested pool checkout deadlocks in exchange_auth_session / refresh_auth_session.
    {
      let setup_db = connect_db(&db_url).await;
      setup_db.pool().close().await;
    }
    let db = ServerDb::connect(DbConfig {
      database_url: db_url.clone(),
      channel: "canary".into(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 1,
      statement_timeout_ms: 5_000,
      tier_permits: [1, 1, 1, 1],
    })
    .await
    .expect("connect max_connections=1 test db");
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig::default(),
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(Arc::clone(&state));

    let (status, _) = post_json(
      &app,
      "/api/setup/create-admin-user",
      serde_json::json!({
        "email": "single-conn@example.com",
        "password": "Password123!",
        "name": "SingleConn",
      }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    // Sign in as native client to get exchangeCode.
    let signin = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-version", "0.27.5")
          .body(Body::from(
            serde_json::json!({
              "email": "single-conn@example.com",
              "password": "Password123!",
            })
            .to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(signin.status(), StatusCode::OK);
    let signin_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(signin.into_body(), 64 * 1024).await.unwrap()).unwrap();
    let code = signin_json["exchangeCode"].as_str().unwrap().to_owned();

    // Zod UUID rejection: dashless UUID & braced UUID -> 400.
    for bad_uuid in [
      "550e8400e29b41d4a716446655440000",
      "{550e8400-e29b-41d4-a716-446655440000}",
      "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
    ] {
      let resp = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/auth/session/exchange")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-affine-client-kind", "native")
            .header("x-affine-version", "0.27.5")
            .body(Body::from(
              serde_json::json!({
                "code": code,
                "installationId": bad_uuid,
                "platform": "ios",
              })
              .to_string(),
            ))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "expected 400 for {bad_uuid}");
    }

    // 201-char, 200-char + U+0085 (NEL, not trimmed by JS), and BOM-only ("\u{feff}") deviceName -> 400.
    for bad_name in [
      "a".repeat(201),
      format!("{}\u{0085}", "a".repeat(200)),
      "\u{feff}".to_owned(),
    ] {
      let resp = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/auth/session/exchange")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-affine-client-kind", "native")
            .header("x-affine-version", "0.27.5")
            .body(Body::from(
              serde_json::json!({
                "code": code,
                "installationId": "550e8400-e29b-41d4-a716-446655440000",
                "platform": "ios",
                "deviceName": bad_name,
              })
              .to_string(),
            ))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    // Non-default accessTokenTtl = 300 in app_configs.
    sqlx::query(
      "INSERT INTO app_configs (id, value, updated_at) VALUES ('auth.token.accessTokenTtl', '300'::jsonb, clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
    )
    .execute(db.pool())
    .await
    .unwrap();

    // Valid exchange on max_connections=1 with 100 CJK chars (300 UTF-8 bytes, 100 UTF-16 units) -> 201!
    let cjk_name = format!("  {}  ", "测".repeat(100));
    let ex_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/exchange")
          .header(header::CONTENT_TYPE, "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-version", "0.27.5")
          .body(Body::from(
            serde_json::json!({
              "code": code,
              "installationId": "550e8400-e29b-41d4-a716-446655440000",
              "platform": "ios",
              "deviceName": cjk_name,
            })
            .to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(ex_resp.status(), StatusCode::CREATED);
    let ex_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(ex_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(ex_json["expiresIn"].as_i64(), Some(300));
    let rt = ex_json["refreshToken"].as_str().unwrap().to_owned();

    // Whitespace-padded refresh token must return 401 REFRESH_TOKEN_INVALID without rotating.
    let padded_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/session/refresh")
          .header(header::CONTENT_TYPE, "application/json")
          .header("x-affine-client-kind", "native")
          .header("x-affine-version", "0.27.5")
          .body(Body::from(
            serde_json::json!({ "refreshToken": format!(" {rt} ") }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(padded_resp.status(), StatusCode::UNAUTHORIZED);
    let padded_json: Value =
      serde_json::from_slice(&axum::body::to_bytes(padded_resp.into_body(), 64 * 1024).await.unwrap()).unwrap();
    assert_eq!(padded_json["name"].as_str(), Some("REFRESH_TOKEN_INVALID"));

    // Rotate and then Recover on max_connections=1 with version-0 non-nil UUID attempt;
    // BOTH must return 201, expiresIn = 300, and JWT exp-iat = 300.
    let attempt = "00000000-0000-0000-0000-000000000001";
    for label in ["rotate", "recover"] {
      let r = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/auth/session/refresh")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-affine-client-kind", "native")
            .header("x-affine-version", "0.27.5")
            .header("x-affine-refresh-attempt", attempt)
            .body(Body::from(serde_json::json!({ "refreshToken": rt }).to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(r.status(), StatusCode::CREATED, "{label} should return 201");
      let rj: Value = serde_json::from_slice(&axum::body::to_bytes(r.into_body(), 64 * 1024).await.unwrap()).unwrap();
      assert_eq!(rj["expiresIn"].as_i64(), Some(300), "{label} expiresIn must be 300");
      let jwt_payload = rj["accessToken"].as_str().unwrap().split('.').nth(1).unwrap();
      let decoded = base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, jwt_payload).unwrap();
      let claims: Value = serde_json::from_slice(&decoded).unwrap();
      assert_eq!(
        claims["exp"].as_i64().unwrap() - claims["iat"].as_i64().unwrap(),
        300,
        "{label} JWT exp-iat must be 300"
      );
    }

    db.pool().close().await;
  });
}
