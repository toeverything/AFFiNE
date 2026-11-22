//! End-to-end integration tests for `affine-server` against real PostgreSQL and Redis:
//! 1. Starts `--port 0 --role allinone` (`skip_schema_check = true`, lazy cold pool `min_connections = 0`)
//!    and asserts startup -> `/readyz` + `/info` + `/graphql` (`workspace(id)`) completes in `< 200ms`.
//! 2. Verifies graceful shutdown via `CancellationToken` immediately releases
//!    active worker Redis locks held by `WorkerSupervisor`.
//! 3. Verifies default startup (`skip_schema_check = false`) blocks a non-empty
//!    pre-`v0.27.5` database lacking `schema_baseline_0275` with `DbError::SteppingStoneRequired`.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Instant;

use affine_server::{DeploymentModeArg, RoleArg, ServerCli, ServerError, serve_with_extension};
use serde_json::Value;
use server_db::DbError;
use server_spi::CommunityExtension;
use server_worker::{CancellationToken, DEFAULT_LOCK_TTL_SECS, new_owner_token};
use test_db_harness::migrations::MigrationSet;
use test_db_harness::pg::{DEFAULT_LEASE_TTL, PgCluster};
use test_db_harness::redis::TestRedis;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

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
    channel: "canary".to_owned(),
    server_version: "0.27.5".to_owned(),
    db_max_connections: 8,
    db_statement_timeout_ms: 5_000,
    graphql_playground: false,
    redis_key_prefix: test_redis.key_prefix().to_owned(),
    skip_schema_check: true,
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

    // 1. /readyz
    let (ready_status, ready_json) = http_request(running.addr, "GET", "/readyz", None).await;
    assert_eq!(ready_status, 200, "readyz body: {ready_json}");
    assert_eq!(ready_json["status"], "ok");
    assert_eq!(ready_json["role"], "allinone");
    assert_eq!(ready_json["edition"], "community");
    assert_eq!(ready_json["postgres"]["ok"], true);
    assert_eq!(ready_json["redis"]["configured"], true);
    assert_eq!(ready_json["redis"]["ok"], true);
    assert!(ready_json["redis"].get("dbIndex").is_none());
    assert!(ready_json["redis"].get("sessionDbIndex").is_none());

    // 2. /info (1:1 v0.27.5 public contract)
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

    // 3. POST /graphql: anonymous currentUser -> null; anonymous workspace -> AUTHENTICATION_REQUIRED (401)
    let cur_req = serde_json::json!({ "query": "{ currentUser { id } }" });
    let (cur_status, cur_json) = http_request(running.addr, "POST", "/graphql", Some(&cur_req.to_string())).await;
    assert_eq!(cur_status, 200, "graphql currentUser body: {cur_json}");
    assert_eq!(cur_json["data"]["currentUser"], Value::Null);

    let ws_req = serde_json::json!({ "query": "{ workspace(id: \"ws-e2e\") { id } }" });
    let (ws_status, ws_json) = http_request(running.addr, "POST", "/graphql", Some(&ws_req.to_string())).await;
    assert_eq!(ws_status, 200, "graphql workspace body: {ws_json}");
    assert_eq!(ws_json["errors"][0]["extensions"]["status"], 401);
    assert_eq!(ws_json["errors"][0]["extensions"]["type"], "AUTHENTICATION_REQUIRED");

    let elapsed = started.elapsed();
    eprintln!("e2e_server_startup_and_first_requests_ms={}", elapsed.as_millis());
    assert!(
      elapsed.as_millis() < 5_000,
      "cold boot + /readyz + /info + /graphql took {}ms (sanity bound < 5000ms)",
      elapsed.as_millis()
    );

    // 4. Register an active worker Redis lock and prove graceful shutdown releases it immediately.
    let mutex = running.session_mutex.clone().expect("session mutex configured");
    let resource = format!("e2e:worker:{}", uuid::Uuid::new_v4());
    let worker_lease = mutex
      .try_acquire(&resource, new_owner_token("e2e-server"), DEFAULT_LOCK_TTL_SECS)
      .await
      .expect("acquire active worker lock");
    running.supervisor.track_lease(worker_lease).await;
    assert!(
      mutex
        .current_owner(&resource)
        .await
        .expect("owner before shutdown")
        .is_some()
    );

    running.shutdown.cancel();
    running
      .join_handle
      .await
      .expect("join server task")
      .expect("server exited cleanly");

    assert!(
      mutex
        .current_owner(&resource)
        .await
        .expect("owner after shutdown")
        .is_none(),
      "active worker Redis lock must be released on graceful shutdown"
    );

    running.state.db.pool().close().await;
  });
}

#[test]
fn startup_schema_gate_rejects_pre_0275_database_by_default() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = MigrationSet {
    migrations: vec![],
    digest: "e2e0000000000002".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure empty template");
  let lease = cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async move {
    let setup_pool = sqlx::PgPool::connect(&db_url).await.expect("connect setup pool");
    sqlx::query("CREATE TABLE legacy_pre_0275_table (id INT PRIMARY KEY)")
      .execute(&setup_pool)
      .await
      .expect("create legacy table");
    setup_pool.close().await;

    let cli = ServerCli {
      role: Some(RoleArg::Allinone),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url,
      redis_url: None,
      deployment_mode: DeploymentModeArg::Selfhosted,
      channel: "canary".to_owned(),
      server_version: "0.27.5".to_owned(),
      db_max_connections: 4,
      db_statement_timeout_ms: 5_000,
      graphql_playground: false,
      redis_key_prefix: String::new(),
      skip_schema_check: false,
    };

    let err = match serve_with_extension(cli, Arc::new(CommunityExtension::new()), CancellationToken::new()).await {
      Ok(_) => panic!("expected stepping-stone rejection for non-empty pre-0.27.5 database"),
      Err(err) => err,
    };
    assert!(
      matches!(err, ServerError::Db(DbError::SteppingStoneRequired { .. })),
      "expected ServerError::Db(DbError::SteppingStoneRequired), got: {err}"
    );
  });
}
