//! End-to-end Redis EventBus to `server-sync` Socket.IO room delivery tests for
//! `notification.count.changed`, `comment.changed`, and `workspace.access.changed`.

use std::net::SocketAddr;
use std::time::Duration;

use serde_json::{Value, json};
use server_db::{DbConfig, ServerDb};
use server_domain::events::{EventBusPublisher as _, RedisEventPublisher};
use server_sync::{SyncConfig, SyncServer};
use test_db_harness::{pg::PgCluster, redis::TestRedis};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::{TcpListener, TcpStream};
use uuid::Uuid;

async fn http_request(addr: SocketAddr, method: &str, path: &str, cookie: &str, body: Option<&str>) -> String {
  let mut stream = TcpStream::connect(addr).await.expect("connect sync server");
  let body_bytes = body.unwrap_or("").as_bytes();
  let req = if body.is_some() {
    format!(
      "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: {cookie}\r\nContent-Type: text/plain;charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
      body_bytes.len()
    )
  } else {
    format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: {cookie}\r\nConnection: close\r\n\r\n")
  };
  stream.write_all(req.as_bytes()).await.unwrap();
  if !body_bytes.is_empty() {
    stream.write_all(body_bytes).await.unwrap();
  }
  stream.flush().await.unwrap();

  let mut raw = Vec::new();
  stream.read_to_end(&mut raw).await.unwrap();
  let text = String::from_utf8(raw).unwrap();
  let (head, rest) = text.split_once("\r\n\r\n").expect("valid http response");
  assert!(
    head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200"),
    "expected 200 OK for {method} {path}, got: {head}"
  );
  if head.to_ascii_lowercase().contains("transfer-encoding: chunked") {
    decode_chunked(rest)
  } else {
    rest.to_owned()
  }
}

fn decode_chunked(mut raw: &str) -> String {
  let mut out = String::new();
  while let Some((size_hex, rest)) = raw.split_once("\r\n") {
    let size = usize::from_str_radix(size_hex.trim(), 16).unwrap_or(0);
    if size == 0 {
      break;
    }
    let chunk = &rest[..size.min(rest.len())];
    out.push_str(chunk);
    raw = rest.get(size + 2..).unwrap_or("");
  }
  out
}

#[test]
fn eventbus_delivers_notification_comment_and_workspace_access_to_socketio_rooms() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load prisma migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure migrated template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test database");
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let db_url = lease.url().to_owned();
  let redis_url = redis.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [4, 2, 2, 1],
    })
    .await
    .expect("connect test db");

    let user_id = Uuid::new_v4().to_string();
    let session_id = Uuid::new_v4().to_string();
    let user_session_id = Uuid::new_v4().to_string();
    let workspace_id = Uuid::new_v4().to_string();
    let doc_id = "doc-rt-1";

    sqlx::query("INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, 'RT User', $2, true, false)")
      .bind(&user_id)
      .bind(format!("rt-{}@affine.test", &user_id[..8]))
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO multiple_users_sessions (id) VALUES ($1)")
      .bind(&session_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions (id, session_id, user_id, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
    )
    .bind(&user_session_id)
    .bind(&session_id)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'RT WS')")
      .bind(&workspace_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_access_policies (workspace_id) VALUES ($1)")
      .bind(&workspace_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, source, state) VALUES ($1, $2, $3, 'owner', 'legacy', 'active')",
    )
    .bind(format!("perm_{}", Uuid::new_v4().simple()))
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $2, $3, now())")
      .bind(&workspace_id)
      .bind(doc_id)
      .bind(vec![0_u8, 0])
      .execute(db.pool())
      .await
      .unwrap();

    let mut cfg = SyncConfig::for_deployment_channel("canary");
    cfg.redis_url = Some(redis_url.clone());
    let server = SyncServer::start(db.clone(), cfg).await;
    let router = server.router();

    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind tcp");
    let addr = listener.local_addr().unwrap();
    let serve_task = tokio::spawn(async move {
      let _ = axum::serve(listener, router).await;
    });

    let cookie = format!("affine_session={session_id}; affine_user_id={user_id}");

    // 1. Engine.IO handshake + Socket.IO CONNECT.
    let open_body = http_request(addr, "GET", "/socket.io/?EIO=4&transport=polling", &cookie, None).await;
    let open_json: Value = serde_json::from_str(open_body.strip_prefix('0').expect("open packet")).unwrap();
    let sid = open_json["sid"].as_str().unwrap().to_owned();

    http_request(
      addr,
      "POST",
      &format!("/socket.io/?EIO=4&transport=polling&sid={sid}"),
      &cookie,
      Some("40"),
    )
    .await;
    let connect_poll = http_request(
      addr,
      "GET",
      &format!("/socket.io/?EIO=4&transport=polling&sid={sid}"),
      &cookie,
      None,
    )
    .await;
    assert!(
      connect_poll.contains("40{"),
      "expected socketio connect ack: {connect_poll}"
    );

    // 2. Subscribe to all four realtime topics.
    let sub_notif = format!(
      "421{}",
      json!(["realtime:subscribe", { "clientVersion": "0.27.5", "topic": "notification.count.changed", "input": {} }])
    );
    let sub_comment = format!(
      "422{}",
      json!(["realtime:subscribe", { "clientVersion": "0.27.5", "topic": "comment.changed", "input": { "workspaceId": workspace_id, "docId": doc_id } }])
    );
    let sub_ws_access = format!(
      "423{}",
      json!(["realtime:subscribe", { "clientVersion": "0.27.5", "topic": "workspace.access.changed", "input": { "workspaceId": workspace_id } }])
    );
    let sub_ws_members = format!(
      "424{}",
      json!(["realtime:subscribe", { "clientVersion": "0.27.5", "topic": "workspace.members.changed", "input": { "workspaceId": workspace_id } }])
    );
    let post_path = format!("/socket.io/?EIO=4&transport=polling&sid={sid}");
    http_request(addr, "POST", &post_path, &cookie, Some(&sub_notif)).await;
    http_request(addr, "POST", &post_path, &cookie, Some(&sub_comment)).await;
    http_request(addr, "POST", &post_path, &cookie, Some(&sub_ws_access)).await;
    http_request(addr, "POST", &post_path, &cookie, Some(&sub_ws_members)).await;

    let acks = http_request(addr, "GET", &post_path, &cookie, None).await;
    assert!(acks.contains("431["), "expected notif subscribe ack: {acks}");
    assert!(acks.contains("432["), "expected comment subscribe ack: {acks}");
    assert!(acks.contains("433["), "expected workspace.access subscribe ack: {acks}");
    assert!(acks.contains("434["), "expected workspace.members subscribe ack: {acks}");
    assert_eq!(
      acks.matches("subscriptionId").count(),
      4,
      "all four subscriptions must succeed: {acks}"
    );

    // 3. Publish all four events over real Redis EventBus via server_domain business helper + RedisEventPublisher.
    let publisher = RedisEventPublisher::new(&redis_url, "canary").expect("redis publisher");
    sqlx::query(
      r#"INSERT INTO notifications (id, user_id, level, type, body)
         VALUES (gen_random_uuid()::text, $1, 'Default', 'Invitation'::"NotificationType", '{}'::jsonb)"#,
    )
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("seed unread notification");
    server_domain::notifications::publish_notification_count_changed(&db, &publisher, &user_id, "created").await;
    publisher
      .publish_event(
        "realtime.topic.changed",
        json!({
          "topic": "comment.changed",
          "room": format!("workspace:{workspace_id}:doc:{doc_id}:comment"),
          "input": { "workspaceId": workspace_id, "docId": doc_id },
          "event": { "changed": true, "reason": "comment-created" },
        }),
        None,
      )
      .await
      .expect("publish comment.changed");
    publisher
      .publish_event(
        "realtime.topic.changed",
        json!({
          "topic": "workspace.access.changed",
          "room": format!("workspace:{workspace_id}:access"),
          "input": { "workspaceId": workspace_id },
          "event": { "changed": true, "reason": "member-updated" },
        }),
        None,
      )
      .await
      .expect("publish workspace.access.changed");
    publisher
      .publish_event(
        "realtime.topic.changed",
        json!({
          "topic": "workspace.members.changed",
          "room": format!("workspace:{workspace_id}:members"),
          "input": { "workspaceId": workspace_id },
          "event": { "changed": true, "reason": "member-invited" },
        }),
        None,
      )
      .await
      .expect("publish workspace.members.changed");

    // 4. Collect delivered `realtime:event` packets from the Socket.IO session.
    let mut seen_topics: std::collections::BTreeMap<String, Value> = std::collections::BTreeMap::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while seen_topics.len() < 4 && tokio::time::Instant::now() < deadline {
      let batch = http_request(addr, "GET", &post_path, &cookie, None).await;
      for packet in batch.split('\x1e') {
        if let Some(json_part) = packet.strip_prefix("42")
          && let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(json_part)
          && arr.first().and_then(Value::as_str) == Some("realtime:event")
          && let Some(payload) = arr.get(1)
          && let Some(topic) = payload.get("topic").and_then(Value::as_str)
        {
          seen_topics.insert(topic.to_owned(), payload.clone());
        }
      }
    }

    let notif_event = seen_topics
      .get("notification.count.changed")
      .expect("missing notification.count.changed");
    assert_eq!(notif_event["event"]["count"], json!(1));
    assert_eq!(notif_event["event"]["reason"], json!("created"));
    assert!(
      seen_topics.contains_key("comment.changed"),
      "missing comment.changed, got: {seen_topics:?}"
    );
    assert!(
      seen_topics.contains_key("workspace.access.changed"),
      "missing workspace.access.changed, got: {seen_topics:?}"
    );
    assert!(
      seen_topics.contains_key("workspace.members.changed"),
      "missing workspace.members.changed, got: {seen_topics:?}"
    );

    // 5. Public workspace non-member must be denied workspace.members.changed; active member receives
    // real WorkspaceService::invite_members_with_source events, then is evicted on revoke_member.
    sqlx::query(
      "INSERT INTO workspace_access_policies (workspace_id, visibility, sharing_enabled, updated_at)
       VALUES ($1, 'public', true, now())
       ON CONFLICT (workspace_id) DO UPDATE SET visibility = 'public', sharing_enabled = true",
    )
    .bind(&workspace_id)
    .execute(db.pool())
    .await
    .unwrap();
    let outsider_id = uuid::Uuid::new_v4().to_string();
    let outsider_sess = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email, registered) VALUES ($1, 'Outsider', 'out-rt@affine.test', true)")
      .bind(&outsider_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, now())")
      .bind(&outsider_sess)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO user_sessions (id, session_id, user_id, created_at) VALUES ($1, $1, $2, now())")
      .bind(&outsider_sess)
      .bind(&outsider_id)
      .execute(db.pool())
      .await
      .unwrap();
    let out_cookie = format!("affine_session={outsider_sess}; affine_user_id={outsider_id}");
    let out_open = http_request(addr, "GET", "/socket.io/?EIO=4&transport=polling", &out_cookie, None).await;
    let out_sid = serde_json::from_str::<Value>(out_open.strip_prefix('0').unwrap()).unwrap()["sid"]
      .as_str()
      .unwrap()
      .to_owned();
    let out_post = format!("/socket.io/?EIO=4&transport=polling&sid={out_sid}");
    http_request(addr, "POST", &out_post, &out_cookie, Some("40")).await;
    let _ = http_request(addr, "GET", &out_post, &out_cookie, None).await;
    let out_sub = format!(
      "429{}",
      json!(["realtime:subscribe", { "clientVersion": "0.27.5", "topic": "workspace.members.changed", "input": { "workspaceId": workspace_id } }])
    );
    http_request(addr, "POST", &out_post, &out_cookie, Some(&out_sub)).await;
    let out_ack = http_request(addr, "GET", &out_post, &out_cookie, None).await;
    assert!(
      !out_ack.contains("subscriptionId"),
      "public workspace non-member must be denied workspace.members.changed: {out_ack}"
    );

    // Add outsider as active member, subscribe, verify real invite_members broadcast, then revoke_member evicts.
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source)
       VALUES (gen_random_uuid()::text, $1, $2, 'member', 'active', 'legacy')",
    )
    .bind(&workspace_id)
    .bind(&outsider_id)
    .execute(db.pool())
    .await
    .unwrap();
    let mem_sub = format!(
      "4210{}",
      json!(["realtime:subscribe", { "clientVersion": "0.27.5", "topic": "workspace.members.changed", "input": { "workspaceId": workspace_id } }])
    );
    http_request(addr, "POST", &out_post, &out_cookie, Some(&mem_sub)).await;
    let mem_ack = http_request(addr, "GET", &out_post, &out_cookie, None).await;
    assert!(
      mem_ack.contains("subscriptionId"),
      "active member must subscribe to workspace.members.changed: {mem_ack}"
    );

    use server_spi::ServerExtension as _;
    let pub_arc = std::sync::Arc::new(publisher);
    let ws_svc = server_domain::workspaces::WorkspaceService::new(
      db.clone(),
      server_spi::CommunityExtension::new().quota_gate(),
      pub_arc.clone(),
    )
    .with_event_bus(pub_arc);
    let _ = ws_svc
      .invite_members_with_source(
        &user_id,
        &workspace_id,
        &["invited-rt-1@affine.test".to_owned()],
        server_domain::workspaces::WorkspaceRole::Member,
        None,
      )
      .await
      .expect("invite_members_with_source");
    let mut got_invite_ev = false;
    let d1 = tokio::time::Instant::now() + Duration::from_secs(4);
    while !got_invite_ev && tokio::time::Instant::now() < d1 {
      let b = http_request(addr, "GET", &out_post, &out_cookie, None).await;
      if b.contains("workspace.members.changed") && b.contains("members-updated") {
        got_invite_ev = true;
      }
    }
    assert!(got_invite_ev, "active member must receive real invite_members broadcast");
    // Drain owner's copy of the first invite broadcast so owner acts as a causal barrier below.
    let mut owner_got_first = false;
    let d_own1 = tokio::time::Instant::now() + Duration::from_secs(4);
    while !owner_got_first && tokio::time::Instant::now() < d_own1 {
      let b = http_request(addr, "GET", &post_path, &cookie, None).await;
      if b.contains("workspace.members.changed") {
        owner_got_first = true;
      }
    }
    assert!(owner_got_first, "owner must receive first invite broadcast");

    // Revoke member -> wait for owner to receive the revoke broadcast (proving server-sync processed
    // the Redis invalidation & room revalidation), then drain the revoked member's socket.
    ws_svc
      .revoke_member(&user_id, &workspace_id, &outsider_id)
      .await
      .expect("revoke_member");
    let mut owner_got_revoke = false;
    let d_rev = tokio::time::Instant::now() + Duration::from_secs(4);
    while !owner_got_revoke && tokio::time::Instant::now() < d_rev {
      let b = http_request(addr, "GET", &post_path, &cookie, None).await;
      if b.contains("workspace.members.changed") {
        owner_got_revoke = true;
      }
    }
    assert!(owner_got_revoke, "owner must receive revoke_member broadcast");
    let _ = http_request(addr, "GET", &out_post, &out_cookie, None).await;

    // Subsequent invite_members -> wait for owner to receive fanout, then verify revoked member got nothing.
    let _ = ws_svc
      .invite_members_with_source(
        &user_id,
        &workspace_id,
        &["invited-rt-2@affine.test".to_owned()],
        server_domain::workspaces::WorkspaceRole::Member,
        None,
      )
      .await
      .expect("post-revoke invite");
    let mut owner_got_second = false;
    let d_own2 = tokio::time::Instant::now() + Duration::from_secs(4);
    while !owner_got_second && tokio::time::Instant::now() < d_own2 {
      let b = http_request(addr, "GET", &post_path, &cookie, None).await;
      if b.contains("workspace.members.changed") {
        owner_got_second = true;
      }
    }
    assert!(owner_got_second, "owner must receive post-revoke invite broadcast");
    let after_revoke = http_request(addr, "GET", &out_post, &out_cookie, None).await;
    assert!(
      !after_revoke.contains("workspace.members.changed"),
      "revoked member must not receive subsequent workspace.members.changed: {after_revoke}"
    );

    serve_task.abort();
    server.shutdown().await;
    db.pool().close().await;
  });
}
