//! Community edition contract tests for Copilot GraphQL schema, guard
//! precedence, role isolation, `ServerConfigType.features`, and `UserType.quotaUsage`.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use affine_server::{DeploymentModeArg, RoleArg, ServerCli, serve_with_extension};
use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_http::{AppState, RuntimeConfig, graphql::build_schema};
use server_spi::CommunityExtension;
use server_types::ServerRole;
use server_worker::CancellationToken;
use test_db_harness::migrations::MigrationSet;
use test_db_harness::pg::{DEFAULT_LEASE_TTL, PgCluster};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

async fn http_request(
  addr: SocketAddr,
  method: &str,
  path: &str,
  headers: &[(&str, &str)],
  body: &[u8],
) -> (u16, String, Vec<u8>) {
  let mut stream = TcpStream::connect(addr).await.expect("connect server");
  let mut req = format!(
    "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nContent-Length: {}\r\n",
    body.len()
  );
  for (k, v) in headers {
    req.push_str(&format!("{k}: {v}\r\n"));
  }
  req.push_str("Connection: close\r\n\r\n");
  stream.write_all(req.as_bytes()).await.unwrap();
  if !body.is_empty() {
    stream.write_all(body).await.unwrap();
  }
  let mut raw = Vec::new();
  stream.read_to_end(&mut raw).await.unwrap();
  let split = raw
    .windows(4)
    .position(|w| w == b"\r\n\r\n")
    .expect("valid HTTP response");
  let head = String::from_utf8_lossy(&raw[..split]).to_string();
  let status = head
    .lines()
    .next()
    .and_then(|l| l.split_whitespace().nth(1))
    .and_then(|s| s.parse::<u16>().ok())
    .expect("HTTP status code");
  (status, head, raw[split + 4..].to_vec())
}

async fn graphql_post(addr: SocketAddr, query: &str, headers: &[(&str, &str)]) -> (u16, Value) {
  let payload = serde_json::to_vec(&json!({ "query": query })).unwrap();
  let mut all_headers = vec![("Content-Type", "application/json")];
  all_headers.extend_from_slice(headers);
  let (status, _head, body) = http_request(addr, "POST", "/graphql", &all_headers, &payload).await;
  let val = serde_json::from_slice(&body).unwrap_or_else(|_| json!({ "raw": String::from_utf8_lossy(&body) }));
  (status, val)
}

fn extract_cookie_header(head: &str) -> String {
  head
    .lines()
    .filter_map(|line| {
      let (k, v) = line.split_once(':')?;
      if k.eq_ignore_ascii_case("set-cookie") {
        Some(v.trim().split(';').next().unwrap_or("").to_string())
      } else {
        None
      }
    })
    .filter(|c| !c.is_empty())
    .collect::<Vec<_>>()
    .join("; ")
}

#[test]
fn community_copilot_schema_guards_role_isolation_and_quota_usage() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = MigrationSet::load(&migrations_dir).expect("load prisma migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure migrated template");
  let lease = cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
    database_url: db_url.clone(),
    channel: "production".into(),
    role: ServerRole::Allinone,
    selfhosted: true,
    max_connections: 4,
    statement_timeout_ms: 10_000,
    tier_permits: [8, 4, 4, 2],
  })
  .await
  .expect("connect db");

  // 1. Verify live GraphQL SDL contains all Copilot types, inputs, enums, and fields.
  let schema = build_schema(AppState::new(
    db.clone(),
    None,
    RuntimeConfig::default(),
    Arc::new(CommunityExtension::new()),
  ));
  let sdl = schema.sdl();
  for expected in [
    "type Copilot {",
    "type CopilotHistories {",
    "type PaginatedCopilotHistoriesType {",
    "type CopilotHistoriesTypeEdge {",
    "type CopilotSessionType {",
    "type CopilotQuota {",
    "type CopilotRouteOptions {",
    "type CopilotRouteTarget {",
    "type ChatMessage {",
    "type StreamObject {",
    "enum ChatHistoryOrder {",
    "input CreateChatSessionInput {",
    "input UpdateChatSessionInput {",
    "input ForkChatSessionInput {",
    "input DeleteSessionInput {",
    "input CreateChatMessageInput {",
    "input QueryChatSessionsInput {",
    "input QueryChatHistoriesInput {",
    "type UserQuotaUsageType {",
    "quotaUsage: UserQuotaUsageType!",
    "copilot(workspaceId: String): Copilot!",
    "createCopilotSession(options: CreateChatSessionInput!): String!",
    "createCopilotSessionWithHistory(options: CreateChatSessionInput!): CopilotHistories!",
    "updateCopilotSession(options: UpdateChatSessionInput!): String!",
    "forkCopilotSession(options: ForkChatSessionInput!): String!",
    "cleanupCopilotSession(options: DeleteSessionInput!): [String!]!",
    "createCopilotMessage(options: CreateChatMessageInput!): String!",
  ] {
    assert!(sdl.contains(expected), "SDL missing expected fragment: {expected}");
  }

  // 2. Boot full allinone community server.
  let shutdown = CancellationToken::new();
  let cli = ServerCli {
    role: Some(RoleArg::Allinone),
    deployment_mode: DeploymentModeArg::Selfhosted,
    host: IpAddr::V4(Ipv4Addr::LOCALHOST),
    port: 0,
    database_url: db_url.clone(),
    redis_url: None,
    private_key: Some("test-copilot-community-key".into()),
    external_url: Some("http://127.0.0.1".into()),
    skip_schema_check: true,
    ..ServerCli::default()
  };
  let running = serve_with_extension(cli, Arc::new(CommunityExtension::new()), shutdown.clone())
    .await
    .expect("start community allinone server");
  let addr = running.addr;

  // 3. ServerConfigType.features omits Copilot on CommunityExtension.
  let (st, cfg_body) = graphql_post(addr, "{ serverConfig { features } }", &[]).await;
  assert_eq!(st, 200);
  let features = cfg_body["data"]["serverConfig"]["features"]
    .as_array()
    .expect("features array");
  assert!(
    !features.iter().any(|f| f.as_str() == Some("Copilot")),
    "CommunityExtension must not advertise ServerFeature::Copilot: {features:?}"
  );

  // 4. Unauthenticated GraphQL & all 7 /api/copilot/* routes return 401 AUTHENTICATION_REQUIRED.
  let (_, unauth_gql) = graphql_post(
    addr,
    r#"mutation { createCopilotSession(options: { workspaceId: "ws-1", promptName: "Chat With AFFiNE AI" }) }"#,
    &[],
  )
  .await;
  assert_eq!(unauth_gql["errors"][0]["extensions"]["status"], 401);
  assert_eq!(unauth_gql["errors"][0]["extensions"]["type"], "AUTHENTICATION_REQUIRED");

  let rest_routes = [
    ("GET", "/api/copilot/chat/s1/stream"),
    ("GET", "/api/copilot/chat/s1/stream-object"),
    ("GET", "/api/copilot/actions/s1/stream"),
    ("GET", "/api/copilot/chat/s1/images"),
    ("GET", "/api/copilot/unsplash/photos?query=cat"),
    ("PUT", "/api/copilot/chat/s1/attachments/abc?workspaceId=ws1"),
    ("GET", "/api/copilot/chat/s1/attachments/abc?workspaceId=ws1"),
  ];
  for (method, path) in rest_routes {
    let (status, _, body) = http_request(addr, method, path, &[], b"").await;
    assert_eq!(status, 401, "{method} {path} must require auth");
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["type"], "AUTHENTICATION_REQUIRED");
  }

  // Create admin user & sign in to get session cookie.
  let setup_body = serde_json::to_vec(&json!({
    "email": "copilot-admin@example.test",
    "name": "Copilot Admin",
    "password": "Password123!"
  }))
  .unwrap();
  let (st, head, _) = http_request(
    addr,
    "POST",
    "/api/setup/create-admin-user",
    &[("Content-Type", "application/json")],
    &setup_body,
  )
  .await;
  assert_eq!(st, 201);
  let cookie = extract_cookie_header(&head);
  assert!(!cookie.is_empty());

  // 5. Authenticated GraphQL & all 7 REST routes return 403 ACTION_FORBIDDEN ("Copilot is disabled.").
  let (_, authed_gql) = graphql_post(
    addr,
    "{ currentUser { copilot { quota { used } } } }",
    &[("Cookie", &cookie)],
  )
  .await;
  assert_eq!(authed_gql["errors"][0]["extensions"]["status"], 403);
  assert_eq!(authed_gql["errors"][0]["extensions"]["type"], "ACTION_FORBIDDEN");
  assert_eq!(authed_gql["errors"][0]["extensions"]["message"], "Copilot is disabled.");

  let (_, authed_mut) = graphql_post(
    addr,
    r#"mutation { createCopilotSession(options: { workspaceId: "ws-1", promptName: "Chat With AFFiNE AI" }) }"#,
    &[("Cookie", &cookie)],
  )
  .await;
  assert_eq!(authed_mut["errors"][0]["extensions"]["status"], 403);
  assert_eq!(authed_mut["errors"][0]["extensions"]["message"], "Copilot is disabled.");

  for (method, path) in rest_routes {
    let (status, _, body) = http_request(addr, method, path, &[("Cookie", &cookie)], b"hello").await;
    assert_eq!(status, 403, "{method} {path} must return 403 when Copilot disabled");
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["type"], "ACTION_FORBIDDEN");
    assert_eq!(v["message"], "Copilot is disabled.");
  }

  // 6. UserType.quotaUsage matches UserType.quota.usedStorageQuota.
  let user_id: String = sqlx::query_scalar("SELECT id FROM users WHERE email = 'copilot-admin@example.test'")
    .fetch_one(db.pool())
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspaces (id, name) VALUES ('ws-personal-1', 'Personal')")
    .execute(db.pool())
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO workspace_members (id, workspace_id, user_id, role, state) \
     VALUES ('wm-1', 'ws-personal-1', $1, 'owner', 'active')",
  )
  .bind(&user_id)
  .execute(db.pool())
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO blobs (workspace_id, key, mime, size, status) \
     VALUES ('ws-personal-1', 'blob-1', 'text/plain', 4096, 'completed')",
  )
  .execute(db.pool())
  .await
  .unwrap();

  let (_, quota_resp) = graphql_post(
    addr,
    "{ currentUser { quota { usedStorageQuota } quotaUsage { storageQuota } } }",
    &[("Cookie", &cookie)],
  )
  .await;
  assert!(quota_resp["errors"].is_null(), "quota query errors: {quota_resp}");
  assert_eq!(quota_resp["data"]["currentUser"]["quota"]["usedStorageQuota"], 4096);
  assert_eq!(quota_resp["data"]["currentUser"]["quotaUsage"]["storageQuota"], 4096);

  // 7. Low client version when client.versionControl.enabled = true -> 403 UNSUPPORTED_CLIENT_VERSION (before CopilotDisabled).
  // Also verify anonymous attachment PUT/GET missing workspaceId returns 401 (auth before query validation),
  // and >120 consecutive anonymous attachment GET/PUT requests always return 401 with no x-ratelimit-* headers.
  let (anon_put_status, _, _) = http_request(addr, "PUT", "/api/copilot/chat/s1/attachments/k1", &[], b"").await;
  assert_eq!(anon_put_status, 401);
  let (anon_get_status, _, _) = http_request(addr, "GET", "/api/copilot/chat/s1/attachments/k1", &[], b"").await;
  assert_eq!(anon_get_status, 401);
  for i in 0..125 {
    let method = if i % 2 == 0 { "GET" } else { "PUT" };
    let (st, head, _) = http_request(addr, method, "/api/copilot/chat/s1/attachments/k1?workspaceId=ws1", &[], b"").await;
    assert_eq!(st, 401, "anonymous {method} #{i} must stay 401 without throttling");
    let lower = head.to_ascii_lowercase();
    assert!(
      !lower.contains("x-ratelimit-"),
      "anonymous {method} #{i} must not emit x-ratelimit-* headers: {head}"
    );
  }
  let (_, upd) = graphql_post(
    addr,
    r#"mutation { updateAppConfig(updates: [{ module: "client", key: "versionControl", value: { enabled: true, requiredVersion: "9.9.9" } }]) }"#,
    &[("Cookie", &cookie)],
  )
  .await;
  assert!(upd["errors"].is_null(), "updateAppConfig error: {upd}");

  let (vc_status, _, vc_body) = http_request(
    addr,
    "GET",
    "/api/copilot/chat/s1/stream",
    &[("Cookie", &cookie), ("x-affine-version", "0.1.0")],
    b"",
  )
  .await;
  assert_eq!(vc_status, 403);
  let vc_json: Value = serde_json::from_slice(&vc_body).unwrap();
  assert_eq!(vc_json["name"], "UNSUPPORTED_CLIENT_VERSION");

  shutdown.cancel();
  let _ = running.join_handle.await;

  // 8. Role isolation: Front and Worker roles return 404 on /api/copilot/*.
  for role_arg in [RoleArg::Front, RoleArg::Worker] {
    let role_shutdown = CancellationToken::new();
    let role_cli = ServerCli {
      role: Some(role_arg),
      deployment_mode: DeploymentModeArg::Selfhosted,
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      redis_url: None,
      private_key: Some("test-copilot-community-key".into()),
      external_url: Some("http://127.0.0.1".into()),
      skip_schema_check: true,
      ..ServerCli::default()
    };
    let role_srv = serve_with_extension(role_cli, Arc::new(CommunityExtension::new()), role_shutdown.clone())
      .await
      .expect("start role server");
    let (st, _, _) = http_request(role_srv.addr, "GET", "/api/copilot/chat/s1/stream", &[], b"").await;
    assert_eq!(st, 404, "role {role_arg:?} must not mount /api/copilot/*");
    role_shutdown.cancel();
    let _ = role_srv.join_handle.await;
  }

    db.pool().close().await;
  });
}
