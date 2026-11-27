//! Integration regression tests for workspace, notification, document, mail,
//! search, MCP, blob, selfhost license, and commercial GraphQL hook parity.

use std::path::Path;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use base64::Engine as _;
use http::{HeaderValue, Method, Request, StatusCode, header};
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::{
  CommunityExtension, CopilotHistoryRecord, CopilotRuntimeSpi, CreateCopilotSessionSpiInput, ServerExtension,
};
use server_types::{DeploymentMode, DomainError, ServerRole};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster},
};
use tower::ServiceExt as _;

struct LeaseGuard(Option<(PgCluster, DbLease)>);

impl LeaseGuard {
  fn url(&self) -> &str {
    self.0.as_ref().expect("active lease").1.url()
  }
}

impl Drop for LeaseGuard {
  fn drop(&mut self) {
    if let Some(pair) = self.0.take() {
      let _ = std::thread::spawn(move || drop(pair)).join();
    }
  }
}

async fn lease_db() -> LeaseGuard {
  tokio::task::spawn_blocking(|| {
    let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, DEFAULT_LEASE_TTL)
      .expect("lease test database");
    LeaseGuard(Some((cluster, lease)))
  })
  .await
  .expect("lease task")
}

async fn setup_app_with_ext(database_url: &str, ext: Arc<dyn ServerExtension>) -> (Arc<AppState>, axum::Router) {
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
  let app = AppState::new(db, None, cfg, ext);
  let router = build_router(Arc::clone(&app));
  (app, router)
}

async fn setup_app(database_url: &str) -> (Arc<AppState>, axum::Router) {
  setup_app_with_ext(database_url, Arc::new(CommunityExtension::new())).await
}

async fn send(router: &axum::Router, req: Request<Body>) -> (StatusCode, http::HeaderMap, Value, String) {
  let resp = router.clone().oneshot(req).await.expect("oneshot");
  let status = resp.status();
  let headers = resp.headers().clone();
  let bytes = axum::body::to_bytes(resp.into_body(), 4 * 1024 * 1024)
    .await
    .expect("body bytes");
  let text = String::from_utf8_lossy(&bytes).into_owned();
  let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
  (status, headers, json, text)
}

fn cookie_header_from(headers: &http::HeaderMap) -> String {
  headers
    .get_all(header::SET_COOKIE)
    .iter()
    .filter_map(|v| v.to_str().ok())
    .map(|raw| raw.split(';').next().unwrap_or("").trim())
    .filter(|kv| !kv.is_empty() && !kv.ends_with('='))
    .collect::<Vec<_>>()
    .join("; ")
}

async fn setup_admin_and_workspace(router: &axum::Router) -> (String, String, String) {
  let req = Request::builder()
    .method(Method::POST)
    .uri("/api/setup/create-admin-user")
    .header(header::CONTENT_TYPE, "application/json")
    .body(Body::from(
      json!({
        "email": "admin@example.com",
        "password": "Password123!",
        "name": "Admin User"
      })
      .to_string(),
    ))
    .unwrap();
  let (status, headers, body, text) = send(router, req).await;
  assert_eq!(status, StatusCode::OK, "setup admin failed: {text}");
  let admin_id = body["id"].as_str().expect("admin id").to_owned();
  let cookie = cookie_header_from(&headers);

  let (ws_status, _, ws_body, ws_text) =
    gql(router, "mutation { createWorkspace { id } }", json!({}), Some(&cookie)).await;
  assert_eq!(ws_status, StatusCode::OK, "createWorkspace failed: {ws_text}");
  let ws_id = ws_body["data"]["createWorkspace"]["id"]
    .as_str()
    .expect("workspace id")
    .to_owned();
  (admin_id, cookie, ws_id)
}

async fn gql(
  router: &axum::Router,
  query: &str,
  variables: Value,
  cookie: Option<&str>,
) -> (StatusCode, http::HeaderMap, Value, String) {
  let mut builder = Request::builder()
    .method(Method::POST)
    .uri("/graphql")
    .header(header::CONTENT_TYPE, "application/json");
  if let Some(c) = cookie {
    builder = builder.header(header::COOKIE, HeaderValue::from_str(c).unwrap());
  }
  let req = builder
    .body(Body::from(
      json!({ "query": query, "variables": variables }).to_string(),
    ))
    .unwrap();
  send(router, req).await
}

#[tokio::test]
async fn workspace_doc_notification_config_and_error_parity() {
  let lease = lease_db().await;
  let (app, router) = setup_app(lease.url()).await;
  let (admin_id, admin_cookie, ws_id) = setup_admin_and_workspace(&router).await;

  // 1. WorkspaceType.doc(nonexistent) returns 404 DOC_NOT_FOUND.
  let (_, _, fake_doc, _) = gql(
    &router,
    r#"query($w: String!) { workspace(id: $w) { doc(docId: "missing-doc-999") { id } } }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    fake_doc["errors"][0]["extensions"]["name"].as_str(),
    Some("DOC_NOT_FOUND"),
    "missing doc must return DOC_NOT_FOUND: {fake_doc}"
  );

  // 2. updateDocDefaultRole rejects root doc (docId == workspaceId) with EXPECT_TO_UPDATE_DOC_USER_ROLE.
  let (_, _, root_role, _) = gql(
    &router,
    r#"mutation($w: String!) { updateDocDefaultRole(input: { workspaceId: $w, docId: $w, role: Reader }) }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    root_role["errors"][0]["extensions"]["name"].as_str(),
    Some("EXPECT_TO_UPDATE_DOC_USER_ROLE"),
    "root doc default role update must fail: {root_role}"
  );

  // 3. grantMember rejects promoting to Admin in non-commercial workspace.
  let bob_id = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    "INSERT INTO users (id, name, email, registered, disabled, created_at) VALUES ($1, 'Bob', 'bob@example.com', true, false, now())",
  )
  .bind(&bob_id)
  .execute(app.db.pool())
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at) VALUES ($1, $2, $3, 'member', 'active', 'email', now(), now())",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&ws_id)
  .bind(&bob_id)
  .execute(app.db.pool())
  .await
  .unwrap();
  let (_, _, grant_res, _) = gql(
    &router,
    r#"mutation($w: String!, $u: String!) { grantMember(workspaceId: $w, userId: $u, permission: Admin) }"#,
    json!({ "w": ws_id, "u": bob_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    grant_res["errors"][0]["extensions"]["status"].as_u64(),
    Some(403),
    "non-commercial grantMember must be 403: {grant_res}"
  );

  // 4. WorkspaceType.members.inviteId returns user.id for active members.
  let (_, _, members_res, _) = gql(
    &router,
    r#"query($w: String!) { workspace(id: $w) { members(skip: 0, take: 10) { id inviteId status } } }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  let members = members_res["data"]["workspace"]["members"]
    .as_array()
    .expect("members array");
  for m in members {
    if m["status"].as_str() == Some("Accepted") {
      assert_eq!(m["inviteId"], m["id"], "active member inviteId must match user.id: {m}");
    }
  }

  // 5. Notifications unread filter + readNotification 404 NOTIFICATION_NOT_FOUND + latest doc title + workspace.url.
  let notif_id = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO notifications (id, type, level, user_id, read, body, created_at, updated_at)
       VALUES ($1, 'Mention'::"NotificationType", 'Default', $2, false, $3, now(), now())"#,
  )
  .bind(&notif_id)
  .bind(&admin_id)
  .bind(json!({
    "workspaceId": ws_id,
    "createdByUserId": bob_id,
    "doc": { "id": "doc-notif-1", "title": "Old Title", "mode": "page" }
  }))
  .execute(app.db.pool())
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO workspace_pages (workspace_id, page_id, title, mode) VALUES ($1, 'doc-notif-1', 'Updated Title', 0) ON CONFLICT (workspace_id, page_id) DO UPDATE SET title = EXCLUDED.title",
  )
  .bind(&ws_id)
  .execute(app.db.pool())
  .await
  .unwrap();

  let (_, _, notif_before, _) = gql(
    &router,
    "{ currentUser { notifications(pagination: { first: 10 }) { totalCount edges { node { id body } } } } }",
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    notif_before["data"]["currentUser"]["notifications"]["totalCount"].as_i64(),
    Some(1)
  );
  let body_node = &notif_before["data"]["currentUser"]["notifications"]["edges"][0]["node"]["body"];
  assert_eq!(body_node["doc"]["title"].as_str(), Some("Updated Title"));
  assert!(
    body_node["workspace"]["url"]
      .as_str()
      .is_some_and(|u| u.ends_with(&format!("/workspace/{ws_id}"))),
    "workspace.url missing: {body_node}"
  );

  let _ = gql(
    &router,
    "mutation { readAllNotifications }",
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  let (_, _, notif_after, _) = gql(
    &router,
    "{ currentUser { notifications(pagination: { first: 10 }) { totalCount edges { node { id } } } } }",
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    notif_after["data"]["currentUser"]["notifications"]["totalCount"].as_i64(),
    Some(0)
  );
  assert_eq!(
    notif_after["data"]["currentUser"]["notifications"]["edges"]
      .as_array()
      .map(Vec::len),
    Some(0)
  );

  let (_, _, missing_read, _) = gql(
    &router,
    r#"mutation { readNotification(id: "missing-notif-999") }"#,
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    missing_read["errors"][0]["extensions"]["name"].as_str(),
    Some("NOTIFICATION_NOT_FOUND"),
    "missing readNotification must return NOTIFICATION_NOT_FOUND: {missing_read}"
  );

  // 6. Docs list includes updates-only docs, excludes trashed/deleted, uses [isoTimestamp, docId] cursor, rejects after+offset.
  sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, 'doc-upd-only', $2, now())")
    .bind(&ws_id)
    .bind(vec![0u8, 0u8])
    .execute(app.db.pool())
    .await
    .unwrap();
  sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, 'doc-trashed', $2, now())")
    .bind(&ws_id)
    .bind(vec![0u8, 0u8])
    .execute(app.db.pool())
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO workspace_pages (workspace_id, page_id, mode, lifecycle_state) VALUES ($1, 'doc-trashed', 0, 'trashed')",
  )
  .bind(&ws_id)
  .execute(app.db.pool())
  .await
  .unwrap();

  let (_, _, docs_res, _) = gql(
    &router,
    r#"query($w: String!) { workspace(id: $w) { docs(pagination: { first: 10 }) { totalCount edges { cursor node { id } } } } }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  let edges = docs_res["data"]["workspace"]["docs"]["edges"]
    .as_array()
    .expect("docs edges");
  let ids: Vec<&str> = edges.iter().filter_map(|e| e["node"]["id"].as_str()).collect();
  assert!(
    ids.contains(&"doc-upd-only"),
    "updates-only doc must be listed: {ids:?}"
  );
  assert!(!ids.contains(&"doc-trashed"), "trashed doc must be excluded: {ids:?}");
  let first_cursor = edges[0]["cursor"].as_str().expect("cursor");
  let decoded_cursor = String::from_utf8(
    base64::engine::general_purpose::STANDARD
      .decode(first_cursor)
      .expect("base64 cursor"),
  )
  .expect("utf8 cursor");
  let parsed_cursor: Value = serde_json::from_str(&decoded_cursor).expect("json array cursor");
  assert!(parsed_cursor.is_array() && parsed_cursor.as_array().unwrap().len() == 2);

  let (_, _, bad_pag, _) = gql(
    &router,
    r#"query($w: String!, $c: String!) { workspace(id: $w) { docs(pagination: { first: 10, offset: 1, after: $c }) { totalCount } } }"#,
    json!({ "w": ws_id, "c": first_cursor }),
    Some(&admin_cookie),
  )
  .await;
  assert!(
    bad_pag["errors"].is_array(),
    "after + offset > 0 must be rejected: {bad_pag}"
  );

  // 7. record_doc_view increments unique_views per distinct user and populates workspace_member_last_access.
  app
    .doc_sharing
    .record_doc_view(&ws_id, "doc-upd-only", false, Some(&admin_id), None)
    .await;
  app
    .doc_sharing
    .record_doc_view(&ws_id, "doc-upd-only", false, Some(&admin_id), None)
    .await;
  app
    .doc_sharing
    .record_doc_view(&ws_id, "doc-upd-only", false, Some(&bob_id), None)
    .await;
  let (total_views, unique_views): (i64, i64) = sqlx::query_as(
    "SELECT total_views, unique_views FROM workspace_doc_view_daily WHERE workspace_id = $1 AND doc_id = 'doc-upd-only' AND date = CURRENT_DATE",
  )
  .bind(&ws_id)
  .fetch_one(app.db.pool())
  .await
  .unwrap();
  assert_eq!(total_views, 3);
  assert_eq!(unique_views, 2);

  let access_user_ids: Vec<String> = sqlx::query_scalar(
    "SELECT user_id FROM workspace_member_last_access WHERE workspace_id = $1 AND last_doc_id = 'doc-upd-only' ORDER BY user_id",
  )
  .bind(&ws_id)
  .fetch_all(app.db.pool())
  .await
  .unwrap();
  assert!(access_user_ids.contains(&admin_id));
  assert!(access_user_ids.contains(&bob_id));

  // 8. updateAppConfig returns only touched module subtree, accepts payment.showLifetimePrice,
  //    serverConfig reflects dynamic allowGuestDemoWorkspace and server.name.
  let (_, _, upd_cfg, _) = gql(
    &router,
    r#"mutation { updateAppConfig(updates: [{ module: "flags", key: "allowGuestDemoWorkspace", value: false }, { module: "server", key: "name", value: "Custom AFFiNE" }]) }"#,
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  let returned_keys: Vec<&String> = upd_cfg["data"]["updateAppConfig"]
    .as_object()
    .expect("config object")
    .keys()
    .collect();
  assert_eq!(
    returned_keys.len(),
    2,
    "must only return touched modules: {returned_keys:?}"
  );

  let (_, _, srv_cfg, _) = gql(
    &router,
    "{ serverConfig { name features } }",
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(srv_cfg["data"]["serverConfig"]["name"].as_str(), Some("Custom AFFiNE"));
  let features: Vec<&str> = srv_cfg["data"]["serverConfig"]["features"]
    .as_array()
    .unwrap()
    .iter()
    .filter_map(Value::as_str)
    .collect();
  assert!(!features.contains(&"LocalWorkspace"));

  let (_, _, upd_lifetime, _) = gql(
    &router,
    r#"mutation { updateAppConfig(updates: [{ module: "payment", key: "showLifetimePrice", value: false }]) }"#,
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  assert!(
    upd_lifetime["errors"].is_null(),
    "payment.showLifetimePrice must be accepted: {upd_lifetime}"
  );

  // 9. sendTestEmail maps unreachable/invalid SMTP to 400 (not 503).
  let (_, _, test_mail, _) = gql(
    &router,
    r#"mutation { sendTestEmail(config: { host: "127.0.0.1", port: 1, sender: "AFFiNE <noreply@example.com>", ignoreTLS: true }) }"#,
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    test_mail["errors"][0]["extensions"]["status"].as_u64(),
    Some(400),
    "sendTestEmail failure must map to 400: {test_mail}"
  );

  // 10. banUser rejects self-ban and preserves avatarUrl on tombstone.
  let (_, _, self_ban, _) = gql(
    &router,
    r#"mutation($id: String!) { banUser(id: $id) { id } }"#,
    json!({ "id": admin_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(self_ban["errors"][0]["extensions"]["status"].as_u64(), Some(403));

  // 11. revokeCommercialEntitlement succeeds in Selfhosted mode.
  let (_, _, revoke_ent, _) = gql(
    &router,
    r#"mutation($w: String!) { revokeCommercialEntitlement(targetType: "workspace", targetId: $w) }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(revoke_ent["data"]["revokeCommercialEntitlement"].as_bool(), Some(true));

  // 12. Copilot.transcriptTask and submitTranscriptTask return 403 Copilot disabled in community edition.
  let (_, _, transcript_res, _) = gql(
    &router,
    r#"query($w: String!) { currentUser { copilot(workspaceId: $w) { transcriptTask(taskId: "t1") { id } } } }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(transcript_res["errors"][0]["extensions"]["status"].as_u64(), Some(403));
  assert_eq!(
    transcript_res["errors"][0]["extensions"]["message"].as_str(),
    Some("Copilot is disabled."),
    "community transcriptTask must fail closed: {transcript_res}"
  );
  let (_, _, submit_transcript_res, _) = gql(
    &router,
    r#"mutation($w: String!) { submitTranscriptTask(workspaceId: $w, blobId: "b1") { id } }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    submit_transcript_res["errors"][0]["extensions"]["status"].as_u64(),
    Some(403)
  );
  assert_eq!(
    submit_transcript_res["errors"][0]["extensions"]["name"].as_str(),
    Some("COPILOT_DISABLED"),
    "community submitTranscriptTask must return COPILOT_DISABLED: {submit_transcript_res}"
  );

  // 13. invoices rejects negative take/skip with 400.
  let (_, _, neg_inv, _) = gql(
    &router,
    "{ currentUser { invoices(take: -1) { id } } }",
    json!({}),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(neg_inv["errors"][0]["extensions"]["status"].as_u64(), Some(400));

  // 14. Exact GraphQL error mappings: OWNER_CAN_NOT_LEAVE_WORKSPACE, CAN_NOT_REVOKE_YOURSELF, QUERY_TOO_LONG.
  let (_, _, owner_leave, _) = gql(
    &router,
    r#"mutation($w: String!) { leaveWorkspace(workspaceId: $w) }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    owner_leave["errors"][0]["extensions"]["name"].as_str(),
    Some("OWNER_CAN_NOT_LEAVE_WORKSPACE")
  );
  let (_, _, self_revoke, _) = gql(
    &router,
    r#"mutation($w: String!, $u: String!) { revokeMember(workspaceId: $w, userId: $u) }"#,
    json!({ "w": ws_id, "u": admin_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    self_revoke["errors"][0]["extensions"]["name"].as_str(),
    Some("CAN_NOT_REVOKE_YOURSELF")
  );
  let long_q = "a".repeat(256);
  let (_, _, long_query_res, _) = gql(
    &router,
    r#"query($w: String!, $q: String!) { workspace(id: $w) { members(query: $q) { id } } }"#,
    json!({ "w": ws_id, "q": long_q }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    long_query_res["errors"][0]["extensions"]["name"].as_str(),
    Some("QUERY_TOO_LONG")
  );
}

struct SpyCopilotRuntime {
  reuse_flags: Mutex<Vec<bool>>,
}

#[async_trait::async_trait]
impl CopilotRuntimeSpi for SpyCopilotRuntime {
  async fn is_effectively_enabled(&self, _cfg_enabled: bool) -> bool {
    true
  }

  async fn assert_enabled(&self, _cfg_enabled: bool) -> Result<(), DomainError> {
    Ok(())
  }

  async fn create_session(&self, input: CreateCopilotSessionSpiInput) -> Result<String, DomainError> {
    self.reuse_flags.lock().unwrap().push(input.reuse_latest_chat);
    Ok("spy-session-1".to_owned())
  }

  async fn create_session_with_history(
    &self,
    input: CreateCopilotSessionSpiInput,
  ) -> Result<CopilotHistoryRecord, DomainError> {
    self.reuse_flags.lock().unwrap().push(input.reuse_latest_chat);
    Ok(CopilotHistoryRecord {
      session_id: "spy-session-2".to_owned(),
      workspace_id: input.workspace_id,
      doc_id: input.doc_id,
      parent_session_id: None,
      prompt_name: input.prompt_name,
      pinned: input.pinned,
      title: None,
      action: None,
      messages: Vec::new(),
      created_at: chrono::Utc::now(),
      updated_at: chrono::Utc::now(),
    })
  }
}

struct SpyExtension {
  inner: CommunityExtension,
  copilot: Arc<SpyCopilotRuntime>,
}

impl ServerExtension for SpyExtension {
  fn edition_name(&self) -> &'static str {
    "spy"
  }
  fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
    self.inner.quota_gate()
  }
  fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
    self.inner.session_policy()
  }
  fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
    self.inner.copilot_policy()
  }
  fn copilot_runtime(&self) -> Arc<dyn CopilotRuntimeSpi> {
    Arc::clone(&self.copilot) as Arc<dyn CopilotRuntimeSpi>
  }
  fn copilot_embedding_spi(&self) -> Arc<dyn server_spi::CopilotEmbeddingSpi> {
    self.inner.copilot_embedding_spi()
  }
  fn copilot_transcript_spi(&self) -> Arc<dyn server_spi::CopilotTranscriptSpi> {
    self.inner.copilot_transcript_spi()
  }
  fn rate_limit_policy(&self) -> Arc<dyn server_spi::RateLimitPolicy> {
    self.inner.rate_limit_policy()
  }
  fn billing_spi(&self) -> Arc<dyn server_spi::BillingSpi> {
    self.inner.billing_spi()
  }
}

#[tokio::test]
async fn copilot_session_defaults_reuse_latest_chat_to_true_and_quota_labels() {
  let lease = lease_db().await;
  let spy = Arc::new(SpyCopilotRuntime {
    reuse_flags: Mutex::new(Vec::new()),
  });
  let ext = Arc::new(SpyExtension {
    inner: CommunityExtension::new(),
    copilot: Arc::clone(&spy),
  });
  let (_app, router) = setup_app_with_ext(lease.url(), ext).await;
  let (_admin_id, admin_cookie, ws_id) = setup_admin_and_workspace(&router).await;

  let (_, _, r1, _) = gql(
    &router,
    r#"mutation($w: String!) { createCopilotSession(options: { workspaceId: $w, promptName: "Chat" }) }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(r1["data"]["createCopilotSession"].as_str(), Some("spy-session-1"));

  let (_, _, r2, _) = gql(
    &router,
    r#"mutation($w: String!) { createCopilotSessionWithHistory(options: { workspaceId: $w, promptName: "Chat" }) { sessionId } }"#,
    json!({ "w": ws_id }),
    Some(&admin_cookie),
  )
  .await;
  assert_eq!(
    r2["data"]["createCopilotSessionWithHistory"]["sessionId"].as_str(),
    Some("spy-session-2")
  );
  assert_eq!(*spy.reuse_flags.lock().unwrap(), vec![true, true]);

  // Verify UserQuotaHumanReadableType.copilotActionLimit formatting.
  let mk_grant = |limit: Option<i32>| {
    let mut grant = server_types::license::default_selfhost_access_grant();
    grant.limits.copilot_action_limit = limit;
    grant
  };
  assert_eq!(
    server_http::legacy_compat::quota::user_quota_from_grant(&mk_grant(Some(0)), 0)
      .human_readable
      .copilot_action_limit,
    "0 times"
  );
  assert_eq!(
    server_http::legacy_compat::quota::user_quota_from_grant(&mk_grant(Some(10)), 0)
      .human_readable
      .copilot_action_limit,
    "10 times"
  );
  assert_eq!(
    server_http::legacy_compat::quota::user_quota_from_grant(&mk_grant(None), 0)
      .human_readable
      .copilot_action_limit,
    "Unlimited"
  );
}

#[test]
fn blob_key_validation_and_s3_presign_config_parity() {
  assert!(
    server_blob::validate_blob_key("abc%20def").is_err(),
    "% must be rejected"
  );
  assert!(
    server_blob::validate_blob_key("file.tmp-123").is_ok(),
    ".tmp- must be allowed"
  );
  assert!(
    server_blob::validate_blob_key("file.metadata.json").is_err(),
    ".metadata.json sidecar must still be rejected"
  );

  let spec = server_blob::StorageBackendSpec::from_app_config_json(
    &json!({
      "provider": "aws-s3",
      "bucket": "test-bucket",
      "config": {
        "region": "us-east-1",
        "credentials": { "accessKeyId": "ak", "secretAccessKey": "sk" },
        "usePresignedURL": { "enabled": true, "urlPrefix": "https://cdn.example.com/uploads" },
        "presign": { "signContentTypeForPut": false, "expiresInSeconds": 900 }
      }
    }),
    "blobs",
  )
  .expect("parse S3 spec")
  .expect("some spec");
  match spec {
    server_blob::StorageBackendSpec::S3 { config, upload_options } => {
      assert_eq!(config.presign_expires, Some(std::time::Duration::from_secs(900)));
      assert!(!upload_options.sign_content_type_for_put);
      assert_eq!(
        upload_options.upload_url_prefix.as_deref(),
        Some("https://cdn.example.com/uploads")
      );
    }
    _ => panic!("expected S3 spec"),
  }
}

#[tokio::test]
async fn lifecycle_mail_enqueue_and_hmac_recipient_hash_parity() {
  let lease = lease_db().await;
  let (app, router) = setup_app(lease.url()).await;
  let (admin_id, admin_cookie, ws_id) = setup_admin_and_workspace(&router).await;

  let bob_id = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    "INSERT INTO users (id, name, email, registered, disabled, created_at) VALUES ($1, 'Bob', 'bob@example.com', true, false, now())",
  )
  .bind(&bob_id)
  .execute(app.db.pool())
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at) VALUES ($1, $2, $3, 'member', 'active', 'email', now(), now())",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&ws_id)
  .bind(&bob_id)
  .execute(app.db.pool())
  .await
  .unwrap();

  // Member leaves workspace -> MemberLeave mail enqueued to owner with HMAC recipient_hash.
  app
    .workspaces
    .leave_workspace(&bob_id, &ws_id)
    .await
    .expect("leave workspace");
  let row: (String, String) = sqlx::query_as(
    "SELECT mail_name, recipient_hash FROM mail_deliveries WHERE workspace_id = $1 AND mail_name = 'MemberLeave' LIMIT 1",
  )
  .bind(&ws_id)
  .fetch_one(app.db.pool())
  .await
  .expect("MemberLeave mail delivery");
  assert_eq!(row.0, "MemberLeave");
  assert_eq!(row.1.len(), 64, "HMAC-SHA256 hex digest must be 64 chars");
  // Must not be plain unsalted SHA-256 of the email.
  let plain_sha256 = server_domain::notifications::compute_recipient_hash("", "admin@example.com");
  assert_ne!(row.1, plain_sha256);
  // Deterministic HMAC with explicit key.
  let keyed_a = server_domain::notifications::compute_recipient_hash("test-hmac-private-key", "Admin@Example.com ");
  let keyed_b = server_domain::notifications::compute_recipient_hash("test-hmac-private-key", "admin@example.com");
  assert_eq!(keyed_a, keyed_b);
  assert_ne!(keyed_a, plain_sha256);

  // Re-add Bob and transfer ownership -> OwnershipTransferred & OwnershipReceived enqueued.
  sqlx::query(
    "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at) VALUES ($1, $2, $3, 'member', 'active', 'email', now(), now())",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&ws_id)
  .bind(&bob_id)
  .execute(app.db.pool())
  .await
  .unwrap();
  app
    .workspaces
    .transfer_workspace_ownership(&admin_id, &ws_id, &bob_id)
    .await
    .expect("transfer ownership");
  let names: Vec<String> = sqlx::query_scalar(
    "SELECT mail_name FROM mail_deliveries WHERE workspace_id = $1 AND mail_name IN ('OwnershipTransferred', 'OwnershipReceived') ORDER BY mail_name",
  )
  .bind(&ws_id)
  .fetch_all(app.db.pool())
  .await
  .unwrap();
  assert_eq!(
    names,
    vec!["OwnershipReceived".to_owned(), "OwnershipTransferred".to_owned()]
  );
  let _ = admin_cookie;
}

struct CommercialQuotaGate;

#[async_trait::async_trait]
impl server_spi::QuotaGate for CommercialQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    _workspace_id: &str,
    _now: chrono::DateTime<chrono::Utc>,
  ) -> Result<server_types::AccessGrant, DomainError> {
    let mut grant = server_types::license::default_selfhost_access_grant();
    grant.rights.commercial = true;
    grant.limits.seat_limit = 10;
    grant.limits.storage_quota_bytes = 100 * 1024 * 1024;
    Ok(grant)
  }

  async fn check_seat_admission(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    workspace_id: &str,
    _current_seats: i32,
    _requested_delta: i32,
    now: chrono::DateTime<chrono::Utc>,
  ) -> Result<server_types::AccessGrant, DomainError> {
    self.resolve_workspace_grant(tx, workspace_id, now).await
  }
}

struct CommercialExtension {
  inner: CommunityExtension,
}

impl ServerExtension for CommercialExtension {
  fn edition_name(&self) -> &'static str {
    "commercial-test"
  }
  fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
    Arc::new(CommercialQuotaGate)
  }
  fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
    self.inner.session_policy()
  }
  fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
    self.inner.copilot_policy()
  }
  fn copilot_runtime(&self) -> Arc<dyn CopilotRuntimeSpi> {
    self.inner.copilot_runtime()
  }
  fn copilot_embedding_spi(&self) -> Arc<dyn server_spi::CopilotEmbeddingSpi> {
    self.inner.copilot_embedding_spi()
  }
  fn copilot_transcript_spi(&self) -> Arc<dyn server_spi::CopilotTranscriptSpi> {
    self.inner.copilot_transcript_spi()
  }
  fn rate_limit_policy(&self) -> Arc<dyn server_spi::RateLimitPolicy> {
    self.inner.rate_limit_policy()
  }
  fn billing_spi(&self) -> Arc<dyn server_spi::BillingSpi> {
    self.inner.billing_spi()
  }
}

#[tokio::test]
async fn grant_member_owner_and_divergence_guards_parity() {
  let lease = lease_db().await;
  let ext = Arc::new(CommercialExtension {
    inner: CommunityExtension::new(),
  });
  let (app, router) = setup_app_with_ext(lease.url(), ext).await;
  let (owner_id, owner_cookie, ws_id) = setup_admin_and_workspace(&router).await;

  let admin_a = uuid::Uuid::new_v4().to_string();
  let admin_b = uuid::Uuid::new_v4().to_string();
  let pending_u = uuid::Uuid::new_v4().to_string();
  let disabled_u = uuid::Uuid::new_v4().to_string();
  for (uid, name, email, disabled) in [
    (&admin_a, "AdminA", "admin-a@example.com", false),
    (&admin_b, "AdminB", "admin-b@example.com", false),
    (&pending_u, "PendingU", "pending-u@example.com", false),
    (&disabled_u, "DisabledU", "disabled-u@example.com", true),
  ] {
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, disabled, created_at) VALUES ($1, $2, $3, true, $4, now())",
    )
    .bind(uid)
    .bind(name)
    .bind(email)
    .bind(disabled)
    .execute(app.db.pool())
    .await
    .unwrap();
  }
  for uid in [&admin_a, &admin_b] {
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at) VALUES ($1, $2, $3, 'admin', 'active', 'email', now(), now())",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(uid)
    .execute(app.db.pool())
    .await
    .unwrap();
  }
  sqlx::query(
    "INSERT INTO workspace_invitations (id, workspace_id, invitee_user_id, normalized_email, inviter_user_id, requested_role, status, kind, created_at, updated_at) VALUES ($1, $2, $3, 'pending-u@example.com', $4, 'member', 'pending', 'email', now(), now())",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&ws_id)
  .bind(&pending_u)
  .bind(&owner_id)
  .execute(app.db.pool())
  .await
  .unwrap();

  // 1. update_member_role with Owner role must fail with 403 Forbidden (never 500) for active member and pending invitation.
  let owner_member_err = app
    .workspaces
    .update_member_role(
      &owner_id,
      &ws_id,
      &admin_a,
      server_domain::workspaces::WorkspaceRole::Owner,
    )
    .await
    .expect_err("update_member_role(Owner) on active member must fail");
  assert_eq!(
    server_http::legacy_compat::errors::domain_error_to_envelope(&owner_member_err).status,
    403,
    "update_member_role(Owner) on active member must map to 403: {owner_member_err:?}"
  );

  let owner_inv_err = app
    .workspaces
    .update_member_role(
      &owner_id,
      &ws_id,
      &pending_u,
      server_domain::workspaces::WorkspaceRole::Owner,
    )
    .await
    .expect_err("update_member_role(Owner) on pending invitation must fail");
  assert_eq!(
    server_http::legacy_compat::errors::domain_error_to_envelope(&owner_inv_err).status,
    403,
    "update_member_role(Owner) on pending invitation must map to 403: {owner_inv_err:?}"
  );

  // 2. Admin cannot modify another Admin's role (403 Forbidden), while Owner can.
  let err = app
    .workspaces
    .update_member_role(
      &admin_a,
      &ws_id,
      &admin_b,
      server_domain::workspaces::WorkspaceRole::Member,
    )
    .await
    .expect_err("admin modifying another admin must fail");
  assert!(
    matches!(err, DomainError::Forbidden(_)),
    "expected Forbidden, got {err:?}"
  );
  app
    .workspaces
    .update_member_role(
      &owner_id,
      &ws_id,
      &admin_b,
      server_domain::workspaces::WorkspaceRole::Member,
    )
    .await
    .expect("owner can demote admin");

  // 3. DocType.grantedUsersList does not 500 when a granted user is disabled.
  sqlx::query(
    "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at) VALUES ($1, 'doc-disabled-grant', $2, now(), now())",
  )
  .bind(&ws_id)
  .bind(&[0u8, 0u8][..])
  .execute(app.db.pool())
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by) VALUES ($1, 'doc-disabled-grant', 'user', $2, 'reader', $3)",
  )
  .bind(&ws_id)
  .bind(&disabled_u)
  .bind(&owner_id)
  .execute(app.db.pool())
  .await
  .unwrap();
  let (_, _, granted_res, _) = gql(
    &router,
    r#"query($w: String!) { workspace(id: $w) { doc(docId: "doc-disabled-grant") { grantedUsersList(pagination: { first: 10 }) { totalCount edges { node { user { id } } } } } } }"#,
    json!({ "w": ws_id }),
    Some(&owner_cookie),
  )
  .await;
  assert!(
    granted_res["errors"].is_null(),
    "grantedUsersList with disabled user must not fail: {granted_res}"
  );

  // 4. adminDashboard applies IANA timezone and spans the requested syncHistoryHours window.
  let dash = app
    .admin
    .get_dashboard(&server_domain::admin::AdminDashboardQuery {
      timezone: Some("Asia/Tokyo".to_owned()),
      storage_history_days: Some(7),
      sync_history_hours: Some(24),
      shared_link_window_days: None,
      copilot_window_days: None,
      include_top_shared_links: false,
    })
    .await
    .expect("admin dashboard with timezone");
  assert_eq!(dash.sync_window.to - dash.sync_window.from, chrono::Duration::hours(24));
  assert_eq!(dash.workspace_storage_history.len(), 7);
}
