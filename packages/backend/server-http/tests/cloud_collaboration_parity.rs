//! End-to-end integration tests for public document sharing, doc grants,
//! snapshot histories & recovery, background compaction/housekeeping,
//! comments & attachments, notifications, user settings, account deletion,
//! Open-App sign-in codes, and self-hosted license management.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use chrono::{Duration, Utc};
use p256::ecdsa::{DerSignature, SigningKey, VerifyingKey, signature::Signer as _};
use p256::pkcs8::{EncodePublicKey as _, LineEnding};
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_domain::histories::{
  cleanup_expired_blob_reservations, cleanup_expired_runtime_states, cleanup_expired_snapshot_histories,
  cleanup_expired_user_sessions, compact_pending_doc_updates,
};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::CommunityExtension;
use server_types::ServerRole;
use server_types::license::{
  Keyring, LICENSE_AUDIENCE_SELFHOST, LicenseClaimsV2, LicenseEnvelopeV2, LicenseLimitsV2, LicenseRightsV2,
  LicenseScopeV2, PRO_KID,
};
use tower::ServiceExt as _;

async fn body_json(resp: axum::response::Response) -> Value {
  let bytes = axum::body::to_bytes(resp.into_body(), 10 * 1024 * 1024).await.unwrap();
  serde_json::from_slice(&bytes)
    .unwrap_or_else(|e| panic!("expected json body ({e}): {}", String::from_utf8_lossy(&bytes)))
}

async fn body_bytes(resp: axum::response::Response) -> Vec<u8> {
  axum::body::to_bytes(resp.into_body(), 10 * 1024 * 1024)
    .await
    .unwrap()
    .to_vec()
}

fn cookie_header_from_response(resp: &axum::response::Response) -> String {
  resp
    .headers()
    .get_all(header::SET_COOKIE)
    .iter()
    .filter_map(|v| v.to_str().ok())
    .filter_map(|s| s.split(';').next())
    .collect::<Vec<_>>()
    .join("; ")
}

async fn gql(router: &axum::Router, cookie: Option<&str>, query: &str, variables: Value) -> (StatusCode, Value) {
  let mut builder = Request::builder()
    .method(Method::POST)
    .uri("/graphql")
    .header(header::CONTENT_TYPE, "application/json");
  if let Some(c) = cookie {
    builder = builder.header(header::COOKIE, c);
  }
  let req = builder
    .body(Body::from(
      serde_json::to_vec(&json!({ "query": query, "variables": variables })).unwrap(),
    ))
    .unwrap();
  let resp = router.clone().oneshot(req).await.unwrap();
  let status = resp.status();
  let json = body_json(resp).await;
  (status, json)
}

#[test]
fn doc_sharing_histories_comments_notifications_open_app_and_selfhost_license() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .unwrap();

  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .expect("connect test db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema for fresh ensure_schema_ready");
    db.ensure_schema_ready().await.expect("ensure schema ready");

    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        ..RuntimeConfig::default()
      },
      Arc::new(CommunityExtension::new()),
    );
    let router = build_router(Arc::clone(&state));

    // 1. Setup admin user & create workspace.
    let setup_resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::POST)
          .uri("/api/setup/create-admin-user")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            serde_json::to_vec(&json!({
              "name": "Owner Admin",
              "email": "owner-collab@affine.test",
              "password": "Owner-Password-123!"
            }))
            .unwrap(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(setup_resp.status(), StatusCode::OK);
    let owner_cookie = cookie_header_from_response(&setup_resp);
    let owner_id = body_json(setup_resp).await["id"].as_str().unwrap().to_owned();

    // Create a second user in the same workspace.
    let member_id = format!("usr_{}", uuid::Uuid::new_v4().simple());
    sqlx::query("INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, 'Member Two', 'member2@affine.test', true, false)")
      .bind(&member_id)
      .execute(db.pool())
      .await
      .unwrap();

    let (_, ws_resp) = gql(
      &router,
      Some(&owner_cookie),
      "mutation { createWorkspace { id } }",
      json!({}),
    )
    .await;
    let ws_id = ws_resp["data"]["createWorkspace"]["id"].as_str().unwrap().to_owned();

    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, source, state) VALUES ($1, $2, $3, 'member', 'legacy', 'active')",
    )
    .bind(format!("perm_{}", uuid::Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();

    // Seed root doc (with one public and one private page) + two page snapshots.
    let root = y_octo::Doc::default();
    let mut meta = root.get_or_create_map("meta").unwrap();
    meta
      .insert("name".to_owned(), y_octo::Any::String("Collab WS".to_owned()))
      .unwrap();
    let mut pages = root.create_array().unwrap();
    for (id, title) in [("doc-pub", "Public Doc"), ("doc-priv", "Secret Private Doc")] {
      let mut p = root.create_map().unwrap();
      p.insert("id".to_owned(), y_octo::Any::String(id.to_owned())).unwrap();
      p.insert("title".to_owned(), y_octo::Any::String(title.to_owned()))
        .unwrap();
      pages.push(p).unwrap();
    }
    meta.insert("pages".to_owned(), pages).unwrap();
    let root_bin = root.encode_update_v1().unwrap();
    let page_doc = y_octo::Doc::default();
    page_doc
      .get_or_create_text("content")
      .unwrap()
      .insert(0, "hello shared world")
      .unwrap();
    let page_bin = page_doc.encode_update_v1().unwrap();

    for (guid, bin) in [
      (ws_id.as_str(), root_bin.as_slice()),
      ("doc-pub", page_bin.as_slice()),
      ("doc-priv", page_bin.as_slice()),
    ] {
      sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, updated_at, created_by, updated_by) VALUES ($1, $2, $3, now(), $4, $4)")
        .bind(&ws_id)
        .bind(guid)
        .bind(bin)
        .bind(&owner_id)
        .execute(db.pool())
        .await
        .unwrap();
    }

    // 2. Publish doc (reject workspace id, reject missing doc with no ghost rows, succeed on doc-pub).
    let (_, bad_ws_pub) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($ws: String!, $doc: String!) { publishDoc(workspaceId: $ws, docId: $doc, mode: Page) { id } }",
      json!({ "ws": ws_id, "doc": ws_id }),
    )
    .await;
    assert_eq!(bad_ws_pub["errors"][0]["extensions"]["name"], "EXPECT_TO_PUBLISH_DOC");

    let (_, missing_pub) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($ws: String!, $doc: String!) { publishDoc(workspaceId: $ws, docId: $doc, mode: Page) { id } }",
      json!({ "ws": ws_id, "doc": "nonexistent-doc" }),
    )
    .await;
    assert_eq!(missing_pub["errors"][0]["extensions"]["name"], "DOC_NOT_FOUND");
    let ghost_count: i64 = sqlx::query_scalar(
      "SELECT COUNT(*) FROM doc_access_policies WHERE workspace_id = $1 AND doc_id = 'nonexistent-doc'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(ghost_count, 0);

    let (_, pub_ok) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($ws: String!, $doc: String!) { publishDoc(workspaceId: $ws, docId: $doc, mode: Edgeless) { id public mode defaultRole } }",
      json!({ "ws": ws_id, "doc": "doc-pub" }),
    )
    .await;
    assert!(pub_ok["errors"].is_null(), "publishDoc errors: {pub_ok}");
    assert_eq!(pub_ok["data"]["publishDoc"]["public"], true);
    assert_eq!(pub_ok["data"]["publishDoc"]["mode"], "Edgeless");

    // Anonymous HEAD/GET public-docs + root-doc filtering + private doc 403 DOC_ACTION_DENIED.
    let head_pub = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::HEAD)
          .uri(format!("/api/workspaces/{ws_id}/public-docs/doc-pub"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(head_pub.status(), StatusCode::OK);
    assert_eq!(head_pub.headers().get("publish-mode").unwrap(), "edgeless");

    let head_priv = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::HEAD)
          .uri(format!("/api/workspaces/{ws_id}/public-docs/doc-priv"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(head_priv.status(), StatusCode::FORBIDDEN);

    let get_priv = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::GET)
          .uri(format!("/api/workspaces/{ws_id}/public-docs/doc-priv"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(get_priv.status(), StatusCode::FORBIDDEN);
    assert_eq!(body_json(get_priv).await["name"], "DOC_ACTION_DENIED");

    let get_root = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::GET)
          .uri(format!("/api/workspaces/{ws_id}/public-docs/doc-pub/root-doc"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(get_root.status(), StatusCode::OK);
    let root_out = body_bytes(get_root).await;
    assert!(!String::from_utf8_lossy(&root_out).contains("Secret Private Doc"));
    assert!(!String::from_utf8_lossy(&root_out).contains("doc-priv"));

    // 3. Doc grants + default role (forbid Owner default role).
    let (_, bad_default) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($input: UpdateDocDefaultRoleInput!) { updateDocDefaultRole(input: $input) }",
      json!({ "input": { "workspaceId": ws_id, "docId": "doc-pub", "role": "Owner" } }),
    )
    .await;
    assert_eq!(
      bad_default["errors"][0]["extensions"]["name"],
      "DOC_DEFAULT_ROLE_CAN_NOT_BE_OWNER"
    );

    let (_, grant_ok) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($input: GrantDocUserRolesInput!) { grantDocUserRoles(input: $input) }",
      json!({ "input": { "workspaceId": ws_id, "docId": "doc-pub", "role": "Editor", "userIds": [member_id] } }),
    )
    .await;
    assert_eq!(grant_ok["data"]["grantDocUserRoles"], true);

    let (_, grants_list) = gql(
      &router,
      Some(&owner_cookie),
      "query ($ws: String!) { workspace(id: $ws) { doc(docId: \"doc-pub\") { grantedUsersList(pagination: { first: 10 }) { totalCount edges { node { role user { id } } } } } } }",
      json!({ "ws": ws_id }),
    )
    .await;
    assert_eq!(
      grants_list["data"]["workspace"]["doc"]["grantedUsersList"]["totalCount"],
      1
    );

    // 4. Snapshot histories, binary GET, recoverDoc, compaction, and housekeeping.
    let hist_ts = Utc::now() - Duration::minutes(5);
    sqlx::query(
      "INSERT INTO snapshot_histories (workspace_id, guid, timestamp, blob, expired_at, created_by) VALUES ($1, 'doc-pub', $2, $3, $4, $5)",
    )
    .bind(&ws_id)
    .bind(hist_ts)
    .bind(&page_bin)
    .bind(Utc::now() + Duration::days(7))
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (_, hist_list) = gql(
      &router,
      Some(&owner_cookie),
      "query ($ws: String!) { workspace(id: $ws) { histories(guid: \"doc-pub\", take: 10) { id timestamp editor { name } } } }",
      json!({ "ws": ws_id }),
    )
    .await;
    assert_eq!(hist_list["data"]["workspace"]["histories"].as_array().unwrap().len(), 1);
    let ts_iso = hist_list["data"]["workspace"]["histories"][0]["timestamp"]
      .as_str()
      .unwrap()
      .to_owned();

    let hist_get = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::GET)
          .uri(format!("/api/workspaces/{ws_id}/docs/doc-pub/histories/{ts_iso}"))
          .header(header::COOKIE, &owner_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(hist_get.status(), StatusCode::OK);
    assert_eq!(body_bytes(hist_get).await, page_bin);

    let bad_ts = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::GET)
          .uri(format!("/api/workspaces/{ws_id}/docs/doc-pub/histories/not-a-timestamp"))
          .header(header::COOKIE, &owner_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(bad_ts.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(bad_ts).await["name"], "INVALID_HISTORY_TIMESTAMP");

    let (_, rec_ok) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($ws: String!, $ts: DateTime!) { recoverDoc(workspaceId: $ws, guid: \"doc-pub\", timestamp: $ts) }",
      json!({ "ws": ws_id, "ts": ts_iso }),
    )
    .await;
    assert!(rec_ok["errors"].is_null(), "recoverDoc errors: {rec_ok}");

    // Deterministic compaction & housekeeping checks.
    let upd_doc = y_octo::Doc::with_client(77);
    upd_doc
      .get_or_create_text("content")
      .unwrap()
      .insert(0, "compacted-update")
      .unwrap();
    sqlx::query("INSERT INTO updates (workspace_id, guid, blob, created_at, created_by) VALUES ($1, 'doc-priv', $2, clock_timestamp(), $3)")
      .bind(&ws_id)
      .bind(upd_doc.encode_update_v1().unwrap())
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    let compacted = compact_pending_doc_updates(&db, &ws_id, "doc-priv", 100, 0, 3600)
      .await
      .unwrap();
    assert!(compacted.lock_acquired);
    assert_eq!(compacted.updates_merged, 1);

    let _ = cleanup_expired_user_sessions(&db, 100).await.unwrap();
    let _ = cleanup_expired_snapshot_histories(&db, 100).await.unwrap();
    let _ = cleanup_expired_runtime_states(&db, 100).await.unwrap();
    let _ = cleanup_expired_blob_reservations(&db, 100).await.unwrap();

    // 5. Comments, replies, commentChanges cursor pagination, notifications, settings.
    let (_, c_created) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($input: CommentCreateInput!) { createComment(input: $input) { id resolved content } }",
      json!({
        "input": {
          "workspaceId": ws_id,
          "docId": "doc-pub",
          "docTitle": "Public Doc",
          "docMode": "page",
          "content": { "text": "First comment" },
          "mentions": [member_id]
        }
      }),
    )
    .await;
    assert!(c_created["errors"].is_null(), "createComment errors: {c_created}");
    let comment_id = c_created["data"]["createComment"]["id"].as_str().unwrap().to_owned();

    let (_, r_created) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($input: ReplyCreateInput!) { createReply(input: $input) { id commentId } }",
      json!({
        "input": {
          "commentId": comment_id,
          "content": { "text": "First reply" },
          "docTitle": "Public Doc",
          "docMode": "page"
        }
      }),
    )
    .await;
    assert!(r_created["errors"].is_null(), "createReply errors: {r_created}");

    let (_, c_list) = gql(
      &router,
      Some(&owner_cookie),
      "query ($ws: String!) { workspace(id: $ws) { comments(docId: \"doc-pub\") { totalCount edges { node { id replies { id } } } pageInfo { startCursor endCursor } } } }",
      json!({ "ws": ws_id }),
    )
    .await;
    assert_eq!(c_list["data"]["workspace"]["comments"]["totalCount"], 1);
    assert_eq!(
      c_list["data"]["workspace"]["comments"]["edges"][0]["node"]["replies"]
        .as_array()
        .unwrap()
        .len(),
      1
    );

    let (_, mention_self) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($input: MentionInput!) { mentionUser(input: $input) }",
      json!({
        "input": {
          "userId": owner_id,
          "workspaceId": ws_id,
          "doc": { "id": "doc-pub", "title": "Public Doc", "mode": "page" }
        }
      }),
    )
    .await;
    assert_eq!(
      mention_self["errors"][0]["extensions"]["name"],
      "MENTION_USER_ONESELF_DENIED"
    );

    let (_, settings_upd) = gql(
      &router,
      Some(&owner_cookie),
      "mutation { updateSettings(input: { receiveCommentEmail: false }) }",
      json!({}),
    )
    .await;
    assert_eq!(settings_upd["data"]["updateSettings"], true);
    let (_, settings_get) = gql(
      &router,
      Some(&owner_cookie),
      "query { currentUser { settings { receiveInvitationEmail receiveMentionEmail receiveCommentEmail } } }",
      json!({}),
    )
    .await;
    assert_eq!(
      settings_get["data"]["currentUser"]["settings"]["receiveCommentEmail"],
      false
    );
    assert_eq!(
      settings_get["data"]["currentUser"]["settings"]["receiveMentionEmail"],
      true
    );

    // 6. Open-App sign-in code (one-time redemption).
    let code_resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::POST)
          .uri("/api/auth/open-app/sign-in-code")
          .header(header::COOKIE, &owner_cookie)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(code_resp.status(), StatusCode::CREATED);
    let open_code = body_json(code_resp).await["code"].as_str().unwrap().to_owned();

    let redeem_ok = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::POST)
          .uri("/api/auth/open-app/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(serde_json::to_vec(&json!({ "code": open_code })).unwrap()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(redeem_ok.status(), StatusCode::OK);
    assert_eq!(body_json(redeem_ok).await["id"], owner_id);

    // Second redemption of the same code must fail with 400 INVALID_AUTH_STATE.
    let redeem_replay = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::POST)
          .uri("/api/auth/open-app/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(serde_json::to_vec(&json!({ "code": open_code })).unwrap()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(redeem_replay.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(redeem_replay).await["name"], "INVALID_AUTH_STATE");

    // 7. Self-hosted License verification (reject tampered / wrong workspace without overwriting, deactivate falls back to 10s/100g).
    let signing_key = SigningKey::from_slice(&[0x33; 32]).unwrap();
    let pro_pem = VerifyingKey::from(&signing_key)
      .to_public_key_pem(LineEnding::LF)
      .unwrap();
    let lic_svc = state.licenses.clone().with_keyring(Keyring::with_pro_public_key(pro_pem));
    let claims = LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: format!("lic-{ws_id}"),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_owned(),
        workspace_id: Some(ws_id.clone()),
      },
      tier: "selfhost_team".to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 50,
        seat_quota_bytes: None,
        history_period_seconds: 31_536_000,
        copilot_action_limit: None,
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      recurring: Some("yearly".to_owned()),
      issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
      not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
      expires_at: Some((Utc::now() + Duration::days(365)).to_rfc3339()),
    };
    let canonical = serde_json::to_vec(&claims).unwrap();
    let sig: DerSignature = signing_key.sign(&canonical);
    let valid_payload = serde_json::to_vec(&LicenseEnvelopeV2 {
      claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
    })
    .unwrap();

    let installed = lic_svc.install_license(&owner_id, &ws_id, &valid_payload).await.unwrap();
    assert_eq!(installed.quantity, 50);
    // Reject wrong workspace scope or bad signature without overwriting existing license.
    assert!(lic_svc.install_license(&owner_id, &ws_id, b"{}").await.is_err());
    assert_eq!(
      lic_svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity,
      50
    );
    assert!(lic_svc.deactivate_license(&owner_id, &ws_id).await.unwrap());
    assert!(lic_svc.get_license(&owner_id, &ws_id).await.unwrap().is_none());

    // 8. Admin deleteUser forbids deleting own account.
    let (_, del_self) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($id: String!) { deleteUser(id: $id) { success } }",
      json!({ "id": owner_id }),
    )
    .await;
    assert_eq!(del_self["errors"][0]["extensions"]["name"], "CANNOT_DELETE_OWN_ACCOUNT");

    db.pool().close().await;
  });
}

struct RecordingBillingSpi {
  pre_delete_users: std::sync::Mutex<Vec<String>>,
  members_changed_workspaces: std::sync::Mutex<Vec<String>>,
  portal_workspaces: std::sync::Mutex<Vec<String>>,
}

impl RecordingBillingSpi {
  fn new() -> Self {
    Self {
      pre_delete_users: std::sync::Mutex::new(Vec::new()),
      members_changed_workspaces: std::sync::Mutex::new(Vec::new()),
      portal_workspaces: std::sync::Mutex::new(Vec::new()),
    }
  }
}

#[async_trait::async_trait]
impl server_spi::BillingSpi for RecordingBillingSpi {
  async fn on_pre_delete_user(&self, user_id: &str) -> Result<(), server_types::DomainError> {
    self.pre_delete_users.lock().unwrap().push(user_id.to_owned());
    Ok(())
  }

  async fn on_workspace_members_changed(&self, workspace_id: &str) -> Result<(), server_types::DomainError> {
    self
      .members_changed_workspaces
      .lock()
      .unwrap()
      .push(workspace_id.to_owned());
    Ok(())
  }

  async fn create_selfhost_customer_portal(&self, workspace_id: &str) -> Result<String, server_types::DomainError> {
    self.portal_workspaces.lock().unwrap().push(workspace_id.to_owned());
    Ok(format!("https://billing.example.test/portal/{workspace_id}"))
  }
}

struct TeamOverrideQuotaGate {
  team_workspace_id: std::sync::Mutex<Option<String>>,
}

#[async_trait::async_trait]
impl server_spi::QuotaGate for TeamOverrideQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    workspace_id: &str,
    now: chrono::DateTime<Utc>,
  ) -> Result<server_types::AccessGrant, server_types::DomainError> {
    let mut grant = server_spi::CommunityQuotaGate::new()
      .resolve_workspace_grant(tx, workspace_id, now)
      .await?;
    if self.team_workspace_id.lock().unwrap().as_deref() == Some(workspace_id) {
      grant.billing_subject = server_spi::BillingSubject::Workspace;
    }
    Ok(grant)
  }

  async fn check_seat_admission(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    workspace_id: &str,
    current_active_seats: i32,
    adding_seats: i32,
    now: chrono::DateTime<Utc>,
  ) -> Result<server_types::AccessGrant, server_types::DomainError> {
    server_spi::CommunityQuotaGate::new()
      .check_seat_admission(tx, workspace_id, current_active_seats, adding_seats, now)
      .await
  }
}

struct MockBillingExtension {
  quota_gate: Arc<TeamOverrideQuotaGate>,
  billing_spi: Arc<RecordingBillingSpi>,
}

impl server_spi::ServerExtension for MockBillingExtension {
  fn edition_name(&self) -> &'static str {
    "commercial-mock"
  }

  fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
    self.quota_gate.clone()
  }

  fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
    Arc::new(server_spi::CommunitySessionPolicyHook)
  }

  fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
    Arc::new(server_spi::CommunityCopilotPolicySpi)
  }

  fn billing_spi(&self) -> Arc<dyn server_spi::BillingSpi> {
    self.billing_spi.clone()
  }
}

#[test]
fn billing_spi_hooks_team_owner_delete_block_and_customer_portal() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .unwrap();

  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .expect("connect test db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema");
    db.ensure_schema_ready().await.expect("ensure schema ready");

    let quota_gate = Arc::new(TeamOverrideQuotaGate {
      team_workspace_id: std::sync::Mutex::new(None),
    });
    let billing_spi = Arc::new(RecordingBillingSpi::new());
    let ext = Arc::new(MockBillingExtension {
      quota_gate: Arc::clone(&quota_gate),
      billing_spi: Arc::clone(&billing_spi),
    });
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        role: ServerRole::Allinone,
        ..RuntimeConfig::default()
      },
      ext,
    );
    let router = build_router(Arc::clone(&state));

    // Create owner (admin) + regular user.
    let setup = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::POST)
          .uri("/api/setup/create-admin-user")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            json!({ "email": "owner-billing@example.com", "password": "Password123!", "name": "Owner" }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(setup.status(), StatusCode::OK);
    let owner_cookie = cookie_header_from_response(&setup);

    let member_id = format!("usr_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, 'Member', 'member-billing@example.com', true, false)",
    )
    .bind(&member_id)
    .execute(db.pool())
    .await
    .unwrap();
    let member_code = state.auth.create_open_app_code(&member_id).await.unwrap();
    let member_login = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::POST)
          .uri("/api/auth/open-app/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(json!({ "code": member_code }).to_string()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(member_login.status(), StatusCode::OK);
    let member_cookie = cookie_header_from_response(&member_login);

    // Create workspace owned by owner, mark it as Team in mock QuotaGate.
    let (_, ws_resp) = gql(
      &router,
      Some(&owner_cookie),
      "mutation { createWorkspace { id } }",
      json!({}),
    )
    .await;
    let ws_id = ws_resp["data"]["createWorkspace"]["id"].as_str().unwrap().to_owned();
    *quota_gate.team_workspace_id.lock().unwrap() = Some(ws_id.clone());

    // 1. Invite member & revoke member must fire BillingSpi::on_workspace_members_changed.
    let (_, inv_resp) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($ws: String!, $emails: [String!]!) { inviteMembers(workspaceId: $ws, emails: $emails) { email } }",
      json!({ "ws": ws_id, "emails": ["member-billing@example.com"] }),
    )
    .await;
    assert!(inv_resp["errors"].is_null(), "inviteMembers errors: {inv_resp}");
    assert_eq!(
      billing_spi.members_changed_workspaces.lock().unwrap().as_slice(),
      std::slice::from_ref(&ws_id)
    );

    let (_, rev_resp) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($ws: String!, $uid: String!) { revokeMember(workspaceId: $ws, userId: $uid) }",
      json!({ "ws": ws_id, "uid": member_id }),
    )
    .await;
    assert!(rev_resp["errors"].is_null(), "revokeMember errors: {rev_resp}");
    assert_eq!(billing_spi.members_changed_workspaces.lock().unwrap().len(), 2);

    // 2. Selfhost customer portal calls BillingSpi::create_selfhost_customer_portal.
    let (_, portal_resp) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($ws: String!) { createSelfhostWorkspaceCustomerPortal(workspaceId: $ws) }",
      json!({ "ws": ws_id }),
    )
    .await;
    assert!(portal_resp["errors"].is_null(), "customer portal errors: {portal_resp}");
    assert_eq!(
      portal_resp["data"]["createSelfhostWorkspaceCustomerPortal"],
      format!("https://billing.example.test/portal/{ws_id}")
    );

    // 3. Team workspace owner cannot deleteAccount -> 403 CANNOT_DELETE_ACCOUNT_WITH_OWNED_TEAM_WORKSPACE.
    let (_, del_team_owner) = gql(
      &router,
      Some(&owner_cookie),
      "mutation { deleteAccount { success } }",
      json!({}),
    )
    .await;
    assert_eq!(
      del_team_owner["errors"][0]["extensions"]["name"],
      "CANNOT_DELETE_ACCOUNT_WITH_OWNED_TEAM_WORKSPACE"
    );
    assert_eq!(del_team_owner["errors"][0]["extensions"]["status"], 403);
    assert!(billing_spi.pre_delete_users.lock().unwrap().is_empty());

    // 4. Regular user deleteAccount triggers on_pre_delete_user and succeeds.
    let (_, del_member) = gql(
      &router,
      Some(&member_cookie),
      "mutation { deleteAccount { success } }",
      json!({}),
    )
    .await;
    assert!(del_member["errors"].is_null(), "member deleteAccount errors: {del_member}");
    assert_eq!(del_member["data"]["deleteAccount"]["success"], true);
    assert_eq!(billing_spi.pre_delete_users.lock().unwrap().as_slice(), &[member_id]);

    db.pool().close().await;
  });
}

async fn create_user_and_cookie(
  db: &ServerDb,
  state: &Arc<AppState>,
  router: &axum::Router,
  email: &str,
) -> (String, String) {
  let user_id = uuid::Uuid::new_v4().to_string();
  sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)")
    .bind(&user_id)
    .bind(email)
    .bind(email)
    .execute(db.pool())
    .await
    .unwrap();
  let code = state.auth.create_open_app_code(&user_id).await.unwrap();
  let resp = router
    .clone()
    .oneshot(
      Request::builder()
        .method(Method::POST)
        .uri("/api/auth/open-app/sign-in")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_vec(&json!({ "code": code })).unwrap()))
        .unwrap(),
    )
    .await
    .unwrap();
  assert_eq!(resp.status(), StatusCode::OK);
  let cookie = cookie_header_from_response(&resp);
  (user_id, cookie)
}

#[test]
fn doc_acl_owner_protection_pagination_attachments_open_app_and_licenses() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 6,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .expect("connect server db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    struct LimitedStorageQuotaGate {
      storage_quota_bytes: i64,
    }
    #[async_trait::async_trait]
    impl server_spi::QuotaGate for LimitedStorageQuotaGate {
      async fn resolve_workspace_grant(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        _workspace_id: &str,
        _now: chrono::DateTime<Utc>,
      ) -> Result<server_types::AccessGrant, server_types::DomainError> {
        let mut g = server_types::license::default_selfhost_access_grant();
        g.limits.storage_quota_bytes = self.storage_quota_bytes;
        g.limits.seat_limit = 50;
        Ok(g)
      }
      async fn check_seat_admission(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        workspace_id: &str,
        _cur: i32,
        _add: i32,
        now: chrono::DateTime<Utc>,
      ) -> Result<server_types::AccessGrant, server_types::DomainError> {
        self.resolve_workspace_grant(tx, workspace_id, now).await
      }
    }

    struct LimitedExt(Arc<LimitedStorageQuotaGate>);
    impl server_spi::ServerExtension for LimitedExt {
      fn edition_name(&self) -> &'static str {
        "test-limited"
      }
      fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
        Arc::clone(&self.0) as Arc<dyn server_spi::QuotaGate>
      }
      fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
        Arc::new(server_spi::CommunitySessionPolicyHook)
      }
      fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
        Arc::new(server_spi::CommunityCopilotPolicySpi)
      }
    }

    let ext: Arc<dyn server_spi::ServerExtension> =
      Arc::new(LimitedExt(Arc::new(LimitedStorageQuotaGate {
        storage_quota_bytes: 1_500,
      })));
    let state = AppState::new(db.clone(), None, RuntimeConfig::default(), ext);
    let router = build_router(Arc::clone(&state));

    let (owner_id, owner_cookie) = create_user_and_cookie(&db, &state, &router, "r2-owner@example.com").await;
    let (mgr_id, mgr_cookie) = create_user_and_cookie(&db, &state, &router, "r2-mgr@example.com").await;
    let (no_read_id, no_read_cookie) = create_user_and_cookie(&db, &state, &router, "r2-noread@example.com").await;
    let (outsider_id, outsider_cookie) = create_user_and_cookie(&db, &state, &router, "r2-outsider@example.com").await;

    let (_, ws_resp) = gql(
      &router,
      Some(&owner_cookie),
      "mutation { createWorkspace { id } }",
      json!({}),
    )
    .await;
    let ws_id = ws_resp["data"]["createWorkspace"]["id"].as_str().unwrap().to_owned();

    for uid in [&mgr_id, &no_read_id] {
      sqlx::query(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'member', 'active', 'legacy')",
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&ws_id)
      .bind(uid)
      .execute(db.pool())
      .await
      .unwrap();
    }

    let doc_id = "r2-secret-doc";
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at, created_by) VALUES ($1, $2, $3, now(), now(), $4)",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(vec![0u8, 0u8])
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, mode, title, summary) VALUES ($1, $2, 0, 'Top Secret Title', 'Secret Summary')",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, member_default_role, visibility) VALUES ($1, $2, 'none', 'private')",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by) VALUES ($1, $2, 'user', $3, 'owner', $3), ($1, $2, 'user', $4, 'manager', $3)",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(&owner_id)
    .bind(&mgr_id)
    .execute(db.pool())
    .await
    .unwrap();

    // 1. Unauthorized member cannot read workspace.doc -> 403 DOC_ACTION_DENIED with full data, 0 metadata leak.
    let (_, resp) = gql(
      &router,
      Some(&no_read_cookie),
      "query ($ws: String!, $doc: String!) { workspace(id: $ws) { doc(docId: $doc) { id title summary } } }",
      json!({ "ws": ws_id, "doc": doc_id }),
    )
    .await;
    assert!(resp["data"]["workspace"]["doc"].is_null(), "must not leak doc: {resp}");
    let ext = &resp["errors"][0]["extensions"];
    assert_eq!(ext["name"], "DOC_ACTION_DENIED");
    assert_eq!(ext["type"], "NO_PERMISSION");
    assert_eq!(ext["status"], 403);
    assert_eq!(ext["data"]["spaceId"], ws_id);
    assert_eq!(ext["data"]["docId"], doc_id);
    assert_eq!(ext["data"]["action"], "Doc.Read");

    // Outsider is blocked at workspace(id:) (403) and at direct get_doc_info (DOC_ACTION_DENIED).
    let (_, outsider_ws_resp) = gql(
      &router,
      Some(&outsider_cookie),
      "query ($ws: String!, $doc: String!) { workspace(id: $ws) { doc(docId: $doc) { id title summary } } }",
      json!({ "ws": ws_id, "doc": doc_id }),
    )
    .await;
    assert_eq!(outsider_ws_resp["errors"][0]["extensions"]["status"], 403);
    let outsider_doc_err = state
      .doc_sharing
      .get_doc_info(&ws_id, Some(&outsider_id), doc_id)
      .await
      .unwrap_err();
    let outsider_env = server_http::legacy_compat::errors::domain_error_to_envelope(&outsider_doc_err);
    assert_eq!(outsider_env.name, "DOC_ACTION_DENIED");
    assert_eq!(outsider_env.status, 403);

    // 2. DocRole::Manager cannot demote/revoke DocRole::Owner, and workspace_id == doc_id is rejected.
    let (_, mgr_grant_owner) = gql(
      &router,
      Some(&mgr_cookie),
      "mutation ($input: GrantDocUserRolesInput!) { grantDocUserRoles(input: $input) }",
      json!({ "input": { "workspaceId": ws_id, "docId": doc_id, "role": "Reader", "userIds": [owner_id] } }),
    )
    .await;
    assert_eq!(mgr_grant_owner["errors"][0]["extensions"]["name"], "DOC_ACTION_DENIED");

    let (_, mgr_update_owner) = gql(
      &router,
      Some(&mgr_cookie),
      "mutation ($input: UpdateDocUserRoleInput!) { updateDocUserRole(input: $input) }",
      json!({ "input": { "workspaceId": ws_id, "docId": doc_id, "userId": owner_id, "role": "Reader" } }),
    )
    .await;
    assert_eq!(mgr_update_owner["errors"][0]["extensions"]["name"], "DOC_ACTION_DENIED");

    let (_, mgr_revoke_owner) = gql(
      &router,
      Some(&mgr_cookie),
      "mutation ($input: RevokeDocUserRoleInput!) { revokeDocUserRoles(input: $input) }",
      json!({ "input": { "workspaceId": ws_id, "docId": doc_id, "userId": owner_id } }),
    )
    .await;
    assert_eq!(mgr_revoke_owner["errors"][0]["extensions"]["name"], "DOC_ACTION_DENIED");

    let (_, root_grant) = gql(
      &router,
      Some(&owner_cookie),
      "mutation ($input: GrantDocUserRolesInput!) { grantDocUserRoles(input: $input) }",
      json!({ "input": { "workspaceId": ws_id, "docId": ws_id, "role": "Reader", "userIds": [no_read_id] } }),
    )
    .await;
    assert_eq!(
      root_grant["errors"][0]["extensions"]["name"],
      "EXPECT_TO_GRANT_DOC_USER_ROLES"
    );
    assert_eq!(
      root_grant["errors"][0]["extensions"]["data"]["spaceId"],
      ws_id
    );

    // Concurrent grant_doc_roles(Reader) vs transition_doc_role(Owner) must NEVER demote the new Owner.
    use server_domain::acl::DocRole;
    let (r_transfer, r_grant) = tokio::join!(
      state
        .doc_sharing
        .transition_doc_role(&owner_id, &ws_id, doc_id, &mgr_id, Some(DocRole::Owner)),
      state
        .doc_sharing
        .grant_doc_roles(&owner_id, &ws_id, doc_id, vec![mgr_id.clone()], DocRole::Reader),
    );
    assert!(r_transfer.is_ok(), "owner transfer must succeed: {r_transfer:?}");
    let _ = r_grant;
    let mgr_final_role: String = sqlx::query_scalar(
      "SELECT role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_id = $3",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(&mgr_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(mgr_final_role, "owner", "concurrent grant_doc_roles must never demote new Owner");
    // Restore original owner for subsequent steps.
    state
      .doc_sharing
      .transition_doc_role(&mgr_id, &ws_id, doc_id, &owner_id, Some(DocRole::Owner))
      .await
      .unwrap();

    // Member with NO initial doc_grants row promoted to Owner -> grant_doc_roles(Reader)
    // must fail with Conflict("doc_role_targets_changed") and preserve Owner.
    let no_row_uid = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'NoRow Owner', 'norow-owner@example.com')")
      .bind(&no_row_uid)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'member', 'active', 'legacy')",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(&no_row_uid)
    .execute(db.pool())
    .await
    .unwrap();
    state
      .doc_sharing
      .transition_doc_role(&owner_id, &ws_id, doc_id, &no_row_uid, Some(DocRole::Owner))
      .await
      .unwrap();
    let demote_err = state
      .doc_sharing
      .grant_doc_roles(&no_row_uid, &ws_id, doc_id, vec![no_row_uid.clone()], DocRole::Reader)
      .await
      .expect_err("grant_doc_roles(Reader) on newly promoted Owner must fail");
    assert!(
      matches!(
        &demote_err,
        server_types::DomainError::Forbidden(m) if m.contains("Doc.Users.Manage")
      ) || matches!(
        &demote_err,
        server_types::DomainError::Conflict(m) if m == "doc_role_targets_changed"
      ),
      "expected Forbidden(Doc.Users.Manage) or Conflict(doc_role_targets_changed), got {demote_err:?}"
    );
    let no_row_role: String = sqlx::query_scalar(
      "SELECT role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_id = $3",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(&no_row_uid)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(no_row_role, "owner");
    state
      .doc_sharing
      .transition_doc_role(&no_row_uid, &ws_id, doc_id, &owner_id, Some(DocRole::Owner))
      .await
      .unwrap();
    sqlx::query("DELETE FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_id = $3")
      .bind(&ws_id)
      .bind(doc_id)
      .bind(&no_row_uid)
      .execute(db.pool())
      .await
      .unwrap();

    // 3. Cursor pagination (`after`) on grantedUsersList with 10 users (exact multiple of first=5).
    for i in 0..8 {
      let uid = uuid::Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)")
        .bind(&uid)
        .bind(format!("GUser {i}"))
        .bind(format!("guser-{i}@example.com"))
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by) VALUES ($1, $2, 'user', $3, 'reader', $4)",
      )
      .bind(&ws_id)
      .bind(doc_id)
      .bind(&uid)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    }
    let (_, page1) = gql(
      &router,
      Some(&owner_cookie),
      "query ($ws: String!, $doc: String!) { workspace(id: $ws) { doc(docId: $doc) { grantedUsersList(pagination: { first: 5 }) { totalCount edges { cursor node { user { id } } } pageInfo { hasNextPage endCursor } } } } }",
      json!({ "ws": ws_id, "doc": doc_id }),
    )
    .await;
    let p1 = &page1["data"]["workspace"]["doc"]["grantedUsersList"];
    assert_eq!(p1["totalCount"], 10);
    assert_eq!(p1["edges"].as_array().unwrap().len(), 5);
    assert_eq!(p1["pageInfo"]["hasNextPage"], true);
    let cursor1 = p1["pageInfo"]["endCursor"].as_str().unwrap().to_owned();

    let (_, page2) = gql(
      &router,
      Some(&owner_cookie),
      "query ($ws: String!, $doc: String!, $after: String) { workspace(id: $ws) { doc(docId: $doc) { grantedUsersList(pagination: { first: 5, after: $after }) { totalCount edges { node { user { id } } } pageInfo { hasNextPage } } } } }",
      json!({ "ws": ws_id, "doc": doc_id, "after": cursor1 }),
    )
    .await;
    let p2 = &page2["data"]["workspace"]["doc"]["grantedUsersList"];
    assert_eq!(p2["edges"].as_array().unwrap().len(), 5);
    assert_eq!(
      p2["pageInfo"]["hasNextPage"], false,
      "exact multiple must not report extra page"
    );
    let mut ids1: Vec<&str> = p1["edges"]
      .as_array()
      .unwrap()
      .iter()
      .map(|e| e["node"]["user"]["id"].as_str().unwrap())
      .collect();
    let ids2: Vec<&str> = p2["edges"]
      .as_array()
      .unwrap()
      .iter()
      .map(|e| e["node"]["user"]["id"].as_str().unwrap())
      .collect();
    ids1.extend(ids2);
    ids1.sort_unstable();
    ids1.dedup();
    assert_eq!(ids1.len(), 10, "all 10 granted users must be distinct across cursor pages");

    // 4. Comment attachment 3-phase reservation: concurrent quota admission + rollback on object put failure.
    let (r1, r2) = tokio::join!(
      state.comments.reserve_comment_attachment(
        server_domain::comments::ReserveCommentAttachmentInput {
          actor_user_id: &owner_id,
          workspace_id: &ws_id,
          raw_doc_id: doc_id,
          key: "att-1",
          filename: "a.png",
          mime: "image/png",
          size: 1_000,
        },
      ),
      state.comments.reserve_comment_attachment(
        server_domain::comments::ReserveCommentAttachmentInput {
          actor_user_id: &owner_id,
          workspace_id: &ws_id,
          raw_doc_id: doc_id,
          key: "att-2",
          filename: "b.png",
          mime: "image/png",
          size: 1_000,
        },
      ),
    );
    let ok_count = usize::from(r1.is_ok()) + usize::from(r2.is_ok());
    assert_eq!(ok_count, 1, "only 1 of 2 concurrent 1000B uploads fits in 1500B quota");
    let winning_res = r1.or(r2).unwrap();
    let winning_key = if sqlx::query_scalar::<_, bool>(
      "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id = $1 AND key = 'att-1')",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap()
    {
      "att-1"
    } else {
      "att-2"
    };
    state
      .comments
      .abort_comment_attachment(&ws_id, &winning_res.storage_doc_id, winning_key, &winning_res.reservation_id)
      .await;
    let remaining_att: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM comment_attachments WHERE workspace_id = $1 AND status = 'completed'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(remaining_att, 0);

    // 5. Open-App: cross-gen purpose `auth_challenge:open_app_sign_in`, native issues `exchangeCode` without cookie session.
    let sessions_before: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM user_sessions WHERE user_id = $1")
      .bind(&owner_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    let open_code = state.auth.create_open_app_code(&owner_id).await.unwrap();
    let stored_purpose: String = sqlx::query_scalar(
      "SELECT purpose FROM runtime_states WHERE purpose = 'auth_challenge:open_app_sign_in' AND consumed_at IS NULL LIMIT 1",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(stored_purpose, "auth_challenge:open_app_sign_in");

    let native_resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::POST)
          .uri("/api/auth/open-app/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .header("x-affine-client-kind", "native")
          .body(Body::from(serde_json::to_vec(&json!({ "code": open_code })).unwrap()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(native_resp.status(), StatusCode::OK);
    let set_cookies: Vec<String> = native_resp
      .headers()
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok().map(str::to_owned))
      .collect();
    assert!(
      set_cookies.iter().any(|c| c.contains("Expires=Thu, 01 Jan 1970 00:00:00 GMT")),
      "native open-app response must clear auth cookies: {set_cookies:?}"
    );
    let native_body = body_json(native_resp).await;
    assert_eq!(native_body["id"], owner_id);
    assert!(native_body["exchangeCode"].as_str().is_some_and(|s| !s.is_empty()));
    let sessions_after: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM user_sessions WHERE user_id = $1")
      .bind(&owner_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(
      sessions_before, sessions_after,
      "native open-app sign-in must NOT create a cookie user_session"
    );

    // 6. Selfhost License: reject instance_default, dual-write installed_licenses + entitlements, remote activate/deactivate.
    let signing_key = SigningKey::from_slice(&[0x44; 32]).unwrap();
    let pro_pem = VerifyingKey::from(&signing_key)
      .to_public_key_pem(LineEnding::LF)
      .unwrap();
    let claims = LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: "KEY-TEAM-42".to_owned(),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_owned(),
        workspace_id: Some(ws_id.clone()),
      },
      tier: "selfhost_team".to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 42,
        seat_quota_bytes: None,
        history_period_seconds: 31_536_000,
        copilot_action_limit: None,
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      recurring: Some("yearly".to_owned()),
      issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
      not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
      expires_at: Some((Utc::now() + Duration::days(365)).to_rfc3339()),
    };
    let canonical = serde_json::to_vec(&claims).unwrap();
    let sig: DerSignature = signing_key.sign(&canonical);
    let commercial_payload = serde_json::to_vec(&LicenseEnvelopeV2 {
      claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
    })
    .unwrap();

    struct MockLicenseClient {
      envelope: Vec<u8>,
      deactivated: std::sync::Mutex<Vec<String>>,
    }
    #[async_trait::async_trait]
    impl server_domain::selfhost_license::SelfhostLicenseClient for MockLicenseClient {
      async fn activate(
        &self,
        _key: &str,
        _ws: &str,
        _op: &str,
      ) -> Result<server_domain::selfhost_license::RemoteLicensePayload, server_types::DomainError> {
        Ok(server_domain::selfhost_license::RemoteLicensePayload {
          recurring: "yearly".into(),
          validate_key: "vk-remote-1".into(),
          envelope: self.envelope.clone(),
        })
      }
      async fn deactivate(&self, key: &str, _vk: &str) -> Result<(), server_types::DomainError> {
        self.deactivated.lock().unwrap().push(key.to_owned());
        Ok(())
      }
      async fn health(
        &self,
        _key: &str,
        vk: &str,
        _ws: &str,
      ) -> Result<server_domain::selfhost_license::RemoteHealthOutcome, server_types::DomainError> {
        Ok(server_domain::selfhost_license::RemoteHealthOutcome::Active(
          server_domain::selfhost_license::RemoteLicensePayload {
            recurring: "yearly".into(),
            validate_key: vk.to_owned(),
            envelope: self.envelope.clone(),
          },
        ))
      }
      async fn update_seats(&self, _key: &str, _vk: &str, _seats: u32) -> Result<(), server_types::DomainError> {
        Ok(())
      }
      async fn create_customer_portal(&self, key: &str, _vk: &str) -> Result<String, server_types::DomainError> {
        Ok(format!("https://portal.affine.test/{key}"))
      }
    }

    let mock_client = Arc::new(MockLicenseClient {
      envelope: commercial_payload.clone(),
      deactivated: std::sync::Mutex::new(Vec::new()),
    });
    let lic_svc = state
      .licenses
      .clone()
      .with_keyring(Keyring::with_pro_public_key(pro_pem))
      .with_client(Arc::clone(&mock_client) as Arc<dyn server_domain::selfhost_license::SelfhostLicenseClient>);

    let err = lic_svc
      .install_license(&owner_id, &ws_id, server_types::license::DEFAULT_SELFHOST_LICENSE_BYTES)
      .await
      .unwrap_err();
    assert_eq!(
      server_http::legacy_compat::errors::domain_error_to_envelope(&err).name,
      "INVALID_LICENSE_TO_ACTIVATE"
    );

    let activated = lic_svc.activate_license(&owner_id, &ws_id, "KEY-TEAM-42").await.unwrap();
    assert_eq!(activated.quantity, 42);
    assert_eq!(activated.variant, None);
    assert_eq!(
      lic_svc.create_customer_portal(&ws_id).await.unwrap(),
      "https://portal.affine.test/KEY-TEAM-42"
    );

    assert!(
      lic_svc
        .install_license(&owner_id, &ws_id, server_types::license::DEFAULT_SELFHOST_LICENSE_BYTES)
        .await
        .is_err()
    );
    assert_eq!(
      lic_svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity,
      42
    );

    assert!(lic_svc.deactivate_license(&owner_id, &ws_id).await.unwrap());
    assert_eq!(mock_client.deactivated.lock().unwrap().as_slice(), &["KEY-TEAM-42"]);
    assert!(lic_svc.get_license(&owner_id, &ws_id).await.unwrap().is_none());

    db.pool().close().await;
  });
}

#[test]
fn concurrency_delete_user_vs_transfer_and_compaction_fault_tolerance() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 6,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .expect("connect server db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    struct TeamQuotaGate;
    #[async_trait::async_trait]
    impl server_spi::QuotaGate for TeamQuotaGate {
      async fn resolve_workspace_grant(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        _workspace_id: &str,
        _now: chrono::DateTime<Utc>,
      ) -> Result<server_types::AccessGrant, server_types::DomainError> {
        let mut g = server_types::license::default_selfhost_access_grant();
        g.billing_subject = server_spi::BillingSubject::Workspace;
        g.rights.commercial = true;
        Ok(g)
      }
      async fn check_seat_admission(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        workspace_id: &str,
        _cur: i32,
        _add: i32,
        now: chrono::DateTime<Utc>,
      ) -> Result<server_types::AccessGrant, server_types::DomainError> {
        self.resolve_workspace_grant(tx, workspace_id, now).await
      }
    }

    struct TeamExt;
    impl server_spi::ServerExtension for TeamExt {
      fn edition_name(&self) -> &'static str {
        "test-team"
      }
      fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
        Arc::new(TeamQuotaGate)
      }
      fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
        Arc::new(server_spi::CommunitySessionPolicyHook)
      }
      fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
        Arc::new(server_spi::CommunityCopilotPolicySpi)
      }
    }

    let state = AppState::new(db.clone(), None, RuntimeConfig::default(), Arc::new(TeamExt));
    let router = build_router(Arc::clone(&state));
    let (owner_id, owner_cookie) = create_user_and_cookie(&db, &state, &router, "race-owner@example.com").await;
    let (target_id, _) = create_user_and_cookie(&db, &state, &router, "race-target@example.com").await;

    let (_, ws_resp) = gql(
      &router,
      Some(&owner_cookie),
      "mutation { createWorkspace { id } }",
      json!({}),
    )
    .await;
    let ws_id = ws_resp["data"]["createWorkspace"]["id"].as_str().unwrap().to_owned();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'member', 'active', 'legacy')",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(&target_id)
    .execute(db.pool())
    .await
    .unwrap();

    // 1. Concurrent `transfer_workspace_ownership` and `delete_user` on `target_id` serialize via shared user row lock.
    let ws_svc = state.workspaces.clone();
    let user_svc = state.users.clone();
    let qg = state.extension.quota_gate();
    let billing = state.extension.billing_spi();
    let (res_transfer, res_delete) = tokio::join!(
      ws_svc.transfer_workspace_ownership(&owner_id, &ws_id, &target_id),
      user_svc.delete_user(&target_id, qg.as_ref(), billing.as_ref()),
    );
    assert!(
      !(res_transfer.is_ok() && res_delete.is_ok()),
      "transfer and delete_user MUST NOT both succeed concurrently"
    );
    let active_owners: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(active_owners, 1, "Team workspace must retain exactly 1 active owner");

    // 2. Failing QuotaGate in `compact_pending_docs_batch` preserves `updates`.
    struct FailingQuotaGate;
    #[async_trait::async_trait]
    impl server_spi::QuotaGate for FailingQuotaGate {
      async fn resolve_workspace_grant(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        _workspace_id: &str,
        _now: chrono::DateTime<Utc>,
      ) -> Result<server_types::AccessGrant, server_types::DomainError> {
        Err(server_types::DomainError::Unavailable("transient quota error".into()))
      }
      async fn check_seat_admission(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        _workspace_id: &str,
        _cur: i32,
        _add: i32,
        _now: chrono::DateTime<Utc>,
      ) -> Result<server_types::AccessGrant, server_types::DomainError> {
        Err(server_types::DomainError::Unavailable("transient quota error".into()))
      }
    }

    sqlx::query(
      "INSERT INTO updates (workspace_id, guid, blob, created_at) VALUES ($1, 'keep-updates-doc', $2, now())",
    )
    .bind(&ws_id)
    .bind(vec![0u8, 0u8])
    .execute(db.pool())
    .await
    .unwrap();
    let compacted = server_domain::histories::compact_pending_docs_batch(
      &db,
      &FailingQuotaGate,
      10,
      100,
      0,
      || false,
    )
    .await
    .unwrap();
    assert_eq!(compacted, 0);
    let preserved_updates: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM updates WHERE workspace_id = $1 AND guid = 'keep-updates-doc'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(
      preserved_updates, 1,
      "pending updates must be preserved when quota lookup fails"
    );

    // 3. `recover_doc` respects `storage-workspace:<ws_id>` exclusive advisory lock.
    let hist_ts = chrono::DateTime::from_timestamp_millis((Utc::now() - Duration::minutes(5)).timestamp_millis()).unwrap();
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at) VALUES ($1, 'lock-doc', $2, now(), now())",
    )
    .bind(&ws_id)
    .bind(vec![0u8, 0u8])
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO snapshot_histories (workspace_id, guid, timestamp, blob, expired_at) VALUES ($1, 'lock-doc', $2, $3, now() + interval '1 day')",
    )
    .bind(&ws_id)
    .bind(hist_ts)
    .bind(vec![0u8, 0u8])
    .execute(db.pool())
    .await
    .unwrap();

    let mut lock_tx = db.begin_tiered(server_db::WorkloadTier::InteractiveWrite).await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("storage-workspace:{ws_id}"))
      .execute(&mut **lock_tx.tx_mut())
      .await
      .unwrap();
    let histories_svc = state.histories.clone();
    let ws_clone = ws_id.clone();
    let actor_for_recover = if res_transfer.is_ok() {
      target_id.clone()
    } else {
      owner_id.clone()
    };
    let recover_handle = tokio::spawn(async move {
      histories_svc
        .recover_doc(&actor_for_recover, &ws_clone, "lock-doc", hist_ts)
        .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    assert!(
      !recover_handle.is_finished(),
      "recover_doc must block while storage-workspace:<ws_id> exclusive lock is held"
    );
    lock_tx.rollback().await.unwrap();
    let recovered = tokio::time::timeout(std::time::Duration::from_secs(5), recover_handle)
      .await
      .expect("recover_doc completes after lock release")
      .unwrap()
      .unwrap();
    assert_eq!(recovered, hist_ts);

    db.pool().close().await;
  });
}
