//! Integration tests for admin panel queries/mutations, user management,
//! `banUser` recreate semantics, `importUsers`, `validateAppConfig` dry-run
//! and secret redaction, `workspaceRolePermissions`, `DocType.{analytics,lastAccessedMembers}`,
//! and workspace invitation notifications.

use std::sync::Arc;

use axum::body::Body;
use http::{Request, StatusCode, header};
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_domain::users::ADMIN_FEATURE_NAME;
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
    .expect("reset schema");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

async fn post_graphql(app: &axum::Router, cookie: Option<&str>, query: &str, variables: Value) -> (StatusCode, Value) {
  let mut builder = Request::builder()
    .method("POST")
    .uri("/graphql")
    .header(header::CONTENT_TYPE, "application/json");
  if let Some(c) = cookie {
    builder = builder.header(header::COOKIE, c);
  }
  let body = json!({ "query": query, "variables": variables }).to_string();
  let resp = app
    .clone()
    .oneshot(builder.body(Body::from(body)).unwrap())
    .await
    .expect("graphql response");
  let status = resp.status();
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
  (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn seed_user_with_cookie(db: &ServerDb, email: &str, name: &str, is_admin: bool) -> (String, String) {
  let user_id = uuid::Uuid::new_v4().to_string();
  let session_id = uuid::Uuid::new_v4().to_string();
  let user_session_id = uuid::Uuid::new_v4().to_string();
  sqlx::query("INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, $2, $3, true, false)")
    .bind(&user_id)
    .bind(name)
    .bind(email)
    .execute(db.pool())
    .await
    .expect("insert user");
  if is_admin {
    sqlx::query("INSERT INTO user_features (user_id, name, type, reason, activated) VALUES ($1, $2, 0, 'test', true)")
      .bind(&user_id)
      .bind(ADMIN_FEATURE_NAME)
      .execute(db.pool())
      .await
      .expect("grant admin feature");
  }
  sqlx::query("INSERT INTO multiple_users_sessions (id) VALUES ($1)")
    .bind(&session_id)
    .execute(db.pool())
    .await
    .expect("insert multi session");
  sqlx::query(
    "INSERT INTO user_sessions (id, session_id, user_id, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
  )
  .bind(&user_session_id)
  .bind(&session_id)
  .bind(&user_id)
  .execute(db.pool())
  .await
  .expect("insert user session");
  let cookie = format!("affine_session={session_id}; affine_user_id={user_id}");
  (user_id, cookie)
}

#[test]
fn non_admin_rejected_on_all_admin_queries_and_mutations() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        app_config_baseline: server_domain::app_config::RuntimeAppConfigBaseline {
          file_json: json!({ "flags": { "allowGuestDemoWorkspace": true } }),
          redis_url_env_set: true,
          redis_url_has_password: false,
          ..Default::default()
        },
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(state);

    let (_user_id, user_cookie) = seed_user_with_cookie(&db, "member@affine.test", "Member", false).await;

    let admin_ops = [
      r#"{ users(filter: { first: 10, skip: 0 }) { id } }"#,
      r#"{ usersCount }"#,
      r#"{ userById(id: "u1") { id } }"#,
      r#"{ userByEmail(email: "member@affine.test") { id } }"#,
      r#"{ adminWorkspaces(filter: { first: 10, skip: 0 }) { id } }"#,
      r#"{ adminWorkspacesCount(filter: { first: 10, skip: 0 }) }"#,
      r#"{ adminWorkspace(id: "ws1") { id } }"#,
      r#"{ adminDashboard { syncActiveUsers } }"#,
      r#"{ adminAllSharedLinks(pagination: { first: 10 }) { edges { cursor } } }"#,
      r#"{ adminMailDeliveries { summary { total } } }"#,
      r#"{ appConfig }"#,
      r#"{ appConfigMetadata }"#,
      r#"{ validateAppConfig(updates: [{ module: "flags", key: "allowGuestDemoWorkspace", value: false }]) { valid } }"#,
      r#"mutation { createUser(input: { email: "new@affine.test" }) { id } }"#,
      r#"mutation { updateUser(id: "u1", input: { name: "X" }) { id } }"#,
      r#"mutation { banUser(id: "u1") { id } }"#,
      r#"mutation { enableUser(id: "u1") { id } }"#,
      r#"mutation { updateUserFeatures(id: "u1", features: [Admin]) }"#,
      r#"mutation { importUsers(input: { users: [{ email: "imp@affine.test" }] }) { __typename } }"#,
      r#"mutation { adminUpdateWorkspace(input: { id: "ws1", enableAi: false }) { id } }"#,
      r#"mutation { updateAppConfig(updates: [{ module: "flags", key: "allowGuestDemoWorkspace", value: false }]) }"#,
    ];

    for op in admin_ops {
      let (status, body) = post_graphql(&app, Some(&user_cookie), op, json!({})).await;
      assert_eq!(status, StatusCode::OK, "op: {op}");
      let errors = body["errors"].as_array().expect("must return graphql error");
      assert!(!errors.is_empty(), "expected 403 error for op: {op}");
      assert_eq!(
        errors[0]["extensions"]["status"], 403,
        "expected 403 Forbidden for non-admin op {op}, got: {body}"
      );
    }

    db.pool().close().await;
  });
}

#[test]
fn admin_user_lifecycle_ban_recreate_import_and_features() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        app_config_baseline: server_domain::app_config::RuntimeAppConfigBaseline {
          file_json: json!({ "flags": { "allowGuestDemoWorkspace": true } }),
          redis_url_env_set: true,
          redis_url_has_password: false,
          ..Default::default()
        },
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(Arc::clone(&state));

    let (_admin_id, admin_cookie) = seed_user_with_cookie(&db, "admin@affine.test", "Admin", true).await;
    let (victim_id, victim_cookie) = seed_user_with_cookie(&db, "victim@affine.test", "Victim", false).await;

    // Victim owns a personal workspace with a doc snapshot.
    let ws = state
      .workspaces
      .create_workspace(&victim_id, Some("Victim Personal WS"))
      .await
      .expect("create personal workspace");
    sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, now())")
      .bind(&ws.id)
      .bind("doc-personal-1")
      .bind(vec![1_u8, 2, 3])
      .execute(db.pool())
      .await
      .expect("insert snapshot");

    // 1. Duplicate createUser email returns EMAIL_ALREADY_USED (400 / RESOURCE_ALREADY_EXISTS).
    let (_, dup_create) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation { createUser(input: { email: "victim@affine.test" }) { id } }"#,
      json!({}),
    )
    .await;
    assert_eq!(dup_create["errors"][0]["extensions"]["status"], 400);
    assert_eq!(dup_create["errors"][0]["extensions"]["type"], "RESOURCE_ALREADY_EXISTS");
    assert_eq!(dup_create["errors"][0]["extensions"]["name"], "EMAIL_ALREADY_USED");
    assert_eq!(
      dup_create["errors"][0]["extensions"]["message"],
      "This email has already been registered."
    );

    // 2. Admin bans victim -> old ID gone, owned workspace/docs cleaned, new disabled user has fresh UUID + same email + NULL avatar.
    let (_, ban_resp) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { banUser(id: $id) { id email disabled name avatarUrl } }"#,
      json!({ "id": victim_id }),
    )
    .await;
    assert!(ban_resp["errors"].is_null(), "banUser errors: {ban_resp}");
    let new_id = ban_resp["data"]["banUser"]["id"].as_str().unwrap().to_owned();
    assert_ne!(new_id, victim_id, "banUser must assign a brand new UUID");
    assert_eq!(ban_resp["data"]["banUser"]["email"], "victim@affine.test");
    assert_eq!(ban_resp["data"]["banUser"]["disabled"], true);
    assert!(ban_resp["data"]["banUser"]["avatarUrl"].is_null());

    // Old user ID no longer exists (non-null GraphQL error, not a business 404).
    let (_, old_lookup) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"query ($id: String!) { userById(id: $id) { id } }"#,
      json!({ "id": victim_id }),
    )
    .await;
    assert!(!old_lookup["errors"].as_array().unwrap().is_empty());
    assert!(old_lookup["errors"][0]["extensions"]["status"].is_null());

    // Owned workspace and snapshot were deleted.
    let ws_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
      .bind(&ws.id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert!(!ws_exists, "owned personal workspace must be deleted on banUser");

    // Victim's old session cookie is immediately invalidated.
    let (_, victim_me) = post_graphql(&app, Some(&victim_cookie), "{ currentUser { id } }", json!({})).await;
    assert!(
      victim_me["data"]["currentUser"].is_null(),
      "old session cookie must be invalidated after banUser: {victim_me}"
    );

    // 3. Re-enable banned tombstone user.
    let (_, enable_resp) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { enableUser(id: $id) { id disabled } }"#,
      json!({ "id": new_id }),
    )
    .await;
    assert!(enable_resp["errors"].is_null(), "enableUser errors: {enable_resp}");
    assert_eq!(enable_resp["data"]["enableUser"]["disabled"], false);

    // 4. importUsers mixed batch: valid + duplicate + invalid email.
    let (_, imp_resp) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation {
        importUsers(input: { users: [
          { email: "fresh1@affine.test", name: "Fresh One" },
          { email: "not-an-email" },
          { email: "FRESH1@affine.test", name: "Duplicate" },
          { email: "fresh2@affine.test", name: "Fresh Two" }
        ] }) {
          __typename
          ... on UserType { id email name }
          ... on UserImportFailedType { email error }
        }
      }"#,
      json!({}),
    )
    .await;
    assert!(imp_resp["errors"].is_null(), "importUsers errors: {imp_resp}");
    let items = imp_resp["data"]["importUsers"].as_array().unwrap();
    assert_eq!(items.len(), 4);
    assert_eq!(items[0]["__typename"], "UserType");
    assert_eq!(items[0]["email"], "fresh1@affine.test");
    assert_eq!(items[1]["__typename"], "UserImportFailedType");
    assert_eq!(items[1]["email"], "not-an-email");
    assert_eq!(items[2]["__typename"], "UserImportFailedType");
    assert_eq!(items[2]["email"], "FRESH1@affine.test");
    assert_eq!(items[2]["error"], "This email has already been registered.");
    assert_eq!(items[3]["__typename"], "UserType");
    assert_eq!(items[3]["email"], "fresh2@affine.test");

    // 5. Grant & revoke Admin feature via updateUserFeatures.
    let fresh1_id = items[0]["id"].as_str().unwrap();
    let (_, feat_on) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { updateUserFeatures(id: $id, features: [Admin]) }"#,
      json!({ "id": fresh1_id }),
    )
    .await;
    assert_eq!(feat_on["data"]["updateUserFeatures"], json!(["Admin"]));

    let (_, feat_off) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { updateUserFeatures(id: $id, features: []) }"#,
      json!({ "id": fresh1_id }),
    )
    .await;
    assert_eq!(feat_off["data"]["updateUserFeatures"], json!([]));

    // 6. Admin updateUser email change (normal + case-only) revokes both Cookie and Bearer/refresh sessions.
    let (case_uid, case_cookie) = seed_user_with_cookie(&db, "Alice@Example.com", "Alice", false).await;
    let user_sess_id: String = sqlx::query_scalar("SELECT id FROM user_sessions WHERE user_id = $1 LIMIT 1")
      .bind(&case_uid)
      .fetch_one(db.pool())
      .await
      .unwrap();
    let auth_sess_id = format!("as_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
      r#"INSERT INTO auth_sessions (id, user_session_id, installation_id, platform, idle_expires_at, absolute_expires_at)
         VALUES ($1, $2, 'inst1', 'desktop', now() + interval '1 day', now() + interval '7 days')"#,
    )
    .bind(&auth_sess_id)
    .bind(&user_sess_id)
    .execute(db.pool())
    .await
    .unwrap();
    let rt_id = format!("rt_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
      r#"INSERT INTO auth_refresh_tokens
           (id, auth_session_id, generation, secret_hash, created_at, expires_at, successor_ciphertext, successor_expires_at)
         VALUES ($1, $2, 1, 'hash1', now(), now() + interval '1 day', 'cipher', now() + interval '1 minute')"#,
    )
    .bind(&rt_id)
    .bind(&auth_sess_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Case-only change Alice@Example.com -> alice@example.com must normalize, verify email, and revoke sessions.
    let (_, case_upd) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { updateUser(id: $id, input: { email: "alice@example.com" }) { id email emailVerified } }"#,
      json!({ "id": case_uid }),
    )
    .await;
    assert!(case_upd["errors"].is_null(), "case updateUser errors: {case_upd}");
    assert_eq!(case_upd["data"]["updateUser"]["email"], "alice@example.com");
    assert_eq!(case_upd["data"]["updateUser"]["emailVerified"], true);
    let (_, old_cookie_me) = post_graphql(&app, Some(&case_cookie), "{ currentUser { id } }", json!({})).await;
    assert!(old_cookie_me["data"]["currentUser"].is_null());
    let active_auth_sessions: i64 =
      sqlx::query_scalar("SELECT COUNT(*)::bigint FROM auth_sessions WHERE id = $1 AND revoked_at IS NULL")
        .bind(&auth_sess_id)
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(active_auth_sessions, 0, "Bearer auth_session must be revoked/removed");
    let active_refresh_tokens: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM auth_refresh_tokens WHERE id = $1 AND (revoked_at IS NULL OR successor_ciphertext IS NOT NULL)",
    )
    .bind(&rt_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(
      active_refresh_tokens, 0,
      "refresh token and successor must be invalidated"
    );

    // Normal email change also revokes newly created cookie session.
    let (_, norm_upd) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { updateUser(id: $id, input: { email: "alice-renamed@example.com" }) { id email emailVerified } }"#,
      json!({ "id": case_uid }),
    )
    .await;
    assert!(norm_upd["errors"].is_null(), "normal updateUser errors: {norm_upd}");
    assert_eq!(norm_upd["data"]["updateUser"]["email"], "alice-renamed@example.com");

    // 7. users / usersCount pagination (first = 0, first = 101) and activated+expired_at feature filter parity.
    let (_, zero_users) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"{ users(filter: { first: 0 }) { id } }"#,
      json!({}),
    )
    .await;
    assert_eq!(zero_users["data"]["users"].as_array().unwrap().len(), 0);
    let (_, big_users) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"{ users(filter: { first: 101 }) { id } }"#,
      json!({}),
    )
    .await;
    assert!(big_users["errors"].is_null());
    sqlx::query(
      "INSERT INTO user_features (user_id, name, type, reason, activated, expired_at)
       VALUES ($1, 'administrator', 0, 'test', true, now() - interval '1 day')",
    )
    .bind(&case_uid)
    .execute(db.pool())
    .await
    .unwrap();
    let (_, feat_parity) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"{
        users(filter: { features: [Admin], first: 50 }) { id }
        usersCount(filter: { features: [Admin] })
      }"#,
      json!({}),
    )
    .await;
    let matched_ids: Vec<&str> = feat_parity["data"]["users"]
      .as_array()
      .unwrap()
      .iter()
      .filter_map(|u| u["id"].as_str())
      .collect();
    assert!(matched_ids.contains(&case_uid.as_str()));
    assert_eq!(
      feat_parity["data"]["usersCount"].as_u64().unwrap() as usize,
      matched_ids.len()
    );
    // id keyword matching is case-sensitive (u.id LIKE $1), whereas email is case-insensitive.
    let upper_id = case_uid.to_ascii_uppercase();
    if upper_id != case_uid {
      let (_, case_id_resp) = post_graphql(
        &app,
        Some(&admin_cookie),
        r#"query ($kw: String!) {
          users(filter: { keyword: $kw, first: 10 }) { id }
          usersCount(filter: { keyword: $kw })
        }"#,
        json!({ "kw": upper_id }),
      )
      .await;
      assert_eq!(case_id_resp["data"]["users"].as_array().unwrap().len(), 0);
      assert_eq!(case_id_resp["data"]["usersCount"], 0);
    }

    db.pool().close().await;
  });
}

#[test]
fn validate_app_config_is_dry_run_redacts_secrets_and_blocks_indexer_env_keys() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        app_config_baseline: server_domain::app_config::RuntimeAppConfigBaseline {
          file_json: json!({ "flags": { "allowGuestDemoWorkspace": true } }),
          redis_url_env_set: true,
          redis_url_has_password: false,
          ..Default::default()
        },
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(state);
    let (_admin_id, admin_cookie) = seed_user_with_cookie(&db, "cfg-admin@affine.test", "Admin", true).await;

    let (_, val_resp) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"{
        validateAppConfig(updates: [
          { module: "flags", key: "allowGuestDemoWorkspace", value: false },
          { module: "indexer", key: "enabled", value: true },
          { module: "mailer", key: "SMTP.password", value: "super-secret-pass" },
          { module: "mailer", key: "SMTP.password", value: 12345 },
          { module: "flags", key: "allowGuestDemoWorkspace" },
          { module: "flags", key: "doesNotExistKey", value: true }
        ]) { module key value valid error }
      }"#,
      json!({}),
    )
    .await;
    assert!(val_resp["errors"].is_null(), "validateAppConfig errors: {val_resp}");
    let results = val_resp["data"]["validateAppConfig"].as_array().unwrap();
    assert_eq!(results.len(), 6);
    assert_eq!(results[0]["valid"], true);
    assert_eq!(results[0]["value"], false);
    assert_eq!(results[1]["valid"], false, "indexer.* env-only key must be rejected");
    assert_eq!(results[2]["valid"], true);
    assert!(results[2]["value"].is_null(), "secret value must be redacted");
    assert!(results[3]["value"].is_null(), "secret value must be redacted on error");
    assert_eq!(results[4]["valid"], false, "missing value when !clear must be rejected");
    assert_eq!(results[5]["valid"], false, "unknown key must be rejected");

    // Zero DB writes from dry-run validateAppConfig.
    let db_rows: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM app_configs")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(db_rows, 0, "validateAppConfig must perform zero DB writes");

    // Effective appConfig still has default true.
    let (_, cfg_resp) = post_graphql(&app, Some(&admin_cookie), "{ appConfig appConfigMetadata }", json!({})).await;
    assert!(cfg_resp["errors"].is_null(), "appConfigMetadata errors: {cfg_resp}");
    assert_eq!(cfg_resp["data"]["appConfig"]["flags"]["allowGuestDemoWorkspace"], true);
    assert_eq!(
      cfg_resp["data"]["appConfigMetadata"]["flags"]["allowGuestDemoWorkspace"]["source"], "file",
      "explicitly configured file key matching default value must still report source=file"
    );
    assert_eq!(
      cfg_resp["data"]["appConfigMetadata"]["redis"]["password"]["source"],
      "environment"
    );
    assert_eq!(
      cfg_resp["data"]["appConfigMetadata"]["redis"]["password"]["configured"], false,
      "passwordless REDIS_URL must report configured=false for redis.password"
    );
    assert_ne!(
      cfg_resp["data"]["appConfigMetadata"]["redis"]["ioredis"]["source"], "environment",
      "redis.ioredis must not be reported as environment"
    );
    assert_eq!(
      cfg_resp["data"]["appConfigMetadata"]["indexer"]["enabled"]["settable"],
      false
    );
    assert!(
      cfg_resp["data"]["appConfigMetadata"]["mailer"]["SMTP"]["password"]["configured"].is_boolean(),
      "secret metadata must expose configured boolean"
    );
    assert!(
      !cfg_resp.to_string().contains("super-secret-pass"),
      "secret value must never appear in responses"
    );

    db.pool().close().await;
  });
}

#[test]
fn doc_analytics_viewers_server_config_capabilities_and_invitation_notifications() {
  struct CommercialQuotaGate;

  #[async_trait::async_trait]
  impl server_spi::QuotaGate for CommercialQuotaGate {
    async fn resolve_workspace_grant(
      &self,
      _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
      _workspace_id: &str,
      _now: chrono::DateTime<chrono::Utc>,
    ) -> Result<server_types::AccessGrant, server_types::DomainError> {
      let mut grant = server_types::license::default_selfhost_access_grant();
      grant.rights.commercial = true;
      Ok(grant)
    }

    async fn check_seat_admission(
      &self,
      tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
      workspace_id: &str,
      current_active_seats: i32,
      adding_seats: i32,
      now: chrono::DateTime<chrono::Utc>,
    ) -> Result<server_types::AccessGrant, server_types::DomainError> {
      server_spi::CommunityQuotaGate::new()
        .check_seat_admission(tx, workspace_id, current_active_seats, adding_seats, now)
        .await
    }
  }

  struct CommercialExtension {
    base: CommunityExtension,
  }

  impl server_spi::ServerExtension for CommercialExtension {
    fn edition_name(&self) -> &'static str {
      "test-commercial"
    }
    fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
      Arc::new(CommercialQuotaGate)
    }
    fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
      self.base.session_policy()
    }
    fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
      self.base.copilot_policy()
    }
  }

  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        ..RuntimeConfig::default()
      },
      Arc::new(CommercialExtension {
        base: CommunityExtension::new(),
      }),
    );
    let app = build_router(Arc::clone(&state));

    let (owner_id, owner_cookie) = seed_user_with_cookie(&db, "owner-an@affine.test", "Owner", true).await;
    let (outsider_id, outsider_cookie) = seed_user_with_cookie(&db, "outsider-an@affine.test", "Outsider", false).await;

    let ws = state
      .workspaces
      .create_workspace(&owner_id, Some("Analytics WS"))
      .await
      .expect("create workspace");
    let doc_id = "doc-analytics-1";
    sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, now())")
      .bind(&ws.id)
      .bind(doc_id)
      .bind(vec![0_u8, 0])
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_pages (workspace_id, page_id, title) VALUES ($1, $2, 'Analytics Doc')")
      .bind(&ws.id)
      .bind(doc_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role) VALUES ($1, $2, 'public', 'external')",
    )
    .bind(&ws.id)
    .bind(doc_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO workspace_doc_view_daily (workspace_id, doc_id, date, total_views, unique_views, guest_views, last_accessed_at)
         VALUES ($1, $2, CURRENT_DATE, 12, 5, 3, now())"#,
    )
    .bind(&ws.id)
    .bind(doc_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO workspace_member_last_access (workspace_id, user_id, last_accessed_at, last_doc_id)
         VALUES ($1, $2, now(), $3)"#,
    )
    .bind(&ws.id)
    .bind(&owner_id)
    .bind(doc_id)
    .execute(db.pool())
    .await
    .unwrap();

    // 1. workspaceRolePermissions: owner allowed, outsider denied.
    let (_, perm_ok) = post_graphql(
      &app,
      Some(&owner_cookie),
      r#"query ($id: String!) { workspaceRolePermissions(id: $id) { role permissions { Workspace_Read Workspace_Delete } } }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert!(perm_ok["errors"].is_null(), "workspaceRolePermissions error: {perm_ok}");
    assert_eq!(perm_ok["data"]["workspaceRolePermissions"]["role"], "Owner");
    assert_eq!(
      perm_ok["data"]["workspaceRolePermissions"]["permissions"]["Workspace_Delete"],
      true
    );

    let (_, perm_denied) = post_graphql(
      &app,
      Some(&outsider_cookie),
      r#"query ($id: String!) { workspaceRolePermissions(id: $id) { role } }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert_eq!(perm_denied["errors"][0]["extensions"]["status"], 403);
    assert_eq!(perm_denied["errors"][0]["extensions"]["name"], "SPACE_ACCESS_DENIED");
    assert_eq!(perm_denied["errors"][0]["extensions"]["data"]["spaceId"], ws.id);

    // 2. Owner with Doc.Read + Doc.Analytics.* gets analytics and lastAccessedMembers.
    let analytics_query = r#"query ($ws: String!, $doc: String!) {
      workspace(id: $ws) {
        doc(docId: $doc) {
          analytics { summary { totalViews uniqueViews guestViews } series { totalViews } }
          lastAccessedMembers(pagination: { first: 10 }, includeTotal: true) {
            totalCount
            edges { node { user { id name } lastDocId } }
          }
        }
      }
    }"#;
    let (_, an_ok) = post_graphql(
      &app,
      Some(&owner_cookie),
      analytics_query,
      json!({ "ws": ws.id, "doc": doc_id }),
    )
    .await;
    assert!(an_ok["errors"].is_null(), "owner analytics errors: {an_ok}");
    assert_eq!(
      an_ok["data"]["workspace"]["doc"]["analytics"]["summary"]["totalViews"],
      12
    );
    assert_eq!(
      an_ok["data"]["workspace"]["doc"]["lastAccessedMembers"]["totalCount"],
      1
    );
    assert_eq!(
      an_ok["data"]["workspace"]["doc"]["lastAccessedMembers"]["edges"][0]["node"]["user"]["id"],
      owner_id
    );

    // 2b. Pagination after + offset > 0: loose Base64 whitespace and leading `=` decode to empty (allowed),
    // while non-empty decoded cursor + offset > 0 fails with BAD_REQUEST BEFORE keyword length check.
    for empty_after in ["   ", "=YQ", "Y=Q="] {
      let (_, ws_after_ok) = post_graphql(
        &app,
        Some(&owner_cookie),
        r#"query ($ws: String!, $doc: String!, $after: String) {
          workspace(id: $ws) {
            doc(docId: $doc) {
              lastAccessedMembers(pagination: { first: 10, offset: 1, after: $after }) {
                edges { cursor }
              }
            }
          }
        }"#,
        json!({ "ws": ws.id, "doc": doc_id, "after": empty_after }),
      )
      .await;
      assert!(
        ws_after_ok["errors"].is_null(),
        "empty-decoding after `{empty_after}` must succeed: {ws_after_ok}"
      );
    }

    // 2c. Real endCursor pagination on lastAccessedMembers: verbatim cursor and whitespace-inserted cursor
    // must return identical page 2.
    let (viewer2_id, _) = seed_user_with_cookie(&db, "viewer2-an@affine.test", "Viewer Two", false).await;
    sqlx::query(
      "INSERT INTO workspace_members (workspace_id, user_id, role, state, source) VALUES ($1, $2, 'member', 'active', 'legacy')",
    )
    .bind(&ws.id)
    .bind(&viewer2_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO workspace_member_last_access (workspace_id, user_id, last_accessed_at, last_doc_id)
         VALUES ($1, $2, now() - interval '1 minute', $3)"#,
    )
    .bind(&ws.id)
    .bind(&viewer2_id)
    .bind(doc_id)
    .execute(db.pool())
    .await
    .unwrap();
    let last_acc_page_q = r#"query ($ws: String!, $doc: String!, $after: String) {
      workspace(id: $ws) {
        doc(docId: $doc) {
          lastAccessedMembers(pagination: { first: 1, offset: 0, after: $after }) {
            pageInfo { endCursor hasNextPage }
            edges { node { user { id } } }
          }
        }
      }
    }"#;
    let (_, p1) = post_graphql(
      &app,
      Some(&owner_cookie),
      last_acc_page_q,
      json!({ "ws": ws.id, "doc": doc_id, "after": Value::Null }),
    )
    .await;
    assert!(p1["errors"].is_null(), "lastAccessedMembers page 1 error: {p1}");
    assert_eq!(
      p1["data"]["workspace"]["doc"]["lastAccessedMembers"]["pageInfo"]["hasNextPage"],
      true
    );
    let end_cursor = p1["data"]["workspace"]["doc"]["lastAccessedMembers"]["pageInfo"]["endCursor"]
      .as_str()
      .expect("endCursor must be present")
      .to_owned();
    let mid = end_cursor.len() / 2;
    let spaced_cursor = format!("{}   {}", &end_cursor[..mid], &end_cursor[mid..]);
    let (_, p2_exact) = post_graphql(
      &app,
      Some(&owner_cookie),
      last_acc_page_q,
      json!({ "ws": ws.id, "doc": doc_id, "after": end_cursor }),
    )
    .await;
    let (_, p2_spaced) = post_graphql(
      &app,
      Some(&owner_cookie),
      last_acc_page_q,
      json!({ "ws": ws.id, "doc": doc_id, "after": spaced_cursor }),
    )
    .await;
    assert!(p2_exact["errors"].is_null(), "page 2 exact error: {p2_exact}");
    assert!(p2_spaced["errors"].is_null(), "page 2 spaced error: {p2_spaced}");
    assert_eq!(
      p2_exact["data"]["workspace"]["doc"]["lastAccessedMembers"]["edges"][0]["node"]["user"]["id"],
      viewer2_id
    );
    assert_eq!(
      p2_exact["data"]["workspace"]["doc"]["lastAccessedMembers"]["edges"],
      p2_spaced["data"]["workspace"]["doc"]["lastAccessedMembers"]["edges"]
    );

    let long_kw = "x".repeat(300);
    for non_empty_after in ["Y3Vyc29y", "YR", "ŁQ"] {
      let (_, bad_pag) = post_graphql(
        &app,
        Some(&owner_cookie),
        r#"query ($ws: String!, $doc: String!, $q: String!, $after: String) {
          workspace(id: $ws) {
            doc(docId: $doc) {
              lastAccessedMembers(pagination: { first: 10, offset: 1, after: $after }, query: $q) {
                edges { cursor }
              }
            }
          }
        }"#,
        json!({ "ws": ws.id, "doc": doc_id, "q": long_kw, "after": non_empty_after }),
      )
      .await;
      assert_eq!(
        bad_pag["errors"][0]["extensions"]["status"], 400,
        "after={non_empty_after} must return 400: {bad_pag}"
      );
      assert_eq!(bad_pag["errors"][0]["extensions"]["type"], "BAD_REQUEST");
      assert_eq!(bad_pag["errors"][0]["extensions"]["name"], "BAD_REQUEST");
      assert_eq!(
        bad_pag["errors"][0]["extensions"]["message"],
        "pagination.after and pagination.offset cannot be used together"
      );
    }

    // 3. Outsider without Doc.Read / Doc.Analytics.* is denied and gets zero leaked viewers/stats.
    let (_, an_denied) = post_graphql(
      &app,
      Some(&outsider_cookie),
      analytics_query,
      json!({ "ws": ws.id, "doc": doc_id }),
    )
    .await;
    assert_eq!(an_denied["errors"][0]["extensions"]["status"], 403);

    // 4. Dynamic serverConfig OAuth & Captcha capabilities from app_configs in Selfhosted mode.
    let (_, cfg_before) = post_graphql(
      &app,
      Some(&owner_cookie),
      "{ serverConfig { features oauthProviders availableUserFeatures } }",
      json!({}),
    )
    .await;
    assert!(
      cfg_before["errors"].is_null(),
      "serverConfig before errors: {cfg_before}"
    );
    assert_eq!(
      cfg_before["data"]["serverConfig"]["availableUserFeatures"],
      json!(["Admin"])
    );
    assert_eq!(cfg_before["data"]["serverConfig"]["oauthProviders"], json!([]));
    let features_before = cfg_before["data"]["serverConfig"]["features"].as_array().unwrap();
    assert!(!features_before.contains(&json!("OAuth")));
    assert!(!features_before.contains(&json!("Captcha")));

    let (_, set_oauth) = post_graphql(
      &app,
      Some(&owner_cookie),
      r#"mutation {
        updateAppConfig(updates: [
          { module: "oauth", key: "providers.google", value: { clientId: "google-cid", clientSecret: "google-secret" } },
          { module: "oauth", key: "providers.github", value: { clientId: "github-cid-only" } },
          { module: "captcha", key: "enabled", value: true },
          { module: "captcha", key: "config", value: { turnstile: { secret: "ts-secret", siteKey: "ts-site-key" } } }
        ])
      }"#,
      json!({}),
    )
    .await;
    assert!(
      set_oauth["errors"].is_null(),
      "updateAppConfig oauth errors: {set_oauth}"
    );

    let (_, cfg_after) = post_graphql(
      &app,
      Some(&owner_cookie),
      "{ serverConfig { features oauthProviders } }",
      json!({}),
    )
    .await;
    assert!(cfg_after["errors"].is_null(), "serverConfig after errors: {cfg_after}");
    assert_eq!(cfg_after["data"]["serverConfig"]["oauthProviders"], json!(["Google"]));
    let features_after = cfg_after["data"]["serverConfig"]["features"].as_array().unwrap();
    assert!(features_after.contains(&json!("OAuth")));
    assert!(features_after.contains(&json!("Captcha")));

    // 4b. In Selfhosted mode, the 6 Cloud-only admin console ops return 404 (and adminUpdateWorkspace does 0 DB writes),
    // while adminMailDeliveries remains open.
    let cloud_only_ops = [
      r#"{ adminWorkspacesCount(filter: { first: 10, skip: 0 }) }"#,
      r#"{ adminWorkspaces(filter: { first: 10, skip: 0 }) { id } }"#,
      r#"{ adminWorkspace(id: "ws-any") { id } }"#,
      r#"{ adminDashboard { syncActiveUsers } }"#,
      r#"{ adminAllSharedLinks(pagination: { first: 10 }) { edges { cursor } } }"#,
    ];
    for op in cloud_only_ops {
      let (_, resp) = post_graphql(&app, Some(&owner_cookie), op, json!({})).await;
      assert_eq!(
        resp["errors"][0]["extensions"]["status"], 404,
        "expected 404 in Selfhosted for {op}, got: {resp}"
      );
    }
    let (_, selfhost_upd) = post_graphql(
      &app,
      Some(&owner_cookie),
      r#"mutation ($id: String!) { adminUpdateWorkspace(input: { id: $id, name: "Mutated" }) { id } }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert_eq!(selfhost_upd["errors"][0]["extensions"]["status"], 404);
    let ws_name_after: Option<String> = sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1")
      .bind(&ws.id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(ws_name_after.as_deref(), Some("Analytics WS"));

    let (_, selfhost_mail) = post_graphql(
      &app,
      Some(&owner_cookie),
      r#"{ adminMailDeliveries(input: { hours: 24 }) { summary { total successRate } byStatus { key total } } }"#,
      json!({}),
    )
    .await;
    assert!(
      selfhost_mail["errors"].is_null(),
      "adminMailDeliveries must work in Selfhosted: {selfhost_mail}"
    );

    // 5. Invitation notification created for registered invitee, and single event bus emission on invite + accept.
    #[derive(Default)]
    struct RecordingEventBus {
      events: std::sync::Mutex<Vec<(String, Value)>>,
    }

    #[async_trait::async_trait]
    impl server_domain::events::EventBusPublisher for RecordingEventBus {
      async fn publish_event(
        &self,
        event_type: &str,
        payload: Value,
        request_id: Option<&str>,
      ) -> Result<server_domain::events::EventBusEnvelopeV1, server_types::DomainError> {
        self
          .events
          .lock()
          .unwrap()
          .push((event_type.to_owned(), payload.clone()));
        Ok(server_domain::events::EventBusEnvelopeV1 {
          v: 1,
          id: "test-event".to_owned(),
          event: event_type.to_owned(),
          origin_id: "test-origin".to_owned(),
          origin_channel: "test".to_owned(),
          request_id: request_id.map(str::to_owned),
          payload,
        })
      }
    }

    let recorder = Arc::new(RecordingEventBus::default());
    let ws_with_bus = server_domain::workspaces::WorkspaceService::new(
      db.clone(),
      Arc::new(CommercialQuotaGate),
      Arc::new(server_domain::events::NoopEventPublisher::default()),
    )
    .with_event_bus(recorder.clone());

    let batch = ws_with_bus
      .invite_members_with_source(
        &owner_id,
        &ws.id,
        &["outsider-an@affine.test".to_owned()],
        server_domain::workspaces::WorkspaceRole::Member,
        None,
      )
      .await
      .expect("invite_members_with_source");
    let invite_id = batch[0].1.as_ref().expect("invite ok").id.clone();

    let (_, notif_resp) = post_graphql(
      &app,
      Some(&outsider_cookie),
      "{ currentUser { notifications(pagination: { first: 10 }) { totalCount edges { node { type body } } } } }",
      json!({}),
    )
    .await;
    assert!(notif_resp["errors"].is_null(), "notifications errors: {notif_resp}");
    assert_eq!(notif_resp["data"]["currentUser"]["notifications"]["totalCount"], 1);
    assert_eq!(
      notif_resp["data"]["currentUser"]["notifications"]["edges"][0]["node"]["type"],
      "Invitation"
    );

    // Accept invite -> owner receives InvitationAccepted notification and exactly one count event.
    ws_with_bus
      .accept_invitation(&outsider_id, &invite_id)
      .await
      .expect("accept_invitation");

    let (_, owner_notif) = post_graphql(
      &app,
      Some(&owner_cookie),
      "{ currentUser { notifications(pagination: { first: 10 }) { totalCount edges { node { type } } } } }",
      json!({}),
    )
    .await;
    assert_eq!(owner_notif["data"]["currentUser"]["notifications"]["totalCount"], 1);
    assert_eq!(
      owner_notif["data"]["currentUser"]["notifications"]["edges"][0]["node"]["type"],
      "InvitationAccepted"
    );

    let notif_events: Vec<(Value, Value, Value)> = recorder
      .events
      .lock()
      .unwrap()
      .iter()
      .filter(|(ty, payload)| ty == "realtime.topic.changed" && payload["topic"] == "notification.count.changed")
      .map(|(_, payload)| {
        (
          payload["room"].clone(),
          payload["event"]["count"].clone(),
          payload["event"]["reason"].clone(),
        )
      })
      .collect();
    assert_eq!(
      notif_events,
      vec![
        (
          json!(format!("user:{outsider_id}:notification")),
          json!(1),
          json!("created")
        ),
        (
          json!(format!("user:{owner_id}:notification")),
          json!(1),
          json!("created")
        ),
      ],
      "expected exactly one notification.count.changed event with count+reason for invite and one for accept"
    );

    let queued_rows: Vec<(String, String, Option<String>, Option<Value>)> = sqlx::query_as(
      "SELECT mail_name, mail_class, dedupe_key, payload FROM mail_deliveries WHERE workspace_id = $1 AND status = 'queued' ORDER BY mail_name ASC",
    )
    .bind(&ws.id)
    .fetch_all(db.pool())
    .await
    .unwrap();
    assert_eq!(queued_rows.len(), 2);
    assert_eq!(queued_rows[0].0, "MemberAccepted");
    assert_eq!(queued_rows[0].1, "workspace_lifecycle");
    assert!(
      queued_rows[0]
        .2
        .as_deref()
        .is_some_and(|k| k.starts_with("notification:") && k.ends_with(":mail:MemberAccepted"))
    );
    let acc_payload = queued_rows[0].3.as_ref().expect("MemberAccepted payload");
    assert_eq!(acc_payload["name"], "MemberAccepted");
    assert_eq!(acc_payload["to"], "owner-an@affine.test");
    assert_eq!(acc_payload["props"]["user"]["email"], "outsider-an@affine.test");
    assert_eq!(acc_payload["props"]["workspace"]["name"], "Analytics WS");
    assert!(
      acc_payload["props"]["url"]
        .as_str()
        .unwrap()
        .ends_with(&format!("/workspace/{}/settings?tab=workspace%3Amembers", ws.id))
    );

    assert_eq!(queued_rows[1].0, "MemberInvitation");
    assert_eq!(queued_rows[1].1, "workspace_invitation");
    assert!(
      queued_rows[1]
        .2
        .as_deref()
        .is_some_and(|k| k.starts_with("notification:") && k.ends_with(":mail:MemberInvitation"))
    );
    let inv_payload = queued_rows[1].3.as_ref().expect("MemberInvitation payload");
    assert_eq!(inv_payload["name"], "MemberInvitation");
    assert_eq!(inv_payload["to"], "outsider-an@affine.test");
    assert_eq!(inv_payload["props"]["user"]["email"], "owner-an@affine.test");
    assert_eq!(inv_payload["props"]["workspace"]["name"], "Analytics WS");
    assert!(
      inv_payload["props"]["url"]
        .as_str()
        .unwrap()
        .ends_with(&format!("/invite/{invite_id}"))
    );

    // InvitationReviewApproved enqueues LinkInvitationApprove with NO `user` field, `/workspace/<id>` URL,
    // and is NOT suppressed when recipient has receiveInvitationEmail = false.
    sqlx::query(
      r#"INSERT INTO user_settings (user_id, payload, updated_at)
         VALUES ($1, '{"receiveInvitationEmail": false}'::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()"#,
    )
    .bind(&outsider_id)
    .execute(db.pool())
    .await
    .unwrap();
    let mut rev_tx = db.pool().begin().await.unwrap();
    let _ = server_domain::notifications::insert_invitation_notification_in_tx(
      &mut rev_tx,
      &outsider_id,
      &owner_id,
      &ws.id,
      "review-invite-1",
      "InvitationReviewApproved",
      "http://localhost:3010",
    )
    .await
    .expect("InvitationReviewApproved insert");
    rev_tx.commit().await.unwrap();
    let (rev_class, rev_payload): (String, Value) = sqlx::query_as(
      "SELECT mail_class, payload FROM mail_deliveries \
       WHERE workspace_id = $1 AND mail_name = 'LinkInvitationApprove' AND status = 'queued'",
    )
    .bind(&ws.id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(rev_class, "workspace_invitation");
    assert_eq!(rev_payload["name"], "LinkInvitationApprove");
    assert!(rev_payload["props"].get("user").is_none());
    assert_eq!(rev_payload["props"]["workspace"]["name"], "Analytics WS");
    assert!(
      rev_payload["props"]["url"]
        .as_str()
        .unwrap()
        .ends_with(&format!("/workspace/{}", ws.id))
    );

    // Inviting a brand-new unknown email creates a registered=false placeholder user + invitation + notification + mail.
    let new_email = "brand-new-invitee@affine.test";
    let new_inv = ws_with_bus
      .invite_members_with_source(
        &owner_id,
        &ws.id,
        &[new_email.to_owned()],
        server_domain::workspaces::WorkspaceRole::Member,
        None,
      )
      .await
      .expect("invite brand new email");
    let new_rec = new_inv[0].1.as_ref().expect("brand new invite ok");
    let placeholder_uid = new_rec.invitee_user_id.as_deref().expect("placeholder user id");
    let is_registered: bool = sqlx::query_scalar("SELECT registered FROM users WHERE id = $1")
      .bind(placeholder_uid)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert!(
      !is_registered,
      "new invitee placeholder user must have registered=false"
    );
    let placeholder_notifs: i64 =
      sqlx::query_scalar("SELECT COUNT(*)::bigint FROM notifications WHERE user_id = $1 AND type = 'Invitation'")
        .bind(placeholder_uid)
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(placeholder_notifs, 1);
    let new_mail_url: String = sqlx::query_scalar(
      "SELECT payload->'props'->>'url' FROM mail_deliveries WHERE workspace_id = $1 AND recipient_user_id = $2 AND mail_name = 'MemberInvitation'",
    )
    .bind(&ws.id)
    .bind(placeholder_uid)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert!(
      new_mail_url.ends_with(&format!("/invite/{}", new_rec.id)),
      "unregistered invitee mail url must end with /invite/<id>, got: {new_mail_url}"
    );

    // Dual-tx concurrency: legacy Tx A holds 8301 email lock and inserts registered=false user while
    // Tx B invites the same email to another workspace; zero unique violation and both share one user ID.
    let ws2 = state
      .workspaces
      .create_workspace(&owner_id, Some("Concurrent Invite WS"))
      .await
      .expect("create ws2");
    let race_email = "race-new-invitee@affine.test";
    let mut legacy_tx = db.pool().begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 8301))")
      .bind(race_email)
      .execute(&mut *legacy_tx)
      .await
      .unwrap();
    let ws_bg = ws_with_bus.clone();
    let owner_bg = owner_id.clone();
    let ws2_id = ws2.id.clone();
    let invite_handle = tokio::spawn(async move {
      ws_bg
        .invite_members_with_source(
          &owner_bg,
          &ws2_id,
          &[race_email.to_owned()],
          server_domain::workspaces::WorkspaceRole::Member,
          None,
        )
        .await
    });
    let wait_deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
      let (has_granted, has_waiting): (bool, bool) = sqlx::query_as(
        r#"SELECT
             BOOL_OR(l.granted),
             BOOL_OR(NOT l.granted)
           FROM pg_locks l
           JOIN pg_database d ON d.oid = l.database
           WHERE d.datname = current_database()
             AND l.locktype = 'advisory'
             AND ((l.classid::bigint << 32) | (l.objid::bigint & 4294967295)) = hashtextextended(lower($1), 8301)"#,
      )
      .bind(race_email)
      .fetch_one(db.pool())
      .await
      .map(|(g, w): (Option<bool>, Option<bool>)| (g.unwrap_or(false), w.unwrap_or(false)))
      .unwrap();
      if has_granted && has_waiting {
        break;
      }
      assert!(
        std::time::Instant::now() < wait_deadline,
        "timed out waiting for concurrent invite_members to block on 8301 advisory lock"
      );
      tokio::task::yield_now().await;
    }

    // RuntimeAppConfigBaseline Debug must redact file_json secrets.
    let redacted_dbg = format!(
      "{:?}",
      server_domain::app_config::RuntimeAppConfigBaseline {
        file_json: json!({ "crypto": { "privateKey": "top-secret-file-key" } }),
        ..Default::default()
      }
    );
    assert!(redacted_dbg.contains("<redacted>"));
    assert!(!redacted_dbg.contains("top-secret-file-key"));
    let legacy_uid = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, created_at) VALUES ($1, 'race', $2, false, clock_timestamp())",
    )
    .bind(&legacy_uid)
    .bind(race_email)
    .execute(&mut *legacy_tx)
    .await
    .unwrap();
    legacy_tx.commit().await.unwrap();
    let race_res = invite_handle.await.unwrap().expect("concurrent invite must succeed");
    let race_rec = race_res[0].1.as_ref().expect("concurrent invite item ok");
    assert_eq!(race_rec.invitee_user_id.as_deref(), Some(legacy_uid.as_str()));

    // OIDC discovery requires BOTH jwks_uri and userinfo_endpoint to advertise OIDC.
    let oidc_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let oidc_port = oidc_listener.local_addr().unwrap().port();
    let oidc_mode = Arc::new(std::sync::atomic::AtomicU8::new(0));
    let oidc_mode_bg = Arc::clone(&oidc_mode);
    let oidc_task = tokio::spawn(async move {
      use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
      while let Ok((mut stream, _)) = oidc_listener.accept().await {
        let mut buf = [0_u8; 1024];
        let _ = stream.read(&mut buf).await;
        let mode = oidc_mode_bg.load(std::sync::atomic::Ordering::SeqCst);
        let issuer = format!("http://127.0.0.1:{oidc_port}");
        let body = match mode {
          0 => json!({
            "issuer": issuer,
            "authorization_endpoint": format!("{issuer}/auth"),
            "token_endpoint": format!("{issuer}/token"),
            "userinfo_endpoint": format!("{issuer}/userinfo")
          }),
          1 => json!({
            "issuer": issuer,
            "authorization_endpoint": format!("{issuer}/auth"),
            "token_endpoint": format!("{issuer}/token"),
            "jwks_uri": format!("{issuer}/jwks")
          }),
          _ => json!({
            "issuer": issuer,
            "authorization_endpoint": format!("{issuer}/auth"),
            "token_endpoint": format!("{issuer}/token"),
            "jwks_uri": format!("{issuer}/jwks"),
            "userinfo_endpoint": format!("{issuer}/userinfo")
          }),
        }
        .to_string();
        let resp = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          body.len(),
          body
        );
        let _ = stream.write_all(resp.as_bytes()).await;
      }
    });
    for (mode, expect_oidc) in [(0_u8, false), (1_u8, false), (2_u8, true)] {
      oidc_mode.store(mode, std::sync::atomic::Ordering::SeqCst);
      let iss = format!("http://127.0.0.1:{oidc_port}/m{mode}");
      let cfg_val = json!({
        "clientId": "cid",
        "clientSecret": "csec",
        "issuer": format!("http://127.0.0.1:{oidc_port}"),
        "allowPrivateNetwork": true
      });
      let _ = iss;
      let fresh_app_cfg = server_domain::app_config::AppConfigService::new(
        db.clone(),
        server_domain::app_config::RuntimeAppConfigBaseline {
          file_json: json!({ "oauth": { "providers": { "oidc": cfg_val } } }),
          ..Default::default()
        },
        Arc::new(server_domain::events::NoopEventPublisher::default()),
      );
      let caps = fresh_app_cfg.get_configured_auth_capabilities().await.unwrap();
      assert_eq!(caps.oauth_oidc, expect_oidc, "oidc mode={mode}");
    }
    oidc_task.abort();

    // Verify server_mail::process_ready_mail_deliveries consumes and delivers all 5 queued rows via mock SMTP.
    let smtp_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let smtp_port = smtp_listener.local_addr().unwrap().port();
    let smtp_task = tokio::spawn(async move {
      use tokio::io::{AsyncBufReadExt as _, AsyncWriteExt as _, BufReader};
      for _ in 0..5 {
        let Ok((stream, _)) = smtp_listener.accept().await else {
          break;
        };
        let mut reader = BufReader::new(stream);
        let _ = reader.get_mut().write_all(b"220 localhost ESMTP\r\n").await;
        let mut in_data = false;
        let mut line = String::new();
        loop {
          line.clear();
          let n = reader.read_line(&mut line).await.unwrap_or(0);
          if n == 0 {
            break;
          }
          if in_data {
            if line == ".\r\n" || line == ".\n" {
              in_data = false;
              let _ = reader.get_mut().write_all(b"250 2.0.0 Ok: queued as mock\r\n").await;
            }
            continue;
          }
          let upper = line.trim().to_ascii_uppercase();
          if upper.starts_with("EHLO") || upper.starts_with("HELO") {
            let _ = reader.get_mut().write_all(b"250-localhost\r\n250 OK\r\n").await;
          } else if upper.starts_with("MAIL FROM") || upper.starts_with("RCPT TO") {
            let _ = reader.get_mut().write_all(b"250 OK\r\n").await;
          } else if upper == "DATA" {
            in_data = true;
            let _ = reader
              .get_mut()
              .write_all(b"354 End data with <CR><LF>.<CR><LF>\r\n")
              .await;
          } else if upper == "QUIT" {
            let _ = reader.get_mut().write_all(b"221 Bye\r\n").await;
            break;
          } else {
            let _ = reader.get_mut().write_all(b"250 OK\r\n").await;
          }
        }
      }
    });
    let mailer = server_mail::SmtpMailer::new(&server_mail::SmtpConfig {
      name: "localhost".to_owned(),
      host: "127.0.0.1".to_owned(),
      port: smtp_port,
      sender: "AFFiNE Test <noreply@affine.test>".to_owned(),
      username: String::new(),
      password: String::new(),
      ignore_tls: true,
    })
    .expect("mock mailer");
    let processed = server_mail::process_ready_mail_deliveries(db.pool(), &mailer, "test-worker", 10, 60_000)
      .await
      .expect("process_ready_mail_deliveries");
    assert_eq!(processed, 5);
    let sent_count: i64 =
      sqlx::query_scalar("SELECT COUNT(*)::bigint FROM mail_deliveries WHERE workspace_id = $1 AND status = 'sent'")
        .bind(&ws.id)
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(sent_count, 4);
    smtp_task.abort();

    // Legacy workspace with NULL workspaces.name falls back to root doc y-octo meta.name.
    let legacy_ws = state
      .workspaces
      .create_workspace(&owner_id, None)
      .await
      .expect("create legacy ws");
    let root_doc = y_octo::Doc::default();
    root_doc
      .get_or_create_map("meta")
      .unwrap()
      .insert("name".to_owned(), y_octo::Any::String("Legacy Root Name".to_owned()))
      .unwrap();
    let root_bin = root_doc.encode_state_as_update_v1(&Default::default()).unwrap();
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, updated_at)
       VALUES ($1, $1, $2, now())
       ON CONFLICT (workspace_id, guid) DO UPDATE SET blob = EXCLUDED.blob",
    )
    .bind(&legacy_ws.id)
    .bind(root_bin)
    .execute(db.pool())
    .await
    .unwrap();
    let mut leg_tx = db.pool().begin().await.unwrap();
    let _ = server_domain::notifications::insert_invitation_notification_in_tx(
      &mut leg_tx,
      &outsider_id,
      &owner_id,
      &legacy_ws.id,
      "leg-inv-1",
      "InvitationReviewApproved",
      "http://localhost:3010",
    )
    .await
    .expect("legacy root doc name insert");
    leg_tx.commit().await.unwrap();
    let leg_payload: Value = sqlx::query_scalar(
      "SELECT payload FROM mail_deliveries WHERE workspace_id = $1 AND mail_name = 'LinkInvitationApprove'",
    )
    .bind(&legacy_ws.id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(leg_payload["props"]["workspace"]["name"], "Legacy Root Name");

    // Phishing workspace name containing a URL is rejected at invite time, and the
    // notification mail helper also defense-in-depth skips MemberInvitation with workspace_name_contains_domain.
    let phish_ws = state
      .workspaces
      .create_workspace(&owner_id, Some("Claim prize at https://evil.example now"))
      .await
      .expect("create phish workspace");
    let phish_err = ws_with_bus
      .invite_members_with_source(
        &owner_id,
        &phish_ws.id,
        &["outsider-an@affine.test".to_owned()],
        server_domain::workspaces::WorkspaceRole::Member,
        None,
      )
      .await
      .expect_err("invite to phish workspace must be forbidden");
    assert!(matches!(phish_err, server_types::DomainError::Forbidden(_)));

    let mut phish_tx = db.pool().begin().await.unwrap();
    let _ = server_domain::notifications::insert_invitation_notification_in_tx(
      &mut phish_tx,
      &outsider_id,
      &owner_id,
      &phish_ws.id,
      "phish-invite-1",
      "Invitation",
      "http://localhost:3010",
    )
    .await
    .expect("defense-in-depth notification insert");
    phish_tx.commit().await.unwrap();

    let skipped_row: (String, String, Option<String>, Option<String>, Option<Value>) = sqlx::query_as(
      "SELECT status, retention_state, last_error_code, recipient_email, payload \
       FROM mail_deliveries WHERE workspace_id = $1 AND mail_name = 'MemberInvitation'",
    )
    .bind(&phish_ws.id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(skipped_row.0, "skipped");
    assert_eq!(skipped_row.1, "anonymized");
    assert_eq!(skipped_row.2.as_deref(), Some("workspace_name_contains_domain"));
    assert!(skipped_row.3.is_none());
    assert!(skipped_row.4.is_none());

    db.pool().close().await;
  });
}

#[test]
fn cloud_admin_console_workspaces_dashboard_shared_links_and_updates() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        deployment_mode: server_types::DeploymentMode::Cloud,
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(Arc::clone(&state));

    let (admin_id, admin_cookie) = seed_user_with_cookie(&db, "cloud-admin@affine.test", "Cloud Admin", true).await;
    let ws = state
      .workspaces
      .create_workspace(&admin_id, Some("Cloud Console WS"))
      .await
      .expect("create cloud workspace");

    sqlx::query(
      r#"INSERT INTO workspace_pages (workspace_id, page_id, title, published_at)
         SELECT $1, 'shared-doc-' || g::text, 'Doc ' || g::text, clock_timestamp()
         FROM generate_series(1, 501) AS g"#,
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role, published_at)
         SELECT $1, 'shared-doc-' || g::text, 'public', 'external', clock_timestamp()
         FROM generate_series(1, 501) AS g"#,
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, title, published_at) VALUES ($1, 'invalid-wp-null', 'X', NULL)",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role, published_at) VALUES ($1, 'invalid-wp-null', 'public', 'external', clock_timestamp())",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, title, published_at) VALUES ($1, 'invalid-dap-null', 'Y', clock_timestamp())",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role, published_at) VALUES ($1, 'invalid-dap-null', 'public', 'external', NULL)",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, title, published_at, lifecycle_state) VALUES ($1, 'invalid-deleted', 'Z', clock_timestamp(), 'deleted')",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role, published_at) VALUES ($1, 'invalid-deleted', 'public', 'external', clock_timestamp())",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO snapshots (workspace_id, guid, blob, updated_at)
         SELECT $1, 'shared-doc-' || g::text, $2, clock_timestamp()
         FROM generate_series(1, 501) AS g"#,
    )
    .bind(&ws.id)
    .bind(vec![0_u8, 0])
    .execute(db.pool())
    .await
    .unwrap();
    // Metadata-only doc with no snapshot/update and reserved root doc must be excluded from sharedLinks.
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, title, published_at) VALUES ($1, 'no-source-doc', 'NoSrc', clock_timestamp()), ($1, $1, 'Root', clock_timestamp())",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role, published_at) VALUES ($1, 'no-source-doc', 'public', 'external', clock_timestamp()), ($1, $1, 'public', 'external', clock_timestamp())",
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $1, $2, clock_timestamp()) ON CONFLICT (workspace_id, guid) DO NOTHING",
    )
    .bind(&ws.id)
    .bind(vec![0_u8, 0])
    .execute(db.pool())
    .await
    .unwrap();
    // Seed a retained 'accepted' invitation row alongside active owner member: invitation row must map to Pending.
    let (inv_user_id, _) = seed_user_with_cookie(&db, "retained-inv@affine.test", "Retained Inv", false).await;
    sqlx::query(
      r#"INSERT INTO workspace_invitations
           (id, workspace_id, invitee_user_id, normalized_email, inviter_user_id, requested_role, status, kind, created_at, updated_at)
         VALUES ('inv-retained-1', $1, $2, 'retained-inv@affine.test', $3, 'member', 'accepted', 'email', now(), now())"#,
    )
    .bind(&ws.id)
    .bind(&inv_user_id)
    .bind(&admin_id)
    .execute(db.pool())
    .await
    .unwrap();

    sqlx::query(
      r#"INSERT INTO workspace_doc_view_daily (workspace_id, doc_id, date, total_views, unique_views, guest_views, last_accessed_at)
         VALUES ($1, 'shared-doc-1', CURRENT_DATE, 12, 5, 3, clock_timestamp())"#,
    )
    .bind(&ws.id)
    .execute(db.pool())
    .await
    .unwrap();

    let (_, admin_resp) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"query ($wsId: String!) {
        adminWorkspacesCount(filter: { first: 10, skip: 0 })
        adminWorkspaces(filter: { first: 10, skip: 0 }) { id name memberCount }
        adminWorkspace(id: $wsId) { id name sharedLinks { docId } members(skip: 0, take: 10) { id status } }
        adminDashboard { syncActiveUsers workspaceStorageBytes topSharedLinks { docId views shareUrl } }
        adminAllSharedLinks(pagination: { first: 10 }, filter: { includeTotal: true }) {
          totalCount
          edges { node { docId views shareUrl } }
        }
        adminMailDeliveries(input: { hours: 24 }) { summary { total successRate } byStatus { key total } }
      }"#,
      json!({ "wsId": ws.id }),
    )
    .await;
    assert!(
      admin_resp["errors"].is_null(),
      "cloud admin queries errors: {admin_resp}"
    );
    assert!(admin_resp["data"]["adminWorkspacesCount"].as_i64().unwrap() >= 1);
    assert_eq!(admin_resp["data"]["adminDashboard"]["topSharedLinks"][0]["views"], 12);
    let links = admin_resp["data"]["adminWorkspace"]["sharedLinks"].as_array().unwrap();
    assert_eq!(
      links.len(),
      501,
      "AdminWorkspace.sharedLinks must return all 501 valid links without LIMIT 500 and exclude invalid/deleted/no-source/reserved docs"
    );
    let members = admin_resp["data"]["adminWorkspace"]["members"].as_array().unwrap();
    assert!(members.iter().any(|m| m["id"] == admin_id && m["status"] == "Accepted"));
    assert!(
      members
        .iter()
        .any(|m| m["id"] == inv_user_id && m["status"] == "Pending")
    );

    // adminAllSharedLinks guard order: non-admin with conflicting pagination returns 403 ACTION_FORBIDDEN;
    // admin with whitespace-only after + offset succeeds (loose Base64); admin with valid cursor + offset returns 400.
    let (_non_admin_id, non_admin_cookie) =
      seed_user_with_cookie(&db, "cloud-non-admin@affine.test", "NonAdmin", false).await;
    let (_, non_admin_links) = post_graphql(
      &app,
      Some(&non_admin_cookie),
      r#"{ adminAllSharedLinks(pagination: { first: 10, offset: 1, after: "Y3Vyc29y" }) { edges { cursor } } }"#,
      json!({}),
    )
    .await;
    assert_eq!(non_admin_links["errors"][0]["extensions"]["status"], 403);
    assert_eq!(non_admin_links["errors"][0]["extensions"]["type"], "ACTION_FORBIDDEN");

    let (_, ws_after_links) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"{ adminAllSharedLinks(pagination: { first: 10, offset: 1, after: "   " }) { edges { cursor } } }"#,
      json!({}),
    )
    .await;
    assert!(
      ws_after_links["errors"].is_null(),
      "whitespace after must succeed: {ws_after_links}"
    );

    let long_kw = "x".repeat(300);
    let (_, bad_links_pag) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"query ($q: String!) {
        adminAllSharedLinks(pagination: { first: 10, offset: 1, after: "Y3Vyc29y" }, filter: { keyword: $q }) {
          edges { cursor }
        }
      }"#,
      json!({ "q": long_kw }),
    )
    .await;
    assert_eq!(bad_links_pag["errors"][0]["extensions"]["status"], 400);
    assert_eq!(bad_links_pag["errors"][0]["extensions"]["type"], "BAD_REQUEST");
    assert_eq!(bad_links_pag["errors"][0]["extensions"]["name"], "BAD_REQUEST");
    assert_eq!(
      bad_links_pag["errors"][0]["extensions"]["message"],
      "pagination.after and pagination.offset cannot be used together"
    );

    // Real endCursor pagination on adminAllSharedLinks: verbatim cursor and whitespace-inserted cursor
    // must return identical, non-empty page 2 matching the deterministic offset=1 second record.
    let shared_links_page_q = r#"query ($after: String, $offset: Int) {
      adminAllSharedLinks(pagination: { first: 1, offset: $offset, after: $after }) {
        pageInfo { endCursor hasNextPage }
        edges { cursor node { workspaceId docId } }
      }
    }"#;
    let (_, sl_p1) = post_graphql(
      &app,
      Some(&admin_cookie),
      shared_links_page_q,
      json!({ "after": Value::Null, "offset": 0 }),
    )
    .await;
    assert!(sl_p1["errors"].is_null(), "adminAllSharedLinks page 1 error: {sl_p1}");
    assert_eq!(sl_p1["data"]["adminAllSharedLinks"]["pageInfo"]["hasNextPage"], true);
    let (_, sl_offset2) = post_graphql(
      &app,
      Some(&admin_cookie),
      shared_links_page_q,
      json!({ "after": Value::Null, "offset": 1 }),
    )
    .await;
    assert!(
      sl_offset2["errors"].is_null(),
      "adminAllSharedLinks offset=1 error: {sl_offset2}"
    );
    let offset2_edges = sl_offset2["data"]["adminAllSharedLinks"]["edges"].as_array().unwrap();
    assert_eq!(offset2_edges.len(), 1);
    let expected_second_doc_id = offset2_edges[0]["node"]["docId"].as_str().unwrap().to_owned();
    let sl_cursor = sl_p1["data"]["adminAllSharedLinks"]["pageInfo"]["endCursor"]
      .as_str()
      .expect("adminAllSharedLinks endCursor")
      .to_owned();
    let sl_mid = sl_cursor.len() / 2;
    let sl_spaced = format!("{}  {}", &sl_cursor[..sl_mid], &sl_cursor[sl_mid..]);
    let (_, sl_p2_exact) = post_graphql(
      &app,
      Some(&admin_cookie),
      shared_links_page_q,
      json!({ "after": sl_cursor, "offset": 0 }),
    )
    .await;
    let (_, sl_p2_spaced) = post_graphql(
      &app,
      Some(&admin_cookie),
      shared_links_page_q,
      json!({ "after": sl_spaced, "offset": 0 }),
    )
    .await;
    assert!(
      sl_p2_exact["errors"].is_null(),
      "adminAllSharedLinks page 2 exact error: {sl_p2_exact}"
    );
    assert!(
      sl_p2_spaced["errors"].is_null(),
      "adminAllSharedLinks page 2 spaced error: {sl_p2_spaced}"
    );
    let p2_exact_edges = sl_p2_exact["data"]["adminAllSharedLinks"]["edges"].as_array().unwrap();
    let p2_spaced_edges = sl_p2_spaced["data"]["adminAllSharedLinks"]["edges"].as_array().unwrap();
    assert_eq!(p2_exact_edges.len(), 1);
    assert_eq!(p2_spaced_edges.len(), 1);
    assert_eq!(p2_exact_edges[0]["node"]["docId"], expected_second_doc_id);
    assert_eq!(p2_spaced_edges[0]["node"]["docId"], expected_second_doc_id);
    assert_eq!(p2_exact_edges, p2_spaced_edges);

    let (_, clear_name) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { adminUpdateWorkspace(input: { id: $id, name: null, public: true }) { id name public } }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert!(
      clear_name["errors"].is_null(),
      "adminUpdateWorkspace errors: {clear_name}"
    );
    assert!(clear_name["data"]["adminUpdateWorkspace"]["name"].is_null());
    assert_eq!(clear_name["data"]["adminUpdateWorkspace"]["public"], true);

    // public: null sets public = false (tri-state MaybeUndefined<bool>).
    let (_, null_pub) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) { adminUpdateWorkspace(input: { id: $id, public: null }) { id public enableAi enableSharing enableUrlPreview enableDocEmbedding } }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert!(null_pub["errors"].is_null(), "public: null errors: {null_pub}");
    assert_eq!(null_pub["data"]["adminUpdateWorkspace"]["public"], false);

    // Non-null bool fields: omitted leaves DB unchanged; explicit null returns 500 INTERNAL_SERVER_ERROR
    // without modifying DB; explicit false updates normally.
    let (_, omit_noop) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) {
        adminUpdateWorkspace(input: { id: $id }) {
          enableAi enableSharing enableUrlPreview enableDocEmbedding
        }
      }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert!(omit_noop["errors"].is_null(), "omitted bools noop errors: {omit_noop}");
    let before_bools = omit_noop["data"]["adminUpdateWorkspace"].clone();

    let assert_internal_500 = |resp: &Value, ctx: &str| {
      let err = &resp["errors"][0];
      let ext = &err["extensions"];
      assert_eq!(
        err["message"], "An internal error occurred.",
        "{ctx}: error message mismatch: {resp}"
      );
      assert_eq!(ext["status"], 500, "{ctx}: expected status 500: {resp}");
      assert_eq!(ext["code"], "Internal Server Error", "{ctx}: code mismatch: {resp}");
      assert_eq!(ext["type"], "INTERNAL_SERVER_ERROR", "{ctx}: type mismatch: {resp}");
      assert_eq!(ext["name"], "INTERNAL_SERVER_ERROR", "{ctx}: name mismatch: {resp}");
      assert_eq!(
        ext["message"], "An internal error occurred.",
        "{ctx}: extensions.message mismatch: {resp}"
      );
    };

    for field in ["enableAi", "enableSharing", "enableUrlPreview", "enableDocEmbedding"] {
      let q =
        format!(r#"mutation ($id: String!) {{ adminUpdateWorkspace(input: {{ id: $id, {field}: null }}) {{ id }} }}"#);
      let (_, err_resp) = post_graphql(&app, Some(&admin_cookie), &q, json!({ "id": ws.id })).await;
      assert_internal_500(&err_resp, field);
      let (_, after_null) = post_graphql(
        &app,
        Some(&admin_cookie),
        r#"query ($id: String!) { adminWorkspace(id: $id) { enableAi enableSharing enableUrlPreview enableDocEmbedding } }"#,
        json!({ "id": ws.id }),
      )
      .await;
      assert_eq!(
        after_null["data"]["adminWorkspace"], before_bools,
        "{field}: null must not modify DB"
      );
    }
    let (_, set_false) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) {
        adminUpdateWorkspace(input: { id: $id, enableAi: false, enableSharing: false, enableUrlPreview: false, enableDocEmbedding: false }) {
          enableAi enableSharing enableUrlPreview enableDocEmbedding
        }
      }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert!(set_false["errors"].is_null(), "set false errors: {set_false}");
    assert_eq!(set_false["data"]["adminUpdateWorkspace"]["enableAi"], false);
    assert_eq!(set_false["data"]["adminUpdateWorkspace"]["enableSharing"], false);
    assert_eq!(set_false["data"]["adminUpdateWorkspace"]["enableUrlPreview"], false);
    assert_eq!(set_false["data"]["adminUpdateWorkspace"]["enableDocEmbedding"], false);

    // Also verify missing workspace_access_policies row: null on enableSharing/enableUrlPreview returns
    // 500 INTERNAL_SERVER_ERROR without inserting a policy row, while non-null updates create it cleanly.
    sqlx::query("DELETE FROM workspace_access_policies WHERE workspace_id = $1")
      .bind(&ws.id)
      .execute(db.pool())
      .await
      .unwrap();
    for field in ["enableSharing", "enableUrlPreview"] {
      let cnt_before: i64 =
        sqlx::query_scalar("SELECT COUNT(*)::bigint FROM workspace_access_policies WHERE workspace_id = $1")
          .bind(&ws.id)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert_eq!(cnt_before, 0, "{field}: policy row must start absent");
      let q =
        format!(r#"mutation ($id: String!) {{ adminUpdateWorkspace(input: {{ id: $id, {field}: null }}) {{ id }} }}"#);
      let (_, err_resp) = post_graphql(&app, Some(&admin_cookie), &q, json!({ "id": ws.id })).await;
      assert_internal_500(&err_resp, &format!("missing-policy {field}"));
      let cnt_after: i64 =
        sqlx::query_scalar("SELECT COUNT(*)::bigint FROM workspace_access_policies WHERE workspace_id = $1")
          .bind(&ws.id)
          .fetch_one(db.pool())
          .await
          .unwrap();
      assert_eq!(
        cnt_after, 0,
        "{field}: null must not insert workspace_access_policies row"
      );
    }
    let (_, from_missing_policy) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation ($id: String!) {
        adminUpdateWorkspace(input: { id: $id, public: true, enableSharing: false, enableUrlPreview: false }) {
          public enableSharing enableUrlPreview
        }
      }"#,
      json!({ "id": ws.id }),
    )
    .await;
    assert!(
      from_missing_policy["errors"].is_null(),
      "missing policy row update errors: {from_missing_policy}"
    );
    assert_eq!(from_missing_policy["data"]["adminUpdateWorkspace"]["public"], true);
    assert_eq!(
      from_missing_policy["data"]["adminUpdateWorkspace"]["enableSharing"],
      false
    );
    assert_eq!(
      from_missing_policy["data"]["adminUpdateWorkspace"]["enableUrlPreview"],
      false
    );

    // Empty patch on missing workspace returns null; non-empty patch on missing workspace returns 404 NOT_FOUND.
    let (_, missing_empty) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation { adminUpdateWorkspace(input: { id: "missing-ws-id" }) { id } }"#,
      json!({}),
    )
    .await;
    assert!(missing_empty["errors"].is_null());
    assert!(missing_empty["data"]["adminUpdateWorkspace"].is_null());

    let (_, missing_patch) = post_graphql(
      &app,
      Some(&admin_cookie),
      r#"mutation { adminUpdateWorkspace(input: { id: "missing-ws-id", public: false }) { id } }"#,
      json!({}),
    )
    .await;
    assert_eq!(missing_patch["errors"][0]["extensions"]["status"], 404);
    assert_eq!(missing_patch["errors"][0]["extensions"]["type"], "RESOURCE_NOT_FOUND");
    assert_eq!(missing_patch["errors"][0]["extensions"]["name"], "NOT_FOUND");
    assert_eq!(
      missing_patch["errors"][0]["extensions"]["message"],
      "Resource not found."
    );

    // Selfhosted mode returns exact 404 NOT_FOUND ("Resource not found.") on all 6 Cloud-only admin endpoints.
    let selfhost_state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        deployment_mode: server_types::DeploymentMode::Selfhosted,
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let selfhost_app = build_router(selfhost_state);
    for q in [
      r#"{ adminWorkspacesCount(filter: { first: 10, skip: 0 }) }"#,
      r#"{ adminWorkspaces(filter: { first: 10, skip: 0 }) { id } }"#,
      r#"{ adminWorkspace(id: "x") { id } }"#,
      r#"{ adminDashboard { syncActiveUsers } }"#,
      r#"{ adminAllSharedLinks(pagination: { first: 10 }) { edges { cursor } } }"#,
      r#"mutation { adminUpdateWorkspace(input: { id: "x", public: false }) { id } }"#,
    ] {
      let (_, resp) = post_graphql(&selfhost_app, Some(&admin_cookie), q, json!({})).await;
      assert_eq!(resp["errors"][0]["extensions"]["status"], 404, "query={q} resp={resp}");
      assert_eq!(resp["errors"][0]["extensions"]["type"], "RESOURCE_NOT_FOUND");
      assert_eq!(resp["errors"][0]["extensions"]["name"], "NOT_FOUND");
      assert_eq!(resp["errors"][0]["extensions"]["message"], "Resource not found.");
    }

    db.pool().close().await;
  });
}

#[test]
fn user_by_email_scope_visibility_and_strict_throttle_parity() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        deployment_mode: server_types::DeploymentMode::Selfhosted,
        dev_mode: false,
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let app = build_router(state);

    let (alice_id, alice_cookie) = seed_user_with_cookie(&db, "alice-scope@example.com", "Alice", false).await;
    let (bob_id, _bob_cookie) = seed_user_with_cookie(&db, "bob-scope@example.com", "Bob", false).await;

    // 1. Unauthenticated Query.user(email) returns null.
    let (st_anon, body_anon) = post_graphql(
      &app,
      None,
      r#"query($email: String!) { user(email: $email) { ... on UserType { id email } } }"#,
      json!({ "email": "alice-scope@example.com" }),
    )
    .await;
    assert_eq!(st_anon, StatusCode::OK);
    assert!(body_anon["errors"].is_null(), "anon errors: {body_anon}");
    assert!(body_anon["data"]["user"].is_null());

    // 2. Authenticated user querying unrelated user returns null; querying self returns UserType (createdAt null).
    let (_, body_unrelated) = post_graphql(
      &app,
      Some(&alice_cookie),
      r#"query($email: String!) { user(email: $email) { ... on UserType { id email createdAt } } }"#,
      json!({ "email": "bob-scope@example.com" }),
    )
    .await;
    assert!(body_unrelated["errors"].is_null(), "unrelated errors: {body_unrelated}");
    assert!(body_unrelated["data"]["user"].is_null());

    let (_, body_self) = post_graphql(
      &app,
      Some(&alice_cookie),
      r#"query($email: String!) { user(email: $email) { ... on UserType { id email createdAt } } }"#,
      json!({ "email": "alice-scope@example.com" }),
    )
    .await;
    assert!(body_self["errors"].is_null(), "self errors: {body_self}");
    assert_eq!(body_self["data"]["user"]["id"].as_str(), Some(alice_id.as_str()));
    assert!(body_self["data"]["user"]["createdAt"].is_null());

    // 3. After joining a shared workspace, Query.user(email) returns the co-member's UserType.
    let ws_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workspaces (id, name, created_at) VALUES ($1, 'Shared Scope WS', now())")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .expect("insert shared workspace");
    for (uid, role) in [(&alice_id, "owner"), (&bob_id, "member")] {
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, source, state, created_at) \
         VALUES ($1, $2, $3, $4, 'legacy', 'active', now())",
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&ws_id)
      .bind(uid)
      .bind(role)
      .execute(db.pool())
      .await
      .expect("insert workspace member");
    }

    let (_, body_member) = post_graphql(
      &app,
      Some(&alice_cookie),
      r#"query($email: String!) { user(email: $email) { ... on UserType { id email createdAt } } }"#,
      json!({ "email": "bob-scope@example.com" }),
    )
    .await;
    assert!(body_member["errors"].is_null(), "member errors: {body_member}");
    assert_eq!(body_member["data"]["user"]["id"].as_str(), Some(bob_id.as_str()));
    assert!(body_member["data"]["user"]["createdAt"].is_null());

    // 3b. uploadAvatar returns non-null UserType.createdAt while currentUser and updateProfile return null.
    let (_, cur_body) = post_graphql(&app, Some(&alice_cookie), "{ currentUser { id createdAt } }", json!({})).await;
    assert!(cur_body["errors"].is_null(), "currentUser errors: {cur_body}");
    assert!(cur_body["data"]["currentUser"]["createdAt"].is_null());

    let (_, upd_body) = post_graphql(
      &app,
      Some(&alice_cookie),
      r#"mutation { updateProfile(input: { name: "Alice Updated" }) { id createdAt } }"#,
      json!({}),
    )
    .await;
    assert!(upd_body["errors"].is_null(), "updateProfile errors: {upd_body}");
    assert!(upd_body["data"]["updateProfile"]["createdAt"].is_null());

    // Minimal valid 1x1 RGB PNG for uploadAvatar.
    const ONE_BY_ONE_PNG: &[u8] = &[
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49,
      0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB0,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let boundary = "----affine-avatar-created-at-boundary";
    let mut mp = Vec::new();
    mp.extend_from_slice(
      format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n\
         {{\"query\":\"mutation($avatar: Upload!) {{ uploadAvatar(avatar: $avatar) {{ id createdAt }} }}\",\"variables\":{{\"avatar\":null}}}}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n\
         {{\"0\":[\"variables.avatar\"]}}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"tiny.png\"\r\n\
         Content-Type: image/png\r\n\r\n"
      )
      .as_bytes(),
    );
    mp.extend_from_slice(ONE_BY_ONE_PNG);
    mp.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let av_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/graphql")
          .header(header::COOKIE, &alice_cookie)
          .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
          )
          .body(Body::from(mp))
          .unwrap(),
      )
      .await
      .expect("uploadAvatar response");
    assert_eq!(av_resp.status(), StatusCode::OK);
    let av_bytes = axum::body::to_bytes(av_resp.into_body(), 1024 * 1024).await.unwrap();
    let av_json: Value = serde_json::from_slice(&av_bytes).unwrap();
    assert!(av_json["errors"].is_null(), "uploadAvatar errors: {av_json}");
    assert_eq!(av_json["data"]["uploadAvatar"]["id"].as_str(), Some(alice_id.as_str()));
    assert!(
      av_json["data"]["uploadAvatar"]["createdAt"]
        .as_str()
        .is_some_and(|s| !s.is_empty()),
      "uploadAvatar must return non-null UserType.createdAt: {av_json}"
    );

    // 4. Strict throttle triggers 429 TOO_MANY_REQUESTS on Query.user(email) and publicUserById.
    let mut user_throttled = false;
    for _ in 0..25 {
      let req = Request::builder()
        .method("POST")
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "198.51.100.11")
        .body(Body::from(
          json!({
            "query": r#"query($email: String!) { user(email: $email) { ... on UserType { id } } }"#,
            "variables": { "email": "alice-scope@example.com" }
          })
          .to_string(),
        ))
        .unwrap();
      let resp = app.clone().oneshot(req).await.unwrap();
      let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
      let val: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
      if val["errors"][0]["extensions"]["status"] == 429
        || val["errors"][0]["extensions"]["type"] == "TOO_MANY_REQUESTS"
      {
        user_throttled = true;
        break;
      }
    }
    assert!(user_throttled, "Query.user(email) must enforce strict throttle (429)");

    let mut pub_user_throttled = false;
    for _ in 0..25 {
      let req = Request::builder()
        .method("POST")
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", "198.51.100.22")
        .body(Body::from(
          json!({
            "query": r#"query($id: String!) { publicUserById(id: $id) { id } }"#,
            "variables": { "id": alice_id }
          })
          .to_string(),
        ))
        .unwrap();
      let resp = app.clone().oneshot(req).await.unwrap();
      let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
      let val: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
      if val["errors"][0]["extensions"]["status"] == 429
        || val["errors"][0]["extensions"]["type"] == "TOO_MANY_REQUESTS"
      {
        pub_user_throttled = true;
        break;
      }
    }
    assert!(
      pub_user_throttled,
      "Query.publicUserById must enforce strict throttle (429)"
    );

    db.pool().close().await;
  });
}
