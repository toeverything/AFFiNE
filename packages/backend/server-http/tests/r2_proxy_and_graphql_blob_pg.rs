//! Integration tests for GraphQL createBlobUpload -> setBlob roundtrip and
//! R2 proxy pre-auth zero-byte body rejection.

use std::sync::{
  Arc,
  atomic::{AtomicUsize, Ordering},
};
use std::task::Poll;

use axum::body::Body;
use bytes::Bytes;
use http::{Request, StatusCode, header};
use serde_json::{Value, json};
use server_blob::LocalFsBlobStorage;
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
    .expect("reset schema");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

fn counting_body(bytes_polled: Arc<AtomicUsize>, data: &'static [u8]) -> Body {
  let mut chunk = Some(Bytes::from_static(data));
  Body::from_stream(futures_util::stream::poll_fn(move |_cx| {
    if let Some(c) = chunk.take() {
      bytes_polled.fetch_add(c.len(), Ordering::SeqCst);
      Poll::Ready(Some(Ok::<Bytes, std::io::Error>(c)))
    } else {
      Poll::Ready(None)
    }
  }))
}

async fn post_graphql(app: &axum::Router, cookie: &str, body: Value) -> (StatusCode, Value) {
  let resp = app
    .clone()
    .oneshot(
      Request::builder()
        .method("POST")
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, cookie)
        .body(Body::from(body.to_string()))
        .unwrap(),
    )
    .await
    .expect("graphql response");
  let status = resp.status();
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
  (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[test]
fn create_blob_upload_graphql_then_set_blob_and_r2_proxy_zero_byte_preauth() {
  with_migrated_db(|db_url| async move {
    let db = connect_db(&db_url).await;
    let tmp_dir = std::env::temp_dir().join(format!("affine-r2-proxy-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).expect("create temp dir");
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig::default(),
      Arc::new(CommunityExtension::new()),
    );
    let tmp_str = tmp_dir.to_str().expect("utf8 temp dir");
    let fs_proxy = LocalFsBlobStorage::new(tmp_str, "blobs")
      .expect("fs")
      .with_proxy_upload("proxy-secret-key", Some("http://localhost:3010".into()));
    state
      .blobs
      .reload_storage_backend(Arc::new(fs_proxy))
      .await
      .expect("enable proxy storage");
    let app = build_router(Arc::clone(&state));

    // 1. Pre-auth zero-byte check on PUT /api/storage/upload with invalid token.
    let counter_upload = Arc::new(AtomicUsize::new(0));
    let req_upload = Request::builder()
      .method("PUT")
      .uri("/api/storage/upload?workspaceId=ws1&key=k1&contentType=text/plain&contentLength=16&expiresAt=4102444800&token=forged")
      .header(header::CONTENT_LENGTH, "16")
      .body(counting_body(Arc::clone(&counter_upload), b"0123456789abcdef"))
      .unwrap();
    let resp_upload = app.clone().oneshot(req_upload).await.expect("proxy upload resp");
    assert_eq!(resp_upload.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
      counter_upload.load(Ordering::SeqCst),
      0,
      "invalid token must reject before reading any body bytes"
    );

    // 2. Pre-auth zero-byte check + missing Content-Length on PUT /api/storage/multipart.
    let counter_mp = Arc::new(AtomicUsize::new(0));
    let req_mp = Request::builder()
      .method("PUT")
      .uri("/api/storage/multipart?workspaceId=ws1&key=k1&uploadId=u1&partNumber=1&contentLength=16&expiresAt=4102444800&token=forged")
      .header(header::CONTENT_LENGTH, "16")
      .body(counting_body(Arc::clone(&counter_mp), b"0123456789abcdef"))
      .unwrap();
    let resp_mp = app.clone().oneshot(req_mp).await.expect("proxy multipart resp");
    assert_eq!(resp_mp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
      counter_mp.load(Ordering::SeqCst),
      0,
      "invalid multipart token must reject before reading any body bytes"
    );

    let req_no_cl = Request::builder()
      .method("PUT")
      .uri("/api/storage/multipart?workspaceId=ws1&key=k1&uploadId=u1&partNumber=1&contentLength=16&expiresAt=4102444800&token=forged")
      .body(Body::empty())
      .unwrap();
    let resp_no_cl = app.clone().oneshot(req_no_cl).await.expect("no cl resp");
    assert_eq!(resp_no_cl.status(), StatusCode::BAD_REQUEST);
    let no_cl_body = axum::body::to_bytes(resp_no_cl.into_body(), 4096).await.unwrap();
    assert!(
      String::from_utf8_lossy(&no_cl_body).contains("Missing Content-Length header"),
      "expected Missing Content-Length header, got {}",
      String::from_utf8_lossy(&no_cl_body)
    );

    // 3. Real GraphQL createBlobUpload (GRAPHQL) -> setBlob -> retry createBlobUpload.
    let plain_fs = LocalFsBlobStorage::new(tmp_str, "blobs").expect("plain fs");
    state
      .blobs
      .reload_storage_backend(Arc::new(plain_fs))
      .await
      .expect("switch to plain fs");

    let setup_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/setup/create-admin-user")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"name":"Alice","email":"alice-blob@affine.test","password":"StrongPassword123"}"#,
          ))
          .unwrap(),
      )
      .await
      .expect("create admin");
    assert_eq!(setup_resp.status(), StatusCode::OK);
    let sign_in = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/auth/sign-in")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            r#"{"email":"alice-blob@affine.test","password":"StrongPassword123"}"#,
          ))
          .unwrap(),
      )
      .await
      .expect("sign in");
    assert_eq!(sign_in.status(), StatusCode::OK);
    let cookie = sign_in
      .headers()
      .get_all(header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok())
      .filter_map(|s| s.split(';').next())
      .collect::<Vec<_>>()
      .join("; ");

    let (st_ws, ws_json) = post_graphql(&app, &cookie, json!({ "query": "mutation { createWorkspace { id } }" })).await;
    assert_eq!(st_ws, StatusCode::OK);
    let ws_id = ws_json["data"]["createWorkspace"]["id"].as_str().expect("ws id");

    let (st_init, init_json) = post_graphql(
      &app,
      &cookie,
      json!({
        "query": "mutation($ws: String!) { createBlobUpload(workspaceId: $ws, key: \"gql-blob-1\", size: 11, mime: \"text/plain\") { method alreadyUploaded blobKey } }",
        "variables": { "ws": ws_id }
      }),
    )
    .await;
    assert_eq!(st_init, StatusCode::OK);
    assert_eq!(init_json["data"]["createBlobUpload"]["method"], "GRAPHQL");
    assert!(
      init_json["data"]["createBlobUpload"]["alreadyUploaded"].is_null(),
      "alreadyUploaded must be null when not yet uploaded: {init_json}"
    );

    // Complete via GraphQL setBlob multipart upload (simulating client fallback).
    let boundary = "----AffineTestBoundary7MA4YWxkTrZu0gW";
    let ops = json!({
      "query": "mutation($blob: Upload!, $ws: String!) { setBlob(blob: $blob, workspaceId: $ws) }",
      "variables": { "blob": null, "ws": ws_id }
    });
    let map = json!({ "0": ["variables.blob"] });
    let multipart_body = format!(
      "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{ops}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{map}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"gql-blob-1\"\r\nContent-Type: text/plain\r\n\r\nhello world\r\n\
       --{boundary}--\r\n"
    );
    let set_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/graphql")
          .header(header::COOKIE, &cookie)
          .header("apollo-require-preflight", "true")
          .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
          )
          .body(Body::from(multipart_body))
          .unwrap(),
      )
      .await
      .expect("setBlob resp");
    assert_eq!(set_resp.status(), StatusCode::OK);
    let set_bytes = axum::body::to_bytes(set_resp.into_body(), 64 * 1024).await.unwrap();
    let set_json: Value = serde_json::from_slice(&set_bytes).expect("setBlob json");
    assert!(set_json["errors"].is_null(), "setBlob must succeed: {set_json}");
    let uploaded_key = set_json["data"]["setBlob"].as_str().expect("blob key");

    // Re-calling createBlobUpload for the uploaded key returns alreadyUploaded: true.
    let (st_retry, retry_json) = post_graphql(
      &app,
      &cookie,
      json!({
        "query": "mutation($ws: String!, $k: String!) { createBlobUpload(workspaceId: $ws, key: $k, size: 11, mime: \"text/plain\") { method alreadyUploaded } }",
        "variables": { "ws": ws_id, "k": uploaded_key }
      }),
    )
    .await;
    assert_eq!(st_retry, StatusCode::OK);
    assert_eq!(retry_json["data"]["createBlobUpload"]["alreadyUploaded"], true);

    // 4. Startup/catch-up reload converges cleanly even with an active multipart reservation
    //    (guarding belongs on updateAppConfig, never self-blocking lagging catch-up).
    sqlx::query(
      "INSERT INTO blobs (workspace_id, key, size, mime, status, upload_id, reservation_expires_at) \
       VALUES ($1, 'active-mp.bin', 1024, 'application/octet-stream', 'pending', 'mp-active-1', \
               clock_timestamp() + interval '10 minutes')",
    )
    .bind(ws_id)
    .execute(db.pool())
    .await
    .unwrap();
    let dir_a = tmp_dir.join("backend-a");
    let dir_b = tmp_dir.join("backend-b");
    std::fs::create_dir_all(&dir_a).unwrap();
    std::fs::create_dir_all(&dir_b).unwrap();
    sqlx::query(
      "INSERT INTO app_configs (id, value, updated_at) VALUES ('storages.blob.storage', $1, now()) \
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    )
    .bind(json!({ "provider": "fs", "config": { "path": dir_a.to_str().unwrap() } }))
    .execute(db.pool())
    .await
    .unwrap();
    assert!(
      state
        .init_blob_storage_from_app_config()
        .await
        .expect("startup init must succeed despite active multipart")
    );
    sqlx::query("UPDATE app_configs SET value = $1 WHERE id = 'storages.blob.storage'")
      .bind(json!({ "provider": "fs", "config": { "path": dir_b.to_str().unwrap() } }))
      .execute(db.pool())
      .await
      .unwrap();
    assert!(
      state
        .reload_blob_storage_from_app_config()
        .await
        .expect("lagging catch-up reload must converge to committed PG backend")
    );

    // 5. Dual-instance atomic PG advisory lock, lagging-instance revert guard,
    //    init_blob_upload conflict cleanup, and local TCP proxy disconnect reconnect (no CLIENT KILL).
    let redis_env = test_db_harness::redis::TestRedis::from_env_or_docker().expect("start redis");
    let redis_url = redis_env.url().to_owned();
    let parsed_redis = url::Url::parse(&redis_url).expect("parse redis url");
    let redis_host = parsed_redis.host_str().unwrap_or("127.0.0.1").to_owned();
    let redis_port = parsed_redis.port().unwrap_or(6379);
    let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind proxy");
    let proxy_addr = proxy_listener.local_addr().unwrap();
    let cut_proxy = Arc::new(tokio::sync::Notify::new());
    let stop_proxy = Arc::new(tokio::sync::Notify::new());
    let (cut_bg, stop_bg) = (Arc::clone(&cut_proxy), Arc::clone(&stop_proxy));
    let proxy_task = tokio::spawn(async move {
      loop {
        let client_stream = tokio::select! {
          () = stop_bg.notified() => break,
          res = proxy_listener.accept() => match res { Ok((s, _)) => s, Err(_) => break },
        };
        let target = format!("{redis_host}:{redis_port}");
        let cut_conn = Arc::clone(&cut_bg);
        tokio::spawn(async move {
          if let Ok(mut upstream) = tokio::net::TcpStream::connect(&target).await {
            let mut client_stream = client_stream;
            tokio::select! {
              () = cut_conn.notified() => {}
              _ = tokio::io::copy_bidirectional(&mut client_stream, &mut upstream) => {}
            }
          }
        });
      }
    });
    let mut proxy_url = parsed_redis.clone();
    proxy_url.set_host(Some("127.0.0.1")).unwrap();
    proxy_url.set_port(Some(proxy_addr.port())).unwrap();
    let redis_client = redis::Client::open(redis_url.as_str()).expect("redis client");
    let proxy_redis_client = redis::Client::open(proxy_url.as_str()).expect("proxy redis client");
    let dir_c = tmp_dir.join("backend-c");
    std::fs::create_dir_all(&dir_c).unwrap();
    sqlx::query("DELETE FROM blobs WHERE workspace_id = $1 AND key = 'active-mp.bin'")
      .bind(ws_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("UPDATE app_configs SET value = $1 WHERE id = 'storages.blob.storage'")
      .bind(json!({ "provider": "fs", "config": { "path": dir_a.to_str().unwrap(), "proxyUploadSecret": "sec-a" } }))
      .execute(db.pool())
      .await
      .unwrap();

    let make_instance = |rc: redis::Client| {
      let cfg = RuntimeConfig {
        deployment_mode: server_types::DeploymentMode::Selfhosted,
        role: ServerRole::Allinone,
        external_url: "http://localhost:3010".into(),
        multipart_threshold: 1024,
        multipart_part_size: 1024,
        ..RuntimeConfig::default()
      };
      let ext: Arc<dyn server_spi::ServerExtension> = Arc::new(CommunityExtension::new());
      let base = AppState::new(db.clone(), Some(rc.clone()), cfg.clone(), Arc::clone(&ext));
      let bus: Arc<dyn server_domain::events::EventBusPublisher> =
        Arc::new(server_domain::events::RedisEventPublisher::new(&redis_url, "test").unwrap());
      let app_config =
        server_domain::app_config::AppConfigService::new(db.clone(), cfg.app_config_baseline.clone(), Arc::clone(&bus));
      let blobs = server_blob::BlobService::new(
        db.clone(),
        Arc::new(LocalFsBlobStorage::new(tmp_dir.to_str().unwrap(), "blobs").unwrap()),
        ext.quota_gate(),
      );
      AppState::with_services(
        db.clone(),
        Some(rc),
        cfg,
        ext,
        server_http::AppServices {
          auth: base.auth.clone(),
          users: base.users.clone(),
          workspaces: base.workspaces.clone(),
          doc_sharing: base.doc_sharing.clone(),
          histories: base.histories.clone(),
          comments: base.comments.clone(),
          notifications: base.notifications.clone(),
          licenses: base.licenses.clone(),
          app_config,
          blobs,
          search: Arc::clone(&base.search),
          avatars: Arc::clone(&base.avatars),
          comment_attachments: Arc::clone(&base.comment_attachments),
          copilot_storage: Arc::clone(&base.boot_copilot_storage),
          invalidation: Arc::clone(&base.invalidation),
          event_bus: bus,
        },
      )
    };

    let state_a = make_instance(proxy_redis_client);
    let state_b = make_instance(redis_client.clone());
    // Startup catch-up: state_a starts with tmp_dir, then subscriber immediately catches up to dir_a from PG.
    state_b.init_blob_storage_from_app_config().await.unwrap();
    let stop_a = Arc::new(tokio::sync::Notify::new());
    let sub_a = tokio::spawn(Arc::clone(&state_a).run_blob_storage_config_subscriber(Arc::clone(&stop_a)));
    let expected_a = dir_a.join("blobs").to_string_lossy().into_owned();
    let mut tick = tokio::time::interval(std::time::Duration::from_millis(25));
    for _ in 0..80 {
      if state_a.blobs.current_backend_identity().endpoint.as_deref() == Some(expected_a.as_str()) {
        break;
      }
      tick.tick().await;
    }
    assert_eq!(
      state_a.blobs.current_backend_identity().endpoint.as_deref(),
      Some(expected_a.as_str())
    );

    // Instance A initiates an active multipart upload on dir_a.
    let mp_init = state_a
      .blobs
      .init_blob_upload(
        ws_id,
        "cross.bin",
        2048,
        "application/octet-stream",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect("init multipart on A");
    let mp_uid = mp_init.upload_id.expect("upload_id");

    // Instance B attempts updateAppConfig to switch to dir_b -> must fail atomically without mutating app_configs.
    let router_b = build_router(Arc::clone(&state_b));
    let (st_upd, upd_json) = post_graphql(
      &router_b,
      &cookie,
      json!({
        "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
        "variables": { "u": [{ "module": "storages", "key": "blob.storage", "value": { "provider": "fs", "bucket": "blobs", "config": { "path": dir_b.to_str().unwrap() } } }] }
      }),
    )
    .await;
    assert_eq!(st_upd, StatusCode::OK);
    assert!(
      upd_json["errors"][0]["message"]
        .as_str()
        .unwrap_or("")
        .contains("multipart"),
      "updateAppConfig must reject switch while multipart active: {upd_json}"
    );
    let persisted: Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = 'storages.blob.storage'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(persisted["config"]["path"], dir_a.to_str().unwrap());

    // Simulated restart: fresh instance C calls init_blob_storage_from_app_config and completes A's uploadId.
    let state_c = make_instance(redis_client.clone());
    state_c.init_blob_storage_from_app_config().await.unwrap();
    let mut parts = Vec::new();
    for pn in [2_i32, 1_i32] {
      let plan = state_c
        .blobs
        .get_blob_upload_part_url(ws_id, "cross.bin", &mp_uid, pn, "http://localhost:3010", 1024)
        .await
        .expect("part url after restart");
      let u = url::Url::parse(&plan.upload_url).unwrap();
      let q: std::collections::HashMap<String, String> = u.query_pairs().into_owned().collect();
      let v = state_c
        .blobs
        .verify_proxy_multipart_request(
          ws_id,
          "cross.bin",
          &mp_uid,
          pn,
          1024,
          q["expiresAt"].parse().unwrap(),
          &q["token"],
          1024,
        )
        .await
        .unwrap();
      let etag = state_c
        .blobs
        .write_proxy_multipart_part(v, vec![pn as u8; 1024])
        .await
        .unwrap();
      parts.push(server_blob::UploadedPart { part_number: pn, etag });
    }
    state_c
      .blobs
      .complete_blob_upload(ws_id, "cross.bin", Some(&mp_uid), Some(&parts))
      .await
      .expect("complete after restart");

    // Now no active multipart: B switches to dir_b -> A converges via Redis broadcast.
    let (st_ok, ok_json) = post_graphql(
      &router_b,
      &cookie,
      json!({
        "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
        "variables": { "u": [{ "module": "storages", "key": "blob.storage", "value": { "provider": "fs", "bucket": "blobs", "config": { "path": dir_b.to_str().unwrap() } } }] }
      }),
    )
    .await;
    assert_eq!(st_ok, StatusCode::OK);
    assert!(
      ok_json["errors"].is_null(),
      "updateAppConfig must succeed when idle: {ok_json}"
    );
    let expected_b = dir_b.join("blobs").to_string_lossy().into_owned();
    for _ in 0..80 {
      if state_a.blobs.current_backend_identity().endpoint.as_deref() == Some(expected_b.as_str()) {
        break;
      }
      tick.tick().await;
    }
    assert_eq!(
      state_a.blobs.current_backend_identity().endpoint.as_deref(),
      Some(expected_b.as_str())
    );

    // 5a. Lagging instance (still on dir_a) must NOT revert PG from dir_b -> dir_a while B has active multipart on dir_b,
    //     and init_blob_upload conflict on lagging instance cleans up its pending reservation row cleanly.
    let state_lag = make_instance(redis_client.clone());
    state_lag
      .blobs
      .init_storage_backend(Arc::new(
        LocalFsBlobStorage::new(dir_a.to_str().unwrap(), "blobs")
          .unwrap()
          .with_proxy_upload("sec-a", None),
      ))
      .await;
    let lag_init_err = state_lag
      .blobs
      .init_blob_upload(
        ws_id,
        "lag-conflict.bin",
        2048,
        "application/octet-stream",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect_err("lagging init_blob_upload must conflict against PG dir_b");
    assert!(matches!(lag_init_err, server_types::DomainError::Conflict(_)));
    let leftover: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM blobs WHERE workspace_id = $1 AND key = 'lag-conflict.bin' AND status = 'pending'",
    )
    .bind(ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(
      leftover, 0,
      "failed init_blob_upload must delete its pending reservation row"
    );
    // Immediate retry on up-to-date B (with proxy upload enabled on dir_b) succeeds for the same key.
    state_b
      .blobs
      .init_storage_backend(Arc::new(
        LocalFsBlobStorage::new(dir_b.to_str().unwrap(), "blobs")
          .unwrap()
          .with_proxy_upload("sec-b", None),
      ))
      .await;
    let mp_b = state_b
      .blobs
      .init_blob_upload(
        ws_id,
        "lag-conflict.bin",
        2048,
        "application/octet-stream",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect("retry same key on B after conflict cleanup must succeed");
    let mp_b_uid = mp_b.upload_id.expect("upload_id on B");
    let router_lag = build_router(Arc::clone(&state_lag));
    let (st_rev, rev_json) = post_graphql(
      &router_lag,
      &cookie,
      json!({
        "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
        "variables": { "u": [{ "module": "storages", "key": "blob.storage", "value": { "provider": "fs", "bucket": "blobs", "config": { "path": dir_a.to_str().unwrap() } } }] }
      }),
    )
    .await;
    assert_eq!(st_rev, StatusCode::OK);
    assert!(
      rev_json["errors"][0]["message"]
        .as_str()
        .unwrap_or("")
        .contains("multipart"),
      "lagging instance submitting old dir_a must be rejected while B has active multipart on dir_b: {rev_json}"
    );
    let persisted_b: Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = 'storages.blob.storage'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(persisted_b["config"]["path"], dir_b.to_str().unwrap());
    state_b
      .blobs
      .abort_blob_upload(ws_id, "lag-conflict.bin", &mp_b_uid)
      .await
      .unwrap();

    // 5b. Disconnect ONLY A's proxied Redis connection while a bystander direct pubsub stays alive,
    //     and verify A catches up to dir_c EVEN WHILE B already has an active multipart upload on dir_c,
    //     then A uploads parts & completes B's upload_id onto dir_c.
    use futures_util::StreamExt as _;
    let mut bystander = redis_client.get_async_pubsub().await.expect("bystander pubsub");
    bystander
      .subscribe("affine:test:bystander")
      .await
      .expect("bystander sub");
    sqlx::query("UPDATE app_configs SET value = $1 WHERE id = 'storages.blob.storage'")
      .bind(json!({ "provider": "fs", "config": { "path": dir_c.to_str().unwrap(), "proxyUploadSecret": "sec-c" } }))
      .execute(db.pool())
      .await
      .unwrap();
    state_b.reload_blob_storage_from_app_config().await.unwrap();
    let mp_c = state_b
      .blobs
      .init_blob_upload(
        ws_id,
        "catchup-c.bin",
        2048,
        "application/octet-stream",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect("init multipart on C via B");
    let mp_c_uid = mp_c.upload_id.expect("upload_id on C");

    cut_proxy.notify_waiters();
    let mut pub_conn = redis_client.get_multiplexed_async_connection().await.unwrap();
    let _: i64 = redis::cmd("PUBLISH")
      .arg("affine:test:bystander")
      .arg("still-alive")
      .query_async(&mut pub_conn)
      .await
      .unwrap();
    let bystander_msg = tokio::time::timeout(std::time::Duration::from_secs(2), bystander.on_message().next())
      .await
      .expect("bystander must not be disconnected")
      .expect("bystander message");
    assert_eq!(bystander_msg.get_payload::<String>().unwrap(), "still-alive");

    let expected_c = dir_c.join("blobs").to_string_lossy().into_owned();
    for _ in 0..120 {
      if state_a.blobs.current_backend_identity().endpoint.as_deref() == Some(expected_c.as_str()) {
        break;
      }
      tick.tick().await;
    }
    assert_eq!(
      state_a.blobs.current_backend_identity().endpoint.as_deref(),
      Some(expected_c.as_str())
    );
    let mut parts_c = Vec::new();
    for pn in [1_i32, 2_i32] {
      let plan = state_a
        .blobs
        .get_blob_upload_part_url(ws_id, "catchup-c.bin", &mp_c_uid, pn, "http://localhost:3010", 1024)
        .await
        .expect("part url on caught-up A");
      let u = url::Url::parse(&plan.upload_url).unwrap();
      let q: std::collections::HashMap<String, String> = u.query_pairs().into_owned().collect();
      let v = state_a
        .blobs
        .verify_proxy_multipart_request(
          ws_id,
          "catchup-c.bin",
          &mp_c_uid,
          pn,
          1024,
          q["expiresAt"].parse().unwrap(),
          &q["token"],
          1024,
        )
        .await
        .unwrap();
      let etag = state_a
        .blobs
        .write_proxy_multipart_part(v, vec![pn as u8; 1024])
        .await
        .unwrap();
      parts_c.push(server_blob::UploadedPart { part_number: pn, etag });
    }
    state_a
      .blobs
      .complete_blob_upload(ws_id, "catchup-c.bin", Some(&mp_c_uid), Some(&parts_c))
      .await
      .expect("complete B's upload on caught-up A");
    assert!(
      dir_c.join("blobs").join(ws_id).join("catchup-c.bin").exists(),
      "completed object must land in dir_c"
    );

    // 5c. Trailing-space bucket ("blobs " vs "blobs") must be treated as a backend switch and rejected
    //     while a multipart upload is active, keeping PG unchanged and letting the active upload complete.
    let mp_sp = state_b
      .blobs
      .init_blob_upload(
        ws_id,
        "space-bucket.bin",
        2048,
        "application/octet-stream",
        "http://localhost:3010",
        1024,
        1024,
      )
      .await
      .expect("init multipart for trailing-space bucket guard");
    let mp_sp_uid = mp_sp.upload_id.expect("upload_id");
    let router_b = build_router(Arc::clone(&state_b));
    let (st_sp, sp_json) = post_graphql(
      &router_b,
      &cookie,
      json!({
        "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
        "variables": { "u": [{ "module": "storages", "key": "blob.storage", "value": { "provider": "fs", "bucket": "blobs ", "config": { "path": dir_c.to_str().unwrap() } } }] }
      }),
    )
    .await;
    assert_eq!(st_sp, StatusCode::OK);
    assert!(
      sp_json["errors"][0]["message"]
        .as_str()
        .unwrap_or("")
        .contains("multipart"),
      "changing bucket from default 'blobs' to 'blobs ' during active multipart must be rejected: {sp_json}"
    );
    let persisted_c: Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = 'storages.blob.storage'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(persisted_c["config"]["path"], dir_c.to_str().unwrap());
    assert!(persisted_c.get("bucket").is_none());
    let mut parts_sp = Vec::new();
    for pn in [1_i32, 2_i32] {
      let plan = state_b
        .blobs
        .get_blob_upload_part_url(ws_id, "space-bucket.bin", &mp_sp_uid, pn, "http://localhost:3010", 1024)
        .await
        .expect("part url after rejected bucket switch");
      let u = url::Url::parse(&plan.upload_url).unwrap();
      let q: std::collections::HashMap<String, String> = u.query_pairs().into_owned().collect();
      let v = state_b
        .blobs
        .verify_proxy_multipart_request(
          ws_id,
          "space-bucket.bin",
          &mp_sp_uid,
          pn,
          1024,
          q["expiresAt"].parse().unwrap(),
          &q["token"],
          1024,
        )
        .await
        .unwrap();
      let etag = state_b
        .blobs
        .write_proxy_multipart_part(v, vec![pn as u8; 1024])
        .await
        .unwrap();
      parts_sp.push(server_blob::UploadedPart { part_number: pn, etag });
    }
    state_b
      .blobs
      .complete_blob_upload(ws_id, "space-bucket.bin", Some(&mp_sp_uid), Some(&parts_sp))
      .await
      .expect("active multipart upload must still complete after rejected trailing-space bucket switch");
    assert!(dir_c.join("blobs").join(ws_id).join("space-bucket.bin").exists());

    // 6. When create_multipart_upload fails and presign_put is disabled, createBlobUpload falls back
    //    to method == GRAPHQL and a subsequent real HTTP GraphQL multipart setBlob for the same key succeeds.
    struct FailingMpStorage(LocalFsBlobStorage);
    #[async_trait::async_trait]
    impl server_blob::BlobStorageBackend for FailingMpStorage {
      async fn put(
        &self,
        k: &str,
        b: Vec<u8>,
        ct: &str,
      ) -> Result<server_blob::ObjectMetadata, server_blob::StorageError> {
        self.0.put(k, b, ct).await
      }
      async fn get(
        &self,
        k: &str,
      ) -> Result<Option<(Vec<u8>, server_blob::ObjectMetadata)>, server_blob::StorageError> {
        self.0.get(k).await
      }
      async fn head(&self, k: &str) -> Result<Option<server_blob::ObjectMetadata>, server_blob::StorageError> {
        self.0.head(k).await
      }
      async fn delete(&self, k: &str) -> Result<(), server_blob::StorageError> {
        self.0.delete(k).await
      }
      fn capabilities(&self) -> server_blob::StorageCapabilities {
        server_blob::StorageCapabilities {
          presign_put: false,
          multipart_direct: true,
          proxy_upload: false,
        }
      }
      async fn create_multipart_upload(
        &self,
        _k: &str,
        _ct: &str,
      ) -> Result<Option<server_blob::MultipartUploadInit>, server_blob::StorageError> {
        Err(server_blob::StorageError::Request {
          context: "mock-mp".into(),
          message: "multipart init unavailable".into(),
        })
      }
    }
    let dir_fb = tmp_dir.join("backend-fallback");
    std::fs::create_dir_all(&dir_fb).unwrap();
    let fb_fs = LocalFsBlobStorage::new(dir_fb.to_str().unwrap(), "blobs").unwrap();
    let state_fb = make_instance(redis_client.clone());
    state_fb
      .blobs
      .init_storage_backend(Arc::new(FailingMpStorage(fb_fs)))
      .await;
    let router_fb = build_router(Arc::clone(&state_fb));
    let fb_payload = vec![b'Z'; 2048];
    let (st_fb_init, fb_init_json) = post_graphql(
      &router_fb,
      &cookie,
      json!({
        "query": "mutation($ws: String!) { createBlobUpload(workspaceId: $ws, key: \"mp-fallback-blob\", size: 2048, mime: \"application/octet-stream\") { method alreadyUploaded blobKey } }",
        "variables": { "ws": ws_id }
      }),
    )
    .await;
    assert_eq!(st_fb_init, StatusCode::OK);
    assert_eq!(fb_init_json["data"]["createBlobUpload"]["method"], "GRAPHQL");
    assert!(fb_init_json["data"]["createBlobUpload"]["alreadyUploaded"].is_null());

    let fb_ops = json!({
      "query": "mutation($blob: Upload!, $ws: String!) { setBlob(blob: $blob, workspaceId: $ws) }",
      "variables": { "blob": null, "ws": ws_id }
    });
    let mut fb_body = Vec::new();
    fb_body.extend_from_slice(
      format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{fb_ops}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{map}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"mp-fallback-blob\"\r\nContent-Type: application/octet-stream\r\n\r\n"
      )
      .as_bytes(),
    );
    fb_body.extend_from_slice(&fb_payload);
    fb_body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let fb_set_resp = router_fb
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/graphql")
          .header(header::COOKIE, &cookie)
          .header("apollo-require-preflight", "true")
          .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
          )
          .body(Body::from(fb_body))
          .unwrap(),
      )
      .await
      .expect("fallback setBlob resp");
    assert_eq!(fb_set_resp.status(), StatusCode::OK);
    let fb_set_bytes = axum::body::to_bytes(fb_set_resp.into_body(), 64 * 1024).await.unwrap();
    let fb_set_json: Value = serde_json::from_slice(&fb_set_bytes).expect("fallback setBlob json");
    assert!(
      fb_set_json["errors"].is_null(),
      "fallback setBlob must succeed: {fb_set_json}"
    );
    let fb_key = fb_set_json["data"]["setBlob"].as_str().expect("fallback blob key");
    let stored_fb = state_fb
      .blobs
      .get_blob(ws_id, fb_key)
      .await
      .expect("read back fallback blob")
      .expect("fallback blob must exist");
    assert_eq!(stored_fb.1, fb_payload);

    stop_a.notify_waiters();
    stop_proxy.notify_waiters();
    let _ = sub_a.await;
    let _ = proxy_task.await;
  });
}
