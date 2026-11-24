//! Real PostgreSQL integration tests for security challenges, `UserType.token`,
//! session revocation, signing key rotation CAS, and `Query.error`.

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use chrono::Utc;
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_domain::auth::CreateAdminUserInput;
use server_domain::auth::keyring::{SIGNING_KEYS_CONFIG_ID, StoredSigningKey};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::CommunityExtension;
use server_types::ServerRole;
use tower::ServiceExt as _;

fn lease_test_db() -> test_db_harness::pg::DbLease {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = test_db_harness::migrations::MigrationSet {
    migrations: vec![],
    digest: "5e20000000000012".into(),
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
) -> (StatusCode, Value) {
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
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
  let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
  (status, json)
}

async fn gql(router: &Router, cookie: Option<&str>, query: &str, variables: Value) -> (StatusCode, Value) {
  let mut headers: Vec<(&str, String)> = Vec::new();
  if let Some(c) = cookie {
    headers.push(("cookie", c.to_owned()));
  }
  let header_refs: Vec<(&str, &str)> = headers.iter().map(|(k, v)| (*k, v.as_str())).collect();
  send_json(
    router,
    "POST",
    "/graphql",
    &header_refs,
    Some(json!({ "query": query, "variables": variables })),
  )
  .await
}

#[test]
fn security_challenges_user_token_and_signing_key_rotation_e2e() {
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

    let admin_signin = state
      .auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("Admin".into()),
        email: "admin@example.test".into(),
        password: "Password123!".into(),
        client_version: None,
      })
      .await
      .unwrap();
    let admin_cookie = format!("affine_session={}", admin_signin.session_id);

    let user_b_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, disabled, auth_epoch, created_at) VALUES ($1, 'UserB', 'userb@example.test', true, false, 0, clock_timestamp())",
    )
    .bind(&user_b_id)
    .execute(db.pool())
    .await
    .unwrap();
    let user_b_session = state.auth.issue_cookie_session_for_user(&user_b_id).await.unwrap();
    let user_b_cookie = format!("affine_session={}", user_b_session.session_id);

    let shared_ws = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'Shared')")
      .bind(&shared_ws)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source)
         VALUES
           ($1, $3, $4, 'owner', 'active', 'legacy'),
           ($2, $3, $5, 'member', 'active', 'legacy')"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&shared_ws)
    .bind(&admin_signin.user.id)
    .bind(&user_b_id)
    .execute(db.pool())
    .await
    .unwrap();

    // 1. UserType.token: self allowed, other user forbidden
    let (st, resp) = gql(
      &router,
      Some(&admin_cookie),
      "{ currentUser { id token { token sessionToken refresh } } }",
      json!({}),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert!(resp["errors"].is_null(), "errors: {resp}");
    assert_eq!(resp["data"]["currentUser"]["token"]["refresh"], "");
    assert!(
      !resp["data"]["currentUser"]["token"]["token"]
        .as_str()
        .unwrap()
        .is_empty()
    );

    let (_, resp) = gql(
      &router,
      Some(&admin_cookie),
      "query($email: String!) { user(email: $email) { ... on UserType { id token { token } } } }",
      json!({ "email": "userb@example.test" }),
    )
    .await;
    assert_eq!(resp["errors"][0]["extensions"]["name"], "ACTION_FORBIDDEN");

    // 2. Security challenge atomicity: sendVerifyEmail writes runtime_states + mail_deliveries together
    let (_, resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation { sendVerifyEmail(callbackUrl: \"/verify\") }",
      json!({}),
    )
    .await;
    assert_eq!(resp["data"]["sendVerifyEmail"], true, "resp: {resp}");
    let mail_payload: Value = sqlx::query_scalar(
      "SELECT payload FROM mail_deliveries WHERE mail_name = 'VerifyEmail' AND recipient_user_id = $1",
    )
    .bind(&admin_signin.user.id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    let verify_url = url::Url::parse(mail_payload["props"]["url"].as_str().unwrap()).unwrap();
    let verify_token = verify_url
      .query_pairs()
      .find(|(k, _)| k == "token")
      .unwrap()
      .1
      .into_owned();

    let (_, resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($t: String!) { verifyEmail(token: $t) }",
      json!({ "t": verify_token }),
    )
    .await;
    assert_eq!(resp["data"]["verifyEmail"], true);

    let (_, resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($t: String!) { verifyEmail(token: $t) }",
      json!({ "t": verify_token }),
    )
    .await;
    assert_eq!(resp["errors"][0]["extensions"]["name"], "INVALID_EMAIL_TOKEN");

    // 3. Signing key rotation CAS + retiring verification window + delete invalidation
    let (_, keys_resp) = gql(
      &router,
      Some(&admin_cookie),
      "{ authSigningKeys { id status source canDelete } }",
      json!({}),
    )
    .await;
    let key1_id = keys_resp["data"]["authSigningKeys"][0]["id"]
      .as_str()
      .unwrap()
      .to_owned();
    assert_eq!(keys_resp["data"]["authSigningKeys"][0]["status"], "active");

    let exch_code = state
      .auth
      .issue_exchange_code(&admin_signin.user.id, None)
      .await
      .unwrap();
    let exchanged = state
      .auth
      .exchange_auth_session(&exch_code, "inst-1", "macos", Some("TestMac"), None)
      .await
      .unwrap();
    let bearer_key1 = exchanged.access_token.clone();

    let (rot1, rot2) = tokio::join!(
      gql(
        &router,
        Some(&admin_cookie),
        "mutation($k: String!) { rotateAuthSigningKey(expectedActiveKeyId: $k) { id status canDelete } }",
        json!({ "k": key1_id }),
      ),
      gql(
        &router,
        Some(&admin_cookie),
        "mutation($k: String!) { rotateAuthSigningKey(expectedActiveKeyId: $k) { id status canDelete } }",
        json!({ "k": key1_id }),
      ),
    );
    let rot_ok = usize::from(rot1.1["errors"].is_null()) + usize::from(rot2.1["errors"].is_null());
    assert_eq!(rot_ok, 1, "expected 1 CAS winner: r1={:?}, r2={:?}", rot1.1, rot2.1);
    let cas_err = if rot1.1["errors"].is_null() { &rot2.1 } else { &rot1.1 };
    assert_eq!(cas_err["errors"][0]["extensions"]["name"], "INVALID_APP_CONFIG_INPUT");

    let (st, body) = send_json(
      &router,
      "GET",
      "/api/auth/session",
      &[("authorization", &format!("Bearer {bearer_key1}"))],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["user"]["id"], admin_signin.user.id);

    let (_, del_early) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($id: String!) { deleteAuthSigningKey(id: $id) { id } }",
      json!({ "id": key1_id }),
    )
    .await;
    assert_eq!(del_early["errors"][0]["extensions"]["name"], "ACTION_FORBIDDEN");

    let raw_keys: Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = $1")
      .bind(SIGNING_KEYS_CONFIG_ID)
      .fetch_one(db.pool())
      .await
      .unwrap();
    let mut stored: Vec<StoredSigningKey> = serde_json::from_value(raw_keys).unwrap();
    let past = Utc::now() - chrono::Duration::seconds(2_000);
    for k in &mut stored {
      if k.id == key1_id {
        k.retired_at = Some(past - chrono::Duration::seconds(1_000));
        k.verify_until = Some(past);
      }
    }
    sqlx::query("UPDATE app_configs SET value = $2 WHERE id = $1")
      .bind(SIGNING_KEYS_CONFIG_ID)
      .bind(serde_json::to_value(&stored).unwrap())
      .execute(db.pool())
      .await
      .unwrap();

    let (_, del_ok) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($id: String!) { deleteAuthSigningKey(id: $id) { id status } }",
      json!({ "id": key1_id }),
    )
    .await;
    assert!(del_ok["errors"].is_null(), "delete failed: {del_ok}");

    let (st, body) = send_json(
      &router,
      "GET",
      "/api/auth/session",
      &[("authorization", &format!("Bearer {bearer_key1}"))],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    assert_eq!(body["name"], "ACCESS_TOKEN_INVALID");

    // 4. Query.error: anonymous -> AUTHENTICATION_REQUIRED; any signed-in non-admin -> ACTION_FORBIDDEN
    let (_, anon_probe) = gql(
      &router,
      None,
      "{ error(name: ACTION_FORBIDDEN) { __typename } }",
      json!({}),
    )
    .await;
    assert_eq!(anon_probe["errors"][0]["extensions"]["name"], "AUTHENTICATION_REQUIRED");

    let (_, user_b_probe) = gql(
      &router,
      Some(&user_b_cookie),
      "{ error(name: ACTION_FORBIDDEN) { __typename } }",
      json!({}),
    )
    .await;
    assert_eq!(user_b_probe["errors"][0]["extensions"]["name"], "ACTION_FORBIDDEN");

    // 5. Revoking auth session invalidates active Bearer token immediately
    let exch_code2 = state
      .auth
      .issue_exchange_code(&admin_signin.user.id, None)
      .await
      .unwrap();
    let exchanged2 = state
      .auth
      .exchange_auth_session(&exch_code2, "inst-2", "macos", Some("TestMac2"), None)
      .await
      .unwrap();
    state
      .auth
      .revoke_auth_session(&exchanged2.session.id, Some(&admin_signin.user.id), "user_action")
      .await
      .unwrap();
    let (st, body) = send_json(
      &router,
      "GET",
      "/api/auth/session",
      &[("authorization", &format!("Bearer {}", exchanged2.access_token))],
      None,
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    assert_eq!(body["name"], "AUTH_SESSION_REVOKED");

    db.pool().close().await;
  });
}

#[derive(Default)]
struct RecordingEventBus {
  events: std::sync::Mutex<Vec<(String, Value)>>,
}

#[async_trait::async_trait]
impl server_domain::events::EventBusPublisher for RecordingEventBus {
  async fn publish_event(
    &self,
    event: &str,
    payload: Value,
    request_id: Option<&str>,
  ) -> Result<server_domain::events::EventBusEnvelopeV1, server_types::DomainError> {
    if let Ok(mut guard) = self.events.lock() {
      guard.push((event.to_owned(), payload.clone()));
    }
    Ok(server_domain::events::EventBusEnvelopeV1 {
      v: 1,
      id: format!("eb_{}", uuid::Uuid::new_v4()),
      event: event.to_owned(),
      origin_id: "test".to_owned(),
      origin_channel: "canary".to_owned(),
      request_id: request_id.map(str::to_owned),
      payload,
    })
  }
}

#[derive(Default)]
struct RecordingRateLimit {
  sources: std::sync::Mutex<Vec<(String, Option<server_spi::RequestSource>)>>,
}

#[async_trait::async_trait]
impl server_spi::RateLimitPolicy for RecordingRateLimit {
  async fn check_auth_mail(
    &self,
    _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    mail_name: &str,
    _recipient_email: &str,
    _recipient_user_id: Option<&str>,
    source: Option<&server_spi::RequestSource>,
    _now: chrono::DateTime<Utc>,
  ) -> Result<(), server_types::DomainError> {
    if let Ok(mut guard) = self.sources.lock() {
      guard.push((mail_name.to_owned(), source.cloned()));
    }
    Ok(())
  }

  async fn check_workspace_invite(
    &self,
    _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    _workspace_id: &str,
    _inviter_id: &str,
    _target_emails: &[&str],
    _source: Option<&server_spi::RequestSource>,
    _now: chrono::DateTime<Utc>,
  ) -> Result<(), server_spi::RateLimitRejection> {
    Ok(())
  }
}

struct RecordingExtension {
  base: CommunityExtension,
  rate_limit: Arc<RecordingRateLimit>,
}

impl server_spi::ServerExtension for RecordingExtension {
  fn edition_name(&self) -> &'static str {
    self.base.edition_name()
  }
  fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
    self.base.quota_gate()
  }
  fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
    self.base.session_policy()
  }
  fn rate_limit_policy(&self) -> Arc<dyn server_spi::RateLimitPolicy> {
    self.rate_limit.clone()
  }
  fn billing_spi(&self) -> Arc<dyn server_spi::BillingSpi> {
    self.base.billing_spi()
  }
  fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
    self.base.copilot_policy()
  }
  fn copilot_runtime(&self) -> Arc<dyn server_spi::CopilotRuntimeSpi> {
    self.base.copilot_runtime()
  }
}

async fn send_json_with_headers(
  router: &Router,
  method: &str,
  uri: &str,
  extra_headers: &[(&str, &str)],
  body: Option<Value>,
) -> (StatusCode, Value, axum::http::HeaderMap) {
  let mut req_builder = Request::builder().method(method).uri(uri);
  for &(k, v) in extra_headers {
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
  let hdrs = resp.headers().clone();
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
  let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
  (status, json, hdrs)
}

async fn gql_with_headers(
  router: &Router,
  extra_headers: &[(&str, &str)],
  query: &str,
  variables: Value,
) -> (StatusCode, Value) {
  send_json(
    router,
    "POST",
    "/graphql",
    extra_headers,
    Some(json!({ "query": query, "variables": variables })),
  )
  .await
}

#[test]
fn security_challenges_email_change_password_reset_keyring_and_throttle_adversarial() {
  let lease = lease_test_db();
  let db_url = lease.url().to_owned();
  run_async(async move {
    let db = connect_and_init_db(&db_url, 4).await;
    let event_bus = Arc::new(RecordingEventBus::default());
    let rate_limit = Arc::new(RecordingRateLimit::default());
    let extension: Arc<dyn server_spi::ServerExtension> = Arc::new(RecordingExtension {
      base: CommunityExtension::new(),
      rate_limit: Arc::clone(&rate_limit),
    });

    let cfg = RuntimeConfig {
      external_url: "http://localhost:3010".into(),
      ..RuntimeConfig::default()
    };
    let base_state = AppState::new(db.clone(), None, cfg.clone(), Arc::clone(&extension));
    let state = AppState::with_services(
      db.clone(),
      None,
      cfg,
      Arc::clone(&extension),
      server_http::AppServices {
        auth: base_state.auth.clone(),
        users: base_state.users.clone(),
        workspaces: base_state.workspaces.clone(),
        doc_sharing: base_state.doc_sharing.clone(),
        histories: base_state.histories.clone(),
        comments: base_state.comments.clone(),
        notifications: base_state.notifications.clone(),
        licenses: base_state.licenses.clone(),
        app_config: base_state.app_config.clone(),
        blobs: server_blob::BlobService::new(db.clone(), Arc::clone(&base_state.avatars), extension.quota_gate()),
        search: Arc::clone(&base_state.search),
        avatars: Arc::clone(&base_state.avatars),
        comment_attachments: Arc::clone(&base_state.comment_attachments),
        invalidation: Arc::clone(&base_state.invalidation),
        event_bus: event_bus.clone(),
      },
    );
    let router = build_router(Arc::clone(&state));

    // Disable strict throttle during setup, then explicitly test it at the end.
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at) VALUES
         ('throttle.enabled', 'false'::jsonb, clock_timestamp(), clock_timestamp()),
         ('auth.trustedCloudflareHeaders', 'true'::jsonb, clock_timestamp(), clock_timestamp())"#,
    )
    .execute(db.pool())
    .await
    .unwrap();
    state.app_config.invalidate_cache();

    let admin_signin = state
      .auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("Admin".into()),
        email: "admin-adv@example.test".into(),
        password: "Password123!".into(),
        client_version: None,
      })
      .await
      .unwrap();
    let admin_cookie = format!("affine_session={}", admin_signin.session_id);

    let alice_id = uuid::Uuid::new_v4().to_string();
    let bob_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO users (id, name, email, email_verified, registered, disabled, auth_epoch, created_at) VALUES
         ($1, 'Alice', 'alice@example.test', clock_timestamp(), true, false, 0, clock_timestamp()),
         ($2, 'Bob', 'bob@example.test', clock_timestamp(), true, false, 0, clock_timestamp())"#,
    )
    .bind(&alice_id)
    .bind(&bob_id)
    .execute(db.pool())
    .await
    .unwrap();
    let alice_session = state.auth.issue_cookie_session_for_user(&alice_id).await.unwrap();
    let alice_cookie = format!("affine_session={}", alice_session.session_id);
    let bob_session = state.auth.issue_cookie_session_for_user(&bob_id).await.unwrap();
    let bob_cookie = format!("affine_session={}", bob_session.session_id);

    // 1. Non-admin 403 on admin-only mutations
    for query in [
      format!("mutation {{ createChangePasswordUrl(callbackUrl: \"/reset\", userId: \"{alice_id}\") }}"),
      "mutation { rotateAuthSigningKey(expectedActiveKeyId: \"x\") { id } }".to_owned(),
      "mutation { deleteAuthSigningKey(id: \"x\") { id } }".to_owned(),
    ] {
      let (_, resp) = gql(&router, Some(&bob_cookie), &query, json!({})).await;
      assert_eq!(resp["errors"][0]["extensions"]["name"], "ACTION_FORBIDDEN");
    }

    // 2. All 5 mail mutations reject non-allowlisted callbackUrl with zero DB rows
    let before_mails: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM mail_deliveries")
      .fetch_one(db.pool())
      .await
      .unwrap();
    for query in [
      "mutation { sendVerifyEmail(callbackUrl: \"https://evil.example/cb\") }",
      "mutation { sendChangePasswordEmail(callbackUrl: \"https://evil.example/cb\") }",
      "mutation { sendSetPasswordEmail(callbackUrl: \"https://evil.example/cb\") }",
      "mutation { sendChangeEmail(callbackUrl: \"https://evil.example/cb\") }",
      "mutation { sendVerifyChangeEmail(callbackUrl: \"https://evil.example/cb\", email: \"new@example.test\", token: \"tok\") }",
    ] {
      let (_, resp) = gql(&router, Some(&alice_cookie), query, json!({})).await;
      assert!(!resp["errors"].is_null(), "expected reject for {query}");
    }
    let after_mails: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM mail_deliveries")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(before_mails, after_mails);

    // 3. Password reset full flow: trustedCloudflareHeaders + inner redirect_uri untouched + cross-user / epoch / replay / disabled / session revocation / realtime event
    let (_, resp) = gql_with_headers(
      &router,
      &[
        ("cookie", &alice_cookie),
        ("cf-connecting-ip", "203.0.113.7"),
        ("x-affine-cf-asn", "64512"),
      ],
      "mutation { sendChangePasswordEmail(callbackUrl: \"/reset?redirect_uri=%2Fsettings\") }",
      json!({}),
    )
    .await;
    assert_eq!(resp["data"]["sendChangePasswordEmail"], true, "resp: {resp}");
    {
      let sources = rate_limit.sources.lock().unwrap();
      let (_, src) = sources.last().unwrap();
      assert_eq!(src.as_ref().and_then(|s| s.ip.as_deref()), Some("203.0.113.7"));
      assert_eq!(src.as_ref().and_then(|s| s.asn), Some(64512));
    }
    let pw_mail: Value = sqlx::query_scalar(
      "SELECT payload FROM mail_deliveries WHERE mail_name = 'ChangePassword' AND recipient_user_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&alice_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    let pw_url_str = pw_mail["props"]["url"].as_str().unwrap();
    let pw_url = url::Url::parse(pw_url_str).unwrap();
    assert_eq!(
      pw_url
        .query_pairs()
        .find(|(k, _)| k == "redirect_uri")
        .map(|(_, v)| v.into_owned())
        .as_deref(),
      Some("/settings"),
      "inner redirect_uri must not be rewritten"
    );
    let pw_token1 = pw_url.query_pairs().find(|(k, _)| k == "token").unwrap().1.into_owned();

    // Issue a second password reset URL via admin to test auth_epoch invalidation
    let (_, url2_resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($uid: String!) { createChangePasswordUrl(callbackUrl: \"/reset\", userId: $uid) }",
      json!({ "uid": alice_id }),
    )
    .await;
    let pw_token2 = url::Url::parse(url2_resp["data"]["createChangePasswordUrl"].as_str().unwrap())
      .unwrap()
      .query_pairs()
      .find(|(k, _)| k == "token")
      .unwrap()
      .1
      .into_owned();

    // Issue a real Bearer token for Alice to verify revocation
    let alice_exch = state.auth.issue_exchange_code(&alice_id, None).await.unwrap();
    let alice_bearer = state
      .auth
      .exchange_auth_session(&alice_exch, "inst-alice", "macos", None, None)
      .await
      .unwrap()
      .access_token;

    // Cross-user token MUST fail
    let (_, resp) = gql(
      &router,
      None,
      "mutation($t: String!, $uid: String!) { changePassword(newPassword: \"NewPass1!\", token: $t, userId: $uid) }",
      json!({ "t": pw_token1, "uid": bob_id }),
    )
    .await;
    assert_eq!(resp["errors"][0]["extensions"]["name"], "INVALID_EMAIL_TOKEN");

    // Disabled user MUST fail
    sqlx::query("UPDATE users SET disabled = true WHERE id = $1")
      .bind(&alice_id)
      .execute(db.pool())
      .await
      .unwrap();
    let (_, resp) = gql(
      &router,
      None,
      "mutation($t: String!, $uid: String!) { changePassword(newPassword: \"NewPass1!\", token: $t, userId: $uid) }",
      json!({ "t": pw_token1, "uid": alice_id }),
    )
    .await;
    assert!(!resp["errors"].is_null());
    sqlx::query("UPDATE users SET disabled = false WHERE id = $1")
      .bind(&alice_id)
      .execute(db.pool())
      .await
      .unwrap();

    // Seed a workspace + root doc with logical->physical alias + doc_grants for Alice to verify alias fan-out
    let alias_ws_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workspaces (id, created_at) VALUES ($1, clock_timestamp())")
      .bind(&alias_ws_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle_activation'")
      .execute(db.pool())
      .await
      .unwrap();
    let root_doc = y_octo::Doc::default();
    let mut meta = root_doc.get_or_create_map("meta").unwrap();
    let mut pages = root_doc.create_array().unwrap();
    let mut page_entry = root_doc.create_map().unwrap();
    page_entry
      .insert("id".to_owned(), y_octo::Any::String("logical-doc-1".to_owned()))
      .unwrap();
    pages.push(page_entry).unwrap();
    meta.insert("pages".to_owned(), pages).unwrap();
    let mut spaces = root_doc.get_or_create_map("spaces").unwrap();
    let subdoc = y_octo::Doc::with_options(y_octo::DocOptions {
      guid: "physical-doc-1".to_owned(),
      ..Default::default()
    });
    spaces.insert("logical-doc-1".to_owned(), subdoc).unwrap();
    let root_bin = root_doc.encode_update_v1().unwrap();
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at) VALUES ($1, $1, $2, clock_timestamp(), clock_timestamp())",
    )
    .bind(&alias_ws_id)
    .bind(&root_bin)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by) VALUES ($1, 'physical-doc-1', 'user', $2, 'editor', $2)",
    )
    .bind(&alias_ws_id)
    .bind(&alice_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Valid changePassword succeeds (including 4,096 and 4,097-byte passwords with no artificial cap), revokes old Cookie + Bearer, emits user.profile.changed + doc.grants.changed for BOTH physical and logical alias rooms
    let pw_4096 = "a".repeat(4096);
    let (_, resp) = gql(
      &router,
      None,
      "mutation($p: String!, $t: String!, $uid: String!) { changePassword(newPassword: $p, token: $t, userId: $uid) }",
      json!({ "p": pw_4096, "t": pw_token1, "uid": alice_id }),
    )
    .await;
    assert_eq!(resp["data"]["changePassword"], true, "resp: {resp}");
    {
      let evs = event_bus.events.lock().unwrap();
      assert!(
        evs
          .iter()
          .any(|(ev, p)| ev == "realtime.topic.changed" && p["topic"] == "user.profile.changed"),
        "user.profile.changed must be published"
      );
      assert!(
        evs.iter().any(|(ev, p)| {
          ev == "realtime.topic.changed"
            && p["topic"] == "doc.grants.changed"
            && p["room"] == format!("workspace:{alias_ws_id}:doc:physical-doc-1:grants")
        }),
        "physical doc.grants.changed room must be published"
      );
      assert!(
        evs.iter().any(|(ev, p)| {
          ev == "realtime.topic.changed"
            && p["topic"] == "doc.grants.changed"
            && p["room"] == format!("workspace:{alias_ws_id}:doc:logical-doc-1:grants")
        }),
        "logical alias doc.grants.changed room must be published"
      );
    }

    // 4,097-byte password also succeeds and revokes sessions
    let (_, url_4097) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($uid: String!) { createChangePasswordUrl(callbackUrl: \"/reset\", userId: $uid) }",
      json!({ "uid": alice_id }),
    )
    .await;
    let tok_4097 = url::Url::parse(url_4097["data"]["createChangePasswordUrl"].as_str().unwrap())
      .unwrap()
      .query_pairs()
      .find(|(k, _)| k == "token")
      .unwrap()
      .1
      .into_owned();
    let alice_sess_before_4097 = state.auth.issue_cookie_session_for_user(&alice_id).await.unwrap();
    let (_, resp_4097) = gql(
      &router,
      None,
      "mutation($p: String!, $t: String!, $uid: String!) { changePassword(newPassword: $p, token: $t, userId: $uid) }",
      json!({ "p": "b".repeat(4097), "t": tok_4097, "uid": alice_id }),
    )
    .await;
    assert_eq!(
      resp_4097["data"]["changePassword"], true,
      "4097-byte pw failed: {resp_4097}"
    );
    let (_, sess_after_4097) = send_json(
      &router,
      "GET",
      "/api/auth/session",
      &[(
        "cookie",
        &format!("affine_session={}", alice_sess_before_4097.session_id),
      )],
      None,
    )
    .await;
    assert!(sess_after_4097["user"].is_null());

    // Replay & auth_epoch-invalidated second token both fail
    for tok in [&pw_token1, &pw_token2] {
      let (_, resp) = gql(
        &router,
        None,
        "mutation($t: String!, $uid: String!) { changePassword(newPassword: \"Other1!\", token: $t, userId: $uid) }",
        json!({ "t": tok, "uid": alice_id }),
      )
      .await;
      assert_eq!(resp["errors"][0]["extensions"]["name"], "INVALID_EMAIL_TOKEN");
    }

    // Old Cookie and Bearer are both invalidated on real HTTP requests
    let (_, cookie_sess) = send_json(&router, "GET", "/api/auth/session", &[("cookie", &alice_cookie)], None).await;
    assert!(cookie_sess["user"].is_null());
    let (st_bearer, _) = send_json(
      &router,
      "GET",
      "/api/auth/session",
      &[("authorization", &format!("Bearer {alice_bearer}"))],
      None,
    )
    .await;
    assert_eq!(st_bearer, StatusCode::UNAUTHORIZED);

    // 4. Email change full flow: forged token + taken email -> INVALID_EMAIL_TOKEN; valid token + taken email -> EMAIL_ALREADY_USED; %2B/%40 decode + returns original user view + revokes sessions
    let alice_session2 = state.auth.issue_cookie_session_for_user(&alice_id).await.unwrap();
    let alice_cookie2 = format!("affine_session={}", alice_session2.session_id);

    // Forged token + Bob's taken email MUST return INVALID_EMAIL_TOKEN (no enumeration oracle)
    let (_, resp) = gql(
      &router,
      Some(&alice_cookie2),
      "mutation { sendVerifyChangeEmail(callbackUrl: \"/verify\", email: \"bob@example.test\", token: \"forged\") }",
      json!({}),
    )
    .await;
    assert_eq!(resp["errors"][0]["extensions"]["name"], "INVALID_EMAIL_TOKEN");
    let (_, resp) = gql(
      &router,
      Some(&alice_cookie2),
      "mutation { changeEmail(email: \"bob%40example.test\", token: \"forged\") { id email } }",
      json!({}),
    )
    .await;
    assert_eq!(resp["errors"][0]["extensions"]["name"], "INVALID_EMAIL_TOKEN");

    // Start real changeEmail challenge
    let (_, resp) = gql(
      &router,
      Some(&alice_cookie2),
      "mutation { sendChangeEmail(callbackUrl: \"/change-email\") }",
      json!({}),
    )
    .await;
    assert_eq!(resp["data"]["sendChangeEmail"], true);
    let ce_mail: Value = sqlx::query_scalar(
      "SELECT payload FROM mail_deliveries WHERE mail_name = 'ChangeEmail' AND recipient_user_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&alice_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    let ce_token = url::Url::parse(ce_mail["props"]["url"].as_str().unwrap())
      .unwrap()
      .query_pairs()
      .find(|(k, _)| k == "token")
      .unwrap()
      .1
      .into_owned();

    // Valid token + taken email -> EMAIL_ALREADY_USED (tx rolls back, token remains valid!)
    let (_, resp) = gql(
      &router,
      Some(&alice_cookie2),
      "mutation($t: String!) { sendVerifyChangeEmail(callbackUrl: \"/verify\", email: \"bob@example.test\", token: $t) }",
      json!({ "t": ce_token }),
    )
    .await;
    assert_eq!(resp["errors"][0]["extensions"]["name"], "EMAIL_ALREADY_USED");

    // Valid token + fresh email with '+' -> succeeds
    let (_, resp) = gql(
      &router,
      Some(&alice_cookie2),
      "mutation($t: String!) { sendVerifyChangeEmail(callbackUrl: \"/verify\", email: \"alice+tag@example.test\", token: $t) }",
      json!({ "t": ce_token }),
    )
    .await;
    assert_eq!(resp["data"]["sendVerifyChangeEmail"], true, "resp: {resp}");
    let vce_mail: Value = sqlx::query_scalar(
      "SELECT payload FROM mail_deliveries WHERE mail_name = 'VerifyChangeEmail' AND recipient_user_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&alice_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    let vce_token = url::Url::parse(vce_mail["props"]["url"].as_str().unwrap())
      .unwrap()
      .query_pairs()
      .find(|(k, _)| k == "token")
      .unwrap()
      .1
      .into_owned();

    // Tampered email rejected
    let (_, resp) = gql(
      &router,
      Some(&alice_cookie2),
      "mutation($t: String!) { changeEmail(email: \"other%40example.test\", token: $t) { id email } }",
      json!({ "t": vce_token }),
    )
    .await;
    assert_eq!(resp["errors"][0]["extensions"]["name"], "INVALID_EMAIL_TOKEN");

    // Encoded %2B / %40 email succeeds, returns ORIGINAL request user email, updates DB, revokes old session
    let (_, resp) = gql(
      &router,
      Some(&alice_cookie2),
      "mutation($t: String!) { changeEmail(email: \"alice%2Btag%40example.test\", token: $t) { id email } }",
      json!({ "t": vce_token }),
    )
    .await;
    assert_eq!(
      resp["data"]["changeEmail"]["email"], "alice@example.test",
      "resp: {resp}"
    );
    let db_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
      .bind(&alice_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(db_email, "alice+tag@example.test");
    let (_, old_sess) = send_json(&router, "GET", "/api/auth/session", &[("cookie", &alice_cookie2)], None).await;
    assert!(old_sess["user"].is_null());

    // 5. Keyring: strict now == verifyUntil delete boundary, parent auth.token TTL inheritance, increasing TTL does not lock out historical retiring keys, CAS error prefix
    let now_eq = Utc::now();
    assert!(!server_domain::auth::keyring::signing_key_can_delete(
      "retiring",
      Some(now_eq),
      now_eq
    ));
    assert!(server_domain::auth::keyring::signing_key_can_delete(
      "retiring",
      Some(now_eq - chrono::Duration::milliseconds(1)),
      now_eq
    ));

    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('auth.token', '{\"accessTokenTtl\": 300}'::jsonb, clock_timestamp(), clock_timestamp())",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let (_, keys_resp) = gql(
      &router,
      Some(&admin_cookie),
      "{ authSigningKeys { id status } }",
      json!({}),
    )
    .await;
    let active_id = keys_resp["data"]["authSigningKeys"][0]["id"]
      .as_str()
      .unwrap()
      .to_owned();
    let (_, rot_resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($k: String!) { rotateAuthSigningKey(expectedActiveKeyId: $k) { id status retiredAt verifyUntil } }",
      json!({ "k": active_id }),
    )
    .await;
    assert!(rot_resp["errors"].is_null(), "rotate failed: {rot_resp}");
    let retired = rot_resp["data"]["rotateAuthSigningKey"]
      .as_array()
      .unwrap()
      .iter()
      .find(|k| k["id"] == active_id)
      .unwrap();
    let retired_at = chrono::DateTime::parse_from_rfc3339(retired["retiredAt"].as_str().unwrap()).unwrap();
    let verify_until = chrono::DateTime::parse_from_rfc3339(retired["verifyUntil"].as_str().unwrap()).unwrap();
    assert_eq!((verify_until - retired_at).num_seconds(), 330);

    let new_active_id = rot_resp["data"]["rotateAuthSigningKey"]
      .as_array()
      .unwrap()
      .iter()
      .find(|k| k["status"] == "active")
      .unwrap()["id"]
      .as_str()
      .unwrap()
      .to_owned();
    // Named EventBus event `auth.signing_key.rotated` emitted on success
    {
      let evs = event_bus.events.lock().unwrap();
      let rotated_evs: Vec<_> = evs.iter().filter(|(ev, _)| ev == "auth.signing_key.rotated").collect();
      assert_eq!(rotated_evs.len(), 1);
      assert_eq!(rotated_evs[0].1["actorId"], admin_signin.user.id);
      assert_eq!(rotated_evs[0].1["previousKeyId"], active_id);
      assert_eq!(rotated_evs[0].1["activeKeyId"], new_active_id);
    }

    // CAS mismatch error message must include v0.27.5 prefix AND must NOT emit `auth.signing_key.rotated`
    let (_, cas_resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($k: String!) { rotateAuthSigningKey(expectedActiveKeyId: $k) { id } }",
      json!({ "k": active_id }),
    )
    .await;
    assert_eq!(
      cas_resp["errors"][0]["extensions"]["message"],
      "Invalid app config input: The active signing key changed. Reload and try again."
    );
    assert_eq!(
      event_bus
        .events
        .lock()
        .unwrap()
        .iter()
        .filter(|(ev, _)| ev == "auth.signing_key.rotated")
        .count(),
      1,
      "CAS conflict must not emit auth.signing_key.rotated"
    );

    // Failed delete (still within verifyUntil) must NOT emit `auth.signing_key.deleted`
    let (_, del_fail_resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($id: String!) { deleteAuthSigningKey(id: $id) { id } }",
      json!({ "id": active_id }),
    )
    .await;
    assert!(!del_fail_resp["errors"].is_null());
    assert_eq!(
      event_bus
        .events
        .lock()
        .unwrap()
        .iter()
        .filter(|(ev, _)| ev == "auth.signing_key.deleted")
        .count(),
      0,
      "failed delete must not emit auth.signing_key.deleted"
    );

    // Backdate retired key verifyUntil to the past and delete -> emits `auth.signing_key.deleted`
    let mut cfg_val: Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = 'auth.session.signingKeys'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    for entry in cfg_val.as_array_mut().unwrap() {
      if entry["id"] == active_id {
        entry["retiredAt"] = json!("2020-01-01T00:00:00Z");
        entry["verifyUntil"] = json!("2020-01-01T00:10:00Z");
      }
    }
    sqlx::query("UPDATE app_configs SET value = $1 WHERE id = 'auth.session.signingKeys'")
      .bind(&cfg_val)
      .execute(db.pool())
      .await
      .unwrap();
    let (_, del_ok_resp) = gql(
      &router,
      Some(&admin_cookie),
      "mutation($id: String!) { deleteAuthSigningKey(id: $id) { id } }",
      json!({ "id": active_id }),
    )
    .await;
    assert!(del_ok_resp["errors"].is_null(), "delete failed: {del_ok_resp}");
    {
      let evs = event_bus.events.lock().unwrap();
      let del_evs: Vec<_> = evs.iter().filter(|(ev, _)| ev == "auth.signing_key.deleted").collect();
      assert_eq!(del_evs.len(), 1);
      assert_eq!(del_evs[0].1["actorId"], admin_signin.user.id);
      assert_eq!(del_evs[0].1["keyId"], active_id);
    }

    // Increasing accessTokenTtl to 3600 MUST NOT lock out listing or rotating historical 330s retiring key
    sqlx::query("UPDATE app_configs SET value = '{\"accessTokenTtl\": 3600}'::jsonb WHERE id = 'auth.token'")
      .execute(db.pool())
      .await
      .unwrap();
    let (_, list_after_ttl_bump) = gql(
      &router,
      Some(&admin_cookie),
      "{ authSigningKeys { id status } }",
      json!({}),
    )
    .await;
    assert!(
      list_after_ttl_bump["errors"].is_null(),
      "TTL bump locked out keyring: {list_after_ttl_bump}"
    );

    // 6. AuthSigningKeyResolver is NOT strict-throttled; AuthResolver/UserType.token IS strict-throttled with outer HTTP headers; currentUser is exempt
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at) VALUES
         ('throttle.throttlers.strict.limit', '2'::jsonb, clock_timestamp(), clock_timestamp()),
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

    // Logged-in admin calling authSigningKeys 4 times succeeds with NO rate-limit headers
    for _ in 0..4 {
      let (st, ok_resp, hdrs) = send_json_with_headers(
        &router,
        "POST",
        "/graphql",
        &[("cookie", &admin_cookie)],
        Some(json!({ "query": "{ authSigningKeys { id } }" })),
      )
      .await;
      assert_eq!(st, StatusCode::OK);
      assert!(
        ok_resp["errors"].is_null(),
        "authSigningKeys must not be strict-throttled: {ok_resp}"
      );
      assert!(hdrs.get("x-ratelimit-limit").is_none());
      assert!(hdrs.get(header::RETRY_AFTER).is_none());
    }

    // Strict-throttled field (UserType.token) emits x-ratelimit-* on allowed responses, accumulates BOTH x-ratelimit-*
    // and Retry-After across multi-alias fields crossing the limit, and emits ONLY Retry-After on single-field 429
    let (st, ok_resp, hdrs) = send_json_with_headers(
      &router,
      "POST",
      "/graphql",
      &[("cookie", &admin_cookie)],
      Some(json!({ "query": "{ currentUser { token { sessionToken } } }" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert!(ok_resp["errors"].is_null(), "token failed: {ok_resp}");
    assert_eq!(hdrs.get("x-ratelimit-limit").unwrap(), "2");
    assert_eq!(hdrs.get("x-ratelimit-remaining").unwrap(), "1");
    assert!(hdrs.get("x-ratelimit-reset").is_some());
    assert!(hdrs.get(header::RETRY_AFTER).is_none());

    // Multi-alias crossing the boundary: t1 allowed (remaining=0), t2 limited -> outer HTTP carries BOTH
    let (st, multi_resp, multi_hdrs) = send_json_with_headers(
      &router,
      "POST",
      "/graphql",
      &[("cookie", &admin_cookie)],
      Some(json!({ "query": "{ currentUser { t1: token { sessionToken } t2: token { sessionToken } } }" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(multi_resp["errors"][0]["extensions"]["name"], "TOO_MANY_REQUEST");
    assert_eq!(multi_resp["errors"][0]["extensions"]["type"], "TOO_MANY_REQUESTS");
    assert_eq!(multi_hdrs.get("x-ratelimit-limit").unwrap(), "2");
    assert_eq!(multi_hdrs.get("x-ratelimit-remaining").unwrap(), "0");
    assert!(multi_hdrs.get("x-ratelimit-reset").is_some());
    assert!(multi_hdrs.get(header::RETRY_AFTER).is_some());

    // Single-field 429 carries ONLY Retry-After (no x-ratelimit-*)
    let (_, limited_resp, limited_hdrs) = send_json_with_headers(
      &router,
      "POST",
      "/graphql",
      &[("cookie", &admin_cookie)],
      Some(json!({ "query": "{ currentUser { token { sessionToken } } }" })),
    )
    .await;
    assert_eq!(limited_resp["errors"][0]["extensions"]["name"], "TOO_MANY_REQUEST");
    assert_eq!(limited_resp["errors"][0]["extensions"]["type"], "TOO_MANY_REQUESTS");
    assert_eq!(limited_resp["errors"][0]["extensions"]["status"], 429);
    assert!(limited_hdrs.get(header::RETRY_AFTER).is_some());
    assert!(limited_hdrs.get("x-ratelimit-limit").is_none());
    assert!(limited_hdrs.get("x-ratelimit-remaining").is_none());
    assert!(limited_hdrs.get("x-ratelimit-reset").is_none());

    // Query.error is NOT strict-throttled: even with strict quota exhausted, returns 403 ACTION_FORBIDDEN with no rate-limit headers
    let (_, err_probe_resp, err_probe_hdrs) = send_json_with_headers(
      &router,
      "POST",
      "/graphql",
      &[("cookie", &admin_cookie)],
      Some(json!({ "query": "{ error(name: ACTION_FORBIDDEN) { __typename } }" })),
    )
    .await;
    assert_eq!(err_probe_resp["errors"][0]["extensions"]["name"], "ACTION_FORBIDDEN");
    assert_eq!(err_probe_resp["errors"][0]["extensions"]["status"], 403);
    assert!(err_probe_hdrs.get("x-ratelimit-limit").is_none());
    assert!(err_probe_hdrs.get(header::RETRY_AFTER).is_none());

    // currentUser remains exempt from strict throttle and has no rate-limit headers
    let (_, cu_resp, cu_hdrs) = send_json_with_headers(
      &router,
      "POST",
      "/graphql",
      &[("cookie", &admin_cookie)],
      Some(json!({ "query": "{ currentUser { id } }" })),
    )
    .await;
    assert!(cu_resp["errors"].is_null(), "currentUser must be exempt: {cu_resp}");
    assert!(cu_hdrs.get("x-ratelimit-limit").is_none());
    assert!(cu_hdrs.get(header::RETRY_AFTER).is_none());

    // Anonymous non-@Public() mutations (sendVerifyEmail, createChangePasswordUrl) hit AuthGuard (401) BEFORE strict
    // throttle: no rate-limit headers and no bucket consumption, both with remaining quota and after quota exhaustion
    let anon_ip = [("x-real-ip", "198.51.100.88")];
    for q in [
      r#"mutation { sendVerifyEmail(callbackUrl: "/ok") }"#,
      r#"mutation { createChangePasswordUrl(callbackUrl: "/ok", userId: "u1") }"#,
    ] {
      let (st, resp, hdrs) =
        send_json_with_headers(&router, "POST", "/graphql", &anon_ip, Some(json!({ "query": q }))).await;
      assert_eq!(st, StatusCode::OK);
      assert_eq!(resp["errors"][0]["extensions"]["name"], "AUTHENTICATION_REQUIRED");
      assert_eq!(resp["errors"][0]["extensions"]["status"], 401);
      assert!(hdrs.get("x-ratelimit-limit").is_none());
      assert!(hdrs.get(header::RETRY_AFTER).is_none());
    }
    // @Public() changePassword on the same IP still sees full remaining=1 (limit=2), proving anonymous 401s did not consume quota
    for expected_rem in ["1", "0"] {
      let (_, _, hdrs) = send_json_with_headers(
        &router,
        "POST",
        "/graphql",
        &anon_ip,
        Some(json!({ "query": r#"mutation { changePassword(newPassword: "x", token: "t") }"# })),
      )
      .await;
      assert_eq!(hdrs.get("x-ratelimit-limit").unwrap(), "2");
      assert_eq!(hdrs.get("x-ratelimit-remaining").unwrap(), expected_rem);
    }
    // Exhausted anonymous IP bucket: @Public() changePassword gets 429, while non-@Public() still gets 401 with no throttle headers
    let (_, lim_cp, lim_cp_hdrs) = send_json_with_headers(
      &router,
      "POST",
      "/graphql",
      &anon_ip,
      Some(json!({ "query": r#"mutation { changePassword(newPassword: "x", token: "t") }"# })),
    )
    .await;
    assert_eq!(lim_cp["errors"][0]["extensions"]["name"], "TOO_MANY_REQUEST");
    assert!(lim_cp_hdrs.get(header::RETRY_AFTER).is_some());
    for q in [
      r#"mutation { sendVerifyEmail(callbackUrl: "/ok") }"#,
      r#"mutation { createChangePasswordUrl(callbackUrl: "/ok", userId: "u1") }"#,
    ] {
      let (_, resp, hdrs) =
        send_json_with_headers(&router, "POST", "/graphql", &anon_ip, Some(json!({ "query": q }))).await;
      assert_eq!(resp["errors"][0]["extensions"]["name"], "AUTHENTICATION_REQUIRED");
      assert_eq!(resp["errors"][0]["extensions"]["status"], 401);
      assert!(hdrs.get("x-ratelimit-limit").is_none());
      assert!(hdrs.get(header::RETRY_AFTER).is_none());
    }

    db.pool().close().await;
  });
}
