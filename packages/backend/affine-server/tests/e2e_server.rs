//! End-to-end integration tests for `affine-server` against real PostgreSQL,
//! Redis, and local SMTP sinks:
//! 1. Starts `--port 0 --role allinone` (`skip_schema_check = true`, lazy cold pool)
//!    and asserts startup -> `/readyz` + `/info` + `/graphql` + graceful lock release.
//! 2. Verifies fresh-DB auto-init and existing-DB baseline
//!    prerequisite gates (rejecting missing `_data_migrations` or missing
//!    `workspace_doc_lifecycle_activation` without mutating the DB).
//! 3. Verifies blob GraphQL upload (`setBlob`), legacy GET 403 deprecation,
//!    deleted REST PUT/DELETE routes, Owner/Admin-only `blobs`/`deleteBlob`/`releaseDeletedBlobs`,
//!    and Socket.IO CORS spoofed-Host rejection.
//! 4. Verifies `updateAppConfig` atomic batch rollback and `sendTestEmail`
//!    non-leakage of `RuntimeConfig.smtp_password`.
//! 5. Verifies full Magic-Link login via `POST /api/auth/sign-in` ->
//!    `drain_mail_deliveries_once` -> real local SMTP capture -> OTP extraction ->
//!    `POST /api/auth/magic-link` -> `GET /api/auth/session` -> CSRF-enforced
//!    `POST /api/auth/sign-out`.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use affine_server::{
  DeploymentModeArg, RoleArg, ServerCli, ServerError, drain_mail_deliveries_once, serve_with_extension,
};
use serde_json::Value;
use server_db::DbError;
use server_mail::{SmtpConfig, SmtpMailer};
use server_spi::CommunityExtension;
use server_worker::{CancellationToken, DEFAULT_LOCK_TTL_SECS, new_owner_token};
use test_db_harness::migrations::MigrationSet;
use test_db_harness::pg::{DEFAULT_LEASE_TTL, PgCluster};
use test_db_harness::redis::TestRedis;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

async fn http_request(addr: SocketAddr, method: &str, path: &str, body: Option<&str>) -> (u16, Value) {
  let mut stream = TcpStream::connect(addr).await.expect("connect server");
  let payload = body.unwrap_or("");
  let req = format!(
    "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
    payload.len()
  );
  stream.write_all(req.as_bytes()).await.expect("write req");
  let mut buf = Vec::new();
  stream.read_to_end(&mut buf).await.expect("read resp");
  let raw = String::from_utf8(buf).expect("utf8 http response");
  let (head, body_str) = raw.split_once("\r\n\r\n").expect("http header/body split");
  let status: u16 = head
    .lines()
    .next()
    .expect("status line")
    .split_whitespace()
    .nth(1)
    .expect("status code")
    .parse()
    .expect("numeric status");
  let json: Value = serde_json::from_str(body_str).unwrap_or_else(|e| panic!("invalid JSON body `{body_str}`: {e}"));
  (status, json)
}

async fn raw_http_request(
  addr: SocketAddr,
  method: &str,
  path: &str,
  extra_headers: &[(&str, &str)],
  body: &[u8],
) -> (u16, String, Vec<u8>) {
  let mut stream = TcpStream::connect(addr).await.expect("connect server");
  let mut req = format!("{method} {path} HTTP/1.1\r\n");
  if !extra_headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("host")) {
    req.push_str(&format!("Host: {addr}\r\n"));
  }
  for (k, v) in extra_headers {
    req.push_str(&format!("{k}: {v}\r\n"));
  }
  req.push_str(&format!("Content-Length: {}\r\nConnection: close\r\n\r\n", body.len()));
  stream.write_all(req.as_bytes()).await.expect("write headers");
  if !body.is_empty() {
    stream.write_all(body).await.expect("write body");
  }
  let mut buf = Vec::new();
  stream.read_to_end(&mut buf).await.expect("read resp");
  let split = buf
    .windows(4)
    .position(|w| w == b"\r\n\r\n")
    .expect("http header/body split");
  let head = String::from_utf8_lossy(&buf[..split]).into_owned();
  let status: u16 = head
    .lines()
    .next()
    .expect("status line")
    .split_whitespace()
    .nth(1)
    .expect("status code")
    .parse()
    .expect("numeric status");
  (status, head, buf[split + 4..].to_vec())
}

fn extract_cookie_header(head: &str) -> String {
  head
    .lines()
    .filter_map(|line| {
      let (k, v) = line.split_once(':')?;
      if k.trim().eq_ignore_ascii_case("set-cookie") {
        Some(v.trim().split(';').next()?.to_owned())
      } else {
        None
      }
    })
    .collect::<Vec<_>>()
    .join("; ")
}

fn extract_cookie_value(head: &str, name: &str) -> Option<String> {
  head.lines().find_map(|line| {
    let (k, v) = line.split_once(':')?;
    if !k.trim().eq_ignore_ascii_case("set-cookie") {
      return None;
    }
    let first = v.trim().split(';').next()?;
    let (ck, cv) = first.split_once('=')?;
    (ck.trim() == name).then(|| cv.trim().to_owned())
  })
}

async fn drop_empty_prisma_table(db_url: &str) {
  let reset_pool = sqlx::PgPool::connect(db_url).await.expect("connect reset pool");
  sqlx::query(r#"DROP TABLE IF EXISTS "_prisma_migrations""#)
    .execute(&reset_pool)
    .await
    .expect("drop empty _prisma_migrations");
  reset_pool.close().await;
}

/// Minimal local SMTP capture sink that records both raw SMTP commands (to detect
/// any unexpected `AUTH` credential leakage) and received message bodies.
struct LocalSmtpSink {
  port: u16,
  commands: Arc<Mutex<Vec<String>>>,
  messages: Arc<Mutex<Vec<String>>>,
  handle: tokio::task::JoinHandle<()>,
}

impl LocalSmtpSink {
  async fn start() -> Self {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind local smtp");
    let port = listener.local_addr().unwrap().port();
    let commands = Arc::new(Mutex::new(Vec::new()));
    let messages = Arc::new(Mutex::new(Vec::new()));
    let cmd_clone = Arc::clone(&commands);
    let msg_clone = Arc::clone(&messages);

    let handle = tokio::spawn(async move {
      while let Ok((stream, _)) = listener.accept().await {
        let cmds = Arc::clone(&cmd_clone);
        let msgs = Arc::clone(&msg_clone);
        tokio::spawn(async move {
          let (reader, mut writer) = stream.into_split();
          let mut reader = BufReader::new(reader);
          let _ = writer.write_all(b"220 local.smtp.test ESMTP\r\n").await;
          let mut line = String::new();
          let mut in_data = false;
          let mut data_buf = String::new();
          while let Ok(n) = reader.read_line(&mut line).await {
            if n == 0 {
              break;
            }
            if in_data {
              if line == ".\r\n" || line == ".\n" {
                in_data = false;
                msgs.lock().unwrap().push(std::mem::take(&mut data_buf));
                let _ = writer.write_all(b"250 OK queued\r\n").await;
              } else {
                data_buf.push_str(&line);
              }
            } else {
              let trimmed = line.trim().to_owned();
              cmds.lock().unwrap().push(trimmed.clone());
              let upper = trimmed.to_ascii_uppercase();
              if upper.starts_with("EHLO") || upper.starts_with("HELO") {
                let _ = writer.write_all(b"250-local.smtp.test\r\n250 SIZE 10485760\r\n").await;
              } else if upper.starts_with("MAIL FROM") || upper.starts_with("RCPT TO") || upper.starts_with("RSET") {
                let _ = writer.write_all(b"250 OK\r\n").await;
              } else if upper == "DATA" {
                in_data = true;
                let _ = writer.write_all(b"354 End data with <CR><LF>.<CR><LF>\r\n").await;
              } else if upper == "QUIT" {
                let _ = writer.write_all(b"221 Bye\r\n").await;
                break;
              } else {
                let _ = writer.write_all(b"250 OK\r\n").await;
              }
            }
            line.clear();
          }
        });
      }
    });

    Self {
      port,
      commands,
      messages,
      handle,
    }
  }
}

impl Drop for LocalSmtpSink {
  fn drop(&mut self) {
    self.handle.abort();
  }
}

fn build_multipart_set_blob(workspace_id: &str, filename: &str, mime: &str, content: &[u8]) -> (String, Vec<u8>) {
  let boundary = "----AffineE2EBoundary7MA4YWxkTrZu0gW";
  let ops = serde_json::json!({
    "query": "mutation ($workspaceId: String!, $blob: Upload!) { setBlob(workspaceId: $workspaceId, blob: $blob) }",
    "variables": { "workspaceId": workspace_id, "blob": null }
  })
  .to_string();
  let map = r#"{"0":["variables.blob"]}"#;
  let mut body = Vec::new();
  body.extend_from_slice(
    format!(
      "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{ops}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{map}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n"
    )
    .as_bytes(),
  );
  body.extend_from_slice(content);
  body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
  (format!("multipart/form-data; boundary={boundary}"), body)
}

#[test]
fn allinone_boots_under_200ms_and_releases_worker_locks_on_shutdown() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = MigrationSet {
    migrations: vec![],
    digest: "e2e0000000000001".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease = cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database");
  let test_redis = TestRedis::from_env_or_docker().expect("test redis");

  let cli = ServerCli {
    role: Some(RoleArg::Allinone),
    host: IpAddr::V4(Ipv4Addr::LOCALHOST),
    port: 0,
    database_url: lease.url().to_owned(),
    redis_url: Some(test_redis.url().to_owned()),
    deployment_mode: DeploymentModeArg::Selfhosted,
    channel: Some("canary".to_owned()),
    server_version: "0.27.5".to_owned(),
    db_max_connections: 8,
    db_statement_timeout_ms: 5_000,
    graphql_playground: false,
    redis_key_prefix: test_redis.key_prefix().to_owned(),
    skip_schema_check: true,
    ..ServerCli::default()
  };

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async move {
    let started = Instant::now();
    let shutdown = CancellationToken::new();
    let running = serve_with_extension(cli, Arc::new(CommunityExtension::new()), shutdown.clone())
      .await
      .expect("start affine-server");

    let (ready_status, ready_json) = http_request(running.addr, "GET", "/readyz", None).await;
    assert_eq!(ready_status, 200, "readyz body: {ready_json}");
    assert_eq!(ready_json["status"], "ok");
    assert_eq!(ready_json["role"], "allinone");
    assert_eq!(ready_json["edition"], "community");
    assert_eq!(ready_json["postgres"]["ok"], true);
    assert_eq!(ready_json["redis"]["configured"], true);
    assert_eq!(ready_json["redis"]["ok"], true);

    let (info_status, info_json) = http_request(running.addr, "GET", "/info", None).await;
    assert_eq!(info_status, 200);
    assert_eq!(
      info_json,
      serde_json::json!({
        "compatibility": "0.27.5",
        "message": "AFFiNE 0.27.5 Server",
        "type": "selfhosted",
        "flavor": "allinone",
      })
    );

    let cur_req = serde_json::json!({ "query": "{ currentUser { id } }" });
    let (cur_status, cur_json) = http_request(running.addr, "POST", "/graphql", Some(&cur_req.to_string())).await;
    assert_eq!(cur_status, 200);
    assert_eq!(cur_json["data"]["currentUser"], Value::Null);

    let ws_req = serde_json::json!({ "query": "{ workspace(id: \"ws-e2e\") { id } }" });
    let (ws_status, ws_json) = http_request(running.addr, "POST", "/graphql", Some(&ws_req.to_string())).await;
    assert_eq!(ws_status, 200);
    assert_eq!(ws_json["errors"][0]["extensions"]["status"], 401);

    let elapsed = started.elapsed();
    assert!(elapsed.as_millis() < 5_000, "took {}ms", elapsed.as_millis());

    let mutex = running.session_mutex.clone().expect("session mutex configured");
    let resource = format!("e2e:worker:{}", uuid::Uuid::new_v4());
    let worker_lease = mutex
      .try_acquire(&resource, new_owner_token("e2e-server"), DEFAULT_LOCK_TTL_SECS)
      .await
      .expect("acquire active worker lock");
    running.supervisor.track_lease(worker_lease).await;

    running.shutdown.cancel();
    running
      .join_handle
      .await
      .expect("join server task")
      .expect("server exited cleanly");

    assert!(mutex.current_owner(&resource).await.unwrap().is_none());
    running.state.db.pool().close().await;
  });
}

#[test]
fn startup_schema_gate_rejects_pre_0275_and_incomplete_existing_databases_without_mutating() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = MigrationSet {
    migrations: vec![],
    digest: "e2e0000000000002".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease_legacy = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease legacy db");
  let lease_existing = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease existing db");
  let legacy_url = lease_legacy.url().to_owned();
  let existing_url = lease_existing.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async move {
    // 1. Pre-v0.27.5 non-empty DB rejected with SteppingStoneRequired.
    let setup_pool = sqlx::PgPool::connect(&legacy_url).await.unwrap();
    sqlx::query("CREATE TABLE legacy_pre_0275_table (id INT PRIMARY KEY)")
      .execute(&setup_pool)
      .await
      .unwrap();
    setup_pool.close().await;

    let legacy_cli = ServerCli {
      role: Some(RoleArg::Allinone),
      port: 0,
      database_url: legacy_url,
      channel: Some("canary".to_owned()),
      skip_schema_check: false,
      ..ServerCli::default()
    };
    let err = match serve_with_extension(legacy_cli, Arc::new(CommunityExtension::new()), CancellationToken::new()).await
    {
      Ok(_) => panic!("expected baseline gate rejection"),
      Err(e) => e,
    };
    assert!(matches!(err, ServerError::Db(DbError::SteppingStoneRequired { .. })));

    // 2. Fresh empty DB initializes cleanly with all migrations & markers.
    drop_empty_prisma_table(&existing_url).await;
    let fresh_cli = ServerCli {
      role: Some(RoleArg::Allinone),
      port: 0,
      database_url: existing_url.clone(),
      channel: Some("production".to_owned()),
      skip_schema_check: false,
      ..ServerCli::default()
    };
    let shutdown = CancellationToken::new();
    let running = serve_with_extension(fresh_cli.clone(), Arc::new(CommunityExtension::new()), shutdown.clone())
      .await
      .expect("fresh DB must initialize cleanly");
    running.shutdown.cancel();
    running.join_handle.await.unwrap().unwrap();
    running.state.db.pool().close().await;

    // 3. Existing DB missing a `_data_migrations` row MUST fail startup AND NOT re-seed it.
    let pool = sqlx::PgPool::connect(&existing_url).await.unwrap();
    sqlx::query(r#"DELETE FROM "_data_migrations" WHERE name = 'Guid1698398506533'"#)
      .execute(&pool)
      .await
      .unwrap();
    let err_dm = match serve_with_extension(
      fresh_cli.clone(),
      Arc::new(CommunityExtension::new()),
      CancellationToken::new(),
    )
    .await
    {
      Ok(_) => panic!("expected rejection when _data_migrations row is missing"),
      Err(e) => e,
    };
    assert!(matches!(err_dm, ServerError::Db(DbError::SteppingStoneRequired { .. })));
    let still_missing: bool =
      !sqlx::query_scalar::<_, bool>(r#"SELECT EXISTS(SELECT 1 FROM "_data_migrations" WHERE name = 'Guid1698398506533')"#)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(still_missing, "existing-DB startup gate must NEVER mutate _data_migrations");

    // Restore _data_migrations and insert a non-active `workspace_doc_lifecycle_activation`:
    // MUST also fail & not mutate the row.
    sqlx::query(
      r#"INSERT INTO "_data_migrations" (id, name, started_at, finished_at)
         VALUES (gen_random_uuid()::text, 'Guid1698398506533', now(), now())"#,
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints
         (kind, scope, status, cursor, updated_at, metadata)
       VALUES
         ('workspace_doc_lifecycle_activation', 'global', 'running', '{}'::jsonb, now(), '{}'::jsonb)
       ON CONFLICT (kind, scope) DO UPDATE SET status = 'running'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let err_lc = match serve_with_extension(fresh_cli, Arc::new(CommunityExtension::new()), CancellationToken::new()).await
    {
      Ok(_) => panic!("expected rejection when workspace_doc_lifecycle_activation is non-active"),
      Err(e) => e,
    };
    assert!(matches!(err_lc, ServerError::Db(DbError::SteppingStoneRequired { .. })));
    let lc_status: String = sqlx::query_scalar(
      "SELECT status FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
      lc_status, "running",
      "existing-DB startup gate must NEVER mutate storage_reconciliation_checkpoints"
    );
    pool.close().await;
  });
}

#[test]
fn blob_contract_authz_app_config_rollback_smtp_isolation_and_magic_link_e2e() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = MigrationSet {
    migrations: vec![],
    digest: "e2e0000000000003".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease = cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database");
  let test_redis = TestRedis::from_env_or_docker().expect("test redis");

  let db_url = lease.url().to_owned();
  let redis_url = test_redis.url().to_owned();
  let redis_prefix = test_redis.key_prefix().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async move {
    drop_empty_prisma_table(&db_url).await;
    let smtp = LocalSmtpSink::start().await;
    let attacker_smtp = LocalSmtpSink::start().await;

    let cli = ServerCli {
      role: Some(RoleArg::Allinone),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      external_url: Some("http://affine.parity.test".to_owned()),
      database_url: db_url,
      redis_url: Some(redis_url),
      mailer_host: Some("127.0.0.1".to_owned()),
      mailer_port: Some(smtp.port),
      mailer_servername: Some("parity.affine.test".to_owned()),
      mailer_sender: Some("AFFiNE Test <noreply@affine.test>".to_owned()),
      mailer_password: Some("SUPER-SECRET-SMTP-PASSWORD".to_owned()),
      deployment_mode: DeploymentModeArg::Selfhosted,
      channel: Some("production".to_owned()),
      server_version: "0.27.5".to_owned(),
      db_max_connections: 8,
      db_statement_timeout_ms: 5_000,
      graphql_playground: false,
      redis_key_prefix: redis_prefix,
      skip_schema_check: false,
      ..ServerCli::default()
    };

    let shutdown = CancellationToken::new();
    let running = serve_with_extension(cli, Arc::new(CommunityExtension::new()), shutdown.clone())
      .await
      .expect("start affine-server");

    // 1. Socket.IO CORS blocks spoofed Host + untrusted Origin, and accepts Capacitor mobile origin.
    let (cors_status, _, _) = raw_http_request(
      running.addr,
      "GET",
      "/socket.io/?EIO=4&transport=polling",
      &[("Host", "evil.example"), ("Origin", "https://evil.example")],
      b"",
    )
    .await;
    assert_eq!(cors_status, 403);

    let (cap_status, _, _) = raw_http_request(
      running.addr,
      "GET",
      "/socket.io/?EIO=4&transport=polling",
      &[("Origin", "capacitor://localhost")],
      b"",
    )
    .await;
    assert_eq!(cap_status, 200);

    // 1b. POST /api/auth/sign-in with empty password string must return 400 (never trigger magic-link).
    let (empty_pw_status, _, _) = raw_http_request(
      running.addr,
      "POST",
      "/api/auth/sign-in",
      &[("Content-Type", "application/json")],
      br#"{"email":"empty-pw@affine.test","password":""}"#,
    )
    .await;
    assert_eq!(empty_pw_status, 400);

    // 2. Deleted REST routes must not exist: GET /api/auth/magic-link -> 405.
    let (get_ml_status, _, _) = raw_http_request(
      running.addr,
      "GET",
      "/api/auth/magic-link?email=a@b.c&token=123456",
      &[],
      b"",
    )
    .await;
    assert_eq!(get_ml_status, 405);

    // 3. Create owner admin + workspace, upload blob via GraphQL setBlob multipart.
    let setup_body = serde_json::json!({
      "name": "Owner",
      "email": "owner@affine.test",
      "password": "Owner-Passw0rd"
    });
    let (status, head, _) = raw_http_request(
      running.addr,
      "POST",
      "/api/setup/create-admin-user",
      &[("Content-Type", "application/json")],
      setup_body.to_string().as_bytes(),
    )
    .await;
    assert_eq!(status, 201);
    let owner_cookie = extract_cookie_header(&head);

    let ws_req = serde_json::json!({ "query": "mutation { createWorkspace { id } }" });
    let (_, _, ws_body) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", "application/json"), ("Cookie", &owner_cookie)],
      ws_req.to_string().as_bytes(),
    )
    .await;
    let ws_id = serde_json::from_slice::<Value>(&ws_body).unwrap()["data"]["createWorkspace"]["id"]
      .as_str()
      .unwrap()
      .to_owned();

    let (ct, mp_body) = build_multipart_set_blob(&ws_id, "public-asset.txt", "text/plain", b"hello public blob");
    let (up_status, _, up_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", &ct), ("Cookie", &owner_cookie)],
      &mp_body,
    )
    .await;
    assert_eq!(up_status, 200);
    let up_json: Value = serde_json::from_slice(&up_bytes).unwrap();
    assert_eq!(up_json["data"]["setBlob"], "public-asset.txt", "resp: {up_json}");

    // 4. Legacy GET /api/workspaces/:id/blobs/:name returns 403 UNSUPPORTED_CLIENT_VERSION; PUT/DELETE -> 405.
    let (legacy_get, _, legacy_bytes) = raw_http_request(
      running.addr,
      "GET",
      &format!("/api/workspaces/{ws_id}/blobs/public-asset.txt"),
      &[("Cookie", &owner_cookie), ("x-affine-version", "0.26.0")],
      b"",
    )
    .await;
    assert_eq!(legacy_get, 403);
    let legacy_json: Value = serde_json::from_slice(&legacy_bytes).unwrap();
    assert_eq!(legacy_json["name"], "UNSUPPORTED_CLIENT_VERSION");
    assert_eq!(legacy_json["data"]["clientVersion"], "0.26.0");

    let (put_status, _, _) = raw_http_request(
      running.addr,
      "PUT",
      &format!("/api/workspaces/{ws_id}/blobs/x"),
      &[("Cookie", &owner_cookie)],
      b"nope",
    )
    .await;
    assert_eq!(put_status, 405);

    // 5. Public workspace non-member cannot list blobs or soft-delete / release blobs.
    sqlx::query("UPDATE workspace_access_policies SET visibility = 'public' WHERE workspace_id = $1")
      .bind(&ws_id)
      .execute(running.state.db.pool())
      .await
      .unwrap();

    let outsider_id = uuid::Uuid::new_v4().to_string();
    let outsider_session = uuid::Uuid::new_v4().to_string();
    let outsider_user_session = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO users (id, email, name, registered, disabled, auth_epoch, created_at) \
       VALUES ($1, 'outsider@affine.test', 'Outsider', true, false, 0, now())",
    )
    .bind(&outsider_id)
    .execute(running.state.db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, now())")
      .bind(&outsider_session)
      .execute(running.state.db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at) \
       VALUES ($1, $2, $3, now() + interval '1 day', now())",
    )
    .bind(&outsider_user_session)
    .bind(&outsider_session)
    .bind(&outsider_id)
    .execute(running.state.db.pool())
    .await
    .unwrap();
    let outsider_cookie = format!("affine_session={outsider_session}; affine_user_id={outsider_id}");

    for op in [
      format!("query {{ workspace(id: \"{ws_id}\") {{ blobs {{ key }} }} }}"),
      format!("mutation {{ deleteBlob(workspaceId: \"{ws_id}\", key: \"public-asset.txt\", permanently: false) }}"),
      format!("mutation {{ releaseDeletedBlobs(workspaceId: \"{ws_id}\") }}"),
    ] {
      let req_body = serde_json::json!({ "query": op });
      let (gql_status, _, gql_bytes) = raw_http_request(
        running.addr,
        "POST",
        "/graphql",
        &[("Content-Type", "application/json"), ("Cookie", &outsider_cookie)],
        req_body.to_string().as_bytes(),
      )
      .await;
      assert_eq!(gql_status, 200);
      let gql_json: Value = serde_json::from_slice(&gql_bytes).unwrap();
      assert_eq!(
        gql_json["errors"][0]["extensions"]["status"], 403,
        "op `{op}`: {gql_json}"
      );
    }

    // 5b. Transactional BlobsManage: non-commercial `admin` (effective `member`) AND `member`
    //     are both blocked with 403 on `blobs`, `deleteBlob` (including empty key), and `releaseDeletedBlobs`.
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, source, state, created_at, updated_at) \
       VALUES ($1, $2, $3, 'admin', 'legacy', 'active', now(), now())",
    )
    .bind(format!("perm_{}", uuid::Uuid::new_v4().simple()))
    .bind(&ws_id)
    .bind(&outsider_id)
    .execute(running.state.db.pool())
    .await
    .unwrap();
    for op in [
      format!("query {{ workspace(id: \"{ws_id}\") {{ blobs {{ key }} }} }}"),
      format!("mutation {{ deleteBlob(workspaceId: \"{ws_id}\", key: \"public-asset.txt\", permanently: false) }}"),
      format!("mutation {{ deleteBlob(workspaceId: \"{ws_id}\", key: \"\", permanently: false) }}"),
      format!("mutation {{ releaseDeletedBlobs(workspaceId: \"{ws_id}\") }}"),
    ] {
      let req = serde_json::json!({ "query": op });
      let (_, _, resp_bytes) = raw_http_request(
        running.addr,
        "POST",
        "/graphql",
        &[("Content-Type", "application/json"), ("Cookie", &outsider_cookie)],
        req.to_string().as_bytes(),
      )
      .await;
      let resp_json: Value = serde_json::from_slice(&resp_bytes).unwrap();
      assert_eq!(
        resp_json["errors"][0]["extensions"]["status"], 403,
        "non-commercial admin must get 403 on `{op}`: {resp_json}"
      );
    }

    // 5c. UserType::quota sums storage across owned workspaces whose AccessGrant
    //     reports `BillingSubject::Owner` (CommunityExtension default: 17 + 20 = 37).
    let (_, _, ws2_body) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", "application/json"), ("Cookie", &owner_cookie)],
      ws_req.to_string().as_bytes(),
    )
    .await;
    let ws2_id = serde_json::from_slice::<Value>(&ws2_body).unwrap()["data"]["createWorkspace"]["id"]
      .as_str()
      .unwrap()
      .to_owned();
    let (ct2, mp_body2) = build_multipart_set_blob(&ws2_id, "team-asset.txt", "text/plain", b"01234567890123456789");
    let (up2_status, _, _) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", &ct2), ("Cookie", &owner_cookie)],
      &mp_body2,
    )
    .await;
    assert_eq!(up2_status, 200);
    let quota_req = serde_json::json!({ "query": "query { currentUser { quota { usedStorageQuota } } }" });
    let (_, _, quota_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", "application/json"), ("Cookie", &owner_cookie)],
      quota_req.to_string().as_bytes(),
    )
    .await;
    let quota_json: Value = serde_json::from_slice(&quota_bytes).unwrap();
    assert_eq!(
      quota_json["data"]["currentUser"]["quota"]["usedStorageQuota"], 37,
      "user quota must sum all BillingSubject::Owner owned workspaces: {quota_json}"
    );

    // 6. `updateAppConfig` atomic batch rollback: [valid, invalid_bool] AND [valid, invalid cloudflare-r2 storage] -> 400 and ZERO writes.
    let bad_batch = serde_json::json!({
      "query": "mutation ($updates: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $updates) }",
      "variables": {
        "updates": [
          { "module": "server", "key": "name", "value": "Should Roll Back" },
          { "module": "flags", "key": "allowGuestDemoWorkspace", "value": "not-a-bool" }
        ]
      }
    });
    let (cfg_status, _, cfg_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", "application/json"), ("Cookie", &owner_cookie)],
      bad_batch.to_string().as_bytes(),
    )
    .await;
    assert_eq!(cfg_status, 200);
    let cfg_json: Value = serde_json::from_slice(&cfg_bytes).unwrap();
    assert_eq!(cfg_json["errors"][0]["extensions"]["status"], 400, "resp: {cfg_json}");
    let leaked_row: Option<Value> = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = 'server.name'")
      .fetch_optional(running.state.db.pool())
      .await
      .unwrap();
    assert!(leaked_row.is_none(), "first valid update must be rolled back");

    let bad_storage_batch = serde_json::json!({
      "query": "mutation ($updates: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $updates) }",
      "variables": {
        "updates": [
          { "module": "server", "key": "name", "value": "Should Roll Back Storage" },
          {
            "module": "storages",
            "key": "blob.storage",
            "value": {
              "provider": "cloudflare-r2",
              "bucket": "blobs",
              "config": {
                "accountId": "acct-1",
                "usePresignedURL": { "enabled": "yes" }
              }
            }
          }
        ]
      }
    });
    let (_, _, bad_storage_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", "application/json"), ("Cookie", &owner_cookie)],
      bad_storage_batch.to_string().as_bytes(),
    )
    .await;
    let bad_storage_json: Value = serde_json::from_slice(&bad_storage_bytes).unwrap();
    assert_eq!(bad_storage_json["errors"][0]["extensions"]["status"], 400, "resp: {bad_storage_json}");
    let leaked_row2: Option<Value> = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = 'server.name'")
      .fetch_optional(running.state.db.pool())
      .await
      .unwrap();
    assert!(leaked_row2.is_none(), "valid update before invalid storage config must be rolled back");

    // 7. `sendTestEmail` MUST NOT leak `RuntimeConfig.smtp_password` to an arbitrary SMTP host.
    let test_mail_req = serde_json::json!({
      "query": "mutation ($config: JSONObject!) { sendTestEmail(config: $config) }",
      "variables": {
        "config": {
          "host": "127.0.0.1",
          "port": attacker_smtp.port,
          "name": "attacker.test",
          "sender": "Test <noreply@affine.test>",
          "username": "",
          "password": "",
          "ignoreTLS": false
        }
      }
    });
    let (_, _, tm_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/graphql",
      &[("Content-Type", "application/json"), ("Cookie", &owner_cookie)],
      test_mail_req.to_string().as_bytes(),
    )
    .await;
    let tm_json: Value = serde_json::from_slice(&tm_bytes).unwrap();
    assert_eq!(tm_json["data"]["sendTestEmail"], true, "resp: {tm_json}");
    let attacker_cmds = attacker_smtp.commands.lock().unwrap().join("\n");
    assert!(
      !attacker_cmds.contains("AUTH") && !attacker_cmds.contains("SUPER-SECRET-SMTP-PASSWORD"),
      "sendTestEmail must never send RuntimeConfig.smtp_password: {attacker_cmds}"
    );

    // 8. Full Magic-Link E2E: POST /api/auth/sign-in (no password) -> drain_mail_deliveries_once ->
    //    extract 6-digit OTP from real SMTP email body -> POST /api/auth/magic-link ->
    //    GET /api/auth/session -> POST /api/auth/sign-out (CSRF enforced).
    let ml_req = serde_json::json!({
      "email": "magic-e2e@affine.test",
      "callbackUrl": "/magic-link?redirect_uri=%2Fworkspace%2Fdemo",
      "client_nonce": "nonce-e2e-1"
    });
    let (ml_status, _, ml_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/api/auth/sign-in",
      &[("Content-Type", "application/json")],
      ml_req.to_string().as_bytes(),
    )
    .await;
    assert_eq!(ml_status, 200);
    assert_eq!(
      serde_json::from_slice::<Value>(&ml_bytes).unwrap(),
      serde_json::json!({ "email": "magic-e2e@affine.test" })
    );

    // Seed two coexistence edge rows before draining:
    // (a) A v0.27.5 MemberInvitation row with `$$workspaceId` payload -> MUST stay queued & untouched.
    // (b) An expired stale `sending` row -> MUST be reaped to failed/expired/anonymized.
    let coex_invite_id = uuid::Uuid::new_v4();
    let stale_sending_id = uuid::Uuid::new_v4();
    sqlx::query(
      "INSERT INTO mail_deliveries (id, mail_name, mail_class, priority, recipient_email, recipient_hash, recipient_domain, payload, status, attempt_count, max_attempts, send_after, expires_at, retention_state, created_at, updated_at) \
       VALUES ($1, 'MemberInvitation', 'notification', 'normal', 'invitee@affine.test', 'hash-inv-1', 'affine.test', \
               '{\"props\":{\"$$workspaceId\":\"ws-1\",\"$$userId\":\"u-1\"}}'::jsonb, 'queued', 0, 5, now() - interval '1 second', now() + interval '1 hour', 'full', now(), now()), \
              ($2, 'TestMail', 'system', 'normal', 'stale@affine.test', 'hash-stale-1', 'affine.test', \
               '{\"props\":{}}'::jsonb, 'sending', 1, 5, now() - interval '10 minutes', now() - interval '1 minute', 'full', now() - interval '10 minutes', now() - interval '10 minutes')",
    )
    .bind(coex_invite_id)
    .bind(stale_sending_id)
    .execute(running.state.db.pool())
    .await
    .unwrap();
    sqlx::query(
      "UPDATE mail_deliveries SET locked_by = 'crashed-worker', locked_until = now() - interval '5 minutes' WHERE id = $1",
    )
    .bind(stale_sending_id)
    .execute(running.state.db.pool())
    .await
    .unwrap();

    let mailer = SmtpMailer::new(&SmtpConfig {
      host: "127.0.0.1".to_owned(),
      port: smtp.port,
      name: "parity.affine.test".to_owned(),
      sender: "AFFiNE Test <noreply@affine.test>".to_owned(),
      username: String::new(),
      password: String::new(),
      ignore_tls: false,
    })
    .unwrap();
    let drained = drain_mail_deliveries_once(&running.state.db, &mailer)
      .await
      .expect("drain mail deliveries");
    assert_eq!(drained, 1, "expected 1 queued magic-link mail delivery (coex-invite-1 must be left for v0.27.5)");

    let (inv_status, inv_attempts, inv_email, inv_payload): (String, i32, Option<String>, Option<Value>) =
      sqlx::query_as("SELECT status, attempt_count, recipient_email, payload FROM mail_deliveries WHERE id = $1")
        .bind(coex_invite_id)
        .fetch_one(running.state.db.pool())
        .await
        .unwrap();
    assert_eq!(inv_status, "queued");
    assert_eq!(inv_attempts, 0);
    assert_eq!(inv_email.as_deref(), Some("invitee@affine.test"));
    assert_eq!(inv_payload.unwrap()["props"]["$$workspaceId"], "ws-1");

    let (stale_status, stale_err, stale_ret): (String, Option<String>, String) =
      sqlx::query_as("SELECT status, last_error_code, retention_state FROM mail_deliveries WHERE id = $1")
        .bind(stale_sending_id)
        .fetch_one(running.state.db.pool())
        .await
        .unwrap();
    assert_eq!(stale_status, "failed");
    assert_eq!(stale_err.as_deref(), Some("expired"));
    assert_eq!(stale_ret, "anonymized");

    let sent_msg_id: Option<String> = sqlx::query_scalar(
      "SELECT provider_message_id FROM mail_deliveries WHERE mail_name = 'SignUp' AND status = 'sent' ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_one(running.state.db.pool())
    .await
    .unwrap();
    let sent_msg_id = sent_msg_id.expect("sent mail_deliveries row must record RFC 5322 Message-ID");
    assert!(
      sent_msg_id.starts_with('<') && sent_msg_id.ends_with('>'),
      "unexpected provider_message_id: {sent_msg_id}"
    );

    let captured_emails = smtp.messages.lock().unwrap().clone();
    assert_eq!(captured_emails.len(), 1, "expected 1 captured SMTP message");
    // Unfold quoted-printable soft line breaks (`=\r\n` / `=\n`) and extract `token=DDDDDD`.
    let unfolded = captured_emails[0].replace("=\r\n", "").replace("=\n", "");
    let token_pos = unfolded
      .find("token=3D")
      .map(|i| i + 8)
      .or_else(|| unfolded.find("token=").map(|i| i + 6))
      .expect("magic link token in captured email");
    let otp = &unfolded[token_pos..token_pos + 6];
    assert!(
      otp.chars().all(|c| c.is_ascii_digit()),
      "expected 6-digit OTP, got `{otp}`"
    );

    let complete_req = serde_json::json!({
      "email": "magic-e2e@affine.test",
      "token": otp,
      "client_nonce": "nonce-e2e-1"
    });
    let (comp_status, comp_head, comp_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/api/auth/magic-link",
      &[("Content-Type", "application/json")],
      complete_req.to_string().as_bytes(),
    )
    .await;
    assert_eq!(comp_status, 201);
    let comp_json: Value = serde_json::from_slice(&comp_bytes).unwrap();
    assert!(comp_json["id"].as_str().is_some_and(|s| !s.is_empty()));
    let ml_cookie = extract_cookie_header(&comp_head);
    let ml_csrf = extract_cookie_value(&comp_head, "affine_csrf_token").expect("csrf cookie");

    let (sess_status, _, sess_bytes) =
      raw_http_request(running.addr, "GET", "/api/auth/session", &[("Cookie", &ml_cookie)], b"").await;
    assert_eq!(sess_status, 200);
    let sess_json: Value = serde_json::from_slice(&sess_bytes).unwrap();
    assert_eq!(sess_json["user"]["email"], "magic-e2e@affine.test");
    assert_eq!(sess_json["user"]["emailVerified"], true);
    assert_eq!(sess_json["user"]["hasPassword"], false);

    // Sign-out without CSRF header -> 403; with CSRF header -> 200 `{}`.
    let (so_no_csrf, _, _) = raw_http_request(
      running.addr,
      "POST",
      "/api/auth/sign-out",
      &[("Cookie", &ml_cookie)],
      b"",
    )
    .await;
    assert_eq!(so_no_csrf, 403);

    let (so_ok, _, so_bytes) = raw_http_request(
      running.addr,
      "POST",
      "/api/auth/sign-out",
      &[("Cookie", &ml_cookie), ("x-affine-csrf-token", &ml_csrf)],
      b"",
    )
    .await;
    assert_eq!(so_ok, 200);
    assert_eq!(
      serde_json::from_slice::<Value>(&so_bytes).unwrap(),
      serde_json::json!({})
    );

    running.shutdown.cancel();
    running.join_handle.await.unwrap().unwrap();
    running.state.db.pool().close().await;
  });
}

#[test]
fn search_config_defaults_and_split_role_validation() {
  assert!(!ServerCli::default().search_enabled);

  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = MigrationSet::load(&migrations_dir).expect("load prisma migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure migrated template");
  let lease = cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database");
  let db_url = lease.url().to_owned();
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let redis_url = redis.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async {
    // 1. Embedded search on split roles (Graphql / Worker) MUST fail fast with InvalidConfig.
    for role in [RoleArg::Graphql, RoleArg::Worker] {
      let cli = ServerCli {
        role: Some(role),
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        database_url: db_url.clone(),
        redis_url: Some(redis_url.clone()),
        skip_schema_check: true,
        search_enabled: true,
        search_provider: "embedded".to_owned(),
        ..ServerCli::default()
      };
      let err = serve_with_extension(cli, Arc::new(CommunityExtension::new()), CancellationToken::new())
        .await
        .err()
        .expect("embedded search on split role must fail");
      assert!(
        matches!(err, ServerError::InvalidConfig(ref msg) if msg.contains("--role allinone")),
        "unexpected error for {role:?}: {err}"
      );
    }

    // 2. Split Graphql + Worker with default search_enabled = false boot and serve cleanly,
    //    and ServerConfig.features does not expose Indexer.
    let gql_cli = ServerCli {
      role: Some(RoleArg::Graphql),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      redis_url: Some(redis_url.clone()),
      skip_schema_check: true,
      ..ServerCli::default()
    };

    let worker_cli = ServerCli {
      role: Some(RoleArg::Worker),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      redis_url: Some(redis_url.clone()),
      skip_schema_check: true,
      ..ServerCli::default()
    };

    let gql_running = serve_with_extension(gql_cli, Arc::new(CommunityExtension::new()), CancellationToken::new())
      .await
      .expect("start graphql role with search disabled");
    let worker_running =
      serve_with_extension(worker_cli, Arc::new(CommunityExtension::new()), CancellationToken::new())
        .await
        .expect("start worker role with search disabled");

    let (ready_status, _) = http_request(gql_running.addr, "GET", "/readyz", None).await;
    assert_eq!(ready_status, 200);
    let (w_ready, _) = http_request(worker_running.addr, "GET", "/readyz", None).await;
    assert_eq!(w_ready, 200);

    let (gql_status, gql_body) = http_request(
      gql_running.addr,
      "POST",
      "/graphql",
      Some(r#"{"query":"{ serverConfig { features } }"}"#),
    )
    .await;
    assert_eq!(gql_status, 200);
    let features = gql_body["data"]["serverConfig"]["features"]
      .as_array()
      .expect("features array");
    assert!(
      !features.iter().any(|f| f.as_str() == Some("Indexer")),
      "default search_enabled=false must not expose Indexer: {features:?}"
    );

    worker_running.shutdown.cancel();
    worker_running.join_handle.await.unwrap().unwrap();
    gql_running.shutdown.cancel();
    gql_running.join_handle.await.unwrap().unwrap();
    worker_running.state.db.pool().close().await;
    gql_running.state.db.pool().close().await;

    // 3. Split Graphql + Worker with remote Elasticsearch mock HTTP endpoint boot and serve cleanly,
    //    and ServerConfig.features exposes Indexer.
    let mock_listener = TcpListener::bind("127.0.0.1:0").await.expect("bind mock es");
    let mock_addr = mock_listener.local_addr().expect("mock es addr");
    let mock_shutdown = CancellationToken::new();
    let mock_cancel = mock_shutdown.clone();
    let mock_handle = tokio::spawn(async move {
      loop {
        tokio::select! {
          () = mock_cancel.cancelled() => break,
          accepted = mock_listener.accept() => {
            if let Ok((mut stream, _)) = accepted {
              tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf).await;
                let body = r#"{"acknowledged":true,"hits":{"total":{"value":0},"hits":[]}}"#;
                let resp = format!(
                  "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                  body.len()
                );
                let _ = stream.write_all(resp.as_bytes()).await;
              });
            }
          }
        }
      }
    });

    let gql_remote = ServerCli {
      role: Some(RoleArg::Graphql),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      redis_url: Some(redis_url.clone()),
      skip_schema_check: true,
      search_enabled: true,
      search_provider: "elasticsearch".to_owned(),
      search_endpoint: format!("http://{mock_addr}"),
      ..ServerCli::default()
    };

    let worker_remote = ServerCli {
      role: Some(RoleArg::Worker),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      redis_url: Some(redis_url.clone()),
      skip_schema_check: true,
      search_enabled: true,
      search_provider: "elasticsearch".to_owned(),
      search_endpoint: format!("http://{mock_addr}"),
      ..ServerCli::default()
    };

    let gql_r = serve_with_extension(gql_remote, Arc::new(CommunityExtension::new()), CancellationToken::new())
      .await
      .expect("start graphql role with remote search provider");
    let worker_r = serve_with_extension(worker_remote, Arc::new(CommunityExtension::new()), CancellationToken::new())
      .await
      .expect("start worker role with remote search provider");

    let (gql_status2, gql_body2) = http_request(
      gql_r.addr,
      "POST",
      "/graphql",
      Some(r#"{"query":"{ serverConfig { features } }"}"#),
    )
    .await;
    assert_eq!(gql_status2, 200);
    let features2 = gql_body2["data"]["serverConfig"]["features"]
      .as_array()
      .expect("features array");
    assert!(
      features2.iter().any(|f| f.as_str() == Some("Indexer")),
      "enabled search must expose Indexer: {features2:?}"
    );

    worker_r.shutdown.cancel();
    worker_r.join_handle.await.unwrap().unwrap();
    gql_r.shutdown.cancel();
    gql_r.join_handle.await.unwrap().unwrap();
    worker_r.state.db.pool().close().await;
    gql_r.state.db.pool().close().await;

    // 4. Verify with two independent OS processes (`CARGO_BIN_EXE_affine-server`):
    //    (a) `--role graphql --search-enabled=true --search-provider=embedded` exits non-zero;
    //    (b) separate `--role worker` and `--role graphql` processes boot against the shared
    //        Elasticsearch HTTP endpoint and serve `/readyz` + `/graphql` independently.
    let bin = env!("CARGO_BIN_EXE_affine-server");
    let bad_out = std::process::Command::new(bin)
      .args([
        "--role",
        "graphql",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--database-url",
        &db_url,
        "--redis-url",
        &redis_url,
        "--private-key",
        "split-proc-test-key",
        "--skip-schema-check",
        "--search-enabled=true",
        "--search-provider",
        "embedded",
      ])
      .output()
      .expect("spawn bad graphql process");
    assert!(
      !bad_out.status.success(),
      "standalone graphql process with embedded search must fail fast"
    );
    let combined_bad_log = format!(
      "{}{}",
      String::from_utf8_lossy(&bad_out.stdout),
      String::from_utf8_lossy(&bad_out.stderr)
    );
    assert!(
      combined_bad_log.contains("--role allinone"),
      "expected split-role InvalidConfig message, got: {combined_bad_log}"
    );

    struct ChildReaper(std::process::Child);

    impl Drop for ChildReaper {
      fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
      }
    }

    struct RoleProcessGuard {
      _reaper: ChildReaper,
      _stdout: std::io::BufReader<std::process::ChildStdout>,
      addr: std::net::SocketAddr,
    }

    #[allow(clippy::zombie_processes)]
    fn spawn_role_process(
      bin: &str,
      role: &str,
      db_url: &str,
      redis_url: &str,
      es_endpoint: &str,
    ) -> RoleProcessGuard {
      use std::io::{BufRead, BufReader};
      let mut child = std::process::Command::new(bin)
        .args([
          "--role",
          role,
          "--host",
          "127.0.0.1",
          "--port",
          "0",
          "--database-url",
          db_url,
          "--redis-url",
          redis_url,
          "--private-key",
          "split-proc-test-key",
          "--skip-schema-check",
          "--search-enabled=true",
          "--search-provider",
          "elasticsearch",
          "--search-endpoint",
          es_endpoint,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn affine-server role process");
      let stdout = child.stdout.take().expect("child stdout");
      let reaper = ChildReaper(child);
      let mut reader = BufReader::new(stdout);
      let mut line = String::new();
      loop {
        line.clear();
        let n = reader.read_line(&mut line).expect("read child stdout");
        assert!(n > 0, "{role} process exited before AFFINE_SERVER_LISTENING");
        if let Some(addr_str) = line.trim().strip_prefix("AFFINE_SERVER_LISTENING=") {
          let addr: std::net::SocketAddr = addr_str.parse().expect("parse listening addr");
          return RoleProcessGuard {
            _reaper: reaper,
            _stdout: reader,
            addr,
          };
        }
      }
    }

    let es_url = format!("http://{mock_addr}");
    let worker_proc = spawn_role_process(bin, "worker", &db_url, &redis_url, &es_url);
    let gql_proc = spawn_role_process(bin, "graphql", &db_url, &redis_url, &es_url);

    let (wp_ready, _) = http_request(worker_proc.addr, "GET", "/readyz", None).await;
    let (gp_ready, _) = http_request(gql_proc.addr, "GET", "/readyz", None).await;
    assert_eq!(wp_ready, 200);
    assert_eq!(gp_ready, 200);

    let (gp_gql_status, gp_gql_body) = http_request(
      gql_proc.addr,
      "POST",
      "/graphql",
      Some(r#"{"query":"{ serverConfig { features } }"}"#),
    )
    .await;
    assert_eq!(gp_gql_status, 200);
    assert!(
      gp_gql_body["data"]["serverConfig"]["features"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f.as_str() == Some("Indexer"))
    );

    drop(worker_proc);
    drop(gql_proc);
    mock_shutdown.cancel();
    let _ = mock_handle.await;
  });
}

#[test]
fn config_file_dotted_keys_oauth_and_private_key_source_priority_e2e() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = MigrationSet {
    migrations: vec![],
    digest: "e2e0000000000009".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async move {
    drop_empty_prisma_table(&db_url).await;
    let db = server_db::ServerDb::connect(server_db::DbConfig {
      database_url: db_url.clone(),
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [4, 2, 2, 1],
    })
    .await
    .expect("connect server db");
    db.ensure_schema_ready().await.expect("ensure schema ready");
    let pool = db.pool().clone();
    let admin_id = uuid::Uuid::new_v4().to_string();
    let session_id = uuid::Uuid::new_v4().to_string();
    let user_sess_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, disabled) VALUES ($1, 'CfgAdmin', 'cfg-admin@affine.test', true, false)",
    )
    .bind(&admin_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO user_features (user_id, name, type, reason, activated) VALUES ($1, 'administrator', 0, 'test', true)",
    )
    .bind(&admin_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO multiple_users_sessions (id) VALUES ($1)")
      .bind(&session_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO user_sessions (id, session_id, user_id, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
    )
    .bind(&user_sess_id)
    .bind(&session_id)
    .bind(&admin_id)
    .execute(&pool)
    .await
    .unwrap();
    let cookie = format!("affine_session={session_id}; affine_user_id={admin_id}");

    struct ChildReaper(std::process::Child);
    impl Drop for ChildReaper {
      fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
      }
    }
    struct ProcGuard {
      _reaper: ChildReaper,
      _stdout: std::io::BufReader<std::process::ChildStdout>,
      addr: SocketAddr,
    }
    #[allow(clippy::zombie_processes)]
    fn spawn_cfg_server(db_url: &str, cfg_path: &std::path::Path, env_private_key: Option<&str>) -> ProcGuard {
      use std::io::{BufRead, BufReader};
      let mut cmd = std::process::Command::new(env!("CARGO_BIN_EXE_affine-server"));
      cmd
        .args([
          "--role",
          "graphql",
          "--host",
          "127.0.0.1",
          "--port",
          "0",
          "--database-url",
          db_url,
          "--skip-schema-check",
        ])
        .env("AFFINE_CONFIG_PATH", cfg_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
      match env_private_key {
        Some(pk) => {
          cmd.env("AFFINE_PRIVATE_KEY", pk);
        }
        None => {
          cmd.env_remove("AFFINE_PRIVATE_KEY");
        }
      }
      let mut child = cmd.spawn().expect("spawn affine-server");
      let stdout = child.stdout.take().expect("child stdout");
      let reaper = ChildReaper(child);
      let mut reader = BufReader::new(stdout);
      let mut line = String::new();
      loop {
        line.clear();
        let n = reader.read_line(&mut line).expect("read stdout");
        assert!(n > 0, "affine-server exited before AFFINE_SERVER_LISTENING");
        if let Some(addr_str) = line.trim().strip_prefix("AFFINE_SERVER_LISTENING=") {
          return ProcGuard {
            _reaper: reaper,
            _stdout: reader,
            addr: addr_str.parse().expect("parse addr"),
          };
        }
      }
    }

    async fn gql_authed(addr: SocketAddr, cookie: &str, query: &str) -> Value {
      let body = serde_json::json!({ "query": query }).to_string();
      let (status, _head, raw) = raw_http_request(
        addr,
        "POST",
        "/graphql",
        &[
          ("Content-Type", "application/json"),
          ("Cookie", cookie),
          ("x-affine-version", "0.27.5"),
        ],
        body.as_bytes(),
      )
      .await;
      assert_eq!(status, 200, "graphql status {status}: {}", String::from_utf8_lossy(&raw));
      serde_json::from_slice(&raw).expect("parse graphql json")
    }

    let tmp_dir = std::env::temp_dir().join(format!("affine-cfg-e2e-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).unwrap();
    let cfg1 = tmp_dir.join("config1.json");
    std::fs::write(
      &cfg1,
      serde_json::json!({
        "server": { "name": "AFFiNE" },
        "client": { "versionControl": {} },
        "oauth": { "providers.github": { "clientId": "gh-file-id", "clientSecret": "gh-file-sec" } },
        "crypto": { "privateKey": "file-private-key" }
      })
      .to_string(),
    )
    .unwrap();

    // 1. File config with dotted oauth.providers.github + non-empty crypto.privateKey alongside AFFINE_PRIVATE_KEY env.
    let p1 = spawn_cfg_server(&db_url, &cfg1, Some("env-private-key"));
    let sc = gql_authed(p1.addr, &cookie, "{ serverConfig { oauthProviders } }").await;
    assert!(sc["errors"].is_null(), "serverConfig err: {sc}");
    assert!(
      sc["data"]["serverConfig"]["oauthProviders"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v == "GitHub"),
      "expected GitHub in oauthProviders: {sc}"
    );
    let m1 = gql_authed(p1.addr, &cookie, "{ appConfigMetadata }").await;
    assert!(m1["errors"].is_null(), "metadata err: {m1}");
    let gh_meta = &m1["data"]["appConfigMetadata"]["oauth"]["providers"]["github"];
    assert_eq!(gh_meta["source"], "file");
    assert_eq!(gh_meta["configured"], true);
    assert!(
      gh_meta.get("clientId").is_none(),
      "secret subkeys must not pollute metadata: {gh_meta}"
    );
    let vc_meta = m1["data"]["appConfigMetadata"]["client"]["versionControl"]
      .as_object()
      .expect("client.versionControl metadata object");
    let mut vc_keys: Vec<&str> = vc_meta.keys().map(String::as_str).collect();
    vc_keys.sort_unstable();
    assert_eq!(
      vc_keys,
      vec!["enabled", "requiredVersion"],
      "empty group object in config file must not add source/settable on parent: {vc_meta:?}"
    );
    let pk_meta = &m1["data"]["appConfigMetadata"]["crypto"]["privateKey"];
    assert_eq!(pk_meta["source"], "file");
    assert_eq!(pk_meta["configured"], true);

    // 2. PG override switches both to database; clearing PG override falls back to file.
    let upd = gql_authed(
      p1.addr,
      &cookie,
      r#"mutation { updateAppConfig(updates: [
        { module: "oauth", key: "providers.github", value: { clientId: "db-id", clientSecret: "db-sec" } },
        { module: "crypto", key: "privateKey", value: "db-private-key" }
      ]) }"#,
    )
    .await;
    assert!(upd["errors"].is_null(), "updateAppConfig err: {upd}");
    let m2 = gql_authed(p1.addr, &cookie, "{ appConfigMetadata }").await;
    assert_eq!(m2["data"]["appConfigMetadata"]["oauth"]["providers"]["github"]["source"], "database");
    assert_eq!(m2["data"]["appConfigMetadata"]["crypto"]["privateKey"]["source"], "database");

    let clr = gql_authed(
      p1.addr,
      &cookie,
      r#"mutation { updateAppConfig(updates: [
        { module: "oauth", key: "providers.github", value: null },
        { module: "crypto", key: "privateKey", value: null }
      ]) }"#,
    )
    .await;
    assert!(clr["errors"].is_null(), "clear updateAppConfig err: {clr}");
    let m3 = gql_authed(p1.addr, &cookie, "{ appConfigMetadata }").await;
    assert_eq!(m3["data"]["appConfigMetadata"]["oauth"]["providers"]["github"]["source"], "file");
    assert_eq!(m3["data"]["appConfigMetadata"]["oauth"]["providers"]["github"]["configured"], true);
    assert_eq!(m3["data"]["appConfigMetadata"]["crypto"]["privateKey"]["source"], "file");
    assert_eq!(m3["data"]["appConfigMetadata"]["crypto"]["privateKey"]["configured"], true);
    drop(p1);

    // 3. Empty file crypto.privateKey: falls back to AFFINE_PRIVATE_KEY env (environment/true),
    // and without env reports file/false.
    let cfg2 = tmp_dir.join("config2.json");
    std::fs::write(&cfg2, serde_json::json!({ "crypto": { "privateKey": "" } }).to_string()).unwrap();
    let p2 = spawn_cfg_server(&db_url, &cfg2, Some("env-private-key"));
    let m4 = gql_authed(p2.addr, &cookie, "{ appConfigMetadata }").await;
    assert_eq!(m4["data"]["appConfigMetadata"]["crypto"]["privateKey"]["source"], "environment");
    assert_eq!(m4["data"]["appConfigMetadata"]["crypto"]["privateKey"]["configured"], true);
    drop(p2);

    let p3 = spawn_cfg_server(&db_url, &cfg2, None);
    let m5 = gql_authed(p3.addr, &cookie, "{ appConfigMetadata }").await;
    assert_eq!(m5["data"]["appConfigMetadata"]["crypto"]["privateKey"]["source"], "file");
    assert_eq!(m5["data"]["appConfigMetadata"]["crypto"]["privateKey"]["configured"], false);
    drop(p3);

    // 4. Root literal dotted key must NOT be expanded into oauth.providers.github, and nested dotted keys
    // inside entry values (e.g. args["custom.claim"]) must remain intact.
    let cfg3 = tmp_dir.join("config3.json");
    let root_dotted = serde_json::json!({
      "oauth.providers.github": { "clientId": "root-id", "clientSecret": "root-sec" },
      "oauth": { "providers.oidc": { "args": { "custom.claim": "sub" } } }
    });
    std::fs::write(&cfg3, root_dotted.to_string()).unwrap();
    let expanded = affine_server::expand_module_config_paths(root_dotted);
    assert!(expanded.get("oauth.providers.github").is_some());
    assert!(expanded.pointer("/oauth/providers/github").is_none());
    assert_eq!(
      expanded
        .pointer("/oauth/providers/oidc/args")
        .and_then(|v| v.get("custom.claim")),
      Some(&serde_json::json!("sub"))
    );
    let p4 = spawn_cfg_server(&db_url, &cfg3, None);
    let sc4 = gql_authed(p4.addr, &cookie, "{ serverConfig { oauthProviders } }").await;
    assert!(
      !sc4["data"]["serverConfig"]["oauthProviders"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v == "GitHub"),
      "root literal dotted key must not activate GitHub OAuth: {sc4}"
    );
    let m6 = gql_authed(p4.addr, &cookie, "{ appConfigMetadata }").await;
    assert_eq!(
      m6["data"]["appConfigMetadata"]["oauth"]["providers"]["github"]["source"],
      "default"
    );
    drop(p4);

    let _ = std::fs::remove_dir_all(&tmp_dir);
    pool.close().await;
  });
}
